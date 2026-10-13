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
const FORMULATIONS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit cache di RAM untuk efisiensi egress Supabase

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
