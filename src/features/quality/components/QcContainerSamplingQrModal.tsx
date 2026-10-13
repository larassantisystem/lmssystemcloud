import React, { useState } from 'react';
import {
  X,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FlaskConical,
  ShieldCheck,
  Calendar,
  Layers,
  Printer,
  Sparkles,
  Info,
  Check,
  RotateCcw,
  Loader2,
  ZoomIn,
  Maximize2,
} from 'lucide-react';
import { QcInspectionReport } from '../types/qcTypes';
import { QrCodeBadge } from '../../../components/QrCodeBadge';
import { getQrTargetUrl } from '../../../core/utils/qrUrlHelper';
import { qualityService } from '../qualityService';
import { authService } from '../../../core/auth/authService';
import { isContainerSampled } from '../utils/samplingUtils';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QcContainerSamplingQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: QcInspectionReport | null;
  onUpdateSampling?: (reportId: string, sampledContainers: string) => Promise<void>;
  onViewCoa?: (report: QcInspectionReport) => void;
}

export const QcContainerSamplingQrModal: React.FC<QcContainerSamplingQrModalProps> = ({
  isOpen,
  onClose,
  report,
  onUpdateSampling,
  onViewCoa,
}) => {
  useEscapeKey(onClose, isOpen && !!report);

  const [selectedDrumIndex, setSelectedDrumIndex] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const [isUpdatingSampling, setIsUpdatingSampling] = useState<boolean>(false);
  const [updateSuccessMsg, setUpdateSuccessMsg] = useState<string | null>(null);
  const [showFullQrModal, setShowFullQrModal] = useState<boolean>(false);

  if (!isOpen || !report) return null;

  const totalContainers = report.containerCount || 1;
  const isRaw = report.materialType === 'raw';
  const docNumber = isRaw ? 'L-DQC-006-01' : 'L-DQC-007-01';
  const docEffective = '01-OKTOBER-2026';

  // Parse sampled containers using standardized CPKB utility
  const getIsSampled = (drumNum: number) => {
    return isContainerSampled(report.sampledContainers, drumNum, report.samplingInfo?.sampleSizeQuantity || 1);
  };

  const getStatusBadge = () => {
    switch (report.status) {
      case 'PASSED':
      case 'PASSED_WITH_DEVIATION':
        return {
          label: 'LULUS / RELEASED',
          bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          dot: 'bg-emerald-500',
        };
      case 'REJECTED':
        return {
          label: 'DITOLAK / REJECTED',
          bg: 'bg-red-100 text-red-900 border-red-300',
          dot: 'bg-red-500',
        };
      case 'QUALITY_CONTROL_PROCESS':
      case 'AWAITING_QM_AUTHORIZATION':
        return {
          label: 'DALAM UJI QC / IN-TESTING',
          bg: 'bg-blue-100 text-blue-900 border-blue-300',
          dot: 'bg-blue-500',
        };
      default:
        return {
          label: 'KARANTINA / QUARANTINE',
          bg: 'bg-amber-100 text-amber-900 border-amber-300',
          dot: 'bg-amber-500',
        };
    }
  };

  const statusBadge = getStatusBadge();
  const currentDrumSampled = getIsSampled(selectedDrumIndex);

  const isReportFinal = report.status === 'PASSED' || report.status === 'PASSED_WITH_DEVIATION' || report.status === 'REJECTED';
  const coaDirectUrl = getQrTargetUrl(
    report.lotInternalNumber || report.grnNumber,
    report.status,
    `${selectedDrumIndex}/${totalContainers}`
  );

  // Ultra-compact QR Code Payload Data (Fast, responsive camera detection with direct CoA link)
  const qrCompactValue = coaDirectUrl;

  const handleCopyTagInfo = () => {
    navigator.clipboard.writeText(
      `[SMART CONTAINER TAG CPKB]\nMaterial: ${report.materialName} (${report.materialCode})\nLot QC: ${report.lotInternalNumber || report.grnNumber}\nWadah: #${selectedDrumIndex} dari ${totalContainers} ${report.containerType}\nStatus Mutu: ${statusBadge.label}\nStatus Sampling: ${currentDrumSampled ? 'TELAH DISAMPLING' : 'BELUM DIBUKA / UTUH'}\nRetest Date: ${report.retestDate || 'N/A'}\nDokumen: ${docNumber} (Berlaku: ${docEffective})`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleSampling = async () => {
    setIsUpdatingSampling(true);
    setUpdateSuccessMsg(null);
    try {
      const currentUser = authService.getCurrentUser();
      const res = await qualityService.updateContainerSampling(
        report.id,
        selectedDrumIndex,
        !currentDrumSampled,
        currentUser
      );

      if (onUpdateSampling) {
        await onUpdateSampling(report.id, res.report.sampledContainers || '');
      }

      setUpdateSuccessMsg(
        !currentDrumSampled
          ? `✓ Wadah #${selectedDrumIndex} berhasil ditandai TELAH DISAMPLING ke Database!`
          : `✓ Status sampling Wadah #${selectedDrumIndex} berhasil dibatalkan.`
      );

      setTimeout(() => setUpdateSuccessMsg(null), 4000);
    } catch (e: any) {
      console.error('Failed to update sampling:', e);
      alert(`Gagal memperbarui status sampling: ${e.message}`);
    } finally {
      setIsUpdatingSampling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-teal-900 to-emerald-950 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/10">
              <QrCode className="w-6 h-6 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">
                  Smart Digital Container Tag (Paperless Sampling CPKB)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/30 text-teal-200 border border-teal-400/30">
                  {docNumber}
                </span>
              </div>
              <p className="text-xs text-teal-200/80 font-normal">
                Pelacakan Status Wadah & Log Pengambilan Contoh Digital Terintegrasi
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

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto grow">
          {/* Material & Lot Summary Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded border border-teal-200">
                  {report.materialCode}
                </span>
                <span className="font-bold text-slate-800 text-sm">
                  {report.materialName}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                <span>Lot Internal: <b className="font-mono text-slate-700">{report.lotInternalNumber || report.grnNumber}</b></span>
                <span>•</span>
                <span>Batch Vendor: <b className="font-mono text-slate-700">{report.batchNumberVendor}</b></span>
                <span>•</span>
                <span>GRN: <b className="font-mono text-slate-700">{report.grnNumber}</b></span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.bg}`}>
                <span className={`w-2 h-2 rounded-full ${statusBadge.dot} animate-pulse`} />
                {statusBadge.label}
              </span>
            </div>
          </div>

          {/* Container Selector Carousel / Pills */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-teal-700" />
                Pilih Nomor Wadah / Kemasan ({totalContainers} {report.containerType}):
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                Standar Sampling: <b className="text-teal-900">{report.materialType === 'raw' ? 'n = 1 + √N' : (report.samplingInfo?.samplingStandard || 'MIL-STD-105E')}</b>
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {Array.from({ length: totalContainers }, (_, i) => i + 1).map((drumNum) => {
                const isSampled = getIsSampled(drumNum);
                const isSelected = selectedDrumIndex === drumNum;
                return (
                  <button
                    key={drumNum}
                    type="button"
                    onClick={() => setSelectedDrumIndex(drumNum)}
                    className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer border ${
                      isSelected
                        ? 'bg-teal-800 text-white border-teal-900 shadow-md scale-105 ring-2 ring-teal-500/40'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>Wadah #{drumNum}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold ${
                        isSampled
                          ? isSelected
                            ? 'bg-teal-900 text-teal-200 border border-teal-600'
                            : 'bg-emerald-100 text-emerald-800'
                          : isSelected
                          ? 'bg-teal-900 text-teal-300'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isSampled ? '✓ Disampling' : 'Utuh / Segel'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Smart Digital Tag Detail View */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Left QR Display (Enlarged for seamless scanning) */}
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border-2 border-slate-200 text-slate-900 shrink-0 relative group">
              <button
                type="button"
                onClick={() => setShowFullQrModal(true)}
                className="relative cursor-pointer transition-transform hover:scale-105 active:scale-95 block"
                title="Klik untuk memperbesar QR Code ke layar penuh"
              >
                <QrCodeBadge
                  value={qrCompactValue}
                  size={175}
                  className="rounded-xl shadow-sm"
                />
                <div className="absolute inset-0 bg-teal-900/10 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center transition-opacity">
                  <span className="bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-md">
                    <ZoomIn className="w-3 h-3" />
                    Perbesar
                  </span>
                </div>
              </button>

              <div className="mt-2.5 flex flex-col items-center gap-1 w-full">
                <button
                  type="button"
                  onClick={() => setShowFullQrModal(true)}
                  className="w-full py-1 px-2 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Buka Layar Penuh (HD)</span>
                </button>
                <span className="text-[9px] text-slate-500 font-bold">
                  Wadah #{selectedDrumIndex} dari {totalContainers}
                </span>
              </div>
            </div>

            {/* Right Tag Metadata */}
            <div className="md:col-span-2 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-xs">
                      Wadah #{selectedDrumIndex} dari {totalContainers} {report.containerType}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${currentDrumSampled ? 'bg-teal-500/30 text-teal-200' : 'bg-slate-700 text-slate-300'}`}>
                      {currentDrumSampled ? 'STATUS: TELAH DISAMPLING' : 'STATUS: SEGEL / BELUM DIBUKA'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    CPKB {docNumber}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-3">
                  <div>
                    <span className="text-slate-400 text-[11px] block">Material:</span>
                    <span className="font-bold text-slate-100 text-sm">{report.materialName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">No. Lot Internal QC:</span>
                    <span className="font-mono font-bold text-teal-300 text-sm">{report.lotInternalNumber || report.grnNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Tanggal Kedaluwarsa:</span>
                    <span className="font-semibold text-slate-200">{report.expiryDate || 'N/A'}</span>
                  </div>
                  {isRaw && (
                    <div className="bg-emerald-950/80 p-1.5 rounded-lg border border-emerald-800/60">
                      <span className="text-emerald-400 text-[10px] font-bold block flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Tanggal Uji Ulang (Retest Date):
                      </span>
                      <span className="font-mono font-bold text-emerald-200 text-xs">
                        {report.retestDate || 'N/A (Sesuai ED)'}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 text-[11px] block">{report.staffSignature?.signerRole || 'Staf Analis QC'}:</span>
                    <span className="text-slate-200 font-medium">
                      {report.staffSignature?.signerName || report.sampledBy || 'Ayu'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Waktu Sampling:</span>
                    <span className="font-mono text-slate-300 text-[11px]">
                      {report.samplingDateTime ? new Date(report.samplingDateTime).toLocaleString('id-ID') : (report.receivedDate || '-')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lock Banner if Report is Released or Rejected */}
              {isReportFinal && (
                <div className="p-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-slate-300 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-[11px]">
                      Status Mutu Terkunci (<strong className="text-white uppercase">{statusBadge.label}</strong>). Jumlah sampel terikat 100% pada Laporan Analisa QC resmi.
                    </span>
                  </div>
                  {onViewCoa && (
                    <button
                      type="button"
                      onClick={() => onViewCoa(report)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-xs shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Buka CoA Internal</span>
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isUpdatingSampling || isReportFinal}
                    onClick={handleToggleSampling}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
                      isReportFinal
                        ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                        : currentDrumSampled
                        ? 'bg-rose-900/40 text-rose-300 border border-rose-700/60 hover:bg-rose-900/60'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {isUpdatingSampling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isReportFinal ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ) : currentDrumSampled ? (
                      <RotateCcw className="w-3.5 h-3.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isReportFinal
                        ? '🔒 Terkunci (Selesai Rilis/Tolak)'
                        : currentDrumSampled
                        ? `Batalkan Sampling Wadah #${selectedDrumIndex}`
                        : `Tandai Wadah #${selectedDrumIndex} Disampling`}
                    </span>
                  </button>

                  <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                    <span>Sinkronisasi Otomatis ke Supabase</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onViewCoa && (
                    <button
                      type="button"
                      onClick={() => onViewCoa(report)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-700/80"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Lihat CoA</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyTagInfo}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Tag Digital'}</span>
                  </button>
                </div>
              </div>

              {updateSuccessMsg && (
                <div className="mt-2 p-2 bg-emerald-900/60 border border-emerald-600 text-emerald-200 text-xs rounded-lg flex items-center justify-between animate-in fade-in">
                  <span className="font-bold">{updateSuccessMsg}</span>
                  <span className="text-[10px] font-mono bg-emerald-800 px-1.5 py-0.5 rounded text-white">DATABASE SYNCED</span>
                </div>
              )}
            </div>
          </div>

          {/* CPKB Compliance Note */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 text-teal-950 text-xs flex items-start gap-3">
            <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">
                Keunggulan Sistem Paperless Sampling & Digital Tag:
              </span>
              <p className="text-[11px] text-teal-900 leading-relaxed">
                Setiap wadah tercatat secara digital pada server database pengawasan mutu tanpa perlu mencetak label kertas fisik berulang. Petugas gudang dan auditor BPOM dapat memverifikasi keaslian dan status wadah langsung melalui sistem audit trail atau pemindaian QR code di atas.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span>PT. Larassanti Makmur Sejahtera • Sistem Terpadu Pengawasan Mutu CPKB</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Full-Screen Ultra-Large QR Modal for Immediate Scanning */}
      {showFullQrModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center flex flex-col items-center shadow-2xl border border-slate-200 relative">
            <button
              type="button"
              onClick={() => setShowFullQrModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <span className="text-xs font-black uppercase text-teal-700 tracking-wider mb-1">
              QR Code Mode Layar Penuh
            </span>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {report.materialName}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Wadah #{selectedDrumIndex} dari {totalContainers} ({report.containerType})
            </p>

            {/* Huge QR Code (300px) */}
            <div className="p-4 bg-white border-2 border-teal-500 rounded-2xl shadow-lg flex items-center justify-center">
              <QrCodeBadge
                value={qrCompactValue}
                size={280}
                className="rounded-lg"
              />
            </div>

            <div className="mt-4 p-2 bg-slate-100 rounded-xl text-[11px] font-mono font-bold text-slate-800 w-full truncate">
              {qrCompactValue}
            </div>

            <p className="text-[11px] text-slate-500 mt-2">
              Arahkan kamera scanner atau HP ke QR Code di atas. Jarak ideal: 20-50 cm.
            </p>

            <button
              type="button"
              onClick={() => setShowFullQrModal(false)}
              className="mt-4 w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              Kembali ke Detail Tag
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
