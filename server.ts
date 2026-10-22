import express, { Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// 1. Initialize Cloudflare D1 Local SQLite Engine
const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.resolve(dataDir, 'cloudflare_d1.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high concurrency and immediate disk persistence
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('[Cloudflare D1 Engine] PRAGMA warning:', e);
}

// Execute D1 Schema
const schemaPath = path.resolve(__dirname, 'd1-schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  try {
    db.exec(schemaSql);
    console.log('[Cloudflare D1 Engine] Schema executed successfully.');

    // Auto-migration: ensure all columns exist in case tables were previously created with older schema
    const tableColumnsToAdd: Record<string, { col: string; type: string }[]> = {
      raw_materials: [
        { col: 'spec_number', type: 'TEXT' },
        { col: 'chemical_name', type: 'TEXT' },
        { col: 'categories', type: "TEXT DEFAULT '[]'" },
        { col: 'other_category_specification', type: 'TEXT' },
        { col: 'sds_doc_number', type: 'TEXT' },
        { col: 'sds_file_url', type: 'TEXT' },
        { col: 'sds_file_name', type: 'TEXT' },
        { col: 'approved_substitutes', type: "TEXT DEFAULT '[]'" },
        { col: 'manufacturer', type: 'TEXT' },
        { col: 'qc_parameters', type: "TEXT DEFAULT '[]'" },
        { col: 'supplier_lead_time_days', type: 'INTEGER DEFAULT 14' },
        { col: 'reorder_point', type: 'REAL DEFAULT 50.0' },
        { col: 'last_modified_by', type: "TEXT DEFAULT 'Staff RnD'" },
        { col: 'last_modified_at', type: "TEXT DEFAULT (datetime('now'))" },
      ],
      packaging_materials: [
        { col: 'spec_number', type: 'TEXT' },
        { col: 'type', type: "TEXT DEFAULT 'primary'" },
        { col: 'unit', type: "TEXT DEFAULT 'Pcs'" },
        { col: 'unit_capacity_grams', type: 'REAL' },
        { col: 'manufacturer', type: 'TEXT' },
        { col: 'storage_location', type: 'TEXT' },
        { col: 'storage_conditions', type: 'TEXT' },
        { col: 'qc_parameters', type: "TEXT DEFAULT '[]'" },
        { col: 'reorder_point', type: 'REAL DEFAULT 100.0' },
        { col: 'last_modified_by', type: "TEXT DEFAULT 'Staff RnD'" },
        { col: 'last_modified_at', type: "TEXT DEFAULT (datetime('now'))" },
      ],
      products: [
        { col: 'product_code', type: 'TEXT' },
        { col: 'brand', type: "TEXT DEFAULT 'Larassanti'" },
        { col: 'exp_notification_date', type: 'TEXT' },
        { col: 'description', type: 'TEXT' },
        { col: 'storage_conditions', type: 'TEXT' },
        { col: 'bpom_notification_number', type: 'TEXT' },
        { col: 'qc_parameters', type: "TEXT DEFAULT '[]'" },
        { col: 'finished_parameters', type: "TEXT DEFAULT '[]'" },
      ],
      bulk_formulations: [
        { col: 'product_id', type: 'TEXT' },
        { col: 'product_code', type: "TEXT DEFAULT ''" },
        { col: 'product_name', type: "TEXT DEFAULT ''" },
        { col: 'bulk_quantity_kg', type: 'REAL DEFAULT 100' },
        { col: 'purpose_description', type: 'TEXT' },
        { col: 'ingredients', type: "TEXT DEFAULT '[]'" },
        { col: 'mixing_instructions', type: 'TEXT' },
        { col: 'created_by', type: 'TEXT' },
      ],
      deviations: [
        { col: 'target_departments', type: "TEXT DEFAULT '[]'" },
        { col: 'batch_number', type: 'TEXT' },
        { col: 'material_code', type: 'TEXT' },
        { col: 'material_name', type: 'TEXT' },
        { col: 'initiator_name', type: 'TEXT' },
        { col: 'initiator_nik', type: 'TEXT' },
        { col: 'impacts', type: 'TEXT' },
        { col: 'capa_actions', type: 'TEXT' },
        { col: 'closed_at', type: 'TEXT' },
        { col: 'closed_by', type: 'TEXT' },
      ],
      stock_movements: [
        { col: 'timestamp', type: "TEXT DEFAULT (datetime('now'))" },
        { col: 'lot_internal_number', type: 'TEXT' },
        { col: 'qty_before', type: 'REAL DEFAULT 0' },
        { col: 'qty_change', type: 'REAL DEFAULT 0' },
        { col: 'qty_after', type: 'REAL DEFAULT 0' },
        { col: 'performer_name', type: 'TEXT' },
        { col: 'performer_role', type: 'TEXT' },
        { col: 'performer_department', type: 'TEXT' },
      ],
      profiles: [
        { col: 'position', type: 'TEXT' },
        { col: 'email', type: 'TEXT' },
        { col: 'password', type: 'TEXT' },
      ],
    };

    for (const [table, cols] of Object.entries(tableColumnsToAdd)) {
      try {
        const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
        const existingNames = new Set(info.map((c) => c.name));
        for (const { col, type } of cols) {
          if (!existingNames.has(col)) {
            try {
              db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type};`);
              console.log(`[Cloudflare D1 Engine] Added missing column ${col} to ${table}`);
            } catch (alterErr) {
              // Ignore if already added
            }
          }
        }
      } catch (tableErr) {
        // Table might not exist yet
      }
    }

    // Sync product_code and code in products
    try {
      db.exec("UPDATE products SET product_code = code WHERE (product_code IS NULL OR product_code = '') AND code IS NOT NULL;");
      db.exec("UPDATE products SET code = product_code WHERE (code IS NULL OR code = '') AND product_code IS NOT NULL;");
    } catch (e) {}

    // Clean up any empty grn_number in warehouse_grn
    try {
      db.exec("UPDATE warehouse_grn SET grn_number = 'GRN-' || upper(substr(hex(randomblob(4)), 1, 8)) WHERE (grn_number IS NULL OR grn_number = '');");
    } catch (e) {}

    // Seed initial warehouse GRN records including requested GRNs if empty
    try {
      const checkGrn = db.prepare('SELECT COUNT(*) as count FROM warehouse_grn').get() as any;
      if (!checkGrn || checkGrn.count === 0) {
        console.log('[Cloudflare D1 Engine] Seeding initial warehouse GRN records...');
        const seedGrns = [
          {
            id: 'grn-261009-05',
            grn_number: 'GRN-BB-261009-05',
            material_type: 'raw',
            material_code: 'RM-GLY-01',
            material_name: 'Glycerin / Gliserin (Vegetable Grade)',
            manufacturer: 'Dow Chemical / PT. Kimia Farma',
            distributor: 'PT. Multi Kimia Raya',
            delivery_note_number: 'SJ-MKR-2026-905',
            purchase_order_number: 'PO-2026-1009-01',
            po_number: 'PO-2026-1009-01',
            supplier_batch_number: 'GLY20261001',
            batch_number: 'GLY20261001',
            internal_lot_number: 'LBB2610001',
            received_date: '2026-10-09',
            expiration_date: '2028-10-09',
            quantity_received: 250.0,
            current_quantity: 250.0,
            unit: 'kg',
            container_count: 5,
            container_type: 'Drum',
            storage_location: 'Gudang Karantina',
            qc_status: 'QUARANTINE',
            received_by: 'Heni (Staf Gudang)',
            notes: 'Penerimaan bahan baku baru gel, segel drum utuh.'
          },
          {
            id: 'grn-261009-02',
            grn_number: 'GRN-BB-261009-02',
            material_type: 'raw',
            material_code: 'RM-NIA-02',
            material_name: 'Niacinamide (Vitamin B3 USP)',
            manufacturer: 'DSM Nutritional Products',
            distributor: 'PT. Indrasari Sumber Cemerlang',
            delivery_note_number: 'SJ-ISC-2026-022',
            purchase_order_number: 'PO-2026-1009-02',
            po_number: 'PO-2026-1009-02',
            supplier_batch_number: 'NIA202699',
            batch_number: 'NIA202699',
            internal_lot_number: 'LBB2610002',
            received_date: '2026-10-09',
            expiration_date: '2028-09-15',
            quantity_received: 100.0,
            current_quantity: 100.0,
            unit: 'kg',
            container_count: 2,
            container_type: 'Fiber Drum',
            storage_location: 'Gudang Karantina',
            qc_status: 'QUARANTINE',
            received_by: 'Heni (Staf Gudang)',
            notes: 'CoA lengkap, menunggu uji sampling QC Lab.'
          },
          {
            id: 'grn-261006-05',
            grn_number: 'GRN-BB-261006-05',
            material_type: 'raw',
            material_code: 'RM-HYA-03',
            material_name: 'Sodium Hyaluronate (High Molecular Weight)',
            manufacturer: 'Bloomage Biotech',
            distributor: 'PT. Era Cosmindo',
            delivery_note_number: 'SJ-EC-2026-605',
            purchase_order_number: 'PO-2026-1006-03',
            po_number: 'PO-2026-1006-03',
            supplier_batch_number: 'SH20261006',
            batch_number: 'SH20261006',
            internal_lot_number: 'LBB2610003',
            received_date: '2026-10-06',
            expiration_date: '2029-01-01',
            quantity_received: 50.0,
            current_quantity: 50.0,
            unit: 'kg',
            container_count: 1,
            container_type: 'Jerigen Plastik',
            storage_location: 'Gudang Karantina',
            qc_status: 'REVERTED_TO_WAREHOUSE',
            revert_reason: 'Dokumen CoA dari supplier tidak mencantumkan parameter loss on drying (LOD). Dikembalikan ke gudang untuk konfirmasi.',
            reverted_by: 'Ayu (Staf QC)',
            reverted_at: '2026-10-07 10:30:00',
            received_by: 'Heni (Staf Gudang)',
            notes: 'REVERTED_TO_WAREHOUSE: CoA kurang lengkap parameter LOD.'
          }
        ];

        const insertGrnStmt = db.prepare(`
          INSERT INTO warehouse_grn (
            id, grn_number, material_type, material_code, material_name,
            manufacturer, distributor, delivery_note_number, purchase_order_number, po_number,
            supplier_batch_number, batch_number, internal_lot_number, received_date,
            expiration_date, quantity_received, current_quantity, unit, container_count,
            container_type, storage_location, qc_status, received_by, notes,
            revert_reason, reverted_by, reverted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const g of seedGrns) {
          try {
            insertGrnStmt.run(
              g.id, g.grn_number, g.material_type, g.material_code, g.material_name,
              g.manufacturer, g.distributor, g.delivery_note_number, g.purchase_order_number, g.po_number,
              g.supplier_batch_number, g.batch_number, g.internal_lot_number, g.received_date,
              g.expiration_date, g.quantity_received, g.current_quantity, g.unit, g.container_count,
              g.container_type, g.storage_location, g.qc_status, g.received_by, g.notes,
              g.revert_reason || null, g.reverted_by || null, g.reverted_at || null
            );
          } catch (e) {
            console.warn('[Cloudflare D1 Engine] Failed to seed GRN:', g.grn_number, e);
          }
        }
        console.log(`[Cloudflare D1 Engine] Successfully seeded ${seedGrns.length} warehouse GRN records into D1.`);
      }
    } catch (e) {
      console.warn('[Cloudflare D1 Engine] GRN seeding error:', e);
    }

    // Seed initial users into Cloudflare D1 if empty
    const checkProfiles = db.prepare('SELECT COUNT(*) as count FROM profiles').get() as any;
    if (!checkProfiles || checkProfiles.count === 0) {
      console.log('[Cloudflare D1 Engine] Seeding initial profiles into Cloudflare D1 database...');
      const seedUsers = [
        { id: 'usr-admin', nik: 'admin', name: 'ADMIN', role: 'admin', department: 'admin', email: 'lms00000@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms10001', nik: 'LMS10001', name: 'Daffa', role: 'staff', department: 'rnd', email: 'lms10001@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms10002', nik: 'LMS10002', name: 'Tanzil', role: 'supervisor', department: 'rnd', email: 'lms10002@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms10003', nik: 'LMS10003', name: 'Lanny', role: 'manager', department: 'rnd', email: 'lms10003@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms20001', nik: 'LMS20001', name: 'Ayu', role: 'staff', department: 'quality', email: 'lms20001@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms20002', nik: 'LMS20002', name: 'Lala', role: 'supervisor', department: 'quality', email: 'lms20002@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms20003', nik: 'LMS20003', name: 'Michael', role: 'manager', department: 'quality', email: 'lms20003@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms30001', nik: 'LMS30001', name: 'Heni', role: 'staff', department: 'warehouse', email: 'lms30001@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms30002', nik: 'LMS30002', name: 'Maulana', role: 'supervisor', department: 'warehouse', email: 'lms30002@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms30003', nik: 'LMS30003', name: 'Haryani', role: 'manager', department: 'warehouse', email: 'lms30003@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms40001', nik: 'LMS40001', name: 'Lisa', role: 'staff', department: 'production', email: 'lms40001@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms40002', nik: 'LMS40002', name: 'Ilham', role: 'supervisor', department: 'production', email: 'lms40002@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms40003', nik: 'LMS40003', name: 'Ika Suci', role: 'manager', department: 'production', email: 'lms40003@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms50001', nik: 'LMS50001', name: 'Heri', role: 'staff', department: 'ppic', email: 'lms50001@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms50002', nik: 'LMS50002', name: 'Shinta', role: 'supervisor', department: 'ppic', email: 'lms50002@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms50003', nik: 'LMS50003', name: 'Adha Winatie', role: 'manager', department: 'ppic', email: 'lms50003@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms90001', nik: 'LMS90001', name: 'Hermansyah Rusli', role: 'manager', department: 'management', email: 'lms90001@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms90002', nik: 'LMS90002', name: 'Herlina', role: 'manager', department: 'management', email: 'lms90002@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms90003', nik: 'LMS90003', name: 'Dewi Sartika M', role: 'manager', department: 'management', email: 'lms90003@larassanti.co.id', pass: 'laras123' },
        { id: 'usr-lms90004', nik: 'LMS90004', name: 'Tita', role: 'supervisor', department: 'management', email: 'lms90004@larassanti.co.id', pass: 'laras123' },
      ];

      const insertStmt = db.prepare(`
        INSERT INTO profiles (id, nik, name, role, department, email, password, password_hash, permissions_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(nik) DO UPDATE SET
          name=excluded.name,
          role=excluded.role,
          department=excluded.department,
          email=excluded.email,
          password=excluded.password,
          password_hash=excluded.password_hash
      `);

      for (const u of seedUsers) {
        insertStmt.run(u.id, u.nik, u.name, u.role, u.department, u.email, u.pass, u.pass, JSON.stringify([]));
      }
      console.log(`[Cloudflare D1 Engine] Successfully seeded ${seedUsers.length} profiles into D1.`);
    }
  } catch (err) {
    console.error('[Cloudflare D1 Engine] Schema execution failed:', err);
  }
}

// -------------------------------------------------------------
// Dynamic Cloudflare D1 Remote & Local Engine Configuration
// -------------------------------------------------------------
const CONFIG_PATH = path.resolve(dataDir, 'cloudflare_config.json');

interface CloudflareConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

function loadCloudflareConfig(): CloudflareConfig {
  const config: CloudflareConfig = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    databaseId: process.env.CLOUDFLARE_DATABASE_ID || '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (data.accountId) config.accountId = String(data.accountId).trim();
      if (data.databaseId) config.databaseId = String(data.databaseId).trim();
      if (data.apiToken) config.apiToken = String(data.apiToken).trim();
    }
  } catch (err) {
    console.warn('[Cloudflare D1] Error reading saved config:', err);
  }

  return config;
}

