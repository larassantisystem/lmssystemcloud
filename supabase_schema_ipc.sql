-- ============================================================================
-- SUPABASE SCHEMA: PENGUJIAN KUALITAS IN-PROCESS CONTROL (IPC) CPKB
-- PT. LARASSANTI MAKMUR SEJAHTERA
-- ============================================================================

-- 1. Tabel Utama: Pengujian Kualitas Sediaan Ruahan (IPC Bulk Batches)
-- Mencatat hasil uji laboratorium ruahan (pH, viskositas, bobot jenis, organoleptik)
-- sebelum sediaan diizinkan masuk ke proses pengemasan (filling/packaging).
CREATE TABLE IF NOT EXISTS public.ipc_bulk_batches (
  id TEXT PRIMARY KEY,
  batch_no TEXT NOT NULL UNIQUE,                          -- Nomor Bets Ruahan (misal: BCH-20260917-A1)
  product_code TEXT,                                      -- Kode Produk Jadi (misal: PJ0001)
  product_name TEXT NOT NULL,                             -- Nama Produk Ruahan
  mixing_qty_kg NUMERIC DEFAULT 100,                     -- Jumlah adonan yang dimixing (kg)
  mixing_date DATE DEFAULT CURRENT_DATE,                  -- Tanggal Analisa (diambil dari kolom 'Tanggal Analisa' Excel)
  ph NUMERIC(5,2) DEFAULT 6.00,                           -- Hasil uji pH
  viscosity NUMERIC(10,2) DEFAULT 4000,                   -- Hasil uji viskositas (cPs)
  appearance TEXT DEFAULT 'Homogen, Sesuai Spesifikasi Standard CPKB', -- Hasil organoleptik (warna, bentuk, bau)
  gravity NUMERIC(6,3) DEFAULT 1.000,                     -- Hasil uji bobot jenis (Specific Gravity)
  status TEXT NOT NULL DEFAULT 'TESTING',                 -- 'TESTING', 'PASSED', 'REJECTED', 'RELEASED'
  analyst TEXT DEFAULT 'Staf QC (IPC)',                   -- Analis / Penanggung Jawab QC Lab
  origin TEXT DEFAULT 'MANUAL_ENTRY',                     -- Asal input: MANUAL_ENTRY, EXCEL_IMPORT, PPIC_SCHEDULED
  notes TEXT,                                             -- Catatan teknis pengujian laboratorium
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabel Pendukung: Pengendalian & Otorisasi Rework Sediaan (IPC Rework Tests)
CREATE TABLE IF NOT EXISTS public.ipc_rework_batches (
  id TEXT PRIMARY KEY,
  original_batch_no TEXT NOT NULL,                        -- Nomor Bets Asal yang sub-standard
  rework_batch_no TEXT NOT NULL UNIQUE,                   -- Nomor Bets Pengerjaan Ulang (misal: B260815X-R1)
  product_name TEXT NOT NULL,                             -- Nama Produk
  rework_reason TEXT,                                     -- Alasan pengerjaan ulang (misal: koreksi viskositas)
  rework_date DATE DEFAULT CURRENT_DATE,                  -- Tanggal pelaksanaan rework
  ph_test NUMERIC(5,2),                                   -- Hasil uji ulang pH setelah re-work
  viscosity_test NUMERIC(10,2),                           -- Hasil uji ulang viskositas
  microbiology TEXT DEFAULT 'PENDING',                    -- 'PENDING', 'NEGATIVE', 'POSITIVE'
  status TEXT NOT NULL DEFAULT 'TESTING',                 -- 'TESTING', 'PASSED', 'REJECTED'
  authorized_by TEXT DEFAULT 'Diana Putri (QM)',          -- Otorisasi Quality Manager (QM)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes untuk performa pencarian, filter status, dan sorting
CREATE INDEX IF NOT EXISTS idx_ipc_bulk_batch_no ON public.ipc_bulk_batches(batch_no);
CREATE INDEX IF NOT EXISTS idx_ipc_bulk_product_code ON public.ipc_bulk_batches(product_code);
CREATE INDEX IF NOT EXISTS idx_ipc_bulk_status ON public.ipc_bulk_batches(status);
CREATE INDEX IF NOT EXISTS idx_ipc_bulk_mixing_date ON public.ipc_bulk_batches(mixing_date DESC);

CREATE INDEX IF NOT EXISTS idx_ipc_rework_batch_no ON public.ipc_rework_batches(rework_batch_no);
CREATE INDEX IF NOT EXISTS idx_ipc_rework_status ON public.ipc_rework_batches(status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.ipc_bulk_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipc_rework_batches ENABLE ROW LEVEL SECURITY;

-- 5. Policies RLS untuk akses aplikasi (CRUD penuh anon / authenticated)
DROP POLICY IF EXISTS "Allow public read on ipc_bulk_batches" ON public.ipc_bulk_batches;
CREATE POLICY "Allow public read on ipc_bulk_batches" 
  ON public.ipc_bulk_batches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on ipc_bulk_batches" ON public.ipc_bulk_batches;
CREATE POLICY "Allow public insert on ipc_bulk_batches" 
  ON public.ipc_bulk_batches FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on ipc_bulk_batches" ON public.ipc_bulk_batches;
CREATE POLICY "Allow public update on ipc_bulk_batches" 
  ON public.ipc_bulk_batches FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete on ipc_bulk_batches" ON public.ipc_bulk_batches;
CREATE POLICY "Allow public delete on ipc_bulk_batches" 
  ON public.ipc_bulk_batches FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read on ipc_rework_batches" ON public.ipc_rework_batches;
CREATE POLICY "Allow public read on ipc_rework_batches" 
  ON public.ipc_rework_batches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on ipc_rework_batches" ON public.ipc_rework_batches;
CREATE POLICY "Allow public insert on ipc_rework_batches" 
  ON public.ipc_rework_batches FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on ipc_rework_batches" ON public.ipc_rework_batches;
CREATE POLICY "Allow public update on ipc_rework_batches" 
  ON public.ipc_rework_batches FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete on ipc_rework_batches" ON public.ipc_rework_batches;
CREATE POLICY "Allow public delete on ipc_rework_batches" 
  ON public.ipc_rework_batches FOR DELETE USING (true);
