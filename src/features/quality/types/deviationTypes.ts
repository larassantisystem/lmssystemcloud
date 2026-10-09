export type DeviationStatus = 'DRAFT' | 'REVIEW' | 'CAPA' | 'CLOSED';
export type DeviationSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';
export type DeviationCategory = 'MATERIAL' | 'PRODUCTION' | 'EQUIPMENT' | 'PROCEDURE' | 'ENVIRONMENT';

export interface DepartmentImpact {
  department: string; // warehouse, production, qc, qa, engineering, rnd
  reviewedBy?: string;
  reviewDate?: string;
  impactDescription: string;
  hasImpact: boolean;
}

export interface RootCauseAnalysis {
  method: '5_WHYS' | 'FISHBONE' | 'GENERAL';
  category: 'MAN' | 'MACHINE' | 'MATERIAL' | 'METHOD' | 'ENVIRONMENT';
  problemStatement: string;
  why1?: string;
  why2?: string;
  why3?: string;
  why4?: string;
  why5?: string;
  summary: string;
}

export interface CapaAction {
  id: string;
  deviationId: string;
  actionType: 'CORRECTIVE' | 'PREVENTIVE';
  description: string;
  assigneeName: string;
  assigneeNik: string;
  dueDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED';
  evidenceNotes?: string;
  completedAt?: string;
}

export interface DeviationReport {
  id: string;
  deviationNumber: string;
  title: string;
  category: DeviationCategory;
  severity: DeviationSeverity;
  department: string; // Initiating department
  targetDepartments: string[]; // Departments involved in review
  batchNumber?: string;
  materialCode?: string;
  materialName?: string;
  description: string;
  initiatorName: string;
  initiatorNik: string;
  status: DeviationStatus;
  impacts?: DepartmentImpact[];
  rootCause?: RootCauseAnalysis;
  capaActions?: CapaAction[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: string;
}
