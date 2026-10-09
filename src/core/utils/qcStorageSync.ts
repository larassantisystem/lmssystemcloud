import { QcInspectionReport, QcInspectionStatus } from '../../features/quality/types/qcTypes';
import { GrnRecord } from '../../features/warehouse/types/grnTypes';
import { supabase, isSupabaseConfigured } from '../auth/supabaseClient';
import { normalizeLotNumber, calculateAutoRetestDate } from '../../features/quality/utils/qcNumbering';

const QC_TAG_START = '<!--QC_PAYLOAD_START-->';
const QC_TAG_END = '<!--QC_PAYLOAD_END-->';

export interface SerializedQcPayload {
  lotInternalNumber?: string;
  reportNumber?: string;
  status: QcInspectionStatus;
  parameters?: any[];
  staffDecision?: 'RELEASE' | 'REJECT';
  staffNotes?: string;
  staffSignature?: any;
  qmDecision?: 'RELEASE' | 'RELEASE_BY_DEVIATION' | 'REJECT';
  qmDeviationNumber?: string;
  qmNotes?: string;
  qmSignature?: any;
  aiAssessment?: any;
  actualSampleSize?: number;
  actualSampleUnit?: string;
  sampledContainers?: string;
  sampledBy?: string;
  samplingDateTime?: string;
  retestDate?: string;
  revertReason?: string;
  revertedBy?: string;
  revertedAt?: string;
  updatedAt?: string;
  stockLedger?: any[];
  currentQuantity?: number;
}

/**
 * Packs user notes together with serializable QC report metadata into a single safe TEXT string.
 */
export function packGrnNotes(userNotes?: string | null, qcReport?: Partial<QcInspectionReport> | null): string {
  const cleanUserText = (userNotes || '')
    .replace(/<!--QC_PAYLOAD_START-->[\s\S]*?<!--QC_PAYLOAD_END-->/g, '')
    .trim();

  if (!qcReport) return cleanUserText;

  const normalizedLot = qcReport.lotInternalNumber ? normalizeLotNumber(qcReport.lotInternalNumber) : undefined;

  const payload: SerializedQcPayload = {
    lotInternalNumber: normalizedLot,
    reportNumber: normalizedLot,
    status: qcReport.status || 'QUARANTINE',
    parameters: qcReport.parameters,
    staffDecision: qcReport.staffDecision,
    staffNotes: qcReport.staffNotes,
    staffSignature: qcReport.staffSignature,
    qmDecision: qcReport.qmDecision,
    qmDeviationNumber: qcReport.qmDeviationNumber,
    qmNotes: qcReport.qmNotes,
    qmSignature: qcReport.qmSignature,
    aiAssessment: qcReport.aiAssessment,
    actualSampleSize: qcReport.actualSampleSize,
    actualSampleUnit: qcReport.actualSampleUnit,
    sampledContainers: qcReport.sampledContainers,
    sampledBy: qcReport.sampledBy,
    samplingDateTime: qcReport.samplingDateTime,
    retestDate: qcReport.retestDate || (qcReport.materialType === 'raw' ? calculateAutoRetestDate('raw', qcReport.expiryDate, qcReport.receivedDate) : undefined),
    revertReason: qcReport.revertReason,
    revertedBy: qcReport.revertedBy,
    revertedAt: qcReport.revertedAt,
    updatedAt: qcReport.updatedAt || new Date().toISOString(),
    stockLedger: (qcReport as any).stockLedger || undefined,
    currentQuantity: (qcReport as any).currentQuantity !== undefined ? Number((qcReport as any).currentQuantity) : undefined,
  };

  const json = JSON.stringify(payload);
  const tag = `${QC_TAG_START}${json}${QC_TAG_END}`;

  return cleanUserText ? `${cleanUserText}\n${tag}` : tag;
}

/**
 * Unpacks user notes and QC payload from raw string.
 */
export function unpackGrnNotes(rawNotes?: string | null): { userNotes: string; qcPayload: SerializedQcPayload | null } {
  if (!rawNotes) return { userNotes: '', qcPayload: null };

  const match = rawNotes.match(/<!--QC_PAYLOAD_START-->([\s\S]*?)<!--QC_PAYLOAD_END-->/);
  let qcPayload: SerializedQcPayload | null = null;
  if (match && match[1]) {
    try {
      qcPayload = JSON.parse(match[1]);
    } catch (e) {
      console.warn('Failed to parse QC payload from notes string:', e);
    }
  }

  const userNotes = rawNotes.replace(/<!--QC_PAYLOAD_START-->[\s\S]*?<!--QC_PAYLOAD_END-->/g, '').trim();
  return { userNotes, qcPayload };
}

/**
 * Syncs a QC report directly to Supabase warehouse_grn row.
 * Updates qc_status, internal_lot_number, and packs the QC report payload into notes.
 */
