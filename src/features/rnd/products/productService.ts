import { supabase, isSupabaseConfigured } from '../../../core/auth/supabaseClient';
import { Product, ProductVariant } from '../../../types';

// Bersihkan data demo lama dari local storage jika masih tersisa di browser pengguna
const purgeLegacyLocalStorageProducts = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const legacyKeys = [
      'lsm_products_variants',
      'lsm_products',
      'cosmo_products',
      'rnd_demo_products',
      'demo_products_cache'
    ];
    legacyKeys.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });
  }
};

// Jalankan pembersihan saat inisialisasi module
purgeLegacyLocalStorageProducts();

// Penyimpanan sesi in-memory (BUKAN local storage) - default kosong tanpa data demo
const defaultSeedProducts: Product[] = [];

let inMemoryProducts: Product[] = [];
let lastProductsFetchTime = 0;
const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit cache di RAM untuk efisiensi egress Supabase
let tablesInitializedInSupabase: boolean | null = null;

const isTableMissingError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || err.details || err.hint || String(err)).toLowerCase();
  const code = err.code || '';
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('not found')
  );
};

/**
 * Helper konversi tanggal fleksibel (termasuk nomor serial tanggal Excel seperti 46599) ke format ISO YYYY-MM-DD
 */
export const formatToISODate = (val: any): string | null => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return null;

  // 1. Jika serial number tanggal Excel (misal: 46599 atau "46599")
  const num = Number(str);
  if (!isNaN(num) && num > 25000 && num < 100000) {
    // Shift Excel 1900 epoch to Unix epoch (25569 days)
    const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      return jsDate.toISOString().split('T')[0];
    }
  }

  // 2. Jika sudah format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 3. Jika format DD/MM/YYYY atau DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // 4. Standar JavaScript Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
};

