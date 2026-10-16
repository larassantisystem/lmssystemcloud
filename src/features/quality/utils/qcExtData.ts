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

// Pre-populated Sample Released QC Reports for Quality Module
export const initialIpcBulkTests: IpcBulkTest[] = [
  {
    id: 'ipc-bulk-001',
    ipcNo: 'LPR-26090001',
    batchNo: 'BTC-PCT-260901',
    productCode: 'PRD-PCT-120',
    productName: 'Paracetamol Sirup 120ml (Bulk Sediaan)',
    mixingDate: '2026-09-01',
    testDate: '2026-09-03',
    mixingQtyKg: 500,
    pH: 6.2,
    viscosity: 4200,
    appearance: 'Homogen, Putih Jernih, Bebas Partikel Asing',
    gravity: 1.05,
    status: 'RELEASED',
    analyst: 'Ahmad Fauzi, S.Farm (QC Analyst)',
    staffSignature: {
      signerName: 'Ahmad Fauzi, S.Farm',
      signerNik: 'NIK-QC-012',
      signerPosition: 'Quality Control Analyst',
      signedAt: '2026-09-03T10:30:00Z',
      signatureHash: 'sig-hash-abc123xyz'
    },
    qmSignature: {
      signerName: 'Diana Putri, Apt (QM)',
      signerNik: 'NIK-QM-001',
      signerPosition: 'Quality Manager',
      signedAt: '2026-09-03T14:15:00Z',
      signatureHash: 'sig-hash-qm9876xyz'
    },
    labParameters: [
      { id: 'p1', parameterName: 'pH Larutan', specification: '5.5 - 6.5', resultValue: '6.2', isCompliant: true },
      { id: 'p2', parameterName: 'Viskositas (Brookfield)', specification: '3500 - 5000 cPs', resultValue: '4200 cPs', isCompliant: true },
      { id: 'p3', parameterName: 'Bobot Jenis', specification: '1.02 - 1.08 g/ml', resultValue: '1.05 g/ml', isCompliant: true }
    ]
  },
  {
    id: 'ipc-bulk-002',
    ipcNo: 'LPR-26090002',
    batchNo: 'BTC-IBU-260902',
    productCode: 'PRD-IBU-060',
    productName: 'Ibuprofen Suspensi 60ml (Bulk Sediaan)',
    mixingDate: '2026-09-02',
    testDate: '2026-09-04',
    mixingQtyKg: 450,
    pH: 4.8,
    viscosity: 3800,
    appearance: 'Suspensi Putih Susu, Bau Khas',
    gravity: 1.03,
    status: 'RELEASED_DEVIATION',
    analyst: 'Siti Rahma, M.Sc (QC Analyst)',
    staffSignature: {
      signerName: 'Siti Rahma, M.Sc',
      signerNik: 'NIK-QC-014',
      signerPosition: 'Quality Control Analyst',
      signedAt: '2026-09-04T11:00:00Z',
      signatureHash: 'sig-hash-def456'
    },
    qmSignature: {
      signerName: 'Diana Putri, Apt (QM)',
      signerNik: 'NIK-QM-001',
      signerPosition: 'Quality Manager',
      signedAt: '2026-09-04T15:30:00Z',
      signatureHash: 'sig-hash-qm4567'
    },
    labParameters: [
      { id: 'p1', parameterName: 'pH Larutan', specification: '4.5 - 5.5', resultValue: '4.8', isCompliant: true },
      { id: 'p2', parameterName: 'Viskositas', specification: '3000 - 4500 cPs', resultValue: '3800 cPs', isCompliant: true }
    ]
  }
];

export const initialIpcFinishedTests: IpcFinishedTest[] = [
  {
    id: 'ipc-fin-001',
    ipcNo: 'LPR-FIN-260901',
    batchNo: 'BTC-PCT-260901',
    productCode: 'PRD-PCT-120',
    productName: 'Paracetamol Sirup 120ml (Produk Jadi)',
    packagingDate: '2026-09-03',
    testDate: '2026-09-04',
    packSize: '120 ml',
    netWeightGrams: 126.5,
    sealingIntegrity: 'Tidak Bocor',
    torqueKgCm: 16,
    appearance: 'Bersih, Cetakan Label Batch Sempurna, Segel Utuh',
    status: 'RELEASED',
    analyst: 'Budi Santoso, S.Farm',
    staffSignature: {
      signerName: 'Budi Santoso, S.Farm',
      signerNik: 'NIK-QC-018',
      signerPosition: 'QC Packaging Analyst',
      signedAt: '2026-09-04T09:00:00Z',
      signatureHash: 'sig-fin-123'
    },
    qmSignature: {
      signerName: 'Diana Putri, Apt (QM)',
      signerNik: 'NIK-QM-001',
      signerPosition: 'Quality Manager',
      signedAt: '2026-09-04T13:00:00Z',
      signatureHash: 'sig-fin-qm-123'
    },
    labParameters: [
      { id: 'f1', parameterName: 'Integritas Tutup', specification: 'Kedap, Tidak Bocor', resultValue: 'Kedap', isCompliant: true },
      { id: 'f2', parameterName: 'Volume Terpindahkan', specification: 'Min 120 ml', resultValue: '121.5 ml', isCompliant: true }
    ]
  }
];

export const initialIpcReworkTests: IpcReworkTest[] = [];

export const initialRetainedSamples: RetainedSample[] = [];

export const initialStabilityStudies: StabilityStudy[] = [];

export const initialSopDocuments: SopDocument[] = [];

export const initialCapaRecords: CapaRecord[] = [];

export const initialQualityComplaints: QualityComplaint[] = [];
