import { Department, UserProfile } from '../../types';
import { qualityService } from '../../features/quality/qualityService';
import { warehouseService } from '../../features/warehouse/warehouseService';
import { stockService } from '../../features/warehouse/stockService';
import { formulaService } from '../../features/rnd/formula/formulaService';

export interface DepartmentNotificationItem {
  id: string;
  department: Department;
  subTab?: string;
  title: string;
  message: string;
  urgency: 'critical' | 'warning' | 'info' | 'success';
  timestamp: string;
  isRead: boolean;
  actionLabel?: string;
}

export interface DepartmentNotificationCounts {
  all: number;
  warehouse: number;
  quality: number;
  ppic: number;
  production: number;
  procurement: number;
  sales: number;
  rnd: number;
  admin: number;
}

let inMemoryReadNotificationIds: string[] = [];
let cachedNotifications: DepartmentNotificationItem[] = [];
let lastNotificationsFetchTime = 0;
const NOTIF_CACHE_TTL_MS = 60 * 1000; // 60 detik in-memory cache untuk mencegah duplicate request & hemat egress Supabase

export const departmentNotificationService = {
  invalidateCache: () => {
    lastNotificationsFetchTime = 0;
  },

  /**
   * Fetch all active notifications based on current system state
   */
  getNotifications: async (forceRefresh = false): Promise<DepartmentNotificationItem[]> => {
    if (!forceRefresh && cachedNotifications.length > 0 && (Date.now() - lastNotificationsFetchTime < NOTIF_CACHE_TTL_MS)) {
      return cachedNotifications;
    }

    const readIds = [...inMemoryReadNotificationIds];

    const items: DepartmentNotificationItem[] = [];

    try {
      // 1. Fetch system state in parallel (hemat egress: tidak perlu query stockLots lengkap)
      const [qcReports, grnRecords, qcEventNotifs, formulations] = await Promise.all([
        qualityService.getReports().catch(() => []),
        warehouseService.getGrnRecords().catch(() => []),
        Promise.resolve(qualityService.getNotifications()),
        formulaService.getFormulations().catch(() => []),
      ]);

      // --- 1. QC Broadcast & Event Notifications (e.g. QM Revert to Lab, Release, Reject) ---
      if (Array.isArray(qcEventNotifs)) {
        qcEventNotifs.forEach((ev) => {
          const isRevert = ev.title?.toLowerCase().includes('dikembalikan') || ev.title?.toLowerCase().includes('revert') || ev.title?.toLowerCase().includes('revisi');
          const isReject = ev.title?.toLowerCase().includes('reject') || ev.title?.toLowerCase().includes('ditolak');
          const isRelease = ev.title?.toLowerCase().includes('release') || ev.title?.toLowerCase().includes('lolos');

          items.push({
            id: `qc-event-${ev.id}`,
            department: 'quality',
            subTab: isRevert ? 'testing' : isRelease || isReject ? 'archive' : 'queue',
            title: ev.title,
            message: ev.message,
            urgency: isRevert ? 'warning' : isReject ? 'critical' : isRelease ? 'success' : 'info',
            timestamp: ev.timestamp || new Date().toISOString(),
            isRead: ev.isRead || readIds.includes(`qc-event-${ev.id}`),
            actionLabel: isRevert ? 'Buka Form Uji Lab (Revisi)' : isRelease || isReject ? 'Buka Dokumen CoA' : 'Lihat Detail QC',
          });
        });
      }

      // --- 2. QC Real-time State Queues ---
      const queueItems = qcReports.filter((r) => r.status === 'QUARANTINE');
      const testingItems = qcReports.filter((r) => r.status === 'QUALITY_CONTROL_PROCESS');
      const approvalItems = qcReports.filter((r) => r.status === 'AWAITING_QM_AUTHORIZATION');

      // Specific QM Revert Alert if items currently in testing have revision notes
      const revertedInTesting = qcReports.filter(
        (r) => r.status === 'QUALITY_CONTROL_PROCESS' && r.qmRevertToLabReason
      );

      if (revertedInTesting.length > 0) {
        revertedInTesting.forEach((rev) => {
          const revId = `qc-rev-${rev.id}-${rev.qmRevertToLabAt || 'now'}`;
          items.push({
            id: revId,
            department: 'quality',
            subTab: 'testing',
            title: `PERBAIKAN UJI LAB: ${rev.lotInternalNumber || rev.grnNumber} (${rev.materialName})`,
            message: `Quality Manager mengembalikan lot ini untuk revisi uji lab: "${rev.qmRevertToLabReason}".`,
            urgency: 'warning',
            timestamp: rev.qmRevertToLabAt || new Date().toISOString(),
            isRead: readIds.includes(revId),
            actionLabel: 'Input Hasil Uji Ulang',
          });
        });
      }

      if (queueItems.length > 0) {
        items.push({
          id: `qc-queue-summary-${queueItems.length}`,
          department: 'quality',
          subTab: 'queue',
          title: `${queueItems.length} Material Menunggu Sampling QC`,
          message: `Ada ${queueItems.length} lot kedatangan GRN baru di area karantina yang memerlukan pengambilan sampel lab.`,
          urgency: 'info',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`qc-queue-summary-${queueItems.length}`),
          actionLabel: 'Buka Antrean Sampling',
        });
      }

      if (testingItems.length > 0 && revertedInTesting.length === 0) {
        items.push({
          id: `qc-test-summary-${testingItems.length}`,
          department: 'quality',
          subTab: 'testing',
          title: `${testingItems.length} Pengujian Lab Sedang Berjalan`,
          message: `Parameter uji sedang dianalisis oleh analis QC. Segera selesaikan input hasil CoA.`,
          urgency: 'info',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`qc-test-summary-${testingItems.length}`),
          actionLabel: 'Input Hasil Uji Lab',
        });
      }

      if (approvalItems.length > 0) {
        items.push({
          id: `qc-appr-summary-${approvalItems.length}`,
          department: 'quality',
          subTab: 'approval',
          title: `PERHATIAN QM: ${approvalItems.length} Laporan Menunggu Otorisasi`,
          message: `Laporan analisa QC telah selesai diuji dan membutuhkan tanda tangan digital Quality Manager.`,
          urgency: 'critical',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`qc-appr-summary-${approvalItems.length}`),
          actionLabel: 'Otorisasi Sekarang',
        });
      }

      // --- 3. Warehouse Notifications ---
      const passedLots = grnRecords.filter(
        (g) => (g.qcStatus === 'RELEASED' || (g.qcStatus as any) === 'PASSED') && g.storageLocation?.includes('Karantina')
      );
      if (passedLots.length > 0) {
        items.push({
          id: `wh-shelve-${passedLots.length}`,
          department: 'warehouse',
          subTab: 'relocation',
          title: `${passedLots.length} Lot Lolos QC Perlu Pemindahan Rak`,
          message: `Material telah diotorisasi Rilis oleh Quality Manager. Silakan atur posisi rak rilis fisik melalui fitur Pemindahan Lokasi.`,
          urgency: 'success',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`wh-shelve-${passedLots.length}`),
          actionLabel: 'Buka Pemindahan Lokasi',
        });
      }

      const newGrns = grnRecords.filter((g) => g.qcStatus === 'QUARANTINE');
      if (newGrns.length > 0) {
        items.push({
          id: `wh-grn-${newGrns.length}`,
          department: 'warehouse',
          subTab: 'inbound',
          title: `${newGrns.length} Penerimaan GRN Terdaftar`,
          message: `Penerimaan barang telah diverifikasi koli dan terpasang label Karantina Kuning CPKB.`,
          urgency: 'info',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`wh-grn-${newGrns.length}`),
          actionLabel: 'Lihat Daftar GRN',
        });
      }

      const rejectLots = grnRecords.filter((g) => g.qcStatus === 'REJECTED');
      if (rejectLots.length > 0) {
        items.push({
          id: `wh-reject-${rejectLots.length}`,
          department: 'warehouse',
          subTab: 'stock-raw',
          title: `PERINGATAN: ${rejectLots.length} Lot Ditolak QC (Reject)`,
          message: `Material tidak memenuhi syarat CPKB. Segera amankan di Ruang Karantina B & koordinasikan retur dengan Purchasing.`,
          urgency: 'critical',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`wh-reject-${rejectLots.length}`),
          actionLabel: 'Buka Lokasi Reject',
        });
      }

      // --- 4. RnD Notifications ---
      const activeFormulas = formulations.filter((f) => f.status === 'ACTIVE' || !f.status);
      const draftFormulas = formulations.filter((f) => f.status === 'DRAFT' || f.status === 'IN_DEVELOPMENT');

      if (draftFormulas.length > 0) {
        items.push({
          id: `rnd-draft-formulas-${draftFormulas.length}`,
          department: 'rnd',
          subTab: 'formula',
          title: `${draftFormulas.length} Formulasi Bulk Dalam Pengembangan (Draft)`,
          message: `Ada formulasi kosmetik yang sedang dalam tahap uji coba skala lab dan kajian stabilitas bulk.`,
          urgency: 'info',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`rnd-draft-formulas-${draftFormulas.length}`),
          actionLabel: 'Buka Formula Bulk',
        });
      }

      items.push({
        id: 'rnd-master-specs-01',
        department: 'rnd',
        subTab: 'materials',
        title: `Master Data Material CPKB Terintegrasi (${activeFormulas.length} Formula Aktif)`,
        message: 'Spesifikasi parameter organoleptik, pH, viskositas, dan kadar aktif sinkron otomatis dengan QC lab.',
        urgency: 'info',
        timestamp: new Date().toISOString(),
        isRead: readIds.includes('rnd-master-specs-01'),
        actionLabel: 'Kelola Master Material',
      });

      // --- 5. Procurement Notifications & ROP ---
      if (rejectLots.length > 0) {
        items.push({
          id: `proc-return-${rejectLots.length}`,
          department: 'procurement',
          subTab: 'po-list',
          title: `${rejectLots.length} Lot Bahan Butuh Penggantian Vendor`,
          message: `Ada material reject dari QC yang memerlukan penerbitan klaim retur atau re-order ke supplier.`,
          urgency: 'warning',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`proc-return-${rejectLots.length}`),
          actionLabel: 'Buka Purchase Orders',
        });
      }

      try {
        const ropAlerts = await stockService.checkReorderPoints();
        if (ropAlerts.length > 0) {
          const criticalRop = ropAlerts.filter((a) => a.urgency === 'critical');
          const warningRop = ropAlerts.filter((a) => a.urgency === 'warning');

          items.push({
            id: `proc-rop-alert-${ropAlerts.length}`,
            department: 'procurement',
            title: `PERINGATAN ROP: ${ropAlerts.length} Material Di Bawah Ambang Batas Aman`,
            message: `Terdapat ${ropAlerts.length} material (${criticalRop.length} habis, ${warningRop.length} di bawah ROP) yang memerlukan pembuatan PO pembelian segera.`,
            urgency: criticalRop.length > 0 ? 'critical' : 'warning',
            timestamp: new Date().toISOString(),
            isRead: readIds.includes(`proc-rop-alert-${ropAlerts.length}`),
            actionLabel: 'Buat Purchase Order',
          });

          items.push({
            id: `wh-rop-alert-${ropAlerts.length}`,
            department: 'warehouse',
            title: `MONITORING STOK: ${ropAlerts.length} Material Menipis (Di Bawah ROP)`,
            message: `Stok fisik released untuk bahan baku/kemas telah mencapai titik ROP. Harap siapkan area penerimaan dan koordinasi re-stock.`,
            urgency: 'warning',
            timestamp: new Date().toISOString(),
            isRead: readIds.includes(`wh-rop-alert-${ropAlerts.length}`),
            actionLabel: 'Lihat Stok Gudang',
          });
        }
      } catch (e) {
        console.error('Error checking ROP alerts:', e);
      }

      // --- 6. PPIC Notifications ---
      items.push({
        id: 'ppic-mrp-01',
        department: 'ppic',
        subTab: 'mrp',
        title: 'Jadwal Kalkulasi MRP & Alokasi Bets',
        message: 'Kalkulasi kebutuhan stok bahan baku dan kemas untuk rencana produksi minggu ini.',
        urgency: 'info',
        timestamp: new Date().toISOString(),
        isRead: readIds.includes('ppic-mrp-01'),
        actionLabel: 'Buka Kalkulator MRP',
      });

      // --- 7. Production Notifications ---
      const availableReleased = grnRecords.filter((g) => g.qcStatus === 'RELEASED' || (g.qcStatus as any) === 'PASSED');
      if (availableReleased.length > 0) {
        items.push({
          id: `prod-weigh-${availableReleased.length}`,
          department: 'production',
          subTab: 'batch-mixing',
          title: `${availableReleased.length} Lot Bahan Baku Siap Ditimbang`,
          message: 'Material berstatus RILIS siap diambil untuk peracikan formula batch mixing di ruang bersih.',
          urgency: 'info',
          timestamp: new Date().toISOString(),
          isRead: readIds.includes(`prod-weigh-${availableReleased.length}`),
          actionLabel: 'Buka Ruang Mixing',
        });
      }

      // --- 8. Admin Notifications ---
      items.push({
        id: 'admin-audit-01',
        department: 'admin',
        subTab: 'audit',
        title: 'Integritas Audit Trail & CPKB Compliance',
        message: 'Rekam jejak tanda tangan digital Quality Manager & mutasi stok tersimpan aman.',
        urgency: 'info',
        timestamp: new Date().toISOString(),
        isRead: readIds.includes('admin-audit-01'),
        actionLabel: 'Buka Log Audit',
      });
    } catch (err) {
      console.error('Error computing departmental notifications:', err);
    }

    cachedNotifications = items;
    lastNotificationsFetchTime = Date.now();
    return items;
  },

  /**
   * Compute badge count for each department based on user permissions
   */
  getCounts: async (user?: UserProfile | null): Promise<DepartmentNotificationCounts> => {
    const notifications = await departmentNotificationService.getNotifications();
    
    // Filter notifications based on user permissions if provided
    let visibleNotifs = notifications;
    if (user) {
      visibleNotifs = notifications.filter((n) => {
        // Super Admin or Management level sees all
        if (user.role === 'admin' || user.department === 'management' || user.department === 'admin') {
          return true;
        }
        // Matching department
        if (user.department === n.department) {
          return true;
        }
        // Specific access grant
        if (user.specificAccess?.some((p) => p.moduleId === n.department)) {
          return true;
        }
        return false;
      });
    }

    const unread = visibleNotifs.filter((n) => !n.isRead);

    const counts: DepartmentNotificationCounts = {
      all: unread.length,
      warehouse: unread.filter((n) => n.department === 'warehouse').length,
      quality: unread.filter((n) => n.department === 'quality').length,
      ppic: unread.filter((n) => n.department === 'ppic').length,
      production: unread.filter((n) => n.department === 'production').length,
      procurement: unread.filter((n) => n.department === 'procurement').length,
      sales: unread.filter((n) => n.department === 'sales').length,
      rnd: unread.filter((n) => n.department === 'rnd').length,
      admin: unread.filter((n) => n.department === 'admin').length,
    };

    return counts;
  },

  /**
   * Mark all or specific notification as read
   */
  markAsRead: (id?: string) => {
    if (id) {
      if (!inMemoryReadNotificationIds.includes(id)) {
        inMemoryReadNotificationIds.push(id);
      }
      // If it's a qc-event, also mark in qualityService
      if (id.startsWith('qc-event-')) {
        const rawId = id.replace('qc-event-', '');
        qualityService.markNotificationAsRead(rawId);
      }
    } else {
      // Mark all current
      departmentNotificationService.getNotifications().then((all) => {
        inMemoryReadNotificationIds = all.map((n) => n.id);
        // Also mark all in QC
        const qcList = qualityService.getNotifications();
        qcList.forEach((q) => qualityService.markNotificationAsRead(q.id));
      });
    }
  },
};

