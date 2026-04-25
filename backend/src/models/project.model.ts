import { db } from '../db/database.js';

export interface Project {
  id: number;
  organization_id: number;
  name: string;
  status: string;
  description: string | null;
  doc_url: string | null;
  notes_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  organization_id: number;
  name: string;
  status?: string;
  description?: string | null;
  doc_url?: string | null;
  notes_url?: string | null;
}

export interface ProjectUpdate {
  name?: string;
  status?: string;
  description?: string | null;
  doc_url?: string | null;
  notes_url?: string | null;
}

const listStmt = db.prepare<[number], Project>(
  'SELECT * FROM projects WHERE organization_id = ? ORDER BY created_at DESC'
);
const getStmt = db.prepare<[number], Project>('SELECT * FROM projects WHERE id = ?');
const insertStmt = db.prepare<[number, string, string, string | null, string | null, string | null]>(
  'INSERT INTO projects (organization_id, name, status, description, doc_url, notes_url) VALUES (?, ?, ?, ?, ?, ?)'
);
const updateStmt = db.prepare<[string, string, string | null, string | null, string | null, number]>(
  "UPDATE projects SET name = ?, status = ?, description = ?, doc_url = ?, notes_url = ?, updated_at = datetime('now') WHERE id = ?"
);
const deleteStmt = db.prepare<[number]>('DELETE FROM projects WHERE id = ?');

export const projectModel = {
  listFor: (orgId: number): Project[] => listStmt.all(orgId),
  get: (id: number): Project | undefined => getStmt.get(id),
  create: (input: ProjectInput): Project => {
    const result = insertStmt.run(
      input.organization_id,
      input.name,
      input.status ?? 'active',
      input.description ?? null,
      input.doc_url ?? null,
      input.notes_url ?? null
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },
  update: (id: number, patch: ProjectUpdate): Project | undefined => {
    const current = getStmt.get(id);
    if (!current) return undefined;
    updateStmt.run(
      patch.name ?? current.name,
      patch.status ?? current.status,
      patch.description !== undefined ? (patch.description ?? null) : current.description,
      patch.doc_url !== undefined ? (patch.doc_url ?? null) : current.doc_url,
      patch.notes_url !== undefined ? (patch.notes_url ?? null) : current.notes_url,
      id
    );
    return getStmt.get(id);
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
