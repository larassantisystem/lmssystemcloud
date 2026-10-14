import React, { useState } from 'react';
import {
  Database,
  Upload,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Key,
  Globe,
  FileCode,
  FileJson,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Layers,
  Users,
  Package,
  FlaskConical,
  FileSpreadsheet,
  AlertCircle,
  Copy,
  Search,
  PlusCircle,
  Terminal,
  Code
} from 'lucide-react';

interface SupabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrationComplete?: () => void;
}

interface TableOption {
  id: string;
  sourceTable: string;
  targetTable: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

const BASE_TABLES: TableOption[] = [
  { id: 'profiles', sourceTable: 'profiles', targetTable: 'profiles', label: 'User Profiles & Akun Karyawan', icon: <Users className="w-4 h-4 text-purple-600" /> },
  { id: 'warehouse_grn', sourceTable: 'warehouse_grn', targetTable: 'warehouse_grn', label: 'Riwayat Kedatangan Gudang (GRN)', icon: <Database className="w-4 h-4 text-rose-600" /> },
  { id: 'raw_materials', sourceTable: 'raw_materials', targetTable: 'raw_materials', label: 'Master Bahan Baku (R&D)', icon: <FlaskConical className="w-4 h-4 text-blue-600" /> },
  { id: 'packaging_materials', sourceTable: 'packaging_materials', targetTable: 'packaging_materials', label: 'Master Bahan Kemas', icon: <Layers className="w-4 h-4 text-indigo-600" /> },
  { id: 'products', sourceTable: 'products', targetTable: 'products', label: 'Master Produk Jadi', icon: <Package className="w-4 h-4 text-emerald-600" /> },
  { id: 'product_variants', sourceTable: 'product_variants', targetTable: 'product_variants', label: 'Varian Produk & SKU', icon: <Package className="w-4 h-4 text-teal-600" /> },
  { id: 'bulk_formulations', sourceTable: 'bulk_formulations', targetTable: 'bulk_formulations', label: 'Master Formula Ruahan', icon: <FileSpreadsheet className="w-4 h-4 text-amber-600" /> },
  { id: 'qc_inspection_reports', sourceTable: 'qc_inspection_reports', targetTable: 'qc_inspection_reports', label: 'Laporan Pemeriksaan QC', icon: <ShieldCheck className="w-4 h-4 text-teal-600" /> },
  { id: 'deviations', sourceTable: 'deviations', targetTable: 'deviations', label: 'Penyimpangan Mutu (Deviations)', icon: <AlertCircle className="w-4 h-4 text-orange-600" /> },
  { id: 'stock_movements', sourceTable: 'stock_movements', targetTable: 'stock_movements', label: 'Mutasi Stok & Kartu Gudang', icon: <Clock className="w-4 h-4 text-slate-600" /> },
];

export const SupabaseMigrationModal: React.FC<SupabaseMigrationModalProps> = ({
  isOpen,
  onClose,
  onMigrationComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'direct' | 'file' | 'sql-helper'>('direct');

  // Direct Connection Credentials
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [wipeExisting, setWipeExisting] = useState(true); // User confirmed clean overwrite

  // Table List & Selection
  const [tablesList, setTablesList] = useState<TableOption[]>(BASE_TABLES);
  const [selectedTables, setSelectedTables] = useState<string[]>(BASE_TABLES.map((t) => t.id));
  const [tableMapping, setTableMapping] = useState<Record<string, string>>({});

  // Custom Table Inspector
  const [customTableName, setCustomTableName] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<{
    success: boolean;
    status?: number;
    tableName?: string;
    count?: number;
    columns?: string[];
    sampleRows?: any[];
    targetD1Table?: string;
    message?: string;
  } | null>(null);

  // Connection Test & Detection States
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    totalRecords?: number;
    tableCounts?: Record<string, number>;
    tableMapping?: Record<string, string>;
    latencyMs?: number;
    keyRole?: string;
    warningMessage?: string;
    discoveredTables?: string[];
  } | null>(null);

  // Migration Execution States
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationSummary, setMigrationSummary] = useState<Record<string, any> | null>(null);
  const [totalMigrated, setTotalMigrated] = useState<number | null>(null);

