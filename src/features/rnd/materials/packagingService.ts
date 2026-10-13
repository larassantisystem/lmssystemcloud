import { supabase, isSupabaseConfigured } from '../../../core/auth/supabaseClient';
import { PackagingMaterial } from '../../../types';
import { ensureUUID } from '../../../utils/uuid';

// In-memory cache untuk performa UI & efisiensi EGRESS Supabase (BUKAN local storage)
let inMemoryPackaging: PackagingMaterial[] = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 menit cache di RAM browser untuk menghemat egress

// Bersihkan data lama jika ada di browser
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    localStorage.removeItem('lsm_packaging_materials_k');
  } catch {
    // ignore
  }
}

export const packagingService = {
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
      const { error } = await supabase.from('packaging_materials').select('id').limit(1);
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
        message: 'Koneksi ke tabel packaging_materials Supabase aktif dan terverifikasi.',
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        message: `Terjadi exception saat koneksi: ${err.message || String(err)}`,
      };
    }
  },

  getLocalPackagingMaterials: (): PackagingMaterial[] => {
    return inMemoryPackaging;
  },

  getPackagingMaterials: async (forceRefresh = false): Promise<PackagingMaterial[]> => {
    const isCacheValid = !forceRefresh && inMemoryPackaging.length > 0 && (Date.now() - lastFetchTime < CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryPackaging;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const allFetchedRows: any[] = [];
        const pageSize = 1000;
        let page = 0;
        let hasMore = true;

        // Auto-batching pagination: mengambil seluruh baris (termasuk >1000 baris) melewati batas PostgREST
        while (hasMore) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from('packaging_materials')
            .select('id, code, spec_number, name, type, unit, unit_capacity_grams, supplier, manufacturer, storage_location, storage_conditions, qc_parameters, reorder_point, last_modified_by, last_modified_at')
            .order('code', { ascending: true })
            .range(from, to);

          if (error) {
            console.warn('[Supabase Audit] Error fetching packaging_materials page', page, error.message);
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
          const mapped: PackagingMaterial[] = allFetchedRows.map((p: any) => ({
            id: p.id,
            code: p.code,
            specNumber: p.spec_number || p.specNumber || `SP-BK-${p.code}`,
            name: p.name,
            type: p.type || 'primary',
            unit: p.unit || 'Pcs',
            unitCapacityGrams: p.unit_capacity_grams ?? p.unitCapacityGrams,
            supplier: p.supplier || p.manufacturer || '',
            manufacturer: p.manufacturer || p.supplier || '',
            storageLocation: p.storage_location || p.storageLocation || '',
            storageConditions: p.storage_conditions || p.storageConditions || '',
            qcParameters: p.qc_parameters || p.qcParameters || [],
            reorderPoint: p.reorder_point ?? p.reorderPoint ?? 100,
            lastModifiedBy: p.last_modified_by || p.lastModifiedBy,
            lastModifiedAt: p.last_modified_at || p.lastModifiedAt,
          }));
          inMemoryPackaging = mapped;
          lastFetchTime = Date.now();
          return mapped;
        }
      } catch (err) {
        console.error('[Supabase Audit] Supabase packaging materials fetch exception:', err);
      }
    }

    return inMemoryPackaging;
  },

  saveSinglePackagingMaterial: async (item: PackagingMaterial): Promise<{ success: boolean; error?: string; updatedId?: string }> => {
    // Ensure ID is a valid UUID for PostgreSQL
    const validId = ensureUUID(item.id);
    const normalizedItem: PackagingMaterial = { ...item, id: validId };

    // Update in-memory state
    const idx = inMemoryPackaging.findIndex((p) => p.id === validId || p.code === normalizedItem.code || p.id === item.id);
    if (idx >= 0) {
      inMemoryPackaging[idx] = normalizedItem;
    } else {
      inMemoryPackaging.unshift(normalizedItem);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const itemCode = normalizedItem.code.trim().toUpperCase();

        // 1. Check if a row already exists in Supabase by `code` or `id`
        let existingId: string | null = null;

        if (itemCode) {
          const { data: byCode, error: errCode } = await supabase
            .from('packaging_materials')
            .select('id')
            .eq('code', itemCode)
            .maybeSingle();
          if (!errCode && byCode?.id) {
            existingId = byCode.id;
          }
        }

        if (!existingId && validId) {
          const { data: byId, error: errId } = await supabase
            .from('packaging_materials')
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
          spec_number: normalizedItem.specNumber || `SP-BK-${itemCode}`,
          name: normalizedItem.name,
          type: normalizedItem.type || 'primary',
          unit: normalizedItem.unit || 'Pcs',
          unit_capacity_grams: normalizedItem.unitCapacityGrams ?? null,
          supplier: normalizedItem.supplier || normalizedItem.manufacturer || '',
          manufacturer: normalizedItem.manufacturer || normalizedItem.supplier || '',
          storage_location: normalizedItem.storageLocation || '',
          storage_conditions: normalizedItem.storageConditions || '',
          qc_parameters: normalizedItem.qcParameters || [],
          reorder_point: normalizedItem.reorderPoint ?? 100,
          last_modified_by: normalizedItem.lastModifiedBy || 'Staff RnD',
          last_modified_at: normalizedItem.lastModifiedAt || new Date().toISOString(),
        };

        if (existingId) {
          // UPDATE existing record
          const { error: updateError } = await supabase
            .from('packaging_materials')
            .update(payload)
            .eq('id', existingId);

          if (updateError) {
            console.error('[Supabase Audit] Error updating packaging_material by ID:', updateError);
            const { error: fallbackError } = await supabase
              .from('packaging_materials')
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
            .from('packaging_materials')
            .insert(payload);

          if (insertError) {
            if (insertError.code === '23505' || insertError.message?.includes('duplicate key')) {
              const { error: retryUpdateError } = await supabase
                .from('packaging_materials')
                .update(payload)
                .eq('code', itemCode);

              if (retryUpdateError) {
                return { success: false, error: `${retryUpdateError.message} (${retryUpdateError.code})` };
              }
              return { success: true, updatedId: resolvedId };
            }
            console.error('[Supabase Audit] Error inserting packaging_material:', insertError);
            return { success: false, error: `${insertError.message} (${insertError.code})` };
          }
          return { success: true, updatedId: resolvedId };
        }
      } catch (err: any) {
        console.error('[Supabase Audit] Exception during packaging_material save:', err);
        return { success: false, error: err.message || String(err) };
      }
    }
    return { success: true };
  },

  savePackagingMaterials: async (materials: PackagingMaterial[]): Promise<void> => {
    if (!materials || materials.length === 0) return;
    const normalizedList = materials.map((p) => ({ ...p, id: ensureUUID(p.id) }));

    // Update in-memory state
    const map = new Map<string, PackagingMaterial>();
    inMemoryPackaging.forEach((p) => map.set(p.code.trim().toUpperCase(), p));
    normalizedList.forEach((p) => map.set(p.code.trim().toUpperCase(), p));
    inMemoryPackaging = Array.from(map.values());

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
            spec_number: item.specNumber || `SP-BK-${itemCode}`,
            name: item.name,
            type: item.type || 'primary',
            unit: item.unit || 'Pcs',
            unit_capacity_grams: item.unitCapacityGrams ?? null,
            supplier: item.supplier || item.manufacturer || '',
            manufacturer: item.manufacturer || item.supplier || '',
            storage_location: item.storageLocation || '',
            storage_conditions: item.storageConditions || '',
            qc_parameters: item.qcParameters || [],
            last_modified_by: item.lastModifiedBy || 'Staff RnD',
            last_modified_at: item.lastModifiedAt || new Date().toISOString(),
          };
        });

        try {
          const { error } = await supabase
            .from('packaging_materials')
            .upsert(payloads, { onConflict: 'code' });

          if (error) {
            console.error(`[Supabase Audit] Batch packaging upsert chunk [${i}..${i + chunk.length}] error:`, error.message);
          }
        } catch (err: any) {
          console.error(`[Supabase Audit] Batch packaging upsert error at chunk [${i}]:`, err?.message || err);
        }
      }
    }
  },

  deletePackagingMaterial: async (id: string, code?: string): Promise<void> => {
    const validId = ensureUUID(id);
    inMemoryPackaging = inMemoryPackaging.filter((p) => p.id !== id && p.id !== validId && (!code || p.code !== code));

    if (isSupabaseConfigured && supabase) {
      try {
        const { error: err1 } = await supabase.from('packaging_materials').delete().eq('id', validId);
        if (err1) console.error('[Supabase Audit] Delete packaging by id error:', err1);
        if (code) {
          const { error: err2 } = await supabase.from('packaging_materials').delete().eq('code', code);
          if (err2) console.error('[Supabase Audit] Delete packaging by code error:', err2);
        }
      } catch (err) {
        console.error('[Supabase Audit] Supabase delete packaging material error:', err);
      }
    }
  },
};
