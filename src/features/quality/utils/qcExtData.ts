import { Department } from '../../../types';

export interface IpcBulkTest {
  id: string;
  ipcNo?: string; // Format: LPR-YYMMxxxx (e.g. LPR-26090001)
  batchNo: string;
  productCode?: string;
  productName: string;
  mixingDate?: string;
  testDate?: string;
  mixingQtyKg?: number;
  pH: number;
  viscosity: number; // cPs
  appearance: string; // e.g. "Homogen, Putih Mengkilap"
  gravity: number; // g/ml
  status: 'PASSED' | 'REJECTED' | 'TESTING' | 'RETEST' | 'AWAITING_QM' | 'RELEASED' | 'RELEASED_DEVIATION';
  analyst: string;
  rejectionReason?: string;
  staffSignature?: {
    signerName: string;
    signerNik?: string;
    signerPosition?: string;
    signedAt?: string;
    signatureHash?: string;
  };
  qmSignature?: {
    signerName: string;
    signerNik?: string;
    signerPosition?: string;
    signedAt?: string;
    signatureHash?: string;
  };
  labParameters?: Array<{
    id: string;
    parameterName: string;
    specification: string;
    resultValue: string;
    isCompliant: boolean;
  }>;
}

export interface IpcFinishedTest {
  id: string;
  ipcNo?: string;
  batchNo: string;
  productCode?: string;
  productName: string;
  packagingDate?: string;
  testDate?: string;
  packSize?: string;
  netWeightGrams: number;
  sealingIntegrity: string; // e.g. "Bocor / Tidak Bocor"
  torqueKgCm: number; // Tutup botol
  appearance: string; // "Bersih, Cetakan Label Sempurna"
  status: 'PASSED' | 'REJECTED' | 'TESTING' | 'RETEST' | 'AWAITING_QM' | 'RELEASED' | 'RELEASED_DEVIATION';
  analyst: string;
  rejectionReason?: string;
  staffSignature?: {
    signerName: string;
    signerNik?: string;
    signerPosition?: string;
    signedAt?: string;
    signatureHash?: string;
  };
  qmSignature?: {
    signerName: string;
    signerNik?: string;
    signerPosition?: string;
    signedAt?: string;
    signatureHash?: string;
  };
  labParameters?: Array<{
    id: string;
    parameterName: string;
    specification: string;
    resultValue: string;
    isCompliant: boolean;
  }>;
}

export interface IpcReworkTest {
  id: string;
  originalBatchNo: string;
  reworkBatchNo: string;
  productName: string;
  reworkReason: string;
  reworkDate: string;
  pHTest: number;
  viscosityTest: number;
  microbiology: 'NEGATIVE' | 'POSITIVE' | 'PENDING';
  status: 'PASSED' | 'REJECTED' | 'TESTING';
  authorizedBy: string;
}

export interface RetainedSample {
  id: string;
  batchNo: string;
  productName: string;
  type: 'Bahan Baku' | 'Bahan Kemas' | 'Produk Jadi';
  expiryDate: string;
  rackNo: string;
  qty: string;
  status: 'Simpan' | 'Diambil untuk Re-test' | 'Dimusnahkan';
  receivedDate: string;
}

export interface StabilityCheckPoint {
  month: string;
  pH: number;
  viscosity: number;
  appearance: string;
}

export interface StabilityStudy {
  id: string;
  productName: string;
  batchNo: string;
  chamberTemp: string; // e.g. "40°C ± 2°C / 75% RH ± 5%"
  interval: string; // e.g. "Bulan ke-3 (Accelerated)"
  pullDate: string;
  status: 'BERJALAN' | 'SELESAI' | 'WARNING';
  pHHistory: StabilityCheckPoint[];
}

export interface SopDocument {
  id: string;
  docNumber: string;
  title: string;
  version: string;
  effectiveDate: string;
  category: 'QC' | 'QA' | 'SOP-PROD' | 'WH';
  status: 'AKTIF' | 'DRAFT' | 'USANG';
}

export interface CapaRecord {
  id: string;
  devNumber: string;
  source: string; // e.g. "Deviasi Produksi", "Temuan Audit Internal"
  description: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  status: 'OPEN' | 'CLOSED';
  targetDate: string;
}

export interface QualityComplaint {
  id: string;
  comNumber: string;
  customer: string;
  productName: string;
  batchNo: string;
  complaintText: string;
  investigationText: string;
  retestResult: string;
  status: 'OPEN' | 'CLOSED' | 'UNDER_INVESTIGATION';
  date: string;
}

// Pre-populated CPKB Compliant Data (Cleared for Clean Production State)
export const initialIpcBulkTests: IpcBulkTest[] = [];

export const initialIpcFinishedTests: IpcFinishedTest[] = [];

export const initialIpcReworkTests: IpcReworkTest[] = [];

export const initialRetainedSamples: RetainedSample[] = [];

export const initialStabilityStudies: StabilityStudy[] = [];

export const initialSopDocuments: SopDocument[] = [];

export const initialCapaRecords: CapaRecord[] = [];

export const initialQualityComplaints: QualityComplaint[] = [];
