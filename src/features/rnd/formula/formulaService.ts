import { supabase, isSupabaseConfigured } from '../../../core/auth/supabaseClient';
import { BulkFormulation } from '../../../types';

// Penyimpanan sesi in-memory (BUKAN local storage)
const defaultFormulations: BulkFormulation[] = [
  {
    id: 'f-default-1',
    code: 'BOM-PJ0099-V1.0',
    name: 'Larassanti Ginseng Hair Tonic',
    productId: 'p-default-1',
    productCode: 'PJ0099',
    productName: 'Larassanti Hair Tonic Ginseng',
    version: 'v1.0',
    status: 'ACTIVE',
    bulkQuantityKg: 100,
    purposeDescription: 'Formula standar komersial hair tonic ginseng dengan ekstrak aktif untuk kekuatan akar rambut.',
    ingredients: [
      { rawMaterialCode: 'RM-AQUA', percentage: 75.0, qtyBasisKg: 75.0, phase: 'A', description: 'Pelarut utama / Carrier' },
      { rawMaterialCode: 'RM-ALC', percentage: 15.0, qtyBasisKg: 15.0, phase: 'A', description: 'Pelarut tambahan / Solubilizer' },
      { rawMaterialCode: 'RM-GINSENG', percentage: 5.0, qtyBasisKg: 5.0, phase: 'B', description: 'Bahan aktif utama penumbuh rambut' },
      { rawMaterialCode: 'RM-PEG40', percentage: 3.0, qtyBasisKg: 3.0, phase: 'C', description: 'Emulsifier untuk pewangi' },
      { rawMaterialCode: 'RM-FRAG', percentage: 1.0, qtyBasisKg: 1.0, phase: 'C', description: 'Pewangi herbal ginseng' },
      { rawMaterialCode: 'RM-METHYL', percentage: 1.0, qtyBasisKg: 1.0, phase: 'D', description: 'Sistem pengawet produk cair' },
    ],
    mixingInstructions: '1. Larutkan pengawet dalam air hangat fase A.\n2. Tambahkan pelarut tambahan secara perlahan.\n3. Homogenkan fase B (Ginseng extract) ke dalam campuran utama.\n4. Campur fase C secara terpisah hingga bening, lalu masukkan ke bejana utama.\n5. Lakukan QC cek penampilan fisik, pH (5.5 - 6.5), dan viskositas.',
    createdBy: 'Andi RnD',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T08:00:00Z',
  },
  {
    id: 'f-default-2',
    code: 'BOM-PJ0100-V1.0',
    name: 'Larassanti Aloe Vera Soothing Gel',
    productId: 'p-default-2',
    productCode: 'PJ0100',
    productName: 'Larassanti Aloe Vera Soothing Gel',
    version: 'v1.0',
    status: 'ACTIVE',
    bulkQuantityKg: 100,
    purposeDescription: 'Formula gel penyejuk kulit wajah dan tubuh berbasis karbomer dengan kandungan aloe vera 98%.',
    ingredients: [
      { rawMaterialCode: 'RM-AQUA', percentage: 90.0, qtyBasisKg: 90.0, phase: 'A', description: 'Pelarut / Basis Gel' },
      { rawMaterialCode: 'RM-CARBOMER', percentage: 1.5, qtyBasisKg: 1.5, phase: 'A', description: 'Gelling agent pembentuk viskositas' },
      { rawMaterialCode: 'RM-TEA', percentage: 1.5, qtyBasisKg: 1.5, phase: 'B', description: 'Penetral pH untuk mengaktifkan gel' },
      { rawMaterialCode: 'RM-ALOE', percentage: 5.0, qtyBasisKg: 5.0, phase: 'C', description: 'Ekstrak aktif lidah buaya' },
      { rawMaterialCode: 'RM-PHENOXY', percentage: 1.0, qtyBasisKg: 1.0, phase: 'D', description: 'Sistem pengawet ramah kulit' },
    ],
    mixingInstructions: '1. Dispersikan karbomer dalam air fase A hingga mengembang sempurna (± 2 jam).\n2. Tambahkan TEA secara perlahan sambil dimixer cepat hingga terbentuk struktur gel bening yang tebal.\n3. Masukkan ekstrak Aloe Vera dan pengawet, aduk perlahan (low speed) agar tidak memerangkap udara (gelembung).\n4. Cek pH akhir (6.0 - 7.0) dan kejernihan gel.',
    createdBy: 'Siti Formulator',
    createdAt: '2026-09-05T09:30:00Z',
    updatedAt: '2026-09-05T09:30:00Z',
  }
];

