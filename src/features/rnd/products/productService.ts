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
let cachedTotalProducts: { totalProducts: number; totalVariants: number } | null = null;
let lastCountFetchTime = 0;
const PRODUCTS_CACHE_TTL_MS = 60 * 60 * 1000; // 60 menit cache di RAM untuk efisiensi egress Supabase
const paginatedCache = new Map<string, { timestamp: number; result: any }>();
const productDetailCache = new Map<string, { timestamp: number; data: Product }>();
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
    cachedTotalProducts = null;
    paginatedCache.clear();
    productDetailCache.clear();
  },


  getProductsCount: async (): Promise<{ totalProducts: number; totalVariants: number }> => {
    if (cachedTotalProducts !== null && (Date.now() - lastCountFetchTime < PRODUCTS_CACHE_TTL_MS)) {
      return cachedTotalProducts;
    }
    if (isSupabaseConfigured && supabase) {
      try {
        const { count: prodCount } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true });
        const { count: varCount } = await supabase
          .from('product_variants')
          .select('id', { count: 'exact', head: true });
        const res = {
          totalProducts: prodCount || 0,
          totalVariants: varCount || 0,
        };
        cachedTotalProducts = res;
        lastCountFetchTime = Date.now();
        return res;
      } catch (err) {
        console.warn('[productService] getProductsCount error:', err);
      }
    }
    const totalVariants = inMemoryProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
    return cachedTotalProducts ?? {
      totalProducts: inMemoryProducts.length,
      totalVariants,
    };
  },

  getProductsPaginated: async (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    expFilter?: 'all' | 'expiring_soon';
  }): Promise<{ items: Product[]; totalCount: number; page: number; pageSize: number; totalPages: number }> => {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, params.pageSize || 50);
    const from = (page - 1) * pageSize;
    const queryTo = from + pageSize; // fetch pageSize + 1 items

    const cacheKey = `${page}-${pageSize}-${params.search || ''}-${params.category || 'all'}-${params.expFilter || 'all'}`;
    const cached = paginatedCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < PRODUCTS_CACHE_TTL_MS)) {
      return cached.result;
    }

    const parseJsonArray = <T = any>(val: any, fallback: T[] = []): T[] => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim()) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
      }
      return fallback;
    };

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('products')
          .select('id, product_code, name, brand, category, description, unit, storage_conditions, bpom_notification_number, exp_notification_date, created_at');

        if (params.search && params.search.trim()) {
          const s = params.search.trim();
          query = query.or(`name.ilike.%${s}%,product_code.ilike.%${s}%,brand.ilike.%${s}%,category.ilike.%${s}%`);
        }

        if (params.category && params.category !== 'all') {
          query = query.eq('category', params.category);
        }

        if (params.expFilter === 'expiring_soon') {
          const sixMonthsAhead = new Date();
          sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);
          const limitStr = sixMonthsAhead.toISOString().split('T')[0];
          query = query.lte('exp_notification_date', limitStr);
        }

        query = query.order('product_code', { ascending: true }).range(from, queryTo);

        const { data: pageProducts, error } = await query;

        if (!error && pageProducts) {
          const hasMore = pageProducts.length > pageSize;
          const rawItems = hasMore ? pageProducts.slice(0, pageSize) : pageProducts;
          const productIds = rawItems.map((p: any) => p.id);
          let variantsByProductId: Record<string, any[]> = {};

          if (productIds.length > 0) {
            try {
              // Optimized: ONLY query lightweight variant fields for products on this page
              const { data: varData, error: varErr } = await supabase
                .from('product_variants')
                .select('id, product_id, sku, variant_name, status, net_volume_grams, bulk_formula_code, bpom_number, barcode, created_at')
                .in('product_id', productIds);

              if (!varErr && varData) {
                for (const v of varData) {
                  const pid = v.product_id;
                  if (!variantsByProductId[pid]) variantsByProductId[pid] = [];
                  variantsByProductId[pid].push(v);
                }
              }
            } catch (vErr) {
              console.warn('[productService] error fetching page variants:', vErr);
            }
          }

          const mapped: Product[] = rawItems.map((p: any) => {
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
              qcParameters: [],
              finishedQcParameters: [],
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
                packagingBom: [],
                bpomNumber: v.bpom_number || '',
                barcode: v.barcode || '',
                description: v.description || '',
                createdAt: v.created_at,
              })),
            };
          });

          const totalCount = hasMore ? (page * pageSize) + 1 : ((page - 1) * pageSize) + mapped.length;
          const result = {
            items: mapped,
            totalCount,
            page,
            pageSize,
            totalPages: Math.ceil(totalCount / pageSize) || 1,
          };
          paginatedCache.set(cacheKey, { timestamp: Date.now(), result });
          return result;
        }
      } catch (err) {
        console.warn('[productService] getProductsPaginated exception:', err);
      }
    }

    // Fallback in-memory
    const to = from + pageSize - 1;
    let filtered = inMemoryProducts;
    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(s) || (p.productCode || '').toLowerCase().includes(s));
    }
    const items = filtered.slice(from, to + 1);
    return {
      items,
      totalCount: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize) || 1,
    };
  },

  searchProducts: async (term: string, limit = 20): Promise<Array<{ id: string; productCode: string; name: string; brand: string }>> => {
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('products')
          .select('id, product_code, name, brand')
          .order('product_code', { ascending: true })
          .limit(limit);

        if (term && term.trim()) {
          const s = term.trim();
          query = query.or(`name.ilike.%${s}%,product_code.ilike.%${s}%,brand.ilike.%${s}%`);
        }

        const { data, error } = await query;
        if (!error && data) {
          return data.map((d: any) => ({
            id: d.id,
            productCode: d.product_code || '',
            name: d.name,
            brand: d.brand || '',
          }));
        }
      } catch (err) {
        console.warn('[productService] searchProducts error:', err);
      }
    }
    return inMemoryProducts
      .filter((p) => !term || p.name.toLowerCase().includes(term.toLowerCase()) || (p.productCode || '').toLowerCase().includes(term.toLowerCase()))
      .slice(0, limit)
      .map((p) => ({ id: p.id, productCode: p.productCode || '', name: p.name, brand: p.brand }));
  },

  getProducts: async (forceRefresh = false): Promise<Product[]> => {
    purgeLegacyLocalStorageProducts();

    const isCacheValid = !forceRefresh && inMemoryProducts.length > 0 && (Date.now() - lastProductsFetchTime < PRODUCTS_CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryProducts;
    }

    if (!isSupabaseConfigured || !supabase) {
      return inMemoryProducts;
    }

    try {
      // Optimized single fetch (limit 300) without multi-thousand unbounded while loop
      const { data: prods, error } = await supabase
        .from('products')
        .select('id, product_code, name, brand, category, description, unit, storage_conditions, bpom_notification_number, exp_notification_date, qc_parameters, finished_parameters, created_at')
        .order('product_code', { ascending: true })
        .limit(300);

      if (error) {
        if (isTableMissingError(error)) {
          tablesInitializedInSupabase = false;
          return inMemoryProducts;
        }
        console.warn('[productService] error fetching products:', error.message);
        return inMemoryProducts;
      }

      if (!prods || prods.length === 0) {
        inMemoryProducts = [];
        lastProductsFetchTime = Date.now();
        return [];
      }

      // Fetch variants for loaded products only
      const pIds = prods.map((p: any) => p.id);
      let allVariants: any[] = [];
      try {
        const { data: variantsData, error: varErr } = await supabase
          .from('product_variants')
          .select('id, product_id, sku, variant_name, status, net_volume_grams, bulk_formula_code, packaging_bom, bpom_number, barcode, description, created_at')
          .in('product_id', pIds);
        if (!varErr && variantsData) {
          allVariants = variantsData;
        }
      } catch (e) {
        console.warn('[productService] error loading variants:', e);
      }

      const variantsByProductId: Record<string, any[]> = {};
      for (const v of allVariants) {
        const pid = v.product_id;
        if (!variantsByProductId[pid]) variantsByProductId[pid] = [];
        variantsByProductId[pid].push(v);
      }

      const parseJsonArray = <T = any>(val: any, fallback: T[] = []): T[] => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string' && val.trim()) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
          } catch {}
        }
        return fallback;
      };

      const mapped = prods.map((p: any) => {
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
          qcParameters: parseJsonArray(p.qc_parameters, []),
          finishedQcParameters: parseJsonArray(p.finished_parameters || p.finished_qc_parameters, []),
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
            packagingBom: parseJsonArray(v.packaging_bom, []),
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
      console.warn('[productService] exception fetching products:', err?.message || err);
      return inMemoryProducts;
    }
  },

  /**
   * Mengambil spesifikasi parameter lengkap dari sebuah produk secara on-demand (lazy load)
   */
  getProductWithParams: async (productId: string): Promise<Product | null> => {
    if (!productId) return null;
    const cached = productDetailCache.get(productId);
    if (cached && (Date.now() - cached.timestamp < PRODUCTS_CACHE_TTL_MS)) {
      return cached.data;
    }

    if (!isSupabaseConfigured || !supabase) {
      const prod = inMemoryProducts.find(p => p.id === productId);
      return prod || null;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error || !data) {
        console.warn(`[productService] Gagal mengambil detail produk on-demand untuk ${productId}:`, error?.message);
        return inMemoryProducts.find(p => p.id === productId) || null;
      }

      // Ambil variants lengkap dengan packaging_bom
      let loadedVariants: any[] = [];
      try {
        const { data: vData } = await supabase
          .from('product_variants')
          .select('*')
          .eq('product_id', productId);
        if (vData) loadedVariants = vData;
      } catch (vErr) {
        console.warn('[productService] error fetching variants on-demand:', vErr);
      }

      const parseJsonArray = <T = any>(val: any, fallback: T[] = []): T[] => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string' && val.trim()) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
          } catch {}
        }
        return fallback;
      };

      const fullProduct: Product = {
        id: data.id,
        code: data.product_code || data.code || '',
        productCode: data.product_code || data.code || '',
        name: data.name || '',
        brand: data.brand || '',
        category: data.category || '',
        description: data.description || '',
        unit: data.unit || 'pcs (Pieces)',
        storageConditions: data.storage_conditions || '',
        bpomNotificationNumber: data.bpom_notification_number || '',
        bpomNotificationExt: data.exp_notification_date || '',
        expNotificationDate: data.exp_notification_date || '',
        qcParameters: parseJsonArray(data.qc_parameters, []),
        finishedQcParameters: parseJsonArray(data.finished_parameters || data.finished_qc_parameters, []),
        createdAt: data.created_at,
        variants: loadedVariants.map((v: any) => ({
          id: v.id,
          productId: v.product_id || data.id,
          variantCode: v.sku || v.variant_code || '',
          sku: v.sku || v.variant_code || '',
          variantName: v.variant_name || '',
          status: v.status || 'active',
          netVolumeGrams: Number(v.net_volume_grams) || 0,
          bulkFormulaCode: v.bulk_formula_code || '',
          packagingBom: parseJsonArray(v.packaging_bom, []),
          bpomNumber: v.bpom_number || '',
          barcode: v.barcode || '',
          description: v.description || '',
          createdAt: v.created_at,
        })),
      };

      productDetailCache.set(productId, { timestamp: Date.now(), data: fullProduct });
      return fullProduct;
    } catch (err) {
      console.warn(`[productService] Exception saat mengambil parameter on-demand:`, err);
      return inMemoryProducts.find(p => p.id === productId) || null;
    }
  },

  /**
   * Mengambil detail lengkap satu varian (termasuk packaging_bom) secara on-demand saat edit varian
   */
  getVariantDetail: async (variantId: string): Promise<ProductVariant | null> => {
    if (!variantId) return null;
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('product_variants')
          .select('*')
          .eq('id', variantId)
          .maybeSingle();

        if (!error && data) {
          const parseJsonArray = <T = any>(val: any, fallback: T[] = []): T[] => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val.trim()) {
              try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed;
              } catch {}
            }
            return fallback;
          };

          return {
            id: data.id,
            productId: data.product_id,
            variantCode: data.sku || data.variant_code || '',
            sku: data.sku || data.variant_code || '',
            variantName: data.variant_name || '',
            status: data.status || 'active',
            netVolumeGrams: Number(data.net_volume_grams) || 0,
            bulkFormulaCode: data.bulk_formula_code || '',
            packagingBom: parseJsonArray(data.packaging_bom, []),
            bpomNumber: data.bpom_number || '',
            barcode: data.barcode || '',
            description: data.description || '',
            createdAt: data.created_at,
          };
        }
      } catch (err) {
        console.warn('[productService] getVariantDetail exception:', err);
      }
    }
    return null;
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
      const pCode = (prod.productCode || prod.code).trim().toUpperCase();
      let productPayload: any = {
        id: prod.id,
        code: pCode,
        product_code: pCode,
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
          .upsert(productPayload, { onConflict: 'code' });
      });

      // Handling jika kolom finished_parameters atau qc_parameters belum ada di schema cache Supabase
      if (res.error && (res.error.message?.includes('finished_parameters') || res.error.message?.includes('qc_parameters'))) {
        console.warn('[productService] Kolom parameter belum terdaftar di schema cache Supabase. Melakukan fallback upsert...');
        delete productPayload.finished_parameters;
        delete productPayload.qc_parameters;
        res = await productService.withNetworkRetry(async () => {
          return await supabase
            .from('products')
            .upsert(productPayload, { onConflict: 'code' });
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

        const payloads = chunk.map((prod) => {
          const pCode = (prod.productCode || prod.code).trim().toUpperCase();
          return {
            id: prod.id,
            code: pCode,
            product_code: pCode,
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
        });

        let res = await productService.withNetworkRetry(async () => {
          return await supabase
            .from('products')
            .upsert(payloads, { onConflict: 'code' });
        });

        // Handling jika kolom finished_parameters atau qc_parameters belum ada di schema cache Supabase
        if (res.error && (res.error.message?.includes('finished_parameters') || res.error.message?.includes('qc_parameters'))) {
          console.warn('[productService] Kolom parameter belum terdaftar di schema cache Supabase. Melakukan fallback batch upsert...');
          const fallbackPayloads = payloads.map(({ finished_parameters, qc_parameters, ...rest }) => rest);
          res = await productService.withNetworkRetry(async () => {
            return await supabase
              .from('products')
              .upsert(fallbackPayloads, { onConflict: 'code' });
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
    lastProductsFetchTime = 0;
    cachedTotalProducts = null;
    lastCountFetchTime = 0;
    paginatedCache.clear();
    productDetailCache.clear();
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

