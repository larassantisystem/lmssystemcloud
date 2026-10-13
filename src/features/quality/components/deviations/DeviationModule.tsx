import React, { useState, useEffect } from 'react';
import { ShieldAlert, Plus, Search, Filter, RefreshCw, CheckCircle2, Clock, AlertTriangle, FileText, Wrench, Package } from 'lucide-react';
import { DeviationReport, DeviationStatus } from '../../types/deviationTypes';
import { deviationService } from '../../services/deviationService';
import { DeviationCreateModal } from './DeviationCreateModal';
import { DeviationDetailModal } from './DeviationDetailModal';

interface DeviationModuleProps {
  currentUser: { name: string; nik: string; role: string; department?: string };
}

export const DeviationModule: React.FC<DeviationModuleProps> = ({ currentUser }) => {
  const [deviations, setDeviations] = useState<DeviationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'rca' | 'capa'>('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDeviation, setSelectedDeviation] = useState<DeviationReport | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await deviationService.getDeviations();
      setDeviations(data);
    } catch (e) {
      console.warn('Failed to load deviations:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredDeviations = deviations.filter((d) => {
    const matchesSearch =
      d.deviationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: deviations.length,
    draft: deviations.filter((d) => d.status === 'DRAFT').length,
    review: deviations.filter((d) => d.status === 'REVIEW').length,
    capa: deviations.filter((d) => d.status === 'CAPA').length,
    closed: deviations.filter((d) => d.status === 'CLOSED').length,
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900">
                  Manajemen Deviasi & CAPA CPKB
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold">
                  Lintas Departemen Aktif
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pencatatan penyimpangan mutu, kajian lintas departemen, analisis akar masalah (Root Cause), dan tindakan CAPA.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadData}
              title="Muat Ulang"
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-600/20 transition-all cursor-pointer flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Laporan Deviasi</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Deviasi</span>
            <span className="text-lg font-black text-slate-900 mt-0.5 block">{stats.total}</span>
          </div>
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Draft / Open</span>
            <span className="text-lg font-black text-slate-700 mt-0.5 block">{stats.draft}</span>
          </div>
          <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200">
            <span className="text-[10px] uppercase font-bold text-blue-700 block">Kajian Review</span>
            <span className="text-lg font-black text-blue-900 mt-0.5 block">{stats.review}</span>
          </div>
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200">
            <span className="text-[10px] uppercase font-bold text-amber-700 block">Aksi CAPA</span>
            <span className="text-lg font-black text-amber-900 mt-0.5 block">{stats.capa}</span>
          </div>
          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Selesai (Closed)</span>
            <span className="text-lg font-black text-emerald-900 mt-0.5 block">{stats.closed}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Filters & Search */}
        <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nomor deviasi, judul, atau deskripsi..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {['ALL', 'DRAFT', 'REVIEW', 'CAPA', 'CLOSED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'ALL' ? 'Semua Status' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Table / List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <th className="p-4">No. Deviasi</th>
                <th className="p-4">Topik & Kategori</th>
                <th className="p-4">Pelapor</th>
                <th className="p-4">Keparahan</th>
                <th className="p-4">Status Workflow</th>
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-medium">Memuat data deviasi dari Supabase...</td>
                </tr>
              ) : filteredDeviations.length > 0 ? (
                filteredDeviations.map((dev) => (
                  <tr
                    key={dev.id}
                    onClick={() => setSelectedDeviation(dev)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="p-4 font-mono font-bold text-orange-600">
                      {dev.deviationNumber}
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-900 block group-hover:text-orange-600 transition-colors">{dev.title}</span>
                      <span className="text-[10px] text-slate-500 uppercase">{dev.category} • {dev.department}</span>
                    </td>
                    <td className="p-4 font-medium text-slate-700">
                      {dev.initiatorName}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        dev.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' :
                        dev.severity === 'MAJOR' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {dev.severity}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        dev.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800' :
                        dev.status === 'CAPA' ? 'bg-amber-100 text-amber-800' :
                        dev.status === 'REVIEW' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {dev.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeviation(dev);
                        }}
                        className="px-3 py-1.5 bg-slate-100 group-hover:bg-orange-600 group-hover:text-white rounded-xl text-slate-700 font-bold transition-all"
                      >
                        Tambah / Kelola Kajian
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 italic">
                    Belum ada laporan deviasi yang tercatat. Silakan buat laporan baru melalui tombol di atas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <DeviationCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={loadData}
        currentUser={currentUser}
      />

      <DeviationDetailModal
        isOpen={Boolean(selectedDeviation)}
        onClose={() => setSelectedDeviation(null)}
        deviation={selectedDeviation}
        onUpdated={loadData}
        currentUser={currentUser}
        initialTab="review"
      />
    </div>
  );
};
