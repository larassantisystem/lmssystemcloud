import React, { useState, useEffect, useRef } from 'react';
import {
  PackagePlus,
  X,
  Check,
  CheckCircle2,
  Building2,
  Lock,
  Calendar,
  Info,
  Layers,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  Upload,
  Camera,
  FileText,
  FileCheck,
  Cloud,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { RawMaterial, PackagingMaterial } from '../../../types';
import { GrnMaterialType, GrnRecord } from '../types/grnTypes';
import { MaterialSearchDropdown } from './MaterialSearchDropdown';
import { useAuth } from '../../../core/auth/AuthContext';
import { authService } from '../../../core/auth/authService';
import {
  googleDriveSignIn,
  googleDriveSignOut,
  uploadCoaFileToDrive,
  getDriveAccessToken,
  getDriveUser,
  initDriveAuth,
} from '../../../core/googleDrive/googleDriveService';
import { useEscapeKey } from '../../../core/utils/useEscapeKey';

interface GrnFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawMaterials: RawMaterial[];
  packagingMaterials: PackagingMaterial[];
  onSave: (record: Omit<GrnRecord, 'id' | 'createdAt' | 'grnNumber'>) => Promise<void>;
  userName?: string;
}

export const GrnFormModal: React.FC<GrnFormModalProps> = ({
  isOpen,
  onClose,
  rawMaterials,
  packagingMaterials,
  onSave,
  userName = 'Staf Gudang Logistik',
}) => {
  useEscapeKey(onClose, isOpen);

  const { user } = useAuth();
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultExpDate = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // +2 years

  const [materialType, setMaterialType] = useState<GrnMaterialType>('raw');
  const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);

  // Form Fields - PO, Delivery Note, Batch (all optional)
  const [distributor, setDistributor] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayStr);
  const [expiryDate, setExpiryDate] = useState(defaultExpDate);

  const [quantityReceived, setQuantityReceived] = useState<number | ''>('');
  const [unit, setUnit] = useState('kg');
  const [containerCount, setContainerCount] = useState<number | ''>(1);
  const [containerType, setContainerType] = useState('Drum Fiber (Sealed)');
  const [storageLocation, setStorageLocation] = useState('Warehouse Karantina Bahan Baku (Rak K-01)');
  const [storageConditions, setStorageConditions] = useState('Suhu Ruang Terkendali (15 - 25°C)');

  // Quality documents
  const [coaFileName, setCoaFileName] = useState<string>('');
  const [msdsFileName, setMsdsFileName] = useState<string>('');
  const [halalFileName, setHalalFileName] = useState<string>('');
  const coaInputRef = useRef<HTMLInputElement>(null);
  const coaCameraRef = useRef<HTMLInputElement>(null);
  const msdsInputRef = useRef<HTMLInputElement>(null);
  const msdsCameraRef = useRef<HTMLInputElement>(null);
  const halalInputRef = useRef<HTMLInputElement>(null);
  const halalCameraRef = useRef<HTMLInputElement>(null);

  // Google Drive CoA State
  const [coaDriveFileId, setCoaDriveFileId] = useState<string | null>(null);
  const [coaDriveViewLink, setCoaDriveViewLink] = useState<string | null>(null);
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(false);
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(null);
  const [isUploadingCoa, setIsUploadingCoa] = useState<boolean>(false);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);
  const [coaFileDataUrl, setCoaFileDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsub = initDriveAuth(
      (u) => {
        setIsDriveConnected(true);
        setDriveUserEmail(u?.email || null);
      },
      () => {
        setIsDriveConnected(false);
        setDriveUserEmail(null);
      }
    );
    const currentUser = getDriveUser();
    if (currentUser) {
      setIsDriveConnected(true);
      setDriveUserEmail(currentUser.email || null);
    }
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const handleCoaFileSelected = async (file: File) => {
    setCoaFileName(file.name);
    setDriveUploadError(null);

    // 1. Baca Data URL lokal agar file dapat langsung dilihat di browser
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setCoaFileDataUrl(dataUrl);
      }
    };
    reader.readAsDataURL(file);

    // 2. Upload ke Google Drive jika token tersedia
    const token = await getDriveAccessToken();
    if (token) {
      setIsUploadingCoa(true);
      try {
        const result = await uploadCoaFileToDrive(file, {
          grnNumber: deliveryNoteNumber || poNumber || 'Incoming',
          materialName: selectedMaterial?.name,
          batchNumber,
        });
        setCoaDriveFileId(result.fileId);
        setCoaDriveViewLink(result.webViewLink);
      } catch (err: any) {
        if (err.isCancelled || err.code === 'auth/popup-closed-by-user') {
          console.log('Drive upload auth cancelled');
          setDriveUploadError('Login Google dibatalkan. File tetap tersimpan sebagai lampiran lokal.');
        } else {
          console.warn('Drive upload failed, saved as local attachment:', err);
          setDriveUploadError('Gagal sinkron ke Google Drive: ' + (err.message || 'Error'));
        }
      } finally {
        setIsUploadingCoa(false);
      }
    }
  };

  const handleConnectDrive = async () => {
    try {
      setDriveUploadError(null);
      const res = await googleDriveSignIn();
      setIsDriveConnected(true);
      setDriveUserEmail(res.user?.email || null);
      if (coaInputRef.current?.files?.[0]) {
        await handleCoaFileSelected(coaInputRef.current.files[0]);
      } else if (coaCameraRef.current?.files?.[0]) {
        await handleCoaFileSelected(coaCameraRef.current.files[0]);
      }
    } catch (err: any) {
      if (err.isCancelled || err.code === 'auth/popup-closed-by-user') {
        // User closed popup without signing in
        setDriveUploadError('Autentikasi Google Drive dibatalkan.');
        setTimeout(() => setDriveUploadError(null), 3000);
      } else {
        setDriveUploadError(err.message || 'Gagal login Google Drive');
      }
    }
  };

  const handleSwitchDriveAccount = async () => {
    try {
      await googleDriveSignOut();
      setIsDriveConnected(false);
      setDriveUserEmail(null);
      await handleConnectDrive();
    } catch (err: any) {
      console.warn('Switch account error:', err);
    }
  };

  // Physical inspection & staff
  const [sealCondition, setSealCondition] = useState('✓ UTUH & TERSEGEL RESMI');
  const [packagingCondition, setPackagingCondition] = useState('✓ BAIK & BERSIH');
  const [receivedByStaff, setReceivedByStaff] = useState(userName || 'Mcmikecoc');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Password Confirmation State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordError, setAuthPasswordError] = useState<string | null>(null);

  // Auto-switch defaults when material type changes
  useEffect(() => {
    setSelectedMaterial(null);
    if (materialType === 'raw') {
      setUnit('kg');
      setContainerType('Drum Fiber (Sealed)');
      setStorageLocation('Warehouse Karantina Bahan Baku (Rak K-01)');
      setStorageConditions('Suhu Ruang Terkendali (15 - 25°C)');
      setDistributor('');
    } else {
      setUnit('pcs');
      setContainerType('Karton Box (Double Plastic Wrap)');
      setStorageLocation('Warehouse Karantina Bahan Kemas (Area BK-01)');
      setStorageConditions('Suhu Ruang (15 - 30°C)');
      setDistributor('');
    }
  }, [materialType]);

  // Handle selection from dropdown search
  const handleSelectMaterial = (item: any) => {
    setSelectedMaterial(item);
    setFormError(null);
    if (item.unit) setUnit(item.unit);
    if (item.storageConditions) setStorageConditions(item.storageConditions);
    if (materialType === 'packaging' && item.manufacturer) {
      setDistributor(item.manufacturer);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedMaterial) {
      setFormError('Harap pilih salah satu item master material dari daftar pencarian.');
      return;
    }
    if (!distributor.trim()) {
      setFormError('Nama supplier wajib diisi.');
      return;
    }
    if (!quantityReceived || Number(quantityReceived) <= 0) {
      setFormError('Jumlah kuantitas yang diterima harus lebih besar dari 0.');
      return;
    }

    // Tanggal kedatangan minimal hari berjalan
    if (!receivedDate) {
      setFormError('Tanggal kedatangan / diterima di warehouse wajib diisi.');
      return;
    }
    if (receivedDate < todayStr) {
      setFormError(`Tanggal kedatangan tidak boleh lebih kecil dari hari berjalan (${todayStr}).`);
      return;
    }

    // Tanggal kadaluarsa tidak boleh lebih kecil dari tanggal terima (Bahan Baku)
    if (materialType === 'raw') {
      if (!expiryDate) {
        setFormError('Tanggal kedaluwarsa (Expired Date) wajib diisi untuk Bahan Baku.');
        return;
      }
      if (expiryDate < receivedDate) {
        setFormError('Tanggal kedaluwarsa tidak boleh lebih kecil dari tanggal terima.');
        return;
      }
    }

    // Open password confirmation dialog (electronic signature)
    setAuthPassword('');
    setAuthPasswordError(null);
    setShowPasswordModal(true);
  };

  const handleFinalizeSaveWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthPasswordError(null);
    if (!authPassword.trim()) {
      setAuthPasswordError('Kata sandi pengguna aktif wajib diisi.');
      return;
    }

    if (!selectedMaterial) return;

    setIsSubmitting(true);
    try {
      const actorNik = user?.nik || 'admin';
      const verify = await authService.verifyPassword(actorNik, authPassword);
      if (!verify.valid) {
        setAuthPasswordError(verify.error || 'Kata sandi tidak valid. Otorisasi simpan GRN ditolak.');
        setIsSubmitting(false);
        return;
      }

      const resolvedManufacturer =
        selectedMaterial.manufacturer || selectedMaterial.supplier || distributor.trim() || '-';

      await onSave({
        materialType,
        materialId: selectedMaterial.id,
        materialCode: selectedMaterial.code,
        materialName: selectedMaterial.name,
        manufacturer: resolvedManufacturer,
        distributor: distributor.trim(),
        poNumber: poNumber.trim() || '-',
        deliveryNoteNumber: deliveryNoteNumber.trim() || '-',
        batchNumber: batchNumber.trim() || '-',
        receivedDate,
        expiryDate: materialType === 'raw' ? expiryDate : undefined,
        quantityReceived: Number(quantityReceived),
        unit,
        containerCount: Number(containerCount) || 1,
        containerType,
        storageLocation,
        storageConditions,
        qcStatus: 'QUARANTINE',
        qcParametersCount: selectedMaterial.qcParametersCount ?? 0,
        sealCondition,
        packagingCondition,
        coaAttachment: coaFileDataUrl || coaFileName || undefined,
        coaDriveFileId: coaDriveFileId || undefined,
        coaDriveViewLink: coaDriveViewLink || undefined,
        msdsAttachment: msdsFileName || undefined,
        halalAttachment: halalFileName || undefined,
        receivedBy: receivedByStaff || userName,
        notes: additionalNotes.trim() || undefined,
      });

      setShowPasswordModal(false);
      onClose();
    } catch (err: any) {
      setAuthPasswordError(err.message || 'Gagal menyimpan penerimaan barang ke sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Hidden inputs for document uploads */}
        <input
          type="file"
          ref={coaInputRef}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleCoaFileSelected(e.target.files[0]);
            }
          }}
        />
        <input
          type="file"
          ref={coaCameraRef}
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleCoaFileSelected(e.target.files[0]);
            }
          }}
        />
        <input
          type="file"
          ref={msdsInputRef}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setMsdsFileName(e.target.files[0].name);
            }
          }}
        />
        <input
          type="file"
          ref={msdsCameraRef}
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setMsdsFileName(e.target.files[0].name);
            }
          }}
        />
        <input
          type="file"
          ref={halalInputRef}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setHalalFileName(e.target.files[0].name);
            }
          }}
        />
        <input
          type="file"
          ref={halalCameraRef}
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setHalalFileName(e.target.files[0].name);
            }
          }}
        />

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
              <PackagePlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Form Penerimaan Barang Baru (Werehouse)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {materialType === 'raw'
                  ? 'Pencatatan Kedatangan Bahan Baku & Registrasi Karantina CPKB'
                  : 'Pencatatan Kedatangan Bahan Kemas & Registrasi Karantina CPKB'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 scrollbar-thin">
          {formError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: IDENTITAS JENIS & MASTER MATERIAL */}
          <div className="p-5 rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                1. IDENTITAS JENIS & MASTER MATERIAL :
              </h3>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold w-fit">
                <Check className="w-3.5 h-3.5" />
                Otomatis Terhubung Master Data
              </span>
            </div>

            {/* Material Type Toggle Switch */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMaterialType('raw')}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  materialType === 'raw'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    materialType === 'raw' ? 'bg-emerald-200' : 'bg-emerald-500'
                  }`}
                />
                Bahan Baku (Format B0001)
              </button>

              <button
                type="button"
                onClick={() => setMaterialType('packaging')}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  materialType === 'packaging'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    materialType === 'packaging' ? 'bg-blue-200' : 'bg-blue-500'
                  }`}
                />
                Bahan Kemas (Format K0001)
              </button>
            </div>

            {/* Interactive Material Dropdown Search Component */}
            <MaterialSearchDropdown
              type={materialType}
              rawMaterials={rawMaterials}
              packagingMaterials={packagingMaterials}
              selectedCode={selectedMaterial?.code}
              onSelect={handleSelectMaterial}
            />
          </div>

          {/* Section 2: IDENTITAS PRODUSEN, PEMASOK & PENGIRIMAN */}
          <div className="p-5 rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  materialType === 'raw' ? 'bg-emerald-600' : 'bg-blue-600'
                }`}
              />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                2. IDENTITAS PRODUSEN, SUPPLIER & PENGIRIMAN
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Manufacturer / Produsen */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Nama Produsen / Manufacturer</label>
                  {materialType === 'raw' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-extrabold">
                      <Lock className="w-3 h-3" />
                      Non-editable (Dari Master)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-extrabold">
                      <Lock className="w-3 h-3" />
                      Sama dengan Supplier
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    readOnly
                    value={
                      materialType === 'raw'
                        ? selectedMaterial?.manufacturer || 'Pilih bahan terlebih dahulu'
                        : distributor
                        ? distributor
                        : 'Otomatis mengikuti Nama Supplier'
                    }
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 cursor-not-allowed"
                  />
                  <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {materialType === 'raw'
                    ? 'Nama pabrik produsen otomatis diambil dari Master Data Bahan Baku.'
                    : 'Untuk kemasan, nama produsen terkunci sama dengan nama supplier.'}
                </p>
              </div>

              {/* Supplier */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Supplier <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={distributor}
                  onChange={(e) => setDistributor(e.target.value)}
                  placeholder={
                    materialType === 'raw'
                      ? 'Contoh: PT Kimia Farma Trading / PT BASF Supplier'
                      : 'Contoh: PT Mulia Packaging / PT Multi Plastik'
                  }
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Pihak supplier yang mengirimkan barang ke gudang.
                </p>
              </div>
            </div>

            {/* PO, Delivery Note, and Batch Number (Semua Opsional / Boleh Kosong) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  No. Purchase Order (PO) <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="PO-2026-0881"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  No. Surat Jalan (Delivery Note) <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={deliveryNoteNumber}
                  onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                  placeholder="Contoh: SJ-88912 (Boleh kosong)"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  No. Batch / Lot Produsen <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="Contoh: BN-2026-X81 (Opsional)"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Dates Row: Minimal Hari Berjalan & Tanggal Kadaluarsa */}
            <div className={`grid grid-cols-1 ${materialType === 'raw' ? 'sm:grid-cols-2' : ''} gap-4 pt-1`}>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Tanggal Diterima di Werehouse <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    Min: Hari Ini ({todayStr})
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="date"
                    min={todayStr}
                    value={receivedDate}
                    onChange={(e) => {
                      setReceivedDate(e.target.value);
                      if (materialType === 'raw' && expiryDate < e.target.value) {
                        setExpiryDate(e.target.value);
                      }
                    }}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  *Tanggal kedatangan tidak boleh lebih kecil dari hari ini ({todayStr}).
                </p>
              </div>

              {/* Tanggal Kedaluwarsa: Hanya untuk Bahan Baku, Hilangkan sepenuhnya untuk Bahan Kemas */}
              {materialType === 'raw' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Tanggal Kedaluwarsa (Expired Date) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    min={receivedDate || todayStr}
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    *Tanggal uji ulang (Retest Date) akan otomatis disetel sistem ke 3 bulan sebelum tanggal kedaluwarsa.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: KUANTITAS, KEMASAN & SUHU PENYIMPANAN WEREHOUSE */}
          <div className="p-5 rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                3. KUANTITAS, KEMASAN & SUHU PENYIMPANAN WEREHOUSE
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* Quantity Received */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Jumlah Total Diterima <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={quantityReceived}
                  onChange={(e) => setQuantityReceived(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Contoh: 100"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              {/* Unit Dropdown */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Satuan Ukur</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="kg">kg (Kilogram)</option>
                  <option value="gram">gram (g)</option>
                  <option value="pcs">pcs (Pieces)</option>
                  <option value="liter">liter (L)</option>
                  <option value="drum">drum</option>
                  <option value="sak">sak</option>
                </select>
              </div>

              {/* Containers Count */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Jumlah Wadah / Koli</label>
                <input
                  type="number"
                  value={containerCount}
                  onChange={(e) => setContainerCount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Contoh: 5"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Wadah / Keterangan (Bahan Baku) vs Keterangan (Bahan Kemas) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {materialType === 'raw' ? 'Wadah / Keterangan' : 'Keterangan'}
                </label>
                <input
                  type="text"
                  list="container-suggestions"
                  value={containerType}
                  onChange={(e) => setContainerType(e.target.value)}
                  placeholder={
                    materialType === 'raw'
                      ? 'Drum Fiber (Sealed)'
                      : 'Karton Box (Double Plastic Wrap)'
                  }
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <datalist id="container-suggestions">
                  <option value="Drum Fiber (Sealed)" />
                  <option value="Karton Box (Double Plastic Wrap)" />
                  <option value="Jerigen HDPE" />
                  <option value="Sak Kertas Kraft" />
                  <option value="Palletized Shrink Wrap" />
                  <option value="Plastik Klip Ziplock" />
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Storage Location */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Lokasi Peletakan Karantina Werehouse
                </label>
                <input
                  type="text"
                  value={storageLocation}
                  onChange={(e) => setStorageLocation(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Temperature */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Suhu Penyimpanan Werehouse
                </label>
                <div className="relative">
                  <Thermometer className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={storageConditions}
                    onChange={(e) => setStorageConditions(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: DOKUMEN MUTU (Bahan Baku: COA, MSDS, Halal | Bahan Kemas: Bebas Lampiran) */}
          {materialType === 'raw' ? (
            <div className="p-5 rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    4. DOKUMEN MUTU BAHAN BAKU (COA WAJIB, MSDS & HALAL)
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold w-fit">
                  *CoA Produsen Wajib Ada
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sertifikat Analisis (CoA) wajib dilampirkan. Anda dapat mengunggah file dokumen atau memotret langsung dengan kamera HP.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* CoA Card */}
                <div className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/20 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileCheck className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-black text-slate-800">CoA Produsen</span>
                      </div>
                      <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                        * (Wajib)
                      </span>
                    </div>

                    {/* Google Drive Status Banner */}
                    <div className="mt-2 mb-1 flex items-center justify-between gap-1 text-[11px] flex-wrap">
                      <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        <Cloud className="w-3 h-3 text-blue-600" />
                        <span>Google Drive Perusahaan: Aktif</span>
                      </span>
                      {(user?.role === 'admin' || user?.role === 'superadmin' || user?.department === 'management') && (
                        <button
                          type="button"
                          onClick={handleSwitchDriveAccount}
                          className="text-[10px] font-semibold text-slate-500 hover:text-blue-700 underline cursor-pointer"
                          title="Ganti atau hubungkan dengan akun Google lain (Admin)"
                        >
                          Ganti Akun
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      {isUploadingCoa ? (
                        <span className="font-semibold text-blue-700 flex items-center gap-1.5 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" /> Mengunggah ke Google Drive...
                        </span>
                      ) : coaDriveViewLink ? (
                        <span className="font-semibold text-emerald-700 block break-all">
                          ✓ Tersimpan di Google Drive: {coaFileName}
                        </span>
                      ) : coaFileName ? (
                        <span className="font-semibold text-emerald-700 break-all">
                          ✓ File: {coaFileName}
                        </span>
                      ) : (
                        'Lampirkan Sertifikat Analisis (CoA) asli dari produsen untuk pengujian QC.'
                      )}
                    </p>

                    {driveUploadError && (
                      <p className="text-[10px] text-rose-600 mt-1">{driveUploadError}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isUploadingCoa}
                      onClick={() => coaInputRef.current?.click()}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Pilih File</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingCoa}
                      onClick={() => coaCameraRef.current?.click()}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Foto HP</span>
                    </button>
                  </div>
                </div>

                {/* MSDS Card */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/30 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-black text-slate-800">MSDS (Safety Data)</span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">
                        (Opsional)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                      {msdsFileName ? (
                        <span className="font-semibold text-emerald-700 break-all">
                          ✓ File: {msdsFileName}
                        </span>
                      ) : (
                        'Lembar Data Keselamatan Bahan Kimia (MSDS).'
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => msdsInputRef.current?.click()}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Pilih File</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => msdsCameraRef.current?.click()}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-500" />
                      <span>Foto HP</span>
                    </button>
                  </div>
                </div>

                {/* Halal Card */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/30 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-black text-slate-800">Sertifikat Halal</span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">
                        (Opsional)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                      {halalFileName ? (
                        <span className="font-semibold text-emerald-700 break-all">
                          ✓ File: {halalFileName}
                        </span>
                      ) : (
                        'Sertifikat Halal MUI / BPJPH / Luar Negeri.'
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => halalInputRef.current?.click()}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Pilih File</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => halalCameraRef.current?.click()}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-500" />
                      <span>Foto HP</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Bahan Kemas: Bebas Lampiran Dokumen Mutu Card */
            <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/70 flex items-start gap-3 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <h4 className="font-black text-blue-950">
                  Bahan Kemas: Bebas Lampiran Dokumen Mutu (Tanpa COA, MSDS, Halal)
                </h4>
                <p className="text-[11px] text-blue-800 mt-1 leading-relaxed">
                  Sesuai prosedur operasional standar, penerimaan Bahan Kemas (wadah, botol, tutup, kardus, leaflet) tidak memerlukan lampiran COA, MSDS, maupun Sertifikat Halal. Pemeriksaan akan dilakukan secara sampling dimensi dan visual oleh tim QC.
                </p>
              </div>
            </div>
          )}

          {/* Section 5: KONDISI FISIK WADAH & VERIFIKASI PETUGAS */}
          <div className="p-5 rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                5. KONDISI FISIK WADAH & VERIFIKASI PETUGAS
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Kondisi Segel Wadah
                </label>
                <select
                  value={sealCondition}
                  onChange={(e) => setSealCondition(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="✓ UTUH & TERSEGEL RESMI">✓ UTUH & TERSEGEL RESMI</option>
                  <option value="RUSAK / TIDAK TERSEGEL">RUSAK / TIDAK TERSEGEL</option>
                  <option value="SEGEL TERBUKA">SEGEL TERBUKA</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Kondisi Fisik Kemasan Luar
                </label>
                <select
                  value={packagingCondition}
                  onChange={(e) => setPackagingCondition(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="✓ BAIK & BERSIH">✓ BAIK & BERSIH</option>
                  <option value="KOTOR / BERDEBU">KOTOR / BERDEBU</option>
                  <option value="CACAT / PENYOK / BOCOR">CACAT / PENYOK / BOCOR</option>
                  <option value="BASAH / LEMBAB">BASAH / LEMBAB</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Petugas Penerima Werehouse <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={receivedByStaff}
                  onChange={(e) => setReceivedByStaff(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Catatan Tambahan Werehouse
                </label>
                <input
                  type="text"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Kondisi palet, catatan kebersihan armada, dsb."
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all flex items-center gap-2 ${
                materialType === 'raw'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              } disabled:opacity-50`}
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Penerimaan & Masuk Karantina Werehouse'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Otorisasi Simpan Penerimaan GRN
                  </h4>
                  <span className="text-[10px] text-slate-400">Tanda Tangan Elektronik Pengguna</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-xs text-slate-800 space-y-1.5">
              <div className="flex justify-between font-mono font-bold text-[11px] text-slate-500">
                <span>Jenis: {materialType === 'raw' ? 'Bahan Baku' : 'Bahan Kemas'}</span>
                <span>Tgl Terima: {receivedDate}</span>
              </div>
              <p className="font-bold text-slate-900">
                {selectedMaterial?.code} - {selectedMaterial?.name}
              </p>
              <p className="text-[11px] text-slate-600">
                Jumlah: {Number(quantityReceived).toLocaleString()} {unit} ({containerCount} {containerType})
              </p>
              <p className="text-[11px] text-slate-600">
                Supplier: {distributor}
              </p>
            </div>

            <form onSubmit={handleFinalizeSaveWithPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Kata Sandi Akun Pengguna Aktif <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {user?.name || userName} ({user?.nik || 'NIK'})
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    autoFocus
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Masukkan password akun Anda..."
                    className="w-full text-xs border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 font-semibold"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              {authPasswordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{authPasswordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Verifikasi & Terbitkan GRN'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

