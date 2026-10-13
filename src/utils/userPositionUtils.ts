import { UserProfile } from '../types';
import { INITIAL_SYSTEM_USERS } from '../core/auth/mockUsers';

/**
 * Resolves accurate position / job title (jabatan) from a user's NIK,
 * taking position directly as defined in the user account without added academic or APJ titles.
 */
export function getUserPositionTitleByNik(nik?: string, defaultTitle?: string): string {
  if (!nik) return defaultTitle || 'Staf Analis Lab QC';
  const cleanNik = nik.trim().toUpperCase();

  if (cleanNik === 'LMS20003') return 'Quality Manager';
  if (cleanNik === 'LMS20002') return 'Supervisor Quality Control';
  if (cleanNik === 'LMS20001') return 'Staf Analis Lab QC';
  if (cleanNik === 'LMS10003') return 'R&D Manager';
  if (cleanNik === 'LMS10002') return 'Supervisor Formulasi R&D';
  if (cleanNik === 'LMS10001') return 'Staf Formulator R&D';
  if (cleanNik === 'LMS30003') return 'Warehouse & Supply Chain Manager';
  if (cleanNik === 'LMS30002') return 'Supervisor Gudang & Logistik';
  if (cleanNik === 'LMS30001') return 'Staf Gudang & Logistik';
  if (cleanNik === 'LMS40003') return 'Production Manager';
  if (cleanNik === 'LMS40002') return 'Supervisor Produksi';
  if (cleanNik === 'LMS40001') return 'Operator Produksi';
  if (cleanNik === 'LMS50003') return 'PPIC Manager';
  if (cleanNik === 'LMS50002') return 'Supervisor PPIC';
  if (cleanNik === 'LMS50001') return 'Staf PPIC';
  if (cleanNik === 'ADMIN' || cleanNik === 'LMS00000') return 'Administrator Sistem';

  const found = INITIAL_SYSTEM_USERS.find((u) => u.nik.toUpperCase() === cleanNik);
  if (found) {
    return getUserPositionTitle(found, defaultTitle);
  }

  return defaultTitle || 'Staf Analis Lab QC';
}

/**
 * Resolves accurate position / job title (jabatan) from a UserProfile or database record.
 * Takes the exact value from the database profile (position, job_title, jabatan) or standard department role.
 */
export function getUserPositionTitle(user?: UserProfile | null, defaultTitle?: string): string {
  if (!user) return defaultTitle || 'Staf Analis Lab QC';

  if ((user as any).position) {
    const rawPos = (user as any).position;
    if (typeof rawPos === 'string' && rawPos.startsWith('ACC:')) {
      const parts = rawPos.slice(4).split('#');
      if (parts[1] && parts[1].trim()) return parts[1].trim();
    } else if (typeof rawPos === 'string' && !rawPos.startsWith('{')) {
      return rawPos;
    }
  }
  if ((user as any).job_title) return (user as any).job_title;
  if ((user as any).jobTitle) return (user as any).jobTitle;
  if ((user as any).jabatan) return (user as any).jabatan;

  const nikUpper = (user.nik || '').toUpperCase();
  if (nikUpper === 'LMS20003') return 'Quality Manager';
  if (nikUpper === 'LMS20002') return 'Supervisor Quality Control';
  if (nikUpper === 'LMS20001') return 'Staf Analis Lab QC';
  if (nikUpper === 'LMS10003') return 'R&D Manager';
  if (nikUpper === 'LMS10002') return 'Supervisor Formulasi R&D';
  if (nikUpper === 'LMS10001') return 'Staf Formulator R&D';
  if (nikUpper === 'LMS30003') return 'Warehouse & Supply Chain Manager';
  if (nikUpper === 'LMS30002') return 'Supervisor Gudang & Logistik';
  if (nikUpper === 'LMS30001') return 'Staf Gudang & Logistik';
  if (nikUpper === 'LMS40003') return 'Production Manager';
  if (nikUpper === 'LMS40002') return 'Supervisor Produksi';
  if (nikUpper === 'LMS40001') return 'Operator Produksi';
  if (nikUpper === 'LMS50003') return 'PPIC Manager';
  if (nikUpper === 'LMS50002') return 'Supervisor PPIC';
  if (nikUpper === 'LMS50001') return 'Staf PPIC';

  const dept = user.department;
  const role = user.role;

  if (role === 'admin') return 'Administrator Sistem';

  if (dept === 'quality') {
    if (role === 'manager') return 'Quality Manager';
    if (role === 'supervisor') return 'Supervisor Quality Control';
    return 'Staf Analis Lab QC';
  }

  if (dept === 'rnd') {
    if (role === 'manager') return 'R&D Manager';
    if (role === 'supervisor') return 'Supervisor Formulasi R&D';
    return 'Staf Formulator R&D';
  }

  if (dept === 'warehouse') {
    if (role === 'manager') return 'Warehouse & Supply Chain Manager';
    if (role === 'supervisor') return 'Supervisor Gudang & Logistik';
    return 'Staf Gudang & Logistik';
  }

  if (dept === 'production') {
    if (role === 'manager') return 'Production Manager';
    if (role === 'supervisor') return 'Supervisor Produksi';
    return 'Operator Produksi';
  }

  if (dept === 'ppic') {
    if (role === 'manager') return 'PPIC Manager';
    if (role === 'supervisor') return 'Supervisor PPIC';
    return 'Staf PPIC';
  }

  if (role === 'manager') return 'Manager';
  if (role === 'supervisor') return 'Supervisor';
  return defaultTitle || 'Staf Analis Lab QC';
}
