import { supabase, isSupabaseConfigured } from '../../../core/auth/supabaseClient';
import { PackagingMaterial } from '../../../types';
import { ensureUUID } from '../../../utils/uuid';

// In-memory cache untuk performa UI & efisiensi EGRESS Supabase (BUKAN local storage)
let inMemoryPackaging: PackagingMaterial[] = [];
let lastFetchTime = 0;
let cachedTotalCount: number | null = null;
let lastCountFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 menit cache di RAM browser untuk menghemat egress
const paginatedCache = new Map<string, { timestamp: number; result: any }>();
const detailCache = new Map<string, { timestamp: number; data: PackagingMaterial }>();

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

// Bersihkan data lama jika ada di browser
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    localStorage.removeItem('lsm_packaging_materials_k');
  } catch {
    // ignore
  }
}

export const packagingService = {
  getPackagingMaterialDetail: async (id: string): Promise<PackagingMaterial | null> => {
    if (!id) return null;
    const cached = detailCache.get(id);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

    if (!isSupabaseConfigured || !supabase) {
      return inMemoryPackaging.find(p => p.id === id) || null;
    }

    try {
      const { data, error } = await supabase
        .from('packaging_materials')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        console.error('[packagingService] Error fetching detail:', error);
        return inMemoryPackaging.find(p => p.id === id) || null;
      }

      const fullItem: PackagingMaterial = {
        id: data.id,
        code: data.code,
        specNumber: data.spec_number || data.specNumber || `SP-BK-${data.code}`,
        name: data.name,
        type: data.type || 'primary',
        unit: data.unit || 'Pcs',
        unitCapacityGrams: data.unit_capacity_grams ?? data.unitCapacityGrams,
        supplier: data.supplier || data.manufacturer || '',
        manufacturer: data.manufacturer || data.supplier || '',
        storageLocation: data.storage_location || data.storageLocation || '',
        storageConditions: data.storage_conditions || data.storageConditions || '',
        qcParameters: parseJsonArray(data.qc_parameters || data.qcParameters, []),
        reorderPoint: data.reorder_point ?? data.reorderPoint ?? 100,
        lastModifiedBy: data.last_modified_by || data.lastModifiedBy,
        lastModifiedAt: data.last_modified_at || data.lastModifiedAt,
      };

      detailCache.set(id, { timestamp: Date.now(), data: fullItem });
      return fullItem;
    } catch (err) {
      console.warn('[packagingService] Exception fetching detail:', err);
      return inMemoryPackaging.find(p => p.id === id) || null;
    }
  },

  invalidateCache: () => {
    lastFetchTime = 0;
    cachedTotalCount = null;
    paginatedCache.clear();
    detailCache.clear();
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

  getPackagingMaterialsCount: async (): Promise<number> => {
    if (cachedTotalCount !== null && (Date.now() - lastCountFetchTime < CACHE_TTL_MS)) {
      return cachedTotalCount;
    }
    if (isSupabaseConfigured && supabase) {
      try {
        const { count, error } = await supabase
          .from('packaging_materials')
          .select('id', { count: 'exact', head: true });
        if (!error && typeof count === 'number') {
          cachedTotalCount = count;
          lastCountFetchTime = Date.now();
          return count;
        }
      } catch (err) {
        console.warn('[packagingService] count error:', err);
      }
    }
    return cachedTotalCount ?? inMemoryPackaging.length;
  },

  getPackagingMaterialsPaginated: async (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    type?: string;
  }): Promise<{ items: PackagingMaterial[]; totalCount: number; page: number; pageSize: number; totalPages: number }> => {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, params.pageSize || 50);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const queryTo = from + pageSize; // fetch pageSize + 1 items to check if there is a next page
    const cacheKey = `${page}-${pageSize}-${params.search || ''}-${params.type || 'all'}`;
    const cached = paginatedCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
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
          .from('packaging_materials')
          .select('id, code, spec_number, name, type, unit, unit_capacity_grams, supplier, manufacturer, storage_location, storage_conditions, reorder_point, last_modified_by, last_modified_at');

        if (params.search && params.search.trim()) {
          const s = params.search.trim();
          query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%,supplier.ilike.%${s}%,manufacturer.ilike.%${s}%`);
        }

        if (params.type && params.type !== 'all') {
          query = query.eq('type', params.type);
        }

        query = query.order('code', { ascending: true }).range(from, queryTo);

        const { data, error } = await query;

        if (!error && data) {
          const hasMore = data.length > pageSize;
          const rawItems = hasMore ? data.slice(0, pageSize) : data;
          const mapped: PackagingMaterial[] = rawItems.map((p: any) => ({
            id: p.id,
            code: p.code,
            specNumber: p.spec_number || p.specNumber || `SP-BK-${p.code}`,
            name: p.name,
            type: p.type || 'primary',
            unit: p.unit || 'Pcs',
            unitCapacityGrams: p.unit_capacity_grams ?? p.unitCapacityGrams,
            supplier: p.supplier || p.manufacturer || '',
            manufacturer: p.manufacturer || p.supplier || '',
            storageLocation: p.storage_location || '',
            storageConditions: p.storage_conditions || p.storageConditions || '',
            qcParameters: [],
            reorderPoint: p.reorder_point ?? 100,
            lastModifiedBy: p.last_modified_by,
            lastModifiedAt: p.last_modified_at,
          }));

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
        console.warn('[packagingService] paginated query exception:', err);
      }
    }

    // Fallback in-memory
    let filtered = inMemoryPackaging;
    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s));
    }
    if (params.type && params.type !== 'all') {
      filtered = filtered.filter((p) => p.type === params.type);
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

  searchPackagingMaterials: async (term: string, limit = 20): Promise<Array<{ id: string; code: string; name: string; type: string }>> => {
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('packaging_materials')
          .select('id, code, name, type')
          .order('code', { ascending: true })
          .limit(limit);

        if (term && term.trim()) {
          const s = term.trim();
          query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
        }

        const { data, error } = await query;
        if (!error && data) {
          return data;
        }
      } catch (err) {
        console.warn('[packagingService] search error:', err);
      }
    }
    return inMemoryPackaging
      .filter((p) => !term || p.name.toLowerCase().includes(term.toLowerCase()) || p.code.toLowerCase().includes(term.toLowerCase()))
      .slice(0, limit)
      .map((p) => ({ id: p.id, code: p.code, name: p.name, type: p.type }));
  },

  getBasicPackagingMaterialsPaginated: async (params: {
        page?: number;
        pageSize?: number;
        search?: string;
    }): Promise<{ items: PackagingMaterial[]; totalCount: number; page: number; pageSize: number; totalPages: number }> => {
        const page = Math.max(1, params.page || 1);
        const pageSize = Math.max(1, params.pageSize || 50);
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        if (isSupabaseConfigured && supabase) {
            try {
                let query = supabase
                    .from('packaging_materials')
                    .select('id, code, name');
                if (params.search && params.search.trim()) {
                    const s = params.search.trim();
                    query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
                }
                query = query.order('code', { ascending: true }).range(from, to);
                const { data, error } = await query;
                if (!error && data) {
                    const mapped: PackagingMaterial[] = data.map((p: any) => ({
                        id: p.id,
                        code: p.code,
                        name: p.name,
                        specNumber: '',
                        type: 'primary',
                        unit: 'Pcs',
                        storageConditions: '',
                        qcParameters: [],
                    } as PackagingMaterial));
                    return {
                        items: mapped,
                        totalCount: 0,
                        page,
                        pageSize,
                        totalPages: 1,
                    };
                }
            } catch (err) {
                console.warn('[packagingService] basic query error:', err);
            }
        }
        return { items: [], totalCount: 0, page, pageSize, totalPages: 1 };
    },

  getPackagingMaterials: async (forceRefresh = false): Promise<PackagingMaterial[]> => {
    const isCacheValid = !forceRefresh && inMemoryPackaging.length > 0 && (Date.now() - lastFetchTime < CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryPackaging;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        let allData: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const { data, error } = await supabase
            .from('packaging_materials')
            .select('id, code, spec_number, name, type, unit, unit_capacity_grams, supplier, manufacturer, storage_conditions')
            .order('code', { ascending: true })
            .range(from, to);

          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            allData = allData.concat(data);
            if (data.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          }
        }

        if (allData.length > 0) {
          const mapped: PackagingMaterial[] = allData.map((p: any) => ({
            id: p.id,
            code: p.code,
            specNumber: p.spec_number || p.specNumber || `SP-BK-${p.code}`,
            name: p.name,
            type: p.type || 'primary',
            unit: p.unit || 'Pcs',
            unitCapacityGrams: p.unit_capacity_grams ?? p.unitCapacityGrams,
            supplier: p.supplier || p.manufacturer || '',
            manufacturer: p.manufacturer || p.supplier || '',
            storageLocation: p.storage_location || '',
            storageConditions: p.storage_conditions || p.storageConditions || '',
            qcParameters: [],
            reorderPoint: p.reorder_point ?? 100,
            lastModifiedBy: p.last_modified_by,
            lastModifiedAt: p.last_modified_at,
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
    packagingService.invalidateCache();
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
    packagingService.invalidateCache();
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
    packagingService.invalidateCache();
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
