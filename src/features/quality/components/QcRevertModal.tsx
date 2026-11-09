import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  ArrowLeftCircle,
  CheckCircle2,
  Lock,
  Building2,
  FlaskConical,
  RotateCcw,
} from 'lucide-react';
import { QcInspectionReport } from '../types/qcTypes';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QcRevertModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: QcInspectionReport | null;
  onConfirmRevert: (
    reportId: string,
    destination: 'warehouse' | 'analyst',
    reason: string,
    passwordInput: string
  ) => Promise<void>;
}

export const QcRevertModal: React.FC<QcRevertModalProps> = ({
  isOpen,
  onClose,
  report,
  onConfirmRevert,
}) => {
  useEscapeKey(onClose, isOpen && !!report);

  // Hanya laporan yang sudah lolos approval QM (status PASSED atau PASSED_WITH_DEVIATION) yang memiliki pilihan Analisa vs Gudang
  const isReleased = report?.status === 'PASSED' || report?.status === 'PASSED_WITH_DEVIATION';

  const [destination, setDestination] = useState<'warehouse' | 'analyst'>('warehouse');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && report) {
      const alreadyReleased = report.status === 'PASSED' || report.status === 'PASSED_WITH_DEVIATION';
      // Jika sudah approved QM: default ke 'analyst'. Jika belum approved QM (dari karantina/uji lab): selalu ke 'warehouse'
      setDestination(alreadyReleased ? 'analyst' : 'warehouse');
      setReason('');
      setPassword('');
      setErrorMsg('');
    }
  }, [isOpen, report]);

  if (!isOpen || !report) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setErrorMsg('Alasan pengembalian / pembatalan rilis wajib diisi dengan jelas minimal 5 karakter.');
      return;
    }

    if (!password.trim()) {
      setErrorMsg('Kata sandi otorisasi akun wajib diisi untuk verifikasi tindakan ini.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      const targetDestination = isReleased ? destination : 'warehouse';
      await onConfirmRevert(report.id, targetDestination, reason.trim(), password.trim());
      setReason('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses pengembalian data.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className={`px-6 py-4 text-white flex items-center justify-between ${
          isReleased
            ? 'bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700'
            : 'bg-gradient-to-r from-amber-500 to-amber-600 border-b border-amber-600'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-lg">
              {isReleased ? <RotateCcw className="w-5 h-5 text-amber-300" /> : <ArrowLeftCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                {isReleased ? 'Batalkan Release (Approval QM)' : 'Revert Data ke Gudang Logistik'}
              </h3>
              <p className="text-xs text-white/80 font-normal">
                {isReleased
                  ? 'Pilih tujuan pembatalan: Ke Analisa Lab QC atau Ke Gudang Logistik'
                  : 'Buka kembali hak akses edit gudang untuk koreksi data penerimaan fisik'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Status Saat Ini:</span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                isReleased
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : report.status === 'QUALITY_CONTROL_PROCESS'
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                {report.status === 'PASSED'
                  ? 'Lolos QC (RELEASE)'
                  : report.status === 'PASSED_WITH_DEVIATION'
                  ? 'RELEASE BY DEVIATION'
                  : report.status === 'QUALITY_CONTROL_PROCESS'
                  ? 'Sedang Uji Lab (Analisa)'
                  : report.status === 'QUARANTINE'
                  ? 'Karantina'
                  : report.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">No. GRN:</span>
              <span className="font-bold text-slate-900">{report.grnNumber}</span>
            </div>
            {report.lotInternalNumber && (
              <div className="flex justify-between">
                <span className="text-slate-500">Lot Internal:</span>
                <span className="font-mono font-bold text-teal-800">{report.lotInternalNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Bahan:</span>
              <span className="font-semibold text-slate-900">
                {report.materialCode} - {report.materialName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Batch Produsen:</span>
              <span className="font-mono">{report.batchNumberVendor}</span>
            </div>
          </div>

          {/* Destination Selection Cards: HANYA TAMPIL jika sudah di-approve QM (isReleased) */}
          {isReleased && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Pilih Tujuan Pembatalan Release <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Option: Ke Analisa Lab */}
                <div
                  onClick={() => setDestination('analyst')}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    destination === 'analyst'
                      ? 'border-teal-600 bg-teal-50/70 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      destination === 'analyst' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <FlaskConical className="w-4 h-4" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">Ke Analisa Lab</span>
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          destination === 'analyst' ? 'border-teal-600 bg-teal-600' : 'border-slate-300'
                        }`}>
                          {destination === 'analyst' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Kembalikan ke lembar kerja Analis QC untuk revisi atau pengujian ulang parameter lab.
                      </p>
                      <div className="pt-0.5">
                        <span className="text-[9.5px] font-bold text-teal-800 bg-teal-100/90 px-1.5 py-0.5 rounded">
                          Status: Sedang Uji Lab
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Option: Ke Gudang Logistik */}
                <div
                  onClick={() => setDestination('warehouse')}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    destination === 'warehouse'
                      ? 'border-amber-500 bg-amber-50/70 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      destination === 'warehouse' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">Ke Gudang</span>
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          destination === 'warehouse' ? 'border-amber-600 bg-amber-600' : 'border-slate-300'
                        }`}>
                          {destination === 'warehouse' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Buka kembali hak edit data penerimaan fisik (GRN, surat jalan, koli) untuk staf gudang.
                      </p>
                      <div className="pt-0.5">
                        <span className="text-[9.5px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded">
                          Status: Revert to Warehouse
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audit Trail Banner */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <p className="text-[11px] leading-relaxed">
              <strong>Audit Trail CPKB:</strong> {isReleased
                ? 'Otorisasi rilis QM sebelumnya akan dibatalkan, status stok lot di gudang akan kembali ditahan (tidak rilis), dan riwayat pembatalan akan dicatat.'
                : 'Tindakan ini akan mengembalikan data ke Gudang, membuka kunci pengeditan di modul Gudang, dan mencatat riwayat pengembalian beserta alasan yang Anda masukkan.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {isReleased ? 'Alasan Pembatalan Release / Catatan Revisi' : 'Alasan Pengembalian / Catatan Perbaikan'} <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isReleased
                  ? destination === 'analyst'
                    ? 'Contoh: Nilai pH perlu diuji ulang menggunakan pH meter terkalibrasi. Mohon analis menguji ulang spesifikasi parameter...'
                    : 'Contoh: Jumlah koli fisik di drum karantina berjumlah 20 drum, sedangkan di GRN terinput 25 drum. Mohon diperbaiki oleh gudang...'
                  : 'Contoh: Jumlah koli fisik di drum karantina berjumlah 20 drum, sedangkan di GRN terinput 25 drum. Mohon diperbaiki sebelum sampling QC.'
              }
              className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-800 placeholder-slate-400"
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
              className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-800 placeholder-slate-400"
            />
            <p className="text-[10.5px] text-slate-500 mt-1">
              Verifikasi kata sandi diperlukan sebagai tanda tangan digital otorisasi pengembalian dokumen ini.
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
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                isReleased && destination === 'analyst'
                  ? 'bg-teal-700 hover:bg-teal-800 active:bg-teal-900'
                  : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
              }`}
            >
              {isSubmitting ? (
                <>Memproses...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {isReleased
                    ? destination === 'analyst'
                      ? 'Konfirmasi Batalkan ke Analisa Lab'
                      : 'Konfirmasi Batalkan ke Gudang'
                    : 'Konfirmasi Revert ke Gudang'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

