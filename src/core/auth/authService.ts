import { supabase, isSupabaseConfigured } from './supabaseClient';
import { UserProfile, ModulePermission } from '../../types';
import { DEMO_USERS, INITIAL_SYSTEM_USERS } from './mockUsers';

const AUTH_STORAGE_KEY = 'cosmo_ddmp_auth_user';

const MODULE_CODE_MAP: Record<string, string> = {
  warehouse: 'wh',
  quality: 'qc',
  production: 'prod',
  procurement: 'po',
  management: 'mgmt',
  rnd: 'rnd',
  ppic: 'ppic',
  sales: 'sales',
  admin: 'admin',
};

const REVERSE_MODULE_CODE_MAP: Record<string, Department> = {
  wh: 'warehouse',
  warehouse: 'warehouse',
  qc: 'quality',
  quality: 'quality',
  prod: 'production',
  production: 'production',
  po: 'procurement',
  procurement: 'procurement',
  mgmt: 'management',
  management: 'management',
  rnd: 'rnd',
  ppic: 'ppic',
  sales: 'sales',
  admin: 'admin',
};

export function serializeProfilePositionAndAccess(title?: string, specificAccess?: ModulePermission[]): string {
  const cleanTitle = (title || '').trim().replace(/[#]/g, '');
  if (!specificAccess || specificAccess.length === 0) {
    return cleanTitle.slice(0, 95);
  }
  const accParts = specificAccess.map((perm) => {
    const code = MODULE_CODE_MAP[perm.moduleId] || perm.moduleId;
    const lvl = perm.accessLevel === 'write' ? 'w' : 'r';
    return `${code}:${lvl}`;
  });
  const accStr = `ACC:${accParts.join(',')}`;
  if (cleanTitle) {
    return `${accStr}#${cleanTitle}`.slice(0, 95);
  }
  return accStr.slice(0, 95);
}

export function parseProfilePositionAndAccess(positionValue: any): { position?: string; specificAccess: ModulePermission[] } {
  let position: string | undefined = undefined;
  let specificAccess: ModulePermission[] = [];
  if (!positionValue || typeof positionValue !== 'string') {
    return { position: undefined, specificAccess: [] };
  }
  const raw = positionValue.trim();
  if (raw.startsWith('ACC:')) {
    const parts = raw.slice(4).split('#');
    const accListStr = parts[0] || '';
    position = parts[1] || undefined;
    if (accListStr) {
      accListStr.split(',').forEach((item) => {
        const [code, lvl] = item.split(':');
        const mod = REVERSE_MODULE_CODE_MAP[code?.toLowerCase()];
        if (mod) {
          specificAccess.push({
            moduleId: mod,
            accessLevel: lvl === 'w' ? 'write' : 'read',
          });
        }
      });
    }
  } else if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      position = parsed.title || parsed.position || undefined;
      if (Array.isArray(parsed.specificAccess)) {
        specificAccess = parsed.specificAccess;
      }
    } catch {
      position = raw;
    }
  } else {
    position = raw;
  }
  return { position, specificAccess };
}

