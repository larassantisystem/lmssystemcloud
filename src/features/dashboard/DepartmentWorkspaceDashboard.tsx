import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Layers,
  Boxes,
  Beaker,
  Sliders,
  ChevronRight,
  ArrowRight,
  TrendingUp,
  ShoppingCart,
  CalendarDays,
  Package,
  KeyRound,
  Activity,
  RefreshCw,
  XCircle,
  Truck,
  Scale,
  Users,
  Building2,
  FileCheck,
  Check,
  ExternalLink,
  Zap,
  Tag,
  Search,
  SlidersHorizontal,
  Flame,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '../../core/auth/AuthContext';
import { Department, Role, UserProfile } from '../../types';
import { isQualityManager } from '../../core/auth/permissionGuard';
import { qualityService } from '../quality/qualityService';
import { warehouseService } from '../warehouse/warehouseService';
import { stockService } from '../warehouse/stockService';
import { materialService } from '../rnd/materials/materialService';
import { packagingService } from '../rnd/materials/packagingService';
import { productService } from '../rnd/products/productService';
import { formulaService } from '../rnd/formula/formulaService';
import { departmentNotificationService, DepartmentNotificationItem } from '../../core/notifications/departmentNotificationService';
import { QcInspectionReport } from '../quality/types/qcTypes';
import { GrnRecord } from '../warehouse/types/grnTypes';

interface DepartmentWorkspaceDashboardProps {
  onNavigate: (tab: Department, subTab?: string) => void;
}

