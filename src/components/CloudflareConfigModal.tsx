import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  ExternalLink,
  ShieldCheck,
  Server,
  Zap,
  X,
  HelpCircle,
  Eye,
  EyeOff,
  Activity,
  Layers,
  Save,
  Trash2,
} from 'lucide-react';

interface CloudflareConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: () => void;
  onOpenSupabaseMigration?: () => void;
}

interface CloudflareStatusData {
  isRemote: boolean;
  configured: boolean;
  engine: string;
  accountId: string;
  rawAccountId?: string;
  databaseId?: string;
  hasToken: boolean;
  connectionValid: boolean;
  pingLatencyMs: number | null;
  tableCounts?: Record<string, number>;
}

export const CloudflareConfigModal: React.FC<CloudflareConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
  onOpenSupabaseMigration,
}) => {
  const [status, setStatus] = useState<CloudflareStatusData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Form State
  const [accountId, setAccountId] = useState('');
  const [databaseId, setDatabaseId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Action States
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Feedback Messages
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/cloudflare/status');
      if (res.ok) {
        const data: CloudflareStatusData = await res.json();
        setStatus(data);
        if (data.rawAccountId && !accountId) setAccountId(data.rawAccountId);
        if (data.databaseId && !databaseId) setDatabaseId(data.databaseId);
      }
    } catch (err: any) {
      console.error('Gagal mengambil status Cloudflare D1:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setTestResult(null);
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/cloudflare/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          databaseId: databaseId.trim(),
          apiToken: apiToken.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: `Koneksi berhasil! Waktu respon Cloudflare D1: ${data.latencyMs} ms. Database aktif & dapat menerima query.`,
          latency: data.latencyMs,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Gagal terhubung ke Cloudflare D1.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Gagal menghubungi server.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    if (!accountId.trim() || !databaseId.trim() || !apiToken.trim()) {
      setFeedback({
        type: 'error',
        message: 'Mohon isi Account ID, Database ID, dan API Token Cloudflare Anda.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cloudflare/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          databaseId: databaseId.trim(),
          apiToken: apiToken.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message,
        });
        await fetchStatus();
        if (onConfigChanged) onConfigChanged();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal menyimpan kredensial.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Terjadi kesalahan sistem.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncSchema = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cloudflare/sync-schema', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message,
        });
        await fetchStatus();
        if (onConfigChanged) onConfigChanged();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal sinkronisasi skema ke Cloudflare.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Terjadi kesalahan sistem.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    try {
      await fetchStatus();
      setFeedback({
        type: 'info',
        message: 'Audit tabel & transaksi database Cloudflare D1 selesai diperbarui.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'Gagal melakukan audit tabel.',
      });
    } finally {
      setAuditing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Apakah Anda yakin ingin memutuskan kredensial Cloudflare D1 dan kembali ke engine lokal?')) {
      return;
    }

    setDisconnecting(true);
    try {
      const res = await fetch('/api/cloudflare/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAccountId('');
        setDatabaseId('');
        setApiToken('');
        setFeedback({
          type: 'info',
          message: data.message,
        });
        await fetchStatus();
        if (onConfigChanged) onConfigChanged();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Gagal memutuskan koneksi.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Pengaturan Koneksi Cloudflare D1</h2>
              <p className="text-xs text-orange-100">
                Hubungkan aplikasi langsung ke Database Cloudflare D1 Remote (Opsi A)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Active Status Badge & Overview */}
          <div className="p-4 rounded-xl border bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                  status?.isRemote
                    ? 'bg-emerald-500 animate-pulse ring-4 ring-emerald-100'
                    : 'bg-amber-500 ring-4 ring-amber-100'
                }`}
              />
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status Engine Database
                </div>
                <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  {status?.engine || 'Memeriksa status database...'}
                  {status?.isRemote && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase">
                      Remote Cloud Aktif
                    </span>
                  )}
                  {!status?.isRemote && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                      Lokal SQLite
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchStatus}
                disabled={loadingStatus}
                title="Refresh Status"
                className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              {status?.isRemote && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Putuskan
                </button>
              )}
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{feedback.message}</div>
            </div>
          )}

          {/* Test Ping Result */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border border-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{testResult.success ? 'Uji Koneksi Berhasil' : 'Uji Koneksi Gagal'}</div>
                <div>{testResult.message}</div>
              </div>
            </div>
          )}

          {/* Form Credentials */}
          <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-orange-600" />
                Kredensial Database Cloudflare D1
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showGuide ? 'Tutup Panduan' : 'Cara Dapatkan Kredensial?'}
              </button>
            </div>

            {/* Quick Guide Accordion */}
            {showGuide && (
              <div className="p-3.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-slate-700 space-y-2">
                <div className="font-bold text-orange-900 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Langkah Mengambil Kredensial di dash.cloudflare.com:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 leading-relaxed">
                  <li>
                    Buka{' '}
                    <a
                      href="https://dash.cloudflare.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-700 underline font-semibold"
                    >
                      dash.cloudflare.com
                    </a>{' '}
                    &gt; Pilih menu <strong>Workers &amp; Pages</strong> &gt; <strong>D1 SQL Database</strong>.
                  </li>
                  <li>
                    <strong>Account ID</strong>: Salin Account ID yang tertera di sidebar kanan bawah atau URL browser.
                  </li>
                  <li>
                    <strong>Database ID</strong>: Klik nama database D1 Anda &gt; Salin <strong>Database ID</strong> (UUID contoh: <code className="bg-white px-1 py-0.5 rounded text-[11px]">8c3b0...</code>).
                  </li>
                  <li>
                    <strong>API Token</strong>: Klik profil akun (pojok kanan atas) &gt; <strong>My Profile</strong> &gt; <strong>API Tokens</strong> &gt; <strong>Create Token</strong> &gt; Beri permission: <code className="bg-white px-1 py-0.5 rounded text-[11px]">Account &gt; D1 &gt; Edit</code> &gt; Salin token rahasia tersebut ke formulir di bawah.
                  </li>
                </ol>
              </div>
            )}

            {/* Account ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cloudflare Account ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Contoh: 3b9e4f0c8a1234567890abcdef123456"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Database ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cloudflare D1 Database ID (UUID)
              </label>
              <input
                type="text"
                value={databaseId}
                onChange={(e) => setDatabaseId(e.target.value)}
                placeholder="Contoh: 7b31c9a1-8d24-4f0e-b816-123456789abc"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* API Token */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cloudflare API Token (Izin: Account &gt; D1 &gt; Edit)
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={status?.hasToken ? '•••••••••••••••••••••••••••••••• (Tersimpan di server)' : 'Masukkan token Cloudflare API Anda'}
                  className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Button Actions: Test & Save */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || (!accountId && !status?.rawAccountId)}
                className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-500 ${testing ? 'animate-bounce' : ''}`} />
                {testing ? 'Menguji...' : 'Uji Koneksi (Test Ping)'}
              </button>

              <button
                type="button"
                onClick={handleSaveAndConnect}
                disabled={saving || !accountId || !databaseId || (!apiToken && !status?.hasToken)}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                {saving ? 'Menyimpan & Menghubungkan...' : 'Simpan & Aktifkan Cloudflare D1'}
              </button>
            </div>
          </div>

          {/* Schema Sync & Table Audit Section */}
          <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-600" />
                  Sinkronisasi Skema &amp; Audit Transaksi Database
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Pastikan 16 tabel resmi CPKB &amp; akun master sudah dibuat di Cloudflare D1
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAudit}
                  disabled={auditing}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Activity className={`w-3.5 h-3.5 text-blue-600 ${auditing ? 'animate-spin' : ''}`} />
                  Audit Tabel
                </button>
                <button
                  type="button"
                  onClick={handleSyncSchema}
                  disabled={syncing || !status?.isRemote}
                  title={!status?.isRemote ? 'Aktifkan Cloudflare D1 terlebih dahulu' : 'Buat tabel di Cloudflare'}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Server className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Menyinkronkan...' : 'Sinkronisasi Skema (Buat Tabel)'}
                </button>
              </div>
            </div>

            {/* Table Row Counts Grid */}
            {status?.tableCounts && Object.keys(status.tableCounts).length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(status.tableCounts).map(([tableName, count]) => (
                  <div
                    key={tableName}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-slate-600 truncate mr-2" title={tableName}>
                      {tableName}
                    </span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        count >= 0
                          ? 'bg-slate-200/80 text-slate-800'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {count >= 0 ? `${count} baris` : 'Belum Ada'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Kredensial disimpan aman di backend server tanpa terekspos ke klien browser.</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onOpenSupabaseMigration && (
              <button
                type="button"
                onClick={onOpenSupabaseMigration}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Migrasi dari Supabase</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
