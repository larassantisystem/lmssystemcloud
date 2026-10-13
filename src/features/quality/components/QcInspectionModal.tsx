import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FlaskConical,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Lock,
  KeyRound,
  FileCheck2,
  HelpCircle,
  AlertCircle,
  FileCheck,
  Eye,
  Cloud,
  RotateCcw,
} from 'lucide-react';
import { QcInspectionReport, QcParameterResult } from '../types/qcTypes';
import { analyzeLabResults } from '../utils/qcAiAssistant';
import { calculateAutoRetestDate, getUserJabatan } from '../utils/qcNumbering';
import { useAuth } from '../../../core/auth/AuthContext';
import { warehouseService } from '../../warehouse/warehouseService';
import { CoaViewerModal } from '../../warehouse/components/CoaViewerModal';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QcInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: QcInspectionReport | null;
  onSubmitStaffAnalysis: (
    reportId: string,
    parameters: QcParameterResult[],
    staffDecision: 'RELEASE' | 'REJECT',
    staffNotes: string,
    passwordInput: string,
    actualSampleSize?: number,
    actualSampleUnit?: string,
    retestDate?: string,
    sampledContainers?: string,
    samplingDateTime?: string
  ) => Promise<void>;
}

export const QcInspectionModal: React.FC<QcInspectionModalProps> = ({
  isOpen,
  onClose,
  report,
  onSubmitStaffAnalysis,
}) => {
  const { user } = useAuth();

  const [parameters, setParameters] = useState<QcParameterResult[]>([]);
  const [staffDecision, setStaffDecision] = useState<'RELEASE' | 'REJECT'>('RELEASE');
  const [staffNotes, setStaffNotes] = useState('');
  const [actualSampleSize, setActualSampleSize] = useState<string>('');
  const [actualSampleUnit, setActualSampleUnit] = useState<string>('gram');

  // CPKB Paperless Sampling & Retest Date States
  const [retestDate, setRetestDate] = useState<string>('');
  const [selectedContainers, setSelectedContainers] = useState<number[]>([]);
  const [samplingDateTime, setSamplingDateTime] = useState<string>('');

  // Digital Signature Password Modal inside
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [staffPassword, setStaffPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focusedEmptyParamId, setFocusedEmptyParamId] = useState<string | null>(null);
  const [showCoaViewer, setShowCoaViewer] = useState(false);

  useEscapeKey(() => {
    if (showCoaViewer) {
      setShowCoaViewer(false);
    } else if (showSignatureModal) {
      setShowSignatureModal(false);
      setStaffPassword('');
      setErrorMessage('');
    } else {
      onClose();
    }
  }, isOpen && !!report);

  const matchingGrn = report
    ? warehouseService
        .getLocalRecords()
        .find((r) => r.id === report.grnId || r.grnNumber === report.grnNumber)
    : null;

  // References to input elements for auto-focusing on incomplete fields
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    if (report) {
      setParameters(
        report.parameters && report.parameters.length > 0
          ? JSON.parse(JSON.stringify(report.parameters))
          : []
      );
      setStaffDecision(report.staffDecision || 'RELEASE');
      setStaffNotes(report.staffNotes || '');

      const defaultUnit = report.actualSampleUnit || (report.materialType === 'raw' ? 'gram' : 'pcs');
      const defaultSize = report.actualSampleSize !== undefined && report.actualSampleSize !== null
        ? String(report.actualSampleSize)
        : (report.materialType === 'packaging' ? String(report.samplingInfo.sampleSizeQuantity || '') : '');
      setActualSampleSize(defaultSize);
      setActualSampleUnit(defaultUnit);

      // Initialize Retest Date: Auto-calculated 3 months before expired date for raw materials
      if (report.retestDate) {
        setRetestDate(report.retestDate);
      } else if (report.materialType === 'raw') {
        const autoDate = calculateAutoRetestDate('raw', report.expiryDate, report.receivedDate);
        setRetestDate(autoDate);
      } else {
        setRetestDate('');
      }

      // Initialize Sampled Containers
      const sampleCount = report.samplingInfo?.sampleSizeQuantity || 1;
      const initialContainers: number[] = [];
      for (let i = 1; i <= Math.min(sampleCount, report.containerCount || 1); i++) {
        initialContainers.push(i);
      }
      setSelectedContainers(initialContainers);

      // Initialize Sampling DateTime
      setSamplingDateTime(
        report.samplingDateTime || new Date().toISOString().slice(0, 16)
      );

      setShowSignatureModal(false);
      setStaffPassword('');
      setErrorMessage('');
      setFocusedEmptyParamId(null);
    }
  }, [report]);

  const handleToggleContainer = (num: number) => {
    setSelectedContainers((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort((a, b) => a - b)
    );
  };

  const handleSetRetestMonths = (months: number) => {
    const baseDate = report?.receivedDate ? new Date(report.receivedDate) : new Date();
    const targetDate = new Date(baseDate);
    targetDate.setMonth(targetDate.getMonth() + months);
    setRetestDate(targetDate.toISOString().split('T')[0]);
  };

  if (!isOpen || !report) return null;

  // Real-time AI Analysis of lab parameters
  const aiResult = analyzeLabResults(report.materialName, report.materialType, parameters);

  const handleParamValueChange = (id: string, value: string) => {
    setParameters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, resultValue: value } : p))
    );
    if (focusedEmptyParamId === id && value.trim()) {
      setFocusedEmptyParamId(null);
    }
  };

  const handleParamComplianceToggle = (id: string, isCompliant: boolean) => {
    setParameters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isCompliant } : p))
    );
  };

  const handleOpenSignaturePrompt = () => {
    // Validate: Check for incomplete parameter results
    const emptyIndex = parameters.findIndex((p) => !p.resultValue || !p.resultValue.trim());
    
    if (emptyIndex !== -1) {
      const firstEmpty = parameters[emptyIndex];
      setFocusedEmptyParamId(firstEmpty.id);
      setErrorMessage(
        `Parameter No. ${emptyIndex + 1} ("${firstEmpty.parameterName}") belum diisi. Harap lengkapi seluruh hasil analisa laboratorium.`
      );

      // Smooth scroll and focus on the topmost incomplete input
      const targetInput = inputRefs.current[firstEmpty.id];
      if (targetInput) {
        targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          targetInput.focus();
        }, 150);
      }
      return;
    }

    // Validate: Check actual sample size
    const parsedSampleSize = parseFloat(actualSampleSize);
    if (isNaN(parsedSampleSize) || parsedSampleSize <= 0) {
      setErrorMessage(
        report.materialType === 'raw'
          ? 'Jumlah sampel aktual dalam gram wajib diisi dengan angka valid (> 0).'
          : 'Jumlah sampel aktual dalam pcs wajib diisi dengan angka valid (> 0).'
      );
      return;
    }

    setErrorMessage('');
    setFocusedEmptyParamId(null);
    setShowSignatureModal(true);
  };

  const handleFinalSubmitWithSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffPassword) {
      setErrorMessage('Kata sandi staf wajib diisi untuk verifikasi tanda tangan digital.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      const parsedSampleSize = parseFloat(actualSampleSize);

      const sampledContainersStr = selectedContainers.length > 0
        ? `Wadah #${selectedContainers.join(', #')} (Total ${report.containerCount} ${report.containerType})`
        : `Wadah #1 (Total ${report.containerCount} ${report.containerType})`;

      await onSubmitStaffAnalysis(
        report.id,
        parameters,
        staffDecision,
        staffNotes,
        staffPassword,
        isNaN(parsedSampleSize) ? undefined : parsedSampleSize,
        actualSampleUnit,
        retestDate || undefined,
        sampledContainersStr,
        samplingDateTime || undefined
      );
      setShowSignatureModal(false);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan dan mengajukan hasil analisa');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-800 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-xs">
              <FlaskConical className="w-6 h-6 text-teal-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">
                  Lembar Kerja Pengujian Lab QC ({report.materialType === 'raw' ? 'Bahan Baku' : 'Bahan Kemas'})
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/40 text-teal-100 border border-teal-400/30">
                  {report.grnNumber}
                </span>
              </div>
              <p className="text-xs text-teal-100/90 font-normal">
                Pengawasan Mutu CPKB • Standar Sampling & Parameter Spesifikasi Laboratorium
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto grow">
          {/* QM Revert to Lab Revision Notice Banner */}
          {report.qmRevertToLabReason && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-amber-950 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                  <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>INSTRUKSI REVISI PENGUJIAN DARI QUALITY MANAGER</span>
                </div>
                {report.qmRevertToLabAt && (
                  <span className="text-[10px] text-amber-700 font-mono">
                    {new Date(report.qmRevertToLabAt).toLocaleString('id-ID')}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold bg-white/90 p-2.5 rounded-lg border border-amber-200 text-amber-950 leading-relaxed">
                "{report.qmRevertToLabReason}"
              </p>
              {report.qmRevertToLabBy && (
                <div className="text-[11px] text-amber-800 flex items-center gap-1 font-medium">
                  <span>Oleh:</span>
                  <span className="font-bold">{report.qmRevertToLabBy}</span>
                </div>
              )}
            </div>
          )}

          {/* Material & Sampling Plan Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Material Identitas */}
            <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Bahan Masuk</span>
                <span className="font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                  {report.materialCode}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-slate-500 block">Nama Material:</span>
                  <span className="font-bold text-slate-800 text-sm">{report.materialName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Produsen / Supplier:</span>
                  <span className="font-semibold text-slate-700">{report.distributor || report.manufacturer}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">No. Batch Produsen:</span>
                  <span className="font-mono font-semibold text-slate-800">{report.batchNumberVendor}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Diterima:</span>
                  <span className="font-bold text-slate-800">
                    {report.quantityReceived.toLocaleString('id-ID', { minimumFractionDigits: 3 })} {report.unit} ({report.containerCount} {report.containerType})
                  </span>
                </div>

                {/* Dokumen CoA Vendor Reference */}
                {(matchingGrn?.coaAttachment || matchingGrn?.coaDriveFileId) && (
                  <div className="col-span-2 pt-2 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-slate-500">CoA Vendor:</span>
                      <span className="font-semibold text-emerald-700 font-mono text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {matchingGrn.coaAttachment?.startsWith('data:image/')
                          ? 'Foto / Scan CoA (.JPG/.PNG)'
                          : matchingGrn.coaAttachment?.startsWith('data:application/pdf')
                          ? 'Dokumen CoA (.PDF)'
                          : matchingGrn.coaAttachment?.startsWith('data:')
                          ? 'Dokumen CoA Terlampir'
                          : (matchingGrn.coaAttachment || 'Dokumen CoA')}
                      </span>
                      {matchingGrn.coaDriveFileId && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          <Cloud className="w-2.5 h-2.5 text-blue-600" /> GDrive
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCoaViewer(true)}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center gap-1 border border-blue-200 cursor-pointer shadow-2xs transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Lihat CoA (Google Drive)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sampling Plan Calculation */}
            <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-4 text-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-700" />
                    Rencana Sampling
                  </span>
                  {report.samplingInfo.sampleSizeCodeLetter && (
                    <span className="px-2 py-0.5 rounded-md bg-teal-700 text-white font-mono font-bold text-[11px]">
                      Code: {report.samplingInfo.sampleSizeCodeLetter}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-teal-800 mb-2">
                  {report.samplingInfo.samplingStandard}
                </p>
                <div className="bg-white/80 border border-teal-200 rounded-lg p-2.5 text-slate-700 space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Rencana Sampling:</span>
                    <span className="font-bold text-teal-900 text-sm">
                      {report.samplingInfo.sampleSizeQuantity} {report.samplingInfo.sampleUnit}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 leading-snug pt-1 border-t border-teal-100">
                    {report.samplingInfo.samplingDescription}
                  </div>

                  {/* Input Jumlah Sampel Fisik Laboratorium */}
                  <div className="pt-2 border-t border-teal-200">
                    <label className="block text-[11px] font-bold text-teal-950 uppercase tracking-wide mb-1">
                      Jumlah Sampel Diuji ({report.materialType === 'raw' ? 'gram' : 'pcs'}) <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step={report.materialType === 'raw' ? '0.01' : '1'}
                        min="0.01"
                        required
                        value={actualSampleSize}
                        onChange={(e) => setActualSampleSize(e.target.value)}
                        placeholder={report.materialType === 'raw' ? 'Contoh: 100' : 'Contoh: 32'}
                        className="w-full bg-white text-xs border border-teal-300 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-bold text-slate-800"
                      />
                      <span className="px-2.5 py-1.5 rounded-lg bg-teal-100 text-teal-900 font-bold text-xs border border-teal-200 shrink-0">
                        {actualSampleUnit}
                      </span>
                    </div>
                    <span className="text-[10px] text-teal-700 mt-1 block">
                      {report.materialType === 'raw'
                        ? 'Catat berat sampel yang ditimbang analis dalam satuan gram untuk uji lab.'
                        : 'Catat kuantitas unit kemasan fisik yang diambil untuk uji QC.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CPKB Paperless Sampling & Retest Date Control Panel */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-700" />
                Pencatatan Sampling Wadah (Paperless) & Uji Ulang (Retest Date)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Standar CPKB BPOM
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Wadah yang Disampling (Interactive Container Selector) */}
              <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 block">
                    Pilih Wadah/Drum yang Disampling:
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Terpilih: {selectedContainers.length} dari {report.containerCount} {report.containerType}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50 rounded border border-slate-100">
                  {Array.from({ length: report.containerCount || 1 }, (_, i) => i + 1).map((drumNum) => {
                    const isSelected = selectedContainers.includes(drumNum);
                    return (
                      <button
                        key={drumNum}
                        type="button"
                        onClick={() => handleToggleContainer(drumNum)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-700 text-white shadow-xs scale-102 ring-1 ring-emerald-600'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        #{drumNum} {isSelected ? '✓ Disampling' : ''}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>Klik nomor wadah untuk menandai sampling digital.</span>
                  <button
                    type="button"
                    onClick={() => {
                      const all: number[] = [];
                      for (let i = 1; i <= (report.containerCount || 1); i++) all.push(i);
                      setSelectedContainers(all);
                    }}
                    className="text-emerald-700 hover:underline font-semibold"
                  >
                    Pilih Semua
                  </button>
                </div>
              </div>

              {/* Tanggal Retest (Uji Ulang) & Waktu Sampling */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                {report.materialType === 'raw' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                        Tanggal Uji Ulang (*Retest Date*):
                      </label>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        Otomatis (H-3 Bulan Expired)
                      </span>
                    </div>
                    <input
                      type="date"
                      value={retestDate}
                      onChange={(e) => setRetestDate(e.target.value)}
                      className="w-full bg-emerald-50/40 border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-emerald-950 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span>
                        Basis Kedaluwarsa: <strong className="text-slate-700 font-mono">{report.expiryDate || 'N/A'}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const auto = calculateAutoRetestDate('raw', report.expiryDate, report.receivedDate);
                          setRetestDate(auto);
                        }}
                        className="text-[10px] text-emerald-700 hover:text-emerald-800 font-semibold underline"
                      >
                        Reset ke Otomatis
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Kategori Bahan:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      Bahan Kemas (Tidak memerlukan uji ulang kimia/Retest Date)
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-medium">Waktu Sampling:</span>
                  <input
                    type="datetime-local"
                    value={samplingDateTime}
                    onChange={(e) => setSamplingDateTime(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] font-mono text-slate-700"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* AI Smart Assessor Card */}
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-600 text-white rounded-lg shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="grow space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                    AI Smart Assessor (Analisa Deviasi & Kepatuhan Spesifikasi)
                  </h4>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      aiResult.deviationRisk === 'LOW'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : aiResult.deviationRisk === 'MEDIUM'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}
                  >
                    Kepatuhan: {aiResult.complianceScore}% ({aiResult.deviationRisk === 'LOW' ? 'Sesuai Standar' : aiResult.deviationRisk === 'MEDIUM' ? 'Deviasi Minor' : 'Deviasi Kritis'})
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {aiResult.summary}
                </p>
                <p className="text-xs text-indigo-700 font-semibold pt-1">
                  💡 {aiResult.suggestedAction}
                </p>
              </div>
            </div>
          </div>

          {/* Lab Parameters Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span>Checklist & Hasil Pengujian Laboratorium</span>
                <span className="text-slate-400 font-normal">({parameters.length} Parameter Standar)</span>
              </h4>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="p-3 w-10 text-center">No</th>
                    <th className="p-3 w-1/3">Parameter</th>
                    <th className="p-3 w-1/3">Spesifikasi</th>
                    <th className="p-3 w-1/3">Hasil Analisa Lab <span className="text-red-500">*</span></th>
                    <th className="p-3 w-28 text-center">Evaluasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parameters.map((param, idx) => {
                    const isTargetEmpty = focusedEmptyParamId === param.id;
                    return (
                      <tr
                        key={param.id}
                        className={`transition-colors ${
                          isTargetEmpty
                            ? 'bg-amber-50/90 ring-2 ring-amber-400 ring-inset'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800 leading-snug">
                            {param.parameterName}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-xs text-slate-700 bg-slate-50/80 border border-slate-200 rounded-lg p-2 leading-relaxed">
                            {param.specification}
                          </div>
                        </td>
                        <td className="p-3">
                          <input
                            ref={(el) => {
                              inputRefs.current[param.id] = el;
                            }}
                            type="text"
                            required
                            placeholder="Masukkan nilai hasil uji lab..."
                            value={param.resultValue}
                            onChange={(e) => handleParamValueChange(param.id, e.target.value)}
                            className={`w-full text-xs font-semibold p-2.5 rounded-lg border focus:outline-hidden transition-all shadow-xs ${
                              isTargetEmpty
                                ? 'border-amber-500 bg-amber-50 text-slate-900 ring-2 ring-amber-400'
                                : !param.resultValue
                                ? 'border-amber-300 bg-amber-50/40 text-slate-800 focus:border-teal-500'
                                : param.isCompliant
                                ? 'border-emerald-300 bg-emerald-50/30 text-emerald-900 focus:border-emerald-500'
                                : 'border-red-300 bg-red-50/30 text-red-900 focus:border-red-500'
                            }`}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              title="Memenuhi Syarat (Pass)"
                              onClick={() => handleParamComplianceToggle(param.id, true)}
                              className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center gap-1 transition-all ${
                                param.isCompliant
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              MS
                            </button>
                            <button
                              type="button"
                              title="Tidak Memenuhi Syarat (Fail)"
                              onClick={() => handleParamComplianceToggle(param.id, false)}
                              className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center gap-1 transition-all ${
                                !param.isCompliant
                                  ? 'bg-red-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              TMS
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Staf Decision & Notes Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Keputusan Awal & Rekomendasi Staf Analis QC
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Status Rekomendasi Staf:
                </label>
                <div className="flex gap-3">
                  <label
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                      staffDecision === 'RELEASE'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="staffDecision"
                      value="RELEASE"
                      checked={staffDecision === 'RELEASE'}
                      onChange={() => setStaffDecision('RELEASE')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    Memenuhi Syarat (Rilis)
                  </label>

                  <label
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                      staffDecision === 'REJECT'
                        ? 'border-red-600 bg-red-50 text-red-900 font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="staffDecision"
                      value="REJECT"
                      checked={staffDecision === 'REJECT'}
                      onChange={() => setStaffDecision('REJECT')}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <XCircle className="w-4 h-4 text-red-600" />
                    Tidak Memenuhi Syarat (Reject)
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Catatan Analis / Disposisi Teknis:
                </label>
                <textarea
                  rows={2}
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  placeholder="Catatan hasil pengujian laboratorium..."
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800"
                />
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-slate-400" />
            <span>Pengajuan mewajibkan Digital Signature (Konfirmasi Password Staf)</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleOpenSignaturePrompt}
              className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-98 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              Selesaikan Analisa & Ajukan ke Manager
            </button>
          </div>
        </div>
      </div>

      {/* Internal Modal: Staff Digital Signature Confirmation */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-teal-200 animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-teal-700 to-emerald-800 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-lg">
                  <KeyRound className="w-5 h-5 text-teal-100" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Digital Signature Staf QC</h3>
                  <p className="text-[11px] text-teal-100 font-normal">
                    Konfirmasi Hasil Analisa & Penerbitan No. Lot Internal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFinalSubmitWithSignature} className="p-6 space-y-4">
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 space-y-2 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">{user?.role ? getUserJabatan(user) : 'Staf Analis QC'}:</span>
                  <span className="font-bold text-teal-900">{user?.name || 'Ayu'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NIK:</span>
                  <span className="font-mono text-slate-800">{user?.nik || 'LMS20001'}</span>
                </div>
                <div className="flex justify-between border-t border-teal-200/60 pt-1.5">
                  <span className="text-slate-500">Rekomendasi Staf:</span>
                  <span
                    className={`font-bold ${
                      staffDecision === 'RELEASE' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {staffDecision === 'RELEASE' ? 'MEMENUHI SYARAT (RILIS)' : 'TIDAK MEMENUHI SYARAT (REJECT)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">No. Lot Internal (Baru):</span>
                  <span className="font-mono font-bold text-teal-800">
                    Otomatis Diterbitkan (L{report.materialType === 'raw' ? 'BB' : 'BK'}2609XXX)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Masukkan Password Akun Anda <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Masukkan kata sandi..."
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800"
                />
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Gunakan kata sandi akun login Anda
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700 font-medium">
                  {errorMessage}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignatureModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 active:scale-98 disabled:opacity-50 rounded-xl shadow-md flex items-center gap-2"
                >
                  {isSubmitting ? 'Memverifikasi...' : 'Tanda Tangani & Ajukan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coa Viewer Modal */}
      {showCoaViewer && (
        <CoaViewerModal
          isOpen={showCoaViewer}
          onClose={() => setShowCoaViewer(false)}
          fileName={matchingGrn?.coaAttachment || 'CoA_Dokumen.pdf'}
          driveFileId={matchingGrn?.coaDriveFileId}
          driveViewLink={matchingGrn?.coaDriveViewLink}
          materialName={report.materialName}
          materialCode={report.materialCode}
          batchNumber={report.batchNumberVendor}
          grnNumber={report.grnNumber}
          onDriveUploaded={(res) => {
            if (matchingGrn) {
              matchingGrn.coaDriveFileId = res.fileId;
              matchingGrn.coaDriveViewLink = res.viewLink;
            }
          }}
        />
      )}
    </div>
  );
};
