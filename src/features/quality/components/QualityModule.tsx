import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  ShieldCheck,
  Clock,
  CheckCircle2,
  FileCheck2,
  Sparkles,
  ArrowLeftCircle,
  Search,
  KeyRound,
  FileText,
  Layers,
  Package,
  Boxes,
  Tag,
  ArrowUpDown,
  ClipboardList,
  Info,
  CalendarDays,
  Plus,
  Trash2,
  AlertTriangle,
  BookOpen,
  Printer,
  X,
  ExternalLink,
  Check,
  Sliders,
  Database,
  QrCode,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { QcInspectionReport } from '../types/qcTypes';
import { qualityService } from '../qualityService';
import { QcInspectionModal } from './QcInspectionModal';
import { QcManagerAuthModal } from './QcManagerAuthModal';
import { QcRevertModal } from './QcRevertModal';
import { QcInspectionReportPdfModal } from './QcInspectionReportPdfModal';
import { QcStatusLabelModal } from './QcStatusLabelModal';
import { QcDiagnosticAuditModal } from './QcDiagnosticAuditModal';
import { QcContainerSamplingQrModal } from './QcContainerSamplingQrModal';
import { IpcBulkBatchRegisterModal } from './IpcBulkBatchRegisterModal';
import { IpcAnalysisModal } from './IpcAnalysisModal';
import { IpcInspectionReportPdfModal } from './IpcInspectionReportPdfModal';
import { IpcStatusLabelModal } from './IpcStatusLabelModal';
import { DeviationModule } from './deviations/DeviationModule';
import { ipcBulkService, IpcAuditResult } from '../services/ipcBulkService';
import { warehouseService } from '../../warehouse/warehouseService';
import { GrnDetailModal } from '../../warehouse/components/GrnDetailModal';
import { GrnRecord } from '../../warehouse/types/grnTypes';
import { Pagination } from '../../../core/ui-components/Pagination';
import { useAuth } from '../../../core/auth/AuthContext';
import { isQualityManager } from '../../../core/auth/permissionGuard';
import { formatDateDDMMMYYYY } from '../../../utils/dateUtils';
import {
  IpcBulkTest,
  IpcFinishedTest,
  IpcReworkTest,
  RetainedSample,
  StabilityStudy,
  SopDocument,
  CapaRecord,
  QualityComplaint,
  initialIpcBulkTests,
  initialIpcFinishedTests,
  initialIpcReworkTests,
  initialRetainedSamples,
  initialStabilityStudies,
  initialSopDocuments,
  initialCapaRecords,
  initialQualityComplaints,
} from '../utils/qcExtData';

interface QualityModuleProps {
  subTab?: string;
}

