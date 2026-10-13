import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle2, AlertTriangle, Plus, Trash2, ArrowRight, Lock, Save, FileText, Wrench, Package } from 'lucide-react';
import { DeviationReport, CapaAction, RootCauseAnalysis } from '../../types/deviationTypes';
import { deviationService } from '../../services/deviationService';
import { useEscapeKey } from '../../../../core/utils/useEscapeKey';

interface DeviationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviation: DeviationReport | null;
  onUpdated: () => void;
  currentUser: { name: string; nik: string; role: string; department?: string };
  initialTab?: 'info' | 'review' | 'rca' | 'capa' | 'closure';
}

export const DeviationDetailModal: React.FC<DeviationDetailModalProps> = ({
  isOpen,
  onClose,
  deviation,
  onUpdated,
  currentUser,
  initialTab = 'review',
}) => {
  useEscapeKey(onClose, isOpen && !!deviation);

  const [activeTab, setActiveTab] = React.useState<'info' | 'review' | 'rca' | 'capa' | 'closure'>(initialTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, deviation?.id]);

  // State for adding a new department impact review
  const [newImpactDept, setNewImpactDept] = useState<string>(currentUser.department || 'production');
  const [newImpactHasImpact, setNewImpactHasImpact] = useState<boolean>(true);
  const [newImpactDesc, setNewImpactDesc] = useState<string>('');

  // RCA Form State
  const [rcaMethod, setRcaMethod] = useState<'5_WHYS' | 'FISHBONE' | 'GENERAL'>(deviation?.rootCause?.method || '5_WHYS');
  const [rcaCategory, setRcaCategory] = useState<'MAN' | 'MACHINE' | 'MATERIAL' | 'METHOD' | 'ENVIRONMENT'>(deviation?.rootCause?.category || 'PROCESS' as any);
  const [problemStatement, setProblemStatement] = useState(deviation?.rootCause?.problemStatement || deviation?.description || '');
  const [why1, setWhy1] = useState(deviation?.rootCause?.why1 || '');
  const [why2, setWhy2] = useState(deviation?.rootCause?.why2 || '');
  const [why3, setWhy3] = useState(deviation?.rootCause?.why3 || '');
  const [why4, setWhy4] = useState(deviation?.rootCause?.why4 || '');
  const [why5, setWhy5] = useState(deviation?.rootCause?.why5 || '');
  const [rcaSummary, setRcaSummary] = useState(deviation?.rootCause?.summary || '');

  // New CAPA Form State
  const [newCapaDesc, setNewCapaDesc] = useState('');
  const [newCapaType, setNewCapaType] = useState<'CORRECTIVE' | 'PREVENTIVE'>('CORRECTIVE');
  const [newCapaAssignee, setNewCapaAssignee] = useState('');
  const [newCapaDueDate, setNewCapaDueDate] = useState('');

  if (!isOpen || !deviation) return null;

  const isAdminOrQa = currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.department === 'quality';

  const handleUpdateStatus = async (newStatus: 'DRAFT' | 'REVIEW' | 'CAPA' | 'CLOSED') => {
    try {
      setIsSubmitting(true);
      await deviationService.updateDeviation(deviation.id, {
        status: newStatus,
        closedAt: newStatus === 'CLOSED' ? new Date().toISOString() : undefined,
        closedBy: newStatus === 'CLOSED' ? currentUser.name : undefined,
      });
      onUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui status deviasi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRca = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const rootCause: RootCauseAnalysis = {
        method: rcaMethod,
        category: rcaCategory,
        problemStatement,
        why1,
        why2,
        why3,
        why4,
        why5,
        summary: rcaSummary,
      };

      await deviationService.updateDeviation(deviation.id, {
        rootCause,
        status: deviation.status === 'REVIEW' ? 'CAPA' : deviation.status,
      });
      onUpdated();
      alert('Analisis Root Cause berhasil disimpan.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan RCA.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCapa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCapaDesc.trim() || !newCapaAssignee.trim() || !newCapaDueDate) {
      alert('Mohon lengkapi deskripsi CAPA, penanggung jawab, dan tanggal target.');
      return;
    }

    try {
      setIsSubmitting(true);
      const newAction: CapaAction = {
        id: `capa-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        deviationId: deviation.id,
        actionType: newCapaType,
        description: newCapaDesc,
        assigneeName: newCapaAssignee,
        assigneeNik: 'EMP-01',
        dueDate: newCapaDueDate,
        status: 'PENDING',
      };

      const updatedActions = [...(deviation.capaActions || []), newAction];
      await deviationService.updateDeviation(deviation.id, {
        capaActions: updatedActions,
      });

      setNewCapaDesc('');
      setNewCapaAssignee('');
      setNewCapaDueDate('');
      onUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambahkan aksi CAPA.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleCapaStatus = async (capaId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'PENDING' ? 'IN_PROGRESS' : currentStatus === 'IN_PROGRESS' ? 'COMPLETED' : 'VERIFIED';
    const updatedActions = (deviation.capaActions || []).map((a) => (a.id === capaId ? { ...a, status: nextStatus as any } : a));
    await deviationService.updateDeviation(deviation.id, { capaActions: updatedActions });
    onUpdated();
  };

  const handleUpdateImpact = async (deptIdx: number, hasImpact: boolean, desc: string) => {
    const impacts = [...(deviation.impacts || [])];
    impacts[deptIdx] = {
      ...impacts[deptIdx],
      hasImpact,
      impactDescription: desc,
      reviewedBy: currentUser.name,
      reviewDate: new Date().toISOString(),
    };
    await deviationService.updateDeviation(deviation.id, { impacts });
    onUpdated();
  };

  const handleAddNewImpact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImpactDesc.trim()) {
      alert('Mohon tuliskan hasil kajian/analisis dampak departemen.');
      return;
    }

    try {
      setIsSubmitting(true);
      const existingImpacts = deviation.impacts || [];
      const filtered = existingImpacts.filter(
        (i) => i.department.toLowerCase() !== newImpactDept.toLowerCase()
      );

      const newEntry = {
        department: newImpactDept,
        hasImpact: newImpactHasImpact,
        impactDescription: newImpactDesc.trim(),
        reviewedBy: `${currentUser.name} (${currentUser.nik})`,
        reviewDate: new Date().toISOString(),
      };

      const updatedImpacts = [...filtered, newEntry];
      const updatedStatus = deviation.status === 'DRAFT' ? 'REVIEW' : deviation.status;

      await deviationService.updateDeviation(deviation.id, {
        impacts: updatedImpacts,
        status: updatedStatus,
      });

      setNewImpactDesc('');
      onUpdated();
      alert('Kajian departemen berhasil disimpan.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan kajian departemen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono bg-white/20 px-2.5 py-0.5 rounded-md text-xs font-bold">{deviation.deviationNumber}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  deviation.status === 'CLOSED' ? 'bg-emerald-500 text-white' :
                  deviation.status === 'CAPA' ? 'bg-amber-400 text-slate-950' :
                  deviation.status === 'REVIEW' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  Status: {deviation.status}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black mt-1">{deviation.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 shrink-0 overflow-x-auto">
          {[
            { id: 'info', label: '1. Detail & Laporan' },
            { id: 'review', label: '2. Kajian Departemen' },
            { id: 'rca', label: '3. Analisa Root Cause' },
            { id: 'capa', label: '4. Tindakan CAPA' },
            { id: 'closure', label: '5. Verifikasi & Otorisasi' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-orange-600 text-orange-600 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-slate-800">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: INFO & LAPORAN */}
          {activeTab === 'info' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Kategori</span>
                  <span className="font-bold text-slate-900">{deviation.category}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Keparahan</span>
                  <span className={`font-bold ${deviation.severity === 'CRITICAL' ? 'text-rose-600' : 'text-amber-600'}`}>
                    {deviation.severity}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Pelapor</span>
                  <span className="font-bold text-slate-900">{deviation.initiatorName} ({deviation.department})</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Tanggal Laporan</span>
                  <span className="font-medium text-slate-700">{new Date(deviation.createdAt).toLocaleString('id-ID')}</span>
                </div>
              </div>

              {(deviation.batchNumber || deviation.materialName) && (
                <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl flex items-center gap-3">
                  <Package className="w-5 h-5 text-orange-600 shrink-0" />
                  <div>
                    <span className="font-bold text-orange-900 block">Informasi Material / Produk Terdampak:</span>
                    <p className="text-[11px] text-orange-800">
                      {deviation.batchNumber && `No. Batch: ${deviation.batchNumber} | `}
                      {deviation.materialCode && `Kode: ${deviation.materialCode} | `}
                      {deviation.materialName && `Nama: ${deviation.materialName}`}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-700 uppercase tracking-wide block mb-1.5">Kronologi & Deskripsi Penyimpangan</span>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 leading-relaxed font-medium">
                  {deviation.description}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                {deviation.status === 'DRAFT' && (
                  <button
                    onClick={() => handleUpdateStatus('REVIEW')}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span>Mulai Kajian Departemen (Review)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: KAJIAN DEPARTEMEN */}
          {activeTab === 'review' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-blue-950 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-sm block mb-1">Form Kajian & Penilaian Dampak Lintas Departemen</span>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Setiap kepala/representatif departemen terkait wajib mengkaji dan memberikan masukan teknis/operasional mengenai potensi dampak penyimpangan ini terhadap mutu, jadwal, dan kehandalan proses.
                  </p>
                </div>
              </div>

              {/* Form Input/Tambah Kajian Departemen */}
              <form onSubmit={handleAddNewImpact} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                    <Plus className="w-4 h-4 text-orange-600" />
                    <span>Tambah / Perbarui Kajian Departemen</span>
                  </h3>
                  <span className="text-[10px] text-slate-500">Peninjau: <b>{currentUser.name}</b> ({currentUser.department || 'user'})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Departemen Peninjau</label>
                    <select
                      value={newImpactDept}
                      onChange={(e) => setNewImpactDept(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-800 bg-white"
                    >
                      <option value="production">Produksi</option>
                      <option value="warehouse">Gudang / Warehouse</option>
                      <option value="quality">Quality (QC/QA)</option>
                      <option value="engineering">Teknik / Maintenance</option>
                      <option value="rnd">RnD</option>
                      <option value="ppic">PPIC</option>
                      <option value="procurement">Procurement</option>
                      <option value="sales">Sales / Marketing</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Apakah Ada Dampak?</label>
                    <select
                      value={newImpactHasImpact ? 'yes' : 'no'}
                      onChange={(e) => setNewImpactHasImpact(e.target.value === 'yes')}
                      className={`w-full border rounded-xl px-3 py-2 font-bold ${
                        newImpactHasImpact ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      }`}
                    >
                      <option value="yes">⚠️ Ya, Ada Dampak Operasional</option>
                      <option value="no">✅ Tidak Ada Dampak</option>
                    </select>
                  </div>

                  <div className="sm:col-span-1 flex items-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Kajian'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hasil Kajian & Analisis Risiko Departemen <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={3}
                    required
                    value={newImpactDesc}
                    onChange={(e) => setNewImpactDesc(e.target.value)}
                    placeholder="Tuliskan analisis rinci mengenai dampak pada alur kerja, mutu produk, keamanan, atau jadwal operasional..."
                    className="w-full border border-slate-300 rounded-xl p-3 font-medium bg-white focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </form>

              {/* List Kajian Terdaftar */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>Daftar Kajian Lintas Departemen Terdaftar ({deviation.impacts?.length || 0})</span>
                </h4>

                {(!deviation.impacts || deviation.impacts.length === 0) ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-slate-400 italic">
                    Belum ada kajian departemen yang disubmit. Gunakan form di atas untuk menambahkan kajian.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {deviation.impacts.map((imp, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-black uppercase tracking-wider text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                              Departemen: {imp.department}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              imp.hasImpact ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {imp.hasImpact ? '⚠️ Ada Dampak' : '✅ Tidak Ada Dampak'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {imp.reviewedBy ? `Oleh ${imp.reviewedBy}` : 'Belum direview'} • {imp.reviewDate ? new Date(imp.reviewDate).toLocaleDateString('id-ID') : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                          {imp.impactDescription || 'Tidak ada catatan khusus.'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                {deviation.status === 'REVIEW' && (
                  <button
                    onClick={() => handleUpdateStatus('CAPA')}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span>Lanjut ke Analisis RCA & CAPA</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ROOT CAUSE ANALYSIS (RCA) */}
          {activeTab === 'rca' && (
            <form onSubmit={handleSaveRca} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-950">
                <span className="font-bold block mb-1">Analisa Akar Masalah (*Root Cause Analysis - 5 Whys*)</span>
                <p className="text-[11px] text-amber-900">
                  Gunakan metode 5 Whys untuk menemukan akar penyebab masalah secara mendalam agar pencegahan efektif.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Metode Analisa</label>
                  <select
                    value={rcaMethod}
                    onChange={(e: any) => setRcaMethod(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 font-medium bg-white"
                  >
                    <option value="5_WHYS">5 Whys Analysis</option>
                    <option value="FISHBONE">Fishbone (Ishikawa)</option>
                    <option value="GENERAL">General Investigation</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori Akar Masalah</label>
                  <select
                    value={rcaCategory}
                    onChange={(e: any) => setRcaCategory(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 font-medium bg-white"
                  >
                    <option value="MAN">Man (Manusia / Operator)</option>
                    <option value="MACHINE">Machine (Mesin / Alat)</option>
                    <option value="MATERIAL">Material (Bahan Baku / Kemas)</option>
                    <option value="METHOD">Method (SOP / Prosedur)</option>
                    <option value="ENVIRONMENT">Environment (Lingkungan)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="block font-bold text-slate-800">Pertanyaan Mengapa (*5 Whys Steps*)</label>
                {[
                  { label: 'Why 1 (Mengapa terjadi masalah utama?)', val: why1, setVal: setWhy1 },
                  { label: 'Why 2 (Mengapa hal tersebut bisa terjadi?)', val: why2, setVal: setWhy2 },
                  { label: 'Why 3 (Mengapa kondisi itu timbul?)', val: why3, setVal: setWhy3 },
                  { label: 'Why 4 (Mengapa sistem/prosedur meloloskan?)', val: why4, setVal: setWhy4 },
                  { label: 'Why 5 (Akar Penyebab Utama / Root Cause)', val: why5, setVal: setWhy5 },
                ].map((w, i) => (
                  <div key={i}>
                    <span className="text-[10px] font-bold text-slate-500 block mb-0.5">{w.label}</span>
                    <input
                      type="text"
                      value={w.val}
                      onChange={(e) => w.setVal(e.target.value)}
                      placeholder={`Langkah ${i + 1}...`}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium bg-white"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kesimpulan Akar Masalah (*Root Cause Summary*)</label>
                <textarea
                  rows={3}
                  value={rcaSummary}
                  onChange={(e) => setRcaSummary(e.target.value)}
                  placeholder="Ringkasan akar penyebab utama yang akan diselesaikan melalui tindakan CAPA..."
                  className="w-full border border-slate-300 rounded-xl p-3 font-medium text-slate-900"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-md shadow-orange-600/20 cursor-pointer flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Analisa Root Cause</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: TINDAKAN CAPA */}
          {activeTab === 'capa' && (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-950">
                <span className="font-bold block mb-1">Tindakan Korektif & Preventif (CAPA)</span>
                <p className="text-[11px] text-emerald-900">
                  Tetapkan aksi perbaikan langsung (Corrective) dan tindakan pencegahan agar tidak terulang (Preventive).
                </p>
              </div>

              {/* Add CAPA Form */}
              <form onSubmit={handleAddCapa} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="font-bold text-slate-900 block">Tambah Aksi CAPA Baru</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Jenis Aksi</label>
                    <select
                      value={newCapaType}
                      onChange={(e: any) => setNewCapaType(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium bg-white"
                    >
                      <option value="CORRECTIVE">Corrective Action (Koreksi)</option>
                      <option value="PREVENTIVE">Preventive Action (Pencegahan)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Penanggung Jawab (Assignee)</label>
                    <input
                      type="text"
                      value={newCapaAssignee}
                      onChange={(e) => setNewCapaAssignee(e.target.value)}
                      placeholder="Nama PIC / Staf..."
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Target Selesai (Due Date)</label>
                    <input
                      type="date"
                      value={newCapaDueDate}
                      onChange={(e) => setNewCapaDueDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Deskripsi Tindakan</label>
                  <input
                    type="text"
                    value={newCapaDesc}
                    onChange={(e) => setNewCapaDesc(e.target.value)}
                    placeholder="Rincian aksi perbaikan yang harus dilakukan..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium bg-white"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah ke Daftar CAPA</span>
                  </button>
                </div>
              </form>

              {/* CAPA List */}
              <div className="space-y-3">
                {deviation.capaActions && deviation.capaActions.length > 0 ? (
                  deviation.capaActions.map((capa) => (
                    <div key={capa.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${capa.actionType === 'CORRECTIVE' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                            {capa.actionType}
                          </span>
                          <span className="font-bold text-slate-900">{capa.description}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          PIC: <strong className="text-slate-800">{capa.assigneeName}</strong> | Due: <strong className="text-slate-800">{capa.dueDate}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleCapaStatus(capa.id, capa.status)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                            capa.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                            capa.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800'
                          }`}
                        >
                          Status: {capa.status} (Klik Ubah)
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-slate-400 py-6 italic">Belum ada tindakan CAPA yang ditambahkan.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: CLOSURE & VERIFICATION */}
          {activeTab === 'closure' && (
            <div className="space-y-5">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <span className="font-bold text-slate-900 text-sm block">Ringkasan Verifikasi Mutu Akhir</span>
                <p className="text-slate-600 leading-relaxed">
                  Sebelum laporan deviasi dapat ditutup (*Closed*), pastikan seluruh kajian departemen telah diisi, analisis root cause telah lengkap, dan seluruh aksi CAPA telah berstatus diverifikasi (*VERIFIED*).
                </p>

                {isAdminOrQa ? (
                  <div className="pt-3 flex items-center gap-3">
                    {deviation.status !== 'CLOSED' ? (
                      <button
                        onClick={() => handleUpdateStatus('CLOSED')}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Verifikasi & Tutup Laporan Deviasi (Close Deviation)</span>
                      </button>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>Laporan Deviasi telah resmi ditutup oleh {deviation.closedBy || 'QA Manager'} pada {deviation.closedAt ? new Date(deviation.closedAt).toLocaleString('id-ID') : 'Selesai'}.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Hanya Quality Manager atau Administrator yang berwenang menutup laporan deviasi.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
