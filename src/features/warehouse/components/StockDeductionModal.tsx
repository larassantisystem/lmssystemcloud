import React, { useState } from 'react';
import { X, MinusCircle, FileSpreadsheet, Download, AlertCircle, CheckCircle2, Upload, Lock } from 'lucide-react';
import { MaterialStockSummary } from '../types/stockTypes';
import { stockService } from '../stockService';
import { useAuth } from '../../../core/auth/AuthContext';
import { authService } from '../../../core/auth/authService';
import {
  downloadStockDeductTemplate,
  parseStockDeductExcel,
} from '../utils/excelWarehouseUtils';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface StockDeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: MaterialStockSummary[];
  onSuccess: () => void;
  userName?: string;
}

export const StockDeductionModal: React.FC<StockDeductionModalProps> = ({
  isOpen,
  onClose,
  materials,
  onSuccess,
  userName = 'Operator Timbang',
}) => {
  const { user } = useAuth();
  const [selectedMaterialCode, setSelectedMaterialCode] = useState('');
  const [selectedLotInternal, setSelectedLotInternal] = useState('');
  const [deductQty, setDeductQty] = useState('');
  const [spkNumber, setSpkNumber] = useState(`SPK-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [batchTarget, setBatchTarget] = useState('PROD-LOT-2026-A1');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'manual' | 'excel'>('manual');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password Confirmation State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordError, setAuthPasswordError] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<'manual' | 'excel'>('manual');

  useEscapeKey(() => {
    if (showPasswordModal) {
      setShowPasswordModal(false);
      setAuthPassword('');
      setAuthPasswordError(null);
    } else {
      onClose();
    }
  }, isOpen);

  // Excel state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);

  if (!isOpen) return null;

  const currentMaterial = materials.find((m) => m.materialCode === selectedMaterialCode);
  // Only lots that are released can be deducted for production
  const availableLots = (currentMaterial?.lots || []).filter(
    (l) => l.qcStatus === 'RELEASED' || (l.qcStatus as any) === 'PASSED'
  );
  const selectedLot = availableLots.find((l) => l.lotInternalNumber === selectedLotInternal);

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedMaterialCode) {
      setErrorMsg('Pilih bahan terlebih dahulu.');
      return;
    }
    if (!selectedLotInternal) {
      setErrorMsg('Pilih nomor lot yang akan dipotong.');
      return;
    }
    const qty = Number(deductQty);
    if (!qty || qty <= 0) {
      setErrorMsg('Masukkan jumlah kuantitas potong yang valid.');
      return;
    }
    if (selectedLot && qty > selectedLot.currentQuantity) {
      setErrorMsg(`Jumlah potong (${qty} ${currentMaterial?.unit}) melebihi saldo lot (${selectedLot.currentQuantity} ${currentMaterial?.unit}).`);
      return;
    }

    setPendingActionType('manual');
    setAuthPassword('');
    setAuthPasswordError(null);
    setShowPasswordModal(true);
  };

  const handleFinalizeActionWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthPasswordError(null);
    if (!authPassword.trim()) {
      setAuthPasswordError('Kata sandi pengguna aktif wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const actorNik = user?.nik || 'admin';
      const verify = await authService.verifyPassword(actorNik, authPassword);
      if (!verify.valid) {
        setAuthPasswordError(verify.error || 'Kata sandi tidak valid. Otorisasi pemotongan stok ditolak.');
        setIsSubmitting(false);
        return;
      }

      if (pendingActionType === 'manual') {
        const qty = Number(deductQty);
        await stockService.deductStock({
          materialCode: selectedMaterialCode,
          lotInternalNumber: selectedLotInternal,
          deductQuantity: qty,
          unit: currentMaterial?.unit || 'kg',
          spkNumber,
          batchTarget,
          performerName: userName,
          notes,
        });
        setShowPasswordModal(false);
        onSuccess();
        onClose();
      } else {
        const res = await stockService.batchDeductStock(parsedRows, userName);
        setShowPasswordModal(false);
        if (res.errors.length > 0) {
          setSuccessMsg(`Berhasil memotong ${res.successCount} item. Terdapat ${res.errors.length} peringatan.`);
        } else {
          setSuccessMsg(`Berhasil memproses pemotongan stok ${res.successCount} item dari Excel!`);
        }
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setAuthPasswordError(err.message || 'Gagal memproses pemotongan stok.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    setSuccessMsg('');
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setExcelFile(file);
      const rows = await parseStockDeductExcel(file);
      if (rows.length === 0) {
        setErrorMsg('Tidak ada baris pemakaian valid yang ditemukan pada file Excel.');
        setParsedRows([]);
        return;
      }
      setParsedRows(rows);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses file Excel.');
    }
  };

  const handleSubmitExcel = async () => {
    if (parsedRows.length === 0) {
      setErrorMsg('Silakan unggah file Excel yang berisi baris pemakaian valid.');
      return;
    }

    setPendingActionType('excel');
    setAuthPassword('');
    setAuthPasswordError(null);
    setShowPasswordModal(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20">
              <MinusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Potong Stok Material (Pemakaian SPK)
              </h2>
              <p className="text-xs text-slate-500">
                Pengeluaran material untuk penimbangan SPK / Work Order
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle: Manual vs Excel Batch */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('manual');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              mode === 'manual'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Input Manual SPK
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('excel');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'excel'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Impor Batch Excel</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-800 font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {mode === 'manual' ? (
          <form onSubmit={handleSubmitManual} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pilih Material (Hanya Stok Lolos QC)
              </label>
              <select
                value={selectedMaterialCode}
                onChange={(e) => {
                  setSelectedMaterialCode(e.target.value);
                  setSelectedLotInternal('');
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                <option value="">-- Pilih Kode & Nama Bahan --</option>
                {materials.map((m) => (
                  <option key={m.materialCode} value={m.materialCode}>
                    [{m.materialCode}] {m.materialName} (Tersedia: {m.stockReleased} {m.unit})
                  </option>
                ))}
              </select>
            </div>

            {selectedMaterialCode && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih Nomor Lot Rilis (Diurutkan FEFO)
                </label>
                {availableLots.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
                    Tidak ada lot berstatus RILIS yang tersedia untuk material ini.
                  </div>
                ) : (
                  <select
                    value={selectedLotInternal}
                    onChange={(e) => setSelectedLotInternal(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-mono"
                  >
                    <option value="">-- Pilih No. Lot --</option>
                    {availableLots.map((lot) => (
                      <option key={lot.lotInternalNumber} value={lot.lotInternalNumber}>
                        {lot.lotInternalNumber} • Saldo: {lot.currentQuantity} {lot.unit} (Exp: {lot.expiryDate})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kuantitas Potong ({currentMaterial?.unit || 'kg'})
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={deductQty}
                  onChange={(e) => setDeductQty(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nomor SPK / Work Order
                </label>
                <input
                  type="text"
                  value={spkNumber}
                  onChange={(e) => setSpkNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Target Batch / Formula Produksi
              </label>
              <input
                type="text"
                placeholder="cth: BATCH-LOTION-260901"
                value={batchTarget}
                onChange={(e) => setBatchTarget(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Catatan Penimbangan (Opsional)
              </label>
              <input
                type="text"
                placeholder="cth: Penimbangan ruang bersih A - Shift 1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between pt-4">
              <span className="text-xs text-slate-500">
                Petugas: <strong>{userName}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Memproses...' : 'Konfirmasi Potong Stok'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4">
            {/* Download Template Section */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
              <div className="space-y-0.5">
                <h4 className="text-xs font-black text-emerald-900">Template File Excel Potong Stok SPK</h4>
                <p className="text-[11px] text-emerald-700">Unduh format baku Excel pemotongan stok bahan baku & bahan kemas</p>
              </div>
              <button
                type="button"
                onClick={() => downloadStockDeductTemplate(materials)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template (.xlsx)</span>
              </button>
            </div>

            {/* Upload Box */}
            <div className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl p-5 text-center transition-colors bg-slate-50/50">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleExcelUpload}
                className="hidden"
                id="excel-deduct-file"
              />
              <label htmlFor="excel-deduct-file" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 text-amber-600 mx-auto" />
                <div>
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 inline-block shadow-xs">
                    Pilih File Excel Potong Stok (.xlsx / .csv)
                  </span>
                </div>
                {excelFile && (
                  <p className="text-xs font-mono text-slate-700 font-bold">
                    File Terpilih: {excelFile.name}
                  </p>
                )}
              </label>
            </div>

            {/* Parsed Rows Preview */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span>Pratinjau Item Potong ({parsedRows.length} item)</span>
                  <span className="text-emerald-600 font-mono font-semibold">Siap Diimpor</span>
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-white text-xs">
                  {parsedRows.map((row, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <span className="font-bold text-slate-900 font-mono mr-2">[{row.materialCode}]</span>
                        <span className="text-slate-600 font-mono text-[11px]">{row.spkNumber} ({row.batchTarget})</span>
                      </div>
                      <div className="font-mono font-bold text-amber-700">
                        -{row.deductQuantity} {row.unit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 border-t border-slate-100 flex items-center justify-between pt-4">
              <span className="text-xs text-slate-500">
                Petugas: <strong>{userName}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmitExcel}
                  disabled={isSubmitting || parsedRows.length === 0}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Memproses...' : `Proses ${parsedRows.length} Item Excel`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Otorisasi Pemotongan Stok (SPK)
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
              {pendingActionType === 'manual' ? (
                <>
                  <div className="flex justify-between font-mono font-bold text-[11px] text-slate-500">
                    <span>Kode: {selectedMaterialCode}</span>
                    <span>SPK: {spkNumber}</span>
                  </div>
                  <p className="font-bold text-slate-900">
                    Pemotongan: {deductQty} {currentMaterial?.unit} dari Lot {selectedLotInternal}
                  </p>
                  <p className="text-[11px] text-slate-600">Batch Target: {batchTarget}</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-900">
                    Proses Batch Impor Excel: {parsedRows.length} Pemotongan Stok
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Stok material akan dipotong secara permanen sesuai instruksi SPK di file Excel.
                  </p>
                </>
              )}
            </div>

            <form onSubmit={handleFinalizeActionWithPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Kata Sandi Akun Pengguna Aktif <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {user?.name || userName} ({user?.nik || 'NIK'})
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
                    className="w-full text-xs border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 font-semibold"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              {authPasswordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
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
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Verifikasi & Potong Stok'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
