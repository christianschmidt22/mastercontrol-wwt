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
};
