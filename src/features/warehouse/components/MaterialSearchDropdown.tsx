import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, CheckCircle2, ChevronDown, X, AlertCircle } from 'lucide-react';
import { RawMaterial, PackagingMaterial } from '../../../types';
import { GrnMaterialType } from '../types/grnTypes';

interface MaterialOption {
  id: string;
  code: string;
  name: string;
  chemicalName?: string;
  manufacturer: string;
  category: string;
  unit: string;
  storageConditions: string;
  qcParametersCount: number;
}

interface MaterialSearchDropdownProps {
  type: GrnMaterialType;
  rawMaterials: RawMaterial[];
  packagingMaterials: PackagingMaterial[];
  selectedCode?: string;
  onSelect: (item: MaterialOption) => void;
}

export const MaterialSearchDropdown: React.FC<MaterialSearchDropdownProps> = ({
  type,
  rawMaterials,
  packagingMaterials,
  selectedCode,
  onSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Normalize material data into standardized options
  const options: MaterialOption[] = useMemo(() => {
    if (type === 'raw') {
      return rawMaterials.map((rm) => ({
        id: rm.id,
        code: rm.code,
        name: rm.name,
        chemicalName: rm.chemicalName,
        manufacturer: rm.manufacturer || rm.supplier || '-',
        category: rm.categories && rm.categories.length > 0 ? rm.categories[0] : (rm.category || 'Bahan Baku'),
        unit: 'kg',
        storageConditions: rm.storageConditions || '-',
        qcParametersCount: rm.qcParameters?.length || 0,
      }));
    } else {
      return packagingMaterials.map((pm) => ({
        id: pm.id,
        code: pm.code,
        name: pm.name,
        chemicalName: '',
        manufacturer: pm.supplier || pm.manufacturer || '-',
        category: pm.type === 'primary' ? 'Primer' : pm.type === 'secondary' ? 'Sekunder' : 'Tersier',
        unit: pm.unit || 'pcs',
        storageConditions: pm.storageConditions || '-',
        qcParametersCount: pm.qcParameters?.length || 0,
      }));
    }
  }, [type, rawMaterials, packagingMaterials]);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        opt.code.toLowerCase().includes(q) ||
        opt.manufacturer.toLowerCase().includes(q) ||
        (opt.chemicalName && opt.chemicalName.toLowerCase().includes(q))
    );
  }, [options, searchQuery]);

  const selectedItem = options.find((opt) => opt.code === selectedCode);

  return (
    <div ref={wrapperRef} className="space-y-2">
      {/* Search Input Box */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={
            type === 'raw'
              ? 'Cari bahan baku berdasarkan nama, kode, atau produsen...'
              : 'Cari bahan kemas berdasarkan nama, kode, atau produsen...'
          }
          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Selectable Dropdown List Card (Matching uploaded image layout) */}
      <div className="border border-slate-200/90 rounded-2xl bg-white shadow-xs overflow-hidden">
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 scrollbar-thin">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((item) => {
              const isSelected = selectedCode === item.code;
              return (
                <div
                  key={item.id || item.code}
                  onClick={() => onSelect(item)}
                  className={`px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? type === 'raw'
                        ? 'bg-emerald-50/70'
                        : 'bg-blue-50/70'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Radio Button Selector */}
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? type === 'raw'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>

                    {/* Material Code Badge */}
                    <span
                      className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded-md shrink-0 ${
                        type === 'raw'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {item.code}
                    </span>

                    {/* Material Name & Details */}
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.chemicalName && (
                          <span className="text-[10px] text-slate-400 font-normal truncate hidden sm:inline">
                            ({item.chemicalName})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        <span className="font-medium text-slate-600">Produsen:</span> {item.manufacturer} •{' '}
                        <span className="font-medium text-slate-600">Kategori:</span> {item.category} •{' '}
                        <span className="font-medium text-slate-600">Satuan:</span> {item.unit}
                      </p>
                    </div>
                  </div>

                  {/* Right side QC Parameter Badge */}
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase bg-slate-100 px-2 py-1 rounded-md border border-slate-200/70">
                      {item.qcParametersCount} PARAMETER UJI
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">
                Tidak ada data {type === 'raw' ? 'bahan baku' : 'bahan kemas'} yang cocok
              </p>
              <p className="text-[11px] text-slate-500">
                Pastikan master data telah didaftarkan di modul RnD atau bersihkan kata kunci pencarian.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Guide Caption */}
      <p className="text-[11px] text-slate-400 italic px-1">
        *Pilih salah satu item di atas untuk mengunci data spesifikasi master & parameter pengujian QC.
      </p>
    </div>
  );
};
