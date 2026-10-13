import React, { useState, useEffect } from 'react';
import {
  MapPin,
  ArrowRightLeft,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  Building2,
  RefreshCw,
  FlaskConical,
  Layers,
  History,
  Tag,
  Info,
  X,
} from 'lucide-react';
import { StockLotItem, StockMovementLedger } from '../types/stockTypes';
import { stockService } from '../stockService';
import { useAuth } from '../../../core/auth/AuthContext';

interface LocationRelocationPageProps {
  isModal?: boolean;
  onClose?: () => void;
  filterMaterialType?: 'raw' | 'packaging';
}

export const LocationRelocationPage: React.FC<LocationRelocationPageProps> = ({
  isModal = false,
  onClose,
  filterMaterialType,
}) => {
  const { user } = useAuth();
  const [lots, setLots] = useState<StockLotItem[]>([]);
  const [ledgerLogs, setLedgerLogs] = useState<StockMovementLedger[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [selectedLotNum, setSelectedLotNum] = useState<string>('');
  const [selectedLot, setSelectedLot] = useState<StockLotItem | null>(null);
  const [presetLocation, setPresetLocation] = useState<string>('');
  const [customLocation, setCustomLocation] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [lotSearchQuery, setLotSearchQuery] = useState<string>('');

  // Submit Feedback State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);

  const storageZones = stockService.getWarehouseStorageZones();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allLots, logs] = await Promise.all([
        stockService.getStockLots(),
        stockService.getMovementLedger(),
      ]);
      setLots(allLots);
      const relocLogs = logs.filter((l) => l.movementType === 'LOCATION_RELOCATION');
      setLedgerLogs(relocLogs);
    } catch (err) {
      console.error('Error loading relocation data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update selectedLot when selectedLotNum changes
  useEffect(() => {
    if (selectedLotNum) {
      const found = lots.find((l) => l.lotInternalNumber === selectedLotNum);
      setSelectedLot(found || null);
      setPresetLocation('');
      setCustomLocation('');
      setIsCustomMode(false);
      setSubmitErrorMsg(null);
      setSubmitSuccessMsg(null);
    } else {
      setSelectedLot(null);
    }
  }, [selectedLotNum, lots]);

  // Filter lots by type if filterMaterialType is specified
  const filteredLotsByType = lots.filter((l) => {
    if (!filterMaterialType) return true;
    return l.materialType === filterMaterialType;
  });

  // Filter lots needing relocation (Passed/Released lots that are still in Karantina)
  const lotsNeedingRelocation = filteredLotsByType.filter(
    (l) =>
      (l.qcStatus === 'RELEASED' || (l.qcStatus as any) === 'PASSED') &&
      l.storageLocation.toLowerCase().includes('karantina')
  );

  // Filtered lots for search dropdown
  const filteredLots = filteredLotsByType.filter((l) => {
    const q = lotSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      l.lotInternalNumber.toLowerCase().includes(q) ||
      l.materialCode.toLowerCase().includes(q) ||
      l.materialName.toLowerCase().includes(q) ||
      l.storageLocation.toLowerCase().includes(q) ||
      l.grnNumber.toLowerCase().includes(q)
    );
  });

  // Target Location Value
  const activeLocationValue = isCustomMode ? customLocation : presetLocation;

  // Boundary Validation Check
  const boundaryStatus = stockService.validateWarehouseBoundary(activeLocationValue);

  const handleRelocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErrorMsg(null);
    setSubmitSuccessMsg(null);

    if (!selectedLot) {
      setSubmitErrorMsg('Silakan pilih nomor lot yang akan dipindahkan terlebih dahulu.');
      return;
    }

    if (!activeLocationValue || !activeLocationValue.trim()) {
      setSubmitErrorMsg('Silakan pilih atau masukkan lokasi penyimpanan/rak yang baru.');
      return;
    }

    // Boundary check
    if (!boundaryStatus.isValid) {
      setSubmitErrorMsg(boundaryStatus.errorMessage || 'Lokasi baru di luar batas gudang yang diizinkan.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedLot = await stockService.relocateStockLot({
        lotInternalNumber: selectedLot.lotInternalNumber,
        newLocation: activeLocationValue.trim(),
        performerName: user?.name || 'Staf Logistik Gudang',
        notes: notes.trim(),
      });

      setSubmitSuccessMsg(
        `Berhasil memindahkan Lot ${updatedLot.lotInternalNumber} (${updatedLot.materialName}) ke lokasi baru: "${updatedLot.storageLocation}".`
      );

      // Reset Form
      setNotes('');
      setPresetLocation('');
      setCustomLocation('');
      setIsCustomMode(false);
      setSelectedLotNum('');

      // Reload Data
      await loadData();
    } catch (err: any) {
      setSubmitErrorMsg(err.message || 'Gagal memindahkan lokasi stok lot.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const mainContent = (
    <div className="space-y-6">
      {/* Top Banner Header - Only shown if not in modal */}
      {!isModal && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-700/20 shrink-0">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    Pemindahan Lokasi Simpan & Penataan Rak (Putaway)
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold">
                    Standar CPKB Gudang
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur lokasi fisik rak aktual setelah material diluluskan (RILIS) oleh Quality Control dari area Karantina ke Rak Rilis.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadData}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer flex items-center gap-2 text-xs font-bold self-start sm:self-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>
      )}

      {/* Priority Banner: Lots needing relocation after QC release */}
      {lotsNeedingRelocation.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
          <div className="flex items-center gap-2 text-xs font-black">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              PERHATIAN GUDANG: Ada {lotsNeedingRelocation.length} Lot {filterMaterialType === 'raw' ? 'Bahan Baku' : filterMaterialType === 'packaging' ? 'Bahan Kemas' : 'Material'} Lolos QC yang Masih di Area Karantina!
            </span>
          </div>
          <p className="text-xs text-amber-800/90">
            Silakan pilih lot di bawah ini untuk memindahkan posisinya secara fisik ke Rak Rilis Aktif agar siap ditimbang timbang SPK.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {lotsNeedingRelocation.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedLotNum(item.lotInternalNumber)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  selectedLotNum === item.lotInternalNumber
                    ? 'bg-amber-700 text-white border-amber-800 shadow-xs'
                    : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <span className="font-mono">{item.lotInternalNumber}</span> ({item.materialName})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Relocation Form Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-6">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <MapPin className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-black text-slate-900">Form Alokasi & Pemindahan Rak Simpan</h3>
            <p className="text-xs text-slate-500">Pilih nomor lot dan tentukan area/rak penyimpanan baru yang sah.</p>
          </div>
        </div>

        {/* Feedback Alert Messages */}
        {submitSuccessMsg && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{submitSuccessMsg}</span>
          </div>
        )}

        {submitErrorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{submitErrorMsg}</span>
          </div>
        )}

        <form onSubmit={handleRelocateSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* LEFT COLUMN: Lot Selection */}
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                1. Pilih Nomor Lot Internal <span className="text-rose-500">*</span>
              </label>

              {/* Lot Search & Select */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Cari nomor lot (LBB/LBK), nama bahan..."
                    value={lotSearchQuery}
                    onChange={(e) => setLotSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <select
                  value={selectedLotNum}
                  onChange={(e) => setSelectedLotNum(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- Pilih Nomor Lot ({filteredLots.length} Lot Tersedia) --</option>
                  {filteredLots.map((l) => (
                    <option key={l.id} value={l.lotInternalNumber}>
                      {l.lotInternalNumber} - {l.materialName} ({l.materialCode}) • {l.qcStatus === 'RELEASED' ? 'RELEASE' : l.qcStatus}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lot Card Detail Preview */}
              {selectedLot ? (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-slate-900">
                        {selectedLot.lotInternalNumber}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          selectedLot.qcStatus === 'RELEASED' || (selectedLot.qcStatus as any) === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : selectedLot.qcStatus === 'QUARANTINE'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        {selectedLot.qcStatus === 'RELEASED' ? 'STATUS: RILIS (LOLOS QC)' : selectedLot.qcStatus}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-slate-400 font-mono">
                      GRN: {selectedLot.grnNumber}
                    </span>
                  </div>

                  <div className="text-xs">
                    <span className="font-bold text-slate-800">{selectedLot.materialName}</span>
                    <span className="text-slate-400 font-mono text-[11px] ml-1">({selectedLot.materialCode})</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-200/80">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold uppercase">Lokasi Simpan Saat Ini</span>
                      <span className="font-black text-rose-700 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                        <span className="truncate">{selectedLot.storageLocation}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold uppercase">Saldo Fisik</span>
                      <span className="font-mono font-black text-slate-900 mt-0.5 block">
                        {selectedLot.currentQuantity.toLocaleString('id-ID')} {selectedLot.unit}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  <Tag className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                  <span>Pilih nomor lot di atas untuk melihat status lokasi saat ini.</span>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Target Location & Boundary Check */}
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. Tentukan Lokasi / Rak Simpan Baru <span className="text-rose-500">*</span>
              </label>

              {/* Mode Toggle: Preset Dropdown vs Custom Input */}
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsCustomMode(false)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    !isCustomMode
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Pilihan Rak Standar Gudang
                </button>

                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    isCustomMode
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Ketik Kode Rak Kustom
                </button>
              </div>

              {!isCustomMode ? (
                /* PRESET DROPDOWN */
                <select
                  value={presetLocation}
                  onChange={(e) => setPresetLocation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- Pilih Rak Penyimpanan Baru --</option>
                  
                  {(!filterMaterialType || filterMaterialType === 'raw') && (
                    <optgroup label="Gudang Bahan Baku (BB)">
                      {storageZones.raw.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {(!filterMaterialType || filterMaterialType === 'packaging') && (
                    <optgroup label="Gudang Bahan Kemas (BK)">
                      {storageZones.packaging.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  <optgroup label="Area Khusus & Retur">
                    {storageZones.special.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                /* CUSTOM TEXT INPUT */
                <div className="space-y-1">
                  <input
                    type="text"
                    placeholder="Contoh: Rak A-02-B3, Chiller Ruang 2, Area Pallet P-04..."
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Mencantumkan kode rak spesifik di area Gudang Utama, Karantina, atau Chiller.
                  </p>
                </div>
              )}

              {/* BOUNDARY VALIDATION INDICATOR */}
              {activeLocationValue ? (
                <div
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                    boundaryStatus.isValid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {boundaryStatus.isValid ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>
                      {boundaryStatus.isValid
                        ? 'Lokasi Valid dalam Batas Wilayah Gudang Sah'
                        : 'Lokasi Tidak Valid / Di Luar Batas Gudang'}
                    </span>
                  </div>

                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white border font-bold">
                    {boundaryStatus.isValid ? 'VALIDATED' : 'INVALID'}
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-500 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Sistem akan memverifikasi batas area fisik gudang sebelum memindahkan lokasi.</span>
                </div>
              )}

              {/* Catatan Pemindahan */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-600">Catatan Pemindahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Ditata oleh petugas shift pagi ke rak rilis utama..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Form Action Submit */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !selectedLot || !boundaryStatus.isValid}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>{isSubmitting ? 'Memproses Pemindahan...' : 'Proses Pemindahan Lokasi'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Relocation Audit History Ledger */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden space-y-3 p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Riwayat Pemindahan Lokasi Rak (Audit Trail CPKB)
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-slate-400">
            Total: {ledgerLogs.filter(l => !filterMaterialType || l.materialType === filterMaterialType).length} Transaksi Pemindahan
          </span>
        </div>

        {ledgerLogs.filter(l => !filterMaterialType || l.materialType === filterMaterialType).length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Belum ada rekam transaksi pemindahan lokasi rak untuk tipe material ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px] bg-slate-50/80">
                  <th className="p-3">WAKTU</th>
                  <th className="p-3">NO. LOT & KODE</th>
                  <th className="p-3">NAMA BAHAN</th>
                  <th className="p-3">PERUBAHAN LOKASI SIMPAN</th>
                  <th className="p-3">PETUGAS GUDANG</th>
                  <th className="p-3">CATATAN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerLogs
                  .filter(l => !filterMaterialType || l.materialType === filterMaterialType)
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono text-[11px] text-slate-500">
                        {new Date(log.timestamp).toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">
                        <div>{log.lotInternalNumber}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{log.materialCode}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-800">{log.materialName}</td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold text-[11px] inline-block">
                          {log.notes?.includes('Pemindahan Lokasi Simpan:')
                            ? log.notes.split('Pemindahan Lokasi Simpan:')[1].split('.')[0]
                            : log.notes}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 font-semibold">{log.performer.name}</td>
                      <td className="p-3 text-slate-500 text-[11px] max-w-xs truncate">
                        {log.notes}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
        <div className="bg-slate-50 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header modal */}
          <div className="px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">
                  Atur Lokasi Fisik Rak (Putaway CPKB)
                </h2>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Tipe Material: {filterMaterialType === 'raw' ? 'Bahan Baku (BB)' : filterMaterialType === 'packaging' ? 'Bahan Kemas (BK)' : 'Semua'}
                </p>
              </div>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {/* Modal body */}
          <div className="p-6 overflow-y-auto">
            {mainContent}
          </div>
        </div>
      </div>
    );
  }

  return mainContent;
};
