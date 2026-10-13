import React, { useState } from 'react';
import {
  FileText,
  RotateCcw,
  Clock,
  CheckCircle2,
  ShieldAlert,
  AlertCircle,
  X,
  Printer,
  Calendar,
  Layers,
  Thermometer,
  Building2,
  Tag,
  Package,
  Eye,
  ExternalLink,
  Cloud,
} from 'lucide-react';
import { GrnRecord, GrnQcStatus } from '../types/grnTypes';
import { CoaViewerModal } from './CoaViewerModal';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface GrnDetailModalProps {
  isOpen?: boolean;
  record: GrnRecord | null;
  onClose: () => void;
  onPrintLabel?: (record: GrnRecord) => void;
}

export const GrnDetailModal: React.FC<GrnDetailModalProps> = ({
  isOpen = true,
  record,
  onClose,
  onPrintLabel,
}) => {
  const [showCoaViewer, setShowCoaViewer] = useState(false);

  useEscapeKey(onClose, isOpen && !showCoaViewer && !!record);

  if (!isOpen || !record) return null;

  const renderStatusBadge = (status: GrnQcStatus) => {
    switch (status) {
      case 'QUARANTINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            KARANTINA CPKB
          </span>
        );
      case 'QUALITY_CONTROL_PROCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            SEDANG UJI (QC)
          </span>
        );
      case 'AWAITING_QM_AUTHORIZATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-purple-600" />
            MENUNGGU OTORISASI QM
          </span>
        );
      case 'PASSED':
      case 'RELEASED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            RILIS (LOLOS QC)
          </span>
        );
      case 'PASSED_WITH_DEVIATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            RILIS DENGAN DEVIASI
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            DITOLAK (REJECTED)
          </span>
        );
      case 'REVERTED_TO_WAREHOUSE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-50 text-orange-800 border border-orange-200 shadow-2xs">
            <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
            DIKEMBALIKAN KE GUDANG
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

  const formattedQty = Number(record.quantityReceived || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900">
                  Detail Penerimaan Barang (GRN)
                </h3>
                <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-blue-100/80 text-blue-900 border border-blue-200">
                  {record.grnNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Bukti kedatangan fisik & pemeriksaan logistik gudang CPKB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs text-slate-700 max-h-[75vh] overflow-y-auto">
          {/* Revert Banner Alert */}
          {(record.qcStatus === 'REVERTED_TO_WAREHOUSE' || Boolean(record.revertReason && record.revertReason.trim())) && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>CATATAN PENGEMBALIAN DARI QUALITY CONTROL (REVERT)</span>
                </div>
                <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full">
                  Perlu Koreksi Gudang
                </span>
              </div>
              <div className="bg-white/80 border border-amber-200 rounded-xl p-3 pl-3.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Alasan Pengembalian:</span>
                <p className="text-xs text-amber-950 font-semibold mt-0.5">
                  "{record.revertReason || record.notes || 'Pengujian dibatalkan/dikembalikan oleh QC untuk verifikasi data penerimaan fisik.'}"
                </p>
                {record.revertedBy && (
                  <p className="text-[10.5px] text-slate-500 mt-1.5 pt-1.5 border-t border-amber-100 flex items-center justify-between">
                    <span>Otorisator QC: <strong className="text-slate-700">{record.revertedBy}</strong></span>
                    {record.revertedAt && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(record.revertedAt).toLocaleString('id-ID')}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <p className="text-[10.5px] text-amber-800">
                Data penerimaan ini dapat diedit kembali oleh tim Gudang Logistik. Menyimpan perubahan akan mengembalikan status ke <strong>KARANTINA</strong> untuk pengujian ulang oleh QC.
              </p>
            </div>
          )}

          {/* Quick Status Bar */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Status Alur Karantina
              </span>
              <div className="mt-1">{renderStatusBadge(record.qcStatus)}</div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Tipe Material
              </span>
              <span
                className={`inline-flex items-center gap-1 font-mono text-xs font-black px-2.5 py-0.5 rounded-md mt-1 ${
                  record.materialType === 'raw'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                {record.materialType === 'raw' ? 'Bahan Baku (Raw Material)' : 'Bahan Kemas (Packaging)'}
              </span>
            </div>
          </div>

          {/* Grid Information Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. Item Material */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3 text-slate-400" /> Item Material
              </span>
              <p className="font-bold text-slate-900 text-sm">{record.materialName}</p>
              <p className="font-mono text-xs text-slate-500">
                Kode: <strong className="text-slate-800">{record.materialCode}</strong>
              </p>
              <p className="text-xs text-slate-500">
                Produsen: <strong className="text-slate-700">{record.manufacturer || '-'}</strong>
              </p>
            </div>

            {/* 2. Supplier & Dokumen Pengiriman */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" /> Supplier & Pengiriman
              </span>
              <p className="font-bold text-slate-900 text-xs">{record.distributor || '-'}</p>
              <p className="text-xs text-slate-500">
                Surat Jalan (SJ):{' '}
                <span className="font-mono font-bold text-slate-800">
                  {record.deliveryNoteNumber || '-'}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                No. PO:{' '}
                <span className="font-mono font-medium text-slate-700">
                  {record.poNumber || '-'}
                </span>
              </p>
            </div>

            {/* 3. Kuantitas & Kemasan */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Package className="w-3 h-3 text-slate-400" /> Kuantitas Fisik Masuk
              </span>
              <p className="font-black text-slate-900 text-base font-mono">
                {formattedQty} <span className="text-xs font-sans text-slate-600 font-normal">{record.unit}</span>
              </p>
              <p className="text-xs text-slate-500">
                Kemasan:{' '}
                <strong className="text-slate-800 font-mono">{record.containerCount}</strong> koli / wadah ({record.containerType || '-'})
              </p>
            </div>

            {/* 4. Batch & Tanggal Kedaluwarsa */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" /> Batch & Kedaluwarsa
              </span>
              <p className="text-xs text-slate-700">
                No. Batch Vendor:{' '}
                <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                  {record.batchNumber || '-'}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Tgl Kedatangan:{' '}
                <strong className="text-slate-800">{record.receivedDate}</strong>
              </p>
              <p className="text-xs text-slate-500">
                Tgl Expired:{' '}
                <strong className="text-slate-800">{record.expiryDate || '-'}</strong>
              </p>
              {record.retestDate && (
                <p className="text-xs text-slate-500">
                  Tgl Retest (Uji Ulang):{' '}
                  <strong className="text-emerald-700 font-mono font-bold">{record.retestDate}</strong>
                  <span className="ml-1 text-[10px] text-emerald-600 font-medium">(Otomatis H-3 Bulan)</span>
                </p>
              )}
            </div>

            {/* 5. Lokasi & Penyimpanan */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-1 sm:col-span-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Thermometer className="w-3 h-3 text-slate-400" /> Lokasi & Kondisi Penyimpanan
              </span>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                <div>
                  <p className="font-bold text-slate-900 text-xs">{record.storageLocation || 'Gudang Karantina'}</p>
                  <p className="text-xs text-slate-500">{record.storageConditions || 'Suhu Ruang Kamar Terkendali (15°C - 25°C)'}</p>
                </div>
                {record.qcParametersCount !== undefined && record.qcParametersCount > 0 && (
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold block">Spesifikasi Lab QC</span>
                    <span className="text-xs font-black text-blue-700">{record.qcParametersCount} Parameter Terdaftar</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Kondisi Fisik & Dokumen Tambahan */}
          {(record.sealCondition || record.packagingCondition || record.coaAttachment || record.notes) && (
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                Pemeriksaan Fisik & Dokumen Mutu
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {record.sealCondition && (
                  <div>
                    <span className="text-slate-400">Kondisi Segel: </span>
                    <span className="font-semibold text-slate-800">{record.sealCondition}</span>
                  </div>
                )}
                {record.packagingCondition && (
                  <div>
                    <span className="text-slate-400">Kondisi Kemasan: </span>
                    <span className="font-semibold text-slate-800">{record.packagingCondition}</span>
                  </div>
                )}
                {record.coaAttachment && (
                  <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-400">Sertifikat Mutu (CoA): </span>
                      <span className="font-semibold text-emerald-700 font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                        ✓ {record.coaAttachment.startsWith('data:image/')
                          ? 'Foto / Scan CoA (.JPG/.PNG)'
                          : record.coaAttachment.startsWith('data:application/pdf')
                          ? 'Dokumen CoA (.PDF)'
                          : record.coaAttachment.startsWith('data:')
                          ? 'Dokumen CoA Terlampir'
                          : record.coaAttachment}
                      </span>
                      {record.coaDriveFileId && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          <Cloud className="w-2.5 h-2.5 text-blue-600" />
                          GDrive
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCoaViewer(true)}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 border border-blue-200 transition-colors cursor-pointer w-fit"
                      title="Lihat / Buka Dokumen CoA di Google Drive"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Dokumen CoA</span>
                    </button>
                  </div>
                )}
                {record.notes && (
                  <div className="sm:col-span-2 pt-1 border-t border-slate-200/60">
                    <span className="text-slate-400">Catatan Penerimaan: </span>
                    <span className="text-slate-700 italic">"{record.notes}"</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer Metadata */}
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100">
            <span>
              Diterima oleh: <strong className="text-slate-800">{record.receivedBy || 'Staff Gudang'}</strong>
            </span>
            <span>
              Dicatat: {record.createdAt ? new Date(record.createdAt).toLocaleString('id-ID') : '-'}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            {onPrintLabel && (
              <button
                type="button"
                onClick={() => {
                  onPrintLabel(record);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold hover:bg-amber-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Label Karantina</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Coa Viewer Modal */}
      {showCoaViewer && (
        <CoaViewerModal
          isOpen={showCoaViewer}
          onClose={() => setShowCoaViewer(false)}
          fileName={record.coaAttachment}
          driveFileId={record.coaDriveFileId}
          driveViewLink={record.coaDriveViewLink}
          materialName={record.materialName}
          materialCode={record.materialCode}
          batchNumber={record.batchNumber}
          grnNumber={record.grnNumber}
          onDriveUploaded={(res) => {
            record.coaDriveFileId = res.fileId;
            record.coaDriveViewLink = res.viewLink;
          }}
        />
      )}
    </div>
  );
};
