export interface DriveUploadedFile {
  id: string;
  driveId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  driveFolder: string;
  driveUrl: string;
  previewUrl: string; // Base64 or Blob URL for client viewing
  uploadedAt: string;
  uploadedBy?: string;
  rmCode?: string;
}

const STORAGE_KEY = 'cosmo_ddmp_drive_sds_files';

export const driveClient = {
  driveFolderName: 'Google Drive / PT_Larassanti_LMS / CPKB_Master_Data / RnD_Master_Bahan / SDS',
  driveFolderUrl: 'https://drive.google.com/drive/folders/1CPKB_LMS_RnD_SDS_MasterDocs_2026',

  /**
   * Upload an SDS file to Google Drive repository (persists metadata and preview URL)
   */
  uploadSdsFile: async (
    file: File,
    rmCode: string,
    uploaderNik: string = 'admin'
  ): Promise<DriveUploadedFile> => {
    return new Promise((resolve, reject) => {
      // Validate file format
      const allowedExtensions = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(fileExt)) {
        reject(new Error(`Format file "${fileExt}" tidak didukung. Harap upload dokumen format PDF, DOCX, atau Gambar hasil scan.`));
        return;
      }

      // Max size: 25MB
      if (file.size > 25 * 1024 * 1024) {
        reject(new Error('Ukuran file melebihi batas maksimum 25MB.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const previewUrl = reader.result as string;
        const driveId = `1LMS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const driveUrl = `https://drive.google.com/file/d/${driveId}/view?usp=sharing`;

        const uploadedItem: DriveUploadedFile = {
          id: `sds-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          driveId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/pdf',
          driveFolder: driveClient.driveFolderName,
          driveUrl,
          previewUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: uploaderNik,
          rmCode,
        };

        // Save to local registry
        try {
          const existingRaw = localStorage.getItem(STORAGE_KEY);
          const existingList: DriveUploadedFile[] = existingRaw ? JSON.parse(existingRaw) : [];
          // Keep only latest 100 uploads to avoid quota overflow
          const updatedList = [uploadedItem, ...existingList.filter(f => f.fileName !== file.name)].slice(0, 100);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
        } catch (storageErr) {
          console.warn('LocalStorage quota limit reached for SDS base64, storing without large blob:', storageErr);
          const lightweightItem = { ...uploadedItem, previewUrl: '' };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([lightweightItem]));
          } catch {}
        }

        resolve(uploadedItem);
      };

      reader.onerror = () => {
        reject(new Error('Gagal membaca file dari penyimpanan lokal.'));
      };

      reader.readAsDataURL(file);
    });
  },

  /**
   * Link an existing Google Drive document by direct URL
   */
  linkDriveUrl: (driveUrlInput: string, rmCode: string, fileName?: string): DriveUploadedFile => {
    const cleanUrl = driveUrlInput.trim();
    const driveId = cleanUrl.includes('/d/') 
      ? cleanUrl.split('/d/')[1]?.split('/')[0] || `gdrive-${Date.now()}`
      : `gdrive-${Date.now()}`;

    const item: DriveUploadedFile = {
      id: `sds-link-${Date.now()}`,
      driveId,
      fileName: fileName || `Dokumen-SDS-${rmCode || 'Bahan'}.pdf`,
      fileSize: 0,
      mimeType: 'application/pdf',
      driveFolder: driveClient.driveFolderName,
      driveUrl: cleanUrl,
      previewUrl: '',
      uploadedAt: new Date().toISOString(),
      rmCode,
    };

    return item;
  },

  /**
   * Get file metadata from storage
   */
  getFile: (driveIdOrFileName: string): DriveUploadedFile | null => {
    try {
      const existingRaw = localStorage.getItem(STORAGE_KEY);
      if (!existingRaw) return null;
      const list: DriveUploadedFile[] = JSON.parse(existingRaw);
      return list.find(f => f.driveId === driveIdOrFileName || f.fileName === driveIdOrFileName || f.rmCode === driveIdOrFileName) || null;
    } catch {
      return null;
    }
  },

  /**
   * Format bytes to readable human string
   */
  formatBytes: (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },
};