let inMemoryFormulations: BulkFormulation[] = [...defaultFormulations];
let lastFormulationsFetchTime = 0;
let cachedFormulaCount: number | null = null;
let lastCountFetchTime = 0;
const FORMULATIONS_CACHE_TTL_MS = 60 * 60 * 1000; // 60 menit cache di RAM untuk efisiensi egress Supabase
const paginatedFormulaCache = new Map<string, { timestamp: number; result: any }>();
const formulaDetailCache = new Map<string, { timestamp: number; data: BulkFormulation }>();

/**
 * Lossless packing of CPKB Dynamic Process Steps and Technical Notes into mixing_instructions
 * Ensures complete persistence in Supabase even when dedicated schema columns are not present.
 */
function packFormulationMeta(instructions?: string, steps?: any, techNotes?: string): string {
  const cleanInst = (instructions || '').replace(/<!--CPKB_META_START-->[\s\S]*?<!--CPKB_META_END-->/g, '').trim();
  const hasSteps = Array.isArray(steps) && steps.length > 0;
  const hasTech = Boolean(techNotes && techNotes.trim());

  if (!hasSteps && !hasTech) {
    return cleanInst;
  }

  const meta = {
    steps: hasSteps ? steps : [],
    techNotes: techNotes || '',
  };

  return `${cleanInst}\n\n<!--CPKB_META_START-->\n${JSON.stringify(meta)}\n<!--CPKB_META_END-->`.trim();
}

function unpackFormulationMeta(raw?: string | null): { userInstructions: string; dynamicProcessSteps?: any; technicalNotes?: string } {
  if (!raw) return { userInstructions: '', dynamicProcessSteps: undefined, technicalNotes: '' };
  const match = raw.match(/<!--CPKB_META_START-->([\s\S]*?)<!--CPKB_META_END-->/);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const cleanInst = raw.replace(/<!--CPKB_META_START-->[\s\S]*?<!--CPKB_META_END-->/g, '').trim();
      return {
        userInstructions: cleanInst,
        dynamicProcessSteps: Array.isArray(parsed.steps) && parsed.steps.length > 0 ? parsed.steps : undefined,
        technicalNotes: parsed.techNotes || '',
      };
    } catch {
      // Fall through to plain text
    }
  }
  return { userInstructions: raw.trim(), dynamicProcessSteps: undefined, technicalNotes: '' };
}

// Bersihkan data demo lama dari local storage jika masih tersisa di browser
export const purgeLegacyDemoFormulas = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const legacyKeys = [
      'cosmo_ddmp_bulk_formulations',
      'lsm_formulations_v2',
      'rnd_demo_formulas',
      'demo_formulations_cache',
      'lsm_formulations'
    ];
    legacyKeys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });
  }
};

// Jalankan pembersihan saat inisialisasi module
purgeLegacyDemoFormulas();

