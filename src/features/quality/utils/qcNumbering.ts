import { GrnMaterialType } from '../../warehouse/types/grnTypes';
import { QcInspectionReport } from '../types/qcTypes';

/**
 * Generate Internal Lot / Inspection Report Number
 * Format: L + {BB/BK} + {YY} + {MM} + {XXX}
 * Example: LBB2609001, LBK2609001
 * Resets sequence to 001 every new month.
 */
export const generateLotInternalNumber = (
  materialType: GrnMaterialType,
  existingReports: Array<{ lotInternalNumber?: string; internalLotNumber?: string; reportNumber?: string; grnNumber?: string; id?: string }>,
  customDate?: string,
  currentGrnNumber?: string
): string => {
  const targetDate = customDate ? new Date(customDate) : new Date();
  const yearFull = targetDate.getFullYear().toString();
  const yy = yearFull.slice(2);
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  
  const typeCode = materialType === 'raw' ? 'BB' : 'BK';
  const prefix = `L${typeCode}${yy}${mm}`;

  // Collect all existing lot numbers used by other GRNs
  const usedLots = new Set<string>();
  let maxSeq = 0;

  existingReports.forEach((item) => {
    // Skip if it's the same GRN updating itself
    if (currentGrnNumber && (item.grnNumber === currentGrnNumber || item.id === currentGrnNumber)) {
      return;
    }
    const lotNo = item.lotInternalNumber || item.internalLotNumber || item.reportNumber;
    if (lotNo) {
      const normalized = normalizeLotNumber(lotNo);
      usedLots.add(normalized);
      if (normalized.startsWith(prefix)) {
        const seqStr = normalized.slice(prefix.length);
        const seqNum = parseInt(seqStr, 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    }
  });

  let nextSeqNum = maxSeq + 1;
  let candidate = `${prefix}${String(nextSeqNum).padStart(3, '0')}`;

  // Strict collision check: if candidate is already used by another record, keep incrementing
  while (usedLots.has(candidate)) {
    nextSeqNum++;
    candidate = `${prefix}${String(nextSeqNum).padStart(3, '0')}`;
  }

  return candidate;
};

/**
 * Generate SHA-256 like simulation digital signature hash
 */
export const generateDigitalSignatureHash = (
  nik: string,
  name: string,
  action: string,
  docNumber: string
): string => {
  const payload = `${nik}-${name}-${action}-${docNumber}-${Date.now()}-${Math.random()}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const randHex = Math.random().toString(16).substring(2, 10);
  return `SIG-${hex.toUpperCase()}-${randHex.toUpperCase()}`;
};

/**
 * Normalizes any legacy or incorrectly formatted internal lot number to standard CPKB format.
 * Format: L + {BB/BK} + {YY} + {MM} + {XXX} (10 characters, e.g. LBB2609001, LBK2609001)
 * Where:
 * - Prefix: LBB (Bahan Baku) or LBK (Bahan Kemas)
 * - YY: 2-digit Year (e.g. 26 for 2026)
 * - MM: 2-digit Month (01-12, e.g. 09 for September)
 * - XXX: 3-digit Sequence (001-999)
 */
export const normalizeLotNumber = (lot?: string | null, customDate?: string): string => {
  if (!lot) return '';
  const clean = lot.trim();
  if (!clean) return '';

  // Extract prefix: LBB or LBK (default to LBB if only BB or unrecognized)
  const prefixMatch = clean.match(/^(?:L)?(BB|BK)/i);
  const type = prefixMatch ? prefixMatch[1].toUpperCase() : 'BB';
  const prefix = `L${type}`;

  // Current default year and month (e.g. '26' for 2026, '09' for September)
  const baseDate = customDate ? new Date(customDate) : new Date();
  const currentYY = (baseDate.getFullYear() % 100).toString().padStart(2, '0');
  const currentMM = String(baseDate.getMonth() + 1).padStart(2, '0');

  // Extract all digits after removing prefix characters
  const cleanWithoutPrefix = clean.replace(/^(LBB|LBK|BB|BK)[-_/\s]*/i, '');
  const digits = cleanWithoutPrefix.replace(/\D/g, '');

  if (!digits) {
    return `${prefix}${currentYY}${currentMM}001`;
  }

  // Case 1: 7 digits total
  if (digits.length === 7) {
    const candidateYY = digits.slice(0, 2);
    const candidateMM = parseInt(digits.slice(2, 4), 10);
    const seq = digits.slice(4);

    const numYY = parseInt(candidateYY, 10);
    // If candidateYY is a valid modern year (24-50) and candidateMM is 1-12, format is already YYMMXXX
    if (numYY >= 24 && numYY <= 50 && candidateMM >= 1 && candidateMM <= 12) {
      return `${prefix}${candidateYY}${digits.slice(2, 4)}${seq}`;
    }

    // If candidateYY was actually the month (01-12, e.g. '09' in 0907002 or 0915001)
    if (numYY >= 1 && numYY <= 12) {
      const mm = candidateYY.padStart(2, '0');
      const correctedSeq = seq.padStart(3, '0').slice(-3);
      return `${prefix}${currentYY}${mm}${correctedSeq}`;
    }
  }

  // Case 2: 6 digits total (e.g. MMDDXX like 090701, 090702 or YYMMXX like 260901)
  if (digits.length === 6) {
    const p1 = digits.slice(0, 2);
    const p2 = digits.slice(2, 4);
    const p3 = digits.slice(4, 6);

    const numP1 = parseInt(p1, 10);
    const numP2 = parseInt(p2, 10);

    // If p1 is modern year (24-50) and p2 is month (1-12)
    if (numP1 >= 24 && numP1 <= 50 && numP2 >= 1 && numP2 <= 12) {
      return `${prefix}${p1}${p2}${p3.padStart(3, '0')}`;
    }

    // If p1 is month (1-12) and p2 is day (1-31), year is missing
    if (numP1 >= 1 && numP1 <= 12 && numP2 >= 1 && numP2 <= 31) {
      const mm = p1.padStart(2, '0');
      const seq = p3.padStart(3, '0');
      return `${prefix}${currentYY}${mm}${seq}`;
    }

    return `${prefix}${currentYY}${currentMM}${p3.padStart(3, '0')}`;
  }

  // Case 3: 8 digits total (e.g. YYMMDDXX like 26090701)
  if (digits.length === 8) {
    const yy = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const seq = digits.slice(6).padStart(3, '0');
    return `${prefix}${yy}${mm}${seq}`;
  }

  // Case 4: Short digits (e.g. "1", "02")
  if (digits.length <= 3) {
    return `${prefix}${currentYY}${currentMM}${digits.padStart(3, '0')}`;
  }

  // Case 5: Fallback for any other digit length
  const last3 = digits.slice(-3).padStart(3, '0');
  return `${prefix}${currentYY}${currentMM}${last3}`;
};

/**
 * Calculates standard CPKB Retest Date for Raw Materials (Bahan Baku).
 * Rule: Automatically calculated exactly 3 months before expiration date (Expired Date).
 * For Packaging materials, returns empty string (retest is not applicable).
 */
export const calculateAutoRetestDate = (
  materialType?: GrnMaterialType | 'raw' | 'packaging' | string | null,
  expiryDate?: string | null,
  receivedDate?: string | null
): string => {
  if (materialType === 'packaging') {
    return '';
  }

  if (expiryDate) {
    const parts = expiryDate.trim().split('-');
    if (parts.length === 3) {
      let year = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10) - 1; // 0-indexed
      let day = parseInt(parts[2], 10);

      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        // Subtract 3 months
        month -= 3;
        while (month < 0) {
          month += 12;
          year -= 1;
        }
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const clampedDay = Math.min(day, daysInMonth);

        const yStr = year.toString().padStart(4, '0');
        const mStr = (month + 1).toString().padStart(2, '0');
        const dStr = clampedDay.toString().padStart(2, '0');
        return `${yStr}-${mStr}-${dStr}`;
      }
    }
  }

  // Fallback: 1 year from received date or current date if no expiry date provided
  const base = receivedDate ? new Date(receivedDate) : new Date();
  if (!isNaN(base.getTime())) {
    const fallback = new Date(base);
    fallback.setFullYear(fallback.getFullYear() + 1);
    return fallback.toISOString().split('T')[0];
  }

  return '';
};

/**
 * Mendapatkan jabatan/posisi formal user berdasarkan role dan departemennya
 */
export const getUserJabatan = (
  user?: { role?: string; department?: string; name?: string; [key: string]: any } | null
): string => {
  if (!user) return 'Staf Analis QC';
  if (user.jabatan) return user.jabatan;
  if (user.position) return user.position;
  if (user.jobTitle) return user.jobTitle;

  const role = (user.role || '').toLowerCase();
  const dept = (user.department || '').toLowerCase();

  if (role === 'staff') {
    return dept === 'quality' || !dept ? 'Staf Analis QC' : `Staf ${user.department?.toUpperCase() || ''}`;
  }
  if (role === 'supervisor' || role === 'spv') {
    return dept === 'quality' || !dept ? 'Supervisor QC' : `Supervisor ${user.department?.toUpperCase() || ''}`;
  }
  if (role === 'manager') {
    return dept === 'quality' || !dept ? 'Quality Manager' : `Manager ${user.department?.toUpperCase() || ''}`;
  }
  if (role === 'admin') {
    return 'Admin QC';
  }
  if (role === 'operator') {
    return 'Operator QC';
  }
  return role ? role.toUpperCase() : 'Staf Analis QC';
};

