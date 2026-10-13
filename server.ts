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
};

function isRemoteCloudflareConfigured(): boolean {
  return Boolean(activeCfConfig.accountId && activeCfConfig.databaseId && activeCfConfig.apiToken);
}

async function executeD1Query(sql: string, params: any[] = []): Promise<{ results: any[]; changes?: number; lastInsertRowid?: number }> {
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
    return {
      results: resultObj.results || [],
      changes: resultObj.meta?.changes,
      lastInsertRowid: resultObj.meta?.last_row_id,
    };
  }

  // Local SQLite D1 Engine
  const trimmed = sql.trim();
  const isSelect = /^SELECT/i.test(trimmed) || /^PRAGMA/i.test(trimmed);
  const stmt = db.prepare(sql);

  if (isSelect) {
    const results = stmt.all(...params);
    return { results };
  } else {
    const info = stmt.run(...params);
    return {
      results: [],
      changes: info.changes,
      lastInsertRowid: Number(info.lastInsertRowid),
    };
  }
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

// Universal D1 SQL Execution Endpoint
app.post('/api/d1/query', async (req: Request, res: Response) => {
  try {
    const { sql, params = [] } = req.body;
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'SQL query string is required' });
    }
    const result = await executeD1Query(sql, params);
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

// Batch Transaction Execution
app.post('/api/d1/batch', async (req: Request, res: Response) => {
  try {
    const { statements } = req.body;
    if (!Array.isArray(statements)) {
      return res.status(400).json({ error: 'Array of statements is required' });
    }
    const batchResults = [];
    for (const stmt of statements) {
      const resStmt = await executeD1Query(stmt.sql, stmt.params || []);
      batchResults.push(resStmt);
    }
    res.json({ success: true, results: batchResults });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// WAREHOUSE GRN ENDPOINTS
app.get('/api/grn', async (req: Request, res: Response) => {
  try {
    const { page = '1', pageSize = '50', materialType, status, search, id } = req.query;

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
        where.push("qc_status IN ('PASSED', 'RELEASED', 'PASSED_WITH_DEVIATION')");
      } else if (status === 'REVERTED_TO_WAREHOUSE') {
        where.push("(qc_status = 'REVERTED_TO_WAREHOUSE' OR notes LIKE '%REVERTED_TO_WAREHOUSE%')");
      } else if (status === 'QUARANTINE') {
        where.push("qc_status = 'QUARANTINE' AND (notes NOT LIKE '%REVERTED_TO_WAREHOUSE%' OR notes IS NULL)");
      } else {
        where.push('qc_status = ?');
        params.push(status);
      }
    }
    if (search) {
      where.push('(LOWER(grn_number) LIKE ? OR LOWER(material_code) LIKE ? OR LOWER(material_name) LIKE ? OR LOWER(distributor) LIKE ? OR LOWER(batch_number) LIKE ? OR LOWER(internal_lot_number) LIKE ?)');
      const s = `%${(search as string).trim().toLowerCase()}%`;
      params.push(s, s, s, s, s, s);
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
    await executeD1Query(sql, [
      newId, b.grn_number || b.grnNumber, b.material_type || b.materialType || 'raw',
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

startServer().catch((err) => {
  console.error('[LMS DDMP] Fatal startup error:', err);
  process.exit(1);
});