let activeCfConfig = loadCloudflareConfig();

// Table columns definitions to guarantee schema parity across both local SQLite and Cloudflare D1
const tableDefinitions: Record<string, { col: string; type: string }[]> = {
  raw_materials: [
    { col: 'spec_number', type: 'TEXT' },
    { col: 'chemical_name', type: 'TEXT' },
    { col: 'categories', type: "TEXT DEFAULT '[]'" },
    { col: 'other_category_specification', type: 'TEXT' },
    { col: 'sds_doc_number', type: 'TEXT' },
    { col: 'sds_file_url', type: 'TEXT' },
    { col: 'sds_file_name', type: 'TEXT' },
    { col: 'approved_substitutes', type: "TEXT DEFAULT '[]'" },
    { col: 'manufacturer', type: 'TEXT' },
    { col: 'qc_parameters', type: "TEXT DEFAULT '[]'" },
    { col: 'supplier_lead_time_days', type: 'INTEGER DEFAULT 14' },
    { col: 'reorder_point', type: 'REAL DEFAULT 50.0' },
    { col: 'last_modified_by', type: "TEXT DEFAULT 'Staff RnD'" },
    { col: 'last_modified_at', type: "TEXT DEFAULT (datetime('now'))" },
    { col: 'inci_name', type: 'TEXT' },
    { col: 'cas_number', type: 'TEXT' },
    { col: 'function', type: 'TEXT' },
    { col: 'standard_specs_json', type: 'TEXT' },
    { col: 'qc_parameters_json', type: 'TEXT' },
  ],
  packaging_materials: [
    { col: 'spec_number', type: 'TEXT' },
    { col: 'type', type: "TEXT DEFAULT 'primary'" },
    { col: 'unit', type: "TEXT DEFAULT 'Pcs'" },
    { col: 'unit_capacity_grams', type: 'REAL' },
    { col: 'supplier', type: 'TEXT' },
    { col: 'manufacturer', type: 'TEXT' },
    { col: 'storage_location', type: 'TEXT' },
    { col: 'storage_conditions', type: 'TEXT' },
    { col: 'qc_parameters', type: "TEXT DEFAULT '[]'" },
    { col: 'reorder_point', type: 'REAL DEFAULT 100.0' },
    { col: 'last_modified_by', type: "TEXT DEFAULT 'Staff RnD'" },
    { col: 'last_modified_at', type: "TEXT DEFAULT (datetime('now'))" },
    { col: 'category', type: "TEXT DEFAULT 'Primer'" },
    { col: 'container_type', type: 'TEXT' },
    { col: 'dimensions', type: 'TEXT' },
    { col: 'standard_specs_json', type: 'TEXT' },
    { col: 'qc_parameters_json', type: 'TEXT' },
  ],
  products: [
    { col: 'product_code', type: 'TEXT' },
    { col: 'code', type: 'TEXT' },
    { col: 'brand', type: "TEXT DEFAULT 'Larassanti'" },
    { col: 'exp_notification_date', type: 'TEXT' },
    { col: 'category', type: 'TEXT' },
    { col: 'description', type: 'TEXT' },
    { col: 'unit', type: "TEXT DEFAULT 'pcs (Pieces)'" },
    { col: 'storage_conditions', type: 'TEXT' },
    { col: 'bpom_notification_number', type: 'TEXT' },
    { col: 'bpom_na', type: 'TEXT' },
    { col: 'qc_parameters', type: "TEXT DEFAULT '[]'" },
    { col: 'finished_parameters', type: "TEXT DEFAULT '[]'" },
    { col: 'volume', type: 'REAL' },
    { col: 'variants_json', type: "TEXT DEFAULT '[]'" },
  ],
  product_variants: [
    { col: 'status', type: "TEXT DEFAULT 'active'" },
    { col: 'net_volume_grams', type: 'REAL DEFAULT 0' },
    { col: 'bulk_formula_code', type: 'TEXT' },
    { col: 'packaging_bom', type: "TEXT DEFAULT '[]'" },
    { col: 'bpom_number', type: 'TEXT' },
    { col: 'barcode', type: 'TEXT' },
    { col: 'description', type: 'TEXT' },
  ],
  bulk_formulations: [
    { col: 'product_id', type: 'TEXT' },
    { col: 'product_code', type: "TEXT DEFAULT ''" },
    { col: 'product_name', type: "TEXT DEFAULT ''" },
    { col: 'version', type: "TEXT DEFAULT 'v1.0'" },
    { col: 'status', type: "TEXT DEFAULT 'ACTIVE'" },
    { col: 'bulk_quantity_kg', type: 'REAL DEFAULT 100' },
    { col: 'purpose_description', type: 'TEXT' },
    { col: 'ingredients', type: "TEXT DEFAULT '[]'" },
    { col: 'ingredients_json', type: "TEXT DEFAULT '[]'" },
    { col: 'mixing_instructions', type: 'TEXT' },
    { col: 'dynamic_process_steps', type: 'TEXT' },
    { col: 'technical_notes', type: 'TEXT' },
    { col: 'manufacturing_procedure', type: 'TEXT' },
    { col: 'created_by', type: 'TEXT' },
  ],
  warehouse_grn: [
    { col: 'material_type', type: "TEXT DEFAULT 'raw'" },
    { col: 'material_id', type: 'TEXT' },
    { col: 'manufacturer', type: "TEXT DEFAULT '-'" },
    { col: 'distributor', type: "TEXT DEFAULT '-'" },
    { col: 'delivery_note_number', type: "TEXT DEFAULT '-'" },
    { col: 'purchase_order_number', type: "TEXT DEFAULT '-'" },
    { col: 'po_number', type: "TEXT DEFAULT '-'" },
    { col: 'supplier_batch_number', type: "TEXT DEFAULT '-'" },
    { col: 'batch_number', type: "TEXT DEFAULT '-'" },
    { col: 'internal_lot_number', type: 'TEXT' },
    { col: 'expiration_date', type: 'TEXT' },
    { col: 'expiry_date', type: 'TEXT' },
    { col: 'retest_date', type: 'TEXT' },
    { col: 'quantity_received', type: 'REAL DEFAULT 0' },
    { col: 'current_quantity', type: 'REAL DEFAULT 0' },
    { col: 'unit', type: "TEXT DEFAULT 'kg'" },
    { col: 'container_count', type: 'INTEGER DEFAULT 1' },
    { col: 'container_type', type: "TEXT DEFAULT 'Drum / Zak'" },
    { col: 'storage_location', type: "TEXT DEFAULT 'Gudang Karantina'" },
    { col: 'storage_conditions', type: 'TEXT' },
    { col: 'qc_status', type: "TEXT DEFAULT 'QUARANTINE'" },
    { col: 'qc_parameters_count', type: 'INTEGER DEFAULT 0' },
    { col: 'seal_condition', type: 'TEXT' },
    { col: 'packaging_condition', type: 'TEXT' },
    { col: 'coa_attachment', type: 'TEXT' },
    { col: 'msds_attachment', type: 'TEXT' },
    { col: 'halal_attachment', type: 'TEXT' },
    { col: 'received_by', type: "TEXT DEFAULT 'Staf Gudang'" },
    { col: 'received_by_nik', type: 'TEXT' },
    { col: 'notes', type: 'TEXT' },
    { col: 'revert_reason', type: 'TEXT' },
    { col: 'reverted_by', type: 'TEXT' },
    { col: 'reverted_at', type: 'TEXT' },
    { col: 'actual_sample_size', type: 'REAL' },
    { col: 'actual_sample_unit', type: 'TEXT' },
    { col: 'sampled_containers', type: 'TEXT' },
    { col: 'sampled_by', type: 'TEXT' },
    { col: 'sampling_date_time', type: 'TEXT' },
  ],
  qc_inspection_reports: [
    { col: 'grn_id', type: 'TEXT' },
    { col: 'report_number', type: 'TEXT' },
    { col: 'batch_number', type: 'TEXT' },
    { col: 'quantity_received', type: 'REAL DEFAULT 0' },
    { col: 'unit', type: "TEXT DEFAULT 'kg'" },
    { col: 'container_count', type: 'INTEGER DEFAULT 1' },
    { col: 'container_type', type: "TEXT DEFAULT 'Drum / Zak'" },
    { col: 'manufacturer', type: 'TEXT' },
    { col: 'distributor', type: 'TEXT' },
    { col: 'received_date', type: 'TEXT' },
    { col: 'expiry_date', type: 'TEXT' },
    { col: 'retest_date', type: 'TEXT' },
    { col: 'storage_conditions', type: 'TEXT' },
    { col: 'decision', type: 'TEXT' },
    { col: 'parameters_json', type: "TEXT DEFAULT '[]'" },
    { col: 'sampling_plan_json', type: "TEXT DEFAULT '{}'" },
    { col: 'sampled_containers', type: 'TEXT' },
    { col: 'sampled_by', type: 'TEXT' },
    { col: 'sampling_date_time', type: 'TEXT' },
    { col: 'actual_sample_size', type: 'REAL' },
    { col: 'actual_sample_unit', type: 'TEXT' },
    { col: 'staff_decision', type: 'TEXT' },
    { col: 'staff_notes', type: 'TEXT' },
    { col: 'staff_signature_json', type: "TEXT DEFAULT '{}'" },
    { col: 'qm_decision', type: 'TEXT' },
    { col: 'qm_notes', type: 'TEXT' },
    { col: 'qm_deviation_number', type: 'TEXT' },
    { col: 'qm_signature_json', type: "TEXT DEFAULT '{}'" },
    { col: 'ai_assessment', type: 'TEXT' },
    { col: 'revert_reason', type: 'TEXT' },
    { col: 'reverted_by', type: 'TEXT' },
    { col: 'reverted_at', type: 'TEXT' },
  ],
  deviations: [
    { col: 'target_departments', type: "TEXT DEFAULT '[]'" },
    { col: 'severity', type: "TEXT DEFAULT 'MINOR'" },
    { col: 'category', type: "TEXT DEFAULT 'PRODUCTION'" },
    { col: 'batch_number', type: 'TEXT' },
    { col: 'material_code', type: 'TEXT' },
    { col: 'material_name', type: 'TEXT' },
    { col: 'description', type: 'TEXT' },
    { col: 'initiator_name', type: 'TEXT' },
    { col: 'initiator_nik', type: 'TEXT' },
    { col: 'status', type: "TEXT DEFAULT 'OPEN'" },
    { col: 'impacts', type: 'TEXT' },
    { col: 'root_cause', type: 'TEXT' },
    { col: 'capa_actions', type: 'TEXT' },
    { col: 'immediate_action', type: 'TEXT' },
    { col: 'corrective_action', type: 'TEXT' },
    { col: 'preventive_action', type: 'TEXT' },
    { col: 'reported_by', type: 'TEXT' },
    { col: 'assigned_to', type: 'TEXT' },
    { col: 'approved_by', type: 'TEXT' },
    { col: 'closed_at', type: 'TEXT' },
    { col: 'closed_by', type: 'TEXT' },
  ],
  stock_movements: [
    { col: 'timestamp', type: "TEXT DEFAULT (datetime('now'))" },
    { col: 'material_id', type: 'TEXT' },
    { col: 'material_type', type: "TEXT DEFAULT 'raw'" },
    { col: 'lot_internal_number', type: 'TEXT' },
    { col: 'movement_type', type: 'TEXT' },
    { col: 'reference_number', type: 'TEXT' },
    { col: 'qty_before', type: 'REAL DEFAULT 0' },
    { col: 'qty_change', type: 'REAL DEFAULT 0' },
    { col: 'qty_after', type: 'REAL DEFAULT 0' },
    { col: 'quantity', type: 'REAL DEFAULT 0' },
    { col: 'unit', type: "TEXT DEFAULT 'kg'" },
    { col: 'performer_name', type: 'TEXT' },
    { col: 'performer_role', type: 'TEXT' },
    { col: 'performer_department', type: 'TEXT' },
    { col: 'notes', type: 'TEXT' },
    { col: 'created_by', type: 'TEXT' },
  ],
  profiles: [
    { col: 'position', type: 'TEXT' },
    { col: 'email', type: 'TEXT' },
    { col: 'password', type: 'TEXT' },
    { col: 'password_hash', type: 'TEXT' },
    { col: 'permissions_json', type: "TEXT DEFAULT '[]'" },
  ],
  ipc_bulk_batches: [
    { col: 'batch_no', type: 'TEXT' },
    { col: 'product_code', type: 'TEXT' },
    { col: 'product_name', type: 'TEXT' },
    { col: 'mixing_qty_kg', type: 'REAL DEFAULT 100' },
    { col: 'mixing_date', type: 'TEXT' },
    { col: 'ph', type: 'REAL DEFAULT 6.00' },
    { col: 'viscosity', type: 'REAL DEFAULT 4000' },
    { col: 'appearance', type: 'TEXT' },
    { col: 'gravity', type: 'REAL DEFAULT 1.000' },
    { col: 'status', type: "TEXT DEFAULT 'TESTING'" },
    { col: 'analyst', type: 'TEXT' },
    { col: 'origin', type: 'TEXT' },
    { col: 'notes', type: 'TEXT' },
  ],
  ipc_rework_batches: [
    { col: 'original_batch_no', type: 'TEXT' },
    { col: 'rework_batch_no', type: 'TEXT' },
    { col: 'product_name', type: 'TEXT' },
    { col: 'rework_reason', type: 'TEXT' },
    { col: 'rework_date', type: 'TEXT' },
    { col: 'ph_test', type: 'REAL' },
    { col: 'viscosity_test', type: 'REAL' },
    { col: 'microbiology', type: "TEXT DEFAULT 'PENDING'" },
    { col: 'status', type: "TEXT DEFAULT 'TESTING'" },
    { col: 'authorized_by', type: 'TEXT' },
  ],
};

