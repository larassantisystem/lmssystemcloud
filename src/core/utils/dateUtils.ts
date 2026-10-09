/**
 * Safely normalizes any date representation (Excel serial number, Date object, ISO string, DD/MM/YYYY)
 * into a valid PostgreSQL DATE string (YYYY-MM-DD).
 */
export function formatToIsoDateString(val: any, fallback?: string): string {
  if (val === undefined || val === null || val === '') {
    return fallback !== undefined ? fallback : new Date().toISOString().slice(0, 10);
  }

  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return val.toISOString().slice(0, 10);
    }
  }

  // Handle Excel serial numbers (e.g. 46550 or "46550" or "46550.0")
  const num = typeof val === 'number' ? val : Number(val);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    // Excel date epoch offset (Jan 1 1900 with leap year bug)
    const utcDays = Math.floor(num - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().slice(0, 10);
    }
  }

  const str = String(val).trim();
  if (!str) return fallback !== undefined ? fallback : new Date().toISOString().slice(0, 10);

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // If ISO string with time e.g. YYYY-MM-DDTHH:mm:ss
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    return str.slice(0, 10);
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Handle YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try standard JS Date parsing
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return fallback !== undefined ? fallback : new Date().toISOString().slice(0, 10);
}
