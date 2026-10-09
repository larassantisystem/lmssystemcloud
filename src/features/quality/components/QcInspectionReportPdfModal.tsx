import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  FileCheck,
  QrCode,
  FileText,
  Info,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { QcInspectionReport } from '../types/qcTypes';
import { normalizeLotNumber, getUserJabatan } from '../utils/qcNumbering';
import { useAuth } from '../../../core/auth/AuthContext';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface QcInspectionReportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: QcInspectionReport | null;
}

export const QcInspectionReportPdfModal: React.FC<QcInspectionReportPdfModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  useEscapeKey(onClose, isOpen && !!report);

  const printContentRef = useRef<HTMLDivElement>(null);
  const { user: currentUser } = useAuth();
  
  const parameters = report?.parameters || [];
  const [isCompactMode, setIsCompactMode] = useState<boolean>(parameters.length <= 8);

  if (!isOpen || !report) return null;

  // Staf Analis QC: sesuai nama analis yg login dan mengerjakan
  const analystName =
    report.staffSignature?.signerName && report.staffSignature.signerName !== 'Staf Analis QC'
      ? report.staffSignature.signerName
      : report.sampledBy && report.sampledBy !== 'Staf Analis QC'
      ? report.sampledBy
      : currentUser?.department === 'quality' && currentUser?.role === 'staff'
      ? currentUser.name
      : 'Ayu';

  const analystNik =
    report.staffSignature?.signerNik && report.staffSignature.signerNik !== 'NIK-QC-001'
      ? report.staffSignature.signerNik
      : analystName === currentUser?.name && currentUser?.nik
      ? currentUser.nik
      : analystName === 'Ayu'
      ? 'LMS20001'
      : '-';

  // Jabatan Analis: sesuai jabatan user yang mengerjakan/login
  const analystJabatan =
    report.staffSignature?.signerRole &&
    report.staffSignature.signerRole !== 'Quality Control Analyst / Staff'
      ? report.staffSignature.signerRole
      : currentUser?.department === 'quality'
      ? getUserJabatan(currentUser)
      : 'Staf Analis QC';

  // Quality Manager: sesuai yg memberi otorisasi (hanya Quality Manager saja)
  const qmName =
    report.qmSignature?.signerName &&
    report.qmSignature.signerName !== 'Quality Manager (Apoteker PJ)' &&
    report.qmSignature.signerName !== 'apt. Quality Manager, S.Farm.' &&
    report.qmSignature.signerName !== 'Quality Manager'
      ? report.qmSignature.signerName
      : currentUser?.department === 'quality' && (currentUser?.role === 'manager' || currentUser?.role === 'supervisor')
      ? currentUser.name
      : 'Michael';

  const qmNik =
    report.qmSignature?.signerNik && report.qmSignature.signerNik !== 'NIK-QM-001'
      ? report.qmSignature.signerNik
      : qmName === currentUser?.name && currentUser?.nik
      ? currentUser.nik
      : qmName === 'Michael'
      ? 'LMS20003'
      : '-';

  const handlePrintPdf = () => {
    const rawLot = normalizeLotNumber(report.lotInternalNumber || report.grnNumber || 'LOT');
    const cleanLot = rawLot.replace(/[/\\?%*:|"<>]/g, '-').trim();
    const cleanMaterial = (report.materialName || 'Material').replace(/[/\\?%*:|"<>]/g, '-').trim();
    
    const suggestedFileName = `COA_${cleanLot}_${cleanMaterial}`;
    const previousTitle = document.title;
    document.title = suggestedFileName;

    // Bersihkan sisa state / class cetak label thermal jika ada
    document.body.classList.remove('printing-label');
    const thermalStyles = ['qc-status-label-print-style', 'quarantine-label-print-style', 'ipc-label-print-style'];
    thermalStyles.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    document.body.classList.add('printing-report');
    if (isCompactMode) {
      document.body.classList.add('printing-compact');
    }

    // Suntikkan style khusus A4 resmi beresolusi tinggi (Vektor Murni)
    const styleEl = document.createElement('style');
    styleEl.id = 'qc-report-print-style';
    styleEl.innerHTML = `
      @page {
        size: A4 portrait !important;
        margin: 8mm 10mm 8mm 10mm !important;
      }
      @media print {
        html, body {
          width: 210mm !important;
          background: #ffffff !important;
        }
        #printable-qc-report {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: geometricPrecision !important;
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
      document.body.classList.remove('printing-report');
      document.body.classList.remove('printing-compact');
      const el = document.getElementById('qc-report-print-style');
      if (el) el.remove();
    };

    window.addEventListener('afterprint', cleanup);
    window.focus();
    window.print();
    setTimeout(cleanup, 60000);
  };

  const isPassed = report.status === 'PASSED' || report.status === 'PASSED_WITH_DEVIATION';
  const isRejected = report.status === 'REJECTED';
  const hasDeviation = report.status === 'PASSED_WITH_DEVIATION';

  const isRawMaterial = report.materialType === 'raw';
  const docTitle = isRawMaterial
    ? 'LAPORAN PEMERIKSAAN BAHAN BAKU (INTERNAL COA)'
    : 'LAPORAN PEMERIKSAAN BAHAN KEMAS (PACKAGING COA)';

  const docNumber = isRawMaterial ? 'L-DQC-006-01' : 'L-DQC-007-01';
  const effectiveDate = '01-OKTOBER-2026';
  const replacesDocNumber = isRawMaterial ? 'L-DQC-006-00' : 'L-DQC-007-00';

  const formattedQty = (report.quantityReceived || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible">
      <div className="bg-slate-900 rounded-3xl shadow-2xl max-w-5xl w-full my-4 overflow-hidden border border-slate-700 flex flex-col max-h-[96vh] print:max-h-none print:h-auto print:max-w-none print:w-full print:m-0 print:p-0 print:border-none print:shadow-none print:rounded-none print:bg-white">
        
        {/* Modal Top Control Bar (Hidden on Print) */}
        <div className="bg-slate-950 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight flex items-center gap-2">
                <span>Dokumen Resmi Laporan Pemeriksaan Mutu (CPKB)</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-emerald-950 border border-emerald-700 text-emerald-300 font-bold">
                  {docNumber} • Lot: {normalizeLotNumber(report.lotInternalNumber || report.grnNumber)}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Sertifikat Analisis (Internal CoA) • {parameters.length} Parameter Uji Laboratorium
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Mode Auto-Fit / Multi-Page */}
            <button
              onClick={() => setIsCompactMode(!isCompactMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                isCompactMode
                  ? 'bg-purple-900/60 border-purple-500 text-purple-200 hover:bg-purple-800'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Ganti antara mode muat 1 lembar atau mode standar"
            >
              {isCompactMode ? <Minimize2 className="w-3.5 h-3.5 text-purple-400" /> : <Maximize2 className="w-3.5 h-3.5 text-blue-400" />}
              <span>{isCompactMode ? 'Mode: Auto-Fit (1 Halaman)' : 'Mode: Standar (Aliran Penuh)'}</span>
            </button>

            <button
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-900/30 transition-all cursor-pointer border border-emerald-400/30"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak A4 / Simpan PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Tutup Pratinjau"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Guidance Banner (Pastikan Pilih Printer A4 / Save as PDF) */}
        <div className="bg-amber-950/80 border-b border-amber-600/50 px-5 py-2 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2 shrink-0 no-print">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>
              <strong>Panduan Cetak Dokumen Tajam:</strong> Dokumen CoA adalah format <strong>Kertas A4</strong>. Saat dialog cetak browser terbuka, pastikan <strong>Destination</strong> dipilih ke <strong>"Save as PDF"</strong> atau <strong>Printer Kantor A4</strong> (<em>Jangan arahkan ke Printer Label Thermal 100×100mm agar teks tidak pecah/buram</em>).
            </span>
          </div>
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-black/40 border border-amber-500/40 text-amber-300 shrink-0">
            Standar Kertas: A4 (210 × 297 mm)
          </span>
        </div>

        {/* Printable Document Sheet Container */}
        <div className="p-4 sm:p-8 overflow-y-auto grow bg-slate-200/90 flex flex-col items-center gap-8 print:p-0 print:m-0 print:gap-0 print:bg-white print:overflow-visible print:block">
          
          <div
            ref={printContentRef}
            id="printable-qc-report"
            className={`w-full max-w-3xl bg-white p-6 sm:p-8 shadow-xl rounded-2xl border border-slate-300 text-slate-900 print:max-w-none print:w-full print:p-0 print:shadow-none print:border-none print:rounded-none print:bg-white flex flex-col justify-between font-sans ${
              isCompactMode
                ? 'compact-sheet space-y-2.5 print:space-y-1.5'
                : 'space-y-3.5 print:space-y-2'
            }`}
          >
            {/* ========================================================================= */}
            {/* DOKUMEN RESMI CPKB INTERNAL COA (WARNA RESMI & VEKTOR DEFINISI TINGGI) */}
            {/* ========================================================================= */}
            <div className="space-y-3 print:space-y-2">
              
              {/* Header Perusahaan PT. LARASSANTI MAKMUR SEJAHTERA */}
              <div className="border-b-2 border-slate-950 pb-2.5 print:pb-1.5">
                <div className="flex items-start justify-between gap-4 print:gap-2">
                  <div className="flex items-center gap-3 print:gap-2">
                    <div className="p-1 bg-white rounded-xl border border-slate-300 shrink-0 shadow-2xs flex items-center justify-center">
                      <img
                        src="/logo.png"
                        alt="Logo Larassanti"
                        className="h-11 print:h-9 w-auto max-w-[110px] print:max-w-[90px] object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <h1 className="text-base sm:text-lg print:text-[14px] font-black tracking-tight text-slate-950 uppercase">
                        PT. LARASSANTI MAKMUR SEJAHTERA
                      </h1>
                      <p className="text-[10px] sm:text-[11px] print:text-[8.5px] text-slate-800 font-bold">
                        Industri Kosmetika & Personal Care • Sertifikasi CPKB Golongan A
                      </p>
                      <p className="text-[9px] sm:text-[10px] print:text-[8px] text-slate-700 max-w-md leading-tight mt-0.5 font-medium">
                        Jl. Pembangunan 3 No.38 A, B, C, D, RT.002/RW.001, Batusari, Kec. Batuceper, Kota Tangerang, Banten 15121
                      </p>
                    </div>
                  </div>
                  
                  {/* Kotak Dokumen Kontrol Mutu */}
                  <div className="text-right text-[9px] sm:text-[10px] print:text-[8px] text-slate-900 border border-slate-300 rounded-lg p-2 print:p-1.5 bg-slate-50 shrink-0 font-mono space-y-0.5 leading-tight">
                    <div><span className="font-sans font-semibold text-slate-600">No. Dokumen :</span> <strong className="text-slate-950 font-black">{docNumber}</strong></div>
                    <div><span className="font-sans font-semibold text-slate-600">TANGGAL BERLAKU :</span> <strong className="text-slate-950 font-black">{effectiveDate}</strong></div>
                    <div><span className="font-sans font-semibold text-slate-600">MENGGANTI NO. :</span> <strong className="text-slate-950 font-black">{replacesDocNumber}</strong></div>
                  </div>
                </div>

                <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 border-t border-slate-300 text-center">
                  <h2 className="text-xs sm:text-sm print:text-[12px] font-black uppercase tracking-wider text-slate-950">
                    {docTitle}
                  </h2>
                  <div className="text-[11px] sm:text-xs print:text-[9.5px] font-mono font-black text-emerald-900 mt-0.5">
                    NO. LOT / LAPORAN: {normalizeLotNumber(report.lotInternalNumber || report.grnNumber)}
                  </div>
                </div>
              </div>

              {/* I. Identitas Bahan & Penerimaan (GRN) */}
              <div className="border border-slate-300 rounded-lg overflow-hidden text-xs print:text-[9px]">
                <div className="bg-slate-100 px-3 py-1.5 print:px-2 print:py-1 font-black uppercase tracking-wider border-b border-slate-300 text-slate-900 text-[11px] print:text-[9.5px]">
                  I. Identitas Bahan & Penerimaan (GRN)
                </div>
                <div className="p-3 print:p-2 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 print:gap-x-4 gap-y-1.5 print:gap-y-0.5 text-slate-900 text-[11px] print:text-[9px]">
                  {/* Left Column */}
                  <div className="space-y-1 print:space-y-0.5">
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Kode Material</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-mono font-black text-slate-950">{report.materialCode}</span>
                    </div>
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Nama Bahan</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-black text-slate-950">{report.materialName}</span>
                    </div>
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Produsen</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-bold text-slate-900">{report.manufacturer || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Supplier</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-bold text-slate-900">{report.distributor || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">No. Batch Vendor</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-mono font-black text-slate-950">{report.batchNumberVendor || '-'}</span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-1 print:space-y-0.5">
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">No. Bukti Terima (GRN)</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-mono font-black text-slate-950">{report.grnNumber}</span>
                    </div>
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Tanggal Penerimaan</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-bold text-slate-900">{report.receivedDate || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Tanggal Kedaluwarsa</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-bold text-slate-900">{report.expiryDate || 'N/A'}</span>
                    </div>
                    {isRawMaterial && (
                      <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline bg-emerald-50/70 px-1 py-0.5 rounded border border-emerald-300">
                        <span className="text-emerald-900 font-black">Tanggal Retest (Uji Ulang)</span>
                        <span className="text-emerald-700 font-bold">:</span>
                        <span className="font-black text-emerald-950 font-mono">
                          {report.retestDate || 'N/A (Sesuai ED)'}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Kuantitas Diterima</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-black text-slate-950">{formattedQty} {report.unit}</span>
                    </div>
                    <div className="grid grid-cols-[130px_10px_1fr] print:grid-cols-[110px_8px_1fr] items-baseline">
                      <span className="text-slate-600 font-bold">Jumlah Kemasan</span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-bold text-slate-900">{report.containerCount} {report.containerType}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* II. Metode & Pengambilan Contoh (Sampling) */}
              <div className="border border-slate-300 rounded-lg p-2.5 print:p-2 text-[11px] print:text-[9px] bg-slate-50 space-y-1.5 print:space-y-1">
                <div className="flex justify-between items-center border-b border-slate-200 pb-1 print:pb-0.5">
                  <span className="font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 text-[10px] print:text-[9.5px]">
                    II. Metode & Pengambilan Contoh (Sampling)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 print:grid-cols-4 gap-2 print:gap-1.5 text-slate-800 pt-0.5">
                  <div>
                    <span className="text-slate-600 block text-[10px] print:text-[8px] font-bold">Rencana Sampling (n):</span>
                    <span className="font-black text-slate-950 block text-[11px] print:text-[9px]">
                      {report.samplingInfo?.sampleSizeQuantity || 1} {report.samplingInfo?.sampleUnit || 'wadah'}
                    </span>
                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 font-mono font-black text-[9px] print:text-[8px] border border-emerald-300">
                      {isRawMaterial ? 'n = 1 + √N' : (report.samplingInfo?.samplingStandard || 'MIL-STD-105E Level II')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] print:text-[8px] font-bold">Sampel Diuji Lab:</span>
                    <span className="font-black text-emerald-950 text-[11px] print:text-[9px] block">
                      {report.actualSampleSize !== undefined && report.actualSampleSize !== null
                        ? `${report.actualSampleSize} ${report.actualSampleUnit || (report.materialType === 'raw' ? 'gram' : 'pcs')}`
                        : `${report.samplingInfo?.sampleSizeQuantity || 1} ${report.samplingInfo?.sampleUnit || 'wadah'}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] print:text-[8px] font-bold">Wadah yang Disampling:</span>
                    <span className="font-bold text-slate-950 text-[11px] print:text-[8.5px] block">
                      {report.sampledContainers || `Wadah #1 s/d #${Math.min(report.containerCount, report.samplingInfo?.sampleSizeQuantity || 1)} (Total ${report.containerCount} ${report.containerType})`}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 block text-[10px] print:text-[8px] font-bold">Waktu & Petugas Sampling:</span>
                    <span className="text-slate-900 font-bold text-[11px] print:text-[8.5px] block">
                      {report.samplingDateTime ? new Date(report.samplingDateTime).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : (report.receivedDate || '-')} • {analystName} ({analystJabatan})
                    </span>
                  </div>
                </div>
              </div>

              {/* III. Tabel Hasil Pemeriksaan & Analisis Laboratorium QC (Aliran Alami Penuh) */}
              <div className="border border-slate-300 rounded-lg overflow-hidden text-xs print:text-[9px]">
                <div className="bg-slate-100 px-3 py-1.5 print:px-2 print:py-1 font-black uppercase tracking-wider border-b border-slate-300 text-slate-900 text-[11px] print:text-[9.5px] flex items-center justify-between">
                  <span>III. Hasil Pemeriksaan & Analisis Laboratorium QC</span>
                  <span className="text-[10px] print:text-[8.5px] text-slate-600 font-bold">
                    (Total {parameters.length} Parameter Uji)
                  </span>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead className="print:table-header-group">
                    <tr className="bg-slate-50 border-b border-slate-300 text-slate-900 font-black uppercase text-[10px] print:text-[8.5px]">
                      <th className="p-2 print:p-1.5 w-8 text-center border-r border-slate-200">No</th>
                      <th className="p-2 print:p-1.5 w-1/3 border-r border-slate-200">Parameter Uji</th>
                      <th className="p-2 print:p-1.5 w-1/3 border-r border-slate-200">Spesifikasi Standar</th>
                      <th className="p-2 print:p-1.5 w-1/4 border-r border-slate-200">Hasil Analisa Lab</th>
                      <th className="p-2 print:p-1.5 w-14 text-center">Hasil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px] print:text-[9px] text-slate-900">
                    {parameters.map((param, idx) => (
                      <tr key={param.id || idx} className="hover:bg-slate-50/50 break-inside-avoid page-break-inside-avoid">
                        <td className="p-2 print:p-1.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="p-2 print:p-1.5 font-bold text-slate-950 border-r border-slate-200">
                          {param.parameterName}
                        </td>
                        <td className="p-2 print:p-1.5 text-slate-800 font-medium border-r border-slate-200">
                          {param.specification}
                        </td>
                        <td className="p-2 print:p-1.5 font-black text-slate-950 border-r border-slate-200">
                          {param.resultValue || '-'}
                        </td>
                        <td className="p-2 print:p-1.5 text-center font-black">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] print:text-[8px] font-black border ${
                              param.isCompliant
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : 'bg-red-100 text-red-900 border-red-300'
                            }`}
                          >
                            {param.isCompliant ? 'MS' : 'TMS'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* IV. Kesimpulan & Disposisi Mutu */}
              <div
                className={`border-2 rounded-xl p-3 print:p-2 text-xs print:text-[9px] break-inside-avoid page-break-inside-avoid ${
                  isRejected
                    ? 'border-red-400 bg-red-50/70 text-red-950'
                    : hasDeviation
                    ? 'border-amber-400 bg-amber-50/70 text-amber-950'
                    : 'border-emerald-400 bg-emerald-50/70 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] print:text-[8.5px]">
                      IV. KESIMPULAN & DISPOSISI KELULUSAN MUTU
                    </div>
                    <div
                      className={`text-sm sm:text-base print:text-[11.5px] font-black mt-0.5 ${
                        isRejected
                          ? 'text-red-700'
                          : hasDeviation
                          ? 'text-amber-800'
                          : 'text-emerald-800'
                      }`}
                    >
                      STATUS DISPOSISI:{' '}
                      {isRejected
                        ? 'DITOLAK / REJECT'
                        : hasDeviation
                        ? 'DILULUSKAN BERSYARAT (RELEASE BY DEVIATION)'
                        : 'DILULUSKAN / RELEASE'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] print:text-[8px] text-slate-500 font-bold">TANGGAL OTORISASI</div>
                    <div className="font-black font-mono text-slate-900 text-xs print:text-[9.5px]">
                      {report.qmSignature?.signedAt
                        ? new Date(report.qmSignature.signedAt).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })
                        : new Date().toLocaleDateString('id-ID')}
                    </div>
                  </div>
                </div>

                {report.qmNotes && (
                  <div className="mt-1.5 print:mt-1 pt-1.5 print:pt-1 border-t border-slate-300 text-slate-800 text-[10px] print:text-[8.5px] font-medium">
                    <strong>Catatan Disposisi:</strong> {report.qmNotes}
                  </div>
                )}
              </div>

              {/* V. Blok Dual Digital Signature (Staf Analis & Quality Manager) */}
              <div className="border border-slate-300 rounded-xl p-3 print:p-2 grid grid-cols-2 gap-4 print:gap-3 text-xs print:text-[8.5px] text-slate-900 break-inside-avoid page-break-inside-avoid">
                <div className="space-y-1 print:space-y-0.5 border-r border-slate-200 pr-3 print:pr-2">
                  <div className="font-bold text-slate-700 uppercase tracking-wider text-[9px] print:text-[8px] flex items-center justify-between">
                    <span>{analystJabatan} :</span>
                    <span className="text-[8px] print:text-[7.5px] text-slate-500 font-normal lowercase">(pemeriksa lab)</span>
                  </div>
                  <div className="h-14 print:h-9 flex flex-col justify-center">
                    <div className="font-mono font-black text-emerald-800 text-[10px] print:text-[8.5px]">
                      DIGITALLY SIGNED ELECTRONICALLY
                    </div>
                    <div className="text-[9px] print:text-[8px] font-mono text-slate-600 truncate font-semibold">
                      Hash: {report.staffSignature?.signatureHash || 'SIG-STF-VERIFIED'}
                    </div>
                    <div className="text-[9px] print:text-[7.5px] text-slate-500 font-medium">
                      Waktu: {report.staffSignature?.signedAt ? new Date(report.staffSignature.signedAt).toLocaleString('id-ID') : '-'}
                    </div>
                  </div>
                  <div className="border-t border-slate-300 pt-1 print:pt-0.5">
                    <div className="font-black text-slate-950 text-[11px] print:text-[9.5px]">
                      {analystName}
                    </div>
                    <div className="text-[9px] print:text-[8px] text-slate-700 font-bold font-mono">
                      NIK: {analystNik} • {analystJabatan}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 print:space-y-0.5 pl-1 print:pl-0.5">
                  <div className="font-bold text-slate-700 uppercase tracking-wider text-[9px] print:text-[8px] flex items-center justify-between">
                    <span>Quality Manager :</span>
                    <span className="text-[8px] print:text-[7.5px] text-slate-500 font-normal lowercase">(otorisasi mutu)</span>
                  </div>
                  <div className="h-14 print:h-9 flex flex-col justify-center">
                    {report.qmSignature?.signatureHash ? (
                      <>
                        <div className="font-mono font-black text-blue-900 text-[10px] print:text-[8.5px]">
                          OFFICIALLY AUTHORIZED BY QUALITY MANAGER
                        </div>
                        <div className="text-[9px] print:text-[8px] font-mono text-slate-600 truncate font-semibold">
                          Hash: {report.qmSignature.signatureHash}
                        </div>
                        <div className="text-[9px] print:text-[7.5px] text-slate-500 font-medium">
                          Waktu: {report.qmSignature.signedAt ? new Date(report.qmSignature.signedAt).toLocaleString('id-ID') : '-'}
                        </div>
                      </>
                    ) : (
                      <div className="text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-1 text-[9px] print:text-[8px] font-bold flex items-center justify-center h-full">
                        Menunggu Otorisasi Quality Manager
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-300 pt-1 print:pt-0.5">
                    <div className="font-black text-slate-950 text-[11px] print:text-[9.5px]">
                      {report.qmSignature?.signatureHash ? qmName : (report.status === 'PASSED' || report.status === 'PASSED_WITH_DEVIATION' || report.status === 'REJECTED' ? qmName : 'Belum Diotorisasi')}
                    </div>
                    <div className="text-[9px] print:text-[8px] text-slate-700 font-bold font-mono">
                      NIK: {qmNik} • Quality Manager
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Dokumen Footer */}
            <div className="pt-2 print:pt-1 border-t border-slate-200 flex items-center justify-between text-[9px] print:text-[8.5px] text-slate-600 break-inside-avoid page-break-inside-avoid mt-2 font-bold">
              <div className="flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                <span>VERIFIED CPKB LOT #{normalizeLotNumber(report.lotInternalNumber || report.grnNumber)} • PT. Larassanti Makmur Sejahtera</span>
              </div>
              <div className="font-mono font-bold text-slate-700">
                Sistem Terpadu Pengawasan Mutu CPKB • Dokumen Sah
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>,
    document.body
  );
};
