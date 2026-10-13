import { GrnRecord, GrnStats, GrnPaginatedQuery, GrnPaginatedResponse } from './types/grnTypes';
import { supabase, isSupabaseConfigured } from '../../core/auth/supabaseClient';
import { calculateSamplingPlan } from '../quality/utils/milStd105e';
import { packGrnNotes, unpackGrnNotes } from '../../core/utils/qcStorageSync';
import { generateLotInternalNumber, normalizeLotNumber, calculateAutoRetestDate } from '../quality/utils/qcNumbering';
import { formatToIsoDateString } from '../../core/utils/dateUtils';
import { authService } from '../../core/auth/authService';

const WAREHOUSE_GRN_STORAGE_KEY = 'lsm_warehouse_grn_v1';

const defaultGrnRecords: GrnRecord[] = [];

// In-memory runtime cache untuk efisiensi EGRESS (BUKAN local storage)
let inMemoryGrnRecords: GrnRecord[] = [];
let lastGrnFetchTime = 0;
const GRN_CACHE_TTL_MS = 45 * 1000; // 45 detik cache di RAM

// In-memory runtime cache per kueri paginasi
const paginatedGrnCache = new Map<string, { timestamp: number; data: GrnPaginatedResponse }>();
const PAGINATED_CACHE_TTL_MS = 30 * 1000; // 30 detik cache di RAM

const knownMissingColumns = new Set<string>();

/**
 * Builds standard Supabase payload conforming to the primary warehouse_grn schema
 * with snake_case column names (supplier_batch_number, purchase_order_number, expiration_date).
 */
function buildPrimarySupabasePayload(record: GrnRecord): Record<string, any> {
  const normalizedReceivedDate = formatToIsoDateString(record.receivedDate);
  const dateParts = normalizedReceivedDate.split('-');
  const yy = dateParts[0].length === 4 ? dateParts[0].slice(2) : dateParts[0];
  const mm = (dateParts[1] || '01').padStart(2, '0');
  const typeCode = record.materialType === 'raw' ? 'BB' : 'BK';
  const lotCode = `L${typeCode}${yy}${mm}001`;

  // Default expiration date if not set (packaging or materials with long shelf life)
  let expDate = record.expiryDate;
  if (!expDate) {
    const rDate = new Date(normalizedReceivedDate);
    rDate.setFullYear(rDate.getFullYear() + 2);
    expDate = rDate.toISOString().slice(0, 10);
  }
  const normalizedExpDate = formatToIsoDateString(expDate);

  const autoRetestDate = record.materialType === 'raw'
    ? (record.retestDate || calculateAutoRetestDate('raw', normalizedExpDate, normalizedReceivedDate))
    : null;
  const normalizedRetestDate = autoRetestDate ? formatToIsoDateString(autoRetestDate) : null;

  const rawQcStatus = (record.qcStatus as string) || 'QUARANTINE';
  const mappedQcStatus = (rawQcStatus === 'RELEASED' || rawQcStatus === 'RELEASE_DEVIATION') ? 'PASSED' : rawQcStatus;

  const payload: Record<string, any> = {
    grn_number: record.grnNumber,
    material_type: record.materialType === 'packaging' ? 'packaging' : 'raw',
    material_id: record.materialId || null,
    material_code: record.materialCode,
    material_name: record.materialName,
    delivery_note_number: record.deliveryNoteNumber || '-',
    purchase_order_number: record.poNumber || (record as any).purchaseOrderNumber || '-',
    supplier_batch_number: record.batchNumber || (record as any).supplierBatchNumber || '-',
    internal_lot_number: record.internalLotNumber || (record as any).internal_lot_number || lotCode,
    received_date: normalizedReceivedDate,
    expiration_date: normalizedExpDate,
    retest_date: normalizedRetestDate,
    quantity_received: Number(record.quantityReceived) || 0,
    unit: record.unit || 'kg',
    container_count: Number(record.containerCount) || 1,
    container_type: record.containerType || 'Drum / Zak',
    distributor: record.distributor || '-',
    manufacturer: record.manufacturer || '-',
    storage_location: record.storageLocation || 'Gudang Karantina',
    storage_conditions: record.storageConditions || null,
    qc_status: mappedQcStatus,
    qc_parameters_count: Number(record.qcParametersCount) || 0,
    seal_condition: ['intact', 'broken', 'tampered'].includes(record.sealCondition as string)
      ? record.sealCondition
      : 'intact',
    packaging_condition: ['clean', 'damaged', 'wet', 'contaminated'].includes(record.packagingCondition as string)
      ? record.packagingCondition
      : 'clean',
    coa_attachment: record.coaAttachment || null,
    received_by: record.receivedBy || 'Staf Gudang',
    received_by_nik: (record as any).receivedByNik || 'NIK-WH-001',
    notes: packGrnNotes(record.notes, record.qcPayload) || null,
  };

  // Conditionally include optional physical columns if they have values and are not known to be absent
  if (record.revertReason && !knownMissingColumns.has('revert_reason')) payload.revert_reason = record.revertReason;
  if (record.revertedBy && !knownMissingColumns.has('reverted_by')) payload.reverted_by = record.revertedBy;
  if (record.revertedAt && !knownMissingColumns.has('reverted_at')) payload.reverted_at = record.revertedAt;
  if (record.actualSampleSize !== undefined && record.actualSampleSize !== null && !knownMissingColumns.has('actual_sample_size')) {
    payload.actual_sample_size = Number(record.actualSampleSize);
  }
  if (record.actualSampleUnit && !knownMissingColumns.has('actual_sample_unit')) payload.actual_sample_unit = record.actualSampleUnit;
  if (record.sampledContainers && !knownMissingColumns.has('sampled_containers')) payload.sampled_containers = record.sampledContainers;
  if (record.sampledBy && !knownMissingColumns.has('sampled_by')) payload.sampled_by = record.sampledBy;
  if (record.samplingDateTime && !knownMissingColumns.has('sampling_date_time')) payload.sampling_date_time = record.samplingDateTime;
  if (record.coaDriveFileId && !knownMissingColumns.has('coa_drive_file_id')) payload.coa_drive_file_id = record.coaDriveFileId;
  if (record.coaDriveViewLink && !knownMissingColumns.has('coa_drive_view_link')) payload.coa_drive_view_link = record.coaDriveViewLink;

  const resolvedCurrentQty = Number(
    record.currentQuantity !== undefined
      ? record.currentQuantity
      : (record.qcPayload?.currentQuantity !== undefined
          ? record.qcPayload.currentQuantity
          : record.quantityReceived)
  );
  if (!isNaN(resolvedCurrentQty) && !knownMissingColumns.has('current_quantity')) {
    payload.current_quantity = resolvedCurrentQty;
  }

  return payload;
}

