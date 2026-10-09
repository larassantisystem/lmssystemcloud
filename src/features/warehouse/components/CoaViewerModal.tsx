import React, { useState, useEffect } from 'react';
import {
  FileText,
  ExternalLink,
  Download,
  X,
  Cloud,
  CheckCircle2,
  Upload,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Search,
} from 'lucide-react';
import {
  googleDriveSignIn,
  uploadCoaFileToDrive,
  getDriveAccessToken,
  searchCoaFileInDrive,
} from '../../../core/googleDrive/googleDriveService';
import { warehouseService } from '../warehouseService';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface CoaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
  driveFileId?: string;
  driveViewLink?: string;
  materialName?: string;
  materialCode?: string;
  batchNumber?: string;
  grnNumber?: string;
  onDriveUploaded?: (result: { fileId: string; viewLink: string }) => void;
}

export const CoaViewerModal: React.FC<CoaViewerModalProps> = ({
  isOpen,
  onClose,
  fileName,
  driveFileId,
  driveViewLink,
  materialName = 'Material Bahan',
  materialCode = '-',
  batchNumber = '-',
  grnNumber = '-',
  onDriveUploaded,
}) => {
  useEscapeKey(onClose, isOpen);
  const [isUploading, setIsUploading] = useState(false);
  const [isSearchingDrive, setIsSearchingDrive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [localDataUrl, setLocalDataUrl] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>(fileName || '');
  const [currentDriveFileId, setCurrentDriveFileId] = useState<string | undefined>(driveFileId);
  const [currentDriveViewLink, setCurrentDriveViewLink] = useState<string | undefined>(driveViewLink);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Auto search drive if token available and fileId is missing
  useEffect(() => {
    setCurrentFileName(fileName || '');
    setCurrentDriveFileId(driveFileId);
    setCurrentDriveViewLink(driveViewLink);
    setLocalDataUrl(null);
    setUploadError(null);
    setUploadSuccess(null);

    if (isOpen && !driveFileId && fileName && !fileName.startsWith('data:')) {
      getDriveAccessToken().then(async (token) => {
        if (token) {
          setIsSearchingDrive(true);
          const found = await searchCoaFileInDrive(fileName);
          if (found) {
            setCurrentDriveFileId(found.fileId);
            setCurrentDriveViewLink(found.webViewLink);
            setUploadSuccess('File ditemukan dan terhubung dari Google Drive!');
            if (onDriveUploaded) {
              onDriveUploaded({ fileId: found.fileId, viewLink: found.webViewLink });
            }
            warehouseService.updateGrnCoa(grnNumber, {
              coaDriveFileId: found.fileId,
              coaDriveViewLink: found.webViewLink,
            }).catch(() => {});
          }
          setIsSearchingDrive(false);
        }
      }).catch(() => {});
    }
  }, [fileName, driveFileId, driveViewLink, isOpen]);

  if (!isOpen) return null;

  const handleConnectAndSearchDrive = async () => {
    setIsSearchingDrive(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      let token = await getDriveAccessToken();
      if (!token) {
        const authRes = await googleDriveSignIn();
        token = authRes.accessToken;
      }

      if (token && currentFileName) {
        const found = await searchCoaFileInDrive(currentFileName);
        if (found) {
          setCurrentDriveFileId(found.fileId);
          setCurrentDriveViewLink(found.webViewLink);
          setUploadSuccess(`Dokumen "${found.fileName}" ditemukan dan terhubung di Google Drive!`);
          if (onDriveUploaded) {
            onDriveUploaded({ fileId: found.fileId, viewLink: found.webViewLink });
          }
          await warehouseService.updateGrnCoa(grnNumber, {
            coaDriveFileId: found.fileId,
            coaDriveViewLink: found.webViewLink,
          });
          return;
        }
      }

      // If not found in drive, prompt user to select file to upload to Drive
      setUploadError('File belum ditemukan di Google Drive. Silakan pilih berkas fisik untuk diunggah langsung.');
      fileInputRef.current?.click();
    } catch (err: any) {
      if (err.isCancelled || err.code === 'auth/popup-closed-by-user') {
        setUploadError('Autentikasi Google Drive dibatalkan.');
      } else {
        setUploadError(err.message || 'Gagal terhubung ke Google Drive.');
      }
    } finally {
      setIsSearchingDrive(false);
    }
  };

  const rawSource = localDataUrl || (typeof fileName === 'string' && fileName.startsWith('data:') ? fileName : null) || '';
  const isDataUrl = typeof rawSource === 'string' && rawSource.startsWith('data:');
  const isHttpUrl = typeof rawSource === 'string' && (rawSource.startsWith('http://') || rawSource.startsWith('https://') || rawSource.startsWith('blob:'));
  
  const isImage = (isDataUrl && rawSource.startsWith('data:image/')) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(currentFileName);
  const isPdf = (isDataUrl && rawSource.startsWith('data:application/pdf')) || /\.pdf$/i.test(currentFileName);

  const effectiveViewUrl =
    currentDriveViewLink ||
    (currentDriveFileId ? `https://drive.google.com/file/d/${currentDriveFileId}/view` : (isHttpUrl ? rawSource : null));

  // Determine direct preview source
  const directImageSrc = isDataUrl
    ? rawSource
    : (currentDriveFileId ? `https://drive.google.com/thumbnail?id=${currentDriveFileId}&sz=w2000` : (isHttpUrl ? rawSource : null));

  const embedPreviewUrl = currentDriveFileId
    ? `https://drive.google.com/file/d/${currentDriveFileId}/preview`
    : (isDataUrl || isHttpUrl ? rawSource : null);

  const hasPreview = isImage ? Boolean(directImageSrc) : Boolean(embedPreviewUrl);

  const displayFileName = isDataUrl
    ? `Dokumen_CoA_${materialCode || 'Bahan'}_${batchNumber || 'Batch'}.${isImage ? 'png' : 'pdf'}`
    : (currentFileName || 'Dokumen CoA Mutu');

  const handleManualUploadToDrive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setCurrentFileName(file.name);

    // 1. Baca langsung Data URL agar pratinjau tampil seketika
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        setLocalDataUrl(dataUrl);

        // Update database Supabase dengan data URL agar tersimpan permanen
        try {
          await warehouseService.updateGrnCoa(grnNumber, {
            coaAttachment: dataUrl,
          });
          setUploadSuccess('Dokumen berhasil disimpan ke sistem dan siap dilihat!');
        } catch (_) {}
      }
    };
    reader.readAsDataURL(file);

    // 2. Jika Google Drive tersedia atau berhasil sign in, upload ke Drive
    try {
      const token = await getDriveAccessToken();
      if (token) {
        const result = await uploadCoaFileToDrive(file, {
          grnNumber,
          materialName,
          batchNumber,
        });

        setCurrentDriveFileId(result.fileId);
        setCurrentDriveViewLink(result.webViewLink);
        setUploadSuccess('Dokumen berhasil disimpan dan disinkronkan ke Google Drive!');

        if (onDriveUploaded) {
          onDriveUploaded({
            fileId: result.fileId,
            viewLink: result.webViewLink,
          });
        }

        await warehouseService.updateGrnCoa(grnNumber, {
          coaAttachment: file.name,
          coaDriveFileId: result.fileId,
          coaDriveViewLink: result.webViewLink,
        });
      }
    } catch (err: any) {
      if (err.isCancelled || err.code === 'auth/popup-closed-by-user') {
        setUploadSuccess('Pratinjau lokal siap dan tersimpan ke database.');
      } else {
        console.warn('Notice uploading CoA to Drive:', err?.message || err);
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-slate-900">
                  Pratinjau Dokumen Certificate of Analysis (CoA)
                </h3>
                {currentDriveFileId ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                    <Cloud className="w-3 h-3 text-blue-600" />
                    Google Drive Terhubung
                  </span>
                ) : (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                    Lampiran Lokal
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {displayFileName} • {materialName} ({materialCode}) • Batch: {batchNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {effectiveViewUrl && (
              <a
                href={effectiveViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                title="Buka dokumen di tab baru"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{driveFileId ? 'Buka di Google Drive' : 'Buka Dokumen'}</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Tutup Pratinjau"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 bg-slate-100 relative overflow-hidden flex flex-col items-center justify-center">
          {hasPreview ? (
            <div className="w-full h-full flex flex-col">
              {isImage && directImageSrc ? (
                <div className="flex-1 flex items-center justify-center p-4 bg-slate-900/10 overflow-auto">
                  <img
                    src={directImageSrc}
                    alt="Pratinjau Dokumen CoA"
                    className="max-h-full max-w-full object-contain rounded-lg shadow-md"
                  />
                </div>
              ) : (
                <iframe
                  src={embedPreviewUrl || directImageSrc || ''}
                  className="w-full flex-1 border-0"
                  title="Pratinjau Dokumen CoA"
                  allow="autoplay"
                />
              )}
              <div className="p-3 bg-white border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>
                  Menampilkan file:{' '}
                  <strong className="text-slate-800 font-mono">{displayFileName}</strong>
                </span>
                {effectiveViewUrl && (
                  <a
                    href={effectiveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-blue-700 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Buka Tampilan Penuh
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 max-w-lg text-center space-y-4 animate-in fade-in">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-blue-600 mx-auto shadow-sm">
                <Cloud className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-slate-900">
                  Dokumen Tercatat: {fileName?.startsWith('data:image/')
                    ? 'Foto / Scan CoA (.JPG/.PNG)'
                    : fileName?.startsWith('data:application/pdf')
                    ? 'Dokumen CoA (.PDF)'
                    : fileName?.startsWith('data:')
                    ? 'Dokumen CoA Terlampir'
                    : (fileName || 'Sertifikat Analisis (CoA)')}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  File ini terdaftar pada bukti kedatangan barang fisik gudang untuk material{' '}
                  <strong className="text-slate-800">{materialName}</strong> ({materialCode}) No. Batch{' '}
                  <strong className="text-slate-800 font-mono">{batchNumber}</strong>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 text-left text-xs space-y-2 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-slate-100">
                  <span>Nomor Bukti GRN:</span>
                  <span className="font-mono font-bold text-slate-900">{grnNumber}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-slate-100">
                  <span>Nama File CoA:</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {fileName?.startsWith('data:image/')
                      ? 'Foto / Scan CoA (.JPG/.PNG)'
                      : fileName?.startsWith('data:application/pdf')
                      ? 'Dokumen CoA (.PDF)'
                      : fileName?.startsWith('data:')
                      ? 'Dokumen CoA Terlampir'
                      : (fileName || '-')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Integrasi Cloud:</span>
                  <span className="font-bold text-blue-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Google Drive Siap
                  </span>
                </div>
              </div>

              {uploadError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 text-left">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleManualUploadToDrive}
                />

                <button
                  type="button"
                  disabled={isSearchingDrive || isUploading}
                  onClick={handleConnectAndSearchDrive}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSearchingDrive ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mencari di Google Drive...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      <span>Buka File dari Google Drive</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-200"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Pilih Berkas Lokal ({currentFileName || 'PDF/Gambar'})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Sistem Dokumentasi Mutu CPKB • Google Drive Terintegrasi
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
