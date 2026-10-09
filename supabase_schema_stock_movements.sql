-- ==============================================================================
-- SUPABASE DDL MIGRATION SCRIPT: STOCK MOVEMENTS & AUDIT TRAIL KARTU STOK
-- Modul Gudang Logistik & Quality Control CPKB
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

COMMENT ON TABLE public.stock_movements IS 'Buku besar transaksi mutasi kartu stok gudang bahan baku dan kemas (CPKB / BPOM)';
