import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  X,
  AlertTriangle,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Package,
  Calendar,
  Layers,
  Building2,
  FileText,
} from 'lucide-react';
import { GrnRecord } from '../types/grnTypes';
import { QrCodeBadge } from '../../../components/QrCodeBadge';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QuarantineLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  record?: GrnRecord | null;
  records?: GrnRecord[];
}

export const QuarantineLabelModal: React.FC<QuarantineLabelModalProps> = ({
  isOpen,
  onClose,
  record,
  records,
}) => {
  useEscapeKey(onClose, isOpen);

  const effectiveRecords: GrnRecord[] = record
    ? [record]
    : (records && records.length > 0 ? records : []);

  const isMultiRecord = effectiveRecords.length > 1;

  // Single-record mode states
  const [containerRange, setContainerRange] = useState<'single' | 'all' | 'custom'>('all');
  const [selectedContainerNum, setSelectedContainerNum] = useState<number>(1);
  const [customRangeStart, setCustomRangeStart] = useState<number>(1);
  const [customRangeEnd, setCustomRangeEnd] = useState<number>(1);

  // Multi-record mode state
  const [batchContainerMode, setBatchContainerMode] = useState<'all_containers' | 'one_per_record'>('all_containers');

  // Copies multiplier per container
  const [copiesCount, setCopiesCount] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  if (!isOpen || effectiveRecords.length === 0) return null;

  const activeRecord = effectiveRecords[0];
  const totalContainersFirst = activeRecord.containerCount || 1;

  // Build the list of labels to print
  interface LabelItem {
    record: GrnRecord;
    containerIndex: number;
    totalContainers: number;
    copyIndex: number;
  }

  const labelItems: LabelItem[] = [];

  effectiveRecords.forEach((rec) => {
    const totalCont = rec.containerCount || 1;
    let containerIndexesToPrint: number[] = [];

    if (isMultiRecord) {
      if (batchContainerMode === 'one_per_record') {
        containerIndexesToPrint = [1];
      } else {
        containerIndexesToPrint = Array.from({ length: totalCont }, (_, i) => i + 1);
      }
    } else {
      if (containerRange === 'all') {
        containerIndexesToPrint = Array.from({ length: totalCont }, (_, i) => i + 1);
      } else if (containerRange === 'single') {
        containerIndexesToPrint = [selectedContainerNum];
      } else {
        const start = Math.max(1, Math.min(customRangeStart, totalCont));
        const end = Math.max(start, Math.min(customRangeEnd, totalCont));
        containerIndexesToPrint = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
    }

    containerIndexesToPrint.forEach((cIdx) => {
      for (let cp = 1; cp <= copiesCount; cp++) {
        labelItems.push({
          record: rec,
          containerIndex: cIdx,
          totalContainers: totalCont,
          copyIndex: cp,
        });
      }
    });
  });

  const handlePrint = () => {
    const cleanGrn = (activeRecord.grnNumber || 'GRN').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const cleanMat = (activeRecord.materialName || 'Material').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const suggestedFileName = `LABEL_KARANTINA_${cleanGrn}_${cleanMat}`;
    const previousTitle = document.title;
    document.title = suggestedFileName;

    // Bersihkan sisa style report A4 jika ada
    document.body.classList.remove('printing-report');
    document.body.classList.remove('printing-compact');
    const reportStyles = ['qc-report-print-style', 'ipc-report-print-style'];
    reportStyles.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    document.body.classList.add('printing-label');
    const styleEl = document.createElement('style');
    styleEl.id = 'quarantine-label-print-style';
    styleEl.innerHTML = `
      @page {
        size: 100mm 100mm;
        margin: 0;
      }
      @media print {
        html, body {
          width: 100mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
        }
        .print-page-wrapper {
          width: 100mm !important;
          height: 100mm !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.removeEventListener('afterprint', cleanup);
      document.title = previousTitle;
      document.body.classList.remove('printing-label');
      const el = document.getElementById('quarantine-label-print-style');
      if (el) el.remove();
    };

    window.addEventListener('afterprint', cleanup);
    window.focus();
    window.print();
    setTimeout(cleanup, 60000);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-slate-900/70 backdrop-blur-xs print:p-0 print:m-0 print:bg-transparent print:static print:block">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[96vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:p-0 print:m-0 print:max-h-none print:w-auto print:block">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">
                  {isMultiRecord
                    ? `Cetak Massal Label Karantina CPKB (${effectiveRecords.length} Item GRN)`
                    : 'Cetak Label Karantina CPKB (Thermal 100×100 mm)'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                  Status: Karantina Masuk
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Format presisi untuk Printer Thermal Roll Label 100×100 mm (Direct Print Tanpa Pop-up Terblokir).
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Paper Roll Indicator Banner */}
        <div className="bg-amber-100 border-b border-amber-300 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 shrink-0 no-print">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-amber-600 inline-block shadow-xs shrink-0" />
            <span>
              <strong>Kertas Label Thermal:</strong> Gunakan <strong>Roll KUNING (Yellow Paper)</strong> • Ukuran <strong>100 × 100 mm</strong>
            </span>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-200/90 border border-amber-400 text-amber-950 font-mono">
            Total {labelItems.length} Lembar Label Siap Cetak
          </span>
        </div>

        {/* Toolbar & Options */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {isMultiRecord ? (
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">Mode Batch:</span>
                <div className="inline-flex bg-white rounded-xl border border-slate-200 p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setBatchContainerMode('all_containers')}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      batchContainerMode === 'all_containers'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua Koli ({effectiveRecords.reduce((sum, r) => sum + (r.containerCount || 1), 0)} Wadah)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchContainerMode('one_per_record')}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      batchContainerMode === 'one_per_record'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1 Label Induk per Lot ({effectiveRecords.length} Label)
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700">Mode Wadah:</span>
                <div className="inline-flex bg-white rounded-xl border border-slate-200 p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setContainerRange('all')}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      containerRange === 'all'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({totalContainersFirst} Wadah)
                  </button>
                  <button
                    type="button"
                    onClick={() => setContainerRange('single')}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      containerRange === 'single'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1 Wadah
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContainerRange('custom');
                      setCustomRangeStart(1);
                      setCustomRangeEnd(totalContainersFirst);
                    }}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      containerRange === 'custom'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Rentang Custom
                  </button>
                </div>

                {containerRange === 'single' && totalContainersFirst > 1 && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="text-slate-500">Wadah ke:</span>
                    <select
                      value={selectedContainerNum}
                      onChange={(e) => setSelectedContainerNum(Number(e.target.value))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                    >
                      {Array.from({ length: totalContainersFirst }, (_, i) => i + 1).map((num) => (
                        <option key={num} value={num}>
                          Wadah {num} / {totalContainersFirst}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {containerRange === 'custom' && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="text-slate-500">Dari:</span>
                    <input
                      type="number"
                      min={1}
                      max={totalContainersFirst}
                      value={customRangeStart}
                      onChange={(e) => setCustomRangeStart(Number(e.target.value) || 1)}
                      className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                    />
                    <span className="text-slate-500">s/d:</span>
                    <input
                      type="number"
                      min={customRangeStart}
                      max={totalContainersFirst}
                      value={customRangeEnd}
                      onChange={(e) => setCustomRangeEnd(Number(e.target.value) || totalContainersFirst)}
                      className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Copies Multiplier */}
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span className="font-bold text-slate-700">Rangkap per Wadah:</span>
              <select
                value={copiesCount}
                onChange={(e) => setCopiesCount(Number(e.target.value) || 1)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 cursor-pointer"
              >
                <option value={1}>1 Lembar (Standar)</option>
                <option value={2}>2 Lembar (Depan & Tutup)</option>
                <option value={3}>3 Lembar</option>
                <option value={4}>4 Lembar</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Sekarang ({labelItems.length} Label)</span>
            </button>
          </div>
        </div>

        {/* Modal Body / Label Preview */}
        <div className="p-6 overflow-y-auto bg-slate-200/70 space-y-6 flex-1 flex flex-col items-center print:p-0 print:m-0 print:bg-transparent print:overflow-visible print:block">
          <div className="text-xs text-slate-600 font-medium no-print">
            Pratinjau fisik label stiker roll kuning ({labelItems.length} Label Thermal 100mm × 100mm):
          </div>

          {/* Printable Container Target for Direct Window Print */}
          <div id="quarantine-label-printable" className="space-y-6 w-full flex flex-col items-center">
            {labelItems.map((item, itemIdx) => {
              const rec = item.record;
              const formattedQty = Number(rec.quantityReceived || 0).toLocaleString('id-ID', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              });

              return (
                <div key={`${rec.id}-${item.containerIndex}-${item.copyIndex}-${itemIdx}`} className="print-page-wrapper">
                  <div
                    className="thermal-label-page w-[100mm] h-[100mm] min-w-[100mm] min-h-[100mm] max-w-[100mm] max-h-[100mm] bg-[#FEF08A] text-black border-2 border-black rounded-lg p-[3mm] shadow-lg flex flex-col justify-between overflow-hidden select-none print:shadow-none print:rounded-none print:border print:border-black print:bg-transparent"
                    style={{ boxSizing: 'border-box' }}
                  >
                    {/* 1. Header CPKB (Perusahaan & Kode Form) */}
                    <div className="flex items-center justify-between border-b-2 border-black pb-1">
                      <div className="flex items-center gap-2">
                        <img
                          src="/logo.png"
                          alt="Logo PT. Larassanti Makmur Sejahtera"
                          className="h-7 w-auto max-w-[42px] object-contain filter brightness-0 shrink-0 select-none print:brightness-0"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <h1 className="font-black text-[11px] tracking-tight uppercase leading-none text-black">
                            PT. LARASSANTI MAKMUR SEJAHTERA
                          </h1>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-[8.5px] font-black border-1.5 border-black px-1.5 py-0.5 rounded-xs shrink-0 whitespace-nowrap inline-block bg-white/90 text-black shadow-2xs">
                          L-DQC-002-01
                        </span>
                      </div>
                    </div>

                    {/* 2. Status Banner (Inverted High-Contrast Black Bar with Material Code & Type) */}
                    <div className="bg-black text-white px-2.5 py-1 rounded-xs flex items-center justify-between my-1">
                      <span className="font-black text-[10px] tracking-wider uppercase flex items-center gap-1.5 shrink-0">
                        <span>⚠</span>
                        <span>STATUS: KARANTINA</span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono bg-white text-black font-black text-[8.5px] px-1.5 py-0.5 rounded-xs leading-none border border-black/80 print:bg-white print:text-black print:border-black print:font-black">
                          {rec.materialCode}
                        </span>
                        <span className="bg-[#FEF08A] text-black font-black text-[8px] px-1.5 py-0.5 rounded-xs uppercase leading-none border border-black/60 print:bg-white print:text-black print:border-black print:font-black">
                          {rec.materialType === 'raw' ? 'Bahan Baku' : 'Bahan Kemas'}
                        </span>
                      </div>
                    </div>

                    {/* 3. Material Identity Box (Fixed 2 lines) */}
                    <div className="border border-black/40 rounded-xs px-2 py-1 bg-white/30 min-h-[38px] max-h-[38px] flex items-center">
                      <div className="font-black text-[11.5px] leading-tight uppercase text-black line-clamp-2 break-words w-full">
                        {rec.materialName}
                      </div>
                    </div>

                    {/* 4. Middle Section: Specs Grid (Left) + Large QR Code (Right) */}
                    <div className="flex items-stretch gap-2 my-1 flex-1 min-h-0">
                      {/* Left Column: Data Grid */}
                      <div className="flex-1 flex flex-col justify-between text-[8px]">
                        <div className="space-y-1">
                          <div className="flex justify-between border-b border-black/20 pb-0.5">
                            <span className="font-bold text-black/70">No. GRN:</span>
                            <span className="font-mono font-black text-[9px] text-black">{rec.grnNumber}</span>
                          </div>
                          <div className="flex justify-between border-b border-black/20 pb-0.5">
                            <span className="font-bold text-black/70">Tgl Kedatangan:</span>
                            <span className="font-bold text-black">{rec.receivedDate}</span>
                          </div>
                          <div className="flex justify-between border-b border-black/20 pb-0.5">
                            <span className="font-bold text-black/70">Produsen:</span>
                            <span className="font-bold text-black truncate max-w-[110px]">{rec.manufacturer || '-'}</span>
                          </div>
                          <div className="flex justify-between border-b border-black/20 pb-0.5">
                            <span className="font-bold text-black/70">Batch / Lot Vendor:</span>
                            <span className="font-mono font-bold text-black truncate max-w-[110px]">{rec.batchNumber || '-'}</span>
                          </div>
                          {rec.materialType !== 'packaging' && (
                            <div className="flex justify-between border-b border-black/20 pb-0.5">
                              <span className="font-bold text-black/70">Tgl Kedaluwarsa:</span>
                              <span className="font-bold text-black">{rec.expiryDate || '-'}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-b border-black/20 pb-0.5">
                            <span className="font-bold text-black/70">Total Kuantitas:</span>
                            <span className="font-mono font-black text-[9.5px] text-black">{formattedQty} {rec.unit}</span>
                          </div>
                        </div>

                        <div className="text-[7.5px] text-black/80 pt-0.5">
                          <span className="font-bold">Simpan: </span>
                          <span>{rec.storageConditions || '15-30°C Ruang Terkendali, Kering & Terlindung Cahaya'}</span>
                        </div>
                      </div>

                      {/* Right Column: High-Visibility Large QR Code */}
                      <div className="w-[32mm] shrink-0 border-l border-black/40 pl-2 flex flex-col items-center justify-center">
                        <div className="p-1 bg-white border border-black rounded-xs">
                          <QrCodeBadge
                            value={`GRN|NO:${rec.grnNumber}|W:${item.containerIndex}/${item.totalContainers}|CODE:${rec.materialCode}|BATCH:${rec.batchNumber || '-'}`}
                            size={92}
                            className="rounded-none"
                          />
                        </div>
                        <span className="font-mono text-[8px] font-black tracking-tight text-center mt-1 block leading-none text-black">
                          {rec.grnNumber}-W{item.containerIndex}
                        </span>
                        <span className="text-[7px] font-bold uppercase tracking-wider text-center block mt-0.5 text-black/80 leading-none">
                          SCAN UNTUK SAMPLING
                        </span>
                      </div>
                    </div>

                    {/* 5. Koli / Wadah Highlight Bar (2 Lines) */}
                    <div className="bg-black text-white px-2.5 py-1 rounded-xs flex flex-col justify-center gap-0.5 mb-1">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-[10px] tracking-wider uppercase leading-none">
                          KOLI {item.containerIndex} DARI {item.totalContainers}
                        </span>
                        {item.copyIndex > 1 && (
                          <span className="font-mono font-bold text-[7.5px] bg-white/20 px-1 py-0.5 rounded-2xs leading-none uppercase">
                            Rangkap #{item.copyIndex}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[8.5px] font-mono leading-none pt-0.5 border-t border-white/20">
                        <span className="font-bold text-white/80">KEMASAN:</span>
                        <span className="font-black text-white uppercase">{rec.containerType || '-'}</span>
                      </div>
                    </div>

                    {/* 6. Footer Signatures Row */}
                    <div className="border-t-2 border-black pt-1 grid grid-cols-3 gap-1.5 text-center">
                      <div className="border border-black/60 rounded-xs py-1 px-1 bg-white/40">
                        <span className="block text-[7px] text-black/70 font-bold uppercase leading-none">
                          Penerima Gudang
                        </span>
                        <span className="font-serif italic font-bold text-[9px] truncate block leading-tight text-black mt-1">
                          {rec.receivedBy || 'Staf Gudang'}
                        </span>
                        <span className="block text-[6.5px] text-black/60 border-t border-black/20 pt-0.5 mt-0.5">
                          Paraf & Tanggal Terima
                        </span>
                      </div>

                      <div className="border border-black/60 rounded-xs py-1 px-1 bg-white/40">
                        <span className="block text-[7px] text-black/70 font-bold uppercase leading-none">
                          Petugas Sampling
                        </span>
                        <span className="font-serif italic font-bold text-[9px] truncate block leading-tight text-black mt-1">
                          {rec.sampledBy || '....................'}
                        </span>
                        <span className="block text-[6.5px] text-black/60 border-t border-black/20 pt-0.5 mt-0.5">
                          Paraf Petugas QC
                        </span>
                      </div>

                      <div className="border border-black/60 rounded-xs py-1 px-1 bg-white/40">
                        <span className="block text-[7px] text-black/70 font-bold uppercase leading-none">
                          Tgl Pengambilan Sampel
                        </span>
                        <span className="font-mono font-bold text-[8.5px] truncate block leading-tight text-black mt-1">
                          {rec.samplingDateTime ? rec.samplingDateTime.slice(0, 10) : '....................'}
                        </span>
                        <span className="block text-[6.5px] text-black/60 border-t border-black/20 pt-0.5 mt-0.5">
                          Format: YYYY-MM-DD
                        </span>
                      </div>
                    </div>

                    {/* 7. Bottom Footnote */}
                    <div className="text-[6.5px] text-black/70 text-center font-bold tracking-tight uppercase pt-0.5">
                      FORM PENANDAAN MUTU STANDAR CPKB • PT. LARASSANTI MAKMUR SEJAHTERA • TAHAP 1
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0 no-print">
          <p className="text-xs text-slate-500">
            *Tempelkan stiker kuning 100×100 mm ini pada setiap koli/wadah saat barang tiba di area karantina gudang.
          </p>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Thermal ({labelItems.length} Label)</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
