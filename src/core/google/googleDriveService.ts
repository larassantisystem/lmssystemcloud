import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';
import { supabase } from '../auth/supabaseClient';

// Initialize Firebase App singleton safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Provider with Google Drive scope
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive');
provider.setCustomParameters({
  login_hint: 'larassantisystem@gmail.com',
  prompt: 'select_account',
});

// Central Storage Key in Supabase
const CENTRAL_CONFIG_NIK = 'SYSTEM_GDRIVE_CENTRAL';
const CENTRAL_ROW_ID = '00000000-0000-0000-0000-000000000001';

// Strictly in-memory cache for access token & central state
let cachedAccessToken: string | null = null;
let cachedCentralUser: { displayName?: string; emailAddress?: string; photoLink?: string } | null = null;
let isSigningIn = false;

// Standard CPKB Folder Structure Constants
export const CPKB_ROOT_FOLDER_NAME = 'Sistem CPKB PT Larassanti Makmur Sejahtera';

export const CPKB_FOLDERS = [
  { key: 'coa', name: '01 - Dokumen CoA Bahan Baku & Kemas', description: 'Arsip Sertifikat Analisis (CoA) Produsen & Internal' },
  { key: 'qc', name: '02 - Arsip Laporan Uji QC & Sertifikasi Mutu', description: 'Laporan pengujian lab, sampling, dan otorisasi rilis' },
  { key: 'grn', name: '03 - Laporan Penerimaan Gudang (GRN)', description: 'Bukti penerimaan barang gudang dan surat jalan' },
  { key: 'production', name: '04 - Catatan Bets Produksi (BMR/BPR)', description: 'Master formula, peracikan batch, dan filling packing' },
  { key: 'regulatory', name: '05 - Dokumen Regulasi & SOP CPKB', description: 'SOP mutu, MSDS bahan, Sertifikasi Halal & Izin Edar BPOM' },
] as const;

export type CpkbFolderKey = typeof CPKB_FOLDERS[number]['key'];

// In-memory cache for folder IDs
let cachedFolderMap: { rootId?: string; subfolders: Record<string, string> } | null = null;

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  parents?: string[];
}

