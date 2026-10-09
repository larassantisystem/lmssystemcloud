import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  Eye,
  Trash2,
  AlertCircle,
  FileText,
  Calendar,
  Layers,
  Thermometer,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Building2,
  Tag,
  Boxes,
  Printer,
  Sparkles,
  ArrowUpDown,
  Pencil,
  Lock,
  RotateCcw,
  X,
} from 'lucide-react';
import { GrnRecord, GrnMaterialType, GrnQcStatus } from '../types/grnTypes';
import { warehouseService } from '../warehouseService';
import { Pagination } from '../../../core/ui-components/Pagination';
import { QuarantineLabelModal } from './QuarantineLabelModal';
import { GrnEditModal } from './GrnEditModal';
import { GrnDetailModal } from './GrnDetailModal';
import { useAuth } from '../../../core/auth/AuthContext';
import { authService } from '../../../core/auth/authService';

interface GrnTableProps {
  records: GrnRecord[];
  onDeleteRecord: (id: string) => void;
  onUpdateRecord?: (id: string, updatedData: Partial<GrnRecord>) => Promise<void>;
  onPrintLabel?: (record: GrnRecord) => void;
  onPrintBatchLabels?: (records: GrnRecord[]) => void;
}

export const GrnTable: React.FC<GrnTableProps> = ({
  records,
  onDeleteRecord,
  onUpdateRecord,
  onPrintLabel,
  onPrintBatchLabels,
}) => {
  const { user } = useAuth();

  // Category separation: 'raw' or 'packaging'
  const [activeCategory, setActiveCategory] = useState<'raw' | 'packaging'>('raw');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GrnQcStatus>('ALL');
  const isCompactMode = true;

  // Pagination states (Pilihan B: 20 baris per halaman untuk efisiensi Egress)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [serverPageData, setServerPageData] = useState<{
    records: GrnRecord[];
    totalItems: number;
    totalPages: number;
  } | null>(null);
  const [isServerLoading, setIsServerLoading] = useState(false);

  // Detail Modal State
  const [selectedRecord, setSelectedRecord] = useState<GrnRecord | null>(null);

  // Edit Modal State
  const [editRecordToUpdate, setEditRecordToUpdate] = useState<GrnRecord | null>(null);

  // Delete Authorization Modal State
  const [recordToDelete, setRecordToDelete] = useState<GrnRecord | null>(null);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Print Label Modal State
  const [labelRecordToPrint, setLabelRecordToPrint] = useState<GrnRecord | null>(null);
  const [batchRecordsToPrint, setBatchRecordsToPrint] = useState<GrnRecord[]>([]);

  // Selected records for batch operations
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);

  // Server-Side Pagination Effect
  useEffect(() => {
    let isCancelled = false;
    setIsServerLoading(true);

    const timer = setTimeout(() => {
      warehouseService
        .getGrnRecordsPaginated({
          page: currentPage,
          pageSize: itemsPerPage,
          materialType: activeCategory,
          status: statusFilter,
          search: searchQuery,
          forceRefresh: true,
        })
        .then((res) => {
          if (!isCancelled) {
            setServerPageData({
              records: res.records,
              totalItems: res.totalItems,
              totalPages: res.totalPages,
            });
            setIsServerLoading(false);
          }
        })
        .catch((err) => {
          console.warn('[GrnTable] Server pagination notice:', err);
          if (!isCancelled) setIsServerLoading(false);
        });
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [currentPage, itemsPerPage, activeCategory, statusFilter, searchQuery, records]);

  // Category counts
  const rawCount = useMemo(
    () => records.filter((r) => r.materialType === 'raw').length,
    [records]
  );
  const packagingCount = useMemo(
    () => records.filter((r) => r.materialType === 'packaging').length,
    [records]
  );

  // Fallback client filter
  const filteredRecords = useMemo(() => {
    return records
      .filter((rec) => {
        if (rec.materialType !== activeCategory) return false;
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'PASSED' || statusFilter === 'RELEASED') {
            if (rec.qcStatus !== 'PASSED' && rec.qcStatus !== 'RELEASED' && rec.qcStatus !== 'PASSED_WITH_DEVIATION') {
              return false;
            }
          } else if (rec.qcStatus !== statusFilter) {
            return false;
          }
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          rec.grnNumber.toLowerCase().includes(q) ||
          rec.materialCode.toLowerCase().includes(q) ||
          rec.materialName.toLowerCase().includes(q) ||
          rec.distributor.toLowerCase().includes(q) ||
          rec.manufacturer.toLowerCase().includes(q) ||
          rec.deliveryNoteNumber.toLowerCase().includes(q) ||
          (rec.poNumber && rec.poNumber.toLowerCase().includes(q)) ||
          (rec.batchNumber && rec.batchNumber.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.receivedDate).getTime();
        const dateB = new Date(b.receivedDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [records, activeCategory, statusFilter, searchQuery]);

  // Server-Side pagination takes precedence, reducing egress to only 25 records per request
  const totalItems = serverPageData ? serverPageData.totalItems : filteredRecords.length;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = serverPageData ? serverPageData.records : filteredRecords.slice(indexOfFirstItem, indexOfLastItem);

  const isAllCurrentSelected = currentItems.length > 0 && currentItems.every((item) => selectedRecordIds.includes(item.id));

  const toggleSelectAllCurrent = () => {
    if (isAllCurrentSelected) {
      const currentIds = new Set(currentItems.map((i) => i.id));
      setSelectedRecordIds((prev) => prev.filter((id) => !currentIds.has(id)));
    } else {
      const newIds = new Set(selectedRecordIds);
      currentItems.forEach((i) => newIds.add(i.id));
      setSelectedRecordIds(Array.from(newIds));
    }
  };

  const toggleSelectRecord = (id: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleTriggerBatchPrint = () => {
    const selected = (serverPageData?.records || filteredRecords).filter((r) =>
      selectedRecordIds.includes(r.id)
    );
    if (selected.length === 0) return;
    if (onPrintBatchLabels) {
      onPrintBatchLabels(selected);
    } else {
      setBatchRecordsToPrint(selected);
    }
  };

  const renderStatusBadge = (status: GrnQcStatus) => {
    switch (status) {
      case 'QUARANTINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            KARANTINA
          </span>
        );
      case 'QUALITY_CONTROL_PROCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            SEDANG UJI
          </span>
        );
      case 'AWAITING_QM_AUTHORIZATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-purple-600" />
            MENUNGGU OTORISASI
          </span>
        );
      case 'PASSED':
      case 'RELEASED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            RILIS
          </span>
        );
      case 'PASSED_WITH_DEVIATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            RILIS (DEVIASI)
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            DITOLAK
          </span>
        );
      case 'REVERTED_TO_WAREHOUSE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-50 text-orange-800 border border-orange-200 shadow-2xs">
            <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
            DIKEMBALIKAN QC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Category Tabs: Pisahkan Tabel Kedatangan Bahan Baku dan Bahan Kemas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveCategory('raw');
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeCategory === 'raw'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>🧪 Kedatangan Bahan Baku</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeCategory === 'raw'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {rawCount} Lot
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('packaging');
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeCategory === 'packaging'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>📦 Kedatangan Bahan Kemas</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeCategory === 'packaging'
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {packagingCount} Lot
            </span>
          </button>
        </div>

        {/* Info Urutan */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <span>Urutan: <strong>Terlama ke Baru (Ascending)</strong></span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={
              activeCategory === 'raw'
                ? 'Cari Bahan Baku (No. GRN, Kode B..., Nama, Produsen)...'
                : 'Cari Bahan Kemas (No. GRN, Kode K..., Nama, Produsen)...'
            }
            className="w-full pl-10 pr-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* QC Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-300 shadow-2xs cursor-pointer"
          >
            <option value="ALL">Semua Status QC</option>
            <option value="QUARANTINE">Karantina CPKB</option>
            <option value="QUALITY_CONTROL_PROCESS">Sedang Uji (QC Analisa)</option>
            <option value="AWAITING_QM_AUTHORIZATION">Menunggu Otorisasi QM</option>
            <option value="PASSED">Rilis (Lolos QC)</option>
            <option value="REJECTED">Ditolak (Rejected)</option>
            <option value="REVERTED_TO_WAREHOUSE">Dikembalikan QC</option>
          </select>
        </div>
      </div>

      {/* Batch Action Bar for Multiple Quarantine Labels Printing */}
      {selectedRecordIds.length > 0 && (
        <div className="bg-amber-500 text-slate-950 px-4 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg border border-amber-400 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="bg-slate-950 text-amber-300 px-3 py-1 rounded-xl text-xs font-black shadow-xs">
              {selectedRecordIds.length} Lot GRN Terpilih
            </span>
            <span className="text-xs font-bold text-slate-950">
              Siap cetak label stiker karantina CPKB sekaligus (Thermal Roll 100×100 mm)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedRecordIds([])}
              className="px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white text-xs font-bold text-slate-800 transition-colors cursor-pointer shadow-2xs"
            >
              Batal Pilihan
            </button>
            <button
              type="button"
              onClick={handleTriggerBatchPrint}
              className="px-4 py-1.5 rounded-xl bg-slate-950 hover:bg-black text-amber-300 text-xs font-black shadow-md flex items-center gap-2 transition-all cursor-pointer hover:scale-102 active:scale-98"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Cetak Massal Label Karantina ({selectedRecordIds.length} Lot)</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Table Container: Kolom No., No Grn, Material & Produsen, QTY (3 desimal), Status, Aksi */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`border-b border-slate-200 bg-slate-50/80 font-black text-slate-600 uppercase tracking-wider ${
                  isCompactMode ? 'text-[10px]' : 'text-[11px]'
                }`}
              >
                <th className={`${isCompactMode ? 'py-2 px-2 w-8' : 'py-3.5 px-3 w-9'} text-center`}>
                  <input
                    type="checkbox"
                    checked={isAllCurrentSelected}
                    onChange={toggleSelectAllCurrent}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-3.5 h-3.5"
                    title="Pilih semua di halaman ini"
                  />
                </th>
                <th className={`${isCompactMode ? 'py-2 px-2.5 w-10' : 'py-3.5 px-3.5 w-12'} text-center`}>No.</th>
                <th className={`${isCompactMode ? 'py-2 px-3 min-w-[130px]' : 'py-3.5 px-4 min-w-[150px]'}`}>No Grn</th>
                <th className={`${isCompactMode ? 'py-2 px-3 min-w-[200px]' : 'py-3.5 px-4 min-w-[240px]'}`}>Material & Produsen</th>
                <th className={`${isCompactMode ? 'py-2 px-3 min-w-[120px]' : 'py-3.5 px-4 min-w-[140px]'}`}>QTY</th>
                <th className={`${isCompactMode ? 'py-2 px-2 text-center min-w-[110px]' : 'py-3.5 px-4 text-center min-w-[120px]'}`}>Status</th>
                <th className={`${isCompactMode ? 'py-2 px-3 text-right min-w-[120px]' : 'py-3.5 px-4 text-right min-w-[130px]'}`}>Aksi</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-slate-100 text-slate-700 ${isCompactMode ? 'text-[11px]' : 'text-xs'}`}>
              {currentItems.length > 0 ? (
                currentItems.map((rec, index) => {
                  const rowNumber = indexOfFirstItem + index + 1;
                  const formattedQty = Number(rec.quantityReceived || 0).toLocaleString('id-ID', {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  });

                  const isReverted = rec.qcStatus === 'REVERTED_TO_WAREHOUSE';
                  const isDeletable = rec.qcStatus === 'QUARANTINE' || rec.qcStatus === 'REVERTED_TO_WAREHOUSE';
                  const isSelected = selectedRecordIds.includes(rec.id);

                  return (
                    <tr
                      key={rec.id}
                      onClick={() => setSelectedRecord(rec)}
                      className={`cursor-pointer transition-colors group ${
                        isSelected
                          ? 'bg-amber-100/70 hover:bg-amber-100'
                          : isReverted
                          ? 'bg-orange-50/70 hover:bg-orange-100/70 border-l-4 border-l-orange-500'
                          : 'hover:bg-amber-50/40'
                      }`}
                      title={
                        isReverted
                          ? 'Penerimaan dikembalikan oleh QC untuk verifikasi data (Klik untuk detail)'
                          : 'Klik baris untuk melihat detail view'
                      }
                    >
                      {/* Checkbox */}
                      <td className={`${isCompactMode ? 'py-1.5 px-2' : 'py-3 px-3'} text-center`} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRecord(rec.id)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-3.5 h-3.5"
                          title={`Pilih ${rec.grnNumber}`}
                        />
                      </td>

                      {/* 1. No. */}
                      <td className={`${isCompactMode ? 'py-1.5 px-2.5' : 'py-3 px-3.5'} text-center font-bold text-slate-400 group-hover:text-slate-900`}>
                        {rowNumber}
                      </td>

                      {/* 2. No Grn */}
                      <td className={isCompactMode ? 'py-1.5 px-3' : 'py-3 px-4'}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(rec);
                          }}
                          className="font-mono font-bold text-blue-700 hover:text-blue-900 group/grn flex items-center gap-1.5 text-left cursor-pointer transition-colors"
                          title="Klik untuk membuka detail bukti penerimaan barang (GRN)"
                        >
                          <span className="bg-blue-50/90 group-hover/grn:bg-blue-100/90 group-hover/grn:underline text-blue-800 px-1.5 py-0.5 rounded border border-blue-200/80 shadow-2xs">
                            {rec.grnNumber}
                          </span>
                        </button>
                        <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400 flex items-center gap-1 mt-1`}>
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{rec.receivedDate}</span>
                        </div>
                        {rec.deliveryNoteNumber && rec.deliveryNoteNumber !== '-' && (
                          <div className={`${isCompactMode ? 'text-[9px]' : 'text-[10px]'} text-slate-400 mt-0.5`}>
                            SJ: <span className="font-mono text-slate-600">{rec.deliveryNoteNumber}</span>
                          </div>
                        )}
                      </td>

                      {/* 3. Material & Produsen */}
                      <td className={isCompactMode ? 'py-1.5 px-3' : 'py-3 px-4'}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-mono font-bold rounded-md ${
                              isCompactMode ? 'text-[9px] px-1.5 py-0.2' : 'text-[10px] px-2 py-0.5'
                            } ${
                              rec.materialType === 'raw'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {rec.materialCode}
                          </span>
                          <span className={`font-bold text-slate-900 group-hover:text-amber-800 transition-colors ${isCompactMode ? 'text-xs truncate max-w-[200px]' : ''}`}>
                            {rec.materialName}
                          </span>
                        </div>
                        <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400 mt-0.5 truncate max-w-[220px]`}>
                          Produsen: <span className="text-slate-600 font-medium">{rec.manufacturer}</span>
                        </div>
                        {isReverted && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-orange-800 bg-orange-100 px-2 py-0.5 rounded border border-orange-300">
                            <RotateCcw className="w-3 h-3 text-orange-600 shrink-0" />
                            <span className="truncate max-w-[240px]">
                              Dikembalikan QC: {rec.notes || 'Periksa fisik dokumen'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 4. QTY (format 3 angka dibelakang koma) */}
                      <td className={isCompactMode ? 'py-1.5 px-3' : 'py-3 px-4'}>
                        <div className="font-mono font-bold text-slate-900">
                          {formattedQty} <span className="text-slate-500 font-sans font-normal text-[10px]">{rec.unit}</span>
                        </div>
                        <div className={`${isCompactMode ? 'text-[9.5px]' : 'text-[11px]'} text-slate-400 mt-0.5`}>
                          {rec.containerCount} koli ({rec.containerType.split(' ')[0]})
                        </div>
                      </td>

                      {/* 5. Status */}
                      <td className={`${isCompactMode ? 'py-1.5 px-2' : 'py-3 px-4'} text-center`}>
                        {renderStatusBadge(rec.qcStatus)}
                      </td>

                      {/* 6. Aksi */}
                      <td className={`${isCompactMode ? 'py-1.5 px-3' : 'py-3 px-4'} text-right`}>
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Print Label Karantina */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onPrintLabel) {
                                onPrintLabel(rec);
                              } else {
                                setLabelRecordToPrint(rec);
                              }
                            }}
                            className={`${isCompactMode ? 'p-1' : 'p-1.5'} rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer`}
                            title="Print Label Karantina CPKB"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Data Penerimaan - Khusus Manager / Admin */}
                          {(() => {
                            const isAdmin = user?.role === 'admin' || user?.nik?.toLowerCase() === 'admin';
                            const isManager = user?.role === 'manager' || isAdmin;
                            const isStatusEditable = rec.qcStatus === 'QUARANTINE' || isReverted;
                            const isEditable = isAdmin || (isManager && isStatusEditable);
                            const isUnderTesting = rec.qcStatus === 'QUALITY_CONTROL_PROCESS';
                            const isAwaitingQm = rec.qcStatus === 'AWAITING_QM_AUTHORIZATION';
                            
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditRecordToUpdate(rec);
                                }}
                                className={`${isCompactMode ? 'p-1' : 'p-1.5'} rounded-lg transition-colors cursor-pointer ${
                                  isEditable
                                    ? isAdmin
                                      ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
                                      : 'text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200'
                                    : !isManager
                                    ? 'text-slate-400 bg-slate-100/80 border border-slate-200 hover:bg-slate-200/60'
                                    : isUnderTesting
                                    ? 'text-blue-700 bg-blue-50/70 hover:bg-blue-100 border border-blue-200'
                                    : isAwaitingQm
                                    ? 'text-purple-700 bg-purple-50/70 hover:bg-purple-100 border border-purple-200'
                                    : 'text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200'
                                }`}
                                title={
                                  isAdmin
                                    ? `Edit Data & Kuantitas (Super Admin Master Override - Status: ${rec.qcStatus})`
                                    : !isManager
                                    ? `Akses Terbatas (${user?.role?.toUpperCase() || 'USER'}): Hanya Manager atau Administrator yang berwenang mengedit data GRN (Mode Baca)`
                                    : isUnderTesting
                                    ? 'Lihat Data Penerimaan (Terkunci CPKB: Sedang Diuji QC Lab)'
                                    : isAwaitingQm
                                    ? 'Lihat Data Penerimaan (Terkunci CPKB: Menunggu Otorisasi QM)'
                                    : rec.qcStatus === 'PASSED' || rec.qcStatus === 'RELEASED' || rec.qcStatus === 'PASSED_WITH_DEVIATION' || rec.qcStatus === 'REJECTED'
                                    ? 'Lihat Data Penerimaan (Terkunci CPKB: Selesai Otorisasi Mutu)'
                                    : isReverted
                                    ? 'Koreksi Data Penerimaan yang Dikembalikan QC (Otorisasi Manager)'
                                    : 'Edit Data Penerimaan Barang (Otorisasi Manager)'
                                }
                              >
                                {isEditable ? (
                                  <Pencil className="w-3.5 h-3.5" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                              </button>
                            );
                          })()}

                          {/* Detail View */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecord(rec);
                            }}
                            className={`${isCompactMode ? 'p-1' : 'p-1.5'} rounded-lg text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer`}
                            title="Lihat Detail Penerimaan"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Record - Protected by CPKB Data Integrity, Unlocked for Super Admin */}
                          {(() => {
                            const isAdmin = user?.role === 'admin' || user?.nik?.toLowerCase() === 'admin';
                            const isDeletable = isAdmin || rec.qcStatus === 'QUARANTINE' || isReverted;

                            if (isDeletable) {
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRecordToDelete(rec);
                                    setDeletePassword('');
                                    setDeletePasswordError(null);
                                  }}
                                  className={`${isCompactMode ? 'p-1' : 'p-1.5'} rounded-lg transition-colors cursor-pointer ${
                                    isAdmin
                                      ? 'text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                  }`}
                                  title={
                                    isAdmin
                                      ? `Hapus Transaksi Penerimaan (Super Admin Master Override - Status: ${rec.qcStatus})`
                                      : isReverted
                                      ? 'Hapus Penerimaan yang Dibatalkan/Dikembalikan QC (Otorisasi Password)'
                                      : 'Hapus Catatan Karantina (Memerlukan Kata Sandi)'
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const label =
                                    rec.qcStatus === 'QUALITY_CONTROL_PROCESS'
                                      ? 'Sedang Uji'
                                      : rec.qcStatus === 'AWAITING_QM_AUTHORIZATION'
                                      ? 'Menunggu Otorisasi QM'
                                      : rec.qcStatus === 'PASSED' || rec.qcStatus === 'RELEASED'
                                      ? 'Rilis'
                                      : rec.qcStatus === 'PASSED_WITH_DEVIATION'
                                      ? 'Rilis dengan Deviasi'
                                      : 'Ditolak';
                                  alert(
                                    `[Terkunci CPKB / GMP]\n\nPenerimaan ${rec.grnNumber} tidak dapat dihapus oleh staf karena sudah dalam tahap "${label}".\n\nUntuk menjaga integritas data pengujian laboratorium, login sebagai Super Admin jika diperlukan override otorisasi.`
                                  );
                                }}
                                className={`${isCompactMode ? 'p-1' : 'p-1.5'} rounded-lg text-slate-300 bg-slate-100/70 border border-slate-200/80 cursor-not-allowed`}
                                title={`Terkunci CPKB: Tidak dapat dihapus karena status sudah ${rec.qcStatus}. Hubungi Administrator.`}
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Boxes className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs font-semibold text-slate-600">
                        {activeCategory === 'raw'
                          ? 'Belum ada kedatangan Bahan Baku'
                          : 'Belum ada kedatangan Bahan Kemas'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Klik tombol "Penerimaan Barang Baru (GRN)" untuk mencatat kedatangan barang.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Section */}
        {filteredRecords.length > 0 && (
          <div className="px-4 pb-2">
            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(items) => {
                setItemsPerPage(items);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* Quarantine Label Print Modal (Triggered via Table Action / Batch Selection) */}
      <QuarantineLabelModal
        isOpen={!!labelRecordToPrint || batchRecordsToPrint.length > 0}
        onClose={() => {
          setLabelRecordToPrint(null);
          setBatchRecordsToPrint([]);
        }}
        record={labelRecordToPrint}
        records={batchRecordsToPrint.length > 0 ? batchRecordsToPrint : undefined}
      />

      {/* Record Detail Modal */}
      <GrnDetailModal
        isOpen={!!selectedRecord}
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onPrintLabel={(rec) => {
          if (onPrintLabel) {
            onPrintLabel(rec);
          } else {
            setLabelRecordToPrint(rec);
          }
        }}
      />

      {/* Edit GRN Modal */}
      {editRecordToUpdate && (
        <GrnEditModal
          isOpen={!!editRecordToUpdate}
          onClose={() => setEditRecordToUpdate(null)}
          record={editRecordToUpdate}
          onSave={async (id, data) => {
            if (onUpdateRecord) {
              await onUpdateRecord(id, data);
            }
          }}
        />
      )}

      {/* Delete GRN Authorization Modal with Password */}
      {recordToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Otorisasi Hapus Penerimaan (GRN)
                  </h4>
                  <span className="text-[10px] text-slate-400">Verifikasi Kata Sandi Elektronik</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3.5 text-xs text-rose-950 space-y-1.5">
              <div className="flex justify-between font-mono font-bold text-[11px]">
                <span>No. GRN: {recordToDelete.grnNumber}</span>
                <span className="text-rose-700">{recordToDelete.qcStatus}</span>
              </div>
              <p className="font-bold text-slate-900">
                {recordToDelete.materialCode} - {recordToDelete.materialName}
              </p>
              <p className="text-[11px] text-slate-600">
                Jumlah: {recordToDelete.quantityReceived.toLocaleString()} {recordToDelete.unit} ({recordToDelete.containerCount} {recordToDelete.containerType})
              </p>
              <p className="text-[10.5px] text-rose-700 font-semibold pt-1">
                Peringatan: Menghapus catatan GRN ini juga akan otomatis membatalkan laporan pengujian QC di antrean karantina.
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!recordToDelete) return;
                if (!deletePassword.trim()) {
                  setDeletePasswordError('Kata sandi wajib diisi.');
                  return;
                }
                setIsDeleting(true);
                setDeletePasswordError(null);
                try {
                  const actorNik = user?.nik || 'admin';
                  const verify = await authService.verifyPassword(actorNik, deletePassword);
                  if (!verify.valid) {
                    setDeletePasswordError(verify.error || 'Kata sandi tidak valid. Otorisasi hapus ditolak.');
                    return;
                  }
                  onDeleteRecord(recordToDelete.id);
                  setRecordToDelete(null);
                  setDeletePassword('');
                } catch (err: any) {
                  setDeletePasswordError(err.message || 'Gagal menghapus catatan.');
                } finally {
                  setIsDeleting(false);
                }
              }}
              className="space-y-4"
            >
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
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Masukkan password akun Anda..."
                    className="w-full text-xs border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800 font-semibold"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              {deletePasswordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{deletePasswordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setRecordToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Menghapus...' : 'Otorisasi & Hapus GRN'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
