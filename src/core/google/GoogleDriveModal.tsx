import React, { useState, useEffect } from 'react';
import {
  X,
  HardDrive,
  Cloud,
  CheckCircle2,
  FolderPlus,
  RefreshCw,
  Search,
  ExternalLink,
  Trash2,
  FileText,
  Folder,
  Upload,
  AlertTriangle,
  LogOut,
  ShieldCheck,
  Database,
  Info,
} from 'lucide-react';
import {
  googleDriveService,
  DriveFileItem,
  CPKB_FOLDERS,
  CPKB_ROOT_FOLDER_NAME,
} from './googleDriveService';
import { useAuth } from '../auth/AuthContext';
import { warehouseService } from '../../features/warehouse/warehouseService';
import { qualityService } from '../../features/quality/qualityService';
import { useEscapeKey } from '../utils/useEscapeKey';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({ isOpen, onClose }) => {
  useEscapeKey(onClose, isOpen);

  const { user } = useAuth();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin' || user?.department === 'management';

  const [isConnected, setIsConnected] = useState<boolean>(googleDriveService.isConnected());
  const [currentUser, setCurrentUser] = useState<any>(googleDriveService.getCentralUser());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // Files list
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [storageInfo, setStorageInfo] = useState<any>(null);

  // Folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Confirmation Modal for Destructive Deletion (Mandatory per Skill)
  const [fileToDelete, setFileToDelete] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check auth state
  useEffect(() => {
    if (!isOpen) return;

    googleDriveService.syncFromCentralDatabase().then((token) => {
      if (token) {
        setIsConnected(true);
        setCurrentUser(googleDriveService.getCentralUser());
        fetchDriveData();
      } else if (googleDriveService.isConnected()) {
        setIsConnected(true);
        fetchDriveData();
      } else {
        setIsConnected(false);
      }
    });
  }, [isOpen]);

  const fetchDriveData = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const [driveFiles, about] = await Promise.all([
        googleDriveService.listFiles({ query: searchQuery }),
        googleDriveService.getAbout().catch(() => null),
      ]);
      setFiles(driveFiles);
      if (about) {
        setStorageInfo(about.storageQuota);
        if (about.user) {
          setCurrentUser(about.user);
        }
      }
    } catch (err: any) {
      console.warn('[GoogleDrive] Fetch notice:', err);
      setActionMessage({ text: err.message || 'Gagal memuat data Google Drive', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await googleDriveService.signInWithGoogleDrive();
      if (!res) {
        // User closed or dismissed the popup gracefully
        setActionMessage({
          text: 'Jendela popup Google ditutup. Silakan klik tombol "Sign in with Google" kembali jika Anda ingin menghubungkan akun.',
          type: 'info',
        });
        return;
      }
      setIsConnected(true);
      setCurrentUser(res.user);
      await googleDriveService.ensureCpkbFolders();
      await fetchDriveData();
      setActionMessage({
        text: `Berhasil tersambung ke Google Drive (${res.user.email})! Struktur 5 folder CPKB resmi telah dibuat otomatis di Drive Anda.`,
        type: 'success',
      });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Login Google Drive dibatalkan.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleDriveService.signOutGoogleDrive();
      setIsConnected(false);
      setCurrentUser(null);
      setFiles([]);
      setStorageInfo(null);
      setActionMessage({ text: 'Koneksi Google Drive telah ditutup.', type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Gagal logout.', type: 'error' });
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsLoading(true);
    try {
      await googleDriveService.createFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
      await fetchDriveData();
      setActionMessage({ text: `Folder "${newFolderName}" berhasil dibuat di Drive.`, type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Gagal membuat folder.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Explicit confirmation required for file deletion
  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    try {
      await googleDriveService.deleteFile(fileToDelete.id);
      setActionMessage({ text: `File "${fileToDelete.name}" berhasil dihapus dari Drive.`, type: 'success' });
      setFileToDelete(null);
      await fetchDriveData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Gagal menghapus file.', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Inisialisasi / Sinkronkan Struktur 5 Folder Standar CPKB
  const handleInitFolders = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      await googleDriveService.ensureCpkbFolders();
      await fetchDriveData();
      setActionMessage({
        text: `Struktur 5 Folder Standar CPKB berhasil disinkronkan ke folder "${CPKB_ROOT_FOLDER_NAME}"!`,
        type: 'success',
      });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Gagal menyiapkan folder CPKB.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Backup GRN to Google Drive
  const handleBackupGrn = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const grns = await warehouseService.getGrnRecords();
      const csvHeader = 'No GRN,Kode Bahan,Nama Bahan,Tipe,Pemasok,No Batch,Tgl Terima,Status QC,Lokasi\n';
      const csvRows = grns.map((g) =>
        `"${g.grnNumber}","${g.materialCode}","${g.materialName}","${g.materialType}","${g.distributor}","${g.batchNumber || ''}","${g.receivedDate}","${g.qcStatus}","${g.storageLocation || ''}"`
      ).join('\n');

      const csvContent = csvHeader + csvRows;
      const fileName = `Backup_GRN_CPKB_${new Date().toISOString().slice(0, 10)}.csv`;

      await googleDriveService.uploadFile(fileName, 'text/csv', csvContent, undefined, 'grn');
      await fetchDriveData();
      setActionMessage({ text: `Data GRN berhasil dicadangkan ke folder "03 - Laporan Penerimaan Gudang (GRN)": "${fileName}"`, type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Gagal mencadangkan data GRN.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Backup QC Reports to Google Drive
  const handleBackupQc = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const reports = await qualityService.getReports();
      const jsonContent = JSON.stringify(reports, null, 2);
      const fileName = `Backup_QC_Inspection_CPKB_${new Date().toISOString().slice(0, 10)}.json`;

      await googleDriveService.uploadFile(fileName, 'application/json', jsonContent, undefined, 'qc');
      await fetchDriveData();
      setActionMessage({ text: `Data Arsip QC berhasil dicadangkan ke folder "02 - Arsip Laporan Uji QC & Sertifikasi Mutu": "${fileName}"`, type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Gagal mencadangkan data QC.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-sm tracking-wide flex items-center gap-2">
                <span>Google Drive Integration</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white font-normal">
                  larassantisystem@gmail.com
                </span>
              </h3>
              <p className="text-[11px] text-blue-100">
                Sinkronisasi data dokumen CPKB, pencadangan laporan, dan pengelolaan berkas cloud.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Message Alert */}
        {actionMessage && (
          <div
            className={`px-5 py-2.5 text-xs font-semibold flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                : actionMessage.type === 'info'
                ? 'bg-blue-50 text-blue-800 border-b border-blue-200'
                : 'bg-rose-50 text-rose-800 border-b border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : actionMessage.type === 'info' ? (
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {!isConnected ? (
            /* Unconnected State: Show Official Sign in with Google Button (Admin only) or Notice for staff */
            isAdmin ? (
              <div className="py-8 text-center max-w-md mx-auto space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200 shadow-sm">
                  <HardDrive className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider mb-1">
                    <ShieldCheck className="w-3 h-3" /> Panel Administrator
                  </div>
                  <h4 className="font-black text-slate-800 text-base">
                    Hubungkan Akun Google Drive Perusahaan
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sebagai Administrator, sambungkan akun <strong>larassantisystem@gmail.com</strong> agar seluruh staf (Gudang, QC, Produksi, R&D) otomatis terhubung dan dapat mengunggah berkas ke Google Drive perusahaan tanpa perlu login masing-masing.
                  </p>
                </div>

                {/* Official Sign in with Google button styling per Skill guidelines */}
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={handleSignIn}
                    disabled={isLoading}
                    className="flex items-center gap-3 px-5 py-3 rounded-full border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 shadow-sm hover:shadow transition-all cursor-pointer font-medium text-slate-700 text-sm disabled:opacity-50"
                  >
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    <span>{isLoading ? 'Menghubungkan...' : 'Sign in with Google (Admin)'}</span>
                  </button>
                </div>

                {/* Troubleshooting Card for Authorized Domains & OAuth Test users */}
                <div className="text-left bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 space-y-3">
                  {/* 1. Unauthorized Domain Troubleshooting */}
                  <div className="space-y-1.5 border-b border-amber-200/60 pb-3">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Muncul Error "auth/unauthorized-domain"?</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Firebase mewajibkan domain web tempat aplikasi berjalan didaftarkan ke daftar domain yang diizinkan:
                    </p>
                    <div className="bg-white/80 rounded-xl p-3 border border-amber-200/60 space-y-1.5 text-[11px] text-slate-700">
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>
                          Buka{' '}
                          <a
                            href="https://console.firebase.google.com/project/gen-lang-client-0346541486/authentication/settings"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 font-bold underline hover:text-blue-900 inline-flex items-center gap-0.5"
                          >
                            Firebase Auth Authorized Domains <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </li>
                        <li>Pada bagian <strong>Authorized Domains</strong>, klik <strong>"Add domain"</strong>.</li>
                        <li>
                          Masukkan domain web ini: <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded font-bold font-mono text-[10px] select-all">{typeof window !== 'undefined' ? window.location.hostname : 'domain web Anda'}</code>
                        </li>
                        <li>Klik <strong>Save</strong>, lalu coba login kembali.</li>
                      </ol>
                    </div>
                  </div>

                  {/* 2. Access Blocked / Test Users Troubleshooting */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Muncul "Access Blocked / Belum Diverifikasi Google"?</span>
                    </div>
                    <div className="bg-white/80 rounded-xl p-3 border border-amber-200/60 space-y-1.5 text-[11px] text-slate-700">
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>
                          Buka{' '}
                          <a
                            href="https://console.cloud.google.com/auth/audience?project=gen-lang-client-0346541486"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 font-bold underline hover:text-blue-900 inline-flex items-center gap-0.5"
                          >
                            Google Cloud Audience (Test Users) <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </li>
                        <li>Di bagian <strong>Test users</strong>, klik <strong>+ ADD USERS</strong>.</li>
                        <li>Masukkan <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded font-bold">larassantisystem@gmail.com</code> lalu klik <strong>Save</strong>.</li>
                      </ol>
                      <div className="pt-1 border-t border-amber-100 text-[10px] text-slate-500">
                        <em>Catatan:</em> Anda juga dapat login langsung dengan akun pemilik (<code className="font-bold">mcmikecoc@gmail.com</code>).
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Token OAuth aman di memori sesi & izin terenkripsi Google</span>
                </div>
              </div>
            ) : (
              /* Non-admin notice when drive not yet connected */
              <div className="py-10 text-center max-w-md mx-auto space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 shadow-sm">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-black text-slate-800 text-base">
                    Google Drive Perusahaan Belum Dihubungkan
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Koneksi Google Drive dikelola secara terpusat oleh <strong>Administrator CPKB</strong>. Setelah Admin menghubungkan akun <code>larassantisystem@gmail.com</code>, akun Anda akan otomatis terhubung tanpa perlu login manual.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-[11px] text-slate-600 flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>Silakan hubungi Administrator atau buka akun dengan hak akses Admin / Manajemen untuk mengaktifkan koneksi Google Drive.</span>
                </div>
              </div>
            )
          ) : (
            /* Connected State: Drive Explorer & Backup Tools */
            <div className="space-y-6">
              {/* Account Status Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {currentUser?.photoLink || currentUser?.photoURL ? (
                    <img
                      src={currentUser?.photoLink || currentUser?.photoURL}
                      alt="Avatar"
                      className="w-10 h-10 rounded-full border border-slate-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center">
                      {(currentUser?.emailAddress || currentUser?.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {currentUser?.displayName || 'Google Drive Perusahaan'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {isAdmin ? 'Tersambung (Admin)' : 'Tertaut Otomatis'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {currentUser?.emailAddress || currentUser?.email || 'larassantisystem@gmail.com'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchDriveData}
                    disabled={isLoading}
                    className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Segarkan data Drive"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="p-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      title="Putuskan koneksi Google Drive (Admin Only)"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Standard CPKB Folder Hierarchy Card */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-700" />
                    <div>
                      <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
                        Struktur 5 Folder Standar CPKB
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Root: /{CPKB_ROOT_FOLDER_NAME}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleInitFolders}
                    disabled={isLoading}
                    className="px-3 py-1.5 rounded-xl border border-blue-300 bg-white hover:bg-blue-50 text-blue-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Sinkronkan Struktur Folder</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                  {CPKB_FOLDERS.map((folder, idx) => (
                    <div
                      key={folder.key}
                      className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-0.5"
                    >
                      <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5 truncate">
                        <span className="w-4 h-4 rounded-md bg-blue-100 text-blue-700 font-mono text-[9px] font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="truncate" title={folder.name}>
                          {folder.name.split(' - ')[1] || folder.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-1" title={folder.description}>
                        {folder.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick CPKB Backup Actions */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase text-slate-600 tracking-wider">
                  Pencadangan Cepat Data CPKB ke Google Drive
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleBackupGrn}
                    disabled={isLoading}
                    className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 transition-colors flex items-center justify-between text-left cursor-pointer group"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-blue-900 group-hover:text-blue-950 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-blue-700" />
                        <span>Cadangkan Data GRN (.csv)</span>
                      </div>
                      <div className="text-[11px] text-blue-700">
                        Ekspor seluruh bukti penerimaan gudang BB & BK
                      </div>
                    </div>
                    <Upload className="w-4 h-4 text-blue-600 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={handleBackupQc}
                    disabled={isLoading}
                    className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-100/70 transition-colors flex items-center justify-between text-left cursor-pointer group"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-purple-900 group-hover:text-purple-950 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-purple-700" />
                        <span>Cadangkan Arsip QC (.json)</span>
                      </div>
                      <div className="text-[11px] text-purple-700">
                        Ekspor riwayat pengujian & otorisasi lab CPKB
                      </div>
                    </div>
                    <Upload className="w-4 h-4 text-purple-600 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Drive File Explorer Section */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Daftar Berkas Google Drive ({files.length} item)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Create Folder Toggle */}
                    <button
                      type="button"
                      onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Buat Folder</span>
                    </button>
                  </div>
                </div>

                {/* Create Folder Form */}
                {isCreatingFolder && (
                  <form onSubmit={handleCreateFolder} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <input
                      type="text"
                      placeholder="Nama folder baru (contoh: Arsip CPKB 2026)"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !newFolderName.trim()}
                      className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingFolder(false)}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      Batal
                    </button>
                  </form>
                )}

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Cari file di Google Drive..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') fetchDriveData();
                    }}
                    className="w-full pl-9 pr-20 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={fetchDriveData}
                    className="absolute right-2 top-1.5 px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                  >
                    Cari
                  </button>
                </div>

                {/* Files Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {files.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      {isLoading ? 'Memuat berkas...' : 'Tidak ada berkas yang ditemukan di Google Drive.'}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Nama Berkas</th>
                          <th className="p-2.5">Tipe</th>
                          <th className="p-2.5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {files.map((f) => {
                          const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                          return (
                            <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-2.5 font-sans font-medium text-slate-800 flex items-center gap-2">
                                {isFolder ? (
                                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                )}
                                <span className="truncate max-w-xs" title={f.name}>
                                  {f.name}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-500">
                                {isFolder ? 'Folder' : f.mimeType.split('/').pop() || 'File'}
                              </td>
                              <td className="p-2.5 text-right font-sans">
                                <div className="flex items-center justify-end gap-1.5">
                                  {f.webViewLink && (
                                    <a
                                      href={f.webViewLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 text-blue-600 hover:text-blue-800 rounded hover:bg-blue-50"
                                      title="Buka di Google Drive"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setFileToDelete(f)}
                                    className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 cursor-pointer"
                                    title="Hapus file"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Cloud className="w-3.5 h-3.5 text-blue-600" />
            <span>Google Drive API v3 (REST)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Confirmation Dialog for Destructive Operations (MANDATORY per Skill) */}
      {fileToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-sm text-slate-900">Konfirmasi Hapus Berkas</h4>
                <p className="text-[11px] text-slate-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus berkas <strong>"{fileToDelete.name}"</strong> dari Google Drive Anda?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
