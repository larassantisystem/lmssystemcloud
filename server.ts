import express, { Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
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
        { id: 'usr-admin', nik: 'admin', name: 'ADMIN', role: 'admin', department: 'admin', pass: 'laras123' },
        { id: 'usr-lms10001', nik: 'LMS10001', name: 'Daffa', role: 'staff', department: 'rnd', pass: 'laras123' },
        { id: 'usr-lms10002', nik: 'LMS10002', name: 'Tanzil', role: 'supervisor', department: 'rnd', pass: 'laras123' },
        { id: 'usr-lms10003', nik: 'LMS10003', name: 'Lanny', role: 'manager', department: 'rnd', pass: 'laras123' },
        { id: 'usr-lms20001', nik: 'LMS20001', name: 'Ayu', role: 'staff', department: 'quality', pass: 'laras123' },
        { id: 'usr-lms20002', nik: 'LMS20002', name: 'Lala', role: 'supervisor', department: 'quality', pass: 'laras123' },
        { id: 'usr-lms20003', nik: 'LMS20003', name: 'Michael', role: 'manager', department: 'quality', pass: 'laras123' },
        { id: 'usr-lms30001', nik: 'LMS30001', name: 'Heni', role: 'staff', department: 'warehouse', pass: 'laras123' },
        { id: 'usr-lms30002', nik: 'LMS30002', name: 'Maulana', role: 'supervisor', department: 'warehouse', pass: 'laras123' },
        { id: 'usr-lms30003', nik: 'LMS30003', name: 'Haryani', role: 'manager', department: 'warehouse', pass: 'laras123' }
      ];

      const insertStmt = db.prepare(`
        INSERT INTO profiles (id, nik, name, role, department, permissions_json, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const u of seedUsers) {
        insertStmt.run(u.id, u.nik, u.name, u.role, u.department, JSON.stringify([]), u.pass);
      }
      console.log(`[Cloudflare D1 Engine] Successfully seeded ${seedUsers.length} profiles into D1.`);
    }
  } catch (err) {
    console.error('[Cloudflare D1 Engine] Schema execution failed:', err);
  }
}

// Helper for Cloudflare D1 HTTP API forwarding if credentials provided
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_DATABASE_ID = process.env.CLOUDFLARE_DATABASE_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const isRemoteCloudflareConfigured = Boolean(CF_ACCOUNT_ID && CF_DATABASE_ID && CF_API_TOKEN);

async function executeD1Query(sql: string, params: any[] = []): Promise<{ results: any[]; changes?: number; lastInsertRowid?: number }> {
  if (isRemoteCloudflareConfigured) {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`;
    const res = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
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

// -------------------------------------------------------------
// API ROUTES (Zero localStorage - 100% Real Database Persistence)
// -------------------------------------------------------------

// Health Check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const row = await executeD1Query("SELECT datetime('now') as now");
    res.json({
      status: 'ok',
      engine: isRemoteCloudflareConfigured ? 'Cloudflare D1 Cloud Network' : 'Cloudflare D1 SQLite Engine',
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
