import React, { useState, useMemo } from 'react';
import {
  BulkFormulation,
  Product,
  RawMaterial,
} from '../../types';
import {
  X,
  FileText,
  ShieldCheck,
  Wrench,
  Sliders,
  CheckCircle2,
  Lock,
  Eye,
  Info,
  Layers,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Thermometer,
  Clock,
} from 'lucide-react';
import { CpbDocumentModal } from './CpbDocumentModal';
import { useEscapeKey } from '../../core/utils/useEscapeKey';

export interface DynamicProcessStep {
  id: string;
  stepNumber: number;
  title: string;
  phaseCode?: string; // Phase name inputted by user (can be any text)
  ingredientCodes?: string[]; // Raw material codes assigned to this step
  instruction: string;
  targetTemp?: string; // e.g., '85-90°C'
  targetRpm?: string;  // e.g., '700 RPM'
  durationMin?: string; // e.g., '15 menit'
}

interface TechnicalNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  formulation: BulkFormulation;
  product?: Product | null;
  rawMaterials: RawMaterial[];
  canWrite: boolean;
  onSaveNotes?: (updatedInstructions: string, technicalNotes: string, processSteps?: DynamicProcessStep[], updatedIngredients?: any[]) => void;
}

export const TechnicalNotesModal: React.FC<TechnicalNotesModalProps> = ({
  isOpen,
  onClose,
  formulation,
  product,
  rawMaterials,
  canWrite,
  onSaveNotes,
}) => {
  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  // Active view inside modal: "BUILDER" (Dynamic Process Steps) vs "PDF_PREVIEW" (Format Resmi 1:1)
  const [modalView, setModalView] = useState<'BUILDER' | 'PDF_PREVIEW'>('BUILDER');

  // 1. Peralatan & Mesin
  const [machine1, setMachine1] = useState<string>(
    'PRD-057 Wadah Stainless Steel 300 kg (5)'
  );
  const [machine2, setMachine2] = useState<string>(
    'PRD-049 Homogenizer 70 kg'
  );

  // Grouping ingredients by phase automatically
  const ingredientsByPhase = useMemo(() => {
    const map: { [phase: string]: { code: string; name: string; percentage: number }[] } = {};
    formulation.ingredients.forEach((ing) => {
      const p = ing.phase || 'Fase A';
      if (!map[p]) map[p] = [];
      const rm = rawMaterials.find((r) => r.code === ing.rawMaterialCode);
      map[p].push({
        code: ing.rawMaterialCode,
        name: rm ? rm.name : ing.rawMaterialCode,
        percentage: ing.percentage,
      });
    });
    return map;
  }, [formulation, rawMaterials]);

  // Initial default dynamic steps based on formulation phase if empty
  const [processSteps, setProcessSteps] = useState<DynamicProcessStep[]>(() => {
    let steps: DynamicProcessStep[] = [];
    if (formulation.dynamicProcessSteps && Array.isArray(formulation.dynamicProcessSteps) && formulation.dynamicProcessSteps.length > 0) {
      steps = formulation.dynamicProcessSteps;
    } else {
      steps = [
        {
          id: 'step-1',
          stepNumber: 1,
          title: 'Peleburan & Pemanasan Fase Minyak (Oil Phase)',
          phaseCode: 'Fase B',
          instruction: 'Pada wadah, masukkan bahan Fase Minyak. Panaskan hingga larut dan homogen (tercampur rata).',
          targetTemp: '85-90°C',
          targetRpm: '-',
          durationMin: '20 menit',
        },
        {
          id: 'step-2',
          stepNumber: 2,
          title: 'Pelarutan & Pemanasan Fase Air (Water Phase)',
          phaseCode: 'Fase A',
          instruction: 'Pada wadah utama, masukkan bahan Fase Air. Panaskan hingga larut dan homogen.',
          targetTemp: '85-90°C',
          targetRpm: '300 RPM',
          durationMin: '15 menit',
        },
        {
          id: 'step-3',
          stepNumber: 3,
          title: 'Pencampuran / Emulsifikasi (Fase Minyak ke Fase Air)',
          phaseCode: 'Emulsifikasi',
          instruction: 'Masukkan FASE MINYAK ke dalam FASE AIR. Aduk hingga terbentuk massa Cream / Emulsi homogen.',
          targetTemp: '80-85°C',
          targetRpm: '700 RPM (Homogenizer)',
          durationMin: '30 menit',
        },
        {
          id: 'step-4',
          stepNumber: 4,
          title: 'Penurunan Suhu Adonan (Cooling Down)',
          phaseCode: 'Pendinginan',
          instruction: 'Turunkan suhu adonan secara bertahap sambil diaduk perlahan.',
          targetTemp: '55-40°C',
          targetRpm: '300 RPM',
          durationMin: '45 menit',
        },
        {
          id: 'step-5',
          stepNumber: 5,
          title: 'Penambahan Active Ingredient, Pengawet & Fragrance',
          phaseCode: 'Fase C',
          instruction: 'Setelah suhu di bawah 40°C, tambahkan bahan Fase C (Zat Aktif, Pewangi, Pengawet). Aduk hingga homogen.',
          targetTemp: '30-35°C',
          targetRpm: '550 RPM',
          durationMin: '20 menit',
        },
      ];
    }
    
    // Backfill ingredientCodes based on formulation.ingredients matching phaseCode
    return steps.map(step => {
      if (!step.ingredientCodes) {
        const matchingIngs = formulation.ingredients.filter(ing => ing.phase === step.phaseCode);
        return {
          ...step,
          ingredientCodes: matchingIngs.map(i => i.rawMaterialCode)
        };
      }
      return step;
    });
  });

  // Dynamic Step Handlers
  const handleAddStep = () => {
    const newStepNum = processSteps.length + 1;
    const newStep: DynamicProcessStep = {
      id: `step-${Date.now()}`,
      stepNumber: newStepNum,
      title: `Tahap ${newStepNum}: Proses Tambahan`,
      phaseCode: '',
      instruction: 'Masukkan bahan tambahan, aduk hingga homogen.',
      targetTemp: 'Suhu Ruang',
      targetRpm: '300 RPM',
      durationMin: '15 menit',
    };
    setProcessSteps([...processSteps, newStep]);
  };

  const handleRemoveStep = (id: string) => {
    if (processSteps.length <= 1) return;
    const updated = processSteps
      .filter((s) => s.id !== id)
      .map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setProcessSteps(updated);
  };

  const handleMoveStep = (index: number, direction: 'UP' | 'DOWN') => {
    if (
      (direction === 'UP' && index === 0) ||
      (direction === 'DOWN' && index === processSteps.length - 1)
    ) {
      return;
    }
    const newSteps = [...processSteps];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;

    // Recalculate step numbers
    const reordered = newSteps.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setProcessSteps(reordered);
  };

  const handleUpdateStep = (id: string, field: keyof DynamicProcessStep, value: any) => {
    setProcessSteps(
      processSteps.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleToggleIngredient = (stepId: string, rmCode: string) => {
    setProcessSteps(prev => prev.map(step => {
      const currentCodes = step.ingredientCodes || [];
      if (step.id === stepId) {
        // Toggle in this step
        if (currentCodes.includes(rmCode)) {
          return { ...step, ingredientCodes: currentCodes.filter(c => c !== rmCode) };
        } else {
          return { ...step, ingredientCodes: [...currentCodes, rmCode] };
        }
      } else {
        // Remove from other steps (mutually exclusive)
        return { ...step, ingredientCodes: currentCodes.filter(c => c !== rmCode) };
      }
    }));
  };

  // Read specifications directly from product (Single Source of Truth)
  const productSpecs = useMemo(() => {
    const specs = product?.specifications;
    return {
      appearance: specs?.appearance || 'Cream',
      color: specs?.color || 'Putih Sesuai Standar',
      odor: specs?.odor || 'Aroma Khas Sesuai Standar',
      pH: specs?.phRange ? `${specs.phRange.min.toFixed(2)} - ${specs.phRange.max.toFixed(2)}` : '5,00 - 7,00',
      viscosity: specs?.viscosityCps
        ? `${specs.viscosityCps.min.toLocaleString()} - ${specs.viscosityCps.max.toLocaleString()} mPa.s (cPs)`
        : '9.000 - 20.000 mPa.s (cPs)',
      viscosityMethod: 'Viskositas 4 Rpm 30',
    };
  }, [product]);

  const handleSaveAndClose = () => {
    if (onSaveNotes) {
      const compiledInstructions = processSteps
        .map(
          (s) =>
            `${s.stepNumber}. [${s.title}] (${s.targetTemp || '-'}, ${s.targetRpm || '-'}) - ${s.instruction}`
        )
        .join('\n');
        
      // Update formulation ingredients with the phases from the process steps
      const updatedIngredients = formulation.ingredients.map(ing => {
        const matchingStep = processSteps.find(s => s.ingredientCodes?.includes(ing.rawMaterialCode));
        let newPhase = ing.phase;
        if (matchingStep) {
          if (matchingStep.phaseCode && matchingStep.phaseCode.trim() !== '') {
            newPhase = matchingStep.phaseCode.trim();
          } else {
            // Jika kolom fase kosong, gunakan judul langkah sebagai nama fase
            newPhase = matchingStep.title.trim();
          }
        }
        return {
          ...ing,
          phase: newPhase
        };
      });

      onSaveNotes(
        compiledInstructions, 
        `Mesin Utama: ${machine1} | Homogenizer: ${machine2}`, 
        processSteps,
        updatedIngredients
      );
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-100 rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-300 flex flex-col max-h-[95vh] overflow-hidden font-sans">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Catatan Teknis Formulasi & Dynamic Process Builder CPKB
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-[10px] font-extrabold uppercase font-mono">
                  {formulation.code}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Tambah, atur, & kelola jumlah langkah proses pengolahan batch secara fleksibel sesuai karakter produk
              </p>
            </div>
          </div>

          {/* VIEW SWITCHER & CLOSE */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setModalView('BUILDER')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  modalView === 'BUILDER'
                    ? 'bg-white text-purple-900 shadow-2xs font-black'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-purple-600" />
                <span>Dynamic Builder</span>
              </button>
              <button
                type="button"
                onClick={() => setModalView('PDF_PREVIEW')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  modalView === 'PDF_PREVIEW'
                    ? 'bg-white text-purple-900 shadow-2xs font-black'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-purple-600" />
                <span>Dokumen CPB (PDF 1:1)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {modalView === 'BUILDER' ? (
            <div className="space-y-6">
              
              {/* SECTION 1: PERALATAN & MESIN PERSIAPAN */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      1. Persiapan Peralatan & Mesin Produksi
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 font-mono">Standar CPKB</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase">
                      Mesin Tangki / Wadah Utama
                    </label>
                    <input
                      type="text"
                      value={machine1}
                      disabled={!canWrite}
                      onChange={(e) => setMachine1(e.target.value)}
                      placeholder="contoh: PRD-057 Wadah Stainless Steel 300 kg (5)"
                      className="w-full mt-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase">
                      Mesin Homogenizer / Pengaduk
                    </label>
                    <input
                      type="text"
                      value={machine2}
                      disabled={!canWrite}
                      onChange={(e) => setMachine2(e.target.value)}
                      placeholder="contoh: PRD-049 Homogenizer 70 kg"
                      className="w-full mt-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-purple-600"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: DYNAMIC PROCESS BUILDER (DYNAMIC STEPS) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        2. Tahapan Proses Pengolahan ({processSteps.length} Langkah Process)
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Tambah, hapus, atau atur urutan langkah sesuai kebutuhan spesifik sediaan produk
                      </p>
                    </div>
                  </div>

                  {canWrite && (
                    <button
                      type="button"
                      onClick={handleAddStep}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Langkah Proses</span>
                    </button>
                  )}
                </div>

                {/* DYNAMIC STEPS LIST */}
                <div className="space-y-4">
                  {processSteps.map((step, index) => {
                    const matchedPhaseItems = ingredientsByPhase[step.phaseCode || ''] || [];
                    const allAvailablePhases = Object.keys(ingredientsByPhase);

                    return (
                      <div
                        key={step.id}
                        className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-purple-300 transition-all space-y-3 relative group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-2.5">
                          <div className="flex items-center gap-2.5 w-full sm:w-auto">
                            <span className="w-7 h-7 rounded-xl bg-purple-700 text-white flex items-center justify-center font-black text-xs shadow-2xs shrink-0">
                              {step.stepNumber}
                            </span>
                            <input
                              type="text"
                              value={step.title}
                              disabled={!canWrite}
                              onChange={(e) => handleUpdateStep(step.id, 'title', e.target.value)}
                              placeholder="Judul Tahapan Proses..."
                              className="font-black text-slate-900 text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1 sm:w-64 focus:border-purple-600 focus:outline-none"
                            />
                            
                            <input
                              type="text"
                              list="phase-options"
                              disabled={!canWrite}
                              value={step.phaseCode || ''}
                              onChange={(e) => handleUpdateStep(step.id, 'phaseCode', e.target.value)}
                              placeholder="Nama Fase (Opsional)"
                              className="px-2 py-1.5 rounded-lg bg-purple-50 text-purple-900 font-mono text-[10px] font-bold border border-purple-200 focus:outline-none focus:bg-purple-100 placeholder:text-purple-300 w-32 sm:w-40"
                            />
                            <datalist id="phase-options">
                              {allAvailablePhases.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                              <option value="Emulsifikasi">Emulsifikasi</option>
                              <option value="Pendinginan">Pendinginan</option>
                            </datalist>
                          </div>

                          {/* Controls (Move Up/Down & Remove) */}
                          {canWrite && (
                            <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveStep(index, 'UP')}
                                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                title="Naikkan Urutan"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === processSteps.length - 1}
                                onClick={() => handleMoveStep(index, 'DOWN')}
                                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                title="Turunkan Urutan"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={processSteps.length <= 1}
                                onClick={() => handleRemoveStep(step.id)}
                                className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 disabled:opacity-30 cursor-pointer ml-1"
                                title="Hapus Langkah Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* STEP DETAILS GRID */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                              <Thermometer className="w-3 h-3 text-amber-600" /> Target Suhu
                            </label>
                            <input
                              type="text"
                              value={step.targetTemp || ''}
                              disabled={!canWrite}
                              onChange={(e) => handleUpdateStep(step.id, 'targetTemp', e.target.value)}
                              placeholder="misal: 85-90°C"
                              className="w-full mt-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:border-purple-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                              <RotateCw className="w-3 h-3 text-purple-600" /> Putaran RPM / Mixing
                            </label>
                            <input
                              type="text"
                              value={step.targetRpm || ''}
                              disabled={!canWrite}
                              onChange={(e) => handleUpdateStep(step.id, 'targetRpm', e.target.value)}
                              placeholder="misal: 700 RPM"
                              className="w-full mt-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:border-purple-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                              <Clock className="w-3 h-3 text-blue-600" /> Durasi Estimasi
                            </label>
                            <input
                              type="text"
                              value={step.durationMin || ''}
                              disabled={!canWrite}
                              onChange={(e) => handleUpdateStep(step.id, 'durationMin', e.target.value)}
                              placeholder="misal: 20 menit"
                              className="w-full mt-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:border-purple-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* INSTRUCTION TEXTAREA */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Petunjuk Operasional Operator:
                          </label>
                          <textarea
                            rows={2}
                            value={step.instruction}
                            disabled={!canWrite}
                            onChange={(e) => handleUpdateStep(step.id, 'instruction', e.target.value)}
                            placeholder="Tuliskan petunjuk operasional langkah pengolahan ini..."
                            className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:border-purple-600 focus:outline-none"
                          />
                        </div>

                        {/* MATCHED INGREDIENTS CHECKLIST (AUTO-UPDATE BOM) */}
                        <div className="pt-2 border-t border-slate-200">
                          <label className="block text-[10px] font-bold text-purple-700 uppercase mb-2">
                            Pilih Bahan untuk Tahap ini (Otomatis update Fase di Master BOM):
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {formulation.ingredients.map(ing => {
                              const isSelected = (step.ingredientCodes || []).includes(ing.rawMaterialCode);
                              const rmName = rawMaterials.find(r => r.code === ing.rawMaterialCode)?.name || ing.rawMaterialCode;
                              return (
                                <label 
                                  key={ing.rawMaterialCode} 
                                  className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'bg-purple-100 border-purple-300 text-purple-900 shadow-2xs' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="accent-purple-600 w-3 h-3 cursor-pointer"
                                    checked={isSelected}
                                    disabled={!canWrite}
                                    onChange={() => handleToggleIngredient(step.id, ing.rawMaterialCode)}
                                  />
                                  <span>{rmName} <span className="font-mono text-[9px] text-slate-500 font-medium">({ing.percentage}%)</span></span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {canWrite && (
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="w-full py-2.5 border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/40 hover:bg-purple-50 rounded-2xl text-xs font-black text-purple-800 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Tambah Langkah Proses Baru</span>
                  </button>
                )}
              </div>

              {/* SECTION 3: SPESIFIKASI PRODUK RUAHAN (READONLY TERKUNCI DARI MASTER PRODUK JADI) */}
              <div className="bg-white p-5 rounded-2xl border-2 border-purple-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        3. Spesifikasi Produk Ruahan Mixing (In-Process Control QC)
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Otomatis ditarik dari Master Data Produk Jadi ({product?.code || formulation.productCode || 'PJ0001'})
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-700" /> Terkunci (Single Source of Truth)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">1. Bentuk</span>
                    <span className="font-extrabold text-slate-800 text-xs block mt-1">{productSpecs.appearance}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">2. Warna</span>
                    <span className="font-extrabold text-slate-800 text-xs block mt-1">{productSpecs.color}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">3. Bau</span>
                    <span className="font-extrabold text-slate-800 text-xs block mt-1">{productSpecs.odor}</span>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                    <span className="text-[10px] font-bold text-purple-700 uppercase block">4. pH Range</span>
                    <span className="font-mono font-black text-purple-950 text-xs block mt-1">{productSpecs.pH}</span>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                    <span className="text-[10px] font-bold text-purple-700 uppercase block">5. Viskositas</span>
                    <span className="font-mono font-black text-purple-950 text-[11px] block mt-1 leading-tight">{productSpecs.viscosity}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-purple-600" />
                    Batas Persyaratan Rekonsiliasi Hasil Produksi: <strong className="text-slate-800 font-mono">85% - 100%</strong>
                  </span>
                  <span className="text-emerald-700 font-bold">Lolos Uji Lanjut ke Filling</span>
                </div>
              </div>

            </div>
          ) : (
            // PDF VIEW CONTAINER (Format Resmi 1:1)
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner">
              <CpbDocumentModal
                isOpen={true}
                onClose={() => setModalView('BUILDER')}
                formulation={formulation}
                product={product}
                rawMaterials={rawMaterials}
                processSteps={processSteps}
                initialMachine1={machine1}
                initialMachine2={machine2}
              />
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-purple-600" />
            <span>Spesifikasi fisika-kimia tersinkronisasi otomatis dengan standar BPOM.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Tutup
            </button>

            <button
              type="button"
              onClick={() => setModalView(modalView === 'BUILDER' ? 'PDF_PREVIEW' : 'BUILDER')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-all cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-purple-600" />
              <span>{modalView === 'BUILDER' ? 'Lihat Lembar PDF 1:1' : 'Kembali ke Builder'}</span>
            </button>

            {canWrite && (
              <button
                type="button"
                onClick={handleSaveAndClose}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Petunjuk Pengolahan</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
