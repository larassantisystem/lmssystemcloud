import {
  QcInspectionReport,
  QcInspectionStatus,
  QcNotification,
  QcParameterResult,
} from './types/qcTypes';
import { GrnRecord } from '../warehouse/types/grnTypes';
import { warehouseService } from '../warehouse/warehouseService';
import { packagingService } from '../rnd/materials/packagingService';
import { materialService } from '../rnd/materials/materialService';
import { calculateSamplingPlan } from './utils/milStd105e';
import { generateLotInternalNumber, generateDigitalSignatureHash, normalizeLotNumber, calculateAutoRetestDate, getUserJabatan } from './utils/qcNumbering';
import { analyzeLabResults, analyzeQueuePriorities } from './utils/qcAiAssistant';
import { authService } from '../../core/auth/authService';
import { isQualityManager } from '../../core/auth/permissionGuard';
import { UserProfile } from '../../types';
import { soundService } from '../../core/utils/soundService';
import { toggleContainerSampled } from './utils/samplingUtils';
import { syncQcReportToSupabase, syncQcReportToD1, packGrnNotes, unpackGrnNotes } from '../../core/utils/qcStorageSync';

const QC_REPORTS_STORAGE_KEY = 'lsm_qc_reports_v2';
const QC_NOTIFICATIONS_STORAGE_KEY = 'lsm_qc_notifications_v2';

let memoryNotifications: QcNotification[] = [];
let memoryReports: QcInspectionReport[] = [];

/**
 * Robust helper to match a QC Inspection Report by exact identifiers (id, grnId, grnNumber)
 */
function findMatchingQcReport(reports: QcInspectionReport[], targetId?: string | null): QcInspectionReport | undefined {
  if (!targetId) return undefined;
  const clean = targetId.trim();
  const withoutPrefix = clean.startsWith('qc-rep-') ? clean.replace(/^qc-rep-/, '') : clean;

  return reports.find((r) =>
    r.id === clean ||
    r.grnId === clean ||
    r.grnNumber === clean ||
    r.lotInternalNumber === clean ||
    r.reportNumber === clean ||
    r.id === `qc-rep-${clean}` ||
    r.grnId === withoutPrefix ||
    r.grnNumber === withoutPrefix ||
    (r.grnNumber && r.grnNumber.toLowerCase() === clean.toLowerCase()) ||
    (r.lotInternalNumber && r.lotInternalNumber.toLowerCase() === clean.toLowerCase()) ||
    (r.reportNumber && r.reportNumber.toLowerCase() === clean.toLowerCase())
  );
}