export async function syncQcReportToSupabase(
  report: QcInspectionReport,
  existingUserNotes?: string | null
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  const isUuid = (str?: string) => Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

  try {
    // 1. Fetch current remote row to avoid overwriting concurrent edits
    let remoteRow: any = null;
    let fetchErr: any = null;

    if (report.grnId && isUuid(report.grnId)) {
      const res = await supabase
        .from('warehouse_grn')
        .select('id, grn_number, notes, internal_lot_number')
        .eq('id', report.grnId)
        .maybeSingle();
      remoteRow = res.data;
      fetchErr = res.error;
    }

    if (!remoteRow && report.grnNumber) {
      const res = await supabase
        .from('warehouse_grn')
        .select('id, grn_number, notes, internal_lot_number')
        .eq('grn_number', report.grnNumber)
        .maybeSingle();
      remoteRow = res.data;
      if (!fetchErr) fetchErr = res.error;
    }

    if (!remoteRow && report.grnId) {
      // Try stripping qc-rep- prefix
      const cleanId = report.grnId.replace(/^qc-rep-/, '');
      if (isUuid(cleanId)) {
        const res = await supabase
          .from('warehouse_grn')
          .select('id, grn_number, notes, internal_lot_number')
          .eq('id', cleanId)
          .maybeSingle();
        remoteRow = res.data;
      }
    }

    const currentNotes = remoteRow?.notes || existingUserNotes || '';
    const { userNotes } = unpackGrnNotes(currentNotes);
    const packedNotes = packGrnNotes(userNotes, report);

    // Map application QC status to valid database qc_status enum values (QUARANTINE, RELEASED, REJECTED)
    const mapDbQcStatus = (appStatus: string): string => {
      const upper = (appStatus || '').toUpperCase();
      if (upper === 'RELEASED' || upper === 'RELEASE' || upper === 'PASSED' || upper === 'APPROVED') {
        return 'RELEASED';
      }
      if (upper === 'REJECTED' || upper === 'REJECT' || upper === 'FAILED' || upper === 'REJECTED_BY_QM') {
        return 'REJECTED';
      }
      return 'QUARANTINE';
    };

    const updatePayload: Record<string, any> = {
      qc_status: mapDbQcStatus(report.status),
      internal_lot_number: normalizeLotNumber(report.lotInternalNumber || remoteRow?.internal_lot_number) || null,
      notes: packedNotes,
      updated_at: new Date().toISOString(),
    };

    if (report.actualSampleSize !== undefined && report.actualSampleSize !== null) {
      updatePayload.actual_sample_size = Number(report.actualSampleSize);
    }
    if (report.actualSampleUnit) {
      updatePayload.actual_sample_unit = report.actualSampleUnit;
    }
    if (report.sampledContainers) {
      updatePayload.sampled_containers = report.sampledContainers;
    }
    if (report.sampledBy) {
      updatePayload.sampled_by = report.sampledBy;
    }
    if (report.samplingDateTime) {
      updatePayload.sampling_date_time = report.samplingDateTime;
    }

    const effectiveRetest = report.retestDate || (report.materialType === 'raw' ? calculateAutoRetestDate('raw', report.expiryDate, report.receivedDate) : undefined);
    if (effectiveRetest) {
      updatePayload.retest_date = effectiveRetest;
    }

    const targetId = remoteRow?.id;
    const runUpdate = async (payloadToSync: Record<string, any>) => {
      if (targetId && isUuid(targetId)) {
        return await supabase.from('warehouse_grn').update(payloadToSync).eq('id', targetId);
      } else if (report.grnNumber) {
        return await supabase.from('warehouse_grn').update(payloadToSync).eq('grn_number', report.grnNumber);
      } else {
        return { error: new Error('No valid ID or grn_number found for sync') };
      }
    };

    let { error: updateErr } = await runUpdate(updatePayload);

    // If there is any column mismatch error, fallback to the minimal guaranteed fields
    if (updateErr && (updateErr.code === 'PGRST204' || updateErr.code === '42703')) {
      console.warn('[syncQcReportToSupabase] Retrying with minimal core fields due to schema mismatch:', updateErr.message);
      const fallbackPayload: Record<string, any> = {
        qc_status: mapDbQcStatus(report.status),
        notes: packedNotes,
        updated_at: new Date().toISOString(),
      };
      const retryResult = await runUpdate(fallbackPayload);
      updateErr = retryResult.error;
    }

    if (updateErr) {
      console.warn('[syncQcReportToSupabase] Update Supabase error:', updateErr);
      return false;
    }

    return true;
  } catch (e) {
    console.error('[syncQcReportToSupabase] Exception syncing report:', e);
    return false;
  }
}
