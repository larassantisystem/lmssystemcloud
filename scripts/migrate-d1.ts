import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve(process.cwd(), 'data', 'cloudflare_config.json');
let config = { accountId: '', databaseId: '', apiToken: '' };
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

console.log('Migrating Cloudflare D1 database:', config.databaseId);

async function runQuery(sql: string, params: any[] = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data: any = await res.json();
  return data;
}

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

async function migrate() {
  for (const [table, cols] of Object.entries(tableDefinitions)) {
    console.log(`Checking columns for table: ${table}...`);
    const infoRes = await runQuery(`PRAGMA table_info(${table})`);
    if (!infoRes.success) {
      console.warn(`Table ${table} might not exist or failed:`, infoRes.errors);
      continue;
    }
    const existingCols = new Set((infoRes.result?.[0]?.results || []).map((r: any) => r.name));
    console.log(`Table ${table} has columns:`, Array.from(existingCols));

    for (const { col, type } of cols) {
      if (!existingCols.has(col)) {
        console.log(`Adding missing column ${col} to ${table}...`);
        const addRes = await runQuery(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
        if (addRes.success) {
          console.log(`✓ Added ${col} to ${table}`);
        } else {
          console.error(`✗ Failed to add ${col} to ${table}:`, addRes.errors);
        }
      }
    }
  }

  // Also sync products: code <-> product_code
  try {
    await runQuery("UPDATE products SET product_code = code WHERE (product_code IS NULL OR product_code = '') AND code IS NOT NULL;");
    await runQuery("UPDATE products SET code = product_code WHERE (code IS NULL OR code = '') AND product_code IS NOT NULL;");
  } catch (e) {}

  console.log('Migration completed successfully!');
}

migrate();
