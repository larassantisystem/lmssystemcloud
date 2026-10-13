-- ============================================================================
-- SUPABASE 1-CLICK SETUP: PROFILES & SEMUA USER KARYAWAN PT. LARASSANTI
-- Jalankan skrip ini sekali saja di SQL Editor Supabase baru Anda
-- ============================================================================

-- 1. Buat Tabel public.profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    nik VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100) DEFAULT 'rnd',
    role VARCHAR(100) DEFAULT 'staff',
    position VARCHAR(100),
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aktifkan RLS & Kebijakan Akses
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on profiles" ON public.profiles;
CREATE POLICY "Public full access on profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- 2. Fungsi Pendaftaran Otomatis User ke auth.users, auth.identities, dan public.profiles
CREATE OR REPLACE FUNCTION public.setup_lms_user(
  p_email TEXT,
  p_nik TEXT,
  p_name TEXT,
  p_dept TEXT,
  p_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT := '$2a$10$U/1pMhFasSWez9h6oTz1DOWR9f.wWv16sI.4GfREK8C0S6y81g9N6'; -- Hash untuk "laras123"
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    
    -- A. Masukkan ke auth.users
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      p_email, v_encrypted_pw, NOW(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      json_build_object('nik', p_nik, 'full_name', p_name, 'department', p_dept, 'role', p_role)::jsonb,
      NOW(), NOW(), '', '', '', '', FALSE
    );
    
    -- B. Masukkan ke auth.identities
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id, v_user_id,
      json_build_object('sub', v_user_id::text, 'email', p_email)::jsonb,
      'email', p_email, NOW(), NOW(), NOW()
    );
  END IF;

  -- C. Masukkan / Sinkronkan ke public.profiles
  INSERT INTO public.profiles (id, nik, name, department, role, email)
  VALUES (v_user_id, p_nik, p_name, p_dept, p_role, p_email)
  ON CONFLICT (nik) DO UPDATE 
  SET id = EXCLUDED.id,
      name = EXCLUDED.name,
      department = EXCLUDED.department,
      role = EXCLUDED.role,
      email = EXCLUDED.email;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Eksekusi Pendaftaran Seluruh Akun Karyawan (Password: laras123)
SELECT public.setup_lms_user('lms00000@larassanti.co.id', 'admin', 'ADMIN', 'admin', 'admin');
SELECT public.setup_lms_user('lms10001@larassanti.co.id', 'LMS10001', 'Daffa', 'rnd', 'staff');
SELECT public.setup_lms_user('lms10002@larassanti.co.id', 'LMS10002', 'Tanzil', 'rnd', 'supervisor');
SELECT public.setup_lms_user('lms10003@larassanti.co.id', 'LMS10003', 'Lanny', 'rnd', 'manager');
SELECT public.setup_lms_user('lms20001@larassanti.co.id', 'LMS20001', 'Ayu', 'quality', 'staff');
SELECT public.setup_lms_user('lms20002@larassanti.co.id', 'LMS20002', 'Lala', 'quality', 'supervisor');
SELECT public.setup_lms_user('lms20003@larassanti.co.id', 'LMS20003', 'Michael', 'quality', 'manager');
SELECT public.setup_lms_user('lms30001@larassanti.co.id', 'LMS30001', 'Heni', 'warehouse', 'staff');
SELECT public.setup_lms_user('lms30002@larassanti.co.id', 'LMS30002', 'Maulana', 'warehouse', 'supervisor');
SELECT public.setup_lms_user('lms30003@larassanti.co.id', 'LMS30003', 'Haryani', 'warehouse', 'manager');
SELECT public.setup_lms_user('lms40001@larassanti.co.id', 'LMS40001', 'Lisa', 'production', 'staff');
SELECT public.setup_lms_user('lms40002@larassanti.co.id', 'LMS40002', 'Ilham', 'production', 'supervisor');
SELECT public.setup_lms_user('lms40003@larassanti.co.id', 'LMS40003', 'Ika Suci', 'production', 'manager');
SELECT public.setup_lms_user('lms50001@larassanti.co.id', 'LMS50001', 'Heri', 'ppic', 'staff');
SELECT public.setup_lms_user('lms50002@larassanti.co.id', 'LMS50002', 'Shinta', 'ppic', 'supervisor');
SELECT public.setup_lms_user('lms50003@larassanti.co.id', 'LMS50003', 'Adha Winatie', 'ppic', 'manager');
SELECT public.setup_lms_user('lms90001@larassanti.co.id', 'LMS90001', 'Hermansyah Rusli', 'management', 'manager');
SELECT public.setup_lms_user('lms90002@larassanti.co.id', 'LMS90002', 'Herlina', 'management', 'manager');
SELECT public.setup_lms_user('lms90003@larassanti.co.id', 'LMS90003', 'Dewi Sartika M', 'management', 'manager');
SELECT public.setup_lms_user('lms90004@larassanti.co.id', 'LMS90004', 'Tita', 'management', 'supervisor');

-- 4. Bersihkan Helper Function
DROP FUNCTION IF EXISTS public.setup_lms_user(TEXT, TEXT, TEXT, TEXT, TEXT);

-- 5. Konfirmasi Hasil
SELECT nik, name, role, email FROM public.profiles ORDER BY nik;
