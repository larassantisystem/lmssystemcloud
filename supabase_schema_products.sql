-- ============================================================================
-- SUPABASE SQL SCHEMA FOR MASTER PRODUCTS & VARIANTS
-- Sesuai spesifikasi:
-- 1. Tabel 'products' memuat: id, product_code, name, brand, exp_notification_date, created_at (+ kolom pelengkap CPKB)
-- 2. Tabel 'product_variants' memuat: id, product_id, variant_name, sku, status (+ kolom pelengkap BOM) & foreign key ke 'products'
-- ============================================================================

-- 1. Table: products (Master Produk Jadi)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    product_code TEXT UNIQUE NOT NULL,                  -- Format: PJ0001, PJ0002 dst
    name TEXT NOT NULL,                                 -- Nama Master Produk
    brand TEXT NOT NULL,                                -- Brand / Merk
    exp_notification_date DATE,                         -- Tanggal Kadaluarsa Notifikasi BPOM
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Kolom pendukung standar CPKB & R&D
    category TEXT,                                      -- Kategori produk (contoh: Skincare - Face Serum)
    description TEXT,                                   -- Deskripsi produk
    unit TEXT DEFAULT 'pcs (Pieces)',                   -- Satuan default
    storage_conditions TEXT,                            -- Kondisi penyimpanan
    bpom_notification_number TEXT,                      -- Nomor notifikasi BPOM
    qc_parameters JSONB DEFAULT '[]'::jsonb,            -- Parameter QC sediaan ruahan (bulk)
    finished_parameters JSONB DEFAULT '[]'::jsonb       -- Parameter QC produk jadi & kemasan
);

-- Skrip Tambahan jika tabel 'products' sudah ada sebelumnya:
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS qc_parameters JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS finished_parameters JSONB DEFAULT '[]'::jsonb;

-- 2. Table: product_variants (Varian Ukuran & Kemasan)
CREATE TABLE IF NOT EXISTS public.product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- Foreign Key ke tabel products
    variant_name TEXT NOT NULL,                         -- Nama Varian (contoh: Botol Pipet 20ml)
    sku TEXT UNIQUE NOT NULL,                           -- Kode SKU varian (contoh: PJ0001-V1)
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')), -- Status varian
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Kolom pendukung formulasi & BOM Kemasan
    net_volume_grams NUMERIC(10, 2) DEFAULT 0,          -- Isi netto per botol / jar (gram)
    bulk_formula_code TEXT,                             -- Formula Bulk terkait (contoh: FORM-01)
    packaging_bom JSONB DEFAULT '[]'::jsonb,            -- Bill of Materials kemasan (K0001, K0002, dst)
    bpom_number TEXT,                                   -- Nomor notifikasi BPOM spesifik varian
    barcode TEXT,                                       -- Barcode EAN-13
    description TEXT                                    -- Catatan varian
);

-- 3. Indexes untuk Kecepatan Query & Relasi
CREATE INDEX IF NOT EXISTS idx_products_product_code ON public.products(product_code);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON public.product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_variants_status ON public.product_variants(status);

-- 4. Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Allow public read access on products" ON public.products;
CREATE POLICY "Allow public read access on products" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert update delete on products" ON public.products;
CREATE POLICY "Allow insert update delete on products" ON public.products FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read access on product_variants" ON public.product_variants;
CREATE POLICY "Allow public read access on product_variants" ON public.product_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert update delete on product_variants" ON public.product_variants;
CREATE POLICY "Allow insert update delete on product_variants" ON public.product_variants FOR ALL USING (true);