export const productService = {
  /**
   * Helper retry untuk operasi network Supabase jika terjadi 'Failed to fetch'
   */
  withNetworkRetry: async <T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> => {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        if ((msg.includes('Failed to fetch') || msg.includes('NetworkError')) && attempt < maxRetries) {
          // Wait 300ms before retry
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  },

  /**
   * Cek status ketersediaan tabel products & product_variants di Supabase
   */
  checkTableStatus: async (): Promise<{
    configured: boolean;
    ready: boolean;
    message: string;
  }> => {
    if (!isSupabaseConfigured || !supabase) {
      return {
        configured: false,
        ready: false,
        message: 'Supabase URL atau Anon Key belum dikonfigurasi pada environment variable.',
      };
    }

    try {
      const { error } = await supabase.from('products').select('id').limit(1);
      if (error) {
        if (isTableMissingError(error)) {
          tablesInitializedInSupabase = false;
          return {
            configured: true,
            ready: false,
            message: "Tabel 'products' belum dibuat di Supabase schema cache. Jalankan skrip SQL supabase_schema_products.sql.",
          };
        }
        return {
          configured: true,
          ready: false,
          message: error.message || 'Koneksi Supabase error',
        };
      }
      tablesInitializedInSupabase = true;
      return {
        configured: true,
        ready: true,
        message: "Tabel 'products' & 'product_variants' aktif dan terhubung di Supabase.",
      };
    } catch (err: any) {
      return {
        configured: true,
        ready: false,
        message: err.message || 'Gagal memeriksa status tabel Supabase',
      };
    }
  },

  invalidateCache: () => {
    lastProductsFetchTime = 0;
  },

  /**
   * Mengambil semua Master Produk beserta varian dari Supabase
   * Menggunakan relasi tabel 'products' dan 'product_variants'
   */
  getProducts: async (forceRefresh = false): Promise<Product[]> => {
    purgeLegacyLocalStorageProducts();

    const isCacheValid = !forceRefresh && inMemoryProducts.length > 0 && (Date.now() - lastProductsFetchTime < PRODUCTS_CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryProducts;
    }

    if (!isSupabaseConfigured || !supabase) {
      console.warn('[productService] Supabase belum dikonfigurasi dengan URL & Anon Key. Menggunakan memori sesi.');
      return inMemoryProducts;
    }

    try {
      // Chunk fetching untuk melampaui batas default 1000 baris PostgREST/Supabase
      let allRows: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from('products')
          .select('id, product_code, name, brand, category, description, unit, storage_conditions, bpom_notification_number, exp_notification_date, qc_parameters, finished_parameters, created_at')
          .order('product_code', { ascending: true })
          .range(from, to);

        if (error) {
          if (isTableMissingError(error)) {
            tablesInitializedInSupabase = false;
            console.warn('[productService] Notice: Tabel "products" belum dibuat di Supabase schema cache. Menampilkan data sesi aktif.');
            return inMemoryProducts;
          }
          console.warn('[productService] Peringatan saat memuat data products dari Supabase:', error.message || error);
          break;
        }

        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      tablesInitializedInSupabase = true;
      if (allRows.length === 0) {
        inMemoryProducts = [];
        lastProductsFetchTime = Date.now();
        return [];
      }

      // Ambil seluruh varian dari tabel product_variants secara langsung dengan selective projection
      let allVariants: any[] = [];
      try {
        const { data: variantsData, error: varErr } = await supabase
          .from('product_variants')
          .select('id, product_id, sku, variant_name, status, net_volume_grams, bulk_formula_code, packaging_bom, bpom_number, barcode, description, created_at');
        if (!varErr && variantsData) {
          allVariants = variantsData;
        }
      } catch (e) {
        console.warn('[productService] Gagal memuat product_variants:', e);
      }

      // Kelompokkan varian berdasarkan product_id
      const variantsByProductId: Record<string, any[]> = {};
      for (const v of allVariants) {
        const pid = v.product_id;
        if (!variantsByProductId[pid]) variantsByProductId[pid] = [];
        variantsByProductId[pid].push(v);
      }

      const mapped = allRows.map((p: any) => {
        const pVariants = variantsByProductId[p.id] || [];
        return {
          id: p.id,
          code: p.product_code || p.code || '',
          productCode: p.product_code || p.code || '',
          name: p.name || '',
          brand: p.brand || '',
          category: p.category || '',
          description: p.description || '',
          unit: p.unit || 'pcs (Pieces)',
          storageConditions: p.storage_conditions || '',
          bpomNotificationNumber: p.bpom_notification_number || '',
          bpomNotificationExt: p.exp_notification_date || '',
          expNotificationDate: p.exp_notification_date || '',
          qcParameters: p.qc_parameters || [],
          finishedQcParameters: p.finished_parameters || p.finished_qc_parameters || [],
          createdAt: p.created_at,
          variants: pVariants.map((v: any) => ({
            id: v.id,
            productId: v.product_id || p.id,
            variantCode: v.sku || v.variant_code || '',
            sku: v.sku || v.variant_code || '',
            variantName: v.variant_name || '',
            status: v.status || 'active',
            netVolumeGrams: Number(v.net_volume_grams) || 0,
            bulkFormulaCode: v.bulk_formula_code || '',
            packagingBom: v.packaging_bom || [],
            bpomNumber: v.bpom_number || '',
            barcode: v.barcode || '',
            description: v.description || '',
            createdAt: v.created_at,
          })),
        };
      });

      inMemoryProducts = mapped;
      lastProductsFetchTime = Date.now();
      return mapped;
    } catch (err: any) {
      console.warn('[productService] Exception saat mengambil data products:', err?.message || err);
      return inMemoryProducts;
    }
  },

  /**
   * Mengambil spesifikasi parameter lengkap dari sebuah produk secara on-demand (lazy load)
   */
  getProductWithParams: async (productId: string): Promise<Product | null> => {
    if (!isSupabaseConfigured || !supabase) {
      const prod = inMemoryProducts.find(p => p.id === productId);
      return prod || null;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, qc_parameters, finished_parameters')
        .eq('id', productId)
        .single();

      if (error) {
        console.warn(`[productService] Gagal mengambil parameter on-demand untuk ${productId}:`, error.message);
        return null;
      }

      if (data) {
        const cachedProd = inMemoryProducts.find(p => p.id === productId);
        if (cachedProd) {
          cachedProd.qcParameters = data.qc_parameters || [];
          cachedProd.finishedQcParameters = data.finished_parameters || [];
        }
        return {
          id: data.id,
          code: cachedProd?.code || '',
          name: cachedProd?.name || '',
          brand: cachedProd?.brand || '',
          category: cachedProd?.category || '',
          description: cachedProd?.description || '',
          qcParameters: data.qc_parameters || [],
          finishedQcParameters: data.finished_parameters || [],
          variants: cachedProd?.variants || []
        };
      }
      return null;
    } catch (err) {
      console.warn(`[productService] Exception saat mengambil parameter on-demand:`, err);
      return null;
    }
  },

  /**
   * Menyimpan 1 Master Produk ke tabel 'products' di Supabase
   */
  saveSingleProduct: async (prod: Product): Promise<{ success: boolean; isInMemory?: boolean; error?: string }> => {
    purgeLegacyLocalStorageProducts();

    // Selalu update in-memory session (BUKAN local storage) agar responsif
    const existingIdx = inMemoryProducts.findIndex(p => p.id === prod.id);
    if (existingIdx >= 0) {
      inMemoryProducts[existingIdx] = prod;
    } else {
      inMemoryProducts = [prod, ...inMemoryProducts];
    }

    if (!isSupabaseConfigured || !supabase) {
      const msg = 'Supabase belum dikonfigurasi. Data tersimpan di memori sesi.';
      console.warn('[productService]', msg);
      return { success: true, isInMemory: true };
    }

    try {
      // 1. Simpan Master Produk ke tabel 'products'
      let productPayload: any = {
        id: prod.id,
        product_code: (prod.productCode || prod.code).trim().toUpperCase(),
        name: prod.name.trim(),
        brand: prod.brand.trim(),
        exp_notification_date: formatToISODate(prod.expNotificationDate || prod.bpomNotificationExt),
        category: prod.category || '',
        description: prod.description || '',
        unit: prod.unit || 'pcs (Pieces)',
        storage_conditions: prod.storageConditions || '',
        bpom_notification_number: prod.bpomNotificationNumber || '',
        qc_parameters: prod.qcParameters || [],
        finished_parameters: prod.finishedQcParameters || [],
        created_at: prod.createdAt || new Date().toISOString(),
      };

      let res = await productService.withNetworkRetry(async () => {
        return await supabase
          .from('products')
          .upsert(productPayload, { onConflict: 'product_code' });
      });

      // Handling jika kolom finished_parameters atau qc_parameters belum ada di schema cache Supabase
      if (res.error && (res.error.message?.includes('finished_parameters') || res.error.message?.includes('qc_parameters'))) {
        console.warn('[productService] Kolom parameter belum terdaftar di schema cache Supabase. Melakukan fallback upsert...');
        delete productPayload.finished_parameters;
        delete productPayload.qc_parameters;
        res = await productService.withNetworkRetry(async () => {
          return await supabase
            .from('products')
            .upsert(productPayload, { onConflict: 'product_code' });
        });
      }

      const prodError = res.error;

      if (prodError) {
        if (isTableMissingError(prodError)) {
          tablesInitializedInSupabase = false;
          console.warn('[productService] Tabel public.products belum dibuat di Supabase schema cache. Data disimpan di memori sesi aktif.');
          return { success: true, isInMemory: true };
        }
        console.warn('[productService] Peringatan saat upsert produk ke Supabase:', prodError.message || prodError);
        return { success: false, error: prodError.message };
      }

      tablesInitializedInSupabase = true;

      // 2. Simpan varian-varian terkait ke tabel 'product_variants'
      if (prod.variants && prod.variants.length > 0) {
        for (const v of prod.variants) {
          const variantPayload = {
            id: v.id,
            product_id: prod.id,
            variant_name: v.variantName,
            sku: (v.sku || v.variantCode).trim().toUpperCase(),
            status: v.status || 'active',
            net_volume_grams: v.netVolumeGrams || 0,
            bulk_formula_code: v.bulkFormulaCode || '',
            packaging_bom: v.packagingBom || [],
            bpom_number: v.bpomNumber || '',
            barcode: v.barcode || '',
            description: v.description || '',
            created_at: v.createdAt || new Date().toISOString(),
          };

          const varRes = await productService.withNetworkRetry(async () => {
            return await supabase
              .from('product_variants')
              .upsert(variantPayload, { onConflict: 'sku' });
          });
          const varError = varRes.error;

          if (varError) {
            if (isTableMissingError(varError)) {
              console.warn('[productService] Tabel product_variants belum dibuat di Supabase. Varian disimpan di memori sesi.');
            } else {
              console.warn('[productService] Peringatan saat upsert varian ke Supabase:', varError.message || varError);
            }
          }
        }
      }

      return { success: true };
    } catch (err: any) {
      if (isTableMissingError(err)) {
        return { success: true, isInMemory: true };
      }
      console.warn('[productService] Exception saat menyimpan produk ke Supabase:', err?.message || err);
      return { success: true, isInMemory: true };
    }
  },

  /**
   * Menyimpan varian tunggal ke tabel 'product_variants' di Supabase
   */
  saveSingleVariant: async (productId: string, variant: ProductVariant): Promise<{ success: boolean; isInMemory?: boolean; error?: string }> => {
    purgeLegacyLocalStorageProducts();

    // Update in-memory
    inMemoryProducts = inMemoryProducts.map(p => {
      if (p.id !== productId) return p;
      const vExists = p.variants.some(v => v.id === variant.id);
      const updatedVariants = vExists
        ? p.variants.map(v => (v.id === variant.id ? variant : v))
        : [...p.variants, variant];
      return { ...p, variants: updatedVariants };
    });

    if (!isSupabaseConfigured || !supabase) {
      return { success: true, isInMemory: true };
    }

    try {
      const variantPayload = {
        id: variant.id,
        product_id: productId,
        variant_name: variant.variantName,
        sku: (variant.sku || variant.variantCode).trim().toUpperCase(),
        status: variant.status || 'active',
        net_volume_grams: variant.netVolumeGrams || 0,
        bulk_formula_code: variant.bulkFormulaCode || '',
        packaging_bom: variant.packagingBom || [],
        bpom_number: variant.bpomNumber || '',
        barcode: variant.barcode || '',
        description: variant.description || '',
        created_at: variant.createdAt || new Date().toISOString(),
      };

      const res = await productService.withNetworkRetry(async () => {
        return await supabase
          .from('product_variants')
          .upsert(variantPayload, { onConflict: 'sku' });
      });
      const error = res.error;

      if (error) {
        if (isTableMissingError(error)) {
          console.warn('[productService] Tabel product_variants belum ada di Supabase. Disimpan di sesi memori.');
          return { success: true, isInMemory: true };
        }
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      if (isTableMissingError(err)) {
        return { success: true, isInMemory: true };
      }
      return { success: true, isInMemory: true };
    }
  },

  /**
   * Menghapus produk dari tabel 'products' di Supabase (CASCADE menghapus varian terkait)
   */
  deleteProduct: async (productId: string): Promise<{ success: boolean; error?: string }> => {
    inMemoryProducts = inMemoryProducts.filter(p => p.id !== productId);

    if (!isSupabaseConfigured || !supabase) {
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) {
        if (isTableMissingError(error)) {
          return { success: true };
        }
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: true };
    }
  },

  /**
   * Menghapus varian dari tabel 'product_variants' di Supabase
   */
  deleteVariant: async (variantId: string): Promise<{ success: boolean; error?: string }> => {
    inMemoryProducts = inMemoryProducts.map(p => ({
      ...p,
      variants: p.variants.filter(v => v.id !== variantId)
    }));

    if (!isSupabaseConfigured || !supabase) {
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variantId);

      if (error) {
        if (isTableMissingError(error)) {
          return { success: true };
        }
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: true };
    }
  },

  /**
   * Menyimpan sekumpulan produk (batch) secara efisien dengan chunked bulk upsert ke Supabase
   */
  saveProducts: async (products: Product[]): Promise<{ success: boolean; count: number; error?: string }> => {
    purgeLegacyLocalStorageProducts();

    // 1. Update inMemoryProducts
    for (const prod of products) {
      const idx = inMemoryProducts.findIndex(p => p.id === prod.id || p.code === prod.code);
      if (idx >= 0) {
        inMemoryProducts[idx] = prod;
      } else {
        inMemoryProducts.push(prod);
      }
    }

    if (!isSupabaseConfigured || !supabase) {
      return { success: true, count: products.length };
    }

    try {
      // Chunking array into batches of 100 for fast bulk upsert
      const chunkSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize);

        const payloads = chunk.map((prod) => ({
          id: prod.id,
          product_code: (prod.productCode || prod.code).trim().toUpperCase(),
          name: prod.name.trim(),
          brand: prod.brand.trim(),
          exp_notification_date: formatToISODate(prod.expNotificationDate || prod.bpomNotificationExt),
          category: prod.category || '',
          description: prod.description || '',
          unit: prod.unit || 'pcs (Pieces)',
          storage_conditions: prod.storageConditions || '',
          bpom_notification_number: prod.bpomNotificationNumber || '',
          qc_parameters: prod.qcParameters || [],
          finished_parameters: prod.finishedQcParameters || [],
          created_at: prod.createdAt || new Date().toISOString(),
        }));

        let res = await productService.withNetworkRetry(async () => {
          return await supabase
            .from('products')
            .upsert(payloads, { onConflict: 'product_code' });
        });

        // Handling jika kolom finished_parameters atau qc_parameters belum ada di schema cache Supabase
        if (res.error && (res.error.message?.includes('finished_parameters') || res.error.message?.includes('qc_parameters'))) {
          console.warn('[productService] Kolom parameter belum terdaftar di schema cache Supabase. Melakukan fallback batch upsert...');
          const fallbackPayloads = payloads.map(({ finished_parameters, qc_parameters, ...rest }) => rest);
          res = await productService.withNetworkRetry(async () => {
            return await supabase
              .from('products')
              .upsert(fallbackPayloads, { onConflict: 'product_code' });
          });
        }

        if (res.error) {
          console.error('[productService] Error during batch upsert to Supabase:', res.error);
          if (isTableMissingError(res.error)) {
            tablesInitializedInSupabase = false;
            return {
              success: false,
              count: insertedCount,
              error: `Tabel 'products' belum dikonfirmasi di Supabase. Silakan jalankan skrip SQL supabase_schema_products.sql di Supabase SQL Editor. Pesan: ${res.error.message}`,
            };
          }
          return { success: false, count: insertedCount, error: res.error.message };
        }

        insertedCount += chunk.length;
      }

      tablesInitializedInSupabase = true;
      return { success: true, count: insertedCount };
    } catch (err: any) {
      console.error('[productService] Exception in saveProducts:', err);
      return { success: false, count: 0, error: err?.message || String(err) };
    }
  },

  /**
   * Mengosongkan seluruh data Master Produk dan Varian dari Supabase dan memori
   */
  clearAllProducts: async (): Promise<{ success: boolean; error?: string }> => {
    inMemoryProducts = [];
    if (!isSupabaseConfigured || !supabase) {
      return { success: true };
    }
    try {
      // 1. Hapus varian
      await supabase.from('product_variants').delete().neq('id', '___none___');
      // 2. Hapus products
      const { error } = await supabase.from('products').delete().neq('id', '___none___');
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  },
};

