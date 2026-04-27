/**
 * Report-domain types — hand-mirrored from the Phase 2 backend zod schemas
 * (`backend/src/schemas/report.schema.ts`) and DB shapes from
 * `backend/src/db/migrations/006_reports.sql`.
 *
 * SQLite stores booleans as 0/1; the backend hook layer converts those to
 * real JS booleans before serializing, so we treat `enabled` and friends
 * as `boolean` here. Likewise `next_run_at` / `last_run_at` arrive as
 * UNIX-epoch-second integers (or null).
 */

/** Status enum mirrored from the `report_runs.status` CHECK constraint. */
export type ReportRunStatus = 'queued' | 'running' | 'done' | 'failed';

/** Output format enum mirrored from `reports.output_format`. */
export type ReportOutputFormat = 'markdown';

/**
 * `target` is stored on the server as a JSON string (e.g. `'["all"]'` or
 * `'[1, 3, 7]'`). The backend deserializes it before responding, so we
 * receive a parsed array on the wire.
 */
export type ReportTarget = ReadonlyArray<'all' | number>;

export interface Report {
  id: number;
  name: string;
  prompt_template: string;
  target: ReportTarget;
  output_format: ReportOutputFormat;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportCreate {
  name: string;
  prompt_template: string;
  target: ReportTarget;
  output_format?: ReportOutputFormat;
  enabled?: boolean;
  cron_expr: string;
}

export interface ReportUpdate {
  name?: string;
  prompt_template?: string;
  target?: ReportTarget;
  output_format?: ReportOutputFormat;
  enabled?: boolean;
  cron_expr?: string;
}

export interface ReportSchedule {
  id: number;
  report_id: number;
  cron_expr: string;
  enabled: boolean;
  /** UNIX epoch seconds, or null if never computed. */
  next_run_at: number | null;
  /** UNIX epoch seconds, or null if it's never run. */
  last_run_at: number | null;
}

export interface ReportRun {
  id: number;
  schedule_id: number;
  /** UNIX epoch seconds — the nominal cron fire-time. */
  fire_time: number;
  status: ReportRunStatus;
  output_path: string | null;
  output_sha256: string | null;
  summary: string | null;
  error: string | null;
  /** ISO-8601 — `started_at` defaults to now() at insert. */
  started_at: string;
  /** ISO-8601 — null while still running. */
  finished_at: string | null;
}

/** Result of POST /api/reports/:id/run-now */
export interface RunNowResult {
  run_id: number;
  output_path: string | null;
  executed: boolean;
}

/** Result of POST /api/ingest/scan */
export interface IngestScanResult {
  files_scanned: number;
  inserted: number;
  updated: number;
  tombstoned: number;
  conflicts: number;
  errors: number;
}

/** Result of GET /api/ingest/status */
export interface IngestStatus {
  /** ISO-8601, or null if no scan has ever been run. */
  last_scan_at: string | null;
  errors: ReadonlyArray<{
    id: number;
    path: string;
    error: string;
    occurred_at: string;
  }>;
}