/**
 * Adaptive execution helper that catches PostgREST schema cache errors (PGRST204)
 * or Postgres column mismatch errors (42703), strips the non-existent column,
 * swaps column aliases when needed, and retries automatically.
 */
async function executeWithSchemaAdaptiveRetry(
  tableName: string,
  initialPayload: Record<string, any>,
  record: GrnRecord,
  mode: 'insert' | 'upsert'
): Promise<{ data: any; error: any }> {
  const payload = { ...initialPayload };
  // Remove any previously identified missing columns
  for (const col of knownMissingColumns) {
    delete payload[col];
  }

  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    attempts++;
    let result: { data: any; error: any };

    if (mode === 'insert') {
      result = await supabase!.from(tableName).insert(payload).select('id, grn_number').single();
    } else {
      result = await supabase!.from(tableName).upsert(payload, { onConflict: 'grn_number' }).select('id, grn_number').single();
    }

    if (!result.error) {
      return result;
    }

    const error = result.error;
    const errMsg = error.message || '';

    // Handle check constraint error (code 23514: e.g. warehouse_grn_qc_status_check)
    if (
      error.code === '23514' ||
      errMsg.toLowerCase().includes('check constraint') ||
      errMsg.includes('warehouse_grn_qc_status_check')
    ) {
      console.warn(
        `[warehouseService] Check constraint violation on 'qc_status' ('${payload.qc_status}'). Applying adaptive status mapping (Attempt ${attempts})...`
      );
      const currentStatus = String(payload.qc_status || '').toUpperCase();
      if (currentStatus === 'RELEASED' || currentStatus === 'RELEASE_DEVIATION' || currentStatus === 'PASSED_WITH_DEVIATION') {
        payload.qc_status = 'PASSED';
      } else if (currentStatus === 'PASSED') {
        payload.qc_status = 'RELEASED';
      } else if (
        currentStatus === 'QUALITY_CONTROL_PROCESS' ||
        currentStatus === 'AWAITING_QM_AUTHORIZATION' ||
        currentStatus === 'REVERTED_TO_WAREHOUSE'
      ) {
        payload.qc_status = 'QUARANTINE';
      } else {
        payload.qc_status = 'QUARANTINE';
      }
      continue;
    }

    const isMissingColumn =
      error.code === 'PGRST204' ||
      error.code === '42703' ||
      errMsg.toLowerCase().includes('column') ||
      errMsg.includes('schema cache');

    if (!isMissingColumn) {
      return result;
    }

    // Extract column name from error:
    // e.g. "Could not find the 'batch_number' column of 'warehouse_grn' in the schema cache"
    const match =
      errMsg.match(/Could not find the ['"]([^'"]+)['"] column/i) ||
      errMsg.match(/column ['"]([^'"]+)['"]/i) ||
      errMsg.match(/['"]([^'"]+)['"] column/i);

    if (match && match[1]) {
      const missingCol = match[1];
      knownMissingColumns.add(missingCol);
      console.warn(`[warehouseService] Column '${missingCol}' not in Supabase schema. Adjusting payload (Attempt ${attempts})...`);
      delete payload[missingCol];

      // Handle common column alias swaps
      if (missingCol === 'supplier_batch_number' && !payload.batch_number && !knownMissingColumns.has('batch_number')) {
        payload.batch_number = record.batchNumber || '-';
      } else if (missingCol === 'purchase_order_number' && !payload.po_number && !knownMissingColumns.has('po_number')) {
        payload.po_number = record.poNumber || '-';
      } else if (missingCol === 'expiration_date' && !payload.expiry_date && !knownMissingColumns.has('expiry_date')) {
        payload.expiry_date = record.expiryDate || record.receivedDate;
      } else if (missingCol === 'batch_number' && !payload.supplier_batch_number && !knownMissingColumns.has('supplier_batch_number')) {
        payload.supplier_batch_number = record.batchNumber || '-';
      } else if (missingCol === 'po_number' && !payload.purchase_order_number && !knownMissingColumns.has('purchase_order_number')) {
        payload.purchase_order_number = record.poNumber || '-';
      } else if (missingCol === 'expiry_date' && !payload.expiration_date && !knownMissingColumns.has('expiration_date')) {
        payload.expiration_date = record.expiryDate || record.receivedDate;
      }
    } else {
      return result;
    }
  }

  // Final fallback attempt with basic essential payload
  const fallbackPayload: Record<string, any> = {
    grn_number: record.grnNumber,
    material_type: record.materialType === 'packaging' ? 'packaging' : 'raw',
    material_code: record.materialCode,
    material_name: record.materialName,
    received_date: record.receivedDate || new Date().toISOString().slice(0, 10),
    quantity_received: Number(record.quantityReceived) || 0,
    unit: record.unit || 'kg',
    qc_status: ((record.qcStatus as string) === 'RELEASED' || (record.qcStatus as string) === 'RELEASE_DEVIATION') ? 'PASSED' : (record.qcStatus || 'QUARANTINE'),
    notes: packGrnNotes(record.notes, record.qcPayload) || null,
  };

  if (mode === 'insert') {
    return await supabase!.from(tableName).insert(fallbackPayload).select('id, grn_number').single();
  } else {
    return await supabase!.from(tableName).upsert(fallbackPayload, { onConflict: 'grn_number' }).select('id, grn_number').single();
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number = 2500): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Database query timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function mapDbRowToGrnRecord(d: any): GrnRecord {
  const { userNotes, qcPayload } = unpackGrnNotes(d.notes);
  const unnormalizedLot = d.internal_lot_number || d.internalLotNumber || '';
  const normalizedLot = normalizeLotNumber(unnormalizedLot, d.received_date || d.receivedDate);

  const isOpnameGrn =
    (d.grn_number || '').startsWith('GRN-OPNAME-') ||
    (d.batch_number || '') === 'STK-OPNAME' ||
    (d.manufacturer || '') === 'Stock Opname Adjustment';

  const rawDbStatus = String(d.qc_status || d.qcStatus || '').toUpperCase();
  const payloadStatus = qcPayload?.status ? String(qcPayload.status).toUpperCase() : '';

  let resolvedQcStatus = 'QUARANTINE';
  if (isOpnameGrn) {
    resolvedQcStatus = 'RELEASED';
  } else if (payloadStatus === 'REVERTED_TO_WAREHOUSE' || Boolean(d.revert_reason || d.revertReason || (d.notes && d.notes.includes('REVERTED_TO_WAREHOUSE')))) {
    resolvedQcStatus = 'REVERTED_TO_WAREHOUSE';
  } else if (payloadStatus && payloadStatus !== 'QUARANTINE') {
    resolvedQcStatus = payloadStatus === 'PASSED' ? 'RELEASED' : payloadStatus;
  } else if (rawDbStatus === 'PASSED' || rawDbStatus === 'RELEASED') {
    resolvedQcStatus = 'RELEASED';
  } else if (rawDbStatus === 'REJECTED') {
    resolvedQcStatus = 'REJECTED';
  } else {
    resolvedQcStatus = d.qc_status || d.qcStatus || 'QUARANTINE';
  }

  let coaAtt = d.coa_attachment || d.coaAttachment || qcPayload?.coaAttachment || '';
  let driveFileId = (d as any).coa_drive_file_id || d.coaDriveFileId || qcPayload?.coaDriveFileId;
  let driveViewLink = (d as any).coa_drive_view_link || d.coaDriveViewLink || qcPayload?.coaDriveViewLink;

  // Auto-parse if coa_attachment contains a Drive link or JSON metadata
  if (coaAtt && typeof coaAtt === 'string') {
    if (coaAtt.startsWith('{') && coaAtt.endsWith('}')) {
      try {
        const parsed = JSON.parse(coaAtt);
        if (parsed.fileId) driveFileId = parsed.fileId;
        if (parsed.viewLink) driveViewLink = parsed.viewLink;
        if (parsed.fileName) coaAtt = parsed.fileName;
      } catch (_) {}
    } else if (coaAtt.includes('drive.google.com/file/d/')) {
      const match = coaAtt.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        driveFileId = match[1];
        driveViewLink = coaAtt;
      }
    }
  }

  return {
    id: d.id,
    grnNumber: d.grn_number || d.grnNumber,
    internalLotNumber: normalizedLot,
    materialType: d.material_type || d.materialType || 'raw',
    materialId: d.material_id || d.materialId || '',
    materialCode: d.material_code || d.materialCode,
    materialName: d.material_name || d.materialName,
    manufacturer: d.manufacturer || '-',
    distributor: d.distributor || '-',
    poNumber: d.purchase_order_number || d.po_number || d.poNumber || '-',
    deliveryNoteNumber: d.delivery_note_number || d.deliveryNoteNumber || '-',
    batchNumber: d.supplier_batch_number || d.batch_number || d.batchNumber || '-',
    receivedDate: d.received_date || d.receivedDate,
    expiryDate: d.expiration_date || d.expiry_date || d.expiryDate,
    retestDate:
      d.retest_date ||
      d.retestDate ||
      qcPayload?.retestDate ||
      ((d.material_type || d.materialType || 'raw') === 'raw'
        ? calculateAutoRetestDate('raw', d.expiration_date || d.expiry_date || d.expiryDate, d.received_date || d.receivedDate)
        : undefined),
    quantityReceived: Number(d.quantity_received || d.quantityReceived || 0),
    currentQuantity: d.current_quantity !== undefined && d.current_quantity !== null
      ? Number(d.current_quantity)
      : (qcPayload?.currentQuantity !== undefined
          ? Number(qcPayload.currentQuantity)
          : Number(d.quantity_received || d.quantityReceived || 0)),
    unit: d.unit || 'kg',
    containerCount: Number(d.container_count || d.containerCount || 1),
    containerType: d.container_type || d.containerType || 'Drum / Zak',
    storageLocation: d.storage_location || d.storageLocation || 'Gudang Karantina',
    storageConditions: d.storage_conditions || d.storageConditions,
    qcStatus: resolvedQcStatus as any,
    qcParametersCount: Number(d.qc_parameters_count || d.qcParametersCount || 0),
    receivedBy: d.received_by || d.receivedBy || 'Staf Gudang',
    createdAt: d.created_at || d.createdAt || new Date().toISOString(),
    notes: userNotes,
    qcPayload: qcPayload || undefined,
    revertReason: d.revert_reason || d.revertReason || qcPayload?.revertReason,
    revertedBy: d.reverted_by || d.revertedBy || qcPayload?.revertedBy,
    revertedAt: d.reverted_at || d.revertedAt || qcPayload?.revertedAt,
    actualSampleSize: d.actual_sample_size !== undefined && d.actual_sample_size !== null
      ? Number(d.actual_sample_size)
      : (qcPayload?.actualSampleSize !== undefined ? qcPayload.actualSampleSize : d.actualSampleSize),
    actualSampleUnit: d.actual_sample_unit || qcPayload?.actualSampleUnit || d.actualSampleUnit,
    sampledContainers: d.sampled_containers || qcPayload?.sampledContainers || d.sampledContainers,
    sampledBy: d.sampled_by || qcPayload?.sampledBy || d.sampledBy,
    samplingDateTime: d.sampling_date_time || qcPayload?.samplingDateTime || d.samplingDateTime,
    sealCondition: d.seal_condition,
    packagingCondition: d.packaging_condition,
    coaAttachment: coaAtt || undefined,
    coaDriveFileId: driveFileId || undefined,
    coaDriveViewLink: driveViewLink || undefined,
  };
}

