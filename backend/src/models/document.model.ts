import { db } from '../db/database.js';

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

export interface DocumentInput {
  organization_id: number;
  kind: DocumentKind;
  label: string;
  url_or_path: string;
  source?: DocumentSource;
}

const listStmt = db.prepare<[number], Document>(
  'SELECT * FROM documents WHERE organization_id = ? ORDER BY created_at DESC'
);
const getStmt = db.prepare<[number], Document>('SELECT * FROM documents WHERE id = ?');
const insertStmt = db.prepare<[number, DocumentKind, string, string, DocumentSource]>(
  'INSERT INTO documents (organization_id, kind, label, url_or_path, source) VALUES (?, ?, ?, ?, ?)'
);
const deleteStmt = db.prepare<[number]>('DELETE FROM documents WHERE id = ?');

/**
 * INSERT WHERE NOT EXISTS — inserts a new onedrive_scan document row only if
 * no row already exists for this (organization_id, url_or_path) pair.
 * Leaves manual rows and existing scan rows untouched (no UPDATE).
 *
 * Note: there is no UNIQUE(organization_id, url_or_path) constraint in the
 * Phase 1 schema, so INSERT OR IGNORE would not deduplicate. We use a
 * WHERE NOT EXISTS subquery instead, which is safe and correct.
 */
const upsertScanStmt = db.prepare<[number, string, string, number, string]>(
  `INSERT INTO documents (organization_id, kind, label, url_or_path, source)
   SELECT ?, 'file', ?, ?, 'onedrive_scan'
   WHERE NOT EXISTS (
     SELECT 1 FROM documents WHERE organization_id = ? AND url_or_path = ?
   )`
);
const findByOrgPathStmt = db.prepare<[number, string], Document>(
  'SELECT * FROM documents WHERE organization_id = ? AND url_or_path = ?'
);

export const documentModel = {
  listFor: (orgId: number): Document[] => listStmt.all(orgId),

  get: (id: number): Document | undefined => getStmt.get(id),

  create: (input: DocumentInput): Document => {
    const result = insertStmt.run(
      input.organization_id,
      input.kind,
      input.label,
      input.url_or_path,
      input.source ?? 'manual'
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,

  /**
   * Upsert a file discovered by the OEM OneDrive scan.
   * Inserts a new row with source='onedrive_scan' if no row exists for
   * (organization_id, url_or_path). If a row already exists (manual or scan),
   * leaves it untouched. Returns the resulting document row.
   */
  upsertOneDriveFile: (input: {
    organization_id: number;
    label: string;
    url_or_path: string;
  }): Document => {
    upsertScanStmt.run(
      input.organization_id,
      input.label,
      input.url_or_path,
      input.organization_id,
      input.url_or_path,
    );
    return findByOrgPathStmt.get(input.organization_id, input.url_or_path)!;
  },
};
