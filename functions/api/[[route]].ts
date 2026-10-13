/**
 * Cloudflare Pages Function: Universal REST API & SQL Proxy for Cloudflare D1
 * Route Pattern: /api/*
 * Zero Egress Bandwidth Fees - Direct Edge Execution
 */

interface Env {
  DB: D1Database;
}

interface EventContext {
  request: Request;
  env: Env;
  params: {
    route?: string[];
  };
}

const jsonResponse = (data: any, status = 200, headers: Record<string, string> = {}) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      ...headers,
    },
  });
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    },
  });
};

export const onRequest = async (context: EventContext) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return onRequestOptions();
  }

  if (!env.DB) {
    return jsonResponse(
      {
        error: 'Cloudflare D1 binding DB is not configured in Cloudflare Pages dashboard. Please bind D1 database as DB.',
      },
      500
    );
  }

  const pathname = url.pathname.replace(/^\/api\/?/, '');
  const segments = pathname.split('/').filter(Boolean);
  const resource = segments[0] || '';
  const subId = segments[1] || '';

  try {
    // 1. HEALTH CHECK
    if (resource === 'health') {
      const nowResult = await env.DB.prepare("SELECT datetime('now') as now").first();
      return jsonResponse({
        status: 'ok',
        serverTime: nowResult?.now,
        database: 'Cloudflare D1 (Edge)',
        persistentStorage: true,
        localStorageUsed: false,
      });
    }

    // 2. UNIVERSAL D1 SQL QUERY PROXY (/api/d1/query)
    if (resource === 'd1' && segments[1] === 'query') {
      const { sql, params = [] } = (await request.json()) as any;
      if (!sql) return jsonResponse({ error: 'Missing SQL query' }, 400);

      const trimmed = sql.trim();
      const isSelect = /^SELECT/i.test(trimmed) || /^PRAGMA/i.test(trimmed);

      const stmt = env.DB.prepare(sql).bind(...params);
      if (isSelect) {
        const queryRes = await stmt.all();
        return jsonResponse({
          success: true,
          results: queryRes.results || [],
          meta: queryRes.meta,
        });
      } else {
        const runRes = await stmt.run();
        return jsonResponse({
          success: true,
          results: [],
          meta: {
            changes: runRes.meta.changes,
            last_row_id: runRes.meta.last_row_id,
          },
        });
      }
    }

    // 3. WAREHOUSE GRN RECORDS (/api/grn)
    if (resource === 'grn' || (resource === 'warehouse' && segments[1] === 'grn')) {
      const id = resource === 'warehouse' ? segments[2] : subId;

      if (method === 'GET') {
        if (id) {
          const row = await env.DB.prepare('SELECT * FROM warehouse_grn WHERE id = ? OR grn_number = ?').bind(id, id).first();
          if (!row) return jsonResponse({ error: 'GRN not found' }, 404);
          return jsonResponse({ data: row });
        }

        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const pageSize = parseInt(url.searchParams.get('pageSize') || '25', 10);
        const materialType = url.searchParams.get('materialType');
        const status = url.searchParams.get('status');
        const search = url.searchParams.get('search')?.trim().toLowerCase();

        let whereClauses: string[] = ["grn_number != 'SYSTEM-STOCK-LEDGER'"];
        let bindParams: any[] = [];

        if (materialType && materialType !== 'all') {
          whereClauses.push('material_type = ?');
          bindParams.push(materialType);
        }

        if (status && status !== 'ALL') {
          if (status === 'PASSED' || status === 'RELEASED') {
            whereClauses.push("qc_status IN ('PASSED', 'RELEASED', 'PASSED_WITH_DEVIATION')");
          } else if (status === 'REVERTED_TO_WAREHOUSE') {
            whereClauses.push("(qc_status = 'REVERTED_TO_WAREHOUSE' OR notes LIKE '%REVERTED_TO_WAREHOUSE%')");
          } else if (status === 'QUARANTINE') {
            whereClauses.push("qc_status = 'QUARANTINE' AND notes NOT LIKE '%REVERTED_TO_WAREHOUSE%'");
          } else {
            whereClauses.push('qc_status = ?');
            bindParams.push(status);
          }
        }

        if (search) {
          whereClauses.push('(LOWER(grn_number) LIKE ? OR LOWER(material_code) LIKE ? OR LOWER(material_name) LIKE ? OR LOWER(distributor) LIKE ? OR LOWER(batch_number) LIKE ? OR LOWER(internal_lot_number) LIKE ?)');
          const sTerm = `%${search}%`;
          bindParams.push(sTerm, sTerm, sTerm, sTerm, sTerm, sTerm);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const countRow: any = await env.DB.prepare(`SELECT COUNT(*) as count FROM warehouse_grn ${whereSql}`).bind(...bindParams).first();
        const totalItems = countRow?.count || 0;
        const totalPages = Math.ceil(totalItems / pageSize) || 1;

        const offset = (page - 1) * pageSize;
        const dataRows = await env.DB.prepare(`SELECT * FROM warehouse_grn ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindParams, pageSize, offset).all();

        return jsonResponse({
          records: dataRows.results || [],
          totalItems,
          totalPages,
          page,
          pageSize,
        });
      }

      if (method === 'POST') {
        const body: any = await request.json();
        const newId = body.id || `grn-${Date.now()}`;
        const stmt = env.DB.prepare(`
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
        `).bind(
          newId, body.grn_number || body.grnNumber, body.material_type || body.materialType || 'raw',
          body.material_id || body.materialId || null, body.material_code || body.materialCode,
          body.material_name || body.materialName, body.manufacturer || '-', body.distributor || '-',
          body.delivery_note_number || body.deliveryNoteNumber || '-', body.purchase_order_number || body.po_number || body.poNumber || '-',
          body.po_number || body.poNumber || '-', body.supplier_batch_number || body.batch_number || body.batchNumber || '-',
          body.batch_number || body.batchNumber || '-', body.internal_lot_number || body.internalLotNumber || null,
          body.received_date || body.receivedDate || new Date().toISOString().slice(0, 10),
          body.expiration_date || body.expiry_date || body.expiryDate || null,
          body.expiry_date || body.expiryDate || null, body.retest_date || body.retestDate || null,
          Number(body.quantity_received || body.quantityReceived || 0),
          Number(body.current_quantity || body.currentQuantity || body.quantity_received || body.quantityReceived || 0),
          body.unit || 'kg', Number(body.container_count || body.containerCount || 1),
          body.container_type || body.containerType || 'Drum / Zak', body.storage_location || body.storageLocation || 'Gudang Karantina',
          body.storage_conditions || body.storageConditions || null, body.qc_status || body.qcStatus || 'QUARANTINE',
          Number(body.qc_parameters_count || body.qcParametersCount || 0), body.seal_condition || body.sealCondition || null,
          body.packaging_condition || body.packagingCondition || null, body.coa_attachment || body.coaAttachment || null,
          body.received_by || body.receivedBy || 'Staf Gudang', body.notes || null, body.revert_reason || body.revertReason || null,
          body.reverted_by || body.revertedBy || null, body.reverted_at || body.revertedAt || null,
          body.actual_sample_size || body.actualSampleSize || null, body.actual_sample_unit || body.actualSampleUnit || null,
          body.sampled_containers || body.sampledContainers || null, body.sampled_by || body.sampledBy || null,
          body.sampling_date_time || body.samplingDateTime || null
        );
        await stmt.run();
        return jsonResponse({ success: true, id: newId }, 201);
      }

      if (method === 'PATCH' || method === 'PUT') {
        const body: any = await request.json();
        const targetId = id || body.id;
        if (!targetId) return jsonResponse({ error: 'Missing GRN identifier' }, 400);

        let updates: string[] = ["updated_at = datetime('now')"];
        let bindParams: any[] = [];

        if (body.qc_status || body.qcStatus) {
          updates.push('qc_status = ?');
          bindParams.push(body.qc_status || body.qcStatus);
        }
        if (body.notes !== undefined) {
          updates.push('notes = ?');
          bindParams.push(body.notes);
        }
        if (body.current_quantity !== undefined || body.currentQuantity !== undefined) {
          updates.push('current_quantity = ?');
          bindParams.push(Number(body.current_quantity ?? body.currentQuantity));
        }

        bindParams.push(targetId, targetId);
        await env.DB.prepare(`UPDATE warehouse_grn SET ${updates.join(', ')} WHERE id = ? OR grn_number = ?`).bind(...bindParams).run();
        return jsonResponse({ success: true, id: targetId });
      }

      if (method === 'DELETE') {
        const targetId = id;
        if (!targetId) return jsonResponse({ error: 'Missing ID' }, 400);
        await env.DB.prepare('DELETE FROM warehouse_grn WHERE id = ? OR grn_number = ?').bind(targetId, targetId).run();
        return jsonResponse({ success: true, deleted: targetId });
      }
    }

    // 4. QC INSPECTION REPORTS (/api/qc)
    if (resource === 'qc') {
      const id = segments[2] || (segments[1] !== 'reports' ? segments[1] : '');

      if (method === 'GET') {
        if (id) {
          const row = await env.DB.prepare('SELECT * FROM qc_inspection_reports WHERE id = ? OR grn_number = ? OR lot_internal_number = ?').bind(id, id, id).first();
          if (!row) return jsonResponse({ error: 'QC Report not found' }, 404);
          return jsonResponse({ data: row });
        }

        const rows = await env.DB.prepare('SELECT * FROM qc_inspection_reports ORDER BY created_at DESC LIMIT 500').all();
        return jsonResponse({ data: rows.results || [] });
      }

      if (method === 'POST') {
        const b: any = await request.json();
        const newId = b.id || `qc-rep-${Date.now()}`;
        await env.DB.prepare(`
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
        `).bind(
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
        ).run();
        return jsonResponse({ success: true, id: newId }, 201);
      }
    }

    // 5. MASTER MATERIALS & PRODUCTS
    if (resource === 'raw-materials' || resource === 'materials') {
      const rows = await env.DB.prepare('SELECT * FROM raw_materials ORDER BY code ASC').all();
      return jsonResponse({ data: rows.results || [] });
    }
    if (resource === 'packaging-materials') {
      const rows = await env.DB.prepare('SELECT * FROM packaging_materials ORDER BY code ASC').all();
      return jsonResponse({ data: rows.results || [] });
    }
    if (resource === 'products') {
      const rows = await env.DB.prepare('SELECT * FROM products ORDER BY code ASC').all();
      return jsonResponse({ data: rows.results || [] });
    }
    if (resource === 'bulk-formulations' || resource === 'formulas') {
      const rows = await env.DB.prepare('SELECT * FROM bulk_formulations ORDER BY code ASC').all();
      return jsonResponse({ data: rows.results || [] });
    }
    if (resource === 'deviations') {
      const rows = await env.DB.prepare('SELECT * FROM deviations ORDER BY created_at DESC').all();
      return jsonResponse({ data: rows.results || [] });
    }
    if (resource === 'profiles') {
      const rows = await env.DB.prepare('SELECT id, nik, name, role, department, permissions_json, created_at, updated_at FROM profiles ORDER BY name ASC').all();
      return jsonResponse({ data: rows.results || [] });
    }

    return jsonResponse({ error: `Endpoint /api/${pathname} not found` }, 404);
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Server error executing D1 statement' }, 500);
  }
};