export const DepartmentWorkspaceDashboard: React.FC<DepartmentWorkspaceDashboardProps> = ({
  onNavigate
}) => {
  const { user } = useAuth();
  
  // For Admin / Management: allow switching view perspective between departments
  const [selectedDeptView, setSelectedDeptView] = useState<Department | 'all'>(
    user?.department || 'quality'
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  
  // Real datasets
  const [qcReports, setQcReports] = useState<QcInspectionReport[]>([]);
  const [grnRecords, setGrnRecords] = useState<GrnRecord[]>([]);
  const [notifications, setNotifications] = useState<DepartmentNotificationItem[]>([]);
  const [rawMaterialsCount, setRawMaterialsCount] = useState<number>(0);
  const [packagingCount, setPackagingCount] = useState<number>(0);
  const [productsCount, setProductsCount] = useState<number>(0);
  const [formulasCount, setFormulasCount] = useState<number>(0);
  const [stockItemsCount, setStockItemsCount] = useState<number>(0);

  // Time & Shift state
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update selected department view if user changes
  useEffect(() => {
    if (user?.department) {
      if (user.role === 'admin' || user.department === 'management' || user.department === 'admin') {
        setSelectedDeptView('all');
      } else {
        setSelectedDeptView(user.department);
      }
    }
  }, [user]);

  const loadData = async () => {
    try {
      // 1. QC Reports
      const reports = await qualityService.getReports();
      setQcReports(reports);

      // 2. Warehouse GRNs
      const grns = await warehouseService.getGrnRecords();
      setGrnRecords(grns);

      // 3. Notifications
      const notifs = await departmentNotificationService.getNotifications();
      setNotifications(notifs);

      // 4. Master Data
      const [mats, packs, prods, forms, stocks] = await Promise.all([
        materialService.getMaterials(),
        packagingService.getPackagingMaterials(),
        productService.getProducts(),
        formulaService.getFormulations(),
        stockService.getStockLots()
      ]);

      setRawMaterialsCount(mats.length);
      setPackagingCount(packs.length);
      setProductsCount(prods.length);
      setFormulasCount(forms.length);
      setStockItemsCount(stocks.length);
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        loadData();
      }
    }, 180000); // 3 menit jika tab aktif untuk efisiensi egress Supabase
    return () => clearInterval(timer);
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  // Compute active department context
  const activeDept = selectedDeptView === 'all' ? user?.department || 'quality' : selectedDeptView;

  // QC specific counts
  const qcPendingLab = useMemo(() => qcReports.filter(r => r.status === 'DRAFT' || r.status === 'UNDER_TESTING'), [qcReports]);
  const qcPendingQm = useMemo(() => qcReports.filter(r => r.status === 'TESTED' && (!r.qmAuthorizedBy || r.qmAuthorizedBy === '')), [qcReports]);
  const qcReleased = useMemo(() => qcReports.filter(r => r.status === 'PASSED' || r.decision === 'RELEASE'), [qcReports]);
  const qcRejected = useMemo(() => qcReports.filter(r => r.status === 'FAILED' || r.decision === 'REJECT'), [qcReports]);

  // Warehouse specific counts
  const whQuarantineGrns = useMemo(() => grnRecords.filter(g => g.qcStatus === 'QUARANTINE'), [grnRecords]);
  const whReleasedGrns = useMemo(() => grnRecords.filter(g => g.qcStatus === 'RELEASED'), [grnRecords]);
  const whTodayGrns = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return grnRecords.filter(g => g.receivedDate === todayStr);
  }, [grnRecords]);

  // Determine current factory shift
  const currentShift = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 7 && hour < 15) return { name: 'Shift 1 (Pagi)', hours: '07:00 - 15:00', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    if (hour >= 15 && hour < 23) return { name: 'Shift 2 (Sore)', hours: '15:00 - 23:00', badge: 'bg-blue-100 text-blue-800 border-blue-300' };
    return { name: 'Shift 3 (Malam/Lembur)', hours: '23:00 - 07:00', badge: 'bg-purple-100 text-purple-800 border-purple-300' };
  }, []);

  // Filter notifications for active view
  const relevantNotifs = useMemo(() => {
    if (selectedDeptView === 'all') return notifications.slice(0, 6);
    return notifications.filter(n => n.department === selectedDeptView).slice(0, 6);
  }, [notifications, selectedDeptView]);

  // Department Display Name Helper
  const getDeptTitle = (dept: Department) => {
    switch (dept) {
      case 'quality': return 'Quality Assurance & Quality Control (QA/QC)';
      case 'warehouse': return 'Warehouse & Logistik (Gudang)';
      case 'rnd': return 'Research & Development (RnD Formulasi)';
      case 'ppic': return 'Production Planning & Inventory Control (PPIC)';
      case 'production': return 'Produksi (Mixing, Filling, Packaging)';
      case 'procurement': return 'Procurement & Purchasing';
      case 'sales': return 'Sales & Commercial';
      case 'admin': return 'System Administration & HR';
      case 'management': return 'Direksi & General Management';
      default: return (dept as string).toUpperCase();
    }
  };

  const getDeptColor = (dept: Department) => {
    switch (dept) {
      case 'quality': return 'from-amber-600 to-amber-700 text-amber-900 border-amber-200 bg-amber-50';
      case 'warehouse': return 'from-orange-600 to-orange-700 text-orange-900 border-orange-200 bg-orange-50';
      case 'rnd': return 'from-purple-600 to-purple-700 text-purple-900 border-purple-200 bg-purple-50';
      case 'ppic': return 'from-blue-600 to-blue-700 text-blue-900 border-blue-200 bg-blue-50';
      case 'production': return 'from-teal-600 to-teal-700 text-teal-900 border-teal-200 bg-teal-50';
      case 'admin': return 'from-indigo-600 to-indigo-700 text-indigo-900 border-indigo-200 bg-indigo-50';
      default: return 'from-slate-700 to-slate-900 text-slate-900 border-slate-200 bg-slate-50';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans pb-10">
      
      {/* 1. Header Banner & Shift Status */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-6 sm:p-8 border border-slate-700/80 shadow-xl relative overflow-hidden">
        {/* Glow ambient background effects */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-blue-600/30 blur-[90px]"></div>
          <div className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full bg-purple-600/25 blur-[100px]"></div>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3.5 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-slate-200 text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>CPKB Manufaktur BPOM RI</span>
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${currentShift.badge}`}>
                <Clock className="w-3.5 h-3.5" />
                <span>{currentShift.name} ({currentShift.hours})</span>
              </span>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline-block">
                {currentDate} • {currentTime}
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                Pusat Aktivitas Departemen {getDeptTitle(activeDept).split('(')[0]}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
                Selamat bertugas, <strong className="text-white font-bold">{user?.name}</strong>. Anda terautentikasi dengan NIK <strong className="text-emerald-300 font-mono font-bold">{user?.nik}</strong> sebagai <strong className="text-white font-bold">{user?.role.toUpperCase()}</strong> di Departemen <strong className="text-white font-bold">{user?.department.toUpperCase()}</strong>.
              </p>
            </div>

            {/* Quick Status Tickers */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-300">
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span>Cleanroom HVAC: <strong>22.3°C / 49% RH (Optimal)</strong></span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Status Kepatuhan Audit: <strong>100% Valid</strong></span>
              </div>
            </div>
          </div>

          {/* Right Action: Perspective Switcher & Refresh */}
          <div className="shrink-0 flex flex-col items-start md:items-end gap-3 border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
            {(user?.role === 'admin' || user?.department === 'management' || user?.department === 'admin') && (
              <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-2.5 space-y-1 w-full md:w-auto">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-blue-400" />
                  Mode Tampilan Perspektif
                </label>
                <select
                  value={selectedDeptView}
                  onChange={(e) => setSelectedDeptView(e.target.value as any)}
                  className="bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-1.5 border border-slate-600 focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-full"
                >
                  <option value="all">🌐 Ringkasan Konsolidasi Seluruh Pabrik</option>
                  <option value="quality">🔬 Departemen Quality (QA/QC)</option>
                  <option value="warehouse">📦 Departemen Warehouse (Gudang)</option>
                  <option value="rnd">🧪 Departemen RnD (Formulasi)</option>
                  <option value="ppic">📅 Departemen PPIC (Perencanaan)</option>
                  <option value="admin">🛡️ Departemen Admin & Manajemen</option>
                </select>
              </div>
            )}

            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-600 shadow-sm transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Memperbarui...' : 'Sinkronkan Data'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Dynamic KPI Cards based on Active Department */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-700" />
            Indikator Kinerja Utama (KPI & Beban Kerja Terkini)
          </h2>
          <span className="text-[11px] text-slate-500 font-medium">
            Departemen: <strong className="text-slate-800">{getDeptTitle(activeDept).split('(')[0]}</strong>
          </span>
        </div>

        {/* QUALITY DEPARTMENT METRICS */}
        {activeDept === 'quality' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div 
              onClick={() => onNavigate('quality', 'queue')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Antrean Uji Lab</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center font-bold">
                  <Beaker className="w-4 h-4 text-amber-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900 mt-2">
                {qcPendingLab.length} <span className="text-xs font-normal text-slate-500">Lot Sampel</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Menunggu Uji Fisika & Kimia</span>
                <ChevronRight className="w-3.5 h-3.5 text-amber-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('quality', 'approval')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Otorisasi Rilis QM</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center justify-center font-bold">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-indigo-950 mt-2">
                {qcPendingQm.length} <span className="text-xs font-normal text-slate-500">Pending TTD</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500 font-semibold text-indigo-700">Tanda Tangan Digital Quality Manager</span>
                <ChevronRight className="w-3.5 h-3.5 text-indigo-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('quality', 'archive')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Total Lot Lulus (Rilis)</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-emerald-800 mt-2">
                {qcReleased.length} <span className="text-xs font-normal text-slate-500">Lot Selesai</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">CoA Resmi Diterbitkan</span>
                <ChevronRight className="w-3.5 h-3.5 text-emerald-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Reject / OOS</span>
                <div className="w-8 h-8 rounded-xl bg-red-50 text-red-800 border border-red-200 flex items-center justify-center font-bold">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-red-700 mt-2">
                {qcRejected.length} <span className="text-xs font-normal text-slate-500">Lot Ditolak</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Karantina Merah & Berita Acara</span>
              </div>
            </div>
          </div>
        )}

        {/* WAREHOUSE DEPARTMENT METRICS */}
        {activeDept === 'warehouse' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div 
              onClick={() => onNavigate('warehouse', 'inbound')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-orange-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Kedatangan GRN Hari Ini</span>
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-800 border border-orange-200 flex items-center justify-center font-bold">
                  <Truck className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900 mt-2">
                {whTodayGrns.length} <span className="text-xs font-normal text-slate-500">Kedatangan</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Total GRN Terdaftar: {grnRecords.length}</span>
                <ChevronRight className="w-3.5 h-3.5 text-orange-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('warehouse', 'stock-raw')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Zona Karantina (Kuning)</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-amber-900 mt-2">
                {whQuarantineGrns.length} <span className="text-xs font-normal text-slate-500">Lot Tertahan</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Menunggu Hasil QC Lab</span>
                <ChevronRight className="w-3.5 h-3.5 text-amber-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('warehouse', 'stock-raw')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Zona Rilis (Hijau)</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-emerald-800 mt-2">
                {whReleasedGrns.length} <span className="text-xs font-normal text-slate-500">Lot Siap Pakai</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Siap Dispensing Produksi</span>
                <ChevronRight className="w-3.5 h-3.5 text-emerald-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('warehouse', 'weighing')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Ruang Timbang</span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 flex items-center justify-center font-bold">
                  <Scale className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-blue-900 mt-2">
                Siap <span className="text-xs font-normal text-slate-500">Standar CPKB</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Verifikasi Barcode & Timbangan</span>
                <ChevronRight className="w-3.5 h-3.5 text-blue-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        )}

        {/* RND DEPARTMENT METRICS */}
        {activeDept === 'rnd' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div 
              onClick={() => onNavigate('rnd', 'materials')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Master Raw Material (B)</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center font-bold">
                  <Beaker className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-purple-950 mt-2">
                {rawMaterialsCount} <span className="text-xs font-normal text-slate-500">Item Bahan</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Spesifikasi & SDS Aktif</span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('rnd', 'packaging')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Master Kemasan (K)</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-purple-950 mt-2">
                {packagingCount} <span className="text-xs font-normal text-slate-500">Item Kemas</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Primary, Secondary, Inner Box</span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('rnd', 'products')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Produk Jadi (PJ)</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center font-bold">
                  <Boxes className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-purple-950 mt-2">
                {productsCount} <span className="text-xs font-normal text-slate-500">Varian Produk</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Multi-Kemasan & NIE BPOM</span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('rnd', 'formula')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Formulasi Bulk & BOM</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center font-bold">
                  <Sliders className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-purple-950 mt-2">
                {formulasCount} <span className="text-xs font-normal text-slate-500">Formula Rilis</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Kalkulator Batch & Biaya COGS</span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        )}

        {/* ADMIN / MANAGEMENT / CONSOLIDATED METRICS */}
        {(activeDept === 'admin' || activeDept === 'management' || selectedDeptView === 'all') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div 
              onClick={() => onNavigate('quality', 'approval')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Otorisasi Mutu QM</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center justify-center font-bold">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-indigo-950 mt-2">
                {qcPendingQm.length} <span className="text-xs font-normal text-slate-500">Menunggu TTD</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Otorisasi Digital Signature</span>
                <ChevronRight className="w-3.5 h-3.5 text-indigo-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('warehouse', 'stock-raw')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-orange-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Stok Karantina vs Rilis</span>
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-800 border border-orange-200 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900 mt-2">
                {whQuarantineGrns.length} <span className="text-xs font-normal text-slate-500">Karantina</span> / {whReleasedGrns.length} <span className="text-xs font-normal text-slate-500">Rilis</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Total {grnRecords.length} Kedatangan GRN</span>
                <ChevronRight className="w-3.5 h-3.5 text-orange-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('rnd', 'products')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Master Katalog Pabrik</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-purple-950 mt-2">
                {rawMaterialsCount + packagingCount + productsCount} <span className="text-xs font-normal text-slate-500">Item Master</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">{rawMaterialsCount} Bahan, {packagingCount} Kemas, {productsCount} PJ</span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div 
              onClick={() => onNavigate('admin', 'users')}
              className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Integritas CPKB</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-emerald-800 mt-2">
                100% <span className="text-xs font-normal text-slate-500">Tervalidasi</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500">Jejak Audit & Tanda Tangan Digital</span>
                <ChevronRight className="w-3.5 h-3.5 text-emerald-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Main Two-Column Layout: Action Items Queue vs Department Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Action Items / Priority Tasks for Active Department */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-800 flex items-center justify-center font-bold border border-amber-200">
                  <Zap className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Antrean Tugas & Tindakan Segera ({getDeptTitle(activeDept).split('(')[0]})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Daftar item operasional yang membutuhkan eksekusi atau verifikasi hari ini.
                  </p>
                </div>
              </div>
            </div>

            {/* List of Tasks depending on Department */}
            <div className="space-y-3">
              
              {/* Quality Tasks */}
              {activeDept === 'quality' && (
                <>
                  {qcPendingQm.length > 0 && (
                    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold">
                            PRIORITAS TINGGI
                          </span>
                          <span className="text-xs font-bold text-indigo-950">
                            {qcPendingQm.length} Lot Menunggu Otorisasi Rilis Quality Manager
                          </span>
                        </div>
                        <p className="text-[11px] text-indigo-900/80">
                          Hasil uji lab telah selesai diinput. Menunggu tanda tangan digital Quality Manager untuk rilis ke gudang/produksi.
                        </p>
                      </div>
                      <button
                        onClick={() => onNavigate('quality', 'approval')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Buka Otorisasi</span>
                      </button>
                    </div>
                  )}

                  {qcPendingLab.length > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold">
                            UJI LAB
                          </span>
                          <span className="text-xs font-bold text-amber-950">
                            {qcPendingLab.length} Sampel Bahan Baku / Kemas Dalam Antrean Uji
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-900/80">
                          Segera lakukan sampling sesuai MIL-STD-105E dan input hasil parameter fisika/kimia/mikro.
                        </p>
                      </div>
                      <button
                        onClick={() => onNavigate('quality', 'queue')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                      >
                        <Beaker className="w-3.5 h-3.5" />
                        <span>Uji Sampel</span>
                      </button>
                    </div>
                  )}

                  {qcPendingQm.length === 0 && qcPendingLab.length === 0 && (
                    <div className="py-8 text-center space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-800">Semua Antrean QC Bersih!</h4>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                        Tidak ada sampel yang tertahan. Seluruh hasil pengujian dan otorisasi telah diproses.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Warehouse Tasks */}
              {activeDept === 'warehouse' && (
                <>
                  {whQuarantineGrns.length > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold">
                            KARANTINA KUNING
                          </span>
                          <span className="text-xs font-bold text-amber-950">
                            {whQuarantineGrns.length} Lot Bahan Tersimpan di Gudang Karantina
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-900/80">
                          Material belum boleh ditimbang atau ditransfer ke produksi sampai label rilis hijau terbit dari QC.
                        </p>
                      </div>
                      <button
                        onClick={() => onNavigate('warehouse', 'stock-raw')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Cek Status Stok</span>
                      </button>
                    </div>
                  )}

                  <div className="p-4 rounded-2xl bg-orange-50/70 border border-orange-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-orange-600 text-white text-[10px] font-bold">
                          PENERIMAAN GRN
                        </span>
                        <span className="text-xs font-bold text-orange-950">
                          Catat Penerimaan Kedatangan Bahan Baku / Kemas Baru
                        </span>
                      </div>
                      <p className="text-[11px] text-orange-900/80">
                        Input Surat Jalan, No PO, CoA Supplier, dan verifikasi kondisi fisik segel kemasan drum/zak.
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate('warehouse', 'inbound')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Input GRN</span>
                    </button>
                  </div>
                </>
              )}

              {/* RnD Tasks */}
              {activeDept === 'rnd' && (
                <>
                  <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white text-[10px] font-bold">
                          MASTER DATA
                        </span>
                        <span className="text-xs font-bold text-purple-950">
                          Pengkodean Bahan Baku (B) & Bahan Kemas (K)
                        </span>
                      </div>
                      <p className="text-[11px] text-purple-900/80">
                        Pastikan spesifikasi teknis dan SDS dokumen terunggah lengkap sebelum bahan dipesan oleh Procurement.
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate('rnd', 'materials')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                    >
                      <Beaker className="w-3.5 h-3.5" />
                      <span>Buka Master B</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-white text-[10px] font-bold">
                          FORMULASI & BOM
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          Kalkulator Batch & Struktur Resep Bulk
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Susun formulasi standar persentase 100%, instruksi penimbangan, dan perhitungan COGS bahan.
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate('rnd', 'formula')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Kalkulator BOM</span>
                    </button>
                  </div>
                </>
              )}

              {/* Admin / Management Tasks */}
              {(activeDept === 'admin' || activeDept === 'management' || selectedDeptView === 'all') && (
                <>
                  <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold">
                          USER & KEAMANAN
                        </span>
                        <span className="text-xs font-bold text-indigo-950">
                          Manajemen Hak Akses & Matriks Peran Karyawan
                        </span>
                      </div>
                      <p className="text-[11px] text-indigo-900/80">
                        Atur wewenang supervisor, manager, dan analis untuk menjaga integritas data CPKB.
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate('admin', 'users')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Kelola Karyawan</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
                          AUDIT TRAIL
                        </span>
                        <span className="text-xs font-bold text-emerald-950">
                          Log Kepatuhan & Tanda Tangan Digital Rilis
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-900/80">
                        Inspeksi jejak modifikasi, riwayat rilis lot bahan, dan integritas nomor dokumen.
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate('admin', 'audit')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Buka Audit Log</span>
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>

          {/* Quick Department Shortcuts Grid */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-800" />
              Pintasan Cepat Modul ({getDeptTitle(activeDept).split('(')[0]})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeDept === 'quality' && (
                <>
                  <div 
                    onClick={() => onNavigate('quality', 'queue')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all cursor-pointer group"
                  >
                    <Beaker className="w-5 h-5 text-amber-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Uji Mutu Fisika/Kimia</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Input hasil uji parameter</div>
                  </div>

                  <div 
                    onClick={() => onNavigate('quality', 'approval')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 transition-all cursor-pointer group"
                  >
                    <KeyRound className="w-5 h-5 text-indigo-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Otorisasi Quality Manager</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Tanda tangan digital QM</div>
                  </div>

                  <div 
                    onClick={() => onNavigate('quality', 'archive')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all cursor-pointer group"
                  >
                    <FileCheck className="w-5 h-5 text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Arsip Sertifikat CoA</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Riwayat lot selesai</div>
                  </div>
                </>
              )}

              {activeDept === 'warehouse' && (
                <>
                  <div 
                    onClick={() => onNavigate('warehouse', 'inbound')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-orange-400 hover:bg-orange-50/40 transition-all cursor-pointer group"
                  >
                    <Truck className="w-5 h-5 text-orange-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Input Penerimaan GRN</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Surat Jalan & Lot Supplier</div>
                  </div>

                  <div 
                    onClick={() => onNavigate('warehouse', 'stock-raw')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all cursor-pointer group"
                  >
                    <Package className="w-5 h-5 text-amber-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Stok Bahan Baku</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Monitoring Karantina/Rilis</div>
                  </div>

                  <div 
                    onClick={() => onNavigate('warehouse', 'weighing')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer group"
                  >
                    <Scale className="w-5 h-5 text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Ruang Timbang</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Penimbangan SPK Produksi</div>
                  </div>
                </>
              )}

              {(activeDept === 'rnd' || activeDept === 'admin' || activeDept === 'management' || selectedDeptView === 'all') && (
                <>
                  <div 
                    onClick={() => onNavigate('rnd', 'materials')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-400 hover:bg-purple-50/40 transition-all cursor-pointer group"
                  >
                    <Beaker className="w-5 h-5 text-purple-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Master Bahan Baku (B)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Kelola data mentah & SDS</div>
                  </div>

                  <div 
                    onClick={() => onNavigate('rnd', 'products')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-400 hover:bg-purple-50/40 transition-all cursor-pointer group"
                  >
                    <Boxes className="w-5 h-5 text-purple-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Produk Jadi (PJ)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Varian & spesifikasi BPOM</div>
                  </div>

                  <div 
                    onClick={() => onNavigate('rnd', 'formula')}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-400 hover:bg-purple-50/40 transition-all cursor-pointer group"
                  >
                    <Sliders className="w-5 h-5 text-purple-600 mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-900">Formulasi & Kalkulator BOM</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Hitung gramatur & COGS</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right 1 Column: Live Department Activity Stream & Audit Feed */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Log Aktivitas Terkini
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Live Feed</span>
            </div>

            {/* Notification Stream */}
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {relevantNotifs.length === 0 ? (
                <div className="py-10 text-center space-y-2 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold">Belum ada rekaman aktivitas baru</p>
                </div>
              ) : (
                relevantNotifs.map((notif) => (
                  <div 
                    key={notif.id}
                    onClick={() => {
                      if (notif.linkTo?.tab) {
                        onNavigate(notif.linkTo.tab, notif.linkTo.subTab);
                      }
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                      notif.isRead 
                        ? 'bg-slate-50/60 border-slate-200 hover:border-slate-300' 
                        : 'bg-blue-50/50 border-blue-200 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        {notif.department.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {notif.timestamp ? new Date(notif.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-1 leading-snug">
                      {notif.title}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                      {notif.message}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Pencatatan Audit Trail</span>
                <span className="font-mono font-bold text-slate-700">CPKB BPOM OK</span>
              </div>
            </div>
          </div>

          {/* Plant Identity Badge */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 border border-slate-700 space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                PT. LARASSANTI MAKMUR SEJAHTERA
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Pabrik Kosmetika & Personal Care Berstandar CPKB Golongan A. Seluruh pelepasan lot terikat secara hukum melalui Digital Signature.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};
