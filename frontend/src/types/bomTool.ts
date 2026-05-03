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