export const warehouseService = {
  /**
   * Audit Supabase connection and table status
   */
  auditDatabaseStatus: async (): Promise<{
    isConfigured: boolean;
    tableExists: boolean;
    supabaseCount: number;
    localCount: number;
    error: string | null;
  }> => {
    const local = warehouseService.getLocalRecords();
    if (!isSupabaseConfigured || !supabase) {
      return {
        isConfigured: false,
        tableExists: false,
        supabaseCount: 0,
        localCount: local.length,
        error: 'Supabase URL atau Anon Key belum dikonfigurasi pada environment variable.',
      };
    }

    try {
      const { count, error } = await supabase
        .from('warehouse_grn')
        .select('id', { count: 'exact', head: true });

      if (error) {
        return {
          isConfigured: true,
          tableExists: false,
          supabaseCount: 0,
          localCount: local.length,
          error: `[${error.code}] ${error.message}`,
        };
      }

      return {
        isConfigured: true,
        tableExists: true,
        supabaseCount: count ?? 0,
        localCount: local.length,
        error: null,
      };
    } catch (err: any) {
      return {
        isConfigured: true,
        tableExists: false,
        supabaseCount: 0,
        localCount: local.length,
        error: err.message || String(err),
      };
    }
  },

  /**
   * Audit tabel public.stock_movements di Supabase (Opsi 2)
   */
  auditStockMovementsStatus: async (): Promise<{
    isConfigured: boolean;
    tableExists: boolean;
    movementsCount: number;
    error: string | null;
  }> => {
    if (!isSupabaseConfigured || !supabase) {
      return {
        isConfigured: false,
        tableExists: false,
        movementsCount: 0,
        error: 'Supabase URL atau Anon Key belum terkonfigurasi.',
      };
    }
    try {
      const { count, error } = await supabase
        .from('stock_movements')
        .select('id', { count: 'exact', head: true });

      if (error) {
        return {
          isConfigured: true,
          tableExists: false,
          movementsCount: 0,
          error: `[${error.code}] ${error.message}`,
        };
      }
      return {
        isConfigured: true,
        tableExists: true,
        movementsCount: count ?? 0,
        error: null,
      };
    } catch (err: any) {
      return {
        isConfigured: true,
        tableExists: false,
        movementsCount: 0,
        error: err.message || String(err),
      };
    }
  },

  /**
   * Sync all local records to Supabase table
   */
  syncLocalToSupabase: async (): Promise<{
    syncedCount: number;
    failedCount: number;
    error?: string;
  }> => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase belum terkonfigurasi.');
    }

    const localRecords = warehouseService.getLocalRecords();
    if (localRecords.length === 0) {
      return { syncedCount: 0, failedCount: 0 };
    }

    let syncedCount = 0;
    let failedCount = 0;
    let lastErr = '';

    for (const record of localRecords) {
      const initialPayload = buildPrimarySupabasePayload(record);
      const { error } = await executeWithSchemaAdaptiveRetry(
        'warehouse_grn',
        initialPayload,
        record,
        'upsert'
      );

      if (error) {
        failedCount++;
        lastErr = `[${error.code}] ${error.message}`;
      } else {
        syncedCount++;
      }
    }

    return { syncedCount, failedCount, error: lastErr || undefined };
  },

  /**
   * Helper to retrieve localStorage records safely
   */
  getLocalRecords: (): GrnRecord[] => {
    // Explicitly do not read from local storage anymore as per mandate. Always return empty array.
    return [];
  },

  invalidateCache: () => {
    lastGrnFetchTime = 0;
  },

  getGrnRecords: async (forceRefresh = false): Promise<GrnRecord[]> => {
    const isCacheValid = !forceRefresh && inMemoryGrnRecords.length > 0 && (Date.now() - lastGrnFetchTime < GRN_CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryGrnRecords;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        let { data, error } = await withTimeout(
          supabase
            .from('warehouse_grn')
            .select('id, grn_number, material_type, material_id, material_code, material_name, manufacturer, distributor, delivery_note_number, purchase_order_number, po_number, supplier_batch_number, batch_number, internal_lot_number, received_date, expiration_date, expiry_date, retest_date, quantity_received, current_quantity, unit, container_count, container_type, storage_location, storage_conditions, qc_status, qc_parameters_count, seal_condition, packaging_condition, coa_attachment, received_by, notes, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(100),
          5000
        );

        if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
          const fallbackRes = await supabase
            .from('warehouse_grn')
            .select('id, grn_number, material_type, material_code, material_name, internal_lot_number, received_date, quantity_received, unit, qc_status, notes, created_at')
            .order('created_at', { ascending: false })
            .limit(100);
          data = fallbackRes.data;
          error = fallbackRes.error;
        }

        if (!error && data && data.length > 0) {
          const mapped: GrnRecord[] = data
            .filter((d: any) => d.grn_number !== 'SYSTEM-STOCK-LEDGER')
            .map(mapDbRowToGrnRecord);

          inMemoryGrnRecords = mapped;
          lastGrnFetchTime = Date.now();
          return mapped;
        } else if (error) {
          console.warn('[warehouseService] Supabase GRN query warning:', error.message);
        }
      } catch (err) {
        console.warn('[warehouseService] Supabase GRN fetch error:', err);
      }
    }

    return inMemoryGrnRecords;
  },

  /**
   * Server-Side Pagination untuk tabel Penerimaan Barang (GRN).
   * Menarik hanya sejumlah halaman (misal 25 baris) dari Supabase (.range(from, to))
   * dan menghitung total baris akurat menggunakan { count: 'exact' } untuk efisiensi maksimal Egress.
   */
  getGrnRecordsPaginated: async (params: GrnPaginatedQuery = {}): Promise<GrnPaginatedResponse> => {
    const {
      page = 1,
      pageSize = 25,
      materialType = 'all',
      status = 'ALL',
      search = '',
      forceRefresh = false,
    } = params;

    const cacheKey = `${page}_${pageSize}_${materialType}_${status}_${search.trim().toLowerCase()}`;
    const cached = paginatedGrnCache.get(cacheKey);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < PAGINATED_CACHE_TTL_MS)) {
      return cached.data;
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('warehouse_grn')
          .select('id, grn_number, material_type, material_id, material_code, material_name, manufacturer, distributor, delivery_note_number, purchase_order_number, po_number, supplier_batch_number, batch_number, internal_lot_number, received_date, expiration_date, expiry_date, retest_date, quantity_received, current_quantity, unit, container_count, container_type, storage_location, storage_conditions, qc_status, qc_parameters_count, seal_condition, packaging_condition, coa_attachment, received_by, notes, created_at, updated_at', { count: 'exact' });

        if (materialType && materialType !== 'all') {
          query = query.eq('material_type', materialType);
        }

        if (status && status !== 'ALL') {
          if (status === 'PASSED' || status === 'RELEASED') {
            query = query.in('qc_status', ['PASSED', 'RELEASED', 'PASSED_WITH_DEVIATION']);
          } else if (status === 'REVERTED_TO_WAREHOUSE') {
            query = query.or('qc_status.eq.REVERTED_TO_WAREHOUSE,notes.ilike.%REVERTED_TO_WAREHOUSE%');
          } else if (status === 'QUARANTINE') {
            query = query.eq('qc_status', 'QUARANTINE').not('notes', 'ilike', '%REVERTED_TO_WAREHOUSE%');
          } else {
            query = query.eq('qc_status', status);
          }
        }

        if (search && search.trim()) {
          const q = search.trim();
          query = query.or(`grn_number.ilike.%${q}%,material_code.ilike.%${q}%,material_name.ilike.%${q}%,distributor.ilike.%${q}%,supplier_batch_number.ilike.%${q}%,batch_number.ilike.%${q}%,internal_lot_number.ilike.%${q}%`);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(from, to);

        if (!error && data) {
          let records: GrnRecord[] = data
            .filter((d: any) => d.grn_number !== 'SYSTEM-STOCK-LEDGER')
            .map(mapDbRowToGrnRecord);

          if (status === 'REVERTED_TO_WAREHOUSE') {
            records = records.filter((r) => r.qcStatus === 'REVERTED_TO_WAREHOUSE');
          } else if (status === 'QUARANTINE') {
            records = records.filter((r) => r.qcStatus === 'QUARANTINE');
          }

          const totalItems = count !== null && count !== undefined
            ? (status === 'REVERTED_TO_WAREHOUSE' || status === 'QUARANTINE' ? records.length : count)
            : records.length;
          const totalPages = Math.ceil(totalItems / pageSize) || 1;
          const result: GrnPaginatedResponse = {
            records,
            totalItems,
            totalPages,
            page,
            pageSize,
          };

          paginatedGrnCache.set(cacheKey, { timestamp: Date.now(), data: result });
          return result;
        }
      } catch (err) {
        console.warn('[warehouseService] Paginated fetch notice:', err);
      }
    }

    // Fallback dari memori cache
    let list = inMemoryGrnRecords.length > 0 ? inMemoryGrnRecords : await warehouseService.getGrnRecords();
    if (materialType && materialType !== 'all') {
      list = list.filter((r) => r.materialType === materialType);
    }
    if (status && status !== 'ALL') {
      if (status === 'PASSED' || status === 'RELEASED') {
        list = list.filter((r) => r.qcStatus === 'PASSED' || r.qcStatus === 'RELEASED' || r.qcStatus === 'PASSED_WITH_DEVIATION');
      } else {
        list = list.filter((r) => r.qcStatus === status);
      }
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        r.grnNumber.toLowerCase().includes(q) ||
        r.materialCode.toLowerCase().includes(q) ||
        r.materialName.toLowerCase().includes(q) ||
        r.distributor.toLowerCase().includes(q) ||
        (r.batchNumber && r.batchNumber.toLowerCase().includes(q))
      );
    }
    const totalItems = list.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const sliced = list.slice(from, to + 1);

    const fallbackResult: GrnPaginatedResponse = {
      records: sliced,
      totalItems,
      totalPages,
      page,
      pageSize,
    };
    return fallbackResult;
  },

  saveGrnRecord: async (
    record: Omit<GrnRecord, 'id' | 'createdAt'> & { grnNumber?: string }
  ): Promise<GrnRecord> => {
    const existing = await warehouseService.getGrnRecords();

    // Format: GRN-BB-YYMMDD-XX atau GRN-BK-YYMMDD-XX
    const dateParts = (record.receivedDate || new Date().toISOString().slice(0, 10)).split('-');
    const yy = dateParts[0].length === 4 ? dateParts[0].slice(2) : dateParts[0];
    const mm = (dateParts[1] || '01').padStart(2, '0');
    const dd = (dateParts[2] || '01').padStart(2, '0');
    const dateCode = `${yy}${mm}${dd}`;

    const typePrefix = record.materialType === 'raw' ? 'GRN-BB' : 'GRN-BK';
    const targetPrefix = `${typePrefix}-${dateCode}-`;

    let maxSeq = 0;
    existing.forEach((r) => {
      if (r.grnNumber && r.grnNumber.startsWith(targetPrefix)) {
        const parts = r.grnNumber.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    });

    let grnNumber = record.grnNumber;
    if (!grnNumber) {
      const nextSeq = String(maxSeq + 1).padStart(2, '0');
      grnNumber = `${targetPrefix}${nextSeq}`;
    }

    const internalLotNumber = normalizeLotNumber(
      record.internalLotNumber?.trim() ||
      generateLotInternalNumber(record.materialType, existing, record.receivedDate)
    );

    const newRecord: GrnRecord = {
      ...record,
      id: `grn-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      grnNumber,
      internalLotNumber,
      currentQuantity: record.currentQuantity !== undefined ? Number(record.currentQuantity) : Number(record.quantityReceived),
      createdAt: new Date().toISOString(),
    };

    // Save to Supabase if configured with schema adaptive retry
    if (isSupabaseConfigured && supabase) {
      let insertAttempts = 0;
      let currentGrnNumber = grnNumber;
      let currentMaxSeq = maxSeq;

      while (insertAttempts < 5) {
        insertAttempts++;
        try {
          const newRecordWithGrn = { ...newRecord, grnNumber: currentGrnNumber };
          const initialPayload = buildPrimarySupabasePayload(newRecordWithGrn);
          const { data, error } = await executeWithSchemaAdaptiveRetry(
            'warehouse_grn',
            initialPayload,
            newRecordWithGrn,
            'insert'
          );

          if (error) {
            if (error.code === '23505' || error.message?.includes('duplicate key value')) {
              // Duplicate GRN Number, increment seq and retry
              if (record.grnNumber) {
                 // If explicitly provided, just append a random string to avoid targetPrefix reset
                 currentGrnNumber = `${record.grnNumber}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
              } else {
                 currentMaxSeq++;
                 currentGrnNumber = `${targetPrefix}${String(currentMaxSeq + 1).padStart(2, '0')}`;
              }
              continue;
            }
            console.error('[warehouseService] Supabase insert error:', error);
            throw new Error(`Gagal menyimpan ke database: ${error.message}`);
          } else if (data && data.id) {
            newRecord.id = data.id;
            newRecord.grnNumber = currentGrnNumber;
            console.log('[warehouseService] Sukses menyimpan GRN ke Supabase ID:', data.id);
            break;
          }
        } catch (err: any) {
          console.error('[warehouseService] Supabase GRN insert exception:', err);
          if (insertAttempts >= 5) {
            throw err;
          }
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('warehouse_grn_updated', { detail: { id: newRecord.id, record: newRecord } }));
    }

    // Perbarui in-memory cache secara langsung (0 byte tambahan egress)
    inMemoryGrnRecords = [newRecord, ...inMemoryGrnRecords.filter((r) => r.id !== newRecord.id && r.grnNumber !== newRecord.grnNumber)];
    lastGrnFetchTime = Date.now();
    paginatedGrnCache.clear();

    return newRecord;
  },

  updateGrnRecord: async (
    id: string,
    updatedData: Partial<GrnRecord>
  ): Promise<GrnRecord> => {
    const existing = await warehouseService.getGrnRecords();
    let index = existing.findIndex(
      (item) =>
        item.id === id ||
        item.grnNumber === id ||
        (item.internalLotNumber && item.internalLotNumber === id) ||
        id === `qc-rep-${item.id}` ||
        (item.id && id.endsWith(item.id)) ||
        (updatedData.grnNumber && item.grnNumber === updatedData.grnNumber)
    );

    if (index === -1) {
      console.warn('[warehouseService] Catatan GRN tidak ditemukan secara langsung dengan ID:', id);
      if (updatedData.grnNumber) {
        index = existing.findIndex((item) => item.grnNumber === updatedData.grnNumber);
      }
    }

    if (index === -1) {
      throw new Error(`Catatan GRN (${id}) tidak ditemukan.`);
    }

    const matchedItem = existing[index];

    // Protect against concurrency: retrieve current remote row to preserve remote payload
    let remotePayload: any = null;
    if (isSupabaseConfigured && supabase) {
      try {
        const isUuid = Boolean(matchedItem.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchedItem.id));
        const query = supabase
          .from('warehouse_grn')
          .select('notes, internal_lot_number, qc_status');
        const { data: remoteRow } = isUuid
          ? await query.eq('id', matchedItem.id).maybeSingle()
          : await query.eq('grn_number', matchedItem.grnNumber).maybeSingle();

        if (remoteRow?.notes) {
          const { userNotes, qcPayload } = unpackGrnNotes(remoteRow.notes);
          if (qcPayload && !updatedData.qcPayload) {
            remotePayload = qcPayload;
          }
          if (userNotes && updatedData.notes === undefined) {
            matchedItem.notes = userNotes;
          }
        }
      } catch (e) {
        console.warn('[warehouseService] Pre-fetch remote row warning:', e);
      }
    }

    const updatedRecord: GrnRecord = {
      ...matchedItem,
      ...updatedData,
      currentQuantity: updatedData.currentQuantity !== undefined
        ? Number(updatedData.currentQuantity)
        : (updatedData.qcPayload?.currentQuantity !== undefined
            ? Number(updatedData.qcPayload.currentQuantity)
            : (matchedItem.currentQuantity !== undefined
                ? Number(matchedItem.currentQuantity)
                : Number(matchedItem.quantityReceived))),
      qcPayload: updatedData.qcPayload !== undefined ? updatedData.qcPayload : (matchedItem.qcPayload || remotePayload),
    };

    if (isSupabaseConfigured && supabase) {
      try {
        const payload = buildPrimarySupabasePayload(updatedRecord);
        const { error } = await executeWithSchemaAdaptiveRetry(
          'warehouse_grn',
          payload,
          updatedRecord,
          'upsert'
        );
        if (error) {
          console.warn('[warehouseService] Adaptive update to Supabase failed:', error);
        } else {
          console.log('[warehouseService] GRN successfully synced to Supabase:', updatedRecord.grnNumber);
        }
      } catch (e) {
        console.warn('[warehouseService] Failed to update Supabase record:', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('warehouse_grn_updated', { detail: { id, record: updatedRecord } }));
    }

    // Perbarui in-memory cache secara langsung
    const foundIdx = inMemoryGrnRecords.findIndex((r) => r.id === id || r.grnNumber === id || r.id === updatedRecord.id);
    if (foundIdx >= 0) {
      inMemoryGrnRecords[foundIdx] = updatedRecord;
    } else {
      inMemoryGrnRecords = [updatedRecord, ...inMemoryGrnRecords];
    }
    lastGrnFetchTime = Date.now();
    paginatedGrnCache.clear();

    return updatedRecord;
  },

  /**
   * Memperbarui dokumen CoA pada record GRN di Supabase dan in-memory cache
   */
  updateGrnCoa: async (
    grnIdentifier: string,
    coaData: { coaAttachment?: string; coaDriveFileId?: string; coaDriveViewLink?: string }
  ): Promise<GrnRecord | null> => {
    const existing = await warehouseService.getGrnRecords();
    const target = existing.find((r) => r.id === grnIdentifier || r.grnNumber === grnIdentifier);
    if (!target) return null;
    return await warehouseService.updateGrnRecord(target.id, {
      ...coaData,
    });
  },

  deleteGrnRecord: async (id: string, isSuperAdminOverride = false): Promise<boolean> => {
    const existing = await warehouseService.getGrnRecords();
    const target = existing.find((item) => item.id === id || item.grnNumber === id);
    if (!target) return true;

    // Check if user is Super Admin
    const currentUser = authService.getCurrentUser();
    const isSuperAdmin =
      isSuperAdminOverride ||
      currentUser?.role === 'admin' ||
      currentUser?.nik?.toLowerCase() === 'admin';

    // Kepatuhan Integritas Data CPKB: Tolak hapus jika sudah masuk Sedang Uji, Menunggu Otorisasi, Rilis, atau Ditolak (Kecuali Super Admin Override)
    if (!isSuperAdmin && target.qcStatus !== 'QUARANTINE' && target.qcStatus !== 'REVERTED_TO_WAREHOUSE') {
      const statusLabel =
        target.qcStatus === 'QUALITY_CONTROL_PROCESS'
          ? 'Sedang Uji'
          : target.qcStatus === 'AWAITING_QM_AUTHORIZATION'
          ? 'Menunggu Otorisasi QM'
          : target.qcStatus === 'PASSED' || target.qcStatus === 'RELEASED'
          ? 'Rilis'
          : target.qcStatus === 'PASSED_WITH_DEVIATION'
          ? 'Rilis dengan Deviasi'
          : 'Ditolak';
      throw new Error(
        `Penghapusan ditolak: Penerimaan (${target.grnNumber}) sudah berada dalam tahap "${statusLabel}". Gudang tidak dapat menghapus data yang sedang/sudah diuji. Silakan koordinasi dengan tim QC untuk melakukan pembatalan/revert inspeksi terlebih dahulu.`
      );
    }

    if (isSupabaseConfigured && supabase) {
      try {
        if (target?.grnNumber) {
          await supabase.from('warehouse_grn').delete().eq('grn_number', target.grnNumber);
        } else {
          await supabase.from('warehouse_grn').delete().eq('id', id);
        }
      } catch (e) {
        console.warn('[warehouseService] Failed to delete from Supabase:', e);
      }
    }

    // Update in-memory cache
    inMemoryGrnRecords = inMemoryGrnRecords.filter((r) => r.id !== id && r.grnNumber !== id && (!target || r.id !== target.id));
    lastGrnFetchTime = Date.now();
    paginatedGrnCache.clear();

    return true;
  },

  /**
   * Mengosongkan seluruh data GRN dan mutasi stok di Supabase & in-memory cache
   */
  clearAllWarehouseData: async (): Promise<boolean> => {
    inMemoryGrnRecords = [];
    lastGrnFetchTime = 0;
    paginatedGrnCache.clear();
    if (isSupabaseConfigured && supabase) {
      try {
        await Promise.allSettled([
          supabase.from('warehouse_grn').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
          supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        ]);
      } catch (e) {
        console.warn('[warehouseService] Error clearing data from Supabase:', e);
      }
    }
    return true;
  },

  calculateStats: (records: GrnRecord[]): GrnStats => {
    return {
      totalIncoming: records.length,
      inQuarantine: records.filter((r) => r.qcStatus === 'QUARANTINE').length,
      underTesting: records.filter((r) => r.qcStatus === 'QUALITY_CONTROL_PROCESS').length,
      awaitingAuth: records.filter((r) => r.qcStatus === 'AWAITING_QM_AUTHORIZATION').length,
      passedQC: records.filter((r) => r.qcStatus === 'PASSED' || r.qcStatus === 'RELEASED' || r.qcStatus === 'PASSED_WITH_DEVIATION').length,
      rejectedQC: records.filter((r) => r.qcStatus === 'REJECTED').length,
      rawMaterialsCount: records.filter((r) => r.materialType === 'raw').length,
      packagingCount: records.filter((r) => r.materialType === 'packaging').length,
    };
  },
};