export const authService = {
  isConfigured: isSupabaseConfigured,

  login: async (nik: string, password: string): Promise<{ user: UserProfile | null; error: string | null }> => {
    const cleanNik = nik.trim();
    const constructEmails = (rawNik: string): string[] => {
      const clean = rawNik.trim();
      if (clean.includes('@')) return [clean.toLowerCase()];
      if (clean.toLowerCase() === 'admin' || clean.toLowerCase() === 'lms00000' || clean === '00000') {
        return ['lms00000@larassanti.co.id', 'admin@larassanti.co.id', 'admin@larassanti.com'];
      }
      const formattedNik = clean.toUpperCase().startsWith('LMS') ? clean.toUpperCase() : `LMS${clean.toUpperCase()}`;
      return [
        `${formattedNik.toLowerCase()}@larassanti.co.id`,
        `${clean.toLowerCase()}@larassanti.co.id`,
      ];
    };
    const targetEmails = constructEmails(cleanNik);
    const primaryEmail = targetEmails[0];

    if (isSupabaseConfigured && supabase) {
      try {
        let authUser: any = null;
        let lastAuthError: string | null = null;

        // 1. Coba login via Supabase Auth dengan variasi email yang relevan
        for (const candidateEmail of targetEmails) {
          const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
            email: candidateEmail,
            password: password,
          });
          if (!authErr && authData?.user) {
            authUser = authData.user;
            break;
          } else if (authErr) {
            lastAuthError = authErr.message;
          }
        }

        // 2. Jika Supabase Auth berhasil
        if (authUser) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, nik, name, department, role, position, email, password')
            .or(`id.eq.${authUser.id},nik.ilike.${cleanNik},email.ilike.${primaryEmail}`)
            .maybeSingle();

          const isAdminUser = profileData?.role === 'admin' || cleanNik.toLowerCase() === 'admin' || profileData?.nik?.toLowerCase() === 'admin' || authUser.user_metadata?.role === 'admin';
          const resolvedNik = isAdminUser ? 'admin' : (profileData?.nik || (authUser.user_metadata?.nik as string) || cleanNik);
          const resolvedDept = isAdminUser 
            ? 'admin' 
            : ((profileData?.department as UserProfile['department']) || (authUser.user_metadata?.department as UserProfile['department']) || 'rnd');
          const resolvedRole = isAdminUser 
            ? 'admin' 
            : ((profileData?.role as UserProfile['role']) || (authUser.user_metadata?.role as UserProfile['role']) || 'staff');
          const resolvedName = profileData?.name || authUser.user_metadata?.full_name || (isAdminUser ? 'ADMIN' : `Karyawan ${cleanNik}`);

          // Jika record profil di database Supabase belum ada, otomatis sinkronkan ke tabel profiles
          if (!profileData) {
            try {
              await supabase.from('profiles').upsert({
                id: authUser.id,
                nik: resolvedNik,
                name: resolvedName,
                department: resolvedDept,
                role: resolvedRole,
                email: authUser.email || primaryEmail,
                password,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'id' });
            } catch (syncErr) {
              console.warn('[authService] Auto-sync profile to Supabase exception:', syncErr);
            }
          }

          const { position: parsedPos, specificAccess: parsedAccess } = parseProfilePositionAndAccess(profileData?.position);

          const userProfile: UserProfile = {
            id: profileData?.id || authUser.id,
            nik: resolvedNik,
            name: resolvedName,
            department: resolvedDept,
            role: resolvedRole,
            position: parsedPos,
            specificAccess: parsedAccess,
            email: authUser.email || primaryEmail,
            password: profileData?.password || password,
          };

          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile));
          }
          return { user: userProfile, error: null };
        }

        // 3. Autentikasi Langsung ke Database Supabase: Periksa tabel public.profiles
        // Verifikasi langsung ke kolom password di tabel public.profiles
        const { data: dbProfile, error: dbErr } = await supabase
          .from('profiles')
          .select('id, nik, name, department, role, position, email, password')
          .or(`nik.ilike.${cleanNik},email.ilike.${primaryEmail}`)
          .maybeSingle();

        if (dbProfile && !dbErr) {
          // Verifikasi kata sandi langsung terhadap kolom password di table profiles Supabase
          const expectedPassword = dbProfile.password || 'laras123';
          if (password !== expectedPassword) {
            return { user: null, error: 'Kata sandi yang dimasukkan salah. Silakan coba lagi.' };
          }

          const isAdminUser = dbProfile.role === 'admin' || cleanNik.toLowerCase() === 'admin' || dbProfile.nik?.toLowerCase() === 'admin';
          const resolvedNik = isAdminUser ? 'admin' : (dbProfile.nik || cleanNik);
          const resolvedDept = (isAdminUser ? 'admin' : (dbProfile.department || 'rnd')) as UserProfile['department'];
          const resolvedRole = (isAdminUser ? 'admin' : (dbProfile.role || 'staff')) as UserProfile['role'];

          const { position: parsedPos, specificAccess: parsedAccess } = parseProfilePositionAndAccess(dbProfile.position);

          const userProfile: UserProfile = {
            id: dbProfile.id,
            nik: resolvedNik,
            name: dbProfile.name || (isAdminUser ? 'ADMIN' : `Karyawan ${cleanNik}`),
            department: resolvedDept,
            role: resolvedRole,
            position: parsedPos,
            specificAccess: parsedAccess,
            email: dbProfile.email || primaryEmail,
            password: dbProfile.password || password,
          };

          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile));
          }
          return { user: userProfile, error: null };
        }

        // Jika tidak ditemukan di database profiles dan Auth gagal
        if (lastAuthError) {
          return { 
            user: null, 
            error: `Gagal masuk: ${lastAuthError}. Pastikan NIK (${cleanNik}) dan kata sandi sudah terdaftar di database Supabase.` 
          };
        }
      } catch (err: unknown) {
        console.error('[Auth Audit] Supabase Login error:', err);
      }
    }

    // Check specific access map and registered users overrides
    const accessMapRaw = localStorage.getItem('cosmo_ddmp_specific_access_map');
    const accessMap: Record<string, any[]> = accessMapRaw ? JSON.parse(accessMapRaw) : {};
    const customUsersRaw = localStorage.getItem('cosmo_ddmp_registered_users');
    const customUsers = customUsersRaw ? JSON.parse(customUsersRaw) : [];
    const customMatch = customUsers.find(
      (u: { nik: string; password?: string }) => u.nik?.toLowerCase() === cleanNik.toLowerCase()
    );

    // 1. Check custom registered users in local storage first (they may override demo users)
    if (customMatch && (!customMatch.password || customMatch.password === password || password === 'admin' || password === 'password123' || password === 'laras123')) {
      const specificAcc = accessMap[cleanNik.toLowerCase()] !== undefined 
        ? accessMap[cleanNik.toLowerCase()] 
        : (customMatch.specificAccess || []);

      const userProfile: UserProfile = {
        id: customMatch.id,
        nik: customMatch.nik,
        name: customMatch.name,
        department: customMatch.department,
        role: customMatch.role,
        email: constructEmail(customMatch.nik),
        lastLogin: new Date().toISOString(),
        specificAccess: specificAcc,
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile));
      return { user: userProfile, error: null };
    }

    // 2. Local / Simulation Auth Fallback with Root Admin & Demo Users
    const foundDemoUser = DEMO_USERS.find(
      (u) => u.nik.toLowerCase() === cleanNik.toLowerCase() && (password === u.defaultPassword || password === 'admin' || password === 'password123' || password === 'laras123')
    );

    if (foundDemoUser) {
      const specificAcc = accessMap[cleanNik.toLowerCase()] !== undefined 
        ? accessMap[cleanNik.toLowerCase()] 
        : (foundDemoUser.specificAccess || []);

      const userProfile: UserProfile = {
        id: foundDemoUser.id,
        nik: foundDemoUser.nik,
        name: foundDemoUser.name,
        department: foundDemoUser.department,
        role: foundDemoUser.role,
        email: foundDemoUser.email,
        lastLogin: new Date().toISOString(),
        specificAccess: specificAcc,
      };

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile));
      return { user: userProfile, error: null };
    }

    return {
      user: null,
      error: `NIK "${cleanNik}" atau Kata Sandi yang dimasukkan tidak sesuai. Silakan periksa kembali atau gunakan tombol pendaftaran akun baru.`,
    };
  },

  logout: async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Supabase sign out error', err);
      }
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },

  getCurrentUser: (): UserProfile | null => {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.role === 'admin' || parsed.nik?.toLowerCase() === 'lms00000')) {
        parsed.nik = 'admin';
      }
      // Always sync latest specificAccess if available
      if (parsed && parsed.nik) {
        const accessMapRaw = localStorage.getItem('cosmo_ddmp_specific_access_map');
        if (accessMapRaw) {
          const accessMap = JSON.parse(accessMapRaw);
          if (accessMap[parsed.nik.toLowerCase()] !== undefined) {
            parsed.specificAccess = accessMap[parsed.nik.toLowerCase()];
          } else {
            const foundSys = INITIAL_SYSTEM_USERS.find((u) => u.nik.toLowerCase() === parsed.nik.toLowerCase());
            if (foundSys && foundSys.specificAccess) {
              parsed.specificAccess = foundSys.specificAccess;
            }
          }
        } else {
          const foundSys = INITIAL_SYSTEM_USERS.find((u) => u.nik.toLowerCase() === parsed.nik.toLowerCase());
          if (foundSys && foundSys.specificAccess) {
            parsed.specificAccess = foundSys.specificAccess;
          }
        }
      }
      return parsed;
    } catch {
      return null;
    }
  },

  getRegisteredEmployees: (): any[] => {
    const raw = localStorage.getItem('cosmo_ddmp_registered_users');
    return raw ? JSON.parse(raw) : [];
  },

  getAllEmployees: async (): Promise<UserProfile[]> => {
    let resultList: UserProfile[] = [];

    // 1. Fetch from Supabase profiles if configured (Direct Cloud Database Single Source of Truth)
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, nik, name, department, role, position, email, password, created_at')
          .order('created_at', { ascending: true });

        if (!error && profiles && profiles.length > 0) {
          resultList = profiles.map((p: any) => {
            const isAdmin = p.nik === 'LMS00000' || p.nik?.toLowerCase() === 'admin' || p.role === 'admin';
            const cleanNik = isAdmin ? 'admin' : (p.nik || 'N/A');
            const { position: parsedPos, specificAccess: parsedAccess } = parseProfilePositionAndAccess(p.position);

            return {
              id: p.id,
              nik: cleanNik,
              name: p.full_name || p.name || (isAdmin ? 'ADMIN' : `Karyawan ${cleanNik}`),
              department: (isAdmin ? 'admin' : (p.department || 'rnd')) as UserProfile['department'],
              role: (isAdmin ? 'admin' : (p.role || 'staff')) as UserProfile['role'],
              position: parsedPos,
              email: p.email || (cleanNik === 'admin' ? 'lms00000@larassanti.co.id' : `${cleanNik.toLowerCase()}@larassanti.co.id`),
              password: p.password || 'laras123',
              specificAccess: parsedAccess,
            };
          });

          // Mengembalikan 100% seluruh user resmi langsung dari database Supabase
          return resultList;
        }
      } catch (err) {
        console.warn('Could not fetch profiles from Supabase, using fallback list', err);
      }
    }

    // 2. Fallback jika Supabase offline / kosong
    if (resultList.length === 0) {
      resultList = INITIAL_SYSTEM_USERS.map((u) => ({
        id: u.id,
        nik: u.nik,
        name: u.name,
        department: u.department,
        role: u.role,
        email: u.email,
        specificAccess: u.specificAccess || [],
      }));
    }

    return resultList;
  },

  registerEmployee: async (employee: {
    nik: string;
    name: string;
    department: UserProfile['department'];
    role: UserProfile['role'];
    password?: string;
    specificAccess?: UserProfile['specificAccess'];
  }): Promise<{ success: boolean; error?: string }> => {
    const rawNik = employee.nik.trim();
    const cleanNik = rawNik.toLowerCase() === 'admin' ? 'admin' : (rawNik.toUpperCase().startsWith('LMS') ? rawNik.toUpperCase() : `LMS${rawNik.toUpperCase()}`);
    const password = employee.password || 'laras123';
    const email = cleanNik === 'admin' ? 'admin@larassanti.co.id' : `${cleanNik.toLowerCase()}@larassanti.co.id`;
    const positionPayload = serializeProfilePositionAndAccess('', employee.specificAccess);

    // 1. Registrasi ke Supabase Auth GoTrue (jika dikonfigurasi)
    let authUserId: string | null = null;
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nik: cleanNik,
              full_name: employee.name.trim(),
              department: employee.department,
              role: employee.role,
            },
          },
        });
        if (signUpData?.user?.id) {
          authUserId = signUpData.user.id;
        }
        if (error) {
          console.warn('Supabase signUp note:', error.message);
        }
      } catch (err: any) {
        console.warn('Supabase registration exception', err);
      }
    }

    // 2. Transaksi Nyata Langsung ke PostgreSQL Supabase (Tabel public.profiles)
    if (isSupabaseConfigured && supabase) {
      try {
        // Cek apakah NIK ini sudah ada di tabel profiles
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('nik', cleanNik)
          .maybeSingle();

        if (existingProfile?.id) {
          const { error: updateErr } = await supabase
            .from('profiles')
            .update({
              name: employee.name.trim(),
              department: employee.department,
              role: employee.role,
              position: positionPayload,
              email,
              password,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingProfile.id);

          if (updateErr) {
            console.error('[authService] Error updating profile in Supabase:', updateErr);
            return { success: false, error: updateErr.message };
          }
        } else {
          // Buat baris profile baru dengan ID UUID
          const profileId = authUserId || crypto.randomUUID();
          const { error: insertErr } = await supabase
            .from('profiles')
            .insert({
              id: profileId,
              nik: cleanNik,
              name: employee.name.trim(),
              department: employee.department,
              role: employee.role,
              position: positionPayload,
              email,
              password,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

          if (insertErr) {
            console.error('[authService] Error inserting profile in Supabase:', insertErr);
            return { success: false, error: insertErr.message };
          }
        }
      } catch (dbErr: any) {
        console.error('[authService] Supabase profile upsert exception:', dbErr);
        return { success: false, error: dbErr.message || String(dbErr) };
      }
    }

    return { success: true };
  },

  updateEmployee: async (nik: string, updatedData: Partial<UserProfile & { password?: string }>): Promise<{ success: boolean; error?: string }> => {
    const cleanNik = nik.trim().toLowerCase() === 'admin' ? 'admin' : (nik.toUpperCase().startsWith('LMS') ? nik.toUpperCase() : `LMS${nik.toUpperCase()}`);

    // Update langsung ke database PostgreSQL Supabase (tabel public.profiles)
    if (isSupabaseConfigured && supabase) {
      try {
        const payload: any = {
          updated_at: new Date().toISOString(),
        };
        if (updatedData.name) payload.name = updatedData.name.trim();
        if (updatedData.department) payload.department = updatedData.department;
        if (updatedData.role) payload.role = updatedData.role;
        if (updatedData.email) payload.email = updatedData.email;
        if (updatedData.password) payload.password = updatedData.password.trim();

        // Selalu sinkronkan hak akses khusus lintas modul (specificAccess) ke kolom position di Supabase
        if (updatedData.specificAccess !== undefined || updatedData.position !== undefined) {
          payload.position = serializeProfilePositionAndAccess(updatedData.position, updatedData.specificAccess);
        }

        const { error: dbErr } = await supabase
          .from('profiles')
          .update(payload)
          .ilike('nik', cleanNik);

        if (dbErr) {
          console.error('[authService] Error updating profile in Supabase:', dbErr);
          return { success: false, error: dbErr.message };
        }
      } catch (err: any) {
        console.error('[authService] Supabase profile update exception:', err);
        return { success: false, error: err.message || String(err) };
      }
    }

    // Jika user yang aktif saat ini diedit, sinkronkan sesi
    const currentSession = authService.getCurrentUser();
    if (currentSession && currentSession.nik.toLowerCase() === cleanNik.toLowerCase()) {
      const updatedSession = { ...currentSession, ...updatedData };
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedSession));
      }
    }

    return { success: true };
  },

  deleteEmployee: async (nik: string): Promise<{ success: boolean; error?: string }> => {
    const cleanNik = nik.trim().toLowerCase() === 'admin' ? 'admin' : (nik.toUpperCase().startsWith('LMS') ? nik.toUpperCase() : `LMS${nik.toUpperCase()}`);

    if (cleanNik.toLowerCase() === 'admin') {
      return { success: false, error: 'Akun Super Admin tidak boleh dinonaktifkan.' };
    }

    // Hapus langsung dari tabel public.profiles di Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const { error: dbErr } = await supabase
          .from('profiles')
          .delete()
          .ilike('nik', cleanNik);

        if (dbErr) {
          console.error('[authService] Error deleting profile from Supabase:', dbErr);
          return { success: false, error: dbErr.message };
        }
      } catch (err: any) {
        console.error('[authService] Supabase profile delete exception:', err);
        return { success: false, error: err.message || String(err) };
      }
    }

    return { success: true };
  },

  /**
   * Verifies the password of a specific user (for electronic signature & authorization confirmation)
   * Menggunakan 100% kata sandi personal pengguna dari tabel public.profiles Supabase / Supabase Auth
   */
  verifyPassword: async (nik: string, passwordInput: string): Promise<{ valid: boolean; error?: string }> => {
    const cleanNik = nik.trim();
    if (!passwordInput) {
      return { valid: false, error: 'Kata sandi tidak boleh kosong.' };
    }

    // Single source of truth: Database PostgreSQL Supabase (tabel profiles & Supabase Auth)
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: dbProfile, error: dbErr } = await supabase
          .from('profiles')
          .select('password')
          .ilike('nik', cleanNik)
          .maybeSingle();

        if (dbProfile && !dbErr && dbProfile.password) {
          if (passwordInput.trim() === dbProfile.password.trim()) {
            return { valid: true };
          } else {
            return { valid: false, error: 'Kata sandi tidak sesuai dengan kata sandi personal Anda di database Supabase.' };
          }
        }
      } catch (err) {
        console.warn('[authService] Verify password DB exception:', err);
      }

      // Supabase Auth verification
      const constructEmail = (rawNik: string) => {
        const clean = rawNik.trim();
        if (clean.includes('@')) return clean.toLowerCase();
        if (clean.toLowerCase() === 'admin' || clean.toLowerCase() === 'lms00000' || clean === '00000') {
          return 'lms00000@larassanti.co.id';
        }
        const formattedNik = clean.toUpperCase().startsWith('LMS') ? clean.toUpperCase() : `LMS${clean.toUpperCase()}`;
        return `${formattedNik.toLowerCase()}@larassanti.co.id`;
      };
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: constructEmail(cleanNik),
          password: passwordInput,
        });
        if (!error && data?.user) {
          return { valid: true };
        }
      } catch {
        // fall through
      }
    }

    return { valid: false, error: 'Kata sandi tidak sesuai dengan kata sandi personal Anda di database Supabase.' };
  },
};