  // File & Paste Upload States
  const [selectedFileTable, setSelectedFileTable] = useState('warehouse_grn');
  const [fileWipeExisting, setFileWipeExisting] = useState(false);
  const [uploadMode, setUploadMode] = useState<'json' | 'sql'>('sql');
  const [pasteContent, setPasteContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [fileResult, setFileResult] = useState<{
    success: boolean;
    message: string;
    errorDetails?: string[];
    executed?: number;
    errors?: number;
  } | null>(null);

  // Copied alert state
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(label);
    setTimeout(() => setCopiedScript(null), 2500);
  };

  // Toggle table selection
  const handleToggleTable = (tableId: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  // 1. Test Supabase credentials, discover tables & row counts
  const handleTestConnection = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      alert('Mohon masukkan Supabase URL dan API Key terlebih dahulu.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/supabase/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: supabaseUrl.trim(),
          supabaseKey: supabaseKey.trim(),
        }),
      });

      const data = await res.json();
      setTestResult(data);

      if (data.success && data.tableCounts) {
        // Build updated table list including discovered aliases
        const newTables: TableOption[] = [...BASE_TABLES];
        const newMapping: Record<string, string> = { ...(data.tableMapping || {}) };

        // Update counts on base tables
        newTables.forEach((t) => {
          if (data.tableCounts[t.sourceTable] !== undefined) {
            t.count = data.tableCounts[t.sourceTable];
          }
        });

        // Add extra discovered tables (e.g. grn, auth.users, materials)
        for (const [discoveredName, count] of Object.entries(data.tableCounts as Record<string, number>)) {
          if (count >= 0 && !newTables.some((t) => t.sourceTable === discoveredName)) {
            const target = newMapping[discoveredName] || (discoveredName === 'auth.users' ? 'profiles' : discoveredName);
            newTables.push({
              id: discoveredName,
              sourceTable: discoveredName,
              targetTable: target,
              label: discoveredName === 'auth.users'
                ? 'Akun User Supabase Auth (auth.users)'
                : `Tabel "${discoveredName}" (Dipetakan ke ${target})`,
              icon: discoveredName === 'auth.users' ? <Users className="w-4 h-4 text-purple-600" /> : <Database className="w-4 h-4 text-emerald-600" />,
              count,
            });
          }
        }

        setTablesList(newTables);
        setTableMapping(newMapping);
        // Automatically select tables that have records
        const activeTableIds = newTables
          .filter((t) => (t.count ?? 0) > 0 || BASE_TABLES.some((b) => b.id === t.id))
          .map((t) => t.sourceTable);
        setSelectedTables(activeTableIds);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Koneksi gagal: ${err.message || 'Tidak dapat menghubungi server backend'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 2. Custom Table Inspector
  const handleInspectCustomTable = async () => {
    if (!customTableName.trim()) {
      alert('Masukkan nama tabel yang ingin diperiksa.');
      return;
    }
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      alert('Mohon isi Supabase URL dan API Key terlebih dahulu.');
      return;
    }

    setIsInspecting(true);
    setInspectResult(null);

    try {
      const res = await fetch('/api/supabase/inspect-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: supabaseUrl.trim(),
          supabaseKey: supabaseKey.trim(),
          tableName: customTableName.trim(),
        }),
      });

      const data = await res.json();
      setInspectResult(data);

      if (data.success && data.count >= 0) {
        // Add to tables list if not present
        const cleanName = customTableName.trim();
        if (!tablesList.some((t) => t.sourceTable === cleanName)) {
          const target = data.targetD1Table || cleanName;
          const newOpt: TableOption = {
            id: cleanName,
            sourceTable: cleanName,
            targetTable: target,
            label: `Tabel Kustom "${cleanName}" (Target: ${target})`,
            icon: <Database className="w-4 h-4 text-indigo-600" />,
            count: data.count,
          };
          setTablesList((prev) => [...prev, newOpt]);
          setSelectedTables((prev) => [...prev, cleanName]);
          setTableMapping((prev) => ({ ...prev, [cleanName]: target }));
        }
      }
    } catch (err: any) {
      setInspectResult({
        success: false,
        message: `Gagal memeriksa tabel: ${err.message}`,
      });
    } finally {
      setIsInspecting(false);
    }
  };

  // 3. Start full migration
  const handleStartMigration = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      alert('Mohon isi Supabase URL dan API Key.');
      return;
    }

    if (selectedTables.length === 0) {
      alert('Pilih setidaknya 1 tabel untuk dimigrasikan.');
      return;
    }

    const confirmMsg = wipeExisting
      ? 'PERINGATAN: Mode "Timpa Bersih" aktif. Data di Cloudflare D1 akan dihapus dan digantikan seluruhnya dengan data dari Supabase. Lanjutkan?'
      : 'Migrasi akan menggabungkan/memperbarui data dari Supabase ke Cloudflare D1. Lanjutkan?';

    if (!window.confirm(confirmMsg)) return;

    setIsMigrating(true);
    setMigrationSummary(null);
    setTotalMigrated(null);
    setMigrationLogs([
      `[${new Date().toLocaleTimeString()}] Memulai pipeline migrasi ke Cloudflare D1...`,
      `[${new Date().toLocaleTimeString()}] Mode: ${wipeExisting ? 'TIMPA BERSIH (Clean Overwrite)' : 'MERGE & UPSERT'}`,
      `[${new Date().toLocaleTimeString()}] Target ${selectedTables.length} tabel: ${selectedTables.join(', ')}...`,
    ]);

    try {
      const res = await fetch('/api/supabase/migrate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: supabaseUrl.trim(),
          supabaseKey: supabaseKey.trim(),
          wipeExisting,
          tables: selectedTables,
          tableMapping,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMigrationLogs((prev) => [
          ...prev,
          `[ERROR] Migrasi gagal: ${data.error || 'Terjadi kesalahan sistem'}`,
        ]);
        alert(`Migrasi gagal: ${data.error}`);
        return;
      }

      setMigrationSummary(data.summary);
      setTotalMigrated(data.totalInserted);

      setMigrationLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] SELESAI: ${data.totalInserted} baris data berhasil ditransfer ke database D1!`,
      ]);

      if (onMigrationComplete) {
        onMigrationComplete();
      }
    } catch (err: any) {
      setMigrationLogs((prev) => [...prev, `[FATAL] ${err.message}`]);
      alert(`Error migrasi: ${err.message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  // Handle file select (JSON or SQL)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPasteContent(content);
    };
    reader.readAsText(file);
  };

  // Execute File / Paste Import (JSON or SQL)
  const handleExecuteImportContent = async () => {
    const content = pasteContent.trim();
    if (!content) {
      alert('Pilih file backup atau tempelkan teks SQL/JSON terlebih dahulu.');
      return;
    }

    setIsUploadingFile(true);
    setFileResult(null);

    try {
      if (uploadMode === 'json' || content.startsWith('[') || (content.startsWith('{') && content.includes('"data"'))) {
        let rows: any[] = [];
        try {
          const parsed = JSON.parse(content);
          rows = Array.isArray(parsed) ? parsed : parsed.data || parsed.results || [];
        } catch (pe) {
          throw new Error('Format JSON tidak valid: ' + (pe as Error).message);
        }

        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error('Data JSON tidak berisi array baris data yang valid.');
        }

        const res = await fetch('/api/supabase/import-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName: selectedFileTable,
            rows,
            wipeExisting: fileWipeExisting,
          }),
        });
        const data = await res.json();
        setFileResult(data);
      } else {
        const res = await fetch('/api/supabase/import-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sqlContent: content,
            wipeExisting: fileWipeExisting,
          }),
        });
        const data = await res.json();
        setFileResult(data);
      }

      if (onMigrationComplete) {
        onMigrationComplete();
      }
    } catch (err: any) {
      setFileResult({ success: false, message: `Gagal impor: ${err.message}` });
    } finally {
      setIsUploadingFile(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                <span>Backup &amp; Migrasi Data Supabase ke Cloudflare D1</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  v2.0 Auto-Detect
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Transfer instan seluruh data GRN, Profil Karyawan, RnD, Mutu ke database persisten Cloudflare D1
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('direct')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'direct'
                ? 'bg-white text-slate-900 border-t-2 border-emerald-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-600" />
            <span>Koneksi Langsung (Direct API)</span>
          </button>
          <button
            onClick={() => setActiveTab('file')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'file'
                ? 'bg-white text-slate-900 border-t-2 border-emerald-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            <span>Upload / Tempel SQL &amp; JSON</span>
          </button>
          <button
            onClick={() => setActiveTab('sql-helper')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'sql-helper'
                ? 'bg-white text-slate-900 border-t-2 border-emerald-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-purple-600" />
            <span>Bantuan SQL Supabase (1-Klik Salin)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
          {activeTab === 'direct' && (
            <div className="space-y-5">
              {/* Credentials Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>1. Kredensial Supabase Sumber</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Dashboard Supabase &gt; Project Settings &gt; API
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Project URL (HTTPS)
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={supabaseUrl}
                        onChange={(e) => setSupabaseUrl(e.target.value)}
                        placeholder="https://xyzcompany.supabase.co"
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        API Key (Wajib: Service Role / Secret Key)
                      </label>
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                        Wajib service_role key
                      </span>
                    </div>
                    <div className="relative">
                      <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={supabaseKey}
                        onChange={(e) => setSupabaseKey(e.target.value)}
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        className="w-full pl-9 pr-10 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Kredensial hanya diproses langsung di memori backend untuk transfer data.
                  </span>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !supabaseUrl || !supabaseKey}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{isTesting ? 'Memeriksa & Mencari Data...' : 'Uji Koneksi & Cari Tabel'}</span>
                  </button>
                </div>
              </div>

              {/* WHY 0 ROWS EXPLANATION & RLS GUIDE */}
              {testResult && (testResult.totalRecords === 0 || testResult.keyRole === 'anon') && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-xs text-amber-950 space-y-3 shadow-xs">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1.5 flex-1">
                      <div className="font-bold text-sm text-amber-950">
                        Kenapa Hasilnya 0 Baris Padahal di Supabase Ada Banyak Data?
                      </div>
                      <p className="text-xs leading-relaxed text-amber-900">
                        {testResult.keyRole === 'anon' ? (
                          <>
                            Terdeteksi Anda memasukkan <strong>"anon key" (kunci publik)</strong>. Pada Supabase, fitur <strong>Row Level Security (RLS)</strong> aktif secara bawaan dan secara sengaja <strong>menyembunyikan seluruh baris data menjadi 0</strong> jika diakses menggunakan anon key tanpa user login!
                          </>
                        ) : (
                          <>
                            Koneksi ke Supabase berhasil, namun tabel mengembalikan 0 baris data. Hal ini disebabkan oleh <strong>kebijakan RLS (Row Level Security)</strong> Supabase atau nama tabel yang berbeda.
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-amber-200 rounded-lg p-3.5 text-[11px] text-slate-800 space-y-2">
                    <div className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Solusi 1: Ambil Service Role Key (Akses Penuh Tanpa RLS)</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-700 pl-1">
                      <li>Buka dashboard web <strong>supabase.com</strong> dan buka proyek Anda.</li>
                      <li>Di sidebar kiri bawah, klik ikon gerigi <strong>Project Settings</strong> &gt; pilih menu <strong>API</strong>.</li>
                      <li>Di bagian <strong>Project API keys</strong>, cari baris <strong>service_role (secret)</strong>.</li>
                      <li>Klik tombol <strong>Reveal</strong>, lalu salin token tersebut dan tempelkan ke kolom <strong>API Key</strong> di atas.</li>
                      <li>Klik kembali <strong>"Uji Koneksi &amp; Cari Tabel"</strong>. Seluruh baris data akan langsung terdeteksi!</li>
                    </ol>
                  </div>

                  <div className="bg-white border border-amber-200 rounded-lg p-3.5 text-[11px] text-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Solusi 2: Cek Nama Tabel Kustom Supabase Anda</span>
                    </div>
                    <p className="text-slate-600">
                      Jika nama tabel Anda di Supabase bukan <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">warehouse_grn</code> (misal: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">grn</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">kedatangan</code>, atau <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">penerimaan</code>), gunakan fitur <strong>"Penjelajah Tabel Kustom"</strong> di bawah untuk langsung mendeteksi barisnya.
                    </p>
                  </div>
                </div>
              )}

              {/* Test Result Summary Card */}
              {testResult && (
                <div
                  className={`border rounded-xl p-4 text-xs space-y-3 ${
                    testResult.success && (testResult.totalRecords || 0) > 0
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {testResult.success && (testResult.totalRecords || 0) > 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-bold text-sm">{testResult.message}</div>
                      <div className="text-[11px] text-slate-600 mt-1 flex flex-wrap gap-2 font-mono">
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                          Kunci: <strong className="uppercase text-purple-700">{testResult.keyRole || 'unknown'}</strong>
                        </span>
                        {testResult.latencyMs && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                            Latensi: <strong>{testResult.latencyMs}ms</strong>
                          </span>
                        )}
                        {testResult.totalRecords !== undefined && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                            Total: <strong className="text-emerald-700">{testResult.totalRecords} baris</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CUSTOM TABLE INSPECTOR TOOL */}
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Cari / Uji Nama Tabel Kustom di Supabase Anda</span>
                  </span>
                  <span className="text-[10px] text-indigo-700 font-normal">
                    Ketik nama tabel Anda (misal: grn, users, kedatangan)
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTableName}
                    onChange={(e) => setCustomTableName(e.target.value)}
                    placeholder="Nama tabel di Supabase (contoh: grn, barang_masuk, materials)"
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-indigo-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleInspectCustomTable}
                    disabled={isInspecting || !customTableName.trim() || !supabaseUrl || !supabaseKey}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isInspecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>{isInspecting ? 'Mengecek...' : 'Periksa Tabel'}</span>
                  </button>
                </div>

                {inspectResult && (
                  <div
                    className={`p-3 rounded-lg text-xs space-y-2 border ${
                      inspectResult.success && (inspectResult.count || 0) > 0
                        ? 'bg-white border-emerald-300 text-emerald-900'
                        : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1.5">
                      {inspectResult.success && (inspectResult.count || 0) > 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <span>{inspectResult.message}</span>
                    </div>

                    {inspectResult.columns && inspectResult.columns.length > 0 && (
                      <div className="text-[10px] text-slate-600 font-mono pt-1">
                        Kolom terdeteksi ({inspectResult.columns.length}):{' '}
                        <span className="text-slate-800">{inspectResult.columns.slice(0, 8).join(', ')}{inspectResult.columns.length > 8 ? '...' : ''}</span>
                      </div>
                    )}

                    {inspectResult.targetD1Table && (
                      <div className="text-[11px] text-indigo-700 bg-indigo-50 p-1.5 rounded border border-indigo-100">
                        ➔ Otomatis ditambahkan ke antrean migrasi &amp; dipetakan ke tabel D1: <strong>{inspectResult.targetD1Table}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Table Selection & Migration Settings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    2. Pilih Tabel untuk Ditransfer ({selectedTables.length} dipilih)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTables(tablesList.map((t) => t.sourceTable))}
                      className="text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTables([])}
                      className="text-[11px] font-semibold text-slate-500 hover:underline"
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>

                {/* Table Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                  {tablesList.map((table) => {
                    const isChecked = selectedTables.includes(table.sourceTable);
                    const count = table.count;

                    return (
                      <label
                        key={table.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-400 opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTable(table.sourceTable)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="shrink-0">{table.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{table.label}</div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            Supabase: <strong className="text-slate-700">{table.sourceTable}</strong> ➔ D1: <strong className="text-emerald-700">{table.targetTable}</strong>
                          </div>
                        </div>
                        {count !== undefined && count >= 0 ? (
                          <span className={`text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                            count > 0 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {count} baris
                          </span>
                        ) : count === -1 ? (
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">N/A</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>

                {/* Mode Selector */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wipeExisting}
                      onChange={(e) => setWipeExisting(e.target.checked)}
                      className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="text-xs text-amber-900">
                      <span className="font-bold">Timpa Bersih Data Lama (Clean Overwrite)</span>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Menghapus data di Cloudflare D1 sebelum mentransfer data dari Supabase. Seluruh data lama akan digantikan secara penuh agar serasi 100% dengan database Supabase produksi Anda.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Execution Button */}
              <div>
                <button
                  type="button"
                  onClick={handleStartMigration}
                  disabled={isMigrating || !supabaseUrl || !supabaseKey || selectedTables.length === 0}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isMigrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{isMigrating ? 'Sedang Mentransfer Seluruh Data ke Cloudflare D1...' : 'Mulai Migrasi Penuh ke Cloudflare D1'}</span>
                </button>
              </div>

              {/* Migration Log Monitor */}
              {migrationLogs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Log Proses Migrasi:</span>
                    {totalMigrated !== null && (
                      <span className="text-emerald-600 font-mono tabular-nums">
                        {totalMigrated} baris data berhasil tersimpan
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-[11px] h-40 overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
                    {migrationLogs.map((log, idx) => (
                      <div key={idx} className="leading-relaxed">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'file' && (
            /* File Upload / Direct Paste Backup Mode */
            <div className="space-y-5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Impor Cadangan Offline (File atau Tempel Langsung SQL / JSON)
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Sistem mendukung format file <strong>PostgreSQL pg_dump (termasuk format COPY ... FROM stdin)</strong>, statement <code className="font-mono">INSERT INTO</code>, maupun format export JSON.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setUploadMode('sql')}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-all ${
                      uploadMode === 'sql'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <FileCode className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Script SQL / pg_dump Supabase</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode('json')}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-all ${
                      uploadMode === 'json'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <FileJson className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Format JSON per Tabel</span>
                  </button>
                </div>

                {uploadMode === 'json' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pilih Tabel Target untuk Data JSON
                    </label>
                    <select
                      value={selectedFileTable}
                      onChange={(e) => setSelectedFileTable(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                    >
                      {BASE_TABLES.map((t) => (
                        <option key={t.id} value={t.targetTable}>
                          {t.label} ({t.targetTable})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* File input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opsi A: Upload File ({uploadMode === 'json' ? '.json' : '.sql'})
                  </label>
                  <input
                    type="file"
                    accept={uploadMode === 'json' ? '.json' : '.sql,.txt'}
                    onChange={handleFileChange}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                  />
                  {fileName && (
                    <div className="mt-1 text-[11px] text-slate-500 font-mono">
                      File terpilih: {fileName}
                    </div>
                  )}
                </div>

                {/* Direct Paste text area */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opsi B: Atau Tempelkan Teks SQL / JSON Langsung di Sini:
                  </label>
                  <textarea
                    rows={6}
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder={
                      uploadMode === 'sql'
                        ? 'Tempelkan isi file .sql dari Supabase dump atau perintah INSERT INTO di sini...'
                        : 'Tempelkan array JSON [{ "grn_number": "...", ... }] di sini...'
                    }
                    className="w-full p-3 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fileWipeExisting}
                    onChange={(e) => setFileWipeExisting(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Timpa bersih data tabel target sebelum impor</span>
                </label>

                <button
                  type="button"
                  onClick={handleExecuteImportContent}
                  disabled={isUploadingFile || !pasteContent.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isUploadingFile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{isUploadingFile ? 'Sedang Memproses & Mengonversi Data...' : 'Eksekusi Impor Data'}</span>
                </button>

                {fileResult && (
                  <div
                    className={`p-3.5 rounded-xl text-xs space-y-2 ${
                      fileResult.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      {fileResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{fileResult.message}</span>
                    </div>

                    {fileResult.errorDetails && fileResult.errorDetails.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                          Rincian Pesan:
                        </div>
                        <div className="bg-slate-900 text-rose-300 p-3 rounded-lg font-mono text-[10px] max-h-36 overflow-y-auto space-y-1 border border-slate-800">
                          {fileResult.errorDetails.map((err, idx) => (
                            <div key={idx} className="leading-relaxed">
                              {err}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sql-helper' && (
            /* Supabase SQL Editor Helper Tab */
            <div className="space-y-4">
              <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-purple-950 font-bold text-xs uppercase tracking-wider">
                  <Terminal className="w-4 h-4 text-purple-600" />
                  <span>Bantuan SQL Supabase: 100% Berhasil Tanpa Hambatan RLS</span>
                </div>
                <p className="text-xs text-purple-900 leading-relaxed">
                  Buka <strong>Supabase Dashboard &gt; SQL Editor &gt; New Query</strong>, jalankan salah satu query di bawah ini sesuai kebutuhan Anda:
                </p>
              </div>

              {/* Script 1: Disable RLS */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800">
                    1. Nonaktifkan RLS Sementara (Agar API Key Anonim Dapat Membaca Data)
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `ALTER TABLE public.warehouse_grn DISABLE ROW LEVEL SECURITY;\nALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;\n-- Jika nama tabel Anda 'grn':\n-- ALTER TABLE public.grn DISABLE ROW LEVEL SECURITY;`,
                        'rls'
                      )
                    }
                    className="px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-white rounded-md flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedScript === 'rls' ? 'Tersalin!' : 'Salin SQL'}</span>
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800">
{`-- Jalankan di SQL Editor Supabase:
ALTER TABLE public.warehouse_grn DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
-- Jika nama tabel Anda 'grn':
-- ALTER TABLE public.grn DISABLE ROW LEVEL SECURITY;`}
                </pre>
                <p className="text-[11px] text-slate-500">
                  Setelah menjalankan perintah di atas di Supabase, Anda dapat langsung mengklik <strong>"Uji Koneksi &amp; Cari Tabel"</strong> di tab pertama dan seluruh data akan terdeteksi tanpa terblokir.
                </p>
              </div>

              {/* Script 2: Export to JSON */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800">
                    2. Query Export Data Langsung ke JSON (Pasti 100% Berhasil)
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `-- Export data GRN:\nSELECT json_agg(t) FROM (SELECT * FROM warehouse_grn) t;\n\n-- Export data Profil Karyawan:\nSELECT json_agg(t) FROM (SELECT * FROM profiles) t;`,
                        'export-json'
                      )
                    }
                    className="px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-white rounded-md flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedScript === 'export-json' ? 'Tersalin!' : 'Salin SQL'}</span>
                  </button>
                </div>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800">
{`-- 1. Jalankan di Supabase SQL Editor:
SELECT json_agg(t) FROM (SELECT * FROM warehouse_grn) t;

-- 2. Salin hasil JSON dari tabel hasil query di Supabase,
-- lalu tempelkan ke tab "Upload / Tempel SQL & JSON" di aplikasi ini.`}
                </pre>
              </div>

              {/* Script 3: Check Table Names */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800">
                    3. Cek Daftar Nama Tabel &amp; Jumlah Baris di Supabase Anda
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int as total_baris\nFROM (\n  SELECT table_name, query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '') as xml_count\n  FROM information_schema.tables\n  WHERE table_schema = 'public'\n) t;`,
                        'check-tables'
                      )
                    }
                    className="px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-white rounded-md flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedScript === 'check-tables' ? 'Tersalin!' : 'Salin SQL'}</span>
                  </button>
                </div>
                <pre className="bg-slate-900 text-sky-400 p-3 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800">
{`SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int as total_baris
FROM (
  SELECT table_name, query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '') as xml_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
) t;`}
                </pre>
                <p className="text-[11px] text-slate-500">
                  Gunakan hasil query ini untuk melihat nama pasti tabel GRN / profil di database Supabase Anda, lalu masukkan namanya ke kotak <strong>"Cari / Uji Nama Tabel Kustom"</strong> di Tab 1.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            CPKB Sistem Mutu PT. Larassanti Makmur Sejahtera &middot; Cloudflare D1 Engine
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