function isRemoteCloudflareConfigured(): boolean {
  return Boolean(activeCfConfig.accountId && activeCfConfig.databaseId && activeCfConfig.apiToken);
}

// In-Memory Query Cache for Cloudflare D1 to eliminate redundant row reads
interface D1CacheEntry {
  timestamp: number;
  data: { results: any[]; changes?: number; lastInsertRowid?: number };
}
const d1QueryCache = new Map<string, D1CacheEntry>();
const D1_CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit TTL untuk cache pembacaan (SELECT)

function isCacheableSelect(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) && !trimmed.includes('RANDOM()');
}

function getCacheKey(sql: string, params: any[] = []): string {
  return `${sql.trim()}::${JSON.stringify(params)}`;
}

function invalidateD1Cache() {
  d1QueryCache.clear();
}

async function executeD1Query(
  sql: string, 
  params: any[] = [], 
  bypassCache = false
): Promise<{ results: any[]; changes?: number; lastInsertRowid?: number }> {
  const trimmed = sql.trim();
  const isSelect = /^SELECT/i.test(trimmed) || /^PRAGMA/i.test(trimmed);

  // Invalidate read cache immediately when any mutation occurs
  if (!isSelect) {
    invalidateD1Cache();
  } else if (!bypassCache) {
    const key = getCacheKey(sql, params);
    const cached = d1QueryCache.get(key);
    if (cached && (Date.now() - cached.timestamp < D1_CACHE_TTL_MS)) {
      return cached.data;
    }
  }

  let queryResult: { results: any[]; changes?: number; lastInsertRowid?: number };

  if (isRemoteCloudflareConfigured()) {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${activeCfConfig.accountId}/d1/database/${activeCfConfig.databaseId}/query`;
    const res = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeCfConfig.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    const cfData: any = await res.json();
    if (!cfData.success) {
      throw new Error(cfData.errors?.[0]?.message || 'Cloudflare D1 API request failed');
    }
    const resultObj = cfData.result?.[0] || {};
    queryResult = {
      results: resultObj.results || [],
      changes: resultObj.meta?.changes,
      lastInsertRowid: resultObj.meta?.last_row_id,
    };
  } else {
    // Local SQLite D1 Engine
    const stmt = db.prepare(sql);

    if (isSelect) {
      const results = stmt.all(...params);
      queryResult = { results };
    } else {
      const info = stmt.run(...params);
      queryResult = {
        results: [],
        changes: Number(info.changes),
        lastInsertRowid: Number(info.lastInsertRowid),
      };
    }
  }

  // Save SELECT results into cache
  if (isSelect) {
    const key = getCacheKey(sql, params);
    d1QueryCache.set(key, { timestamp: Date.now(), data: queryResult });
  }

  return queryResult;
}

async function autoMigrateDatabase() {
  console.log('[D1 Migration] Verifying schema parity across database...');
  // Ensure table existence
  const createStatements = [
    `CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      variant_name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      net_volume_grams REAL DEFAULT 0,
      bulk_formula_code TEXT,
      packaging_bom TEXT DEFAULT '[]',
      bpom_number TEXT,
      barcode TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS ipc_bulk_batches (
      id TEXT PRIMARY KEY,
      batch_no TEXT NOT NULL UNIQUE,
      product_code TEXT,
      product_name TEXT NOT NULL,
      mixing_qty_kg REAL DEFAULT 100,
      mixing_date TEXT DEFAULT CURRENT_DATE,
      ph REAL DEFAULT 6.00,
      viscosity REAL DEFAULT 4000,
      appearance TEXT DEFAULT 'Homogen, Sesuai Spesifikasi Standard CPKB',
      gravity REAL DEFAULT 1.000,
      status TEXT NOT NULL DEFAULT 'TESTING',
      analyst TEXT DEFAULT 'Staf QC (IPC)',
      origin TEXT DEFAULT 'MANUAL_ENTRY',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS ipc_rework_batches (
      id TEXT PRIMARY KEY,
      original_batch_no TEXT NOT NULL,
      rework_batch_no TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      rework_reason TEXT,
      rework_date TEXT DEFAULT CURRENT_DATE,
      ph_test REAL,
      viscosity_test REAL,
      microbiology TEXT DEFAULT 'PENDING',
      status TEXT NOT NULL DEFAULT 'TESTING',
      authorized_by TEXT DEFAULT 'Diana Putri (QM)',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  ];

  for (const sql of createStatements) {
    try {
      await executeD1Query(sql);
    } catch (e) {
      // Table might already exist
    }
  }

  // Ensure all columns exist in all tables
  for (const [table, cols] of Object.entries(tableDefinitions)) {
    try {
      const infoRes = await executeD1Query(`PRAGMA table_info(${table})`);
      const existingCols = new Set((infoRes.results || []).map((r: any) => r.name));
      for (const { col, type } of cols) {
        if (!existingCols.has(col)) {
          try {
            await executeD1Query(`ALTER TABLE ${table} ADD COLUMN ${col} ${type};`);
            console.log(`[D1 Migration] Added missing column ${col} to ${table}`);
          } catch (alterErr) {
            // Column may already exist
          }
        }
      }
    } catch (e) {
      // Table error
    }
  }

  // Sync products code <-> product_code
  try {
    await executeD1Query("UPDATE products SET product_code = code WHERE (product_code IS NULL OR product_code = '') AND code IS NOT NULL;");
    await executeD1Query("UPDATE products SET code = product_code WHERE (code IS NULL OR code = '') AND product_code IS NOT NULL;");
  } catch (e) {}

  console.log('[D1 Migration] Schema verification completed successfully.');
}

// Kick off schema check
autoMigrateDatabase().catch(err => console.error('[D1 Migration] Error:', err));

// -------------------------------------------------------------
// API ROUTES (Zero localStorage - 100% Real Database Persistence)
// -------------------------------------------------------------

// Cloudflare Connection Management Endpoints
app.get('/api/cloudflare/status', async (req: Request, res: Response) => {
  const isRemote = isRemoteCloudflareConfigured();
  let tableCounts: Record<string, number> = {};
  let pingLatencyMs: number | null = null;
  let connectionValid = false;

  const startTime = Date.now();
  try {
    const pingRes = await executeD1Query("SELECT datetime('now') as now, 1 as ping");
    pingLatencyMs = Date.now() - startTime;
    connectionValid = Boolean(pingRes.results?.[0]?.ping === 1);

    const tablesToAudit = ['profiles', 'warehouse_grn', 'raw_materials', 'packaging_materials', 'products', 'bulk_formulations'];
    for (const tbl of tablesToAudit) {
      try {
        const countRes = await executeD1Query(`SELECT COUNT(*) as count FROM ${tbl}`);
        tableCounts[tbl] = Number(countRes.results?.[0]?.count ?? 0);
      } catch (e) {
        tableCounts[tbl] = -1; // table might not exist yet
      }
    }
  } catch (e) {
    connectionValid = false;
  }

  res.json({
    isRemote,
    configured: isRemote,
    engine: isRemote ? 'Cloudflare D1 Cloud Network' : 'Cloudflare D1 SQLite Engine (Local)',
    accountId: activeCfConfig.accountId ? `${activeCfConfig.accountId.slice(0, 4)}...${activeCfConfig.accountId.slice(-4)}` : '',
    rawAccountId: activeCfConfig.accountId,
    databaseId: activeCfConfig.databaseId,
    hasToken: Boolean(activeCfConfig.apiToken),
    connectionValid,
    pingLatencyMs,
    tableCounts,
  });
});

app.post('/api/cloudflare/test', async (req: Request, res: Response) => {
  const { accountId, databaseId, apiToken } = req.body;
  const targetAcc = accountId || activeCfConfig.accountId;
  const targetDb = databaseId || activeCfConfig.databaseId;
  const targetToken = apiToken || activeCfConfig.apiToken;

  if (!targetAcc || !targetDb || !targetToken) {
    return res.status(400).json({
      success: false,
      error: 'Account ID, Database ID, dan API Token wajib diisi.',
    });
  }

  const startTime = Date.now();
  try {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${targetAcc}/d1/database/${targetDb}/query`;
    const cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${targetToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: "SELECT datetime('now') as server_time, 1 as ping" }),
    });

    const cfData: any = await cfRes.json();
    const latencyMs = Date.now() - startTime;

    if (!cfData.success) {
      const errorMsg = cfData.errors?.[0]?.message || 'Gagal menghubungi Cloudflare D1 API';
      return res.status(400).json({
        success: false,
        error: errorMsg,
        latencyMs,
      });
    }

    res.json({
      success: true,
      message: 'Koneksi ke Cloudflare D1 berhasil!',
      latencyMs,
      serverTime: cfData.result?.[0]?.results?.[0]?.server_time,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Gagal melakukan koneksi HTTP ke Cloudflare',
    });
  }
});

app.post('/api/cloudflare/save', async (req: Request, res: Response) => {
  const { accountId, databaseId, apiToken } = req.body;

  if (!accountId || !databaseId || !apiToken) {
    return res.status(400).json({
      success: false,
      error: 'Account ID, Database ID, dan API Token wajib diisi.',
    });
  }

  // 1. Live test credentials first
  try {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    const cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: "SELECT 1 as ping" }),
    });
    const cfData: any = await cfRes.json();
    if (!cfData.success) {
      return res.status(400).json({
        success: false,
        error: `Kredensial tidak valid: ${cfData.errors?.[0]?.message || 'Cloudflare D1 menolak akses.'}`,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Gagal verifikasi kredensial: ${err.message}`,
    });
  }

  // 2. Persist to disk configuration
  try {
    const configToSave: CloudflareConfig = {
      accountId: accountId.trim(),
      databaseId: databaseId.trim(),
      apiToken: apiToken.trim(),
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configToSave, null, 2), 'utf-8');
    activeCfConfig = configToSave;

    process.env.CLOUDFLARE_ACCOUNT_ID = configToSave.accountId;
    process.env.CLOUDFLARE_DATABASE_ID = configToSave.databaseId;
    process.env.CLOUDFLARE_API_TOKEN = configToSave.apiToken;

    console.log('[Cloudflare D1] Remote credentials successfully updated and active!');
    await autoMigrateDatabase();

    res.json({
      success: true,
      message: 'Kredensial Cloudflare D1 berhasil disimpan dan diaktifkan. Skema berhasil diverifikasi dan dimigrasikan!',
      engine: 'Cloudflare D1 Cloud Network',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Gagal menyimpan konfigurasi: ${err.message}` });
  }
});

app.post('/api/cloudflare/sync-schema', async (req: Request, res: Response) => {
  if (!isRemoteCloudflareConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'Kredensial Cloudflare D1 belum aktif. Simpan kredensial terlebih dahulu.',
    });
  }

  try {
    const schemaFile = path.resolve(__dirname, 'd1-schema.sql');
    if (!fs.existsSync(schemaFile)) {
      return res.status(404).json({ success: false, error: 'File d1-schema.sql tidak ditemukan' });
    }

    const schemaSql = fs.readFileSync(schemaFile, 'utf-8');
    // Split statements safely
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${activeCfConfig.accountId}/d1/database/${activeCfConfig.databaseId}/query`;
    let executedCount = 0;

    for (const stmt of statements) {
      try {
        const resStmt = await fetch(cfUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeCfConfig.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql: stmt }),
        });
        const d: any = await resStmt.json();
        if (d.success) executedCount++;
      } catch (e) {
        // Continue for remaining statements
      }
    }

    // Also seed default profiles if remote profiles is empty
    const seedUsers = [
      { id: 'usr-admin', nik: 'admin', name: 'ADMIN', role: 'admin', department: 'admin', email: 'lms00000@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms10001', nik: 'LMS10001', name: 'Daffa', role: 'staff', department: 'rnd', email: 'lms10001@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms10002', nik: 'LMS10002', name: 'Tanzil', role: 'supervisor', department: 'rnd', email: 'lms10002@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms10003', nik: 'LMS10003', name: 'Lanny', role: 'manager', department: 'rnd', email: 'lms10003@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms20001', nik: 'LMS20001', name: 'Ayu', role: 'staff', department: 'quality', email: 'lms20001@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms20002', nik: 'LMS20002', name: 'Lala', role: 'supervisor', department: 'quality', email: 'lms20002@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms20003', nik: 'LMS20003', name: 'Michael', role: 'manager', department: 'quality', email: 'lms20003@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms30001', nik: 'LMS30001', name: 'Heni', role: 'staff', department: 'warehouse', email: 'lms30001@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms30002', nik: 'LMS30002', name: 'Maulana', role: 'supervisor', department: 'warehouse', email: 'lms30002@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms30003', nik: 'LMS30003', name: 'Haryani', role: 'manager', department: 'warehouse', email: 'lms30003@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms40001', nik: 'LMS40001', name: 'Lisa', role: 'staff', department: 'production', email: 'lms40001@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms40002', nik: 'LMS40002', name: 'Ilham', role: 'supervisor', department: 'production', email: 'lms40002@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms40003', nik: 'LMS40003', name: 'Ika Suci', role: 'manager', department: 'production', email: 'lms40003@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms50001', nik: 'LMS50001', name: 'Heri', role: 'staff', department: 'ppic', email: 'lms50001@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms50002', nik: 'LMS50002', name: 'Shinta', role: 'supervisor', department: 'ppic', email: 'lms50002@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms50003', nik: 'LMS50003', name: 'Adha Winatie', role: 'manager', department: 'ppic', email: 'lms50003@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms90001', nik: 'LMS90001', name: 'Hermansyah Rusli', role: 'manager', department: 'management', email: 'lms90001@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms90002', nik: 'LMS90002', name: 'Herlina', role: 'manager', department: 'management', email: 'lms90002@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms90003', nik: 'LMS90003', name: 'Dewi Sartika M', role: 'manager', department: 'management', email: 'lms90003@larassanti.co.id', pass: 'laras123' },
      { id: 'usr-lms90004', nik: 'LMS90004', name: 'Tita', role: 'supervisor', department: 'management', email: 'lms90004@larassanti.co.id', pass: 'laras123' },
    ];

    for (const u of seedUsers) {
      await fetch(cfUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeCfConfig.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: `INSERT INTO profiles (id, nik, name, role, department, email, password, password_hash, permissions_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(nik) DO UPDATE SET name=excluded.name, role=excluded.role, department=excluded.department, email=excluded.email, password=excluded.password;`,
          params: [u.id, u.nik, u.name, u.role, u.department, u.email, u.pass, u.pass, JSON.stringify([])],
        }),
      });
    }

    // Auto-migrate to guarantee all columns and extra tables exist
    await autoMigrateDatabase();

    res.json({
      success: true,
      statementsRun: executedCount,
      message: `Berhasil sinkronisasi skema ke Cloudflare D1 (${executedCount} perintah SQL dan akun master berhasil disiapkan).`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cloudflare/disconnect', (req: Request, res: Response) => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    activeCfConfig = { accountId: '', databaseId: '', apiToken: '' };
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_DATABASE_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;

    res.json({
      success: true,
      message: 'Koneksi Cloudflare D1 diputuskan. Kembali menggunakan engine lokal SQLite.',
      engine: 'Cloudflare D1 SQLite Engine (Local)',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// DIRECT SUPABASE BACKUP & MIGRATION ENGINE (ENHANCED)
// -------------------------------------------------------------
const KNOWN_SUPABASE_TABLES = [
  'profiles',
  'raw_materials',
  'packaging_materials',
  'products',
  'product_variants',
  'bulk_formulations',
  'warehouse_grn',
  'qc_inspection_reports',
  'deviations',
  'stock_movements',
];

// Map of canonical D1 tables to potential Supabase table names/aliases
const TABLE_ALIASES: Record<string, string[]> = {
  warehouse_grn: [
    'warehouse_grn',
    'grn',
    'goods_receipt',
    'goods_received_note',
    'incoming_goods',
    'penerimaan_barang',
    'kedatangan_barang',
    'kedatangan',
    'warehouse_incoming',
    'warehouse_receipts',
  ],
  profiles: [
    'profiles',
    'user_profiles',
    'users',
    'employees',
    'karyawan',
    'auth_users',
    'profile',
    'accounts',
  ],
  raw_materials: [
    'raw_materials',
    'materials',
    'bahan_baku',
    'raw_material',
    'material_master',
    'items',
  ],
  packaging_materials: [
    'packaging_materials',
    'packaging',
    'bahan_kemas',
    'kemasan',
    'packaging_material',
  ],
  products: [
    'products',
    'finished_goods',
    'produk',
    'produk_jadi',
    'product',
  ],
  product_variants: [
    'product_variants',
    'variants',
    'sku',
    'varian_produk',
  ],
  bulk_formulations: [
    'bulk_formulations',
    'formulations',
    'formulas',
    'formula',
    'formula_ruahan',
    'recipes',
  ],
  qc_inspection_reports: [
    'qc_inspection_reports',
    'qc_inspections',
    'qc_reports',
    'qc_results',
    'inspections',
    'pemeriksaan_qc',
  ],
  deviations: [
    'deviations',
    'penyimpangan',
    'deviation_reports',
  ],
  stock_movements: [
    'stock_movements',
    'stock',
    'inventory',
    'kartu_stok',
    'mutasi_stok',
    'stock_ledger',
  ],
};

// Build reverse lookup: supabase table alias -> canonical D1 table
const REVERSE_ALIAS_MAP: Record<string, string> = {};
for (const [canonical, aliases] of Object.entries(TABLE_ALIASES)) {
  for (const alias of aliases) {
    REVERSE_ALIAS_MAP[alias.toLowerCase()] = canonical;
  }
}

// Helper: Safely insert batch of normalized records into D1 with automatic schema extension
async function insertRecordsIntoD1Table(tableName: string, rows: any[]): Promise<number> {
  if (!rows || rows.length === 0) return 0;
  let inserted = 0;

  // 1. Get existing column set in D1 SQLite table to avoid "no such column" errors
  let existingColumns = new Set<string>();
  try {
    const colInfo = await executeD1Query(`PRAGMA table_info(${tableName})`);
    if (Array.isArray(colInfo.results)) {
      colInfo.results.forEach((c: any) => existingColumns.add(String(c.name).toLowerCase()));
    }
  } catch (pragmaErr) {
    // Table might be custom or dynamic
  }

  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== 'object') continue;
    const row = { ...rawRow };

    // Standardize & Guarantee Warehouse GRN fields
    if (tableName === 'warehouse_grn') {
      const candidateGrn =
        row.grn_number ||
        row.grnNumber ||
        row.no_grn ||
        row.grn_no ||
        row.nomor_grn ||
        row.grn ||
        row.incoming_number ||
        row.no_kedatangan ||
        row.penerimaan_no ||
        row.doc_no ||
        row.no_dokumen ||
        row.reference_no ||
        row.batch_number ||
        row.batchNo ||
        row.no_batch ||
        row.code;

      if (candidateGrn && String(candidateGrn).trim() !== '' && candidateGrn !== 'null' && candidateGrn !== 'undefined') {
        row.grn_number = String(candidateGrn).trim();
      } else {
        const yr = new Date().getFullYear();
        const mo = String(new Date().getMonth() + 1).padStart(2, '0');
        const suffix = row.id
          ? String(row.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()
          : Math.random().toString(36).substring(2, 8).toUpperCase();
        row.grn_number = `GRN-${yr}${mo}-${suffix}`;
      }

      // Material fields
      if (row.materialType && !row.material_type) row.material_type = row.materialType;
      if (row.materialId && !row.material_id) row.material_id = row.materialId;
      if (row.materialCode && !row.material_code) row.material_code = row.materialCode;
      if (row.kode_material && !row.material_code) row.material_code = row.kode_material;
      if (row.kode_bahan && !row.material_code) row.material_code = row.kode_bahan;
      if (row.materialName && !row.material_name) row.material_name = row.materialName;
      if (row.nama_material && !row.material_name) row.material_name = row.nama_material;
      if (row.nama_bahan && !row.material_name) row.material_name = row.nama_bahan;

      if (!row.material_code || String(row.material_code).trim() === '' || row.material_code === 'null') {
        row.material_code = row.code || row.item_code || 'RM-UNKNOWN';
      }
      if (!row.material_name || String(row.material_name).trim() === '' || row.material_name === 'null') {
        row.material_name = row.name || row.item_name || row.material_code || 'Material Tanpa Nama';
      }

      // Warehouse receipt fields
      if (row.poNumber && !row.po_number) row.po_number = row.poNumber;
      if (row.purchase_order_number && !row.po_number) row.po_number = row.purchase_order_number;
      if (row.no_po && !row.po_number) row.po_number = row.no_po;
      if (row.batchNumber && !row.batch_number) row.batch_number = row.batchNumber;
      if (row.no_batch && !row.batch_number) row.batch_number = row.no_batch;
      if (row.receivedDate && !row.received_date) row.received_date = row.receivedDate;
      if (row.tgl_terima && !row.received_date) row.received_date = row.tgl_terima;
      if (row.tanggal_terima && !row.received_date) row.received_date = row.tanggal_terima;

      if (!row.received_date || String(row.received_date).trim() === '' || row.received_date === 'null') {
        row.received_date = row.date || (row.created_at ? String(row.created_at).substring(0, 10) : new Date().toISOString().substring(0, 10));
      }

      if (row.quantityReceived !== undefined && row.quantity_received === undefined) row.quantity_received = row.quantityReceived;
      if (row.qty && row.quantity_received === undefined) row.quantity_received = row.qty;
      if (row.quantity_received === undefined || row.quantity_received === null || isNaN(Number(row.quantity_received))) {
        row.quantity_received = Number(row.qty || row.quantity || 0);
      }

      if (row.currentQuantity !== undefined && row.current_quantity === undefined) row.current_quantity = row.currentQuantity;
      if (row.containerCount !== undefined && row.container_count === undefined) row.container_count = row.containerCount;
      if (row.containerType && !row.container_type) row.container_type = row.containerType;
      if (row.storageLocation && !row.storage_location) row.storage_location = row.storageLocation;
      if (row.lokasi && !row.storage_location) row.storage_location = row.lokasi;
      if (row.qcStatus && !row.qc_status) row.qc_status = row.qcStatus;
      if (row.status && !row.qc_status) row.qc_status = row.status;
      if (!row.qc_status || String(row.qc_status).trim() === '') row.qc_status = 'QUARANTINE';
      if (row.receivedBy && !row.received_by) row.received_by = row.receivedBy;
      if (!row.unit || String(row.unit).trim() === '' || row.unit === 'null') row.unit = row.satuan || 'kg';
      if (!row.material_type || String(row.material_type).trim() === '') {
        row.material_type = row.type || (row.material_code?.startsWith('PM-') ? 'packaging' : 'raw');
      }
    }

    // Standardize User Profile fields
    if (tableName === 'profiles') {
      if (row.full_name && !row.name) row.name = row.full_name;
      if (row.nama && !row.name) row.name = row.nama;
      if (row.nama_lengkap && !row.name) row.name = row.nama_lengkap;
      if (!row.name || String(row.name).trim() === '' || row.name === 'null') {
        row.name = row.email ? row.email.split('@')[0] : 'Karyawan';
      }
      if (row.departemen && !row.department) row.department = row.departemen;
      if (!row.department) row.department = 'rnd';
      if (row.jabatan && !row.position) row.position = row.jabatan;
      if (row.peran && !row.role) row.role = row.peran;
      if (!row.role) row.role = 'staff';
      if (!row.password) row.password = 'laras123';
      if (!row.nik || String(row.nik).trim() === '' || row.nik === 'null') {
        row.nik = row.employee_id || row.no_induk || (row.email ? row.email.split('@')[0] : `USR${Math.random().toString(36).substring(2, 7).toUpperCase()}`);
      }
    }

    // Standardize Raw Materials
    if (tableName === 'raw_materials') {
      if (!row.code || String(row.code).trim() === '' || row.code === 'null') {
        row.code = row.kode_material || row.kode_bahan || row.material_code || `RM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      }
      if (!row.name || String(row.name).trim() === '' || row.name === 'null') {
        row.name = row.nama_material || row.nama_bahan || row.material_name || row.code;
      }
    }

    // Standardize Packaging Materials
    if (tableName === 'packaging_materials') {
      if (!row.code || String(row.code).trim() === '' || row.code === 'null') {
        row.code = row.kode_kemas || row.material_code || `PM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      }
      if (!row.name || String(row.name).trim() === '' || row.name === 'null') {
        row.name = row.nama_kemas || row.material_name || row.code;
      }
    }

    // Standardize Products
    if (tableName === 'products') {
      if (!row.code || String(row.code).trim() === '' || row.code === 'null') {
        row.code = row.product_code || row.kode_produk || `PROD-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      }
      if (!row.name || String(row.name).trim() === '' || row.name === 'null') {
        row.name = row.product_name || row.nama_produk || row.code;
      }
      if (!row.product_code) row.product_code = row.code;
    }

    // Standardize Bulk Formulations
    if (tableName === 'bulk_formulations') {
      if (!row.formula_code || String(row.formula_code).trim() === '' || row.formula_code === 'null') {
        row.formula_code = row.code || row.kode_formula || `FORM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      }
      if (!row.formula_name || String(row.formula_name).trim() === '' || row.formula_name === 'null') {
        row.formula_name = row.name || row.nama_formula || row.formula_code;
      }
    }

    // Standardize QC Reports
    if (tableName === 'qc_inspection_reports') {
      if (!row.report_number || String(row.report_number).trim() === '' || row.report_number === 'null') {
        row.report_number = row.no_laporan || row.report_no || `QC-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      }
    }

    // Standardize Deviations
    if (tableName === 'deviations') {
      if (!row.deviation_number || String(row.deviation_number).trim() === '' || row.deviation_number === 'null') {
        row.deviation_number = row.no_penyimpangan || `DEV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      }
    }

    // Default ID if missing
    if (!row.id) {
      row.id = `${tableName}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }

    // 2. Ensure all columns in this row exist in D1 SQLite table
    for (const key of Object.keys(row)) {
      const lowerKey = key.toLowerCase();
      if (!existingColumns.has(lowerKey)) {
        try {
          await executeD1Query(`ALTER TABLE ${tableName} ADD COLUMN "${key}" TEXT;`);
          existingColumns.add(lowerKey);
        } catch (addErr) {
          // column may already exist or cannot be added
        }
      }
    }

    if (tableName === 'warehouse_grn' && (!row.grn_number || String(row.grn_number).trim() === '' || row.grn_number === 'null')) {
      const yr = new Date().getFullYear();
      const mo = String(new Date().getMonth() + 1).padStart(2, '0');
      const suffix = row.id
        ? String(row.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()
        : Math.random().toString(36).substring(2, 8).toUpperCase();
      row.grn_number = `GRN-${yr}${mo}-${suffix}`;
    }

    const keys = Object.keys(row).filter((k) => row[k] !== undefined && row[k] !== null);
    const placeholders = keys.map(() => '?').join(', ');
    const params = keys.map((k) => {
      const val = row[k];
      if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
        return JSON.stringify(val);
      }
      return val;
    });

    const conflictCol = tableName === 'profiles' ? 'nik' : tableName === 'warehouse_grn' ? 'grn_number' : (row.code ? 'code' : 'id');
    const updateSets = keys
      .filter((k) => k !== conflictCol)
      .map((k) => `"${k}" = excluded."${k}"`)
      .join(', ');

    const sql = `
      INSERT INTO ${tableName} (${keys.map((k) => `"${k}"`).join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(${conflictCol}) DO UPDATE SET ${updateSets || `"${conflictCol}" = excluded."${conflictCol}"`}
    `;

    try {
      await executeD1Query(sql, params);
      inserted++;
    } catch (e: any) {
      // Fallback: try simple INSERT OR REPLACE INTO without ON CONFLICT clause
      try {
        const simpleSql = `INSERT OR REPLACE INTO ${tableName} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders})`;
        await executeD1Query(simpleSql, params);
        inserted++;
      } catch (e2: any) {
        console.warn(`[Migrate D1] Failed row in ${tableName}:`, e.message, e2.message);
      }
    }
  }

  return inserted;
}

// 1. Test connection & count records in remote Supabase (with OpenAPI schema discovery, alias search & RLS detection)
app.post('/api/supabase/test', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = req.body;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(400).json({
      success: false,
      error: 'Supabase URL dan API Key wajib diisi.',
    });
  }

  const cleanUrl = String(supabaseUrl).trim().replace(/\/+$/, '');
  const cleanKey = String(supabaseKey).trim();
  const startTime = Date.now();

  // Inspect JWT to check if it's 'anon', 'service_role', or new key format
  let keyRole = 'unknown';
  try {
    const parts = cleanKey.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      keyRole = payload.role || 'unknown';
    } else if (cleanKey.startsWith('sb_publishable_') || cleanKey.startsWith('anon_')) {
      keyRole = 'anon';
    } else if (cleanKey.startsWith('sb_secret_') || cleanKey.startsWith('service_role_')) {
      keyRole = 'service_role';
    }
  } catch (jwtErr) {
    // ignore
  }

  try {
    // 1. Try to fetch OpenAPI specification from PostgREST to discover all actual tables in their Supabase
    let openApiTables: string[] = [];
    try {
      const openApiRes = await fetch(`${cleanUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: cleanKey,
          Authorization: `Bearer ${cleanKey}`,
          Accept: 'application/openapi+json, application/json',
        },
      });

      if (openApiRes.ok) {
        const spec: any = await openApiRes.json();
        if (spec.paths) {
          openApiTables = Object.keys(spec.paths)
            .map((p) => p.replace(/^\//, ''))
            .filter((p) => p.length > 0 && !p.startsWith('rpc/'));
        } else if (spec.definitions) {
          openApiTables = Object.keys(spec.definitions);
        }
      }
    } catch (e) {
      // Continue with candidate tables
    }

    // 2. Check Supabase Auth Users directly (using Admin API)
    let authUsersCount = 0;
    let authUsersSupported = false;
    try {
      const authRes = await fetch(`${cleanUrl}/auth/v1/admin/users?per_page=1000`, {
        method: 'GET',
        headers: {
          apikey: cleanKey,
          Authorization: `Bearer ${cleanKey}`,
        },
      });
      if (authRes.ok) {
        const authData: any = await authRes.json();
        if (authData && Array.isArray(authData.users)) {
          authUsersCount = authData.users.length;
          authUsersSupported = true;
        }
      }
    } catch (authErr) {
      // Ignored if anon key doesn't have admin access
    }

    // 3. Compile tables to probe (Known canonicals + discovered + common Indonesian/English aliases)
    const candidateAliases = [
      'grn', 'goods_receipt', 'incoming_goods', 'kedatangan_barang', 'penerimaan_barang', 'kedatangan',
      'materials', 'bahan_baku', 'raw_material',
      'packaging', 'bahan_kemas', 'kemasan',
      'users', 'user_profiles', 'karyawan', 'employees',
      'formulas', 'formula',
      'produk', 'finished_goods',
      'mutasi_stok', 'inventory',
    ];

    const tablesToProbe = Array.from(new Set([...KNOWN_SUPABASE_TABLES, ...openApiTables, ...candidateAliases]));

    const tableCounts: Record<string, number> = {};
    const tableMapping: Record<string, string> = {}; // Supabase table -> Target D1 table
    let totalRecords = 0;
    const errors: Record<string, string> = {};
    const debugInfo: Record<string, any> = {};

    let isQuotaExceeded = false;
    let quotaErrorDetails = '';

    for (const tbl of tablesToProbe) {
      try {
        const fetchUrl = `${cleanUrl}/rest/v1/${tbl}?select=*&limit=1`;
        const cfRes = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`,
            Prefer: 'count=exact',
            'Range-Unit': 'items',
          },
        });

        const status = cfRes.status;
        const contentRange = cfRes.headers.get('content-range') || cfRes.headers.get('Content-Range') || '';
        debugInfo[tbl] = { status, contentRange };

        if (status === 200 || status === 206) {
          let count = 0;
          const match = contentRange.match(/\/(\d+)/);

          if (match && match[1]) {
            count = parseInt(match[1], 10);
          } else {
            // Fallback: try fetching up to 100 rows to count
            try {
              const probeRes = await fetch(`${cleanUrl}/rest/v1/${tbl}?select=*&limit=100`, {
                method: 'GET',
                headers: {
                  apikey: cleanKey,
                  Authorization: `Bearer ${cleanKey}`,
                },
              });
              if (probeRes.ok) {
                const body: any = await probeRes.json();
                if (Array.isArray(body)) {
                  count = body.length;
                }
              }
            } catch (pErr) {}
          }

          tableCounts[tbl] = count;
          totalRecords += count;

          // Determine target D1 table
          const targetD1 = REVERSE_ALIAS_MAP[tbl.toLowerCase()] || (KNOWN_SUPABASE_TABLES.includes(tbl) ? tbl : tbl);
          tableMapping[tbl] = targetD1;
        } else if (status === 402) {
          isQuotaExceeded = true;
          try {
            const body402: any = await cfRes.json();
            quotaErrorDetails = body402?.message || 'exceed_egress_quota';
          } catch (e) {}
          tableCounts[tbl] = -3; // Restricted due to quota
          debugInfo[tbl].status = 'exceed_egress_quota';
        } else if (status === 404) {
          // Table doesn't exist in Supabase
          if (KNOWN_SUPABASE_TABLES.includes(tbl)) {
            tableCounts[tbl] = -1; // Not found
          }
          debugInfo[tbl].status = 'not_found';
        } else if (status === 401 || status === 403) {
          tableCounts[tbl] = -2; // Forbidden / RLS Blocked
          errors[tbl] = `Akses ditolak (${status}): Diblokir oleh RLS atau Key tidak memiliki izin.`;
          debugInfo[tbl].status = 'forbidden_rls';
        }
      } catch (tblErr: any) {
        errors[tbl] = tblErr.message;
        debugInfo[tbl] = { error: tblErr.message };
      }
    }

    // If Supabase Auth users were found, include them
    if (authUsersSupported && authUsersCount > 0) {
      tableCounts['auth.users'] = authUsersCount;
      tableMapping['auth.users'] = 'profiles';
      totalRecords += authUsersCount;
    }

    const latencyMs = Date.now() - startTime;
    const isAnonKey = keyRole === 'anon';
    const isRlsSuspected = (isAnonKey && totalRecords === 0) || (keyRole !== 'service_role' && totalRecords === 0);

    let warningMessage = undefined;
    if (isQuotaExceeded) {
      warningMessage =
        `⚠️ PROYEK DIBATASI OLEH SUPABASE (HTTP 402: EXCEED EGRESS QUOTA):\n` +
        `Supabase memblokir akses API publik untuk proyek ini karena penggunaan bandwidth transfer data (egress quota) telah melampaui batas kuota gratis.\n` +
        `Data Anda TIDAK hilang dan masih aman 100% di database PostgreSQL!\n` +
        `Cara Mengambil Data Tanpa Biaya:\n` +
        `1. Buka dashboard web Supabase (supabase.com) > buka proyek Anda > klik menu "SQL Editor".\n` +
        `2. Jalankan query: SELECT json_agg(t) FROM (SELECT * FROM warehouse_grn) t; (atau tabel profiles / master lainnya).\n` +
        `3. Salin hasil JSON tersebut, lalu tempelkan ke tab "Upload / Tempel SQL & JSON" di aplikasi ini. Data akan langsung terimpor ke Cloudflare D1 dalam hitungan detik!\n` +
        `Atau opsi lain: Buka Project Settings > Billing di dashboard Supabase untuk menaikkan spend cap agar API langsung aktif kembali.`;
    } else if (isRlsSuspected) {
      warningMessage =
        'PERHATIAN (RLS AKTIF): Anda terdeteksi menggunakan "anon key" (kunci publik) dan seluruh tabel mengembalikan 0 baris. Supabase mengaktifkan Row Level Security (RLS) secara otomatis yang menyembunyikan semua baris data untuk anon key. Mohon gunakan "service_role" (secret) key dari Dashboard Supabase > Project Settings > API > Project API keys > service_role (klik Reveal), atau nonaktifkan RLS sementara di SQL Editor.';
    } else if (totalRecords === 0) {
      const activeTables = Object.keys(tableCounts).filter((t) => tableCounts[t] >= 0);
      warningMessage = `Terhubung (kunci: ${keyRole}), namun tabel yang diperiksa mengembalikan 0 baris (${activeTables.join(', ') || 'tidak ada tabel'}). Pastikan nama tabel di Supabase Anda sesuai, atau gunakan tab "Upload / Tempel SQL / JSON" atau fitur "Uji Tabel Kustom" di bawah.`;
    }

    // Filter discoveredTables to only tables that actually exist (count >= 0)
    const existingDiscovered = Object.keys(tableCounts).filter((t) => tableCounts[t] > 0 || tableCounts[t] === 0);

    res.json({
      success: true,
      isQuotaExceeded,
      message: isQuotaExceeded
        ? 'Terhubung ke Supabase, namun API dibatasi oleh Supabase (HTTP 402: exceed_egress_quota).'
        : totalRecords > 0
        ? `Terhubung ke Supabase! Ditemukan total ${totalRecords} baris data.`
        : isRlsSuspected
        ? 'Terhubung ke Supabase, namun terdeteksi 0 baris data karena pembatasan RLS (Row Level Security).'
        : 'Terhubung ke Supabase, namun tidak ditemukan baris data di tabel yang diperiksa.',
      latencyMs,
      totalRecords,
      tableCounts,
      tableMapping,
      keyRole,
      warningMessage,
      discoveredTables: existingDiscovered,
      debugInfo,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Gagal menghubungi Supabase: ${err.message}`,
    });
  }
});

// 2. Inspect a specific custom table name in Supabase (with column names and sample row preview)
app.post('/api/supabase/inspect-table', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey, tableName } = req.body;
  if (!supabaseUrl || !supabaseKey || !tableName) {
    return res.status(400).json({ success: false, error: 'supabaseUrl, supabaseKey, dan tableName wajib diisi.' });
  }

  const cleanUrl = String(supabaseUrl).trim().replace(/\/+$/, '');
  const cleanKey = String(supabaseKey).trim();
  const cleanTable = String(tableName).trim();

  try {
    const fetchUrl = `${cleanUrl}/rest/v1/${cleanTable}?select=*&limit=5`;
    const resRemote = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        apikey: cleanKey,
        Authorization: `Bearer ${cleanKey}`,
        Prefer: 'count=exact',
        'Range-Unit': 'items',
      },
    });

    const status = resRemote.status;
    const contentRange = resRemote.headers.get('content-range') || resRemote.headers.get('Content-Range') || '';

    if (status === 402) {
      let bodyMsg = 'exceed_egress_quota';
      try {
        const body402 = await resRemote.json();
        bodyMsg = body402.message || bodyMsg;
      } catch (e) {}

      return res.json({
        success: false,
        status,
        isQuotaExceeded: true,
        message: `Proyek Supabase Anda sedang DIBATASI (HTTP 402: ${bodyMsg}). Kuota transfer data gratis telah melampaui batas paket. Data Anda di database tetap aman 100%. Salin data langsung via Supabase SQL Editor ke tab Upload/Tempel.`,
        count: 0,
      });
    }

    if (status === 404) {
      return res.json({
        success: false,
        status,
        message: `Tabel "${cleanTable}" tidak ditemukan di Supabase (HTTP 404). Periksa kembali ejaan nama tabel.`,
        count: 0,
      });
    }

    if (status === 401 || status === 403) {
      return res.json({
        success: false,
        status,
        message: `Akses ke tabel "${cleanTable}" ditolak (HTTP ${status}). RLS aktif atau API key tidak memiliki izin. Gunakan service_role key.`,
        count: 0,
      });
    }

    const rows: any = await resRemote.json();
    let count = 0;
    const match = contentRange.match(/\/(\d+)/);
    if (match && match[1]) {
      count = parseInt(match[1], 10);
    } else if (Array.isArray(rows)) {
      count = rows.length;
    }

    const columns = Array.isArray(rows) && rows.length > 0 ? Object.keys(rows[0]) : [];
    const targetD1Table = REVERSE_ALIAS_MAP[cleanTable.toLowerCase()] || cleanTable;

    res.json({
      success: true,
      status,
      tableName: cleanTable,
      count,
      columns,
      sampleRows: Array.isArray(rows) ? rows.slice(0, 3) : [],
      targetD1Table,
      message: count > 0
        ? `Tabel "${cleanTable}" ditemukan! Berisi ${count} baris data.`
        : `Tabel "${cleanTable}" terhubung tetapi berisi 0 baris (mungkin kosong atau dibatasi RLS).`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Direct migration: Fetch all records from Supabase and insert into D1
app.post('/api/supabase/migrate-all', async (req: Request, res: Response) => {
  const {
    supabaseUrl,
    supabaseKey,
    wipeExisting = false,
    tables = KNOWN_SUPABASE_TABLES,
    tableMapping: customMapping = {},
  } = req.body;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(400).json({
      success: false,
      error: 'Supabase URL dan API Key wajib diisi.',
    });
  }

  const cleanUrl = String(supabaseUrl).trim().replace(/\/+$/, '');
  const cleanKey = String(supabaseKey).trim();
  const summary: Record<string, { targetTable: string; fetched: number; inserted: number; status: string; error?: string }> = {};

  try {
    for (const sourceTable of tables) {
      // Determine canonical target D1 table
      const targetTable =
        customMapping[sourceTable] ||
        REVERSE_ALIAS_MAP[sourceTable.toLowerCase()] ||
        (KNOWN_SUPABASE_TABLES.includes(sourceTable) ? sourceTable : sourceTable);

      summary[sourceTable] = { targetTable, fetched: 0, inserted: 0, status: 'pending' };

      // Optional wipe existing data first (Clean Overwrite)
      if (wipeExisting) {
        try {
          await executeD1Query(`DELETE FROM ${targetTable}`);
        } catch (wipeErr: any) {
          console.warn(`[Migrate D1] Failed to clean ${targetTable}:`, wipeErr.message);
        }
      }

      let allRows: any[] = [];

      // SPECIAL CASE: Supabase Auth Users Migration
      if (sourceTable === 'auth.users') {
        try {
          const authRes = await fetch(`${cleanUrl}/auth/v1/admin/users?per_page=1000`, {
            method: 'GET',
            headers: {
              apikey: cleanKey,
              Authorization: `Bearer ${cleanKey}`,
            },
          });
          if (authRes.ok) {
            const authData: any = await authRes.json();
            if (authData && Array.isArray(authData.users)) {
              allRows = authData.users.map((u: any) => ({
                id: u.id,
                nik: u.user_metadata?.nik || u.email?.split('@')[0] || `USR${u.id.substring(0, 5).toUpperCase()}`,
                name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User',
                email: u.email,
                department: u.user_metadata?.department || 'rnd',
                role: u.user_metadata?.role || 'staff',
                position: u.user_metadata?.position || '',
                password: u.user_metadata?.password || 'laras123',
                created_at: u.created_at,
              }));
            }
          }
        } catch (authErr: any) {
          summary[sourceTable].status = 'error';
          summary[sourceTable].error = authErr.message;
        }
      } else {
        // STANDARD TABLE: Fetch all rows from Supabase with pagination
        let offset = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
          try {
            const fetchUrl = `${cleanUrl}/rest/v1/${sourceTable}?select=*`;
            const cfRes = await fetch(fetchUrl, {
              method: 'GET',
              headers: {
                apikey: cleanKey,
                Authorization: `Bearer ${cleanKey}`,
                Range: `${offset}-${offset + batchSize - 1}`,
              },
            });

            if (!cfRes.ok) {
              summary[sourceTable].status = cfRes.status === 404 ? 'skipped_not_found' : 'error';
              summary[sourceTable].error = `HTTP ${cfRes.status}: ${cfRes.statusText}`;
              hasMore = false;
              break;
            }

            const rows: any = await cfRes.json();
            if (Array.isArray(rows) && rows.length > 0) {
              allRows = allRows.concat(rows);
              offset += rows.length;
              if (rows.length < batchSize) {
                hasMore = false;
              }
            } else {
              hasMore = false;
            }
          } catch (fetchErr: any) {
            summary[sourceTable].status = 'error';
            summary[sourceTable].error = fetchErr.message;
            hasMore = false;
            break;
          }
        }
      }

      summary[sourceTable].fetched = allRows.length;

      if (allRows.length > 0) {
        const insertedCount = await insertRecordsIntoD1Table(targetTable, allRows);
        summary[sourceTable].inserted = insertedCount;
        summary[sourceTable].status = 'success';
      } else if (summary[sourceTable].status === 'pending') {
        summary[sourceTable].status = 'empty';
      }
    }

    const totalInserted = Object.values(summary).reduce((acc, curr) => acc + curr.inserted, 0);

    res.json({
      success: true,
      message: `Migrasi selesai! Total ${totalInserted} baris data berhasil ditransfer ke database Cloudflare D1.`,
      totalInserted,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Kegagalan selama proses migrasi: ${err.message}`,
      summary,
    });
  }
});

// 4. Import from exported JSON file
app.post('/api/supabase/import-json', async (req: Request, res: Response) => {
  const { tableName, rows, wipeExisting = false } = req.body;

  if (!tableName || !Array.isArray(rows)) {
    return res.status(400).json({
      success: false,
      error: 'Nama tabel dan array data rows wajib disertakan.',
    });
  }

  const targetTable = REVERSE_ALIAS_MAP[tableName.toLowerCase()] || tableName;

  try {
    if (wipeExisting) {
      await executeD1Query(`DELETE FROM ${targetTable}`);
    }

    const inserted = await insertRecordsIntoD1Table(targetTable, rows);
    res.json({
      success: true,
      message: `Berhasil mengimpor ${inserted} baris data ke tabel ${targetTable}.`,
      inserted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Import from raw SQL dump (with smart PostgreSQL COPY block parser and SQLite compatibility)
app.post('/api/supabase/import-sql', async (req: Request, res: Response) => {
  const { sqlContent, wipeExisting = false } = req.body;
  if (!sqlContent || typeof sqlContent !== 'string') {
    return res.status(400).json({ success: false, error: 'SQL content string wajib diisi.' });
  }

  const trimmed = sqlContent.trim();

  // Auto-detect JSON pasted in SQL tab
  if (trimmed.startsWith('[') || (trimmed.startsWith('{') && trimmed.includes('"data"'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parsed : parsed.data || parsed.results || [];
      if (Array.isArray(rows) && rows.length > 0) {
        // Guess table from fields
        let detectedTable = 'warehouse_grn';
        if (rows[0].nik || rows[0].role) detectedTable = 'profiles';
        else if (rows[0].product_name || rows[0].bpom_notification_number) detectedTable = 'products';
        else if (rows[0].material_type === 'raw' || rows[0].cas_number) detectedTable = 'raw_materials';

        const inserted = await insertRecordsIntoD1Table(detectedTable, rows);
        return res.json({
          success: true,
          message: `Terdeteksi format JSON! Berhasil mengimpor ${inserted} baris data ke tabel ${detectedTable}.`,
          executed: inserted,
          errors: 0,
        });
      }
    } catch (jsonErr) {
      // Continue with SQL parsing
    }
  }

  try {
    let executed = 0;
    let ignored = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // 1. Parse PostgreSQL COPY ... FROM stdin blocks
    // Format: COPY [public.]<table_name> (col1, col2, ...) FROM stdin;\n<row1>\n<row2>\n\.
    const copyRegex = /COPY\s+(?:["']?public["']?\.)?["']?([a-zA-Z0-9_]+)["']?\s*\(([^)]+)\)\s+FROM\s+stdin;([\s\S]*?)(?:\\\.|\n\s*\n)/gi;
    let matchCopy: RegExpExecArray | null;

    while ((matchCopy = copyRegex.exec(sqlContent)) !== null) {
      const rawTable = matchCopy[1].trim();
      const rawCols = matchCopy[2].split(',').map((c) => c.trim().replace(/["']/g, ''));
      const dataBlock = matchCopy[3];

      const targetTable = REVERSE_ALIAS_MAP[rawTable.toLowerCase()] || rawTable;
      const lines = dataBlock.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && l !== '\\.');

      const parsedRows: any[] = [];
      for (const line of lines) {
        const values = line.split('\t');
        const rowObj: Record<string, any> = {};
        rawCols.forEach((col, idx) => {
          let val = values[idx];
          if (val === undefined || val === '\\N') {
            rowObj[col] = null;
          } else {
            // Unescape common pg escapes
            rowObj[col] = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
          }
        });
        parsedRows.push(rowObj);
      }

      if (parsedRows.length > 0) {
        try {
          const inserted = await insertRecordsIntoD1Table(targetTable, parsedRows);
          executed += inserted;
        } catch (copyErr: any) {
          errors++;
          errorDetails.push(`[Gagal COPY ${targetTable}]: ${copyErr.message}`);
        }
      }
    }

    // 2. Remove the COPY blocks from the SQL string so they don't break statement splitting
    let cleanedSql = sqlContent.replace(copyRegex, '');

    // Clean schema prefixes and double quotes
    cleanedSql = cleanedSql
      .replace(/["']?public["']?\./gi, '')
      .replace(/::[a-zA-Z0-9_]+/g, ''); // strip ::uuid, ::text, etc.

    // Directives to safely ignore (PostgreSQL-specific)
    const pgIgnoredPatterns = [
      /^SET\s+/i,
      /^SELECT\s+pg_catalog\./i,
      /^CREATE\s+EXTENSION/i,
      /^ALTER\s+TABLE\s+.*?\s+OWNER\s+TO/i,
      /^ALTER\s+SEQUENCE/i,
      /^CREATE\s+SEQUENCE/i,
      /^GRANT\s+/i,
      /^REVOKE\s+/i,
      /^COMMENT\s+ON/i,
      /^CREATE\s+POLICY/i,
      /^ALTER\s+TABLE\s+.*?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      /^BEGIN/i,
      /^COMMIT/i,
    ];

    // Split statements safely by semicolon
    const rawStatements = cleanedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    for (const rawStmt of rawStatements) {
      const isIgnored = pgIgnoredPatterns.some((pat) => pat.test(rawStmt));
      if (isIgnored) {
        ignored++;
        continue;
      }

      // Convert common PostgreSQL constructs to SQLite
      let stmt = rawStmt
        .replace(/DEFAULT\s+gen_random_uuid\(\)/gi, "DEFAULT (lower(hex(randomblob(16))))")
        .replace(/DEFAULT\s+uuid_generate_v4\(\)/gi, "DEFAULT (lower(hex(randomblob(16))))")
        .replace(/DEFAULT\s+now\(\)/gi, "DEFAULT (datetime('now'))")
        .replace(/timestamp\s+with\s+time\s+zone/gi, 'TEXT')
        .replace(/timestamptz/gi, 'TEXT')
        .replace(/uuid/gi, 'TEXT');

      try {
        await executeD1Query(stmt);
        executed++;
      } catch (e: any) {
        // If it's an INSERT into a known alias, rewrite table name and retry
        let retried = false;
        for (const [alias, canonical] of Object.entries(REVERSE_ALIAS_MAP)) {
          if (stmt.toLowerCase().includes(`insert into ${alias}`)) {
            try {
              const rewritten = stmt.replace(new RegExp(`insert into ${alias}`, 'i'), `INSERT INTO ${canonical}`);
              await executeD1Query(rewritten);
              executed++;
              retried = true;
              break;
            } catch (rErr) {}
          }
        }

        if (!retried) {
          errors++;
          const snippet = stmt.replace(/\s+/g, ' ').substring(0, 90);
          errorDetails.push(`[${e.message}]: "${snippet}..."`);
        }
      }
    }

    const message = executed > 0
      ? `Eksekusi SQL/COPY selesai: ${executed} perintah/baris data berhasil diimpor (${ignored} konfigurasi Postgres dilewati, ${errors} error).`
      : `Tidak ada data yang berhasil dieksekusi (${errors} error, ${ignored} konfigurasi Postgres dilewati). Silakan gunakan tab Koneksi Langsung atau periksa error di bawah.`;

    res.json({
      success: executed > 0 || (errors === 0 && ignored > 0),
      message,
      executed,
      ignored,
      errors,
      errorDetails: errorDetails.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health Check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const row = await executeD1Query("SELECT datetime('now') as now");
    res.json({
      status: 'ok',
      engine: isRemoteCloudflareConfigured() ? 'Cloudflare D1 Cloud Network' : 'Cloudflare D1 SQLite Engine',
      serverTime: row.results[0]?.now,
      persistentStorage: true,
      localStorageUsed: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Universal D1 SQL Execution Endpoint with Query Cache
app.post('/api/d1/query', async (req: Request, res: Response) => {
  try {
    const { sql, params = [], bypassCache = false, forceFresh = false } = req.body;
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'SQL query string is required' });
    }
    const result = await executeD1Query(sql, params, bypassCache || forceFresh);
    res.json({
      success: true,
      results: result.results,
      meta: {
        changes: result.changes,
        last_row_id: result.lastInsertRowid,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Batch Transaction Execution (Invalidates query cache)
app.post('/api/d1/batch', async (req: Request, res: Response) => {
  try {
    const { statements } = req.body;
    if (!Array.isArray(statements)) {
      return res.status(400).json({ error: 'Array of statements is required' });
    }
    invalidateD1Cache();
    const batchResults = [];
    for (const stmt of statements) {
      const resStmt = await executeD1Query(stmt.sql, stmt.params || [], true);
      batchResults.push(resStmt);
    }
    res.json({ success: true, results: batchResults });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Optimized Aggregate Dashboard Counts (1 single query, zero table scanning)
app.get('/api/dashboard/counts', async (_req: Request, res: Response) => {
  try {
    const statsSql = `
      SELECT
        (SELECT COUNT(*) FROM raw_materials) as rawMaterialsCount,
        (SELECT COUNT(*) FROM packaging_materials) as packagingCount,
        (SELECT COUNT(*) FROM products) as productsCount,
        (SELECT COUNT(*) FROM bulk_formulations) as formulasCount,
        (SELECT COUNT(*) FROM warehouse_grn WHERE grn_number != 'SYSTEM-STOCK-LEDGER') as grnCount,
        (SELECT COUNT(*) FROM qc_inspection_reports) as qcCount,
        (SELECT COUNT(*) FROM stock_movements) as stockMovementsCount
    `;
    const resStats = await executeD1Query(statsSql);
    res.json({ success: true, counts: resStats.results[0] || {} });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// WAREHOUSE GRN ENDPOINTS
app.get('/api/grn', async (req: Request, res: Response) => {
  try {
    const { page = '1', pageSize = '50', materialType, status, search, id, releaseGroup } = req.query;

    if (id) {
      const { results } = await executeD1Query(
        'SELECT * FROM warehouse_grn WHERE id = ? OR grn_number = ? LIMIT 1',
        [id, id]
      );
      if (!results.length) return res.status(404).json({ error: 'GRN not found' });
      return res.json({ data: results[0] });
    }

    const p = parseInt(page as string, 10);
    const ps = parseInt(pageSize as string, 10);
    const where: string[] = ["grn_number != 'SYSTEM-STOCK-LEDGER'"];
    const params: any[] = [];

    if (materialType && materialType !== 'all') {
      where.push('material_type = ?');
      params.push(materialType);
    }
    if (status && status !== 'ALL') {
      if (status === 'PASSED' || status === 'RELEASED') {
        where.push("qc_status IN ('PASSED', 'RELEASED', 'PASSED_WITH_DEVIATION', 'RELEASE_DEVIATION')");
      } else if (status === 'REVERTED_TO_WAREHOUSE') {
        where.push("qc_status NOT IN ('PASSED', 'RELEASED', 'PASSED_WITH_DEVIATION', 'RELEASE_DEVIATION') AND (qc_status = 'REVERTED_TO_WAREHOUSE' OR notes LIKE '%REVERTED_TO_WAREHOUSE%' OR (revert_reason IS NOT NULL AND revert_reason != ''))");
      } else if (status === 'QUARANTINE') {
        where.push("qc_status = 'QUARANTINE' AND (notes NOT LIKE '%REVERTED_TO_WAREHOUSE%' OR notes IS NULL) AND (revert_reason IS NULL OR revert_reason = '')");
      } else {
        where.push('qc_status = ?');
        params.push(status);
      }
    } else if (releaseGroup && releaseGroup !== 'all') {
      if (releaseGroup === 'unreleased') {
        where.push("(qc_status NOT IN ('PASSED', 'RELEASED', 'PASSED_WITH_DEVIATION', 'RELEASE_DEVIATION'))");
      } else if (releaseGroup === 'released') {
        where.push("(qc_status IN ('PASSED', 'RELEASED', 'PASSED_WITH_DEVIATION', 'RELEASE_DEVIATION'))");
      }
    }
    if (search) {
      where.push('(LOWER(grn_number) LIKE ? OR LOWER(material_code) LIKE ? OR LOWER(material_name) LIKE ? OR LOWER(distributor) LIKE ? OR LOWER(manufacturer) LIKE ? OR LOWER(batch_number) LIKE ? OR LOWER(supplier_batch_number) LIKE ? OR LOWER(internal_lot_number) LIKE ?)');
      const s = `%${(search as string).trim().toLowerCase()}%`;
      params.push(s, s, s, s, s, s, s, s);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await executeD1Query(`SELECT COUNT(*) as count FROM warehouse_grn ${whereSql}`, params);
    const totalItems = countRes.results[0]?.count || 0;
    const totalPages = Math.ceil(totalItems / ps) || 1;
    const offset = (p - 1) * ps;

    const dataRes = await executeD1Query(
      `SELECT * FROM warehouse_grn ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, ps, offset]
    );

    res.json({
      records: dataRes.results,
      totalItems,
      totalPages,
      page: p,
      pageSize: ps,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/grn', async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const newId = b.id || `grn-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const sql = `
      INSERT INTO warehouse_grn (
        id, grn_number, material_type, material_id, material_code, material_name,
        manufacturer, distributor, delivery_note_number, purchase_order_number, po_number,
        supplier_batch_number, batch_number, internal_lot_number, received_date,
        expiration_date, expiry_date, retest_date, quantity_received, current_quantity,
        unit, container_count, container_type, storage_location, storage_conditions,
        qc_status, qc_parameters_count, seal_condition, packaging_condition,
        coa_attachment, received_by, notes, revert_reason, reverted_by, reverted_at,
        actual_sample_size, actual_sample_unit, sampled_containers, sampled_by, sampling_date_time
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `;
    const yr = new Date().getFullYear();
    const mo = String(new Date().getMonth() + 1).padStart(2, '0');
    const genGrn = `GRN-${yr}${mo}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const finalGrnNumber = b.grn_number || b.grnNumber || genGrn;
    await executeD1Query(sql, [
      newId, finalGrnNumber, b.material_type || b.materialType || 'raw',
      b.material_id || b.materialId || null, b.material_code || b.materialCode,
      b.material_name || b.materialName, b.manufacturer || '-', b.distributor || '-',
      b.delivery_note_number || b.deliveryNoteNumber || '-', b.purchase_order_number || b.po_number || b.poNumber || '-',
      b.po_number || b.poNumber || '-', b.supplier_batch_number || b.batch_number || b.batchNumber || '-',
      b.batch_number || b.batchNumber || '-', b.internal_lot_number || b.internalLotNumber || null,
      b.received_date || b.receivedDate || new Date().toISOString().slice(0, 10),
      b.expiration_date || b.expiry_date || b.expiryDate || null,
      b.expiry_date || b.expiryDate || null, b.retest_date || b.retestDate || null,
      Number(b.quantity_received ?? b.quantityReceived ?? 0),
      Number(b.current_quantity ?? b.currentQuantity ?? b.quantity_received ?? b.quantityReceived ?? 0),
      b.unit || 'kg', Number(b.container_count ?? b.containerCount ?? 1),
      b.container_type || b.containerType || 'Drum / Zak', b.storage_location || b.storageLocation || 'Gudang Karantina',
      b.storage_conditions || b.storageConditions || null, b.qc_status || b.qcStatus || 'QUARANTINE',
      Number(b.qc_parameters_count ?? b.qcParametersCount ?? 0), b.seal_condition || b.sealCondition || null,
      b.packaging_condition || b.packagingCondition || null, b.coa_attachment || b.coaAttachment || null,
      b.received_by || b.receivedBy || 'Staf Gudang', b.notes || null, b.revert_reason || b.revertReason || null,
      b.reverted_by || b.revertedBy || null, b.reverted_at || b.revertedAt || null,
      b.actual_sample_size || b.actualSampleSize || null, b.actual_sample_unit || b.actualSampleUnit || null,
      b.sampled_containers || b.sampledContainers || null, b.sampled_by || b.sampledBy || null,
      b.sampling_date_time || b.samplingDateTime || null
    ]);
    res.status(201).json({ success: true, id: newId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/grn', async (req: Request, res: Response) => {
  try {
    const { id, ...fields } = req.body;
    const targetId = id || req.query.id;
    if (!targetId) return res.status(400).json({ error: 'Missing GRN id' });

    const updates: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    const fieldMap: Record<string, string> = {
      qcStatus: 'qc_status',
      qc_status: 'qc_status',
      notes: 'notes',
      currentQuantity: 'current_quantity',
      current_quantity: 'current_quantity',
      revertReason: 'revert_reason',
      revert_reason: 'revert_reason',
      revertedBy: 'reverted_by',
      reverted_by: 'reverted_by',
      revertedAt: 'reverted_at',
      reverted_at: 'reverted_at',
      sampledContainers: 'sampled_containers',
      sampled_containers: 'sampled_containers',
      sampledBy: 'sampled_by',
      sampled_by: 'sampled_by',
      samplingDateTime: 'sampling_date_time',
      sampling_date_time: 'sampling_date_time',
    };

    for (const [key, val] of Object.entries(fields)) {
      const col = fieldMap[key];
      if (col) {
        updates.push(`${col} = ?`);
        params.push(val);
      }
    }

    params.push(targetId, targetId);
    await executeD1Query(
      `UPDATE warehouse_grn SET ${updates.join(', ')} WHERE id = ? OR grn_number = ?`,
      params
    );
    res.json({ success: true, id: targetId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// QC INSPECTION REPORTS
app.get('/api/qc', async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    if (id) {
      const { results } = await executeD1Query(
        'SELECT * FROM qc_inspection_reports WHERE id = ? OR grn_number = ? OR lot_internal_number = ? LIMIT 1',
        [id, id, id]
      );
      if (!results.length) return res.status(404).json({ error: 'QC Report not found' });
      return res.json({ data: results[0] });
    }
    const { results } = await executeD1Query('SELECT * FROM qc_inspection_reports ORDER BY created_at DESC LIMIT 500');
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/qc', async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const newId = b.id || `qc-rep-${Date.now()}`;
    const sql = `
      INSERT INTO qc_inspection_reports (
        id, grn_id, grn_number, report_number, lot_internal_number, material_code,
        material_name, material_type, batch_number, quantity_received, unit,
        container_count, container_type, manufacturer, distributor, received_date,
        expiry_date, retest_date, storage_conditions, status, decision, parameters_json,
        sampling_plan_json, sampled_containers, sampled_by, sampling_date_time,
        actual_sample_size, actual_sample_unit, staff_decision, staff_notes,
        staff_signature_json, qm_decision, qm_notes, qm_deviation_number, qm_signature_json,
        ai_assessment, revert_reason, reverted_by, reverted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await executeD1Query(sql, [
      newId, b.grnId || b.grn_id || null, b.grnNumber || b.grn_number, b.reportNumber || b.report_number || null,
      b.lotInternalNumber || b.lot_internal_number, b.materialCode || b.material_code, b.materialName || b.material_name,
      b.materialType || b.material_type || 'raw', b.batchNumber || b.batch_number || null, Number(b.quantityReceived || b.quantity_received || 0),
      b.unit || 'kg', Number(b.containerCount || b.container_count || 1), b.containerType || b.container_type || 'Drum / Zak',
      b.manufacturer || null, b.distributor || null, b.receivedDate || b.received_date || null,
      b.expiryDate || b.expiry_date || null, b.retestDate || b.retest_date || null, b.storageConditions || b.storage_conditions || null,
      b.status || 'QUARANTINE', b.decision || null, JSON.stringify(b.parameters || []), JSON.stringify(b.samplingPlan || {}),
      b.sampledContainers || null, b.sampledBy || null, b.samplingDateTime || null,
      Number(b.actualSampleSize || 0) || null, b.actualSampleUnit || null, b.staffDecision || null, b.staffNotes || null,
      JSON.stringify(b.staffSignature || {}), b.qmDecision || null, b.qmNotes || null, b.qmDeviationNumber || null,
      JSON.stringify(b.qmSignature || {}), b.aiAssessment || null, b.revertReason || null, b.revertedBy || null, b.revertedAt || null
    ]);
    res.status(201).json({ success: true, id: newId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RAW MATERIALS
app.get('/api/raw-materials', async (req: Request, res: Response) => {
  try {
    const { results } = await executeD1Query('SELECT * FROM raw_materials ORDER BY code ASC');
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PACKAGING MATERIALS
app.get('/api/packaging-materials', async (req: Request, res: Response) => {
  try {
    const { results } = await executeD1Query('SELECT * FROM packaging_materials ORDER BY code ASC');
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PRODUCTS
app.get('/api/products', async (req: Request, res: Response) => {
  try {
    const { results } = await executeD1Query('SELECT * FROM products ORDER BY code ASC');
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// BULK FORMULATIONS
app.get('/api/bulk-formulations', async (req: Request, res: Response) => {
  try {
    const { results } = await executeD1Query('SELECT * FROM bulk_formulations ORDER BY code ASC');
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DEVIATIONS
app.get('/api/deviations', async (req: Request, res: Response) => {
  try {
    const { results } = await executeD1Query('SELECT * FROM deviations ORDER BY created_at DESC');
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PROFILES & AUTH
app.get('/api/profiles', async (req: Request, res: Response) => {
  try {
    const { results } = await executeD1Query('SELECT id, nik, name, role, department, permissions_json, created_at, updated_at FROM profiles ORDER BY name ASC');
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Guard: Guarantee all unhandled /api/* routes return JSON 404, never index.html
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found` });
});

// -------------------------------------------------------------
// VITE DEV SERVER / PRODUCTION STATIC SERVING
// -------------------------------------------------------------
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LMS DDMP] Server listening on port ${PORT} (Node ${process.version})`);
    console.log(`[LMS DDMP] Cloudflare D1 Storage Engine Active (Zero localStorage)`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('[LMS DDMP] Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
