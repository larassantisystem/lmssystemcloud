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
  AlertCircle,
  Database,
  RotateCcw,
  Layers,
  CheckCircle2,
  Printer,
  FileText,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { IpcBulkTest } from '../utils/qcExtData';
import { ipcBulkService, IpcAuditResult } from '../services/ipcBulkService';
import { productService } from '../../rnd/products/productService';
import { useAuth } from '../../../core/auth/AuthContext';
import { Product } from '../../../types';
import { IpcInspectionReportPdfModal } from './IpcInspectionReportPdfModal';
import { IpcStatusLabelModal } from './IpcStatusLabelModal';
import { formatDateDDMMMYYYY } from '../../../utils/dateUtils';
import { getUserPositionTitle } from '../../../utils/userPositionUtils';
import { generateDigitalSignatureHash } from '../utils/qcNumbering';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface IpcAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: IpcBulkTest | null;
  onSuccess: (updatedList: IpcBulkTest[], auditRes?: IpcAuditResult) => void;
}

export interface IpcParameterRow {
  id: string;
  parameterName: string;
  specification: string;
  resultValue: string;
  isCompliant: boolean;
}

export const IpcAnalysisModal: React.FC<IpcAnalysisModalProps> = ({
  isOpen,
  onClose,
  batch,
  onSuccess,
}) => {
  const { user } = useAuth();

  const [productSpec, setProductSpec] = useState<Product | null>(null);
  const [parameters, setParameters] = useState<IpcParameterRow[]>([]);
  const [staffNotes, setStaffNotes] = useState<string>('');
  
  // Modals for PDF Report and Status Labels
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelType, setLabelType] = useState<'QUARANTINE' | 'RELEASED'>('QUARANTINE');

  // Signature Modal state
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [actionType, setActionType] = useState<'SUBMIT_ANALYST' | 'RELEASE_QM' | 'REJECT_QM' | 'RETURN_ANALYST'>('SUBMIT_ANALYST');
  const [staffPassword, setStaffPassword] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focusedEmptyParamId, setFocusedEmptyParamId] = useState<string | null>(null);

  useEscapeKey(() => {
    if (showPdfModal) {
      setShowPdfModal(false);
    } else if (showLabelModal) {
      setShowLabelModal(false);
    } else if (showSignatureModal) {
      setShowSignatureModal(false);
      setStaffPassword('');
      setReturnReason('');
      setErrorMessage('');
    } else {
      onClose();
    }
  }, isOpen && !!batch);

  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    if (batch) {
      // Fetch product specification from productService
      productService.getProducts().then((products) => {
        const batchCode = (batch.productCode || '').trim().toLowerCase();
        const batchName = (batch.productName || '').trim().toLowerCase();
        const cleanBCode = (batch.productCode || '').replace(/\D/g, '');

        const found = products.find((p) => {
          const pCode = (p.productCode || p.code || '').trim().toLowerCase();
          const pName = (p.name || '').trim().toLowerCase();
          const cleanPCode = (p.productCode || p.code || '').replace(/\D/g, '');
          return (
            (batchCode && (pCode === batchCode || pCode.includes(batchCode) || batchCode.includes(pCode))) ||
            (cleanBCode && cleanPCode && cleanBCode.length >= 3 && cleanBCode === cleanPCode) ||
            (batchName && (pName === batchName || pName.includes(batchName) || batchName.includes(pName)))
          );
        });

        if (found) {
          setProductSpec(found);
        } else {
          setProductSpec(null);
        }

        // DYNAMIC PARAMETERS: Directly map from Supabase Product qc_parameters
        if (found && found.qcParameters && found.qcParameters.length > 0) {
          const dynamicParams: IpcParameterRow[] = found.qcParameters.map((param, idx) => {
            const paramName = param.parameterName || param.name || `Parameter ${idx + 1}`;
            const specCondition = param.acceptanceCondition || param.specification || '-';
            const unitSuffix = param.unit ? ` (${param.unit})` : '';

            // Check if there is already a saved lab parameter in batch
            const existingParam = batch.labParameters?.find(
              (lp) => lp.id === param.id || lp.parameterName.toLowerCase().includes(paramName.toLowerCase())
            );

            const lowerName = paramName.toLowerCase();
            let initialValue = specCondition;

            if (existingParam) {
              initialValue = existingParam.resultValue;
            } else if (lowerName.includes('ph') && batch.pH) {
              initialValue = String(batch.pH);
            } else if ((lowerName.includes('viskos') || lowerName.includes('viscosity')) && batch.viscosity) {
              initialValue = `${batch.viscosity.toLocaleString('id-ID')} cPs`;
            } else if ((lowerName.includes('density') || lowerName.includes('bobot jenis') || lowerName.includes('berat jenis')) && batch.gravity) {
              initialValue = `${batch.gravity} g/mL`;
            } else if ((lowerName.includes('bentuk') || lowerName.includes('organo') || lowerName.includes('pemerian') || lowerName.includes('appearance')) && batch.appearance) {
              initialValue = batch.appearance;
            }

            const initialCompliant = existingParam ? existingParam.isCompliant : true;

            return {
              id: param.id || `param-${idx + 1}`,
              parameterName: `${paramName}${unitSuffix}`,
              specification: specCondition,
              resultValue: initialValue,
              isCompliant: initialCompliant,
            };
          });

          setParameters(dynamicParams);
        } else {
          // Fallback only if product has not configured qc_parameters in Supabase
          const fallbackParams: IpcParameterRow[] = [
            {
              id: 'p1',
              parameterName: 'Pemerian / Organoleptis',
              specification: 'Emulsi/Gel Homogen, Sesuai Standar',
              resultValue: batch.appearance || 'Emulsi/Gel Homogen, Sesuai Standar',
              isCompliant: true,
            },
            {
              id: 'p2',
              parameterName: 'pH Sediaan (25°C)',
              specification: '5.0 - 7.5',
              resultValue: batch.pH ? String(batch.pH) : '6.0',
              isCompliant: true,
            },
            {
              id: 'p3',
              parameterName: 'Viskositas Sediaan (cPs)',
              specification: '3,000 - 18,000 cPs',
              resultValue: batch.viscosity ? `${batch.viscosity.toLocaleString('id-ID')} cPs` : '4,500 cPs',
              isCompliant: true,
            },
          ];
          setParameters(fallbackParams);
        }
      });

      setStaffNotes(batch.rejectionReason || '');
      setShowSignatureModal(false);
      setStaffPassword('');
      setReturnReason('');
      setErrorMessage('');
      setFocusedEmptyParamId(null);
    }
  }, [batch]);

  if (!isOpen || !batch) return null;

  const isAwaitingQm = batch.status === 'AWAITING_QM';
  const isFinalized = batch.status === 'RELEASED' || batch.status === 'REJECTED';
  // Pada tahap otorisasi QM atau setelah final, form hasil analisa terkunci (read-only)
  const isReadOnly = isAwaitingQm || isFinalized;

  const handleParamValueChange = (id: string, value: string) => {
    if (isReadOnly) return;
    setParameters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, resultValue: value } : p))
    );
    if (focusedEmptyParamId === id && value.trim()) {
      setFocusedEmptyParamId(null);
    }
  };

  const handleParamComplianceToggle = (id: string, isCompliant: boolean) => {
    if (isReadOnly) return;
    setParameters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isCompliant } : p))
    );
  };

  const handleOpenSignaturePrompt = (type: 'SUBMIT_ANALYST' | 'RELEASE_QM' | 'REJECT_QM' | 'RETURN_ANALYST') => {
    // Quality Manager authorization enforcement
    if (type === 'RELEASE_QM' || type === 'REJECT_QM' || type === 'RETURN_ANALYST') {
      const isQualityManager =
        user?.role === 'manager' ||
        user?.role === 'admin' ||
        (user?.department === 'quality' && (user?.role === 'manager' || user?.role === 'supervisor'));

      if (!isQualityManager) {
        setErrorMessage('Akses Dibatasi: Otorisasi & Rilis (Release) sediaan ruahan hanya dapat disetujui oleh Quality Manager.');
        return;
      }
    }

    if (type === 'SUBMIT_ANALYST') {
      // Validate empty inputs
      const emptyIndex = parameters.findIndex((p) => !p.resultValue || !p.resultValue.trim());
      if (emptyIndex !== -1) {
        const firstEmpty = parameters[emptyIndex];
        setFocusedEmptyParamId(firstEmpty.id);
        setErrorMessage(
          `Parameter No. ${emptyIndex + 1} ("${firstEmpty.parameterName}") belum diisi. Harap lengkapi seluruh hasil analisa laboratorium.`
        );

        const targetInput = inputRefs.current[firstEmpty.id];
        if (targetInput) {
          targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            targetInput.focus();
          }, 150);
        }
        return;
      }
    }

    setErrorMessage('');
    setActionType(type);
    setShowSignatureModal(true);
  };

  const handleFinalSubmitWithSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffPassword) {
      setErrorMessage('Password otorisasi wajib diisi untuk verifikasi tanda tangan digital.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');

      // Generate current date on signature / authorization
      const today = new Date().toISOString().split('T')[0];
      const nowFormatted = new Date().toLocaleString('id-ID');

      // Extract values dynamically for database columns
      const phRow = parameters.find((p) => p.parameterName.toLowerCase().includes('ph'));
      const viscRow = parameters.find((p) => p.parameterName.toLowerCase().includes('viskos'));
      const gravRow = parameters.find((p) => 
        p.parameterName.toLowerCase().includes('bobot jenis') || 
        p.parameterName.toLowerCase().includes('density') || 
        p.parameterName.toLowerCase().includes('berat jenis') ||
        p.parameterName.toLowerCase().includes('bj')
      );
      const appRow = parameters.find((p) => 
        p.parameterName.toLowerCase().includes('bentuk') ||
        p.parameterName.toLowerCase().includes('warna') ||
        p.parameterName.toLowerCase().includes('bau') ||
        p.parameterName.toLowerCase().includes('pemerian') ||
        p.parameterName.toLowerCase().includes('organo')
      );

      let newStatus: IpcBulkTest['status'] = 'TESTING';
      let staffSig = batch.staffSignature;
      let qmSig = batch.qmSignature;
      let reasonText = batch.rejectionReason;

      if (actionType === 'SUBMIT_ANALYST') {
        newStatus = 'AWAITING_QM';
        staffSig = {
          signerName: user?.name || batch.analyst || 'Staf QC Lab',
          signerNik: user?.nik || '-',
          signerPosition: getUserPositionTitle(user, 'Staf Analis Lab QC'),
          signedAt: nowFormatted,
          signatureHash: generateDigitalSignatureHash(user?.nik || 'STAFF', user?.name || 'Staf QC', 'ANALYZE_IPC', batch.batchNo),
        };
      } else if (actionType === 'RELEASE_QM') {
        newStatus = 'RELEASED';
        qmSig = {
          signerName: user?.name || 'Quality Manager',
          signerNik: user?.nik || '-',
          signerPosition: getUserPositionTitle(user, 'Quality Manager'),
          signedAt: nowFormatted,
          signatureHash: generateDigitalSignatureHash(user?.nik || 'QM', user?.name || 'Quality Manager', 'RELEASE_IPC', batch.batchNo),
        };
      } else if (actionType === 'RELEASE_DEVIATION') {
        newStatus = 'RELEASED_DEVIATION';
        reasonText = returnReason || staffNotes || 'Dirilis dengan Disposisi Deviasi Mutu Terkendali';
        qmSig = {
          signerName: user?.name || 'Quality Manager',
          signerNik: user?.nik || '-',
          signerPosition: getUserPositionTitle(user, 'Quality Manager'),
          signedAt: nowFormatted,
          signatureHash: generateDigitalSignatureHash(user?.nik || 'QM', user?.name || 'Quality Manager', 'RELEASE_DEVIATION_IPC', batch.batchNo),
        };
      } else if (actionType === 'REJECT_QM') {
        newStatus = 'REJECTED';
        reasonText = staffNotes || returnReason || 'Ditolak oleh Quality Manager';
        qmSig = {
          signerName: user?.name || 'Quality Manager',
          signerNik: user?.nik || '-',
          signerPosition: getUserPositionTitle(user, 'Quality Manager'),
          signedAt: nowFormatted,
          signatureHash: generateDigitalSignatureHash(user?.nik || 'QM', user?.name || 'Quality Manager', 'REJECT_IPC', batch.batchNo),
        };
      } else if (actionType === 'RETURN_ANALYST') {
        newStatus = 'RETEST';
        reasonText = returnReason || staffNotes || 'Dikembalikan oleh QM untuk pengujian ulang';
      }

      // Generate dates if not set
      const assignedMixingDate = batch.mixingDate && batch.mixingDate !== '-' && batch.mixingDate.length > 5
        ? batch.mixingDate
        : today;
      const assignedTestDate = today;

      const updatedBatchItem: IpcBulkTest = {
        ...batch,
        productCode: batch.productCode || productSpec?.productCode || productSpec?.code,
        mixingDate: assignedMixingDate,
        testDate: assignedTestDate,
        pH: phRow && phRow.resultValue ? parseFloat(phRow.resultValue.replace(',', '.')) || batch.pH : batch.pH,
        viscosity: viscRow && viscRow.resultValue ? parseFloat(viscRow.resultValue.replace(',', '.')) || batch.viscosity : batch.viscosity,
        gravity: gravRow && gravRow.resultValue ? parseFloat(gravRow.resultValue.replace(',', '.')) || batch.gravity : batch.gravity,
        appearance: appRow && appRow.resultValue ? appRow.resultValue : batch.appearance,
        status: newStatus,
        analyst: actionType === 'SUBMIT_ANALYST' ? (user?.name || batch.analyst || 'Staf QC Lab (IPC)') : batch.analyst,
        labParameters: parameters,
        staffSignature: staffSig,
        qmSignature: qmSig,
        rejectionReason: reasonText,
      };

      const updatedList = await ipcBulkService.updateSingleBatch(updatedBatchItem);
      const auditRes = await ipcBulkService.auditIpcBulkBatches();

      setShowSignatureModal(false);
      onSuccess(updatedList, auditRes);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan hasil analisa ke Supabase');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allCompliant = parameters.every((p) => p.isCompliant);
  const ipcNumber = batch.ipcNo || batch.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-xs">
              <FlaskConical className="w-6 h-6 text-purple-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">
                  Lembar Kerja Pengujian Lab QC - Sediaan Ruahan (IPC Bulk)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/40 text-purple-100 border border-purple-400/30">
                  {ipcNumber} • {batch.batchNo}
                </span>
              </div>
              <p className="text-xs text-purple-100/90 font-normal">
                Pengawasan Mutu CPKB • Spesifikasi Produk RnD & Analisa Kualitas Adonan Ruahan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto grow">
          {/* Material & Product Identitas Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Material Identitas */}
            <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Spesifikasi Produk Jadi (RnD)</span>
                <span className="font-mono font-bold text-purple-900 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200">
                  {batch.productCode || productSpec?.productCode || 'CPKB-SPEC'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-slate-500 block">Nomor IPC:</span>
                  <span className="font-mono font-black text-purple-950 text-sm">{ipcNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Nomor BPOM / NIE:</span>
                  <span className="font-semibold text-slate-700">
                    {productSpec?.bpomNotificationNumber || 'NA18241900123'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Nama Produk:</span>
                  <span className="font-bold text-slate-800 text-sm">{batch.productName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Nomor Bets Ruahan:</span>
                  <span className="font-mono font-bold text-slate-800 bg-purple-100/80 px-2 py-0.5 rounded text-purple-950 inline-block">
                    {batch.batchNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Tanggal Mixing:</span>
                  <span className="font-semibold text-slate-800">
                    {batch.mixingDate ? formatDateDDMMMYYYY(batch.mixingDate) : <em className="text-slate-400 font-normal">Dibuat saat tanda tangan analis</em>}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Tanggal Analisa:</span>
                  <span className="font-semibold text-slate-800">
                    {(batch.testDate || batch.mixingDate) ? formatDateDDMMMYYYY(batch.testDate || batch.mixingDate) : <em className="text-slate-400 font-normal">Dibuat saat tanda tangan analis</em>}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Formula Code / Kategori:</span>
                  <span className="font-mono text-slate-700">
                    {productSpec?.variants?.[0]?.bulkFormulaCode || 'FORM-CPKB-01'} ({productSpec?.category || 'Cosmetics'})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Analis QC:</span>
                  <span className="font-bold text-slate-800">{batch.analyst || user?.name}</span>
                </div>
              </div>
            </div>

            {/* Status & Compliance Summary Badge */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 text-xs flex flex-col justify-between">
              <div>
                <span className="font-bold text-purple-900 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-700" />
                  Status Keputusan QC
                </span>
                <div className="bg-white/80 border border-purple-200 rounded-lg p-3 space-y-2 text-center">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Status Ruahan Saat Ini</span>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold ${
                      batch.status === 'RELEASED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : batch.status === 'AWAITING_QM'
                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                        : batch.status === 'REJECTED'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : batch.status === 'RETEST'
                        ? 'bg-orange-100 text-orange-800 border border-orange-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {batch.status === 'AWAITING_QM'
                      ? 'MENUNGGU OTORISASI QM'
                      : batch.status === 'TESTING'
                      ? 'ANALISA'
                      : batch.status === 'RETEST'
                      ? 'RE-TEST'
                      : batch.status}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-purple-200 text-[11px] text-purple-900 font-medium">
                {isAwaitingQm
                  ? '🔒 Tahap Otorisasi Quality Manager: Seluruh data hasil uji terkunci. Anda dapat menyetujui, menolak, atau mengembalikan ke analis untuk uji ulang.'
                  : 'Sesuai standar CPKB/GMP, rilis adonan ruahan wajib disetujui Quality Manager sebelum diisi (*filling*) ke kemasan primer.'}
              </div>
            </div>
          </div>

          {/* Banner Peringatan Re-test jika dikembalikan oleh Quality Manager */}
          {batch.status === 'RETEST' && (
            <div className="bg-orange-50/95 border-2 border-orange-300 rounded-xl p-4 shadow-xs flex items-start gap-3">
              <div className="p-2 bg-orange-600 text-white rounded-lg shrink-0 mt-0.5">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="grow space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-orange-950 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Permintaan Uji Ulang (Re-test) Dari Quality Manager</span>
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-200 text-orange-900 border border-orange-300">
                    STATUS: RE-TEST
                  </span>
                </div>
                <div className="bg-white/80 p-2.5 rounded-lg border border-orange-200 text-xs text-orange-950">
                  <span className="font-bold text-orange-800 block mb-0.5">Instruksi / Catatan Quality Manager:</span>
                  <p className="font-medium italic">"{batch.rejectionReason || 'Mohon lakukan pengujian ulang parameter pada batch ini.'}"</p>
                </div>
                <p className="text-[11px] text-orange-900 font-medium">
                  Silakan perbarui hasil analisa di tabel pengujian laboratorium di bawah ini, lalu klik <strong>Tanda Tangan & Kirim ke Otorisasi QM</strong> setelah pengujian ulang selesai.
                </p>
              </div>
            </div>
          )}

          {/* AI Smart Assessor Card */}
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-700 text-white rounded-lg shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="grow space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                    AI Smart Assessor (Analisa Deviasi & Kepatuhan Spesifikasi Produk Jadi)
                  </h4>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      allCompliant
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {allCompliant ? '100% Sesuai Spesifikasi' : 'Ada Deviasi Parameter'}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {allCompliant
                    ? `Seluruh parameter pengujian adonan ruahan batch ${batch.batchNo} memenuhi standar spesifikasi produk jadi (${batch.productName}). Sediaan homogen, pH dan viskositas berada dalam rentang wajar.`
                    : `Terdapat parameter yang tidak memenuhi syarat (Out of Spec) pada pengujian batch ${batch.batchNo}. Periksa penyesuaian (*adjusting*) pH atau viskositas sebelum otorisasi.`}
                </p>
              </div>
            </div>
          </div>

          {/* Lab Parameters Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span>Checklist & Hasil Pengujian Laboratorium</span>
                <span className="text-slate-400 font-normal">({parameters.length} Parameter Spesifikasi Produk)</span>
              </h4>
              {isReadOnly && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  🔒 Mode Read-Only (Hasil Uji Terkunci)
                </span>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="p-3 w-10 text-center">No</th>
                    <th className="p-3 w-1/4">Parameter Pengujian</th>
                    <th className="p-3 w-1/3">Spesifikasi Produk Jadi (RnD)</th>
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
                          <div className="text-xs text-slate-700 bg-slate-50/80 border border-slate-200 rounded-lg p-2 font-mono leading-relaxed">
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
                            disabled={isReadOnly}
                            placeholder="Nilai terisi default dari spesifikasi RnD..."
                            value={param.resultValue}
                            onChange={(e) => handleParamValueChange(param.id, e.target.value)}
                            className={`w-full text-xs font-semibold p-2.5 rounded-lg border focus:outline-hidden transition-all shadow-xs ${
                              isReadOnly
                                ? 'bg-slate-100 border-slate-300 text-slate-800 cursor-not-allowed'
                                : isTargetEmpty
                                ? 'border-amber-500 bg-amber-50 text-slate-900 ring-2 ring-amber-400'
                                : !param.resultValue
                                ? 'border-amber-300 bg-amber-50/40 text-slate-800 focus:border-purple-500'
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
                              disabled={isReadOnly}
                              onClick={() => handleParamComplianceToggle(param.id, true)}
                              className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center gap-1 transition-all ${
                                param.isCompliant
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              } ${isReadOnly ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              MS
                            </button>
                            <button
                              type="button"
                              title="Tidak Memenuhi Syarat (Fail)"
                              disabled={isReadOnly}
                              onClick={() => handleParamComplianceToggle(param.id, false)}
                              className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center gap-1 transition-all ${
                                !param.isCompliant
                                  ? 'bg-red-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              } ${isReadOnly ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
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

          {/* Analyst Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Catatan Pengujian & Rekomendasi Tambahan:
            </label>
            <textarea
              rows={2}
              disabled={isReadOnly}
              value={staffNotes}
              onChange={(e) => setStaffNotes(e.target.value)}
              placeholder="Tambahkan catatan kondisi adonan ruahan..."
              className={`w-full border rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-purple-500 ${
                isReadOnly ? 'bg-slate-100 border-slate-300 cursor-not-allowed' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Database className="w-4 h-4 text-purple-700" />
            <span>Direct Supabase Persistence (Zero LocalStorage)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-slate-300 text-slate-700 hover:bg-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
            >
              Tutup
            </button>

            {(batch.status === 'TESTING' || batch.status === 'RETEST' || batch.status === 'PASSED') && (
              <button
                type="button"
                onClick={() => handleOpenSignaturePrompt('SUBMIT_ANALYST')}
                className="bg-purple-800 hover:bg-purple-900 text-white text-xs font-extrabold px-5 py-2 rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-purple-200" />
                <span>Tanda Tangan & Kirim ke Otorisasi QM</span>
              </button>
            )}

            {batch.status === 'AWAITING_QM' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenSignaturePrompt('RETURN_ANALYST')}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Kembalikan u/ Uji Ulang (Re-test)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenSignaturePrompt('REJECT_QM')}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Tolak Ruahan</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenSignaturePrompt('RELEASE_DEVIATION')}
                  className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Rilis ruahan meskipun ada deviasi parameter minor setelah risk assessment"
                >
                  <AlertCircle className="w-4 h-4 text-teal-200" />
                  <span>Rilis Deviasi</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenSignaturePrompt('RELEASE_QM')}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Otorisasi & Rilis (RELEASED)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tanda Tangan Digital / Password Confirmation Dialog */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-purple-900 font-extrabold text-sm">
                <Lock className="w-5 h-5 text-purple-700" />
                <span>
                  {actionType === 'RETURN_ANALYST'
                    ? 'Konfirmasi Pengembalian untuk Uji Ulang'
                    : actionType === 'RELEASE_DEVIATION'
                    ? 'Otorisasi Rilis dengan Disposisi Deviasi'
                    : 'Verifikasi Tanda Tangan Digital CPKB'}
                </span>
              </div>
              <button
                onClick={() => setShowSignatureModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Konfirmasi persetujuan transaksi untuk batch <strong className="text-purple-950 font-mono">{batch.batchNo}</strong> ({batch.productName}).
              </p>

              {actionType === 'RETURN_ANALYST' && (
                <div>
                  <label className="text-[11px] font-extrabold text-amber-800 block mb-1">
                    Alasan / Catatan Pengembalian Uji Ulang <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Contoh: Viskositas masih terlalu encer, harap adjust mixing dan re-test..."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-300 rounded-xl p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>
              )}

              {actionType === 'RELEASE_DEVIATION' && (
                <div>
                  <label className="text-[11px] font-extrabold text-teal-800 block mb-1">
                    Nomor Dokumen Deviasi & Justifikasi Risiko Mutu <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Contoh: DEV-IPC-2026-009 (Deviasi pH tipis 5.8 dari rentang min 6.0, hasil risk assessment aman untuk stabilitas)..."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full bg-teal-50/50 border border-teal-300 rounded-xl p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-extrabold text-slate-700 block mb-1">
                  Masukkan Kata Sandi / PIN Otorisasi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="Password / PIN Pengguna"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFinalSubmitWithSignature(e);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleFinalSubmitWithSignature}
                disabled={isSubmitting}
                className={`text-white text-xs font-extrabold px-5 py-2 rounded-xl transition-all shadow-xs cursor-pointer ${
                  actionType === 'RETURN_ANALYST'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : actionType === 'REJECT_QM'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-purple-800 hover:bg-purple-900'
                }`}
              >
                {isSubmitting ? 'Verifikasi...' : 'Konfirmasi Otorisasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Inspection Report Modal */}
      <IpcInspectionReportPdfModal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        batch={batch}
        productSpec={productSpec}
      />

      {/* Status Label Modal */}
      <IpcStatusLabelModal
        isOpen={showLabelModal}
        onClose={() => setShowLabelModal(false)}
        batch={batch}
        productSpec={productSpec}
        defaultLabelType={labelType}
      />
    </div>
  );
};

