import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Search,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { ipcBulkService } from '../quality/services/ipcBulkService';
import { IpcBulkTest } from '../quality/utils/qcExtData';
import { productService } from '../rnd/products/productService';
import { Product } from '../../types';
import { useAuth } from '../../core/auth/AuthContext';
import { IpcBulkBatchRegisterModal } from '../quality/components/IpcBulkBatchRegisterModal';

interface PpicModuleProps {
  activeSubTab?: string;
  onSelectSubTab?: (tab: string) => void;
}

export const PpicModule: React.FC<PpicModuleProps> = ({
  activeSubTab = 'schedule',
  onSelectSubTab,
}) => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>(activeSubTab || 'schedule');
  
  // State batch produksi PPIC (menggunakan ipcBulkService sebagai storage bersama untuk seluruh proses)
  const [batches, setBatches] = useState<IpcBulkTest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  
  // Modal State untuk Registrasi Batch Ruahan PPIC
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registeredProducts, setRegisteredProducts] = useState<Product[]>([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedBatches, prods] = await Promise.all([
        ipcBulkService.getBatches(true),
        productService.getProducts(),
      ]);
      setBatches(fetchedBatches || []);
      setRegisteredProducts(prods || []);
    } catch (e) {
      console.error('Error loading PPIC production batches:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => {
      ipcBulkService.getBatches(true).then(setBatches);
    };
    window.addEventListener('qc_reports_updated', handleUpdate);
    return () => {
      window.removeEventListener('qc_reports_updated', handleUpdate);
    };
  }, []);

  const filteredBatches = batches.filter((b) => {
    if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.batchNo.toLowerCase().includes(q) ||
      b.productName.toLowerCase().includes(q) ||
      (b.productCode && b.productCode.toLowerCase().includes(q)) ||
      (b.id && b.id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Banner PPIC */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-700/20 shrink-0">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900">
                  PPIC & Penjadwalan Produksi CPKB
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                  Master Batch Planning
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Modul perencanaan produksi sediaan kosmetik, registrasi batch ruahan massal, kalkulasi MRP & penjadwalan line.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadData}
              title="Muat ulang jadwal"
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-md shadow-blue-700/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrasi Batch Ruahan (PPIC)</span>
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500">Total Batch Terdaftar</span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {batches.length} <span className="text-xs font-semibold text-slate-400">Batch</span>
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200">
            <span className="text-[11px] font-bold text-purple-800">Sedang Uji Lab (IPC)</span>
            <div className="text-xl font-black text-purple-900 mt-1">
              {batches.filter((b) => b.status === 'TESTING' || b.status === 'RETEST').length} <span className="text-xs font-semibold text-purple-600">Proses</span>
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200">
            <span className="text-[11px] font-bold text-blue-800">Menunggu Otorisasi QM</span>
            <div className="text-xl font-black text-blue-900 mt-1">
              {batches.filter((b) => b.status === 'AWAITING_QM').length} <span className="text-xs font-semibold text-blue-600">Review</span>
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-800">Released (Siap Filling)</span>
            <div className="text-xl font-black text-emerald-900 mt-1">
              {batches.filter((b) => b.status === 'RELEASED' || b.status === 'RELEASED_DEVIATION').length} <span className="text-xs font-semibold text-emerald-600">Lulus</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari nomor batch, produk, atau kode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Status ({batches.length})</option>
              <option value="TESTING">Dalam Uji Lab (TESTING)</option>
              <option value="AWAITING_QM">Menunggu Otorisasi QM</option>
              <option value="RELEASED">Released / Lulus</option>
              <option value="REJECTED">Rejected / Ditolak</option>
            </select>
          </div>
        </div>

        {/* Batch Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <table className="w-full text-left border-collapse bg-white">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                <th className="p-3.5">ID Laporan / IPC</th>
                <th className="p-3.5">Nomor Batch</th>
                <th className="p-3.5">Nama & Kode Produk</th>
                <th className="p-3.5">Jumlah Mixing (Kg)</th>
                <th className="p-3.5">Tanggal Mixing</th>
                <th className="p-3.5">Analis / Pembuat</th>
                <th className="p-3.5 text-center">Status Mutu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Belum ada jadwal atau batch produksi ruahan terdaftar. Klik tombol <strong className="text-blue-700">"Registrasi Batch Ruahan (PPIC)"</strong> untuk mulai.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-blue-800">{b.id}</td>
                    <td className="p-3.5 font-mono font-bold text-slate-900">{b.batchNo}</td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{b.productName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{b.productCode || 'KODE-PJ'}</div>
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">{b.mixingQtyKg ? `${b.mixingQtyKg} Kg` : '100 Kg'}</td>
                    <td className="p-3.5 text-slate-600">{b.mixingDate || '-'}</td>
                    <td className="p-3.5 text-slate-600">{b.analyst || 'PPIC Planner'}</td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider ${
                          b.status === 'RELEASED' || b.status === 'RELEASED_DEVIATION'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : b.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : b.status === 'AWAITING_QM'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrasi Batch (Menggunakan modal yang sama dengan QC Lab agar konsisten) */}
      <IpcBulkBatchRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={(updatedList) => {
          setBatches(updatedList);
          setIsRegisterModalOpen(false);
        }}
      />
    </div>
  );
};
