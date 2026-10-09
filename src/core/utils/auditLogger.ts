export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorNik: string;
  actorName: string;
  module?: string;
  action: string;
  targetNik: string;
  details: string;
}

let inMemoryAuditLogs: AuditLogEntry[] = [
  {
    id: 'aud-1',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    actorNik: 'admin',
    actorName: 'ADMIN',
    action: 'SYSTEM_SYNC',
    targetNik: 'ALL',
    details: 'Sinkronisasi Karyawan Master ke Supabase Auth & PostgreSQL Profiles.',
  },
];

// Bersihkan data lama jika ada di browser
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    localStorage.removeItem('cosmo_ddmp_audit_logs');
  } catch {
    // ignore
  }
}

export const auditLogger = {
  getLogs: (): AuditLogEntry[] => {
    return [...inMemoryAuditLogs];
  },

  logAction: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): AuditLogEntry => {
    const newEntry: AuditLogEntry = {
      id: entry.id || `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      actorNik: entry.actorNik,
      actorName: entry.actorName,
      module: entry.module,
      action: entry.action,
      targetNik: entry.targetNik,
      details: entry.details,
    };

    inMemoryAuditLogs.unshift(newEntry);
    console.log(`[AuditTrail] ${newEntry.action} by ${newEntry.actorName} (${newEntry.actorNik}): ${newEntry.details}`);
    return newEntry;
  },

  log: (entry: any): AuditLogEntry => {
    const actorNik = entry.actorNik || entry.actor?.nik || entry.actor?.id || 'admin';
    const actorName = entry.actorName || entry.actor?.name || entry.actor?.username || 'User';
    return auditLogger.logAction({
      actorNik,
      actorName,
      module: entry.module || 'RND',
      action: entry.action || 'UPDATE',
      targetNik: entry.targetNik || 'ALL',
      details: entry.details || '',
    });
  },
};
