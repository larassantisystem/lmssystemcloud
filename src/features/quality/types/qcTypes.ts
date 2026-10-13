import { GrnMaterialType } from '../../warehouse/types/grnTypes';

export type QcInspectionStatus =
  | 'QUARANTINE'
  | 'QUALITY_CONTROL_PROCESS'
  | 'AWAITING_QM_AUTHORIZATION'
  | 'PASSED'
  | 'PASSED_WITH_DEVIATION'
  | 'REJECTED'
  | 'REVERTED_TO_WAREHOUSE';

export interface QcParameterResult {
  id: string;
  parameterName: string;
  specification: string;
  resultValue: string;
  isCompliant: boolean;
  notes?: string;
}

export interface SamplingInfo {
  materialType: GrnMaterialType;
  totalQuantity: number;
  totalContainers: number;
  unit: string;
  containerType: string;
  samplingStandard: string; // "CPKB (n = 1 + √N)" for raw, "MIL-STD-105E Level II" for packaging
  sampleSizeCodeLetter?: string; // MIL-STD-105E Code Letter (A - R)
  sampleSizeQuantity: number; // e.g., 5 containers or 200 pcs
  sampleUnit: string; // "wadah/drum" or "pcs/sample"
  samplingDescription: string;
}

export interface DigitalSignatureStamp {
  signerName: string;
  signerNik: string;
  signerRole: string;
  signedAt: string;
  signatureHash: string;
  notes?: string;
}

export interface QcInspectionReport {
  id: string;
  grnId: string;
  grnNumber: string;
  lotInternalNumber?: string; // Format: LBB2609001 or LBK2609001
  reportNumber?: string; // Same as lotInternalNumber
  materialType: GrnMaterialType;
  materialCode: string;
  materialName: string;
  manufacturer: string;
  distributor: string;
  poNumber: string;
  deliveryNoteNumber: string;
  batchNumberVendor: string;
  receivedDate: string;
  expiryDate?: string;
  retestDate?: string; // Tanggal Uji Ulang (Retest Date CPKB)
  sampledContainers?: string; // e.g., "Wadah #1, #3 (Total 5 Wadah)"
  samplingDateTime?: string; // e.g., "2026-09-15T09:30:00"
  sampledBy?: string; // Staf Analis QC who sampled
  quantityReceived: number;
  unit: string;
  containerCount: number;
  containerType: string;
  storageLocation: string;
  storageConditions: string;
  
  // Status and Process
  status: QcInspectionStatus;
  samplingInfo: SamplingInfo;
  parameters: QcParameterResult[];
  
  // Staff QC Analysis
  staffDecision?: 'RELEASE' | 'REJECT';
  staffNotes?: string;
  staffSignature?: DigitalSignatureStamp;
  
  // Quality Manager Authorization
  qmDecision?: 'RELEASE' | 'RELEASE_BY_DEVIATION' | 'REJECT';
  qmDeviationNumber?: string;
  qmNotes?: string;
  qmSignature?: DigitalSignatureStamp;
  
  // Revert to warehouse info
  revertReason?: string;
  revertedBy?: string;
  revertedAt?: string;

  // QM Revert back to Lab Testing info
  qmRevertToLabReason?: string;
  qmRevertToLabBy?: string;
  qmRevertToLabAt?: string;

  // Actual sample tested by QC Lab
  actualSampleSize?: number;
  actualSampleUnit?: string;

  // AI Assistant Assessment
  aiAssessment?: {
    priorityScore: number; // 1 - 100
    priorityRank: 'URGENT' | 'HIGH' | 'MEDIUM' | 'NORMAL';
    priorityReason: string;
    complianceScore: number; // 0 - 100%
    deviationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    summary: string;
    suggestedAction: string;
  };

  createdAt: string;
  updatedAt: string;
}

export interface QcNotification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  targetDepartments: string[]; // ['quality', 'warehouse', 'ppic']
  targetRoles: string[]; // ['manager', 'supervisor', 'staff']
  reportId?: string;
  lotInternalNumber?: string;
  grnNumber?: string;
  timestamp: string;
  isRead: boolean;
}