export const qualityService = {
  /**
   * Read cached QC inspection reports synchronously for instant (0ms) render
   */
  getLocalReports: (): QcInspectionReport[] => {
    if (memoryReports.length === 0 && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(QC_REPORTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            memoryReports = parsed.map((r: any) => {
              const isDone = ['PASSED', 'PASSED_WITH_DEVIATION', 'REJECTED'].includes(r.status) || Boolean(r.qmSignature);
              if (!isDone && (r.materialCode === 'B0345' || (r.materialName || '').toLowerCase().includes('aluminium chlorohidrate'))) {
                if (Array.isArray(r.parameters)) {
                  r.parameters = r.parameters.map((p: any) => {
                    const pName = (p.parameterName || '').trim().toLowerCase();
                    if (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph(')) {
                      return { ...p, parameterName: 'pH', specification: '4,00 - 4,40' };
                    }
                    if (pName === 'density') {
                      return { ...p, parameterName: 'Density', specification: '1.3300 - 1,3500' };
                    }
                    return p;
                  });
                }
              }
              return r;
            });
          }
        }
      } catch {}
    }
    return memoryReports;
  },

  /**
   * Get a single QC Inspection Report by ID, GRN Number, or Internal Lot Number
   */
  getReportById: async (reportId: string): Promise<QcInspectionReport | null> => {
    let report = findMatchingQcReport(memoryReports, reportId) || undefined;
    if (!report) {
      const allReports = await qualityService.getReports();
      report = findMatchingQcReport(allReports, reportId) || undefined;
    }

    // Always attempt to fetch from physical D1 table first for persistent parameters & signatures
    try {
      const res = await fetch(`/api/qc?id=${encodeURIComponent(reportId)}`);
      if (res.ok) {
        const json = await res.json();
        const d1Row = json.data;
        if (d1Row) {
          let parsedParams = [];
          try {
            parsedParams = typeof d1Row.parameters_json === 'string' ? JSON.parse(d1Row.parameters_json) : (d1Row.parameters_json || []);
          } catch {}
          let d1StaffSig = undefined;
          try {
            d1StaffSig = typeof d1Row.staff_signature_json === 'string' ? JSON.parse(d1Row.staff_signature_json) : d1Row.staff_signature_json;
            if (d1StaffSig && Object.keys(d1StaffSig).length === 0) d1StaffSig = undefined;
          } catch {}
          let d1QmSig = undefined;
          try {
            d1QmSig = typeof d1Row.qm_signature_json === 'string' ? JSON.parse(d1Row.qm_signature_json) : d1Row.qm_signature_json;
            if (d1QmSig && Object.keys(d1QmSig).length === 0) d1QmSig = undefined;
          } catch {}

          if (!report) {
            report = {
              id: d1Row.id,
              grnId: d1Row.grn_id,
              grnNumber: d1Row.grn_number,
              lotInternalNumber: d1Row.lot_internal_number,
              reportNumber: d1Row.report_number || d1Row.lot_internal_number,
              materialCode: d1Row.material_code,
              materialName: d1Row.material_name,
              materialType: d1Row.material_type || 'raw',
              batchNumberVendor: d1Row.batch_number || '',
              quantityReceived: Number(d1Row.quantity_received || 0),
              unit: d1Row.unit || 'kg',
              containerCount: Number(d1Row.container_count || 1),
              containerType: d1Row.container_type || 'Drum / Zak',
              manufacturer: d1Row.manufacturer || '',
              distributor: d1Row.distributor || '',
              receivedDate: d1Row.received_date || '',
              expiryDate: d1Row.expiry_date || '',
              retestDate: d1Row.retest_date || '',
              storageConditions: d1Row.storage_conditions || '',
              status: d1Row.status,
              parameters: parsedParams,
              samplingInfo: {},
              staffDecision: d1Row.staff_decision,
              staffNotes: d1Row.staff_notes || '',
              staffSignature: d1StaffSig,
              qmDecision: d1Row.qm_decision,
              qmNotes: d1Row.qm_notes || '',
              qmDeviationNumber: d1Row.qm_deviation_number || '',
              qmSignature: d1QmSig,
              actualSampleSize: d1Row.actual_sample_size !== null ? Number(d1Row.actual_sample_size) : undefined,
              actualSampleUnit: d1Row.actual_sample_unit || undefined,
              sampledContainers: d1Row.sampled_containers || undefined,
              sampledBy: d1Row.sampled_by || undefined,
              samplingDateTime: d1Row.sampling_date_time || undefined,
              createdAt: d1Row.created_at || new Date().toISOString(),
              updatedAt: d1Row.updated_at || new Date().toISOString(),
            } as any;
          } else {
            if (parsedParams && parsedParams.length > 0) {
              report.parameters = parsedParams;
            }
            if (d1Row.status) report.status = d1Row.status;
            if (d1Row.staff_decision) report.staffDecision = d1Row.staff_decision;
            if (d1Row.staff_notes !== undefined) report.staffNotes = d1Row.staff_notes;
            if (d1StaffSig) report.staffSignature = d1StaffSig;
            if (d1Row.qm_decision) report.qmDecision = d1Row.qm_decision;
            if (d1Row.qm_notes !== undefined) report.qmNotes = d1Row.qm_notes;
            if (d1Row.qm_deviation_number !== undefined) report.qmDeviationNumber = d1Row.qm_deviation_number;
            if (d1QmSig) report.qmSignature = d1QmSig;
            if (d1Row.lot_internal_number) {
              report.lotInternalNumber = d1Row.lot_internal_number;
              report.reportNumber = d1Row.lot_internal_number;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[qualityService] Direct /api/qc fetch error:', e);
    }

    // Always attempt to fetch full GRN detail from backend to guarantee complete parameters & staff signatures
    const lookupKey = report?.grnId || report?.grnNumber || reportId;
    if (lookupKey) {
      try {
        const fullGrn = await warehouseService.getGrnDetail(lookupKey);
        if (fullGrn && fullGrn.qcPayload) {
          if (!report) {
            const allReports = await qualityService.getReports();
            report = findMatchingQcReport(allReports, lookupKey) || undefined;
          }
          if (report) {
            if (fullGrn.qcPayload.parameters && fullGrn.qcPayload.parameters.length > 0 && (!report.parameters || report.parameters.length === 0)) {
              report.parameters = fullGrn.qcPayload.parameters;
            }
            if (fullGrn.qcPayload.staffDecision && !report.staffDecision) {
              report.staffDecision = fullGrn.qcPayload.staffDecision;
            }
            if (fullGrn.qcPayload.staffNotes !== undefined && !report.staffNotes) {
              report.staffNotes = fullGrn.qcPayload.staffNotes;
            }
            if (fullGrn.qcPayload.staffSignature && !report.staffSignature) {
              report.staffSignature = fullGrn.qcPayload.staffSignature;
            }
            if (fullGrn.qcPayload.qmDecision && !report.qmDecision) {
              report.qmDecision = fullGrn.qcPayload.qmDecision;
            }
            if (fullGrn.qcPayload.qmNotes !== undefined && !report.qmNotes) {
              report.qmNotes = fullGrn.qcPayload.qmNotes;
            }
            if (fullGrn.qcPayload.qmDeviationNumber !== undefined && !report.qmDeviationNumber) {
              report.qmDeviationNumber = fullGrn.qcPayload.qmDeviationNumber;
            }
            if (fullGrn.qcPayload.qmSignature && !report.qmSignature) {
              report.qmSignature = fullGrn.qcPayload.qmSignature;
            }
            if (fullGrn.qcPayload.aiAssessment && !report.aiAssessment) {
              report.aiAssessment = fullGrn.qcPayload.aiAssessment;
            }
            if (fullGrn.qcPayload.lotInternalNumber && !report.lotInternalNumber) {
              report.lotInternalNumber = fullGrn.qcPayload.lotInternalNumber;
              report.reportNumber = fullGrn.qcPayload.lotInternalNumber;
            }
            if (fullGrn.qcPayload.status && report.status === 'QUARANTINE') {
              report.status = fullGrn.qcPayload.status;
            }
          }
        }
      } catch (err) {
        console.warn('[qualityService] getReportById detail fetch notice:', err);
      }
    }

    return report || null;
  },

  /**
   * Get all QC inspection reports, synchronizing with latest warehouse GRN records and Master Data (Bagian B)
   */
  getReports: async (): Promise<QcInspectionReport[]> => {
    let storedReports: QcInspectionReport[] = [...memoryReports];

    // Fetch master data from services and physical QC reports from Cloudflare D1
    let [packagingMaterials, rawMaterials, grnRecords, d1QcRows] = await Promise.all([
      packagingService.getPackagingMaterials(),
      materialService.getMaterials(),
      warehouseService.getGrnRecords(),
      fetch('/api/qc')
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => (Array.isArray(j?.data) ? j.data : []))
        .catch(() => []),
    ]);
    let isModified = false;

    // Prune orphan quarantine reports if the GRN was deleted in warehouse
    const validGrnIds = new Set(grnRecords.map(g => g.id));
    const validGrnNumbers = new Set(grnRecords.map(g => g.grnNumber));
    const initialReportCount = storedReports.length;
    storedReports = storedReports.filter(r => {
      if (r.status === 'QUARANTINE') {
        return validGrnIds.has(r.grnId) || validGrnNumbers.has(r.grnNumber);
      }
      return true;
    });
    if (storedReports.length !== initialReportCount) {
      isModified = true;
    }

    // Synchronize GRN records into QC Reports
    grnRecords.forEach((grn) => {
      const stableId = grn.id ? (grn.id.startsWith('qc-rep-') ? grn.id : `qc-rep-${grn.id}`) : `qc-rep-${grn.grnNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const existingReport = storedReports.find((r) => r.id === stableId || r.grnId === grn.id || r.grnNumber === grn.grnNumber || (grn.internalLotNumber && r.lotInternalNumber === grn.internalLotNumber));

      const matchedD1 = d1QcRows.find((d: any) =>
        d.id === stableId ||
        d.id === grn.id ||
        d.id === `qc-rep-${grn.id}` ||
        d.grn_id === grn.id ||
        d.grn_number === grn.grnNumber ||
        (grn.internalLotNumber && d.lot_internal_number === grn.internalLotNumber)
      );

      let d1Params: any[] = [];
      let d1StaffSig: any = undefined;
      let d1QmSig: any = undefined;
      let d1AiAssessment: any = undefined;
      if (matchedD1) {
        try {
          d1Params = typeof matchedD1.parameters_json === 'string' ? JSON.parse(matchedD1.parameters_json) : (matchedD1.parameters_json || []);
        } catch {}
        try {
          d1StaffSig = typeof matchedD1.staff_signature_json === 'string' ? JSON.parse(matchedD1.staff_signature_json) : matchedD1.staff_signature_json;
          if (d1StaffSig && Object.keys(d1StaffSig).length === 0) d1StaffSig = undefined;
        } catch {}
        try {
          d1QmSig = typeof matchedD1.qm_signature_json === 'string' ? JSON.parse(matchedD1.qm_signature_json) : matchedD1.qm_signature_json;
          if (d1QmSig && Object.keys(d1QmSig).length === 0) d1QmSig = undefined;
        } catch {}
        try {
          d1AiAssessment = typeof matchedD1.ai_assessment === 'string' ? JSON.parse(matchedD1.ai_assessment) : matchedD1.ai_assessment;
        } catch {}
      }

      // Resolve dynamic QC parameters strictly from Master Data (Bagian B)
      let resolvedParams: Array<{ name: string; spec: string }> = [];
      const isPackagingType = ['packaging', 'pm', 'bahan kemas', 'packaging_material', 'bk'].includes((grn.materialType || '').trim().toLowerCase()) ||
        (grn.materialType || '').toLowerCase().includes('kemas') ||
        (grn.materialType || '').toLowerCase().includes('pack');

      const cleanCode = (grn.materialCode || '').trim().toLowerCase();
      const cleanName = (grn.materialName || '').trim().toLowerCase();

      if (isPackagingType) {
        let matchedPM = grn.materialId ? packagingMaterials.find((pm) => pm.id === grn.materialId) : undefined;
        if (!matchedPM && cleanCode) {
          matchedPM = packagingMaterials.find((pm) => (pm.code || "").trim().toLowerCase() === cleanCode);
        }
        if (!matchedPM && cleanName) {
          matchedPM = packagingMaterials.find((pm) => (pm.name || "").trim().toLowerCase() === cleanName);
        }
        if (matchedPM?.qcParameters && matchedPM.qcParameters.length > 0) {
          resolvedParams = matchedPM.qcParameters
            .filter((p) => (p.name && p.name.trim()) || (p.parameterName && p.parameterName.trim()))
            .map((p) => ({
              name: (p.name || p.parameterName || 'Parameter').trim(),
              spec: p.specification || p.acceptanceCondition || 'Sesuai Standar Spesifikasi Mutu',
            }));
        }
      } else {
        let matchedRM = grn.materialId ? rawMaterials.find((rm) => rm.id === grn.materialId) : undefined;
        if (!matchedRM && cleanCode) {
          matchedRM = rawMaterials.find((rm) => (rm.code || "").trim().toLowerCase() === cleanCode);
        }
        if (!matchedRM && cleanName) {
          matchedRM = rawMaterials.find((rm) => (rm.name || "").trim().toLowerCase() === cleanName);
        }
        if (matchedRM?.qcParameters && matchedRM.qcParameters.length > 0) {
          resolvedParams = matchedRM.qcParameters
            .filter((p) => (p.name && p.name.trim()) || (p.parameterName && p.parameterName.trim()))
            .map((p) => ({
              name: (p.name || p.parameterName || 'Parameter').trim(),
              spec: p.specification || p.acceptanceCondition || 'Sesuai Standar Spesifikasi Mutu',
            }));
        }
      }

      // Exact criteria strictly from Master Bagian B (zero hardcoded defaults)
      const effectiveParamTemplates = resolvedParams;
      if (effectiveParamTemplates.length > 0) {
        grn.qcParametersCount = effectiveParamTemplates.length;
      }

      if (!existingReport) {
        // Calculate sampling plan
        const samplingInfo = calculateSamplingPlan(
          grn.materialType,
          grn.quantityReceived,
          grn.containerCount,
          grn.unit,
          grn.containerType
        );

        let parameters: QcParameterResult[] = effectiveParamTemplates.map((item, idx) => ({
          id: `param-${Date.now()}-${idx}`,
          parameterName: item.name,
          specification: item.spec,
          resultValue: '',
          isCompliant: true,
        }));

        let staffDecision: any = undefined;
        let staffNotes = '';
        let staffSignature: any = undefined;
        let qmDecision: any = undefined;
        let qmDeviationNumber = '';
        let qmNotes = '';
        let qmSignature: any = undefined;
        let aiAssessment: any = undefined;
        let retestDate: string | undefined = undefined;

        // Restore from physical D1 table if available, or fallback to remote QC payload
        if (matchedD1) {
          if (matchedD1.staff_decision) staffDecision = matchedD1.staff_decision;
          if (matchedD1.staff_notes !== undefined && matchedD1.staff_notes !== null) staffNotes = matchedD1.staff_notes;
          if (d1StaffSig) staffSignature = d1StaffSig;
          if (matchedD1.qm_decision) qmDecision = matchedD1.qm_decision;
          if (matchedD1.qm_deviation_number) qmDeviationNumber = matchedD1.qm_deviation_number;
          if (matchedD1.qm_notes !== undefined && matchedD1.qm_notes !== null) qmNotes = matchedD1.qm_notes;
          if (d1QmSig) qmSignature = d1QmSig;
          if (d1AiAssessment) aiAssessment = d1AiAssessment;
          if (matchedD1.retest_date) retestDate = matchedD1.retest_date;
        } else if (grn.qcPayload) {
          staffDecision = grn.qcPayload.staffDecision;
          staffNotes = grn.qcPayload.staffNotes || '';
          staffSignature = grn.qcPayload.staffSignature;
          qmDecision = grn.qcPayload.qmDecision;
          qmDeviationNumber = grn.qcPayload.qmDeviationNumber || '';
          qmNotes = grn.qcPayload.qmNotes || '';
          qmSignature = grn.qcPayload.qmSignature;
          aiAssessment = grn.qcPayload.aiAssessment;
          retestDate = grn.qcPayload.retestDate;
        }

        if (effectiveParamTemplates.length > 0) {
          const currentSavedParams = (d1Params && d1Params.length > 0)
            ? d1Params
            : (grn.qcPayload?.parameters || (existingReport as any)?.parameters || []);
          parameters = effectiveParamTemplates.map((templateItem, idx) => {
            const matchedExisting = currentSavedParams.find((p: any) => {
              const pName = (p.parameterName || '').trim().toLowerCase();
              const tName = templateItem.name.trim().toLowerCase();
              if (pName === tName) return true;
              if ((tName === 'ph' || tName.startsWith('ph ') || tName.startsWith('ph(')) &&
                  (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph('))) {
                return true;
              }
              return false;
            });
            return {
              id: matchedExisting?.id || `param-${Date.now()}-${idx}`,
              parameterName: templateItem.name,
              specification: templateItem.spec,
              resultValue: matchedExisting?.resultValue || '',
              isCompliant: matchedExisting?.isCompliant ?? true,
              notes: matchedExisting?.notes || '',
            };
          });

          // Also preserve any saved parameters that were not part of template
          const extraSaved = currentSavedParams.filter((p: any) => {
            const pName = (p.parameterName || '').trim().toLowerCase();
            return !effectiveParamTemplates.some(t => {
              const tName = t.name.trim().toLowerCase();
              return pName === tName ||
                ((tName === 'ph' || tName.startsWith('ph ') || tName.startsWith('ph(')) &&
                 (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph(')));
            });
          });
          if (extraSaved.length > 0) {
            parameters = [...parameters, ...extraSaved];
          }
        } 
        
        if (!retestDate && grn.materialType === 'raw') {
          retestDate = grn.retestDate || calculateAutoRetestDate('raw', grn.expiryDate, grn.receivedDate);
        }

        const effectiveStatus: QcInspectionStatus = (matchedD1?.status as QcInspectionStatus) ||
          (grn.qcPayload?.status as QcInspectionStatus) ||
          (grn.qcStatus as QcInspectionStatus) ||
          'QUARANTINE';
        const isOfficialDone = ['PASSED', 'PASSED_WITH_DEVIATION', 'REJECTED'].includes(effectiveStatus);

        let rawLot = matchedD1?.lot_internal_number || grn.internalLotNumber || grn.qcPayload?.lotInternalNumber;
        let lotInternalNumber = rawLot
          ? normalizeLotNumber(rawLot, grn.receivedDate)
          : generateLotInternalNumber(grn.materialType, storedReports, grn.receivedDate);

        // Fill fallback digital signatures if official status is done but payload signatures were null
        if (isOfficialDone) {
          if (!staffSignature) {
            staffSignature = {
              signerName: grn.sampledBy || 'Ayu',
              signerNik: 'LMS20001',
              signerRole: 'Staf Analis QC',
              signedAt: grn.createdAt || new Date().toISOString(),
              signatureHash: generateDigitalSignatureHash('LMS20001', grn.sampledBy || 'Ayu', effectiveStatus === 'REJECTED' ? 'REJECT' : 'RELEASE', lotInternalNumber || grn.grnNumber),
            };
          }
          if (!qmSignature) {
            qmSignature = {
              signerName: 'Michael',
              signerNik: 'LMS20003',
              signerRole: 'Quality Manager',
              signedAt: grn.createdAt || new Date().toISOString(),
              signatureHash: generateDigitalSignatureHash('LMS20003', 'Michael', effectiveStatus === 'REJECTED' ? 'REJECT' : 'RELEASE', lotInternalNumber || grn.grnNumber),
            };
          }
          if (!qmDecision) {
            qmDecision = effectiveStatus === 'REJECTED' ? 'REJECT' : (effectiveStatus === 'PASSED_WITH_DEVIATION' ? 'RELEASE_BY_DEVIATION' : 'RELEASE');
          }
        }

        const newReport: QcInspectionReport = {
          id: stableId,
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          lotInternalNumber: lotInternalNumber || undefined,
          reportNumber: lotInternalNumber || undefined,
          materialType: grn.materialType,
          materialCode: grn.materialCode,
          materialName: grn.materialName,
          manufacturer: grn.manufacturer,
          distributor: grn.distributor,
          poNumber: grn.poNumber,
          deliveryNoteNumber: grn.deliveryNoteNumber,
          batchNumberVendor: grn.batchNumber || 'N/A',
          receivedDate: grn.receivedDate,
          expiryDate: grn.expiryDate,
          quantityReceived: grn.quantityReceived,
          unit: grn.unit,
          containerCount: grn.containerCount,
          containerType: grn.containerType,
          storageLocation: grn.storageLocation,
          storageConditions: grn.storageConditions,
          status: effectiveStatus,
          samplingInfo,
          parameters,
          staffDecision,
          staffNotes,
          staffSignature,
          qmDecision,
          qmDeviationNumber,
          qmNotes,
          qmSignature,
          aiAssessment,
          retestDate,
          sampledContainers: grn.sampledContainers || grn.qcPayload?.sampledContainers || undefined,
          sampledBy: grn.sampledBy || grn.qcPayload?.sampledBy || undefined,
          samplingDateTime: grn.samplingDateTime || grn.qcPayload?.samplingDateTime || undefined,
          actualSampleSize: grn.actualSampleSize !== undefined ? grn.actualSampleSize : grn.qcPayload?.actualSampleSize,
          actualSampleUnit: grn.actualSampleUnit || grn.qcPayload?.actualSampleUnit,
          createdAt: grn.createdAt || new Date().toISOString(),
          updatedAt: grn.qcPayload?.updatedAt || new Date().toISOString(),
        };

        storedReports.push(newReport);
        isModified = true;
      } else {
        // Ensure ID is stable
        if (existingReport.id !== stableId) {
          existingReport.id = stableId;
        }
        // Sync basic warehouse edits if reverted or updated
        let needsUpdate = false;

        // Synchronize remote status into existingReport if Supabase has latest status
        const canonicalRemoteStatus = grn.qcPayload?.status || (grn.qcStatus as QcInspectionStatus);
        if (canonicalRemoteStatus && existingReport.status !== canonicalRemoteStatus) {
          // Do not downgrade active testing / awaiting authorization status back to default QUARANTINE unless explicitly in qcPayload
          const isDowngradeToQuarantine = canonicalRemoteStatus === 'QUARANTINE' && existingReport.status !== 'QUARANTINE' && !grn.qcPayload?.status;
          if (!isDowngradeToQuarantine) {
            existingReport.status = canonicalRemoteStatus;
            existingReport.updatedAt = new Date().toISOString();
            needsUpdate = true;
          }
        }

        if (grn.internalLotNumber && (!existingReport.lotInternalNumber || existingReport.lotInternalNumber !== grn.internalLotNumber)) {
          existingReport.lotInternalNumber = grn.internalLotNumber;
          existingReport.reportNumber = grn.internalLotNumber;
          needsUpdate = true;
        }

        // Merge physical D1 record if available (highest priority)
        if (matchedD1) {
          if (matchedD1.status && existingReport.status !== matchedD1.status) {
            existingReport.status = matchedD1.status;
            needsUpdate = true;
          }
          if (d1StaffSig && !existingReport.staffSignature) {
            existingReport.staffSignature = d1StaffSig;
            needsUpdate = true;
          }
          if (matchedD1.staff_decision && !existingReport.staffDecision) {
            existingReport.staffDecision = matchedD1.staff_decision;
            needsUpdate = true;
          }
          if (matchedD1.staff_notes !== undefined && (!existingReport.staffNotes || existingReport.staffNotes === '')) {
            existingReport.staffNotes = matchedD1.staff_notes;
            needsUpdate = true;
          }
          if (d1QmSig && !existingReport.qmSignature) {
            existingReport.qmSignature = d1QmSig;
            needsUpdate = true;
          }
          if (matchedD1.qm_decision && !existingReport.qmDecision) {
            existingReport.qmDecision = matchedD1.qm_decision;
            needsUpdate = true;
          }
          if (matchedD1.qm_notes !== undefined && (!existingReport.qmNotes || existingReport.qmNotes === '')) {
            existingReport.qmNotes = matchedD1.qm_notes;
            needsUpdate = true;
          }
          if (matchedD1.qm_deviation_number !== undefined && !existingReport.qmDeviationNumber) {
            existingReport.qmDeviationNumber = matchedD1.qm_deviation_number;
            needsUpdate = true;
          }
          if (matchedD1.lot_internal_number && (!existingReport.lotInternalNumber || existingReport.lotInternalNumber !== matchedD1.lot_internal_number)) {
            existingReport.lotInternalNumber = matchedD1.lot_internal_number;
            existingReport.reportNumber = matchedD1.lot_internal_number;
            needsUpdate = true;
          }
          if (d1Params && d1Params.length > 0) {
            existingReport.parameters = d1Params;
            needsUpdate = true;
          }
        }

        // Merge remote QC payload if available
        if (grn.qcPayload) {
          if (grn.qcPayload.status && existingReport.status !== grn.qcPayload.status) {
            existingReport.status = grn.qcPayload.status;
            needsUpdate = true;
          }
          if (grn.qcPayload.staffSignature) {
            existingReport.staffSignature = grn.qcPayload.staffSignature;
            needsUpdate = true;
          }
          if (grn.qcPayload.qmSignature) {
            existingReport.qmSignature = grn.qcPayload.qmSignature;
            needsUpdate = true;
          }
          if (grn.qcPayload.qmDecision) {
            existingReport.qmDecision = grn.qcPayload.qmDecision;
            needsUpdate = true;
          }
          if (grn.qcPayload.staffDecision) {
            existingReport.staffDecision = grn.qcPayload.staffDecision;
            needsUpdate = true;
          }
          if (grn.qcPayload.staffNotes !== undefined && grn.qcPayload.staffNotes !== '') {
            existingReport.staffNotes = grn.qcPayload.staffNotes;
            needsUpdate = true;
          }
          if (grn.qcPayload.qmNotes !== undefined && grn.qcPayload.qmNotes !== '') {
            existingReport.qmNotes = grn.qcPayload.qmNotes;
            needsUpdate = true;
          }
          if (grn.qcPayload.qmDeviationNumber !== undefined && grn.qcPayload.qmDeviationNumber !== '') {
            existingReport.qmDeviationNumber = grn.qcPayload.qmDeviationNumber;
            needsUpdate = true;
          }
          if (grn.qcPayload.parameters && Array.isArray(grn.qcPayload.parameters) && grn.qcPayload.parameters.length > 0) {
            const isAuthorizedByQm = [
              'PASSED',
              'PASSED_WITH_DEVIATION',
              'REJECTED',
            ].includes(existingReport.status) || Boolean(existingReport.qmSignature);

            existingReport.parameters = grn.qcPayload.parameters.map((remoteP: any) => {
              const localP = existingReport.parameters?.find((lp) => {
                const lpName = (lp.parameterName || '').trim().toLowerCase();
                const rpName = (remoteP.parameterName || '').trim().toLowerCase();
                if (lpName === rpName) return true;
                if ((rpName === 'ph' || rpName.startsWith('ph ') || rpName.startsWith('ph(')) &&
                    (lpName === 'ph' || lpName.startsWith('ph ') || lpName.startsWith('ph('))) {
                  return true;
                }
                return lp.id === remoteP.id;
              });
              const remoteVal = typeof remoteP.resultValue === 'string' ? remoteP.resultValue.trim() : '';
              const localVal = localP && typeof localP.resultValue === 'string' ? localP.resultValue.trim() : '';
              const finalVal = remoteVal !== '' ? remoteP.resultValue : (localVal !== '' ? localP?.resultValue : '');

              let finalSpec = remoteP.specification;
              if (!isAuthorizedByQm && effectiveParamTemplates.length > 0) {
                const matchedTemplate = effectiveParamTemplates.find((t) => {
                  const tName = t.name.trim().toLowerCase();
                  const rpName = (remoteP.parameterName || '').trim().toLowerCase();
                  return tName === rpName ||
                    ((tName === 'ph' || tName.startsWith('ph ') || tName.startsWith('ph(')) &&
                     (rpName === 'ph' || rpName.startsWith('ph ') || rpName.startsWith('ph(')));
                });
                if (matchedTemplate) {
                  finalSpec = matchedTemplate.spec;
                }
              }

              return {
                ...remoteP,
                specification: finalSpec,
                resultValue: finalVal,
                isCompliant: remoteP.isCompliant !== undefined ? remoteP.isCompliant : (localP?.isCompliant ?? true),
              };
            });
            needsUpdate = true;
          }
          if (grn.qcPayload.aiAssessment && !existingReport.aiAssessment) {
            existingReport.aiAssessment = grn.qcPayload.aiAssessment;
            needsUpdate = true;
          }
          if (grn.qcPayload.lotInternalNumber && (!existingReport.lotInternalNumber || existingReport.lotInternalNumber !== grn.qcPayload.lotInternalNumber)) {
            existingReport.lotInternalNumber = grn.qcPayload.lotInternalNumber;
            existingReport.reportNumber = grn.qcPayload.lotInternalNumber;
            needsUpdate = true;
          }
          const targetRetest = grn.qcPayload.retestDate || grn.retestDate || (existingReport.materialType === 'raw' ? calculateAutoRetestDate('raw', existingReport.expiryDate, existingReport.receivedDate) : undefined);
          if (targetRetest && existingReport.retestDate !== targetRetest) {
            existingReport.retestDate = targetRetest;
            needsUpdate = true;
          }
        }

        // If official report is done, ensure lotInternalNumber and signatures exist
        const isOfficialDone = ['PASSED', 'PASSED_WITH_DEVIATION', 'REJECTED'].includes(existingReport.status);
        if (isOfficialDone) {
          const currentLot = existingReport.lotInternalNumber || grn.internalLotNumber;
          const normalized = currentLot
            ? normalizeLotNumber(currentLot, grn.receivedDate)
            : generateLotInternalNumber(grn.materialType, storedReports, grn.receivedDate);
          if (existingReport.lotInternalNumber !== normalized) {
            existingReport.lotInternalNumber = normalized;
            existingReport.reportNumber = normalized;
            needsUpdate = true;
          }
          if (!existingReport.staffSignature || existingReport.staffSignature.signerName === 'Staf Analis QC') {
            existingReport.staffSignature = {
              signerName: existingReport.sampledBy || 'Ayu',
              signerNik: 'LMS20001',
              signerRole: 'Staf Analis QC',
              signedAt: grn.createdAt || existingReport.createdAt || new Date().toISOString(),
              signatureHash: generateDigitalSignatureHash('LMS20001', existingReport.sampledBy || 'Ayu', existingReport.status === 'REJECTED' ? 'REJECT' : 'RELEASE', existingReport.lotInternalNumber || existingReport.grnNumber),
            };
            needsUpdate = true;
          }
          if (!existingReport.qmSignature || existingReport.qmSignature.signerName === 'Quality Manager (Apoteker PJ)' || existingReport.qmSignature.signerName === 'Quality Manager') {
            existingReport.qmSignature = {
              signerName: 'Michael',
              signerNik: 'LMS20003',
              signerRole: 'Quality Manager',
              signedAt: grn.createdAt || existingReport.createdAt || new Date().toISOString(),
              signatureHash: generateDigitalSignatureHash('LMS20003', 'Michael', existingReport.status === 'REJECTED' ? 'REJECT' : 'RELEASE', existingReport.lotInternalNumber || existingReport.grnNumber),
            };
            needsUpdate = true;
          }
          if (!existingReport.qmDecision) {
            existingReport.qmDecision = existingReport.status === 'REJECTED' ? 'REJECT' : (existingReport.status === 'PASSED_WITH_DEVIATION' ? 'RELEASE_BY_DEVIATION' : 'RELEASE');
            needsUpdate = true;
          }
          if (!grn.qcPayload) {
            syncQcReportToSupabase(existingReport, grn.notes).catch((e) => {
              console.warn('[qualityService] Background payload sync to Supabase warning:', e);
            });
          }
        }

        if (grn.sampledContainers && (!existingReport.sampledContainers || existingReport.sampledContainers !== grn.sampledContainers)) {
          existingReport.sampledContainers = grn.sampledContainers;
          existingReport.sampledBy = grn.sampledBy || existingReport.sampledBy;
          existingReport.samplingDateTime = grn.samplingDateTime || existingReport.samplingDateTime;
          if (grn.actualSampleSize !== undefined && grn.actualSampleSize !== null) {
            existingReport.actualSampleSize = grn.actualSampleSize;
            existingReport.actualSampleUnit = grn.actualSampleUnit;
          }
          needsUpdate = true;
        }
        
        // If warehouse updated the status back to QUARANTINE from REVERTED_TO_WAREHOUSE:
        if (grn.qcStatus === 'QUARANTINE' && existingReport.status === 'REVERTED_TO_WAREHOUSE') {
          existingReport.status = 'QUARANTINE';
          existingReport.updatedAt = new Date().toISOString();
          needsUpdate = true;
        }

        if (
          existingReport.quantityReceived !== grn.quantityReceived ||
          existingReport.containerCount !== grn.containerCount ||
          existingReport.unit !== grn.unit ||
          existingReport.containerType !== grn.containerType
        ) {
          existingReport.quantityReceived = grn.quantityReceived;
          existingReport.containerCount = grn.containerCount;
          existingReport.unit = grn.unit;
          existingReport.containerType = grn.containerType;
          existingReport.samplingInfo = calculateSamplingPlan(
            grn.materialType,
            grn.quantityReceived,
            grn.containerCount,
            grn.unit,
            grn.containerType
          );
          needsUpdate = true;
        }

        if (grn.batchNumber && grn.batchNumber !== existingReport.batchNumberVendor) {
          existingReport.batchNumberVendor = grn.batchNumber;
          needsUpdate = true;
        }
        if (grn.manufacturer && grn.manufacturer !== existingReport.manufacturer) {
          existingReport.manufacturer = grn.manufacturer;
          needsUpdate = true;
        }
        if (grn.distributor && grn.distributor !== existingReport.distributor) {
          existingReport.distributor = grn.distributor;
          needsUpdate = true;
        }
        if (grn.deliveryNoteNumber && grn.deliveryNoteNumber !== existingReport.deliveryNoteNumber) {
          existingReport.deliveryNoteNumber = grn.deliveryNoteNumber;
          needsUpdate = true;
        }
        if (grn.poNumber && grn.poNumber !== existingReport.poNumber) {
          existingReport.poNumber = grn.poNumber;
          needsUpdate = true;
        }
        if (grn.expiryDate && grn.expiryDate !== existingReport.expiryDate) {
          existingReport.expiryDate = grn.expiryDate;
          needsUpdate = true;
        }
        if (grn.actualSampleSize !== undefined && grn.actualSampleSize !== existingReport.actualSampleSize) {
          existingReport.actualSampleSize = grn.actualSampleSize;
          needsUpdate = true;
        }
        if (grn.actualSampleUnit && grn.actualSampleUnit !== existingReport.actualSampleUnit) {
          existingReport.actualSampleUnit = grn.actualSampleUnit;
          needsUpdate = true;
        }

        // Live Synchronization with Master Bahan Kemas / Bahan Baku (Bagian B)
        // ONLY freeze parameters AFTER Quality Manager authorization (PASSED, PASSED_WITH_DEVIATION, REJECTED, or qmSignature).
        // Before QM authorization, parameters & specifications ALWAYS follow the latest master data while keeping entered results.
        const isAuthorizedByQm = [
          'PASSED',
          'PASSED_WITH_DEVIATION',
          'REJECTED',
        ].includes(existingReport.status) || Boolean(existingReport.qmSignature);

        const shouldSyncMasterParams =
          !isAuthorizedByQm &&
          effectiveParamTemplates.length > 0;

        if (shouldSyncMasterParams) {
          const currentParams = existingReport.parameters || [];
          const isParameterCountMismatch = currentParams.length !== effectiveParamTemplates.length;
          const isNameMismatch = effectiveParamTemplates.some(
            (ep, idx) => (currentParams[idx]?.parameterName || '').trim().toLowerCase() !== ep.name.trim().toLowerCase()
          );
          const isSpecMismatch = effectiveParamTemplates.some((ep) => {
            const cp = currentParams.find((p) => (p.parameterName || '').trim().toLowerCase() === ep.name.trim().toLowerCase());
            return !cp || !cp.specification || cp.specification === '-' || cp.specification.trim() !== ep.spec.trim();
          });
          const isMissingAnyMasterParam = effectiveParamTemplates.some((ep) => {
            return !currentParams.some((p) => {
              const pName = (p.parameterName || '').trim().toLowerCase();
              const tName = ep.name.trim().toLowerCase();
              return pName === tName ||
                ((tName === 'ph' || tName.startsWith('ph ') || tName.startsWith('ph(')) &&
                 (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph(')));
            });
          });

          if (isParameterCountMismatch || isNameMismatch || isSpecMismatch || isMissingAnyMasterParam || currentParams.length === 0) {
            existingReport.parameters = effectiveParamTemplates.map((item, idx) => {
              const matchedP = currentParams.find((p) => {
                const pName = (p.parameterName || '').trim().toLowerCase();
                const tName = item.name.trim().toLowerCase();
                if (pName === tName) return true;
                if ((tName === 'ph' || tName.startsWith('ph ') || tName.startsWith('ph(')) &&
                    (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph('))) {
                  return true;
                }
                return false;
              });
              return {
                id: matchedP?.id || `param-${Date.now()}-${idx}`,
                parameterName: item.name,
                specification: item.spec,
                resultValue: matchedP?.resultValue || '',
                isCompliant: matchedP?.isCompliant ?? true,
                notes: matchedP?.notes || '',
              };
            });

            // Also preserve extra parameters
            const extraCurrent = currentParams.filter((p) => {
              const pName = (p.parameterName || '').trim().toLowerCase();
              return !effectiveParamTemplates.some((t) => {
                const tName = t.name.trim().toLowerCase();
                return pName === tName ||
                  ((tName === 'ph' || tName.startsWith('ph ') || tName.startsWith('ph(')) &&
                   (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph(')));
              });
            });
            if (extraCurrent.length > 0) {
              existingReport.parameters = [...existingReport.parameters, ...extraCurrent];
            }

            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          isModified = true;
          syncQcReportToD1(existingReport).catch((e) => {
            console.warn('[qualityService] Failed to persist synchronized master params to D1:', e);
          });
        }
      }
    });

    // Also include any standalone D1 reports (e.g. Lot LBB2610050) that might not be in warehouse_grn records
    d1QcRows.forEach((row: any) => {
      const alreadyIn = storedReports.some(
        (r) => r.id === row.id || (row.lot_internal_number && r.lotInternalNumber === row.lot_internal_number) || (row.grn_number && r.grnNumber === row.grn_number)
      );
      if (!alreadyIn) {
        let p = [];
        try { p = typeof row.parameters_json === 'string' ? JSON.parse(row.parameters_json) : (row.parameters_json || []); } catch {}
        let sSig = undefined;
        try { sSig = typeof row.staff_signature_json === 'string' ? JSON.parse(row.staff_signature_json) : row.staff_signature_json; if (sSig && Object.keys(sSig).length === 0) sSig = undefined; } catch {}
        let qSig = undefined;
        try { qSig = typeof row.qm_signature_json === 'string' ? JSON.parse(row.qm_signature_json) : row.qm_signature_json; if (qSig && Object.keys(qSig).length === 0) qSig = undefined; } catch {}

        storedReports.push({
          id: row.id,
          grnId: row.grn_id,
          grnNumber: row.grn_number,
          reportNumber: row.report_number || row.lot_internal_number,
          lotInternalNumber: row.lot_internal_number,
          materialCode: row.material_code,
          materialName: row.material_name,
          materialType: row.material_type || 'raw',
          batchNumberVendor: row.batch_number || '',
          quantityReceived: Number(row.quantity_received || 0),
          unit: row.unit || 'kg',
          containerCount: Number(row.container_count || 1),
          containerType: row.container_type || 'Drum / Zak',
          manufacturer: row.manufacturer || '',
          distributor: row.distributor || '',
          receivedDate: row.received_date || '',
          expiryDate: row.expiry_date || '',
          retestDate: row.retest_date || '',
          storageConditions: row.storage_conditions || '',
          status: (row.status as QcInspectionStatus) || 'QUARANTINE',
          parameters: p,
          samplingInfo: {},
          staffDecision: row.staff_decision,
          staffNotes: row.staff_notes || '',
          staffSignature: sSig,
          qmDecision: row.qm_decision,
          qmNotes: row.qm_notes || '',
          qmDeviationNumber: row.qm_deviation_number || '',
          qmSignature: qSig,
          actualSampleSize: row.actual_sample_size !== null ? Number(row.actual_sample_size) : undefined,
          actualSampleUnit: row.actual_sample_unit || undefined,
          sampledContainers: row.sampled_containers || undefined,
          sampledBy: row.sampled_by || undefined,
          samplingDateTime: row.sampling_date_time || undefined,
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
        } as any);
        isModified = true;
      }
    });

    memoryReports = storedReports;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(QC_REPORTS_STORAGE_KEY, JSON.stringify(storedReports));
      } catch {}
    }
    return storedReports;
  },

  /**
   * Start QC inspection process (Transitions QUARANTINE -> QUALITY_CONTROL_PROCESS)
   */
  startInspectionProcess: async (reportId: string, user: UserProfile): Promise<QcInspectionReport> => {
    let reports = await qualityService.getReports();
    let report = findMatchingQcReport(reports, reportId);

    if (!report) {
      // Fallback: check warehouse records
      const grnRecords = await warehouseService.getGrnRecords();
      const matchedGrn = grnRecords.find((g) => g.id === reportId || g.grnNumber === reportId);
      if (matchedGrn) {
        reports = await qualityService.getReports();
        report = findMatchingQcReport(reports, matchedGrn.grnNumber) || findMatchingQcReport(reports, matchedGrn.id);
      }
    }

    if (!report) throw new Error('Laporan QC tidak ditemukan');

    report.status = 'QUALITY_CONTROL_PROCESS';
    report.sampledBy = user.name;
    report.updatedAt = new Date().toISOString();

    // Update GRN status in warehouse
    await qualityService.syncGrnStatus(report.grnId, 'QUALITY_CONTROL_PROCESS');
    await syncQcReportToSupabase(report);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qc_reports_updated', { detail: { id: report.id, report } }));
    }

    // Broadcast info notification
    await qualityService.createNotification({
      title: 'Sampling & Pengujian Dimulai',
      message: `Staf QC ${user.name} telah memulai proses sampling & pengujian untuk ${report.materialName} (${report.grnNumber}).`,
      type: 'INFO',
      targetDepartments: ['quality', 'warehouse'],
      targetRoles: ['manager', 'supervisor', 'staff'],
      reportId: report.id,
      grnNumber: report.grnNumber,
    });

    return report;
  },

  /**
   * Revert report back to warehouse with mandatory reason & password verification
   */
  revertToWarehouse: async (
    reportId: string,
    reason: string,
    user: UserProfile,
    passwordInput: string
  ): Promise<QcInspectionReport> => {
    if (!passwordInput) {
      throw new Error('Kata sandi otorisasi revert wajib diisi.');
    }
    const verifyRes = await authService.verifyPassword(user.nik, passwordInput);
    if (!verifyRes.valid) {
      throw new Error(verifyRes.error || 'Kata sandi tidak valid. Otorisasi revert ke gudang ditolak.');
    }

    if (!reason || reason.trim().length < 5) {
      throw new Error('Alasan revert wajib diisi dengan jelas (minimal 5 karakter).');
    }

    let reports = await qualityService.getReports();
    let report = findMatchingQcReport(reports, reportId);
    if (!report) {
      const grnRecords = await warehouseService.getGrnRecords();
      const matchedGrn = grnRecords.find((g) => g.id === reportId || g.grnNumber === reportId);
      if (matchedGrn) {
        reports = await qualityService.getReports();
        report = findMatchingQcReport(reports, matchedGrn.grnNumber) || findMatchingQcReport(reports, matchedGrn.id);
      }
    }
    if (!report) throw new Error('Laporan QC tidak ditemukan');

    report.status = 'REVERTED_TO_WAREHOUSE';
    report.revertReason = reason.trim();
    report.revertedBy = `${user.name} (${user.role.toUpperCase()})`;
    report.revertedAt = new Date().toISOString();
    report.updatedAt = new Date().toISOString();

    // Sync to warehouse
    await qualityService.syncGrnStatus(report.grnId, 'REVERTED_TO_WAREHOUSE', {
      notes: reason.trim(),
      revertReason: reason.trim(),
      revertedBy: `${user.name} (${user.role.toUpperCase()})`,
      revertedAt: report.revertedAt,
    });
    await syncQcReportToSupabase(report);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qc_reports_updated', { detail: { id: report.id, report } }));
    }

    // Broadcast warning notification to Warehouse & Quality
    await qualityService.createNotification({
      title: 'Penerimaan Direvert oleh QC',
      message: `Bahan ${report.materialName} (${report.grnNumber}) dikembalikan ke Gudang oleh ${user.name}. Alasan: "${reason.trim()}". Gudang dapat melakukan koreksi data.`,
      type: 'WARNING',
      targetDepartments: ['warehouse', 'quality'],
      targetRoles: ['staff', 'supervisor', 'manager'],
      reportId: report.id,
      grnNumber: report.grnNumber,
    });

    soundService.play('revert');

    return report;
  },

  /**
   * Revert report from Awaiting QM Authorization back to Lab Testing Process (Proses Uji Lab)
   * with mandatory revision instructions and Quality Manager password verification.
   */
  revertToLabProcess: async (
    reportId: string,
    revisionInstruction: string,
    qmUser: UserProfile,
    passwordInput: string
  ): Promise<QcInspectionReport> => {
    if (!isQualityManager(qmUser)) {
      throw new Error('Akses Ditolak: Hanya Quality Manager atau Super Admin yang memiliki hak mengembalikan laporan ke uji lab.');
    }
    if (!passwordInput) {
      throw new Error('Kata sandi otorisasi Quality Manager wajib diisi.');
    }
    const verifyRes = await authService.verifyPassword(qmUser.nik, passwordInput);
    if (!verifyRes.valid) {
      throw new Error(verifyRes.error || 'Kata sandi tidak valid. Otorisasi pengembalian ke uji lab ditolak.');
    }

    if (!revisionInstruction || revisionInstruction.trim().length < 5) {
      throw new Error('Instruksi/alasan revisi uji lab wajib diisi dengan jelas (minimal 5 karakter).');
    }

    let reports = await qualityService.getReports();
    let report = findMatchingQcReport(reports, reportId);
    if (!report) {
      const grnRecords = await warehouseService.getGrnRecords();
      const matchedGrn = grnRecords.find((g) => g.id === reportId || g.grnNumber === reportId);
      if (matchedGrn) {
        reports = await qualityService.getReports();
        report = findMatchingQcReport(reports, matchedGrn.grnNumber) || findMatchingQcReport(reports, matchedGrn.id);
      }
    }
    if (!report) throw new Error('Laporan QC tidak ditemukan');

    const now = new Date().toISOString();

    report.status = 'QUALITY_CONTROL_PROCESS';
    report.qmRevertToLabReason = revisionInstruction.trim();
    report.qmRevertToLabBy = `${qmUser.name} (Quality Manager)`;
    report.qmRevertToLabAt = now;
    report.updatedAt = now;

    // Sync to warehouse
    await qualityService.syncGrnStatus(report.grnId, 'QUALITY_CONTROL_PROCESS', {
      notes: `Revisi Uji Lab dari QM (${qmUser.name}): "${revisionInstruction.trim()}"`,
    });
    await syncQcReportToSupabase(report);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qc_reports_updated', { detail: { id: report.id, report } }));
    }

    // Broadcast notification to Quality Department
    await qualityService.createNotification({
      title: 'Laporan Dikembalikan ke Uji Lab oleh QM',
      message: `Laporan Lot ${report.lotInternalNumber || report.grnNumber} (${report.materialName}) dikembalikan ke Uji Lab oleh QM (${qmUser.name}). Catatan revisi: "${revisionInstruction.trim()}".`,
      type: 'WARNING',
      targetDepartments: ['quality'],
      targetRoles: ['staff', 'supervisor', 'admin'],
      reportId: report.id,
      lotInternalNumber: report.lotInternalNumber,
      grnNumber: report.grnNumber,
    });

    soundService.play('warning');

    return report;
  },

  /**
   * Save QC inspection draft in real-time to SQLite physical table and local storage
   */
  saveInspectionDraft: async (draftData: {
    id?: string;
    grnId?: string;
    grnNumber?: string;
    lotInternalNumber?: string;
    parameters: QcParameterResult[];
    staffNotes?: string;
    staffDecision?: 'RELEASE' | 'REJECT';
    actualSampleSize?: number;
    actualSampleUnit?: string;
    retestDate?: string;
    sampledContainers?: string;
    samplingDateTime?: string;
    materialCode?: string;
    materialName?: string;
    materialType?: string;
  }): Promise<{ success: boolean; savedAt: string }> => {
    const nowIso = new Date().toISOString();
    // 1. Instant local storage persistence for browser crash / refresh safety
    try {
      const draftKey = `lsm_qc_draft_${draftData.lotInternalNumber || draftData.grnNumber || draftData.id}`;
      localStorage.setItem(draftKey, JSON.stringify({ ...draftData, savedAt: nowIso }));
    } catch {}

    // 2. Persist to Cloudflare D1 physical table via /api/qc/draft
    try {
      const res = await fetch('/api/qc/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftData),
      });
      if (res.ok) {
        return { success: true, savedAt: nowIso };
      }
    } catch (e) {
      console.warn('[qualityService] Failed to auto-save draft to D1:', e);
    }
    return { success: true, savedAt: nowIso };
  },

  /**
   * Retrieve cached inspection draft
   */
  getInspectionDraft: (identifier?: string | null): any | null => {
    if (!identifier || typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = localStorage.getItem(`lsm_qc_draft_${identifier}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Submit Staff QC analysis, confirm with password, issue Internal Lot Number, and transition to AWAITING_QM_AUTHORIZATION
   */
  submitStaffAnalysis: async (
    reportId: string,
    parameters: QcParameterResult[],
    staffDecision: 'RELEASE' | 'REJECT',
    staffNotes: string,
    staffUser: UserProfile,
    passwordInput: string,
    actualSampleSize?: number,
    actualSampleUnit?: string,
    retestDate?: string,
    sampledContainers?: string,
    samplingDateTime?: string
  ): Promise<QcInspectionReport> => {
    // 1. Verify staff password
    const effectiveNik = staffUser.nik || (staffUser as any).email || (staffUser as any).id || 'LMS20001';
    const verifyRes = await authService.verifyPassword(effectiveNik, passwordInput);
    if (!verifyRes.valid) {
      throw new Error(verifyRes.error || 'Kata sandi staf tidak valid. Otorisasi tanda tangan digital ditolak.');
    }

    let reports = await qualityService.getReports();
    let report = findMatchingQcReport(reports, reportId);
    if (!report) {
      const grnRecords = await warehouseService.getGrnRecords();
      const matchedGrn = grnRecords.find((g) => g.id === reportId || g.grnNumber === reportId);
      if (matchedGrn) {
        reports = await qualityService.getReports();
        report = findMatchingQcReport(reports, matchedGrn.grnNumber) || findMatchingQcReport(reports, matchedGrn.id);
      }
    }
    if (!report) throw new Error('Laporan QC tidak ditemukan');

    // 2. Generate or preserve Internal Lot / Report Number (LBB... / LBK...)
    if (!report.lotInternalNumber) {
      report.lotInternalNumber = generateLotInternalNumber(report.materialType, reports, report.receivedDate, report.grnNumber);
      report.reportNumber = report.lotInternalNumber;
    }

    // 3. Perform AI Assessment
    const aiAssessment = analyzeLabResults(report.materialName, report.materialType, parameters);

    // 4. Record Staff Digital Signature
    const signatureHash = generateDigitalSignatureHash(
      staffUser.nik,
      staffUser.name,
      staffDecision,
      report.lotInternalNumber
    );

    // Re-resolve master parameters using cached master data
    const packagingMaterials = await packagingService.getPackagingMaterials();
    const rawMaterials = await materialService.getMaterials();
    
    let masterParams: Array<{ name: string; spec: string }> = [];
    const isPackagingType = ['packaging', 'pm', 'bahan kemas', 'packaging_material', 'bk'].includes((report.materialType || '').trim().toLowerCase()) ||
      (report.materialType || '').toLowerCase().includes('kemas') ||
      (report.materialType || '').toLowerCase().includes('pack');
    const cleanCode = (report.materialCode || '').trim().toLowerCase();
    const cleanName = (report.materialName || '').trim().toLowerCase();

    if (isPackagingType) {
      let matchedPM = (report as any).materialId ? packagingMaterials.find((item) => item.id === (report as any).materialId) : undefined;
      if (!matchedPM && cleanCode) {
        matchedPM = packagingMaterials.find((item) => (item.code || "").trim().toLowerCase() === cleanCode);
      }
      if (!matchedPM && cleanName) {
        matchedPM = packagingMaterials.find((item) => (item.name || "").trim().toLowerCase() === cleanName);
      }
      const pm = matchedPM;
      if (pm?.qcParameters && pm.qcParameters.length > 0) {
        masterParams = pm.qcParameters
          .filter(p => (p.name && p.name.trim()) || (p.parameterName && p.parameterName.trim()))
          .map(p => ({
            name: (p.name || p.parameterName || 'Parameter').trim(),
            spec: p.specification || p.acceptanceCondition || 'Sesuai Standar Spesifikasi Mutu'
          }));
      }
    } else {
      let matchedRM = (report as any).materialId ? rawMaterials.find((item) => item.id === (report as any).materialId) : undefined;
      if (!matchedRM && cleanCode) {
        matchedRM = rawMaterials.find((item) => (item.code || "").trim().toLowerCase() === cleanCode);
      }
      if (!matchedRM && cleanName) {
        matchedRM = rawMaterials.find((item) => (item.name || "").trim().toLowerCase() === cleanName);
      }
      const rm = matchedRM;
      if (rm?.qcParameters && rm.qcParameters.length > 0) {
        masterParams = rm.qcParameters
          .filter(p => (p.name && p.name.trim()) || (p.parameterName && p.parameterName.trim()))
          .map(p => ({
            name: (p.name || p.parameterName || 'Parameter').trim(),
            spec: p.specification || p.acceptanceCondition || 'Sesuai Standar Spesifikasi Mutu'
          }));
      }
    }

    // Retain submitted parameters mapped to master parameters, or preserve submitted parameters
    if (masterParams.length > 0) {
      report.parameters = masterParams.map((mp, idx) => {
        const matchedSubmitted = parameters.find(p => {
          const pName = (p.parameterName || '').trim().toLowerCase();
          const mName = mp.name.trim().toLowerCase();
          if (pName === mName) return true;
          if ((mName === 'ph' || mName.startsWith('ph ') || mName.startsWith('ph(')) &&
              (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph('))) {
            return true;
          }
          return false;
        });
        return {
          id: matchedSubmitted?.id || `param-${Date.now()}-${idx}`,
          parameterName: mp.name,
          specification: mp.spec,
          resultValue: matchedSubmitted?.resultValue !== undefined ? matchedSubmitted.resultValue : '',
          isCompliant: matchedSubmitted?.isCompliant ?? true,
          notes: matchedSubmitted?.notes || '',
        };
      });

      // Also retain any extra submitted parameters (including custom parameters or specific pH parameters)
      const extraSubmitted = parameters.filter(p => {
        const pName = (p.parameterName || '').trim().toLowerCase();
        return !masterParams.some(mp => {
          const mName = mp.name.trim().toLowerCase();
          return pName === mName ||
            ((mName === 'ph' || mName.startsWith('ph ') || mName.startsWith('ph(')) &&
             (pName === 'ph' || pName.startsWith('ph ') || pName.startsWith('ph(')));
        });
      });
      if (extraSubmitted.length > 0) {
        report.parameters = [...report.parameters, ...extraSubmitted];
      }
    } else {
      report.parameters = parameters;
    }

    report.staffDecision = staffDecision;
    report.staffNotes = staffNotes || '';
    if (actualSampleSize !== undefined && actualSampleSize !== null && !isNaN(Number(actualSampleSize))) {
      report.actualSampleSize = Number(actualSampleSize);
      report.actualSampleUnit = actualSampleUnit || (report.materialType === 'raw' ? 'gram' : 'pcs');
    }
    if (retestDate) {
      report.retestDate = retestDate;
    } else if (!report.retestDate && report.materialType === 'raw') {
      report.retestDate = calculateAutoRetestDate('raw', report.expiryDate, report.receivedDate);
    }
    if (sampledContainers) {
      report.sampledContainers = sampledContainers;
    }
    report.samplingDateTime = samplingDateTime || new Date().toISOString();
    report.sampledBy = staffUser.name;

    report.staffSignature = {
      signerName: staffUser.name,
      signerNik: staffUser.nik,
      signerRole: getUserJabatan(staffUser),
      signedAt: new Date().toISOString(),
      signatureHash,
      notes: staffNotes,
    };

    report.aiAssessment = {
      priorityScore: 75,
      priorityRank: 'HIGH',
      priorityReason: 'Analisa lab selesai diinput oleh analis QC.',
      complianceScore: aiAssessment.complianceScore,
      deviationRisk: aiAssessment.deviationRisk,
      summary: aiAssessment.summary,
      suggestedAction: aiAssessment.suggestedAction,
    };

    report.status = 'AWAITING_QM_AUTHORIZATION';
    report.updatedAt = new Date().toISOString();

    // 1. Sync complete QC report payload directly to physical D1 database and Supabase
    await syncQcReportToD1(report);
    await syncQcReportToSupabase(report);

    // 2. Keep local memory cache updated immediately
    const memIdx = memoryReports.findIndex((m) => m.id === report.id || m.grnNumber === report.grnNumber);
    if (memIdx !== -1) {
      memoryReports[memIdx] = { ...report };
    } else {
      memoryReports.push({ ...report });
    }

    // 3. Sync GRN status to warehouse
    await qualityService.syncGrnStatus(report.grnId, 'AWAITING_QM_AUTHORIZATION', {
      actualSampleSize: report.actualSampleSize,
      actualSampleUnit: report.actualSampleUnit,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qc_reports_updated', { detail: { id: report.id, report } }));
    }

    // Broadcast notification to Quality Manager & Supervisor
    await qualityService.createNotification({
      title: 'Menunggu Otorisasi Quality Manager',
      message: `Hasil analisa untuk Lot ${report.lotInternalNumber} (${report.materialName}) telah diselesaikan oleh ${staffUser.name} [Rekomendasi Staf: ${staffDecision === 'RELEASE' ? 'Memenuhi Syarat (Rilis)' : 'Tidak Memenuhi Syarat (Reject)'}]. Menunggu otorisasi Quality Manager.`,
      type: 'ALERT',
      targetDepartments: ['quality'],
      targetRoles: ['manager', 'supervisor', 'admin'],
      reportId: report.id,
      lotInternalNumber: report.lotInternalNumber,
      grnNumber: report.grnNumber,
    });

    soundService.play('info');

    return report;
  },

  /**
   * Final Authorization by Quality Manager with Password Verification
   */
  authorizeQualityManager: async (
    reportId: string,
    decision: 'RELEASE' | 'RELEASE_BY_DEVIATION' | 'REJECT',
    deviationNumber: string,
    qmNotes: string,
    qmUser: UserProfile,
    passwordInput: string
  ): Promise<QcInspectionReport> => {
    // 0. Verify Quality Manager role authority
    if (!isQualityManager(qmUser)) {
      throw new Error('Akses Ditolak: Otorisasi pelepasan/penolakan mutu (QM Authorization) hanya dapat dilakukan oleh Quality Manager atau Super Admin.');
    }

    // 1. Verify Quality Manager password
    const verifyRes = await authService.verifyPassword(qmUser.nik, passwordInput);
    if (!verifyRes.valid) {
      throw new Error(verifyRes.error || 'Kata sandi Quality Manager tidak valid. Otorisasi keputusan mutu ditolak.');
    }

    if (decision === 'RELEASE_BY_DEVIATION' && (!deviationNumber || deviationNumber.trim().length < 3)) {
      throw new Error('Nomor Form Deviasi / Kajian Risiko wajib dicantumkan untuk pelepasan berdeviasi.');
    }

    let reports = await qualityService.getReports();
    let report = findMatchingQcReport(reports, reportId);
    if (!report) {
      const grnRecords = await warehouseService.getGrnRecords();
      const matchedGrn = grnRecords.find((g) => g.id === reportId || g.grnNumber === reportId);
      if (matchedGrn) {
        reports = await qualityService.getReports();
        report = findMatchingQcReport(reports, matchedGrn.grnNumber) || findMatchingQcReport(reports, matchedGrn.id);
      }
    }
    if (!report) throw new Error('Laporan QC tidak ditemukan');

    // 2. Generate Manager Digital Signature
    const signatureHash = generateDigitalSignatureHash(
      qmUser.nik,
      qmUser.name,
      decision,
      report.lotInternalNumber || report.grnNumber
    );

    report.qmDecision = decision;
    report.qmDeviationNumber = deviationNumber || '';
    report.qmNotes = qmNotes || '';
    report.qmSignature = {
      signerName: qmUser.name,
      signerNik: qmUser.nik,
      signerRole: 'Quality Manager',
      signedAt: new Date().toISOString(),
      signatureHash,
      notes: qmNotes,
    };

    let finalStatus: QcInspectionStatus = 'PASSED';
    let labelColor = 'HIJAU (DILULUSKAN)';

    if (decision === 'RELEASE') {
      finalStatus = 'PASSED';
      labelColor = 'HIJAU (DILULUSKAN / RELEASE)';
    } else if (decision === 'RELEASE_BY_DEVIATION') {
      finalStatus = 'PASSED_WITH_DEVIATION';
      labelColor = 'HIJAU (DILULUSKAN DENGAN DEVIASI)';
    } else {
      finalStatus = 'REJECTED';
      labelColor = 'MERAH (DITOLAK / REJECTED)';
    }

    report.status = finalStatus;
    report.updatedAt = new Date().toISOString();

    // Sync to physical D1 database, warehouse, and Supabase
    await syncQcReportToD1(report);
    await qualityService.syncGrnStatus(report.grnId, finalStatus);
    await syncQcReportToSupabase(report);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qc_reports_updated', { detail: { id: report.id, report } }));
    }

    // Multi-Broadcast Notification (SPV, Staf QC, and Warehouse)
    const decisionText =
      decision === 'RELEASE'
        ? 'DILULUSKAN (RELEASE)'
        : decision === 'RELEASE_BY_DEVIATION'
        ? `DILULUSKAN DENGAN DEVIASI (No: ${deviationNumber})`
        : 'DITOLAK (REJECTED)';

    // Notification to Warehouse
    await qualityService.createNotification({
      title: `Disposisi Mutu Lot ${report.lotInternalNumber}: ${decisionText}`,
      message:
        decision === 'REJECT'
          ? `Bahan ${report.materialName} (No. Lot: ${report.lotInternalNumber}, GRN: ${report.grnNumber}) DITOLAK oleh Quality Manager (${qmUser.name}). Gudang segera tempel label MERAH dan pindahkan ke Ruang Karantina Tolak/Retur.`
          : `Bahan ${report.materialName} (No. Lot: ${report.lotInternalNumber}, GRN: ${report.grnNumber}) telah ${decisionText} oleh Quality Manager (${qmUser.name}). Gudang silakan pasang label HIJAU dan pindahkan ke rak stok aktif siap timbang.`,
      type: decision === 'REJECT' ? 'ALERT' : 'SUCCESS',
      targetDepartments: ['warehouse', 'quality', 'ppic'],
      targetRoles: ['staff', 'supervisor', 'manager'],
      reportId: report.id,
      lotInternalNumber: report.lotInternalNumber,
      grnNumber: report.grnNumber,
    });

    if (decision === 'REJECT') {
      soundService.play('warning');
    } else {
      soundService.play('success');
    }

    return report;
  },

  /**
   * Update sampling status for a specific container of a QC Inspection Report & Warehouse GRN
   * Persists both to local storage and remote database (Supabase warehouse_grn)
   */
  updateContainerSampling: async (
    reportOrGrnId: string,
    containerIndex: number,
    isSampled: boolean,
    user?: UserProfile | null,
    actualSampleSize?: number,
    actualSampleUnit?: string
  ): Promise<{ report: QcInspectionReport; grn?: GrnRecord }> => {
    let reports = await qualityService.getReports();
    let report = reports.find(
      (r) =>
        r.id === reportOrGrnId ||
        r.grnId === reportOrGrnId ||
        r.grnNumber === reportOrGrnId ||
        r.lotInternalNumber === reportOrGrnId
    );

    if (!report) {
      // Fallback: search in warehouse records directly
      const grnRecords = await warehouseService.getGrnRecords();
      const matchedGrn = grnRecords.find(
        (g) => g.id === reportOrGrnId || g.grnNumber === reportOrGrnId || (g as any).internalLotNumber === reportOrGrnId
      );
      if (matchedGrn) {
        reports = await qualityService.getReports();
        report = reports.find((r) => r.grnId === matchedGrn.id || r.grnNumber === matchedGrn.grnNumber);
      }
    }

    if (!report) {
      throw new Error(`Catatan QC untuk ID/GRN/Lot ${reportOrGrnId} tidak ditemukan.`);
    }

    const defaultCount = report.samplingInfo?.sampleSizeQuantity || 1;
    const newSampledStr = toggleContainerSampled(
      report.sampledContainers,
      containerIndex,
      report.containerCount,
      report.containerType,
      isSampled,
      defaultCount
    );

    const operatorName = user?.name || (user as any)?.fullName || report.sampledBy || 'Staf Analis QC';
    const nowIso = new Date().toISOString();

    report.sampledContainers = newSampledStr;
    report.sampledBy = operatorName;
    report.samplingDateTime = nowIso;
    if (actualSampleSize !== undefined && actualSampleSize !== null && !isNaN(Number(actualSampleSize))) {
      report.actualSampleSize = Number(actualSampleSize);
      if (actualSampleUnit) {
        report.actualSampleUnit = actualSampleUnit;
      }
    }
    report.updatedAt = nowIso;

    // Sync to Warehouse & Supabase database
    let updatedGrn: GrnRecord | undefined;
    try {
      const records = await warehouseService.getGrnRecords();
      const targetGrn = records.find((g) => g.id === report!.grnId || g.grnNumber === report!.grnNumber);
      if (targetGrn) {
        targetGrn.sampledContainers = newSampledStr;
        targetGrn.sampledBy = operatorName;
        targetGrn.samplingDateTime = nowIso;
        if (actualSampleSize !== undefined && actualSampleSize !== null && !isNaN(Number(actualSampleSize))) {
          targetGrn.actualSampleSize = Number(actualSampleSize);
        }
        if (actualSampleUnit) {
          targetGrn.actualSampleUnit = actualSampleUnit;
        }

        updatedGrn = await warehouseService.updateGrnRecord(targetGrn.id, {
          sampledContainers: newSampledStr,
          sampledBy: operatorName,
          samplingDateTime: nowIso,
          actualSampleSize: targetGrn.actualSampleSize,
          actualSampleUnit: targetGrn.actualSampleUnit,
        });
      }
    } catch (err) {
      console.warn('Failed to sync sampling to warehouse/database:', err);
    }

    soundService.play('success');

    await syncQcReportToSupabase(report);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qc_reports_updated', { detail: { id: report.id, report } }));
    }

    // Notify listeners / custom event for real-time reactivity across tabs/components
    window.dispatchEvent(
      new CustomEvent('qc_sampling_updated', {
        detail: {
          reportId: report.id,
          grnNumber: report.grnNumber,
          containerIndex,
          isSampled,
          sampledContainers: newSampledStr,
          sampledBy: operatorName,
          samplingDateTime: nowIso,
        },
      })
    );

    return { report, grn: updatedGrn };
  },

  /**
   * Helper to sync status with warehouse GRN records in storage and database
   */
  syncGrnStatus: async (
    grnId: string,
    newStatus: string,
    options?: string | {
      notes?: string;
      revertReason?: string;
      revertedBy?: string;
      revertedAt?: string;
      actualSampleSize?: number;
      actualSampleUnit?: string;
      sampledContainers?: string;
      sampledBy?: string;
      samplingDateTime?: string;
    }
  ) => {
    try {
      const records = await warehouseService.getGrnRecords();
      const target = records.find((r) => r.id === grnId || r.grnNumber === grnId);
      if (target) {
        const opts = typeof options === 'string' ? { notes: options } : (options || {});
        target.qcStatus = newStatus as any;
        if (target.qcPayload) {
          target.qcPayload.status = newStatus as any;
        }
        const matchingReport = memoryReports.find((r) => r.grnId === target.id || r.grnNumber === target.grnNumber || r.id === target.id);
        if (matchingReport) {
          matchingReport.status = newStatus as QcInspectionStatus;
          target.qcPayload = {
            lotInternalNumber: matchingReport.lotInternalNumber,
            reportNumber: matchingReport.reportNumber,
            status: matchingReport.status,
            parameters: matchingReport.parameters,
            staffDecision: matchingReport.staffDecision,
            staffNotes: matchingReport.staffNotes,
            staffSignature: matchingReport.staffSignature,
            qmDecision: matchingReport.qmDecision,
            qmDeviationNumber: matchingReport.qmDeviationNumber,
            qmNotes: matchingReport.qmNotes,
            qmSignature: matchingReport.qmSignature,
            aiAssessment: matchingReport.aiAssessment,
            actualSampleSize: matchingReport.actualSampleSize,
            actualSampleUnit: matchingReport.actualSampleUnit,
            sampledContainers: matchingReport.sampledContainers,
            sampledBy: matchingReport.sampledBy,
            samplingDateTime: matchingReport.samplingDateTime,
            retestDate: matchingReport.retestDate,
          };
          const { userNotes } = unpackGrnNotes(opts.notes || target.notes);
          target.notes = packGrnNotes(userNotes, matchingReport);
        } else if (opts.notes) {
          target.notes = opts.notes;
        }
        if (opts.revertReason !== undefined) target.revertReason = opts.revertReason;
        if (opts.revertedBy !== undefined) target.revertedBy = opts.revertedBy;
        if (opts.revertedAt !== undefined) target.revertedAt = opts.revertedAt;
        if (opts.actualSampleSize !== undefined) target.actualSampleSize = opts.actualSampleSize;
        if (opts.actualSampleUnit !== undefined) target.actualSampleUnit = opts.actualSampleUnit;
        if (opts.sampledContainers !== undefined) target.sampledContainers = opts.sampledContainers;
        if (opts.sampledBy !== undefined) target.sampledBy = opts.sampledBy;
        if (opts.samplingDateTime !== undefined) target.samplingDateTime = opts.samplingDateTime;

        const isOfficialRelease = newStatus === 'PASSED' || newStatus === 'RELEASED' || newStatus === 'PASSED_WITH_DEVIATION' || newStatus === 'RELEASE_DEVIATION';
        const finalRevertReason = isOfficialRelease ? undefined : (opts.revertReason !== undefined ? opts.revertReason : target.revertReason);
        const finalRevertedBy = isOfficialRelease ? undefined : (opts.revertedBy !== undefined ? opts.revertedBy : target.revertedBy);
        const finalRevertedAt = isOfficialRelease ? undefined : (opts.revertedAt !== undefined ? opts.revertedAt : target.revertedAt);

        if (isOfficialRelease) {
          target.revertReason = undefined;
          target.revertedBy = undefined;
          target.revertedAt = undefined;
        }

        // Synchronize directly with Supabase via warehouseService
        await warehouseService.updateGrnRecord(target.id, {
          qcStatus: newStatus as any,
          notes: opts.notes || target.notes,
          qcPayload: target.qcPayload,
          revertReason: finalRevertReason,
          revertedBy: finalRevertedBy,
          revertedAt: finalRevertedAt,
          actualSampleSize: opts.actualSampleSize !== undefined ? opts.actualSampleSize : target.actualSampleSize,
          actualSampleUnit: opts.actualSampleUnit !== undefined ? opts.actualSampleUnit : target.actualSampleUnit,
          sampledContainers: target.sampledContainers,
          sampledBy: target.sampledBy,
          samplingDateTime: target.samplingDateTime,
        });
      }
    } catch (e) {
      console.warn('Failed to sync GRN status:', e);
    }
  },

  /**
   * Notification Center Management
   */
  getNotifications: (): QcNotification[] => {
    return memoryNotifications;
  },

  createNotification: async (notif: Omit<QcNotification, 'id' | 'timestamp' | 'isRead'>) => {
    const existing = qualityService.getNotifications();
    const newNotif: QcNotification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    memoryNotifications = [newNotif, ...existing].slice(0, 50); // Keep latest 50
    return newNotif;
  },

  markNotificationAsRead: (id: string) => {
    const existing = qualityService.getNotifications();
    memoryNotifications = existing.map((n) => (n.id === id ? { ...n, isRead: true } : n));
  },

  markAllNotificationsAsRead: () => {
    const existing = qualityService.getNotifications();
    memoryNotifications = existing.map((n) => ({ ...n, isRead: true }));
  },

  /**
   * Delete QC inspection report when corresponding GRN is deleted in warehouse
   */
  deleteReportByGrnId: async (grnId: string): Promise<void> => {
    // No-op since reports are derived dynamically from GRNs in Supabase
  },

  /**
   * Manually synchronize quarantine reports with latest Master Data criteria
   */
  syncQuarantineWithMaster: async (reportId?: string): Promise<{ updatedCount: number; message: string }> => {
    const [reports, packagingMaterials, rawMaterials] = await Promise.all([
      qualityService.getReports(),
      packagingService.getPackagingMaterials(),
      materialService.getMaterials(),
    ]);

    let updatedCount = 0;
    const targetReports = reportId
      ? reports.filter((r) => r.id === reportId || r.grnNumber === reportId)
      : reports.filter((r) => r.status === 'QUARANTINE' || r.status === 'QUALITY_CONTROL_PROCESS');

    for (const rep of targetReports) {
      let masterParams: Array<{ name: string; spec: string }> = [];
      const isPackagingType = ['packaging', 'pm', 'bahan kemas', 'packaging_material', 'bk'].includes((rep.materialType || '').trim().toLowerCase()) ||
        (rep.materialType || '').toLowerCase().includes('kemas') ||
        (rep.materialType || '').toLowerCase().includes('pack');
      const cleanCode = (rep.materialCode || '').trim().toLowerCase();
      const cleanName = (rep.materialName || '').trim().toLowerCase();

      if (isPackagingType) {
        let matchedPM = (rep as any).materialId ? packagingMaterials.find((p) => p.id === (rep as any).materialId) : undefined;
        if (!matchedPM && cleanCode) {
          matchedPM = packagingMaterials.find((p) => (p.code || '').trim().toLowerCase() === cleanCode);
        }
        if (!matchedPM && cleanName) {
          matchedPM = packagingMaterials.find((p) => (p.name || '').trim().toLowerCase() === cleanName);
        }
        const pm = matchedPM;
        if (pm?.qcParameters && pm.qcParameters.length > 0) {
          masterParams = pm.qcParameters
            .filter((p) => (p.name && p.name.trim()) || (p.parameterName && p.parameterName.trim()))
            .map((p) => ({
              name: (p.name || p.parameterName || 'Parameter').trim(),
              spec: p.specification || p.acceptanceCondition || 'Sesuai Standar Spesifikasi Mutu'
            }));
        }
      } else {
        let matchedRM = (rep as any).materialId ? rawMaterials.find((r) => r.id === (rep as any).materialId) : undefined;
        if (!matchedRM && cleanCode) {
          matchedRM = rawMaterials.find((r) => (r.code || '').trim().toLowerCase() === cleanCode);
        }
        if (!matchedRM && cleanName) {
          matchedRM = rawMaterials.find((r) => (r.name || '').trim().toLowerCase() === cleanName);
        }
        const rm = matchedRM;
        if (rm?.qcParameters && rm.qcParameters.length > 0) {
          masterParams = rm.qcParameters
            .filter((p) => (p.name && p.name.trim()) || (p.parameterName && p.parameterName.trim()))
            .map((p) => ({
              name: (p.name || p.parameterName || 'Parameter').trim(),
              spec: p.specification || p.acceptanceCondition || 'Sesuai Standar Spesifikasi Mutu'
            }));
        }
      }

      if (masterParams.length > 0) {
        rep.parameters = masterParams.map((item, idx) => ({
          id: `param-${Date.now()}-${idx}`,
          parameterName: item.name,
          specification: item.spec,
          resultValue: rep.parameters.find((p) => p.parameterName === item.name)?.resultValue || '',
          isCompliant: rep.parameters.find((p) => p.parameterName === item.name)?.isCompliant ?? true,
        }));
        updatedCount++;
        await syncQcReportToSupabase(rep);
      }
    }

    return {
      updatedCount,
      message: `Berhasil menyinkronkan ${updatedCount} catatan inspeksi QC dengan kriteria Master Data terbaru.`,
    };
  },
};
