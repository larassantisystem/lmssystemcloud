-- ==============================================================================
-- SUPABASE DDL MIGRATION SCRIPT: WAREHOUSE & GOODS RECEIVED NOTE (GRN)
-- Modul Gudang Logistik & Quality Control CPKB
-- File: supabase_schema_warehouse.sql
-- ==============================================================================

-- 1. Pastikan ekstensi UUID aktif
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Buat tabel warehouse_grn jika belum ada
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

-- 3. Tambahkan kolom yang mungkin belum ada bila tabel pernah dibuat dengan skema berbeda
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

-- 4. Lepaskan batasan NOT NULL pada kolom opsional / alias agar penulisan selalu berhasil
ALTER TABLE public.warehouse_grn ALTER COLUMN purchase_order_number DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN supplier_batch_number DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN expiration_date DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN received_by_nik DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN seal_condition DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN packaging_condition DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN distributor DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN manufacturer DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN storage_location DROP NOT NULL;
ALTER TABLE public.warehouse_grn ALTER COLUMN delivery_note_number DROP NOT NULL;

-- 5. Tambahkan Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_warehouse_grn_code ON public.warehouse_grn (material_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_grn_status ON public.warehouse_grn (qc_status);
CREATE INDEX IF NOT EXISTS idx_warehouse_grn_date ON public.warehouse_grn (received_date DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_grn_grn_number ON public.warehouse_grn (grn_number);

-- 6. Aktifkan Row Level Security (RLS)
ALTER TABLE public.warehouse_grn ENABLE ROW LEVEL SECURITY;

-- 7. Buat Kebijakan Akses (RLS Policy) - Akses penuh untuk aplikasi internal
DROP POLICY IF EXISTS "Public full access on warehouse_grn" ON public.warehouse_grn;

CREATE POLICY "Public full access on warehouse_grn"
ON public.warehouse_grn
FOR ALL
USING (true)
WITH CHECK (true);

-- 8. Trigger otomatis untuk update timestamp updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp_warehouse_grn()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_warehouse_grn ON public.warehouse_grn;

CREATE TRIGGER set_timestamp_warehouse_grn
BEFORE UPDATE ON public.warehouse_grn
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp_warehouse_grn();

COMMENT ON TABLE public.warehouse_grn IS 'Tabel transaksi penerimaan barang (Goods Received Note / GRN) untuk Gudang dan QC CPKB';