export const googleDriveService = {
  // Init auth listener and sync central config from Supabase
  initAuth: (
    onAuthSuccess?: (user: any, token: string) => void,
    onAuthFailure?: () => void
  ) => {
    // 1. Initial attempt to load central config from Supabase
    googleDriveService.syncFromCentralDatabase().then((token) => {
      if (token && cachedCentralUser && onAuthSuccess) {
        onAuthSuccess(cachedCentralUser, token);
      }
    }).catch(() => {});

    // 2. Local auth listener
    return onAuthStateChanged(auth, async (user: User | null) => {
      if (user && cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (!cachedAccessToken) {
          if (onAuthFailure) onAuthFailure();
        }
      }
    });
  },

  // Sync token and account info from Supabase Central record
  syncFromCentralDatabase: async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, password, updated_at')
        .eq('nik', CENTRAL_CONFIG_NIK)
        .single();

      if (!error && data?.password) {
        const parsed = JSON.parse(data.password);
        if (parsed?.accessToken) {
          cachedAccessToken = parsed.accessToken;
          cachedCentralUser = {
            displayName: parsed.displayName || 'Google Drive Perusahaan',
            emailAddress: parsed.email || data.email || 'larassantisystem@gmail.com',
            photoLink: parsed.photoURL,
          };
          if (parsed.folderMap) {
            cachedFolderMap = parsed.folderMap;
          }
          return cachedAccessToken;
        }
      }
    } catch (err) {
      console.warn('[GoogleDrive] Sync central config notice:', err);
    }
    return cachedAccessToken;
  },

  // Save Central token to Supabase
  saveCentralToDatabase: async (
    token: string,
    user: { displayName?: string | null; email?: string | null; photoURL?: string | null }
  ) => {
    try {
      const payload = JSON.stringify({
        accessToken: token,
        displayName: user.displayName || 'Google Drive Perusahaan',
        email: user.email || 'larassantisystem@gmail.com',
        photoURL: user.photoURL,
        folderMap: cachedFolderMap,
        updatedAt: new Date().toISOString(),
      });

      await supabase.from('profiles').upsert({
        id: CENTRAL_ROW_ID,
        nik: CENTRAL_CONFIG_NIK,
        name: 'Central Google Drive Config',
        department: 'management',
        role: 'admin',
        email: user.email || 'larassantisystem@gmail.com',
        password: payload,
      });
    } catch (err) {
      console.warn('[GoogleDrive] Save central database notice:', err);
    }
  },

  // Clear Central token from Supabase (When Admin disconnects)
  clearCentralFromDatabase: async () => {
    try {
      const emptyPayload = JSON.stringify({
        accessToken: null,
        updatedAt: new Date().toISOString(),
      });

      await supabase.from('profiles').upsert({
        id: CENTRAL_ROW_ID,
        nik: CENTRAL_CONFIG_NIK,
        name: 'Central Google Drive Config',
        department: 'management',
        role: 'admin',
        email: 'larassantisystem@gmail.com',
        password: emptyPayload,
      });
    } catch (err) {
      console.warn('[GoogleDrive] Clear central database notice:', err);
    }
  },

  // Interactive Google Sign-In with popup (Admin Only)
  signInWithGoogleDrive: async (): Promise<{ user: User; accessToken: string } | null> => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Gagal memperoleh access token Google Drive dari autentikasi.');
      }

      cachedAccessToken = credential.accessToken;
      cachedCentralUser = {
        displayName: result.user.displayName || 'Google Drive Perusahaan',
        emailAddress: result.user.email || 'larassantisystem@gmail.com',
        photoLink: result.user.photoURL || undefined,
      };

      // Ensure folders & save centrally to Supabase for all other users
      await googleDriveService.ensureCpkbFolders().catch(() => {});
      await googleDriveService.saveCentralToDatabase(cachedAccessToken, result.user);

      return { user: result.user, accessToken: cachedAccessToken };
    } catch (error: any) {
      if (
        error?.code === 'auth/popup-closed-by-user' ||
        error?.code === 'auth/cancelled-popup-request'
      ) {
        console.info('[GoogleDrive] Sign-in popup ditutup atau dibatalkan oleh pengguna.');
        return null;
      }
      if (error?.code === 'auth/popup-blocked') {
        throw new Error('Popup login Google diblokir oleh browser. Harap izinkan pop-up pada peramban Anda.');
      }
      if (error?.code === 'auth/unauthorized-domain') {
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
        throw new Error(`Domain (${hostname}) belum diizinkan di Authorized Domains Firebase Console.`);
      }
      console.warn('[GoogleDrive] Sign-in notice:', error?.message || error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  },

  // Get cached access token in memory or fallback to Supabase central
  getAccessToken: async (): Promise<string | null> => {
    if (cachedAccessToken) return cachedAccessToken;
    return await googleDriveService.syncFromCentralDatabase();
  },

  // Set token directly in memory if obtained
  setCachedToken: (token: string | null) => {
    cachedAccessToken = token;
  },

  // Sign out and clear in-memory token (Admin Only)
  signOutGoogleDrive: async (): Promise<void> => {
    await signOut(auth);
    cachedAccessToken = null;
    cachedCentralUser = null;
    cachedFolderMap = null;
    await googleDriveService.clearCentralFromDatabase();
  },

  // Check if currently connected (either in memory or central DB)
  isConnected: (): boolean => {
    return !!(cachedAccessToken || (auth.currentUser && cachedAccessToken));
  },

  getCentralUser: () => {
    return cachedCentralUser || (auth.currentUser ? {
      displayName: auth.currentUser.displayName || 'Google Drive Perusahaan',
      emailAddress: auth.currentUser.email || 'larassantisystem@gmail.com',
      photoLink: auth.currentUser.photoURL || undefined,
    } : null);
  },

  // Ensure full CPKB Folder hierarchy exists in Google Drive
  ensureCpkbFolders: async (): Promise<{ rootId: string; subfolders: Record<string, string> }> => {
    const token = await googleDriveService.getAccessToken();
    if (!token) {
      throw new Error('Sesi Google Drive belum tersambung.');
    }

    if (cachedFolderMap && cachedFolderMap.rootId) {
      return cachedFolderMap as { rootId: string; subfolders: Record<string, string> };
    }

    // 1. Find or create Root Folder
    let rootId: string | null = null;
    const rootQuery = encodeURIComponent(
      `name = '${CPKB_ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );

    const rootSearchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${rootQuery}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (rootSearchRes.ok) {
      const data = await rootSearchRes.json();
      if (data.files && data.files.length > 0) {
        rootId = data.files[0].id;
      }
    }

    if (!rootId) {
      const rootCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: CPKB_ROOT_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          description: 'Folder Induk Sistem Manajemen CPKB PT Larassanti Makmur Sejahtera',
        }),
      });
      if (rootCreateRes.ok) {
        const rootCreated = await rootCreateRes.json();
        rootId = rootCreated.id;
      } else {
        throw new Error('Gagal membuat Folder Induk CPKB di Google Drive.');
      }
    }

    // 2. Find or create each Subfolder inside Root Folder
    const subfolderMap: Record<string, string> = {};

    for (const folderConfig of CPKB_FOLDERS) {
      const subQuery = encodeURIComponent(
        `name = '${folderConfig.name}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );

      const subSearchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${subQuery}&fields=files(id,name)`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      let subId: string | null = null;
      if (subSearchRes.ok) {
        const subData = await subSearchRes.json();
        if (subData.files && subData.files.length > 0) {
          subId = subData.files[0].id;
        }
      }

      if (!subId) {
        const subCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: folderConfig.name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootId],
            description: folderConfig.description,
          }),
        });
        if (subCreateRes.ok) {
          const subCreated = await subCreateRes.json();
          subId = subCreated.id;
        }
      }

      if (subId) {
        subfolderMap[folderConfig.key] = subId;
      }
    }

    cachedFolderMap = { rootId: rootId!, subfolders: subfolderMap };
    return cachedFolderMap as { rootId: string; subfolders: Record<string, string> };
  },

  // Get specific folder ID by CPKB key
  getCpkbFolderId: async (key: CpkbFolderKey): Promise<string | null> => {
    try {
      const structure = await googleDriveService.ensureCpkbFolders();
      return structure.subfolders[key] || structure.rootId;
    } catch (err) {
      console.warn('[GoogleDrive] Could not resolve folder ID, falling back to root:', err);
      return null;
    }
  },

  // List files & folders from Google Drive
  listFiles: async (params?: {
    query?: string;
    folderId?: string;
    pageSize?: number;
  }): Promise<DriveFileItem[]> => {
    const token = await googleDriveService.getAccessToken();
    if (!token) {
      throw new Error('Sesi Google Drive belum tersambung. Hubungkan akun Google Drive terlebih dahulu.');
    }

    const pageSize = params?.pageSize || 40;
    const queries: string[] = ['trashed = false'];

    if (params?.folderId) {
      queries.push(`'${params.folderId}' in parents`);
    }

    if (params?.query && params.query.trim()) {
      const cleanQ = params.query.replace(/'/g, "\\'");
      queries.push(`name contains '${cleanQ}'`);
    }

    const q = encodeURIComponent(queries.join(' and '));
    const fields = encodeURIComponent('files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, iconLink, parents)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${pageSize}&fields=${fields}&orderBy=folder,modifiedTime desc`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `Gagal mengambil daftar file: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.files || [];
  },

  // Create folder in Google Drive
  createFolder: async (folderName: string, parentFolderId?: string): Promise<DriveFileItem> => {
    const token = await googleDriveService.getAccessToken();
    if (!token) {
      throw new Error('Sesi Google Drive belum tersambung.');
    }

    const metadata: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Gagal membuat folder di Google Drive.');
    }

    return await response.json();
  },

  // Upload or Backup file to Google Drive (Multipart upload)
  uploadFile: async (
    fileName: string,
    mimeType: string,
    content: string | Blob,
    parentFolderId?: string,
    folderCategory?: CpkbFolderKey
  ): Promise<DriveFileItem> => {
    const token = await googleDriveService.getAccessToken();
    if (!token) {
      throw new Error('Sesi Google Drive belum tersambung.');
    }

    let targetFolderId = parentFolderId;
    if (!targetFolderId && folderCategory) {
      targetFolderId = (await googleDriveService.getCpkbFolderId(folderCategory)) || undefined;
    }

    const metadata: any = {
      name: fileName,
      mimeType,
    };
    if (targetFolderId) {
      metadata.parents = [targetFolderId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    let bodyData: Uint8Array;

    if (typeof content === 'string') {
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n` +
        content +
        closeDelimiter;
      bodyData = new TextEncoder().encode(multipartRequestBody);
    } else {
      const fileData = await content.arrayBuffer();
      const fileBytes = new Uint8Array(fileData);

      const metadataString = JSON.stringify(metadata);
      const multipartHeader =
        `${delimiter}` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadataString}` +
        `${delimiter}` +
        `Content-Type: ${mimeType}\r\n\r\n`;

      const headerBytes = new TextEncoder().encode(multipartHeader);
      const footerBytes = new TextEncoder().encode(closeDelimiter);

      bodyData = new Uint8Array(headerBytes.length + fileBytes.length + footerBytes.length);
      bodyData.set(headerBytes, 0);
      bodyData.set(fileBytes, headerBytes.length);
      bodyData.set(footerBytes, headerBytes.length + fileBytes.length);
    }

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,size,createdTime',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: bodyData,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Gagal mengunggah file ke Google Drive.');
    }

    return await response.json();
  },

  // Delete file in Google Drive (Destructive)
  deleteFile: async (fileId: string): Promise<void> => {
    const token = await googleDriveService.getAccessToken();
    if (!token) {
      throw new Error('Sesi Google Drive belum tersambung.');
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Gagal menghapus file dari Google Drive.');
    }
  },

  // Get user storage info
  getAbout: async (): Promise<{
    user?: { displayName: string; emailAddress: string; photoLink?: string };
    storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
  }> => {
    const token = await googleDriveService.getAccessToken();
    if (!token) {
      throw new Error('Sesi Google Drive belum tersambung.');
    }

    const response = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Gagal mengambil informasi akun Google Drive.');
    }

    return await response.json();
  },
};
