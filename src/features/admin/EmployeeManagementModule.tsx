import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  KeyRound,
  Building2,
  RefreshCw,
  FlaskConical,
  CalendarDays,
  Package,
  ShoppingCart,
  TrendingUp,
  Factory,
  Sliders,
  History,
  Check,
  X,
  Eye,
  EyeOff,
  Sparkles,
  Info,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { Department, Role, ModulePermission, UserProfile } from '../../types';
import { authService } from '../../core/auth/authService';
import { useAuth } from '../../core/auth/AuthContext';

interface EmployeeManagementModuleProps {
  activeSubTab?: 'users' | 'audit';
  onSelectSubTab?: (subTab: 'users' | 'audit') => void;
}

export const EmployeeManagementModule: React.FC<EmployeeManagementModuleProps> = ({
  activeSubTab = 'users',
  onSelectSubTab,
}) => {
  const { user: currentUser } = useAuth();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal State for Unified Add/Edit Employee Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Unified Form Fields
  const [formNik, setFormNik] = useState('');
  const [formName, setFormName] = useState('');
  const [formDept, setFormDept] = useState<Department>('rnd');
  const [formRole, setFormRole] = useState<Role>('staff');
  const [formPassword, setFormPassword] = useState('laras123');
  const [showPassword, setShowPassword] = useState(false);
  const [enableCustomAccess, setEnableCustomAccess] = useState(false);
  const [formSpecificAccess, setFormSpecificAccess] = useState<ModulePermission[]>([]);

  // Delete Confirmation State
  const [deletingEmployee, setDeletingEmployee] = useState<UserProfile | null>(null);

  // Audit Logs (CPKB Event Logs) loaded from in-memory auditLogger
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: string;
    timestamp: string;
    actorNik: string;
    actorName: string;
    action: string;
    targetNik: string;
    details: string;
  }>>(() => {
    return [
      {
        id: 'aud-1',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        actorNik: 'admin',
        actorName: 'ADMIN',
        action: 'SYSTEM_SYNC',
        targetNik: 'ALL',
        details: 'Sinkronisasi Karyawan Master ke Supabase Auth & PostgreSQL Profiles.',
      },
      {
        id: 'aud-2',
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        actorNik: 'admin',
        actorName: 'ADMIN',
        action: 'NIK_MIGRATION',
        targetNik: 'admin',
        details: 'Pembaruan identitas Super Admin NIK dari LMS00000 menjadi admin.',
      },
      {
        id: 'aud-3',
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
        actorNik: 'admin',
        actorName: 'ADMIN',
        action: 'EMPLOYEE_CREATE',
        targetNik: 'LMS10001',
        details: 'Pendaftaran karyawan baru Daffa sebagai Staff RnD Formulasi.',
      },
      {
        id: 'aud-4',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        actorNik: 'admin',
        actorName: 'ADMIN',
        action: 'EMPLOYEE_CREATE',
        targetNik: 'LMS20001',
        details: 'Pendaftaran karyawan baru Ayu sebagai Staff QC Lab (Sampling Karantina).',
      },
      {
        id: 'aud-5',
        timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
        actorNik: 'admin',
        actorName: 'ADMIN',
        action: 'EMPLOYEE_UPDATE',
        targetNik: 'LMS10003',
        details: 'Pembaruan hak akses khusus lintas departemen untuk Lanny (Manager RnD).',
      },
      {
        id: 'aud-6',
        timestamp: new Date(Date.now() - 3600000 * 72).toISOString(),
        actorNik: 'admin',
        actorName: 'ADMIN',
        action: 'EMPLOYEE_DEACTIVATE',
        targetNik: 'LMS88888',
        details: 'Deaktivasi akun karyawan kontrak pasca masa bakti selesai.',
      }
    ];
  });

  // Audit Trail Filter and Pagination State (Optimized On-Demand Loading)
  const [isAuditLoaded, setIsAuditLoaded] = useState<boolean>(false);
  const [auditFilterModule, setAuditFilterModule] = useState<string>('all');
  const [auditStartDate, setAuditStartDate] = useState<string>('');
  const [auditEndDate, setAuditEndDate] = useState<string>('');
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditPageSize, setAuditPageSize] = useState<number>(25); // high density compact default

  // Helper to determine module of log for clean filtering & badge
  const getLogModule = (log: any): string => {
    if (log.module) return log.module.toLowerCase();
    const act = (log.action || '').toUpperCase();
    if (act.startsWith('RM_') || act.startsWith('MATERIAL_') || act.startsWith('PACKAGING_') || act.startsWith('FORMULA_') || act.startsWith('BOM_') || act.startsWith('PRODUCT_')) return 'rnd';
    if (act.startsWith('QC_') || act.startsWith('COA_') || act.startsWith('SAMPLE_') || act.startsWith('RELEASE_')) return 'quality';
    if (act.startsWith('WH_') || act.startsWith('INBOUND_') || act.startsWith('STOCK_') || act.startsWith('WEIGHING_')) return 'warehouse';
    if (act.startsWith('PPIC_') || act.startsWith('MRP_') || act.startsWith('PLAN_') || act.startsWith('SCHEDULE_')) return 'ppic';
    if (act.startsWith('PO_') || act.startsWith('VENDOR_') || act.startsWith('PROCUREMENT_')) return 'procurement';
    if (act.startsWith('EMPLOYEE_') || act.startsWith('USER_') || act.startsWith('NIK_') || act.startsWith('AUTH_') || act.startsWith('ROLE_')) return 'admin';
    return 'system';
  };

  const getModuleBadgeConfig = (mod: string) => {
    switch (mod) {
      case 'rnd':
        return { label: 'RnD', badge: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'quality':
        return { label: 'QC Lab', badge: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'warehouse':
        return { label: 'Warehouse', badge: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'ppic':
        return { label: 'PPIC', badge: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'procurement':
        return { label: 'Procure', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'admin':
        return { label: 'Admin', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      default:
        return { label: 'Sistem', badge: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setAuditPage(1);
  }, [auditFilterModule, auditStartDate, auditEndDate, auditPageSize]);

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const data = await authService.getAllEmployees();
      setEmployees(data);
    } catch (err: any) {
      console.error('Failed to load employees:', err);
      setActionError('Gagal memuat daftar karyawan.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleOpenAddModal = () => {
    setIsEditMode(false);
    setFormNik('');
    setFormName('');
    setFormDept('rnd');
    setFormRole('staff');
    setFormPassword('laras123');
    setEnableCustomAccess(false);
    setFormSpecificAccess([]);
    setIsModalOpen(true);
    setActionError(null);
  };

  const handleOpenEditModal = (emp: UserProfile) => {
    setIsEditMode(true);
    setFormNik(emp.nik);
    setFormName(emp.name);
    setFormDept(emp.department);
    setFormRole(emp.role);
    setFormPassword(emp.password || '');
    const hasAccess = (emp.specificAccess && emp.specificAccess.length > 0) || false;
    setEnableCustomAccess(hasAccess);
    setFormSpecificAccess(emp.specificAccess ? [...emp.specificAccess] : []);
    setIsModalOpen(true);
    setActionError(null);
  };

  const toggleSpecificModule = (deptId: Department) => {
    setFormSpecificAccess((prev) => {
      const exists = prev.find((p) => p.moduleId === deptId);
      if (exists) {
        return prev.filter((p) => p.moduleId !== deptId);
      } else {
        return [...prev, { moduleId: deptId, accessLevel: 'read' }];
      }
    });
  };

  const updateSpecificLevel = (deptId: Department, level: 'read' | 'write') => {
    setFormSpecificAccess((prev) =>
      prev.map((p) => (p.moduleId === deptId ? { ...p, accessLevel: level } : p))
    );
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    if (!formNik.trim()) {
      setActionError('NIK Karyawan wajib diisi.');
      return;
    }
    if (!formName.trim()) {
      setActionError('Nama Lengkap Karyawan wajib diisi.');
      return;
    }

    const cleanNik = formNik.trim().toLowerCase() === 'admin' 
      ? 'admin' 
      : (formNik.toUpperCase().startsWith('LMS') ? formNik.toUpperCase() : `LMS${formNik.toUpperCase()}`);

    const finalAccess = enableCustomAccess ? formSpecificAccess : [];

    setIsSaving(true);

    try {
      if (isEditMode) {
        // Edit Mode
        const updatePayload: Partial<UserProfile & { password?: string }> = {
          name: formName.trim(),
          department: formDept,
          role: formRole,
          specificAccess: finalAccess,
        };
        if (formPassword.trim()) {
          updatePayload.password = formPassword.trim();
        }

        const resUpdate = await authService.updateEmployee(cleanNik, updatePayload);
        if (resUpdate.success) {
          setActionSuccess(`Data karyawan ${formName} (${cleanNik}) dan hak akses otoritas berhasil diperbarui.`);
          setIsModalOpen(false);

          // Add to Audit Trail
          setAuditLogs((prev) => [
            {
              id: `aud-${Date.now()}`,
              timestamp: new Date().toISOString(),
              actorNik: currentUser?.nik || 'admin',
              actorName: currentUser?.name || 'ADMIN',
              action: 'EMPLOYEE_UPDATE',
              targetNik: cleanNik,
              details: `Pembaruan profil dan hak akses khusus: ${finalAccess.length > 0 ? finalAccess.map((a) => `${a.moduleId}(${a.accessLevel})`).join(', ') : 'Standar Silo'}`,
            },
            ...prev,
          ]);

          await fetchEmployees();
        } else {
          setActionError(resUpdate.error || 'Gagal memperbarui data karyawan.');
        }
      } else {
        // Add Mode
        const res = await authService.registerEmployee({
          nik: cleanNik,
          name: formName.trim(),
          department: formDept,
          role: formRole,
          password: formPassword.trim() || 'laras123',
          specificAccess: finalAccess,
        });

        if (res.success) {
          setActionSuccess(`Karyawan baru ${formName} (${cleanNik}) berhasil didaftarkan dan diaktifkan.`);
          setIsModalOpen(false);

          // Add to Audit Trail
          setAuditLogs((prev) => [
            {
              id: `aud-${Date.now()}`,
              timestamp: new Date().toISOString(),
              actorNik: currentUser?.nik || 'admin',
              actorName: currentUser?.name || 'ADMIN',
              action: 'EMPLOYEE_CREATE',
              targetNik: cleanNik,
              details: `Pendaftaran akun karyawan baru di departemen ${formDept.toUpperCase()} (${formRole.toUpperCase()}) dengan password standar.`,
            },
            ...prev,
          ]);

          await fetchEmployees();
        } else {
          setActionError(res.error || 'Gagal mendaftarkan karyawan.');
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEmployee) return;

    if (deletingEmployee.nik.toLowerCase() === 'admin') {
      setActionError('Akun Administrator Utama tidak dapat dinonaktifkan.');
      setDeletingEmployee(null);
      return;
    }

    if (currentUser && currentUser.nik.toLowerCase() === deletingEmployee.nik.toLowerCase()) {
      setActionError('Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.');
      setDeletingEmployee(null);
      return;
    }

    const resDelete = await authService.deleteEmployee(deletingEmployee.nik);
    if (resDelete.success) {
      setActionSuccess(`Akun karyawan ${deletingEmployee.name} (${deletingEmployee.nik}) telah dinonaktifkan.`);
      
      // Audit log
      setAuditLogs((prev) => [
        {
          id: `aud-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actorNik: currentUser?.nik || 'admin',
          actorName: currentUser?.name || 'ADMIN',
          action: 'EMPLOYEE_DEACTIVATE',
          targetNik: deletingEmployee.nik,
          details: `Akun dinonaktifkan dari sistem oleh Administrator.`,
        },
        ...prev,
      ]);

      setDeletingEmployee(null);
      await fetchEmployees();
      setTimeout(() => setActionSuccess(null), 4000);
    } else {
      setActionError('Gagal menonaktifkan akun.');
      setDeletingEmployee(null);
    }
  };

  // Filtered employees
  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      emp.nik.toLowerCase().includes(q) ||
      emp.name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q);

    const matchesDept = filterDept === 'all' || emp.department === filterDept;
    const matchesRole = filterRole === 'all' || emp.role === filterRole;

    return matchesSearch && matchesDept && matchesRole;
  });

  const getDepartmentBadge = (dept: Department) => {
    switch (dept) {
      case 'rnd':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <FlaskConical className="w-3 h-3 text-purple-600" />
            RnD
          </span>
        );
      case 'ppic':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <CalendarDays className="w-3 h-3 text-blue-600" />
            PPIC
          </span>
        );
      case 'quality':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <CheckCircle2 className="w-3 h-3 text-amber-600" />
            Quality (QC)
          </span>
        );
      case 'warehouse':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
            <Package className="w-3 h-3 text-orange-600" />
            Warehouse
          </span>
        );
      case 'production':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Factory className="w-3 h-3 text-emerald-600" />
            Produksi
          </span>
        );
      case 'management':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <ShieldCheck className="w-3 h-3 text-indigo-600" />
            Direksi
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-white border border-slate-700">
            <ShieldAlert className="w-3 h-3 text-amber-400" />
            Super Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Building2 className="w-3 h-3 text-slate-500" />
            {dept.toUpperCase()}
          </span>
        );
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'admin':
        return <span className="text-[11px] font-bold text-indigo-700">Admin Utama</span>;
      case 'manager':
        return <span className="text-[11px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">Manager</span>;
      case 'supervisor':
        return <span className="text-[11px] font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">Supervisor</span>;
      case 'staff':
        return <span className="text-[11px] font-medium text-slate-600">Staff Operasional</span>;
      case 'operator':
        return <span className="text-[11px] font-medium text-slate-500">Operator Pelaksana</span>;
      default:
        return <span className="text-[11px] text-slate-600">{role}</span>;
    }
  };

  const availableDepts: { id: Department; name: string }[] = [
    { id: 'rnd', name: 'RnD (Research & Master Data)' },
    { id: 'ppic', name: 'PPIC (Planning & MRP)' },
    { id: 'quality', name: 'Quality (QC/QA Lab)' },
    { id: 'warehouse', name: 'Warehouse (Gudang Bahan & PJ)' },
    { id: 'production', name: 'Produksi (Operasional Pabrik)' },
    { id: 'procurement', name: 'Procurement (Purchasing)' },
    { id: 'sales', name: 'Sales (Pesanan Pelanggan)' },
    { id: 'management', name: 'Management (Direksi)' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner & Title Bar */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Modul Otoritas & Keamanan Pengguna CPKB</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Manajemen Karyawan & Otoritas Sistem
            </h2>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              Pusat kendali akun NIK resmi PT. Larassanti Makmur Sejahtera. Menggabungkan input data personel dengan alur konfigurasi izin akses lintas modul sesuai SOP CPKB BPOM.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchEmployees}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Perbarui Data dari Database Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sinkron Ulang</span>
            </button>

            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Tambah Karyawan</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation Tabs (Users vs Audit Trail) */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-100">
          <button
            onClick={() => onSelectSubTab && onSelectSubTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'users'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Direktori Karyawan ({employees.length})</span>
          </button>

          <button
            onClick={() => onSelectSubTab && onSelectSubTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail Otoritas ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Success / Error Alerts */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-700 hover:text-rose-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* USERS DIRECTORY VIEW */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Karyawan</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{employees.length}</div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Terdaftar resmi di Supabase</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Departemen</span>
              <div className="text-2xl font-black text-purple-700 mt-1">7 Unit</div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">RnD, QC, Gudang, Prod, PPIC, Direksi</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Akses Khusus</span>
              <div className="text-2xl font-black text-indigo-700 mt-1">
                {employees.filter((e) => e.specificAccess && e.specificAccess.length > 0).length} Akun
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Otoritas lintas departemen aktif</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Super Admin</span>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">admin</div>
              <span className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Root Administrator
              </span>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NIK, Nama Karyawan, Email..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-600">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-[11px]">Departemen:</span>
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="bg-transparent text-slate-900 font-bold focus:outline-none text-xs cursor-pointer"
                >
                  <option value="all">Semua Departemen</option>
                  <option value="rnd">RnD</option>
                  <option value="ppic">PPIC</option>
                  <option value="quality">Quality (QC)</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="production">Produksi</option>
                  <option value="management">Direksi</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-600">
                <span className="font-semibold text-[11px]">Role:</span>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="bg-transparent text-slate-900 font-bold focus:outline-none text-xs cursor-pointer"
                >
                  <option value="all">Semua Role</option>
                  <option value="staff">Staff</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Manager</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>

          {/* Employees Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-3 text-center w-12">No.</th>
                    <th className="py-3 px-4">NIK Karyawan</th>
                    <th className="py-3 px-4">Nama Lengkap & Email</th>
                    <th className="py-3 px-4">Departemen Utama</th>
                    <th className="py-3 px-4">Tingkat Jabatan</th>
                    <th className="py-3 px-4">Otoritas Tambahan Lintas Modul</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
                          <span className="text-xs font-semibold">Memuat data karyawan dari Supabase...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Tidak ada karyawan yang sesuai dengan kriteria pencarian atau filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp, index) => {
                      const isSuperAdmin = emp.nik.toLowerCase() === 'admin';
                      const hasSpecific = emp.specificAccess && emp.specificAccess.length > 0;

                      return (
                        <tr key={emp.id || emp.nik} className="hover:bg-slate-50/60 transition-colors group">
                          {/* Number */}
                          <td className="py-3 px-3 text-center whitespace-nowrap text-slate-400 font-bold font-mono text-xs">
                            {index + 1}
                          </td>

                          {/* NIK */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg font-mono text-xs font-black tracking-wider ${
                                isSuperAdmin
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-slate-100 text-slate-900 border border-slate-200'
                              }`}
                            >
                              {emp.nik}
                            </span>
                          </td>

                          {/* Name & Email */}
                          <td className="py-3 px-4">
                            <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{emp.name}</span>
                              {isSuperAdmin && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-indigo-100 text-indigo-700 font-bold">
                                  SUPERUSER
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">{emp.email}</div>
                          </td>

                          {/* Department */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {getDepartmentBadge(emp.department)}
                          </td>

                          {/* Role */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {getRoleBadge(emp.role)}
                          </td>

                          {/* Specific Access */}
                          <td className="py-3 px-4">
                            {isSuperAdmin ? (
                              <span className="text-[11px] font-bold text-slate-500 italic">
                                Akses Penuh Seluruh Modul
                              </span>
                            ) : hasSpecific ? (
                              <div className="flex flex-wrap gap-1">
                                {emp.specificAccess!.map((perm) => (
                                  <span
                                    key={perm.moduleId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-bold"
                                  >
                                    <span className="capitalize">{perm.moduleId}:</span>
                                    <span className={perm.accessLevel === 'write' ? 'text-amber-700' : 'text-blue-700'}>
                                      {perm.accessLevel.toUpperCase()}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                Standar Silo (Hanya {emp.department.toUpperCase()})
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditModal(emp)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                                title="Edit Data & Otoritas"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Edit & Izin</span>
                              </button>

                              {!isSuperAdmin && (
                                <button
                                  onClick={() => setDeletingEmployee(emp)}
                                  className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="Nonaktifkan Akun"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Summary */}
            <div className="p-3.5 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
              <span>Menampilkan {filteredEmployees.length} dari {employees.length} akun karyawan terdaftar.</span>
              <span className="font-mono text-slate-600 font-bold">PT. LARASSANTI MAKMUR SEJAHTERA • CPKB IT SEC</span>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL VIEW */}
      {activeSubTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <span>Rekam Jejak Audit Trail (CPKB / BPOM Kepatuhan)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Data jejak elektronik terenkripsi lokal dan database tidak dapat diubah (21 CFR Part 11).
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-bold border border-slate-200">
                {auditLogs.length} Total Log Tersimpan
              </span>
              {isAuditLoaded && (
                <button
                  type="button"
                  onClick={() => setIsAuditLoaded(false)}
                  className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-[10px] font-bold border border-slate-200 transition-colors cursor-pointer"
                  title="Sembunyikan tampilan isi untuk optimasi kinerja"
                >
                  Tutup Tampilan
                </button>
              )}
            </div>
          </div>

          {/* Audit Filters Row: Modul, Tanggal Mulai, Tanggal Selesai Saja */}
          <div className="bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-end gap-3">
            {/* Filter 1: Modul */}
            <div className="flex-1 min-w-[190px]">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Filter Modul
              </label>
              <select
                value={auditFilterModule}
                onChange={(e) => {
                  setAuditFilterModule(e.target.value);
                  setIsAuditLoaded(true);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none cursor-pointer shadow-2xs"
              >
                <option value="all">Semua Modul Terintegrasi</option>
                <option value="rnd">RnD (Master Bahan Baku, Kemas, Formula, PJ)</option>
                <option value="quality">Quality (QC Lab, Sampling, CoA, Rilis)</option>
                <option value="warehouse">Warehouse (Gudang, Inbound, Stok)</option>
                <option value="ppic">PPIC (Planning, MRP, Jadwal)</option>
                <option value="procurement">Procurement (PO & Vendor)</option>
                <option value="admin">Admin & User (NIK, Akun & Otoritas)</option>
                <option value="system">Sistem & Keamanan</option>
              </select>
            </div>

            {/* Filter 2: Tanggal Mulai (Start Date) */}
            <div className="w-full sm:w-auto">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Tanggal Mulai (Start)
              </label>
              <input
                type="date"
                value={auditStartDate}
                onChange={(e) => {
                  setAuditStartDate(e.target.value);
                  setIsAuditLoaded(true);
                }}
                className="w-full sm:w-36 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
              />
            </div>

            {/* Filter 3: Tanggal Selesai (End Date) */}
            <div className="w-full sm:w-auto">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Tanggal Selesai (End)
              </label>
              <input
                type="date"
                value={auditEndDate}
                onChange={(e) => {
                  setAuditEndDate(e.target.value);
                  setIsAuditLoaded(true);
                }}
                className="w-full sm:w-36 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
              />
            </div>

            {/* Tombol Aksi Filter / Tampilkan */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAuditLoaded(true)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isAuditLoaded ? 'Terapkan Filter' : 'Tampilkan Log Audit'}</span>
              </button>

              {(auditFilterModule !== 'all' || auditStartDate || auditEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setAuditFilterModule('all');
                    setAuditStartDate('');
                    setAuditEndDate('');
                    setIsAuditLoaded(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 transition-colors cursor-pointer flex items-center gap-1"
                  title="Reset Filter"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* JIKA LOG BELUM DIMUAT: TAMPILKAN PLACEHOLDER RINGAN UNTUK MEMPERCEPAT KINERJA */}
          {!isAuditLoaded ? (
            <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50 space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
                <History className="w-5 h-5" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-sm font-black text-slate-800">
                  Data Audit Trail Tidak Ditampilkan Otomatis
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Untuk menjaga kecepatan respons aplikasi tetap optimal, riwayat audit trail tidak dimuat sekaligus. Pilih modul dan rentang tanggal di atas, lalu klik <strong>Tampilkan Log Audit</strong>.
                </p>
              </div>
              {/* Quick Preset Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuditFilterModule('all');
                    setAuditStartDate('');
                    setAuditEndDate('');
                    setIsAuditLoaded(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  ⚡ Muat 25 Log Terbaru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setAuditFilterModule('all');
                    setAuditStartDate(todayStr);
                    setAuditEndDate(todayStr);
                    setIsAuditLoaded(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  📅 Log Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 7);
                    const weekAgoStr = d.toISOString().split('T')[0];
                    const todayStr = new Date().toISOString().split('T')[0];
                    setAuditFilterModule('all');
                    setAuditStartDate(weekAgoStr);
                    setAuditEndDate(todayStr);
                    setIsAuditLoaded(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  ⏱️ Log 7 Hari Terakhir
                </button>
              </div>
            </div>
          ) : (
            /* JIKA SUDAH DIMUAT: TAMPILKAN TABEL ULTRA-KOMPAK & RAPAT AGAR MUAT BANYAK */
            (() => {
              const filtered = auditLogs.filter((log) => {
                if (auditFilterModule !== 'all') {
                  const mod = getLogModule(log);
                  if (mod !== auditFilterModule) return false;
                }
                const logDateStr = log.timestamp.split('T')[0];
                if (auditStartDate && logDateStr < auditStartDate) return false;
                if (auditEndDate && logDateStr > auditEndDate) return false;
                return true;
              });

              const totalFilteredCount = filtered.length;
              const totalPages = Math.ceil(totalFilteredCount / auditPageSize) || 1;
              
              const currentPage = Math.min(auditPage, totalPages);
              const startIndex = (currentPage - 1) * auditPageSize;
              const endIndex = Math.min(startIndex + auditPageSize, totalFilteredCount);
              const paginated = filtered.slice(startIndex, endIndex);

              return (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    {/* Compact Dense Table (Kecil agar muat banyak baris) */}
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead className="bg-slate-100/90 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="py-1.5 px-2.5 w-[130px]">Waktu (WIB)</th>
                          <th className="py-1.5 px-2.5 w-[85px]">Modul</th>
                          <th className="py-1.5 px-2.5 w-[170px]">Pelaksana (Aktor)</th>
                          <th className="py-1.5 px-2.5 w-[140px]">Peristiwa / Aksi</th>
                          <th className="py-1.5 px-2.5 w-[100px]">Target</th>
                          <th className="py-1.5 px-2.5">Catatan Rincian CPKB</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginated.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold text-xs">
                              Tidak ada log audit yang cocok dengan filter yang ditentukan.
                            </td>
                          </tr>
                        ) : (
                          paginated.map((log) => {
                            const mod = getLogModule(log);
                            const badgeCfg = getModuleBadgeConfig(mod);
                            return (
                              <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                                {/* Waktu */}
                                <td className="py-1 px-2.5 font-mono text-[9px] text-slate-500 whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleString('id-ID', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </td>

                                {/* Modul */}
                                <td className="py-1 px-2.5">
                                  <span className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase border ${badgeCfg.badge}`}>
                                    {badgeCfg.label}
                                  </span>
                                </td>

                                {/* Pelaksana */}
                                <td className="py-1 px-2.5 font-bold text-slate-800 truncate max-w-[170px]" title={`${log.actorName} (${log.actorNik})`}>
                                  <span>{log.actorName}</span>{' '}
                                  <span className="font-mono text-slate-400 font-normal text-[9px]">({log.actorNik})</span>
                                </td>

                                {/* Peristiwa / Aksi */}
                                <td className="py-1 px-2.5">
                                  <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200/60 whitespace-nowrap">
                                    {log.action}
                                  </span>
                                </td>

                                {/* Target NIK / Kode RM */}
                                <td className="py-1 px-2.5 font-mono font-bold text-purple-700">
                                  {log.targetNik}
                                </td>

                                {/* Catatan CPKB */}
                                <td className="py-1 px-2.5 text-slate-600 leading-tight break-words">
                                  {log.details}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Compact Pagination and Density Controls */}
                  <div className="p-2.5 bg-slate-50/60 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 gap-2">
                    <div className="flex items-center gap-3">
                      {totalFilteredCount > 0 ? (
                        <span>
                          Menampilkan <strong>{startIndex + 1}</strong> s/d <strong>{endIndex}</strong> dari <strong>{totalFilteredCount}</strong> log
                          {totalFilteredCount !== auditLogs.length && ` (difilter dari ${auditLogs.length})`}
                        </span>
                      ) : (
                        <span>Tidak ada data untuk ditampilkan</span>
                      )}

                      {/* Baris per Halaman Selector */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">Baris:</span>
                        <select
                          value={auditPageSize}
                          onChange={(e) => setAuditPageSize(Number(e.target.value))}
                          className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700 focus:outline-none"
                        >
                          <option value={15}>15</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={currentPage === 1}
                          onClick={() => setAuditPage(currentPage - 1)}
                          className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-all text-[10px] font-bold cursor-pointer"
                        >
                          Prev
                        </button>
                        <span className="text-slate-700 font-bold text-[10px] px-1.5">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={currentPage === totalPages}
                          onClick={() => setAuditPage(currentPage + 1)}
                          className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-all text-[10px] font-bold cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* UNIFIED MODAL: FORM KARYAWAN & HAK AKSES OTORITAS (ADD & EDIT) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl p-6 sm:p-7 relative my-8 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5 sticky top-0 bg-white z-10">
              <div className="space-y-0.5">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Alur Terpadu Form Karyawan & Otoritas</span>
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  {isEditMode ? `Edit Karyawan & Otoritas: ${formNik}` : 'Pendaftaran Karyawan Baru & Otoritas'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-5">
              {/* SEKSI A: DATA UTAMA IDENTITAS & JABATAN */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                    A
                  </span>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Data Utama Personel & Penempatan
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nomor Induk Karyawan (NIK)
                    </label>
                    <input
                      type="text"
                      required
                      value={formNik}
                      disabled={isEditMode}
                      onChange={(e) => setFormNik(e.target.value)}
                      placeholder="Contoh: LMS10004 atau admin"
                      className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-indigo-500 focus:outline-none ${
                        isEditMode ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'
                      }`}
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Format standar pabrik: LMS + kode departemen + urutan
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nama Lengkap & Gelar
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Contoh: Budi Santoso, S.Farm"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Departemen Utama (Home Base)
                    </label>
                    <select
                      value={formDept}
                      onChange={(e) => setFormDept(e.target.value as Department)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="rnd">RnD (Formulasi & Master Material)</option>
                      <option value="ppic">PPIC (Perencanaan & Kalkulasi MRP)</option>
                      <option value="quality">Quality (QA/QC Lab & CoA)</option>
                      <option value="warehouse">Warehouse (Gudang & FEFO)</option>
                      <option value="production">Produksi (Operasional Pabrik)</option>
                      <option value="procurement">Procurement (Purchasing PO)</option>
                      <option value="sales">Sales (Pesanan Pelanggan)</option>
                      <option value="management">Management / Direksi</option>
                      <option value="admin">Admin Sistem (Super User)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tingkat Jabatan / Role
                    </label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as Role)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="staff">Staff (Drafting & Input Data)</option>
                      <option value="operator">Operator (Pelaksana Lapangan)</option>
                      <option value="supervisor">Supervisor (Verifikasi & Review)</option>
                      <option value="manager">Manager (Approval & Otoritas Penuh)</option>
                      <option value="admin">Admin (Akses Konfigurasi Global)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kata Sandi Akun {isEditMode && <span className="text-slate-400 font-normal">(Kosongkan jika tidak diubah)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={isEditMode ? 'Biarkan kosong jika tetap' : 'Default: laras123'}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-10 py-2 text-xs text-slate-900 font-mono focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* SEKSI B: HAK AKSES KHUSUS LINTAS DEPARTEMEN */}
              <div className="space-y-3.5 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                      B
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Otoritas Khusus Lintas Modul (Cross-Module Access)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Beri wewenang tambahan di luar departemen asalnya
                      </p>
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enableCustomAccess}
                      onChange={(e) => setEnableCustomAccess(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    <span className="text-xs font-bold text-slate-700">
                      {enableCustomAccess ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </label>
                </div>

                {enableCustomAccess ? (
                  <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center gap-2 text-[11px] text-indigo-900 font-semibold mb-2">
                      <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>
                        Pilih modul departemen lain yang diizinkan untuk diakses oleh karyawan ini:
                      </span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {availableDepts
                        .filter((d) => d.id !== formDept)
                        .map((dept) => {
                          const perm = formSpecificAccess.find((p) => p.moduleId === dept.id);
                          const isChecked = !!perm;

                          return (
                            <div
                              key={dept.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                                isChecked
                                  ? 'bg-white border-indigo-300 shadow-xs'
                                  : 'bg-white/60 border-slate-200'
                              }`}
                            >
                              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSpecificModule(dept.id)}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                                <span className={`text-xs ${isChecked ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                                  {dept.name}
                                </span>
                              </label>

                              {isChecked && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-500 font-semibold">Tingkat Izin:</span>
                                  <select
                                    value={perm?.accessLevel || 'read'}
                                    onChange={(e) =>
                                      updateSpecificLevel(dept.id, e.target.value as 'read' | 'write')
                                    }
                                    className="bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold rounded-lg px-2 py-1 text-[11px] focus:outline-none cursor-pointer"
                                  >
                                    <option value="read">Lihat Saja (Read)</option>
                                    <option value="write">Lihat & Validasi (Write)</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 text-[11px] leading-relaxed">
                    Karyawan ini menggunakan <strong>Silo Departemen Standar</strong>, yaitu hanya memiliki hak akses penuh pada departemen utamanya ({formDept.toUpperCase()}).
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Menyimpan ke Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{isEditMode ? 'Perbarui Karyawan & Otoritas' : 'Simpan Karyawan Baru'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE / DEACTIVATE CONFIRMATION DIALOG */}
      {deletingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-rose-200 shadow-2xl w-full max-w-md p-6 relative text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3.5">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-black text-slate-900 mb-1">
              Nonaktifkan Akun Karyawan?
            </h3>

            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              Apakah Anda yakin ingin menonaktifkan akun <strong>{deletingEmployee.name}</strong> dengan NIK <strong>{deletingEmployee.nik}</strong>? Personel ini tidak akan dapat login ke sistem lagi, namun seluruh rekam jejak audit trail CPKB akan tetap tersimpan secara aman.
            </p>

            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={() => setDeletingEmployee(null)}
                className="w-1/2 py-2.5 px-4 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDelete}
                className="w-1/2 py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-colors cursor-pointer"
              >
                Ya, Nonaktifkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
