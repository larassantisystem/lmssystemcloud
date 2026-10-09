import React, { useState, useEffect } from 'react';
import { AlertTriangle, PackageX, ArrowRight, ShieldAlert, X } from 'lucide-react';
import { stockService, RopAlertItem } from '../../features/warehouse/stockService';
import { useAuth } from '../auth/AuthContext';

interface SystemInventoryBannerProps {
  onNavigateTab: (tab: any, subTab?: string) => void;
}

export const SystemInventoryBanner: React.FC<SystemInventoryBannerProps> = ({ onNavigateTab }) => {
  const { user } = useAuth();
  const [ropAlerts, setRopAlerts] = useState<RopAlertItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const isRelevantDept = ['procurement', 'warehouse', 'admin', 'manager', 'ppic'].includes(user?.department || '');

  useEffect(() => {
    if (!isRelevantDept) return;

    const fetchAlerts = async () => {
      try {
        const alerts = await stockService.checkReorderPoints();
        setRopAlerts(alerts);
      } catch (e) {
        console.error('Failed to fetch ROP alerts for banner:', e);
      }
    };
    fetchAlerts();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchAlerts();
      }
    }, 180000); // 3 menit untuk efisiensi egress
    return () => clearInterval(interval);
  }, [isRelevantDept]);

  if (dismissed || ropAlerts.length === 0) {
    return null;
  }

  if (!isRelevantDept) {
    return null;
  }

  const criticalCount = ropAlerts.filter((a) => a.urgency === 'critical').length;
  const warningCount = ropAlerts.filter((a) => a.urgency === 'warning').length;

  return (
    <>
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 text-white px-4 py-3 shadow-lg relative z-40 border-b border-amber-700">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 animate-pulse">
              <ShieldAlert className="w-5 h-5 text-yellow-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm tracking-wide">
                  PERINGATAN SISTEM: ROP (REORDER POINT) INVENTARIS
                </span>
                <span className="bg-white/25 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {ropAlerts.length} Material Menipis
                </span>
              </div>
              <p className="text-xs text-amber-100 font-medium">
                Stok bahan baku atau kemasan telah mencapai atau berada di bawah ambang batas aman (ROP). Segera lakukan re-order pembelian ke supplier.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDetailsModal(true)}
              className="bg-white text-orange-800 hover:bg-orange-50 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <PackageX className="w-3.5 h-3.5" />
              <span>Lihat Detail ({ropAlerts.length})</span>
            </button>
            <button
              onClick={() => {
                if (user?.department === 'procurement') {
                  onNavigateTab('procurement', 'po-list');
                } else {
                  onNavigateTab('warehouse', 'stock-raw');
                }
              }}
              className="bg-black/30 hover:bg-black/40 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Tindak Lanjuti</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
              title="Tutup Banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ROP Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Daftar Material Di Bawah ROP (Ambang Batas Aman)</h3>
                  <p className="text-xs text-slate-400">
                    Notifikasi otomatis Procurement & Warehouse Management
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {ropAlerts.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    item.urgency === 'critical'
                      ? 'bg-red-50/70 border-red-200'
                      : 'bg-amber-50/70 border-amber-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700">
                        {item.materialCode}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                          item.urgency === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.urgency === 'critical' ? 'Stok Habis (0)' : 'Di Bawah ROP'}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">
                        {item.materialType === 'raw' ? 'Bahan Baku' : 'Bahan Kemas'}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm">{item.materialName}</h4>
                    <div className="text-xs text-slate-600 flex items-center gap-3">
                      <span>Stok Saat Ini: <strong className="text-slate-900">{item.currentStock} {item.unit}</strong></span>
                      <span>•</span>
                      <span>Target ROP: <strong className="text-slate-900">{item.reorderPoint} {item.unit}</strong></span>
                    </div>
                  </div>

                  <div className="bg-white/80 border border-slate-200 p-2.5 rounded-lg text-right shrink-0">
                    <div className="text-[10px] text-slate-500 font-semibold">Saran Re-Order PO:</div>
                    <div className="text-sm font-black text-purple-700">
                      +{item.suggestedReorderQty} {item.unit}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Peringatan diperbarui secara real-time dari ledger gudang.
              </span>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  onNavigateTab('procurement', 'po-list');
                }}
                className="bg-purple-700 hover:bg-purple-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
              >
                <span>Buat Purchase Order Massal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