export const formulaService = {
  isConfigured: isSupabaseConfigured,

  invalidateCache: () => {
    lastFormulationsFetchTime = 0;
    cachedFormulaCount = null;
    paginatedFormulaCache.clear();
    formulaDetailCache.clear();
  },

  /**
   * Mengambil jumlah total formulasi secara efisien tanpa egress baris data (head: true)
   */
  getFormulationsCount: async (): Promise<number> => {
    if (cachedFormulaCount !== null && (Date.now() - lastCountFetchTime < FORMULATIONS_CACHE_TTL_MS)) {
      return cachedFormulaCount;
    }
    if (isSupabaseConfigured && supabase) {
      try {
        const { count, error } = await supabase
          .from('bulk_formulations')
          .select('id', { count: 'exact', head: true });
        if (!error && typeof count === 'number') {
          cachedFormulaCount = count;
          lastCountFetchTime = Date.now();
          return count;
        }
      } catch (err) {
        console.warn('[formulaService] getFormulationsCount error:', err);
      }
    }
    return cachedFormulaCount ?? inMemoryFormulations.length;
  },

  /**
   * Mengambil detail lengkap SATU formulasi (lazy loading on-demand)
   * Hanya dipanggil saat user menekan tombol Detail, Edit, Cetak CPB, atau Duplikasi
   */
  getFormulationDetail: async (id: string): Promise<BulkFormulation | null> => {
    if (!id) return null;
    const cached = formulaDetailCache.get(id);
    if (cached && (Date.now() - cached.timestamp < FORMULATIONS_CACHE_TTL_MS)) {
      return cached.data;
    }

    if (!isSupabaseConfigured || !supabase) {
      return inMemoryFormulations.find(f => f.id === id || f.code === id) || null;
    }

    try {
      const { data, error } = await supabase
        .from('bulk_formulations')
        .select('*')
        .or(`id.eq.${id},code.eq.${id}`)
        .maybeSingle();

      if (error || !data) {
        console.warn('[formulaService] Error fetching formulation detail:', error?.message);
        return inMemoryFormulations.find(f => f.id === id || f.code === id) || null;
      }

      const unpacked = unpackFormulationMeta(data.mixing_instructions);
      const fullItem: BulkFormulation = {
        id: data.id,
        code: data.code,
        name: data.name,
        productId: data.product_id || '',
        productCode: data.product_code || '',
        productName: data.product_name || data.name || '',
        version: data.version || 'v1.0',
        status: data.status || 'ACTIVE',
        bulkQuantityKg: Number(data.bulk_quantity_kg) || 100,
        purposeDescription: data.purpose_description || '',
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        mixingInstructions: unpacked.userInstructions || data.mixing_instructions || '',
        dynamicProcessSteps: data.dynamic_process_steps || unpacked.dynamicProcessSteps || undefined,
        technicalNotes: data.technical_notes || unpacked.technicalNotes || '',
        createdBy: data.created_by || '',
        createdAt: data.created_at || new Date().toISOString(),
        updatedAt: data.updated_at || new Date().toISOString(),
      };

      formulaDetailCache.set(id, { timestamp: Date.now(), data: fullItem });
      formulaDetailCache.set(fullItem.id, { timestamp: Date.now(), data: fullItem });
      formulaDetailCache.set(fullItem.code, { timestamp: Date.now(), data: fullItem });
      return fullItem;
    } catch (err) {
      console.warn('[formulaService] Exception fetching formulation detail:', err);
      return inMemoryFormulations.find(f => f.id === id || f.code === id) || null;
    }
  },

  /**
   * Paginasi tetap 50 item per halaman dengan kueri ultra-ringan (tanpa blob instruksi & langkah teknis besar)
   */
  getFormulationsPaginated: async (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    productCode?: string;
    status?: string;
  }): Promise<{ items: BulkFormulation[]; totalCount: number; page: number; pageSize: number; totalPages: number }> => {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, params.pageSize || 50);
    const from = (page - 1) * pageSize;
    const queryTo = from + pageSize; // Ambil pageSize + 1 untuk deteksi tombol Selanjutnya (Next) tanpa full scan

    const cacheKey = `${page}-${pageSize}-${params.search || ''}-${params.productCode || 'all'}-${params.status || 'all'}`;
    const cached = paginatedFormulaCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < FORMULATIONS_CACHE_TTL_MS)) {
      return cached.result;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('bulk_formulations')
          .select('id, code, name, product_id, product_code, product_name, version, status, bulk_quantity_kg, purpose_description, created_by, created_at, updated_at');

        if (params.search && params.search.trim()) {
          const s = params.search.trim();
          query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%,product_code.ilike.%${s}%,product_name.ilike.%${s}%`);
        }

        if (params.productCode && params.productCode !== 'all') {
          query = query.eq('product_code', params.productCode);
        }

        if (params.status && params.status !== 'all') {
          query = query.eq('status', params.status);
        }

        query = query.order('created_at', { ascending: false }).range(from, queryTo);

        const { data, error } = await query;

        if (!error && data) {
          const hasMore = data.length > pageSize;
          const rawItems = hasMore ? data.slice(0, pageSize) : data;
          const mapped: BulkFormulation[] = rawItems.map((row: any) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            productId: row.product_id || '',
            productCode: row.product_code || '',
            productName: row.product_name || row.name || '',
            version: row.version || 'v1.0',
            status: row.status || 'ACTIVE',
            bulkQuantityKg: Number(row.bulk_quantity_kg) || 100,
            purposeDescription: row.purpose_description || '',
            ingredients: [], // Dikosongkan agar hemat bandwidth, diambil on-demand saat klik detail/edit
            mixingInstructions: '',
            dynamicProcessSteps: undefined,
            technicalNotes: '',
            createdBy: row.created_by || '',
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString(),
          }));

          const totalCount = hasMore ? (page * pageSize) + 1 : ((page - 1) * pageSize) + mapped.length;
          const result = {
            items: mapped,
            totalCount,
            page,
            pageSize,
            totalPages: Math.ceil(totalCount / pageSize) || 1,
          };
          paginatedFormulaCache.set(cacheKey, { timestamp: Date.now(), result });
          return result;
        }
      } catch (err) {
        console.warn('[formulaService] getFormulationsPaginated exception:', err);
      }
    }

    // Fallback in-memory
    const to = from + pageSize - 1;
    let filtered = inMemoryFormulations;
    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      filtered = filtered.filter((f) =>
        f.code.toLowerCase().includes(s) ||
        f.productCode.toLowerCase().includes(s) ||
        f.productName.toLowerCase().includes(s) ||
        f.name.toLowerCase().includes(s)
      );
    }
    if (params.productCode && params.productCode !== 'all') {
      filtered = filtered.filter((f) => f.productCode === params.productCode);
    }
    if (params.status && params.status !== 'all') {
      filtered = filtered.filter((f) => f.status === params.status);
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

  /**
   * Mengambil semua master formulasi bulk langsung dari database Supabase
   */
  getFormulations: async (forceRefresh = false): Promise<BulkFormulation[]> => {
    const isCacheValid = !forceRefresh && inMemoryFormulations.length > 0 && (Date.now() - lastFormulationsFetchTime < FORMULATIONS_CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryFormulations;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('bulk_formulations')
          .select('id, code, name, product_id, product_code, product_name, version, status, bulk_quantity_kg, purpose_description, ingredients, mixing_instructions, created_by, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(300);

        if (!error && data) {
          const mapped: BulkFormulation[] = data.map((row: any) => {
            const unpacked = unpackFormulationMeta(row.mixing_instructions);
            return {
              id: row.id,
              code: row.code,
              name: row.name,
              productId: row.product_id || '',
              productCode: row.product_code || '',
              productName: row.product_name || row.name || '',
              version: row.version || 'v1.0',
              status: row.status || 'ACTIVE',
              bulkQuantityKg: Number(row.bulk_quantity_kg) || 100,
              purposeDescription: row.purpose_description || '',
              ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
              mixingInstructions: unpacked.userInstructions || row.mixing_instructions || '',
              dynamicProcessSteps: row.dynamic_process_steps || unpacked.dynamicProcessSteps || undefined,
              technicalNotes: row.technical_notes || unpacked.technicalNotes || '',
              createdBy: row.created_by || '',
              createdAt: row.created_at || new Date().toISOString(),
              updatedAt: row.updated_at || new Date().toISOString(),
            };
          });

          inMemoryFormulations = mapped;
          lastFormulationsFetchTime = Date.now();
          return mapped;
        } else if (error) {
          console.warn('[formulaService] Unable to load bulk_formulations from Supabase:', error.message);
          if (typeof window !== 'undefined' && (
            error.message.includes('egress') ||
            error.message.includes('restricted') ||
            error.message.includes('Failed to fetch') ||
            error.message.includes('TypeError')
          )) {
            window.dispatchEvent(
              new CustomEvent('supabase-restriction', {
                detail: 'Koneksi ke database Supabase saat ini terganggu atau dibatasi (restricted/network failure). Sistem beralih ke mode offline lokal.'
              })
            );
          }
        }
      } catch (err: any) {
        console.warn('[formulaService] Exception loading from Supabase:', err?.message || err);
      }
    }

    return inMemoryFormulations;
  },

  /**
   * Menyimpan atau memperbarui satu formulasi bulk ke Supabase
   */
  saveSingleFormulation: async (formula: BulkFormulation): Promise<{ success: boolean; error?: string }> => {
    formulaService.invalidateCache();
    const packedInstructions = packFormulationMeta(
      formula.mixingInstructions,
      formula.dynamicProcessSteps,
      formula.technicalNotes
    );

    const payload = {
      id: formula.id,
      code: formula.code.trim().toUpperCase(),
      name: formula.name.trim(),
      product_id: formula.productId || null,
      product_code: formula.productCode.trim().toUpperCase(),
      product_name: formula.productName.trim(),
      version: formula.version || 'v1.0',
      status: formula.status || 'ACTIVE',
      bulk_quantity_kg: formula.bulkQuantityKg || 100,
      purpose_description: formula.purposeDescription || '',
      ingredients: formula.ingredients || [],
      mixing_instructions: packedInstructions,
      dynamic_process_steps: formula.dynamicProcessSteps || null,
      technical_notes: formula.technicalNotes || '',
      created_by: formula.createdBy || '',
      updated_at: new Date().toISOString(),
    };

    // 1. Simpan langsung ke Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('bulk_formulations')
          .upsert(payload, { onConflict: 'id' });

        if (error) {
          // Bila gagal karena kolom tidak ada, coba upsert tanpa kolom baru (metadata tetap aman di mixing_instructions)
          if (error.code === 'PGRST204' || error.message?.includes('column')) {
            const fallbackPayload = { ...payload };
            delete (fallbackPayload as any).dynamic_process_steps;
            delete (fallbackPayload as any).technical_notes;
            const { error: fallbackError } = await supabase.from('bulk_formulations').upsert(fallbackPayload, { onConflict: 'id' });
            if (fallbackError) {
               console.error('Supabase fallback upsert error (bulk_formulations):', fallbackError);
               return { success: false, error: fallbackError.message };
            }
          } else {
            console.error('Supabase upsert error (bulk_formulations):', error);
            return { success: false, error: error.message };
          }
        }
      } catch (dbErr: any) {
        console.error('Supabase saveSingleFormulation exception:', dbErr);
        return { success: false, error: dbErr.message || String(dbErr) };
      }
    }

    // 2. Perbarui state in-memory
    const idx = inMemoryFormulations.findIndex((f) => f.id === formula.id || f.code.toUpperCase() === formula.code.toUpperCase());
    if (idx !== -1) {
      inMemoryFormulations[idx] = { ...formula, updatedAt: new Date().toISOString() };
    } else {
      inMemoryFormulations.unshift({ ...formula, createdAt: formula.createdAt || new Date().toISOString() });
    }

    return { success: true };
  },

  /**
   * Menyimpan kumpulan formulasi bulk ke Supabase secara batch
   */
  saveBulkFormulations: async (formulas: BulkFormulation[]): Promise<{ success: boolean; error?: string; savedCount?: number }> => {
    formulaService.invalidateCache();
    if (!formulas || formulas.length === 0) return { success: true, savedCount: 0 };

    const payloads = formulas.map((formula) => {
      const packedInstructions = packFormulationMeta(
        formula.mixingInstructions,
        formula.dynamicProcessSteps,
        formula.technicalNotes
      );
      return {
        id: formula.id,
        code: formula.code.trim().toUpperCase(),
        name: formula.name.trim(),
        product_id: formula.productId || null,
        product_code: formula.productCode.trim().toUpperCase(),
        product_name: formula.productName.trim(),
        version: formula.version || 'v1.0',
        status: formula.status || 'ACTIVE',
        bulk_quantity_kg: formula.bulkQuantityKg || 100,
        purpose_description: formula.purposeDescription || '',
        ingredients: formula.ingredients || [],
        mixing_instructions: packedInstructions,
        dynamic_process_steps: formula.dynamicProcessSteps || null,
        technical_notes: formula.technicalNotes || '',
        created_by: formula.createdBy || '',
        updated_at: new Date().toISOString(),
      };
    });

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('bulk_formulations')
          .upsert(payloads, { onConflict: 'id' });

        if (error) {
          console.error('[formulaService] Error batch upserting bulk_formulations:', error);
          if (error.code === 'PGRST204' || error.message?.includes('column')) {
            const fallbackPayloads = payloads.map((p) => {
              const cp = { ...p };
              delete (cp as any).dynamic_process_steps;
              delete (cp as any).technical_notes;
              return cp;
            });
            const { error: fallbackError } = await supabase
              .from('bulk_formulations')
              .upsert(fallbackPayloads, { onConflict: 'id' });
            if (fallbackError) {
              return { success: false, error: fallbackError.message };
            }
          } else {
            return { success: false, error: error.message };
          }
        }
      } catch (dbErr: any) {
        console.error('[formulaService] Batch save exception:', dbErr);
        return { success: false, error: dbErr.message || String(dbErr) };
      }
    }

    // Update in-memory
    const map = new Map<string, BulkFormulation>();
    inMemoryFormulations.forEach((f) => map.set(f.code.toUpperCase(), f));
    formulas.forEach((f) => map.set(f.code.toUpperCase(), { ...f, updatedAt: new Date().toISOString() }));
    inMemoryFormulations = Array.from(map.values());

    return { success: true, savedCount: formulas.length };
  },

  /**
   * Menghapus formulasi dari database Supabase
   */
  deleteFormulation: async (id: string, code?: string): Promise<{ success: boolean; error?: string }> => {
    formulaService.invalidateCache();
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('bulk_formulations').delete().eq('id', id);
        if (code) {
          await supabase.from('bulk_formulations').delete().eq('code', code);
        }
      } catch (err: any) {
        console.error('[formulaService] Supabase delete error:', err);
      }
    }

    inMemoryFormulations = inMemoryFormulations.filter((f) => f.id !== id && (!code || f.code !== code));
    return { success: true };
  },

  /**
   * Menghitung versi berikutnya secara otomatis untuk suatu kode produk
   */
  calculateNextVersion: (existingFormulas: BulkFormulation[], productCode: string): string => {
    const cleanCode = productCode.trim().toUpperCase();
    const productFormulas = existingFormulas.filter(
      (f) => f.productCode?.toUpperCase() === cleanCode
    );

    if (productFormulas.length === 0) {
      return 'v1.0';
    }

    let maxMajor = 1;
    let maxMinor = 0;

    productFormulas.forEach((f) => {
      const verStr = (f.version || 'v1.0').toLowerCase().replace('v', '').trim();
      const parts = verStr.split('.');
      const major = parseInt(parts[0], 10) || 1;
      const minor = parseInt(parts[1], 10) || 0;

      if (major > maxMajor) {
        maxMajor = major;
        maxMinor = minor;
      } else if (major === maxMajor && minor > maxMinor) {
        maxMinor = minor;
      }
    });

    // Otomatis naik versi minor berikutnya
    return `v${maxMajor}.${maxMinor + 1}`;
  },
};
