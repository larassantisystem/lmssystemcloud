import { supabase, isSupabaseConfigured } from '../../../core/auth/supabaseClient';
import { DeviationReport, CapaAction, DeviationStatus } from '../types/deviationTypes';

// In-memory runtime cache untuk efisiensi EGRESS Supabase (BUKAN local storage)
let inMemoryDeviations: DeviationReport[] = [];
let lastDeviationFetchTime = 0;
const DEVIATION_CACHE_TTL_MS = 60 * 1000; // 60 detik cache di RAM

export const deviationService = {
  invalidateCache: () => {
    lastDeviationFetchTime = 0;
  },

  getDeviations: async (forceRefresh = false): Promise<DeviationReport[]> => {
    if (!isSupabaseConfigured || !supabase) {
      console.warn('[deviationService] Supabase not configured.');
      return [];
    }

    const isCacheValid = !forceRefresh && inMemoryDeviations.length > 0 && (Date.now() - lastDeviationFetchTime < DEVIATION_CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryDeviations;
    }

    try {
      const { data, error } = await supabase
        .from('deviations')
        .select('id, deviation_number, title, category, severity, department, target_departments, batch_number, material_code, material_name, description, initiator_name, initiator_nik, status, impacts, root_cause, capa_actions, created_at, updated_at, closed_at, closed_by')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[deviationService] Error fetching deviations from Supabase:', error.message);
        return [];
      }

      if (!data) return [];

      const mapped: DeviationReport[] = data.map((d: any) => {
        let parsedImpacts: any[] = [];
        try {
          parsedImpacts = typeof d.impacts === 'string' ? JSON.parse(d.impacts) : (Array.isArray(d.impacts) ? d.impacts : []);
        } catch {
          parsedImpacts = [];
        }

        let parsedCapa: any[] = [];
        try {
          parsedCapa = typeof d.capa_actions === 'string' ? JSON.parse(d.capa_actions) : (Array.isArray(d.capa_actions) ? d.capa_actions : []);
        } catch {
          parsedCapa = [];
        }

        let parsedTargets: string[] = ['production', 'quality'];
        try {
          parsedTargets = typeof d.target_departments === 'string' ? JSON.parse(d.target_departments) : (Array.isArray(d.target_departments) ? d.target_departments : ['production', 'quality']);
        } catch {
          parsedTargets = ['production', 'quality'];
        }

        let parsedRootCause: any = null;
        try {
          parsedRootCause = typeof d.root_cause === 'string' ? JSON.parse(d.root_cause) : d.root_cause;
        } catch {
          parsedRootCause = null;
        }

        return {
          id: d.id,
          deviationNumber: d.deviation_number,
          title: d.title,
          category: d.category || 'PRODUCTION',
          severity: d.severity || 'MINOR',
          department: d.department || 'production',
          targetDepartments: parsedTargets,
          batchNumber: d.batch_number,
          materialCode: d.material_code,
          materialName: d.material_name,
          description: d.description,
          initiatorName: d.initiator_name || 'User',
          initiatorNik: d.initiator_nik || 'USER',
          status: d.status || 'DRAFT',
          impacts: parsedImpacts,
          rootCause: parsedRootCause,
          capaActions: parsedCapa,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          closedAt: d.closed_at,
          closedBy: d.closed_by,
        };
      });

      inMemoryDeviations = mapped;
      lastDeviationFetchTime = Date.now();
      return mapped;
    } catch (e) {
      console.error('[deviationService] Exception fetching from Supabase:', e);
      return [];
    }
  },

  saveDeviation: async (record: Omit<DeviationReport, 'id' | 'createdAt' | 'updatedAt' | 'deviationNumber'>): Promise<DeviationReport> => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase belum dikonfigurasi untuk menyimpan deviasi secara permanen.');
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '').slice(2);
    let count = 1;
    try {
      const { data: latestDev } = await supabase
        .from('deviations')
        .select('deviation_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestDev && latestDev.length > 0 && latestDev[0].deviation_number) {
        const match = latestDev[0].deviation_number.match(/-(\d+)$/);
        if (match) {
          count = parseInt(match[1], 10) + 1;
        }
      }
    } catch {
      count = Math.floor(Math.random() * 900) + 100;
    }
    const deviationNumber = `DEV-${dateStr}-${String(count).padStart(3, '0')}`;

    const newReport: DeviationReport = {
      ...record,
      id: `dev-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      deviationNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      capaActions: record.capaActions || [],
      impacts: record.impacts || [],
    };

    const payload = {
      id: newReport.id,
      deviation_number: newReport.deviationNumber,
      title: newReport.title,
      category: newReport.category,
      severity: newReport.severity,
      department: newReport.department,
      target_departments: newReport.targetDepartments,
      batch_number: newReport.batchNumber,
      material_code: newReport.materialCode,
      material_name: newReport.materialName,
      description: newReport.description,
      initiator_name: newReport.initiatorName,
      initiator_nik: newReport.initiatorNik,
      status: newReport.status,
      impacts: newReport.impacts,
      root_cause: newReport.rootCause,
      capa_actions: newReport.capaActions,
      created_at: newReport.createdAt,
      updated_at: newReport.updatedAt,
      date: newReport.createdAt.slice(0, 10),
    };

    const { error } = await supabase.from('deviations').insert([payload]);
    if (error) {
      console.error('[deviationService] Insert deviation error:', error.message);
      throw new Error(`Gagal menyimpan ke Supabase: ${error.message}`);
    }

    lastDeviationFetchTime = 0;
    return newReport;
  },

  updateDeviation: async (id: string, updatedData: Partial<DeviationReport>): Promise<DeviationReport> => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase belum dikonfigurasi.');
    }

    const { data: currentList, error: fetchErr } = await supabase
      .from('deviations')
      .select('id, deviation_number, title, category, severity, department, target_departments, batch_number, material_code, material_name, description, initiator_name, initiator_nik, status, impacts, root_cause, capa_actions, created_at, updated_at, closed_at, closed_by')
      .eq('id', id)
      .single();
    if (fetchErr || !currentList) {
      throw new Error('Laporan deviasi tidak ditemukan di database.');
    }

    const updatedAt = new Date().toISOString();
    const payload: Record<string, any> = {
      updated_at: updatedAt,
    };

    if (updatedData.title !== undefined) payload.title = updatedData.title;
    if (updatedData.status !== undefined) payload.status = updatedData.status;
    if (updatedData.impacts !== undefined) payload.impacts = updatedData.impacts;
    if (updatedData.rootCause !== undefined) payload.root_cause = updatedData.rootCause;
    if (updatedData.capaActions !== undefined) payload.capa_actions = updatedData.capaActions;
    if (updatedData.closedAt !== undefined) payload.closed_at = updatedData.closedAt;
    if (updatedData.closedBy !== undefined) payload.closed_by = updatedData.closedBy;

    const { error } = await supabase.from('deviations').update(payload).eq('id', id);
    if (error) {
      console.error('[deviationService] Update deviation error:', error.message);
      throw new Error(`Gagal memperbarui data di Supabase: ${error.message}`);
    }

    lastDeviationFetchTime = 0;

    const updated: DeviationReport = {
      id: currentList.id,
      deviationNumber: currentList.deviation_number,
      title: updatedData.title !== undefined ? updatedData.title : currentList.title,
      category: currentList.category,
      severity: currentList.severity,
      department: currentList.department,
      targetDepartments: currentList.target_departments,
      batchNumber: currentList.batch_number,
      materialCode: currentList.material_code,
      materialName: currentList.material_name,
      description: currentList.description,
      initiatorName: currentList.initiator_name,
      initiatorNik: currentList.initiator_nik,
      status: updatedData.status !== undefined ? updatedData.status : currentList.status,
      impacts: updatedData.impacts !== undefined ? updatedData.impacts : currentList.impacts,
      rootCause: updatedData.rootCause !== undefined ? updatedData.rootCause : currentList.root_cause,
      capaActions: updatedData.capaActions !== undefined ? updatedData.capaActions : currentList.capa_actions,
      createdAt: currentList.created_at,
      updatedAt,
      closedAt: updatedData.closedAt !== undefined ? updatedData.closedAt : currentList.closed_at,
      closedBy: updatedData.closedBy !== undefined ? updatedData.closedBy : currentList.closed_by,
    };

    return updated;
  },

  deleteDeviation: async (id: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase belum dikonfigurasi.');
    }

    const { error } = await supabase.from('deviations').delete().eq('id', id);
    if (error) {
      console.error('[deviationService] Delete error:', error.message);
      throw new Error(`Gagal menghapus data dari Supabase: ${error.message}`);
    }
    lastDeviationFetchTime = 0;
    return true;
  },
};
