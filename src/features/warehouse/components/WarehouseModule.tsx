import React, { useState, useEffect } from 'react';
import {
  Package,
  PackagePlus,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  FlaskConical,
  Boxes,
  Truck,
  MinusCircle,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { RawMaterial, PackagingMaterial } from '../../../types';
import { materialService } from '../../rnd/materials/materialService';
import { packagingService } from '../../rnd/materials/packagingService';
import { warehouseService } from '../warehouseService';
import { stockService } from '../stockService';
import { GrnRecord, GrnStats } from '../types/grnTypes';
import { qualityService } from '../../quality/qualityService';
import { GrnFormModal } from './GrnFormModal';
import { GrnTable } from './GrnTable';
import { QuarantineLabelModal } from './QuarantineLabelModal';
import { StockRawMaterialPage } from './StockRawMaterialPage';
import { StockPackagingPage } from './StockPackagingPage';
import { LocationRelocationPage } from './LocationRelocationPage';
import { useAuth } from '../../../core/auth/AuthContext';
import { MapPin, ArrowRightLeft, Database } from 'lucide-react';
import { SupabaseWarehouseSqlModal } from './SupabaseWarehouseSqlModal';

interface WarehouseModuleProps {
  activeSubTab?: string;
  onSelectSubTab?: (tab: string) => void;
}

export const WarehouseModule: React.FC<WarehouseModuleProps> = ({
  activeSubTab = 'inbound',
  onSelectSubTab,
}) => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState(activeSubTab || 'inbound');

  // Master Data from RnD - instant cache initializers (0ms)
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>(() => materialService.getLocalMaterials());
  const [packagingMaterials, setPackagingMaterials] = useState<PackagingMaterial[]>(() => packagingService.getLocalPackagingMaterials());
  const [isLoadingMaster, setIsLoadingMaster] = useState(false);

  // GRN records - instant cache initializers (0ms paint)
  const [grnRecords, setGrnRecords] = useState<GrnRecord[]>(() => warehouseService.getLocalRecords());
  const [isLoadingGrn, setIsLoadingGrn] = useState<boolean>(() => warehouseService.getLocalRecords().length === 0);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [quarantineRecordToPrint, setQuarantineRecordToPrint] = useState<GrnRecord | null>(null);
  const [quarantineRecordsToPrint, setQuarantineRecordsToPrint] = useState<GrnRecord[]>([]);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);

  // Sync subTab prop
  useEffect(() => {
    if (activeSubTab) setCurrentTab(activeSubTab);
  }, [activeSubTab]);

  const loadData = async () => {
    // 1. Prioritize GRN records so table appears instantly and updates smoothly
    warehouseService.getGrnRecords()
      .then((grns) => {
        if (grns && grns.length > 0) {
          setGrnRecords(grns);
        }
      })
      .catch((err) => {
        console.warn('[WarehouseModule] Supabase GRN fetch fallback:', err);
      })
      .finally(() => {
        setIsLoadingGrn(false);
      });

    // 2. Refresh Master Materials in the background for new modal entries without blocking the table
    Promise.all([
      materialService.getMaterials(),
      packagingService.getPackagingMaterials(),
    ])
      .then(([rms, pms]) => {
        if (rms && rms.length > 0) setRawMaterials(rms);
        if (pms && pms.length > 0) setPackagingMaterials(pms);
      })
      .catch((err) => {
        console.warn('[WarehouseModule] Master materials fetch notice:', err);
      })
      .finally(() => {
        setIsLoadingMaster(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats: GrnStats = warehouseService.calculateStats(grnRecords);

  const handleSaveGrn = async (recordData: Omit<GrnRecord, 'id' | 'createdAt'> & { grnNumber?: string }) => {
    const saved = await warehouseService.saveGrnRecord(recordData);
    setGrnRecords((prev) => [saved, ...prev]);
    // Synchronize stock lots
    await stockService.getStockLots();
    // Buka dialog cetak label karantina otomatis
    setQuarantineRecordToPrint(saved);
  };

  const handleUpdateGrn = async (id: string, updatedData: Partial<GrnRecord>) => {
    const prevRecord = grnRecords.find((r) => r.id === id);
    const wasReverted = prevRecord?.qcStatus === 'REVERTED_TO_WAREHOUSE';

    const updated = await warehouseService.updateGrnRecord(id, updatedData);
    setGrnRecords((prev) => prev.map((r) => (r.id === id ? updated : r)));
    await stockService.getStockLots();

    // If this was a correction of a reverted GRN, notify QC team
    if (wasReverted && updated.qcStatus === 'QUARANTINE') {
      await qualityService.createNotification({
        title: 'GRN Selesai Diperbaiki Gudang',
        message: `Data penerimaan untuk bahan ${updated.materialName} (${updated.grnNumber}) telah diperbaiki oleh Gudang dan dikembalikan ke status Karantina untuk diproses QC.`,
        type: 'SUCCESS',
        targetDepartments: ['quality', 'warehouse'],
        targetRoles: ['staff', 'supervisor', 'manager'],
        reportId: updated.id,
        grnNumber: updated.grnNumber,
      });
    }
  };

  const handleDeleteGrn = async (id: string) => {
    await warehouseService.deleteGrnRecord(id);
    await qualityService.deleteReportByGrnId(id);
    setGrnRecords((prev) => prev.filter((r) => r.id !== id));
    await stockService.getStockLots();
  };

  const handleTabChange = (tabId: string) => {
    setCurrentTab(tabId);
    if (onSelectSubTab) onSelectSubTab(tabId);
  };

  return (
    <div className="space-y-6">
      {/* Module Header with Quick Actions */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20 shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900">
                  Warehouse & Logistik CPKB
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  Sistem GRN & Stok Aktif
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Penerimaan barang, pemisahan stok bahan baku & bahan kemas, kartu stok FEFO, dan rekonsiliasi opname.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={loadData}
              title="Muat ulang data"
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsSqlModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer bg-white shadow-2xs"
              title="Audit Status Database Supabase & Skrip SQL Migration"
            >
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Audit DB & SQL</span>
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Penerimaan Barang Baru (GRN)</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Cards - Real-Time QC Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/70">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span>Total Kedatangan</span>
              <Truck className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {stats.totalIncoming} <span className="text-xs font-semibold text-slate-400">Penerimaan</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-800">
              <span>Karantina (Baru)</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-xl font-black text-amber-900 mt-1">
              {stats.inQuarantine} <span className="text-xs font-semibold text-amber-600">Menunggu QC</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80">
            <div className="flex items-center justify-between text-[11px] font-bold text-blue-800">
              <span>Sedang Uji Lab</span>
              <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-xl font-black text-blue-900 mt-1">
              {stats.underTesting || 0} <span className="text-xs font-semibold text-blue-600">Analisa Staf</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200/80">
            <div className="flex items-center justify-between text-[11px] font-bold text-purple-800">
              <span>Menunggu Otorisasi</span>
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div className="text-xl font-black text-purple-900 mt-1">
              {stats.awaitingAuth || 0} <span className="text-xs font-semibold text-purple-600">Review QM</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800">
              <span>Lolos QC (Rilis)</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-900 mt-1">
              {stats.passedQC} <span className="text-xs font-semibold text-emerald-600">Siap Pakai</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {currentTab === 'inbound' && (
        <GrnTable
          records={grnRecords}
          onDeleteRecord={handleDeleteGrn}
          onUpdateRecord={handleUpdateGrn}
          onPrintLabel={(rec) => setQuarantineRecordToPrint(rec)}
          onPrintBatchLabels={(recs) => setQuarantineRecordsToPrint(recs)}
        />
      )}

      {currentTab === 'stock-raw' && (
        <StockRawMaterialPage
          onSwitchToPackaging={() => handleTabChange('stock-packaging')}
          packagingCount={packagingMaterials.length}
        />
      )}

      {currentTab === 'stock-packaging' && (
        <StockPackagingPage
          onSwitchToRaw={() => handleTabChange('stock-raw')}
          rawCount={rawMaterials.length}
        />
      )}

      {currentTab === 'relocation' && (
        <LocationRelocationPage />
      )}

      {currentTab === 'weighing' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3">
          <FlaskConical className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">Ruang Timbang FEFO Bersih CPKB</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Hanya material dengan status Lolos QC (Rilis) yang dapat dialokasikan untuk penimbangan batch produksi sesuai First-Expired, First-Out.
          </p>
        </div>
      )}

      {currentTab === 'finished-goods' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3">
          <Boxes className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">Gudang Produk Jadi (PJ0001+)</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Penyimpanan produk ruahan yang telah dikemas dalam varian ukuran (PJ-V1, PJ-V2) siap kirim ke distributor.
          </p>
        </div>
      )}

      {/* GRN Form Modal Popup */}
      <GrnFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        rawMaterials={rawMaterials}
        packagingMaterials={packagingMaterials}
        onSave={handleSaveGrn}
        userName={user?.name || 'Staf Gudang Logistik'}
      />

      {/* Quarantine Label Print Modal */}
      <QuarantineLabelModal
        isOpen={!!quarantineRecordToPrint || quarantineRecordsToPrint.length > 0}
        onClose={() => {
          setQuarantineRecordToPrint(null);
          setQuarantineRecordsToPrint([]);
        }}
        record={quarantineRecordToPrint}
        records={quarantineRecordsToPrint.length > 0 ? quarantineRecordsToPrint : undefined}
      />

      {/* Supabase Warehouse DB Audit & SQL Modal */}
      <SupabaseWarehouseSqlModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
        onDataChanged={loadData}
      />
    </div>
  );
};
