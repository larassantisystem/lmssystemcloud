import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';
import { supabase } from '../auth/supabaseClient';

// Initialize or reuse Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive');
provider.setCustomParameters({
  login_hint: 'larassantisystem@gmail.com',
  prompt: 'select_account',
});

const CENTRAL_CONFIG_NIK = 'SYSTEM_GDRIVE_CENTRAL';

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUser: any = null;

export const CPKB_ROOT_FOLDER = 'Sistem CPKB PT Larassanti Makmur Sejahtera';
export const CPKB_COA_FOLDER = '01 - Dokumen CoA Bahan Baku & Kemas';

export interface DriveUploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink?: string;
  mimeType: string;
}

export const initDriveAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Sync central on init
  getDriveAccessToken().then((token) => {
    if (token && cachedUser && onAuthSuccess) {
      onAuthSuccess(cachedUser, token);
    }
  }).catch(() => {});

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (!isSigningIn && !cachedAccessToken) {
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const googleDriveSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal memperoleh access token Google Drive dari autentikasi.');
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = {
      displayName: result.user.displayName || 'Google Drive Perusahaan',
      email: result.user.email || 'larassantisystem@gmail.com',
      photoURL: result.user.photoURL,
    };

    // Simpan token sentral secara permanen ke Supabase agar seluruh sistem & pengguna selalu terhubung
    try {
      const payload = JSON.stringify({
        accessToken: cachedAccessToken,
        displayName: result.user.displayName || 'Google Drive Perusahaan',
        email: result.user.email || 'larassantisystem@gmail.com',
        photoURL: result.user.photoURL,
        updatedAt: new Date().toISOString(),
      });

      await supabase.from('profiles').upsert({
        id: '00000000-0000-0000-0000-000000000001',
        nik: CENTRAL_CONFIG_NIK,
        name: 'Central Google Drive Config',
        department: 'management',
        role: 'admin',
        email: result.user.email || 'larassantisystem@gmail.com',
        password: payload,
      });
    } catch (saveErr) {
      console.warn('Failed to save central token to Supabase:', saveErr);
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      const cancelError = new Error('Autentikasi Google Drive dibatalkan (jendela ditutup).');
      (cancelError as any).code = error.code;
      (cancelError as any).isCancelled = true;
      throw cancelError;
    } else if (error?.code === 'auth/popup-blocked') {
      const blockedError = new Error(
        'Pop-up Google diblokir oleh peramban. Silakan izinkan pop-up atau buka aplikasi di tab baru.'
      );
      (blockedError as any).code = error.code;
      throw blockedError;
    } else if (error?.code === 'auth/unauthorized-domain') {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
      const unauthError = new Error(
        `Domain (${hostname}) belum didaftarkan di Authorized Domains Firebase Console.`
      );
      (unauthError as any).code = error.code;
      throw unauthError;
    }

    console.warn('Google Drive sign in notice:', error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = async (forceRefresh = false): Promise<string | null> => {
  if (cachedAccessToken && !forceRefresh) return cachedAccessToken;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email, password')
      .eq('nik', CENTRAL_CONFIG_NIK)
      .single();

    if (!error && data?.password) {
      const parsed = JSON.parse(data.password);
      if (parsed?.accessToken) {
        cachedAccessToken = parsed.accessToken;
        cachedUser = {
          displayName: parsed.displayName || 'Google Drive Perusahaan',
          email: parsed.email || data.email || 'larassantisystem@gmail.com',
          photoURL: parsed.photoURL,
        };
        return cachedAccessToken;
      }
    }
  } catch (err) {
    console.warn('Central token lookup notice:', err);
  }
  return cachedAccessToken;
};

export const getDriveUser = (): any => {
  return cachedUser || auth.currentUser;
};

export const googleDriveSignOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedUser = null;
};

/**
 * Helper to ensure the standard CPKB CoA folder hierarchy exists in Google Drive
 */
