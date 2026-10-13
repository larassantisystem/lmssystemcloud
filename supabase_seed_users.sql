-- ============================================================================
-- SUPABASE SEED SCRIPT: INITIAL SYSTEM USERS (STANDAR KARYAWAN PT. LARASSANTI)
-- Password default untuk semua akun: laras123
-- ============================================================================

-- 1. Definisikan Fungsi Helper untuk Menghindari Duplikasi saat Seeding
CREATE OR REPLACE FUNCTION public.seed_system_user(
  p_email TEXT,
  p_nik TEXT,
  p_name TEXT,
  p_dept TEXT,
  p_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT := '$2a$10$U/1pMhFasSWez9h6oTz1DOWR9f.wWv16sI.4GfREK8C0S6y81g9N6'; -- Bcrypt hash untuk "laras123"
BEGIN
  -- Periksa apakah user sudah terdaftar di auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    
    -- Insert ke tabel internal Auth Supabase
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token,
      is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      p_email,
      v_encrypted_password,
      NOW(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      json_build_object(
        'nik', p_nik,
        'full_name', p_name,
        'department', p_dept,
        'role', p_role
      )::jsonb,
      NOW(),
      NOW(),
      '',
      '',
      '',
      '',
      FALSE
    );

    -- Insert ke tabel auth.identities agar dikenali oleh GoTrue
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_user_id,
      json_build_object('sub', v_user_id::text, 'email', p_email)::jsonb,
      'email',
      p_email,
      NOW(),
      NOW(),
      NOW()
    ) ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'User % (% / %) berhasil dibuat.', p_name, p_nik, p_email;
  ELSE
    -- Jika user auth sudah ada, pastikan profilnya singkron di public.profiles
    INSERT INTO public.profiles (id, nik, name, department, role, email)
    VALUES (
      v_user_id,
      p_nik,
      p_name,
      p_dept,
      p_role,
      p_email
    )
    ON CONFLICT (nik) DO UPDATE 
    SET name = EXCLUDED.name,
        department = EXCLUDED.department,
        role = EXCLUDED.role,
        email = EXCLUDED.email;
        
    RAISE NOTICE 'User % sudah ada, profil diperbarui.', p_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Jalankan Seeding Akun Karyawan
SELECT public.seed_system_user('lms00000@larassanti.co.id', 'admin', 'ADMIN', 'admin', 'admin');
SELECT public.seed_system_user('lms10001@larassanti.co.id', 'LMS10001', 'Daffa', 'rnd', 'staff');
SELECT public.seed_system_user('lms10002@larassanti.co.id', 'LMS10002', 'Tanzil', 'rnd', 'supervisor');
SELECT public.seed_system_user('lms10003@larassanti.co.id', 'LMS10003', 'Lanny', 'rnd', 'manager');
SELECT public.seed_system_user('lms20001@larassanti.co.id', 'LMS20001', 'Ayu', 'quality', 'staff');
SELECT public.seed_system_user('lms20002@larassanti.co.id', 'LMS20002', 'Lala', 'quality', 'supervisor');
SELECT public.seed_system_user('lms20003@larassanti.co.id', 'LMS20003', 'Michael', 'quality', 'manager');
SELECT public.seed_system_user('lms30001@larassanti.co.id', 'LMS30001', 'Heni', 'warehouse', 'staff');
SELECT public.seed_system_user('lms30002@larassanti.co.id', 'LMS30002', 'Maulana', 'warehouse', 'supervisor');
SELECT public.seed_system_user('lms30003@larassanti.co.id', 'LMS30003', 'Haryani', 'warehouse', 'manager');
SELECT public.seed_system_user('lms40001@larassanti.co.id', 'LMS40001', 'Lisa', 'production', 'staff');
SELECT public.seed_system_user('lms40002@larassanti.co.id', 'LMS40002', 'Ilham', 'production', 'supervisor');
SELECT public.seed_system_user('lms40003@larassanti.co.id', 'LMS40003', 'Ika Suci', 'production', 'manager');
SELECT public.seed_system_user('lms50001@larassanti.co.id', 'LMS50001', 'Heri', 'ppic', 'staff');
SELECT public.seed_system_user('lms50002@larassanti.co.id', 'LMS50002', 'Shinta', 'ppic', 'supervisor');
SELECT public.seed_system_user('lms50003@larassanti.co.id', 'LMS50003', 'Adha Winatie', 'ppic', 'manager');
SELECT public.seed_system_user('lms90001@larassanti.co.id', 'LMS90001', 'Hermansyah Rusli', 'management', 'manager');
SELECT public.seed_system_user('lms90002@larassanti.co.id', 'LMS90002', 'Herlina', 'management', 'manager');
SELECT public.seed_system_user('lms90003@larassanti.co.id', 'LMS90003', 'Dewi Sartika M', 'management', 'manager');
SELECT public.seed_system_user('lms90004@larassanti.co.id', 'LMS90004', 'Tita', 'management', 'supervisor');

-- 3. Bersihkan Fungsi Helper Seeding setelah Selesai
DROP FUNCTION IF EXISTS public.seed_system_user(TEXT, TEXT, TEXT, TEXT, TEXT);
