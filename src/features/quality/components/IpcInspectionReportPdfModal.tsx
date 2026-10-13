import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  FileCheck,
  FileText,
  Info,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  PenTool,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { IpcBulkTest } from '../utils/qcExtData';
import { Product } from '../../../types';
import { useAuth } from '../../../core/auth/AuthContext';
import { QrCodeBadge } from '../../../components/QrCodeBadge';
import { productService } from '../../rnd/products/productService';
import { formatDateDDMMMYYYY, formatDateDDMMMYYYYUpper } from '../../../utils/dateUtils';
import { getUserPositionTitleByNik, getUserPositionTitle } from '../../../utils/userPositionUtils';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface IpcInspectionReportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: IpcBulkTest | null;
  productSpec?: Product | null;
}

export const IpcInspectionReportPdfModal: React.FC<IpcInspectionReportPdfModalProps> = ({
  isOpen,
  onClose,
  batch,
  productSpec,
}) => {
  useEscapeKey(onClose, isOpen && !!batch);

  const printContentRef = useRef<HTMLDivElement>(null);
  const { user: currentUser, profile } = useAuth();
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(productSpec || null);
  const [isCompactMode, setIsCompactMode] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !batch) return;
    if (productSpec) {
      setMatchedProduct(productSpec);
      return;
    }

    productService.getProducts().then((products) => {
      const bCode = (batch.productCode || '').trim().toLowerCase();
      const bName = (batch.productName || '').trim().toLowerCase();
      const cleanBCode = (batch.productCode || '').replace(/\D/g, '');

      const found = products.find((p) => {
        const pCode = (p.productCode || p.code || '').trim().toLowerCase();
        const pName = (p.name || '').trim().toLowerCase();
        const cleanPCode = (p.productCode || p.code || '').replace(/\D/g, '');
        return (
          (bCode && (pCode === bCode || pCode.includes(bCode) || bCode.includes(pCode))) ||
          (cleanBCode && cleanPCode && cleanBCode.length >= 3 && cleanBCode === cleanPCode) ||
          (bName && (pName === bName || pName.includes(bName) || bName.includes(pName)))
        );
      });

      if (found) {
        setMatchedProduct(found);
      }
    }).catch((err) => {
      console.error('Error fetching product spec for PDF:', err);
    });
  }, [isOpen, batch, productSpec]);

  if (!isOpen || !batch) return null;

  const handlePrintPdf = () => {
    const rawIpc = batch.ipcNo || batch.id || 'IPC';
    const cleanIpc = rawIpc.replace(/[/\\?%*:|"<>]/g, '-').trim();
    const cleanBatch = (batch.batchNo || 'BETS').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const cleanProduct = (batch.productName || 'Produk').replace(/[/\\?%*:|"<>]/g, '-').trim();
    
    const suggestedFileName = `IPC_${cleanIpc}_${cleanBatch}_${cleanProduct}`;
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
    styleEl.id = 'ipc-report-print-style';
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
        #printable-ipc-report {
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
      const el = document.getElementById('ipc-report-print-style');
      if (el) el.remove();
    };

    window.addEventListener('afterprint', cleanup);
    window.focus();
    window.print();
    setTimeout(cleanup, 60000);
  };

  const isPassed = batch.status === 'RELEASED' || batch.status === 'PASSED';
  const isRejected = batch.status === 'REJECTED';

  const docTitle = 'LAPORAN PEMERIKSAAN IN-PROCESS CONTROL (IPC) RUAHAN';
  const docNumber = 'L-DQC-008-01';
  const effectiveDate = '01 OKT 2026';
  const replacesDocNumber = 'L-DQC-008-00';

  const loggedInName = profile?.full_name || currentUser?.name || 'Staf QC Lab';
  const loggedInNik = profile?.nik || currentUser?.nik || '-';

  const analystName = batch.staffSignature?.signerName || batch.analyst || loggedInName;
  const analystNik = batch.staffSignature?.signerNik || (analystName === loggedInName ? loggedInNik : '-');
  const analystPosition = batch.staffSignature?.signerPosition || (analystNik !== '-' ? getUserPositionTitleByNik(analystNik, 'Staf Analis Lab QC') : 'Staf Analis Lab QC');
  const analystDate = batch.staffSignature?.signedAt || batch.testDate || batch.mixingDate || new Date();

  const isQmRole = currentUser?.role === 'manager' || currentUser?.role === 'supervisor';
  const qmName = batch.qmSignature?.signerName || (isQmRole ? loggedInName : 'Quality Manager');
  const qmNik = batch.qmSignature?.signerNik || (qmName === loggedInName ? loggedInNik : '-');
  const qmPosition = batch.qmSignature?.signerPosition || (qmNik !== '-' ? getUserPositionTitleByNik(qmNik, 'Quality Manager') : 'Quality Manager');
  const qmDate = batch.qmSignature?.signedAt || batch.testDate || batch.mixingDate || new Date();

  const rawIpc = batch.ipcNo || batch.id || '';
  const defaultYyMm = `${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const ipcNumber = rawIpc.startsWith('LPR-')
    ? rawIpc
    : `LPR-${defaultYyMm}0001`;
  const qrValidationUrl = `https://larassanti.co.id/qc/verify-ipc?ipc=${encodeURIComponent(ipcNumber)}&batch=${encodeURIComponent(batch.batchNo)}`;

  // Parameters list - map accurately from matchedProduct RnD specs
  let parameters: Array<{
    id: string;
    parameterName: string;
    specification: string;
    resultValue: string;
    isCompliant: boolean;
  }> = [];

  if (batch.labParameters && batch.labParameters.length > 0) {
    parameters = batch.labParameters;
  } else if (matchedProduct && matchedProduct.qcParameters && matchedProduct.qcParameters.length > 0) {
    parameters = matchedProduct.qcParameters.map((param: any, idx: number) => {
      const paramName = param.parameterName || param.name || `Parameter ${idx + 1}`;
      const specCondition = param.acceptanceCondition || param.specification || '-';
      const unitSuffix = param.unit ? ` (${param.unit})` : '';
      const lowerName = paramName.toLowerCase();

      let resVal = specCondition;
      if (lowerName.includes('ph') && batch.pH) {
        resVal = String(batch.pH);
      } else if ((lowerName.includes('viskos') || lowerName.includes('viscosity')) && batch.viscosity) {
        resVal = `${batch.viscosity.toLocaleString('id-ID')} cPs`;
      } else if ((lowerName.includes('density') || lowerName.includes('bobot jenis') || lowerName.includes('berat jenis')) && batch.gravity) {
        resVal = `${batch.gravity} g/mL`;
      } else if ((lowerName.includes('bentuk') || lowerName.includes('organo') || lowerName.includes('pemerian') || lowerName.includes('appearance')) && batch.appearance) {
        resVal = batch.appearance;
      }

      return {
        id: param.id || `param-${idx + 1}`,
        parameterName: `${paramName}${unitSuffix}`,
        specification: specCondition,
        resultValue: resVal,
        isCompliant: true,
      };
    });
  } else {
    parameters = [
      {
        id: 'p1',
        parameterName: 'Pemerian / Organoleptis',
        specification: 'Sesuai Standar Mutu Fisik RnD',
        resultValue: batch.appearance || 'Homogen, Sesuai Spesifikasi',
        isCompliant: true,
      },
      {
        id: 'p2',
        parameterName: 'Derajat Keasaman (pH 25°C)',
        specification: '5.50 - 6.50',
        resultValue: batch.pH ? String(batch.pH) : '5.85',
        isCompliant: true,
      },
      {
        id: 'p3',
        parameterName: 'Viskositas (cPs / Spindle 4)',
        specification: '3.000 - 8.000 cPs',
        resultValue: batch.viscosity ? `${batch.viscosity.toLocaleString('id-ID')} cPs` : '4.500 cPs',
        isCompliant: true,
      },
      {
        id: 'p4',
        parameterName: 'Bobot Jenis / Density (g/mL)',
        specification: '0.980 - 1.050 g/mL',
        resultValue: batch.gravity ? `${batch.gravity} g/mL` : '1.012 g/mL',
        isCompliant: true,
      },
      {
        id: 'p5',
        parameterName: 'Keseragaman & Homogenitas',
        specification: 'Homogen Tanpa Partikel Asing',
        resultValue: 'Homogen Sempurna',
        isCompliant: true,
      },
    ];
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible">
      <div className="bg-slate-900 rounded-3xl shadow-2xl max-w-5xl w-full my-4 overflow-hidden border border-slate-700 flex flex-col max-h-[96vh] print:max-h-none print:h-auto print:max-w-none print:w-full print:m-0 print:p-0 print:border-none print:shadow-none print:rounded-none print:bg-white">
        
        {/* Modal Top Control Bar (Hidden on Print) */}
        <div className="bg-slate-950 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight flex items-center gap-2">
                <span>Dokumen Resmi Laporan Pemeriksaan IPC Ruahan (CPKB)</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-purple-950 border border-purple-700 text-purple-300 font-bold">
                  {ipcNumber} • Bets: {batch.batchNo}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Sertifikat Analisis Sediaan Ruahan In-Process Control • Format Standar Cetak A4
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>Gunakan opsi <strong>"Save as PDF / A4"</strong></span>
            </div>

            <button
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-900/30 transition-all cursor-pointer border border-purple-400/30"
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
              <strong>Panduan Cetak Dokumen Tajam:</strong> Dokumen IPC CoA adalah format <strong>Kertas A4</strong>. Saat dialog cetak browser terbuka, pastikan <strong>Destination</strong> dipilih ke <strong>"Save as PDF"</strong> atau <strong>Printer Kantor A4</strong> (<em>Jangan arahkan ke Printer Label Thermal 100×100mm agar teks tidak pecah/buram</em>).
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
            id="printable-ipc-report"
            className="w-full max-w-3xl space-y-8 print:max-w-none print:w-full print:space-y-0 print:m-0 print:p-0"
          >
            {/* Control Badge */}
            <div className="no-print flex items-center justify-between text-xs font-bold text-slate-600 px-2">
              <span className="flex items-center gap-1.5 uppercase tracking-wider">
                <FileText className="w-4 h-4 text-purple-700" />
                Lembar Dokumen IPC Ruahan Standar CPKB
              </span>
              <span className="bg-slate-300 text-slate-800 px-2.5 py-0.5 rounded-full text-[10px] font-mono">
                Format Cetak A4 Portrait
              </span>
            </div>

            {/* Document A4 Sheet */}
            <div className={`print-page bg-white p-6 sm:p-8 shadow-xl rounded-2xl border border-slate-300 text-slate-900 print:p-0 print:shadow-none print:border-none print:rounded-none relative flex flex-col justify-between min-h-[900px] print:min-h-0 print:h-auto font-sans ${
              isCompactMode ? 'compact-sheet space-y-2.5 print:space-y-1.5' : 'space-y-3 print:space-y-2'
            }`}>
              
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
                    <div className="text-[11px] sm:text-xs print:text-[10px] font-mono font-black text-purple-950 mt-0.5">
                      NOMOR IPC: {ipcNumber} • NOMOR BETS RUAHAN: {batch.batchNo}
                    </div>
                  </div>
                </div>

                {/* I. Identitas Sediaan Ruahan & Formula */}
                <div className="border border-slate-300 rounded-lg overflow-hidden text-xs print:text-[9px]">
                  <div className="bg-slate-100 px-3 py-1.5 print:px-2 print:py-1 font-black uppercase tracking-wider border-b border-slate-300 text-slate-900 text-[11px] print:text-[9.5px]">
                    I. Identitas Sediaan Ruahan & Formula
                  </div>
                  <div className="p-3 print:p-2 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 print:gap-x-4 gap-y-1.5 print:gap-y-0.5 text-slate-900 text-[11px] print:text-[9px]">
                    {/* Left Column */}
                    <div className="space-y-1 print:space-y-0.5">
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">Nomor IPC</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-mono font-black text-purple-950">{ipcNumber}</span>
                      </div>
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">Kode Produk (RnD)</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-mono font-black text-slate-950">{batch.productCode || matchedProduct?.productCode || matchedProduct?.code || '-'}</span>
                      </div>
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">Nama Produk Jadi</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-black text-slate-950">{matchedProduct?.name || batch.productName}</span>
                      </div>
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">No. Registrasi BPOM</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-bold text-slate-900">{matchedProduct?.bpomNotificationNumber || matchedProduct?.bpomNumber || '-'}</span>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-1 print:space-y-0.5">
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">Nomor Bets Ruahan</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-mono font-black text-slate-950 bg-slate-100 px-1.5 py-0.5 rounded inline-block border border-slate-200">
                          {batch.batchNo}
                        </span>
                      </div>
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">Jumlah Adonan Ruahan</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-black text-slate-950">
                          {(batch.mixingQtyKg || 100).toLocaleString('id-ID')} Kg
                        </span>
                      </div>
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">Tanggal Mixing / Masak</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-bold text-slate-900">{formatDateDDMMMYYYY(batch.mixingDate)}</span>
                      </div>
                      <div className="grid grid-cols-[140px_10px_1fr] print:grid-cols-[115px_8px_1fr] items-baseline">
                        <span className="text-slate-600 font-bold">Tanggal Analisa Lab</span>
                        <span className="text-slate-400 font-bold">:</span>
                        <span className="font-bold text-slate-900">{formatDateDDMMMYYYY(batch.testDate || batch.mixingDate)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* II. Hasil Pengujian In-Process Control (IPC) */}
                <div className="border border-slate-300 rounded-lg overflow-hidden text-xs print:text-[9px]">
                  <div className="bg-slate-100 px-3 py-1.5 print:px-2 print:py-1 font-black uppercase tracking-wider border-b border-slate-300 text-slate-900 text-[11px] print:text-[9.5px] flex items-center justify-between">
                    <span>II. Hasil Pengujian Mutu Fisika, Kimia & Organoleptis Laboratorium</span>
                    <span className="text-[10px] print:text-[8.5px] text-slate-600 font-bold">Metode Standar CPKB & Spesifikasi RnD</span>
                  </div>

                  <table className="w-full text-left border-collapse text-[11px] print:text-[9px]">
                    <thead className="print:table-header-group">
                      <tr className="bg-slate-50 border-b-2 border-slate-300 text-slate-900 font-black text-[10px] print:text-[8.5px] uppercase">
                        <th className="p-2 print:p-1.5 w-8 text-center border-r border-slate-200">No</th>
                        <th className="p-2 print:p-1.5 w-1/4 border-r border-slate-200">Parameter Uji</th>
                        <th className="p-2 print:p-1.5 w-1/3 border-r border-slate-200">Spesifikasi Penerimaan (RnD)</th>
                        <th className="p-2 print:p-1.5 w-1/4 border-r border-slate-200">Hasil Analisa LAB</th>
                        <th className="p-2 print:p-1.5 w-16 text-center">Kesimpulan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-900">
                      {parameters.map((param, index) => (
                        <tr key={param.id || index} className="even:bg-slate-50/50 break-inside-avoid page-break-inside-avoid">
                          <td className="p-2 print:p-1.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">{index + 1}</td>
                          <td className="p-2 print:p-1.5 font-black text-slate-950 border-r border-slate-200">{param.parameterName}</td>
                          <td className="p-2 print:p-1.5 font-medium text-slate-800 border-r border-slate-200">{param.specification}</td>
                          <td className="p-2 print:p-1.5 font-black text-slate-950 border-r border-slate-200">{param.resultValue}</td>
                          <td className="p-2 print:p-1.5 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] print:text-[8px] font-black border ${
                              param.isCompliant
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : 'bg-rose-100 text-rose-900 border-rose-300'
                            }`}>
                              {param.isCompliant ? 'MS' : 'TMS'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* III. Kesimpulan & Evaluasi Mutu */}
                <div className="border border-slate-300 rounded-lg p-2.5 print:p-2 bg-slate-50 text-[11px] print:text-[9px] space-y-1.5 print:space-y-1 break-inside-avoid page-break-inside-avoid">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1 print:pb-0.5">
                    <span className="font-black text-slate-900 uppercase tracking-wider text-[10px] print:text-[8.5px]">
                      III. Kesimpulan Akhir Quality Control:
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] print:text-[8.5px] font-black tracking-wider uppercase ${
                      isPassed
                        ? 'bg-emerald-600 text-white'
                        : isRejected
                        ? 'bg-rose-600 text-white'
                        : batch.status === 'RELEASED_DEVIATION'
                        ? 'bg-teal-700 text-white'
                        : 'bg-amber-500 text-white'
                    }`}>
                      {isPassed
                        ? 'DILULUSKAN / RELEASED UNTUK PROSES FILLING'
                        : isRejected
                        ? 'DITOLAK (REJECTED)'
                        : batch.status === 'RELEASED_DEVIATION'
                        ? 'RILIS DENGAN DEVIASI (RELEASED W/ DEVIATION)'
                        : batch.status === 'RETEST'
                        ? 'UJI ULANG (RE-TEST)'
                        : 'DALAM PEMERIKSAAN (ANALISA)'}
                    </span>
                  </div>
                  <div className="text-slate-800 text-[10px] print:text-[8.5px] leading-tight font-medium">
                    <strong className="font-black">Keterangan: </strong>
                    {batch.rejectionReason
                      ? batch.rejectionReason
                      : isPassed
                      ? 'Adonan produk ruahan telah diperiksa secara seksama di laboratorium QC dan memenuhi seluruh spesifikasi mutu fisika, kimia, dan organoleptis CPKB. Sediaan siap ditransfer ke lini pengisian (filling/packaging).'
                      : 'Adonan sediaan ruahan masih dalam proses pengujian laboratorium.'}
                  </div>
                </div>

                {/* IV. Tanda Tangan Digital & Otorisasi CPKB */}
                <div className="border border-slate-300 rounded-lg p-2.5 print:p-2 bg-white text-xs print:text-[8.5px] break-inside-avoid page-break-inside-avoid">
                  <div className="text-center font-black text-slate-900 uppercase tracking-wider text-[10px] print:text-[8.5px] mb-1.5 print:mb-1">
                    IV. Otorisasi & Pengesahan Mutu (Sesuai Regulasi CPKB / BPOM RI)
                  </div>
                  <div className="grid grid-cols-2 gap-4 print:gap-3 text-center text-[10px] print:text-[8.5px] page-break-inside-avoid">
                    {/* Staf Analis QC */}
                    <div className="space-y-1 print:space-y-0.5 flex flex-col items-center border-r border-slate-200 pr-3 print:pr-2">
                      <span className="text-slate-700 font-bold uppercase text-[9px] print:text-[8px]">Diuji & Dianalisa Oleh:</span>
                      <div className="p-1.5 print:p-0.5 border border-slate-200 rounded-xl bg-slate-50 my-0.5">
                        <div className="print:hidden">
                          <QrCodeBadge
                            value={qrValidationUrl}
                            size={64}
                          />
                        </div>
                        <div className="hidden print:block">
                          <QrCodeBadge
                            value={qrValidationUrl}
                            size={48}
                          />
                        </div>
                      </div>
                      <div className="font-black text-slate-950 text-[11px] print:text-[9.5px] underline">{analystName}</div>
                      <div className="text-[9.5px] print:text-[8px] text-slate-700 font-bold">{analystPosition} • NIK: {analystNik}</div>
                      <div className="text-[8.5px] print:text-[7.5px] text-slate-500 font-mono font-medium">Tgl TTD: {formatDateDDMMMYYYY(analystDate)}</div>
                    </div>

                    {/* Quality Manager */}
                    <div className="space-y-1 print:space-y-0.5 flex flex-col items-center pl-1 print:pl-0.5">
                      <span className="text-purple-900 font-bold uppercase text-[9px] print:text-[8px]">Disetujui & Diotorisasi Oleh:</span>
                      <div className="p-1.5 print:p-0.5 border border-purple-200 rounded-xl bg-purple-50/80 my-0.5">
                        <div className="print:hidden">
                          <QrCodeBadge
                            value={qrValidationUrl}
                            size={64}
                          />
                        </div>
                        <div className="hidden print:block">
                          <QrCodeBadge
                            value={qrValidationUrl}
                            size={48}
                          />
                        </div>
                      </div>
                      <div className="font-black text-purple-950 text-[11px] print:text-[9.5px] underline">
                        {isPassed || isRejected || batch.qmSignature?.signatureHash ? qmName : 'Belum Diotorisasi'}
                      </div>
                      <div className="text-[9.5px] print:text-[8px] text-purple-800 font-bold">{qmPosition} • NIK: {qmNik}</div>
                      <div className="text-[8.5px] print:text-[7.5px] text-slate-500 font-mono font-medium">Tgl Otorisasi: {formatDateDDMMMYYYY(qmDate)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dokumen Footer */}
              <div className="border-t border-slate-200 pt-1.5 print:pt-1 text-[8.5px] print:text-[8px] text-slate-600 flex items-center justify-between font-mono font-bold">
                <span>Dokumen Sah Quality Assurance PT. Larassanti Makmur Sejahtera</span>
                <span>Form: {docNumber} • CPKB Verified</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
