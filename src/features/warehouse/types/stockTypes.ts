export type MaterialStockType = 'raw' | 'packaging';

export type StockQcStatus = 'QUARANTINE' | 'RELEASED' | 'RELEASE_DEVIATION' | 'REJECTED';

export interface StockLotItem {
  id: string;
  lotInternalNumber: string; // e.g. LBB2609001 / LBK2609001
  grnNumber: string;
  grnId: string;
  materialCode: string;
  materialName: string;
  materialType: MaterialStockType;
  batchNumberVendor: string;
  manufacturer: string;
  distributor?: string;
  receivedDate: string;
  expiryDate: string;
  initialQuantity: number;
  currentQuantity: number;
  unit: string;
  containerCount: number;
  containerType: string;
  storageLocation: string;
  qcStatus: StockQcStatus;
  qcReportId?: string;
  releasedDate?: string;
  retestDate?: string;
  notes?: string;
}

export interface MaterialStockSummary {
  id: string;
  materialCode: string;
  materialName: string;
  materialType: MaterialStockType;
  category: string;
  storageLocation: string;
  storageConditions: string;
  unit: string;
  stockReleased: number;
  stockQuarantine: number;
  stockRejected: number;
  totalAccumulated: number;
  minimumStock: number;
  lots: StockLotItem[];
}

export type StockMovementType =
  | 'IN_GRN_QUARANTINE'
  | 'QC_RELEASE_TRANSFER'
  | 'QC_REJECT_TRANSFER'
  | 'LOCATION_RELOCATION'
  | 'OUT_PRODUCTION_SPK'
  | 'OPNAME_ADJUSTMENT'
  | 'RETURN_VENDOR';

export interface StockMovementLedger {
  id: string;
  timestamp: string;
  materialCode: string;
  materialName: string;
  materialType: MaterialStockType;
  lotInternalNumber: string;
  movementType: StockMovementType;
  referenceNumber: string; // e.g. GRN-001, QC-REP-01, SPK-2026-001, OPNAME-2026-01
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  unit: string;
  performer: {
    name: string;
    role: string;
    department: string;
  };
  notes?: string;
}

export interface StockDeductionPayload {
  materialCode: string;
  lotInternalNumber: string;
  deductQuantity: number;
  unit: string;
  spkNumber: string;
  batchTarget: string;
  performerName: string;
  notes?: string;
}

export interface StockOpnamePayload {
  materialCode: string;
  materialName?: string;
  lotInternalNumber?: string;
  systemQuantity?: number;
  actualQuantity: number;
  unit: string;
  reason: string;
  auditorName: string;
  isInitialStock?: boolean;
  initialStockExpiryDate?: string;
}
