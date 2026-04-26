/**
 * Ingest-domain types — hand-mirrored from backend models and zod schemas.
 *
 * IngestSource / IngestError match ingestSource.model.ts interfaces.
 * ScanResult matches ingest.service.ts ScanResult interface.
 * RetryResult matches ingest.service.ts RetryResult interface.
 * IngestStatus matches the GET /api/ingest/status response shape.
 */

export type IngestKind = 'workvault' | 'onedrive' | 'oem_docs';

export interface IngestSource {
  id: number;
  root_path: string;
  kind: IngestKind;
  /** ISO-8601 or null if never scanned. */
  last_scan_at: string | null;
  created_at: string;
}

export interface IngestError {
  id: number;
  source_id: number;
  path: string;
  error: string;
  occurred_at: string;
}

export interface ScanResult {
  files_scanned: number;
  inserted: number;
  updated: number;
  touched: number;
  tombstoned: number;
  conflicts: number;
  errors: number;
}

export interface RetryResult {
  resolved: boolean;
  path_not_found: boolean;
}

/** Response shape for GET /api/ingest/status */
export interface IngestStatus {
  source: IngestSource | null;
  errors: IngestError[];
}
