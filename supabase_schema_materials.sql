-- ============================================================================
-- SUPABASE SCHEMA: MASTER BAHAN BAKU (raw_materials) & BAHAN KEMAS (packaging_materials)
-- Sesuai dengan modul R&D Material PT. LARASSANTI MAKMUR SEJAHTERA
-- ============================================================================

-- 1. Table: raw_materials (Master Bahan Baku)
CREATE TABLE IF NOT EXISTS public.raw_materials (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,                          -- Contoh: RM-AQUA, RM-GINSENG
    spec_number TEXT,                                   -- Nomor Spesifikasi Mutu
    name TEXT NOT NULL,                                 -- Nama Bahan Baku (InCI Name)
    chemical_name TEXT,                                 -- Nama Kimia
    category TEXT DEFAULT 'active',                     -- Kategori (active, excipient, etc.)
    categories JSONB DEFAULT '[]'::jsonb,               -- Array multi-kategori
    other_category_specification TEXT,                  -- Spesifikasi kategori lainnya
    storage_conditions TEXT,                            -- Kondisi penyimpanan
    sds_doc_number TEXT,                                -- Nomor SDS (Safety Data Sheet)
    sds_file_url TEXT,                                  -- Link berkas SDS
    sds_file_name TEXT,                                 -- Nama berkas SDS
    approved_substitutes JSONB DEFAULT '[]'::jsonb,     -- Bahan alternatif pengganti yang disetujui
    manufacturer TEXT,                                  -- Pabrikan produsen bahan baku
    qc_parameters JSONB DEFAULT '[]'::jsonb,            -- Parameter uji QC laboratorium
    supplier_lead_time_days INTEGER DEFAULT 14,         -- Estimasi waktu kirim supplier (hari)
    reorder_point NUMERIC(12, 3) DEFAULT 50.000,        -- Batas minimum order ulang stok (kg)
    last_modified_by TEXT DEFAULT 'Staff RnD',
    last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Table: packaging_materials (Master Bahan Kemas)
CREATE TABLE IF NOT EXISTS public.packaging_materials (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,                          -- Contoh: PM-BOTOL-20ML, PM-KARTON
    spec_number TEXT,                                   -- Nomor Spesifikasi Mutu Kemasan
    name TEXT NOT NULL,                                 -- Nama Bahan Kemas
    type TEXT DEFAULT 'primary',                        -- Jenis kemasan (primary, secondary, tertiary)
    unit TEXT DEFAULT 'Pcs',                            -- Satuan unit kemas (Pcs, Box, dst)
    unit_capacity_grams NUMERIC(10, 2),                 -- Kapasitas isi kemasan (gram)
    supplier TEXT,                                      -- Nama supplier penyedia kemasan
    manufacturer TEXT,                                  -- Pabrikan produsen kemasan
    storage_location TEXT,                              -- Lokasi rak simpan gudang kemasan
    storage_conditions TEXT,                            -- Kondisi penyimpanan khusus
    qc_parameters JSONB DEFAULT '[]'::jsonb,            -- Parameter uji fisik & visual kemasan
    reorder_point NUMERIC(12, 3) DEFAULT 100.000,       -- Batas minimum order ulang stok (pcs)
    last_modified_by TEXT DEFAULT 'Staff RnD',
    last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Indexes untuk Kecepatan Query & Pencarian
CREATE INDEX IF NOT EXISTS idx_raw_materials_code ON public.raw_materials(code);
CREATE INDEX IF NOT EXISTS idx_raw_materials_name ON public.raw_materials(name);
CREATE INDEX IF NOT EXISTS idx_packaging_materials_code ON public.packaging_materials(code);
CREATE INDEX IF NOT EXISTS idx_packaging_materials_name ON public.packaging_materials(name);

-- 4. Aktifkan Row Level Security (RLS)
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_materials ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Akses penuh untuk operasional internal)
DROP POLICY IF EXISTS "Public full access on raw_materials" ON public.raw_materials;
CREATE POLICY "Public full access on raw_materials" ON public.raw_materials FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access on packaging_materials" ON public.packaging_materials;
CREATE POLICY "Public full access on packaging_materials" ON public.packaging_materials FOR ALL USING (true) WITH CHECK (true);
