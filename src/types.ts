export type Department = 
  | 'rnd' 
  | 'ppic' 
  | 'warehouse' 
  | 'quality' 
  | 'procurement' 
  | 'sales' 
  | 'management' 
  | 'admin'
  | 'production'
  | 'deviations';

export type Role = 
  | 'admin' 
  | 'manager' 
  | 'supervisor' 
  | 'staff' 
  | 'operator';

export type DocumentStatus = 'DRAFT' | 'SUBMITTED' | 'FINALIZED';

export interface ModulePermission {
  moduleId: Department;
  accessLevel: 'read' | 'write';
}

export interface UserProfile {
  id: string;
  nik: string;
  name: string;
  department: Department;
  role: Role;
  position?: string;
  job_title?: string;
  jobTitle?: string;
  jabatan?: string;
  email: string;
  password?: string;
  avatarUrl?: string;
  lastLogin?: string;
  specificAccess?: ModulePermission[];
}

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface QCParameter {
  name?: string;
  specification?: string;
  parameterName?: string;
  acceptanceCondition?: string;
  unit?: string;
  id?: string;
}

export interface RawMaterial {
  id: string;
  code: string;
  specNumber?: string; // Format: SP-BB-[code] (e.g. SP-BB-RM0001)
  name: string;
  chemicalName: string;
  category: string; // Keep for backward-compatibility (e.g. primary or joined)
  categories?: string[]; // Multiple selected categories
  otherCategorySpecification?: string; // Specification if 'other' / 'Lain-lain' is selected
  storageConditions: string;
  sdsDocNumber: string;
  sdsFileUrl?: string; // Google Drive file URL or preview URL
  sdsFileName?: string; // Name of uploaded SDS file
  sdsDriveId?: string; // Google Drive document ID
  approvedSubstitutes: string[];
  isSingleSpecificMaterial?: boolean; // True if explicitly marked as no approved substitutes
  supplierLeadTimeDays?: number;
  manufacturer?: string;
  qcParameters: QCParameter[];
  reorderPoint?: number; // Reorder Point (ROP) threshold for stock monitoring
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface PackagingMaterial {
  id: string;
  code: string;
  specNumber?: string; // Format: SP-BK-[code] (e.g. SP-BK-K0001)
  name: string;
  type: 'primary' | 'secondary' | 'tertiary';
  unit?: string;
  unitCapacityGrams?: number;
  supplier?: string;
  storageLocation?: string;
  storageConditions?: string;
  qcParameters?: QCParameter[];
  reorderPoint?: number; // Reorder Point (ROP) threshold for stock monitoring
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  // Legacy optional fields
  materialSpec?: string;
  artworkVersion?: string;
  leadTimeDays?: number;
  manufacturer?: string;
  supplierLeadTimeDays?: number;
  docNumber?: string;
  docFileUrl?: string;
  docFileName?: string;
  docDriveId?: string;
  approvedSubstitutes?: string[];
  isSingleSpecificMaterial?: boolean;
}

export interface FormulationIngredient {
  rawMaterialCode: string;
  percentage: number;
  qtyBasisKg?: number;
  phase?: string; // e.g. Fase A, Fase B
  description?: string;
}

export interface BulkFormulation {
  id: string;
  code: string; // e.g. BOM-PJ0099-V1.0
  name: string; // e.g. Larassanti Hair Tonic ginseng
  productId?: string; // Links to Product.id
  productCode: string; // e.g. PJ0099
  productName: string; // e.g. Larassanti Hair Tonic ginseng
  version: string; // e.g. v1.0, v1.1
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | string;
  bulkQuantityKg: number; // Standar basis CPKB: 100 kg
  purposeDescription?: string; // Keterangan / Tujuan Formula
  ingredients: FormulationIngredient[];
  mixingInstructions?: string; // Catatan Teknis Formulasi / Petunjuk Pengolahan
  dynamicProcessSteps?: any; // JSON representation of DynamicProcessStep[]
  technicalNotes?: string; // Mesin dan catatan teknis
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface VariantPackagingItem {
  packagingCode: string; // e.g. K0001
  quantityPerUnit: number;
  type: 'primary' | 'secondary' | 'tertiary';
}

export interface ProductVariant {
  id: string;
  productId: string; // references Product.id or code
  variantCode: string; // e.g. PJ0001-V1
  variantName: string; // e.g. "Botol Pipet 20ml"
  sku?: string; // e.g. PJ0001-V1 or custom SKU
  status?: 'active' | 'inactive' | 'discontinued' | string;
  netVolumeGrams: number;
  bulkFormulaCode: string; // links to BulkFormulation code (e.g. FORM-001)
  packagingBom: VariantPackagingItem[];
  bpomNumber?: string;
  barcode?: string;
  description?: string;
  createdAt?: string;
}

export interface Product {
  id: string;
  code: string; // Format PJ0001, PJ0002 dst
  productCode?: string; // DB column mapping
  name: string; // e.g. "Brightening Glow Serum"
  category: string; // e.g. "Skincare - Face Serum"
  brand: string; // e.g. "Larassanti Skin"
  description: string;
  unit?: string; // e.g. "pcs (Pieces)"
  storageConditions?: string; // e.g. "Suhu Ruang (15-25°C), Kering, Bebas Cahaya Langsung"
  bpomNotificationNumber?: string; // e.g. "NA18220100123"
  bpomNotificationExt?: string; // e.g. "2028-12-31 / Ext-01"
  expNotificationDate?: string; // DB column mapping for exp_notification_date
  qcParameters?: QCParameter[]; // Bulk specs
  bulkQcParameters?: QCParameter[]; // Bulk specs alias
  finishedQcParameters?: QCParameter[]; // Finished goods specs
  variants: ProductVariant[];
  createdAt?: string;
}
