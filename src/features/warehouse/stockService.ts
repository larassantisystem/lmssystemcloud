import {
  MaterialStockSummary,
  StockLotItem,
  StockMovementLedger,
  StockDeductionPayload,
  StockOpnamePayload,
  MaterialStockType,
} from './types/stockTypes';
import { GrnQcStatus } from './types/grnTypes';
import { warehouseService } from './warehouseService';
import { qualityService } from '../quality/qualityService';
import { materialService } from '../rnd/materials/materialService';
import { packagingService } from '../rnd/materials/packagingService';
import { normalizeLotNumber } from '../quality/utils/qcNumbering';
import { formatToIsoDateString } from '../../core/utils/dateUtils';
import { supabase, isSupabaseConfigured } from '../../core/auth/supabaseClient';

// In-memory runtime cache untuk efisiensi EGRESS Supabase (BUKAN local storage)
let inMemoryMovementLedger: StockMovementLedger[] = [];
let lastMovementLedgerFetchTime = 0;
const MOVEMENT_CACHE_TTL_MS = 30 * 1000; // 30 detik cache di RAM

export const stockService = {
  invalidateStockCache: () => {
    lastMovementLedgerFetchTime = 0;
  },
  /**
   * Simpan riwayat mutasi stok ke tabel public.stock_movements di Supabase (Opsi 2)
   */
  saveStockMovement: async (movement: StockMovementLedger): Promise<void> => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const payload: Record<string, any> = {
        timestamp: movement.timestamp || new Date().toISOString(),
        material_code: movement.materialCode,
        material_name: movement.materialName,
        material_type: movement.materialType || 'raw',
        lot_internal_number: movement.lotInternalNumber,
        movement_type: movement.movementType,
        reference_number: movement.referenceNumber || '-',
        qty_before: Number(movement.qtyBefore) || 0,
        qty_change: Number(movement.qtyChange) || 0,
        qty_after: Number(movement.qtyAfter) || 0,
        unit: movement.unit || 'kg',
        performer_name: movement.performer?.name || 'Petugas Gudang',
        performer_role: movement.performer?.role || 'Staff Gudang',
        performer_department: movement.performer?.department || 'Warehouse',
        notes: movement.notes || '',
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('stock_movements').insert(payload);
      if (error) {
        console.warn('[stockService] Supabase stock_movements notice:', error.message);
      } else {
        lastMovementLedgerFetchTime = 0; // Invalidate cache
        console.log('[stockService] Stock movement logged to Supabase:', movement.referenceNumber);
      }
    } catch (err) {
      console.warn('[stockService] Exception logging movement to Supabase:', err);
    }
  },
  /**
   * Get all active stock lots and synchronize with latest GRNs and QC inspection states
   */
  getStockLots: async (): Promise<StockLotItem[]> => {
    // Fast resolution: Gunakan local in-memory master materials terlebih dahulu untuk mencegah download 1.84MB berulang kali
    let rawMaterials = materialService.getLocalMaterials();
    let packMaterials = packagingService.getLocalPackagingMaterials();

    const masterPromises: Promise<any>[] = [];
    if (rawMaterials.length === 0) {
      masterPromises.push(materialService.getMaterials().then(res => { rawMaterials = res; }).catch(() => []));
    }
    if (packMaterials.length === 0) {
      masterPromises.push(packagingService.getPackagingMaterials().then(res => { packMaterials = res; }).catch(() => []));
    }

    // Fetch GRNs and QC Reports
    const [grns, qcReports] = await Promise.all([
      warehouseService.getGrnRecords(),
      qualityService.getReports(),
      ...masterPromises,
    ]);

    const rawMap = new Map<string, string>();
    rawMaterials.forEach((r) => {
      if (r.code && r.name) {
        rawMap.set(r.code.trim().toUpperCase(), r.name);
        if (r.id) rawMap.set(r.id.trim().toUpperCase(), r.name);
      }
    });

    const packMap = new Map<string, string>();
    packMaterials.forEach((p) => {
      if (p.code && p.name) {
        packMap.set(p.code.trim().toUpperCase(), p.name);
        if (p.id) packMap.set(p.id.trim().toUpperCase(), p.name);
      }
    });

    const storedLots: StockLotItem[] = grns.map((grn) => {
      const qcReport = qcReports.find((r) => r.grnId === grn.id || r.grnNumber === grn.grnNumber);

      // Determine QC status and Lot Internal Number
      let currentQcStatus: GrnQcStatus = grn.qcStatus || 'QUARANTINE';
      let lotInternal = '';
      let releasedDate: string | undefined;

      // Automatically map initial stock records to RELEASED
      if (grn.grnNumber && grn.grnNumber.startsWith('SA-OPN-')) {
        currentQcStatus = 'RELEASED';
        lotInternal = grn.internalLotNumber || grn.qcPayload?.lotInternalNumber || 'STK-AWAL';
        releasedDate = grn.receivedDate;
      } else if (qcReport) {
        if (qcReport.status === 'PASSED' || qcReport.status === 'PASSED_WITH_DEVIATION') {
          currentQcStatus = 'RELEASED';
        } else if (qcReport.status === 'REJECTED') {
          currentQcStatus = 'REJECTED';
        } else {
          currentQcStatus = 'QUARANTINE';
        }
        if (qcReport.lotInternalNumber) {
          lotInternal = normalizeLotNumber(qcReport.lotInternalNumber);
        }
        if (qcReport.qmSignature?.signedAt) {
          releasedDate = qcReport.qmSignature.signedAt;
        }
      }

      if (!lotInternal) {
        if (grn.grnNumber && grn.grnNumber.startsWith('GRN-OPNAME-')) {
            lotInternal = grn.internalLotNumber || grn.qcPayload?.lotInternalNumber || `STK-${grn.grnNumber.slice(-6)}`;
        } else {
            const prefix = grn.materialType === 'raw' ? 'LBB' : 'LBK';
            const numPart = grn.grnNumber.replace(/[^0-9]/g, '').slice(-6) || '260901';
            lotInternal = normalizeLotNumber(`${prefix}${numPart}`);
        }
      }

      const initialQty = grn.quantityReceived;
      // Extract current quantity from grn.currentQuantity, then qcPayload, else fallback to initial
      const currentQty = grn.currentQuantity !== undefined
        ? grn.currentQuantity
        : (grn.qcPayload?.currentQuantity !== undefined
            ? grn.qcPayload.currentQuantity
            : initialQty);

      // Determine storage location based on state and grn record
      let storageLocation = grn.storageLocation;
      if (!storageLocation) {
        if (currentQcStatus === 'RELEASED') {
          storageLocation = grn.materialType === 'raw' ? 'Gudang Bahan Baku (Rak Rilis A-01)' : 'Gudang Bahan Kemas (Rak Rilis K-01)';
        } else if (currentQcStatus === 'REJECTED') {
          storageLocation = 'Area Reject & Retur Vendor (Ruang B)';
        } else {
          storageLocation = grn.materialType === 'raw' ? 'Rak BB-01 (Karantina)' : 'Area BK-01 (Karantina)';
        }
      }

      // Resolve real material name if missing or equal to material code
      let resolvedMaterialName = grn.materialName;
      const cleanCode = grn.materialCode?.trim().toUpperCase();
      if (!resolvedMaterialName || resolvedMaterialName.trim().toUpperCase() === cleanCode) {
        if (grn.materialType === 'raw' && cleanCode && rawMap.has(cleanCode)) {
          resolvedMaterialName = rawMap.get(cleanCode)!;
        } else if (grn.materialType === 'packaging' && cleanCode && packMap.has(cleanCode)) {
          resolvedMaterialName = packMap.get(cleanCode)!;
        }
      }

      return {
        id: `lot-${grn.id}`,
        lotInternalNumber: lotInternal,
        grnNumber: grn.grnNumber,
        grnId: grn.id,
        materialCode: grn.materialCode,
        materialName: resolvedMaterialName || grn.materialCode,
        materialType: grn.materialType,
        batchNumberVendor: grn.batchNumber || 'N/A',
        manufacturer: grn.manufacturer,
        distributor: grn.distributor,
        receivedDate: grn.receivedDate,
        expiryDate: grn.expiryDate || '2028-09-03',
        initialQuantity: initialQty,
        currentQuantity: currentQty,
        unit: grn.unit,
        containerCount: grn.containerCount,
        containerType: grn.containerType,
        storageLocation: storageLocation,
        qcStatus: currentQcStatus as any,
        qcReportId: qcReport?.id,
        releasedDate: releasedDate,
      };
    });

    return storedLots;
  },

  /**
   * Get Summaries for a specific material type ('raw' | 'packaging')
   */
  getStockSummaries: async (materialType: MaterialStockType): Promise<MaterialStockSummary[]> => {
    const lots = await stockService.getStockLots();

    if (materialType === 'raw') {
      const rawMaterials = await materialService.getMaterials();
      return rawMaterials.map((rm) => {
        const materialLots = lots.filter(
          (l) => l.materialType === 'raw' && (l.materialCode === rm.code || l.materialName.toLowerCase() === rm.name.toLowerCase())
        );

        let stockReleased = 0;
        let stockQuarantine = 0;
        let stockRejected = 0;

        materialLots.forEach((lot) => {
          if (lot.qcStatus === 'RELEASED' || lot.qcStatus === 'RELEASE_DEVIATION' || (lot.qcStatus as any) === 'PASSED') {
            stockReleased += lot.currentQuantity;
          } else if (lot.qcStatus === 'QUARANTINE' || (lot.qcStatus as any) === 'TESTING' || (lot.qcStatus as any) === 'AWAITING_APPROVAL') {
            stockQuarantine += lot.currentQuantity;
          } else if (lot.qcStatus === 'REJECTED') {
            stockRejected += lot.currentQuantity;
          }
        });

        const totalAccumulated = stockReleased + stockQuarantine + stockRejected;

        return {
          id: rm.id,
          materialCode: rm.code,
          materialName: rm.name,
          materialType: 'raw',
          category: rm.category || (rm.categories && rm.categories[0]) || 'Raw Material',
          storageLocation: 'Gudang Bahan Baku (Rak A)',
          storageConditions: rm.storageConditions || 'Suhu Ruang Terkendali (15 - 25°C)',
          unit: 'kg',
          stockReleased,
          stockQuarantine,
          stockRejected,
          totalAccumulated,
          minimumStock: rm.reorderPoint ?? 50,
          lots: materialLots,
        };
      });
    } else {
      const packagingMaterials = await packagingService.getPackagingMaterials();
      return packagingMaterials.map((pm) => {
        const materialLots = lots.filter(
          (l) => l.materialType === 'packaging' && (l.materialCode === pm.code || l.materialName.toLowerCase() === pm.name.toLowerCase())
        );

        let stockReleased = 0;
        let stockQuarantine = 0;
        let stockRejected = 0;

        materialLots.forEach((lot) => {
          if (lot.qcStatus === 'RELEASED' || lot.qcStatus === 'RELEASE_DEVIATION' || (lot.qcStatus as any) === 'PASSED') {
            stockReleased += lot.currentQuantity;
          } else if (lot.qcStatus === 'QUARANTINE' || (lot.qcStatus as any) === 'TESTING' || (lot.qcStatus as any) === 'AWAITING_APPROVAL') {
            stockQuarantine += lot.currentQuantity;
          } else if (lot.qcStatus === 'REJECTED') {
            stockRejected += lot.currentQuantity;
          }
        });

        const totalAccumulated = stockReleased + stockQuarantine + stockRejected;

        return {
          id: pm.id,
          materialCode: pm.code,
          materialName: pm.name,
          materialType: 'packaging',
          category: pm.type ? `${pm.type.toUpperCase()} PACKAGING` : 'Packaging',
          storageLocation: pm.storageLocation || 'Gudang Bahan Kemas (Area BK)',
          storageConditions: pm.storageConditions || 'Suhu Ruang Terkendali (15 - 25°C)',
          unit: pm.unit || 'pcs',
          stockReleased,
          stockQuarantine,
          stockRejected,
          totalAccumulated,
          minimumStock: pm.reorderPoint ?? 100,
          lots: materialLots,
        };
      });
    }
  },

  /**
   * Get Stock Ledger movement history (Prioritas: tabel public.stock_movements Supabase Opsi 2)
   */
  getMovementLedger: async (forceRefresh = false): Promise<StockMovementLedger[]> => {
    const isCacheValid = !forceRefresh && inMemoryMovementLedger.length > 0 && (Date.now() - lastMovementLedgerFetchTime < MOVEMENT_CACHE_TTL_MS);
    if (isCacheValid) {
      return inMemoryMovementLedger;
    }

    let movements: StockMovementLedger[] = [];
    const seenSignatures = new Set<string>();
    const seenIds = new Set<string>();

    const getSignature = (m: Partial<StockMovementLedger>): string => {
      const lot = (m.lotInternalNumber || '').trim().toUpperCase();
      const ref = (m.referenceNumber || '').trim().toUpperCase();
      const type = (m.movementType || '').trim();
      const change = Number(m.qtyChange ?? 0).toFixed(3);
      // Cocokkan hingga level menit untuk menghindari duplikasi lintas ID
      const timeMinute = (m.timestamp || '').slice(0, 16);
      return `${lot}|${ref}|${type}|${change}|${timeMinute}`;
    };

    // 1. Kueri dari tabel public.stock_movements di Supabase (Opsi 2 - Single Source of Truth Cloud)
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('stock_movements')
          .select('id, timestamp, material_code, material_name, material_type, lot_internal_number, movement_type, reference_number, qty_before, qty_change, qty_after, unit, performer_name, performer_role, performer_department, notes, created_at')
          .order('timestamp', { ascending: false })
          .limit(150);

        if (!error && data && data.length > 0) {
          for (const d of data) {
            const mappedItem: StockMovementLedger = {
              id: d.id,
              timestamp: d.timestamp || d.created_at,
              materialCode: d.material_code,
              materialName: d.material_name,
              materialType: (d.material_type || 'raw') as MaterialStockType,
              lotInternalNumber: d.lot_internal_number,
              movementType: d.movement_type as any,
              referenceNumber: d.reference_number || '-',
              qtyBefore: Number(d.qty_before) || 0,
              qtyChange: Number(d.qty_change) || 0,
              qtyAfter: Number(d.qty_after) || 0,
              unit: d.unit || 'kg',
              performer: {
                name: d.performer_name || 'Petugas Gudang',
                role: d.performer_role || 'Staff Gudang',
                department: d.performer_department || 'Warehouse',
              },
              notes: d.notes || '',
            };

            const sig = getSignature(mappedItem);
            if (!seenIds.has(mappedItem.id) && !seenSignatures.has(sig)) {
              movements.push(mappedItem);
              seenIds.add(mappedItem.id);
              seenSignatures.add(sig);
            }
          }
        }
      } catch (err) {
        console.warn('[stockService] Could not fetch from stock_movements:', err);
      }
    }

    // 2. Fallback / Merge dengan qcPayload.stockLedger pada GRN (Hanya jika belum ada di cloud ledger)
    const grns = await warehouseService.getGrnRecords();
    const grnLedger: StockMovementLedger[] = [];
    grns.forEach((grn) => {
      if (grn.qcPayload?.stockLedger && Array.isArray(grn.qcPayload.stockLedger)) {
        grnLedger.push(...grn.qcPayload.stockLedger);
      }
    });

    for (const item of grnLedger) {
      const sig = getSignature(item);
      if (!seenIds.has(item.id) && !seenSignatures.has(sig)) {
        movements.push(item);
        seenIds.add(item.id);
        seenSignatures.add(sig);
      }
    }

    const sorted = movements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    inMemoryMovementLedger = sorted;
    lastMovementLedgerFetchTime = Date.now();
    return sorted;
  },

  /**
   * Deduct stock for production work order / SPK
   */
  deductStock: async (payload: StockDeductionPayload): Promise<boolean> => {
    const grns = await warehouseService.getGrnRecords();
    const targetLotNormalized = normalizeLotNumber(payload.lotInternalNumber);
    const targetGrn = grns.find((g) => {
      const qcReport = g.qcPayload;
      const lotInternal = qcReport?.lotInternalNumber || g.internalLotNumber;
      return (
        lotInternal === payload.lotInternalNumber ||
        (lotInternal && normalizeLotNumber(lotInternal) === targetLotNormalized)
      );
    });

    if (!targetGrn) {
      throw new Error(`Nomor Lot ${payload.lotInternalNumber} tidak ditemukan.`);
    }

    const currentQty = targetGrn.currentQuantity !== undefined
      ? targetGrn.currentQuantity
      : (targetGrn.qcPayload?.currentQuantity !== undefined
          ? targetGrn.qcPayload.currentQuantity
          : targetGrn.quantityReceived);

    if (currentQty < payload.deductQuantity) {
      throw new Error(
        `Saldo stok tidak mencukupi! Tersedia: ${currentQty} ${targetGrn.unit}, Diminta: ${payload.deductQuantity} ${payload.unit}`
      );
    }

    const qtyBefore = currentQty;
    const qtyChange = -payload.deductQuantity;
    const qtyAfter = qtyBefore + qtyChange;

    const newLog: StockMovementLedger = {
      id: `led-${Date.now()}`,
      timestamp: new Date().toISOString(),
      materialCode: payload.materialCode,
      materialName: targetGrn.materialName,
      materialType: targetGrn.materialType,
      lotInternalNumber: payload.lotInternalNumber,
      movementType: 'OUT_PRODUCTION_SPK',
      referenceNumber: payload.spkNumber || `SPK-${Date.now().toString().slice(-4)}`,
      qtyBefore,
      qtyChange,
      qtyAfter,
      unit: payload.unit,
      performer: {
        name: payload.performerName || 'Operator Timbang',
        role: 'Operator Penimbangan',
        department: 'Warehouse / Produksi',
      },
      notes: payload.notes || `Pengeluaran bahan untuk batch ${payload.batchTarget}`,
    };

    const existingQcPayload = targetGrn.qcPayload || { status: targetGrn.qcStatus || 'QUARANTINE' };
    const updatedQcPayload = {
      ...existingQcPayload,
      currentQuantity: qtyAfter,
      stockLedger: [newLog, ...(existingQcPayload.stockLedger || [])],
    };

    await warehouseService.updateGrnRecord(targetGrn.id, {
      currentQuantity: qtyAfter,
      qcPayload: updatedQcPayload,
    });

    // Simpan juga ke tabel public.stock_movements di Supabase (Opsi 2)
    await stockService.saveStockMovement(newLog);

    return true;
  },

  /**
   * Helper to create virtual GRN for new stock opname lot
   */
  createVirtualOpnameGrn: async (params: {
    materialCode: string;
    materialName: string;
    materialType: 'raw' | 'packaging';
    targetLotNumber: string;
    actualQuantity: number;
    unit: string;
    reason: string;
    auditorName: string;
    todayStr: string;
    isInitialStock?: boolean;
    initialStockExpiryDate?: string;
  }) => {
    const {
      materialCode,
      materialName,
      materialType,
      targetLotNumber,
      actualQuantity,
      unit,
      reason,
      auditorName,
      todayStr,
      isInitialStock,
      initialStockExpiryDate,
    } = params;

    const newLog: StockMovementLedger = {
      id: `led-opn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      materialCode,
      materialName,
      materialType,
      lotInternalNumber: targetLotNumber,
      movementType: 'OPNAME_ADJUSTMENT',
      referenceNumber: `OPNAME-${todayStr}`,
      qtyBefore: 0,
      qtyChange: actualQuantity,
      qtyAfter: actualQuantity,
      unit: unit || (materialType === 'raw' ? 'kg' : 'pcs'),
      performer: {
        name: auditorName || 'Auditor Gudang',
        role: 'Auditor Stock Opname',
        department: 'Warehouse / QA',
      },
      notes: `Penyesuaian Fisik Opname (Lot Baru): ${reason}`,
    };

    let expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (isInitialStock && initialStockExpiryDate) {
      expiry = formatToIsoDateString(initialStockExpiryDate, expiry);
    }

    const virtualGrn = {
      id: `grn-opname-${Date.now()}`,
      grnNumber: isInitialStock ? `SA-OPN-${todayStr}-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : `GRN-OPNAME-${todayStr}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      receivedDate: new Date().toISOString().slice(0, 10), // Always today to force FIFO priority if it's the first
      materialCode,
      materialName,
      materialType,
      quantityReceived: actualQuantity,
      unit: unit || (materialType === 'raw' ? 'kg' : 'pcs'),
      containerCount: 1,
      containerType: 'Koli',
      storageLocation: materialType === 'raw' ? 'Gudang Utama BB (Penyesuaian Opname)' : 'Gudang Utama BK (Penyesuaian Opname)',
      qcStatus: 'RELEASED',
      internalLotNumber: targetLotNumber,
      batchNumber: isInitialStock ? 'STK-AWAL' : 'STK-OPNAME',
      manufacturer: isInitialStock ? 'Saldo Awal / Mixed Lot' : 'Stock Opname Adjustment',
      distributor: 'Internal',
      expiryDate: expiry,
      qcPayload: {
        status: 'PASSED',
        lotInternalNumber: targetLotNumber,
        currentQuantity: actualQuantity,
        stockLedger: [newLog],
      },
    };

    await warehouseService.saveGrnRecord(virtualGrn as any);
    await stockService.saveStockMovement(newLog);
  },

  /**
   * Adjust stock via Stock Opname
   */
  adjustStockOpname: async (payload: StockOpnamePayload): Promise<boolean> => {
    const grns = await warehouseService.getGrnRecords();
    const todayStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const defaultStkLotName = `STK-${todayStr}`;

    const cleanCode = payload.materialCode.trim().toUpperCase();
    const materialType: 'raw' | 'packaging' = cleanCode.startsWith('B') ? 'raw' : 'packaging';

    // Lookup real material name from payload, master list, or existing GRNs
    let materialName = payload.materialName?.trim();
    if (!materialName || materialName.trim().toUpperCase() === cleanCode) {
      try {
        if (materialType === 'raw') {
          const rms = await materialService.getMaterials();
          const found = rms.find((r) => 
            r.code?.trim().toUpperCase() === cleanCode ||
            r.id?.trim().toUpperCase() === cleanCode
          );
          if (found) materialName = found.name;
        } else {
          const pms = await packagingService.getPackagingMaterials();
          const found = pms.find((p) => 
            p.code?.trim().toUpperCase() === cleanCode ||
            p.id?.trim().toUpperCase() === cleanCode
          );
          if (found) materialName = found.name;
        }
      } catch (e) {
        // Fallback
      }
    }

    if (!materialName || materialName.trim().toUpperCase() === cleanCode) {
      const existingWithName = grns.find(
        (g) => g.materialCode?.trim().toUpperCase() === cleanCode && g.materialName && g.materialName.trim().toUpperCase() !== cleanCode
      );
      if (existingWithName) {
        materialName = existingWithName.materialName;
      }
    }

    if (!materialName) {
      materialName = cleanCode;
    }

    let targetLotNumber = payload.lotInternalNumber?.trim();
    const isSpecificLot = Boolean(
      targetLotNumber &&
      targetLotNumber !== 'AUTO' &&
      targetLotNumber !== 'STK' &&
      targetLotNumber !== ''
    );

    if (!targetLotNumber || targetLotNumber === 'AUTO' || targetLotNumber === 'STK') {
      targetLotNumber = defaultStkLotName;
    }

    const targetLotNormalized = normalizeLotNumber(targetLotNumber);

    // Filter all GRNs for this material
    const materialGrns = grns.filter((g) => g.materialCode?.trim().toUpperCase() === cleanCode);

    if (payload.isInitialStock) {
      // Force creation of a new virtual GRN for initial / mixed stock
      await stockService.createVirtualOpnameGrn({
        materialCode: cleanCode,
        materialName,
        materialType,
        targetLotNumber,
        actualQuantity: payload.actualQuantity,
        unit: payload.unit,
        reason: payload.reason,
        auditorName: payload.auditorName,
        todayStr,
        isInitialStock: true,
        initialStockExpiryDate: payload.initialStockExpiryDate,
      });
      return true;
    }

    if (isSpecificLot) {
      // Adjust a specific lot
      const targetGrn = materialGrns.find((g) => {
        const qcReport = g.qcPayload;
        const lotInternal = qcReport?.lotInternalNumber || g.internalLotNumber;
        return (
          lotInternal === targetLotNumber ||
          (lotInternal && normalizeLotNumber(lotInternal) === targetLotNormalized)
        );
      });

      if (targetGrn) {
        const qtyBefore = targetGrn.qcPayload?.currentQuantity !== undefined
          ? targetGrn.qcPayload.currentQuantity
          : targetGrn.quantityReceived;
        const qtyAfter = payload.actualQuantity;
        const qtyChange = qtyAfter - qtyBefore;

        const newLog: StockMovementLedger = {
          id: `led-opn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          materialCode: cleanCode,
          materialName: targetGrn.materialName || materialName,
          materialType,
          lotInternalNumber: targetLotNumber,
          movementType: 'OPNAME_ADJUSTMENT',
          referenceNumber: `OPNAME-${todayStr}`,
          qtyBefore,
          qtyChange,
          qtyAfter,
          unit: payload.unit || targetGrn.unit || 'kg',
          performer: {
            name: payload.auditorName || 'Auditor Gudang',
            role: 'Auditor Stock Opname',
            department: 'Warehouse / QA',
          },
          notes: `Penyesuaian Fisik Opname (Lot ${targetLotNumber}): ${payload.reason}`,
        };

        const existingQcPayload = targetGrn.qcPayload || { status: targetGrn.qcStatus || 'RELEASED' };
        const updatedQcPayload = {
          ...existingQcPayload,
          currentQuantity: qtyAfter,
          stockLedger: [newLog, ...(existingQcPayload.stockLedger || [])],
        };

        await warehouseService.updateGrnRecord(targetGrn.id, {
          qcPayload: updatedQcPayload,
        });
        await stockService.saveStockMovement(newLog);
      } else {
        // Create new virtual GRN for specific lot
        await stockService.createVirtualOpnameGrn({
          materialCode: cleanCode,
          materialName,
          materialType,
          targetLotNumber,
          actualQuantity: payload.actualQuantity,
          unit: payload.unit,
          reason: payload.reason,
          auditorName: payload.auditorName,
          todayStr,
        });
      }
    } else {
      // General stock opname for material (no specific lot specified)
      // Find all RELEASED GRNs for this material
      const releasedGrns = materialGrns.filter((g) => {
        const status = g.qcPayload?.status || g.qcStatus;
        return status === 'RELEASED' || status === 'RELEASE_DEVIATION' || status === 'PASSED';
      });

      if (releasedGrns.length > 0) {
        // Find existing STK lot or pick the first active RELEASED GRN
        const targetGrn = releasedGrns.find((g) => {
          const lot = g.qcPayload?.lotInternalNumber || g.internalLotNumber || '';
          return lot.startsWith('STK-');
        }) || releasedGrns[0];

        // Other released GRNs (excluding targetGrn)
        const otherGrns = releasedGrns.filter((g) => g.id !== targetGrn.id);
        const otherLotsTotal = otherGrns.reduce((acc, g) => {
          const q = g.qcPayload?.currentQuantity !== undefined ? g.qcPayload.currentQuantity : g.quantityReceived;
          return acc + (Number(q) || 0);
        }, 0);

        const qtyBefore = targetGrn.qcPayload?.currentQuantity !== undefined
          ? targetGrn.qcPayload.currentQuantity
          : targetGrn.quantityReceived;

        // Calculate target GRN's new quantity so total stock equals payload.actualQuantity
        let targetQty = Math.max(0, payload.actualQuantity - otherLotsTotal);
        let remainingNeededToDeduct = payload.actualQuantity < otherLotsTotal ? (otherLotsTotal - payload.actualQuantity) : 0;

        // If actualQuantity < otherLotsTotal, set target GRN to 0 and deduct from other GRNs if needed
        if (remainingNeededToDeduct > 0) {
          targetQty = 0;
          for (const g of otherGrns) {
            if (remainingNeededToDeduct <= 0) break;
            const currentQ = g.qcPayload?.currentQuantity !== undefined ? g.qcPayload.currentQuantity : g.quantityReceived;
            const deduct = Math.min(currentQ, remainingNeededToDeduct);
            const newQ = currentQ - deduct;
            remainingNeededToDeduct -= deduct;

            const existingQc = g.qcPayload || { status: g.qcStatus || 'RELEASED' };
            const grnLot = existingQc.lotInternalNumber || g.internalLotNumber || defaultStkLotName;
            const log: StockMovementLedger = {
              id: `led-opn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toISOString(),
              materialCode: cleanCode,
              materialName: g.materialName || materialName,
              materialType,
              lotInternalNumber: grnLot,
              movementType: 'OPNAME_ADJUSTMENT',
              referenceNumber: `OPNAME-${todayStr}`,
              qtyBefore: currentQ,
              qtyChange: -deduct,
              qtyAfter: newQ,
              unit: payload.unit || g.unit || 'kg',
              performer: {
                name: payload.auditorName || 'Auditor Gudang',
                role: 'Auditor Stock Opname',
                department: 'Warehouse / QA',
              },
              notes: `Penyesuaian Fisik Opname (Penyesuaian Total Stock): ${payload.reason}`,
            };

            await warehouseService.updateGrnRecord(g.id, {
              currentQuantity: newQ,
              qcPayload: {
                ...existingQc,
                currentQuantity: newQ,
                stockLedger: [log, ...(existingQc.stockLedger || [])],
              },
            });
            await stockService.saveStockMovement(log);
          }
        }

        const qtyChange = targetQty - qtyBefore;
        const targetLot = targetGrn.qcPayload?.lotInternalNumber || targetGrn.internalLotNumber || defaultStkLotName;

        const newLog: StockMovementLedger = {
          id: `led-opn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          materialCode: cleanCode,
          materialName: targetGrn.materialName || materialName,
          materialType,
          lotInternalNumber: targetLot,
          movementType: 'OPNAME_ADJUSTMENT',
          referenceNumber: `OPNAME-${todayStr}`,
          qtyBefore,
          qtyChange,
          qtyAfter: targetQty,
          unit: payload.unit || targetGrn.unit || 'kg',
          performer: {
            name: payload.auditorName || 'Auditor Gudang',
            role: 'Auditor Stock Opname',
            department: 'Warehouse / QA',
          },
          notes: `Penyesuaian Fisik Opname: ${payload.reason}`,
        };

        const existingQcPayload = targetGrn.qcPayload || { status: targetGrn.qcStatus || 'RELEASED' };
        const updatedQcPayload = {
          ...existingQcPayload,
          currentQuantity: targetQty,
          stockLedger: [newLog, ...(existingQcPayload.stockLedger || [])],
        };

        await warehouseService.updateGrnRecord(targetGrn.id, {
          currentQuantity: targetQty,
          qcPayload: updatedQcPayload,
        });
        await stockService.saveStockMovement(newLog);
      } else {
        // No RELEASED GRNs exist for this material -> create new virtual GRN
        await stockService.createVirtualOpnameGrn({
          materialCode: cleanCode,
          materialName,
          materialType,
          targetLotNumber: defaultStkLotName,
          actualQuantity: payload.actualQuantity,
          unit: payload.unit,
          reason: payload.reason,
          auditorName: payload.auditorName,
          todayStr,
        });
      }
    }

    return true;
  },

  /**
   * Batch adjust stock opname from Excel rows
   */
  batchAdjustStockOpname: async (
    items: Array<{
      materialCode: string;
      actualQuantity: number;
      reason?: string;
      unit?: string;
      lotInternalNumber?: string;
      isInitialStock?: boolean;
      initialStockExpiryDate?: string;
    }>,
    auditorName: string = 'Auditor Excel Opname'
  ): Promise<{ successCount: number; errors: string[] }> => {
    let successCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        if (!item.materialCode) continue;
        await stockService.adjustStockOpname({
          materialCode: item.materialCode.trim(),
          lotInternalNumber: item.lotInternalNumber?.trim(),
          actualQuantity: item.actualQuantity,
          reason: item.reason || 'Impor Batch Stock Opname Excel',
          unit: item.unit || 'kg',
          auditorName,
          isInitialStock: item.isInitialStock,
          initialStockExpiryDate: item.initialStockExpiryDate,
        });
        successCount++;
      } catch (err: any) {
        errors.push(`Material ${item.materialCode}: ${err.message}`);
      }
    }

    return { successCount, errors };
  },

  /**
   * Batch deduct stock from Excel rows
   */
  batchDeductStock: async (
    items: Array<{
      materialCode: string;
      lotInternalNumber?: string;
      deductQuantity: number;
      spkNumber?: string;
      batchTarget?: string;
      notes?: string;
      unit?: string;
    }>,
    performerName: string = 'Operator Excel Deduct'
  ): Promise<{ successCount: number; errors: string[] }> => {
    let successCount = 0;
    const errors: string[] = [];
    const lots = await stockService.getStockLots();

    for (const item of items) {
      try {
        if (!item.materialCode || !item.deductQuantity) continue;

        let lotNum = item.lotInternalNumber?.trim();
        if (!lotNum) {
          // Pick oldest released lot for this material (FEFO/FIFO)
          const available = lots
            .filter(
              (l) =>
                l.materialCode === item.materialCode &&
                (l.qcStatus === 'RELEASED' || (l.qcStatus as any) === 'PASSED') &&
                l.currentQuantity > 0
            )
            .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

          if (available.length === 0) {
            errors.push(`Material ${item.materialCode}: Tidak ada stok rilis yang tersedia.`);
            continue;
          }
          lotNum = available[0].lotInternalNumber;
        }

        await stockService.deductStock({
          materialCode: item.materialCode.trim(),
          lotInternalNumber: lotNum,
          deductQuantity: item.deductQuantity,
          unit: item.unit || 'kg',
          spkNumber: item.spkNumber || 'SPK-BATCH-EXCEL',
          batchTarget: item.batchTarget || 'BATCH-PROD-EXCEL',
          performerName,
          notes: item.notes || 'Potong stok batch dari Excel',
        });
        successCount++;
      } catch (err: any) {
        errors.push(`Material ${item.materialCode}: ${err.message}`);
      }
    }

    return { successCount, errors };
  },

  /**
   * Defined Warehouse Storage Zones & Boundaries (CPKB Standard)
   */
  getWarehouseStorageZones: () => ({
    raw: [
      'Gudang Utama BB - Rak A1 (Zat Aktif)',
      'Gudang Utama BB - Rak A2 (Emulgator & Pelarut)',
      'Gudang Utama BB - Rak A3 (Surfactant & Base)',
      'Gudang Utama BB - Rak A4 (Fragrance & Oil)',
      'Gudang Ruang Dingin BB (Chiller 2-8°C - Temp Control)',
      'Warehouse Karantina Bahan Baku (Rak K-01)',
    ],
    packaging: [
      'Gudang Utama BK - Rak B1 (Botol & Pot)',
      'Gudang Utama BK - Rak B2 (Tutup & Pump/Sprayer)',
      'Gudang Utama BK - Rak B3 (Label Sticker & Shrink)',
      'Gudang Utama BK - Rak B4 (Karton Box & Inner)',
      'Warehouse Karantina Bahan Kemas (Area BK-01)',
    ],
    special: [
      'Area Reject & Retur Vendor (Ruang B)',
      'Gudang Transit Karantina Sementara',
    ],
  }),

  /**
   * Validate if a new location string is within defined warehouse boundaries
   */
  validateWarehouseBoundary: (locationString: string): { isValid: boolean; errorMessage?: string } => {
    if (!locationString || !locationString.trim()) {
      return { isValid: false, errorMessage: 'Lokasi penyimpanan baru tidak boleh kosong.' };
    }

    const locLower = locationString.toLowerCase().trim();
    const validKeywords = [
      'gudang',
      'rak',
      'chiller',
      'ruang',
      'karantina',
      'pallet',
      'zone',
      'area',
      'posisi',
      'penyimpanan',
    ];

    const hasValidKeyword = validKeywords.some((keyword) => locLower.includes(keyword));

    if (!hasValidKeyword) {
      return {
        isValid: false,
        errorMessage:
          'Lokasi baru berada di luar batas area gudang yang sah. Lokasi harus berada di dalam batas resmi (Gudang Utama BB, Gudang Utama BK, Rak A/B/K, Chiller, Karantina, atau Area Reject).',
      };
    }

    return { isValid: true };
  },

  /**
   * Relocate stock lot to new rack / location with boundary validation & movement tracking
   */
  relocateStockLot: async (payload: {
    lotInternalNumber: string;
    newLocation: string;
    performerName: string;
    notes?: string;
  }): Promise<StockLotItem> => {
    // 1. Boundary Validation
    const boundaryCheck = stockService.validateWarehouseBoundary(payload.newLocation);
    if (!boundaryCheck.isValid) {
      throw new Error(boundaryCheck.errorMessage);
    }

    const grns = await warehouseService.getGrnRecords();
    const targetLotNormalized = normalizeLotNumber(payload.lotInternalNumber);
    const grnTarget = grns.find((g) => {
      const qcReport = g.qcPayload;
      const lotInternal = qcReport?.lotInternalNumber || g.internalLotNumber;
      return (
        lotInternal === payload.lotInternalNumber ||
        (lotInternal && normalizeLotNumber(lotInternal) === targetLotNormalized)
      );
    });

    if (!grnTarget) {
      throw new Error(`Nomor Lot ${payload.lotInternalNumber} tidak ditemukan di sistem.`);
    }

    const prevLocation = grnTarget.storageLocation || 'Warehouse Karantina';
    const cleanNewLoc = payload.newLocation.trim();

    if (prevLocation === cleanNewLoc) {
      throw new Error(`Lokasi baru sama dengan lokasi saat ini (${prevLocation}). Silakan pilih lokasi yang berbeda.`);
    }

    const currentQty = grnTarget.qcPayload?.currentQuantity !== undefined
      ? grnTarget.qcPayload.currentQuantity
      : grnTarget.quantityReceived;

    // Record in movement ledger
    const newLog: StockMovementLedger = {
      id: `led-reloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      materialCode: grnTarget.materialCode,
      materialName: grnTarget.materialName,
      materialType: grnTarget.materialType,
      lotInternalNumber: payload.lotInternalNumber,
      movementType: 'LOCATION_RELOCATION',
      referenceNumber: `RELOC-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
      qtyBefore: currentQty,
      qtyChange: 0,
      qtyAfter: currentQty,
      unit: grnTarget.unit,
      performer: {
        name: payload.performerName || 'Staf Logistik Gudang',
        role: 'Petugas Relokasi Rak',
        department: 'Warehouse & Logistik',
      },
      notes: `Pemindahan Lokasi Simpan: [${prevLocation}] ➔ [${cleanNewLoc}]. ${payload.notes ? `Catatan: ${payload.notes}` : ''}`,
    };

    const existingQcPayload = grnTarget.qcPayload || { status: grnTarget.qcStatus || 'QUARANTINE' };
    const updatedQcPayload = {
      ...existingQcPayload,
      stockLedger: [newLog, ...(existingQcPayload.stockLedger || [])],
    };

    await warehouseService.updateGrnRecord(grnTarget.id, {
      storageLocation: cleanNewLoc,
      qcPayload: updatedQcPayload,
    });
    await stockService.saveStockMovement(newLog);

    // Construct and return the updated lot
    const updatedLots = await stockService.getStockLots();
    const updatedLot = updatedLots.find((l) => l.lotInternalNumber === payload.lotInternalNumber);
    if (!updatedLot) {
      throw new Error('Gagal memuat ulang data lot setelah relokasi.');
    }
    return updatedLot;
  },

  /**
   * Service layer function that monitors current inventory levels against defined Reorder Points (ROP)
   * for both raw materials and packaging materials.
   */
  checkReorderPoints: async (): Promise<RopAlertItem[]> => {
    const [rawSummaries, pkgSummaries] = await Promise.all([
      stockService.getStockSummaries('raw'),
      stockService.getStockSummaries('packaging'),
    ]);

    const alerts: RopAlertItem[] = [];

    // Evaluate Raw Materials ROP (Default ROP / Safety Threshold = 50 kg or custom)
    for (const raw of rawSummaries) {
      const rop = raw.minimumStock || 50;
      if (raw.stockReleased <= rop) {
        alerts.push({
          id: `rop-raw-${raw.materialCode}`,
          materialCode: raw.materialCode,
          materialName: raw.materialName,
          materialType: 'raw',
          currentStock: raw.stockReleased,
          reorderPoint: rop,
          unit: raw.unit || 'kg',
          urgency: raw.stockReleased === 0 ? 'critical' : 'warning',
          suggestedReorderQty: Math.max(100, rop * 2 - raw.stockReleased),
        });
      }
    }

    // Evaluate Packaging Materials ROP (Default ROP / Safety Threshold = 100 pcs or custom)
    for (const pkg of pkgSummaries) {
      const rop = pkg.minimumStock || 100;
      if (pkg.stockReleased <= rop) {
        alerts.push({
          id: `rop-pkg-${pkg.materialCode}`,
          materialCode: pkg.materialCode,
          materialName: pkg.materialName,
          materialType: 'packaging',
          currentStock: pkg.stockReleased,
          reorderPoint: rop,
          unit: pkg.unit || 'pcs',
          urgency: pkg.stockReleased === 0 ? 'critical' : 'warning',
          suggestedReorderQty: Math.max(500, rop * 2 - pkg.stockReleased),
        });
      }
    }

    return alerts;
  },
};

export interface RopAlertItem {
  id: string;
  materialCode: string;
  materialName: string;
  materialType: 'raw' | 'packaging';
  currentStock: number;
  reorderPoint: number;
  unit: string;
  urgency: 'critical' | 'warning';
  suggestedReorderQty: number;
}

