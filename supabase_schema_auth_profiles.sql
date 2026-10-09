-- ============================================================================
-- SUPABASE SCHEMA: USER PROFILES & AUTOMATIC AUTH TRIGGER
-- Menghubungkan Supabase Auth dengan tabel data profil karyawan (public.profiles)
-- ============================================================================

-- 1. Table: profiles (Tabel Profil Karyawan)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nik VARCHAR(100) UNIQUE NOT NULL,                  -- NIK Karyawan (contoh: LMS00001 atau admin)
    name VARCHAR(255) NOT NULL,                        -- Nama Lengkap Karyawan
    department VARCHAR(100) DEFAULT 'rnd',             -- Departemen (rnd, quality, warehouse, dll)
    role VARCHAR(100) DEFAULT 'staff',                 -- Peran (admin, supervisor, staff)
    position VARCHAR(100),                             -- Jabatan / Posisi Kerja
    email VARCHAR(255),                                -- Alamat Email Terdaftar
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Allow public read on profiles" ON public.profiles;
CREATE POLICY "Allow public read on profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow full access on profiles for authenticated users" ON public.profiles;
CREATE POLICY "Allow full access on profiles for authenticated users" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- 4. Trigger Function: Otomatis sinkronisasi ketika ada user mendaftar lewat Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nik, name, department, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nik', 'LMS' || UPPER(SUBSTRING(NEW.id::text, 1, 5))),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'department', 'rnd'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Daftarkan trigger ke tabel auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
