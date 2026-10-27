import React, { useState } from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  Save,
  FileText,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { IpcBulkTest } from '../utils/qcExtData';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';
import { useAuth } from '../../../core/auth/AuthContext';

interface ProductionStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  stepKey: string | null;
  batch: IpcBulkTest | null;
  onSaveStepData?: (stepKey: string, data: any) => void;
}

export const ProductionStepModal: React.FC<ProductionStepModalProps> = ({
  isOpen,
  onClose,
  stepKey,
  batch,
  onSaveStepData,
}) => {
  const { user } = useAuth();
  useEscapeKey(onClose, isOpen && !!stepKey && !!batch);

  const [notes, setNotes] = useState('');
  const [operatorName, setOperatorName] = useState(user?.name || 'Operator Produksi');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen || !stepKey || !batch) return null;

  const getStepTitle = () => {
    switch (stepKey) {
      case 'PRINT_CPB': return 'Cetak Catatan Pengolahan Bets (CPB)';
      case 'RAW_DISPENSING': return 'Penimbangan & Penyerahan Bahan Baku';
      case 'MIXING': return 'Pencampuran & Pengolahan Ruahan (Mixing)';
      case 'IPC_BULK': return 'Pengujian Analisa Ruahan (IPC Bulk)';
      case 'FILLING': return 'Pengisian Sediaan ke Wadah Primer (Filling)';
      case 'PACKAGING_HANDOVER': return 'Penyerahan & Persiapan Bahan Kemas';
      case 'SECONDARY_PACKAGING': return 'Pengemasan Sekunder & Pelabelan';
      case 'FINISHED_QC': return 'Pengujian Mutu Produk Jadi & Kemas';
      case 'QM_RELEASE': return 'Pelulusan Mutu oleh Quality Manager';
      case 'WAREHOUSE_RECEIPT': return 'Serah Terima & Penerimaan Gudang';
      default: return 'Form Detail Pekerjaan Produksi';
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    if (onSaveStepData) {
      onSaveStepData(stepKey, { notes, operatorName, updatedAt: new Date().toISOString() });
    }
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-xs">
              <FileText className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                {getStepTitle()}
              </h3>
              <p className="text-[11px] text-blue-200 font-mono mt-0.5">
                Nomor Bets: {batch.batchNo} • Produk: {batch.productName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {isSaved && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Data pekerjaan tahap ini berhasil disimpan!</span>
            </div>
          )}

          {stepKey === 'PRINT_CPB' ? (
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="font-bold text-slate-800">Pratinjau Dokumen CPB Resmi (CPKB Gol A)</span>
                <span className="font-mono text-blue-800 font-black">CPB-{batch.batchNo}</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Dokumen Catatan Pengolahan Bets (CPB) siap dicetak untuk dilampirkan selama proses penimbangan, mixing, hingga pengemasan produk <strong>{batch.productName}</strong>.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Dokumen CPB (PDF / Printer)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Penanggung Jawab / Operator:
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Status Verifikasi Tahap:
                  </label>
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-4 py-2.5 font-bold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Sesuai Standar GMP / CPKB</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  Catatan Pelaksanaan / Parameter Proses:
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Masukkan catatan spesifik pelaksanaan tahap ini (misal: suhu ruang, kecepatan adukan, nomor mesin filling, dll)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={isSaved}
              className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 active:scale-95 text-white text-xs font-bold shadow-lg shadow-blue-700/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan & Catat Progress</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
