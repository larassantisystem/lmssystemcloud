import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Database, Terminal, ShieldCheck, Download, RefreshCw, AlertCircle, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { warehouseService } from '../warehouseService';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface SupabaseWarehouseSqlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

export const SupabaseWarehouseSqlModal: React.FC<SupabaseWarehouseSqlModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
}) => {
  useEscapeKey(onClose, isOpen);

  const [activeTab, setActiveTab] = useState<'stock_movements' | 'warehouse_grn'>('stock_movements');
  const [copied, setCopied] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    isConfigured: boolean;
    tableExists: boolean;
    supabaseCount: number;
    localCount: number;
    error: string | null;
  } | null>(null);
  const [movementsAudit, setMovementsAudit] = useState<{
    isConfigured: boolean;
    tableExists: boolean;
    movementsCount: number;
    error: string | null;
  } | null>(null);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const runAudit = async () => {
    setAuditLoading(true);
    setSyncStatus(null);
    try {
      const [resGrn, resMovements] = await Promise.all([
        warehouseService.auditDatabaseStatus(),
        warehouseService.auditStockMovementsStatus(),
      ]);
      setAuditResult(resGrn);
      setMovementsAudit(resMovements);
    } catch (e: any) {
      setAuditResult({
        isConfigured: false,
        tableExists: false,
        supabaseCount: 0,
        localCount: 0,
        error: e.message || String(e),
      });
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runAudit();
    }
  }, [isOpen]);

  const handleSyncToSupabase = async () => {
    setSyncLoading(true);
    setSyncStatus(null);
    try {
      const res = await warehouseService.syncLocalToSupabase();
      if (res.syncedCount > 0) {
        setSyncStatus(`Sukses menyinkronkan ${res.syncedCount} catatan GRN lokal ke Supabase!`);
        await runAudit();
        if (onDataChanged) onDataChanged();
      } else if (res.failedCount > 0) {
        setSyncStatus(`Gagal menyinkronkan ${res.failedCount} data: ${res.error || 'Periksa skema tabel'}`);
      } else {
        setSyncStatus('Semua data lokal sudah selaras dengan database Supabase.');
      }
    } catch (e: any) {
      setSyncStatus(`Gagal: ${e.message || String(e)}`);
    } finally {
      setSyncLoading(false);
    }
  };

  if (!isOpen) return null;

  const sqlWarehouseGrn = `-- ==============================================================================
-- SUPABASE DDL MIGRATION SCRIPT: WAREHOUSE & GOODS RECEIVED NOTE (GRN)
-- Modul Gudang Logistik & Quality Control CPKB
-- File: supabase_schema_warehouse.sql
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.warehouse_grn (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grn_number VARCHAR(100) UNIQUE NOT NULL,
    material_type VARCHAR(50) NOT NULL DEFAULT 'raw',
    material_id VARCHAR(100),
    material_code VARCHAR(100) NOT NULL,
    material_name VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(255),
    distributor VARCHAR(255),
    delivery_note_number VARCHAR(100),
    po_number VARCHAR(100),
    purchase_order_number VARCHAR(100),
    batch_number VARCHAR(100),
    supplier_batch_number VARCHAR(100),
    internal_lot_number VARCHAR(100),
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,
    expiration_date DATE,
    retest_date DATE,
    quantity_received NUMERIC(12, 3) NOT NULL DEFAULT 0,
    unit VARCHAR(50) NOT NULL DEFAULT 'kg',
    container_count INTEGER NOT NULL DEFAULT 1,
    container_type VARCHAR(100) DEFAULT 'Drum / Zak',
    storage_location VARCHAR(255) DEFAULT 'Gudang Karantina',
    storage_conditions VARCHAR(255),
    qc_status VARCHAR(50) NOT NULL DEFAULT 'QUARANTINE',
    qc_parameters_count INTEGER DEFAULT 0,
    seal_condition VARCHAR(50) DEFAULT 'intact',
    packaging_condition VARCHAR(50) DEFAULT 'clean',
    coa_attachment TEXT,
    msds_attachment TEXT,
    halal_attachment TEXT,
    received_by VARCHAR(150),
    received_by_nik VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS current_quantity NUMERIC(12, 3);
UPDATE public.warehouse_grn SET current_quantity = quantity_received WHERE current_quantity IS NULL;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(100);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS supplier_batch_number VARCHAR(100);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS received_by_nik VARCHAR(100);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS msds_attachment TEXT;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS halal_attachment TEXT;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS internal_lot_number VARCHAR(100);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS retest_date DATE;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS storage_conditions VARCHAR(255);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS revert_reason TEXT;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS reverted_by VARCHAR(150);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS actual_sample_size NUMERIC(12, 3);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS actual_sample_unit VARCHAR(50);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS sampled_containers TEXT;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS sampled_by VARCHAR(150);
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS sampling_date_time TIMESTAMPTZ;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS coa_drive_file_id TEXT;
ALTER TABLE public.warehouse_grn ADD COLUMN IF NOT EXISTS coa_drive_view_link TEXT;

CREATE INDEX IF NOT EXISTS idx_warehouse_grn_code ON public.warehouse_grn (material_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_grn_status ON public.warehouse_grn (qc_status);
CREATE INDEX IF NOT EXISTS idx_warehouse_grn_date ON public.warehouse_grn (received_date DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_grn_grn_number ON public.warehouse_grn (grn_number);

ALTER TABLE public.warehouse_grn ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access on warehouse_grn" ON public.warehouse_grn;
CREATE POLICY "Public full access on warehouse_grn"
ON public.warehouse_grn
FOR ALL
USING (true)
WITH CHECK (true);`;

  const sqlStockMovements = `-- ==============================================================================
-- SUPABASE DDL MIGRATION SCRIPT: STOCK MOVEMENTS & AUDIT TRAIL KARTU STOK (OPSI 2)
-- Modul Gudang Logistik & Quality Control CPKB / BPOM
-- File: supabase_schema_stock_movements.sql
-- ==============================================================================

-- 1. Buat tabel public.stock_movements jika belum ada
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    material_code VARCHAR(100) NOT NULL,
    material_name VARCHAR(255) NOT NULL,
    material_type VARCHAR(50) NOT NULL DEFAULT 'raw',
    lot_internal_number VARCHAR(100) NOT NULL,
    movement_type VARCHAR(100) NOT NULL,
    reference_number VARCHAR(150),
    qty_before NUMERIC(14, 4) NOT NULL DEFAULT 0,
    qty_change NUMERIC(14, 4) NOT NULL DEFAULT 0,
    qty_after NUMERIC(14, 4) NOT NULL DEFAULT 0,
    unit VARCHAR(50) NOT NULL DEFAULT 'kg',
    performer_name VARCHAR(150),
    performer_role VARCHAR(150),
    performer_department VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Buat Index untuk performa penarikan Kartu Stok & Audit Trail CPKB
CREATE INDEX IF NOT EXISTS idx_stock_movements_lot ON public.stock_movements (lot_internal_number);
CREATE INDEX IF NOT EXISTS idx_stock_movements_code ON public.stock_movements (material_code);
CREATE INDEX IF NOT EXISTS idx_stock_movements_time ON public.stock_movements (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON public.stock_movements (reference_number);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 4. Kebijakan Akses (RLS Policy) - Akses penuh untuk transaksi operasional internal
DROP POLICY IF EXISTS "Public full access on stock_movements" ON public.stock_movements;
CREATE POLICY "Public full access on stock_movements"
ON public.stock_movements
FOR ALL
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.stock_movements IS 'Buku besar transaksi mutasi kartu stok gudang bahan baku dan kemas (CPKB / BPOM)';`;

  const activeSqlScript = activeTab === 'stock_movements' ? sqlStockMovements : sqlWarehouseGrn;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeSqlScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = activeTab === 'stock_movements' ? 'supabase_schema_stock_movements.sql' : 'supabase_schema_warehouse.sql';
    const blob = new Blob([activeSqlScript], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">
                  Audit Koneksi & Skrip DDL Supabase: GRN & Kartu Stok (Opsi 2)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                  Database Audit & Migration
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Pemeriksaan integrasi penyimpanan cloud Supabase dan skrip migrasi tabel penerimaan barang & buku besar kartu stok.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800">
          {/* Diagnostic & Audit Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Hasil Audit Database Saat Ini
                </h4>
              </div>
              <button
                type="button"
                onClick={runAudit}
                disabled={auditLoading}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${auditLoading ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
                <span>{auditLoading ? 'Memeriksa...' : 'Uji Ulang Koneksi'}</span>
              </button>
            </div>

            {auditResult ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1 uppercase">Koneksi Supabase</span>
                  <div className="flex items-center gap-1.5">
                    {auditResult.isConfigured ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-700">Terkonfigurasi (Active)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span className="font-bold text-rose-600">Belum Ada URL / Key</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1 uppercase">Tabel warehouse_grn</span>
                  <div className="flex items-center gap-1.5">
                    {auditResult.tableExists ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-700">Tabel Siap ({auditResult.supabaseCount} GRN)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="font-bold text-amber-700">Belum Ada di Supabase</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1 uppercase">Tabel stock_movements (Opsi 2)</span>
                  <div className="flex items-center gap-1.5">
                    {movementsAudit?.tableExists ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-700">Tabel Siap ({movementsAudit.movementsCount} Mutasi)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="font-bold text-amber-700">Belum Ada (Jalankan SQL)</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1 uppercase">Catatan GRN Tersimpan</span>
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span>Cloud: <strong className="text-emerald-700">{auditResult.supabaseCount}</strong></span>
                    <span className="text-slate-300">|</span>
                    <span>Lokal: <strong className="text-indigo-700">{auditResult.localCount}</strong></span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Tab Selector untuk Skrip SQL */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('stock_movements')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'stock_movements'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                1. Skrip Tabel stock_movements (Kartu Stok - Opsi 2)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('warehouse_grn')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'warehouse_grn'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                2. Skrip Tabel warehouse_grn (GRN Gudang)
              </button>
            </div>

            {auditResult?.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Pesan Diagnostic Error:</span>
                  <p className="font-mono text-[11px] text-rose-800 break-all">{auditResult.error}</p>
                </div>
              </div>
            )}

            {/* Sync local to cloud action */}
            {auditResult && auditResult.localCount > 0 && auditResult.tableExists && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-900">
                <div>
                  <span className="font-bold block">Terdapat data GRN di browser yang belum di-push ke Cloud!</span>
                  <span className="text-[11px] text-emerald-700">
                    Klik tombol untuk menyinkronkan seluruh catatan lokal ke tabel warehouse_grn Supabase secara instan.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSyncToSupabase}
                  disabled={syncLoading}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shrink-0 shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{syncLoading ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                </button>
              </div>
            )}

            {syncStatus && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 font-medium">
                {syncStatus}
              </div>
            )}
          </div>

          {/* Guide Card */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
            <Terminal className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Langkah Menjalankan Skrip di Supabase:</p>
              <ol className="list-decimal pl-4 space-y-1 text-amber-800 font-medium">
                <li>Buka dashboard proyek <strong>Supabase</strong> Anda (https://supabase.com/dashboard).</li>
                <li>Pilih menu <strong>SQL Editor</strong> di sidebar kiri.</li>
                <li>Klik tombol <strong>Salin SQL</strong> di bawah, tempel (paste) di editor, lalu klik <strong>Run</strong>.</li>
                <li>Tabel <code className="font-bold bg-amber-100 px-1 py-0.5 rounded text-amber-900">warehouse_grn</code>, index, dan kebijakan RLS akan langsung aktif.</li>
              </ol>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="relative">
            <div className="absolute right-3 top-3 flex items-center gap-2 z-10">
              <button
                type="button"
                onClick={handleDownload}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh .sql</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin!' : 'Salin SQL'}</span>
              </button>
            </div>

            <pre className="p-4 pt-12 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-2xl overflow-x-auto border border-slate-800 max-h-80 leading-relaxed">
              {activeSqlScript}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Skrip SQL telah diselaraskan dengan fallback kolom ganda & akses RLS terbuka.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-xs font-bold text-slate-700 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
