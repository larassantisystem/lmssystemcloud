-- ============================================================================
-- SUPABASE SCHEMA: MASTER BULK FORMULATIONS (STANDAR CPKB)
-- PT. LARASSANTI MAKMUR SEJAHTERA
-- ============================================================================

-- 1. Hapus kolom formula lama jika sebelumnya sempat dibuat
ALTER TABLE IF EXISTS public.bulk_formulations 
  DROP COLUMN IF EXISTS target_ph,
  DROP COLUMN IF EXISTS ph_tolerance,
  DROP COLUMN IF EXISTS target_viscosity,
  DROP COLUMN IF EXISTS gravity_target,
  DROP COLUMN IF EXISTS density,
  DROP COLUMN IF EXISTS specific_gravity;

ALTER TABLE IF EXISTS public.formulations 
  DROP COLUMN IF EXISTS target_ph,
  DROP COLUMN IF EXISTS ph_tolerance,
  DROP COLUMN IF EXISTS target_viscosity,
  DROP COLUMN IF EXISTS gravity_target,
  DROP COLUMN IF EXISTS density,
  DROP COLUMN IF EXISTS specific_gravity;

-- 2. Buat tabel master formulasi bulk (BOM Bahan Baku)
CREATE TABLE IF NOT EXISTS public.bulk_formulations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                       -- Contoh: BOM-PJ0099-V1.0
  name TEXT NOT NULL,                              -- Nama Formula / Nama Produk
  product_id TEXT,                                 -- Relasi ID produk jika ada
  product_code TEXT NOT NULL,                      -- Contoh: PJ0099
  product_name TEXT NOT NULL,                      -- Contoh: Larassanti Hair Tonic ginseng
  version TEXT NOT NULL DEFAULT 'v1.0',            -- Contoh: v1.0, v1.1, v2.0
  status TEXT NOT NULL DEFAULT 'ACTIVE',           -- 'ACTIVE', 'DRAFT', 'ARCHIVED'
  bulk_quantity_kg NUMERIC NOT NULL DEFAULT 100,  -- Standar basis ukuran batch CPKB (100 kg)
  purpose_description TEXT,                        -- Keterangan / Tujuan Formula
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array FormulationIngredient [{ rawMaterialCode, percentage, qtyBasisKg, phase, description }]
  mixing_instructions TEXT,                        -- Catatan Teknis Formulasi / Petunjuk Pengolahan
  created_by TEXT,                                 -- NIK / Nama Formulator R&D
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes untuk performa pencarian & filter
CREATE INDEX IF NOT EXISTS idx_bulk_formulations_code ON public.bulk_formulations(code);
CREATE INDEX IF NOT EXISTS idx_bulk_formulations_product_code ON public.bulk_formulations(product_code);
CREATE INDEX IF NOT EXISTS idx_bulk_formulations_version ON public.bulk_formulations(version);
CREATE INDEX IF NOT EXISTS idx_bulk_formulations_status ON public.bulk_formulations(status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.bulk_formulations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on bulk_formulations" ON public.bulk_formulations;
CREATE POLICY "Allow public read on bulk_formulations" 
  ON public.bulk_formulations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on bulk_formulations" ON public.bulk_formulations;
CREATE POLICY "Allow public insert on bulk_formulations" 
  ON public.bulk_formulations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on bulk_formulations" ON public.bulk_formulations;
CREATE POLICY "Allow public update on bulk_formulations" 
  ON public.bulk_formulations FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete on bulk_formulations" ON public.bulk_formulations;
CREATE POLICY "Allow public delete on bulk_formulations" 
  ON public.bulk_formulations FOR DELETE USING (true);
