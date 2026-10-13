-- ============================================================================
-- SUPABASE FIX SCRIPT: SINKRONISASI AUTH.IDENTITIES & PASSWORD LOGIN
-- File ini memperbaiki error "Invalid login credentials" di Supabase
-- Menghubungkan auth.users dengan auth.identities agar GoTrue Auth mengenali akun
-- ============================================================================

-- 1. Sinkronkan tabel auth.identities untuk semua user di auth.users yang belum memiliki identitas
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.id,
  json_build_object('sub', u.id::text, 'email', u.email)::jsonb,
  'email',
  u.email,
  NOW(),
  NOW(),
  NOW()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
);

-- 2. Pastikan email terkonfirmasi dan akun aktif
UPDATE auth.users
SET 
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  confirmed_at = COALESCE(confirmed_at, NOW()),
  encrypted_password = COALESCE(encrypted_password, '$2a$10$U/1pMhFasSWez9h6oTz1DOWR9f.wWv16sI.4GfREK8C0S6y81g9N6')
WHERE email LIKE '%@larassanti.co.id';

-- 3. Verifikasi Jumlah User & Identitas
SELECT 
  u.email,
  u.id as user_id,
  p.nik,
  p.name,
  p.role,
  i.provider
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN auth.identities i ON i.user_id = u.id
ORDER BY p.nik ASC;
