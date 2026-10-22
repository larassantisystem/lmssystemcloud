import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve('data', 'cloudflare_d1.sqlite');
const db = new DatabaseSync(dbPath);

const row = db.prepare("SELECT qc_status, notes, revert_reason FROM warehouse_grn WHERE grn_number = 'GRN-BB-261009-03'").get();
console.log('Record:', row);
