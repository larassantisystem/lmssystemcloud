export function isUUID(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Converts any legacy ID (e.g. "rm-101", "pm-102") to a valid PostgreSQL UUID
 */
export function ensureUUID(id: string): string {
  if (!id || typeof id !== 'string') return generateUUID();
  if (isUUID(id)) return id;

  let hexStr = '';
  for (let i = 0; i < id.length; i++) {
    hexStr += id.charCodeAt(i).toString(16);
  }
  hexStr = hexStr.padEnd(32, '0').substring(0, 32);

  const part1 = hexStr.substring(0, 8);
  const part2 = hexStr.substring(8, 12);
  const part3 = '4' + hexStr.substring(13, 16);
  const part4 = 'a' + hexStr.substring(17, 20);
  const part5 = hexStr.substring(20, 32);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}
