import React, { useState, useRef, useEffect, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { Product, ProductVariant, BulkFormulation, PackagingMaterial, QCParameter } from '../../types';
import { useAuth } from '../../core/auth/AuthContext';
import { canWriteModule } from '../../core/auth/permissionGuard';
import { authService } from '../../core/auth/authService';
import { productService, formatToISODate } from '../../features/rnd/products/productService';
import { auditLogger } from '../../core/utils/auditLogger';
import {
  PackageCheck,
  Search,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Tag,
  Layers,
  Sparkles,
  Barcode,
  ShieldCheck,
  FlaskConical,
  Boxes,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Lock,
  AlertCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Eye,
  EyeOff,
  RefreshCw,
  Upload,
  Download,
  Database,
  Copy,
  Check,
  Play
} from 'lucide-react';
import { runProductQAAutomation, QATestResult } from '../../features/rnd/products/__tests__/productAutomationQA';

interface RndProductsTabProps {
  products: Product[];
  formulations: BulkFormulation[];
  packagingMaterials: PackagingMaterial[];
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onSaveVariant: (productId: string, variant: ProductVariant) => void;
  onDeleteVariant: (productId: string, variantId: string) => void;
  onClearAllProducts?: () => void;
}

export const RndProductsTab: React.FC<RndProductsTabProps> = ({
  products,
  formulations,
  packagingMaterials,
  onSaveProduct,
  onDeleteProduct,
  onSaveVariant,
  onDeleteVariant,
  onClearAllProducts,
}) => {
  const { user } = useAuth();
  const canWrite = canWriteModule(user, 'rnd');

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>(
    products.map((p) => p.id) // Default expand all to see variants easily
  );

  // Popup Modal States for Product Detail & Variants
  const [viewingProductDetail, setViewingProductDetail] = useState<Product | null>(null);
  const [viewingProductVariants, setViewingProductVariants] = useState<Product | null>(null);

  const activeViewingDetailProduct = viewingProductDetail
    ? products.find((p) => p.id === viewingProductDetail.id) || viewingProductDetail
    : null;

  const activeViewingVariantsProduct = viewingProductVariants
    ? products.find((p) => p.id === viewingProductVariants.id) || viewingProductVariants
    : null;

  // Modal State for Product (PJ0001)
  const [showProductModal, setShowProductModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<'products' | 'variants'>('products');
  const [importMethod, setImportMethod] = useState<'excel' | 'paste'>('excel');
  const [pasteText, setPasteText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodCode, setProdCode] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('Skincare - Facial Treatment');
  const [prodBrand, setProdBrand] = useState('Larassanti');
  const [prodDesc, setProdDesc] = useState('');
  const [prodUnit, setProdUnit] = useState('pcs (Pieces)');
  const [prodStorage, setProdStorage] = useState('Suhu Ruang (15-25°C), Kering, Bebas Cahaya Langsung');
  const [prodBpomNo, setProdBpomNo] = useState('');
  const [prodBpomExt, setProdBpomExt] = useState('');
  const [prodQcParams, setProdQcParams] = useState<QCParameter[]>([]);
  const [newProdQcName, setNewProdQcName] = useState('');
  const [newProdQcCondition, setNewProdQcCondition] = useState('');
  const [newProdQcUnit, setNewProdQcUnit] = useState('');

  const [prodFinishedParams, setProdFinishedParams] = useState<QCParameter[]>([]);
  const [newProdFinishedName, setNewProdFinishedName] = useState('');
  const [newProdFinishedCondition, setNewProdFinishedCondition] = useState('');
  const [newProdFinishedUnit, setNewProdFinishedUnit] = useState('');

  // Modal State for Variant (PJ0001-V1)
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [targetProductId, setTargetProductId] = useState<string | null>(null);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [varCode, setVarCode] = useState('');
  const [varName, setVarName] = useState('');
  const [varNetVolume, setVarNetVolume] = useState<number | string>(30);
  const [varUnit, setVarUnit] = useState<string>('g (gram)');
  const [varFormulaCode, setVarFormulaCode] = useState('');
  const [varBpom, setVarBpom] = useState('');
  const [varBarcode, setVarBarcode] = useState('');
  const [varDesc, setVarDesc] = useState('');
  const [varPrimaryPack, setVarPrimaryPack] = useState('');
  const [varSecondaryPack, setVarSecondaryPack] = useState('');
  const [varTertiaryPack, setVarTertiaryPack] = useState('');

  // Helper untuk menghasilkan EAN-13 standar GS1 Indonesia (prefix 899...) dengan check-digit valid
  const generateEAN13 = () => {
    const base12 = '899' + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(base12[i], 10);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return `${base12}${checkDigit}`;
  };

  const handleGenerateEan13 = () => {
    setVarBarcode(generateEAN13());
  };

  // Tab Filter EXP NA < 6 Bulan
  const [activeExpFilterTab, setActiveExpFilterTab] = useState<'all' | 'expiring_soon'>('all');

  // Pagination State for Master Produk Jadi (Default 50 per page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);

  // Auto reset page to 1 when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeExpFilterTab, itemsPerPage]);

  // Packaging BOM Builder State for Variant Modal
  const [varPackagingBom, setVarPackagingBom] = useState<Array<{
    packagingCode: string;
    quantityPerUnit: number;
    type: 'primary' | 'secondary' | 'tertiary';
  }>>([]);
  const [newPackCode, setNewPackCode] = useState('');
  const [newPackType, setNewPackType] = useState<'primary' | 'secondary' | 'tertiary'>('primary');
  const [newPackQty, setNewPackQty] = useState<number | string>(1);

  // Helper Analisis Masa Berlaku Izin Edar BPOM (NA)
  const getBpomExpInfo = (prod: Product) => {
    const dateStr = prod.expNotificationDate || prod.bpomNotificationExt;
    if (!dateStr || !dateStr.trim()) {
      return {
        hasDate: false,
        dateFormatted: '',
        daysLeft: null,
        isExpiringSoon: false,
        isExpired: false,
        isAttentionNeeded: false,
        status: 'none' as const,
      };
    }

    const match = dateStr.match(/\d{4}-\d{2}-\d{2}/);
    const targetStr = match ? match[0] : dateStr.trim();
    const parsedDate = new Date(targetStr);

    if (isNaN(parsedDate.getTime())) {
      return {
        hasDate: true,
        dateFormatted: dateStr,
        daysLeft: null,
        isExpiringSoon: false,
        isExpired: false,
        isAttentionNeeded: false,
        status: 'invalid' as const,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(parsedDate);
    expDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isExpired = diffDays < 0;
    const isExpiringSoon = diffDays >= 0 && diffDays <= 180; // Kurang dari 6 bulan (~180 hari)

    return {
      hasDate: true,
      dateFormatted: parsedDate.toISOString().split('T')[0],
      daysLeft: diffDays,
      isExpiringSoon,
      isExpired,
      isAttentionNeeded: diffDays <= 180, // Expired atau < 6 bulan
      status: isExpired ? ('expired' as const) : isExpiringSoon ? ('expiring_soon' as const) : ('safe' as const),
    };
  };

  const expiringSoonProducts = products.filter((p) => getBpomExpInfo(p).isAttentionNeeded);
  const expiringSoonCount = expiringSoonProducts.length;

  // Delete Confirmation State with Active User Password
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'product';
    id: string;
    name: string;
    code: string;
  } | {
    type: 'variant';
    prodId: string;
    id: string;
    name: string;
    code: string;
  } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const [isVerifyingDeletePassword, setIsVerifyingDeletePassword] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // QA Automation states
  const [showQAModal, setShowQAModal] = useState(false);
  const [isTestingQA, setIsTestingQA] = useState(false);
  const [qaReport, setQaReport] = useState<{
    allPassed: boolean;
    results: QATestResult[];
    summary: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ configured: boolean; ready: boolean; message: string } | null>(null);

  useEffect(() => {
    productService.checkTableStatus().then(status => {
      setDbStatus(status);
    });
  }, []);

  const handleRunQA = async () => {
    setIsTestingQA(true);
    setShowQAModal(true);
    try {
      const report = await runProductQAAutomation();
      setQaReport(report);
    } catch (err: any) {
      console.warn('QA Automation execution notice:', err);
    } finally {
      setIsTestingQA(false);
    }
  };

  const handleCopySql = () => {
    const sqlText = `-- ============================================================================
-- SUPABASE SQL SCHEMA FOR MASTER PRODUCTS & VARIANTS
-- ============================================================================

-- 1. Table: products (Master Produk Jadi)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    product_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    exp_notification_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    category TEXT,
    description TEXT,
    unit TEXT DEFAULT 'pcs (Pieces)',
    storage_conditions TEXT,
    bpom_notification_number TEXT,
    qc_parameters JSONB DEFAULT '[]'::jsonb
);

-- 2. Table: product_variants (Varian Ukuran & Kemasan)
CREATE TABLE IF NOT EXISTS public.product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    net_volume_grams NUMERIC(10, 2) DEFAULT 0,
    bulk_formula_code TEXT,
    packaging_bom JSONB DEFAULT '[]'::jsonb,
    bpom_number TEXT,
    barcode TEXT,
    description TEXT
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_products_product_code ON public.products(product_code);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON public.product_variants(sku);

-- 4. RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access on products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow insert update delete on products" ON public.products FOR ALL USING (true);
CREATE POLICY "Allow public read access on product_variants" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "Allow insert update delete on product_variants" ON public.product_variants FOR ALL USING (true);`;
    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
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

      if (itemToDelete.type === 'product') {
        onDeleteProduct(itemToDelete.id);
        setSuccessToast(`Produk Jadi "${itemToDelete.code} - ${itemToDelete.name}" berhasil dihapus.`);
      } else {
        onDeleteVariant(itemToDelete.prodId, itemToDelete.id);
        setSuccessToast(`Varian "${itemToDelete.code} - ${itemToDelete.name}" berhasil dihapus.`);
      }

      // Record Audit Trail Log
      auditLogger.logAction({
        actorNik: actorNik,
        actorName: user?.name || user?.username || 'ADMIN',
        module: 'rnd',
        action: itemToDelete.type === 'product' ? 'PRODUCT_DELETE' : 'VARIANT_DELETE',
        targetNik: itemToDelete.code,
        details: `Penghapusan ${itemToDelete.type === 'product' ? 'Master Produk Jadi' : 'Varian Produk'} ${itemToDelete.code} (${itemToDelete.name}) dengan otorisasi kata sandi pengguna aktif.`,
      });

      setIsVerifyingDeletePassword(false);
      setItemToDelete(null);
      setDeletePassword('');
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setDeletePasswordError(err.message || 'Terjadi kesalahan saat memverifikasi sandi.');
      setIsVerifyingDeletePassword(false);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedProductIds.includes(id)) {
      setExpandedProductIds(expandedProductIds.filter((pId) => pId !== id));
    } else {
      setExpandedProductIds([...expandedProductIds, id]);
    }
  };

  const getNextProductCode = () => {
    return `PJ${String(products.length + 1).padStart(4, '0')}`;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const variantFileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const templateData = [
      [
        'Kode Produk',
        'Nama Produk',
        'Kategori',
        'Brand / Merk',
        'Satuan Unit',
        'Kondisi Penyimpanan',
        'No Notifikasi (BPOM)',
        'EXP Notifikasi (YYYY-MM-DD)',
        'Deskripsi',
        // Bagian 1: Sediaan Ruahan (Bulk)
        'Ruahan Param 1', 'Ruahan Syarat 1', 'Ruahan Satuan 1',
        'Ruahan Param 2', 'Ruahan Syarat 2', 'Ruahan Satuan 2',
        'Ruahan Param 3', 'Ruahan Syarat 3', 'Ruahan Satuan 3',
        // Bagian 2: Produk Jadi / Kemasan
        'Produk Jadi Param 1', 'Produk Jadi Syarat 1', 'Produk Jadi Satuan 1',
        'Produk Jadi Param 2', 'Produk Jadi Syarat 2', 'Produk Jadi Satuan 2',
        'Produk Jadi Param 3', 'Produk Jadi Syarat 3', 'Produk Jadi Satuan 3'
      ],
      [
        'PJ0001',
        'Larassanti Brightening Serum 20ml',
        'Skincare - Facial Treatment',
        'PT. LARASSANTI MAKMUR SEJAHTERA',
        'pcs (Pieces)',
        'Suhu Ruang (15-25°C), Kering, Bebas Cahaya Langsung',
        'NA18230100123',
        '2028-12-31',
        'Serum pencerah wajah premium dengan Niacinamide.',
        // Ruahan values
        'pH Sediaan', '6.0 - 6.8', '',
        'Viskositas', '3500 - 4500', 'cPs',
        'Bobot Jenis', '0.98 - 1.02', 'g/ml',
        // Produk Jadi values
        'Berat Netto', '30 ± 0.5', 'gram',
        'Uji Kebocoran', 'Tidak Bocor', '',
        'Torsi Tutup', '12.0 - 18.0', 'kg.cm'
      ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Master Dual-Spec');
    XLSX.writeFile(wb, 'Template_Master_Produk_Ruahan_dan_Produk_Jadi.xlsx');
  };

  const processExcelFile = async (file: File) => {
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      // Menggunakan cellDates: true agar tanggal Excel terkonversi akurat
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

      if (!rawRows || rawRows.length === 0) {
        alert('File Excel kosong atau tidak dapat dibaca.');
        return;
      }

      // 1. Cari Baris Header (Scan baris 0 s.d 15)
      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        const rowStr = (rawRows[r] || []).map((cell) => String(cell || '').toLowerCase()).join(' ');
        if (
          rowStr.includes('kode') ||
          rowStr.includes('nama') ||
          rowStr.includes('product') ||
          rowStr.includes('brand') ||
          rowStr.includes('kategori') ||
          rowStr.includes('bpom') ||
          rowStr.includes('ruahan') ||
          rowStr.includes('produk jadi')
        ) {
          headerRowIndex = r;
          break;
        }
      }

      const headerRow = rawRows[headerRowIndex] || [];
      const dataRows = rawRows.slice(headerRowIndex + 1);

      if (dataRows.length === 0) {
        alert('File Excel tidak memiliki baris data setelah header.');
        return;
      }

      // 2. Pemetaan Kolom Dinamis Berdasarkan Teks Header
      let colCode = -1;
      let colName = -1;
      let colCategory = -1;
      let colBrand = -1;
      let colUnit = -1;
      let colStorage = -1;
      let colBpom = -1;
      let colExp = -1;
      let colDesc = -1;

      headerRow.forEach((hCell, idx) => {
        const hText = String(hCell || '').toLowerCase().trim();
        if (colCode === -1 && (hText.includes('kode') || hText.includes('code') || hText.includes('sku') || hText === 'pj')) {
          colCode = idx;
        } else if (colName === -1 && (hText.includes('nama') || hText.includes('title') || hText.includes('product name') || hText.includes('nama produk'))) {
          colName = idx;
        } else if (colCategory === -1 && (hText.includes('kategori') || hText.includes('category') || hText.includes('jenis'))) {
          colCategory = idx;
        } else if (colBrand === -1 && (hText.includes('brand') || hText.includes('merk') || hText.includes('pabrik') || hText.includes('perusahaan'))) {
          colBrand = idx;
        } else if (colUnit === -1 && (hText.includes('satuan') || hText.includes('unit') || hText.includes('kemasan'))) {
          colUnit = idx;
        } else if (colStorage === -1 && (hText.includes('kondisi') || hText.includes('penyimpanan') || hText.includes('storage') || hText.includes('suhu'))) {
          colStorage = idx;
        } else if (colBpom === -1 && (hText.includes('bpom') || hText.includes('notifikasi') || hText.includes('no reg') || hText.includes('nomor bpom'))) {
          colBpom = idx;
        } else if (colExp === -1 && (hText.includes('exp') || hText.includes('kadaluarsa') || hText.includes('berlaku') || hText.includes('ext') || hText.includes('tanggal bpom'))) {
          colExp = idx;
        } else if (colDesc === -1 && (hText.includes('deskripsi') || hText.includes('description') || hText.includes('keterangan') || hText.includes('catatan'))) {
          colDesc = idx;
        }
      });

      // Fallback ke posisi indeks standar jika header tidak sesuai nama
      if (colCode === -1) colCode = 0;
      if (colName === -1) colName = 1;
      if (colCategory === -1) colCategory = 2;
      if (colBrand === -1) colBrand = 3;
      if (colUnit === -1) colUnit = 4;
      if (colStorage === -1) colStorage = 5;
      if (colBpom === -1) colBpom = 6;
      if (colExp === -1) colExp = 7;
      if (colDesc === -1) colDesc = 8;

      const importedProductsList: Product[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;

        const valCode = row[colCode] !== undefined && row[colCode] !== null ? String(row[colCode]).trim() : '';
        const valName = row[colName] !== undefined && row[colName] !== null ? String(row[colName]).trim() : '';

        // Abaikan baris kosong tanpa kode dan tanpa nama
        if (!valCode && !valName) continue;

        const code = valCode || `PJ${String(products.length + i + 1).padStart(4, '0')}`;
        const name = valName || 'Produk Tanpa Nama';
        const category = row[colCategory] !== undefined && row[colCategory] !== null ? String(row[colCategory]).trim() : 'Skincare';
        const brand = row[colBrand] !== undefined && row[colBrand] !== null ? String(row[colBrand]).trim() : 'PT. LARASSANTI MAKMUR SEJAHTERA';
        const unit = row[colUnit] !== undefined && row[colUnit] !== null ? String(row[colUnit]).trim() : 'pcs (Pieces)';
        const storageConditions = row[colStorage] !== undefined && row[colStorage] !== null ? String(row[colStorage]).trim() : 'Suhu Ruang (15-25°C)';
        const bpomNotificationNumber = row[colBpom] !== undefined && row[colBpom] !== null ? String(row[colBpom]).trim() : '';
        const rawDate = row[colExp] !== undefined && row[colExp] !== null ? row[colExp] : '';
        const bpomNotificationExt = formatToISODate(rawDate) || '';
        const description = row[colDesc] !== undefined && row[colDesc] !== null ? String(row[colDesc]).trim() : '';

        // 3. Ekstraksi Parameter QC Sediaan Ruahan & Produk Jadi
        const qcParameters: QCParameter[] = [];
        const finishedQcParameters: QCParameter[] = [];

        // Strategi A: Pola Triplet Kolom (Param, Syarat, Satuan)
        // Cek kolom dari index 9 s.d. akhir
        let startParamCol = Math.max(colCode, colName, colCategory, colBrand, colUnit, colStorage, colBpom, colExp, colDesc) + 1;
        if (startParamCol < 9) startParamCol = 9;

        for (let c = startParamCol; c < headerRow.length; c++) {
          const hName = String(headerRow[c] || '').trim();
          const cellVal = row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : '';
          if (!hName || !cellVal) continue;

          const hLower = hName.toLowerCase();

          // Jika header bernama "Ruahan Param 1" / "Produk Jadi Param 1", ikuti format 3-kolom
          if (hLower.includes('ruahan param') || hLower.includes('param ruahan')) {
            const specVal = row[c + 1] !== undefined && row[c + 1] !== null ? String(row[c + 1]).trim() : '';
            const unitVal = row[c + 2] !== undefined && row[c + 2] !== null ? String(row[c + 2]).trim() : '';
            qcParameters.push({
              id: `qc-${Date.now()}-${i}-${c}`,
              name: cellVal,
              parameterName: cellVal,
              specification: specVal,
              acceptanceCondition: specVal,
              unit: unitVal,
            });
            c += 2; // loncat 2 kolom
          } else if (hLower.includes('produk jadi param') || hLower.includes('param produk jadi') || hLower.includes('jadi param')) {
            const specVal = row[c + 1] !== undefined && row[c + 1] !== null ? String(row[c + 1]).trim() : '';
            const unitVal = row[c + 2] !== undefined && row[c + 2] !== null ? String(row[c + 2]).trim() : '';
            finishedQcParameters.push({
              id: `fin-${Date.now()}-${i}-${c}`,
              name: cellVal,
              parameterName: cellVal,
              specification: specVal,
              acceptanceCondition: specVal,
              unit: unitVal,
            });
            c += 2; // loncat 2 kolom
          } else {
            // Strategi B: Nama Kolom Adalah Nama Parameter Langsung (misal: "pH Sediaan", "Berat Netto")
            const isRuahan = hLower.includes('ruahan') || hLower.includes('bulk') || hLower.includes('sediaan') || c < startParamCol + 9;
            const paramItem: QCParameter = {
              id: `param-${Date.now()}-${i}-${c}`,
              name: hName,
              parameterName: hName,
              specification: cellVal,
              acceptanceCondition: cellVal,
              unit: '',
            };

            if (isRuahan) {
              qcParameters.push(paramItem);
            } else {
              finishedQcParameters.push(paramItem);
            }
          }
        }

        // Default fallback jika tidak ada parameter terdeteksi
        if (qcParameters.length === 0) {
          qcParameters.push({
            id: `qc-${Date.now()}-${i}-default`,
            name: 'pH Sediaan (Bulk)',
            parameterName: 'pH Sediaan (Bulk)',
            specification: '6.0 - 6.8',
            acceptanceCondition: '6.0 - 6.8',
            unit: '',
          });
        }

        if (finishedQcParameters.length === 0) {
          finishedQcParameters.push({
            id: `fin-${Date.now()}-${i}-default`,
            name: 'Berat Netto / Isi Aktual',
            parameterName: 'Berat Netto / Isi Aktual',
            specification: '30 ± 0.5',
            acceptanceCondition: '30 ± 0.5',
            unit: 'gram',
          });
        }

        const newProd: Product = {
          id: `prod-${Date.now()}-${i}`,
          code,
          productCode: code,
          name,
          category,
          brand,
          description,
          unit,
          storageConditions,
          bpomNotificationNumber,
          bpomNotificationExt,
          expNotificationDate: bpomNotificationExt,
          qcParameters,
          finishedQcParameters,
          variants: [],
          createdAt: new Date().toISOString(),
        };

        importedProductsList.push(newProd);
      }

      if (importedProductsList.length === 0) {
        alert('File Excel tidak memiliki baris produk yang valid.');
        return;
      }

      // Simpan seluruh data sekaligus dalam batch terdedikasi ke Supabase
      const saveRes = await productService.saveProducts(importedProductsList);

      // Update state tampilan secara kolektif
      for (const prod of importedProductsList) {
        onSaveProduct(prod);
      }

      if (saveRes.error) {
        alert(`Peringatan Impor Excel:\n${saveRes.error}\n\nStatus: ${saveRes.count} dari ${importedProductsList.length} produk tersimpan di Supabase, sisanya ditampilkan di memori.`);
      } else {
        setSuccessToast(`Berhasil mengimpor ${importedProductsList.length} Master Produk dengan Spesifikasi Ruahan & Produk Jadi ke Supabase!`);
        setTimeout(() => setSuccessToast(null), 5000);
      }
      setShowImportModal(false);
    } catch (err: any) {
      console.error('Error importing excel:', err);
      alert(`Gagal mengimpor file: ${err.message || 'Format salah'}`);
    }
  };

  const handleDownloadVariantTemplate = () => {
    const templateData = [
      [
        'Kode Produk Induk (PJ...) *',
        'Kode Varian / SKU *',
        'Nama Varian (Label Display) *',
        'Bobot / Ukuran Netto *',
        'Satuan',
        'Barcode EAN-13 (Opsional)',
        'Keterangan Kemasan'
      ],
      [
        'PJ0001',
        'PJ0001-30G',
        '30 g',
        '30',
        'g (gram)',
        '8993219584725',
        'Kemasan Dropper Bottle 30g'
      ],
      [
        'PJ0001',
        'PJ0001-50G',
        '50 g',
        '50',
        'g (gram)',
        '8993219584732',
        'Kemasan Jar Kaca 50g'
      ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Varian Produk');
    XLSX.writeFile(wb, 'Template_Import_Varian_Produk.xlsx');
  };

  const processVariantExcelFile = async (file: File) => {
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });

      if (!rawRows || rawRows.length === 0) {
        alert('File Excel varian kosong atau tidak memiliki baris data.');
        return;
      }

      // 1. Cari Baris Header (Scan baris 0 s.d 10)
      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
        const rowStr = (rawRows[r] || []).map((cell) => String(cell || '').toLowerCase()).join(' ');
        if (rowStr.includes('induk') || rowStr.includes('parent') || rowStr.includes('sku') || rowStr.includes('varian')) {
          headerRowIndex = r;
          break;
        }
      }

      const headerRow = rawRows[headerRowIndex] || [];
      const dataRows = rawRows.slice(headerRowIndex + 1);

      // Pemetaan Kolom Varian Dinamis
      let colParent = -1;
      let colSku = -1;
      let colName = -1;
      let colNet = -1;
      let colUnit = -1;
      let colBarcode = -1;
      let colDesc = -1;

      headerRow.forEach((hCell, idx) => {
        const hText = String(hCell || '').toLowerCase().trim();
        if (colParent === -1 && (hText.includes('induk') || hText.includes('parent') || hText.includes('kode produk'))) colParent = idx;
        else if (colSku === -1 && (hText.includes('sku') || hText.includes('kode varian') || hText.includes('variant code'))) colSku = idx;
        else if (colName === -1 && (hText.includes('nama varian') || hText.includes('variant name') || hText.includes('label'))) colName = idx;
        else if (colNet === -1 && (hText.includes('bobot') || hText.includes('netto') || hText.includes('isi') || hText.includes('volume') || hText.includes('gram'))) colNet = idx;
        else if (colUnit === -1 && hText.includes('satuan')) colUnit = idx;
        else if (colBarcode === -1 && (hText.includes('barcode') || hText.includes('ean'))) colBarcode = idx;
        else if (colDesc === -1 && (hText.includes('keterangan') || hText.includes('deskripsi') || hText.includes('kemasan'))) colDesc = idx;
      });

      if (colParent === -1) colParent = 0;
      if (colSku === -1) colSku = 1;
      if (colName === -1) colName = 2;
      if (colNet === -1) colNet = 3;
      if (colUnit === -1) colUnit = 4;
      if (colBarcode === -1) colBarcode = 5;
      if (colDesc === -1) colDesc = 6;

      let importedCount = 0;
      let errorCount = 0;
      const errorDetails: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;

        const parentCode = row[colParent] !== undefined && row[colParent] !== null ? String(row[colParent]).trim() : '';
        if (!parentCode) continue;

        const parentProd = products.find(
          (p) => p.code.toLowerCase() === parentCode.toLowerCase() || p.id === parentCode || (p.productCode && p.productCode.toLowerCase() === parentCode.toLowerCase())
        );

        if (!parentProd) {
          errorCount++;
          errorDetails.push(`Baris ${i + headerRowIndex + 2}: Master Produk Induk "${parentCode}" tidak ditemukan di database.`);
          continue;
        }

        const rawSku = row[colSku] !== undefined && row[colSku] !== null ? String(row[colSku]).trim().toUpperCase() : '';
        const sku = rawSku || `${parentProd.code}-V${parentProd.variants.length + i + 1}`;
        const variantName = row[colName] !== undefined && row[colName] !== null ? String(row[colName]).trim() : `${row[colNet] || '30'} g`;
        const netVolume = Number(row[colNet]) || 30;
        const barcode = row[colBarcode] !== undefined && row[colBarcode] !== null ? String(row[colBarcode]).trim() : generateEAN13();
        const description = row[colDesc] !== undefined && row[colDesc] !== null ? String(row[colDesc]).trim() : '';

        const variantData: ProductVariant = {
          id: `var-${Date.now()}-${i}`,
          productId: parentProd.id,
          variantCode: sku,
          sku: sku,
          variantName: variantName,
          status: 'active',
          netVolumeGrams: netVolume,
          bulkFormulaCode: formulations.length > 0 ? formulations[0].code : '',
          packagingBom: [],
          bpomNumber: parentProd.bpomNotificationNumber || '',
          barcode: barcode,
          description: description,
          createdAt: new Date().toISOString(),
        };

        await onSaveVariant(parentProd.id, variantData);
        importedCount++;
      }

      if (errorCount > 0) {
        alert(`Impor Varian Selesai:\n• Berhasil: ${importedCount} varian\n• Gagal: ${errorCount} varian\n\nCatatan:\n${errorDetails.slice(0, 5).join('\n')}${errorDetails.length > 5 ? '\n...dan lainnya' : ''}`);
      }

      if (importedCount > 0) {
        setSuccessToast(`Berhasil mengimpor ${importedCount} Varian Produk ke tabel database 'product_variants'!`);
        setShowImportModal(false);
        setTimeout(() => setSuccessToast(null), 5000);
      }
    } catch (err: any) {
      console.error('Error importing variant excel:', err);
      alert(`Gagal memproses file Excel Varian: ${err.message || 'Format tidak sesuai'}`);
    }
  };

  const handleProcessPastedVariants = async () => {
    if (!pasteText.trim()) {
      alert('Silakan tempel (paste) data teks varian dari spreadsheet terlebih dahulu.');
      return;
    }

    const lines = pasteText.trim().split('\n');
    let importedCount = 0;
    let errorCount = 0;
    const errorDetails: string[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const parts = line.split('\t').map((p) => p.trim());
      if (parts.length < 2 || !parts[0]) continue;

      // Skip header jika ter-copy
      if (idx === 0 && (parts[0].toLowerCase().includes('kode') || parts[0].toLowerCase().includes('parent') || parts[0].toLowerCase().includes('induk'))) {
        continue;
      }

      const parentCode = parts[0];
      const parentProd = products.find(
        (p) => p.code.toLowerCase() === parentCode.toLowerCase() || p.id === parentCode
      );

      if (!parentProd) {
        errorCount++;
        errorDetails.push(`Baris ${idx + 1}: Master Produk "${parentCode}" tidak ditemukan.`);
        continue;
      }

      const sku = (parts[1] || `${parentProd.code}-V${parentProd.variants.length + 1}`).toUpperCase();
      const variantName = parts[2] || `${parts[3] || '30'} g`;
      const netVolume = Number(parts[3]) || 30;
      const barcode = parts[5] ? parts[5] : generateEAN13();
      const description = parts[6] || '';

      const variantData: ProductVariant = {
        id: `var-${Date.now()}-${idx}`,
        productId: parentProd.id,
        variantCode: sku,
        sku: sku,
        variantName: variantName,
        status: 'active',
        netVolumeGrams: netVolume,
        bulkFormulaCode: formulations.length > 0 ? formulations[0].code : '',
        packagingBom: [],
        bpomNumber: parentProd.bpomNotificationNumber || '',
        barcode: barcode,
        description: description,
        createdAt: new Date().toISOString(),
      };

      await onSaveVariant(parentProd.id, variantData);
      importedCount++;
    }

    if (errorCount > 0) {
      alert(`Hasil Impor Paste:\n• Berhasil: ${importedCount} varian\n• Gagal: ${errorCount} varian\n\n${errorDetails.slice(0, 5).join('\n')}`);
    }

    if (importedCount > 0) {
      setSuccessToast(`Berhasil mengimpor ${importedCount} Varian dari salinan teks!`);
      setPasteText('');
      setShowImportModal(false);
      setTimeout(() => setSuccessToast(null), 5000);
    }
  };

  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProdCode(getNextProductCode());
    setProdName('');
    setProdCategory('Skincare - Facial Treatment');
    setProdBrand('PT. LARASSANTI MAKMUR SEJAHTERA');
    setProdDesc('');
    setProdUnit('pcs (Pieces)');
    setProdStorage('Suhu Ruang (15-25°C), Kering, Bebas Cahaya Langsung');
    setProdBpomNo('');
    setProdBpomExt('');
    setProdQcParams([
      { id: '1', name: 'pH Sediaan (Bulk)', parameterName: 'pH Sediaan (Bulk)', specification: '6.0 - 6.8', acceptanceCondition: '6.0 - 6.8', unit: '' },
      { id: '2', name: 'Viskositas Adonan', parameterName: 'Viskositas Adonan', specification: '3500 - 4500', acceptanceCondition: '3500 - 4500', unit: 'cPs' },
      { id: '3', name: 'Bobot Jenis (Density)', parameterName: 'Bobot Jenis (Density)', specification: '0.98 - 1.02', acceptanceCondition: '0.98 - 1.02', unit: 'g/ml' },
    ]);
    setProdFinishedParams([
      { id: 'f1', name: 'Berat Netto / Isi Aktual', parameterName: 'Berat Netto / Isi Aktual', specification: '30 ± 0.5', acceptanceCondition: '30 ± 0.5', unit: 'gram' },
      { id: 'f2', name: 'Uji Kebocoran Sealing', parameterName: 'Uji Kebocoran Sealing', specification: 'Tidak Bocor / Sempurna', acceptanceCondition: 'Tidak Bocor / Sempurna', unit: '' },
      { id: 'f3', name: 'Torsi Tutup Botol', parameterName: 'Torsi Tutup Botol', specification: '12.0 - 18.0', acceptanceCondition: '12.0 - 18.0', unit: 'kg.cm' },
    ]);
    setShowProductModal(true);
  };

  const handleOpenDetailProduct = async (prod: Product) => {
    setViewingProductDetail(prod);
    try {
      const fullParams = await productService.getProductWithParams(prod.id);
      if (fullParams) {
        setViewingProductDetail(prev => prev && prev.id === prod.id ? { ...prev, ...fullParams } : prev);
      }
    } catch (err) {
      console.warn('[productService] Gagal memuat detail parameter QC:', err);
    }
  };

  const handleOpenEditProduct = async (prod: Product) => {
    setEditingProduct(prod);
    setProdCode(prod.code);
    setProdName(prod.name);
    setProdCategory(prod.category);
    setProdBrand(prod.brand);
    setProdDesc(prod.description);
    setProdUnit(prod.unit || 'pcs (Pieces)');
    setProdStorage(prod.storageConditions || 'Suhu Ruang (15-25°C), Kering, Bebas Cahaya Langsung');
    setProdBpomNo(prod.bpomNotificationNumber || '');
    setProdBpomExt(prod.bpomNotificationExt || '');
    setProdQcParams(
      (prod.qcParameters || []).map((p, idx) => ({
        id: p.id || `qc-${idx}`,
        name: p.name || p.parameterName || '',
        parameterName: p.parameterName || p.name || '',
        specification: p.specification || p.acceptanceCondition || '',
        acceptanceCondition: p.acceptanceCondition || p.specification || '',
        unit: p.unit || ''
      }))
    );
    setProdFinishedParams(
      (prod.finishedQcParameters || []).length > 0
        ? (prod.finishedQcParameters || []).map((p, idx) => ({
            id: p.id || `fin-${idx}`,
            name: p.name || p.parameterName || '',
            parameterName: p.parameterName || p.name || '',
            specification: p.specification || p.acceptanceCondition || '',
            acceptanceCondition: p.acceptanceCondition || p.specification || '',
            unit: p.unit || ''
          }))
        : [
            { id: 'f1', name: 'Berat Netto / Isi Aktual', parameterName: 'Berat Netto / Isi Aktual', specification: '30 ± 0.5', acceptanceCondition: '30 ± 0.5', unit: 'gram' },
            { id: 'f2', name: 'Uji Kebocoran Sealing', parameterName: 'Uji Kebocoran Sealing', specification: 'Tidak Bocor', acceptanceCondition: 'Tidak Bocor', unit: '' },
            { id: 'f3', name: 'Torsi Tutup Botol', parameterName: 'Torsi Tutup Botol', specification: '12.0 - 18.0', acceptanceCondition: '12.0 - 18.0', unit: 'kg.cm' },
          ]
    );
    setShowProductModal(true);

    // Ambil spesifikasi lengkap on-demand dari Supabase
    try {
      const fullParams = await productService.getProductWithParams(prod.id);
      if (fullParams) {
        setProdQcParams(
          (fullParams.qcParameters || []).map((p, idx) => ({
            id: p.id || `qc-${idx}`,
            name: p.name || p.parameterName || '',
            parameterName: p.parameterName || p.name || '',
            specification: p.specification || p.acceptanceCondition || '',
            acceptanceCondition: p.acceptanceCondition || p.specification || '',
            unit: p.unit || ''
          }))
        );
        setProdFinishedParams(
          (fullParams.finishedQcParameters || []).length > 0
            ? (fullParams.finishedQcParameters || []).map((p, idx) => ({
                id: p.id || `fin-${idx}`,
                name: p.name || p.parameterName || '',
                parameterName: p.parameterName || p.name || '',
                specification: p.specification || p.acceptanceCondition || '',
                acceptanceCondition: p.acceptanceCondition || p.specification || '',
                unit: p.unit || ''
              }))
            : [
                { id: 'f1', name: 'Berat Netto / Isi Aktual', parameterName: 'Berat Netto / Isi Aktual', specification: '30 ± 0.5', acceptanceCondition: '30 ± 0.5', unit: 'gram' },
                { id: 'f2', name: 'Uji Kebocoran Sealing', parameterName: 'Uji Kebocoran Sealing', specification: 'Tidak Bocor', acceptanceCondition: 'Tidak Bocor', unit: '' },
                { id: 'f3', name: 'Torsi Tutup Botol', parameterName: 'Torsi Tutup Botol', specification: '12.0 - 18.0', acceptanceCondition: '12.0 - 18.0', unit: 'kg.cm' },
              ]
        );
      }
    } catch (err) {
      console.warn('[productService] Gagal memuat parameter on-demand:', err);
    }
  };

  const handleSaveProductForm = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedQcParams = prodQcParams.map((p, idx) => ({
      id: p.id || `qc-${Date.now()}-${idx}`,
      name: (p.parameterName || p.name || '').trim(),
      parameterName: (p.parameterName || p.name || '').trim(),
      specification: (p.acceptanceCondition || p.specification || '').trim(),
      acceptanceCondition: (p.acceptanceCondition || p.specification || '').trim(),
      unit: (p.unit || '').trim()
    }));

    const normalizedFinishedParams = prodFinishedParams.map((p, idx) => ({
      id: p.id || `fin-${Date.now()}-${idx}`,
      name: (p.parameterName || p.name || '').trim(),
      parameterName: (p.parameterName || p.name || '').trim(),
      specification: (p.acceptanceCondition || p.specification || '').trim(),
      acceptanceCondition: (p.acceptanceCondition || p.specification || '').trim(),
      unit: (p.unit || '').trim()
    }));

    const newOrUpdated: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      code: prodCode.trim().toUpperCase(),
      productCode: prodCode.trim().toUpperCase(),
      name: prodName.trim(),
      category: prodCategory.trim(),
      brand: prodBrand.trim(),
      description: prodDesc.trim(),
      unit: prodUnit.trim(),
      storageConditions: prodStorage.trim(),
      bpomNotificationNumber: prodBpomNo.trim(),
      bpomNotificationExt: prodBpomExt.trim(),
      expNotificationDate: prodBpomExt.trim(),
      qcParameters: normalizedQcParams,
      finishedQcParameters: normalizedFinishedParams,
      variants: editingProduct ? editingProduct.variants : [],
      createdAt: editingProduct?.createdAt || new Date().toISOString(),
    };

    onSaveProduct(newOrUpdated);
    setShowProductModal(false);
    setSuccessToast(`Master Produk [${newOrUpdated.code}] tersimpan ke database Supabase (tabel products)!`);
    setTimeout(() => setSuccessToast(null), 5000);
  };

  const handleOpenAddVariant = (prod?: Product) => {
    const targetProd = prod || (products.length > 0 ? products[0] : null);
    setTargetProductId(targetProd ? targetProd.id : null);
    setEditingVariant(null);
    setVarNetVolume(30);
    setVarUnit('g (gram)');
    setVarCode(targetProd ? `${targetProd.code}-30G` : 'PJ0001-30G');
    setVarName('30 g');
    setVarFormulaCode(formulations.length > 0 ? formulations[0].code : '');
    setVarPackagingBom([]);
    setNewPackCode('');
    setNewPackType('primary');
    setNewPackQty(1);
    setVarBpom(targetProd?.bpomNotificationNumber || '');
    setVarBarcode(generateEAN13());
    setVarDesc('');
    setShowVariantModal(true);
  };

  const handleOpenEditVariant = (prodId: string, variant: ProductVariant) => {
    setTargetProductId(prodId);
    setEditingVariant(variant);
    setVarCode(variant.variantCode || variant.sku);
    setVarName(variant.variantName);
    setVarNetVolume(variant.netVolumeGrams || 30);
    setVarUnit('g (gram)');
    setVarFormulaCode(variant.bulkFormulaCode || '');
    setVarPackagingBom(variant.packagingBom ? [...variant.packagingBom] : []);
    setNewPackCode('');
    setNewPackType('primary');
    setNewPackQty(1);
    setVarBpom(variant.bpomNumber || '');
    setVarBarcode(variant.barcode || '');
    setVarDesc(variant.description || '');
    setShowVariantModal(true);
  };

  const handleSaveVariantForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProductId) {
      alert('Pilih Master Produk Jadi terlebih dahulu.');
      return;
    }

    const finalBarcode = varBarcode.trim() || generateEAN13();

    const variantData: ProductVariant = {
      id: editingVariant ? editingVariant.id : `var-${Date.now()}`,
      productId: targetProductId,
      variantCode: varCode.trim().toUpperCase(),
      sku: varCode.trim().toUpperCase(),
      variantName: varName.trim() || `${varNetVolume} ${varUnit.split(' ')[0]}`,
      status: editingVariant?.status || 'active',
      netVolumeGrams: Number(varNetVolume) || 0,
      bulkFormulaCode: varFormulaCode || (formulations.length > 0 ? formulations[0].code : ''),
      packagingBom: varPackagingBom,
      bpomNumber: varBpom.trim(),
      barcode: finalBarcode,
      description: varDesc.trim(),
      createdAt: editingVariant?.createdAt || new Date().toISOString(),
    };

    onSaveVariant(targetProductId, variantData);
    setShowVariantModal(false);
    setSuccessToast(`Varian "${variantData.variantName}" (${variantData.sku}) berhasil disimpan!`);
    setTimeout(() => setSuccessToast(null), 5000);
  };

  const filteredProducts = products.filter((p) => {
    // 1. Filter Tab EXP NA < 6 Bulan
    if (activeExpFilterTab === 'expiring_soon') {
      const expInfo = getBpomExpInfo(p);
      if (!expInfo.isAttentionNeeded) return false;
    }

    const query = searchQuery.toLowerCase();
    const matchParent =
      p.code.toLowerCase().includes(query) ||
      p.name.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      (p.bpomNotificationNumber && p.bpomNotificationNumber.toLowerCase().includes(query)) ||
      (p.expNotificationDate && p.expNotificationDate.toLowerCase().includes(query));

    const matchVariant = p.variants.some(
      (v) =>
        v.variantCode.toLowerCase().includes(query) ||
        v.variantName.toLowerCase().includes(query) ||
        (v.bpomNumber && v.bpomNumber.toLowerCase().includes(query)) ||
        (v.barcode && v.barcode.toLowerCase().includes(query)) ||
        (v.sku && v.sku.toLowerCase().includes(query))
    );

    return matchParent || matchVariant;
  });

  const totalVariantsCount = products.reduce((sum, p) => sum + p.variants.length, 0);

  // Pagination Calculations (Default 50 per page)
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredProducts.length);
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notifikasi Sukses */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
        </div>
      )}

      {/* READ-ONLY BANNER IF USER IS RESTRICTED */}
      {!canWrite && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-amber-800">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="text-xs leading-relaxed">
              <span className="font-bold">Mode Akses Terbatas (Read-Only):</span> Anda memiliki hak akses baca khusus R&D. Tindakan penambahan, pengubahan, dan penghapusan produk jadi & varian dinonaktifkan demi integritas CPKB.
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-200/80 text-amber-900 uppercase">
            Hanya Lihat
          </span>
        </div>
      )}

      {/* Supabase Schema Helper Banner */}
      {dbStatus?.configured && !dbStatus?.ready && (
        <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-900">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-bold block text-indigo-950">Inisialisasi Tabel Supabase (products & product_variants):</span>
              Tabel database Supabase belum terdeteksi di schema cache. Data sesi aktif tetap berjalan normal di memori tanpa menyentuh local storage. Jalankan skrip SQL di Supabase SQL Editor untuk sinkronisasi database cloud permanen.
            </div>
          </div>
          <button
            onClick={() => setShowQAModal(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer self-start sm:self-center"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Lihat Skrip SQL</span>
          </button>
        </div>
      )}

      {/* FILTER TABS: Semua Produk vs Peringatan EXP NA (< 6 Bulan) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveExpFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeExpFilterTab === 'all'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Semua Produk Jadi</span>
            <span
              className={`px-1.5 py-0.25 rounded-full text-[10px] font-mono font-bold ${
                activeExpFilterTab === 'all'
                  ? 'bg-purple-900/40 text-purple-100'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveExpFilterTab('expiring_soon')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeExpFilterTab === 'expiring_soon'
                ? 'bg-amber-600 text-white shadow-2xs'
                : expiringSoonCount > 0
                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                activeExpFilterTab === 'expiring_soon'
                  ? 'text-white'
                  : expiringSoonCount > 0
                  ? 'text-amber-600'
                  : 'text-slate-400'
              }`}
            />
            <span>Peringatan EXP NA (&lt; 6 Bulan)</span>
            <span
              className={`px-1.5 py-0.25 rounded-full text-[10px] font-mono font-bold ${
                activeExpFilterTab === 'expiring_soon'
                  ? 'bg-amber-800/50 text-white'
                  : expiringSoonCount > 0
                  ? 'bg-amber-200 text-amber-900'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {expiringSoonCount}
            </span>
          </button>
        </div>

        {activeExpFilterTab === 'expiring_soon' && (
          <div className="text-[10px] font-medium text-amber-800 flex items-center gap-1 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600 shrink-0" />
            <span>Kriteria: Masa berlaku izin edar BPOM &le; 180 hari atau telah lewat tanggal</span>
          </div>
        )}
      </div>

      {/* Info Alert jika tab EXP NA aktif */}
      {activeExpFilterTab === 'expiring_soon' && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 flex items-start gap-2 text-slate-700">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-snug">
            <span className="font-bold text-amber-950 block mb-0.5">
              Monitoring Notifikasi Izin Edar BPOM RI (Kepatuhan Regulasi Kosmetika):
            </span>
            Menampilkan <span className="font-bold text-amber-900">{filteredProducts.length} produk</span> yang memiliki masa berlaku nomor notifikasi BPOM (NA) kurang dari 6 bulan atau sudah kedaluwarsa.
          </div>
        </div>
      )}

      {/* Top Action & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode PJ0001, nama produk, brand..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600 shadow-2xs"
          />
        </div>

        {canWrite && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Import produk dari file Excel atau salin data"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Import Excel</span>
            </button>

            <button
              onClick={handleOpenAddProduct}
              className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Produk Jadi</span>
            </button>

            <button
              onClick={() => handleOpenAddVariant()}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Tambah Varian Produk Baru"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Tambah Varian</span>
            </button>

            <button
              onClick={handleRunQA}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-purple-50 text-purple-700 transition-all cursor-pointer shadow-2xs"
              title="Jalankan QA Automation Supabase"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>

            {products.length > 0 && onClearAllProducts && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('PERINGATAN: Apakah Anda yakin ingin MENGOSONGKAN SELURUH DATA PRODUK JADI dan varian di database Supabase? Tindakan ini akan menghapus semua data produk secara permanen.')) {
                    onClearAllProducts();
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-bold text-red-600 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
                title="Hapus seluruh data produk jadi dari database Supabase"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kosongkan Database</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info Callout for 1 Product Code -> Multi Variants */}
      <div className="bg-purple-50/60 border border-purple-200/80 rounded-xl p-2.5 flex items-center gap-2 text-slate-700">
        <Boxes className="w-4 h-4 text-purple-700 shrink-0" />
        <div className="text-[11px] leading-snug">
          <span className="font-bold text-purple-900">
            Hirarki Produk Jadi:
          </span> Satu Kode Produk (<span className="font-mono font-bold text-purple-800">PJ0001</span>) memayungi varian ukuran/kemasan (<span className="font-mono font-bold text-purple-800">PJ0001-V1</span>) terikat Formula Bulk & BOM Kemasan.
        </div>
      </div>

      {/* Products List & Variants Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <PackageCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">Tidak ada produk jadi ditemukan</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {activeExpFilterTab === 'expiring_soon'
                ? 'Tidak ada produk yang memiliki masa berlaku BPOM kurang dari 6 bulan.'
                : 'Gunakan tombol "Tambah Produk Jadi" untuk membuat master produk baru.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2 px-2.5 w-10 text-center">No</th>
                  <th className="py-2 px-3 w-24">Kode PJ</th>
                  <th className="py-2 px-3 min-w-[200px]">Nama Produk Jadi & Brand</th>
                  <th className="py-2 px-3 w-40">Kategori & Sediaan</th>
                  <th className="py-2 px-3 min-w-[170px]">No. Notifikasi BPOM</th>
                  <th className="py-2 px-3 w-32 text-center">Varian</th>
                  <th className="py-2 px-3 w-36 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {paginatedProducts.map((prod, relativeIdx) => {
                  const absoluteNumber = startIndex + relativeIdx + 1;
                  const expInfo = getBpomExpInfo(prod);
                  return (
                    <tr key={prod.id} className="hover:bg-purple-50/20 transition-colors">
                      <td className="py-1.5 px-2.5 text-center font-mono font-bold text-slate-400 text-[11px]">
                        {absoluteNumber}
                      </td>
                      <td className="py-1.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleOpenDetailProduct(prod)}
                          className="font-mono font-bold text-[11px] text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 px-1.5 py-0.5 rounded border border-purple-200 inline-block transition-all cursor-pointer text-left"
                          title="Klik untuk melihat detail produk jadi"
                        >
                          {prod.code}
                        </button>
                      </td>
                      <td className="py-1.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleOpenDetailProduct(prod)}
                          className="font-extrabold text-slate-900 text-xs hover:text-purple-700 transition-colors text-left block cursor-pointer"
                          title="Klik untuk melihat detail produk jadi"
                        >
                          {prod.name}
                        </button>
                        <div className="flex items-center gap-1.5 mt-0.25">
                          <span className="text-[10px] font-bold text-purple-700">
                            {prod.brand}
                          </span>
                          {prod.description && (
                            <span className="text-[10px] text-slate-400 truncate max-w-xs hidden sm:inline">
                              • {prod.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3">
                        <span className="px-1.5 py-0.25 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 inline-block">
                          {prod.category}
                        </span>
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="space-y-0.5">
                          {prod.bpomNotificationNumber ? (
                            <div className="font-mono text-[10px] font-bold text-slate-800 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{prod.bpomNotificationNumber}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Belum ada No. BPOM</span>
                          )}

                          {/* Status Masa Berlaku Notifikasi BPOM */}
                          {expInfo.hasDate ? (
                            expInfo.status === 'expired' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.25 rounded text-[9px] font-bold bg-rose-50 border border-rose-200 text-rose-700">
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                <span>Kedaluwarsa ({Math.abs(expInfo.daysLeft!)} hari lalu)</span>
                              </span>
                            ) : expInfo.status === 'expiring_soon' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.25 rounded text-[9px] font-bold bg-amber-50 border border-amber-300 text-amber-900 animate-pulse">
                                <Clock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                <span>Sisa {expInfo.daysLeft} hari (EXP: {expInfo.dateFormatted})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                                <Calendar className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                <span>Exp: {expInfo.dateFormatted}</span>
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400 italic block">
                              Tgl exp NA belum diisi
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setViewingProductVariants(prod)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300 border-purple-200 shadow-2xs"
                          title="Klik untuk membuka popup rincian varian produk"
                        >
                          <Layers className="w-3 h-3" />
                          <span>{prod.variants.length} Varian</span>
                        </button>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canWrite && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenAddVariant(prod)}
                                className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title="Tambah Varian Ukuran/Kemasan"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Varian</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditProduct(prod)}
                                className="p-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                                title="Edit Master Produk Jadi"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setItemToDelete({
                                    type: 'product',
                                    id: prod.id,
                                    name: prod.name,
                                    code: prod.code,
                                  });
                                  setDeletePassword('');
                                  setDeletePasswordError(null);
                                }}
                                className="p-1 rounded border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-600 transition-colors cursor-pointer"
                                title="Hapus Master Produk Jadi"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* BAR PAGINASI MASTER PRODUK JADI */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              {/* Ukuran Halaman & Counter Data */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">Tampilkan:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
                  >
                    <option value={10}>10 per halaman</option>
                    <option value={25}>25 per halaman</option>
                    <option value={50}>50 per halaman (Default)</option>
                    <option value={100}>100 per halaman</option>
                    <option value={200}>200 per halaman</option>
                    <option value={500}>500 per halaman</option>
                  </select>
                </div>
                <span className="text-slate-300 font-mono hidden sm:inline">|</span>
                <span className="text-[11px] font-semibold text-slate-700">
                  Menampilkan <span className="font-bold text-purple-700">{filteredProducts.length === 0 ? 0 : startIndex + 1}</span> - <span className="font-bold text-purple-700">{endIndex}</span> dari <span className="font-bold text-slate-900">{filteredProducts.length}</span> Master Produk Jadi
                </span>
              </div>

              {/* Tombol Kontrol Navigasi Halaman */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  title="Halaman Pertama"
                >
                  &laquo;
                </button>

                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  title="Halaman Sebelumnya"
                >
                  &lsaquo; Sblm
                </button>

                {/* Badge Indikator Halaman */}
                <span className="px-3 py-1 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-xs font-bold font-mono">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  title="Halaman Berikutnya"
                >
                  Slanj &rsaquo;
                </button>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  title="Halaman Terakhir"
                >
                  &raquo;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Tambah/Edit Produk Jadi (PJ0001) */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl p-6 shadow-2xl text-slate-800 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-purple-600" />
                <span>{editingProduct ? 'Edit Master Produk Jadi' : 'Tambah Master Produk Jadi (PJ)'}</span>
              </h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProductForm} className="space-y-6">
              
              {/* DATA IDENTITAS MASTER PRODUK */}
              <div className="border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 mb-4 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-purple-600 block"></span>
                  Data Identitas Master Produk
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Kode Produk & Nama Produk */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Kode Produk <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={prodCode}
                      onChange={(e) => setProdCode(e.target.value)}
                      placeholder="PJ0001"
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                    <span className="text-[9px] text-slate-400 mt-1 block">Format: PJ0001, PJ0002...</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Nama Produk <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      placeholder="Contoh: Larassanti Sunscreen Cream SPF 50 PA+++ 30g"
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>

                  {/* Kategori & Brand/Merk */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Kategori Sediaan Produk <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value)}
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    >
                      <option value="Cream / Krim">Cream / Krim</option>
                      <option value="Liquid / Cairan">Liquid / Cairan</option>
                      <option value="Gel">Gel</option>
                      <option value="Powder / Serbuk">Powder / Serbuk</option>
                      <option value="Kapsul">Kapsul</option>
                      <option value="Skincare - Facial Treatment">Skincare - Facial Treatment</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                      <span className="text-blue-600"><Boxes className="w-3 h-3" /></span>
                      Brand/Merk <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={prodBrand}
                      onChange={(e) => setProdBrand(e.target.value)}
                      placeholder="PT. LARASSANTI MAKMUR SEJAHTERA"
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-900 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 uppercase"
                    />
                  </div>

                  {/* Satuan & Kondisi Penyimpanan */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Satuan Standar (Unit)
                    </label>
                    <select
                      value={prodUnit}
                      onChange={(e) => setProdUnit(e.target.value)}
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    >
                      <option value="pcs (Pieces)">pcs (Pieces)</option>
                      <option value="tube">tube</option>
                      <option value="botol">botol</option>
                      <option value="box">box</option>
                      <option value="jar">jar</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Kondisi Penyimpanan Standar
                    </label>
                    <input
                      type="text"
                      value={prodStorage}
                      onChange={(e) => setProdStorage(e.target.value)}
                      placeholder="Suhu Ruang (15-25°C), Kering, Bebas Cahaya Langsung"
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      No Notifikasi (BPOM)
                    </label>
                    <input
                      type="text"
                      value={prodBpomNo}
                      onChange={(e) => setProdBpomNo(e.target.value)}
                      placeholder="Contoh: NA18220100123"
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-purple-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      EXP Notifikasi (Tanggal Kadaluarsa)
                    </label>
                    <input
                      type="date"
                      value={prodBpomExt}
                      onChange={(e) => setProdBpomExt(e.target.value)}
                      className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>
                </div>
              </div>

               {/* BAGIAN 1: SPESIFIKASI SEDIAAN RUAHAN (BULK SPECS) */}
               <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/30">
                 <div className="flex items-center justify-between mb-4">
                   <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                     <FlaskConical className="w-4 h-4 text-purple-600" />
                     <span>Bagian 1: Spesifikasi Sediaan Ruahan (Bulk) ({prodQcParams.length} Parameter)</span>
                   </h4>
                   <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md font-semibold">Acuan Menu 2.1 IPC Ruahan</span>
                 </div>

                 <div className="space-y-3 mb-4">
                   {prodQcParams.map((param, index) => (
                     <div key={param.id} className="flex items-center justify-between border border-slate-200/80 rounded-xl p-3 bg-white shadow-xs">
                       <div className="flex items-start gap-3">
                         <span className="text-xs font-bold text-slate-400 w-5">{index + 1}.</span>
                         <div>
                           <div className="text-xs font-bold text-slate-800">{param.parameterName || param.name}</div>
                           <div className="text-[10px] text-purple-700 font-medium">Syarat: {param.acceptanceCondition || param.specification} {param.unit}</div>
                         </div>
                       </div>
                       <button
                         type="button"
                         onClick={() => setProdQcParams(prodQcParams.filter(p => p.id !== param.id))}
                         className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                   ))}
                   {prodQcParams.length === 0 && (
                     <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                       Belum ada parameter ruahan.
                     </div>
                   )}
                 </div>

                 <div className="border border-slate-200 rounded-xl p-3.5 bg-white">
                   <h5 className="text-[10px] font-bold text-slate-700 mb-2.5">+ Tambah Parameter Ruahan Baru:</h5>
                   <div className="space-y-2.5">
                     <input
                       type="text"
                       value={newProdQcName}
                       onChange={(e) => setNewProdQcName(e.target.value)}
                       placeholder="Nama Parameter (cth: pH / Viskositas / Bobot Jenis)"
                       className="w-full rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:border-purple-600"
                     />
                     <div className="flex items-center gap-2">
                       <input
                         type="text"
                         value={newProdQcCondition}
                         onChange={(e) => setNewProdQcCondition(e.target.value)}
                         placeholder="Standar Syarat (cth: 6.0 - 6.8)"
                         className="flex-1 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:border-purple-600"
                       />
                       <input
                         type="text"
                         value={newProdQcUnit}
                         onChange={(e) => setNewProdQcUnit(e.target.value)}
                         placeholder="Satuan (cth: cPs / g/ml)"
                         className="w-28 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:border-purple-600"
                       />
                       <button
                         type="button"
                         onClick={() => {
                           if (newProdQcName && newProdQcCondition) {
                             setProdQcParams([
                               ...prodQcParams,
                               {
                                 id: `qc-${Date.now()}`,
                                 parameterName: newProdQcName,
                                 acceptanceCondition: newProdQcCondition,
                                 unit: newProdQcUnit,
                               }
                             ]);
                             setNewProdQcName('');
                             setNewProdQcCondition('');
                             setNewProdQcUnit('');
                           }
                         }}
                         disabled={!newProdQcName || !newProdQcCondition}
                         className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                       >
                         + Tambah
                       </button>
                     </div>
                   </div>
                 </div>
               </div>

               {/* BAGIAN 2: SPESIFIKASI PRODUK JADI (FINISHED GOODS SPECS) */}
               <div className="border border-slate-200 rounded-2xl p-5 bg-indigo-50/20">
                 <div className="flex items-center justify-between mb-4">
                   <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                     <PackageCheck className="w-4 h-4 text-indigo-600" />
                     <span>Bagian 2: Spesifikasi Produk Jadi / Kemasan ({prodFinishedParams.length} Parameter)</span>
                   </h4>
                   <span className="text-[10px] text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md font-semibold">Acuan Menu 2.2 IPC Produk Jadi</span>
                 </div>

                 <div className="space-y-3 mb-4">
                   {prodFinishedParams.map((param, index) => (
                     <div key={param.id} className="flex items-center justify-between border border-slate-200/80 rounded-xl p-3 bg-white shadow-xs">
                       <div className="flex items-start gap-3">
                         <span className="text-xs font-bold text-slate-400 w-5">{index + 1}.</span>
                         <div>
                           <div className="text-xs font-bold text-slate-800">{param.parameterName || param.name}</div>
                           <div className="text-[10px] text-indigo-700 font-medium">Syarat: {param.acceptanceCondition || param.specification} {param.unit}</div>
                         </div>
                       </div>
                       <button
                         type="button"
                         onClick={() => setProdFinishedParams(prodFinishedParams.filter(p => p.id !== param.id))}
                         className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                   ))}
                   {prodFinishedParams.length === 0 && (
                     <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                       Belum ada parameter produk jadi.
                     </div>
                   )}
                 </div>

                 <div className="border border-slate-200 rounded-xl p-3.5 bg-white">
                   <h5 className="text-[10px] font-bold text-slate-700 mb-2.5">+ Tambah Parameter Produk Jadi Baru:</h5>
                   <div className="space-y-2.5">
                     <input
                       type="text"
                       value={newProdFinishedName}
                       onChange={(e) => setNewProdFinishedName(e.target.value)}
                       placeholder="Nama Parameter (cth: Berat Netto / Uji Kebocoran Sealing / Torsi Tutup)"
                       className="w-full rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-600"
                     />
                     <div className="flex items-center gap-2">
                       <input
                         type="text"
                         value={newProdFinishedCondition}
                         onChange={(e) => setNewProdFinishedCondition(e.target.value)}
                         placeholder="Standar Syarat (cth: 30 ± 0.5 / Tidak Bocor / 12-18)"
                         className="flex-1 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-600"
                       />
                       <input
                         type="text"
                         value={newProdFinishedUnit}
                         onChange={(e) => setNewProdFinishedUnit(e.target.value)}
                         placeholder="Satuan (cth: gram / kg.cm)"
                         className="w-28 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-600"
                       />
                       <button
                         type="button"
                         onClick={() => {
                           if (newProdFinishedName && newProdFinishedCondition) {
                             setProdFinishedParams([
                               ...prodFinishedParams,
                               {
                                 id: `fin-${Date.now()}`,
                                 parameterName: newProdFinishedName,
                                 acceptanceCondition: newProdFinishedCondition,
                                 unit: newProdFinishedUnit,
                               }
                             ]);
                             setNewProdFinishedName('');
                             setNewProdFinishedCondition('');
                             setNewProdFinishedUnit('');
                           }
                         }}
                         disabled={!newProdFinishedName || !newProdFinishedCondition}
                         className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                       >
                         + Tambah
                       </button>
                     </div>
                   </div>
                 </div>
               </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-sm transition-colors cursor-pointer"
                >
                  Simpan Master Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah/Edit Varian Produk (Sesuai Gambar Desain) */}
      {showVariantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl p-6 sm:p-7 shadow-2xl text-slate-800 relative max-h-[92vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-5">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2.5">
                <Tag className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{editingVariant ? 'Edit Varian Produk' : 'Tambah Varian Produk'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowVariantModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVariantForm} className="space-y-4">
              {/* Field 1: Pilih Master Produk Jadi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih Master Produk Jadi <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={targetProductId || ''}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setTargetProductId(pid);
                    const sel = products.find((p) => p.id === pid);
                    if (sel && !editingVariant) {
                      const unitAbbr = varUnit.startsWith('ml') ? 'ML' : varUnit.startsWith('kg') ? 'KG' : varUnit.startsWith('l') ? 'L' : 'G';
                      setVarCode(`${sel.code}-${varNetVolume}${unitAbbr}`);
                      if (!varName) {
                        setVarName(`${varNetVolume} ${varUnit.split(' ')[0]}`);
                      }
                    }
                  }}
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 font-medium"
                >
                  <option value="">-- Pilih Master Produk --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Master produk berasal dari tabel <code className="font-mono text-slate-500">materials_produk_jadi</code>.
                </p>
              </div>

              {/* Field 2: Jumlah Bobot / Ukuran & Satuan */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Jumlah Bobot / Ukuran <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0.1}
                    step="any"
                    value={varNetVolume}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVarNetVolume(val);
                      const num = Number(val) || 0;
                      const sel = products.find((p) => p.id === targetProductId);
                      if (sel && !editingVariant) {
                        const unitAbbr = varUnit.startsWith('ml') ? 'ML' : varUnit.startsWith('kg') ? 'KG' : varUnit.startsWith('l') ? 'L' : 'G';
                        setVarCode(`${sel.code}-${num}${unitAbbr}`);
                        setVarName(`${num} ${varUnit.split(' ')[0]}`);
                      }
                    }}
                    placeholder="30"
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Satuan
                  </label>
                  <select
                    value={varUnit}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVarUnit(val);
                      const num = Number(varNetVolume) || 0;
                      const sel = products.find((p) => p.id === targetProductId);
                      if (sel && !editingVariant) {
                        const unitAbbr = val.startsWith('ml') ? 'ML' : val.startsWith('kg') ? 'KG' : val.startsWith('l') ? 'L' : 'G';
                        setVarCode(`${sel.code}-${num}${unitAbbr}`);
                        setVarName(`${num} ${val.split(' ')[0]}`);
                      }
                    }}
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 font-medium"
                  >
                    <option value="g (gram)">g (gram)</option>
                    <option value="ml (mililiter)">ml (mililiter)</option>
                    <option value="kg (kilogram)">kg (kilogram)</option>
                    <option value="l (liter)">l (liter)</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>

              {/* Field 3: Kode Varian & Nama Varian (Label Display) */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kode Varian <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={varCode}
                    onChange={(e) => setVarCode(e.target.value)}
                    placeholder="PJ0001-30G"
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nama Varian (Label Display) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={varName}
                    onChange={(e) => setVarName(e.target.value)}
                    placeholder="30 g"
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Field: Hubungkan ke Formula Bulk (Bulk Formulation) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Formula Bulk Ruahan (R&D Formulation) <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <select
                  value={varFormulaCode}
                  onChange={(e) => setVarFormulaCode(e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 font-medium"
                >
                  <option value="">-- Tidak Dihubungkan ke Formula Spesifik --</option>
                  {formulations.map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.code} - {f.productName} ({f.status})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Menentukan formula ruahan (bulk) yang akan diisikan (filling) ke dalam varian kemasan ini saat SPK Produksi dibuat.
                </p>
              </div>

              {/* Field: Bill of Materials (BOM) Kemasan */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-purple-700" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Bill of Materials (BOM) Kemasan
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-purple-700 bg-purple-100/60 px-2 py-0.5 rounded-md border border-purple-200">
                    {varPackagingBom.length} Komponen
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Tentukan komponen kemasan (primer, sekunder, tersier) dan kuantitas per 1 unit varian jadi. Data ini menjadi acuan otomatis modul Gudang &amp; SPK Pengemasan.
                </p>

                {/* Form Input Item BOM Baru */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3 shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Pilih Bahan Kemas
                      </label>
                      <select
                        value={newPackCode}
                        onChange={(e) => setNewPackCode(e.target.value)}
                        className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-purple-600 font-medium"
                      >
                        <option value="">-- Pilih Bahan Kemas --</option>
                        {packagingMaterials.map((pm) => (
                          <option key={pm.code} value={pm.code}>
                            {pm.code} - {pm.name} ({pm.unit || 'pcs'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Tingkat Kemas
                      </label>
                      <select
                        value={newPackType}
                        onChange={(e) => setNewPackType(e.target.value as any)}
                        className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-purple-600 font-medium"
                      >
                        <option value="primary">Primer (Botol/Jar/Tube)</option>
                        <option value="secondary">Sekunder (Dus/Label/Sticker)</option>
                        <option value="tertiary">Tersier (Karton Master/Shrink)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Qty / Unit
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          value={newPackQty}
                          onChange={(e) => setNewPackQty(e.target.value)}
                          placeholder="1"
                          className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-purple-600"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!newPackCode) {
                              alert('Pilih bahan kemas terlebih dahulu.');
                              return;
                            }
                            const qty = Number(newPackQty) || 1;
                            const existingIndex = varPackagingBom.findIndex((b) => b.packagingCode === newPackCode);
                            if (existingIndex >= 0) {
                              const updated = [...varPackagingBom];
                              updated[existingIndex] = {
                                packagingCode: newPackCode,
                                quantityPerUnit: qty,
                                type: newPackType,
                              };
                              setVarPackagingBom(updated);
                            } else {
                              setVarPackagingBom([
                                ...varPackagingBom,
                                {
                                  packagingCode: newPackCode,
                                  quantityPerUnit: qty,
                                  type: newPackType,
                                },
                              ]);
                            }
                            setNewPackCode('');
                            setNewPackQty(1);
                          }}
                          disabled={!newPackCode}
                          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Tambahkan ke daftar BOM Kemasan"
                        >
                          + Tambah
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabel List BOM Kemasan Terdaftar */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {varPackagingBom.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 italic">
                      Belum ada komponen kemasan diatur untuk varian ini.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                        <tr>
                          <th className="py-2 px-3">Bahan Kemas</th>
                          <th className="py-2 px-3 w-28">Tingkat</th>
                          <th className="py-2 px-3 w-24 text-right">Kebutuhan</th>
                          <th className="py-2 px-2.5 w-10 text-center">Hapus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {varPackagingBom.map((item, idx) => {
                          const mat = packagingMaterials.find((m) => m.code === item.packagingCode);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3">
                                <span className="font-mono font-bold text-purple-700 mr-1.5">
                                  {item.packagingCode}
                                </span>
                                <span className="font-medium text-slate-800">
                                  {mat ? mat.name : item.packagingCode}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    item.type === 'primary'
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                      : item.type === 'secondary'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {item.type === 'primary' ? 'Primer' : item.type === 'secondary' ? 'Sekunder' : 'Tersier'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                {item.quantityPerUnit} {mat?.unit || 'pcs'}
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVarPackagingBom(varPackagingBom.filter((_, bIdx) => bIdx !== idx));
                                  }}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Hapus komponen kemasan ini"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Field 4: Barcode / EAN-13 Standard (13 Digit) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Barcode / EAN-13 Standard (13 Digit)
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateEan13}
                    className="text-xs font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Generate EAN-13 Otomatis</span>
                  </button>
                </div>
                <div className="relative">
                  <Barcode className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={varBarcode}
                    onChange={(e) => setVarBarcode(e.target.value)}
                    placeholder="8993219584725"
                    className="w-full rounded-xl bg-white border border-slate-300 pl-10 pr-3.5 py-2.5 text-xs font-mono tracking-wider font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                  Format standar GS1 Indonesia (prefix 899...). Jika dikosongkan, sistem akan otomatis menghasilkan barcode unik 13-digit valid.
                </p>
              </div>

              {/* Field 5: Keterangan / Deskripsi Kemasan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Keterangan / Deskripsi Kemasan
                </label>
                <textarea
                  value={varDesc}
                  onChange={(e) => setVarDesc(e.target.value)}
                  placeholder="Kemasan Dropper Bottle 30g..."
                  rows={3}
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 resize-none font-medium"
                />
              </div>

              {/* Footer Tombol Aksi */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVariantModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  Simpan Varian
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KONFIRMASI DELETE DENGAN PASSWORD USER AKTIF      */}
      {/* ======================================================== */}
      {itemToDelete && (
        <div className="fixed inset-0 z-60 overflow-y-auto flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => !isVerifyingDeletePassword && setItemToDelete(null)}
          ></div>

          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Close */}
            <button
              type="button"
              disabled={isVerifyingDeletePassword}
              onClick={() => setItemToDelete(null)}
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
                  Konfirmasi Hapus {itemToDelete.type === 'product' ? 'Produk Jadi' : 'Varian Produk'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Otorisasi Keamanan CPKB & Jejak Audit
                </p>
              </div>
            </div>

            {/* Detail Item Info */}
            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl mb-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Kode:</span>
                <span className="font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-xs">
                  {itemToDelete.code}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Nama:</span>
                <span className="font-bold text-slate-800 text-right max-w-[200px] truncate">
                  {itemToDelete.name}
                </span>
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
                      handleConfirmDelete();
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
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isVerifyingDeletePassword || !deletePassword.trim()}
                onClick={handleConfirmDelete}
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

      {/* Modal: Import Excel & Drag & Drop */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl p-6 shadow-2xl text-slate-800 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-purple-600" />
                Import Data Produk & Varian (Excel / Spreadsheet)
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Navigation: Master Produk Jadi vs Varian Produk */}
            <div className="flex border-b border-slate-200 mb-4 gap-2">
              <button
                type="button"
                onClick={() => setImportTab('products')}
                className={`pb-2.5 px-3 sm:px-4 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  importTab === 'products'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <PackageCheck className="w-4 h-4" />
                <span>1. Master Produk Jadi</span>
              </button>
              <button
                type="button"
                onClick={() => setImportTab('variants')}
                className={`pb-2.5 px-3 sm:px-4 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  importTab === 'variants'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Tag className="w-4 h-4" />
                <span>2. Varian Produk (SKU / Kemasan)</span>
              </button>
            </div>

            {importTab === 'products' ? (
              <div className="space-y-4">
                <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-4 text-xs text-purple-900 leading-relaxed">
                  <span className="font-bold block mb-1">Panduan Import Master Produk Jadi:</span>
                  • Data Master Produk tersimpan pada tabel database <code className="font-mono font-bold">products</code>.<br />
                  • Kolom template: <code className="font-mono text-[11px]">Kode Produk (PJxxxx), Nama Produk, Kategori, Brand / Merk, Deskripsi, No Notifikasi BPOM</code>.<br />
                  • Pastikan baris data memiliki Kode Produk unik.
                </div>

                {/* Download Template Master Produk */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Template Master Produk Jadi</div>
                    <div className="text-[10px] text-slate-500">Unduh file contoh Excel untuk master produk jadi.</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Template</span>
                  </button>
                </div>

                {/* Drag & Drop Zone Master Produk */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) processExcelFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                    isDragging ? 'border-purple-500 bg-purple-50/50 scale-[1.01]' : 'border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/20'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) processExcelFile(file);
                    }}
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 mb-1">
                      Drag & Drop file Excel Master Produk ke sini atau <span className="text-purple-600 underline">Browse File</span>
                    </div>
                    <div className="text-[10px] text-slate-400">Mendukung format .xlsx, .xls, atau .csv</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Switcher Metode Import Varian */}
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setImportMethod('file')}
                    className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      importMethod === 'file'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Upload File Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMethod('paste')}
                    className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      importMethod === 'paste'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin & Tempel (Paste Spreadsheet)</span>
                  </button>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 text-xs text-emerald-900 leading-relaxed">
                  <span className="font-bold block mb-1">Panduan Import Varian Produk:</span>
                  • Varian akan otomatis dihubungkan ke Produk Jadi berdasarkan <code className="font-mono font-bold">Kode Produk Induk</code> (misal: <code className="font-mono">PJ0001</code>).<br />
                  • Kolom berurutan: <code className="font-mono text-[11px]">Kode Produk Induk | Kode Varian/SKU | Nama Varian | Netto | Satuan | Barcode | Keterangan Kemasan</code>.<br />
                  • Jika varian sudah ada pada kode produk yang sama, data varian akan diperbarui (update).
                </div>

                {importMethod === 'file' ? (
                  <>
                    {/* Download Template Varian */}
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <div>
                        <div className="text-xs font-bold text-slate-800">Template Excel Varian Produk</div>
                        <div className="text-[10px] text-slate-500">Unduh lembar kerja contoh untuk import varian.</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadVariantTemplate}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Template Varian</span>
                      </button>
                    </div>

                    {/* Drag & Drop Zone Varian */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) processVariantExcelFile(file);
                      }}
                      onClick={() => variantFileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                        isDragging ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]' : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50 hover:bg-emerald-50/20'
                      }`}
                    >
                      <input
                        type="file"
                        ref={variantFileInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) processVariantExcelFile(file);
                        }}
                        accept=".xlsx, .xls, .csv"
                        className="hidden"
                      />
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 mb-1">
                          Drag & Drop file Excel Varian ke sini atau <span className="text-emerald-600 underline">Browse File</span>
                        </div>
                        <div className="text-[10px] text-slate-400">Mendukung format .xlsx, .xls, atau .csv</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="font-semibold">Tempelkan baris data dari Excel / Google Sheets:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = `PJ0001\tPJ0001-30G\t30 g\t30\tg\t8993219584725\tBotol Dropper 30ml
PJ0001\tPJ0001-60G\t60 g\t60\tg\t8993219584732\tBotol Pump 60ml`;
                          setPasteText(sample);
                        }}
                        className="text-[11px] text-emerald-700 hover:underline font-bold cursor-pointer"
                      >
                        + Isi Contoh Data
                      </button>
                    </div>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={`PJ0001\tPJ0001-30G\t30 g\t30\tg\t8993219584725\tBotol Dropper 30ml\nPJ0001\tPJ0001-60G\t60 g\t60\tg\t8993219584732\tBotol Pump 60ml`}
                      rows={6}
                      className="w-full p-3 font-mono text-xs border border-slate-300 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Pemisah kolom otomatis dideteksi (Tab atau titik koma).
                      </span>
                      <button
                        type="button"
                        onClick={handleProcessPastedVariants}
                        disabled={!pasteText.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <Check className="w-4 h-4" />
                        <span>Proses & Simpan Varian</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: QA Automation Test Runner */}
      {showQAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl p-6 shadow-2xl text-slate-800 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">QA Automation: Input Produk & Supabase</h3>
                  <p className="text-[11px] text-slate-500">Pengujian otomatis skema tabel, penyimpanan Supabase, dan bebas local storage.</p>
                </div>
              </div>
              <button
                onClick={() => setShowQAModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status Header */}
            <div className="mb-4">
              {isTestingQA ? (
                <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex items-center gap-3 text-purple-800 text-xs font-bold animate-pulse">
                  <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
                  <span>Sedang menjalankan 4 paket uji QA automation untuk Master Produk & Varian...</span>
                </div>
              ) : qaReport ? (
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  qaReport.allPassed 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  <div className="flex items-center gap-2.5">
                    {qaReport.allPassed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-extrabold">
                        {qaReport.allPassed ? 'SEMUA TES QA BERHASIL LOLOS (100% PASSED)' : 'BEBERAPA TES QA TIDAK LOLOS'}
                      </div>
                      <div className="text-[11px] opacity-85 font-medium">{qaReport.summary}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleRunQA}
                    disabled={isTestingQA}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
                    <span>Uji Ulang</span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* Test Results Breakdown */}
            {qaReport && (
              <div className="space-y-3 mb-6">
                <div className="text-xs font-extrabold text-slate-700 flex items-center justify-between">
                  <span>Hasil Rincian Kasus Uji Otomatis:</span>
                  <span className="text-[11px] font-medium text-slate-400">Total: {qaReport.results.length} Kasus Uji</span>
                </div>
                {qaReport.results.map((test) => (
                  <div
                    key={test.testId}
                    className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-mono text-[10px] font-bold">
                          {test.testId}
                        </span>
                        <span className="text-xs font-bold text-slate-800">{test.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">{test.durationMs}ms</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                            test.status === 'PASSED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {test.status === 'PASSED' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {test.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pl-1">{test.details}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Supabase SQL Schema Helper */}
            <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white">Skrip SQL Supabase (products & product_variants)</span>
                </div>
                <button
                  onClick={handleCopySql}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedSql ? 'Tersalin ke Clipboard!' : 'Salin Skrip SQL'}</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                Jalankan skrip ini sekali di <strong className="text-slate-200">Supabase SQL Editor</strong> untuk memastikan tabel <code className="text-purple-300 font-mono">products</code> dan <code className="text-purple-300 font-mono">product_variants</code> beserta foreign key aktif.
              </p>
              <div className="bg-slate-950 p-3 rounded-xl font-mono text-[10px] text-slate-300 max-h-32 overflow-y-auto border border-slate-800/80">
                <div className="text-purple-400">-- Tabel products & product_variants siap dieksekusi</div>
                <div>CREATE TABLE IF NOT EXISTS public.products (id TEXT PRIMARY KEY, product_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, brand TEXT NOT NULL, exp_notification_date DATE, created_at TIMESTAMPTZ DEFAULT now());</div>
                <div className="mt-1">CREATE TABLE IF NOT EXISTS public.product_variants (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, variant_name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'active');</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowQAModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP MODAL: DETAIL PRODUK JADI                                            */}
      {/* ========================================================================= */}
      {activeViewingDetailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-4 sm:p-5 shadow-xl text-slate-800 relative max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0 font-mono font-bold text-xs">
                  {activeViewingDetailProduct.code}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      {activeViewingDetailProduct.name}
                    </h3>
                    <span className="px-2 py-0.25 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                      {activeViewingDetailProduct.brand}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Master Produk Jadi • {activeViewingDetailProduct.category}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingProductDetail(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Tutup Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-3.5">
              {/* Informasi Utama Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Kode Produk Jadi (PJ)
                  </span>
                  <span className="font-mono font-bold text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-block">
                    {activeViewingDetailProduct.code}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Brand / Merek
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {activeViewingDetailProduct.brand}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Kategori & Sediaan
                  </span>
                  <span className="text-xs font-medium text-slate-800">
                    {activeViewingDetailProduct.category}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Satuan Dasar
                  </span>
                  <span className="text-xs font-medium text-slate-800">
                    {activeViewingDetailProduct.unit || 'pcs (Pieces)'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    No. Notifikasi BPOM
                  </span>
                  {activeViewingDetailProduct.bpomNotificationNumber ? (
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{activeViewingDetailProduct.bpomNotificationNumber}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Belum ada izin edar / notifikasi BPOM</span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Masa Berlaku BPOM / Exp Date
                  </span>
                  {(() => {
                    const expInfo = getBpomExpInfo(activeViewingDetailProduct);
                    if (!expInfo.hasDate) {
                      return <span className="text-xs text-slate-400 italic">Belum ditentukan</span>;
                    }
                    if (expInfo.status === 'expired') {
                      return (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-flex">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>Kedaluwarsa ({Math.abs(expInfo.daysLeft!)} hari lalu) • {expInfo.dateFormatted}</span>
                        </div>
                      );
                    }
                    if (expInfo.status === 'expiring_soon') {
                      return (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-300 inline-flex animate-pulse">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Sisa {expInfo.daysLeft} hari (&lt; 6 Bulan) • {expInfo.dateFormatted}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 inline-flex">
                        <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>Berlaku s/d: {expInfo.dateFormatted} ({expInfo.daysLeft} hari)</span>
                      </div>
                    );
                  })()}
                </div>

                <div className="sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Petunjuk / Kondisi Penyimpanan
                  </span>
                  <span className="text-xs text-slate-700">
                    {activeViewingDetailProduct.storageConditions || 'Suhu Ruang (15-25°C), Kering, Bebas Cahaya Langsung'}
                  </span>
                </div>
              </div>

              {/* Deskripsi Produk */}
              <div>
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Deskripsi Produk
                </h4>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                  {activeViewingDetailProduct.description || (
                    <span className="text-slate-400 italic">Tidak ada deskripsi untuk produk ini.</span>
                  )}
                </div>
              </div>

               {/* Parameter QC Ruahan & Produk Jadi */}
               <div className="space-y-4">
                 {/* Bagian 1: Ruahan */}
                 {activeViewingDetailProduct.qcParameters && activeViewingDetailProduct.qcParameters.length > 0 && (
                   <div>
                     <h4 className="text-[11px] font-bold text-purple-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                       <FlaskConical className="w-3.5 h-3.5 text-purple-600" />
                       <span>Bagian 1: Spesifikasi Sediaan Ruahan (Bulk)</span>
                     </h4>
                     <div className="border border-purple-200 rounded-xl overflow-hidden bg-purple-50/20">
                       <table className="w-full text-left text-xs border-collapse">
                         <thead className="bg-purple-100/60 border-b border-purple-200 text-[10px] uppercase font-bold text-purple-900">
                           <tr>
                             <th className="py-1.5 px-2.5">Parameter</th>
                             <th className="py-1.5 px-2.5">Standar Syarat</th>
                             <th className="py-1.5 px-2.5">Satuan</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-purple-100">
                           {activeViewingDetailProduct.qcParameters.map((qc, qIdx) => (
                             <tr key={qIdx}>
                               <td className="py-1.5 px-2.5 font-bold text-slate-800">{qc.name || qc.parameterName}</td>
                               <td className="py-1.5 px-2.5 text-slate-600">{qc.specification || qc.acceptanceCondition}</td>
                               <td className="py-1.5 px-2.5 text-slate-500 font-mono">{qc.unit || '-'}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 )}

                 {/* Bagian 2: Produk Jadi */}
                 {activeViewingDetailProduct.finishedQcParameters && activeViewingDetailProduct.finishedQcParameters.length > 0 && (
                   <div>
                     <h4 className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                       <PackageCheck className="w-3.5 h-3.5 text-indigo-600" />
                       <span>Bagian 2: Spesifikasi Produk Jadi / Kemasan</span>
                     </h4>
                     <div className="border border-indigo-200 rounded-xl overflow-hidden bg-indigo-50/20">
                       <table className="w-full text-left text-xs border-collapse">
                         <thead className="bg-indigo-100/60 border-b border-indigo-200 text-[10px] uppercase font-bold text-indigo-900">
                           <tr>
                             <th className="py-1.5 px-2.5">Parameter</th>
                             <th className="py-1.5 px-2.5">Standar Syarat</th>
                             <th className="py-1.5 px-2.5">Satuan</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-indigo-100">
                           {activeViewingDetailProduct.finishedQcParameters.map((qc, qIdx) => (
                             <tr key={qIdx}>
                               <td className="py-1.5 px-2.5 font-bold text-slate-800">{qc.name || qc.parameterName}</td>
                               <td className="py-1.5 px-2.5 text-slate-600">{qc.specification || qc.acceptanceCondition}</td>
                               <td className="py-1.5 px-2.5 text-slate-500 font-mono">{qc.unit || '-'}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 )}
               </div>

              {/* Ringkasan Varian Produk */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    <span>Varian Terdaftar ({activeViewingDetailProduct.variants.length} Varian)</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const p = activeViewingDetailProduct;
                      setViewingProductDetail(null);
                      setViewingProductVariants(p);
                    }}
                    className="text-xs font-bold text-purple-700 hover:text-purple-800 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Buka Popup Detail Varian</span>
                    <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                </div>

                {activeViewingDetailProduct.variants.length === 0 ? (
                  <div className="p-3 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                    Belum ada varian terdaftar untuk produk ini.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeViewingDetailProduct.variants.map((v) => (
                      <div
                        key={v.id}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.25 rounded border border-purple-100 text-[10px] mr-1">
                            {v.variantCode || v.sku}
                          </span>
                          <span className="font-bold text-slate-800">{v.variantName}</span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold text-slate-600 bg-white px-1.5 py-0.25 rounded border border-slate-200">
                          {v.netVolumeGrams}g / ml
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Modal */}
            <div className="flex items-center justify-between pt-3 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const p = activeViewingDetailProduct;
                  setViewingProductDetail(null);
                  setViewingProductVariants(p);
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Lihat Semua Varian ({activeViewingDetailProduct.variants.length})</span>
              </button>

              <div className="flex items-center gap-1.5">
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => {
                      const prodToEdit = activeViewingDetailProduct;
                      setViewingProductDetail(null);
                      handleOpenEditProduct(prodToEdit);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Produk</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingProductDetail(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP MODAL: DETAIL VARIAN PRODUK                                          */}
      {/* ========================================================================= */}
      {activeViewingVariantsProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl p-4 sm:p-5 shadow-xl text-slate-800 relative max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-mono font-bold text-xs">
                    <Tag className="w-3.5 h-3.5" />
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Daftar Varian: {activeViewingVariantsProduct.name}
                  </h3>
                  <span className="font-mono font-bold text-[11px] text-purple-700 bg-purple-50 px-2 py-0.25 rounded border border-purple-200">
                    {activeViewingVariantsProduct.code}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Brand: <strong className="text-slate-700">{activeViewingVariantsProduct.brand}</strong> • Kategori: <span className="text-slate-700">{activeViewingVariantsProduct.category}</span> • Total {activeViewingVariantsProduct.variants.length} SKU terdaftar
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddVariant(activeViewingVariantsProduct)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Varian Baru</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingProductVariants(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Tutup Modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Table */}
            <div className="space-y-3">
              {activeViewingVariantsProduct.variants.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center">
                  <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">Belum Ada Varian Terdaftar</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                    Produk {activeViewingVariantsProduct.code} ({activeViewingVariantsProduct.name}) belum memiliki varian ukuran atau kemasan.
                  </p>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => handleOpenAddVariant(activeViewingVariantsProduct)}
                      className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Varian Sekarang</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="py-2 px-2.5 w-10 text-center">No</th>
                        <th className="py-2 px-2.5 w-32">Kode Varian / SKU</th>
                        <th className="py-2 px-2.5 min-w-[140px]">Nama Varian (Label)</th>
                        <th className="py-2 px-2.5 w-24">Netto / Bobot</th>
                        <th className="py-2 px-2.5 w-32">Master Bulk</th>
                        <th className="py-2 px-2.5 w-36">Barcode EAN-13</th>
                        <th className="py-2 px-2.5">BOM Kemasan & Keterangan</th>
                        <th className="py-2 px-2.5 w-20 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeViewingVariantsProduct.variants.map((variant, vIdx) => {
                        const linkedFormula = formulations.find((f) => f.code === variant.bulkFormulaCode);

                        return (
                          <tr key={variant.id} className="hover:bg-purple-50/20 transition-colors">
                            <td className="py-1.5 px-2.5 text-center font-mono text-[10px] text-slate-400 font-bold">
                              {vIdx + 1}
                            </td>
                            <td className="py-1.5 px-2.5">
                              <span className="font-mono font-bold text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.25 rounded border border-purple-100 inline-block">
                                {variant.variantCode || variant.sku}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5 font-bold text-slate-900">
                              {variant.variantName}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono font-semibold text-slate-700 text-[11px]">
                              {variant.netVolumeGrams} g / ml
                            </td>
                            <td className="py-1.5 px-2.5">
                              {variant.bulkFormulaCode ? (
                                <div>
                                  <span className="font-mono text-[10px] text-purple-700 font-semibold bg-purple-50 px-1 py-0.25 rounded border border-purple-100 inline-block">
                                    {variant.bulkFormulaCode}
                                  </span>
                                  {linkedFormula && (
                                    <span className="text-[9px] text-slate-400 block truncate max-w-[130px] mt-0.25">
                                      {linkedFormula.name}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">-</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5">
                              {variant.barcode ? (
                                <div className="flex items-center gap-1 font-mono text-[10px] text-slate-800">
                                  <Barcode className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{variant.barcode}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">-</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5">
                              {variant.packagingBom && variant.packagingBom.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mb-0.5">
                                  {variant.packagingBom.map((item, idx) => (
                                    <span
                                      key={idx}
                                      className={`px-1 py-0.25 rounded text-[9px] font-mono font-bold border ${
                                        item.type === 'primary'
                                          ? 'bg-purple-50 border-purple-200 text-purple-700'
                                          : item.type === 'secondary'
                                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      }`}
                                    >
                                      {item.packagingCode} ({item.quantityPerUnit < 1 ? `${Math.round(1/item.quantityPerUnit)}/box` : `${item.quantityPerUnit}x`})
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {variant.description ? (
                                <span className="text-[10px] text-slate-500 block">
                                  {variant.description}
                                </span>
                              ) : (
                                !variant.packagingBom?.length && <span className="text-slate-400 italic text-[10px]">-</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-right">
                              {canWrite && (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditVariant(activeViewingVariantsProduct.id, variant)}
                                    className="p-1 text-slate-600 hover:text-purple-700 hover:bg-purple-50 rounded border border-slate-200 transition-colors cursor-pointer"
                                    title="Edit Varian"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setItemToDelete({
                                        type: 'variant',
                                        prodId: activeViewingVariantsProduct.id,
                                        id: variant.id,
                                        name: variant.variantName,
                                        code: variant.variantCode || variant.sku,
                                      });
                                      setDeletePassword('');
                                      setDeletePasswordError(null);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded border border-slate-200 transition-colors cursor-pointer"
                                    title="Hapus Varian"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="flex items-center justify-between pt-3 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const p = activeViewingVariantsProduct;
                  setViewingProductVariants(null);
                  setViewingProductDetail(p);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PackageCheck className="w-3.5 h-3.5 text-purple-600" />
                <span>Lihat Detail Master Produk Jadi</span>
              </button>

              <button
                type="button"
                onClick={() => setViewingProductVariants(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
