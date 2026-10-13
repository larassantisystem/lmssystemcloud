import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, ArrowLeftCircle, CheckCircle2, Lock } from 'lucide-react';
import { QcInspectionReport } from '../types/qcTypes';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QcRevertModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: QcInspectionReport | null;
  onConfirmRevert: (reportId: string, reason: string, passwordInput: string) => Promise<void>;
}

export const QcRevertModal: React.FC<QcRevertModalProps> = ({
  isOpen,
  onClose,
  report,
  onConfirmRevert,
}) => {
  useEscapeKey(onClose, isOpen && !!report);

  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setPassword('');
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen || !report) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setErrorMsg('Alasan pengembalian (revert) wajib diisi dengan jelas minimal 5 karakter.');
      return;
    }

    if (!password.trim()) {
      setErrorMsg('Kata sandi otorisasi wajib diisi untuk verifikasi pengembalian.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onConfirmRevert(report.id, reason.trim(), password.trim());
      setReason('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal melakukan revert ke gudang');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-amber-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-lg">
              <ArrowLeftCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Revert Data ke Gudang Logistik</h3>
              <p className="text-xs text-amber-100 font-normal">
                Buka kembali hak akses edit gudang untuk koreksi data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-500">No. GRN:</span>
              <span className="font-bold text-slate-900">{report.grnNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bahan:</span>
              <span className="font-semibold text-slate-900">
                {report.materialCode} - {report.materialName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Supplier / Produsen:</span>
              <span>{report.distributor || report.manufacturer}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Batch Produsen:</span>
              <span className="font-mono">{report.batchNumberVendor}</span>
            </div>
          </div>

          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <p>
              <strong>Audit Trail Notice:</strong> Tindakan ini akan mengembalikan data ke Gudang,
              membuka kunci pengeditan di modul Gudang, dan mencatat riwayat pengembalian beserta
              alasan yang Anda masukkan.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Alasan Pengembalian / Catatan Perbaikan <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Jumlah koli fisik di drum karantina berjumlah 20 drum, sedangkan di GRN terinput 25 drum. Mohon diperbaiki sebelum sampling QC."
              className="w-full text-sm border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-800 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              Konfirmasi Kata Sandi Akun Anda <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi Anda untuk verifikasi"
              className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-800 placeholder-slate-400"
            />
            <p className="text-[10.5px] text-slate-500 mt-1">
              Verifikasi kata sandi diperlukan sebagai tanda tangan otorisasi pengembalian dokumen ke gudang. Gunakan kata sandi akun login Anda.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 rounded-xl shadow-md transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>Menyimpan...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Konfirmasi Revert ke Gudang
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
