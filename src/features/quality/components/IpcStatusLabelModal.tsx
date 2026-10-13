import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  ShieldCheck,
  Package,
  Calendar,
  Layers,
  Boxes,
} from 'lucide-react';
import { IpcBulkTest } from '../utils/qcExtData';
import { QrCodeBadge } from '../../../components/QrCodeBadge';
import { Product } from '../../../types';
import { formatDateDDMMMYYYY } from '../../../utils/dateUtils';
import { getUserPositionTitleByNik } from '../../../utils/userPositionUtils';
import { getQrTargetUrl } from '../../../core/utils/qrUrlHelper';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface IpcStatusLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: IpcBulkTest | null;
  productSpec?: Product | null;
  defaultLabelType?: 'QUARANTINE' | 'RELEASED';
  onViewReport?: (batch: IpcBulkTest) => void;
}

export const IpcStatusLabelModal: React.FC<IpcStatusLabelModalProps> = ({
  isOpen,
  onClose,
  batch,
  productSpec,
  defaultLabelType = 'QUARANTINE',
  onViewReport,
}) => {
  useEscapeKey(onClose, isOpen);

  const [activeType, setActiveType] = useState<'QUARANTINE' | 'RELEASED'>(defaultLabelType);
  const [containerCount, setContainerCount] = useState<number>(1);
  const [containerRange, setContainerRange] = useState<'single' | 'all'>('all');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  React.useEffect(() => {
    if (batch) {
      if (batch.status === 'RELEASED') {
        setActiveType('RELEASED');
      } else {
        setActiveType(defaultLabelType);
      }
    }
  }, [batch, defaultLabelType]);

  if (!isOpen || !batch) return null;

  const handlePrint = () => {
    const rawIpc = batch.ipcNo || batch.id || '';
    const defaultYyMm = `${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const cleanIpc = (rawIpc.startsWith('LPR-') ? rawIpc : `LPR-${defaultYyMm}0001`).replace(/[/\\?%*:|"<>]/g, '-').trim();
    const cleanBatch = (batch.batchNo || 'BETS').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const cleanProd = (batch.productName || 'Produk').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const suggestedFileName = `LABEL_IPC_${cleanIpc}_${cleanBatch}_${cleanProd}`;
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
    styleEl.id = 'ipc-label-print-style';
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
        #ipc-labels-printable {
          width: 100mm !important;
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
      const el = document.getElementById('ipc-label-print-style');
      if (el) el.remove();
    };

    window.addEventListener('afterprint', cleanup);
    window.focus();
    window.print();
    setTimeout(cleanup, 60000);
  };

  const isReleased = activeType === 'RELEASED';
  const rawIpc = batch.ipcNo || batch.id || '';
  const defaultYyMm = `${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const ipcNumber = rawIpc.startsWith('LPR-')
    ? rawIpc
    : `LPR-${defaultYyMm}0001`;
  const qrValidationUrl = getQrTargetUrl(
    ipcNumber,
    isReleased ? 'RELEASED' : 'QUARANTINE',
    batch.batchNo
  );

  const theme = isReleased
    ? {
        borderOuter: 'border-emerald-500',
        bgBanner: 'bg-emerald-600',
        textBanner: 'text-white',
        borderAccent: 'border-emerald-300',
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        containerBg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        btnBg: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20',
        icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
        title: 'STATUS: DILULUSKAN / RELEASE (SEDIAAN RUAHAN)',
        subtitle: '* TELAH DIUJI & MEMENUHI SPESIFIKASI MUTU CPKB - SIAP FILLING / PACKAGING *',
        formCode: 'L-DQC-001-02',
      }
    : {
        borderOuter: 'border-amber-500',
        bgBanner: 'bg-amber-500',
        textBanner: 'text-slate-900',
        borderAccent: 'border-amber-300',
        badgeBg: 'bg-amber-50 text-amber-900 border-amber-300',
        containerBg: 'bg-amber-50 border-amber-200 text-amber-950',
        btnBg: 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20',
        icon: <AlertTriangle className="w-5 h-5 shrink-0" />,
        title: 'STATUS: DALAM KARANTINA (IPC SEDIAAN RUAHAN)',
        subtitle: '* SEDANG DALAM PROSES UJI LAB MUTU CPKB - DILARANG DIISI / DIGUNAKAN *',
        formCode: 'L-DQC-002-02',
      };

  const containerList = containerRange === 'all'
    ? Array.from({ length: Math.max(1, containerCount) }, (_, i) => i + 1)
    : [1];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200 print:p-0 print:m-0 print:bg-transparent print:static print:block">
      <div className="bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full my-4 overflow-hidden border border-slate-700 flex flex-col max-h-[95vh] print:shadow-none print:border-none print:p-0 print:m-0 print:max-h-none print:w-auto print:block">
        
        {/* Modal Top Control Bar */}
        <div className="bg-slate-950 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isReleased ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-amber-500/20 border-amber-500/40 text-amber-400'}`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">
                  Label Status Mutu CPKB - Sediaan Ruahan (Bulk)
                </h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  {ipcNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Format Cetak Label Fisik Wadah / Drum Sediaan Ruahan Sesuai Standar BPOM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Label Type Switcher */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveType('QUARANTINE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !isReleased
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⚠️ Label Karantina (Kuning)
              </button>
              <button
                type="button"
                onClick={() => setActiveType('RELEASED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isReleased
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ✅ Label Rilis (Hijau)
              </button>
            </div>

            <button
              onClick={handlePrint}
              className={`inline-flex items-center gap-2 px-4 py-2 text-white rounded-xl text-xs font-black shadow-lg transition-all cursor-pointer border ${
                isReleased
                  ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 shadow-emerald-900/40'
                  : 'bg-amber-600 hover:bg-amber-500 border-amber-400/30 shadow-amber-900/40'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Label</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Setting Wadah Bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs text-slate-300 no-print">
          <div className="flex items-center gap-4">
            <span className="font-bold flex items-center gap-1.5 text-slate-300">
              <Boxes className="w-4 h-4 text-purple-400" />
              Jumlah Wadah / Drum Ruahan:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                value={containerCount}
                onChange={(e) => setContainerCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-center font-bold text-white text-xs"
              />
              <span className="text-slate-400">Wadah</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">Cetak:</span>
            <button
              type="button"
              onClick={() => setContainerRange('all')}
              className={`px-2.5 py-1 rounded-md font-semibold ${containerRange === 'all' ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Semua Wadah (1-{containerCount})
            </button>
            <button
              type="button"
              onClick={() => setContainerRange('single')}
              className={`px-2.5 py-1 rounded-md font-semibold ${containerRange === 'single' ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Wadah Tunggal Saja
            </button>
          </div>
        </div>

        {/* Printable Labels Canvas */}
        <div className="p-6 overflow-y-auto grow bg-slate-200/90 flex flex-col items-center gap-6">
          <div id="ipc-labels-printable" className="w-full max-w-2xl space-y-6 print:space-y-4">
            {containerList.map((containerNum) => (
              <div
                key={containerNum}
                className={`ipc-label-card bg-white rounded-2xl border-4 ${theme.borderOuter} shadow-xl overflow-hidden print:shadow-none print:m-0 print:break-inside-avoid relative text-slate-900`}
              >
                {/* Header Banner */}
                <div className={`${theme.bgBanner} ${theme.textBanner} px-5 py-3 border-b-2 ${theme.borderAccent}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-black text-sm tracking-wider uppercase">
                      {theme.icon}
                      <span>{theme.title}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-black/20 text-white">
                      Form: {theme.formCode}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold tracking-tight mt-0.5 opacity-90">
                    {theme.subtitle}
                  </p>
                </div>

                {/* Body Content & QR */}
                <div className="p-5 grid grid-cols-[1fr_130px] gap-4 items-center">
                  <div className="space-y-2 text-xs">
                    {/* Company Header */}
                    <div className="border-b border-slate-200 pb-1.5 flex items-center justify-between">
                      <span className="font-black text-slate-900 text-xs uppercase tracking-tight">
                        PT. LARASSANTI MAKMUR SEJAHTERA
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        CPKB GOL. A
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Nomor IPC:</span>
                        <span className="font-mono font-bold text-purple-950 text-xs">{ipcNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Nomor Bets Ruahan:</span>
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded inline-block text-xs">
                          {batch.batchNo}
                        </span>
                      </div>

                      <div className="col-span-2">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Nama Produk:</span>
                        <span className="font-bold text-slate-900 text-xs">{batch.productName}</span>
                        {batch.productCode && (
                          <span className="font-mono text-[10px] text-purple-700 block mt-0.5">
                            Kode: {batch.productCode}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Tanggal Mixing:</span>
                        <span className="font-semibold text-slate-800">{formatDateDDMMMYYYY(batch.mixingDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">{isReleased ? 'Tanggal Rilis:' : 'Tanggal Analisa:'}</span>
                        <span className={`font-semibold ${isReleased ? 'text-emerald-800 font-bold' : 'text-slate-800'}`}>
                          {formatDateDDMMMYYYY(batch.testDate || batch.mixingDate || new Date())}
                        </span>
                      </div>

                      {isReleased && (
                        <div className="col-span-2 bg-emerald-50 border border-emerald-300 rounded-lg p-1.5 flex items-center justify-between">
                          <span className="text-emerald-950 text-[10px] uppercase font-extrabold tracking-tight">
                            Re-test Date (1 Bulan Pasca Rilis):
                          </span>
                          <span className="font-mono font-black text-rose-700 bg-white border border-rose-200 px-2 py-0.5 rounded text-xs">
                            {(() => {
                              try {
                                const baseDate = new Date(batch.testDate || batch.mixingDate || new Date());
                                const retest = new Date(baseDate);
                                retest.setMonth(retest.getMonth() + 1);
                                return formatDateDDMMMYYYY(retest);
                              } catch {
                                return '-';
                              }
                            })()}
                          </span>
                        </div>
                      )}

                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Jumlah Ruahan:</span>
                        <span className="font-bold text-slate-900">{(batch.mixingQtyKg || 100).toLocaleString('id-ID')} Kg</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">No. Wadah:</span>
                        <span className="font-bold text-purple-900 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded inline-block">
                          Wadah {containerNum} dari {containerCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* QR Code Column */}
                  <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <QrCodeBadge
                      url={qrValidationUrl}
                      size={90}
                    />
                    <span className="text-[9px] font-mono text-slate-500 mt-1 font-bold">
                      SCAN QC QR
                    </span>
                    <span className="text-[8px] text-slate-400 font-mono leading-tight">
                      {batch.batchNo}
                    </span>
                  </div>
                </div>

                {/* Footer Signature Strip */}
                <div className="bg-slate-50 border-t border-slate-200 px-5 py-2 flex items-center justify-between text-[10px]">
                  <div className="text-slate-600">
                    <span className="text-slate-400">Analis QC: </span>
                    <strong>{batch.analyst || 'Staf QC Lab'}</strong>
                  </div>
                  <div className="text-slate-600">
                    <span className="text-slate-400">{isReleased ? 'Diotorisasi Oleh: ' : 'Penanggung Jawab: '}</span>
                    <strong className={isReleased ? 'text-emerald-800' : 'text-amber-800'}>
                      {isReleased ? `${batch.qmSignature?.signerName || 'Quality Manager'} (${batch.qmSignature?.signerPosition || (batch.qmSignature?.signerNik ? getUserPositionTitleByNik(batch.qmSignature.signerNik) : 'Quality Manager')})` : 'Quality Control Department'}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
