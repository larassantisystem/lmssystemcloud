import React, { useState } from 'react';
import {
  X,
  Printer,
  Scale,
  FlaskConical,
  CheckCircle2,
  Package,
  Boxes,
  ShieldCheck,
  Warehouse,
  Play,
  Clock,
  ChevronRight,
  Check,
  FileText
} from 'lucide-react';
import { IpcBulkTest } from '../utils/qcExtData';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface ProductionBatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: IpcBulkTest | null;
  onUpdateBatch?: (updated: IpcBulkTest) => void;
  onOpenStepModal?: (stepKey: string, batch: IpcBulkTest) => void;
}

export interface ProductionStep {
  id: string;
  key: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  mode: 'SEQUENTIAL' | 'PARALEL';
  startTime?: string;
  finishTime?: string;
  icon: any;
}

export const ProductionBatchDetailModal: React.FC<ProductionBatchDetailModalProps> = ({
  isOpen,
  onClose,
  batch,
  onOpenStepModal,
}) => {
  useEscapeKey(onClose, isOpen && !!batch);

  const [steps, setSteps] = useState<ProductionStep[]>([
    {
      id: 'step-1',
      key: 'PRINT_CPB',
      title: '1. Cetak Catatan Pengolahan Bets (CPB)',
      description: 'Pencetakan dokumen resmi Catatan Pengolahan Bets sesuai standar CPKB.',
      status: 'COMPLETED',
      mode: 'SEQUENTIAL',
      startTime: '2026-10-26 08:00',
      finishTime: '2026-10-26 08:15',
      icon: Printer,
    },
    {
      id: 'step-2',
      key: 'RAW_DISPENSING',
      title: '2. Penimbangan & Penyerahan Bahan Baku',
      description: 'Penimbangan bahan baku aktif dan penimbangan excipient dari gudang timbang.',
      status: 'COMPLETED',
      mode: 'SEQUENTIAL',
      startTime: '2026-10-26 08:30',
      finishTime: '2026-10-26 09:45',
      icon: Scale,
    },
    {
      id: 'step-3',
      key: 'MIXING',
      title: '3. Pencampuran & Pengolahan Ruahan (Mixing)',
      description: 'Proses mixing batch adonan di tangki pencampuran sesuai parameter formula RnD.',
      status: 'COMPLETED',
      mode: 'SEQUENTIAL',
      startTime: '2026-10-26 10:00',
      finishTime: '2026-10-26 12:30',
      icon: FlaskConical,
    },
    {
      id: 'step-4',
      key: 'IPC_BULK',
      title: '4. Pengujian Analisa Ruahan (IPC Bulk)',
      description: 'Analisis laboratorium QC untuk pH, viskositas, bobot jenis, dan pemerian ruahan.',
      status: batch?.status === 'RELEASED' || batch?.status === 'AWAITING_QM' ? 'COMPLETED' : 'IN_PROGRESS',
      mode: 'SEQUENTIAL',
      startTime: '2026-10-26 13:00',
      finishTime: batch?.status === 'RELEASED' ? '2026-10-26 14:00' : undefined,
      icon: CheckCircle2,
    },
    {
      id: 'step-5',
      key: 'FILLING',
      title: '5. Pengisian Sediaan ke Wadah Primer (Filling)',
      description: 'Transfer adonan ruahan ke lini mesin filling botol/tube primer.',
      status: 'PENDING',
      mode: 'SEQUENTIAL',
      icon: Package,
    },
    {
      id: 'step-6',
      key: 'PACKAGING_HANDOVER',
      title: '6. Penyerahan & Persiapan Bahan Kemas',
      description: 'Penyediaan botol, tutup, pump, dan label primer dari gudang kemas.',
      status: 'PENDING',
      mode: 'PARALEL',
      icon: Boxes,
    },
    {
      id: 'step-7',
      key: 'SECONDARY_PACKAGING',
      title: '7. Pengemasan Sekunder & Pelabelan',
      description: 'Pemasangan box dus, pencetakan nomor bets & expired date, serta kartonase.',
      status: 'PENDING',
      mode: 'SEQUENTIAL',
      icon: Package,
    },
    {
      id: 'step-8',
      key: 'FINISHED_QC',
      title: '8. Pengujian Mutu Produk Jadi & Kemas',
      description: 'Inspeksi QC akhir untuk berat netto, uji kebocoran sealing, dan torsi tutup.',
      status: 'PENDING',
      mode: 'SEQUENTIAL',
      icon: ShieldCheck,
    },
    {
      id: 'step-9',
      key: 'QM_RELEASE',
      title: '9. Pelulusan Mutu oleh Quality Manager',
      description: 'Otorisasi kelulusan akhir (Certificate of Analysis / COA) oleh QM.',
      status: batch?.status === 'RELEASED' ? 'COMPLETED' : 'PENDING',
      mode: 'SEQUENTIAL',
      icon: CheckCircle2,
    },
    {
      id: 'step-10',
      key: 'WAREHOUSE_RECEIPT',
      title: '10. Serah Terima & Penerimaan Gudang',
      description: 'Transfer fisik produk jadi ke rak penyimpanan gudang barang jadi (Finished Goods).',
      status: 'PENDING',
      mode: 'SEQUENTIAL',
      icon: Warehouse,
    },
  ]);

  const toggleStepMode = (stepId: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, mode: s.mode === 'SEQUENTIAL' ? 'PARALEL' : 'SEQUENTIAL' }
          : s
      )
    );
  };

  const getWibTimestamp = () => {
    try {
      const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date());
      const map: Record<string, string> = {};
      for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = p.value;
      }
      return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute} WIB (GMT+7)`;
    } catch {
      return new Date().toISOString().replace('T', ' ').slice(0, 16) + ' WIB (GMT+7)';
    }
  };

  const startStep = (stepId: string) => {
    const nowStr = getWibTimestamp();
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, status: 'IN_PROGRESS', startTime: s.startTime || nowStr }
          : s
      )
    );
  };

  const completeStep = (stepId: string) => {
    const nowStr = getWibTimestamp();
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, status: 'COMPLETED', finishTime: s.finishTime || nowStr }
          : s
      )
    );
  };

  if (!isOpen || !batch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-xs">
              <FileText className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-lg leading-tight">
                  Detail Alur Proses Produksi & Batch Lifecycle
                </h3>
                <span className="px-3 py-0.5 rounded-full text-xs font-mono font-black bg-blue-500/40 text-blue-100 border border-blue-400/30">
                  {batch.batchNo} • {batch.productName}
                </span>
              </div>
              <p className="text-xs text-blue-100/80 mt-0.5">
                Pemantauan Prosedural & Paralel • Waktu Mulai & Selesai Tiap Tahap Manufaktur Kosmetika
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto grow bg-slate-50/50">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                Daftar Tahapan Prosedural Manufaktur (SOP CPKB)
              </h4>
              <p className="text-[11px] text-slate-500">
                Klik pada tombol aksi atau kartu langkah untuk membuka form detail pekerjaan. Anda dapat mengubah mode step ke Paralel jika diperlukan.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                {steps.filter((s) => s.status === 'COMPLETED').length} / {steps.length} Selesai
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step) => {
              const StepIcon = step.icon;
              const isCompleted = step.status === 'COMPLETED';
              const isInProgress = step.status === 'IN_PROGRESS';

              return (
                <div
                  key={step.id}
                  className={`bg-white rounded-2xl p-4 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs ${
                    isCompleted
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : isInProgress
                      ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/25'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${
                        isCompleted
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : isInProgress
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 animate-pulse'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {isCompleted ? <Check className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                          {step.title}
                        </h5>
                        <button
                          type="button"
                          onClick={() => toggleStepMode(step.id)}
                          className={`text-[10px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider transition-all cursor-pointer ${
                            step.mode === 'PARALEL'
                              ? 'bg-purple-100 text-purple-800 border-purple-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                          title="Klik untuk ubah mode Prosedural (Sequential) atau Paralel"
                        >
                          Mode: {step.mode}
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {step.description}
                      </p>

                      {/* Timestamps */}
                      <div className="flex items-center gap-4 pt-1 text-[11px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Mulai: <strong className="text-slate-800">{step.startTime || 'Belum dimulai'}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                          Selesai: <strong className="text-slate-800">{step.finishTime || '-'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 sm:self-center">
                    {step.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => startStep(step.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-300"
                      >
                        <Play className="w-3.5 h-3.5 text-blue-600" />
                        <span>Mulai Step</span>
                      </button>
                    )}

                    {isInProgress && (
                      <button
                        type="button"
                        onClick={() => completeStep(step.id)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Selesaikan</span>
                      </button>
                    )}

                    {isCompleted && (
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Selesai</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenStepModal && onOpenStepModal(step.key, batch)}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <span>Buka Form</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Status Bets: <strong className="text-slate-900 font-bold uppercase">{batch.status}</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
