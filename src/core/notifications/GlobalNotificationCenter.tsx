import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Package,
  ShoppingCart,
  CalendarDays,
  Factory,
  FlaskConical,
  ArrowRight,
  Check,
  Layers,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  departmentNotificationService,
  DepartmentNotificationItem,
} from './departmentNotificationService';
import { Department, UserProfile } from '../../types';
import { NotificationBadge } from '../ui-components/NotificationBadge';
import { useAuth } from '../auth/AuthContext';
import { soundService } from '../utils/soundService';

interface GlobalNotificationCenterProps {
  onNavigate: (department: Department, subTab?: string) => void;
}

export const GlobalNotificationCenter: React.FC<GlobalNotificationCenterProps> = ({
  onNavigate,
}) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<DepartmentNotificationItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isSoundOn, setIsSoundOn] = useState<boolean>(() => soundService.isEnabled());
  const popoverRef = useRef<HTMLDivElement>(null);
  const prevUnreadCountRef = useRef<number | null>(null);

  const refreshData = async () => {
    try {
      const list = await departmentNotificationService.getNotifications();
      setNotifications(list);

      // Check if new unread notifications arrived
      const unreadCount = list.filter((n) => !n.isRead).length;
      if (prevUnreadCountRef.current !== null && unreadCount > prevUnreadCountRef.current) {
        // Find most urgent new item
        const unreadItems = list.filter((n) => !n.isRead);
        const hasCritical = unreadItems.some((n) => n.urgency === 'critical');
        const hasWarning = unreadItems.some((n) => n.urgency === 'warning');
        if (hasCritical || hasWarning) {
          soundService.play('warning');
        } else {
          soundService.play('info');
        }
      }
      prevUnreadCountRef.current = unreadCount;
    } catch (e) {
      console.error('Error refreshing notifications:', e);
    }
  };

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = soundService.toggle();
    setIsSoundOn(next);
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden && isOpen) {
        refreshData();
      }
    }, 180000); // Poll setiap 3 menit jika aktif untuk meminimalkan egress
    return () => clearInterval(interval);
  }, [isOpen]);

  // Auto-close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Permission helper: Manager only sees their own department unless Admin/Management
  const canSeeNotification = (userProfile: UserProfile | null, notificationDept: Department) => {
    if (!userProfile) return false;
    // Super Admin or Management/Direksi level users can see everything
    if (
      userProfile.role === 'admin' ||
      userProfile.department === 'admin' ||
      userProfile.department === 'management'
    ) {
      return true;
    }
    // Matching department can see
    if (userProfile.department === notificationDept) {
      return true;
    }
    // Check specific permissions/silo bypasses
    if (userProfile.specificAccess?.some((p) => p.moduleId === notificationDept)) {
      return true;
    }
    return false;
  };

  // 1. Filter notifications based on permissions
  const allowedNotifications = notifications.filter((n) => canSeeNotification(user, n.department));

  // 2. Compute dynamic, filtered counts
  const dynamicCounts = {
    all: allowedNotifications.filter((n) => !n.isRead).length,
    warehouse: allowedNotifications.filter((n) => n.department === 'warehouse' && !n.isRead).length,
    quality: allowedNotifications.filter((n) => n.department === 'quality' && !n.isRead).length,
    ppic: allowedNotifications.filter((n) => n.department === 'ppic' && !n.isRead).length,
    production: allowedNotifications.filter((n) => n.department === 'production' && !n.isRead).length,
    procurement: allowedNotifications.filter((n) => n.department === 'procurement' && !n.isRead).length,
    sales: allowedNotifications.filter((n) => n.department === 'sales' && !n.isRead).length,
    rnd: allowedNotifications.filter((n) => n.department === 'rnd' && !n.isRead).length,
    admin: allowedNotifications.filter((n) => n.department === 'admin' && !n.isRead).length,
  };

  const handleMarkAllRead = () => {
    // Mark only the ones the user is allowed to see as read
    allowedNotifications.forEach((n) => {
      if (!n.isRead) {
        departmentNotificationService.markAsRead(n.id);
      }
    });
    refreshData();
  };

  const handleItemClick = (item: DepartmentNotificationItem) => {
    departmentNotificationService.markAsRead(item.id);
    refreshData();
    setIsOpen(false);
    onNavigate(item.department, item.subTab);
  };

  // Filter items in list based on filter pill selection
  const filteredItems = allowedNotifications.filter((n) => {
    if (selectedFilter === 'all') return true;
    return n.department === selectedFilter;
  });

  return (
    <div className="relative" ref={popoverRef}>
      {/* Header Notification Bell Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 transition-all cursor-pointer shadow-xs"
        title="Pusat Notifikasi Departemen"
      >
        <Bell className="w-4 h-4" />
        {dynamicCounts.all > 0 && (
          <NotificationBadge
            count={dynamicCounts.all}
            variant="danger"
            size="sm"
            pulse={true}
            className="absolute -top-1.5 -right-1.5"
          />
        )}
      </button>

      {/* Popover Notification Dropdown */}
      {isOpen && (
        <div className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-auto sm:mt-2 w-[calc(100vw-16px)] sm:w-96 rounded-3xl bg-white border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-700 text-white flex items-center justify-center shadow-2xs">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900">
                  Notifikasi Departemen
                </h3>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Tugas & Alur Pekerjaan Antar-Divisi CPKB
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Sound Notification Mute/Unmute Toggle */}
              <button
                type="button"
                onClick={handleToggleSound}
                className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer text-[10px] font-bold ${
                  isSoundOn
                    ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                    : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-600'
                }`}
                title={isSoundOn ? 'Suara Notifikasi: AKTIF (Klik untuk Mute)' : 'Suara Notifikasi: MATI (Klik untuk Aktifkan)'}
              >
                {isSoundOn ? (
                  <Volume2 className="w-3.5 h-3.5 text-purple-700" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="hidden sm:inline">{isSoundOn ? 'Audio Aktif' : 'Mute'}</span>
              </button>

              {dynamicCounts.all > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer bg-purple-50 px-2 py-1 rounded-lg border border-purple-200/80"
                >
                  <Check className="w-3 h-3" />
                  <span className="hidden sm:inline">Tandai Semua</span>
                </button>
              )}
            </div>
          </div>

          {/* Department Filter Pills (Only showing filters user has access to) */}
          <div className="flex items-center gap-1 p-2 bg-slate-100/70 border-b border-slate-200 overflow-x-auto scrollbar-none text-[10px]">
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer ${
                selectedFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua ({dynamicCounts.all})
            </button>

            {canSeeNotification(user, 'rnd') && (
              <button
                type="button"
                onClick={() => setSelectedFilter('rnd')}
                className={`px-2 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedFilter === 'rnd'
                    ? 'bg-blue-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-blue-100'
                }`}
              >
                <span>RnD</span>
                {dynamicCounts.rnd > 0 && (
                  <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {dynamicCounts.rnd}
                  </span>
                )}
              </button>
            )}

            {canSeeNotification(user, 'quality') && (
              <button
                type="button"
                onClick={() => setSelectedFilter('quality')}
                className={`px-2 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedFilter === 'quality'
                    ? 'bg-amber-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-amber-100'
                }`}
              >
                <span>QC</span>
                {dynamicCounts.quality > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {dynamicCounts.quality}
                  </span>
                )}
              </button>
            )}

            {canSeeNotification(user, 'warehouse') && (
              <button
                type="button"
                onClick={() => setSelectedFilter('warehouse')}
                className={`px-2 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedFilter === 'warehouse'
                    ? 'bg-orange-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-orange-100'
                }`}
              >
                <span>Gudang</span>
                {dynamicCounts.warehouse > 0 && (
                  <span className="w-4 h-4 rounded-full bg-orange-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {dynamicCounts.warehouse}
                  </span>
                )}
              </button>
            )}

            {canSeeNotification(user, 'ppic') && (
              <button
                type="button"
                onClick={() => setSelectedFilter('ppic')}
                className={`px-2 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedFilter === 'ppic'
                    ? 'bg-indigo-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-indigo-100'
                }`}
              >
                <span>PPIC</span>
                {dynamicCounts.ppic > 0 && (
                  <span className="w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {dynamicCounts.ppic}
                  </span>
                )}
              </button>
            )}

            {canSeeNotification(user, 'procurement') && (
              <button
                type="button"
                onClick={() => setSelectedFilter('procurement')}
                className={`px-2 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedFilter === 'procurement'
                    ? 'bg-purple-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-purple-100'
                }`}
              >
                <span>PO</span>
                {dynamicCounts.procurement > 0 && (
                  <span className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {dynamicCounts.procurement}
                  </span>
                )}
              </button>
            )}

            {canSeeNotification(user, 'production') && (
              <button
                type="button"
                onClick={() => setSelectedFilter('production')}
                className={`px-2 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedFilter === 'production'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-emerald-100'
                }`}
              >
                <span>Produksi</span>
                {dynamicCounts.production > 0 && (
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {dynamicCounts.production}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1.5">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-1.5 text-emerald-500 opacity-60" />
                <p className="font-bold text-slate-700">Tidak ada notifikasi tertunda</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Semua tugas departemen telah diselesaikan.</p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                    item.isRead
                      ? 'bg-white border-slate-100 opacity-70 hover:opacity-100 hover:border-slate-300'
                      : item.urgency === 'critical'
                      ? 'bg-rose-50/60 border-rose-200 hover:bg-rose-100/50'
                      : item.urgency === 'warning'
                      ? 'bg-amber-50/60 border-amber-200 hover:bg-amber-100/50'
                      : item.urgency === 'success'
                      ? 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100/50'
                      : 'bg-slate-50 border-slate-200 hover:bg-purple-50/50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      {item.urgency === 'critical' ? (
                        <div className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow-xs">
                          !
                        </div>
                      ) : item.urgency === 'warning' ? (
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px]">
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </div>
                      ) : item.urgency === 'success' ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px]">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          {item.department.toUpperCase()}
                        </span>
                        {!item.isRead && (
                          <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0"></span>
                        )}
                      </div>

                      <h4 className="text-xs font-black text-slate-900 mt-1 leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>

                      <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-slate-200/50 text-[10px]">
                        <span className="text-purple-700 font-bold flex items-center gap-1">
                          {item.actionLabel || 'Buka Halaman'}
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
