import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { canAccessModule } from '../auth/permissionGuard';
import { Department } from '../../types';
import { supabase, isSupabaseConfigured } from '../auth/supabaseClient';
import {
  FlaskConical,
  CalendarDays,
  CheckCircle2,
  Package,
  ShoppingCart,
  TrendingUp,
  ShieldCheck,
  Building2,
  LogOut,
  Sparkles,
  Users,
  ChevronRight,
  ChevronDown,
  Bell,
  HardDrive,
  Info,
  CheckCircle,
  Home,
  User,
  Award,
  Layers,
  Sliders,
  FileSpreadsheet,
  PackageCheck,
  ClipboardList,
  History,
  FileText,
  Factory,
  Scale,
  Clock,
  Camera,
  QrCode,
  Cloud,
} from 'lucide-react';
import { Logo } from '../../components/Logo';
import { GlobalNotificationCenter } from '../notifications/GlobalNotificationCenter';
import { UniversalQrScannerModal } from '../../components/UniversalQrScannerModal';
import { GoogleDriveModal } from '../google/GoogleDriveModal';
import {
  departmentNotificationService,
  DepartmentNotificationCounts,
} from '../notifications/departmentNotificationService';
import { NotificationBadge } from './NotificationBadge';
import { SystemInventoryBanner } from '../notifications/SystemInventoryBanner';

export interface SubMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  subItems?: SubMenuItem[];
}

export interface DepartmentConfig {
  id: Department;
  name: string;
  shortName: string;
  description: string;
  icon: React.ReactNode;
  subItems?: SubMenuItem[];
}

