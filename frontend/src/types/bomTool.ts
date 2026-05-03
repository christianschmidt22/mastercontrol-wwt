export interface BomToolFile {
  name: string;
  extension: string;
  size_bytes: number;
  modified_at: string;
}

export interface BomToolFileList {
  organization_id: number;
  organization_name: string;
  directory: string;
  files: BomToolFile[];
}

export interface BomToolUploadFile {
  name: string;
  mime_type?: string | null;
  data_base64: string;
}

export interface BomToolUploadRequest {
  organization_id: number;
  files: BomToolUploadFile[];
}

export interface BomToolAnalyzeRequest {
  organization_id: number;
  file_names: string[];
  prompt?: string | null;
}

export interface BomToolAnalyzeResponse {
  output: string;
  report: BomAnalysisReport;
}

export interface BomToolMoveRequest {
  from_organization_id: number;
  to_organization_id: number;
  file_names: string[];
}

export interface BomToolMoveResponse {
  from: BomToolFileList;
  to: BomToolFileList;
  moved_files: string[];
}

export interface BomCustomerPreference {
  id: number | null;
  organization_id: number;
  label: string;
  value: string;
  is_standard: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface BomCustomerPreferenceList {
  organization_id: number;
  organization_name: string;
  preferences: BomCustomerPreference[];
}

export interface BomCustomerPreferencesSaveRequest {
  organization_id: number;
  preferences: Array<{
    id?: number | null;
    label: string;
    value?: string | null;
    is_standard?: boolean;
    sort_order?: number;
  }>;
}

export interface BomAnalysisReport {
  id: number;
  organization_id: number;
  title: string;
  prompt: string | null;
  file_names: string[];
  output: string;
  created_at: string;
}

export interface BomAnalysisReportList {
  organization_id: number;
  organization_name: string;
  reports: BomAnalysisReport[];
}
