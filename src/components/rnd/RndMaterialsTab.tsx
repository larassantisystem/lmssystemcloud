import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { RawMaterial, QCParameter } from '../../types';
import { useAuth } from '../../core/auth/AuthContext';
import { authService } from '../../core/auth/authService';
import { canWriteModule, isReadOnlyModule } from '../../core/auth/permissionGuard';
import { driveClient, DriveUploadedFile } from '../../core/drive-service/driveClient';
import { ensureUUID, generateUUID } from '../../utils/uuid';
import { auditLogger } from '../../core/utils/auditLogger';
import { materialService } from '../../features/rnd/materials/materialService';
import {
  FlaskConical,
  Search,
  Plus,
  Edit2,
  Trash2,
  Save,
  Check,
  X,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  PlusCircle,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  CheckCircle2,
  FileText,
  ExternalLink,
  Cloud,
  CloudUpload,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Filter,
  Paperclip,
  Download,
  FileUp,
} from 'lucide-react';

export const RAW_MATERIAL_CATEGORIES = [
  { id: 'active', label: 'Active (Bahan Aktif)', color: 'border-purple-300 bg-purple-50 text-purple-800', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'excipient', label: 'Excipient (Bahan Pembantu)', color: 'border-blue-300 bg-blue-50 text-blue-800', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'preservative', label: 'Preservative (Pengawet)', color: 'border-rose-300 bg-rose-50 text-rose-800', badge: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'emulsifier', label: 'Emulsifier (Pengemulsi)', color: 'border-amber-300 bg-amber-50 text-amber-800', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'solvent', label: 'Solvent (Pelarut)', color: 'border-cyan-300 bg-cyan-50 text-cyan-800', badge: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { id: 'surfactant', label: 'Surfactant (Surfaktan)', color: 'border-teal-300 bg-teal-50 text-teal-800', badge: 'bg-teal-100 text-teal-800 border-teal-200' },
  { id: 'thickener', label: 'Thickener (Pengental)', color: 'border-indigo-300 bg-indigo-50 text-indigo-800', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'fragrance', label: 'Fragrance (Pewangi)', color: 'border-pink-300 bg-pink-50 text-pink-800', badge: 'bg-pink-100 text-pink-800 border-pink-200' },
  { id: 'colorant', label: 'Colorant (Pewarna)', color: 'border-emerald-300 bg-emerald-50 text-emerald-800', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'other', label: 'Lain-lain', color: 'border-slate-300 bg-slate-100 text-slate-800', badge: 'bg-slate-200 text-slate-800 border-slate-300' },
];

interface RndMaterialsTabProps {
  rawMaterials: RawMaterial[];
  onSaveRM: (rm: RawMaterial) => void;
  onBatchSaveRM?: (rms: RawMaterial[]) => Promise<void> | void;
  onDeleteRM: (id: string) => void;
}

import { Pagination } from '../../core/ui-components/Pagination';

export const RndMaterialsTab: React.FC<RndMaterialsTabProps> = ({
  rawMaterials,
  onSaveRM,
  onBatchSaveRM,
  onDeleteRM,
}) => {
  const { user } = useAuth();
  const [searchRM, setSearchRM] = useState('');
  
  // Search filter
  const filteredRM = rawMaterials.filter(
    (rm) =>
      rm.name.toLowerCase().includes(searchRM.toLowerCase()) ||
      rm.code.toLowerCase().includes(searchRM.toLowerCase()) ||
      rm.chemicalName.toLowerCase().includes(searchRM.toLowerCase()) ||
      (rm.manufacturer && rm.manufacturer.toLowerCase().includes(searchRM.toLowerCase()))
  );

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [searchRM]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredRM.slice(indexOfFirstItem, indexOfLastItem);
  
  // Modals visibility states
  const [showFormModal, setShowFormModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingRM, setEditingRM] = useState<RawMaterial | null>(null);
  const [selectedRMForDetails, setSelectedRMForDetails] = useState<RawMaterial | null>(null);

  // Form states (Bagian A)
  const [rmCode, setRmCode] = useState('');
  const [rmName, setRmName] = useState('');
  const [rmChemName, setRmChemName] = useState('');
  const [rmCategories, setRmCategories] = useState<string[]>(['active']);
  const [rmOtherCategorySpec, setRmOtherCategorySpec] = useState('');
  const [rmStorage, setRmStorage] = useState('Suhu ruang (15-25°C), kedap udara & kering');
  const [rmSds, setRmSds] = useState('SDS-LMS-2026-01');
  const [rmManufacturer, setRmManufacturer] = useState('');
  const [rmSubstitutes, setRmSubstitutes] = useState<string[]>([]);
  const [isSingleSpecificMaterial, setIsSingleSpecificMaterial] = useState(false);
  const [rmLeadTime, setRmLeadTime] = useState<number>(14);
  const [rmReorderPoint, setRmReorderPoint] = useState<number>(50);

  // Google Drive SDS states
  const [sdsFile, setSdsFile] = useState<DriveUploadedFile | null>(null);
  const [sdsFileUrl, setSdsFileUrl] = useState<string>('');
  const [sdsFileName, setSdsFileName] = useState<string>('');
  const [isUploadingSds, setIsUploadingSds] = useState(false);
  const [sdsUploadError, setSdsUploadError] = useState<string | null>(null);
  const [showDriveUrlInput, setShowDriveUrlInput] = useState(false);
  const [customDriveUrl, setCustomDriveUrl] = useState('');

  // Substitutes search & filter state
  const [substituteSearchQuery, setSubstituteSearchQuery] = useState('');
  const [filterSimilarCategoryOnly, setFilterSimilarCategoryOnly] = useState(false);
  const [filterSameInciOnly, setFilterSameInciOnly] = useState(true);

  // Form states (Bagian B - QC Parameters)
  const [rmQcParams, setRmQcParams] = useState<QCParameter[]>([]);

  // Validation & Live View Confirmation states
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showLiveViewModal, setShowLiveViewModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Delete with Active User Password states
  const [rmToDelete, setRmToDelete] = useState<RawMaterial | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const [isVerifyingDeletePassword, setIsVerifyingDeletePassword] = useState(false);

  // Import Excel states
  const [importTab, setImportTab] = useState<'file' | 'paste'>('file');
  const [pasteData, setPasteData] = useState('');
  const [importPreview, setImportPreview] = useState<RawMaterial[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importedFileName, setImportedFileName] = useState<string>('');
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // INCI Auto-Link Mutual Substitutes states
  const [showInciSyncModal, setShowInciSyncModal] = useState(false);
  const [isSyncingInci, setIsSyncingInci] = useState(false);
  const [inciSyncPreview, setInciSyncPreview] = useState<{
    groups: Array<{ inci: string; materials: RawMaterial[] }>;
    totalToUpdate: number;
    singlesCount: number;
  }>({ groups: [], totalToUpdate: 0, singlesCount: 0 });

  // Buka modal pratinjau Auto-Link INCI
  const openInciSyncModal = () => {
    const isValidInci = (val?: string): boolean => {
      if (!val) return false;
      const trimmed = val.trim();
      if (!trimmed) return false;
      if (/^[-–—\s]+$/.test(trimmed)) return false;
      const lower = trimmed.toLowerCase();
      if (['n/a', 'na', 'none', 'tidak ada', 'null', 'undefined'].includes(lower)) return false;
      return true;
    };

    const inciMap = new Map<string, RawMaterial[]>();
    let singlesCount = 0;

    for (const rm of rawMaterials) {
      if (!isValidInci(rm.chemicalName)) {
        singlesCount++;
        continue;
      }
      const key = rm.chemicalName.trim().toLowerCase();
      if (!inciMap.has(key)) {
        inciMap.set(key, []);
      }
      inciMap.get(key)!.push(rm);
    }

    const multiGroups: Array<{ inci: string; materials: RawMaterial[] }> = [];
    let totalToUpdate = 0;

    for (const [_, items] of inciMap.entries()) {
      if (items.length >= 2) {
        multiGroups.push({
          inci: items[0].chemicalName.trim(),
          materials: items,
        });
        totalToUpdate += items.length;
      } else {
        singlesCount += items.length;
      }
    }

    setInciSyncPreview({
      groups: multiGroups,
      totalToUpdate,
      singlesCount,
    });
    setShowInciSyncModal(true);
  };

  // Eksekusi sinkronisasi substitusi dua arah ke Supabase
  const handleExecuteInciSync = async () => {
    if (!canWrite) {
      alert('Akses Ditolak: Anda memiliki izin Hanya Lihat (Read-Only) pada modul R&D.');
      return;
    }
    setIsSyncingInci(true);
    try {
      const res = await materialService.syncMutualSubstitutesByInci(
        rawMaterials,
        user?.name || user?.username || 'Staff RnD'
      );

      if (res.success) {
        if (onBatchSaveRM && res.updatedMaterials.length > 0) {
          await onBatchSaveRM(res.updatedMaterials);
        }

        auditLogger.logAction({
          action: 'UPDATE',
          module: 'RND',
          actorNik: user?.nik || 'admin',
          actorName: user?.name || user?.username || 'Staff RnD',
          targetNik: 'ALL',
          details: `Auto-link substitusi INCI sama: ${res.updatedCount} bahan diperbarui dalam ${res.groupsCount} kelompok INCI.`,
        });

        setShowInciSyncModal(false);
        setSuccessToast(
          `Berhasil menyinkronkan ${res.updatedCount} bahan baku di Supabase (${res.groupsCount} kelompok INCI). Bahan dengan INCI identik kini telah saling terhubung sebagai Approved Substitutes.`
        );
        setTimeout(() => setSuccessToast(null), 6000);
      } else {
        alert(`Gagal menyinkronkan: ${res.error || 'Terjadi kesalahan sistem.'}`);
      }
    } catch (err: any) {
      console.error('Error syncing INCI substitutes:', err);
      alert(`Gagal menyinkronkan: ${err.message || String(err)}`);
    } finally {
      setIsSyncingInci(false);
    }
  };

  // RBAC Permission Check
  const canWrite = canWriteModule(user, 'rnd');

  // Toggle Category multi-select
  const toggleCategory = (catId: string) => {
    if (rmCategories.includes(catId)) {
      setRmCategories(rmCategories.filter((c) => c !== catId));
    } else {
      setRmCategories([...rmCategories, catId]);
    }
  };

  // Upload SDS file to Google Drive
  const handleUploadSds = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSds(true);
    setSdsUploadError(null);

    try {
      const uploaderNik = user?.nik || 'admin';
      const uploaded = await driveClient.uploadSdsFile(file, rmCode || 'B0001', uploaderNik);
      setSdsFile(uploaded);
      setSdsFileName(uploaded.fileName);
      setSdsFileUrl(uploaded.driveUrl);
      if (!rmSds || rmSds.startsWith('SDS-LMS-2026')) {
        setRmSds(`SDS-${rmCode || 'B0001'}-${file.name.replace(/\.[^/.]+$/, '').toUpperCase()}`);
      }
    } catch (err: any) {
      setSdsUploadError(err.message || 'Gagal mengunggah file ke Google Drive.');
    } finally {
      setIsUploadingSds(false);
    }
  };

  // Link Direct Google Drive URL
  const handleLinkDriveUrl = () => {
    if (!customDriveUrl.trim()) return;
    const linked = driveClient.linkDriveUrl(customDriveUrl, rmCode || 'B0001');
    setSdsFile(linked);
    setSdsFileName(linked.fileName);
    setSdsFileUrl(linked.driveUrl);
    setShowDriveUrlInput(false);
    setCustomDriveUrl('');
  };

  // Initialize form with default parameters
  const openAddRMModal = () => {
    setEditingRM(null);
    const nextCode = `B${String(rawMaterials.length + 1).padStart(4, '0')}`;
    setRmCode(nextCode);
    setRmName('');
    setRmChemName('');
    setRmCategories(['active']);
    setRmOtherCategorySpec('');
    setRmStorage('Suhu ruang (15-25°C), kering & wadah tertutup rapat');
    setRmSds(`SDS-LMS-${nextCode}`);
    setRmManufacturer('');
    setRmSubstitutes([]);
    setIsSingleSpecificMaterial(false);
    setRmLeadTime(14);
    setRmReorderPoint(50);
    setSdsFile(null);
    setSdsFileUrl('');
    setSdsFileName('');
    setSdsUploadError(null);
    setShowDriveUrlInput(false);
    setValidationErrors([]);
    setSubstituteSearchQuery('');
    setFilterSimilarCategoryOnly(false);
    setFilterSameInciOnly(true);
    
    // Otomatis terisi 7 parameter utama (Bentuk, Warna, Bau, pH, Kelarutan, Densitas, Viskositas)
    setRmQcParams([
      { name: 'Bentuk', specification: 'Bubuk' },
      { name: 'Warna', specification: 'Putih' },
      { name: 'Bau', specification: 'Tidak berbau' },
      { name: 'pH', specification: '5.5 - 7.5' },
      { name: 'Kelarutan', specification: 'Mudah larut dalam air' },
      { name: 'Densitas', specification: '1.2 g/cm³' },
      { name: 'Viskositas', specification: 'N/A' }
    ]);

    setShowFormModal(true);
  };

  const handleEditRMClick = (rm: RawMaterial) => {
    setEditingRM(rm);
    setRmCode(rm.code);
    setRmName(rm.name);
    setRmChemName(rm.chemicalName);
    
    // Categories multi-select resolution
    if (rm.categories && rm.categories.length > 0) {
      setRmCategories(rm.categories);
    } else {
      setRmCategories([rm.category]);
    }
    setRmOtherCategorySpec(rm.otherCategorySpecification || '');
    
    setRmStorage(rm.storageConditions);
    setRmSds(rm.sdsDocNumber);
    setRmManufacturer(rm.manufacturer || '');
    setRmSubstitutes(rm.approvedSubstitutes || []);
    setIsSingleSpecificMaterial(rm.isSingleSpecificMaterial || (rm.approvedSubstitutes && rm.approvedSubstitutes.length === 0));
    setRmLeadTime(rm.supplierLeadTimeDays || 14);
    setRmReorderPoint(rm.reorderPoint ?? 50);

    // Google Drive SDS file restore
    if (rm.sdsFileUrl || rm.sdsFileName) {
      setSdsFileUrl(rm.sdsFileUrl || '');
      setSdsFileName(rm.sdsFileName || `Dokumen-SDS-${rm.code}.pdf`);
      setSdsFile({
        id: `sds-${rm.id}`,
        driveId: rm.sdsDriveId || `1LMS-${rm.code}`,
        fileName: rm.sdsFileName || `Dokumen-SDS-${rm.code}.pdf`,
        fileSize: 1024 * 500,
        mimeType: 'application/pdf',
        driveFolder: driveClient.driveFolderName,
        driveUrl: rm.sdsFileUrl || 'https://drive.google.com',
        previewUrl: '',
        uploadedAt: rm.lastModifiedAt || new Date().toISOString(),
        rmCode: rm.code,
      });
    } else {
      setSdsFile(null);
      setSdsFileUrl('');
      setSdsFileName('');
    }

    setSdsUploadError(null);
    setShowDriveUrlInput(false);
    setValidationErrors([]);
    setSubstituteSearchQuery('');
    setFilterSimilarCategoryOnly(false);
    setFilterSameInciOnly(true);
    
    // Jika data lama tidak memiliki qcParameters, sediakan parameter default
    setRmQcParams(rm.qcParameters && rm.qcParameters.length > 0 
      ? [...rm.qcParameters]
      : [
          { name: 'Bentuk', specification: 'Bubuk' },
          { name: 'Warna', specification: 'Putih' },
          { name: 'Bau', specification: 'Tidak berbau' },
          { name: 'pH', specification: '5.5 - 7.5' },
          { name: 'Kelarutan', specification: 'Mudah larut dalam air' },
          { name: 'Densitas', specification: '1.2 g/cm³' },
          { name: 'Viskositas', specification: 'N/A' }
        ]
    );

    setShowFormModal(true);
  };

  const handleAddQcParam = () => {
    setRmQcParams([...rmQcParams, { name: '', specification: '' }]);
  };

  const handleRemoveQcParam = (index: number) => {
    setRmQcParams(rmQcParams.filter((_, i) => i !== index));
  };

  const handleQcParamChange = (index: number, field: keyof QCParameter, value: string) => {
    const updated = [...rmQcParams];
    updated[index] = { ...updated[index], [field]: value };
    setRmQcParams(updated);
  };

  const toggleRmSubstitute = (code: string) => {
    if (isSingleSpecificMaterial) {
      setIsSingleSpecificMaterial(false);
    }
    if (rmSubstitutes.includes(code)) {
      setRmSubstitutes(rmSubstitutes.filter((c) => c !== code));
    } else {
      setRmSubstitutes([...rmSubstitutes, code]);
    }
  };

  // Validation: Bagian A is strictly required!
  const handleValidateAndOpenLiveView = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];

    // Bagian A Mandatory Validations:
    if (!rmCode.trim()) {
      errors.push('Kode RM wajib diisi (contoh: B0001).');
    }
    if (!rmName.trim()) {
      errors.push('Nama Dagang Bahan wajib diisi.');
    }
    if (!rmChemName.trim()) {
      errors.push('Nama Kimia / INCI wajib diisi.');
    }
    if (rmCategories.length === 0) {
      errors.push('Kategori Bahan Baku wajib dipilih (minimal 1 kategori).');
    }
    if (rmCategories.includes('other') && !rmOtherCategorySpec.trim()) {
      errors.push('Spesifikasi Kategori "Lain-lain" wajib diisi karena opsi Lain-lain dicentang.');
    }
    if (!rmManufacturer.trim()) {
      errors.push('Produsen (Manufacturer) wajib diisi.');
    }
    if (!rmSds.trim()) {
      errors.push('Nomor Dokumen SDS wajib diisi.');
    }
    if (!sdsFile && !sdsFileUrl) {
      errors.push('Dokumen SDS wajib diunggah ke Google Drive (atau tautkan URL Google Drive resmi).');
    }
    if (!rmStorage.trim()) {
      errors.push('Kondisi Penyimpanan wajib diisi.');
    }
    if (rmSubstitutes.length === 0 && !isSingleSpecificMaterial) {
      errors.push('Bahan Pengganti Resmi wajib dipilih minimal 1 bahan, ATAU centang opsi "Bahan Tunggal Spesifik".');
    }

    // Bagian B Validation
    const cleanQcParams = rmQcParams.filter(p => p.name.trim() !== '');
    if (cleanQcParams.length === 0) {
      errors.push('Minimal 1 Parameter & Spesifikasi Analisa QC (Bagian B) wajib diisi.');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setConfirmPassword('');
    setConfirmPasswordError(null);
    setShowLiveViewModal(true);
  };

  // Execute Delete after active user password confirmation
  const handleConfirmDeleteRM = async () => {
    if (!rmToDelete) return;
    if (!deletePassword.trim()) {
      setDeletePasswordError('Kata sandi otorisasi pengguna aktif wajib diisi.');
      return;
    }

    setIsVerifyingDeletePassword(true);
    setDeletePasswordError(null);

    try {
      const actorNik = user?.nik || 'admin';
      const check = await authService.verifyPassword(actorNik, deletePassword);
      if (!check.valid) {
        setDeletePasswordError(check.error || 'Kata sandi tidak valid. Silakan periksa kembali.');
        setIsVerifyingDeletePassword(false);
        return;
      }

      // Execute parent deletion
      onDeleteRM(rmToDelete.id);

      // Record Audit Trail Log
      auditLogger.logAction({
        actorNik: actorNik,
        actorName: user?.name || user?.username || 'ADMIN',
        module: 'rnd',
        action: 'RM_MASTER_DELETE',
        targetNik: rmToDelete.code,
        details: `Penghapusan Master Bahan Baku ${rmToDelete.code} (${rmToDelete.name}) dengan otorisasi kata sandi pengguna aktif.`,
      });

      setIsVerifyingDeletePassword(false);
      setSuccessToast(`Bahan baku "${rmToDelete.code} - ${rmToDelete.name}" berhasil dihapus.`);
      setRmToDelete(null);
      setDeletePassword('');
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setDeletePasswordError(err.message || 'Terjadi kesalahan saat memverifikasi sandi.');
      setIsVerifyingDeletePassword(false);
    }
  };

  // Execute Save after Password confirmation
  const handleFinalSaveWithPassword = async () => {
    if (!confirmPassword.trim()) {
      setConfirmPasswordError('Kata sandi otorisasi wajib diisi untuk verifikasi e-signature.');
      return;
    }

    setIsVerifyingPassword(true);
    setConfirmPasswordError(null);

    try {
      const actorNik = user?.nik || 'admin';
      const check = await authService.verifyPassword(actorNik, confirmPassword);
      if (!check.valid) {
        setConfirmPasswordError(check.error || 'Kata sandi tidak valid. Silakan periksa kembali.');
        setIsVerifyingPassword(false);
        return;
      }

      const cleanQcParams = rmQcParams.filter(p => p.name.trim() !== '');
      const primaryCategory = rmCategories[0] || 'active';

      const newOrUpdatedRM: RawMaterial = {
        id: editingRM ? ensureUUID(editingRM.id) : generateUUID(),
        code: rmCode.trim().toUpperCase(),
        specNumber: `SP-BB-${rmCode.trim().toUpperCase()}`,
        name: rmName.trim(),
        chemicalName: rmChemName.trim(),
        category: primaryCategory,
        categories: rmCategories,
        otherCategorySpecification: rmCategories.includes('other') ? rmOtherCategorySpec.trim() : undefined,
        storageConditions: rmStorage.trim(),
        sdsDocNumber: rmSds.trim(),
        sdsFileUrl: sdsFile ? sdsFile.driveUrl : sdsFileUrl,
        sdsFileName: sdsFile ? sdsFile.fileName : sdsFileName,
        sdsDriveId: sdsFile ? sdsFile.driveId : undefined,
        approvedSubstitutes: isSingleSpecificMaterial ? [] : rmSubstitutes,
        isSingleSpecificMaterial,
        manufacturer: rmManufacturer.trim(),
        qcParameters: cleanQcParams,
        supplierLeadTimeDays: Number(rmLeadTime) || 14,
        reorderPoint: Number(rmReorderPoint) || 50,
        lastModifiedBy: `${user?.name || 'ADMIN'} (${actorNik})`,
        lastModifiedAt: new Date().toISOString(),
      };

      // Save to parent state
      onSaveRM(newOrUpdatedRM);

      // Record Audit Trail Log
      auditLogger.logAction({
        actorNik: actorNik,
        actorName: user?.name || 'ADMIN',
        module: 'rnd',
        action: editingRM ? 'RM_MASTER_UPDATE' : 'RM_MASTER_CREATE',
        targetNik: newOrUpdatedRM.code,
        details: `${editingRM ? 'Pembaruan' : 'Pendaftaran'} Master Bahan Baku ${newOrUpdatedRM.code} (${newOrUpdatedRM.name}) dengan ${newOrUpdatedRM.categories?.length || 1} kategori, dokumen SDS di Google Drive, dan otorisasi kata sandi CPKB.`,
      });

      setIsVerifyingPassword(false);
      setShowLiveViewModal(false);
      setShowFormModal(false);
      setEditingRM(null);
      setSuccessToast(`Bahan baku "${newOrUpdatedRM.code} - ${newOrUpdatedRM.name}" berhasil disimpan dengan verifikasi otorisasi user.`);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setConfirmPasswordError(err.message || 'Terjadi kesalahan saat memverifikasi sandi.');
      setIsVerifyingPassword(false);
    }
  };

  // --- EXCEL TEMPLATE GENERATOR ---
  const handleDownloadTemplate = () => {
    const templateData = [
      [
        'Kode RM',
        'Nama Dagang Bahan',
        'Nama Kimia / INCI',
        'Kategori',
        'Produsen / Pabrikan',
        'Kondisi Penyimpanan',
        'Nomor Dokumen SDS',
        'Bahan Substitusi (Dipisah Koma)',
        'Lead Time (Hari)',
        'Parameter 1',
        'Syarat 1',
        'Parameter 2',
        'Syarat 2',
        'Parameter 3',
        'Syarat 3',
        'Parameter 4',
        'Syarat 4'
      ],
      [
        'B0001',
        'Niacinamide PC',
        'Nicotinamide',
        'active',
        'DSM Nutritional Products',
        'Suhu ruang (15-25°C), terlindung cahaya',
        'SDS-LMS-B0001',
        'B0002, B0005',
        14,
        'Bentuk',
        'Bubuk kristal',
        'Warna',
        'Putih',
        'pH (Larutan 5%)',
        '6.0 - 7.5',
        'Kelarutan',
        'Larut dalam air'
      ],
      [
        'B0002',
        'Glycerin USP 99.5%',
        'Glycerol',
        'solvent',
        'PT Wilmar Nabati',
        'Suhu ruang, wadah tertutup rapat',
        'SDS-LMS-B0002',
        '',
        7,
        'Bentuk',
        'Cairan kental jernih',
        'Kemurnian',
        'Min 99.5%',
        'Kadar Air',
        'Maks 0.5%',
        'Bau',
        'Khas lemah'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 24 },
      { wch: 22 },
      { wch: 14 },
      { wch: 25 },
      { wch: 30 },
      { wch: 16 },
      { wch: 22 },
      { wch: 15 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Master RM');
    XLSX.writeFile(wb, 'Template_Master_Bahan_Baku_CPKB.xlsx');
  };

  // --- PARSE FILE UPLOAD (EXCEL / CSV) ---
  const handleFileDropOrSelect = async (file: File) => {
    if (!file) return;
    setImportError(null);
    setImportedFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('File Excel tidak memiliki lembar kerja (worksheet).');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (!rows || rows.length === 0) {
        throw new Error('Lembar kerja Excel kosong.');
      }

      const parsedMaterials: RawMaterial[] = [];
      let startIndex = 0;
      
      // Auto-detect header row
      const firstRowStr = (rows[0] || []).map((c: any) => String(c).toLowerCase()).join(' ');
      if (firstRowStr.includes('kode') || firstRowStr.includes('nama') || firstRowStr.includes('kategori') || firstRowStr.includes('inci') || firstRowStr.includes('category')) {
        startIndex = 1;
      }

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((c: any) => String(c).trim() === '')) continue;
        const cols = row.map((c: any) => String(c ?? '').trim());
        parseRow(cols, i + 1, parsedMaterials);
      }

      if (parsedMaterials.length === 0) {
        throw new Error('Tidak ada baris data bahan baku yang valid dalam file Excel.');
      }

      setImportPreview(parsedMaterials);
      setImportError(null);
    } catch (err: any) {
      setImportError(`Gagal membaca file Excel: ${err.message}`);
    }
  };

  // --- PARSE COPY-PASTE FROM EXCEL ---
  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPasteData(text);
    if (!text.trim()) {
      setImportPreview([]);
      setImportError(null);
      return;
    }

    try {
      const rows = text.split('\n');
      const parsedMaterials: RawMaterial[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i].trim();
        if (!row) continue;

        const cols = row.split('\t'); // Excel outputs TAB separated values
        if (cols.length < 3) {
          // Fallback to comma if they copy CSV format
          const commaCols = row.split(',');
          if (commaCols.length >= 3) {
            parseRow(commaCols, i + 1, parsedMaterials);
          }
          continue;
        }
        parseRow(cols, i + 1, parsedMaterials);
      }

      setImportPreview(parsedMaterials);
      setImportError(null);
    } catch (err: any) {
      setImportError(`Gagal menganalisis baris data: ${err.message}`);
    }
  };

  const parseRow = (cols: string[], rowIndex: number, list: RawMaterial[]) => {
    const code = cols[0]?.trim() || `B${String(rawMaterials.length + list.length + 1).padStart(4, '0')}`;
    const name = cols[1]?.trim();
    const chemicalName = cols[2]?.trim() || '';
    
    if (!name) {
      throw new Error(`Nama bahan pada baris ke-${rowIndex} tidak boleh kosong.`);
    }

    // Category mapping & normalization
    let category: any = 'active';
    const rawCat = cols[3]?.trim().toLowerCase() || 'active';
    if (rawCat.includes('excipient') || rawCat.includes('pengisi')) category = 'excipient';
    else if (rawCat.includes('preservative') || rawCat.includes('pengawet')) category = 'preservative';
    else if (rawCat.includes('emulsifier') || rawCat.includes('pengemulsi')) category = 'emulsifier';
    else if (rawCat.includes('solvent') || rawCat.includes('pelarut')) category = 'solvent';
    else if (rawCat.includes('surfactant') || rawCat.includes('surfaktan')) category = 'surfactant';
    else if (rawCat.includes('thickener') || rawCat.includes('pengental')) category = 'thickener';
    else if (rawCat.includes('fragrance') || rawCat.includes('pewangi')) category = 'fragrance';
    else if (rawCat.includes('colorant') || rawCat.includes('pewarna')) category = 'colorant';

    const manufacturer = cols[4]?.trim() || 'General Manufacturer';
    const storageConditions = cols[5]?.trim() || 'Suhu ruang (15-25°C), kedap udara & kering';
    const sdsDocNumber = cols[6]?.trim() || `SDS-LMS-${code}`;
    
    // Substitutes in column index 7
    const rawSubstitutes = cols[7]?.trim();
    const approvedSubstitutes = rawSubstitutes 
      ? rawSubstitutes.split(',').map(s => s.trim()).filter(Boolean) 
      : [];

    // Lead time check in column index 8
    let leadTime = 14;
    let paramStartIndex = 8;
    if (cols[8] && !isNaN(Number(cols[8])) && cols[8].trim() !== '') {
      leadTime = Number(cols[8]);
      paramStartIndex = 9;
    }

    // QC parameters start from paramStartIndex onwards in pairs
    const qcParameters: QCParameter[] = [];
    if (cols.length <= paramStartIndex) {
      qcParameters.push(
        { name: 'Bentuk', specification: 'Sesuai Standar' },
        { name: 'Warna', specification: 'Sesuai Standar' },
        { name: 'Bau', specification: 'Khas Lemah' }
      );
    } else {
      for (let j = paramStartIndex; j < cols.length; j += 2) {
        const pName = cols[j]?.trim();
        const pSpec = cols[j+1]?.trim() || '-';
        if (pName) {
          qcParameters.push({ name: pName, specification: pSpec });
        }
      }
    }

    list.push({
      id: generateUUID(),
      code,
      specNumber: `SP-BB-${code}`,
      name,
      chemicalName,
      category,
      categories: [category],
      storageConditions,
      sdsDocNumber,
      approvedSubstitutes,
      manufacturer,
      qcParameters,
      supplierLeadTimeDays: leadTime
    });
  };

  const handleExecuteImport = async () => {
    if (!canWrite) {
      alert('Akses Ditolak: Anda memiliki izin Hanya Lihat (Read-Only) pada modul R&D.');
      return;
    }
    if (importPreview.length === 0 || isSubmittingImport) return;

    setIsSubmittingImport(true);
    const count = importPreview.length;

    try {
      if (onBatchSaveRM) {
        await onBatchSaveRM(importPreview);
      } else {
        for (const rm of importPreview) {
          onSaveRM(rm);
        }
      }

      setShowImportModal(false);
      setPasteData('');
      setImportPreview([]);
      setImportError(null);
      setImportedFileName('');
      setSuccessToast(`Berhasil mengimpor ${count} data master bahan baku secara massal ke database.`);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Import RM error:', err);
      setImportError(`Gagal melakukan import: ${err.message || String(err)}`);
    } finally {
      setIsSubmittingImport(false);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      {/* Toast Notification */}
      {successToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl flex items-center justify-between text-xs font-medium shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button 
            onClick={() => setSuccessToast(null)}
            className="text-emerald-500 hover:text-emerald-800 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Read-Only Access Notification Banner */}
      {!canWrite && (
        <div className="bg-amber-50/80 border border-amber-200/80 text-amber-900 px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs shadow-2xs">
          <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 font-bold">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1">
            <span className="font-extrabold block text-xs">Mode Akses Khusus: Hanya Lihat (Read-Only)</span>
            <span className="text-amber-700 text-[10px]">
              Akun Anda ({user?.name || user?.username} - {user?.nik}) terdaftar dalam hak akses penelaah (Read) untuk Modul R&D. Fitur penambahan bahan, import Excel, penyuntingan data, dan otorisasi dikunci demi integritas CPKB.
            </span>
          </div>
        </div>
      )}

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode, nama, pabrikan, atau rumus kimia..."
            value={searchRM}
            onChange={(e) => setSearchRM(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600 shadow-2xs"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Tombol Import Excel */}
          {canWrite ? (
            <>
              {/* Tombol Auto-Link INCI Sama */}
              <button
                type="button"
                onClick={openInciSyncModal}
                className="px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-xs font-bold text-purple-900 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Sinkronkan bahan baku yang memiliki nama INCI sama agar otomatis saling menjadi bahan pengganti resmi (Approved Substitutes)"
              >
                <RefreshCw className="w-3.5 h-3.5 text-purple-700" />
                <span>Auto-Link INCI Sama</span>
              </button>

              <button
                onClick={() => {
                  setPasteData('');
                  setImportPreview([]);
                  setImportError(null);
                  setImportedFileName('');
                  setShowImportModal(true);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Import bahan baku dari file Excel atau salin-tempel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Import Excel / Salin</span>
              </button>

              {/* Tombol Tambah Bahan Baru */}
              <button
                onClick={openAddRMModal}
                className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Bahan Baku</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                title="Unduh Template Excel Standar CPKB"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Unduh Template RM</span>
              </button>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>Mode Baca (Read-Only)</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Table List (Streamlined & Clean without Lead Time) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2 px-2.5 text-center w-10">No</th>
                <th className="py-2 px-3">Kode RM</th>
                <th className="py-2 px-3">Nama Dagang Bahan</th>
                <th className="py-2 px-3">Kategori Fungsional</th>
                <th className="py-2 px-3">Pabrikan (Manufacturer)</th>
                <th className="py-2 px-3">Parameter Acuan QC</th>
                <th className="py-2 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {currentItems.length > 0 ? (
                currentItems.map((rm, idx) => {
                  const displayCategories = rm.categories && rm.categories.length > 0 ? rm.categories : [rm.category];
                  return (
                    <tr 
                      key={rm.id} 
                      className="hover:bg-purple-50/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedRMForDetails(rm)}
                    >
                      {/* Nomor Urut */}
                      <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold text-[11px]">
                        {indexOfFirstItem + idx + 1}
                      </td>

                      {/* Kode & No. Spesifikasi */}
                      <td className="py-1.5 px-3 font-mono">
                        <div className="font-bold text-purple-700">{rm.code}</div>
                        <div className="text-[10px] font-mono text-slate-500 font-semibold">{rm.specNumber || `SP-BB-${rm.code}`}</div>
                      </td>
                      
                      {/* Nama */}
                      <td className="py-1.5 px-3 max-w-xs">
                        <div className="font-bold text-slate-800 break-words text-xs">{rm.name}</div>
                        {rm.chemicalName && (
                          <div className="text-[10px] text-slate-400 italic truncate max-w-[240px]">
                            {rm.chemicalName}
                          </div>
                        )}
                      </td>
                      
                      {/* Kategori Fungsional (Multi-Badge Support) */}
                      <td className="py-1.5 px-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {displayCategories.map((catKey, cIdx) => {
                            const config = RAW_MATERIAL_CATEGORIES.find(c => c.id === catKey);
                            const label = catKey === 'other' && rm.otherCategorySpecification 
                              ? rm.otherCategorySpecification 
                              : (config ? config.label.split(' ')[0] : catKey);
                            return (
                              <span 
                                key={cIdx} 
                                className={`px-1.5 py-0.25 rounded-full text-[9px] font-bold uppercase border ${config ? config.badge : 'bg-purple-50 text-purple-700 border-purple-200'}`}
                              >
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      
                      {/* Pabrikan */}
                      <td className="py-1.5 px-3 text-slate-600 font-medium text-xs">
                        {rm.manufacturer || <span className="text-slate-400 italic font-normal">Tidak diisi</span>}
                      </td>
                      
                      {/* QC Parameters Count */}
                      <td className="py-1.5 px-3 font-bold text-slate-600">
                        {rm.qcParameters && rm.qcParameters.length > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-purple-50 border border-purple-100 text-purple-700 text-[11px] font-bold font-mono">
                            {rm.qcParameters.length} Parameter
                          </span>
                        ) : (
                          <span className="text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.25 rounded text-[10px] font-medium">
                            0 Parameter
                          </span>
                        )}
                      </td>
                    
                      {/* Aksi */}
                      <td className="py-1.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {canWrite ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEditRMClick(rm)}
                              className="p-1 rounded bg-slate-50 border border-slate-200 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 text-slate-600 transition-colors cursor-pointer"
                              title="Edit bahan baku & parameter"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setRmToDelete(rm);
                                setDeletePassword('');
                                setDeletePasswordError(null);
                              }}
                              className="p-1 rounded bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-600 transition-colors cursor-pointer"
                              title="Hapus bahan baku (Konfirmasi Kata Sandi)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setSelectedRMForDetails(rm)}
                              className="px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Lihat detail lengkap bahan baku"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Detail</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium text-xs">
                    Tidak ada data bahan baku yang cocok dengan pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={currentPage}
            totalItems={filteredRM.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(items) => {
              setItemsPerPage(items);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* ======================================= */}
      {/* MODAL DIALOG: TAMBAH / EDIT BAHAN BAKU  */}
      {/* ======================================= */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          {/* Backdrop Blur */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setShowFormModal(false)}
          ></div>

          {/* Modal Content */}
          <div className="relative bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowFormModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="border-b border-slate-100 pb-4 mb-5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    {editingRM ? `Edit Spesifikasi: ${editingRM.code}` : 'Tambah Bahan Baku Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Definisikan identitas fisik bahan baku beserta standar mutu parameter QC Laboratorium
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleValidateAndOpenLiveView} className="flex-1 overflow-y-auto pr-1 space-y-6">
              {/* Validation Alert Banner */}
              {validationErrors.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs">
                  <div className="flex items-center gap-2 font-bold mb-1.5 text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Lengkapi Data Wajib Bagian A Sebelum Menyimpan:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-700">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* BAGIAN A: INFORMASI UTAMA BAHAN BAKU */}
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <h4 className="text-[11px] font-extrabold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-700"></span>
                    Bagian A: Informasi Utama Bahan Baku (Semua Kolom Wajib Diisi)
                  </h4>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                    * Wajib Lengkap
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Kode RM */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Kode RM <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rmCode}
                      onChange={(e) => setRmCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-mono font-bold uppercase"
                      placeholder="B0001"
                    />
                    <div className="mt-1.5 text-[10px] font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-block">
                      No. Spesifikasi: SP-BB-{rmCode.trim().toUpperCase() || 'B0001'}
                    </div>
                  </div>

                  {/* Nama Dagang */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Nama Dagang Bahan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rmName}
                      onChange={(e) => setRmName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-bold"
                      placeholder="Contoh: Niacinamide PC (Vitamin B3)"
                    />
                  </div>

                  {/* Nama INCI */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Nama Kimia / INCI <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rmChemName}
                      onChange={(e) => setRmChemName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 italic"
                      placeholder="Contoh: Niacinamide"
                    />
                  </div>

                  {/* Produsen */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Produsen (Manufacturer) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rmManufacturer}
                      onChange={(e) => setRmManufacturer(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600"
                      placeholder="Contoh: DSM Nutritional Products"
                    />
                  </div>

                  {/* Batas ROP (Reorder Point) */}
                  <div>
                    <label className="block text-[10px] font-bold text-purple-800 uppercase mb-1 flex items-center gap-1">
                      <span>Batas ROP (Reorder Point)</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={rmReorderPoint}
                        onChange={(e) => setRmReorderPoint(Number(e.target.value))}
                        className="w-full bg-purple-50/50 border border-purple-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-bold font-mono"
                        placeholder="50"
                      />
                      <span className="absolute right-3 top-2 text-[10px] font-bold text-purple-600 uppercase">kg</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Ambang batas pengadaan stok</span>
                  </div>

                  {/* Kategori Multi-Select */}
                  <div className="md:col-span-3 bg-purple-50/40 border border-purple-100 p-3.5 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] font-extrabold text-purple-900 uppercase tracking-wide">
                        Kategori Bahan Baku (Bisa Pilih Lebih dari Satu) <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                        {rmCategories.length} Kategori Dipilih
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {RAW_MATERIAL_CATEGORIES.map((cat) => {
                        const isSelected = rmCategories.includes(cat.id);
                        return (
                          <button
                            type="button"
                            key={cat.id}
                            onClick={() => toggleCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-md flex items-center justify-center text-[9px] border ${
                              isSelected ? 'bg-white text-purple-700 border-white font-bold' : 'border-slate-300'
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                            <span>{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Form Input Detail jika 'Lain-lain' Dipilih */}
                    {rmCategories.includes('other') && (
                      <div className="mt-3 pt-3 border-t border-purple-100 animate-fadeIn">
                        <label className="block text-[10px] font-bold text-purple-900 uppercase mb-1">
                          Sebutkan Rincian Kategori "Lain-lain" <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={rmOtherCategorySpec}
                          onChange={(e) => setRmOtherCategorySpec(e.target.value)}
                          placeholder="Contoh: Chelating Agent / Penstabil Busa / Antioksidan"
                          className="w-full bg-white border border-purple-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                        />
                      </div>
                    )}
                  </div>

                  {/* SDS Number */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Nomor Dokumen SDS <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rmSds}
                      onChange={(e) => setRmSds(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-mono font-bold"
                      placeholder="SDS-LMS-B0001"
                    />
                  </div>

                  {/* Kondisi Penyimpanan */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Kondisi Penyimpanan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rmStorage}
                      onChange={(e) => setRmStorage(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600"
                      placeholder="Contoh: Suhu 15-25°C, kedap udara"
                    />
                  </div>

                  {/* INTEGRASI GOOGLE DRIVE SDS (UPLOAD MASUK KE GOOGLE DRIVE) */}
                  <div className="md:col-span-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Cloud className="w-4 h-4 text-purple-700" />
                          <label className="text-[10px] font-extrabold text-slate-700 uppercase">
                            Dokumen SDS Resmi (Tersinkronisasi ke Google Drive) <span className="text-rose-500">*</span>
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Folder Cloud: <span className="font-mono text-purple-700">/PT_Larassanti_LMS/CPKB_Master_Data/SDS</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Tombol Upload File Masuk ke Google Drive */}
                        <label className={`px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${isUploadingSds ? 'opacity-50 pointer-events-none' : ''}`}>
                          <CloudUpload className="w-3.5 h-3.5" />
                          <span>{isUploadingSds ? 'Mengunggah ke Drive...' : 'Upload Dokumen SDS'}</span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,image/*"
                            onChange={handleUploadSds}
                            disabled={isUploadingSds}
                          />
                        </label>

                        {/* Tombol Tautkan Link Drive */}
                        <button
                          type="button"
                          onClick={() => setShowDriveUrlInput(!showDriveUrlInput)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                        >
                          {showDriveUrlInput ? 'Tutup Input URL' : 'Tautkan URL Drive'}
                        </button>
                      </div>
                    </div>

                    {/* Input manual URL Google Drive jika user ingin menautkan link yang sudah ada */}
                    {showDriveUrlInput && (
                      <div className="mb-3 p-3 bg-white border border-purple-200 rounded-xl flex items-center gap-2 animate-fadeIn">
                        <input
                          type="url"
                          value={customDriveUrl}
                          onChange={(e) => setCustomDriveUrl(e.target.value)}
                          placeholder="Tempelkan link Google Drive (https://drive.google.com/file/d/...)"
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                        />
                        <button
                          type="button"
                          onClick={handleLinkDriveUrl}
                          className="px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900 cursor-pointer"
                        >
                          Tautkan
                        </button>
                      </div>
                    )}

                    {/* Status Error Upload */}
                    {sdsUploadError && (
                      <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{sdsUploadError}</span>
                      </div>
                    )}

                    {/* Tampilan File Dokumen yang Terunggah di Google Drive */}
                    {sdsFile || sdsFileUrl ? (
                      <div className="p-3 bg-white border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800 break-all">
                                {sdsFileName || sdsFile?.fileName || `SDS-${rmCode || 'Bahan'}.pdf`}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                Google Drive
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-3">
                              {sdsFile?.fileSize ? <span>Ukuran: {driveClient.formatBytes(sdsFile.fileSize)}</span> : null}
                              <span className="font-mono text-purple-700 truncate max-w-[240px]">
                                {sdsFile?.driveUrl || sdsFileUrl}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={sdsFile?.previewUrl || sdsFile?.driveUrl || sdsFileUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1 border border-emerald-200 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Buka di Drive</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setSdsFile(null);
                              setSdsFileUrl('');
                              setSdsFileName('');
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Hapus Dokumen SDS"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 text-center border border-dashed border-slate-300 rounded-xl bg-white text-xs text-slate-400 flex flex-col items-center justify-center gap-1">
                        <CloudUpload className="w-6 h-6 text-slate-300" />
                        <span>Belum ada dokumen SDS yang diunggah ke Google Drive (Wajib diisi).</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* BAHAN PENGGANTI RESMI (DENGAN SEARCH & COUNTER) */}
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wide">
                          Bahan Pengganti Resmi yang Disetujui (Approved Substitutes) <span className="text-rose-500">*</span>
                        </label>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Pilih item bahan baku alternatif atau tandai sebagai bahan tunggal tanpa pengganti.
                      </p>
                    </div>

                    {/* Counter Checklist */}
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
                        rmSubstitutes.length > 0
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : isSingleSpecificMaterial
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {isSingleSpecificMaterial
                          ? 'Bahan Tunggal (0 Substitusi)'
                          : rmSubstitutes.length > 0
                          ? `${rmSubstitutes.length} Bahan Telah Dichecklist`
                          : '0 Bahan Telah Dichecklist (Wajib dipilih)'}
                      </span>
                    </div>
                  </div>

                  {/* Opsi Bahan Tunggal */}
                  <label className="flex items-center gap-2 p-2.5 mb-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={isSingleSpecificMaterial}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsSingleSpecificMaterial(checked);
                        if (checked) {
                          setRmSubstitutes([]);
                        }
                      }}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span>
                      Tandai sebagai Bahan Tunggal Spesifik (Formula eksklusif - tidak memiliki substitusi resmi)
                    </span>
                  </label>

                  {!isSingleSpecificMaterial && (
                    <div className="space-y-2">
                      {/* Search Bar & Toggle Filter Bahan Pengganti */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={substituteSearchQuery}
                            onChange={(e) => setSubstituteSearchQuery(e.target.value)}
                            placeholder="Cari kode, nama dagang, atau nama kimia..."
                            className="w-full bg-white border border-slate-200 rounded-xl py-1.5 pl-9 pr-8 text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                          />
                          {substituteSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setSubstituteSearchQuery('')}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                              title="Hapus pencarian"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Opsi 2: Toggle Filter INCI Sama Saja (Default) vs Semua Bahan */}
                        <button
                          type="button"
                          onClick={() => setFilterSameInciOnly(!filterSameInciOnly)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                            filterSameInciOnly
                              ? 'bg-purple-100 border-purple-300 text-purple-900 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                          title={filterSameInciOnly ? 'Menampilkan bahan dengan nama INCI/Kimia yang sama (Rekomendasi CPKB)' : 'Menampilkan seluruh bahan'}
                        >
                          <span>{filterSameInciOnly ? '🔬 INCI Sama Saja' : '🌐 Semua Bahan'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFilterSimilarCategoryOnly(!filterSimilarCategoryOnly)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                            filterSimilarCategoryOnly
                              ? 'bg-purple-50 border-purple-300 text-purple-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {filterSimilarCategoryOnly ? 'Kategori Cocok' : 'Semua Kategori'}
                        </button>
                      </div>

                      {/* Notifikasi Indikator Filter INCI */}
                      {filterSameInciOnly &&
                        (rmChemName || '').trim() &&
                        !/^[-–—\s]+$/.test((rmChemName || '').trim()) &&
                        !['n/a', 'na', 'none', 'tidak ada', 'null', 'undefined'].includes((rmChemName || '').trim().toLowerCase()) && (
                        <div className="text-[10px] text-purple-800 bg-purple-50/80 border border-purple-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                          <span>
                            🔬 <strong>Menyaring INCI Sama:</strong> "<em>{(rmChemName || '').trim()}</em>"
                          </span>
                          <span className="font-semibold text-purple-600 text-[9px] uppercase">
                            Standar CPKB & BPOM
                          </span>
                        </div>
                      )}

                      {/* Info jumlah hasil filter saat ada pencarian teks */}
                      {substituteSearchQuery.trim() && (
                        <div className="text-[10px] text-slate-500 px-1">
                          Kata kunci: "{substituteSearchQuery}"
                        </div>
                      )}

                      {/* List Item Bahan Pengganti */}
                      {(() => {
                        const isValidInci = (val?: string): boolean => {
                          if (!val) return false;
                          const trimmed = val.trim();
                          if (!trimmed) return false;
                          if (/^[-–—\s]+$/.test(trimmed)) return false;
                          const lower = trimmed.toLowerCase();
                          if (['n/a', 'na', 'none', 'tidak ada', 'null', 'undefined'].includes(lower)) return false;
                          return true;
                        };

                        const hasValidCurrentInci = isValidInci(rmChemName);
                        const normalizedCurrentInci = (rmChemName || '').trim().toLowerCase();

                        const candidateList = rawMaterials
                          .filter((rm) => rm.code !== rmCode)
                          .filter((rm) => {
                            if (filterSameInciOnly) {
                              if (!hasValidCurrentInci) return false;
                              const itemInci = (rm.chemicalName || '').trim().toLowerCase();
                              if (!isValidInci(itemInci) || itemInci !== normalizedCurrentInci) return false;
                            }
                            if (filterSimilarCategoryOnly) {
                              const itemCats = rm.categories || [rm.category];
                              if (!rmCategories.some((c) => itemCats.includes(c))) return false;
                            }
                            if (substituteSearchQuery.trim()) {
                              const q = substituteSearchQuery.toLowerCase();
                              return (
                                rm.code.toLowerCase().includes(q) ||
                                rm.name.toLowerCase().includes(q) ||
                                (rm.chemicalName && rm.chemicalName.toLowerCase().includes(q))
                              );
                            }
                            return true;
                          });

                        if (filterSameInciOnly && !hasValidCurrentInci) {
                          return (
                            <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center space-y-1">
                              <p className="font-bold">💡 Kolom Nama Kimia / INCI diisi tanda strip ("---") atau belum diisi</p>
                              <p className="text-[11px] text-amber-700">
                                Bahan tanpa nama INCI resmi dianggap sebagai <strong>Bahan Tunggal Spesifik</strong> (tidak memiliki substitusi resmi). Silakan centang opsi "Bahan Tunggal Spesifik" di atas atau klik tombol <strong>"🌐 Semua Bahan"</strong>.
                              </p>
                            </div>
                          );
                        }

                        if (candidateList.length === 0) {
                          return (
                            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center space-y-1.5">
                              {filterSameInciOnly ? (
                                <>
                                  <p className="font-bold text-slate-800">
                                    Tidak ada bahan baku lain dengan nama INCI "<em>{(rmChemName || '').trim()}</em>"
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    Bahan ini dapat ditandai sebagai <strong>"Bahan Tunggal Spesifik"</strong> (tidak memiliki substitusi resmi), atau klik <strong>"🌐 Semua Bahan"</strong> untuk melihat katalog lainnya.
                                  </p>
                                </>
                              ) : (
                                <p className="text-slate-400 italic">
                                  Tidak ada bahan baku yang cocok dengan filter atau kata kunci pencarian.
                                </p>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div className="bg-white border border-slate-200 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1 divide-y divide-slate-100">
                            {candidateList.map((rm) => {
                              const isChecked = rmSubstitutes.includes(rm.code);
                              return (
                                <div
                                  key={rm.id}
                                  onClick={() => toggleRmSubstitute(rm.code)}
                                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                    isChecked ? 'bg-purple-50/70 text-purple-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}} // handled by parent onClick
                                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 pointer-events-none"
                                    />
                                    <div>
                                      <div className="text-xs">
                                        <span className="font-mono text-purple-700 font-bold">{rm.code}</span> - {rm.name}
                                      </div>
                                      <div className="text-[10px] text-slate-400 italic">
                                        {rm.chemicalName || 'INCI tidak dicatat'}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {rm.manufacturer && (
                                      <span className="text-[9px] text-slate-400 truncate max-w-[100px]">
                                        {rm.manufacturer}
                                      </span>
                                    )}
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 uppercase border border-slate-200">
                                      {rm.category}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* BAGIAN B: PARAMETER & SPESIFIKASI ANALISA QC */}
              <div className="border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[11px] font-extrabold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-700"></span>
                    Bagian B: Spesifikasi Mutu Analisa QC ({rmQcParams.length} Kriteria)
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddQcParam}
                    className="text-[10px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Tambah Parameter Baru</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                  Standar mutu pengujian fisikokimia laboratorium RnD sebagai acuan verifikasi pelepasan batch bahan baku di Quality Control.
                </p>

                {/* Column Headers for Parameters */}
                {rmQcParams.length > 0 && (
                  <div className="flex gap-2.5 mb-2 px-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <div className="flex-1">Parameter Mutu</div>
                    <div className="flex-1">Syarat / Batas Penerimaan</div>
                    <div className="w-10"></div>
                  </div>
                )}

                {/* Dynamic Parameter Grid */}
                <div className="space-y-2.5">
                  {rmQcParams.map((param, index) => (
                    <div key={index} className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/60 p-2 rounded-xl">
                      {/* Nama Parameter */}
                      <div className="flex-1">
                        <input
                          type="text"
                          required
                          value={param.name}
                          onChange={(e) => handleQcParamChange(index, 'name', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-purple-600 font-bold"
                          placeholder="Nama Parameter (misal: Kadar Air)"
                        />
                      </div>
                      {/* Syarat Spesifikasi */}
                      <div className="flex-1">
                        <input
                          type="text"
                          required
                          value={param.specification}
                          onChange={(e) => handleQcParamChange(index, 'specification', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                          placeholder="Syarat / Acuan (misal: Max 0.5%)"
                        />
                      </div>
                      {/* Tombol Hapus */}
                      <button
                        type="button"
                        onClick={() => handleRemoveQcParam(index)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-all cursor-pointer shrink-0"
                        title="Hapus parameter"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {rmQcParams.length === 0 && (
                    <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-400">
                      Tidak ada parameter mutu QC. Klik "Tambah Parameter Baru" di atas untuk membuat acuan uji.
                    </div>
                  )}
                </div>
              </div>

              {/* Action Submit */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-700" />
                  <span>Wajib otorisasi kata sandi saat konfirmasi simpan</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Save className="w-4 h-4" />
                    <span>Simpan Master Bahan</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: LIVE VIEW DATA & KONFIRMASI PASSWORD USER          */}
      {/* ======================================================== */}
      {showLiveViewModal && (
        <div className="fixed inset-0 z-60 overflow-y-auto flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs transition-opacity" 
            onClick={() => !isVerifyingPassword && setShowLiveViewModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-fadeIn">
            {/* Close */}
            <button
              onClick={() => !isVerifyingPassword && setShowLiveViewModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="border-b border-slate-100 pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    Live View Data Master Bahan Baku
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Tinjau kelengkapan seluruh data Bagian A & Bagian B sebelum melakukan konfirmasi kata sandi pengguna.
                  </p>
                </div>
              </div>
            </div>

            {/* Content: Live View Summary */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
              {/* Card 1: Identitas & Bagian A */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h5 className="text-[11px] font-extrabold text-purple-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-700"></span>
                  Live View Bagian A: Informasi Utama Bahan Baku
                </h5>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Kode & No. Spesifikasi</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-purple-700 text-xs bg-purple-100 px-2 py-0.5 rounded">{rmCode}</span>
                      <span className="font-mono font-bold text-indigo-700 text-xs bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">SP-BB-{rmCode.trim().toUpperCase()}</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Nama Dagang Bahan</span>
                    <span className="font-bold text-slate-800">{rmName}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Nama Kimia / INCI</span>
                    <span className="italic text-slate-700">{rmChemName}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Produsen / Manufacturer</span>
                    <span className="font-semibold text-slate-700">{rmManufacturer}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Kategori Terpilih</span>
                    <div className="flex flex-wrap gap-1">
                      {rmCategories.map((catKey) => {
                        const cfg = RAW_MATERIAL_CATEGORIES.find((c) => c.id === catKey);
                        return (
                          <span
                            key={catKey}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                              cfg ? cfg.badge : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {catKey === 'other' && rmOtherCategorySpec
                              ? `Lain-lain (${rmOtherCategorySpec})`
                              : cfg?.label || catKey}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Kondisi Penyimpanan</span>
                    <span className="text-slate-700">{rmStorage}</span>
                  </div>
                </div>

                {/* Dokumen SDS Google Drive */}
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Dokumen SDS Google Drive</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-bold text-slate-800">{rmSds}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          Google Drive
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        {sdsFileName || sdsFile?.fileName || 'Dokumen-SDS.pdf'}
                      </span>
                    </div>

                    {(sdsFile?.driveUrl || sdsFileUrl) && (
                      <a
                        href={sdsFile?.previewUrl || sdsFile?.driveUrl || sdsFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1 border border-emerald-200 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Dokumen</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Bahan Pengganti Resmi yang Disetujui */}
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    Bahan Pengganti Resmi yang Disetujui
                  </span>
                  {isSingleSpecificMaterial ? (
                    <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                      Bahan Tunggal Spesifik (Formula Eksklusif - Tidak Ada Substitusi)
                    </span>
                  ) : rmSubstitutes.length > 0 ? (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-purple-700 mb-1">
                        {rmSubstitutes.length} Bahan Telah Dichecklist Sebagai Alternatif Resmi:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {rmSubstitutes.map((subCode) => {
                          const subMat = rawMaterials.find((r) => r.code === subCode);
                          return (
                            <span
                              key={subCode}
                              className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-800 font-medium text-[10px] flex items-center gap-1 shadow-2xs"
                            >
                              <span className="font-mono font-bold text-purple-700">{subCode}</span>
                              {subMat ? ` - ${subMat.name}` : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">Tidak ada bahan pengganti dipilih</span>
                  )}
                </div>
              </div>

              {/* Card 2: Bagian B Spesifikasi Mutu Analisa QC Lengkap */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h5 className="text-[11px] font-extrabold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-700"></span>
                    Live View Bagian B: Spesifikasi Mutu Analisa QC
                  </h5>
                  <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                    {rmQcParams.filter((p) => p.name.trim() !== '').length} Parameter Terdaftar
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-1.5 px-3 w-10 text-center">No</th>
                        <th className="py-1.5 px-3 w-1/2">Parameter Mutu Lab</th>
                        <th className="py-1.5 px-3">Syarat / Batas Penerimaan Lab</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {rmQcParams
                        .filter((p) => p.name.trim() !== '')
                        .map((param, pIdx) => (
                          <tr key={pIdx} className="hover:bg-slate-50/60">
                            <td className="py-1.5 px-3 text-center font-mono text-slate-400 font-bold text-[10px]">
                              {pIdx + 1}
                            </td>
                            <td className="py-1.5 px-3 font-bold text-slate-800">
                              {param.name}
                            </td>
                            <td className="py-1.5 px-3 font-mono text-purple-800 font-medium">
                              {param.specification}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Card 3: Form Konfirmasi Password User (E-Signature) */}
              <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-purple-700" />
                    <h5 className="text-[11px] font-extrabold text-purple-900 uppercase tracking-wide">
                      Otorisasi Konfirmasi Tanda Tangan Elektronik (E-Signature)
                    </h5>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-purple-800 bg-white px-2 py-0.5 rounded-full border border-purple-200">
                    NIK: {user?.nik || 'admin'}
                  </span>
                </div>

                <div className="p-2.5 bg-white border border-purple-100 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                  Penanggung Jawab: <strong className="text-slate-800">{user?.name || 'Administrator'}</strong> ({user?.department?.toUpperCase() || 'R&D'} - {user?.role?.toUpperCase() || 'SUPERVISOR'}).
                  Sesuai standar CPKB BPOM Bab 4 & 21 CFR Part 11, masukkan kata sandi akun Anda untuk menandatangani data master ini secara sah.
                </div>

                {confirmPasswordError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{confirmPasswordError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    Kata Sandi Akun Pengguna <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setConfirmPasswordError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFinalSaveWithPassword();
                        }
                      }}
                      placeholder="Masukkan kata sandi Anda..."
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 pl-3 pr-10 text-xs text-slate-800 focus:outline-none focus:border-purple-600 font-medium"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    *Masukkan kata sandi akun yang sedang aktif untuk otorisasi final.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                disabled={isVerifyingPassword}
                onClick={() => setShowLiveViewModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all cursor-pointer"
              >
                Kembali Edit Data
              </button>
              <button
                type="button"
                disabled={isVerifyingPassword}
                onClick={handleFinalSaveWithPassword}
                className="px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                {isVerifyingPassword ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Sandi...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Konfirmasi & Simpan Sah</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DIALOG: BULK IMPORT EXCEL (DUAL MODE: FILE / PASTE) */}
      {/* ======================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setShowImportModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="border-b border-slate-100 pb-4 mb-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">Import Master Bahan Baku Excel</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pilih drag & drop file spreadsheet atau salin-tempel langsung untuk import massal bahan baku CPKB
                  </p>
                </div>
              </div>

              {/* Tombol Unduh Template Excel */}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Unduh Template Excel (.xlsx)</span>
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 shrink-0">
              <button
                type="button"
                onClick={() => setImportTab('file')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  importTab === 'file'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <FileUp className="w-4 h-4" />
                <span>Drop / Upload File Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setImportTab('paste')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  importTab === 'paste'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Salin & Tempel (Paste Text)</span>
              </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 py-2">
              {/* Petunjuk Format */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-[11px] text-slate-600 leading-relaxed">
                <span className="font-extrabold text-slate-800 uppercase block mb-1">📋 Standar Format Kolom CPKB:</span>
                Urutan kolom baku: <span className="font-mono text-purple-700 font-bold">Kode RM ➔ Nama Dagang ➔ Nama INCI ➔ Kategori ➔ Produsen ➔ Penyimpanan ➔ SDS Doc ➔ Substitusi ➔ Param 1 ➔ Syarat 1...</span>
              </div>

              {/* Mode 1: Drag & Drop Zone */}
              {importTab === 'file' && (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileDropOrSelect(file);
                    }}
                  />
                  
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileDropOrSelect(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                      isDragging
                        ? 'border-purple-600 bg-purple-50/70 scale-[0.99]'
                        : 'border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/30'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 shadow-2xs">
                      <Upload className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {importedFileName ? (
                          <span className="text-purple-700 font-black flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            {importedFileName}
                          </span>
                        ) : (
                          'Tarik & Lepaskan File Excel ke Sini'
                        )}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Mendukung format <span className="font-semibold text-slate-600">.XLSX, .XLS, .CSV</span>. Atau klik untuk memilih file dari komputer Anda.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold pointer-events-none"
                    >
                      Pilih File Spreadsheet
                    </button>
                  </div>
                </div>
              )}

              {/* Mode 2: Paste Area */}
              {importTab === 'paste' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Tempelkan Baris Excel (Tab-Separated):
                  </label>
                  <textarea
                    value={pasteData}
                    onChange={handlePasteChange}
                    className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-mono focus:outline-none focus:bg-white focus:border-purple-600 placeholder-slate-400"
                    placeholder="B0001	Niacinamide PC	Nicotinamide	active	DSM Nutritional	Suhu ruang	SDS-LMS-B0001	B0002	14	Bentuk	Bubuk	Warna	Putih	pH	6.0 - 7.5"
                  ></textarea>
                </div>
              )}

              {importError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Preview Parsing */}
              {importPreview.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🔍 Pratinjau Hasil Parsing:</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                        {importPreview.length} Bahan Siap Diimport
                      </span>
                    </h4>
                  </div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-52 overflow-y-auto shadow-2xs">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                        <tr className="text-slate-600 font-bold uppercase">
                          <th className="p-2.5 pl-3 w-10 text-center">No</th>
                          <th className="p-2.5">Kode RM</th>
                          <th className="p-2.5">Nama Dagang</th>
                          <th className="p-2.5">Kategori</th>
                          <th className="p-2.5">Produsen</th>
                          <th className="p-2.5">Substitusi</th>
                          <th className="p-2.5 pr-3">Parameter QC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-600 bg-white font-medium">
                        {importPreview.map((rm, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2.5 pl-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-2.5 font-mono font-bold text-purple-700">{rm.code}</td>
                            <td className="p-2.5 font-bold text-slate-800">{rm.name}</td>
                            <td className="p-2.5 uppercase text-[9px] font-bold text-purple-600">{rm.category}</td>
                            <td className="p-2.5">{rm.manufacturer}</td>
                            <td className="p-2.5 font-mono">
                              {rm.approvedSubstitutes.length > 0 ? rm.approvedSubstitutes.join(', ') : '-'}
                            </td>
                            <td className="p-2.5 pr-3">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {rm.qcParameters.map((p, pIdx) => (
                                  <span key={pIdx} className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[8px] whitespace-nowrap">
                                    {p.name}: {p.specification}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                disabled={isSubmittingImport}
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={importPreview.length === 0 || isSubmittingImport}
                onClick={handleExecuteImport}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
                  importPreview.length > 0 && !isSubmittingImport
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                {isSubmittingImport ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan {importPreview.length} Data...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Simpan & Import Semua Data ({importPreview.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* MODAL DIALOG: DETAIL BAHAN BAKU        */}
      {/* ======================================= */}
      {selectedRMForDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setSelectedRMForDetails(null)}
          ></div>

          <div className="relative bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedRMForDetails(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="border-b border-slate-100 pb-3 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
                  <Eye className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-bold text-[11px] text-purple-700 bg-slate-100 px-1.5 py-0.25 rounded">
                      Kode: {selectedRMForDetails.code}
                    </span>
                    <span className="font-mono font-bold text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.25 rounded">
                      No. Spesifikasi: {selectedRMForDetails.specNumber || `SP-BB-${selectedRMForDetails.code}`}
                    </span>
                    {(selectedRMForDetails.categories && selectedRMForDetails.categories.length > 0
                      ? selectedRMForDetails.categories
                      : [selectedRMForDetails.category]
                    ).map((catKey) => {
                      const cfg = RAW_MATERIAL_CATEGORIES.find((c) => c.id === catKey);
                      return (
                        <span
                          key={catKey}
                          className={`px-1.5 py-0.25 rounded-full text-[9px] font-bold border uppercase ${
                            cfg ? cfg.badge : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {catKey === 'other' && selectedRMForDetails.otherCategorySpecification
                            ? `Lain-lain: ${selectedRMForDetails.otherCategorySpecification}`
                            : cfg?.label || catKey}
                        </span>
                      );
                    })}
                  </div>
                  <h3 className="text-sm font-black text-slate-800 mt-0.5">
                    {selectedRMForDetails.name}
                  </h3>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {/* Bagian A */}
              <div>
                <h4 className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-700"></span>
                  Bagian A: Spesifikasi Teknis & Identitas (Wajib)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-slate-50 border border-slate-200/60 p-3 rounded-xl text-xs">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">Nama Kimia / INCI Name</span>
                    <span className="font-bold text-slate-800 italic mt-0.5 block break-words text-xs">
                      {selectedRMForDetails.chemicalName || <span className="text-slate-400 font-normal">Tidak ada</span>}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">Pabrikan (Manufacturer)</span>
                    <span className="font-bold text-slate-800 mt-0.5 block break-words text-xs">
                      {selectedRMForDetails.manufacturer || <span className="text-slate-400 font-normal">Tidak diisi</span>}
                    </span>
                  </div>

                  <div className="md:col-span-2">
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">Dokumen SDS & Google Drive</span>
                    <div className="mt-0.5 flex flex-col gap-1">
                      <span className="font-mono font-bold text-slate-800 text-xs">
                        {selectedRMForDetails.sdsDocNumber}
                      </span>
                      {selectedRMForDetails.sdsFileUrl ? (
                        <a
                          href={selectedRMForDetails.sdsFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 hover:bg-emerald-100 transition-colors w-fit"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Buka Dokumen di Google Drive ({selectedRMForDetails.sdsFileName || 'SDS.pdf'})</span>
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Tersimpan lokal (belum di Google Drive)</span>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">Kondisi Penyimpanan</span>
                    <span className="font-medium text-slate-700 mt-0.5 block text-xs">
                      {selectedRMForDetails.storageConditions}
                    </span>
                  </div>

                  <div className="md:col-span-2">
                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Bahan Substitusi yang Disetujui</span>
                    {selectedRMForDetails.isSingleSpecificMaterial ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200 inline-block">
                        Bahan Tunggal (Formula Eksklusif - Tidak Ada Substitusi)
                      </span>
                    ) : selectedRMForDetails.approvedSubstitutes && selectedRMForDetails.approvedSubstitutes.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedRMForDetails.approvedSubstitutes.map((subCode) => {
                          const subRM = rawMaterials.find(r => r.code === subCode);
                          return (
                            <span key={subCode} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono font-bold text-purple-700 text-[10px]">
                              {subCode} {subRM ? `- ${subRM.name}` : ''}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Tidak ada bahan substitusi yang disetujui</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bagian B */}
              <div>
                <h4 className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-700"></span>
                  Bagian B: Spesifikasi Mutu Laboratorium QC ({selectedRMForDetails.qcParameters?.length || 0} Kriteria)
                </h4>

                {selectedRMForDetails.qcParameters && selectedRMForDetails.qcParameters.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[9px] tracking-wider">
                          <th className="py-1.5 px-3 w-1/2">Parameter Analisa</th>
                          <th className="py-1.5 px-3 w-1/2">Syarat / Batas Penerimaan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 bg-white font-medium">
                        {selectedRMForDetails.qcParameters.map((param, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40">
                            <td className="py-1.5 px-3 font-bold text-slate-800">{param.name}</td>
                            <td className="py-1.5 px-3 font-mono text-slate-600">{param.specification}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-400">
                    Bahan baku ini tidak memiliki kriteria QC.
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedRMForDetails(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition-all cursor-pointer shadow-2xs"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KONFIRMASI DELETE DENGAN PASSWORD USER AKTIF      */}
      {/* ======================================================== */}
      {rmToDelete && (
        <div className="fixed inset-0 z-60 overflow-y-auto flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => !isVerifyingDeletePassword && setRmToDelete(null)}
          ></div>

          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Close */}
            <button
              type="button"
              disabled={isVerifyingDeletePassword}
              onClick={() => setRmToDelete(null)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Konfirmasi Hapus Bahan Baku
                </h3>
                <p className="text-[11px] text-slate-500">
                  Otorisasi Keamanan CPKB & Jejak Audit
                </p>
              </div>
            </div>

            {/* Detail Item Info */}
            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl mb-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Kode Bahan:</span>
                <span className="font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-xs">
                  {rmToDelete.code}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Nama Dagang:</span>
                <span className="font-bold text-slate-800 text-right max-w-[200px] truncate">
                  {rmToDelete.name}
                </span>
              </div>
              {rmToDelete.manufacturer && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Pabrikan:</span>
                  <span className="text-slate-700">{rmToDelete.manufacturer}</span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-600 mb-4 leading-relaxed">
              Tindakan ini permanen. Masukkan kata sandi akun pengguna aktif Anda (<span className="font-bold text-purple-800">{user?.name || user?.username || 'ADMIN'} - {user?.nik}</span>) untuk mengonfirmasi penghapusan.
            </p>

            {/* Password input */}
            <div className="space-y-2 mb-4">
              <label className="block text-[10px] font-extrabold text-slate-700 uppercase tracking-wide">
                Kata Sandi Pengguna Aktif <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showDeletePassword ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmDeleteRM();
                    }
                  }}
                  autoFocus
                  placeholder="Masukkan kata sandi akun Anda..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-3.5 pr-10 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-rose-600 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword(!showDeletePassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {deletePasswordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deletePasswordError}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isVerifyingDeletePassword}
                onClick={() => setRmToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isVerifyingDeletePassword || !deletePassword.trim()}
                onClick={handleConfirmDeleteRM}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                {isVerifyingDeletePassword ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Konfirmasi Hapus</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Sinkronisasi Otomatis Substitusi INCI Sama */}
      {showInciSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center shadow-xs">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-purple-950">
                    Sinkronisasi Otomatis Substitusi INCI Sama
                  </h3>
                  <p className="text-[11px] text-purple-700 mt-0.5">
                    Bahan baku dengan Nama Kimia / INCI identik akan saling ditautkan sebagai Approved Substitutes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInciSyncModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white/80 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Ringkasan Statistik */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
                    Kelompok INCI Sama Ditemukan
                  </div>
                  <div className="text-xl font-black font-mono mt-0.5">
                    {inciSyncPreview.groups.length} <span className="text-xs font-normal">Grup INCI</span>
                  </div>
                  <div className="text-[10px] text-purple-700 mt-0.5">
                    Mencakup {inciSyncPreview.totalToUpdate} bahan yang akan saling substitusi
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Bahan INCI Tunggal (Unik)
                  </div>
                  <div className="text-xl font-black font-mono mt-0.5">
                    {inciSyncPreview.singlesCount} <span className="text-xs font-normal">Bahan</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Tetap sebagai Bahan Tunggal Spesifik
                  </div>
                </div>
              </div>

              {/* Pratinjau Daftar Kelompok */}
              <div>
                <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wide mb-2 flex items-center justify-between">
                  <span>Daftar Bahan Yang Akan Saling Ditautkan:</span>
                  <span className="text-[10px] font-mono text-purple-700 font-bold">
                    Standar CPKB & BPOM
                  </span>
                </div>

                {inciSyncPreview.groups.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-500 space-y-1">
                    <p className="font-bold text-slate-700">Belum ada bahan dengan nama INCI kembar.</p>
                    <p className="text-[11px] text-slate-400">
                      Seluruh bahan baku yang terdaftar saat ini memiliki nama INCI yang unik / belum ada duplikat nama kimia.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {inciSyncPreview.groups.map((group, gIdx) => (
                      <div
                        key={gIdx}
                        className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
                            <span className="text-xs font-black text-slate-900">
                              INCI: <em>"{group.inci}"</em>
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                            {group.materials.length} Bahan Saling Substitusi
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {group.materials.map((m) => (
                            <div
                              key={m.id}
                              className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-col justify-between"
                            >
                              <div>
                                <span className="font-mono font-bold text-purple-700 text-[11px]">
                                  {m.code}
                                </span>{' '}
                                <span className="font-bold text-slate-800 text-[11px]">{m.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                                <span>Pabrikan: {m.manufacturer || '-'}</span>
                                <span className="uppercase text-[9px] font-semibold text-slate-500">
                                  {m.category}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Penjelasan Integritas CPKB */}
              <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl text-[11px] text-purple-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span>ℹ️</span> Kepatuhan Sistem CPKB BPOM:
                </p>
                <p className="text-[10.5px] text-purple-800 leading-relaxed">
                  Tindakan ini akan memperbarui relasi <code>approved_substitutes</code> langsung ke database Supabase secara transaksi massal. Formulasi produk dan BoM yang merujuk pada bahan-bahan ini otomatis dapat menggunakan alternatif dari kelompok INCI yang sama.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                disabled={isSyncingInci}
                onClick={() => setShowInciSyncModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSyncingInci || inciSyncPreview.groups.length === 0}
                onClick={handleExecuteInciSync}
                className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-purple-700/20"
              >
                {isSyncingInci ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyinkronkan ke Supabase...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Terapkan ke Database Supabase</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
