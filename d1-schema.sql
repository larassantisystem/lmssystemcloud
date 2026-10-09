-- ========================================================================
-- CLOUDFLARE D1 DATABASE SCHEMA
-- Sistem Operasional CPKB & ERP Mutu (PT. Larassanti Makmur Sejahtera)
-- Zero Egress Bandwidth Fees - Optimized for Cloudflare D1 (SQLite Edge)
-- ========================================================================

-- 1. TABEL PENERIMAAN GUDANG (WAREHOUSE GRN)
CREATE TABLE IF NOT EXISTS warehouse_grn (
  id TEXT PRIMARY KEY,
  grn_number TEXT UNIQUE NOT NULL,
  material_type TEXT NOT NULL DEFAULT 'raw', -- 'raw' | 'packaging'
  material_id TEXT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  manufacturer TEXT DEFAULT '-',
  distributor TEXT DEFAULT '-',
  delivery_note_number TEXT DEFAULT '-',
  purchase_order_number TEXT DEFAULT '-',
  po_number TEXT DEFAULT '-',
  supplier_batch_number TEXT DEFAULT '-',
  batch_number TEXT DEFAULT '-',
  internal_lot_number TEXT,
  received_date TEXT NOT NULL,
  expiration_date TEXT,
  expiry_date TEXT,
  retest_date TEXT,
  quantity_received REAL NOT NULL DEFAULT 0,
  current_quantity REAL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg',
  container_count INTEGER DEFAULT 1,
  container_type TEXT DEFAULT 'Drum / Zak',
  storage_location TEXT DEFAULT 'Gudang Karantina',
  storage_conditions TEXT,
  qc_status TEXT NOT NULL DEFAULT 'QUARANTINE',
  qc_parameters_count INTEGER DEFAULT 0,
  seal_condition TEXT,
  packaging_condition TEXT,
  coa_attachment TEXT,
  msds_attachment TEXT,
  halal_attachment TEXT,
  received_by TEXT DEFAULT 'Staf Gudang',
  received_by_nik TEXT,
  notes TEXT,
  revert_reason TEXT,
  reverted_by TEXT,
  reverted_at TEXT,
  actual_sample_size REAL,
  actual_sample_unit TEXT,
  sampled_containers TEXT,
  sampled_by TEXT,
  sampling_date_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grn_number ON warehouse_grn(grn_number);
CREATE INDEX IF NOT EXISTS idx_grn_material_code ON warehouse_grn(material_code);
CREATE INDEX IF NOT EXISTS idx_grn_material_type ON warehouse_grn(material_type);
CREATE INDEX IF NOT EXISTS idx_grn_qc_status ON warehouse_grn(qc_status);
CREATE INDEX IF NOT EXISTS idx_grn_internal_lot ON warehouse_grn(internal_lot_number);
CREATE INDEX IF NOT EXISTS idx_grn_created_at ON warehouse_grn(created_at);

-- 2. TABEL LAPORAN PENGAWASAN MUTU (QC INSPECTION REPORTS)
CREATE TABLE IF NOT EXISTS qc_inspection_reports (
  id TEXT PRIMARY KEY,
  grn_id TEXT,
  grn_number TEXT NOT NULL,
  report_number TEXT,
  lot_internal_number TEXT NOT NULL,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  material_type TEXT NOT NULL,
  batch_number TEXT,
  quantity_received REAL DEFAULT 0,
  unit TEXT DEFAULT 'kg',
  container_count INTEGER DEFAULT 1,
  container_type TEXT DEFAULT 'Drum / Zak',
  manufacturer TEXT,
  distributor TEXT,
  received_date TEXT,
  expiry_date TEXT,
  retest_date TEXT,
  storage_conditions TEXT,
  status TEXT NOT NULL DEFAULT 'QUARANTINE',
  decision TEXT,
  parameters_json TEXT DEFAULT '[]',
  sampling_plan_json TEXT DEFAULT '{}',
  sampled_containers TEXT,
  sampled_by TEXT,
  sampling_date_time TEXT,
  actual_sample_size REAL,
  actual_sample_unit TEXT,
  staff_decision TEXT,
  staff_notes TEXT,
  staff_signature_json TEXT DEFAULT '{}',
  qm_decision TEXT,
  qm_notes TEXT,
  qm_deviation_number TEXT,
  qm_signature_json TEXT DEFAULT '{}',
  ai_assessment TEXT,
  revert_reason TEXT,
  reverted_by TEXT,
  reverted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qc_lot_internal ON qc_inspection_reports(lot_internal_number);
CREATE INDEX IF NOT EXISTS idx_qc_grn_number ON qc_inspection_reports(grn_number);
CREATE INDEX IF NOT EXISTS idx_qc_status ON qc_inspection_reports(status);
CREATE INDEX IF NOT EXISTS idx_qc_material_code ON qc_inspection_reports(material_code);

-- 3. MASTER DATA BAHAN BAKU (RAW MATERIALS)
CREATE TABLE IF NOT EXISTS raw_materials (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  spec_number TEXT,
  name TEXT NOT NULL,
  chemical_name TEXT,
  category TEXT DEFAULT 'active',
  categories TEXT DEFAULT '[]',
  other_category_specification TEXT,
  storage_conditions TEXT,
  sds_doc_number TEXT,
  sds_file_url TEXT,
  sds_file_name TEXT,
  approved_substitutes TEXT DEFAULT '[]',
  manufacturer TEXT,
  qc_parameters TEXT DEFAULT '[]',
  supplier_lead_time_days INTEGER DEFAULT 14,
  reorder_point REAL DEFAULT 50.0,
  last_modified_by TEXT DEFAULT 'Staff RnD',
  last_modified_at TEXT DEFAULT (datetime('now')),
  inci_name TEXT,
  cas_number TEXT,
  function TEXT,
  standard_specs_json TEXT,
  qc_parameters_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_raw_code ON raw_materials(code);
CREATE INDEX IF NOT EXISTS idx_raw_name ON raw_materials(name);

-- 4. MASTER DATA BAHAN KEMAS (PACKAGING MATERIALS)
CREATE TABLE IF NOT EXISTS packaging_materials (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  spec_number TEXT,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'primary',
  unit TEXT DEFAULT 'Pcs',
  unit_capacity_grams REAL,
  supplier TEXT,
  manufacturer TEXT,
  storage_location TEXT,
  storage_conditions TEXT,
  qc_parameters TEXT DEFAULT '[]',
  reorder_point REAL DEFAULT 100.0,
  last_modified_by TEXT DEFAULT 'Staff RnD',
  last_modified_at TEXT DEFAULT (datetime('now')),
  category TEXT DEFAULT 'Primer',
  container_type TEXT,
  dimensions TEXT,
  standard_specs_json TEXT,
  qc_parameters_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_packaging_code ON packaging_materials(code);
CREATE INDEX IF NOT EXISTS idx_packaging_name ON packaging_materials(name);

-- 5. MASTER DATA PRODUK (PRODUCTS)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  brand TEXT DEFAULT 'Larassanti',
  exp_notification_date TEXT,
  category TEXT,
  description TEXT,
  unit TEXT DEFAULT 'pcs (Pieces)',
  storage_conditions TEXT,
  bpom_notification_number TEXT,
  bpom_na TEXT,
  qc_parameters TEXT DEFAULT '[]',
  finished_parameters TEXT DEFAULT '[]',
  volume REAL,
  variants_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);

-- 6. VARIAN PRODUK (PRODUCT VARIANTS)
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active',
  net_volume_grams REAL DEFAULT 0,
  bulk_formula_code TEXT,
  packaging_bom TEXT DEFAULT '[]',
  bpom_number TEXT,
  barcode TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);

-- 7. FORMULA RUAHAN (BULK FORMULATIONS)
CREATE TABLE IF NOT EXISTS bulk_formulations (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  product_id TEXT,
  product_code TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  version TEXT NOT NULL DEFAULT 'v1.0',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  bulk_quantity_kg REAL NOT NULL DEFAULT 100,
  purpose_description TEXT,
  ingredients TEXT NOT NULL DEFAULT '[]',
  ingredients_json TEXT DEFAULT '[]',
  mixing_instructions TEXT,
  manufacturing_procedure TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bulk_formulations_code ON bulk_formulations(code);
CREATE INDEX IF NOT EXISTS idx_bulk_formulations_product_code ON bulk_formulations(product_code);

-- 8. LAPORAN PENYIMPANGAN MUTU (DEVIATIONS)
CREATE TABLE IF NOT EXISTS deviations (
  id TEXT PRIMARY KEY,
  deviation_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT (date('now')),
  department TEXT NOT NULL DEFAULT 'production',
  target_departments TEXT DEFAULT '[]',
  severity TEXT NOT NULL DEFAULT 'MINOR',
  category TEXT NOT NULL DEFAULT 'PRODUCTION',
  batch_number TEXT,
  material_code TEXT,
  material_name TEXT,
  description TEXT,
  initiator_name TEXT,
  initiator_nik TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  impacts TEXT,
  root_cause TEXT,
  capa_actions TEXT,
  immediate_action TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  reported_by TEXT,
  assigned_to TEXT,
  approved_by TEXT,
  closed_at TEXT,
  closed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deviation_number ON deviations(deviation_number);
CREATE INDEX IF NOT EXISTS idx_deviation_status ON deviations(status);

-- 9. KARTU STOK GUDANG (STOCK MOVEMENTS)
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  material_id TEXT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  material_type TEXT NOT NULL DEFAULT 'raw',
  lot_internal_number TEXT,
  movement_type TEXT NOT NULL,
  reference_number TEXT,
  qty_before REAL DEFAULT 0,
  qty_change REAL NOT NULL DEFAULT 0,
  qty_after REAL DEFAULT 0,
  quantity REAL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg',
  performer_name TEXT,
  performer_role TEXT,
  performer_department TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_code ON stock_movements(material_code);
CREATE INDEX IF NOT EXISTS idx_stock_created_at ON stock_movements(created_at);

-- 10. USER PROFILES & CPKB ROLES
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  nik TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  permissions_json TEXT DEFAULT '[]',
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_nik ON profiles(nik);

-- 11. PENGUJIAN IN-PROCESS CONTROL (IPC BULK BATCHES)
CREATE TABLE IF NOT EXISTS ipc_bulk_batches (
  id TEXT PRIMARY KEY,
  batch_no TEXT NOT NULL UNIQUE,
  product_code TEXT,
  product_name TEXT NOT NULL,
  mixing_qty_kg REAL DEFAULT 100,
  mixing_date TEXT DEFAULT (date('now')),
  ph REAL DEFAULT 6.00,
  viscosity REAL DEFAULT 4000,
  appearance TEXT DEFAULT 'Homogen, Sesuai Spesifikasi Standard CPKB',
  gravity REAL DEFAULT 1.000,
  status TEXT NOT NULL DEFAULT 'TESTING',
  analyst TEXT DEFAULT 'Staf QC (IPC)',
  origin TEXT DEFAULT 'MANUAL_ENTRY',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipc_bulk_batch_no ON ipc_bulk_batches(batch_no);
CREATE INDEX IF NOT EXISTS idx_ipc_bulk_product_code ON ipc_bulk_batches(product_code);
CREATE INDEX IF NOT EXISTS idx_ipc_bulk_status ON ipc_bulk_batches(status);

-- 12. PENGUJIAN REWORK SEDIAAN (IPC REWORK BATCHES)
CREATE TABLE IF NOT EXISTS ipc_rework_batches (
  id TEXT PRIMARY KEY,
  original_batch_no TEXT NOT NULL,
  rework_batch_no TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  rework_reason TEXT,
  rework_date TEXT DEFAULT (date('now')),
  ph_test REAL,
  viscosity_test REAL,
  microbiology TEXT DEFAULT 'PENDING',
  status TEXT NOT NULL DEFAULT 'TESTING',
  authorized_by TEXT DEFAULT 'Diana Putri (QM)',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipc_rework_batch_no ON ipc_rework_batches(rework_batch_no);
