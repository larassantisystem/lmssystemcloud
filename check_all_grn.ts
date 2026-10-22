import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve('data', 'cloudflare_d1.sqlite');
const db = new DatabaseSync(dbPath);

const rows = db.prepare("SELECT grn_number, qc_status FROM warehouse_grn").all();
console.log('Records:', rows);
