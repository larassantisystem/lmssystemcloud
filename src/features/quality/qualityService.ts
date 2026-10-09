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
import { syncQcReportToSupabase, packGrnNotes, unpackGrnNotes } from '../../core/utils/qcStorageSync';

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
    r.id === `qc-rep-${clean}` ||
    r.grnId === withoutPrefix ||
    r.grnNumber === withoutPrefix ||
    (r.grnNumber && r.grnNumber.toLowerCase() === clean.toLowerCase())
  );
}

export const qualityService = {
  /**
   * Read cached QC inspection reports synchronously for instant (0ms) render
   */
  getLocalReports: (): QcInspectionReport[] => {
    return memoryReports;
  },

  /**
   * Get a single QC Inspection Report by ID, GRN Number, or Internal Lot Number
   */
  getReportById: async (reportId: string): Promise<QcInspectionReport | null> => {
    let report = findMatchingQcReport(memoryReports, reportId);
    if (report) return report;

    const allReports = await qualityService.getReports();
    report = findMatchingQcReport(allReports, reportId);
    return report || null;
  },

  /**
   * Get all QC inspection reports, synchronizing with latest warehouse GRN records and Master Data (Bagian B)
   */
  getReports: async (): Promise<QcInspectionReport[]> => {
    let storedReports: QcInspectionReport[] = [...memoryReports];

    // Fast resolution: Use local master data first (0ms) to avoid downloading thousands of rows on every queue load
    let packagingMaterials = packagingService.getLocalPackagingMaterials();
    let rawMaterials = materialService.getLocalMaterials();

    // Only fetch remote master data if local cache is completely empty
    const masterPromises: Promise<any>[] = [];
    if (packagingMaterials.length === 0) {
      masterPromises.push(packagingService.getPackagingMaterials().then((res) => { packagingMaterials = res; }));
    }
    if (rawMaterials.length === 0) {
      masterPromises.push(materialService.getMaterials().then((res) => { rawMaterials = res; }));
    }

    // Fetch GRN records (with fast timeout/fallback)
    const [grnRecords] = await Promise.all([
      warehouseService.getGrnRecords(),
      ...masterPromises,
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
      const existingReport = storedReports.find((r) => r.id === stableId || r.grnId === grn.id || r.grnNumber === grn.grnNumber);

      // Resolve dynamic QC parameters registered in Master Data (Bagian B)
      let resolvedParams: Array<{ name: string; spec: string }> = [];
      if (grn.materialType === 'packaging') {
        const matchedPM = packagingMaterials.find(
          (pm) => pm.code === grn.materialCode || pm.name.toLowerCase() === grn.materialName.toLowerCase()
        );
        if (matchedPM?.qcParameters && matchedPM.qcParameters.length > 0) {
          resolvedParams = matchedPM.qcParameters
            .filter((p) => p.name && p.name.trim())
            .map((p) => ({ name: p.name, spec: p.specification || 'Sesuai Standar Spesifikasi Mutu' }));
        }
      } else {
        const matchedRM = rawMaterials.find(
          (rm) => rm.code === grn.materialCode || rm.name.toLowerCase() === grn.materialName.toLowerCase()
        );
        if (matchedRM?.qcParameters && matchedRM.qcParameters.length > 0) {
          resolvedParams = matchedRM.qcParameters
            .filter((p) => p.name && p.name.trim())
            .map((p) => ({ name: p.name, spec: p.specification || 'Sesuai Standar Spesifikasi Mutu' }));
        }
      }

      // Exact criteria from Master Bagian B (zero hardcoded defaults)
      const effectiveParamTemplates = resolvedParams;

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

        // Restore remote QC payload if available from Supabase notes
        if (grn.qcPayload) {
          if (grn.qcPayload.parameters && Array.isArray(grn.qcPayload.parameters) && grn.qcPayload.parameters.length > 0) {
            parameters = grn.qcPayload.parameters;
          }
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

        if (!retestDate && grn.materialType === 'raw') {
          retestDate = grn.retestDate || calculateAutoRetestDate('raw', grn.expiryDate, grn.receivedDate);
        }

        const effectiveStatus: QcInspectionStatus = (grn.qcPayload?.status as QcInspectionStatus) ||
          (grn.qcStatus as QcInspectionStatus) ||
          'QUARANTINE';
        const isOfficialDone = ['PASSED', 'PASSED_WITH_DEVIATION', 'REJECTED'].includes(effectiveStatus);

        let rawLot = grn.internalLotNumber || grn.qcPayload?.lotInternalNumber;
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
            existingReport.parameters = grn.qcPayload.parameters.map((remoteP: any) => {
              const localP = existingReport.parameters?.find(
                (lp) => lp.parameterName === remoteP.parameterName || lp.id === remoteP.id
              );
              const remoteVal = typeof remoteP.resultValue === 'string' ? remoteP.resultValue.trim() : '';
              const localVal = localP && typeof localP.resultValue === 'string' ? localP.resultValue.trim() : '';
              const finalVal = remoteVal !== '' ? remoteP.resultValue : (localVal !== '' ? localP.resultValue : '');

              return {
                ...remoteP,
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
        // If the report is in QUARANTINE (untested), ensure all criteria from Master Data are fully synced
        if (existingReport.status === 'QUARANTINE') {
          const isParameterCountMismatch = existingReport.parameters.length !== effectiveParamTemplates.length;
          const isNameMismatch = effectiveParamTemplates.some(
            (ep, idx) => existingReport.parameters[idx]?.parameterName !== ep.name
          );

          if (isParameterCountMismatch || isNameMismatch) {
            existingReport.parameters = effectiveParamTemplates.map((item, idx) => ({
              id: `param-${Date.now()}-${idx}`,
              parameterName: item.name,
              specification: item.spec,
              resultValue: existingReport.parameters.find(p => p.parameterName === item.name)?.resultValue || '',
              isCompliant: existingReport.parameters.find(p => p.parameterName === item.name)?.isCompliant ?? true,
            }));
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          isModified = true;
        }
      }
    });

    memoryReports = storedReports;
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

    report.parameters = parameters;
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

    // 1. Sync complete QC report payload (with filled parameters) directly to Supabase FIRST
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

    // Sync to warehouse
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

        // Synchronize directly with Supabase via warehouseService
        await warehouseService.updateGrnRecord(target.id, {
          qcStatus: newStatus as any,
          notes: opts.notes || target.notes,
          qcPayload: target.qcPayload,
          revertReason: opts.revertReason !== undefined ? opts.revertReason : target.revertReason,
          revertedBy: opts.revertedBy !== undefined ? opts.revertedBy : target.revertedBy,
          revertedAt: opts.revertedAt !== undefined ? opts.revertedAt : target.revertedAt,
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
      ? reports.filter((r) => r.id === reportId)
      : reports.filter((r) => r.status === 'QUARANTINE');

    for (const rep of targetReports) {
      let masterParams: Array<{ name: string; spec: string }> = [];
      if (rep.materialType === 'packaging') {
        const pm = packagingMaterials.find(
          (p) => p.code === rep.materialCode || p.name.toLowerCase() === rep.materialName.toLowerCase()
        );
        if (pm?.qcParameters && pm.qcParameters.length > 0) {
          masterParams = pm.qcParameters
            .filter((p) => p.name && p.name.trim())
            .map((p) => ({ name: p.name, spec: p.specification || 'Sesuai Standar Spesifikasi Mutu' }));
        }
      } else {
        const rm = rawMaterials.find(
          (r) => r.code === rep.materialCode || r.name.toLowerCase() === rep.materialName.toLowerCase()
        );
        if (rm?.qcParameters && rm.qcParameters.length > 0) {
          masterParams = rm.qcParameters
            .filter((p) => p.name && p.name.trim())
            .map((p) => ({ name: p.name, spec: p.specification || 'Sesuai Standar Spesifikasi Mutu' }));
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
