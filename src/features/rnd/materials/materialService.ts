import { supabase, isSupabaseConfigured } from '../../../core/auth/supabaseClient';
import { RawMaterial } from '../../../types';
import { ensureUUID } from '../../../utils/uuid';

// In-memory cache untuk performa UI & efisiensi EGRESS Supabase (BUKAN local storage)
let inMemoryRawMaterials: RawMaterial[] = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 menit cache di RAM browser untuk menghemat egress

// Bersihkan data lama jika ada di browser
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    localStorage.removeItem('lsm_raw_materials_b');
  } catch {
    // ignore
  }
}

export const materialService = {
  invalidateCache: () => {
    lastFetchTime = 0;
  },

  checkConnection: async (): Promise<{ configured: boolean; connected: boolean; message: string }> => {
    if (!isSupabaseConfigured || !supabase) {
      return {
        configured: false,
        connected: false,
        message: 'Supabase URL atau Anon Key belum dikonfigurasi pada environment variable.',
      };
    }
    try {
      const { error } = await supabase.from('raw_materials').select('id').limit(1);
      if (error) {
        return {
          configured: true,
          connected: false,
          message: `Koneksi Supabase gagal: ${error.message} (Code: ${error.code})`,
        };
      }
      return {
        configured: true,
        connected: true,
        message: 'Koneksi ke tabel raw_materials Supabase aktif dan terverifikasi.',
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        message: `Terjadi exception saat koneksi: ${err.message || String(err)}`,
      };
    }
  },

  getLocalMaterials: (): RawMaterial[] => {
    return inMemoryRawMaterials;
  },

  getMaterials: async (forceRefresh = false): Promise<RawMaterial[]> => {
    const isCacheValid = !forceRefresh && inMemoryRawMaterials.length > 0 && (Date.now() - lastFetchTime < CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryRawMaterials;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const allFetchedRows: any[] = [];
        const pageSize = 1000;
        let page = 0;
        let hasMore = true;

        // Auto-batching pagination: mengambil seluruh baris (termasuk jika >1000 baris) melewati batas PostgREST
        while (hasMore) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from('raw_materials')
            .select('id, code, spec_number, name, chemical_name, category, categories, other_category_specification, storage_conditions, sds_doc_number, sds_file_url, sds_file_name, approved_substitutes, manufacturer, qc_parameters, supplier_lead_time_days, reorder_point, last_modified_by, last_modified_at')
            .order('code', { ascending: true })
            .range(from, to);

          if (error) {
            console.warn('[Supabase Audit] Error fetching raw_materials page', page, error.message);
            break;
          }

          if (data && data.length > 0) {
            allFetchedRows.push(...data);
            if (data.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        }

        if (allFetchedRows.length > 0) {
          const mapped: RawMaterial[] = allFetchedRows.map((m: any) => ({
            id: m.id,
            code: m.code,
            specNumber: m.spec_number || m.specNumber || `SP-BB-${m.code}`,
            name: m.name,
            chemicalName: m.chemical_name || m.chemicalName || '',
            category: m.category || 'active',
            categories: m.categories || (m.category ? [m.category] : ['active']),
            otherCategorySpecification: m.other_category_specification || m.otherCategorySpecification,
            storageConditions: m.storage_conditions || m.storageConditions || '',
            sdsDocNumber: m.sds_doc_number || m.sdsDocNumber || '',
            sdsFileUrl: m.sds_file_url || m.sdsFileUrl,
            sdsFileName: m.sds_file_name || m.sdsFileName,
            approvedSubstitutes: m.approved_substitutes || m.approvedSubstitutes || [],
            manufacturer: m.manufacturer || '',
            qcParameters: m.qc_parameters || m.qcParameters || [],
            supplierLeadTimeDays: m.supplier_lead_time_days ?? m.supplierLeadTimeDays ?? 14,
            reorderPoint: m.reorder_point ?? m.reorderPoint ?? 50,
            lastModifiedBy: m.last_modified_by || m.lastModifiedBy,
            lastModifiedAt: m.last_modified_at || m.lastModifiedAt,
          }));
          inMemoryRawMaterials = mapped;
          lastFetchTime = Date.now();
          return mapped;
        }
      } catch (err) {
        console.error('[Supabase Audit] Supabase raw materials fetch exception:', err);
      }
    }

    return inMemoryRawMaterials;
  },

  saveSingleMaterial: async (item: RawMaterial): Promise<{ success: boolean; error?: string; updatedId?: string }> => {
    // Ensure ID is a valid UUID for PostgreSQL
    const validId = ensureUUID(item.id);
    const normalizedItem: RawMaterial = { ...item, id: validId };

    // Update in-memory state
    const idx = inMemoryRawMaterials.findIndex((r) => r.id === validId || r.code === normalizedItem.code || r.id === item.id);
    if (idx >= 0) {
      inMemoryRawMaterials[idx] = normalizedItem;
    } else {
      inMemoryRawMaterials.unshift(normalizedItem);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const itemCode = normalizedItem.code.trim().toUpperCase();

        // 1. Check if a row already exists in Supabase by `code` or `id`
        let existingId: string | null = null;
        
        if (itemCode) {
          const { data: byCode, error: errCode } = await supabase
            .from('raw_materials')
            .select('id')
            .eq('code', itemCode)
            .maybeSingle();
          if (!errCode && byCode?.id) {
            existingId = byCode.id;
          }
        }

        if (!existingId && validId) {
          const { data: byId, error: errId } = await supabase
            .from('raw_materials')
            .select('id')
            .eq('id', validId)
            .maybeSingle();
          if (!errId && byId?.id) {
            existingId = byId.id;
          }
        }

        const resolvedId = existingId || validId;

        const payload = {
          id: resolvedId,
          code: itemCode,
          spec_number: normalizedItem.specNumber || `SP-BB-${itemCode}`,
          name: normalizedItem.name,
          chemical_name: normalizedItem.chemicalName || '',
          category: normalizedItem.category || 'active',
          categories: normalizedItem.categories || [normalizedItem.category || 'active'],
          storage_conditions: normalizedItem.storageConditions || '',
          sds_doc_number: normalizedItem.sdsDocNumber || '',
          approved_substitutes: normalizedItem.approvedSubstitutes || [],
          manufacturer: normalizedItem.manufacturer || '',
          qc_parameters: normalizedItem.qcParameters || [],
          supplier_lead_time_days: normalizedItem.supplierLeadTimeDays || 14,
          reorder_point: normalizedItem.reorderPoint ?? 50,
          last_modified_by: normalizedItem.lastModifiedBy || 'Staff RnD',
          last_modified_at: normalizedItem.lastModifiedAt || new Date().toISOString(),
        };

        if (existingId) {
          // UPDATE existing record
          const { error: updateError } = await supabase
            .from('raw_materials')
            .update(payload)
            .eq('id', existingId);

          if (updateError) {
            console.error('[Supabase Audit] Error updating raw_material by ID:', updateError);
            // Fallback: try update by code
            const { error: fallbackError } = await supabase
              .from('raw_materials')
              .update(payload)
              .eq('code', itemCode);

            if (fallbackError) {
              return { success: false, error: `${fallbackError.message} (${fallbackError.code})` };
            }
          }
          return { success: true, updatedId: resolvedId };
        } else {
          // INSERT new record
          const { error: insertError } = await supabase
            .from('raw_materials')
            .insert(payload);

          if (insertError) {
            // If code conflict happens unexpectedly, try updating by code
            if (insertError.code === '23505' || insertError.message?.includes('duplicate key')) {
              const { error: retryUpdateError } = await supabase
                .from('raw_materials')
                .update(payload)
                .eq('code', itemCode);

              if (retryUpdateError) {
                return { success: false, error: `${retryUpdateError.message} (${retryUpdateError.code})` };
              }
              return { success: true, updatedId: resolvedId };
            }
            console.error('[Supabase Audit] Error inserting raw_material:', insertError);
            return { success: false, error: `${insertError.message} (${insertError.code})` };
          }
          return { success: true, updatedId: resolvedId };
        }
      } catch (err: any) {
        console.error('[Supabase Audit] Exception during raw_material save:', err);
        return { success: false, error: err.message || String(err) };
      }
    }
    return { success: true };
  },

  saveMaterials: async (materials: RawMaterial[]): Promise<void> => {
    if (!materials || materials.length === 0) return;
    const normalizedList = materials.map((m) => ({ ...m, id: ensureUUID(m.id) }));

    // Update in-memory state
    const map = new Map<string, RawMaterial>();
    inMemoryRawMaterials.forEach((r) => map.set(r.code.trim().toUpperCase(), r));
    normalizedList.forEach((r) => map.set(r.code.trim().toUpperCase(), r));
    inMemoryRawMaterials = Array.from(map.values());

    // Persist directly to Supabase in batches of 50
    if (isSupabaseConfigured && supabase) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < normalizedList.length; i += CHUNK_SIZE) {
        const chunk = normalizedList.slice(i, i + CHUNK_SIZE);
        const payloads = chunk.map((item) => {
          const itemCode = item.code.trim().toUpperCase();
          return {
            id: ensureUUID(item.id),
            code: itemCode,
            spec_number: item.specNumber || `SP-BB-${itemCode}`,
            name: item.name,
            chemical_name: item.chemicalName || '',
            category: item.category || 'active',
            categories: item.categories || [item.category || 'active'],
            storage_conditions: item.storageConditions || '',
            sds_doc_number: item.sdsDocNumber || '',
            approved_substitutes: item.approvedSubstitutes || [],
            manufacturer: item.manufacturer || '',
            qc_parameters: item.qcParameters || [],
            supplier_lead_time_days: item.supplierLeadTimeDays || 14,
            last_modified_by: item.lastModifiedBy || 'Staff RnD',
            last_modified_at: item.lastModifiedAt || new Date().toISOString(),
          };
        });

        try {
          const { error } = await supabase
            .from('raw_materials')
            .upsert(payloads, { onConflict: 'code' });

          if (error) {
            console.error(`[Supabase Audit] Batch raw materials upsert chunk [${i}..${i + chunk.length}] error:`, error.message);
          }
        } catch (err: any) {
          console.error(`[Supabase Audit] Batch raw materials upsert error at chunk [${i}]:`, err?.message || err);
        }
      }
    }
  },

  deleteMaterial: async (id: string, code?: string): Promise<void> => {
    const validId = ensureUUID(id);
    inMemoryRawMaterials = inMemoryRawMaterials.filter((r) => r.id !== id && r.id !== validId && (!code || r.code !== code));

    if (isSupabaseConfigured && supabase) {
      try {
        const { error: err1 } = await supabase.from('raw_materials').delete().eq('id', validId);
        if (err1) console.error('[Supabase Audit] Delete by id error:', err1);
        if (code) {
          const { error: err2 } = await supabase.from('raw_materials').delete().eq('code', code);
          if (err2) console.error('[Supabase Audit] Delete by code error:', err2);
        }
      } catch (err) {
        console.error('[Supabase Audit] Supabase delete raw material error:', err);
      }
    }
  },

  // Backward compatibility wrapper
  getAllMaterials: async (): Promise<{ data: RawMaterial[] | null; error: string | null }> => {
    const list = await materialService.getMaterials();
    return { data: list, error: null };
  },

  // Sinkronisasi otomatis dua arah untuk bahan dengan INCI sama
  syncMutualSubstitutesByInci: async (
    currentList?: RawMaterial[],
    modifierName = 'Staff RnD'
  ): Promise<{
    success: boolean;
    updatedCount: number;
    groupsCount: number;
    updatedMaterials: RawMaterial[];
    error?: string;
  }> => {
    const list = currentList && currentList.length > 0 ? currentList : await materialService.getMaterials(true);
    if (!list || list.length === 0) {
      return { success: true, updatedCount: 0, groupsCount: 0, updatedMaterials: [] };
    }

    // Helper: Validasi nama INCI bukan strip ('---', '--', '-') atau kosong/placeholder
    const isValidInciName = (val?: string): boolean => {
      if (!val) return false;
      const trimmed = val.trim();
      if (!trimmed) return false;
      if (/^[-–—\s]+$/.test(trimmed)) return false;
      const lower = trimmed.toLowerCase();
      if (['n/a', 'na', 'none', 'tidak ada', 'null', 'undefined'].includes(lower)) return false;
      return true;
    };

    // 1. Grouping hanya untuk bahan dengan nama INCI valid (bukan strip '---')
    const inciMap = new Map<string, RawMaterial[]>();
    for (const rm of list) {
      if (!isValidInciName(rm.chemicalName)) continue;
      const inci = (rm.chemicalName || '').trim().toLowerCase();
      if (!inciMap.has(inci)) {
        inciMap.set(inci, []);
      }
      inciMap.get(inci)!.push(rm);
    }

    let updatedCount = 0;
    let groupsCount = 0;
    const updatedMaterials: RawMaterial[] = [];

    // 2. Hitung substitusi timbal-balik (mutual) untuk setiap bahan
    for (const rm of list) {
      const hasValidInci = isValidInciName(rm.chemicalName);
      const inci = hasValidInci ? (rm.chemicalName || '').trim().toLowerCase() : '';
      const siblings = inci ? (inciMap.get(inci) || []).filter((s) => s.code !== rm.code) : [];

      if (siblings.length > 0) {
        const newSubstituteCodes = Array.from(new Set(siblings.map((s) => s.code.trim().toUpperCase())));
        
        const currentSubCodes = (rm.approvedSubstitutes || []).map((c) => c.trim().toUpperCase()).sort();
        const nextSubCodes = [...newSubstituteCodes].sort();
        const isChanged =
          currentSubCodes.length !== nextSubCodes.length ||
          currentSubCodes.some((val, idx) => val !== nextSubCodes[idx]) ||
          rm.isSingleSpecificMaterial === true;

        if (isChanged) {
          updatedCount++;
          const updatedItem: RawMaterial = {
            ...rm,
            approvedSubstitutes: newSubstituteCodes,
            isSingleSpecificMaterial: false,
            lastModifiedBy: modifierName,
            lastModifiedAt: new Date().toISOString(),
          };
          updatedMaterials.push(updatedItem);
        }
      } else {
        // Bahan tanpa saudara kembar INCI, atau yang INCI-nya '---'/placeholder:
        // Otomatis dianggap sebagai Bahan Tunggal Spesifik (0 Substitusi)
        const needsSingleMark =
          rm.isSingleSpecificMaterial !== true ||
          (rm.approvedSubstitutes && rm.approvedSubstitutes.length > 0);

        if (needsSingleMark) {
          updatedCount++;
          const updatedItem: RawMaterial = {
            ...rm,
            approvedSubstitutes: [],
            isSingleSpecificMaterial: true,
            lastModifiedBy: modifierName,
            lastModifiedAt: new Date().toISOString(),
          };
          updatedMaterials.push(updatedItem);
        }
      }
    }

    for (const [_, items] of inciMap.entries()) {
      if (items.length >= 2) {
        groupsCount++;
      }
    }

    if (updatedMaterials.length > 0) {
      await materialService.saveMaterials(updatedMaterials);
      materialService.invalidateCache();
    }

    return {
      success: true,
      updatedCount,
      groupsCount,
      updatedMaterials,
    };
  },
};
