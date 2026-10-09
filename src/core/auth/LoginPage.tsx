import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import {
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Boxes,
  Award,
  ShieldAlert,
  Camera,
  QrCode,
  X,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { Logo } from '../../components/Logo';
import { UniversalQrScannerModal } from '../../components/UniversalQrScannerModal';

interface SupabaseAccountItem {
  nik: string;
  name: string;
  role: string;
  departmentName: string;
  deptKey: 'admin' | 'rnd' | 'quality' | 'warehouse' | 'production' | 'ppic' | 'management';
  desc: string;
}

const SUPABASE_REGISTERED_ACCOUNTS: SupabaseAccountItem[] = [
  // Super Admin
  {
    nik: 'admin',
    name: 'ADMIN',
    role: 'Super Administrator',
    departmentName: 'Admin Sistem',
    deptKey: 'admin',
    desc: 'Otoritas penuh seluruh modul & hak akses',
  },
  // RnD
  {
    nik: 'LMS10001',
    name: 'Daffa',
    role: 'Staff RnD',
    departmentName: 'RnD Formulasi',
    deptKey: 'rnd',
    desc: 'Input raw material (B), kemas (K), produk (PJ)',
  },
  {
    nik: 'LMS10002',
    name: 'Tanzil',
    role: 'Supervisor RnD',
    departmentName: 'RnD Formulasi',
    deptKey: 'rnd',
    desc: 'Review formula bulk & spesifikasi teknis',
  },
  {
    nik: 'LMS10003',
    name: 'Lanny',
    role: 'Manager RnD',
    departmentName: 'RnD Formulasi',
    deptKey: 'rnd',
    desc: 'Approval resep bulk & kalkulator BOM',
  },
  // Quality (QC/QA)
  {
    nik: 'LMS20001',
    name: 'Ayu',
    role: 'Staff QC',
    departmentName: 'Quality (QC Lab)',
    deptKey: 'quality',
    desc: 'Sampling bahan karantina & uji laboratorium',
  },
  {
    nik: 'LMS20002',
    name: 'Lala',
    role: 'Supervisor QC',
    departmentName: 'Quality (QC Lab)',
    deptKey: 'quality',
    desc: 'Verifikasi hasil uji lab & sertifikasi CoA',
  },
  {
    nik: 'LMS20003',
    name: 'Michael',
    role: 'Manager QA',
    departmentName: 'Quality Assurance',
    deptKey: 'quality',
    desc: 'Otoritas final rilis bets sesuai CPKB BPOM',
  },
  // Warehouse (Gudang)
  {
    nik: 'LMS30001',
    name: 'Heni',
    role: 'Staff Warehouse',
    departmentName: 'Warehouse (Gudang)',
    deptKey: 'warehouse',
    desc: 'Penerimaan PO & penimbangan bahan FEFO',
  },
  {
    nik: 'LMS30002',
    name: 'Maulana',
    role: 'Supervisor Warehouse',
    departmentName: 'Warehouse (Gudang)',
    deptKey: 'warehouse',
    desc: 'Pengawasan stok karantina & area sampling',
  },
  {
    nik: 'LMS30003',
    name: 'Haryani',
    role: 'Manager Warehouse',
    departmentName: 'Warehouse (Gudang)',
    deptKey: 'warehouse',
    desc: 'Approval transfer material & stok produk jadi',
  },
  // Produksi
  {
    nik: 'LMS40001',
    name: 'Lisa',
    role: 'Staff Produksi',
    departmentName: 'Produksi Pabrik',
    deptKey: 'production',
    desc: 'Operator mixing, filling & peracikan bets',
  },
  {
    nik: 'LMS40002',
    name: 'Ilham',
    role: 'Supervisor Produksi',
    departmentName: 'Produksi Pabrik',
    deptKey: 'production',
    desc: 'Pengawasan batch record elektronik & sanitasi',
  },
  {
    nik: 'LMS40003',
    name: 'Ika Suci',
    role: 'Manager Produksi',
    departmentName: 'Produksi Pabrik',
    deptKey: 'production',
    desc: 'Manajemen kapasitas line & utilitas mesin',
  },
  // PPIC
  {
    nik: 'LMS50001',
    name: 'Heri',
    role: 'Staff PPIC',
    departmentName: 'PPIC Planning',
    deptKey: 'ppic',
    desc: 'Kalkulasi kebutuhan bahan baku MRP & PO',
  },
  {
    nik: 'LMS50002',
    name: 'Shinta',
    role: 'Supervisor PPIC',
    departmentName: 'PPIC Planning',
    deptKey: 'ppic',
    desc: 'Jadwal rencana produksi & supply chain',
  },
  {
    nik: 'LMS50003',
    name: 'Adha Winatie',
    role: 'Manager PPIC',
    departmentName: 'PPIC Planning',
    deptKey: 'ppic',
    desc: 'Approval purchase requisition & jadwal bets',
  },
  // Management / Direksi
  {
    nik: 'LMS90001',
    name: 'Hermansyah Rusli',
    role: 'Direktur Utama',
    departmentName: 'Direksi / Management',
    deptKey: 'management',
    desc: 'Executive summary & monitoring performa pabrik',
  },
  {
    nik: 'LMS90002',
    name: 'Herlina',
    role: 'Direktur Keuangan',
    departmentName: 'Direksi / Management',
    deptKey: 'management',
    desc: 'Analisis COGS, valuasi inventory & anggaran',
  },
  {
    nik: 'LMS90003',
    name: 'Dewi Sartika M',
    role: 'General Manager',
    departmentName: 'Direksi / Management',
    deptKey: 'management',
    desc: 'Pengendalian operasi strategis hulu-ke-hilir',
  },
  {
    nik: 'LMS90004',
    name: 'Tita',
    role: 'Konsultan Manajemen',
    departmentName: 'Direksi / Management',
    deptKey: 'management',
    desc: 'Audit kepatuhan CPKB & integrasi sistem',
  },
];

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!username.trim()) {
      setErrorMessage('Silakan masukkan NIK Karyawan atau admin.');
      return;
    }
    if (!password) {
      setErrorMessage('Silakan masukkan Kata Sandi akun Anda.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(username, password);
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Autentikasi gagal. NIK/Username atau Kata Sandi yang dimasukkan tidak sesuai.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0d071e] text-white flex flex-col justify-between p-4 sm:p-8 lg:p-12 relative overflow-hidden font-sans select-none">
      {/* Deep Dark Atmosphere Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full bg-purple-900/30 blur-[140px]"></div>
        <div className="absolute top-1/2 -right-32 w-[600px] h-[600px] rounded-full bg-indigo-950/40 blur-[150px]"></div>
        <div className="absolute -bottom-24 left-1/3 w-[550px] h-[550px] rounded-full bg-fuchsia-950/30 blur-[130px]"></div>
        
        {/* Subtle grid texture overlay for industrial precision feel */}
        <div 
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(#c084fc 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        ></div>
      </div>

      {/* Main Grid Content (2 Columns) */}
      <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start flex-1 py-4">
        
        {/* LEFT COLUMN: Brand Identity, Badge, Hero Headline & CPKB Overview */}
        <div className="lg:col-span-6 space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between gap-4">
            <Logo showText={true} size="md" variant="dark" />
            
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-bold transition-all shadow-md shadow-teal-950/40 cursor-pointer active:scale-95"
            >
              <Camera className="w-4 h-4 text-teal-400" />
              <span>Pindai QR CPKB</span>
            </button>
          </div>

          {/* Badge: Sistem Gudang & Quality Control CPKB */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-purple-950/80 border border-purple-700/50 text-purple-300 text-xs font-bold shadow-xs">
            <Award className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Sistem Gudang & Quality Control CPKB BPOM</span>
          </div>

          {/* Hero Headline */}
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.12]">
              Presisi Operasional,
            </h1>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-purple-400 tracking-tight leading-[1.12]">
              Integritas Mutu
            </h1>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.12]">
              Kosmetika.
            </h1>
          </div>

          {/* Description */}
          <p className="text-xs sm:text-sm text-purple-100/70 leading-relaxed max-w-xl">
            Platform operasional terpadu PT. Larassanti Makmur Sejahtera. Terintegrasi penuh dengan <strong>20 akun resmi di database Supabase</strong> untuk penelusuran hulu-ke-hilir: Penerimaan Gudang, Pengujian Laboratorium QC, Batch Record CPKB BPOM, Manajemen BOM Formula RnD, hingga Pengiriman Produk Jadi.
          </p>

          {/* 2 Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1 max-w-xl">
            <div className="bg-white/[0.04] border border-purple-500/20 backdrop-blur-md rounded-2xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Standar CPKB BPOM</h3>
                  <p className="text-[11px] text-purple-200/60 mt-1 leading-relaxed">
                    Karantina material, validasi sampling QC, dan rilis CoA otomatis.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-purple-500/20 backdrop-blur-md rounded-2xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300 shrink-0">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Traceability Bets</h3>
                  <p className="text-[11px] text-purple-200/60 mt-1 leading-relaxed">
                    Rekam jejak elektronik batch hulu ke hilir secara real-time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Scanner Card (Akses Bebas Semua Orang / Tamu / Auditor) */}
          <div className="bg-gradient-to-r from-teal-950/60 to-purple-950/60 border border-teal-500/30 backdrop-blur-md rounded-2xl p-4 shadow-lg shadow-teal-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 max-w-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600/30 border border-teal-500/50 flex items-center justify-center text-teal-300 shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white">Pindai QR Label & Wadah Drum</h3>
                  <span className="px-1.5 py-0.2 bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[9px] rounded font-bold font-mono">
                    Akses Bebas
                  </span>
                </div>
                <p className="text-[11px] text-purple-200/70 mt-0.5 leading-relaxed">
                  Verifikasi status uji mutu CPKB & data sampling wadah secara instan tanpa perlu login.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="w-full sm:w-auto px-3.5 py-2 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center justify-center gap-1.5 shadow-md shadow-teal-950/50 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Buka Kamera</span>
            </button>
          </div>

          {/* Notice: Penambahan Karyawan Terpusat */}
          <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-700/40 max-w-xl text-xs text-indigo-200/90 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-white text-[11px] uppercase tracking-wider block">
                Kebijakan Manajemen Personel Terpusat
              </span>
              <p className="text-[11px] text-purple-200/70 leading-relaxed">
                Pendaftaran karyawan baru dan konfigurasi otoritas lintas departemen dilakukan secara aman oleh Administrator melalui <strong>Modul Admin & Otoritas Sistem</strong> di dalam aplikasi.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Floating Card Portal Masuk & Supabase Demo Accounts */}
        <div className="lg:col-span-6 flex flex-col items-center lg:items-end w-full space-y-4">
          <div className="w-full max-w-xl bg-[#150a2a]/95 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-purple-950/80 relative">
            
            {/* Card Title & Subtitle */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Portal Masuk
                </h2>
                <p className="text-xs text-purple-200/70 mt-0.5">
                  Silakan masuk dengan NIK dan kata sandi akun terdaftar
                </p>
              </div>
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Supabase Synced</span>
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1">
                  Nomor Induk Karyawan (NIK) atau admin
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-purple-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Masukkan NIK atau admin (contoh: admin, LMS10001)"
                    className="w-full rounded-2xl border border-purple-700/50 bg-purple-950/40 pl-10 pr-4 py-2.5 text-xs text-white placeholder-purple-300/40 focus:bg-purple-950/80 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 transition-all font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1">
                  Kata Sandi
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-purple-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-purple-700/50 bg-purple-950/40 pl-10 pr-10 py-2.5 text-xs text-white placeholder-purple-300/40 focus:bg-purple-950/80 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 transition-all font-medium font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-purple-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:from-purple-700 active:to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/50 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Memverifikasi Sesi...
                  </span>
                ) : (
                  <>
                    <span>Masuk ke Sistem{username ? ` (${username})` : ''}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Card Footer: SSL & Audit Trail */}
            <div className="mt-4 pt-3.5 border-t border-purple-900/50 flex items-center justify-between text-[10px] text-purple-300/60 font-semibold">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                Enkripsi SSL 256-bit
              </span>
              <span className="text-purple-300 font-bold">
                Audit Trail CPKB BPOM
              </span>
            </div>

          </div>
        </div>
      </div>

      {/* BOTTOM FOOTER */}
      <div className="relative z-10 max-w-7xl mx-auto w-full pt-6 border-t border-purple-900/40 flex flex-col sm:flex-row items-center justify-between text-[11px] text-purple-300/50 gap-2">
        <span>© 2026 PT. Larassanti Makmur Sejahtera</span>
        <span className="font-mono text-[10px] font-bold text-purple-400/80 tracking-wider">
          CPKB ENTERPRISE V5.0
        </span>
      </div>

      {/* POPUP MODAL: Pop-up Kesalahan NIK atau Password */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#180e30] border border-rose-500/40 rounded-3xl w-full max-w-md p-6 sm:p-7 shadow-2xl text-white relative text-center">
            <button
              onClick={() => setErrorMessage(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-purple-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Warning Shield Icon */}
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400 shadow-lg shadow-rose-950/40">
              <AlertCircle className="w-7 h-7 text-rose-400" />
            </div>

            <h3 className="text-lg font-black text-white mb-1.5 tracking-tight">
              Kredensial Tidak Sesuai
            </h3>

            <p className="text-xs text-purple-200/80 leading-relaxed mb-6 px-3">
              {errorMessage}
            </p>

            <div className="space-y-2">
              <button
                onClick={() => setErrorMessage(null)}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white transition-all shadow-md shadow-rose-950/50 cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Coba Masukkan Kembali</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal QR Camera Scanner Modal */}
      <UniversalQrScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
      />
    </div>
  );
};
