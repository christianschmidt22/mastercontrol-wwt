/**
 * ingestSource.model.ts
 *
 * Prepared-statement model for the `ingest_sources` and `ingest_errors`
 * tables created by migration 005_ingest.sql.
 */

import { db } from '../db/database.js';

export type IngestKind = 'workvault' | 'onedrive' | 'oem_docs';

export interface IngestSource {
  id: number;
  root_path: string;
  kind: IngestKind;
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

// ---------------------------------------------------------------------------
// ingest_sources statements
// ---------------------------------------------------------------------------

const listSourcesStmt = db.prepare<[], IngestSource>(
  'SELECT * FROM ingest_sources ORDER BY created_at DESC',
);

const getSourceStmt = db.prepare<[number], IngestSource>(
  'SELECT * FROM ingest_sources WHERE id = ?',
);

const getSourceByPathKindStmt = db.prepare<[string, IngestKind], IngestSource>(
  'SELECT * FROM ingest_sources WHERE root_path = ? AND kind = ?',
);

const insertSourceStmt = db.prepare<[string, IngestKind]>(
  `INSERT INTO ingest_sources (root_path, kind) VALUES (?, ?)`,
);

const updateLastScanAtStmt = db.prepare<[string, number]>(
  `UPDATE ingest_sources SET last_scan_at = ? WHERE id = ?`,
);

// ---------------------------------------------------------------------------
// ingest_errors statements
// ---------------------------------------------------------------------------

const listErrorsStmt = db.prepare<[number, number], IngestError>(
  // `id DESC` is a tiebreaker for rows inserted within the same second —
  // CURRENT_TIMESTAMP has only second resolution in SQLite.
  `SELECT * FROM ingest_errors
   WHERE source_id = ?
   ORDER BY occurred_at DESC, id DESC
   LIMIT ?`,
);

const insertErrorStmt = db.prepare<[number, string, string]>(
  `INSERT INTO ingest_errors (source_id, path, error) VALUES (?, ?, ?)`,
);

const getErrorStmt = db.prepare<[number], IngestError>(
  'SELECT * FROM ingest_errors WHERE id = ?',
);

const deleteErrorStmt = db.prepare<[number]>(
  'DELETE FROM ingest_errors WHERE id = ?',
);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ingestSourceModel = {
  /** List all ingest source rows, newest first. */
  list(): IngestSource[] {
    return listSourcesStmt.all();
  },

  /** Fetch a single source by id. */
  get(id: number): IngestSource | undefined {
    return getSourceStmt.get(id);
  },

  /**
   * Get or create an ingest_sources row for the given (rootPath, kind) pair.
   * Idempotent: a second call with the same arguments returns the existing row.
   */
  getOrCreate(rootPath: string, kind: IngestKind): IngestSource {
    const existing = getSourceByPathKindStmt.get(rootPath, kind);
    if (existing) return existing;
    const result = insertSourceStmt.run(rootPath, kind);
    return getSourceStmt.get(Number(result.lastInsertRowid))!;
  },

  /** Stamp the source row with the current scan time (ISO 8601 string). */
  updateLastScanAt(id: number, isoTimestamp: string): void {
    updateLastScanAtStmt.run(isoTimestamp, id);
  },

  /**
   * Record a per-file ingest error for the given source.
   * @param sourceId  FK to ingest_sources.id
   * @param filePath  Absolute path of the file that caused the error
   * @param error     Human-readable error message
   */
  recordError(sourceId: number, filePath: string, error: string): IngestError {
    const result = insertErrorStmt.run(sourceId, filePath, error);
    const row = db
      .prepare<[number], IngestError>('SELECT * FROM ingest_errors WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    return row!;
  },

  /**
   * Return the most recent `limit` error rows for a given source, newest first.
   */
  listErrors(sourceId: number, limit = 20): IngestError[] {
    return listErrorsStmt.all(sourceId, limit);
  },

  /** Fetch a single ingest_error row by id. Returns undefined if not found. */
  getError(id: number): IngestError | undefined {
    return getErrorStmt.get(id);
  },

  /** Delete an ingest_error row by id. No-op if the row doesn't exist. */
  deleteError(id: number): void {
    deleteErrorStmt.run(id);
  },
};
