export type DocumentKind = 'link' | 'file';
export type DocumentSource = 'manual' | 'onedrive_scan';

export interface Document {
  id: number;
  organization_id: number;
  kind: DocumentKind;
  label: string;
  url_or_path: string;
  source: DocumentSource;
  created_at: string;
}

export interface DocumentCreate {
  organization_id: number;
  kind: DocumentKind;
  label: string;
  url_or_path: string;
  source?: DocumentSource;
}
