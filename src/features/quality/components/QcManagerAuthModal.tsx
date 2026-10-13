import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  KeyRound,
  FileText,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  RotateCcw,
  FlaskConical,
} from 'lucide-react';
import { QcInspectionReport } from '../types/qcTypes';
import { useAuth } from '../../../core/auth/AuthContext';
import { isQualityManager } from '../../../core/auth/permissionGuard';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QcManagerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: QcInspectionReport | null;
  onAuthorize: (
    reportId: string,
    decision: 'RELEASE' | 'RELEASE_BY_DEVIATION' | 'REJECT',
    deviationNumber: string,
    qmNotes: string,
    passwordInput: string
  ) => Promise<void>;
  onRevertToLab?: (
    reportId: string,
    revisionInstruction: string,
    passwordInput: string
  ) => Promise<void>;
}

export const QcManagerAuthModal: React.FC<QcManagerAuthModalProps> = ({
  isOpen,
  onClose,
  report,
  onAuthorize,
  onRevertToLab,
}) => {
  useEscapeKey(onClose, isOpen && !!report);

  const { user } = useAuth();

  const [activeMode, setActiveMode] = useState<'AUTHORIZE' | 'REVERT_TO_LAB'>('AUTHORIZE');
  const [decision, setDecision] = useState<'RELEASE' | 'RELEASE_BY_DEVIATION' | 'REJECT'>('RELEASE');
  const [deviationNumber, setDeviationNumber] = useState('');
  const [qmNotes, setQmNotes] = useState('');
  const [revertToLabInstruction, setRevertToLabInstruction] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (report) {
      setActiveMode('AUTHORIZE');
      if (report.staffDecision === 'REJECT') {
        setDecision('REJECT');
      } else {
        setDecision('RELEASE');
      }
      setDeviationNumber('');
      setQmNotes('');
      setRevertToLabInstruction('');
      setPasswordInput('');
      setErrorMessage('');
    }
  }, [report]);

  if (!isOpen || !report) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isQualityManager(user)) {
      setErrorMessage('Akses Ditolak: Anda tidak memiliki wewenang Quality Manager untuk melakukan otorisasi ini. Hanya Quality Manager atau Super Admin yang diizinkan.');
      return;
    }

    if (!passwordInput) {
      setErrorMessage('Kata sandi Quality Manager wajib diisi untuk otorisasi digital.');
      return;
    }

    if (activeMode === 'REVERT_TO_LAB') {
      if (!revertToLabInstruction || revertToLabInstruction.trim().length < 5) {
        setErrorMessage('Instruksi/alasan perbaikan uji lab wajib diisi (minimal 5 karakter).');
        return;
      }

      if (!onRevertToLab) {
        setErrorMessage('Fungsi pengembalian ke lab belum tersedia.');
        return;
      }

      try {
        setIsSubmitting(true);
        setErrorMessage('');
        await onRevertToLab(report.id, revertToLabInstruction.trim(), passwordInput);
        onClose();
      } catch (err: any) {
        setErrorMessage(err.message || 'Gagal mengembalikan laporan ke proses uji lab');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (decision === 'RELEASE_BY_DEVIATION' && (!deviationNumber || deviationNumber.trim().length < 3)) {
      setErrorMessage('Nomor Formulir Deviasi / Kajian Risiko Mutu wajib diisi untuk rilis berdeviasi.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      await onAuthorize(report.id, decision, deviationNumber.trim(), qmNotes.trim(), passwordInput);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal melakukan otorisasi keputusan mutu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStaffRejected = report.staffDecision === 'REJECT';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full my-auto overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header (Always sticky & visible at top) */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-blue-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 rounded-xl border border-blue-400/30">
              <ShieldCheck className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">
                  Otorisasi Akhir Mutu (Quality Manager)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                  {report.lotInternalNumber || report.grnNumber}
                </span>
              </div>
              <p className="text-xs text-blue-200/80 font-normal">
                Pelepasan Resmi Bahan Baku / Kemas ke Jalur Produksi & Ruang Timbang (CPKB)
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto grow flex flex-col justify-between">
          <div className="space-y-5">
          {/* Summary Lot Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-semibold text-slate-500">Material & Lot Identitas:</span>
              <span className="font-mono font-bold text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                {report.lotInternalNumber || 'Laporan QC'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-slate-700">
              <div>
                <span className="text-slate-400 block">Nama Material:</span>
                <span className="font-bold text-slate-900">{report.materialCode} - {report.materialName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">No. Batch Produsen:</span>
                <span className="font-mono font-semibold">{report.batchNumberVendor}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Supplier:</span>
                <span className="font-semibold text-slate-800 truncate block">{report.distributor}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Jumlah Masuk:</span>
                <span className="font-semibold">
                  {report.quantityReceived.toLocaleString('id-ID', { minimumFractionDigits: 3 })} {report.unit} ({report.containerCount} {report.containerType})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Rencana Sampling:</span>
                <span className="font-semibold text-slate-800">
                  {report.samplingInfo.sampleSize} {report.samplingInfo.sampleUnit} ({report.samplingInfo.sampleContainers} wadah)
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">{report.staffSignature?.signerRole || 'Staf Analis QC'}:</span>
                <span className="font-semibold text-slate-800">
                  {report.staffSignature?.signerName || report.sampledBy || 'Ayu'}
                </span>
              </div>
            </div>
          </div>

          {/* Tabel Hasil Analisa Parameter Uji Staf Analis */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Hasil Analisa Pengujian Laboratorium ({report.staffSignature?.signerRole || 'Staf Analis QC'})
                </h4>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {report.parameters?.length || 0} Parameter Uji
              </span>
            </div>

            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 text-center w-8">No</th>
                    <th className="py-2 px-3 min-w-[160px]">Parameter Pengujian</th>
                    <th className="py-2 px-3 min-w-[180px]">Spesifikasi Monografi</th>
                    <th className="py-2 px-3 min-w-[150px]">Hasil Uji Lab Staf</th>
                    <th className="py-2 px-3 text-center w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {report.parameters && report.parameters.length > 0 ? (
                    report.parameters.map((p, idx) => (
                      <tr
                        key={p.id || idx}
                        className={!p.isCompliant ? 'bg-red-50/70 text-red-950 font-medium' : 'hover:bg-slate-50/60'}
                      >
                        <td className="py-2 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{p.parameterName}</td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">{p.specification}</td>
                        <td className="py-2 px-3 font-mono font-bold">
                          {p.resultValue || <span className="text-slate-400 italic">Belum diinput</span>}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {p.isCompliant ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              MS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-200 animate-pulse">
                              <AlertOctagon className="w-3 h-3 text-red-600" />
                              TMS
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400 italic text-xs">
                        Tidak ada parameter pengujian yang tercatat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Staf Decision & AI Assessment Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                isStaffRejected
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {isStaffRejected ? (
                <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">
                  Rekomendasi Staf Analis: {isStaffRejected ? 'TIDAK MEMENUHI SYARAT (REJECT)' : 'MEMENUHI SYARAT (RILIS)'}
                </div>
                <div className="text-[11px] opacity-90 mt-1">
                  <strong>Catatan Staf:</strong> {report.staffNotes || 'Semua parameter pengujian telah selesai dianalisa dan diverifikasi sesuai spesifikasi CPKB.'}
                </div>
                {report.staffSignature && (
                  <div className="text-[10px] text-slate-500 font-mono mt-1 border-t border-slate-200/60 pt-1">
                    Ditandatangani oleh {report.staffSignature.signerName} ({report.staffSignature.signerNik}) • {new Date(report.staffSignature.signedAt).toLocaleString('id-ID')}
                  </div>
                )}
              </div>
            </div>

            {report.aiAssessment ? (
              <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold flex items-center justify-between">
                    <span>AI Kepatuhan: {report.aiAssessment.complianceScore}%</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-200 text-purple-800 font-mono">
                      {report.aiAssessment.deviationRisk} RISK
                    </span>
                  </div>
                  <div className="text-[11px] text-purple-800/90 mt-0.5">
                    {report.aiAssessment.summary}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                <span className="text-xs">Pemeriksaan spesifikasi monografi CPKB aktif.</span>
              </div>
            )}
          </div>

          {/* Mode Switcher: Otorisasi Mutu vs Revert ke Uji Lab */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setActiveMode('AUTHORIZE');
                setErrorMessage('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                activeMode === 'AUTHORIZE'
                  ? 'bg-white text-indigo-950 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Otorisasi Keputusan Mutu (Rilis / Tolak)
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('REVERT_TO_LAB');
                setErrorMessage('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                activeMode === 'REVERT_TO_LAB'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-800 hover:text-amber-900 hover:bg-amber-100/60'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              Kembalikan ke Uji Lab (Re-Test / Revisi)
            </button>
          </div>

          {activeMode === 'REVERT_TO_LAB' ? (
            /* Mode 2: Revert to Lab Testing */
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                  <FlaskConical className="w-5 h-5 text-amber-600" />
                  Instruksi Pengembalian ke Proses Uji Lab (Analis QC)
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Laporan akan dikembalikan ke tab <strong>"Proses Uji Lab"</strong> untuk dilakukan pengujian ulang (re-test) atau revisi data analisa oleh analis. Status GRN gudang tetap berada pada proses QC.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Catatan Revisi / Parameter yang Wajib Diuji Ulang <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={revertToLabInstruction}
                  onChange={(e) => setRevertToLabInstruction(e.target.value)}
                  placeholder="Contoh: Hasil uji pH meragukan, mohon dilakukan replikasi 3x menggunakan pH meter terkalibrasi. Lampirkan logbook..."
                  className="w-full text-xs border border-amber-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-slate-900 bg-white"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Catatan ini akan tampil secara jelas sebagai banner instruksi pada form analisa analis.
                </p>
              </div>
            </div>
          ) : (
            /* Mode 1: Authorize Decision Matrix */
            <>
              {/* Manager Decision Matrix Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Keputusan Otorisasi Quality Manager <span className="text-red-500">*</span>
                </label>

                {!isStaffRejected ? (
                  // If Staff = MS -> Manager options: RELEASE
                  <div className="grid grid-cols-1 gap-2">
                    <label
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        decision === 'RELEASE'
                          ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="qmDecision"
                        value="RELEASE"
                        checked={decision === 'RELEASE'}
                        onChange={() => setDecision('RELEASE')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="grow">
                        <div className="font-bold text-xs flex items-center gap-1.5 text-emerald-900">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          1. OTORISASI RELEASE (DILULUSKAN PENUH)
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Bahan memenuhi semua spesifikasi CPKB. Stok langsung rilis ke Ruang Timbang (FEFO).
                        </div>
                      </div>
                    </label>
                  </div>
                ) : (
                  // If Staff = TMS -> Manager options: RELEASE_BY_DEVIATION or REJECT
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        decision === 'RELEASE_BY_DEVIATION'
                          ? 'border-amber-600 bg-amber-50/70 text-amber-950 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="qmDecision"
                        value="RELEASE_BY_DEVIATION"
                        checked={decision === 'RELEASE_BY_DEVIATION'}
                        onChange={() => setDecision('RELEASE_BY_DEVIATION')}
                        className="text-amber-600 focus:ring-amber-500 mt-0.5"
                      />
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5 text-amber-900">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          Release by Deviation
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">
                          Rilis dengan deviasi terkontrol berdasarkan kajian risiko mutu yang disetujui.
                        </div>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        decision === 'REJECT'
                          ? 'border-red-600 bg-red-50/70 text-red-950 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="qmDecision"
                        value="REJECT"
                        checked={decision === 'REJECT'}
                        onChange={() => setDecision('REJECT')}
                        className="text-red-600 focus:ring-red-500 mt-0.5"
                      />
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5 text-red-900">
                          <AlertOctagon className="w-4 h-4 text-red-600" />
                          Tolak Bahan (Reject)
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">
                          Penolakan permanen. Bahan dipindahkan ke karantina tolak untuk retur pemasok.
                        </div>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Deviation Number (Required if RELEASE_BY_DEVIATION) */}
              {decision === 'RELEASE_BY_DEVIATION' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5 animate-in fade-in duration-150">
                  <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Nomor Form Deviasi / Kajian Risiko Mutu <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: DEV-2026-09-004 / CAPA-QC-881"
                    value={deviationNumber}
                    onChange={(e) => setDeviationNumber(e.target.value)}
                    className="w-full text-xs font-mono font-bold border border-amber-300 rounded-lg p-2.5 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-slate-900 bg-white"
                  />
                  <p className="text-[11px] text-amber-800">
                    Wajib mencantumkan nomor dokumen kajian risiko mutu yang telah ditandatangani QA/QC.
                  </p>
                </div>
              )}

              {/* Disposisi & Catatan Mutu Manager */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Catatan Disposisi Mutu Quality Manager
                </label>
                <textarea
                  rows={2}
                  value={qmNotes}
                  onChange={(e) => setQmNotes(e.target.value)}
                  placeholder="Contoh: Disetujui untuk rilis penimbangan bets formulasi..."
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </>
          )}

          {/* Electronic Signature: Password Verification */}
          {!isQualityManager(user) ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-800 space-y-1">
                <p className="font-bold">Akses Terbatas: Otorisasi Mutu Khusus Quality Manager</p>
                <p className="text-red-700">
                  Akun Anda tercatat sebagai <strong>{user?.name} ({user?.role.toUpperCase()} - {user?.department.toUpperCase()})</strong>. Berdasarkan regulasi CPKB dan kebijakan sistem, otorisasi rilis/reject dan pengembalian ke uji lab hanya dapat dilakukan oleh <strong>Quality Manager</strong> atau <strong>Super Admin</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-700" />
                  Verifikasi Kata Sandi Digital Signature Manager <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] font-semibold text-blue-800">
                  {user?.name} (Quality Manager)
                </span>
              </div>
              <input
                type="password"
                required
                placeholder="Masukkan kata sandi akun Quality Manager Anda..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full text-sm border border-blue-300 rounded-xl p-2.5 focus:outline-hidden focus:ring-2 focus:ring-blue-600 bg-white text-slate-900"
              />
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                Tanda tangan elektronik ini terikat secara legal dengan identitas Quality Manager.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-xs text-red-700 font-bold">
              {errorMessage}
            </div>
          )}

          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 shrink-0 sticky bottom-0 bg-white/95 backdrop-blur-xs mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isQualityManager(user)}
              className={`px-6 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all active:scale-98 flex items-center gap-2 cursor-pointer ${
                !isQualityManager(user)
                  ? 'bg-slate-400 cursor-not-allowed opacity-60'
                  : activeMode === 'REVERT_TO_LAB'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : decision === 'REJECT'
                  ? 'bg-red-600 hover:bg-red-700'
                  : decision === 'RELEASE_BY_DEVIATION'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? (
                'Memproses...'
              ) : activeMode === 'REVERT_TO_LAB' ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Konfirmasi Kembalikan ke Uji Lab
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Konfirmasi & Tanda Tangani Otorisasi
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
