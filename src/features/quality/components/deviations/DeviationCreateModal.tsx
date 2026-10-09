import React, { useState } from 'react';
import { X, AlertTriangle, ShieldAlert, Package, Factory, Wrench, FileText, CheckCircle2 } from 'lucide-react';
import { DeviationCategory, DeviationSeverity, DeviationReport } from '../../types/deviationTypes';
import { deviationService } from '../../services/deviationService';
import { useEscapeKey } from '../../../../core/utils/useEscapeKey';

interface DeviationCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  currentUser: { name: string; nik: string; role: string; department?: string };
}

export const DeviationCreateModal: React.FC<DeviationCreateModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  currentUser,
}) => {
  useEscapeKey(onClose, isOpen);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DeviationCategory>('PRODUCTION');
  const [severity, setSeverity] = useState<DeviationSeverity>('MINOR');
  const [department, setDepartment] = useState(currentUser.department || 'production');
  const [targetDepartments, setTargetDepartments] = useState<string[]>(['production', 'quality']);
  const [batchNumber, setBatchNumber] = useState('');
  const [materialCode, setMaterialCode] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCategoryChange = (cat: DeviationCategory) => {
    setCategory(cat);
    // Smart mapping default target departments
    if (cat === 'MATERIAL') {
      setTargetDepartments(['warehouse', 'quality', 'rnd']);
    } else if (cat === 'PRODUCTION') {
      setTargetDepartments(['production', 'quality', 'engineering']);
    } else if (cat === 'EQUIPMENT') {
      setTargetDepartments(['engineering', 'production', 'quality']);
    } else {
      setTargetDepartments(['quality', 'production']);
    }
  };

  const toggleTargetDept = (dept: string) => {
    if (targetDepartments.includes(dept)) {
      if (targetDepartments.length > 1) {
        setTargetDepartments(targetDepartments.filter((d) => d !== dept));
      }
    } else {
      setTargetDepartments([...targetDepartments, dept]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg('Judul dan Deskripsi kronologi deviasi wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await deviationService.saveDeviation({
        title,
        category,
        severity,
        department,
        targetDepartments,
        batchNumber: batchNumber.trim() || undefined,
        materialCode: materialCode.trim() || undefined,
        materialName: materialName.trim() || undefined,
        description,
        initiatorName: currentUser.name || 'User Pelapor',
        initiatorNik: currentUser.nik || 'USER',
        status: 'DRAFT',
        impacts: targetDepartments.map((d) => ({
          department: d,
          hasImpact: false,
          impactDescription: '',
        })),
        capaActions: [],
      });

      onCreated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan laporan deviasi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black">Buat Laporan Deviasi Baru</h2>
              <p className="text-xs text-orange-100">Pencatatan penyimpangan mutu CPKB lintas departemen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs text-slate-800">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Judul / Topik Deviasi <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Suhu Mixing Batch #04 melenceng dari SOP"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Departemen Pelapor (Sesuai User Aktif)</label>
              <input
                type="text"
                disabled
                value={(currentUser.department || 'production').toUpperCase()}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 bg-slate-100 font-bold text-slate-700 cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Otomatis terisi sesuai akun login Anda ({currentUser.name})</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Kategori Masalah</label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as DeviationCategory)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium bg-white"
              >
                <option value="PRODUCTION">Proses Produksi / Penimbangan</option>
                <option value="MATERIAL">Bahan Baku / Bahan Kemas</option>
                <option value="EQUIPMENT">Mesin / Peralatan / Utilitas</option>
                <option value="PROCEDURE">SOP / Prosedur / Dokumen</option>
                <option value="ENVIRONMENT">Lingkungan / Ruangan / HVAC</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Tingkat Keparahan (Severity)</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as DeviationSeverity)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium bg-white"
              >
                <option value="MINOR">Minor (Tidak berdampak langsung pada mutu)</option>
                <option value="MAJOR">Major (Berpotensi mempengaruhi mutu)</option>
                <option value="CRITICAL">Critical (Berdampak fatal / kegagalan bets)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">No. Batch (Opsional)</label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="Misal: BATCH-2610-01"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Kode Material</label>
              <input
                type="text"
                value={materialCode}
                onChange={(e) => setMaterialCode(e.target.value)}
                placeholder="Misal: M-001"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nama Material / Produk</label>
              <input
                type="text"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="Misal: Aqua Demineralisata"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Departemen Terkait yang Perlu Kajian (*Cross-Functional*)</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'production', label: 'Produksi' },
                { id: 'warehouse', label: 'Gudang' },
                { id: 'quality', label: 'Quality (QC/QA)' },
                { id: 'engineering', label: 'Teknik' },
                { id: 'rnd', label: 'RnD' },
              ].map((dept) => {
                const isSelected = targetDepartments.includes(dept.id);
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => toggleTargetDept(dept.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/20'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {dept.label} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Kronologi & Deskripsi Penyimpangan <span className="text-rose-500">*</span></label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Jelaskan secara rinci apa yang terjadi, kapan waktu kejadian, kondisi aktual vs standar SOP..."
              className="w-full border border-slate-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium text-slate-900"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-md shadow-orange-600/20 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Laporan (Draft)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
