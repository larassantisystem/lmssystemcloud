import React, { useState, useMemo } from 'react';
import {
  BulkFormulation,
  PackagingMaterial,
  RawMaterial,
  Product,
  ProductVariant,
} from '../../types';
import { useAuth } from '../../core/auth/AuthContext';
import { canWriteModule } from '../../core/auth/permissionGuard';
import {
  Calculator,
  Sliders,
  Layers,
  FlaskConical,
  Boxes,
  Search,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Printer,
  ArrowRightLeft,
  RefreshCw,
  Copy,
  Check,
  Eye,
  Lock,
  ChevronDown,
  ChevronUp,
  Scale,
  Sparkles,
  Info,
  ShieldCheck,
  Filter,
  Cpu,
  Package,
} from 'lucide-react';

interface RndBomCalculatorTabProps {
  products?: Product[];
  formulations: BulkFormulation[];
  packagingMaterials: PackagingMaterial[];
  rawMaterials: RawMaterial[];
  selectedFormulation: BulkFormulation | null;
  onSelectFormulation: (f: BulkFormulation) => void;
}

export const RndBomCalculatorTab: React.FC<RndBomCalculatorTabProps> = ({
  products = [],
  formulations,
  packagingMaterials,
  rawMaterials,
  selectedFormulation,
  onSelectFormulation,
}) => {
  const { user } = useAuth();
  const canWrite = canWriteModule(user, 'rnd');

  // --- SELECTION STATE ---
  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    if (selectedFormulation?.productId) return selectedFormulation.productId;
    if (products.length > 0) return products[0].id;
    return '';
  });

  const [selectedVariantId, setSelectedVariantId] = useState<string>('default');

  // Find active selected product and variant
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const selectedVariant = useMemo(() => {
    if (!selectedProduct) return null;
    return selectedProduct.variants.find((v) => v.id === selectedVariantId) || null;
  }, [selectedProduct, selectedVariantId]);

  // When product changes, auto-select its formulation if linked
  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    setSelectedVariantId('default');
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      const linkedFormula = formulations.find(
        (f) => f.productId === prod.id || f.productCode === prod.code || f.code.includes(prod.code)
      );
      if (linkedFormula) {
        onSelectFormulation(linkedFormula);
      }
    }
  };

  // --- CALCULATION PARAMETERS ---
  const [calculationMode, setCalculationMode] = useState<'BY_UNITS' | 'BY_BULK_WEIGHT'>('BY_UNITS');
  const [targetUnits, setTargetUnits] = useState<number>(5000);
  const [targetBulkWeightKg, setTargetBulkWeightKg] = useState<number>(150);
  const [bulkLossAllowancePercent, setBulkLossAllowancePercent] = useState<number>(2.0); // 2% overfill/loss
  const [packScrapAllowancePercent, setPackScrapAllowancePercent] = useState<number>(2.0); // 2% packaging scrap
  const [densityGPerMl, setDensityGPerMl] = useState<number>(1.0); // 1.0 g/ml standard
  const [masterBoxCapacityPcs, setMasterBoxCapacityPcs] = useState<number>(48); // 48 pcs per carton

  // Active filter inside BOM list
  const [activeBomView, setActiveBomView] = useState<'BY_PHASE' | 'FLAT'>('BY_PHASE');
  const [materialSearchQuery, setMaterialSearchQuery] = useState<string>('');
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [showWeighingSheetModal, setShowWeighingSheetModal] = useState<boolean>(false);

  // Multi-Packaging custom allocation state (for flexible packaging distribution)
  const [packAllocations, setPackAllocations] = useState<{ [pmCode: string]: number }>({});

  // Substitution simulator modal state
  const [showSubSimulator, setShowSubSimulator] = useState(false);
  const [simSelectedPMToSwap, setSimSelectedPMToSwap] = useState<string>('');
  const [simTargetUnits, setSimTargetUnits] = useState<number>(1000);
  const [simNewPMCode, setSimNewPMCode] = useState<string>('');
  const [simulationLog, setSimulationLog] = useState<string[]>([]);

  // Available primary packaging
  const availablePrimaries = useMemo(() => {
    return packagingMaterials.filter((p) => p.type === 'primary');
  }, [packagingMaterials]);

  // Nominal net volume per unit (grams)
  const unitNetWeightGrams = useMemo(() => {
    if (selectedVariant && selectedVariant.netVolumeGrams > 0) {
      return selectedVariant.netVolumeGrams;
    }
    if (selectedProduct && selectedProduct.variants.length > 0 && selectedProduct.variants[0].netVolumeGrams > 0) {
      return selectedProduct.variants[0].netVolumeGrams;
    }
    return 30; // fallback standard 30g / 30ml
  }, [selectedProduct, selectedVariant]);

  // --- CORE DYNAMIC BOM CALCULATION ---
  const calculationResult = useMemo(() => {
    if (!selectedFormulation) return null;

    let computedTargetUnits = targetUnits;
    let netBulkRequiredKg = 0;
    let grossBulkRequiredKg = 0;

    if (calculationMode === 'BY_UNITS') {
      computedTargetUnits = Math.max(1, targetUnits);
      // Net bulk (kg) = (units * weight_per_unit_grams) / 1000 / density
      netBulkRequiredKg = (computedTargetUnits * unitNetWeightGrams) / 1000 / (densityGPerMl || 1);
      // Gross bulk includes filling & mixing process loss allowance
      grossBulkRequiredKg = netBulkRequiredKg * (1 + (bulkLossAllowancePercent || 0) / 100);
    } else {
      grossBulkRequiredKg = Math.max(0.1, targetBulkWeightKg);
      // Net bulk available for filling after loss allowance
      netBulkRequiredKg = grossBulkRequiredKg / (1 + (bulkLossAllowancePercent || 0) / 100);
      // Expected yield in units
      computedTargetUnits = Math.floor((netBulkRequiredKg * 1000 * (densityGPerMl || 1)) / (unitNetWeightGrams || 1));
    }

    // 1. Calculate Raw Materials BOM (by Phase or Flat)
    const rawMaterialItems = selectedFormulation.ingredients.map((ing, idx) => {
      const rm = rawMaterials.find((r) => r.code === ing.rawMaterialCode);
      const neededKg = (ing.percentage / 100) * grossBulkRequiredKg;
      const neededGrams = neededKg * 1000;

      return {
        index: idx + 1,
        code: ing.rawMaterialCode,
        name: rm ? rm.name : ing.rawMaterialCode,
        chemicalName: rm?.chemicalName || '-',
        percentage: ing.percentage,
        neededKg,
        neededGrams,
        phase: ing.phase || 'Fase A',
        description: ing.description || '-',
        storageConditions: rm?.storageConditions || 'Suhu Ruang (15-25°C)',
        specNumber: rm?.specNumber || `SP-BB-${ing.rawMaterialCode}`,
      };
    });

    // Group raw materials by Phase
    const phasesGrouped: { [phaseName: string]: typeof rawMaterialItems } = {};
    rawMaterialItems.forEach((item) => {
      const p = item.phase || 'Fase A';
      if (!phasesGrouped[p]) phasesGrouped[p] = [];
      phasesGrouped[p].push(item);
    });

    // Total formula % check
    const totalPercentage = rawMaterialItems.reduce((sum, item) => sum + item.percentage, 0);

    // 2. Calculate Packaging Materials BOM
    // Determine which packaging components are needed based on variant's BOM or selected product
    const packagingItems: {
      code: string;
      name: string;
      type: 'primary' | 'secondary' | 'tertiary';
      ratioPerUnit: number;
      netUnits: number;
      scrapPercent: number;
      grossUnits: number;
      unitName: string;
      spec: string;
      supplier?: string;
    }[] = [];

    if (selectedVariant && selectedVariant.packagingBom && selectedVariant.packagingBom.length > 0) {
      // Use configured Variant Packaging BOM
      selectedVariant.packagingBom.forEach((vItem) => {
        const pm = packagingMaterials.find((p) => p.code === vItem.packagingCode);
        const ratio = vItem.quantityPerUnit || 1;
        const netRequired = Math.ceil(computedTargetUnits * ratio);
        const scrap = packScrapAllowancePercent || 0;
        const grossRequired = Math.ceil(netRequired * (1 + scrap / 100));

        packagingItems.push({
          code: vItem.packagingCode,
          name: pm ? pm.name : `Kemasan ${vItem.packagingCode}`,
          type: vItem.type || pm?.type || 'primary',
          ratioPerUnit: ratio,
          netUnits: netRequired,
          scrapPercent: scrap,
          grossUnits: grossRequired,
          unitName: pm?.unit || 'Pcs',
          spec: pm?.specNumber || pm?.materialSpec || 'Standar CPKB',
          supplier: pm?.supplier,
        });
      });
    } else {
      // Automatic standard packaging BOM mapping
      // A. Primary Container (Botol/Tube/Jar)
      const defaultPrimary = packagingMaterials.find((p) => p.type === 'primary') || packagingMaterials[0];
      if (defaultPrimary) {
        const netPrimary = computedTargetUnits;
        const grossPrimary = Math.ceil(netPrimary * (1 + packScrapAllowancePercent / 100));
        packagingItems.push({
          code: defaultPrimary.code,
          name: defaultPrimary.name,
          type: 'primary',
          ratioPerUnit: 1,
          netUnits: netPrimary,
          scrapPercent: packScrapAllowancePercent,
          grossUnits: grossPrimary,
          unitName: defaultPrimary.unit || 'Pcs',
          spec: defaultPrimary.specNumber || 'Kemasan Primer',
          supplier: defaultPrimary.supplier,
        });
      }

      // B. Secondary Box (Dus satuan)
      const defaultSecondary = packagingMaterials.find((p) => p.type === 'secondary');
      if (defaultSecondary) {
        const netSec = computedTargetUnits;
        const grossSec = Math.ceil(netSec * (1 + packScrapAllowancePercent / 100));
        packagingItems.push({
          code: defaultSecondary.code,
          name: defaultSecondary.name,
          type: 'secondary',
          ratioPerUnit: 1,
          netUnits: netSec,
          scrapPercent: packScrapAllowancePercent,
          grossUnits: grossSec,
          unitName: defaultSecondary.unit || 'Pcs',
          spec: defaultSecondary.specNumber || 'Kemasan Sekunder',
          supplier: defaultSecondary.supplier,
        });
      }

      // C. Tertiary Master Box (Karton Luar)
      const defaultTertiary = packagingMaterials.find((p) => p.type === 'tertiary');
      const boxCap = masterBoxCapacityPcs || 48;
      const netMasterBoxes = Math.ceil(computedTargetUnits / boxCap);
      const grossMasterBoxes = Math.ceil(netMasterBoxes * (1 + (packScrapAllowancePercent * 0.5) / 100));

      if (defaultTertiary) {
        packagingItems.push({
          code: defaultTertiary.code,
          name: defaultTertiary.name,
          type: 'tertiary',
          ratioPerUnit: Number((1 / boxCap).toFixed(4)),
          netUnits: netMasterBoxes,
          scrapPercent: packScrapAllowancePercent * 0.5,
          grossUnits: grossMasterBoxes,
          unitName: defaultTertiary.unit || 'Box Karton',
          spec: `Isi ${boxCap} pcs / karton`,
          supplier: defaultTertiary.supplier,
        });
      } else {
        packagingItems.push({
          code: 'K-TERTIARY-STD',
          name: `Master Box Karton (Kapasitas ${boxCap} Pcs)`,
          type: 'tertiary',
          ratioPerUnit: Number((1 / boxCap).toFixed(4)),
          netUnits: netMasterBoxes,
          scrapPercent: 1.0,
          grossUnits: grossMasterBoxes,
          unitName: 'Karton',
          spec: `Standar Pengiriman Eksternal (${boxCap} unit)`,
        });
      }
    }

    return {
      targetUnits: computedTargetUnits,
      netBulkRequiredKg,
      grossBulkRequiredKg,
      unitNetWeightGrams,
      totalPercentage,
      rawMaterialItems,
      phasesGrouped,
      packagingItems,
    };
  }, [
    selectedFormulation,
    selectedProduct,
    selectedVariant,
    calculationMode,
    targetUnits,
    targetBulkWeightKg,
    unitNetWeightGrams,
    densityGPerMl,
    bulkLossAllowancePercent,
    packScrapAllowancePercent,
    masterBoxCapacityPcs,
    rawMaterials,
    packagingMaterials,
  ]);

  // Filtered raw materials based on search
  const filteredRawMaterials = useMemo(() => {
    if (!calculationResult) return [];
    if (!materialSearchQuery.trim()) return calculationResult.rawMaterialItems;
    const q = materialSearchQuery.toLowerCase();
    return calculationResult.rawMaterialItems.filter(
      (item) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.chemicalName.toLowerCase().includes(q) ||
        item.phase.toLowerCase().includes(q)
    );
  }, [calculationResult, materialSearchQuery]);

  // Copy Summary to Clipboard
  const handleCopySummary = () => {
    if (!calculationResult || !selectedFormulation) return;

    const lines: string[] = [
      `=== RINGKASAN KALKULASI DYNAMIC BOM CPKB ===`,
      `Produk: ${selectedProduct?.name || selectedFormulation.productName} (${selectedProduct?.code || selectedFormulation.productCode})`,
      `Formula: ${selectedFormulation.code} - ${selectedFormulation.name}`,
      `Target Produksi: ${calculationResult.targetUnits.toLocaleString()} Pcs (@ ${calculationResult.unitNetWeightGrams}g)`,
      `Total Bulk Diperlukan: ${calculationResult.grossBulkRequiredKg.toFixed(3)} Kg (Net: ${calculationResult.netBulkRequiredKg.toFixed(3)} Kg, Loss: ${bulkLossAllowancePercent}%)`,
      ``,
      `--- KEBUTUHAN BAHAN BAKU (RAW MATERIALS) ---`,
      ...calculationResult.rawMaterialItems.map(
        (rm) =>
          `[${rm.phase}] ${rm.code} - ${rm.name} : ${rm.percentage.toFixed(2)}% = ${rm.neededKg.toFixed(3)} Kg (${rm.neededGrams.toFixed(1)} g)`
      ),
      ``,
      `--- KEBUTUHAN BAHAN KEMAS (PACKAGING) ---`,
      ...calculationResult.packagingItems.map(
        (pm) =>
          `[${pm.type.toUpperCase()}] ${pm.code} - ${pm.name} : ${pm.grossUnits.toLocaleString()} ${pm.unitName} (Net: ${pm.netUnits.toLocaleString()}, Scrap: ${pm.scrapPercent}%)`
      ),
      ``,
      `Generated by DDMP CPKB System - PT. Larassanti Makmur Sejahtera`,
    ];

    navigator.clipboard.writeText(lines.join('\n'));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  // Substitution simulator logic
  const handleLaunchSubSimulator = (pmCode: string, currentUnits: number) => {
    setSimSelectedPMToSwap(pmCode);
    setSimTargetUnits(currentUnits);
    const otherPM = availablePrimaries.find((p) => p.code !== pmCode);
    if (otherPM) setSimNewPMCode(otherPM.code);
    setShowSubSimulator(true);
    setSimulationLog([]);
  };

  const handleExecuteSimulation = () => {
    const oldPM = packagingMaterials.find((p) => p.code === simSelectedPMToSwap);
    const newPM = packagingMaterials.find((p) => p.code === simNewPMCode);

    if (!oldPM || !newPM) return;

    const oldVolGram = (oldPM.unitCapacityGrams || 30) * simTargetUnits;
    const newUnitCap = newPM.unitCapacityGrams || 1;
    const newCalculatedUnits = Math.floor(oldVolGram / newUnitCap);
    const leftoverGrams = oldVolGram % newUnitCap;

    const logs: string[] = [
      `[SIMULASI ALOKASI KEMASAN DARURAT CPKB]`,
      `> Kemasan Lama: ${oldPM.code} (${oldPM.name}) @ ${oldPM.unitCapacityGrams || 30}g x ${simTargetUnits.toLocaleString()} pcs`,
      `> Total Massa Bulk: ${(oldVolGram / 1000).toFixed(3)} Kg (${oldVolGram.toLocaleString()} gram)`,
      `> Kemasan Pengganti: ${newPM.code} (${newPM.name}) @ ${newPM.unitCapacityGrams || 30}g`,
      `> [HASIL KONVERSI] Dibutuhkan ${newCalculatedUnits.toLocaleString()} pcs kemasan ${newPM.code}`,
    ];

    if (leftoverGrams > 0) {
      logs.push(`> [CATATAN RESIDU] Sisa bulk residual: ${leftoverGrams} gram (alokasikan ke sampel retensi QC / buffer).`);
    } else {
      logs.push(`> [SUKSES] Konversi massa 100% sempurna tanpa sisa residu.`);
    }

    setSimulationLog(logs);
  };

  return (
    <div className="space-y-3 font-sans">
      {/* Read-Only Notice for Non-R&D Users */}
      {!canWrite && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900">Akses R&D: Mode Baca (Read-Only)</div>
              <div className="text-[10px] text-amber-700">
                Akun Anda ({user?.name || user?.nik}) dapat melihat dan mensimulasikan kalkulasi BOM secara bebas.
              </div>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-md flex items-center gap-1">
            <Eye className="w-3 h-3" /> Read-Only
          </span>
        </div>
      )}

      {/* SECTION 1: PRODUCT SELECTOR & BATCH SIZE CONTROLS */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-bold uppercase tracking-wider">
              <Calculator className="w-3 h-3 text-purple-600" />
              Dynamic BOM Engine CPKB
            </div>
            <h2 className="text-sm font-black text-slate-800 tracking-tight">
              Kalkulator Kebutuhan Bahan Baku & Bahan Kemas
            </h2>
            <p className="text-[11px] text-slate-500 max-w-2xl leading-tight">
              Pilih produk dan masukkan target batch produksi. Sistem secara dinamis mengonversi formula 100% dan BOM kemasan menjadi daftar kebutuhan material presisi siap timbang.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleCopySummary}
              disabled={!calculationResult}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer shadow-2xs"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Tersalin!' : 'Salin BOM'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowWeighingSheetModal(true)}
              disabled={!calculationResult}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Lembar Penimbangan</span>
            </button>
          </div>
        </div>

        {/* CONTROLS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* LEFT: Product & Formula Selector (5 Cols) */}
          <div className="lg:col-span-5 space-y-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-purple-600" />
                Langkah 1: Pilih Produk & Formula
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {products.length} Produk Terdaftar
              </span>
            </div>

            {/* 1.1 Product Selector Dropdown */}
            <div className="space-y-0.5">
              <label className="block text-[9px] font-bold text-slate-600 uppercase">
                Pilih Produk Jadi (PJ)
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-purple-600 shadow-2xs"
              >
                {products.length > 0 ? (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} ({p.category})
                    </option>
                  ))
                ) : (
                  <option value="">Tidak ada produk terdaftar</option>
                )}
              </select>
            </div>

            {/* 1.2 Variant Selector (If Multi-Variant exists) */}
            {selectedProduct && selectedProduct.variants.length > 0 && (
              <div className="space-y-0.5">
                <label className="block text-[9px] font-bold text-slate-600 uppercase">
                  Pilih Varian Kemasan Produk
                </label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-600 shadow-2xs"
                >
                  <option value="default">
                    Standar Produk Utama ({selectedProduct.variants[0].variantName || 'Varian Default'} - {selectedProduct.variants[0].netVolumeGrams}g)
                  </option>
                  {selectedProduct.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.variantCode} - {v.variantName} ({v.netVolumeGrams}g / {v.sku || 'SKU'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 1.3 Active Formula Selector */}
            <div className="space-y-0.5">
              <label className="block text-[9px] font-bold text-slate-600 uppercase">
                Pilih Formula Aktif (Bulk Recipe)
              </label>
              <select
                value={selectedFormulation?.id || ''}
                onChange={(e) => {
                  const f = formulations.find((form) => form.id === e.target.value);
                  if (f) onSelectFormulation(f);
                }}
                className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-purple-600 shadow-2xs"
              >
                {formulations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} - {f.name} (v{f.version || '1.0'})
                  </option>
                ))}
              </select>
            </div>

            {/* Product & Formula Info Card */}
            {selectedFormulation && (
              <div className="p-2 bg-purple-50/60 rounded-lg border border-purple-100 text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-purple-900">Standar Basis Formula:</span>
                  <span className="font-mono font-bold text-purple-800">
                    {selectedFormulation.bulkQuantityKg || 100} Kg (100%)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-purple-900">Net Volume per Unit:</span>
                  <span className="font-mono font-bold text-purple-800">{unitNetWeightGrams} g/ml</span>
                </div>
                {selectedProduct?.bpomNotificationNumber && (
                  <div className="flex items-center justify-between pt-1 border-t border-purple-200/60">
                    <span className="text-slate-500 font-medium">No. Notifikasi BPOM:</span>
                    <span className="font-mono font-bold text-slate-700">
                      {selectedProduct.bpomNotificationNumber}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Batch Size & Dynamic Target Inputs (7 Cols) */}
          <div className="lg:col-span-7 space-y-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-600" />
                  Langkah 2: Tentukan Target Ukuran Batch Produksi
                </span>

                {/* Toggle Calculation Mode */}
                <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-[10px] font-bold shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setCalculationMode('BY_UNITS')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      calculationMode === 'BY_UNITS'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Target Pcs (Unit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalculationMode('BY_BULK_WEIGHT')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      calculationMode === 'BY_BULK_WEIGHT'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Target Bulk (Kg)
                  </button>
                </div>
              </div>

              {/* Main Input Field */}
              {calculationMode === 'BY_UNITS' ? (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-700">
                    Rencana Jumlah Unit Jadi yang Diproduksi (Pcs)
                  </label>
                  <div className="relative rounded-xl shadow-2xs">
                    <input
                      type="number"
                      min="1"
                      step="100"
                      value={targetUnits}
                      onChange={(e) => setTargetUnits(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-white border border-purple-300 focus:border-purple-600 rounded-xl py-1.5 pl-3 pr-12 text-sm text-slate-900 font-mono font-bold focus:outline-none"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-purple-700 uppercase">
                      Pcs
                    </div>
                  </div>

                  {/* Preset Buttons for Pcs */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400">Preset Cepat:</span>
                    {[500, 1000, 2500, 5000, 10000].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setTargetUnits(qty)}
                        className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded border cursor-pointer transition-all ${
                          targetUnits === qty
                            ? 'bg-purple-100 border-purple-300 text-purple-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {qty.toLocaleString()} pcs
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-700">
                    Kapasitas Tangki Mixing / Total Berat Adonan Bulk (Kg)
                  </label>
                  <div className="relative rounded-xl shadow-2xs">
                    <input
                      type="number"
                      min="0.1"
                      step="5"
                      value={targetBulkWeightKg}
                      onChange={(e) => setTargetBulkWeightKg(Math.max(0.1, Number(e.target.value)))}
                      className="w-full bg-white border border-purple-300 focus:border-purple-600 rounded-xl py-1.5 pl-3 pr-12 text-sm text-slate-900 font-mono font-bold focus:outline-none"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-purple-700 uppercase">
                      Kg
                    </div>
                  </div>

                  {/* Preset Buttons for Kg */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400">Preset Batch Pabrik:</span>
                    {[5, 25, 50, 100, 250, 500, 1000].map((kg) => (
                      <button
                        key={kg}
                        type="button"
                        onClick={() => setTargetBulkWeightKg(kg)}
                        className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded border cursor-pointer transition-all ${
                          targetBulkWeightKg === kg
                            ? 'bg-purple-100 border-purple-300 text-purple-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {kg} kg
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Loss & Allowance Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 hover:text-purple-900 cursor-pointer"
                >
                  <span>Pengaturan Toleransi Susut & Spesifikasi (Overfill / Scrap)</span>
                  {showAdvancedParams ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showAdvancedParams && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 mt-1.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase">
                        Susut Ruahan Bulk (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={bulkLossAllowancePercent}
                        onChange={(e) => setBulkLossAllowancePercent(Math.max(0, Number(e.target.value)))}
                        className="w-full mt-0.5 bg-slate-50 border border-slate-200 rounded py-0.5 px-1.5 text-xs font-mono font-bold text-slate-800"
                      />
                      <span className="text-[8px] text-slate-400 block mt-0.5">Kompensasi sisa pipa/tangki</span>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase">
                        Susut Bahan Kemas (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={packScrapAllowancePercent}
                        onChange={(e) => setPackScrapAllowancePercent(Math.max(0, Number(e.target.value)))}
                        className="w-full mt-0.5 bg-slate-50 border border-slate-200 rounded py-0.5 px-1.5 text-xs font-mono font-bold text-slate-800"
                      />
                      <span className="text-[8px] text-slate-400 block mt-0.5">Scrap reject mesin filling</span>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase">
                        Kapasitas Master Box
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="6"
                        value={masterBoxCapacityPcs}
                        onChange={(e) => setMasterBoxCapacityPcs(Math.max(1, Number(e.target.value)))}
                        className="w-full mt-0.5 bg-slate-50 border border-slate-200 rounded py-0.5 px-1.5 text-xs font-mono font-bold text-slate-800"
                      />
                      <span className="text-[8px] text-slate-400 block mt-0.5">Pcs per karton tersier</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Balance Confirmation */}
            {calculationResult && (
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-semibold">Hasil Konversi Massa:</span>
                <span className="font-mono font-extrabold text-purple-900 bg-purple-100/70 border border-purple-200 px-2 py-0.5 rounded-md">
                  {calculationResult.targetUnits.toLocaleString()} Pcs ⟷ {calculationResult.grossBulkRequiredKg.toFixed(3)} Kg Bulk
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: REAL-TIME SUMMARY KPI CARDS */}
      {calculationResult && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">
                Target Output
              </span>
              <Package className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div className="text-base font-black text-slate-900 font-mono">
              {calculationResult.targetUnits.toLocaleString()}{' '}
              <span className="text-[10px] font-bold text-slate-500">Pcs</span>
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5">
              Nominal @ {calculationResult.unitNetWeightGrams} g / kemasan
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[9px] font-extrabold text-purple-700 uppercase tracking-wider">
                Total Berat Bulk (Kg)
              </span>
              <Scale className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div className="text-base font-black text-purple-950 font-mono">
              {calculationResult.grossBulkRequiredKg.toFixed(3)}{' '}
              <span className="text-[10px] font-bold text-purple-700">Kg</span>
            </div>
            <div className="text-[9px] text-purple-800/80 mt-0.5">
              Net: {calculationResult.netBulkRequiredKg.toFixed(3)} Kg (+{bulkLossAllowancePercent}% loss)
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">
                Total Bahan Baku
              </span>
              <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-base font-black text-slate-900 font-mono">
              {calculationResult.rawMaterialItems.length}{' '}
              <span className="text-[10px] font-bold text-slate-500">Bahan</span>
            </div>
            <div className="text-[9px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Formula {calculationResult.totalPercentage.toFixed(2)}%
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">
                Bahan Kemas
              </span>
              <Layers className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-base font-black text-slate-900 font-mono">
              {calculationResult.packagingItems.length}{' '}
              <span className="text-[10px] font-bold text-slate-500">Komponen</span>
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              Termasuk botol, dus, & master box
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: DYNAMIC LIST - RAW MATERIALS (BAHAN BAKU) */}
      {calculationResult && (
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs">
                <FlaskConical className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  Daftar Kebutuhan Bahan Baku (Raw Material BOM)
                </h3>
                <span className="text-[10px] text-slate-500">
                  Kebutuhan massa adonan untuk <strong className="text-purple-800 font-mono">{calculationResult.grossBulkRequiredKg.toFixed(3)} Kg</strong> bulk
                </span>
              </div>
            </div>

            {/* Filter Controls: View Mode & Search */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Grouping Toggle */}
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveBomView('BY_PHASE')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    activeBomView === 'BY_PHASE'
                      ? 'bg-white text-purple-900 shadow-2xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Grup Per Fasa
                </button>
                <button
                  type="button"
                  onClick={() => setActiveBomView('FLAT')}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    activeBomView === 'FLAT'
                      ? 'bg-white text-purple-900 shadow-2xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Semua Bahan (Flat)
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode / nama bahan..."
                  value={materialSearchQuery}
                  onChange={(e) => setMaterialSearchQuery(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg py-1 pl-7 pr-2.5 text-[11px] text-slate-800 focus:outline-none focus:bg-white focus:border-purple-500 w-44"
                />
              </div>
            </div>
          </div>

          {/* Table / List Presentation */}
          {activeBomView === 'BY_PHASE' && !materialSearchQuery ? (
            // GROUPED BY PHASE VIEW
            <div className="space-y-2">
              {Object.keys(calculationResult.phasesGrouped).map((phaseName) => {
                const phaseItems = calculationResult.phasesGrouped[phaseName];
                const phaseTotalPercentage = phaseItems.reduce((sum, item) => sum + item.percentage, 0);
                const phaseTotalKg = phaseItems.reduce((sum, item) => sum + item.neededKg, 0);

                return (
                  <div
                    key={phaseName}
                    className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50"
                  >
                    {/* Phase Header */}
                    <div className="bg-slate-100/90 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-purple-700 text-white text-[9px] font-black uppercase font-mono">
                          {phaseName}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {phaseItems.length} Bahan Terlibat
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-slate-500 font-semibold">
                          Subtotal: <strong className="text-slate-800">{phaseTotalPercentage.toFixed(2)}%</strong>
                        </span>
                        <span className="text-purple-900 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                          {phaseTotalKg.toFixed(3)} Kg
                        </span>
                      </div>
                    </div>

                    {/* Phase Items Table */}
                    <div className="divide-y divide-slate-100 bg-white">
                      {phaseItems.map((item) => (
                        <div
                          key={item.code}
                          className="p-2 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-purple-50/20 transition-colors"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="w-5 text-center font-mono font-bold text-[10px] text-slate-400 shrink-0 pt-0.5">
                              #{item.index}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[11px] font-black text-purple-900 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
                                  {item.code}
                                </span>
                                <span className="font-bold text-slate-800 text-xs truncate">
                                  {item.name}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {item.chemicalName !== '-' ? item.chemicalName : item.specNumber}
                              </div>
                              <div className="text-[9px] text-slate-400">
                                📍 Simpan: <span className="text-slate-600 font-medium">{item.storageConditions}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 border-slate-100 pt-1.5 sm:pt-0">
                            <div className="text-right">
                              <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                                {item.percentage.toFixed(2)}%
                              </span>
                            </div>
                            <div className="text-right mt-0.5">
                              <span className="font-mono text-xs font-black text-slate-900 block">
                                {item.neededKg.toFixed(3)} <span className="text-[9px] font-normal text-slate-500">kg</span>
                              </span>
                              <span className="font-mono text-[9px] text-slate-400 font-bold block">
                                ({item.neededGrams.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g)
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // FLAT LIST VIEW OR SEARCH FILTERED
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
              {filteredRawMaterials.length > 0 ? (
                filteredRawMaterials.map((item) => (
                  <div
                    key={item.code}
                    className="p-2 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-purple-50/20 transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 text-[9px] font-black uppercase font-mono shrink-0">
                        {item.phase}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-black text-purple-900 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
                            {item.code}
                          </span>
                          <span className="font-bold text-slate-800 text-xs">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {item.chemicalName !== '-' ? item.chemicalName : item.specNumber}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          📍 Simpan: <span className="text-slate-600 font-medium">{item.storageConditions}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 border-slate-100 pt-1.5 sm:pt-0">
                      <div className="text-right">
                        <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                          {item.percentage.toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-right mt-0.5">
                        <span className="font-mono text-xs font-black text-slate-900 block">
                          {item.neededKg.toFixed(3)} <span className="text-[9px] font-normal text-slate-500">kg</span>
                        </span>
                        <span className="font-mono text-[9px] text-slate-400 font-bold block">
                          ({item.neededGrams.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g)
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs italic">
                  Tidak ada bahan baku yang cocok dengan pencarian "{materialSearchQuery}".
                </div>
              )}
            </div>
          )}

          {/* Raw Material BOM Total Bar */}
          <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-700" />
              <div>
                <span className="text-xs font-black text-purple-900 block">
                  Total Akumulasi Massa Penimbangan (Gross Bulk)
                </span>
                <span className="text-[10px] text-purple-700">
                  Formula Terverifikasi 100.00% CPKB dengan toleransi susut {bulkLossAllowancePercent}%
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="font-mono text-sm sm:text-base font-black text-purple-950 block">
                {calculationResult.grossBulkRequiredKg.toFixed(3)} Kg
              </span>
              <span className="font-mono text-[10px] text-purple-800 block">
                {(calculationResult.grossBulkRequiredKg * 1000).toLocaleString()} gram
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: DYNAMIC LIST - PACKAGING MATERIALS (BAHAN KEMAS) */}
      {calculationResult && (
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Daftar Kebutuhan Bahan Kemas (Packaging BOM)
                </h3>
                <span className="text-[10px] text-slate-500">
                  Alokasi kemasan primer, sekunder, dan tersier untuk <strong className="text-slate-800 font-mono">{calculationResult.targetUnits.toLocaleString()} Pcs</strong> output produk
                </span>
              </div>
            </div>

            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
              Scrap Allowance: {packScrapAllowancePercent}%
            </span>
          </div>

          {/* Packaging List Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {calculationResult.packagingItems.map((pm) => (
              <div
                key={pm.code}
                className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between gap-2 hover:border-purple-300 transition-colors shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded font-mono ${
                        pm.type === 'primary'
                          ? 'bg-purple-100 text-purple-900 border border-purple-200'
                          : pm.type === 'secondary'
                          ? 'bg-blue-100 text-blue-900 border border-blue-200'
                          : 'bg-amber-100 text-amber-900 border border-amber-200'
                      }`}
                    >
                      Kemasan {pm.type}
                    </span>

                    <span className="font-mono text-[9px] font-bold text-slate-500">
                      Rasio: {pm.ratioPerUnit} / unit
                    </span>
                  </div>

                  <div className="font-bold text-slate-800 text-xs">{pm.name}</div>
                  <div className="font-mono text-[10px] text-purple-700 font-bold">
                    {pm.code}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5">
                    Spesifikasi: <span className="text-slate-600 font-medium">{pm.spec}</span>
                  </div>
                  {pm.supplier && (
                    <div className="text-[9px] text-slate-400">
                      Supplier: <span className="text-slate-600 font-medium">{pm.supplier}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[8px] text-slate-400 font-bold uppercase block">Kebutuhan Bersih</span>
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {pm.netUnits.toLocaleString()} {pm.unitName}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[8px] text-purple-700 font-bold uppercase block">
                      Total Gross (+{pm.scrapPercent}%)
                    </span>
                    <span className="font-mono text-xs font-black text-purple-950">
                      {pm.grossUnits.toLocaleString()} <span className="text-[9px] font-normal text-slate-500">{pm.unitName}</span>
                    </span>
                  </div>
                </div>

                {/* Sub Simulator Trigger for Primary Packaging */}
                {pm.type === 'primary' && (
                  <button
                    type="button"
                    onClick={() => handleLaunchSubSimulator(pm.code, pm.grossUnits)}
                    className="w-full text-center text-[9px] text-purple-700 hover:text-purple-900 font-bold py-1 px-2 bg-white hover:bg-purple-50 rounded-lg border border-purple-200 transition-colors cursor-pointer shadow-2xs flex items-center justify-center gap-1"
                  >
                    <ArrowRightLeft className="w-3 h-3 text-purple-600" />
                    <span>Simulasi Alih Kemasan Darurat</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: WEIGHING SHEET / CPKB DISPENSING ORDER PREVIEW */}
      {showWeighingSheetModal && calculationResult && selectedFormulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/70 backdrop-blur-xs font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-800">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase">
                    Lembar Perintah Penimbangan Resmi (Weighing Sheet CPKB)
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    Dokumen Rekaman Penimbangan Ruang Bersih (Cleanroom Dispensing)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWeighingSheetModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Printable Content Area */}
            <div className="p-4 overflow-y-auto space-y-3">
              {/* Header Box */}
              <div className="p-3 rounded-xl border border-slate-300 bg-slate-50/50 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-1.5">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      PT. LARASSANTI MAKMUR SEJAHTERA (DDMP)
                    </span>
                    <h4 className="text-sm font-black text-slate-900">
                      {selectedProduct?.name || selectedFormulation.productName}
                    </h4>
                  </div>
                  <div className="text-left sm:text-right font-mono text-xs">
                    <span className="font-bold text-purple-900 block">{selectedFormulation.code}</span>
                    <span className="text-slate-500 text-[9px]">Formula v{selectedFormulation.version || '1.0'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Target Batch Bulk</span>
                    <span className="font-mono font-black text-slate-900 text-xs">{calculationResult.grossBulkRequiredKg.toFixed(3)} Kg</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Target Output Unit</span>
                    <span className="font-mono font-black text-slate-900 text-xs">{calculationResult.targetUnits.toLocaleString()} Pcs</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Tanggal Rencana</span>
                    <span className="font-mono font-bold text-slate-700 text-xs">{new Date().toLocaleDateString('id-ID')}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Penanggung Jawab</span>
                    <span className="font-bold text-slate-700 text-xs">{user?.name || 'Staff R&D'}</span>
                  </div>
                </div>
              </div>

              {/* Weighing Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[9px] font-bold text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-1.5 px-2.5">No & Fasa</th>
                      <th className="py-1.5 px-2.5">Kode Bahan</th>
                      <th className="py-1.5 px-2.5">Nama Bahan Baku</th>
                      <th className="py-1.5 px-2.5 text-right">Kebutuhan (Kg)</th>
                      <th className="py-1.5 px-2.5 text-right">Kebutuhan (Gram)</th>
                      <th className="py-1.5 px-2.5 text-center">Timbangan Nyata</th>
                      <th className="py-1.5 px-2.5 text-center">Paraf Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {calculationResult.rawMaterialItems.map((item) => (
                      <tr key={item.code} className="hover:bg-slate-50/60">
                        <td className="py-1.5 px-2.5 font-mono text-[10px] font-bold text-purple-900">
                          #{item.index} ({item.phase})
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-700 text-[11px]">{item.code}</td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-800 text-xs">{item.name}</td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-black text-purple-950 text-xs">
                          {item.neededKg.toFixed(3)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-600 text-[11px]">
                          {item.neededGrams.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-1.5 px-2.5 text-center">
                          <span className="inline-block w-16 border-b border-slate-300 font-mono text-slate-400">____</span>
                        </td>
                        <td className="py-1.5 px-2.5 text-center">
                          <span className="inline-block w-10 border-b border-slate-300 font-mono text-slate-400">____</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-3 pt-2.5 border-t border-slate-200 text-center text-xs">
                <div className="space-y-6">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Ditimbang Oleh (Operator)</span>
                  <div className="border-t border-slate-300 pt-1 font-bold text-slate-700 text-xs">........................</div>
                </div>
                <div className="space-y-6">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Diperiksa Oleh (Supervisor)</span>
                  <div className="border-t border-slate-300 pt-1 font-bold text-slate-700 text-xs">........................</div>
                </div>
                <div className="space-y-6">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Disetujui QA / QC</span>
                  <div className="border-t border-slate-300 pt-1 font-bold text-slate-700 text-xs">........................</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 italic">
                Dokumen resmi berstandar Cara Pembuatan Kosmetika yang Baik (CPKB) BPOM.
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Dokumen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EMERGENCY PACKAGING SUBSTITUTION SIMULATOR */}
      {showSubSimulator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-4 shadow-2xl text-slate-800 relative space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-purple-600" />
                Simulasi Pengalihan Kemasan Darurat (CPKB)
              </h3>
              <button
                type="button"
                onClick={() => setShowSubSimulator(false)}
                className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="p-2.5 bg-purple-50 border border-purple-100 rounded-xl text-[11px] text-purple-900 leading-relaxed">
              <p>
                <strong>Mengatasi Kendala Kemasan Mid-Process:</strong> Menangani kondisi darurat ketika alokasi mixing yang semula direncanakan pada ukuran botol tertentu, harus dialihkan ke ukuran botol lain karena kendala pasokan kemasan. Simulator ini menghitung ulang rasio konversi volumetrik secara instan.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Kemasan Lama Terhambat</span>
                <span className="text-xs font-bold text-slate-800 block">
                  {packagingMaterials.find((p) => p.code === simSelectedPMToSwap)?.name}
                </span>
                <span className="text-[9px] font-mono font-bold text-purple-700 block">
                  Jumlah Semula: {simTargetUnits.toLocaleString()} unit
                </span>
              </div>

              <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Pilih Kemasan Alternatif Baru</span>
                <select
                  value={simNewPMCode}
                  onChange={(e) => setSimNewPMCode(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-md py-1 px-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-600"
                >
                  {availablePrimaries.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code} - {p.name} ({p.unitCapacityGrams || 30}g)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleExecuteSimulation}
                className="w-full bg-purple-700 text-xs font-bold text-white py-2 rounded-xl hover:bg-purple-800 shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Cpu className="w-3.5 h-3.5 text-amber-300" />
                <span>Hitung Konversi Volumetrik & Update BOM</span>
              </button>
            </div>

            {simulationLog.length > 0 && (
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1 max-h-40 overflow-y-auto font-mono text-[10px] text-slate-200 leading-relaxed shadow-inner">
                {simulationLog.map((log, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-1 ${
                      log.includes('[SUKSES]')
                        ? 'text-emerald-400 font-bold'
                        : log.includes('[CATATAN')
                        ? 'text-amber-400 font-semibold'
                        : ''
                    }`}
                  >
                    <span>&gt;</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
