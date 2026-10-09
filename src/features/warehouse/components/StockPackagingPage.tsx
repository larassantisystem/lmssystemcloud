import React, { useState, useEffect } from 'react';
import {
  Layers,
  FlaskConical,
  Search,
  RefreshCw,
  MinusCircle,
  Scale,
  Tag,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
} from 'lucide-react';
import { MaterialStockSummary } from '../types/stockTypes';
import { stockService } from '../stockService';
import { LotDetailModal } from './LotDetailModal';
import { StockDeductionModal } from './StockDeductionModal';
import { StockOpnameModal } from './StockOpnameModal';
import { LocationRelocationPage } from './LocationRelocationPage';
import { useAuth } from '../../../core/auth/AuthContext';

interface StockPackagingPageProps {
  onSwitchToRaw?: () => void;
  rawCount?: number;
}

export const StockPackagingPage: React.FC<StockPackagingPageProps> = ({
  onSwitchToRaw,
  rawCount = 0,
}) => {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<MaterialStockSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  // Pagination state (Pilihan B: 20 Baris per Halaman)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Modal States
  const [selectedMaterialForLots, setSelectedMaterialForLots] = useState<MaterialStockSummary | null>(null);
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false);
  const [isOpnameModalOpen, setIsOpnameModalOpen] = useState(false);
  const [isRelocModalOpen, setIsRelocModalOpen] = useState(false);
  const [lotsCountNeedingReloc, setLotsCountNeedingReloc] = useState(0);

  const loadStockData = async () => {
    setIsLoading(true);
    try {
      const data = await stockService.getStockSummaries('packaging');
      setMaterials(data);

      // Calculate lots needing relocation (passed/released in karantina)
      const allLots = await stockService.getStockLots();
      const count = allLots.filter(
        (l) =>
          l.materialType === 'packaging' &&
          (l.qcStatus === 'RELEASED' || (l.qcStatus as any) === 'PASSED') &&
          l.storageLocation.toLowerCase().includes('karantina')
      ).length;
      setLotsCountNeedingReloc(count);
    } catch (err) {
      console.error('Error loading packaging material stock:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStockData();
  }, []);

  // Filter Categories & Locations
  const categories = Array.from(new Set(materials.map((m) => m.category).filter(Boolean)));
  const locations = Array.from(new Set(materials.map((m) => m.storageLocation).filter(Boolean)));

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch =
      m.materialCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.storageLocation.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
    const matchesLocation = selectedLocation === 'all' || m.storageLocation === selectedLocation;

    return matchesSearch && matchesCategory && matchesLocation;
  });

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedLocation, itemsPerPage]);

  // Pagination Math
  const totalItems = filteredMaterials.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedMaterials = filteredMaterials.slice(startIndex, endIndex);

  // Calculate Aggregates
  const totalReleased = materials.reduce((acc, curr) => acc + curr.stockReleased, 0);
  const totalQuarantine = materials.reduce((acc, curr) => acc + curr.stockQuarantine, 0);
  const totalReject = materials.reduce((acc, curr) => acc + curr.stockRejected, 0);
  const totalLots = materials.reduce((acc, curr) => acc + curr.lots.length, 0);

  return (
    <div className="space-y-4">
      {/* Top Banner & Category Switcher */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-700 text-white flex items-center justify-center shadow-md shadow-purple-700/20 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  Stock Bahan Kemas (K0001+)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold">
                  Packaging Material CPKB
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitoring saldo botol, pot, tutup, label sticker, dan karton box sekunder/tersier siap pengemasan.
              </p>
            </div>
          </div>

        </div>

        {/* Action Toolbar & Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDeductModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <MinusCircle className="w-3.5 h-3.5" />
              <span>Potong Stok (Excel / Manual)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpnameModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Stock Opname / Penyesuaian</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRelocModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer relative"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span>Pemindahan Lokasi / Putaway</span>
              {lotsCountNeedingReloc > 0 && (
                <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 text-[9px] font-black rounded-full bg-amber-500 text-white animate-pulse">
                  {lotsCountNeedingReloc}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={loadStockData}
              title="Refresh saldo stok kemasan"
              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Aggregate Stats Badges */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
              Rilis: {totalReleased.toLocaleString('id-ID')} pcs
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-bold">
              Hold: {totalQuarantine.toLocaleString('id-ID')} pcs
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 font-bold">
              Total: {totalLots} Lot Kemas
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari kode (K0001), nama kemasan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500 w-52 sm:w-64"
            />
          </div>

          {/* Location Filter */}
          {locations.length > 0 && (
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Semua Lokasi Rak ({locations.length})</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="text-xs font-bold text-slate-500">
          Menampilkan: <strong className="text-slate-800">{totalItems > 0 ? startIndex + 1 : 0}-{endIndex}</strong> dari {totalItems} Bahan Kemas
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px] bg-slate-50/70">
                <th className="p-3 w-10 text-center">NO</th>
                <th className="p-3">KODE & NAMA BAHAN KEMAS</th>
                <th className="p-3">LOKASI PENYIMPANAN / RAK</th>
                <th className="p-3 text-right">STOK SIAP PAKAI (RELEASED)</th>
                <th className="p-3 text-right">STOK KARANTINA (HOLD)</th>
                <th className="p-3 text-right">STOK REJECT</th>
                <th className="p-3 text-right">TOTAL AKUMULASI</th>
                <th className="p-3 text-center">RINCIAN LOT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                      <span>Memuat data saldo stok bahan kemas...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedMaterials.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Tidak ditemukan data bahan kemas yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                paginatedMaterials.map((mat, idx) => (
                  <tr key={mat.materialCode} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-center font-mono text-slate-400">{startIndex + idx + 1}</td>
                    
                    {/* Kode & Nama */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-purple-100 text-purple-800">
                          {mat.materialCode}
                        </span>
                        <span className="font-black text-slate-900">{mat.materialName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-500">
                          Min. Stock (ROP): <strong className="text-slate-800">{mat.minimumStock} {mat.unit}</strong>
                        </span>
                        <span>•</span>
                        {mat.stockReleased === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10px] animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            <span>HABIS</span>
                          </span>
                        ) : mat.stockReleased <= mat.minimumStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                            <TrendingDown className="w-3 h-3 text-amber-600" />
                            <span>KRITIS</span>
                          </span>
                        ) : mat.stockReleased <= mat.minimumStock * 1.25 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-semibold text-[10px]">
                            <AlertTriangle className="w-3 h-3 text-yellow-600" />
                            <span>RE-ORDER</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>OK</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Lokasi Penyimpanan (Kategori Dihilangkan) */}
                    <td className="p-3">
                      <div className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span className="truncate max-w-[220px]">{mat.storageLocation}</span>
                      </div>
                    </td>

                    {/* Stok Siap Pakai (Released) */}
                    <td className="p-3 text-right">
                      <span className={`inline-block px-2.5 py-1 rounded-xl font-mono font-bold text-xs ${
                        mat.stockReleased > 0
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {mat.stockReleased.toLocaleString('id-ID')} {mat.unit}
                      </span>
                    </td>

                    {/* Stok Karantina (Hold) */}
                    <td className="p-3 text-right">
                      <span className={`inline-block px-2.5 py-1 rounded-xl font-mono font-bold text-xs ${
                        mat.stockQuarantine > 0
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {mat.stockQuarantine.toLocaleString('id-ID')} {mat.unit}
                      </span>
                    </td>

                    {/* Stok Reject */}
                    <td className="p-3 text-right">
                      <span className={`inline-block px-2.5 py-1 rounded-xl font-mono font-bold text-xs ${
                        mat.stockRejected > 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {mat.stockRejected.toLocaleString('id-ID')} {mat.unit}
                      </span>
                    </td>

                    {/* Total Akumulasi */}
                    <td className="p-3 text-right">
                      <div className="font-mono font-black text-slate-900 text-xs">
                        {mat.totalAccumulated.toLocaleString('id-ID')} {mat.unit}
                      </div>
                    </td>

                    {/* Rincian Lot Button */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setSelectedMaterialForLots(mat)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-2xs ${
                          mat.lots.length > 0
                            ? 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5 text-purple-600" />
                        <span>{mat.lots.length} Lot</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalItems > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Tampilkan per halaman:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
              >
                <option value={10}>10 Baris</option>
                <option value={20}>20 Baris</option>
                <option value={50}>50 Baris</option>
                <option value={100}>100 Baris</option>
              </select>
              <span className="text-slate-400 font-mono">
                (Total: {totalItems} items)
              </span>
            </div>

            {/* Page Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                title="Halaman Pertama"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3 py-1 font-mono font-bold text-slate-800 bg-white rounded-lg border border-slate-200">
                Halaman {currentPage} / {totalPages}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                title="Halaman Selanjutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                title="Halaman Terakhir"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lot Breakdown Modal */}
      <LotDetailModal
        isOpen={!!selectedMaterialForLots}
        onClose={() => setSelectedMaterialForLots(null)}
        material={selectedMaterialForLots}
      />

      {/* Stock Deduction Modal */}
      <StockDeductionModal
        isOpen={isDeductModalOpen}
        onClose={() => setIsDeductModalOpen(false)}
        materials={materials}
        onSuccess={loadStockData}
        userName={user?.name || 'Operator Timbang'}
      />

      {/* Stock Opname Modal */}
      <StockOpnameModal
        isOpen={isOpnameModalOpen}
        onClose={() => setIsOpnameModalOpen(false)}
        materials={materials}
        onSuccess={loadStockData}
        userName={user?.name || 'Auditor Stock Opname'}
      />

      {/* Location Relocation Modal */}
      {isRelocModalOpen && (
        <LocationRelocationPage
          isModal={true}
          filterMaterialType="packaging"
          onClose={() => {
            setIsRelocModalOpen(false);
            loadStockData();
          }}
        />
      )}
    </div>
  );
};
