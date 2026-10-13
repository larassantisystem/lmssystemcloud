-- ============================================================================
-- SUPABASE MIGRATION: ADD PASSWORD COLUMN TO PROFILES TABLE
-- Menambahkan kolom password ke tabel public.profiles untuk autentikasi terpusat
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT DEFAULT 'laras123';

-- Update user khusus
UPDATE public.profiles SET password = 'pembalut' WHERE nik = 'LMS30003';