interface DashboardLayoutProps {
  children?: React.ReactNode;
  activeTab: Department | 'dashboard';
  onSelectTab: (tab: Department | 'dashboard') => void;
  activeSubTab?: string;
  onSelectSubTab?: (subTab: string) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeTab,
  onSelectTab,
  activeSubTab,
  onSelectSubTab,
}) => {
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showGoogleDrive, setShowGoogleDrive] = useState(false);
  const [counts, setCounts] = useState<DepartmentNotificationCounts>({
    all: 0,
    warehouse: 0,
    quality: 0,
    ppic: 0,
    production: 0,
    procurement: 0,
    sales: 0,
    rnd: 0,
    admin: 0,
  });

  const refreshNotificationCounts = async () => {
    try {
      const c = await departmentNotificationService.getCounts(user);
      setCounts(c);
    } catch (e) {
      console.error('Error fetching notification counts:', e);
    }
  };

  const [supabaseRestrictionMessage, setSupabaseRestrictionMessage] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'testing' | 'connected' | 'restricted' | 'fallback'>('testing');

  useEffect(() => {
    const checkConnection = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setDbStatus('fallback');
        return;
      }
      try {
        const { data, error } = await supabase.from('products').select('id').limit(1);
        if (error) {
          if (
            error.message.includes('egress') || 
            error.message.includes('restricted') || 
            error.message.includes('violation')
          ) {
            setDbStatus('restricted');
            setSupabaseRestrictionMessage('Database Supabase Anda saat ini dibatasi (restricted) karena kuota egress terlampaui. Silakan ganti kredensial di menu Settings.');
          } else {
            setDbStatus('fallback');
          }
        } else {
          setDbStatus('connected');
        }
      } catch (err) {
        setDbStatus('fallback');
      }
    };

    checkConnection();

    const handleRestriction = (e: Event) => {
      const msg = (e as CustomEvent).detail || 'Database Supabase Anda saat ini dibatasi (restricted) karena kuota bulanan gratis (egress) telah terlampaui.';
      setSupabaseRestrictionMessage(msg);
      setDbStatus('restricted');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('supabase-restriction', handleRestriction);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('supabase-restriction', handleRestriction);
      }
    };
  }, []);

  useEffect(() => {
    refreshNotificationCounts();
    const timer = setInterval(() => {
      // Hanya query database jika tab browser sedang aktif/dilihat pengguna
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshNotificationCounts();
      }
    }, 120000); // 2 menit untuk penghematan egress & query log

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshNotificationCounts();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [user]);
  
  // Track which accordion departments are expanded
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({
    rnd: false,
    ppic: false,
    quality: false,
    warehouse: false,
    production: false,
    procurement: false,
    sales: false,
    admin: false,
    deviations: false
  });

  // Track which layer-1 sub-groups are expanded (only active group open by default)
  const [expandedSubItems, setExpandedSubItems] = useState<Record<string, boolean>>({
    'quality-incoming': true,
    'quality-ipc': false,
    'quality-retained-stability': false,
    'quality-doc-control': false,
  });

  // Auto-expand only the relevant sub-group when a sub-item is active
  useEffect(() => {
    if (activeTab === 'quality' && activeSubTab) {
      if (['queue', 'testing', 'approval', 'archive'].includes(activeSubTab)) {
        setExpandedSubItems((prev) => ({ ...prev, 'quality-incoming': true }));
      } else if (['ipc-bulk', 'ipc-finished', 'ipc-rework'].includes(activeSubTab)) {
        setExpandedSubItems((prev) => ({ ...prev, 'quality-ipc': true }));
      } else if (['retained', 'stability'].includes(activeSubTab)) {
        setExpandedSubItems((prev) => ({ ...prev, 'quality-retained-stability': true }));
      } else if (['sop', 'capa', 'complaints', 'deviations'].includes(activeSubTab)) {
        setExpandedSubItems((prev) => ({ ...prev, 'quality-doc-control': true }));
      }
    }
  }, [activeTab, activeSubTab]);

  const toggleAccordion = (deptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDepts((prev) => {
      const wasExpanded = !!prev[deptId];
      const next: Record<string, boolean> = {};
      next[deptId] = !wasExpanded;
      return next;
    });
  };

  const departments: DepartmentConfig[] = [
    {
      id: 'rnd',
      name: 'RnD (Master Data)',
      shortName: 'RnD',
      description: 'Master Material, Produk & Formula',
      icon: <FlaskConical className="w-4 h-4 text-purple-700" />,
      subItems: [
        { id: 'products', label: 'Produk Jadi (PJ0001)', icon: <PackageCheck className="w-3.5 h-3.5" /> },
        { id: 'materials', label: 'Bahan Baku (B0001)', icon: <FlaskConical className="w-3.5 h-3.5" /> },
        { id: 'packaging', label: 'Bahan Kemas (K0001)', icon: <Layers className="w-3.5 h-3.5" /> },
        { id: 'formula', label: 'Master Formula & Instruksi', icon: <Sliders className="w-3.5 h-3.5" /> },
        { id: 'bom-calculator', label: 'Dynamic BOM Calculator', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
      ]
    },
    {
      id: 'ppic',
      name: 'PPIC (Planning)',
      shortName: 'PPIC',
      description: 'Kalkulator Kebutuhan Material (MRP)',
      icon: <CalendarDays className="w-4 h-4 text-blue-700" />,
      subItems: [
        { id: 'mrp', label: 'Kalkulasi MRP & Batching', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
        { id: 'schedule', label: 'Jadwal Produksi CPKB', icon: <CalendarDays className="w-3.5 h-3.5" /> },
      ]
    },
    {
      id: 'quality',
      name: 'Quality (QA/QC)',
      shortName: 'QC Lab',
      description: 'Sampling, Lab, Karantina & Laporan',
      icon: <CheckCircle2 className="w-4 h-4 text-amber-700" />,
      subItems: [
        {
          id: 'incoming',
          label: '📥 1. Incoming (Bahan Masuk)',
          subItems: [
            { id: 'queue', label: '1.1 Antrean Karantina', icon: <Clock className="w-3.5 h-3.5 text-amber-500" /> },
            { id: 'testing', label: '1.2 Pengujian Lab', icon: <FlaskConical className="w-3.5 h-3.5 text-teal-600" /> },
            { id: 'approval', label: '1.3 Otorisasi Manager', icon: <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> },
            { id: 'archive', label: '1.4 Arsip Laporan & Lot', icon: <FileText className="w-3.5 h-3.5 text-emerald-600" /> },
          ]
        },
        {
          id: 'ipc',
          label: '⚙️ 2. In-Process Control (IPC)',
          subItems: [
            { id: 'ipc-bulk', label: '2.1 Sediaan Ruahan (Bulk)', icon: <Sliders className="w-3.5 h-3.5 text-blue-600" /> },
            { id: 'ipc-finished', label: '2.2 Produk Jadi', icon: <Package className="w-3.5 h-3.5 text-indigo-600" /> },
            { id: 'ipc-rework', label: '2.3 Rework / Reprocess', icon: <FlaskConical className="w-3.5 h-3.5 text-orange-500" /> },
          ]
        },
        {
          id: 'retained-stability',
          label: '🧪 3. Retained & Stability',
          subItems: [
            { id: 'retained', label: '3.1 Retained Sample', icon: <Package className="w-3.5 h-3.5 text-teal-700" /> },
            { id: 'stability', label: '3.2 Stability Study', icon: <CalendarDays className="w-3.5 h-3.5 text-purple-700" /> },
          ]
        },
        {
          id: 'doc-control',
          label: '📑 4. Document Control & Keluhan',
          subItems: [
            { id: 'sop', label: '4.1 Daftar SOP Aktif', icon: <FileText className="w-3.5 h-3.5 text-slate-700" /> },
            { id: 'capa', label: '4.2 Riwayat Deviasi & CAPA', icon: <ClipboardList className="w-3.5 h-3.5 text-rose-600" /> },
            { id: 'complaints', label: '4.3 Complaint Handling', icon: <Info className="w-3.5 h-3.5 text-blue-600" /> },
          ]
        }
      ]
    },
    {
      id: 'deviations',
      name: 'Deviasi & CAPA',
      shortName: 'Deviasi',
      description: 'Penyimpangan Mutu & CAPA Lintas Departemen',
      icon: <ShieldCheck className="w-4 h-4 text-rose-700" />,
    },
    {
      id: 'warehouse',
      name: 'Warehouse (Gudang)',
      shortName: 'Gudang',
      description: 'Penerimaan Material, Stok BB & Kemas, FEFO',
      icon: <Package className="w-4 h-4 text-orange-700" />,
      subItems: [
        { id: 'inbound', label: '1. Penerimaan Barang (GRN)', icon: <Package className="w-3.5 h-3.5" /> },
        { id: 'stock-raw', label: '2. Stock Bahan Baku (BB)', icon: <FlaskConical className="w-3.5 h-3.5 text-teal-700" /> },
        { id: 'stock-packaging', label: '3. Stock Bahan Kemas (BK)', icon: <Layers className="w-3.5 h-3.5 text-purple-700" /> },
        { id: 'weighing', label: '4. Penimbangan FEFO Bersih', icon: <Scale className="w-3.5 h-3.5" /> },
        { id: 'finished-goods', label: '5. Stok Produk Jadi (PJ)', icon: <PackageCheck className="w-3.5 h-3.5" /> },
      ]
    },
    {
      id: 'production',
      name: 'Produksi (Operasional Pabrik)',
      shortName: 'Produksi',
      description: 'Peracikan, Mixing, Filling CPKB',
      icon: <Factory className="w-4 h-4 text-emerald-700" />,
      subItems: [
        { id: 'batch-mixing', label: 'Peracikan & Mixing Batch', icon: <Sliders className="w-3.5 h-3.5" /> },
        { id: 'filling-packing', label: 'Filling & Pengemasan CPKB', icon: <PackageCheck className="w-3.5 h-3.5" /> },
      ]
    },
    {
      id: 'procurement',
      name: 'Procurement (PO)',
      shortName: 'PO',
      description: 'PO Bahan & Lead Time Vendor',
      icon: <ShoppingCart className="w-4 h-4 text-purple-700" />,
      subItems: [
        { id: 'po-list', label: 'Purchase Orders (PO)', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
        { id: 'vendors', label: 'Vendor Bahan Terdaftar', icon: <Building2 className="w-3.5 h-3.5" /> },
      ]
    },
    {
      id: 'sales',
      name: 'Sales (Pesanan)',
      shortName: 'Sales',
      description: 'Input Sales Order Pelanggan',
      icon: <TrendingUp className="w-4 h-4 text-pink-700" />,
      subItems: [
        { id: 'orders', label: 'Daftar Sales Order (SO)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
      ]
    },
    {
      id: 'admin',
      name: 'Admin & Otoritas',
      shortName: 'Admin',
      description: 'Manajemen Akun NIK & Audit',
      icon: <ShieldCheck className="w-4 h-4 text-indigo-700" />,
      subItems: [
        { id: 'users', label: 'Manajemen Karyawan (NIK)', icon: <Users className="w-3.5 h-3.5" /> },
        { id: 'audit', label: 'Rekam Jejak Audit Trail', icon: <History className="w-3.5 h-3.5" /> },
      ]
    },
  ];

  // Filter menu berdasarkan hak akses Silo Departemen & Specific Access
  const visibleDepartments = departments.filter((dept) => canAccessModule(user, dept.id));

  // Redirect pengaman jika user berada di tab yang tidak diizinkan
  useEffect(() => {
    if (activeTab !== 'dashboard' && !canAccessModule(user, activeTab)) {
      onSelectTab('dashboard');
    }
  }, [activeTab, user, onSelectTab]);

  // Auto-expand accordion departemen yang aktif agar sub-menu terlihat langsung di sidebar
  useEffect(() => {
    if (activeTab && activeTab !== 'dashboard') {
      setExpandedDepts((prev) => ({
        ...prev,
        [activeTab]: true,
      }));
    }
  }, [activeTab]);

  const handleNotificationNavigate = (dept: Department, subTab?: string) => {
    onSelectTab(dept);
    if (subTab && onSelectSubTab) {
      onSelectSubTab(subTab);
    }
  };

  return (
    <div className="h-screen bg-slate-50 text-slate-800 flex flex-col font-sans overflow-hidden">
      {/* Crisp Light Top Navigation Bar (Fixed / Shrink-0) */}
      <header className="h-16 shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between z-40 shadow-xs">
        <div className="flex items-center gap-4">
          {/* Logo Component with Text in Light Theme */}
          <Logo size="sm" showText={true} />
          
          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Sistem Operasional
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-extrabold flex items-center gap-1">
              <Award className="w-3 h-3" />
              CPKB BPOM V5.0
            </span>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-2.5">
          {/* DB Connection Status Badge */}
          <div className="flex items-center shrink-0">
            {dbStatus === 'testing' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 font-bold text-[9px] uppercase font-mono animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                DB Test...
              </span>
            )}
            {dbStatus === 'connected' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold text-[9px] uppercase font-mono shadow-2xs" title="Koneksi Supabase aktif dan berjalan normal">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                DB Connected
              </span>
            )}
            {dbStatus === 'restricted' && (
              <button
                type="button"
                onClick={() => {
                  setSupabaseRestrictionMessage('Database Supabase Anda saat ini dibatasi karena kuota egress terlampaui. Silakan ganti kredensial di menu Settings.');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-extrabold text-[9px] uppercase font-mono shadow-2xs hover:bg-amber-100 transition-colors cursor-pointer"
                title="Klik untuk detail pembatasan kuota egress Supabase"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                DB Restricted
              </button>
            )}
            {dbStatus === 'fallback' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-[9px] uppercase font-mono" title="Menggunakan database simulasi memori (Local Fallback)">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                DB Fallback
              </span>
            )}
          </div>

          {/* Universal QR Camera Scanner Button */}
          <button
            type="button"
            onClick={() => setShowQrScanner(true)}
            title="Pindai QR Label / Wadah CPKB (Kamera)"
            className="px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-all text-xs flex items-center gap-1.5 cursor-pointer font-bold shadow-2xs active:scale-95"
          >
            <Camera className="w-4 h-4 text-teal-700" />
            <span className="hidden sm:inline">Pindai QR</span>
          </button>

          {/* Google Drive Integration Button (Admin Only) */}
          {(user?.role === 'admin' || user?.role === 'superadmin' || user?.department === 'management' || canAccessModule(user, 'admin')) && (
            <button
              type="button"
              onClick={() => setShowGoogleDrive(true)}
              title="Google Drive Perusahaan (Admin CPKB)"
              className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-all text-xs flex items-center gap-1.5 cursor-pointer font-bold shadow-2xs active:scale-95"
            >
              <Cloud className="w-4 h-4 text-blue-600" />
              <span className="hidden md:inline">Google Drive</span>
            </button>
          )}

          {/* Universal Department Notification Center Dropdown */}
          <GlobalNotificationCenter onNavigate={handleNotificationNavigate} />

          {/* User Profile Pill */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-purple-50/80 border border-purple-200/90 hover:bg-purple-100/70 transition-all text-xs text-slate-800 font-semibold cursor-pointer shadow-xs"
            >
              <div className="w-6 h-6 rounded-lg bg-purple-700 text-white flex items-center justify-center font-bold text-[10px]">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-slate-900 leading-none">
                  {user?.name?.split(',')[0]}
                </div>
                <div className="text-[9px] text-purple-700 font-mono font-bold mt-0.5 uppercase">
                  {user?.department} • {user?.role} ({user?.nik})
                </div>
              </div>
            </button>

            {/* Profile Popover Menu */}
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-slate-200 shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1.5 border-b border-slate-100 mb-2">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Kredensial Sesi Karyawan
                  </span>
                  <div className="mt-1">
                    <h4 className="text-xs font-bold text-slate-900">{user?.name}</h4>
                    <p className="text-[11px] font-mono text-purple-700 font-semibold mt-0.5">
                      NIK: {user?.nik}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 px-2 py-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Departemen:</span>
                    <span className="font-bold text-slate-800 uppercase">{user?.department}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Tingkat Jabatan:</span>
                    <span className="font-bold text-purple-700 uppercase bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      {user?.role}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-500 block mb-1">
                      Kondisi Khusus (Akses Lintas Modul):
                    </span>
                    {user?.role === 'admin' ? (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                        Super User (Semua Modul Terbuka)
                      </span>
                    ) : user?.specificAccess && user.specificAccess.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.specificAccess.map((perm) => (
                          <span
                            key={perm.moduleId}
                            className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded"
                          >
                            +{perm.moduleId.toUpperCase()} ({perm.accessLevel})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">
                        Terbatas pada modul {user?.department?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    CPKB Verified
                  </span>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar Sesi</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            title="Keluar dari sistem"
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition-all text-xs flex items-center gap-1.5 cursor-pointer font-bold shadow-xs"
          >
            <LogOut className="w-4 h-4 text-rose-500" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* System-wide ROP Inventory Alert Banner */}
      <SystemInventoryBanner onNavigateTab={onSelectTab} />

      {/* Supabase Restriction Warning Alert Banner */}
      {supabaseRestrictionMessage && (
        <div className="bg-amber-50 border-y border-amber-200 px-4 py-3 flex items-center justify-between gap-3 text-amber-900 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-1 rounded-lg bg-amber-100 text-amber-700 shrink-0">
              <Info className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold tracking-wide text-amber-800 uppercase">Koneksi Database Terbatas (Egress Quota Exceeded)</p>
              <p className="text-[11px] text-amber-700 leading-normal whitespace-normal">
                {supabaseRestrictionMessage}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSupabaseRestrictionMessage(null)}
            className="text-xs font-bold text-amber-700 hover:text-amber-900 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            Sembunyikan
          </button>
        </div>
      )}

      {/* Main App Layout Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Department Sidebar Navigation (Accordion Format) - Fixed in place, scrollable internally */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0 shadow-xs scrollbar-none items-center md:items-stretch h-auto md:h-full">
          {/* Home button */}
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-xl text-xs font-bold transition-all text-left w-auto md:w-full cursor-pointer shrink-0 ${
              activeTab === 'dashboard'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className={`p-1.5 rounded-lg border ${
              activeTab === 'dashboard' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <Home className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="md:hidden text-[11px] font-bold">Beranda</div>
              <div className="hidden md:block truncate">Beranda Utama</div>
            </div>
            {activeTab === 'dashboard' && <ChevronRight className="w-4 h-4 text-slate-400 hidden md:block ml-auto" />}
          </button>

          <div className="hidden md:block my-1 border-t border-slate-100"></div>

          {/* Accordion Department Menus with Departmental Notification Badges */}
          {visibleDepartments.map((dept) => {
            const isDeptActive = activeTab === dept.id;
            const isExpanded = !!expandedDepts[dept.id];
            const hasSubItems = dept.subItems && dept.subItems.length > 0;
            const deptCount = (counts as any)[dept.id] || 0;

            return (
              <div key={dept.id} className="w-auto md:w-full shrink-0 flex flex-col">
                {/* Department Main Button / Accordion Header */}
                <div
                  onClick={() => {
                    onSelectTab(dept.id);
                    if (hasSubItems) {
                      setExpandedDepts((prev) => {
                        const wasExpanded = !!prev[dept.id];
                        const next: Record<string, boolean> = {};
                        next[dept.id] = !wasExpanded;
                        return next;
                      });
                    } else {
                      setExpandedDepts({});
                    }
                  }}
                  className={`flex items-center justify-between gap-2 md:gap-2.5 px-3 py-2 md:py-2 rounded-xl text-xs font-bold transition-all text-left w-auto md:w-full cursor-pointer select-none ${
                    isDeptActive
                      ? 'bg-purple-50 text-purple-900 border border-purple-200/90 shadow-2xs'
                      : 'text-slate-700 hover:text-purple-700 hover:bg-purple-50/40'
                  }`}
                >
                  <div className="flex items-center gap-2 md:gap-2.5 min-w-0 flex-1">
                    <div className={`p-1.5 rounded-lg border shrink-0 ${
                      isDeptActive ? 'bg-white border-purple-200 text-purple-700 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      {dept.icon}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <div className="md:hidden text-[11px] font-bold whitespace-nowrap">{dept.shortName}</div>
                      <div className="hidden md:block truncate font-bold text-xs">{dept.name}</div>
                    </div>
                  </div>

                  {/* Department Notification Badge */}
                  {deptCount > 0 && (
                    <NotificationBadge
                      count={deptCount}
                      variant={
                        dept.id === 'quality'
                          ? 'warning'
                          : dept.id === 'warehouse'
                          ? 'purple'
                          : 'danger'
                      }
                      size="sm"
                      pulse={true}
                    />
                  )}

                  {/* Accordion Toggle Icon (Desktop) */}
                  {hasSubItems && (
                    <button
                      type="button"
                      onClick={(e) => toggleAccordion(dept.id, e)}
                      className="hidden md:flex p-1 rounded-md hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors ml-1 cursor-pointer"
                      title={isExpanded ? 'Tutup sub-menu' : 'Buka sub-menu'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-purple-700 font-bold" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  )}
                </div>

                {/* Sub-Items Accordion Drawer (Desktop Only) */}
                {hasSubItems && isExpanded && (
                  <div className="hidden md:flex flex-col gap-0.5 pl-6 pr-1 py-1 mt-0.5 border-l-2 border-purple-100 ml-4 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {dept.subItems!.map((sub) => {
                      const hasNestedItems = sub.subItems && sub.subItems.length > 0;
                      const isSubExpanded = !!expandedSubItems[`${dept.id}-${sub.id}`];

                      if (hasNestedItems) {
                        return (
                          <div key={sub.id} className="flex flex-col gap-0.5 mt-1.5 first:mt-0">
                            {/* Layer 1 Collapsible Sub-Group Header */}
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedSubItems(prev => ({
                                  ...prev,
                                  [`${dept.id}-${sub.id}`]: !prev[`${dept.id}-${sub.id}`]
                                }));
                              }}
                              className="flex items-center justify-between px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider text-slate-500 hover:text-purple-700 hover:bg-purple-50/50 transition-all text-left cursor-pointer w-full select-none"
                            >
                              <span className="truncate">{sub.label}</span>
                              {isSubExpanded ? (
                                <ChevronDown className="w-3 h-3 text-purple-700" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-slate-400" />
                              )}
                            </button>

                            {/* Layer 2 Items */}
                            {isSubExpanded && (
                              <div className="flex flex-col gap-0.5 pl-2.5 border-l border-slate-200 ml-2 py-1 space-y-0.5">
                                {sub.subItems!.map((nested) => {
                                  const isNestedActive = isDeptActive && activeSubTab === nested.id;
                                  return (
                                    <button
                                      key={nested.id}
                                      type="button"
                                      onClick={() => {
                                        onSelectTab(dept.id);
                                        if (onSelectSubTab) {
                                          onSelectSubTab(nested.id);
                                        }
                                      }}
                                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all text-left cursor-pointer w-full ${
                                        isNestedActive
                                          ? 'bg-purple-700 text-white font-bold shadow-xs'
                                          : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50/60'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={isNestedActive ? 'text-white' : 'text-slate-400'}>
                                          {nested.icon}
                                        </span>
                                        <span className="truncate">{nested.label}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Standard single-layer SubItem (for non-Quality departments)
                      const isSubActive = isDeptActive && activeSubTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            onSelectTab(dept.id);
                            if (onSelectSubTab) {
                              onSelectSubTab(sub.id);
                            }
                          }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all text-left cursor-pointer w-full ${
                            isSubActive
                              ? 'bg-purple-700 text-white font-bold shadow-xs'
                              : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={isSubActive ? 'text-white' : 'text-slate-400'}>
                              {sub.icon}
                            </span>
                            <span className="truncate">{sub.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* Mobile Sub-Items Bar (Only when active department has sub-items and screen is mobile) */}
        {(() => {
          const currentDept = departments.find((d) => d.id === activeTab);
          if (!currentDept || !currentDept.subItems || currentDept.subItems.length === 0) return null;
          return (
            <div className="md:hidden bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 shadow-2xs">
              {currentDept.subItems.map((sub) => {
                const isSubActive = activeSubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      if (onSelectSubTab) onSelectSubTab(sub.id);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSubActive
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-purple-50 hover:text-purple-700'
                    }`}
                  >
                    <span className={isSubActive ? 'text-white' : 'text-slate-400'}>{sub.icon}</span>
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
          {children}
        </main>
      </div>

      {/* Universal QR Scanner Modal */}
      <UniversalQrScannerModal
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
      />

      {/* Google Drive Integration Modal */}
      <GoogleDriveModal
        isOpen={showGoogleDrive}
        onClose={() => setShowGoogleDrive(false)}
      />
    </div>
  );
};