export const QualityModule: React.FC<QualityModuleProps> = ({ subTab = 'queue' }) => {
  const { user } = useAuth();

  const [reports, setReports] = useState<QcInspectionReport[]>(() => qualityService.getLocalReports());
  const [isLoading, setIsLoading] = useState<boolean>(() => qualityService.getLocalReports().length === 0);
  const [currentTab, setCurrentTab] = useState<
    'queue' | 'testing' | 'approval' | 'archive' | 
    'ipc-bulk' | 'ipc-finished' | 'ipc-rework' | 
    'retained' | 'stability' | 
    'sop' | 'capa' | 'complaints' | 'deviations'
  >('queue');
  
  // Specific material type separation tab for active view (BB vs BK)
  const [activeMaterialType, setActiveMaterialType] = useState<'all' | 'raw' | 'packaging'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const isCompactMode = true;

  // Dedicated Category & Pagination States (Default 20 items/page, 2 Separate Tabs: Bahan Baku vs Bahan Kemas)
  const [queueCategory, setQueueCategory] = useState<'raw' | 'packaging'>('raw');
  const [queuePage, setQueuePage] = useState<number>(1);
  const [queueItemsPerPage, setQueueItemsPerPage] = useState<number>(20);

  const [testingCategory, setTestingCategory] = useState<'raw' | 'packaging'>('raw');
  const [testingPage, setTestingPage] = useState<number>(1);
  const [testingItemsPerPage, setTestingItemsPerPage] = useState<number>(20);

  const [approvalCategory, setApprovalCategory] = useState<'raw' | 'packaging'>('raw');
  const [approvalPage, setApprovalPage] = useState<number>(1);
  const [approvalItemsPerPage, setApprovalItemsPerPage] = useState<number>(20);

  const [archiveCategory, setArchiveCategory] = useState<'raw' | 'packaging'>('raw');
  const [archivePage, setArchivePage] = useState<number>(1);
  const [archiveItemsPerPage, setArchiveItemsPerPage] = useState<number>(20);

  // Extended Quality states
  const [ipcBulkTests, setIpcBulkTests] = useState<IpcBulkTest[]>(initialIpcBulkTests);
  const [ipcFinishedTests, setIpcFinishedTests] = useState<IpcFinishedTest[]>(initialIpcFinishedTests);
  const [ipcReworkTests, setIpcReworkTests] = useState<IpcReworkTest[]>(initialIpcReworkTests);
  const [retainedSamples, setRetainedSamples] = useState<RetainedSample[]>(initialRetainedSamples);
  const [stabilityStudies, setStabilityStudies] = useState<StabilityStudy[]>(initialStabilityStudies);
  const [sopDocuments, setSopDocuments] = useState<SopDocument[]>(initialSopDocuments);
  const [capaRecords, setCapaRecords] = useState<CapaRecord[]>(initialCapaRecords);
  const [qualityComplaints, setQualityComplaints] = useState<QualityComplaint[]>(initialQualityComplaints);

  // Interactive Form Dialog visibility
  const [ipcSubTab, setIpcSubTab] = useState<'analisa' | 'otorisasi' | 'released' | 'reject'>('analisa');
  const [ipcFinishedSubTab, setIpcFinishedSubTab] = useState<'analisa' | 'otorisasi' | 'released' | 'reject'>('analisa');
  const [selectedAnalysisBatch, setSelectedAnalysisBatch] = useState<IpcBulkTest | null>(null);
  const [showIpcRegisterModal, setShowIpcRegisterModal] = useState(false);
  const [latestIpcAuditResult, setLatestIpcAuditResult] = useState<IpcAuditResult | null>(null);

  const [showIpcForm, setShowIpcForm] = useState(false);
  const [newIpc, setNewIpc] = useState<Partial<IpcBulkTest>>({
    batchNo: '', productName: '', pH: 6.0, viscosity: 4000, appearance: 'Homogen, Sesuai Spek', gravity: 1.0, status: 'TESTING', analyst: user?.name || 'Staff QC'
  });

  const [showFinishedForm, setShowFinishedForm] = useState(false);
  const [newFinished, setNewFinished] = useState<Partial<IpcFinishedTest>>({
    batchNo: '', productName: '', packSize: '100 ml', netWeightGrams: 100, sealingIntegrity: 'Tidak Bocor', torqueKgCm: 15, appearance: 'Bersih, Cetakan Label Sempurna', status: 'TESTING', analyst: user?.name || 'Staff QC'
  });

  const [showReworkForm, setShowReworkForm] = useState(false);
  const [newRework, setNewRework] = useState<Partial<IpcReworkTest>>({
    originalBatchNo: '', productName: '', reworkReason: '', pHTest: 6.0, viscosityTest: 4000, microbiology: 'PENDING', status: 'TESTING', authorizedBy: 'Diana Putri (QM)'
  });

  const [showRetainedForm, setShowRetainedForm] = useState(false);
  const [newRetained, setNewRetained] = useState<Partial<RetainedSample>>({
    batchNo: '', productName: '', type: 'Produk Jadi', expiryDate: '2029-09-03', rackNo: '', qty: '3 pcs', status: 'Simpan'
  });

  const [showStabilityForm, setShowStabilityForm] = useState(false);
  const [newStability, setNewStability] = useState<Partial<StabilityStudy>>({
    productName: '', batchNo: '', chamberTemp: '40°C ± 2°C / 75% RH ± 5% (Accelerated)', interval: 'Bulan ke-0 (Accelerated)', pullDate: '2026-09-03', status: 'BERJALAN'
  });

  const [showSopForm, setShowSopForm] = useState(false);
  const [newSop, setNewSop] = useState<Partial<SopDocument>>({
    docNumber: '', title: '', version: '01', effectiveDate: '2026-09-03', category: 'QC', status: 'AKTIF'
  });

  const [showCapaForm, setShowCapaForm] = useState(false);
  const [newCapa, setNewCapa] = useState<Partial<CapaRecord>>({
    devNumber: '', source: 'Deviasi Produksi', description: '', severity: 'MINOR', rootCause: '', correctiveAction: '', preventiveAction: '', status: 'OPEN', targetDate: '2026-09-15'
  });

  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [newComplaint, setNewComplaint] = useState<Partial<QualityComplaint>>({
    customer: '', productName: '', batchNo: '', complaintText: '', investigationText: 'Investigasi sampel pertinggal sedang dikerjakan.', retestResult: 'Menunggu hasil lab.', status: 'OPEN'
  });

  // Modal States
  const [inspectingReport, setInspectingReport] = useState<QcInspectionReport | null>(null);
  const [authorizingReport, setAuthorizingReport] = useState<QcInspectionReport | null>(null);
  const [revertingReport, setRevertingReport] = useState<QcInspectionReport | null>(null);
  const [pdfReport, setPdfReport] = useState<QcInspectionReport | null>(null);
  const [labelReport, setLabelReport] = useState<QcInspectionReport | null>(null);
  const [batchArchiveReportsToPrint, setBatchArchiveReportsToPrint] = useState<QcInspectionReport[]>([]);
  const [selectedArchiveReportIds, setSelectedArchiveReportIds] = useState<string[]>([]);
  const [smartTagReport, setSmartTagReport] = useState<QcInspectionReport | null>(null);
  const [showDiagnosticAudit, setShowDiagnosticAudit] = useState<boolean>(false);
  const [selectedGrnDetail, setSelectedGrnDetail] = useState<GrnRecord | null>(null);
  const [ipcPdfBatch, setIpcPdfBatch] = useState<IpcBulkTest | null>(null);
  const [ipcLabelState, setIpcLabelState] = useState<{ batch: IpcBulkTest; type: 'QUARANTINE' | 'RELEASED' } | null>(null);

  const handleOpenGrnDetail = (report: QcInspectionReport) => {
    const localGrns = warehouseService.getLocalRecords();
    const matched = localGrns.find(
      (g) => g.id === report.grnId || g.grnNumber === report.grnNumber
    );
    if (matched) {
      setSelectedGrnDetail(matched);
    } else {
      setSelectedGrnDetail({
        id: report.grnId || report.id,
        grnNumber: report.grnNumber,
        materialType: report.materialType,
        materialId: '',
        materialCode: report.materialCode,
        materialName: report.materialName,
        manufacturer: report.manufacturer,
        distributor: report.distributor || '-',
        poNumber: report.poNumber || '-',
        deliveryNoteNumber: report.deliveryNoteNumber || '-',
        batchNumber: report.batchNumberVendor,
        receivedDate: report.receivedDate,
        expiryDate: report.expiryDate,
        quantityReceived: report.quantityReceived,
        unit: report.unit,
        containerCount: report.containerCount,
        containerType: report.containerType,
        storageLocation: report.storageLocation,
        storageConditions: report.storageConditions,
        qcStatus: report.status as any,
        qcParametersCount: report.parameters?.length || 0,
        receivedBy: 'Staff Gudang',
        createdAt: report.createdAt || new Date().toISOString(),
      });
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [data, ipcBatches] = await Promise.all([
        qualityService.getReports(),
        ipcBulkService.getBatches(),
      ]);
      setReports(data);
      if (ipcBatches && ipcBatches.length > 0) {
        setIpcBulkTests(ipcBatches);
      }
    } catch (e) {
      console.error('Error loading QC reports:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      qualityService.getReports().then((data) => {
        setReports(data);
      });
    };

    window.addEventListener('qc_reports_updated', handleUpdate);
    window.addEventListener('qc_sampling_updated', handleUpdate);
    window.addEventListener('warehouse_grn_updated', handleUpdate);

    return () => {
      window.removeEventListener('qc_reports_updated', handleUpdate);
      window.removeEventListener('qc_sampling_updated', handleUpdate);
      window.removeEventListener('warehouse_grn_updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (subTab) {
      setCurrentTab(subTab as any);
    }
  }, [subTab]);

  // Check URL query parameter for direct CoA access from QR scan
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const rawCoaQuery = urlParams.get('coa') || urlParams.get('coaId') || urlParams.get('reportId') || urlParams.get('lot');
    
    if (rawCoaQuery && reports.length > 0) {
      let targetTerm = rawCoaQuery.trim().toLowerCase();
      
      // Handle legacy format LMS|QC|LOT:LBB2609001|...
      if (targetTerm.includes('lot:')) {
        const parts = targetTerm.split('|');
        const lotPart = parts.find((p) => p.startsWith('lot:'));
        if (lotPart) {
          targetTerm = lotPart.replace('lot:', '').trim();
        }
      }

      const found = reports.find((r) => {
        const lot = (r.lotInternalNumber || '').toLowerCase();
        const grn = (r.grnNumber || '').toLowerCase();
        const repNum = (r.reportNumber || '').toLowerCase();
        const id = (r.id || '').toLowerCase();

        return (
          id === targetTerm ||
          lot === targetTerm ||
          grn === targetTerm ||
          repNum === targetTerm ||
          (lot && targetTerm.includes(lot)) ||
          (grn && targetTerm.includes(grn)) ||
          (repNum && targetTerm.includes(repNum))
        );
      });

      if (found) {
        setPdfReport(found);
      }
    }
  }, [reports]);

  // Filtered lists for each tab, sorted from oldest to newest (ascending)
  const filterBySearchAndType = (list: QcInspectionReport[], forcedType?: 'all' | 'raw' | 'packaging') => {
    const activeType = forcedType !== undefined ? forcedType : activeMaterialType;
    return list
      .filter((item) => {
        const matchType = activeType === 'all' || item.materialType === activeType;
        const q = searchQuery.toLowerCase();
        const matchSearch =
          !q ||
          item.grnNumber.toLowerCase().includes(q) ||
          (item.lotInternalNumber && item.lotInternalNumber.toLowerCase().includes(q)) ||
          item.materialCode.toLowerCase().includes(q) ||
          item.materialName.toLowerCase().includes(q) ||
          item.batchNumberVendor.toLowerCase().includes(q) ||
          item.manufacturer.toLowerCase().includes(q);
        return matchType && matchSearch;
      })
      .sort((a, b) => {
        // Sort oldest to newest (First In First Analyzed)
        const timeA = new Date(a.receivedDate || a.createdAt).getTime();
        const timeB = new Date(b.receivedDate || b.createdAt).getTime();
        return timeA - timeB;
      });
  };

  // 1. Antrean Karantina
  const quarantineReports = reports.filter((r) => r.status === 'QUARANTINE');
  const queueList = filterBySearchAndType(quarantineReports, activeMaterialType);
  const queueRawList = filterBySearchAndType(quarantineReports, 'raw');
  const queuePackagingList = filterBySearchAndType(quarantineReports, 'packaging');

  // 2. Proses Uji Lab
  const testingReports = reports.filter((r) => r.status === 'QUALITY_CONTROL_PROCESS');
  const testingList = filterBySearchAndType(testingReports, activeMaterialType);
  const testingRawList = filterBySearchAndType(testingReports, 'raw');
  const testingPackagingList = filterBySearchAndType(testingReports, 'packaging');

  // 3. Menunggu Approval QM
  const approvalReports = reports.filter((r) => r.status === 'AWAITING_QM_AUTHORIZATION');
  const approvalList = filterBySearchAndType(approvalReports, activeMaterialType);
  const approvalRawList = filterBySearchAndType(approvalReports, 'raw');
  const approvalPackagingList = filterBySearchAndType(approvalReports, 'packaging');

  // 4. Arsip Laporan Resmi Selesai
  const archiveReports = reports.filter(
    (r) =>
      r.status === 'PASSED' ||
      r.status === 'PASSED_WITH_DEVIATION' ||
      r.status === 'REJECTED'
  );
  const archiveList = filterBySearchAndType(archiveReports, activeMaterialType);
  const archiveRawList = filterBySearchAndType(archiveReports, 'raw');
  const archivePackagingList = filterBySearchAndType(archiveReports, 'packaging');

  // 5. Item Direvert ke Gudang (Menunggu Perbaikan Gudang)
  const revertedReports = reports.filter((r) => r.status === 'REVERTED_TO_WAREHOUSE');
  const revertedList = filterBySearchAndType(revertedReports, activeMaterialType);

  // Actions
  const handleStartInspection = async (report: QcInspectionReport) => {
    if (!user) return;
    const updated = await qualityService.startInspectionProcess(report.id, user);
    setReports((prev) => prev.map((r) => (r.id === updated.id || r.grnNumber === updated.grnNumber ? updated : r)));
    setInspectingReport(updated);
  };

  const handleSubmitStaffAnalysis = async (
    reportId: string,
    parameters: any[],
    staffDecision: 'RELEASE' | 'REJECT',
    staffNotes: string,
    passwordInput: string,
    actualSampleSize?: number,
    actualSampleUnit?: string,
    retestDate?: string,
    sampledContainers?: string,
    samplingDateTime?: string
  ) => {
    if (!user) return;
    const updated = await qualityService.submitStaffAnalysis(
      reportId,
      parameters,
      staffDecision,
      staffNotes,
      user,
      passwordInput,
      actualSampleSize,
      actualSampleUnit,
      retestDate,
      sampledContainers,
      samplingDateTime
    );
    setReports((prev) => prev.map((r) => (r.id === updated.id || r.grnNumber === updated.grnNumber ? updated : r)));
    setCurrentTab('approval');
  };

  const handleAuthorizeManager = async (
    reportId: string,
    decision: 'RELEASE' | 'RELEASE_BY_DEVIATION' | 'REJECT',
    deviationNumber: string,
    qmNotes: string,
    passwordInput: string
  ) => {
    if (!user) return;
    const updated = await qualityService.authorizeQualityManager(
      reportId,
      decision,
      deviationNumber,
      qmNotes,
      user,
      passwordInput
    );
    setReports((prev) => prev.map((r) => (r.id === updated.id || r.grnNumber === updated.grnNumber ? updated : r)));
    setPdfReport(updated);
  };

  const handleConfirmRevert = async (reportId: string, reason: string, passwordInput: string) => {
    if (!user) return;
    const updated = await qualityService.revertToWarehouse(reportId, reason, user, passwordInput);
    setReports((prev) => prev.map((r) => (r.id === updated.id || r.grnNumber === updated.grnNumber ? updated : r)));
  };

  const handleRevertToLab = async (reportId: string, revisionInstruction: string, passwordInput: string) => {
    if (!user) return;
    const updated = await qualityService.revertToLabProcess(reportId, revisionInstruction, user, passwordInput);
    setReports((prev) => prev.map((r) => (r.id === updated.id || r.grnNumber === updated.grnNumber ? updated : r)));
    setCurrentTab('testing');
  };

  const stats = {
    totalQuarantine: quarantineReports.length,
    quarantineRaw: quarantineReports.filter((r) => r.materialType === 'raw').length,
    quarantinePkg: quarantineReports.filter((r) => r.materialType === 'packaging').length,
    
    inTesting: testingReports.length,
    testingRaw: testingReports.filter((r) => r.materialType === 'raw').length,
    testingPkg: testingReports.filter((r) => r.materialType === 'packaging').length,

    awaitingApproval: approvalReports.length,
    approvalRaw: approvalReports.filter((r) => r.materialType === 'raw').length,
    approvalPkg: approvalReports.filter((r) => r.materialType === 'packaging').length,

    archiveTotal: archiveReports.length,
    archiveRaw: archiveReports.filter((r) => r.materialType === 'raw').length,
    archivePkg: archiveReports.filter((r) => r.materialType === 'packaging').length,
    passed: reports.filter((r) => r.status === 'PASSED' || r.status === 'PASSED_WITH_DEVIATION').length,
    rejected: reports.filter((r) => r.status === 'REJECTED').length,
  };

  // Reusable Material Toggle Bar for Each Workflow Stage
  const renderMaterialFilterTabs = (rawCount: number, pkgCount: number, totalCount: number) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setActiveMaterialType('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeMaterialType === 'all'
              ? 'bg-white text-teal-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Semua ({totalCount})
        </button>
        <button
          onClick={() => setActiveMaterialType('raw')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeMaterialType === 'raw'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-teal-800 hover:bg-teal-50'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          Bahan Baku (BB) ({rawCount})
        </button>
        <button
          onClick={() => setActiveMaterialType('packaging')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeMaterialType === 'packaging'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'text-purple-800 hover:bg-purple-50'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          Bahan Kemas (BK) ({pkgCount})
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
        <span>Urutan: Terlama ke Terbaru (First-In First-Tested)</span>
      </div>
    </div>
  );

  // Table 1: Antrean Karantina Table
  const renderQueueTable = (items: QcInspectionReport[], emptyText: string, startIndex: number = 0) => (
    <table className={`w-full text-left border-collapse ${isCompactMode ? 'text-[11px]' : 'text-xs'}`}>
      <thead>
        <tr className={`border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/50 ${isCompactMode ? 'text-[10px]' : 'text-[11px]'}`}>
          <th className={`${isCompactMode ? 'p-1.5 w-8' : 'p-3 w-10'} text-center`}>No</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>No. GRN & Tgl Masuk</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Material & Produsen</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Kuantitas & Koli</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Rencana Sampling</th>
          <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>Status</th>
          <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>Aksi QC</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <tr>
            <td colSpan={7} className={`${isCompactMode ? 'p-4' : 'p-8'} text-center text-slate-400`}>
              {emptyText}
            </td>
          </tr>
        ) : (
          items.map((item, idx) => (
            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center font-mono text-slate-400`}>{startIndex + idx + 1}</td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenGrnDetail(item);
                  }}
                  className="font-mono font-bold text-blue-700 hover:text-blue-900 group/grn flex items-center gap-1.5 text-left cursor-pointer transition-colors"
                  title="Klik untuk membuka detail bukti penerimaan barang (GRN)"
                >
                  <span className="bg-blue-50/90 group-hover/grn:bg-blue-100/90 group-hover/grn:underline text-blue-800 px-1.5 py-0.5 rounded border border-blue-200/80 shadow-2xs">
                    {item.grnNumber}
                  </span>
                </button>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400 mt-0.5`}>{formatDateDDMMMYYYY(item.receivedDate)}</div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-bold rounded-md ${
                      isCompactMode ? 'px-1.5 py-0.2 text-[9.5px]' : 'px-2 py-0.5 text-[11px]'
                    } ${
                      item.materialType === 'raw'
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {item.materialCode}
                  </span>
                  <span className="font-bold text-slate-800">{item.materialName}</span>
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500`}>
                  Produsen: {item.manufacturer} • Batch: {item.batchNumberVendor}
                </div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className="font-bold text-slate-800 font-mono">
                  {item.quantityReceived.toLocaleString('id-ID', { minimumFractionDigits: 3 })} {item.unit}
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500`}>
                  {item.containerCount} {item.containerType}
                </div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className="font-semibold text-teal-900">
                  {item.samplingInfo.sampleSizeQuantity} {item.samplingInfo.sampleUnit}
                  {item.samplingInfo.sampleSizeCodeLetter && (
                    <span className="ml-1 text-[9px] px-1.5 py-0.2 bg-teal-100 rounded text-teal-800 font-mono">
                      Code {item.samplingInfo.sampleSizeCodeLetter}
                    </span>
                  )}
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400`}>
                  {item.samplingInfo.samplingStandard}
                </div>
              </td>
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>
                <span className={`rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300 ${isCompactMode ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}>
                  KARANTINA
                </span>
              </td>
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => setSmartTagReport(item)}
                    title="Buka Smart Tag QR Wadah (Paperless Sampling CPKB)"
                    className={`${isCompactMode ? 'p-1' : 'p-1.5'} text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors cursor-pointer flex items-center gap-1`}
                  >
                    <QrCode className="w-4 h-4" />
                    {!isCompactMode && <span className="text-[11px] font-bold">Tag QR</span>}
                  </button>
                  <button
                    onClick={() => setRevertingReport(item)}
                    title="Revert ke Gudang (Koreksi Data)"
                    className={`${isCompactMode ? 'p-1' : 'p-1.5'} text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer`}
                  >
                    <ArrowLeftCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleStartInspection(item)}
                    className={`inline-flex items-center gap-1 ${isCompactMode ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5'} bg-teal-700 hover:bg-teal-800 active:scale-98 text-white rounded-lg font-bold shadow-xs transition-all cursor-pointer`}
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    Mulai Proses QC
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  // Table 2: Proses Uji Lab Table
  const renderTestingTable = (items: QcInspectionReport[], emptyText: string, startIndex: number = 0) => (
    <table className={`w-full text-left border-collapse ${isCompactMode ? 'text-[11px]' : 'text-xs'}`}>
      <thead>
        <tr className={`border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/50 ${isCompactMode ? 'text-[10px]' : 'text-[11px]'}`}>
          <th className={`${isCompactMode ? 'p-1.5 w-8' : 'p-3 w-10'} text-center`}>No</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>No. GRN</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Material & Batch</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Sampel yang Diuji</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Parameter Uji</th>
          <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>Status</th>
          <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>Tindakan</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <tr>
            <td colSpan={7} className={`${isCompactMode ? 'p-4' : 'p-8'} text-center text-slate-400`}>
              {emptyText}
            </td>
          </tr>
        ) : (
          items.map((item, idx) => (
            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center font-mono text-slate-400`}>{startIndex + idx + 1}</td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenGrnDetail(item);
                  }}
                  className="font-mono font-bold text-blue-700 hover:text-blue-900 group/grn flex items-center gap-1.5 text-left cursor-pointer transition-colors"
                  title="Klik untuk membuka detail bukti penerimaan barang (GRN)"
                >
                  <span className="bg-blue-50/90 group-hover/grn:bg-blue-100/90 group-hover/grn:underline text-blue-800 px-1.5 py-0.5 rounded border border-blue-200/80 shadow-2xs">
                    {item.grnNumber}
                  </span>
                </button>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400 mt-0.5`}>Tgl: {formatDateDDMMMYYYY(item.receivedDate)}</div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`font-mono font-bold rounded-md ${
                      isCompactMode ? 'px-1.5 py-0.2 text-[9.5px]' : 'px-2 py-0.5 text-[11px]'
                    } ${
                      item.materialType === 'raw' ? 'bg-teal-100 text-teal-800' : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {item.materialCode}
                  </span>
                  <span className="font-bold text-slate-900">{item.materialName}</span>
                  {item.qmRevertToLabReason && (
                    <span className="bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-[9px] px-1.5 py-0.2 rounded-md animate-pulse">
                      REVISI QM
                    </span>
                  )}
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500`}>
                  Batch: {item.batchNumberVendor} • {item.quantityReceived.toLocaleString('id-ID', { minimumFractionDigits: 3 })} {item.unit}
                </div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className="font-bold text-teal-800">
                  {item.actualSampleSize !== undefined && item.actualSampleSize !== null
                    ? `${item.actualSampleSize} ${item.actualSampleUnit || (item.materialType === 'raw' ? 'gram' : 'pcs')}`
                    : `${item.samplingInfo.sampleSizeQuantity} ${item.samplingInfo.sampleUnit}`}
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400`}>
                  {item.actualSampleSize !== undefined && item.actualSampleSize !== null
                    ? `Rencana: ${item.samplingInfo.sampleSizeQuantity} ${item.samplingInfo.sampleUnit}`
                    : (item.samplingInfo.sampleSizeCodeLetter ? `MIL-STD Code: ${item.samplingInfo.sampleSizeCodeLetter}` : 'Formula CPKB √N+1')}
                </div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className="font-semibold text-slate-700">
                  {item.parameters.length} Parameter Uji
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400`}>
                  {item.parameters.filter((p) => p.resultValue).length}/{item.parameters.length} terisi
                </div>
              </td>
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>
                <span className={`rounded-full font-bold bg-teal-100 text-teal-800 border border-teal-300 animate-pulse ${isCompactMode ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}>
                  PROSES UJI LAB
                </span>
              </td>
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => setSmartTagReport(item)}
                    title="Buka Smart Tag QR Wadah (Paperless Sampling CPKB)"
                    className={`${isCompactMode ? 'p-1' : 'p-1.5'} text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors cursor-pointer flex items-center gap-1`}
                  >
                    <QrCode className="w-4 h-4" />
                    {!isCompactMode && <span className="text-[11px] font-bold">Tag QR</span>}
                  </button>
                  <button
                    onClick={() => setRevertingReport(item)}
                    title="Revert ke Gudang"
                    className={`${isCompactMode ? 'p-1' : 'p-1.5'} text-slate-400 hover:text-amber-600 rounded-lg cursor-pointer`}
                  >
                    <ArrowLeftCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setInspectingReport(item)}
                    className={`inline-flex items-center gap-1 ${isCompactMode ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5'} bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold shadow-xs cursor-pointer`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Input & Selesaikan Analisa
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  // Table 3: Menunggu Otorisasi Manager Table
  const renderApprovalTable = (items: QcInspectionReport[], emptyText: string, startIndex: number = 0) => (
    <table className={`w-full text-left border-collapse ${isCompactMode ? 'text-[11px]' : 'text-xs'}`}>
      <thead>
        <tr className={`border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/50 ${isCompactMode ? 'text-[10px]' : 'text-[11px]'}`}>
          <th className={`${isCompactMode ? 'p-1.5 w-8' : 'p-3 w-10'} text-center`}>No</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>No. Lot Internal</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Material & GRN Asal</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Rekomendasi Staf</th>
          <th className={isCompactMode ? 'p-1.5' : 'p-3'}>AI Kepatuhan</th>
          <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>Status</th>
          <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>Otorisasi QM</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <tr>
            <td colSpan={7} className={`${isCompactMode ? 'p-4' : 'p-8'} text-center text-slate-400`}>
              {emptyText}
            </td>
          </tr>
        ) : (
          items.map((item, idx) => (
            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center font-mono text-slate-400`}>{startIndex + idx + 1}</td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className={`font-mono font-bold text-indigo-900 ${isCompactMode ? 'text-xs' : 'text-sm'}`}>
                  {item.lotInternalNumber || 'Laporan Terbit'}
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400`}>
                  Oleh: {item.staffSignature?.signerName}
                </div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-bold rounded-md ${
                      isCompactMode ? 'px-1.5 py-0.2 text-[9.5px]' : 'px-2 py-0.5 text-[11px]'
                    } ${
                      item.materialType === 'raw' ? 'bg-teal-100 text-teal-800' : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {item.materialCode}
                  </span>
                  <span className="font-bold text-slate-900">{item.materialName}</span>
                </div>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500`}>
                  GRN: {item.grnNumber} • Batch: {item.batchNumberVendor}
                  {item.actualSampleSize !== undefined && item.actualSampleSize !== null && (
                    <span className="ml-1 text-teal-700 font-semibold">
                      • Sampel: {item.actualSampleSize} {item.actualSampleUnit || (item.materialType === 'raw' ? 'gram' : 'pcs')}
                    </span>
                  )}
                </div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                <span
                  className={`rounded-full font-bold ${isCompactMode ? 'px-2 py-0.2 text-[9px]' : 'px-2.5 py-0.5 text-[10px]'} ${
                    item.staffDecision === 'RELEASE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {item.staffDecision === 'RELEASE'
                    ? 'MEMENUHI SYARAT (RILIS)'
                    : 'TIDAK MEMENUHI SYARAT (REJECT)'}
                </span>
                <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500 mt-0.5 truncate max-w-xs`}>
                  {item.staffNotes || 'Selesai diuji analis.'}
                </div>
              </td>
              <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                {item.aiAssessment && (
                  <div className="flex items-center gap-1 font-semibold text-purple-900">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>{item.aiAssessment.complianceScore}% Sesuai</span>
                  </div>
                )}
              </td>
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>
                <span className={`rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 ${isCompactMode ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}>
                  AWAITING QM
                </span>
              </td>
              <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => setSmartTagReport(item)}
                    title="Buka Smart Tag QR Wadah (Paperless Sampling CPKB)"
                    className={`${isCompactMode ? 'p-1' : 'p-1.5'} text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1`}
                  >
                    <QrCode className="w-4 h-4" />
                    {!isCompactMode && <span className="text-[11px] font-bold">Tag QR</span>}
                  </button>
                  {isQualityManager(user) ? (
                    <button
                      onClick={async () => {
                        const fresh = await qualityService.getReportById(item.id);
                        setAuthorizingReport(fresh || item);
                      }}
                      className={`inline-flex items-center gap-1.5 ${isCompactMode ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5'} bg-indigo-700 hover:bg-indigo-800 active:scale-98 text-white rounded-lg font-bold shadow-md transition-all cursor-pointer`}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Otorisasi Manager
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        const fresh = await qualityService.getReportById(item.id);
                        setAuthorizingReport(fresh || item);
                      }}
                      className={`inline-flex items-center gap-1.5 ${isCompactMode ? 'px-2 py-1 text-xs' : 'px-3 py-1.5'} bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium border border-slate-300 transition-all cursor-pointer`}
                      title="Hanya Quality Manager / Admin yang dapat menandatangani"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      Lihat Antrean (Khusus QM)
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  // Table 4: Arsip Laporan & Lot Terbit Table
  const renderArchiveTable = (items: QcInspectionReport[], emptyText: string, startIndex: number = 0) => {
    const isAllCurrentSelected = items.length > 0 && items.every((item) => selectedArchiveReportIds.includes(item.id));

    const toggleSelectAllCurrent = () => {
      if (isAllCurrentSelected) {
        const itemIds = new Set(items.map((i) => i.id));
        setSelectedArchiveReportIds((prev) => prev.filter((id) => !itemIds.has(id)));
      } else {
        const newIds = new Set(selectedArchiveReportIds);
        items.forEach((i) => newIds.add(i.id));
        setSelectedArchiveReportIds(Array.from(newIds));
      }
    };

    const toggleSelectReport = (id: string) => {
      setSelectedArchiveReportIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    const handleTriggerBatchArchivePrint = () => {
      const selected = reports.filter((r) => selectedArchiveReportIds.includes(r.id));
      if (selected.length === 0) return;
      setLabelReport(null);
      setBatchArchiveReportsToPrint(selected);
    };

    return (
      <div className="space-y-3">
        {/* Batch Action Bar for Multiple QC Labels Printing */}
        {selectedArchiveReportIds.length > 0 && (
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg border border-emerald-500 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="bg-slate-900 text-emerald-300 px-3 py-1 rounded-xl text-xs font-black shadow-xs">
                {selectedArchiveReportIds.length} Lot QC Terpilih
              </span>
              <span className="text-xs font-semibold text-emerald-50">
                Siap cetak massal label status kelulusan QC roll thermal 100×100 mm (Hijau Rilis / Merah Tolak)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedArchiveReportIds([])}
                className="px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-bold text-white transition-colors cursor-pointer shadow-2xs"
              >
                Batal Pilihan
              </button>
              <button
                type="button"
                onClick={handleTriggerBatchArchivePrint}
                className="px-4 py-1.5 rounded-xl bg-slate-950 hover:bg-black text-emerald-300 text-xs font-black shadow-md flex items-center gap-2 transition-all cursor-pointer hover:scale-102 active:scale-98"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Cetak Massal Label QC ({selectedArchiveReportIds.length} Lot)</span>
              </button>
            </div>
          </div>
        )}

        <table className={`w-full text-left border-collapse ${isCompactMode ? 'text-[11px]' : 'text-xs'}`}>
          <thead>
            <tr className={`border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/50 ${isCompactMode ? 'text-[10px]' : 'text-[11px]'}`}>
              <th className={`${isCompactMode ? 'p-1.5 w-8' : 'p-3 w-9'} text-center`}>
                <input
                  type="checkbox"
                  checked={isAllCurrentSelected}
                  onChange={toggleSelectAllCurrent}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-3.5 h-3.5"
                  title="Pilih semua di halaman ini"
                />
              </th>
              <th className={`${isCompactMode ? 'p-1.5 w-8' : 'p-3 w-10'} text-center`}>No</th>
              <th className={isCompactMode ? 'p-1.5' : 'p-3'}>No. Lot / Laporan</th>
              <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Material & Produsen</th>
              <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Kuantitas Masuk</th>
              <th className={isCompactMode ? 'p-1.5' : 'p-3'}>Disposisi Quality Manager</th>
              <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>Status Akhir</th>
              <th className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>Dokumen & Label</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className={`${isCompactMode ? 'p-4' : 'p-8'} text-center text-slate-400`}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const isSelected = selectedArchiveReportIds.includes(item.id);
                return (
                  <tr key={item.id} className={`transition-colors ${isSelected ? 'bg-emerald-50/90 hover:bg-emerald-100/80' : 'hover:bg-slate-50/80'}`}>
                    <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectReport(item.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-3.5 h-3.5"
                        title={`Pilih ${item.lotInternalNumber || item.grnNumber}`}
                      />
                    </td>
                    <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center font-mono text-slate-400`}>{startIndex + idx + 1}</td>
                    <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                      <div className={`font-mono font-bold text-slate-900 ${isCompactMode ? 'text-xs' : 'text-sm'}`}>
                        {item.lotInternalNumber || item.grnNumber}
                      </div>
                      <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400`}>GRN: {item.grnNumber}</div>
                    </td>
                    <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono font-bold rounded-md ${
                            isCompactMode ? 'px-1.5 py-0.2 text-[9.5px]' : 'px-2 py-0.5 text-[11px]'
                          } ${
                            item.materialType === 'raw' ? 'bg-teal-100 text-teal-800' : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {item.materialCode}
                        </span>
                        <span className="font-bold text-slate-900">{item.materialName}</span>
                      </div>
                      <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500`}>
                        Produsen: {item.manufacturer} • Batch: {item.batchNumberVendor}
                      </div>
                    </td>
                    <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                      <div className="font-bold text-slate-800">
                        {item.quantityReceived.toLocaleString('id-ID', { minimumFractionDigits: 3 })} {item.unit}
                      </div>
                      <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500`}>
                        {item.containerCount} {item.containerType}
                      </div>
                    </td>
                    <td className={isCompactMode ? 'p-1.5' : 'p-3'}>
                      <div className="font-semibold text-slate-800">
                        {item.qmSignature?.signerName || '-'}
                      </div>
                      <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-500 font-mono`}>
                        {item.qmSignature?.signedAt ? new Date(item.qmSignature.signedAt).toLocaleDateString('id-ID') : '-'}
                      </div>
                    </td>
                    <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-center`}>
                      <span
                        className={`rounded-full font-bold border ${isCompactMode ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${
                          item.status === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : item.status === 'PASSED_WITH_DEVIATION'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : item.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {item.status === 'PASSED'
                          ? 'RELEASE'
                          : item.status === 'PASSED_WITH_DEVIATION'
                          ? 'RELEASE BY DEVIATION'
                          : item.status === 'REJECTED'
                          ? 'REJECT'
                          : 'KARANTINA'}
                      </span>
                    </td>
                    <td className={`${isCompactMode ? 'p-1.5' : 'p-3'} text-right`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setBatchArchiveReportsToPrint([]);
                            setSmartTagReport(item);
                          }}
                          title="Buka Smart Tag QR Wadah (Paperless Sampling CPKB)"
                          className={`inline-flex items-center gap-1 ${isCompactMode ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'} bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-lg transition-colors cursor-pointer`}
                        >
                          <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                          Smart Tag
                        </button>
                        <button
                          onClick={() => {
                            setBatchArchiveReportsToPrint([]);
                            setLabelReport(item);
                          }}
                          title="Cetak Label Status QC"
                          className={`inline-flex items-center gap-1 ${isCompactMode ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'} bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer`}
                        >
                          <Tag className="w-3.5 h-3.5" />
                          Label
                        </button>
                        <button
                          onClick={() => setPdfReport(item)}
                          className={`inline-flex items-center gap-1.5 ${isCompactMode ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5'} bg-teal-700 hover:bg-teal-800 active:scale-98 text-white rounded-lg font-bold shadow-xs cursor-pointer`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Laporan PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 rounded-2xl p-4 sm:p-6 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-500/20 rounded-xl border border-teal-400/30 shrink-0">
              <FlaskConical className="w-5 h-5 sm:w-6 sm:h-6 text-teal-300" />
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight leading-snug">
              Quality Assurance & Laboratorium Pengawasan Mutu (QC)
            </h2>
          </div>
          <p className="text-xs text-teal-100/80 font-normal">
            PT. LARASSANTI MAKMUR SEJAHTERA • Standar CPKB (Bahan Baku n = 1 + √N) & MIL-STD-105E Level II (Bahan Kemas)
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => setShowDiagnosticAudit(true)}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-teal-700/80 hover:bg-teal-600 text-white text-xs font-bold border border-teal-400/40 flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Audit Komparasi Kriteria Master Kemasan (15) vs Checklist Lab (5)"
          >
            <Database className="w-4 h-4 text-teal-200" />
            <span className="hidden sm:inline">Audit Diagnostik Master vs Lab</span>
            <span className="sm:hidden">Audit DB</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div
          onClick={() => setCurrentTab('queue')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            currentTab === 'queue'
              ? 'bg-amber-500/10 border-amber-500 shadow-sm ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Antrean Karantina</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1">{stats.totalQuarantine}</div>
          <div className="text-[11px] text-slate-500 flex gap-2 font-medium">
            <span>BB: {stats.quarantineRaw}</span>
            <span>•</span>
            <span>BK: {stats.quarantinePkg}</span>
          </div>
        </div>

        <div
          onClick={() => setCurrentTab('testing')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            currentTab === 'testing'
              ? 'bg-teal-500/10 border-teal-500 shadow-sm ring-2 ring-teal-500/20'
              : 'bg-white border-slate-200 hover:border-teal-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Proses Uji Lab</span>
            <FlaskConical className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-teal-700 mt-1">{stats.inTesting}</div>
          <div className="text-[11px] text-slate-500 flex gap-2 font-medium">
            <span>BB: {stats.testingRaw}</span>
            <span>•</span>
            <span>BK: {stats.testingPkg}</span>
          </div>
        </div>

        <div
          onClick={() => setCurrentTab('approval')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            currentTab === 'approval'
              ? 'bg-indigo-500/10 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
              : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Menunggu Approval QM</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-700 mt-1">{stats.awaitingApproval}</div>
          <div className="text-[11px] text-slate-500 flex gap-2 font-medium">
            <span>BB: {stats.approvalRaw}</span>
            <span>•</span>
            <span>BK: {stats.approvalPkg}</span>
          </div>
        </div>

        <div
          onClick={() => setCurrentTab('archive')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            currentTab === 'archive'
              ? 'bg-emerald-500/10 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Laporan Resmi Selesai</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {stats.passed}{' '}
            <span className="text-xs font-normal text-red-500 font-sans">
              ({stats.rejected} Reject)
            </span>
          </div>
          <div className="text-[11px] text-slate-500 flex gap-2 font-medium">
            <span>BB: {stats.archiveRaw}</span>
            <span>•</span>
            <span>BK: {stats.archivePkg}</span>
          </div>
        </div>
      </div>

      {/* Main Filter & Content Box */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Dynamic Descriptive Quality Toolbar */}
        <div className="border-b border-slate-200 bg-slate-50/50 p-3 sm:px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              {currentTab === 'queue' && <><Clock className="w-3.5 h-3.5 text-amber-500" /> 1.1 Antrean Karantina</>}
              {currentTab === 'testing' && <><FlaskConical className="w-3.5 h-3.5 text-teal-600" /> 1.2 Pengujian Lab</>}
              {currentTab === 'approval' && <><ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> 1.3 Otorisasi Manager</>}
              {currentTab === 'archive' && <><FileText className="w-3.5 h-3.5 text-emerald-600" /> 1.4 Arsip Laporan & Lot</>}
              {currentTab === 'ipc-bulk' && <><Sliders className="w-3.5 h-3.5 text-blue-600" /> 2.1 Sediaan Ruahan (Bulk)</>}
              {currentTab === 'ipc-finished' && <><Package className="w-3.5 h-3.5 text-indigo-600" /> 2.2 Produk Jadi</>}
              {currentTab === 'ipc-rework' && <><FlaskConical className="w-3.5 h-3.5 text-orange-500" /> 2.3 Rework / Reprocess</>}
              {currentTab === 'retained' && <><Package className="w-3.5 h-3.5 text-teal-700" /> 3.1 Retained Sample</>}
              {currentTab === 'stability' && <><CalendarDays className="w-3.5 h-3.5 text-purple-700" /> 3.2 Stability Study</>}
              {currentTab === 'sop' && <><FileText className="w-3.5 h-3.5 text-slate-700" /> 4.1 Daftar SOP Aktif</>}
              {currentTab === 'capa' && <><ClipboardList className="w-3.5 h-3.5 text-rose-600" /> 4.2 Riwayat Deviasi & CAPA</>}
              {currentTab === 'complaints' && <><Info className="w-3.5 h-3.5 text-blue-600" /> 4.3 Complaint Handling</>}
              {currentTab === 'deviations' && <><ShieldAlert className="w-3.5 h-3.5 text-orange-600" /> 4.4 Manajemen Deviasi & CAPA</>}
            </h3>
            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
              {currentTab === 'queue' && 'Sampling bahan masuk menggunakan rumus CPKB n = 1 + sqrt(N) wadah.'}
              {currentTab === 'testing' && 'Pengujian laboratorium fisik, kimia, dan mikrobiologi standar CPKB.'}
              {currentTab === 'approval' && 'Pelepasan otorisasi atau penolakan bahan baku dan bahan kemas oleh Quality Manager.'}
              {currentTab === 'archive' && 'Penyimpanan digital lembar Laporan Hasil Analisis (LHA) resmi rilis.'}
              {currentTab === 'ipc-bulk' && 'Pemeriksaan kualitas sediaan setengah jadi adonan cream, gel, pasta, liquid sebelum pengemasan.'}
              {currentTab === 'ipc-finished' && 'Pengujian fisik, organoleptik, penimbangan netto, dan uji kebocoran kemasan produk jadi.'}
              {currentTab === 'ipc-rework' && 'Pengendalian pengerjaan ulang sediaan bets yang tidak sesuai parameter.'}
              {currentTab === 'retained' && 'Penyimpanan contoh pertinggal bahan baku, bahan kemas, produk jadi untuk jaminan mutu CPKB.'}
              {currentTab === 'stability' && 'Monitoring stabilitas organoleptik, pH, viskositas produk jadi di climate chamber.'}
              {currentTab === 'sop' && 'Daftar dokumen standar prosedur operasional pengujian aktif laboratorium QC.'}
              {currentTab === 'capa' && 'Sistem pelaporan penyimpangan, ketidaksesuaian kritis/minor, dan tindakan korektif preventif.'}
              {currentTab === 'complaints' && 'Registrasi laporan keluhan konsumen dan pengujian retained sample investigasi.'}
              {currentTab === 'deviations' && 'Sistem pelaporan penyimpangan mutu lintas departemen, analisis root cause, dan tindakan korektif preventif CAPA.'}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Contextual Search */}
            {['queue', 'testing', 'approval', 'archive', 'retained', 'sop', 'capa', 'complaints'].includes(currentTab) && (
              <div className="relative w-full sm:w-auto">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Cari data..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1 text-[11px] text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 w-full sm:w-44"
                />
              </div>
            )}
          </div>
        </div>

        {/* TAB 1: Antrean Karantina */}
        {currentTab === 'queue' && (
          <div className="p-4 space-y-4">
            {/* Banner Item Direvert ke Gudang */}
            {revertedReports.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                    <ArrowLeftCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{revertedReports.length} Penerimaan Sedang Direvert ke Gudang Logistik</span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-2.5 py-0.5 rounded-full">
                    Menunggu Koreksi Gudang
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {revertedReports.map((rev) => (
                    <div
                      key={rev.id}
                      className="bg-white/90 border border-amber-200 p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{rev.materialCode} - {rev.materialName}</span>
                          <span className="font-mono text-[10.5px] text-slate-500">({rev.grnNumber})</span>
                        </div>
                        <p className="text-[11px] text-amber-900">
                          <strong>Alasan Revert:</strong> "{rev.revertReason || '-'}"
                        </p>
                        {rev.revertedBy && (
                          <p className="text-[10px] text-slate-500">
                            Direvert oleh: {rev.revertedBy} • {rev.revertedAt ? new Date(rev.revertedAt).toLocaleString('id-ID') : '-'}
                          </p>
                        )}
                      </div>
                      <span className="text-[10.5px] font-semibold text-amber-800 bg-amber-100 px-2 py-1 rounded-md shrink-0 self-start sm:self-center">
                        Hak Edit Gudang Aktif
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Tabs: 2 Tab Terpisah Antrean Karantina (Bahan Baku vs Bahan Kemas) Tanpa Opsi Semua */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setQueueCategory('raw');
                    setQueuePage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    queueCategory === 'raw'
                      ? 'bg-teal-700 text-white shadow-md shadow-teal-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <FlaskConical className="w-4 h-4 shrink-0" />
                  <span>🧪 Antrean Bahan Baku (BB)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      queueCategory === 'raw'
                        ? 'bg-teal-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.quarantineRaw} Lot
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQueueCategory('packaging');
                    setQueuePage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    queueCategory === 'packaging'
                      ? 'bg-purple-700 text-white shadow-md shadow-purple-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Boxes className="w-4 h-4 shrink-0" />
                  <span>📦 Antrean Bahan Kemas (BK)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      queueCategory === 'packaging'
                        ? 'bg-purple-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.quarantinePkg} Lot
                  </span>
                </button>
              </div>

              {/* Info Urutan */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl w-full sm:w-auto justify-center">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Urutan: <strong>Terlama ke Baru (FIFO QC)</strong></span>
                </div>
              </div>
            </div>

            {/* Content Table with Pagination (Default 50 items/page) */}
            {(() => {
              const currentQueueList = queueCategory === 'raw' ? queueRawList : queuePackagingList;
              const totalItems = currentQueueList.length;
              const startIndex = (queuePage - 1) * queueItemsPerPage;
              const paginatedItems = currentQueueList.slice(startIndex, startIndex + queueItemsPerPage);

              return (
                <div className="space-y-2">
                  <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs w-full">
                    {renderQueueTable(
                      paginatedItems,
                      queueCategory === 'raw'
                        ? 'Tidak ada antrean Bahan Baku di karantina.'
                        : 'Tidak ada antrean Bahan Kemas di karantina.',
                      startIndex
                    )}
                  </div>

                  {totalItems > 0 && (
                    <Pagination
                      currentPage={queuePage}
                      totalItems={totalItems}
                      itemsPerPage={queueItemsPerPage}
                      onPageChange={(page) => setQueuePage(page)}
                      onItemsPerPageChange={(size) => {
                        setQueueItemsPerPage(size);
                        setQueuePage(1);
                      }}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 2: Proses Uji Lab */}
        {currentTab === 'testing' && (
          <div className="p-4 space-y-4">
            {/* Category Tabs: 2 Tab Terpisah Uji Lab (Bahan Baku vs Bahan Kemas) Tanpa Opsi Semua */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setTestingCategory('raw');
                    setTestingPage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    testingCategory === 'raw'
                      ? 'bg-teal-700 text-white shadow-md shadow-teal-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <FlaskConical className="w-4 h-4 shrink-0" />
                  <span>🧪 Uji Lab Bahan Baku (BB)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      testingCategory === 'raw'
                        ? 'bg-teal-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.testingRaw} Sedang Diuji
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTestingCategory('packaging');
                    setTestingPage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    testingCategory === 'packaging'
                      ? 'bg-purple-700 text-white shadow-md shadow-purple-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Boxes className="w-4 h-4 shrink-0" />
                  <span>📦 Uji Lab Bahan Kemas (BK)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      testingCategory === 'packaging'
                        ? 'bg-purple-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.testingPkg} Sedang Diuji
                  </span>
                </button>
              </div>

              {/* Info Lingkup Uji */}
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 rounded-lg">
                  {testingCategory === 'raw'
                    ? 'Pemeriksaan Kimia, Fisika & Organoleptik'
                    : 'Dimensi, Kebocoran, Teks & Kesesuaian Fisik'}
                </span>
              </div>
            </div>

            {/* Content Table with Pagination (Default 50 items/page) */}
            {(() => {
              const currentTestingList = testingCategory === 'raw' ? testingRawList : testingPackagingList;
              const totalItems = currentTestingList.length;
              const startIndex = (testingPage - 1) * testingItemsPerPage;
              const paginatedItems = currentTestingList.slice(startIndex, startIndex + testingItemsPerPage);

              return (
                <div className="space-y-2">
                  <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs w-full">
                    {renderTestingTable(
                      paginatedItems,
                      testingCategory === 'raw'
                        ? 'Tidak ada pengujian laboratorium Bahan Baku yang sedang berjalan.'
                        : 'Tidak ada pengujian laboratorium Bahan Kemas yang sedang berjalan.',
                      startIndex
                    )}
                  </div>

                  {totalItems > 0 && (
                    <Pagination
                      currentPage={testingPage}
                      totalItems={totalItems}
                      itemsPerPage={testingItemsPerPage}
                      onPageChange={(page) => setTestingPage(page)}
                      onItemsPerPageChange={(size) => {
                        setTestingItemsPerPage(size);
                        setTestingPage(1);
                      }}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 3: Menunggu Otorisasi Manager */}
        {currentTab === 'approval' && (
          <div className="p-4 space-y-4">
            {/* Category Tabs: 2 Tab Terpisah Otorisasi QM (Bahan Baku vs Bahan Kemas) Tanpa Opsi Semua */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setApprovalCategory('raw');
                    setApprovalPage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    approvalCategory === 'raw'
                      ? 'bg-teal-700 text-white shadow-md shadow-teal-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <FlaskConical className="w-4 h-4 shrink-0" />
                  <span>🧪 Otorisasi QM Bahan Baku (BB)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      approvalCategory === 'raw'
                        ? 'bg-teal-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.approvalRaw} Menunggu
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setApprovalCategory('packaging');
                    setApprovalPage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    approvalCategory === 'packaging'
                      ? 'bg-purple-700 text-white shadow-md shadow-purple-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Boxes className="w-4 h-4 shrink-0" />
                  <span>📦 Otorisasi QM Bahan Kemas (BK)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      approvalCategory === 'packaging'
                        ? 'bg-purple-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.approvalPkg} Menunggu
                  </span>
                </button>
              </div>

              {/* Info Format Lot */}
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 rounded-lg">
                  {approvalCategory === 'raw'
                    ? 'Penerbitan No. Lot LBB (Bahan Baku)'
                    : 'Penerbitan No. Lot LBK (Bahan Kemas)'}
                </span>
              </div>
            </div>

            {/* Content Table with Pagination (Default 50 items/page) */}
            {(() => {
              const currentApprovalList = approvalCategory === 'raw' ? approvalRawList : approvalPackagingList;
              const totalItems = currentApprovalList.length;
              const startIndex = (approvalPage - 1) * approvalItemsPerPage;
              const paginatedItems = currentApprovalList.slice(startIndex, startIndex + approvalItemsPerPage);

              return (
                <div className="space-y-2">
                  <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs w-full">
                    {renderApprovalTable(
                      paginatedItems,
                      approvalCategory === 'raw'
                        ? 'Tidak ada lot Bahan Baku yang sedang menunggu otorisasi Quality Manager.'
                        : 'Tidak ada lot Bahan Kemas yang sedang menunggu otorisasi Quality Manager.',
                      startIndex
                    )}
                  </div>

                  {totalItems > 0 && (
                    <Pagination
                      currentPage={approvalPage}
                      totalItems={totalItems}
                      itemsPerPage={approvalItemsPerPage}
                      onPageChange={(page) => setApprovalPage(page)}
                      onItemsPerPageChange={(size) => {
                        setApprovalItemsPerPage(size);
                        setApprovalPage(1);
                      }}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 4: Arsip Laporan Pemeriksaan & Lot Terbit */}
        {currentTab === 'archive' && (
          <div className="p-4 space-y-4">
            {/* Category Tabs: 2 Tab Terpisah Arsip & Laporan (Bahan Baku vs Bahan Kemas) Tanpa Opsi Semua */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setArchiveCategory('raw');
                    setArchivePage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    archiveCategory === 'raw'
                      ? 'bg-teal-700 text-white shadow-md shadow-teal-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <FlaskConical className="w-4 h-4 shrink-0" />
                  <span>🧪 Arsip Laporan Bahan Baku (LBB)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      archiveCategory === 'raw'
                        ? 'bg-teal-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.archiveRaw} Selesai
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setArchiveCategory('packaging');
                    setArchivePage(1);
                  }}
                  className={`w-full sm:w-auto justify-center sm:justify-start px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    archiveCategory === 'packaging'
                      ? 'bg-purple-700 text-white shadow-md shadow-purple-700/20'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Boxes className="w-4 h-4 shrink-0" />
                  <span>📦 Arsip Laporan Bahan Kemas (LBK)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      archiveCategory === 'packaging'
                        ? 'bg-purple-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {stats.archivePkg} Selesai
                  </span>
                </button>
              </div>

              {/* Info Format Dokumen */}
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 rounded-lg">
                  {archiveCategory === 'raw'
                    ? 'Format Penomoran: LBBYYMMxxx'
                    : 'Format Penomoran: LBKYYMMxxx'}
                </span>
              </div>
            </div>

            {/* Content Table with Pagination (Default 50 items/page) */}
            {(() => {
              const currentArchiveList = archiveCategory === 'raw' ? archiveRawList : archivePackagingList;
              const totalItems = currentArchiveList.length;
              const startIndex = (archivePage - 1) * archiveItemsPerPage;
              const paginatedItems = currentArchiveList.slice(startIndex, startIndex + archiveItemsPerPage);

              return (
                <div className="space-y-2">
                  <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs w-full">
                    {renderArchiveTable(
                      paginatedItems,
                      archiveCategory === 'raw'
                        ? 'Belum ada arsip laporan pemeriksaan Bahan Baku yang selesai.'
                        : 'Belum ada arsip laporan pemeriksaan Bahan Kemas yang selesai.',
                      startIndex
                    )}
                  </div>

                  {totalItems > 0 && (
                    <Pagination
                      currentPage={archivePage}
                      totalItems={totalItems}
                      itemsPerPage={archiveItemsPerPage}
                      onPageChange={(page) => setArchivePage(page)}
                      onItemsPerPageChange={(size) => {
                        setArchiveItemsPerPage(size);
                        setArchivePage(1);
                      }}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 2.1: IPC - Sediaan Ruahan (Bulk) */}
        {currentTab === 'ipc-bulk' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span>Monitoring Mutu Adonan Ruahan (IPC Produksi)</span>
                  <span className="bg-purple-100 text-purple-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-purple-200">
                    Direct Supabase Sync
                  </span>
                </h4>
                <p className="text-[10px] text-slate-500">
                  Pengujian pH, Viskositas, Bobot Jenis & Pemerian sebelum adonan di-filling ke kemasan primer.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await ipcBulkService.auditIpcBulkBatches();
                    setLatestIpcAuditResult(res);
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-slate-300"
                >
                  <Database className="w-3.5 h-3.5 text-purple-700" />
                  <span>Audit Supabase</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowIpcRegisterModal(true)}
                  className="bg-purple-800 hover:bg-purple-900 text-white text-[11px] font-extrabold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-purple-200" />
                  <span>Registrasi Batch Ruahan (Excel / Paste / Manual)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowIpcForm(!showIpcForm)}
                  className="bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-purple-300"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Input Hasil Lab</span>
                </button>
              </div>
            </div>

            {/* Audit Status Banner (Post-Execution Audit) */}
            {latestIpcAuditResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 px-4 flex items-start justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-emerald-900 flex items-center gap-2">
                      <span>Laporan Audit Post-Eksekusi Database Supabase</span>
                      <span className="bg-emerald-200 text-emerald-900 font-mono text-[9px] px-1.5 py-0.5 rounded">
                        {latestIpcAuditResult.timestamp.split('T')[1]?.slice(0, 8)}
                      </span>
                    </h5>
                    <p className="text-[11px] text-emerald-800 mt-0.5">{latestIpcAuditResult.statusMessage}</p>
                  </div>
                </div>
                <button
                  onClick={() => setLatestIpcAuditResult(null)}
                  className="text-emerald-700 hover:text-emerald-900 p-1 text-xs font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Form Input Hasil Uji Bulk */}
            {showIpcForm && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newIpc.batchNo.trim() || !newIpc.productName.trim()) return;
                  const isPassed = Number(newIpc.pH) >= 5.0 && Number(newIpc.pH) <= 7.5 && Number(newIpc.viscosity) >= 1500 && Number(newIpc.viscosity) <= 18000;
                  const inputItem = {
                    batchNo: newIpc.batchNo.trim().toUpperCase(),
                    productName: newIpc.productName.trim(),
                    mixingDate: new Date().toISOString().split('T')[0],
                    pH: Number(newIpc.pH),
                    viscosity: Number(newIpc.viscosity),
                    appearance: newIpc.appearance || 'Homogen, Sesuai Spesifikasi Standard CPKB',
                    gravity: Number(newIpc.gravity),
                    analyst: newIpc.analyst || user?.name || 'Staf QC Lab',
                    origin: 'MANUAL_ENTRY' as const,
                  };
                  const updated = await ipcBulkService.saveBatches([inputItem]);
                  setIpcBulkTests(updated);
                  const auditRes = await ipcBulkService.auditIpcBulkBatches();
                  setLatestIpcAuditResult(auditRes);

                  setShowIpcForm(false);
                  setNewIpc({ batchNo: '', productName: '', pH: 6.0, viscosity: 4000, appearance: 'Homogen, Sesuai Spek', gravity: 1.0, status: 'TESTING', analyst: user?.name || 'Staf QC Lab' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nomor Bets (Batch No)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: B260904A"
                    value={newIpc.batchNo}
                    onChange={(e) => setNewIpc({ ...newIpc, batchNo: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nama Produk Jadi</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Aloe Vera Soothing Gel"
                    value={newIpc.productName}
                    onChange={(e) => setNewIpc({ ...newIpc, productName: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">pH (Spek: 5.0 - 7.5)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newIpc.pH}
                    onChange={(e) => setNewIpc({ ...newIpc, pH: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Viskositas (Spek: 1500-18000 cPs)</label>
                  <input
                    type="number"
                    required
                    value={newIpc.viscosity}
                    onChange={(e) => setNewIpc({ ...newIpc, viscosity: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Bobot Jenis (g/ml)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newIpc.gravity}
                    onChange={(e) => setNewIpc({ ...newIpc, gravity: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Pemeriksaan Fisik (Pemerian)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Homogen, Putih Lembut"
                    value={newIpc.appearance}
                    onChange={(e) => setNewIpc({ ...newIpc, appearance: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowIpcForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Simpan Laporan
                  </button>
                </div>
              </form>
            )}

            {/* Sub-Tabs Navigation Bar */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setIpcSubTab('analisa')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  ipcSubTab === 'analisa'
                    ? 'bg-purple-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>🧪 1. Dalam Analisa (QC Lab)</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ipcSubTab === 'analisa' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                  {ipcBulkTests.filter(t => t.status === 'TESTING' || t.status === 'RETEST' || t.status === 'PASSED').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIpcSubTab('otorisasi')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  ipcSubTab === 'otorisasi'
                    ? 'bg-blue-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>🛡️ 2. Otorisasi Manager (QM)</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ipcSubTab === 'otorisasi' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                  {ipcBulkTests.filter(t => t.status === 'AWAITING_QM').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIpcSubTab('released')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  ipcSubTab === 'released'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>✅ 3. Released (Disetujui)</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ipcSubTab === 'released' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                  {ipcBulkTests.filter(t => t.status === 'RELEASED' || t.status === 'RELEASED_DEVIATION').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIpcSubTab('reject')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  ipcSubTab === 'reject'
                    ? 'bg-rose-800 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>❌ 4. Rejected (Ditolak)</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ipcSubTab === 'reject' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                  {ipcBulkTests.filter(t => t.status === 'REJECTED').length}
                </span>
              </button>
            </div>

            {/* Table Hasil Uji Bulk */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse bg-white">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="p-3">ID Laporan</th>
                    <th className="p-3">
                      {ipcSubTab === 'otorisasi'
                        ? 'No. Bets (Klik u/ Otorisasi)'
                        : ipcSubTab === 'analisa'
                        ? 'No. Bets (Klik u/ Analisa)'
                        : 'No. Bets'}
                    </th>
                    <th className="p-3">Nama & Kode Produk</th>
                    <th className="p-3">
                      {ipcSubTab === 'released'
                        ? 'Tgl Rilis'
                        : ipcSubTab === 'otorisasi'
                        ? 'Tgl Uji'
                        : 'Tgl Mixing'}
                    </th>
                    {ipcSubTab === 'analisa' && <th className="p-3 text-center">Cetak Label</th>}
                    {ipcSubTab === 'released' && <th className="p-3 text-center">Cetak Dokumen & Label</th>}
                    {ipcSubTab === 'otorisasi' && <th className="p-3 text-center">Laporan Pemeriksaan</th>}
                    {ipcSubTab === 'reject' && <th className="p-3">Alasan Penolakan</th>}
                    {ipcSubTab !== 'otorisasi' && <th className="p-3 text-center">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                  {(() => {
                    const filtered = ipcBulkTests.filter((t) => {
                      if (ipcSubTab === 'analisa') return t.status === 'TESTING' || t.status === 'RETEST' || t.status === 'PASSED';
                      if (ipcSubTab === 'otorisasi') return t.status === 'AWAITING_QM';
                      if (ipcSubTab === 'released') return t.status === 'RELEASED' || t.status === 'RELEASED_DEVIATION';
                      if (ipcSubTab === 'reject') return t.status === 'REJECTED';
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                            Tidak ada batch ruahan di kategori tab <strong className="text-slate-600">{ipcSubTab.toUpperCase()}</strong>.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-purple-50/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-purple-950">{t.ipcNo || t.id}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setSelectedAnalysisBatch(t)}
                            className="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 px-2.5 py-1 rounded-lg font-mono font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs group"
                            title="Klik untuk membuka Analisa Lab & Parameter Uji"
                          >
                            <span>{t.batchNo}</span>
                            <Sparkles className="w-3 h-3 text-purple-600 group-hover:scale-125 transition-transform" />
                          </button>
                        </td>
                        <td className="p-3 font-semibold">
                          <div className="text-slate-900">{t.productName}</div>
                          {t.productCode && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              {t.productCode}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-medium text-slate-600 whitespace-nowrap">
                          {ipcSubTab === 'released'
                            ? formatDateDDMMMYYYY(t.testDate || t.mixingDate)
                            : ipcSubTab === 'otorisasi'
                            ? formatDateDDMMMYYYY(t.testDate || t.mixingDate)
                            : formatDateDDMMMYYYY(t.mixingDate)}
                        </td>

                        {/* Cetak Label Karantina (Tab Analisa) */}
                        {ipcSubTab === 'analisa' && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setIpcLabelState({ batch: t, type: 'QUARANTINE' })}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                              title="Cetak Label Karantina Wadah Sediaan Ruahan"
                            >
                              <Tag className="w-3.5 h-3.5 text-amber-700" />
                              <span>Label Karantina</span>
                            </button>
                          </td>
                        )}

                        {/* Cetak Label Rilis & Cetak Laporan (Tab Release) */}
                        {ipcSubTab === 'released' && (
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setIpcLabelState({ batch: t, type: 'RELEASED' })}
                                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                                title="Cetak Label Rilis Hijau Sediaan Ruahan"
                              >
                                <Tag className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Cetak Label Rilis</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIpcPdfBatch(t)}
                                className="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 px-2.5 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                                title="Cetak Laporan Hasil Uji Ruahan (PDF)"
                              >
                                <FileText className="w-3.5 h-3.5 text-purple-700" />
                                <span>Cetak Laporan</span>
                              </button>
                            </div>
                          </td>
                        )}

                        {/* Otorisasi (Tab Otorisasi) */}
                        {ipcSubTab === 'otorisasi' && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setIpcPdfBatch(t)}
                              className="bg-purple-700 hover:bg-purple-800 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                              title="View Laporan Pemeriksaan IPC Ruahan"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>View Laporan</span>
                            </button>
                          </td>
                        )}

                        {/* Reject Reason (Tab Reject) */}
                        {ipcSubTab === 'reject' && (
                          <td className="p-3 text-rose-700 font-medium">
                            {t.rejectionReason || 'Ditolak Quality Control'}
                          </td>
                        )}

                        {/* Status Column */}
                        {ipcSubTab !== 'otorisasi' && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedAnalysisBatch(t)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer transition-transform hover:scale-105 ${
                                t.status === 'RELEASED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : t.status === 'AWAITING_QM'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                  : t.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : t.status === 'RETEST'
                                  ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                  : 'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}
                            >
                              {t.status === 'RETEST' && <RotateCcw className="w-3 h-3 text-orange-700" />}
                              <span>
                                {t.status === 'RELEASED'
                                  ? 'RELEASED'
                                  : t.status === 'AWAITING_QM'
                                  ? 'MENUNGGU QM'
                                  : t.status === 'REJECTED'
                                  ? 'REJECTED'
                                  : t.status === 'RETEST'
                                  ? 'Re-test'
                                  : 'Analisa'}
                              </span>
                            </button>
                          </td>
                        )}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2.2: IPC - Produk Jadi (Finished Goods) */}
        {currentTab === 'ipc-finished' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span>Monitoring Mutu & Kemasan Produk Jadi (IPC Kemas)</span>
                  <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-indigo-200">
                    CPKB Standard
                  </span>
                </h4>
                <p className="text-[10px] text-slate-500">
                  Pengujian Netto, Kebocoran Sealing, Torsi Tutup, dan Kesesuaian Estetika Kemasan Sekunder/Primer.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFinishedForm(!showFinishedForm)}
                  className="bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-extrabold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Tambah Uji Produk Jadi</span>
                </button>
              </div>
            </div>

            {/* Form Tambah Produk Jadi */}
            {showFinishedForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const added: IpcFinishedTest = {
                    id: `FG-${Date.now().toString().slice(-5)}`,
                    batchNo: newFinished.batchNo || 'FG260901',
                    productName: newFinished.productName || 'Glow Brightening Cream 30g',
                    packSize: newFinished.packSize || '30 gram',
                    netWeightGrams: Number(newFinished.netWeightGrams) || 30.2,
                    sealingIntegrity: newFinished.sealingIntegrity || 'Tidak Bocor',
                    torqueKgCm: Number(newFinished.torqueKgCm) || 14.5,
                    appearance: newFinished.appearance || 'Sempurna, Bersih, Batch tercetak jelas',
                    testDate: new Date().toISOString().split('T')[0],
                    status: 'TESTING',
                    analyst: user?.name || 'Staff QC',
                  };
                  setIpcFinishedTests([added, ...ipcFinishedTests]);
                  setShowFinishedForm(false);
                  setNewFinished({ batchNo: '', productName: '', packSize: '30g', netWeightGrams: 30, sealingIntegrity: 'Tidak Bocor', torqueKgCm: 15, appearance: 'Sempurna', status: 'TESTING' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">No Bets Produk Jadi</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: FG260901"
                    value={newFinished.batchNo}
                    onChange={(e) => setNewFinished({ ...newFinished, batchNo: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nama Produk</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Brightening Serum"
                    value={newFinished.productName}
                    onChange={(e) => setNewFinished({ ...newFinished, productName: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Ukuran Kemasan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 30 ml / 100 gram"
                    value={newFinished.packSize}
                    onChange={(e) => setNewFinished({ ...newFinished, packSize: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Berat Netto Aktual (gram)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newFinished.netWeightGrams}
                    onChange={(e) => setNewFinished({ ...newFinished, netWeightGrams: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Uji Kebocoran / Sealing</label>
                  <select
                    value={newFinished.sealingIntegrity}
                    onChange={(e) => setNewFinished({ ...newFinished, sealingIntegrity: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Tidak Bocor">Tidak Bocor (Sempurna)</option>
                    <option value="Bocor Sealing">Bocor Sealing / Seal Lemah</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Torsi Tutup (kg.cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={newFinished.torqueKgCm}
                    onChange={(e) => setNewFinished({ ...newFinished, torqueKgCm: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowFinishedForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Simpan & Uji Laboratorium
                  </button>
                </div>
              </form>
            )}

            {/* Table Finished Goods */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/70 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3">ID / Tanggal</th>
                    <th className="p-3">Nomor Bets & Produk</th>
                    <th className="p-3">Kemasan & Netto</th>
                    <th className="p-3">Sealing & Torsi</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ipcFinishedTests.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono">
                        <div className="font-bold text-indigo-700">{item.id}</div>
                        <div className="text-[10px] text-slate-400">{item.testDate || 'Hari ini'}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{item.productName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Bets: {item.batchNo}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{item.packSize}</div>
                        <div className="text-[10px] text-slate-500 font-medium">Netto: {item.netWeightGrams} g</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{item.sealingIntegrity}</div>
                        <div className="text-[10px] text-slate-500 font-medium">Torsi: {item.torqueKgCm} kg.cm</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          item.status === 'PASSED' || item.status === 'RELEASED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : item.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : item.status === 'RETEST'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setIpcFinishedTests(ipcFinishedTests.map(t => t.id === item.id ? { ...t, status: t.status === 'PASSED' ? 'TESTING' : 'PASSED' } : t));
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          {item.status === 'PASSED' ? 'Re-test' : 'Set Passed'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2.3: IPC - Uji Rework */}
        {currentTab === 'ipc-rework' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Log & Otorisasi Pengolahan Ulang (Rework)</h4>
                <p className="text-[10px] text-slate-500">Pengerjaan kembali sediaan setengah jadi bermutu sub-standard yang diijinkan CPKB.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReworkForm(!showReworkForm)}
                className="bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Daftar Rework Baru</span>
              </button>
            </div>

            {/* Form Rework */}
            {showReworkForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const added: IpcReworkTest = {
                    id: `REW-${Date.now().toString().slice(-5)}`,
                    originalBatchNo: newRework.originalBatchNo || 'B260899X',
                    reworkBatchNo: `${newRework.originalBatchNo || 'B260899X'}-R1`,
                    productName: newRework.productName || 'Product Base Cream',
                    reworkReason: newRework.reworkReason || 'Koreksi viskositas sediaan',
                    reworkDate: new Date().toISOString().split('T')[0],
                    pHTest: Number(newRework.pHTest),
                    viscosityTest: Number(newRework.viscosityTest),
                    microbiology: newRework.microbiology as any,
                    status: newRework.microbiology === 'NEGATIVE' ? 'PASSED' : 'TESTING',
                    authorizedBy: 'Diana Putri (QM)',
                  };
                  setIpcReworkTests([added, ...ipcReworkTests]);
                  setShowReworkForm(false);
                  setNewRework({ originalBatchNo: '', productName: '', reworkReason: '', pHTest: 6.0, viscosityTest: 4000, microbiology: 'PENDING', status: 'TESTING', authorizedBy: 'Diana Putri (QM)' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">No Bets Asal (Original Batch)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: B260815X"
                    value={newRework.originalBatchNo}
                    onChange={(e) => setNewRework({ ...newRework, originalBatchNo: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nama Produk Jadi</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Glow Body Lotion"
                    value={newRework.productName}
                    onChange={(e) => setNewRework({ ...newRework, productName: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Alasan Rework & Analisa Masalah</label>
                  <textarea
                    required
                    placeholder="Tuliskan deviasi pengolahan dan instruksi koreksi dari R&D / QC Manager"
                    value={newRework.reworkReason}
                    onChange={(e) => setNewRework({ ...newRework, reworkReason: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-orange-500 h-16 resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Hasil pH Re-Test</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newRework.pHTest}
                    onChange={(e) => setNewRework({ ...newRework, pHTest: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Hasil Viskositas Re-Test (cPs)</label>
                  <input
                    type="number"
                    required
                    value={newRework.viscosityTest}
                    onChange={(e) => setNewRework({ ...newRework, viscosityTest: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Uji Mikrobiologi Rework (Cemaran)</label>
                  <select
                    value={newRework.microbiology}
                    onChange={(e) => setNewRework({ ...newRework, microbiology: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-orange-500"
                  >
                    <option value="PENDING">PENDING (Inkubasi 48 jam)</option>
                    <option value="NEGATIVE">NEGATIVE (Lolos - Bebas Coliform & Jamur)</option>
                    <option value="POSITIVE">POSITIVE (Gagal - Terkontaminasi)</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReworkForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Otorisasi & Rilis Rework
                  </button>
                </div>
              </form>
            )}

            {/* List Reworks */}
            <div className="space-y-3">
              {ipcReworkTests.map((r) => (
                <div key={r.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-orange-50 text-orange-800 text-[10px] font-black border border-orange-200 px-2 py-0.5 rounded-md">{r.id}</span>
                      <span className="bg-slate-100 text-slate-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md">Asal: {r.originalBatchNo}</span>
                      <span className="bg-teal-50 text-teal-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">Rework Bets: {r.reworkBatchNo}</span>
                      <span className="font-bold text-slate-800 text-xs">{r.productName}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium bg-amber-50/50 p-2 rounded-lg border border-amber-100"><strong className="text-amber-800">Alasan:</strong> {r.reworkReason}</p>
                    <div className="flex items-center gap-4 text-[10px] text-slate-500 font-semibold pt-1">
                      <span>Tanggal: {r.reworkDate}</span>
                      <span>pH Re-test: <strong>{r.pHTest}</strong></span>
                      <span>Viskositas: <strong>{r.viscosityTest.toLocaleString()} cPs</strong></span>
                      <span className="flex items-center gap-1">Mikroba: <strong className={r.microbiology === 'NEGATIVE' ? 'text-emerald-700' : 'text-amber-600'}>{r.microbiology}</strong></span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[10px] text-slate-400 font-semibold italic">Authorized: {r.authorizedBy}</span>
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider ${
                        r.status === 'PASSED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {r.status === 'PASSED' ? 'RILIS - PASSED' : 'KARANTINA - RE-TESTING'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3.1: Retained Sample */}
        {currentTab === 'retained' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Gudang Contoh Pertinggal (Retained Sample)</h4>
                <p className="text-[10px] text-slate-500">Penyimpanan contoh pertinggal bets rilis selama masa kadaluwarsa + 1 tahun sesuai CPKB.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRetainedForm(!showRetainedForm)}
                className="bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simpan Sampel Baru</span>
              </button>
            </div>

            {/* Form Retained */}
            {showRetainedForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const added: RetainedSample = {
                    id: `RET-${Date.now().toString().slice(-5)}`,
                    batchNo: newRetained.batchNo || 'B260905D',
                    productName: newRetained.productName || 'New Lotion Sample',
                    type: newRetained.type as any,
                    expiryDate: newRetained.expiryDate || '2029-09-03',
                    rackNo: newRetained.rackNo || 'RAK-PJ-10',
                    qty: newRetained.qty || '3 pcs',
                    status: 'Simpan',
                    receivedDate: new Date().toISOString().split('T')[0],
                  };
                  setRetainedSamples([added, ...retainedSamples]);
                  setShowRetainedForm(false);
                  setNewRetained({ batchNo: '', productName: '', type: 'Produk Jadi', expiryDate: '2029-09-03', rackNo: '', qty: '3 pcs', status: 'Simpan' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">No Bets / Lot</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: LOT-N-2609A"
                    value={newRetained.batchNo}
                    onChange={(e) => setNewRetained({ ...newRetained, batchNo: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nama Produk / Material</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Vitamin C Active"
                    value={newRetained.productName}
                    onChange={(e) => setNewRetained({ ...newRetained, productName: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Kategori Sampel</label>
                  <select
                    value={newRetained.type}
                    onChange={(e) => setNewRetained({ ...newRetained, type: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="Bahan Baku">Bahan Baku (BB)</option>
                    <option value="Bahan Kemas">Bahan Kemas (BK)</option>
                    <option value="Produk Jadi">Produk Jadi (PJ)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Lokasi Rak Penyimpanan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: RAK-BB-09B"
                    value={newRetained.rackNo}
                    onChange={(e) => setNewRetained({ ...newRetained, rackNo: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Jumlah Simpan (Qty)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 100 g atau 3 pcs"
                    value={newRetained.qty}
                    onChange={(e) => setNewRetained({ ...newRetained, qty: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Tanggal Expired (ED)</label>
                  <input
                    type="date"
                    required
                    value={newRetained.expiryDate}
                    onChange={(e) => setNewRetained({ ...newRetained, expiryDate: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRetainedForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Arsipkan Sampel
                  </button>
                </div>
              </form>
            )}

            {/* List Retained Samples */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse bg-white">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="p-3">ID Arsip</th>
                    <th className="p-3">No. Bets / Lot</th>
                    <th className="p-3">Nama Item</th>
                    <th className="p-3">Kategori</th>
                    <th className="p-3">Lokasi Rak</th>
                    <th className="p-3">Jumlah Arsip</th>
                    <th className="p-3 text-center">Tgl Masuk</th>
                    <th className="p-3 text-center">Exp Date</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                  {retainedSamples
                    .filter(s => searchQuery === '' || s.productName.toLowerCase().includes(searchQuery.toLowerCase()) || s.batchNo.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-900">{s.id}</td>
                        <td className="p-3"><span className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md font-bold">{s.batchNo}</span></td>
                        <td className="p-3 font-semibold text-slate-800">{s.productName}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold ${
                              s.type === 'Bahan Baku'
                                ? 'bg-amber-100 text-amber-800'
                                : s.type === 'Bahan Kemas'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {s.type}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-700"><span className="border border-slate-200 px-1.5 py-0.5 rounded-md bg-slate-50">{s.rackNo}</span></td>
                        <td className="p-3 font-medium text-slate-600">{s.qty}</td>
                        <td className="p-3 text-center text-slate-500">{formatDateDDMMMYYYY(s.receivedDate)}</td>
                        <td className="p-3 text-center text-rose-600 font-semibold">{formatDateDDMMMYYYY(s.expiryDate)}</td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                              s.status === 'Simpan'
                                ? 'bg-emerald-100 text-emerald-800'
                                : s.status === 'Diambil untuk Re-test'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                : 'bg-slate-100 text-slate-500 line-through'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {s.status === 'Simpan' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRetainedSamples(prev => prev.map(item => item.id === s.id ? { ...item, status: 'Diambil untuk Re-test' } : item));
                                }}
                                className="bg-slate-100 hover:bg-amber-500 hover:text-white text-slate-700 text-[10px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer"
                              >
                                Re-Test
                              </button>
                            )}
                            {s.status !== 'Dimusnahkan' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRetainedSamples(prev => prev.map(item => item.id === s.id ? { ...item, status: 'Dimusnahkan' } : item));
                                }}
                                className="bg-slate-50 hover:bg-rose-500 hover:text-white text-rose-600 text-[10px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer"
                              >
                                Musnahkan
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3.2: Stability Study */}
        {currentTab === 'stability' && (
          <div className="p-4 space-y-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Visual pH & Viscosity Stability Chart (Climate Chamber)</h4>
                  <p className="text-[10px] text-slate-500">Representasi tren kestabilan emulsi dan formulasi sediaan pada suhu ekstrim dipercepat (40°C / 75% RH).</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><span className="w-3 h-3 bg-teal-500 rounded-full"></span> pH Target (5.5 - 6.5)</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><span className="w-3 h-3 bg-purple-500 rounded-full"></span> Viskositas (x1000 cPs)</span>
                </div>
              </div>

              {/* Breathtaking SVG Custom Graph */}
              <div className="w-full bg-white border border-slate-200 rounded-xl p-4 overflow-hidden relative shadow-3xs">
                <svg viewBox="0 0 500 160" className="w-full h-40">
                  {/* Grid Lines */}
                  <line x1="40" y1="20" x2="480" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="40" y1="50" x2="480" y2="50" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="40" y1="80" x2="480" y2="80" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="40" y1="110" x2="480" y2="110" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="40" y1="140" x2="480" y2="140" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="2" />

                  {/* Horizontal Labels */}
                  <text x="40" y="152" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">Bulan 0</text>
                  <text x="150" y="152" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">Bulan 1</text>
                  <text x="260" y="152" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">Bulan 2</text>
                  <text x="370" y="152" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">Bulan 3</text>
                  <text x="470" y="152" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">Bulan 6 (Target)</text>

                  {/* Left Axis Labels (pH Scale) */}
                  <text x="32" y="24" fill="#0d9488" fontSize="7" fontWeight="bold" textAnchor="end">7.0 pH</text>
                  <text x="32" y="64" fill="#0d9488" fontSize="7" fontWeight="bold" textAnchor="end">6.0 pH</text>
                  <text x="32" y="104" fill="#0d9488" fontSize="7" fontWeight="bold" textAnchor="end">5.0 pH</text>

                  {/* Right Axis Labels (Viscosity Scale) */}
                  <text x="488" y="24" fill="#7c3aed" fontSize="7" fontWeight="bold" textAnchor="start">5000 cPs</text>
                  <text x="488" y="64" fill="#7c3aed" fontSize="7" fontWeight="bold" textAnchor="start">4000 cPs</text>
                  <text x="488" y="104" fill="#7c3aed" fontSize="7" fontWeight="bold" textAnchor="start">3000 cPs</text>

                  {/* pH Trend Line (Teal) */}
                  {/* points: B0 (6.2) -> B1 (6.18) -> B2 (6.15) -> B3 (6.1) */}
                  {/* coordinates X: B0=40, B1=150, B2=260, B3=370 */}
                  {/* coordinates Y: B0=56, B1=56.8, B2=58, B3=60 */}
                  <polyline
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    points="40,56 150,56.8 260,58 370,60"
                  />
                  {/* Dots for pH */}
                  <circle cx="40" cy="56" r="4.5" fill="#0d9488" stroke="#fff" strokeWidth="1.5" />
                  <circle cx="150" cy="56.8" r="4.5" fill="#0d9488" stroke="#fff" strokeWidth="1.5" />
                  <circle cx="260" cy="58" r="4.5" fill="#0d9488" stroke="#fff" strokeWidth="1.5" />
                  <circle cx="370" cy="60" r="4.5" fill="#0d9488" stroke="#fff" strokeWidth="1.5" />

                  {/* Viscosity Trend Line (Purple) */}
                  {/* points: B0 (4200) -> B1 (4150) -> B2 (4100) -> B3 (4050) */}
                  {/* coordinates Y: B0=52, B1=54, B2=56, B3=58 */}
                  <polyline
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="1"
                    points="40,52 150,54 260,56 370,58"
                  />
                  {/* Dots for Viscosity */}
                  <rect x="36" y="48" width="8" height="8" fill="#7c3aed" stroke="#fff" strokeWidth="1.5" rx="1.5" />
                  <rect x="146" y="50" width="8" height="8" fill="#7c3aed" stroke="#fff" strokeWidth="1.5" rx="1.5" />
                  <rect x="256" y="52" width="8" height="8" fill="#7c3aed" stroke="#fff" strokeWidth="1.5" rx="1.5" />
                  <rect x="366" y="54" width="8" height="8" fill="#7c3aed" stroke="#fff" strokeWidth="1.5" rx="1.5" />
                </svg>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Chamber Stability Schedule</h4>
                <p className="text-[10px] text-slate-500">Status penarikan (pull date) dan parameter kontrol fisis produk.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowStabilityForm(!showStabilityForm)}
                className="bg-purple-700 hover:bg-purple-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Mulai Studi Stabilitas Baru</span>
              </button>
            </div>

            {/* Form Stability */}
            {showStabilityForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const added: StabilityStudy = {
                    id: `STB-${Date.now().toString().slice(-5)}`,
                    productName: newStability.productName || 'Hydrating Facial Cleanser',
                    batchNo: newStability.batchNo || 'B260902X',
                    chamberTemp: newStability.chamberTemp || '40°C / 75% RH',
                    interval: 'Bulan ke-0 (Accelerated)',
                    pullDate: newStability.pullDate || '2026-09-03',
                    status: 'BERJALAN',
                    pHHistory: [
                      { month: '0', pH: 6.0, viscosity: 4500, appearance: 'Homogen' }
                    ]
                  };
                  setStabilityStudies([added, ...stabilityStudies]);
                  setShowStabilityForm(false);
                  setNewStability({ productName: '', batchNo: '', chamberTemp: '40°C ± 2°C / 75% RH ± 5% (Accelerated)', interval: 'Bulan ke-0 (Accelerated)', pullDate: '2026-09-03', status: 'BERJALAN' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nama Produk Jadi</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Glowing Bright Serum"
                    value={newStability.productName}
                    onChange={(e) => setNewStability({ ...newStability, productName: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nomor Bets (Batch No)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: B260902B"
                    value={newStability.batchNo}
                    onChange={(e) => setNewStability({ ...newStability, batchNo: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Kondisi Suhu/RH Chamber</label>
                  <select
                    value={newStability.chamberTemp}
                    onChange={(e) => setNewStability({ ...newStability, chamberTemp: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="40°C ± 2°C / 75% RH ± 5% (Accelerated)">40°C / 75% RH (Accelerated)</option>
                    <option value="30°C ± 2°C / 65% RH ± 5% (Real Time)">30°C / 65% RH (Real Time)</option>
                    <option value="45°C ± 2°C / Suhu Ekstrim (Stress Test)">45°C / Suhu Ekstrim (Stress Test)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Target Tanggal Penarikan (Pull Date)</label>
                  <input
                    type="date"
                    required
                    value={newStability.pullDate}
                    onChange={(e) => setNewStability({ ...newStability, pullDate: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowStabilityForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Simpan Laporan Studi
                  </button>
                </div>
              </form>
            )}

            {/* List Stability Study */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stabilityStudies.map((st) => (
                <div key={st.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="bg-purple-100 text-purple-800 text-[9px] font-extrabold px-2 py-0.5 rounded-md">{st.id}</span>
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-2 py-0.5 rounded-full">{st.status}</span>
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-800 text-xs">{st.productName}</h5>
                    <div className="text-[10px] text-slate-500 font-semibold mt-1">Bets: <span className="text-slate-800 font-bold">{st.batchNo}</span> | Chamber: {st.chamberTemp}</div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Riwayat pH Uji Terakhir:</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {st.pHHistory.map((h, index) => (
                        <div key={index} className="bg-white p-1 rounded-md border border-slate-200">
                          <div className="text-[8px] text-slate-400 font-bold uppercase">Bulan {h.month}</div>
                          <div className="text-[11px] font-bold text-slate-800">{h.pH}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold pt-1 border-t border-slate-100">
                    <span>Pull Date: <strong className="text-slate-800">{st.pullDate}</strong></span>
                    <span>Interval: <strong className="text-purple-700">{st.interval}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4.1: Daftar SOP Aktif */}
        {currentTab === 'sop' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Pustaka Dokumen Kepatuhan SOP</h4>
                <p className="text-[10px] text-slate-500">Penyusunan dokumen SOP laboratorium, kalibrasi alat, dan instruksi kerja LIMS.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSopForm(!showSopForm)}
                className="bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Upload SOP Baru</span>
              </button>
            </div>

            {/* Form SOP */}
            {showSopForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const added: SopDocument = {
                    id: `SOP-QC-${Date.now().toString().slice(-3)}`,
                    docNumber: newSop.docNumber || 'SOP/QC-LAB/999/REV.01',
                    title: newSop.title || 'New Standard Operating Procedure',
                    version: newSop.version || '01',
                    effectiveDate: newSop.effectiveDate || '2026-09-03',
                    category: newSop.category as any,
                    status: 'AKTIF'
                  };
                  setSopDocuments([added, ...sopDocuments]);
                  setShowSopForm(false);
                  setNewSop({ docNumber: '', title: '', version: '01', effectiveDate: '2026-09-03', category: 'QC', status: 'AKTIF' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nomor Registrasi Dokumen</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: SOP/QC-LAB/025/REV.01"
                    value={newSop.docNumber}
                    onChange={(e) => setNewSop({ ...newSop, docNumber: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Judul Prosedur Operasional</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Penanganan Bahan Kimia Berbahaya"
                    value={newSop.title}
                    onChange={(e) => setNewSop({ ...newSop, title: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Kategori Dokumen</label>
                  <select
                    value={newSop.category}
                    onChange={(e) => setNewSop({ ...newSop, category: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="QC">Quality Control (QC)</option>
                    <option value="QA">Quality Assurance (QA)</option>
                    <option value="SOP-PROD">Produksi CPKB</option>
                    <option value="WH">Warehouse Gudang</option>
                  </select>
                </div>
                <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSopForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Rilis Dokumen SOP
                  </button>
                </div>
              </form>
            )}

            {/* List SOP Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sopDocuments
                .filter(doc => searchQuery === '' || doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || doc.docNumber.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((doc) => (
                  <div key={doc.id} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-slate-300 shadow-3xs flex justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">{doc.category}</span>
                        <span className="bg-emerald-50 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-100">{doc.status}</span>
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-800 text-xs leading-snug">{doc.title}</h5>
                        <p className="text-[10px] text-slate-400 font-bold mt-1 font-mono">{doc.docNumber}</p>
                      </div>
                      <div className="text-[9px] text-slate-500 font-semibold">Tgl Berlaku: {doc.effectiveDate} | Versi: {doc.version}</div>
                    </div>
                    <div className="flex flex-col items-end justify-between shrink-0">
                      <BookOpen className="w-5 h-5 text-slate-400" />
                      <button
                        type="button"
                        onClick={() => alert(`Simulasi Mengunduh File pdf Dokumen SOP: ${doc.title}`)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Unduh PDF</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 4.2: Riwayat Deviasi & CAPA */}
        {currentTab === 'capa' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Register Deviasi Pabrik & CAPA</h4>
                <p className="text-[10px] text-slate-500">Tindakan perbaikan segera (Correction) dan tindakan pencegahan berulang (Preventive Action) untuk pemenuhan sertifikasi GMP.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCapaForm(!showCapaForm)}
                className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Laporkan Deviasi</span>
              </button>
            </div>

            {/* Form CAPA */}
            {showCapaForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const added: CapaRecord = {
                    id: `CAPA-2026-${Date.now().toString().slice(-3)}`,
                    devNumber: newCapa.devNumber || 'DEV/PROD/2609-01',
                    source: newCapa.source || 'Deviasi Produksi',
                    description: newCapa.description || '',
                    severity: newCapa.severity as any,
                    rootCause: newCapa.rootCause || 'Sedang diinvestigasi',
                    correctiveAction: newCapa.correctiveAction || 'Koreksi langsung area terimbas',
                    preventiveAction: newCapa.preventiveAction || 'Penyusunan ulang SOP / Training staf terkait',
                    status: 'OPEN',
                    targetDate: newCapa.targetDate || '2026-09-15',
                  };
                  setCapaRecords([added, ...capaRecords]);
                  setShowCapaForm(false);
                  setNewCapa({ devNumber: '', source: 'Deviasi Produksi', description: '', severity: 'MINOR', rootCause: '', correctiveAction: '', preventiveAction: '', status: 'OPEN', targetDate: '2026-09-15' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">No. Register Deviasi</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: DEV/PROD/2609-02"
                    value={newCapa.devNumber}
                    onChange={(e) => setNewCapa({ ...newCapa, devNumber: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Tingkat Keparahan (Severity)</label>
                  <select
                    value={newCapa.severity}
                    onChange={(e) => setNewCapa({ ...newCapa, severity: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="MINOR">MINOR (Berdampak rendah pada sistem mutu)</option>
                    <option value="MAJOR">MAJOR (Berdampak sedang pada parameter proses)</option>
                    <option value="CRITICAL">CRITICAL (Mempengaruhi keamanan & mutu produk akhir)</option>
                  </select>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Deskripsi Kerusakan / Temuan Deviasi</label>
                  <textarea
                    required
                    placeholder="Contoh: Terjadi kebocoran pipa suplai purified water..."
                    value={newCapa.description}
                    onChange={(e) => setNewCapa({ ...newCapa, description: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-rose-500 h-16 resize-none"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Root Cause Analysis (RCA / 5 Whys)</label>
                  <textarea
                    required
                    placeholder="Mengapa pipa bocor? Karena tekanan AC overload akibat katup tersumbat..."
                    value={newCapa.rootCause}
                    onChange={(e) => setNewCapa({ ...newCapa, rootCause: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-rose-500 h-16 resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Tindakan Koreksi (Corrective Action)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Menghentikan pipa sementara, mengelas pipa rusak"
                    value={newCapa.correctiveAction}
                    onChange={(e) => setNewCapa({ ...newCapa, correctiveAction: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Tindakan Pencegahan (Preventive Action)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Menambahkan pressure sensor otomatis pada pipa"
                    value={newCapa.preventiveAction}
                    onChange={(e) => setNewCapa({ ...newCapa, preventiveAction: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCapaForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Simpan Laporan CAPA
                  </button>
                </div>
              </form>
            )}

            {/* List CAPA Records */}
            <div className="space-y-4">
              {capaRecords
                .filter(c => searchQuery === '' || c.devNumber.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((c) => (
                  <div
                    key={c.id}
                    className={`bg-white p-4 rounded-xl border border-slate-200 shadow-3xs space-y-3 relative overflow-hidden ${
                      c.severity === 'CRITICAL'
                        ? 'border-l-4 border-l-rose-500'
                        : c.severity === 'MAJOR'
                        ? 'border-l-4 border-l-amber-500'
                        : 'border-l-4 border-l-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">{c.id}</span>
                        <span className="font-mono text-[10px] text-slate-500 font-bold">{c.devNumber}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[8px] font-extrabold ${
                            c.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800'
                              : c.severity === 'MAJOR'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {c.severity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-semibold">Tutup: {formatDateDDMMMYYYY(c.targetDate)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCapaRecords(prev => prev.map(item => item.id === c.id ? { ...item, status: item.status === 'OPEN' ? 'CLOSED' : 'OPEN' } : item));
                          }}
                          className={`px-2 py-0.5 rounded-md text-[9px] font-black cursor-pointer transition-all ${
                            c.status === 'CLOSED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800 animate-pulse'
                          }`}
                        >
                          {c.status === 'CLOSED' ? 'CLOSED (Selesai)' : 'OPEN (Berjalan)'}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-800 font-bold leading-snug">{c.description}</p>
                      <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Akar Masalah (RCA):</span>
                          <p className="text-slate-600 font-medium leading-relaxed italic">{c.rootCause}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Tindakan CAPA:</span>
                          <p className="text-slate-700 font-semibold leading-relaxed">
                            <span className="text-rose-600">Koreksi:</span> {c.correctiveAction} <br />
                            <span className="text-emerald-700">Pencegahan:</span> {c.preventiveAction}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 4.3: Complaint Handling */}
        {currentTab === 'complaints' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Registrasi Penanganan Keluhan Konsumen</h4>
                <p className="text-[10px] text-slate-500">Investigasi klaim mutu pelanggan, pengujian retained sample penelusuran balik.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowComplaintForm(!showComplaintForm)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrasi Keluhan Baru</span>
              </button>
            </div>

            {/* Form Complaint */}
            {showComplaintForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const added: QualityComplaint = {
                    id: `COM-${Date.now().toString().slice(-3)}`,
                    comNumber: newComplaint.comNumber || `COMP/2609-0${qualityComplaints.length + 1}`,
                    customer: newComplaint.customer || 'Customer Retail',
                    productName: newComplaint.productName || 'Matte Lip Cream',
                    batchNo: newComplaint.batchNo || 'B260901A',
                    complaintText: newComplaint.complaintText || '',
                    investigationText: 'Pengujian ulang sampel pertinggal sedang dikerjakan.',
                    retestResult: 'Menunggu re-test laboratorium.',
                    status: 'OPEN',
                    date: new Date().toISOString().split('T')[0],
                  };
                  setQualityComplaints([added, ...qualityComplaints]);
                  setShowComplaintForm(false);
                  setNewComplaint({ customer: '', productName: '', batchNo: '', complaintText: '', investigationText: 'Investigasi sampel pertinggal sedang dikerjakan.', retestResult: 'Menunggu hasil lab.', status: 'OPEN' });
                }}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nama Distributor / Konsumen</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Cantik Jelita Retail"
                    value={newComplaint.customer}
                    onChange={(e) => setNewComplaint({ ...newComplaint, customer: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nama Produk</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Brightening Cream SPF30"
                    value={newComplaint.productName}
                    onChange={(e) => setNewComplaint({ ...newComplaint, productName: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Nomor Bets Terimbas</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: B260710C"
                    value={newComplaint.batchNo}
                    onChange={(e) => setNewComplaint({ ...newComplaint, batchNo: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Rincian Keluhan Konsumen</label>
                  <textarea
                    required
                    placeholder="Deskripsikan komplain atau cacat fisik produk..."
                    value={newComplaint.complaintText}
                    onChange={(e) => setNewComplaint({ ...newComplaint, complaintText: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowComplaintForm(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg"
                  >
                    Daftarkan Keluhan
                  </button>
                </div>
              </form>
            )}

            {/* List Complaints */}
            <div className="space-y-4">
              {qualityComplaints
                .filter(cp => searchQuery === '' || cp.comNumber.toLowerCase().includes(searchQuery.toLowerCase()) || cp.productName.toLowerCase().includes(searchQuery.toLowerCase()) || cp.customer.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((cp) => (
                  <div key={cp.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">{cp.comNumber}</span>
                        <span className="bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200 px-1.5 py-0.5 rounded-md">Bets: {cp.batchNo}</span>
                        <span className="font-bold text-slate-800 text-xs">{cp.productName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">{cp.date}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[9px] font-extrabold text-blue-800 uppercase tracking-wider block">Klaim Konsumen ({cp.customer}):</div>
                      <p className="text-xs text-slate-700 leading-relaxed font-semibold bg-blue-50/30 p-2.5 rounded-lg border border-blue-100/50">{cp.complaintText}</p>
                    </div>

                    <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100/80 space-y-2">
                      <div className="text-[9px] font-extrabold text-teal-800 uppercase tracking-wider block">Hasil Analisis & Investigasi Sampel Pertinggal:</div>
                      <p className="text-[11px] text-slate-600 leading-relaxed font-medium"><strong>Investigasi:</strong> {cp.investigationText}</p>
                      <p className="text-[11px] text-slate-700 leading-relaxed font-bold bg-white p-2 rounded-md border border-slate-200 flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-teal-500"></span>
                        <span>Hasil Re-Test: {cp.retestResult}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider ${
                          cp.status === 'CLOSED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : cp.status === 'UNDER_INVESTIGATION'
                            ? 'bg-amber-100 text-amber-800 animate-pulse'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {cp.status === 'CLOSED' ? 'INVESTIGASI SELESAI (CLOSED)' : 'SEDANG DI-RETEST (QC PROCESS)'}
                      </span>
                      {cp.status !== 'CLOSED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setQualityComplaints(prev => prev.map(item => item.id === cp.id ? { ...item, status: 'CLOSED', retestResult: 'Selesai diinvestigasi. Laporan analisis disimpan di arsip.', investigationText: 'Retained sample dinyatakan lulus pengujian organoleptik ulang. Klaim komplain tidak valid/tidak disebabkan proses produksi.' } : item));
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black px-2.5 py-1 rounded-md transition-all cursor-pointer"
                        >
                          Selesaikan Investigasi
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 4.4: Manajemen Deviasi & CAPA (Cross-Dept) */}
        {currentTab === 'deviations' && (
          <div className="p-4">
            <DeviationModule currentUser={{ name: user?.name || 'User', nik: user?.nik || 'USER', role: user?.role || 'staff', department: user?.department }} />
          </div>
        )}
      </div>

      {/* Modals */}
      <QcInspectionModal
        isOpen={!!inspectingReport}
        onClose={() => setInspectingReport(null)}
        report={inspectingReport}
        onSubmitStaffAnalysis={handleSubmitStaffAnalysis}
      />

      <QcManagerAuthModal
        isOpen={!!authorizingReport}
        onClose={() => setAuthorizingReport(null)}
        report={authorizingReport}
        onAuthorize={handleAuthorizeManager}
        onRevertToLab={handleRevertToLab}
      />

      <QcRevertModal
        isOpen={!!revertingReport}
        onClose={() => setRevertingReport(null)}
        report={revertingReport}
        onConfirmRevert={handleConfirmRevert}
      />

      <QcInspectionReportPdfModal
        isOpen={!!pdfReport}
        onClose={() => setPdfReport(null)}
        report={pdfReport}
      />

      <QcStatusLabelModal
        isOpen={!!labelReport || batchArchiveReportsToPrint.length > 0}
        onClose={() => {
          setLabelReport(null);
          setBatchArchiveReportsToPrint([]);
        }}
        report={labelReport}
        reports={!labelReport && batchArchiveReportsToPrint.length > 0 ? batchArchiveReportsToPrint : undefined}
        onViewCoa={(rep) => setPdfReport(rep)}
      />

      <QcContainerSamplingQrModal
        isOpen={!!smartTagReport}
        onClose={() => setSmartTagReport(null)}
        report={smartTagReport}
        onViewCoa={(rep) => setPdfReport(rep)}
      />

      <QcDiagnosticAuditModal
        isOpen={showDiagnosticAudit}
        onClose={() => setShowDiagnosticAudit(false)}
        onSynced={loadData}
      />

      <IpcBulkBatchRegisterModal
        isOpen={showIpcRegisterModal}
        onClose={() => setShowIpcRegisterModal(false)}
        onSuccess={(updatedList, auditRes) => {
          setIpcBulkTests(updatedList);
          if (auditRes) {
            setLatestIpcAuditResult(auditRes);
          }
        }}
      />

      <IpcAnalysisModal
        isOpen={!!selectedAnalysisBatch}
        onClose={() => setSelectedAnalysisBatch(null)}
        batch={selectedAnalysisBatch}
        onSuccess={(updatedList, auditRes) => {
          setIpcBulkTests(updatedList);
          if (auditRes) {
            setLatestIpcAuditResult(auditRes);
          }
        }}
      />

      <IpcInspectionReportPdfModal
        isOpen={!!ipcPdfBatch}
        onClose={() => setIpcPdfBatch(null)}
        batch={ipcPdfBatch}
      />

      <IpcStatusLabelModal
        isOpen={!!ipcLabelState}
        onClose={() => setIpcLabelState(null)}
        batch={ipcLabelState?.batch || null}
        defaultLabelType={ipcLabelState?.type || 'QUARANTINE'}
        onViewReport={(batch) => setIpcPdfBatch(batch)}
      />

      <GrnDetailModal
        isOpen={!!selectedGrnDetail}
        record={selectedGrnDetail}
        onClose={() => setSelectedGrnDetail(null)}
      />
    </div>
  );
};
