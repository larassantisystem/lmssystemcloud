export type GrnMaterialType = 'raw' | 'packaging';

export type GrnQcStatus =
  | 'QUARANTINE'
  | 'QUALITY_CONTROL_PROCESS'
  | 'AWAITING_QM_AUTHORIZATION'
  | 'PASSED'
  | 'PASSED_WITH_DEVIATION'
  | 'RELEASED'
  | 'REJECTED'
  | 'REVERTED_TO_WAREHOUSE';

export interface GrnRecord {
  id: string;
  grnNumber: string; // Format: GRN-YYYYMM-XXXX
  materialType: GrnMaterialType;
  materialId: string;
  materialCode: string; // B0001, K0001 dst
  materialName: string;
  manufacturer: string;
  distributor: string;
  poNumber: string;
  deliveryNoteNumber: string;
  batchNumber?: string;
  internalLotNumber?: string;
  receivedDate: string;
  expiryDate?: string;
  retestDate?: string;
  quantityReceived: number;
  currentQuantity?: number;
  unit: string;
  containerCount: number;
  containerType: string;
  storageLocation: string;
  storageConditions: string;
  qcStatus: GrnQcStatus;
  qcParametersCount?: number;
  sealCondition?: string;
  packagingCondition?: string;
  coaAttachment?: string;
  coaDriveFileId?: string;
  coaDriveViewLink?: string;
  msdsAttachment?: string;
  halalAttachment?: string;
  receivedBy: string;
  createdAt: string;
  notes?: string;
  qcPayload?: any;

  // Revert info from QC
  revertReason?: string;
  revertedBy?: string;
  revertedAt?: string;

  // Actual sample tested by QC Lab
  actualSampleSize?: number;
  actualSampleUnit?: string;

  // CPKB Container Sampling Log
  sampledContainers?: string;
  sampledBy?: string;
  samplingDateTime?: string;
}

export interface GrnStats {
  totalIncoming: number;
  inQuarantine: number;
  underTesting: number;
  awaitingAuth: number;
  passedQC: number;
  rejectedQC: number;
  rawMaterialsCount: number;
  packagingCount: number;
}

export interface GrnPaginatedQuery {
  page?: number;
  pageSize?: number;
  materialType?: GrnMaterialType | 'all';
  status?: string;
  search?: string;
  forceRefresh?: boolean;
}

export interface GrnPaginatedResponse {
  records: GrnRecord[];
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
}
