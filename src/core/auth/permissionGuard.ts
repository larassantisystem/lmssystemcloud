import { UserProfile, Department, DocumentStatus } from '../../types';

/**
 * TIER 1 & TIER 2: Pengecekan Akses Tingkat Modul (Silo Departemen & Specific Access)
 */
export function canAccessModule(user: UserProfile | null, targetModule: Department): boolean {
  if (!user) return false;

  // 1. Super Admin memiliki akses ke seluruh modul sistem
  if (user.role === 'admin') return true;

  // 1b. Modul Deviasi & CAPA terbuka untuk seluruh departemen/user (pelaporan & penanganan deviasi)
  if (targetModule === 'deviations') return true;

  // 2. Modul Admin & Otoritas hanya boleh dibuka oleh Super Admin
  if (targetModule === 'admin') {
    return false;
  }

  // 3. Manajemen level Direksi dapat memantau seluruh modul operasional
  if (user.department === 'management') return true;

  // 4. Default Silo: Jika departemen user cocok dengan modul yang dituju
  if (user.department === targetModule) return true;

  // 4b. Divisi Produksi: Terintegrasi dengan jadwal PPIC dan Gudang Material
  if (user.department === 'production' && (targetModule === 'ppic' || targetModule === 'warehouse')) {
    return true;
  }

  // 5. Tier 2: Pengecekan Kondisi Khusus (Specific Access Overlay)
  if (user.specificAccess && user.specificAccess.length > 0) {
    const hasSpecific = user.specificAccess.some(
      (perm) => perm.moduleId === targetModule && (perm.accessLevel === 'read' || perm.accessLevel === 'write')
    );
    if (hasSpecific) return true;
  }

  return false;
}

/**
 * Mendapatkan level izin modul tertentu ('none' | 'read' | 'write')
 */
export function getModuleAccessLevel(
  user: UserProfile | null,
  targetModule: Department
): 'none' | 'read' | 'write' {
  if (!user) return 'none';
  if (user.role === 'admin') return 'write';

  // Modul Deviasi & CAPA: seluruh user dapat menulis / membuat deviasi
  if (targetModule === 'deviations') return 'write';

  // 1. Tier 2: Pengecekan Kondisi Khusus (Specific Access Override selalu diprioritaskan)
  if (user.specificAccess && user.specificAccess.length > 0) {
    const specific = user.specificAccess.find((p) => p.moduleId === targetModule);
    if (specific) return specific.accessLevel;
  }

  // 2. Default Silo: Jika departemen user cocok dengan modul yang dituju -> write
  if (user.department === targetModule) return 'write';

  // 3. Manajemen level Direksi dapat memantau seluruh modul operasional -> read
  if (user.department === 'management') return 'read';

  // 4. Divisi Produksi: Terintegrasi dengan jadwal PPIC dan Gudang Material -> read
  if (user.department === 'production' && (targetModule === 'ppic' || targetModule === 'warehouse')) {
    return 'read';
  }

  return 'none';
}

/**
 * Pengecekan cepat apakah user memiliki hak tulis/ubah pada modul tertentu
 */
export function canWriteModule(user: UserProfile | null, targetModule: Department): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return getModuleAccessLevel(user, targetModule) === 'write';
}

/**
 * Pengecekan cepat apakah user dalam mode akses hanya baca (Read-Only) pada modul tertentu
 */
export function isReadOnlyModule(user: UserProfile | null, targetModule: Department): boolean {
  if (!user) return false;
  if (user.role === 'admin') return false;
  return getModuleAccessLevel(user, targetModule) === 'read';
}

/**
 * TIER 3: Pengecekan Hak Eksekusi Tindakan Dokumen (CPKB Lifecycle State Guard)
 */
export function canPerformAction(
  user: UserProfile | null,
  action: 'CREATE' | 'VIEW' | 'EDIT' | 'DELETE' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'UNLOCK',
  docStatus: DocumentStatus = 'DRAFT',
  isOwner: boolean = true
): boolean {
  if (!user) return false;

  // Super Admin memiliki hak bypass untuk perbaikan darurat
  if (user.role === 'admin') return true;

  // Tindakan VIEW selalu diizinkan jika sudah lolos akses modul
  if (action === 'VIEW') return true;

  // 1. Dokumen Berstatus FINALIZED (Terkunci Mutlak untuk Kepatuhan CPKB)
  if (docStatus === 'FINALIZED') {
    // Hanya Manager departemen atau Admin yang berhak membuka kunci revisi (Unlock)
    if (action === 'UNLOCK') {
      return user.role === 'manager';
    }
    // Seluruh tindakan perubahan lainnya mutlak ditolak
    return false;
  }

  // 2. Dokumen Berstatus SUBMITTED (Sedang dalam proses telaah/verifikasi)
  if (docStatus === 'SUBMITTED') {
    if (action === 'APPROVE' || action === 'REJECT') {
      return user.role === 'supervisor' || user.role === 'manager';
    }
    if (action === 'EDIT') {
      // Hanya SPV atau Manager yang boleh mengoreksi dokumen yang sudah di-submit
      return user.role === 'supervisor' || user.role === 'manager';
    }
    // Staff tidak dapat mengedit atau menghapus dokumen yang sudah diajukan
    return false;
  }

  // 3. Dokumen Berstatus DRAFT
  if (docStatus === 'DRAFT') {
    if (action === 'CREATE' || action === 'EDIT' || action === 'SUBMIT') {
      return ['staff', 'supervisor', 'manager', 'operator'].includes(user.role);
    }
    if (action === 'DELETE') {
      // Staff hanya bisa menghapus draft miliknya sendiri; SPV/Manager bisa menghapus semua draft
      if (user.role === 'staff' || user.role === 'operator') {
        return isOwner;
      }
      return user.role === 'supervisor' || user.role === 'manager';
    }
  }

  return false;
}

/**
 * Pengecekan Khusus Hak Otorisasi Quality Manager (Quality Manager Authority Guard)
 * Hanya Admin atau Manager Departemen Quality / Management yang berhak melakukan otorisasi QM
 */
export function isQualityManager(user: UserProfile | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'manager' && (user.department === 'quality' || user.department === 'management');
}

