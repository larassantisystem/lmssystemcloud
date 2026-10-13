import React, { useState, useMemo } from 'react';
import {
  BulkFormulation,
  Product,
  RawMaterial,
} from '../../types';
import {
  X,
  Printer,
  FileText,
  ShieldCheck,
  Sliders,
  Info,
} from 'lucide-react';
import { DynamicProcessStep } from './TechnicalNotesModal';
import { useEscapeKey } from '../../core/utils/useEscapeKey';

interface CpbDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  formulation: BulkFormulation;
  product?: Product | null;
  rawMaterials: RawMaterial[];
  processSteps?: DynamicProcessStep[];
  initialMachine1?: string;
  initialMachine2?: string;
}

export const CpbDocumentModal: React.FC<CpbDocumentModalProps> = ({
  isOpen,
  onClose,
  formulation,
  product,
  rawMaterials,
  processSteps,
  initialMachine1,
  initialMachine2,
}) => {
  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  // Custom metadata editable for this batch CPB print
  const [docNumber, setDocNumber] = useState<string>(() => {
    return formulation.documentNumber || `CPB-${product?.code || formulation.productCode || 'PJ0475'}-00-01-24`;
  });
  const [effectiveDate, setEffectiveDate] = useState<string>(() => {
    return formulation.effectiveDate || '13 Desember 2023';
  });
  const [revision, setRevision] = useState<string>(() => {
    return formulation.revision || '0';
  });
  const [batchNumber, setBatchNumber] = useState<string>('036JN24');
  const [batchSizeKg, setBatchSizeKg] = useState<number>(() => formulation.bulkQuantityKg || 252);
  const [drafterName, setDrafterName] = useState<string>('Putri');
  const [approverName, setApproverName] = useState<string>('Apt. Febria Hana');

  // Operational process settings
  const [machine1, setMachine1] = useState<string>(initialMachine1 || 'PRD-057 Wadah Stainless Steel 300 kg (5)');
  const [machine2, setMachine2] = useState<string>(initialMachine2 || 'PRD-049 Homogenizer 70 kg');

  // Group raw materials by Phase
  const ingredientsGrouped = useMemo(() => {
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
        : '9000 - 20000 mPa.s (cPs)',
      viscosityMethod: 'Viskositas 4 Rpm 30',
    };
  }, [product]);

  // Handle direct print
  const handlePrint = () => {
    window.print();
  };

  // Default fallback steps if none provided (e.g. opened directly from list)
  const renderSteps = processSteps && processSteps.length > 0 ? processSteps : [
    {
      id: 'fallback-1',
      stepNumber: 1,
      title: 'Peleburan & Pemanasan Fase Minyak (Oil Phase)',
      phaseCode: 'Fase B',
      instruction: 'Pada wadah, masukkan bahan Fase Minyak. Panaskan hingga larut dan homogen (tercampur rata).',
      targetTemp: '85-90°C',
      targetRpm: '-',
    },
    {
      id: 'fallback-2',
      stepNumber: 2,
      title: 'Pelarutan & Pemanasan Fase Air (Water Phase)',
      phaseCode: 'Fase A',
      instruction: 'Pada wadah utama, masukkan bahan Fase Air. Panaskan hingga larut dan homogen.',
      targetTemp: '85-90°C',
      targetRpm: '300 RPM',
    },
    {
      id: 'fallback-3',
      stepNumber: 3,
      title: 'Pencampuran / Emulsifikasi (Fase Minyak ke Fase Air)',
      phaseCode: 'Emulsifikasi',
      instruction: 'Masukkan FASE MINYAK ke dalam FASE AIR. Aduk hingga terbentuk massa Cream / Emulsi homogen.',
      targetTemp: '80-85°C',
      targetRpm: '700 RPM',
    },
    {
      id: 'fallback-4',
      stepNumber: 4,
      title: 'Penurunan Suhu Adonan (Cooling Down)',
      phaseCode: 'Pendinginan',
      instruction: 'Turunkan suhu adonan secara bertahap sambil diaduk perlahan.',
      targetTemp: '55-40°C',
      targetRpm: '300 RPM',
    },
    {
      id: 'fallback-5',
      stepNumber: 5,
      title: 'Penambahan Active Ingredient, Pengawet & Fragrance',
      phaseCode: 'Fase C',
      instruction: 'Setelah suhu di bawah 40°C, tambahkan bahan Fase C (Zat Aktif, Pewangi, Pengawet). Aduk hingga homogen.',
      targetTemp: '30-35°C',
      targetRpm: '550 RPM',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-100 rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-300 flex flex-col max-h-[96vh] overflow-hidden">
        
        {/* MODAL HEADER - CONTROLS */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Catatan Pengolahan Batch (CPB) Resmi
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-[10px] font-extrabold uppercase font-mono">
                  CPKB Standar BPOM
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Format resmi lembar petunjuk pengolahan & pengamatan mixing berstandar PT. Larassanti Makmur Sejahtera
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Dokumen (Print / PDF)</span>
            </button>
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
          
          {/* EDITABLE PARAMETERS ACCORDION */}
          <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 print:hidden">
            <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
              <span className="font-extrabold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Sliders className="w-3.5 h-3.5 text-purple-600" />
                Konfigurasi Header Dokumen
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Spek Fisika-Kimia Terkunci Otomatis dari Produk Jadi
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">No. Dokumen</label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">No. Batch</label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Ukuran Batch (Kg)</label>
                <input
                  type="number"
                  value={batchSizeKg}
                  onChange={(e) => setBatchSizeKg(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Tanggal Berlaku</label>
                <input
                  type="text"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* PRINT-PERFECT DOCUMENT SHEET CONTAINER */}
          <div className="bg-white shadow-xl mx-auto rounded-lg overflow-hidden border border-slate-400 max-w-[840px] text-black font-sans print:shadow-none print:border-none print:m-0 print:w-full">
            
            {/* 1. TOP HEADER TABLE */}
            <div className="border-b border-black">
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  <tr>
                    {/* TOP-LEFT: Company Logo & Name */}
                    <td className="w-[30%] p-2 border-r border-b border-black align-top">
                      <div className="flex items-center gap-2">
                        <img
                          src="/logo.png"
                          alt="PT. Larassanti Makmur Sejahtera"
                          className="h-8 w-auto max-w-[70px] object-contain shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="font-extrabold text-[11px] leading-tight text-slate-900 uppercase">
                          PT. LARASSANTI MAKMUR SEJAHTERA
                        </div>
                      </div>
                    </td>

                    {/* TOP-MIDDLE: Title & Product Name */}
                    <td className="w-[42%] p-2.5 border-r border-b border-black text-center align-middle">
                      <div className="font-black text-xs uppercase tracking-wider text-black">
                        CATATAN PENGOLAHAN BATCH
                      </div>
                      <div className="font-extrabold text-sm text-slate-900 mt-1">
                        {product?.name || formulation.productName || formulation.name}
                      </div>
                    </td>

                    {/* TOP-RIGHT: Official BPOM Metadata */}
                    <td className="w-[28%] p-1.5 border-b border-black text-[10px] align-top font-mono">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">No. Dokumen</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold">{docNumber}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">Tanggal Berlaku</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold">{effectiveDate}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">Revisi</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold">{revision}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">Kode Produk</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold">{product?.code || formulation.productCode || 'PJ0475'}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">Status</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold">Prosedur Baku</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">No. Batch</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold text-purple-900">{batchNumber}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">Batch Size</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold">{batchSizeKg} KG</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-slate-600 font-sans">Halaman</td>
                            <td className="py-0.5 px-1">:</td>
                            <td className="py-0.5 font-bold">1 dari 1</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>

                  {/* SIGNATURE AUTHORIZATION ROW */}
                  <tr>
                    <td colSpan={2} className="p-2 border-r border-black">
                      <div className="grid grid-cols-2 text-center text-[10px]">
                        <div className="border-r border-slate-300 pr-2">
                          <div className="text-slate-500 italic mb-4">Disusun :</div>
                          <div className="font-serif italic text-xs font-bold text-slate-800">
                            ✍️ {drafterName}
                          </div>
                          <div className="font-bold border-t border-slate-300 pt-0.5 mt-0.5">
                            {drafterName}
                          </div>
                        </div>
                        <div className="pl-2">
                          <div className="text-slate-500 italic mb-4">Diperiksa dan diterbitkan :</div>
                          <div className="font-serif italic text-xs font-bold text-slate-800">
                            ✍️ {approverName}
                          </div>
                          <div className="font-bold border-t border-slate-300 pt-0.5 mt-0.5">
                            {approverName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 bg-slate-50 text-[9px] text-slate-500 flex flex-col justify-center text-center">
                      <div className="font-bold uppercase tracking-wider text-slate-700">CPKB Terverifikasi</div>
                      <div>PT. Larassanti Makmur Sejahtera</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. MAIN 3-COLUMN BODY TABLE */}
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-black bg-slate-100 text-black font-extrabold uppercase text-center text-[10px]">
                  <th className="p-2 border-r border-black w-[54%] tracking-wider">
                    PETUNJUK PROSES PENGOLAHAN
                  </th>
                  <th className="p-2 border-r border-black w-[26%] tracking-wider">
                    HASIL PENGAMATAN PROSES
                  </th>
                  <th colSpan={2} className="p-2 border-black w-[20%] tracking-wider">
                    PARAF
                  </th>
                </tr>
                <tr className="border-b border-black bg-slate-50 text-[9px] font-bold text-slate-700 text-center">
                  <th className="border-r border-black"></th>
                  <th className="border-r border-black"></th>
                  <th className="p-1 border-r border-black w-[10%]">Operator</th>
                  <th className="p-1 w-[10%]">SPV / MNG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                
                {/* SECTION: PERSIAPAN */}
                <tr className="border-b border-black">
                  <td className="p-2.5 border-r border-black align-top space-y-1">
                    <div className="font-black uppercase tracking-wider text-black text-[10px]">
                      PERSIAPAN
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 leading-relaxed text-slate-800 text-[9.5px]">
                      <li>Pastikan semua alat tersedia dalam keadaan bersih dan siap pakai</li>
                      <li className="font-semibold">Mesin : {machine1}</li>
                      <li className="font-semibold">Mesin : {machine2}</li>
                      <li>Periksa bahan sesuai dokumen PBOS</li>
                      <li>Informasikan ke bagian QC untuk dilakukan pemeriksaan.</li>
                      <li>Pastikan alat yang akan digunakan telah bersih dari sisa Bulk</li>
                    </ul>
                  </td>
                  <td className="p-2.5 border-r border-black align-middle text-slate-800">
                    <div className="space-y-3 font-mono text-[9.5px]">
                      <div>Jam Mulai : <span className="border-b border-dotted border-black inline-block w-28"></span></div>
                    </div>
                  </td>
                  <td className="p-1 border-r border-black text-center align-middle">
                    <div className="h-10 border border-dashed border-slate-300 rounded flex items-center justify-center text-[9px] text-slate-400">
                      Paraf
                    </div>
                  </td>
                  <td className="p-1 text-center align-middle">
                    <div className="h-10 border border-dashed border-slate-300 rounded flex items-center justify-center text-[9px] text-slate-400">
                      Paraf
                    </div>
                  </td>
                </tr>

                {/* DYNAMIC STEPS (PROSES PENGOLAHAN) */}
                {renderSteps.map((step) => (
                  <tr key={step.id} className="border-b border-black">
                    <td className="p-2.5 border-r border-black align-top space-y-1">
                      <div className="font-bold text-black text-[9.5px]">
                        {step.stepNumber}. <span className="font-black">{step.title}</span>
                      </div>
                      
                      {(() => {
                        let ingsToRender: { code: string, name: string, percentage: number }[] = [];
                        
                        if (step.ingredientCodes && step.ingredientCodes.length > 0) {
                          // Map from ingredientCodes
                          step.ingredientCodes.forEach(code => {
                            const ing = formulation.ingredients.find(i => i.rawMaterialCode === code);
                            if (ing) {
                              const rmName = rawMaterials.find(r => r.code === code)?.name || code;
                              ingsToRender.push({
                                code: code,
                                name: rmName,
                                percentage: ing.percentage
                              });
                            }
                          });
                        } else if (step.phaseCode && ingredientsGrouped[step.phaseCode]) {
                          // Fallback to phase mapping
                          ingsToRender = ingredientsGrouped[step.phaseCode];
                        }
                        
                        if (ingsToRender.length > 0) {
                          return (
                            <div className="pl-4 font-bold text-slate-900 text-[9px] flex flex-wrap gap-x-3 mt-1">
                              {ingsToRender.map((ing) => (
                                <span key={ing.code}>
                                  - {ing.name} ({ing.percentage}%)
                                </span>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      })()}
                      
                      <div className="text-slate-800 text-[9.5px] pt-1 whitespace-pre-wrap">
                        {step.instruction}
                      </div>

                      {((step.targetTemp && step.targetTemp !== '-' && step.targetTemp !== 'Suhu Ruang') || (step.targetRpm && step.targetRpm !== '-')) && (
                        <div className="text-slate-900 font-bold text-[9px] mt-1 space-y-0.5">
                          {step.targetTemp && step.targetTemp !== '-' && step.targetTemp !== 'Suhu Ruang' && (
                            <div>• Target Suhu: {step.targetTemp}</div>
                          )}
                          {step.targetRpm && step.targetRpm !== '-' && (
                            <div>• Target Putaran: {step.targetRpm}</div>
                          )}
                        </div>
                      )}
                      
                      {step.durationMin && (
                        <div className="text-slate-600 italic text-[9px] mt-1">
                          Estimasi durasi: {step.durationMin}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 border-r border-black align-middle font-mono text-[9.5px] space-y-2">
                      {step.targetRpm && step.targetRpm !== '-' && (
                        <div>RPM : <span className="border-b border-dotted border-black inline-block w-36"></span></div>
                      )}
                      {step.targetTemp && step.targetTemp !== '-' && step.targetTemp !== 'Suhu Ruang' && (
                        <div>Suhu : <span className="border-b border-dotted border-black inline-block w-36"></span></div>
                      )}
                    </td>
                    <td className="p-1 border-r border-black text-center align-middle">
                      <div className="h-10 border border-dashed border-slate-300 rounded"></div>
                    </td>
                    <td className="p-1 text-center align-middle">
                      <div className="h-10 border border-dashed border-slate-300 rounded"></div>
                    </td>
                  </tr>
                ))}

                {/* SECTION: SPESIFIKASI PRODUK RUAHAN MIXING (READONLY FROM PRODUCT MASTER) */}
                <tr className="border-b border-black">
                  <td className="p-2.5 border-r border-black align-top space-y-2">
                    <div className="font-bold text-black text-[9.5px]">
                      {renderSteps.length + 1}. Ambil sample untuk pemeriksaan QC
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-300 space-y-1">
                      <div className="font-extrabold text-black uppercase tracking-wide text-[9.5px]">
                        SPESIFIKASI PRODUK RUAHAN MIXING
                      </div>
                      <table className="w-full text-[9px] border-collapse">
                        <tbody>
                          <tr>
                            <td className="w-28 py-0.5 font-semibold">1. Bentuk</td>
                            <td>: {productSpecs.appearance}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 font-semibold">2. Warna</td>
                            <td>: {productSpecs.color}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 font-semibold">3. Bau</td>
                            <td>: {productSpecs.odor}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 font-semibold">4. pH</td>
                            <td className="font-bold">: {productSpecs.pH}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 font-semibold">5. {productSpecs.viscosityMethod}</td>
                            <td className="font-bold">: {productSpecs.viscosity}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="text-[8.5px] text-slate-500 italic pt-0.5">
                        Jika memenuhi Syarat, lanjutkan ke proses filling
                      </div>
                    </div>
                    <div className="text-[9px] text-slate-800 pt-1">
                      {renderSteps.length + 2}. Bila dilakukan tindakan koreksi, catat langkah - langkahnya yaitu :
                      <div className="border-b border-dotted border-black w-full h-4"></div>
                      <div className="border-b border-dotted border-black w-full h-4"></div>
                    </div>
                  </td>
                  <td className="p-2.5 border-r border-black align-top font-mono text-[9px] space-y-2">
                    <div className="text-[9px] font-sans font-bold text-slate-700">Hasil Pengamatan QC:</div>
                    <div>Bentuk : <span className="border-b border-dotted border-black inline-block w-28"></span></div>
                    <div>Warna : <span className="border-b border-dotted border-black inline-block w-28"></span></div>
                    <div>Bau : <span className="border-b border-dotted border-black inline-block w-28"></span></div>
                    <div>pH : <span className="border-b border-dotted border-black inline-block w-28"></span></div>
                    <div>Viskositas : <span className="border-b border-dotted border-black inline-block w-24"></span></div>
                  </td>
                  <td className="p-1 border-r border-black text-center align-middle">
                    <div className="text-[8.5px] font-bold mb-1">QC</div>
                    <div className="h-12 border border-dashed border-slate-300 rounded"></div>
                  </td>
                  <td className="p-1 text-center align-middle">
                    <div className="text-[8.5px] font-bold mb-1">SPV QC</div>
                    <div className="h-12 border border-dashed border-slate-300 rounded"></div>
                  </td>
                </tr>

                {/* SECTION: REKONSILIASI PROSES PRODUKSI */}
                <tr>
                  <td className="p-2.5 border-r border-black align-top space-y-2">
                    <div className="font-black text-black text-[9.5px]">
                      {renderSteps.length + 3}. Rekonsiliasi Proses Produksi
                    </div>
                    
                    {/* TABLE REKONSILIASI */}
                    <table className="w-full border-collapse border border-black text-center text-[9px]">
                      <thead>
                        <tr className="bg-slate-100 font-bold border-b border-black">
                          <th className="p-1 border-r border-black">Teoritis (kg)</th>
                          <th className="p-1 border-r border-black">Aktual (kg)</th>
                          <th className="p-1 border-r border-black">Susut (%)</th>
                          <th className="p-1 border-r border-black">Rekonsiliasi (%)</th>
                          <th className="p-1 border-r border-black">Paraf</th>
                          <th className="p-1">Ket.*</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="h-8">
                          <td className="p-1 border-r border-black font-mono font-black text-xs">
                            {batchSizeKg}
                          </td>
                          <td className="p-1 border-r border-black font-mono"></td>
                          <td className="p-1 border-r border-black font-mono"></td>
                          <td className="p-1 border-r border-black font-mono"></td>
                          <td className="p-1 border-r border-black"></td>
                          <td className="p-1 font-bold"></td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="text-[8px] text-slate-500 italic">
                      *MS = Memenuhi Syarat, TMS = Tidak Memenuhi Syarat
                    </div>

                    <div className="font-bold text-black text-[9.5px] pt-1">
                      9. Selesaikan pengisian dokumen secara lengkap
                    </div>
                  </td>
                  <td colSpan={3} className="p-2.5 align-top space-y-2 text-[9px]">
                    <div className="bg-slate-50 p-2 rounded border border-slate-300 text-[8.5px] space-y-1 font-mono">
                      <div className="text-center font-bold text-slate-800">
                        % Susut = ((Hasil Teoritis - Hasil Aktual) / Hasil Aktual) x 100%
                      </div>
                      <div className="text-slate-600">
                        <strong>Keterangan :</strong><br />
                        % Rekonsiliasi = 100% - % Susut<br />
                        <strong>Persyaratan Rekonsiliasi : 85% - 100%</strong>
                      </div>
                    </div>

                    <div className="pt-2 text-[9.5px] space-y-1">
                      <div className="font-bold text-black">Selesai Proses Bulk :</div>
                      <div>Tgl. : <span className="border-b border-dotted border-black inline-block w-40"></span></div>
                      <div>Jam : <span className="border-b border-dotted border-black inline-block w-40"></span></div>
                    </div>
                  </td>
                </tr>

              </tbody>
            </table>

          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-purple-600" />
            <span>Format CPB ini 100% kompatibel dengan regulasi BPOM dan sistem pencatatan batch CPKB.</span>
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
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / Simpan PDF</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
