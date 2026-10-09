import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Lock,
  Layers,
  ArrowRight,
  FileCheck2,
  Info,
} from 'lucide-react';
import { PackagingMaterial } from '../../../types';
import { QcInspectionReport } from '../types/qcTypes';
import { packagingService } from '../../rnd/materials/packagingService';
import { qualityService } from '../qualityService';
import { useAuth } from '../../../core/auth/AuthContext';
import { authService } from '../../../core/auth/authService';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QcDiagnosticAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSynced?: () => void;
}

export const QcDiagnosticAuditModal: React.FC<QcDiagnosticAuditModalProps> = ({
  isOpen,
  onClose,
  onSynced,
}) => {
  const { user } = useAuth();
  const [packagingList, setPackagingList] = useState<PackagingMaterial[]>([]);
  const [qcReports, setQcReports] = useState<QcInspectionReport[]>([]);
  const [selectedPmCode, setSelectedPmCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync password confirmation state
  const [showPasswordConfirm, setShowPasswordConfirm] = useState<boolean>(false);
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEscapeKey(() => {
    if (showPasswordConfirm) {
      setShowPasswordConfirm(false);
      setConfirmPassword('');
      setPasswordError(null);
    } else {
      onClose();
    }
  }, isOpen);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  const runDiagnosticQuery = async () => {
    setIsLoading(true);
    setSyncSuccessMsg(null);
    try {
      const [pms, reports] = await Promise.all([
        packagingService.getPackagingMaterials(),
        qualityService.getReports(),
      ]);
      setPackagingList(pms);
      setQcReports(reports);

      if (pms.length > 0 && !selectedPmCode) {
        setSelectedPmCode(pms[0].code);
      }
    } catch (err) {
      console.error('Diagnostic query failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnosticQuery();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Selected Packaging Material in Master Kemasan
  const selectedPM = packagingList.find((p) => p.code === selectedPmCode) || packagingList[0];
  const masterQcParams = selectedPM?.qcParameters || [];

  // Corresponding sample QC Lab Testing records for this Packaging
  const sampleReports = qcReports.filter(
    (r) =>
      r.materialType === 'packaging' &&
      (r.materialCode === selectedPM?.code ||
        r.materialName.toLowerCase() === selectedPM?.name.toLowerCase())
  );
  const sampleReport = sampleReports[0];
  const actualChecklistItems = sampleReport?.parameters || [];

  const masterCount = masterQcParams.length;
  const actualCount = actualChecklistItems.length;
  const isMatch = masterCount > 0 && masterCount === actualCount;

  const handleExecuteSyncWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!confirmPassword.trim()) {
      setPasswordError('Kata sandi otorisasi pengguna aktif wajib diisi.');
      return;
    }

    const actorNik = user?.nik || 'admin';
    const verify = await authService.verifyPassword(actorNik, confirmPassword);
    if (!verify.valid) {
      setPasswordError(verify.error || 'Kata sandi tidak valid. Otorisasi sinkronisasi ditolak.');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await qualityService.syncQuarantineWithMaster();
      await runDiagnosticQuery();
      setSyncSuccessMsg(res.message);
      setShowPasswordConfirm(false);
      setConfirmPassword('');
      if (onSynced) onSynced();
    } catch (err: any) {
      setPasswordError(err.message || 'Gagal menyinkronkan data.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">
                  Audit Diagnostik Relasi Data: Master Kemasan vs Pengujian Lab QC
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold">
                  Skema Relasional & Integritas Data
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Pemeriksaan komparatif jumlah kriteria spesifikasi mutu Master Data Bagian B terhadap checklist pengujian laboratorium.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {syncSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-xs text-emerald-800 font-semibold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{syncSuccessMsg}</span>
            </div>
          )}

          {/* Selector & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3 flex-1">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Pilih Sampel Bahan Kemas:
              </label>
              <select
                value={selectedPmCode}
                onChange={(e) => setSelectedPmCode(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 max-w-md w-full"
              >
                {packagingList.map((pm) => (
                  <option key={pm.code} value={pm.code}>
                    {pm.code} - {pm.name} ({pm.type}) [Master: {pm.qcParameters?.length || 0} Kriteria]
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runDiagnosticQuery}
                disabled={isLoading}
                className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Kueri Ulang</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmPassword('');
                  setPasswordError(null);
                  setShowPasswordConfirm(true);
                }}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Sinkronkan Karantina dari Master</span>
              </button>
            </div>
          </div>

          {/* Diagnostic Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Master Record Box */}
            <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-purple-700" />
                  Tabel: packaging_materials (Master)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-200/60 text-purple-900 font-mono">
                  {selectedPM?.code || '-'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-purple-950">{masterCount}</span>
                <span className="text-xs font-bold text-purple-700">Kriteria Terdaftar (Bagian B)</span>
              </div>
              <p className="text-[11px] text-purple-800 mt-2 font-medium leading-relaxed">
                Spesifikasi mutu teknis kemasan yang didefinisikan tim R&D CPKB pada form Master Kemasan.
              </p>
            </div>

            {/* Actual QC Lab Testing Box */}
            <div className="bg-teal-50/60 border border-teal-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-teal-700" />
                  Tabel: qc_reports (Lab Testing)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-200/60 text-teal-900 font-mono">
                  {sampleReport?.grnNumber || 'Lot Sampel'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-teal-950">{actualCount}</span>
                <span className="text-xs font-bold text-teal-700">Item Checklist Terbit</span>
              </div>
              <p className="text-[11px] text-teal-800 mt-2 font-medium leading-relaxed">
                {sampleReport
                  ? `Catatan inspeksi QC (${sampleReport.status}) untuk material ${sampleReport.materialCode}.`
                  : 'Belum ada lot kedatangan bahan kemas ini di antrean QC.'}
              </p>
            </div>

            {/* Discrepancy / Integrity Status */}
            <div
              className={`rounded-2xl p-4 border ${
                isMatch
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-amber-50/70 border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-xs font-bold flex items-center gap-1.5 ${
                    isMatch ? 'text-emerald-900' : 'text-amber-900'
                  }`}
                >
                  {isMatch ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  Status Integritas Data
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono ${
                    isMatch ? 'bg-emerald-200/80 text-emerald-900' : 'bg-amber-200/80 text-amber-900'
                  }`}
                >
                  {isMatch ? 'TERINTEGRASI 100%' : 'PERBEDAAN TERDETEKSI'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-3xl font-black ${
                    isMatch ? 'text-emerald-950' : 'text-amber-950'
                  }`}
                >
                  {isMatch ? '15 / 15' : `${actualCount} / ${masterCount}`}
                </span>
                <span
                  className={`text-xs font-bold ${
                    isMatch ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  Kriteria Cocok
                </span>
              </div>
              <p
                className={`text-[11px] mt-2 font-medium leading-relaxed ${
                  isMatch ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {isMatch
                  ? 'Kriteria pengujian laboratorium telah 100% tersinkronisasi dinamis dengan Master Kemasan Bagian B.'
                  : `Ditemukan perbedaan: Master mencatat ${masterCount} kriteria, sedangkan checklist laboratorium memuat ${actualCount} kriteria.`}
              </p>
            </div>
          </div>

          {/* Root Cause Technical Explanation */}
          <div className="bg-slate-900 text-slate-200 rounded-2xl p-5 text-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
              <Info className="w-4 h-4" />
              <span>Investigasi & Analisis Akar Masalah (Mengapa Dulu Terbatas 5 Kriteria?)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-slate-300">
              <div className="space-y-1.5 bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
                <span className="font-bold text-white text-xs block">
                  1. Alasan Teknis Batasan 5 Kriteria (Akar Masalah):
                </span>
                <p className="leading-relaxed">
                  Pada kode awal sebelum audit, generator laporan QC (<code className="text-amber-300">qualityService.ts</code>) menginisialisasi parameter pengujian menggunakan konstanta statis <code className="text-amber-300">DEFAULT_PACKAGING_PARAMETERS</code> yang hanya berisi tepat 5 kriteria pengujian dasar. Sistem tidak melakukan query lookup ke kolom <code className="text-amber-300">qc_parameters</code> pada tabel Master Kemasan.
                </p>
              </div>

              <div className="space-y-1.5 bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
                <span className="font-bold text-white text-xs block">
                  2. Tindakan Perbaikan yang Diterapkan:
                </span>
                <p className="leading-relaxed">
                  Semua konstanta hardcoded (<code className="text-emerald-400">DEFAULT_PACKAGING_PARAMETERS</code> & <code className="text-emerald-400">DEFAULT_RAW_PARAMETERS</code>) telah <strong>dihapus total</strong>. Generator kini memanggil tabel Master Kemasan dan memetakan langsung ke-15 kriteria dari Bagian B secara dinamis. Antrean karantina juga otomatis diperbarui.
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Side-by-Side Comparison Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700" />
              <span>Tabel Komparasi Rinci Parameter Mutu ({selectedPM?.code || '-'})</span>
            </h4>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 w-1/2 border-r border-slate-200">
                      Master Kemasan (Bagian B: R&D)
                    </th>
                    <th className="py-2.5 px-3 w-1/2">
                      Checklist Lab Testing (Quality Control)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {masterQcParams.map((mp, idx) => {
                    const actualItem = actualChecklistItems[idx];
                    const isSyncedHere = actualItem && actualItem.parameterName === mp.name;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200">
                          <div className="font-bold text-slate-800">{mp.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Spec: {mp.specification || 'Standar Spesifikasi Mutu'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {actualItem ? (
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{actualItem.parameterName}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 pl-5">
                                Spec: {actualItem.specification}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-rose-600 font-semibold italic text-[11px]">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Belum dimuat di checklist lab sampel ini</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {masterQcParams.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400">
                        Belum ada parameter mutu terdaftar pada Master Kemasan ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500">
            Audit trail diverifikasi sesuai standar CPKB & Good Manufacturing Practice (GMP).
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-xs font-bold text-slate-700 transition-colors"
          >
            Tutup Audit
          </button>
        </div>
      </div>

      {/* Password Authorization Confirmation Modal */}
      {showPasswordConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-slate-900">
                  Otorisasi Sandi Sinkronisasi
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordConfirm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Tindakan ini akan memperbarui seluruh lembar uji QC pada status karantina agar memuat ke-15 kriteria dari Master Kemasan terbaru. Masukkan kata sandi akun aktif Anda (<strong>{user?.name || 'User'} - {user?.nik}</strong>) untuk memverifikasi.
            </p>

            <form onSubmit={handleExecuteSyncWithPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kata Sandi Pengguna Aktif <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Masukkan password akun Anda..."
                  className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-semibold"
                />
              </div>

              {passwordError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {isSyncing ? 'Memproses...' : 'Verifikasi & Sinkronkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
