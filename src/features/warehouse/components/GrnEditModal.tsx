import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Package,
  Building2,
  Calendar,
  Layers,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Boxes,
  FileText,
} from 'lucide-react';
import { GrnRecord } from '../types/grnTypes';
import { useAuth } from '../../../core/auth/AuthContext';
import { authService } from '../../../core/auth/authService';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface GrnEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: GrnRecord | null;
  onSave: (id: string, updatedData: Partial<GrnRecord>) => Promise<void>;
}

export const GrnEditModal: React.FC<GrnEditModalProps> = ({
  isOpen,
  onClose,
  record,
  onSave,
}) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState<Partial<GrnRecord>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Password confirmation state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordError, setAuthPasswordError] = useState<string | null>(null);

  useEscapeKey(() => {
    if (showPasswordModal) {
      setShowPasswordModal(false);
      setAuthPassword('');
      setAuthPasswordError(null);
    } else {
      onClose();
    }
  }, isOpen);

  useEffect(() => {
    if (record) {
      setFormData({
        manufacturer: record.manufacturer || '',
        distributor: record.distributor || '',
        batchNumber: record.batchNumber || '',
        deliveryNoteNumber: record.deliveryNoteNumber || '',
        poNumber: record.poNumber || '',
        quantityReceived: record.quantityReceived,
        unit: record.unit || (record.materialType === 'raw' ? 'kg' : 'pcs'),
        containerCount: record.containerCount || 1,
        containerType: record.containerType || '',
        receivedDate: record.receivedDate || '',
        expiryDate: record.expiryDate || '',
        storageLocation: record.storageLocation || '',
        storageConditions: record.storageConditions || '',
      });
      setErrorMsg('');
      setShowPasswordModal(false);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const isAdmin = user?.role === 'admin' || user?.nik?.toLowerCase() === 'admin';
  const isManager = user?.role === 'manager' || isAdmin;

  const isUnderQcProcess =
    record.qcStatus === 'QUALITY_CONTROL_PROCESS' ||
    record.qcStatus === 'AWAITING_QM_AUTHORIZATION';

  const isFinalized =
    record.qcStatus === 'PASSED' ||
    record.qcStatus === 'RELEASED' ||
    record.qcStatus === 'PASSED_WITH_DEVIATION' ||
    record.qcStatus === 'REJECTED';

  // Super Admin can override locks
  const isLocked = !isAdmin && (isUnderQcProcess || isFinalized || !isManager);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) {
      setErrorMsg('Akses Ditolak: Perubahan data Penerimaan Barang (GRN) hanya dapat dilakukan oleh Manager atau Administrator.');
      return;
    }
    if (isLocked) {
      onClose();
      return;
    }

    if (!formData.batchNumber || formData.batchNumber.trim() === '') {
      setErrorMsg('No. Batch Vendor / Produsen wajib diisi.');
      return;
    }

    if (!formData.quantityReceived || formData.quantityReceived <= 0) {
      setErrorMsg('Kuantitas terima harus lebih besar dari 0.');
      return;
    }

    if (!formData.containerCount || formData.containerCount <= 0) {
      setErrorMsg('Jumlah kemasan/koli harus lebih besar dari 0.');
      return;
    }

    // Trigger password authorization
    setAuthPassword('');
    setAuthPasswordError(null);
    setShowPasswordModal(true);
  };

  const handleFinalizeSaveWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthPasswordError(null);
    if (!authPassword.trim()) {
      setAuthPasswordError('Kata sandi pengguna aktif wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!isManager) {
        setAuthPasswordError('Akses Ditolak: Akun Anda tidak memiliki wewenang Manager untuk mengubah data GRN.');
        setIsSubmitting(false);
        return;
      }

      const actorNik = user?.nik || 'admin';
      const verify = await authService.verifyPassword(actorNik, authPassword);
      if (!verify.valid) {
        setAuthPasswordError(verify.error || 'Kata sandi tidak valid. Otorisasi perubahan GRN ditolak.');
        setIsSubmitting(false);
        return;
      }

      const payloadToSave: Partial<GrnRecord> = {
        ...formData,
        ...(record.qcStatus === 'REVERTED_TO_WAREHOUSE'
          ? {
              qcStatus: 'QUARANTINE',
              notes: `Diperbaiki oleh Gudang (${new Date().toLocaleDateString('id-ID')}). Sebelumnya direvert: ${record.revertReason || record.notes || '-'}`,
            }
          : {}),
      };

      await onSave(record.id, payloadToSave);
      setShowPasswordModal(false);
      onClose();
    } catch (err: any) {
      setAuthPasswordError(err.message || 'Gagal menyimpan perubahan GRN');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6 max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/20 text-orange-400 rounded-xl border border-orange-500/30">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">
                  {!isManager
                    ? 'Detail Data Penerimaan (Mode Baca - Khusus Manager)'
                    : isLocked
                    ? 'Detail Data Penerimaan (Terkunci)'
                    : 'Edit Penerimaan Barang (GRN)'}
                </h3>
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/30">
                  {record.grnNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {record.materialCode} - {record.materialName} ({record.materialType === 'raw' ? 'Bahan Baku' : 'Bahan Kemas'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lock or Revert Alert Banner */}
        {isAdmin && (isUnderQcProcess || isFinalized) && (
          <div className="bg-indigo-50 border-b border-indigo-200 p-4 text-xs text-indigo-950 flex items-start gap-2.5 shrink-0">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-indigo-900 uppercase tracking-wide">
                Mode Super Admin Master Override Aktif:
              </span>
              <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                Anda login sebagai <strong>Administrator Utama</strong>. Anda memiliki otorisasi penuh untuk mengoreksi kuantitas diterima, nomor batch, atau data GRN ini meskipun status saat ini adalah <strong>{record.qcStatus}</strong>.
              </p>
            </div>
          </div>
        )}

        {!isAdmin && isUnderQcProcess && (
          <div className="bg-blue-50 border-b border-blue-200 p-4 text-xs text-blue-950 flex items-start gap-2.5 shrink-0">
            <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-blue-900 uppercase tracking-wide">
                Data Penerimaan Terkunci (Sedang Diproses QC Lab):
              </span>
              <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                Lot ini sedang dalam tahap <strong>{record.qcStatus === 'QUALITY_CONTROL_PROCESS' ? 'Pengujian Laboratorium (Sedang Uji)' : 'Menunggu Otorisasi Quality Manager'}</strong>. Data penerimaan fisik dikunci demi menjaga integritas data mutu dan konsistensi perhitungan rencana sampling ({record.materialType === 'raw' ? 'n = 1 + √N' : 'MIL-STD-105E'}).
              </p>
              <p className="text-[10.5px] text-blue-700 mt-1 font-medium">
                💡 Jika terdapat kesalahan data penerimaan fisik, silakan minta tim QC melakukan <strong>Revert (Kembalikan ke Gudang)</strong> terlebih dahulu.
              </p>
            </div>
          </div>
        )}

        {!isAdmin && isFinalized && (
          <div className="bg-slate-100 border-b border-slate-200 p-4 text-xs text-slate-700 flex items-start gap-2.5 shrink-0">
            <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Data Penerimaan Terkunci (Audit Trail CPKB):</span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Lot ini telah selesai melewati tahapan otorisasi QC (Status: {record.qcStatus}). Data penerimaan gudang tidak dapat diubah untuk menjaga integritas data mutu.
              </p>
            </div>
          </div>
        )}

        {(record.qcStatus === 'REVERTED_TO_WAREHOUSE' || Boolean(record.revertReason && record.revertReason.trim())) && (
          <div className="bg-amber-50 border-b border-amber-200 p-4 text-xs text-amber-950 flex items-start gap-3 shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5 w-full">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-900 uppercase tracking-wide">
                  Penerimaan Dikembalikan (Revert) oleh Tim QC
                </span>
                {record.revertedAt && (
                  <span className="text-[10px] text-amber-700 font-mono">
                    {new Date(record.revertedAt).toLocaleString('id-ID')}
                  </span>
                )}
              </div>
              <div className="bg-white/80 border border-amber-200 rounded-lg p-2.5">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">Alasan Revert:</span>
                <p className="text-[12px] text-amber-900 font-semibold mt-0.5">
                  "{record.revertReason || record.notes || 'Silakan periksa dan perbaiki data dokumen penerimaan fisik.'}"
                </p>
                {record.revertedBy && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Petugas QC: <span className="font-medium text-slate-800">{record.revertedBy}</span>
                  </p>
                )}
              </div>
              <p className="text-[10.5px] text-amber-800">
                Menyimpan perbaikan formulir ini akan mengembalikan status ke <strong>KARANTINA</strong> dan secara otomatis menghitung ulang rencana sampling QC.
              </p>
            </div>
          </div>
        )}

        {/* Manager-Only Restriction Banner */}
        {!isManager && (
          <div className="bg-amber-50/90 border-b border-amber-200 p-4 text-xs text-amber-950 flex items-start gap-3 shrink-0">
            <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-900 uppercase tracking-wide">
                Akses Terbatas (Khusus Level Manager):
              </span>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Anda masuk sebagai <strong>{user?.name || 'Pengguna'} ({user?.role?.toUpperCase() || 'USER'})</strong>. Formulir ini berada dalam mode baca (<em>Read-Only</em>). Berdasarkan SOP dan integritas CPKB, perubahan data kedatangan barang (GRN) hanya berhak dilakukan oleh <strong>Manager Gudang / Manager Terkait</strong> atau <strong>Administrator</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 grow text-xs text-slate-800">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold">
              {errorMsg}
            </div>
          )}

          {/* Row 1: Produsen & Supplier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Produsen (Manufacturer) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.manufacturer || ''}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Supplier <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.distributor || ''}
                onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
                required
              />
            </div>
          </div>

          {/* Row 2: No. Batch Vendor, No. SJ, No. PO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                No. Batch Vendor <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.batchNumber || ''}
                onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">No. Surat Jalan (SJ)</label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.deliveryNoteNumber || ''}
                onChange={(e) => setFormData({ ...formData, deliveryNoteNumber: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">No. Purchase Order (PO)</label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.poNumber || ''}
                onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
              />
            </div>
          </div>

          {/* Row 3: Qty, Satuan, Koli, Jenis Kemasan */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Kuantitas Terima <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                disabled={isLocked}
                value={formData.quantityReceived || ''}
                onChange={(e) => setFormData({ ...formData, quantityReceived: parseFloat(e.target.value) || 0 })}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Satuan</label>
              <select
                disabled={isLocked}
                value={formData.unit || 'kg'}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60 font-semibold"
              >
                {record.materialType === 'raw' ? (
                  <>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="L">Liter (L)</option>
                    <option value="mL">Mililiter (mL)</option>
                  </>
                ) : (
                  <>
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="set">Set</option>
                    <option value="roll">Roll</option>
                    <option value="box">Box</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Jumlah Koli/Wadah <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                disabled={isLocked}
                value={formData.containerCount || 1}
                onChange={(e) => setFormData({ ...formData, containerCount: parseInt(e.target.value, 10) || 1 })}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Jenis Kemasan</label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.containerType || ''}
                onChange={(e) => setFormData({ ...formData, containerType: e.target.value })}
                placeholder="Contoh: Drum Fiber"
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
              />
            </div>
          </div>

          {/* Row 4: Tanggal Penerimaan & Tanggal Kedaluwarsa */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Tanggal Penerimaan <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                disabled={isLocked}
                value={formData.receivedDate || ''}
                onChange={(e) => setFormData({ ...formData, receivedDate: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tanggal Kedaluwarsa (ED)</label>
              <input
                type="date"
                disabled={isLocked}
                value={formData.expiryDate || ''}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
              />
            </div>
          </div>

          {/* Row 5: Lokasi & Kondisi Simpan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Lokasi Karantina Gudang</label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.storageLocation || ''}
                onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Kondisi Penyimpanan</label>
              <input
                type="text"
                disabled={isLocked}
                value={formData.storageConditions || ''}
                onChange={(e) => setFormData({ ...formData, storageConditions: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-hidden disabled:opacity-60"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              {isLocked ? 'Tutup' : 'Batal'}
            </button>
            {!isLocked && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 active:scale-98 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Password Confirmation Modal for Edit */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-100 text-orange-800 rounded-xl">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Otorisasi Simpan Perubahan GRN
                  </h4>
                  <span className="text-[10px] text-slate-400">Tanda Tangan Elektronik Pengguna</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-xs text-slate-800 space-y-1.5">
              <div className="flex justify-between font-mono font-bold text-[11px] text-slate-500">
                <span>No. GRN: {record.grnNumber}</span>
                <span>Batch: {formData.batchNumber}</span>
              </div>
              <p className="font-bold text-slate-900">
                {record.materialCode} - {record.materialName}
              </p>
              <p className="text-[11px] text-slate-600">
                Kuantitas Baru: {formData.quantityReceived} {formData.unit} ({formData.containerCount} {formData.containerType})
              </p>
            </div>

            <form onSubmit={handleFinalizeSaveWithPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Kata Sandi Akun Pengguna Aktif <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {user?.name || 'User'} ({user?.nik || 'NIK'})
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    autoFocus
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Masukkan password akun Anda..."
                    className="w-full text-xs border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 font-semibold"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Masukkan kata sandi akun login Anda untuk otorisasi tindakan ini.
                </p>
              </div>

              {authPasswordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{authPasswordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Verifikasi & Simpan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
