import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Search,
  AlertTriangle,
  RotateCw,
  Award,
  Lock,
  Boxes,
  Calendar,
  Layers,
  Building2,
  FileBadge,
  FileText,
  Eye,
} from 'lucide-react';
import { qualityService } from '../qualityService';
import { QcInspectionReport } from '../types/qcTypes';
import { QcInspectionReportPdfModal } from './QcInspectionReportPdfModal';
import { normalizeLotNumber } from '../utils/qcNumbering';

interface PublicCoaVerificationPageProps {
  lotQuery: string;
  onExit: () => void;
}

export const PublicCoaVerificationPage: React.FC<PublicCoaVerificationPageProps> = ({
  lotQuery,
  onExit,
}) => {
  const [searchTerm, setSearchTerm] = useState(lotQuery || '');
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<QcInspectionReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<QcInspectionReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Fetch reports directly from Supabase database
  const loadData = async (targetTerm?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const allReports = await qualityService.getReports();
      setReports(allReports);

      const queryToFind = (targetTerm !== undefined ? targetTerm : searchTerm).trim().toLowerCase();
      if (queryToFind) {
        let cleanQuery = queryToFind;
        if (cleanQuery.includes('lot:')) {
          const parts = cleanQuery.split('|');
          const lotPart = parts.find((p) => p.startsWith('lot:'));
          if (lotPart) {
            cleanQuery = lotPart.replace('lot:', '').trim();
          }
        }

        const matched = allReports.find((r) => {
          const lot = (r.lotInternalNumber || '').toLowerCase();
          const grn = (r.grnNumber || '').toLowerCase();
          const repNum = (r.reportNumber || '').toLowerCase();
          const id = (r.id || '').toLowerCase();
          const batch = (r.batchNumber || '').toLowerCase();

          return (
            id === cleanQuery ||
            lot === cleanQuery ||
            grn === cleanQuery ||
            repNum === cleanQuery ||
            batch === cleanQuery ||
            (lot && cleanQuery.includes(lot)) ||
            (grn && cleanQuery.includes(grn)) ||
            (repNum && cleanQuery.includes(repNum))
          );
        });

        if (matched) {
          setSelectedReport(matched);
        } else {
          setSelectedReport(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load CoA verification data:', err);
      setErrorMsg('Gagal memuat data dari database Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(lotQuery);
  }, [lotQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      loadData(searchTerm.trim());
    }
  };

  const isPassed =
    selectedReport?.status === 'PASSED' || selectedReport?.status === 'PASSED_WITH_DEVIATION';
  const isRejected = selectedReport?.status === 'REJECTED';

  const normalizedLot = selectedReport
    ? normalizeLotNumber(selectedReport.lotInternalNumber || selectedReport.grnNumber)
    : '';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="PT. Larassanti Makmur Sejahtera"
              className="h-8 w-auto object-contain bg-white rounded-lg p-1"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-xs sm:text-sm tracking-tight text-white uppercase">
                  PT. LARASSANTI MAKMUR SEJAHTERA
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  CPKB GOL. A
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Verifikasi Status Mutu Label Rilis Digital
              </p>
            </div>
          </div>

          <button
            onClick={onExit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-all cursor-pointer shadow-sm"
            title="Masuk ke Sistem ERP Operasional"
          >
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Masuk Sistem ERP</span>
            <span className="sm:hidden">ERP</span>
          </button>
        </div>
      </header>

      {/* Main Container - Ringkas & Fokus Bagian Atas Saja */}
      <main className="max-w-3xl w-full mx-auto p-4 sm:p-6 flex-1 flex flex-col justify-start">
        {/* Loading State */}
        {isLoading && (
          <div className="p-10 bg-white rounded-3xl border border-slate-200 shadow-sm text-center flex flex-col items-center justify-center gap-3 my-6">
            <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            <h3 className="font-bold text-slate-800 text-sm">Memverifikasi Data Label...</h3>
            <p className="text-xs text-slate-500">Memeriksa keaslian status mutu di database Supabase</p>
          </div>
        )}

        {/* Not Found State */}
        {!isLoading && !selectedReport && (
          <div className="p-8 bg-white rounded-3xl border border-slate-200 shadow-sm text-center flex flex-col items-center justify-center gap-4 my-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center text-amber-600">
              <Search className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Data Label Tidak Ditemukan
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Nomor lot <code className="font-mono bg-slate-100 px-1 py-0.5 rounded font-bold">{searchTerm || lotQuery}</code> belum terdaftar dalam arsip rilis QC.
              </p>
            </div>

            <form onSubmit={handleSearchSubmit} className="w-full max-w-sm flex items-center gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari Nomor Lot..."
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cari
              </button>
            </form>

            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" /> Muat Ulang
            </button>
          </div>
        )}

        {/* Main Clean Verification Card (Bagian Atas Saja) */}
        {!isLoading && selectedReport && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col animate-in fade-in duration-200">
            {/* 1. Header Banner Status Mutu */}
            <div
              className={`p-5 sm:p-6 text-white flex items-center gap-4 ${
                isPassed
                  ? 'bg-emerald-600'
                  : isRejected
                  ? 'bg-rose-600'
                  : 'bg-amber-600'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/30">
                {isPassed ? (
                  <ShieldCheck className="w-7 h-7 text-white" />
                ) : isRejected ? (
                  <AlertTriangle className="w-7 h-7 text-white" />
                ) : (
                  <Award className="w-7 h-7 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-black tracking-wider uppercase bg-black/25 px-2.5 py-0.5 rounded-full inline-block border border-white/20 mb-1">
                  {selectedReport.materialType === 'raw' ? 'Bahan Baku' : 'Bahan Kemas'}
                </span>
                <h1 className="text-base sm:text-lg font-black uppercase tracking-wide leading-tight truncate">
                  {isPassed
                    ? 'STATUS: DILULUSKAN / RELEASE'
                    : isRejected
                    ? 'STATUS: DITOLAK (REJECTED)'
                    : 'STATUS: DALAM KARANTINA'}
                </h1>
                <p className="text-xs text-white/90 mt-0.5 font-medium">
                  {isPassed
                    ? 'Telah Diuji & Memenuhi Seluruh Spesifikasi Mutu CPKB'
                    : isRejected
                    ? 'Tidak Memenuhi Spesifikasi Mutu - Dilarang Digunakan'
                    : 'Sedang Dalam Proses Pengujian Laboratorium QC'}
                </p>
              </div>

              {/* Header Quick View CoA Button */}
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="hidden sm:inline-flex px-3.5 py-2 bg-white/20 hover:bg-white/30 active:scale-95 text-white rounded-xl text-xs font-bold backdrop-blur-xs border border-white/30 items-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View CoA</span>
              </button>
            </div>

            {/* 2. Detail Identitas Material & Lot */}
            <div className="p-5 sm:p-6 space-y-4">
              {/* Nama Bahan */}
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">
                    Nama Bahan / Material
                  </span>
                  <div className="text-base sm:text-lg font-black text-slate-900 uppercase mt-0.5">
                    {selectedReport.materialName}
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-700 mt-0.5">
                    Kode: {selectedReport.materialCode}
                  </div>
                </div>

                {/* Mobile View CoA Button */}
                <button
                  type="button"
                  onClick={() => setShowPdfModal(true)}
                  className="sm:hidden px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View CoA</span>
                </button>
              </div>

              {/* Grid Informasi Inti */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    No. Lot Internal
                  </span>
                  <span className="font-mono font-black text-slate-900 text-sm block mt-0.5">
                    {normalizedLot}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    No. GRN (Penerimaan)
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm block mt-0.5">
                    {selectedReport.grnNumber}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Batch / Lot Vendor
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-xs block mt-0.5 truncate">
                    {selectedReport.batchNumber || '-'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Total Kuantitas
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-xs block mt-0.5">
                    {Number(selectedReport.quantityReceived || 0).toLocaleString('id-ID')} {selectedReport.unit}
                    <span className="text-[11px] font-normal text-slate-500 block">
                      ({selectedReport.containerCount} Wadah {selectedReport.containerType})
                    </span>
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Tgl Otorisasi Rilis
                  </span>
                  <span className="font-bold text-slate-900 text-xs block mt-0.5">
                    {selectedReport.updatedAt ? selectedReport.updatedAt.slice(0, 10) : '-'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Tgl Kedaluwarsa
                  </span>
                  <span className="font-bold text-slate-900 text-xs block mt-0.5">
                    {selectedReport.expiryDate || 'Non-Exp (Kemasan)'}
                  </span>
                </div>
              </div>

              {/* Kondisi Penyimpanan */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  Penyimpanan:
                </span>
                <span className="font-semibold text-slate-800 text-right text-[11px]">
                  {selectedReport.storageConditions || 'Suhu Ruang Terkendali (15-25°C)'}
                </span>
              </div>

              {/* Tombol Utama View CoA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(true)}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 border border-emerald-500/30 transition-all cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Lihat Dokumen CoA Resmi (View CoA)</span>
                </button>
              </div>
            </div>

            {/* 3. Footer Otorisasi Resmi */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-[11px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Otorisasi: {selectedReport.qmSignature?.signerName || 'Quality Manager (Disetujui)'}</span>
              </div>

              <span className="font-mono text-[10px] font-bold text-slate-500 uppercase">
                FORM: {selectedReport.materialType === 'raw' ? 'L-DQC-006-01' : 'L-DQC-007-01'}
              </span>
            </div>
          </div>
        )}

        {/* Official CoA PDF Preview Modal */}
        {selectedReport && showPdfModal && (
          <QcInspectionReportPdfModal
            isOpen={showPdfModal}
            onClose={() => setShowPdfModal(false)}
            report={selectedReport}
          />
        )}

        {/* Footnote */}
        <div className="text-center text-[10px] text-slate-400 font-medium mt-4">
          SISTEM VERIFIKASI MUTU RESMI CPKB • PT. LARASSANTI MAKMUR SEJAHTERA
        </div>
      </main>
    </div>
  );
};