async function getOrCreateCoaFolder(token: string): Promise<string | null> {
  try {
    // 1. Get or create Root CPKB folder
    let rootId: string | null = null;
    const rootQuery = encodeURIComponent(
      `name = '${CPKB_ROOT_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );

    const rootRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${rootQuery}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (rootRes.ok) {
      const data = await rootRes.json();
      if (data.files && data.files.length > 0) {
        rootId = data.files[0].id;
      }
    }

    if (!rootId) {
      const createRootRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: CPKB_ROOT_FOLDER,
          mimeType: 'application/vnd.google-apps.folder',
          description: 'Folder Induk Sistem Manajemen CPKB PT Larassanti Makmur Sejahtera',
        }),
      });
      if (createRootRes.ok) {
        const rootFolder = await createRootRes.json();
        rootId = rootFolder.id;
      }
    }

    // 2. Get or create CoA subfolder inside Root
    if (rootId) {
      const coaQuery = encodeURIComponent(
        `name = '${CPKB_COA_FOLDER}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      const coaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${coaQuery}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (coaRes.ok) {
        const data = await coaRes.json();
        if (data.files && data.files.length > 0) {
          return data.files[0].id;
        }
      }

      const createCoaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: CPKB_COA_FOLDER,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootId],
          description: 'Arsip Sertifikat Analisis (CoA) Bahan Baku & Kemas Standar CPKB',
        }),
      });

      if (createCoaRes.ok) {
        const coaFolder = await createCoaRes.json();
        return coaFolder.id;
      }
    }
  } catch (err) {
    console.warn('Could not create CPKB CoA folder hierarchy, falling back to root:', err);
  }
  return null;
}

/**
 * Upload file directly to Google Drive via multipart upload
 */
export const uploadCoaFileToDrive = async (
  file: File,
  metadata: {
    grnNumber?: string;
    materialName?: string;
    batchNumber?: string;
  }
): Promise<DriveUploadResult> => {
  let token = await getDriveAccessToken();
  if (!token) {
    // Attempt sign in if not currently signed in
    const authResult = await googleDriveSignIn();
    token = authResult.accessToken;
  }

  const folderId = await getOrCreateCoaFolder(token);

  // Construct formatted descriptive filename for CPKB record
  const ext = file.name.split('.').pop() || 'pdf';
  const cleanBatch = metadata.batchNumber ? `_Batch-${metadata.batchNumber}` : '';
  const cleanGrn = metadata.grnNumber ? `[${metadata.grnNumber}]_` : '';
  const driveFileName = `${cleanGrn}CoA_${metadata.materialName || 'Bahan'}${cleanBatch}.${ext}`.replace(
    /[\/\\]/g,
    '-'
  );

  const fileMetadata: Record<string, any> = {
    name: driveFileName,
    description: `Sertifikat Analisis (CoA) Mutu CPKB untuk GRN ${metadata.grnNumber || '-'} (${metadata.materialName || '-'}). Batch: ${metadata.batchNumber || '-'}`,
  };

  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  // Read file as binary array buffer
  const fileData = await file.arrayBuffer();
  const fileBytes = new Uint8Array(fileData);

  // Build multipart payload
  const metadataString = JSON.stringify(fileMetadata);
  const multipartHeader =
    `${delimiter}` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataString}` +
    `${delimiter}` +
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;

  const headerBytes = new TextEncoder().encode(multipartHeader);
  const footerBytes = new TextEncoder().encode(closeDelimiter);

  const combinedBody = new Uint8Array(
    headerBytes.length + fileBytes.length + footerBytes.length
  );
  combinedBody.set(headerBytes, 0);
  combinedBody.set(fileBytes, headerBytes.length);
  combinedBody.set(footerBytes, headerBytes.length + fileBytes.length);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combinedBody,
    }
  );

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Gagal mengunggah file ke Google Drive: ${uploadRes.status} ${errorText}`);
  }

  const uploaded = await uploadRes.json();

  return {
    fileId: uploaded.id,
    fileName: uploaded.name || driveFileName,
    webViewLink:
      uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view?usp=drivesdk`,
    webContentLink: uploaded.webContentLink,
    mimeType: uploaded.mimeType || file.type,
  };
};

/**
 * Search for existing CoA files in Google Drive by filename or query
 */
export const searchCoaFileInDrive = async (
  queryName: string
): Promise<{ fileId: string; fileName: string; webViewLink: string } | null> => {
  try {
    let token = await getDriveAccessToken();
    if (!token) return null;

    const cleanName = queryName.replace(/['\\]/g, '').trim();
    if (!cleanName) return null;

    const q = encodeURIComponent(`name contains '${cleanName}' and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink)&pageSize=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        const f = data.files[0];
        return {
          fileId: f.id,
          fileName: f.name,
          webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        };
      }
    }
  } catch (err) {
    console.warn('Search in drive notice:', err);
  }
  return null;
};
