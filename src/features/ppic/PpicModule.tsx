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
import { ProductionBatchDetailModal } from '../quality/components/ProductionBatchDetailModal';
import { ProductionStepModal } from '../quality/components/ProductionStepModal';
import { IpcAnalysisModal } from '../quality/components/IpcAnalysisModal';

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
  const [selectedBatchForDetail, setSelectedBatchForDetail] = useState<IpcBulkTest | null>(null);
  const [selectedStepKey, setSelectedStepKey] = useState<string | null>(null);
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
                  Modul Produksi & Alur Manufaktur CPKB
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                  Batch Lifecycle Management
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Modul produksi, penjadwalan line, pencatatan timestamp tahapan prosedural & paralel, serta pemantauan batch dari CPB hingga gudang.
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


      </div>

      {/* Main Content Area */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">


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
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBatchForDetail(b)}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                    title="Klik untuk melihat alur proses produksi & lifecycle batch"
                  >
                    <td className="p-3.5 font-mono font-bold text-blue-800 group-hover:underline">{b.id}</td>
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

      {/* Modal Registrasi Batch */}
      <IpcBulkBatchRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={(updatedList) => {
          setBatches(updatedList);
          setIsRegisterModalOpen(false);
        }}
      />

      {/* Modal Detail Alur Proses Produksi & Batch Lifecycle */}
      <ProductionBatchDetailModal
        isOpen={!!selectedBatchForDetail}
        onClose={() => setSelectedBatchForDetail(null)}
        batch={selectedBatchForDetail}
        onOpenStepModal={(stepKey, b) => {
          setSelectedStepKey(stepKey);
        }}
      />

      {/* Modal Pengujian Analisa Ruahan (IPC Bulk) */}
      <IpcAnalysisModal
        isOpen={selectedStepKey === 'IPC_BULK'}
        onClose={() => setSelectedStepKey(null)}
        batch={selectedBatchForDetail}
        onSuccess={(updatedList) => {
          setBatches(updatedList);
          setSelectedStepKey(null);
          loadData();
        }}
      />

      {/* Modal Sub-Pekerjaan Tahap Produksi lainnya */}
      <ProductionStepModal
        isOpen={!!selectedStepKey && selectedStepKey !== 'IPC_BULK'}
        onClose={() => setSelectedStepKey(null)}
        stepKey={selectedStepKey}
        batch={selectedBatchForDetail}
        onSaveStepData={(stepKey, data) => {
          console.log('Saved step:', stepKey, data);
        }}
      />
    </div>
  );
};
