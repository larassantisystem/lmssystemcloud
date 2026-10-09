import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  FlaskConical,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Printer,
  FileText,
  Calendar,
  Building2,
  MapPin,
  History,
  QrCode,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import { MaterialStockSummary, StockLotItem, StockMovementLedger } from '../types/stockTypes';
import { stockService } from '../stockService';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface LotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: MaterialStockSummary | null;
}

export const LotDetailModal: React.FC<LotDetailModalProps> = ({
  isOpen,
  onClose,
  material,
}) => {
  useEscapeKey(onClose, isOpen && !!material);

  const [activeTab, setActiveTab] = useState<'lots' | 'ledger'>('lots');
  const [ledgerHistory, setLedgerHistory] = useState<StockMovementLedger[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  useEffect(() => {
    if (isOpen && material) {
      setIsLoadingLedger(true);
      stockService.getMovementLedger().then((logs) => {
        const cleanMatCode = (material.materialCode || '').trim().toUpperCase();
        const cleanMatName = (material.materialName || '').trim().toLowerCase();
        const filtered = logs.filter(
          (log) =>
            (log.materialCode && log.materialCode.trim().toUpperCase() === cleanMatCode) ||
            (log.materialName && log.materialName.trim().toLowerCase() === cleanMatName) ||
            material.lots.some((lot) => lot.lotInternalNumber === log.lotInternalNumber)
        );
        setLedgerHistory(filtered);
        setIsLoadingLedger(false);
      });
    }
  }, [isOpen, material]);

  if (!isOpen || !material) return null;

  const handlePrintLotLabel = (lot: StockLotItem) => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div className="flex items-start gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md ${
              material.materialType === 'raw'
                ? 'bg-teal-700 shadow-teal-700/20'
                : 'bg-purple-700 shadow-purple-700/20'
            }`}>
              {material.materialType === 'raw' ? (
                <FlaskConical className="w-5 h-5" />
              ) : (
                <Layers className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold ${
                  material.materialType === 'raw'
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-purple-100 text-purple-800'
                }`}>
                  {material.materialCode}
                </span>
                <span className="text-xs text-slate-400 font-semibold">• {material.category}</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                {material.materialName}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {material.storageLocation}
                </span>
                <span>•</span>
                <span>Satuan: <strong className="text-slate-800">{material.unit}</strong></span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aggregate Balance Mini Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5 bg-slate-100/60 border-b border-slate-200/80">
          <div className="p-3 bg-white rounded-2xl border border-emerald-200/90 shadow-2xs">
            <div className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">
              Siap Pakai (Released)
            </div>
            <div className="text-lg font-black text-emerald-700 mt-0.5">
              {material.stockReleased.toLocaleString('id-ID', { minimumFractionDigits: material.unit === 'kg' ? 3 : 0 })} <span className="text-xs">{material.unit}</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-amber-200/90 shadow-2xs">
            <div className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">
              Karantina (Hold QC)
            </div>
            <div className="text-lg font-black text-amber-700 mt-0.5">
              {material.stockQuarantine.toLocaleString('id-ID', { minimumFractionDigits: material.unit === 'kg' ? 3 : 0 })} <span className="text-xs">{material.unit}</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-rose-200/90 shadow-2xs">
            <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">
              Reject / Retur
            </div>
            <div className="text-lg font-black text-rose-700 mt-0.5">
              {material.stockRejected.toLocaleString('id-ID', { minimumFractionDigits: material.unit === 'kg' ? 3 : 0 })} <span className="text-xs">{material.unit}</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-slate-300 shadow-2xs">
            <div className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
              Total Akumulasi Fisik
            </div>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {material.totalAccumulated.toLocaleString('id-ID', { minimumFractionDigits: material.unit === 'kg' ? 3 : 0 })} <span className="text-xs">{material.unit}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('lots')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'lots'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Daftar Nomor Lot Aktif ({material.lots.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'ledger'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Kartu Stok & Riwayat Mutasi ({ledgerHistory.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'lots' && (
            <div className="space-y-3">
              {material.lots.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  <Tag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-semibold">Belum ada nomor lot aktif terdaftar untuk bahan ini.</p>
                  <p className="text-[11px] mt-0.5 text-slate-400">Input penerimaan baru di tab Penerimaan Barang (GRN) untuk menerbitkan Lot.</p>
                </div>
              ) : (
                material.lots.map((lot, idx) => (
                  <div
                    key={lot.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-3 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-mono font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900">
                              {lot.lotInternalNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                lot.qcStatus === 'RELEASED' || (lot.qcStatus as any) === 'PASSED'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : lot.qcStatus === 'QUARANTINE' || (lot.qcStatus as any) === 'TESTING'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              {lot.qcStatus === 'RELEASED' || (lot.qcStatus as any) === 'PASSED'
                                ? 'LOLOS (SIAP PAKAI)'
                                : lot.qcStatus === 'QUARANTINE'
                                ? 'DALAM KARANTINA'
                                : 'REJECT'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            GRN: <strong className="font-mono text-slate-700">{lot.grnNumber}</strong> • Batch Vendor: <strong className="text-slate-800">{lot.batchNumberVendor}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-500">Saldo Tersedia:</div>
                          <div className="text-base font-black text-slate-900 font-mono">
                            {lot.currentQuantity.toLocaleString('id-ID', { minimumFractionDigits: lot.unit === 'kg' ? 3 : 0 })} {lot.unit}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Produsen / Supplier</span>
                        <span className="font-semibold text-slate-800 truncate block">{lot.manufacturer}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Lokasi Simpan</span>
                        <span className="font-semibold text-slate-800 truncate block">{lot.storageLocation}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Tgl Masuk & Kadaluarsa</span>
                        <span className="font-semibold text-slate-800 block">{lot.receivedDate} ➜ {lot.expiryDate}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Jumlah Koli</span>
                        <span className="font-semibold text-slate-800 block">{lot.containerCount} {lot.containerType}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'ledger' && (
            <div className="space-y-3">
              {isLoadingLedger ? (
                <div className="p-8 text-center text-xs text-slate-500">Memuat rekam mutasi kartu stok...</div>
              ) : ledgerHistory.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-semibold">Belum ada catatan mutasi kartu stok untuk bahan ini.</p>
                  <p className="text-[11px] mt-0.5 text-slate-400">Mutasi akan otomatis tercatat saat rilis QC, penimbangan SPK, atau penyesuaian opname.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px] bg-slate-50">
                        <th className="p-2.5">Waktu</th>
                        <th className="p-2.5">Tipe Mutasi</th>
                        <th className="p-2.5">No. Lot & Ref</th>
                        <th className="p-2.5 text-right">Saldo Awal</th>
                        <th className="p-2.5 text-right">Perubahan</th>
                        <th className="p-2.5 text-right">Saldo Akhir</th>
                        <th className="p-2.5">Petugas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledgerHistory.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="p-2.5 font-mono text-[11px] text-slate-500">
                            {new Date(item.timestamp).toLocaleString('id-ID')}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.movementType === 'OUT_PRODUCTION_SPK'
                                ? 'bg-amber-100 text-amber-800'
                                : item.movementType === 'QC_RELEASE_TRANSFER'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}>
                              {item.movementType}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <div className="font-mono font-bold text-slate-900">{item.lotInternalNumber}</div>
                            <div className="text-[10px] text-slate-400">{item.referenceNumber}</div>
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-600">
                            {item.qtyBefore} {item.unit}
                          </td>
                          <td className={`p-2.5 text-right font-mono font-bold ${
                            item.qtyChange > 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {item.qtyChange > 0 ? `+${item.qtyChange}` : item.qtyChange} {item.unit}
                          </td>
                          <td className="p-2.5 text-right font-mono font-black text-slate-900">
                            {item.qtyAfter} {item.unit}
                          </td>
                          <td className="p-2.5 text-[11px] text-slate-700">
                            {item.performer?.name}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Terverifikasi Sistem CPKB & Traceability Lot BPOM
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
