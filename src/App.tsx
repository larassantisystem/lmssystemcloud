/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './core/auth/AuthContext';
import { LoginPage } from './core/auth/LoginPage';
import { DashboardLayout } from './core/ui-components/DashboardLayout';
import { RndModule } from './components/RndModule';
import { EmployeeManagementModule } from './features/admin/EmployeeManagementModule';
import { WarehouseModule } from './features/warehouse/components/WarehouseModule';
import { QualityModule } from './features/quality/components/QualityModule';
import { PublicCoaVerificationPage } from './features/quality/components/PublicCoaVerificationPage';
import { DeviationModule } from './features/quality/components/deviations/DeviationModule';
import { authService } from './core/auth/authService';
import { DepartmentWorkspaceDashboard } from './features/dashboard/DepartmentWorkspaceDashboard';
import { Department } from './types';
import {
  FlaskConical,
  CalendarDays,
  CheckCircle2,
  Package,
  ShoppingCart,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Layers,
  CheckCircle,
  Boxes,
  Beaker,
  Sliders,
  ChevronRight
} from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Department | 'dashboard'>('dashboard');
  const [activeRndSubTab, setActiveRndSubTab] = useState<'materials' | 'packaging' | 'products' | 'formula' | 'bom-calculator'>('products');
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'audit'>('users');
  const [activeWarehouseSubTab, setActiveWarehouseSubTab] = useState<'inbound' | 'stock-raw' | 'stock-packaging' | 'weighing' | 'finished-goods'>('inbound');
  const [activeQualitySubTab, setActiveQualitySubTab] = useState<
    | 'queue'
    | 'testing'
    | 'approval'
    | 'archive'
    | 'ipc-bulk'
    | 'ipc-finished'
    | 'ipc-rework'
    | 'retained'
    | 'stability'
    | 'sop'
    | 'capa'
    | 'complaints'
  >('queue');

  const [scannedCoaQuery, setScannedCoaQuery] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('coa') || urlParams.get('coaId') || urlParams.get('reportId') || urlParams.get('lot');
  });

  // Auto-switch to Quality tab if scanned via QR Code with ?coa= param
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const coaQuery = urlParams.get('coa') || urlParams.get('coaId') || urlParams.get('reportId') || urlParams.get('lot');
      if (coaQuery) {
        setScannedCoaQuery(coaQuery);
        setActiveTab('quality');
        setActiveQualitySubTab('archive');
      }
    }
  }, [isAuthenticated]);

  // Jika diakses melalui scan QR Code label (?coa=...), langsung tampilkan sertifikat CoA resmi tanpa terhalang login
  if (scannedCoaQuery) {
    return (
      <PublicCoaVerificationPage
        lotQuery={scannedCoaQuery}
        onExit={() => {
          if (typeof window !== 'undefined' && window.history?.replaceState) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
          setScannedCoaQuery(null);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-700 rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-600 tracking-wide">Memuat Sesi Operasional...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const handleSelectSubTab = (subTabId: string) => {
    if (['materials', 'packaging', 'products', 'formula', 'bom-calculator'].includes(subTabId)) {
      setActiveRndSubTab(subTabId as any);
      setActiveTab('rnd');
    } else if (['users', 'audit'].includes(subTabId)) {
      setActiveAdminSubTab(subTabId as any);
      setActiveTab('admin');
    } else if (['inbound', 'stock-raw', 'stock-packaging', 'weighing', 'finished-goods'].includes(subTabId)) {
      setActiveWarehouseSubTab(subTabId as any);
      setActiveTab('warehouse');
    } else if (
      [
        'queue',
        'testing',
        'approval',
        'archive',
        'ipc-bulk',
        'ipc-finished',
        'ipc-rework',
        'retained',
        'stability',
        'sop',
        'capa',
        'complaints',
        'deviations',
      ].includes(subTabId)
    ) {
      setActiveQualitySubTab(subTabId as any);
      setActiveTab('quality');
    }
  };

  const handleNavigateFromDashboard = (dept: Department, subTab?: string) => {
    setActiveTab(dept);
    if (subTab) {
      if (dept === 'rnd') setActiveRndSubTab(subTab as any);
      else if (dept === 'admin') setActiveAdminSubTab(subTab as any);
      else if (dept === 'warehouse') setActiveWarehouseSubTab(subTab as any);
      else if (dept === 'quality') setActiveQualitySubTab(subTab as any);
    }
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      activeSubTab={
        activeTab === 'rnd'
          ? activeRndSubTab
          : activeTab === 'admin'
          ? activeAdminSubTab
          : activeTab === 'warehouse'
          ? activeWarehouseSubTab
          : activeTab === 'quality'
          ? activeQualitySubTab
          : undefined
      }
      onSelectSubTab={handleSelectSubTab}
    >
      {activeTab === 'dashboard' && (
        <DepartmentWorkspaceDashboard onNavigate={handleNavigateFromDashboard} />
      )}

      {activeTab === 'rnd' && (
        <div className="max-w-7xl mx-auto space-y-3">
          <RndModule
            activeSubTab={activeRndSubTab}
            onSelectSubTab={setActiveRndSubTab}
          />
        </div>
      )}

      {activeTab === 'admin' && (
        <div className="max-w-6xl mx-auto">
          <EmployeeManagementModule
            activeSubTab={activeAdminSubTab}
            onSelectSubTab={setActiveAdminSubTab}
          />
        </div>
      )}

      {activeTab === 'warehouse' && (
        <div className="max-w-6xl mx-auto">
          <WarehouseModule
            activeSubTab={activeWarehouseSubTab}
            onSelectSubTab={(sub) => setActiveWarehouseSubTab(sub as any)}
          />
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="max-w-6xl mx-auto">
          <QualityModule
            subTab={activeQualitySubTab}
          />
        </div>
      )}

      {activeTab === 'deviations' && (
        <div className="max-w-6xl mx-auto space-y-4">
          <DeviationModule
            currentUser={user || authService.getCurrentUser() || { name: 'User', nik: 'USER', role: 'Staff' }}
          />
        </div>
      )}

      {activeTab !== 'rnd' && activeTab !== 'admin' && activeTab !== 'warehouse' && activeTab !== 'quality' && activeTab !== 'deviations' && activeTab !== 'dashboard' && (
        <div className="max-w-4xl mx-auto py-16 text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 flex items-center justify-center mx-auto shadow-xs text-slate-700">
            {activeTab === 'ppic' && <CalendarDays className="w-9 h-9 text-blue-700" />}
            {activeTab === 'quality' && <CheckCircle2 className="w-9 h-9 text-amber-700" />}
            {activeTab === 'warehouse' && <Package className="w-9 h-9 text-orange-700" />}
            {activeTab === 'procurement' && <ShoppingCart className="w-9 h-9 text-purple-700" />}
            {activeTab === 'sales' && <TrendingUp className="w-9 h-9 text-pink-700" />}
            {activeTab === 'admin' && <ShieldCheck className="w-9 h-9 text-indigo-700" />}
          </div>
          
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">
              Modul {activeTab === 'ppic' ? 'PPIC (Planning)' : activeTab === 'quality' ? 'Quality (QA/QC)' : activeTab === 'warehouse' ? 'Warehouse (Gudang)' : activeTab === 'procurement' ? 'Procurement' : activeTab === 'sales' ? 'Sales' : 'Admin & Role'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Modul ini terhubung secara demand-driven dengan data master dari RnD (BOM, Spesifikasi teknis, dan Resep bulk B0001, K0001, PJ0001).
            </p>
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Kembali ke Beranda
            </button>
            <button
              onClick={() => setActiveTab('rnd')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-md shadow-purple-700/20 transition-all cursor-pointer"
            >
              <span>Buka Modul RnD</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
