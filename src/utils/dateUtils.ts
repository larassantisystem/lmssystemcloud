/**
 * Date utility for CPKB standard formatting (DD MMM YYYY)
 * Example output: "17 Sep 2026", "01 Okt 2026"
 */

const MONTHS_ID_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

const MONTHS_ID_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Formats any date string or Date object to "DD MMM YYYY" (e.g., "17 Sep 2026")
 */
export function formatDateDDMMMYYYY(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';

  try {
    let dateObj: Date;

    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      if (!trimmed || trimmed === '-') return '-';

      // Check ISO format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const parts = trimmed.split('T')[0].split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 0 && month < 12) {
          const dd = String(day).padStart(2, '0');
          const mmm = MONTHS_ID_SHORT[month];
          return `${dd} ${mmm} ${year}`;
        }
      }

      // Check DD/MM/YYYY or DD-MM-YYYY
      if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(trimmed)) {
        const sep = trimmed.includes('/') ? '/' : '-';
        const parts = trimmed.split(sep);
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 0 && month < 12) {
          const dd = String(day).padStart(2, '0');
          const mmm = MONTHS_ID_SHORT[month];
          return `${dd} ${mmm} ${year}`;
        }
      }

      dateObj = new Date(trimmed);
    } else {
      dateObj = dateInput;
    }

    if (isNaN(dateObj.getTime())) {
      return String(dateInput);
    }

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = MONTHS_ID_SHORT[dateObj.getMonth()];
    const year = dateObj.getFullYear();

    return `${day} ${month} ${year}`;
  } catch {
    return String(dateInput || '-');
  }
}

/**
 * Formats any date string or Date object to "DD MMM YYYY" uppercase (e.g., "17 SEP 2026")
 */
export function formatDateDDMMMYYYYUpper(dateInput?: string | Date | null): string {
  const formatted = formatDateDDMMMYYYY(dateInput);
  return formatted ? formatted.toUpperCase() : '-';
}

/**
 * Formats date to "DD MMMM YYYY" full month (e.g., "17 September 2026")
 */
export function formatDateFull(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_ID_LONG[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return String(dateInput || '-');
  }
}
