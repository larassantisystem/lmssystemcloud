import React, { useState, useEffect } from 'react';
import { RawMaterial, PackagingMaterial, BulkFormulation, Product, ProductVariant } from '../types';
import { RndMaterialsTab } from './rnd/RndMaterialsTab';
import { RndPackagingTab } from './rnd/RndPackagingTab';
import { RndProductsTab } from './rnd/RndProductsTab';
import { RndFormulaTab } from './rnd/RndFormulaTab';
import { RndBomCalculatorTab } from './rnd/RndBomCalculatorTab';
import { productService } from '../features/rnd/products/productService';
import { materialService } from '../features/rnd/materials/materialService';
import { packagingService } from '../features/rnd/materials/packagingService';
import { formulaService } from '../features/rnd/formula/formulaService';
import {
  FlaskConical,
  Layers,
  PackageCheck,
  CheckCircle2,
  Database,
  Boxes,
  Trash2
} from 'lucide-react';

interface RndModuleProps {
  activeSubTab?: 'materials' | 'packaging' | 'products' | 'formula' | 'bom-calculator';
  onSelectSubTab?: (subTab: 'materials' | 'packaging' | 'products' | 'formula' | 'bom-calculator') => void;
}

export const RndModule: React.FC<RndModuleProps> = ({
  activeSubTab: externalSubTab,
  onSelectSubTab: setExternalSubTab,
}) => {
  const [internalSubTab, setInternalSubTab] = useState<'materials' | 'packaging' | 'products' | 'formula' | 'bom-calculator'>('products');
  
  const activeSubTab = externalSubTab || internalSubTab;
  const setActiveSubTab = (tab: 'materials' | 'packaging' | 'products' | 'formula' | 'bom-calculator') => {
    if (setExternalSubTab) {
      setExternalSubTab(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  // --- RAW MATERIALS STATE (B0001 dst) ---
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  // --- PACKAGING MATERIALS STATE (K0001 dst) ---
  const [packagingMaterials, setPackagingMaterials] = useState<PackagingMaterial[]>([]);
  // --- PRODUCTS STATE (PJ0001 dst & Multi-Variants) ---
  const [products, setProducts] = useState<Product[]>([]);
  // --- FORMULATIONS STATE ---
  const [formulations, setFormulations] = useState<BulkFormulation[]>([]);
  const [selectedFormulation, setSelectedFormulation] = useState<BulkFormulation | null>(null);

  // Data Loading directly from Supabase
  useEffect(() => {
    // 1. Sync Materials & Packaging with Supabase
    materialService.getMaterials().then((res) => {
      if (res) {
        setRawMaterials(res);
      }
    });

    packagingService.getPackagingMaterials().then((res) => {
      if (res) {
        setPackagingMaterials(res);
      }
    });

    // 2. Products & Multi-Variants (PJ0001, PJ0002) directly from Supabase
    productService.getProducts().then((res) => {
      setProducts(res);
    });

    // 3. Formulations directly from Supabase / formulaService
    formulaService.getFormulations().then((res) => {
      setFormulations(res);
      if (res.length > 0) setSelectedFormulation(res[0]);
    });
  }, []);

  const handleSaveRM = async (newRM: RawMaterial) => {
    const res = await materialService.saveSingleMaterial(newRM);
    const resolvedRM: RawMaterial = res.updatedId ? { ...newRM, id: res.updatedId } : newRM;

    const exists = rawMaterials.some((r) => r.id === resolvedRM.id || r.code === resolvedRM.code);
    let updated: RawMaterial[];
    if (exists) {
      updated = rawMaterials.map((r) => (r.id === resolvedRM.id || r.code === resolvedRM.code ? resolvedRM : r));
    } else {
      updated = [resolvedRM, ...rawMaterials];
    }
    setRawMaterials(updated);
  };

  const handleBatchSaveRM = async (newRMs: RawMaterial[]) => {
    if (!newRMs || newRMs.length === 0) return;
    setRawMaterials((prev) => {
      const map = new Map<string, RawMaterial>();
      prev.forEach((r) => map.set(r.code.trim().toUpperCase(), r));
      newRMs.forEach((r) => map.set(r.code.trim().toUpperCase(), r));
      return Array.from(map.values());
    });
    await materialService.saveMaterials(newRMs);
  };

  const handleDeleteRM = (id: string) => {
    const rm = rawMaterials.find((r) => r.id === id);
    const updated = rawMaterials.filter((r) => r.id !== id && (!rm?.code || r.code !== rm.code));
    setRawMaterials(updated);
    materialService.deleteMaterial(id, rm?.code);
  };

  const handleSavePM = async (newPM: PackagingMaterial) => {
    const res = await packagingService.saveSinglePackagingMaterial(newPM);
    const resolvedPM: PackagingMaterial = res.updatedId ? { ...newPM, id: res.updatedId } : newPM;

    const exists = packagingMaterials.some((p) => p.id === resolvedPM.id || p.code === resolvedPM.code);
    let updated: PackagingMaterial[];
    if (exists) {
      updated = packagingMaterials.map((p) => (p.id === resolvedPM.id || p.code === resolvedPM.code ? resolvedPM : p));
    } else {
      updated = [resolvedPM, ...packagingMaterials];
    }
    setPackagingMaterials(updated);
  };

  const handleBatchSavePM = async (newPMs: PackagingMaterial[]) => {
    if (!newPMs || newPMs.length === 0) return;
    setPackagingMaterials((prev) => {
      const map = new Map<string, PackagingMaterial>();
      prev.forEach((p) => map.set(p.code.trim().toUpperCase(), p));
      newPMs.forEach((p) => map.set(p.code.trim().toUpperCase(), p));
      return Array.from(map.values());
    });
    await packagingService.savePackagingMaterials(newPMs);
  };

  const handleDeletePM = (id: string) => {
    const pm = packagingMaterials.find((p) => p.id === id);
    const updated = packagingMaterials.filter((p) => p.id !== id && (!pm?.code || p.code !== pm.code));
    setPackagingMaterials(updated);
    packagingService.deletePackagingMaterial(id, pm?.code);
  };

  const handleSaveFormula = async (newFormula: BulkFormulation) => {
    const exists = formulations.some((f) => f.id === newFormula.id || f.code === newFormula.code);
    let updated: BulkFormulation[];
    if (exists) {
      updated = formulations.map((f) => (f.id === newFormula.id || f.code === newFormula.code ? newFormula : f));
    } else {
      updated = [newFormula, ...formulations];
    }
    setFormulations(updated);
    setSelectedFormulation(newFormula);
    await formulaService.saveSingleFormulation(newFormula);
  };

  const handleDeleteFormula = async (id: string, code?: string) => {
    const updated = formulations.filter((f) => f.id !== id && (!code || f.code !== code));
    setFormulations(updated);
    if (selectedFormulation?.id === id) {
      setSelectedFormulation(updated.length > 0 ? updated[0] : null);
    }
    await formulaService.deleteFormulation(id, code);
  };

  // --- PRODUCTS & VARIANTS HANDLERS (SUPABASE ONLY, NO LOCAL STORAGE) ---
  const handleSaveProduct = async (newProd: Product) => {
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === newProd.id || p.code === newProd.code);
      if (exists) {
        return prev.map((p) => (p.id === newProd.id || p.code === newProd.code ? newProd : p));
      }
      return [newProd, ...prev];
    });

    // Persist directly to Supabase tables 'products' & 'product_variants'
    await productService.saveSingleProduct(newProd);
  };

  const handleDeleteProduct = async (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));

    // Delete directly from Supabase table 'products' (cascades to variants)
    await productService.deleteProduct(productId);
  };

  const handleSaveVariant = async (productId: string, variant: ProductVariant) => {
    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== productId) return prod;
        const vExists = prod.variants.some((v) => v.id === variant.id || v.sku === variant.sku);
        let newVariants: ProductVariant[];
        if (vExists) {
          newVariants = prod.variants.map((v) => (v.id === variant.id || v.sku === variant.sku ? variant : v));
        } else {
          newVariants = [...prod.variants, variant];
        }
        return { ...prod, variants: newVariants };
      })
    );

    // Persist directly to Supabase table 'product_variants'
    await productService.saveSingleVariant(productId, variant);
  };

  const handleDeleteVariant = async (productId: string, variantId: string) => {
    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== productId) return prod;
        return {
          ...prod,
          variants: prod.variants.filter((v) => v.id !== variantId),
        };
      })
    );

    // Delete directly from Supabase table 'product_variants'
    await productService.deleteVariant(variantId);
  };

  const handleClearAllProducts = async () => {
    setProducts([]);
    await productService.clearAllProducts();
  };

  const totalVariantsCount = products.reduce((sum, p) => sum + p.variants.length, 0);

  const handleClearAllMaterials = async () => {
    if (window.confirm('Hapus semua data sementara / demo Bahan Baku & Bahan Kemas? Anda dapat menginputkan data baru secara manual melalui form aplikasi.')) {
      const rmToDelete = [...rawMaterials];
      const pmToDelete = [...packagingMaterials];

      setRawMaterials([]);
      setPackagingMaterials([]);
      
      // Delete from Supabase in background
      for (const rm of rmToDelete) {
        await materialService.deleteMaterial(rm.id, rm.code);
      }
      for (const pm of pmToDelete) {
        await packagingService.deletePackagingMaterial(pm.id, pm.code);
      }
      alert('Semua data Bahan Baku & Bahan Kemas sementara telah dibersihkan!');
    }
  };

  return (
    <div className="space-y-3.5 font-sans">
      {/* Header Banner - Compact Slim Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[9px] font-bold uppercase tracking-wider">
              Master Data CPKB / GMP
            </span>
            <span className="text-slate-300 text-xs">•</span>
            <span className="text-[11px] text-slate-500 font-medium truncate">B0001, K0001, PJ0001 & Dynamic BOM</span>
          </div>
          <h1 className="text-base sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
            Research & Development (RnD Master Data)
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="px-2.5 py-1 rounded-xl bg-purple-50/80 border border-purple-100 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase">PJ:</span>
            <span className="text-xs font-black text-purple-700 font-mono">{products.length} ({totalVariantsCount} Var)</span>
          </div>
          <div className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Bahan:</span>
            <span className="text-xs font-black text-slate-800 font-mono">{rawMaterials.length} BB</span>
          </div>
          <div className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Kemas:</span>
            <span className="text-xs font-black text-slate-800 font-mono">{packagingMaterials.length} BK</span>
          </div>

          {(rawMaterials.length > 0 || packagingMaterials.length > 0) && (
            <button
              onClick={handleClearAllMaterials}
              className="px-2.5 py-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
              title="Hapus data sementara / demo agar bisa diinput dari awal melalui aplikasi"
            >
              <Trash2 className="w-3 h-3" />
              <span>Bersihkan BB & BK</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tab Panels */}
      {activeSubTab === 'products' && (
        <RndProductsTab
          products={products}
          formulations={formulations}
          packagingMaterials={packagingMaterials}
          onSaveProduct={handleSaveProduct}
          onDeleteProduct={handleDeleteProduct}
          onSaveVariant={handleSaveVariant}
          onDeleteVariant={handleDeleteVariant}
          onClearAllProducts={handleClearAllProducts}
        />
      )}

      {activeSubTab === 'materials' && (
        <RndMaterialsTab
          rawMaterials={rawMaterials}
          onSaveRM={handleSaveRM}
          onBatchSaveRM={handleBatchSaveRM}
          onDeleteRM={handleDeleteRM}
        />
      )}

      {activeSubTab === 'packaging' && (
        <RndPackagingTab
          packagingMaterials={packagingMaterials}
          onSavePM={handleSavePM}
          onBatchSavePM={handleBatchSavePM}
          onDeletePM={handleDeletePM}
        />
      )}

      {activeSubTab === 'formula' && (
        <RndFormulaTab
          formulations={formulations}
          rawMaterials={rawMaterials}
          products={products}
          selectedFormulation={selectedFormulation}
          onSelectFormulation={setSelectedFormulation}
          onSaveFormula={handleSaveFormula}
          onDeleteFormula={handleDeleteFormula}
        />
      )}

      {activeSubTab === 'bom-calculator' && (
        <RndBomCalculatorTab
          products={products}
          formulations={formulations}
          packagingMaterials={packagingMaterials}
          rawMaterials={rawMaterials}
          selectedFormulation={selectedFormulation}
          onSelectFormulation={setSelectedFormulation}
        />
      )}
    </div>
  );
};

