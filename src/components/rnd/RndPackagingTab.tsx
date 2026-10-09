import React, { useState, useRef, useEffect } from 'react';
import { PackagingMaterial, QCParameter } from '../../types';
import { useAuth } from '../../core/auth/AuthContext';
import { canWriteModule } from '../../core/auth/permissionGuard';
import { authService } from '../../core/auth/authService';
import { ensureUUID, generateUUID } from '../../utils/uuid';
import { auditLogger } from '../../core/utils/auditLogger';
import * as XLSX from 'xlsx';
import {
  Layers,
  Search,
  Plus,
  Edit2,
  Trash2,
  FileSpreadsheet,
  Download,
  Lock,
  Eye,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Boxes,
  CloudUpload,
  EyeOff,
  RefreshCw,
} from 'lucide-react';

interface RndPackagingTabProps {
  packagingMaterials: PackagingMaterial[];
  onSavePM: (pm: PackagingMaterial) => void;
  onBatchSavePM?: (pms: PackagingMaterial[]) => Promise<void> | void;
  onDeletePM: (id: string) => void;
}

export const PACKAGING_TYPES = [
  { id: 'primary', label: 'Primer (Wadah Langsung)', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'secondary', label: 'Sekunder (Dus / Inner Box)', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'tertiary', label: 'Tersier (Master Karton)', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
];

export const PACKAGING_UNITS = ['Pcs', 'Roll'];

export const DEFAULT_STORAGE_CONDITIONS = 'Suhu ruang (< 30°C), Kering & Bersih';

export const STANDARD_QC_PARAM_NAMES = [
  'Bentuk',
  'Warna',
  'Bahan',
  'Kebersihan',
  'Penulisan nama Merek dan Produk',
  'Kemanfaatan/Kegunaan/klaim sesuai BPOM',
  'Terdapat cara Penggunaan kosmetik',
  'Terdapat cara penulisan komposisi dari terbesar hingga terkecil',
  'Penulisan Nama, Alamat lengkap dan Negara Produsen Pemilik Nomor Notifikasi',
  'Terdapat Ukuran, Isi, Atau Berat Bersih',
  'Terdapat 2D Barcode',
  'Terdapat NIE',
  'Kebocoran',
  'Kerekatan',
  'Kualitas Cetakan',
  'Ukuran',
  'Volume',
  'Uji Jatuh',
  'Kecocokan Pasangan',
];

export const DEFAULT_QC_PARAMS: QCParameter[] = [
  { name: 'Bentuk', specification: 'Sesuai standar master spesifikasi' },
  { name: 'Warna', specification: 'Sesuai standar master warna' },
  { name: 'Bahan', specification: 'Sesuai spesifikasi material' },
  { name: 'Kebersihan', specification: 'Bebas dari debu & kontaminan' },
  { name: 'Penulisan nama Merek dan Produk', specification: 'Jelas, terbaca, dan tidak luntur' },
  { name: 'Kemanfaatan/Kegunaan/klaim sesuai BPOM', specification: 'Sesuai persetujuan NIE BPOM' },
  { name: 'Terdapat cara Penggunaan kosmetik', specification: 'Tercantum dengan bahasa Indonesia' },
  { name: 'Terdapat cara penulisan komposisi dari terbesar hingga terkecil', specification: 'Urutan INCI ingredient sesuai' },
  { name: 'Penulisan Nama, Alamat lengkap dan Negara Produsen Pemilik Nomor Notifikasi', specification: 'Lengkap dan akurat' },
  { name: 'Terdapat Ukuran, Isi, Atau Berat Bersih', specification: 'Sesuai netto terdaftar' },
  { name: 'Terdapat 2D Barcode', specification: 'Baris 2D / QR code scannable' },
  { name: 'Terdapat NIE', specification: 'Nomor Notifikasi BPOM valid' },
  { name: 'Kebocoran', specification: 'Uji vakum 0.5 bar 5 menit no leak' },
  { name: 'Kerekatan', specification: 'Uji tape test 3M tidak terkelupas' },
  { name: 'Kualitas Cetakan', specification: 'Presisi, tajam, tidak smudge' },
  { name: 'Ukuran', specification: 'Sesuai drawing / gambar teknik' },
  { name: 'Volume', specification: 'Sesuai spesifikasi volume g/mL' },
  { name: 'Uji Jatuh', specification: 'Lolos uji drop test 1.2 meter tanpa pecah' },
  { name: 'Kecocokan Pasangan', specification: 'Pasangan tutup dan wadah presisi / sealing rapat' },
];

import { Pagination } from '../../core/ui-components/Pagination';

export const RndPackagingTab: React.FC<RndPackagingTabProps> = ({
  packagingMaterials,
  onSavePM,
  onBatchSavePM,
  onDeletePM,
}) => {
  const { user } = useAuth();
  const canWrite = canWriteModule(user, 'rnd');

  const [searchPM, setSearchPM] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showLiveViewModal, setShowLiveViewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedPMForDetails, setSelectedPMForDetails] = useState<PackagingMaterial | null>(null);

  // Form states PM (Bagian A)
  const [editingPM, setEditingPM] = useState<PackagingMaterial | null>(null);
  const [pmCode, setPmCode] = useState('');
  const [pmName, setPmName] = useState('');
  const [pmType, setPmType] = useState<'primary' | 'secondary' | 'tertiary'>('primary');
  const [pmUnit, setPmUnit] = useState<string>('Pcs');
  const [pmCapacity, setPmCapacity] = useState<number>(20);
  const [pmSupplier, setPmSupplier] = useState('');
  const [pmStorage, setPmStorage] = useState(DEFAULT_STORAGE_CONDITIONS);
  const [pmReorderPoint, setPmReorderPoint] = useState<number>(100);

  // Bagian B (QC Parameter)
  const [pmQcParams, setPmQcParams] = useState<QCParameter[]>(DEFAULT_QC_PARAMS);

  // E-Signature Authorization Password Modal
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Delete with Active User Password states
  const [pmToDelete, setPmToDelete] = useState<PackagingMaterial | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const [isVerifyingDeletePassword, setIsVerifyingDeletePassword] = useState(false);

  // Import states
  const [importMode, setImportMode] = useState<'paste' | 'drop'>('paste');
  const [pasteData, setPasteData] = useState('');
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importSkippedRows, setImportSkippedRows] = useState<{ rowNum: number; reason: string; rawData: string }[]>([]);
  const [importTotalRawRows, setImportTotalRawRows] = useState<number>(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Filtered PM
  const filteredPM = packagingMaterials.filter((pm) => {
    const matchesSearch =
      pm.name.toLowerCase().includes(searchPM.toLowerCase()) ||
      pm.code.toLowerCase().includes(searchPM.toLowerCase()) ||
      (pm.supplier && pm.supplier.toLowerCase().includes(searchPM.toLowerCase())) ||
      (pm.unit && pm.unit.toLowerCase().includes(searchPM.toLowerCase()));

    const matchesType = selectedTypeFilter === 'all' || pm.type === selectedTypeFilter;

    return matchesSearch && matchesType;
  });

  // Pagination slice
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredPM.slice(indexOfFirstItem, indexOfLastItem);

  // Open Add Modal
  const openAddPMModal = () => {
    setEditingPM(null);
    const nextCode = `K${String(packagingMaterials.length + 1).padStart(4, '0')}`;
    setPmCode(nextCode);
    setPmName('');
    setPmType('primary');
    setPmUnit('Pcs');
    setPmCapacity(20);
    setPmSupplier('');
    setPmStorage(DEFAULT_STORAGE_CONDITIONS);
    setPmReorderPoint(100);
    setValidationErrors([]);
    setPmQcParams(DEFAULT_QC_PARAMS.map(p => ({ ...p })));

    setShowFormModal(true);
  };

  // Open Edit Modal
  const handleEditPMClick = (pm: PackagingMaterial) => {
    setEditingPM(pm);
    setPmCode(pm.code);
    setPmName(pm.name);
    setPmType(pm.type);
    setPmUnit(pm.unit || 'Pcs');
    setPmCapacity(pm.unitCapacityGrams || 0);
    setPmSupplier(pm.supplier || pm.manufacturer || '');
    setPmStorage(pm.storageConditions || DEFAULT_STORAGE_CONDITIONS);
    setPmReorderPoint(pm.reorderPoint ?? 100);
    setValidationErrors([]);

    setPmQcParams(
      pm.qcParameters && pm.qcParameters.length > 0
        ? [...pm.qcParameters]
        : DEFAULT_QC_PARAMS.map(p => ({ ...p }))
    );

    setShowFormModal(true);
  };

  const handleAddQcParam = () => {
    setPmQcParams([...pmQcParams, { name: '', specification: '' }]);
  };

  const handleRemoveQcParam = (index: number) => {
    setPmQcParams(pmQcParams.filter((_, i) => i !== index));
  };

  const handleQcParamChange = (index: number, field: keyof QCParameter, value: string) => {
    const updated = [...pmQcParams];
    updated[index] = { ...updated[index], [field]: value };
    setPmQcParams(updated);
  };

  // Validation before Live-View
  const handleValidateAndOpenLiveView = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];

    if (!pmCode.trim()) errors.push('Kode PM wajib diisi (contoh: K0001).');
    if (!pmName.trim()) errors.push('Nama Dagang Kemasan wajib diisi.');
    if (!pmUnit.trim()) errors.push('Satuan wajib dipilih (Pcs / Roll).');
    if (!pmSupplier.trim()) errors.push('Supplier wajib diisi.');
    if (!pmStorage.trim()) errors.push('Kondisi Penyimpanan Kemasan wajib diisi.');

    const cleanQcParams = pmQcParams.filter((p) => p.name.trim() !== '');
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

  // Final Save with password verification
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

      const cleanQcParams = pmQcParams.filter((p) => p.name.trim() !== '');

      const newOrUpdatedPM: PackagingMaterial = {
        id: editingPM ? ensureUUID(editingPM.id) : generateUUID(),
        code: pmCode.trim().toUpperCase(),
        specNumber: `SP-BK-${pmCode.trim().toUpperCase()}`,
        name: pmName.trim(),
        type: pmType,
        unit: pmUnit,
        unitCapacityGrams: pmType === 'primary' ? Number(pmCapacity) || 0 : undefined,
        supplier: pmSupplier.trim(),
        manufacturer: pmSupplier.trim(),
        storageConditions: pmStorage.trim(),
        qcParameters: cleanQcParams,
        reorderPoint: Number(pmReorderPoint) || 100,
        lastModifiedBy: `${user?.name || 'ADMIN'} (${actorNik})`,
        lastModifiedAt: new Date().toISOString(),
      };

      onSavePM(newOrUpdatedPM);

      // Audit log
      auditLogger.logAction({
        actorNik: actorNik,
        actorName: user?.name || 'ADMIN',
        module: 'rnd',
        action: editingPM ? 'PM_MASTER_UPDATE' : 'PM_MASTER_CREATE',
        targetNik: newOrUpdatedPM.code,
        details: `${editingPM ? 'Pembaruan' : 'Pendaftaran'} Master Bahan Kemas ${newOrUpdatedPM.code} (${newOrUpdatedPM.name}), tipe ${newOrUpdatedPM.type}, satuan ${newOrUpdatedPM.unit}, supplier ${newOrUpdatedPM.supplier}.`,
      });

      setIsVerifyingPassword(false);
      setShowLiveViewModal(false);
      setShowFormModal(false);
      setEditingPM(null);
      setSuccessToast(`Bahan Kemas "${newOrUpdatedPM.code} - ${newOrUpdatedPM.name}" berhasil disimpan dengan verifikasi otorisasi.`);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setConfirmPasswordError(err.message || 'Terjadi kesalahan saat memverifikasi sandi.');
      setIsVerifyingPassword(false);
    }
  };

  // Execute Delete after Active User Password Confirmation
  const handleConfirmDeletePM = async () => {
    if (!pmToDelete) return;
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
      onDeletePM(pmToDelete.id);

      // Record Audit Trail Log
      auditLogger.logAction({
        actorNik: actorNik,
        actorName: user?.name || user?.username || 'ADMIN',
        module: 'rnd',
        action: 'PM_MASTER_DELETE',
        targetNik: pmToDelete.code,
        details: `Penghapusan Master Bahan Kemas ${pmToDelete.code} (${pmToDelete.name}) dengan otorisasi kata sandi pengguna aktif.`,
      });

      setIsVerifyingDeletePassword(false);
      setSuccessToast(`Bahan kemas "${pmToDelete.code} - ${pmToDelete.name}" berhasil dihapus.`);
      setPmToDelete(null);
      setDeletePassword('');
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setDeletePasswordError(err.message || 'Terjadi kesalahan saat memverifikasi sandi.');
      setIsVerifyingDeletePassword(false);
    }
  };

  // --- EXCEL TEMPLATE GENERATOR ---
  const handleDownloadTemplate = () => {
    const templateData = [
      [
        'Kode PM',
        'Nama Dagang Kemasan',
        'Tipe (primary/secondary/tertiary)',
        'Satuan (Pcs/Roll)',
        'Kapasitas (g/mL)',
        'Supplier',
        'Kondisi Penyimpanan',
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
        'K0010',
        'Luxury Acrylic Gold Jar 50g',
        'primary',
        'Pcs',
        '50',
        'PT. Prima Kemas Lestari',
        DEFAULT_STORAGE_CONDITIONS,
        'Bentuk',
        'Sesuai standar master spesifikasi',
        'Warna',
        'Gold Glossy Pantone 871C',
        'Kebocoran',
        '0.5 bar 5 menit, no leak',
        'Kebersihan',
        'Bebas debu & partikel'
      ],
      [
        'K0011',
        'Stiker Etiket Roll Body Lotion 100ml',
        'secondary',
        'Roll',
        '0',
        'PT. Cetak Label Indah',
        DEFAULT_STORAGE_CONDITIONS,
        'Penulisan nama Merek dan Produk',
        'Jelas, terbaca, tidak luntur',
        'Terdapat 2D Barcode',
        '2D QR code scannable',
        'Terdapat NIE',
        'NA18240100123 valid',
        'Kerekatan',
        'Tape test 3M terikat kuat'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Master_Kemasan');
    XLSX.writeFile(wb, 'Template_Import_Master_Bahan_Kemas.xlsx');
  };

  // --- PARSE EXCEL DATA ---
  const parseRowsToPreview = (rows: any[][]) => {
    if (!rows || rows.length === 0) {
      setImportError('File atau teks tidak memiliki data.');
      setImportPreview([]);
      setImportSkippedRows([]);
      setImportTotalRawRows(0);
      return;
    }

    setImportTotalRawRows(rows.length);

    // Auto-detect header row
    let startIndex = 0;
    const firstRowStr = (rows[0] || []).map((c: any) => String(c ?? '').toLowerCase().trim()).join(' ');
    const headerKeywords = ['kode', 'nama', 'tipe', 'type', 'satuan', 'unit', 'supplier', 'packaging', 'kemasan'];
    const isFirstRowHeader = headerKeywords.some((kw) => firstRowStr.includes(kw));

    if (isFirstRowHeader) {
      startIndex = 1;
    }

    const parsed: any[] = [];
    const skipped: { rowNum: number; reason: string; rawData: string }[] = [];
    const seenCodes = new Set<string>();

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      const actualRowNum = i + 1; // 1-indexed for user readability

      // Cek jika baris benar-benar kosong
      if (!row || row.length === 0 || row.every((c: any) => String(c ?? '').trim() === '')) {
        skipped.push({
          rowNum: actualRowNum,
          reason: 'Baris kosong / tidak ada data',
          rawData: (row || []).join(' | '),
        });
        continue;
      }

      let rawCode = String(row[0] ?? '').trim().toUpperCase();
      let rawName = String(row[1] ?? '').trim();

      // Jika kode kosong tetapi ada nama kemasan di kolom 1, generate kode otomatis
      if (!rawCode && rawName) {
        rawCode = `K${String(packagingMaterials.length + parsed.length + 1).padStart(4, '0')}`;
      } else if (rawCode && !rawName) {
        // Jika nama di kolom 1 kosong tetapi ada deskripsi di kolom lain
        const otherCols = row.slice(2).filter((c: any) => String(c ?? '').trim() !== '');
        if (otherCols.length > 0) {
          rawName = String(otherCols[0]).trim();
        }
      }

      // Validasi minimal ada nama atau kode
      if (!rawName) {
        skipped.push({
          rowNum: actualRowNum,
          reason: 'Nama Kemasan kosong (kolom ke-2)',
          rawData: row.map((c: any) => String(c ?? '').trim()).join(' | '),
        });
        continue;
      }

      // Pastikan kode unik dalam daftar import ini
      if (seenCodes.has(rawCode)) {
        // Buat suffix pembeda jika ada duplikat kode di dalam satu file
        const uniqueSuffix = `-${parsed.length + 1}`;
        rawCode = `${rawCode}${uniqueSuffix}`;
      }
      seenCodes.add(rawCode);

      let rawType = String(row[2] ?? 'primary').trim().toLowerCase();
      if (!['primary', 'secondary', 'tertiary'].includes(rawType)) {
        if (rawType.includes('primer') || rawType.includes('prim')) rawType = 'primary';
        else if (rawType.includes('sekunder') || rawType.includes('sec')) rawType = 'secondary';
        else if (rawType.includes('tersier') || rawType.includes('ter')) rawType = 'tertiary';
        else rawType = 'primary';
      }

      let rawUnit = String(row[3] ?? 'Pcs').trim();
      if (!PACKAGING_UNITS.includes(rawUnit)) {
        if (rawUnit.toLowerCase() === 'roll' || rawUnit.toLowerCase() === 'rol') rawUnit = 'Roll';
        else if (rawUnit.toLowerCase() === 'box') rawUnit = 'Box';
        else if (rawUnit.toLowerCase() === 'set') rawUnit = 'Set';
        else rawUnit = 'Pcs';
      }

      const rawCapacity = Number(row[4]) || 0;
      const rawSupplier = String(row[5] ?? 'Supplier Terdaftar').trim() || 'Supplier Terdaftar';
      const rawStorage = String(row[6] ?? DEFAULT_STORAGE_CONDITIONS).trim() || DEFAULT_STORAGE_CONDITIONS;

      // Extract QC Parameters from columns 7 onwards
      const qcParams: QCParameter[] = [];
      for (let col = 7; col < row.length; col += 2) {
        const paramName = row[col] ? String(row[col]).trim() : '';
        const paramSpec = row[col + 1] ? String(row[col + 1]).trim() : '';
        if (paramName && paramSpec) {
          qcParams.push({ name: paramName, specification: paramSpec });
        }
      }

      if (qcParams.length === 0) {
        qcParams.push(...DEFAULT_QC_PARAMS.map(p => ({ ...p })));
      }

      parsed.push({
        code: rawCode,
        name: rawName,
        type: rawType as 'primary' | 'secondary' | 'tertiary',
        unit: rawUnit,
        unitCapacityGrams: rawType === 'primary' ? rawCapacity : undefined,
        supplier: rawSupplier,
        storageConditions: rawStorage,
        qcParameters: qcParams,
      });
    }

    setImportSkippedRows(skipped);

    if (parsed.length === 0) {
      setImportError('Tidak ada baris data valid yang berhasil dibaca dari file.');
      setImportPreview([]);
    } else {
      setImportError(null);
      setImportPreview(parsed);
    }
  };

  // --- HANDLE PASTE TEXT PARSING ---
  const handleParsePasteData = () => {
    if (!pasteData.trim()) {
      setImportError('Silakan tempel (paste) data dari Excel terlebih dahulu.');
      return;
    }

    const lines = pasteData.trim().split(/\r?\n/);
    const rows = lines.map((line) => line.split('\t'));
    parseRowsToPreview(rows);
  };

  // --- HANDLE FILE DROP & UPLOAD ---
  const handleFileUpload = (file: File) => {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('File Excel tidak memiliki lembar kerja (worksheet).');
        }
        const worksheet = workbook.Sheets[firstSheetName];
        // Menggunakan defval: '' dan blankrows: false agar semua kolom terbaca konsisten
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false }) as any[][];
        parseRowsToPreview(jsonRows);
      } catch (err: any) {
        setImportError('Gagal membaca file Excel: ' + (err.message || 'Format tidak didukung.'));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // --- EXECUTE IMPORT ---
  const handleExecuteImport = async () => {
    if (importPreview.length === 0 || isSubmittingImport) return;

    setIsSubmittingImport(true);
    const actorNik = user?.nik || 'admin';
    const timestamp = new Date().toISOString();

    const newPMs: PackagingMaterial[] = importPreview.map((item) => ({
      id: generateUUID(),
      code: item.code,
      specNumber: `SP-BK-${item.code}`,
      name: item.name,
      type: item.type,
      unit: item.unit,
      unitCapacityGrams: item.unitCapacityGrams,
      supplier: item.supplier,
      storageConditions: item.storageConditions,
      qcParameters: item.qcParameters,
      lastModifiedBy: `${user?.name || 'ADMIN'} (${actorNik}) [EXCEL_IMPORT]`,
      lastModifiedAt: timestamp,
    }));

    const importCount = newPMs.length;

    try {
      if (onBatchSavePM) {
        await onBatchSavePM(newPMs);
      } else {
        for (const pm of newPMs) {
          onSavePM(pm);
        }
      }

      // Record Audit Trail Log
      auditLogger.logAction({
        actorNik: actorNik,
        actorName: user?.name || 'ADMIN',
        module: 'rnd',
        action: 'PM_EXCEL_IMPORT',
        targetNik: `${importCount}_ITEMS`,
        details: `Import massal ${importCount} data Master Bahan Kemas via ${importMode === 'paste' ? 'Copy-Paste Excel' : 'Drop File Excel'}.`,
      });

      setShowImportModal(false);
      setImportPreview([]);
      setImportSkippedRows([]);
      setImportTotalRawRows(0);
      setPasteData('');
      setSuccessToast(`Berhasil mengimpor ${importCount} Master Bahan Kemas ke sistem.`);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Import error:', err);
      setImportError(`Terjadi kesalahan saat import: ${err.message || String(err)}`);
    } finally {
      setIsSubmittingImport(false);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      {/* Toast Notifikasi Sukses */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 border border-emerald-500 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
        </div>
      )}

      {/* READ-ONLY BANNER IF USER IS RESTRICTED */}
      {!canWrite && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-3 text-amber-800">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <div className="text-[11px] leading-snug">
              <span className="font-bold">Mode Akses Terbatas (Read-Only):</span> Anda memiliki hak akses baca khusus R&D. Tindakan pendaftaran, edit, import excel, dan hapus master kemas dinonaktifkan.
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-200/80 text-amber-900 uppercase">
            Hanya Lihat
          </span>
        </div>
      )}

      {/* Control Bar: Search & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kode PM (K0001), nama kemasan, supplier..."
              value={searchPM}
              onChange={(e) => {
                setSearchPM(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600 shadow-2xs"
            />
          </div>

          {/* Type Filter */}
          <select
            value={selectedTypeFilter}
            onChange={(e) => {
              setSelectedTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-purple-600 shadow-2xs"
          >
            <option value="all">Semua Tipe Kemasan</option>
            <option value="primary">Primer (Wadah Langsung)</option>
            <option value="secondary">Sekunder (Dus/Box)</option>
            <option value="tertiary">Tersier (Karton)</option>
          </select>

          {/* Counter Badge */}
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-mono font-bold whitespace-nowrap">
            <span>Total: {packagingMaterials.length} Item</span>
            {filteredPM.length !== packagingMaterials.length && (
              <span className="text-[10px] text-purple-600">({filteredPM.length})</span>
            )}
          </div>
        </div>

        {/* Action Buttons: Add & Excel Import (Hanya untuk Write Access) */}
        {canWrite && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setImportPreview([]);
                setImportError(null);
                setPasteData('');
                setShowImportModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Import Excel</span>
            </button>

            <button
              onClick={openAddPMModal}
              className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Bahan Kemas</span>
            </button>
          </div>
        )}
      </div>

      {/* STREAMLINED TABLE: MASTER BAHAN KEMAS */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2 px-2.5 text-center w-10">No</th>
                <th className="py-2 px-3">Kode PM</th>
                <th className="py-2 px-3">Nama Kemasan</th>
                <th className="py-2 px-3">Tipe Kemasan</th>
                <th className="py-2 px-3">Kapasitas</th>
                <th className="py-2 px-3">Satuan</th>
                <th className="py-2 px-3">Supplier</th>
                <th className="py-2 px-3">Kondisi Penyimpanan</th>
                <th className="py-2 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    <Boxes className="w-8 h-8 mx-auto mb-1.5 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-xs">Tidak ada data bahan kemas yang cocok</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Coba gunakan kata kunci pencarian lain atau klik Tambah Bahan Kemas.</p>
                  </td>
                </tr>
              ) : (
                currentItems.map((pm, idx) => (
                  <tr key={pm.id} className="hover:bg-purple-50/40 transition-colors">
                    <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold text-[11px]">
                      {indexOfFirstItem + idx + 1}
                    </td>
                    <td className="py-1.5 px-3 font-mono">
                      <div className="font-bold text-purple-700 text-xs">{pm.code}</div>
                      <div className="text-[10px] font-mono text-slate-500 font-semibold">{pm.specNumber || `SP-BK-${pm.code}`}</div>
                    </td>
                    <td className="py-1.5 px-3">
                      <div className="font-bold text-slate-800 text-xs">{pm.name}</div>
                    </td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`px-2 py-0.25 rounded-full text-[9px] font-bold border uppercase ${
                          pm.type === 'primary'
                            ? 'bg-purple-50 border-purple-200 text-purple-700'
                            : pm.type === 'secondary'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}
                      >
                        {pm.type === 'primary'
                          ? 'Primer'
                          : pm.type === 'secondary'
                          ? 'Sekunder'
                          : 'Tersier'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 font-mono text-[11px] font-semibold text-slate-700">
                      {pm.type === 'primary' && pm.unitCapacityGrams ? `${pm.unitCapacityGrams} g/mL` : '-'}
                    </td>
                    <td className="py-1.5 px-3 font-bold text-purple-900">
                      <span className="bg-purple-50 border border-purple-200 px-1.5 py-0.25 rounded text-[10px]">
                        {pm.unit || 'Pcs'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 font-medium text-slate-800 text-xs">
                      {pm.supplier || pm.manufacturer || <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="py-1.5 px-3 text-slate-600 text-[11px]">
                      {pm.storageConditions || DEFAULT_STORAGE_CONDITIONS}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Tombol Lihat Detail */}
                        <button
                          onClick={() => setSelectedPMForDetails(pm)}
                          className="p-1 rounded bg-slate-50 border border-slate-200 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 text-slate-600 transition-colors cursor-pointer"
                          title="Lihat Detail & QC"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Tombol Edit & Hapus */}
                        {canWrite && (
                          <>
                            <button
                              onClick={() => handleEditPMClick(pm)}
                              className="p-1 rounded bg-slate-50 border border-slate-200 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 text-slate-600 transition-colors cursor-pointer"
                              title="Edit Kemasan"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setPmToDelete(pm);
                                setDeletePassword('');
                                setDeletePasswordError(null);
                              }}
                              className="p-1 rounded bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-600 transition-colors cursor-pointer"
                              title="Hapus Kemasan (Konfirmasi Kata Sandi)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-3 pb-1.5">
          <Pagination
            currentPage={currentPage}
            totalItems={filteredPM.length}
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
      {/* MODAL 1: FORMULIR INPUT / EDIT KEMASAN  */}
      {/* ======================================= */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowFormModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowFormModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Modal */}
            <div className="border-b border-slate-100 pb-4 mb-5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    {editingPM ? 'Edit Master Bahan Kemas' : 'Pendaftaran Master Bahan Kemas Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Lengkapi Identitas Kemasan (Bagian A) dan Kriteria Mutu Parameter QC (Bagian B).
                  </p>
                </div>
              </div>
            </div>

            {/* Validation Errors Alert */}
            {validationErrors.length > 0 && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs shrink-0">
                <div className="font-bold flex items-center gap-1.5 mb-1 text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Harap lengkapi isian wajib sebelum melanjutkan:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Scrollable Form Body */}
            <form onSubmit={handleValidateAndOpenLiveView} className="flex-1 overflow-y-auto pr-1 space-y-6">
              {/* BAGIAN A: IDENTITAS & DATA UTAMA BAHAN KEMAS */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-black text-purple-800 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-700"></span>
                    Bagian A: Identitas & Data Utama Bahan Kemas
                  </h4>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Wajib Diisi Lengkap
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Kode Kemasan (PM Code) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={pmCode}
                      onChange={(e) => setPmCode(e.target.value)}
                      placeholder="Contoh: K0001"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-mono font-bold"
                    />
                    <div className="mt-1.5 text-[10px] font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-block">
                      No. Spesifikasi: SP-BK-{pmCode.trim().toUpperCase() || 'K0001'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Tipe Kemasan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={pmType}
                      onChange={(e) => setPmType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-semibold"
                    >
                      <option value="primary">Primer (Wadah Langsung)</option>
                      <option value="secondary">Sekunder (Dus / Inner Box)</option>
                      <option value="tertiary">Tersier (Master Karton)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Satuan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={pmUnit}
                      onChange={(e) => setPmUnit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-bold"
                    >
                      {PACKAGING_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Nama Dagang Kemasan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Soft Squeeze Tube Gold Cap 100ml"
                      value={pmName}
                      onChange={(e) => setPmName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-medium"
                    />
                  </div>

                  {pmType === 'primary' ? (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Kapasitas (g/mL)
                      </label>
                      <input
                        type="number"
                        value={pmCapacity}
                        onChange={(e) => setPmCapacity(Number(e.target.value))}
                        placeholder="e.g. 100"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-mono font-bold"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Kapasitas
                      </label>
                      <input
                        type="text"
                        disabled
                        value="N/A (Bukan Kemasan Primer)"
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-400 italic"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Supplier <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: PT. Kemas Unggul Abadi"
                      value={pmSupplier}
                      onChange={(e) => setPmSupplier(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600"
                    />
                  </div>

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
                        value={pmReorderPoint}
                        onChange={(e) => setPmReorderPoint(Number(e.target.value))}
                        className="w-full bg-purple-50/50 border border-purple-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600 font-bold font-mono"
                        placeholder="100"
                      />
                      <span className="absolute right-3 top-2 text-[10px] font-bold text-purple-600 uppercase">{pmUnit}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Kondisi Penyimpanan Kemasan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Suhu ruang (< 30°C), Kering & Bersih"
                      value={pmStorage}
                      onChange={(e) => setPmStorage(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600"
                    />
                  </div>
                </div>
              </div>

              {/* BAGIAN B: KRITERIA MUTU & PARAMETER ANALISA QC */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-purple-800 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-700"></span>
                      Bagian B: Kriteria Mutu & Parameter Analisa QC
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      19 Parameter Standar BPOM & Mutu Kemasan Kosmetik (Dapat Disesuaikan / Ditambah).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPmQcParams(DEFAULT_QC_PARAMS.map(p => ({ ...p })))}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
                    >
                      Reset 19 Parameter
                    </button>
                    <button
                      type="button"
                      onClick={handleAddQcParam}
                      className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl border border-purple-200 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Baris</span>
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[9px] tracking-wider">
                        <th className="py-2.5 px-3 w-5/12">Parameter Analisa / Pengujian</th>
                        <th className="py-2.5 px-3 w-6/12">Syarat / Batas Penerimaan Mutu</th>
                        <th className="py-2.5 px-3 text-right w-1/12">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {pmQcParams.map((param, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 pl-3">
                            <input
                              type="text"
                              required
                              value={param.name}
                              onChange={(e) => handleQcParamChange(idx, 'name', e.target.value)}
                              placeholder="Ketik nama parameter QC (e.g. Bentuk, Kebocoran)..."
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-bold text-purple-950 focus:outline-none focus:bg-white focus:border-purple-600"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              value={param.specification}
                              onChange={(e) => handleQcParamChange(idx, 'specification', e.target.value)}
                              placeholder="Syarat / spesifikasi lolos QC"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-purple-600"
                            />
                          </td>
                          <td className="p-2 pr-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveQcParam(idx)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Hapus Parameter"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  <Eye className="w-4 h-4 text-amber-300" />
                  <span>Pratinjau & Otorisasi E-Signature</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* MODAL 2: LIVE-VIEW & OTORISASI E-SIGN   */}
      {/* ======================================= */}
      {showLiveViewModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowLiveViewModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowLiveViewModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-slate-100 pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    Verifikasi Data & E-Signature Otorisasi Master Kemas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Periksa kembali ringkasan master bahan kemas sebelum mengotorisasi penyimpanan ke sistem.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {/* Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-purple-700 bg-purple-100/60 px-2 py-0.5 rounded">
                        Kode: {pmCode}
                      </span>
                      <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                        No. Spesifikasi: SP-BK-{pmCode.trim().toUpperCase()}
                      </span>
                    </div>
                    <span className="font-black text-sm text-slate-800">{pmName}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                    {pmType}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-slate-600">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Satuan</span>
                    <span className="font-bold text-purple-900">{pmUnit}</span>
                  </div>
                  {pmType === 'primary' && (
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Kapasitas</span>
                      <span className="font-bold text-slate-800 font-mono">{pmCapacity} g/mL</span>
                    </div>
                  )}
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Supplier</span>
                    <span className="font-bold text-slate-800">{pmSupplier}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Kondisi Penyimpanan</span>
                    <span className="font-bold text-slate-800">{pmStorage}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/80">
                  <span className="block text-[10px] font-extrabold text-purple-900 uppercase tracking-wider mb-2">
                    Bagian B: Spesifikasi Mutu Analisa QC Bahan Kemas ({pmQcParams.filter((p) => p.name.trim()).length} Kriteria)
                  </span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto bg-white shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200">
                        <tr className="text-slate-600 font-bold uppercase text-[9px] tracking-wider">
                          <th className="py-2 px-3 w-10 text-center">No</th>
                          <th className="py-2 px-3 w-5/12">Parameter Analisa / Pengujian</th>
                          <th className="py-2 px-3 w-6/12">Syarat / Batas Penerimaan Mutu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {pmQcParams
                          .filter((p) => p.name.trim())
                          .map((p, idx) => (
                            <tr key={idx} className="hover:bg-purple-50/30">
                              <td className="py-2 px-3 text-center font-mono text-[10px] text-slate-400 font-bold">{idx + 1}</td>
                              <td className="py-2 px-3 font-bold text-slate-800 text-[11px]">{p.name}</td>
                              <td className="py-2 px-3 text-slate-700 text-[11px]">{p.specification}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Password Authorization Input */}
              <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-700 shrink-0" />
                  <div>
                    <label className="text-xs font-bold text-purple-900 block">
                      Konfirmasi Kata Sandi Akun Pengguna ({user?.name || 'ADMIN'})
                    </label>
                    <p className="text-[10px] text-slate-500">
                      Masukkan kata sandi akun Anda untuk mengonfirmasi dan menandatangani otorisasi perubahan data ini.
                    </p>
                  </div>
                </div>

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Masukkan kata sandi login Anda..."
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                />

                {confirmPasswordError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{confirmPasswordError}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowLiveViewModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all cursor-pointer"
              >
                Kembali Edit
              </button>
              <button
                type="button"
                disabled={isVerifyingPassword}
                onClick={handleFinalSaveWithPassword}
                className="px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:bg-slate-300"
              >
                <Check className="w-4 h-4 text-amber-300" />
                <span>{isVerifyingPassword ? 'Memverifikasi...' : 'Otorisasi & Simpan ke Sistem'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: IMPORT DARI EXCEL (DUAL MODE: COPY-PASTE & DROP) */}
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
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    Import Master Bahan Kemas dari Excel
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pilih metode paste data langsung dari Excel atau seret (drop) file Excel sesuai format template resmi.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Format Template Excel (.xlsx)</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {/* Tab Selector: Drop File vs Paste Text */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-fit">
                <button
                  type="button"
                  onClick={() => setImportMode('paste')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    importMode === 'paste'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tempel (Paste) dari Excel
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('drop')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    importMode === 'drop'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Drop / Unggah File Excel (.xlsx)
                </button>
              </div>

              {/* Mode 1: Drop File Zone */}
              {importMode === 'drop' && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropFile}
                  onClick={() => excelFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                    isDragOver
                      ? 'border-purple-600 bg-purple-50/60 scale-[0.99]'
                      : 'border-slate-300 bg-slate-50/60 hover:bg-purple-50/30 hover:border-purple-300'
                  }`}
                >
                  <input
                    type="file"
                    ref={excelFileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 shadow-inner">
                    <CloudUpload className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800">
                      Tarik & Letakkan (Drag & Drop) File Excel di Sini
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      atau <span className="text-purple-700 font-bold underline">klik untuk memilih file</span> dari komputer Anda (.xlsx, .xls)
                    </p>
                  </div>
                </div>
              )}

              {/* Mode 2: Paste Text Area */}
              {importMode === 'paste' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">
                      Tempel (Paste) Salinan Baris dari Excel:
                    </label>
                    <button
                      type="button"
                      onClick={handleParsePasteData}
                      className="px-3 py-1 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Proses & Pratinjau Teks
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={pasteData}
                    onChange={(e) => setPasteData(e.target.value)}
                    placeholder="Salin baris dari Excel (termasuk header) lalu tempel (Ctrl+V) di sini..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600"
                  ></textarea>
                </div>
              )}

              {importError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Preview Table & Parsing Diagnostic Summary */}
              {importTotalRawRows > 0 && (
                <div className="space-y-3 pt-1">
                  {/* Parsing Status Summary Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-medium">Total Baris File:</span>
                      <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {importTotalRawRows} Baris
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        {importPreview.length} Berhasil Terbaca
                      </span>
                      {importSkippedRows.length > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          {importSkippedRows.length} Dilewati / Kosong
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Skipped Rows Accordion / Alert if any */}
                  {importSkippedRows.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Rincian {importSkippedRows.length} Baris yang Tidak Terbaca / Dilewati:</span>
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                        {importSkippedRows.map((skip, idx) => (
                          <div key={idx} className="bg-white/80 border border-amber-200 rounded p-1.5 flex items-center justify-between gap-2">
                            <span>
                              <strong className="text-amber-800">Baris ke-{skip.rowNum}:</strong> {skip.reason}
                            </span>
                            {skip.rawData && (
                              <span className="text-slate-500 truncate max-w-[200px]" title={skip.rawData}>
                                [{skip.rawData}]
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Valid Data Preview */}
                  {importPreview.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>Pratinjau Data Bahan Kemas ({importPreview.length} Item):</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          Menampilkan 50 item pertama
                        </span>
                      </h4>
                      <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-52 overflow-y-auto shadow-2xs">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                            <tr className="text-slate-600 font-bold uppercase">
                              <th className="p-2.5 pl-3 w-10 text-center">No</th>
                              <th className="p-2.5">Kode PM</th>
                              <th className="p-2.5">Nama Kemasan</th>
                              <th className="p-2.5">Tipe</th>
                              <th className="p-2.5">Satuan</th>
                              <th className="p-2.5">Kapasitas</th>
                              <th className="p-2.5">Supplier</th>
                              <th className="p-2.5 pr-3">Parameter QC</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-600 bg-white font-medium">
                            {importPreview.slice(0, 50).map((pm, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="p-2.5 pl-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                <td className="p-2.5 font-mono font-bold text-purple-700">{pm.code}</td>
                                <td className="p-2.5 font-bold text-slate-800">{pm.name}</td>
                                <td className="p-2.5 uppercase text-[9px] font-bold text-purple-600">{pm.type}</td>
                                <td className="p-2.5 font-bold text-purple-900">{pm.unit}</td>
                                <td className="p-2.5 font-mono">{pm.unitCapacityGrams ? `${pm.unitCapacityGrams}g` : '-'}</td>
                                <td className="p-2.5">{pm.supplier}</td>
                                <td className="p-2.5 pr-3">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {pm.qcParameters.map((p: any, pIdx: number) => (
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
                      {importPreview.length > 50 && (
                        <p className="text-right text-[10px] text-slate-500 mt-1 italic">
                          Dan {importPreview.length - 50} item lainnya akan diimpor sepenuhnya.
                        </p>
                      )}
                    </div>
                  )}
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
      {/* MODAL 4: DETAIL LENGKAP BAHAN KEMAS    */}
      {/* ======================================= */}
      {selectedPMForDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedPMForDetails(null)}
          ></div>

          <div className="relative bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedPMForDetails(null)}
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
                      Kode: {selectedPMForDetails.code}
                    </span>
                    <span className="font-mono font-bold text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.25 rounded">
                      No. Spesifikasi: {selectedPMForDetails.specNumber || `SP-BK-${selectedPMForDetails.code}`}
                    </span>
                    <span className="px-1.5 py-0.25 rounded-full text-[9px] font-bold border uppercase bg-purple-100 text-purple-800 border-purple-200">
                      {selectedPMForDetails.type === 'primary' ? 'Primer' : selectedPMForDetails.type === 'secondary' ? 'Sekunder' : 'Tersier'}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-slate-800 mt-0.5">
                    {selectedPMForDetails.name}
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
                  Bagian A: Identitas & Data Utama Bahan Kemas
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-slate-50 border border-slate-200/60 p-3 rounded-xl text-xs">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">Satuan</span>
                    <span className="font-bold text-purple-900 mt-0.5 block text-xs">
                      {selectedPMForDetails.unit || 'Pcs'}
                    </span>
                  </div>

                  {selectedPMForDetails.type === 'primary' && (
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Kapasitas Bersih</span>
                      <span className="font-bold text-slate-800 mt-0.5 block font-mono text-xs">
                        {selectedPMForDetails.unitCapacityGrams || 0} g/mL
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">Supplier</span>
                    <span className="font-bold text-slate-800 mt-0.5 block text-xs">
                      {selectedPMForDetails.supplier || selectedPMForDetails.manufacturer || '-'}
                    </span>
                  </div>

                  <div className="md:col-span-2">
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">Kondisi Penyimpanan</span>
                    <span className="font-medium text-slate-700 mt-0.5 block text-xs">
                      {selectedPMForDetails.storageConditions || DEFAULT_STORAGE_CONDITIONS}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bagian B */}
              <div>
                <h4 className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-700"></span>
                  Bagian B: Spesifikasi Mutu QC Kemasan ({selectedPMForDetails.qcParameters?.length || 0} Kriteria)
                </h4>

                {selectedPMForDetails.qcParameters && selectedPMForDetails.qcParameters.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[9px] tracking-wider">
                          <th className="py-1.5 px-3 w-10 text-center">No</th>
                          <th className="py-1.5 px-3 w-5/12">Parameter Analisa / Pengujian</th>
                          <th className="py-1.5 px-3 w-6/12">Syarat / Batas Penerimaan Mutu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 bg-white font-medium">
                        {selectedPMForDetails.qcParameters.map((param, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40">
                            <td className="py-1.5 px-3 text-center font-mono text-[10px] text-slate-400 font-bold">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-bold text-slate-800">{param.name}</td>
                            <td className="py-1.5 px-3 text-slate-700">{param.specification}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-400">
                    Bahan kemas ini tidak memiliki kriteria QC.
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedPMForDetails(null)}
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
      {pmToDelete && (
        <div className="fixed inset-0 z-60 overflow-y-auto flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => !isVerifyingDeletePassword && setPmToDelete(null)}
          ></div>

          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Close */}
            <button
              type="button"
              disabled={isVerifyingDeletePassword}
              onClick={() => setPmToDelete(null)}
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
                  Konfirmasi Hapus Bahan Kemas
                </h3>
                <p className="text-[11px] text-slate-500">
                  Otorisasi Keamanan CPKB & Jejak Audit
                </p>
              </div>
            </div>

            {/* Detail Item Info */}
            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl mb-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Kode Kemasan:</span>
                <span className="font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-xs">
                  {pmToDelete.code}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Nama Kemasan:</span>
                <span className="font-bold text-slate-800 text-right max-w-[200px] truncate">
                  {pmToDelete.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Tipe:</span>
                <span className="capitalize text-slate-700">{pmToDelete.type}</span>
              </div>
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
                      handleConfirmDeletePM();
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
                onClick={() => setPmToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isVerifyingDeletePassword || !deletePassword.trim()}
                onClick={handleConfirmDeletePM}
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
    </div>
  );
};
