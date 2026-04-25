import { db } from '../db/database.js';

export interface Project {
  id: number;
  organization_id: number;
  name: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  organization_id: number;
  name: string;
  status?: string;
  description?: string | null;
}

const listStmt = db.prepare<[number], Project>(
  'SELECT * FROM projects WHERE organization_id = ? ORDER BY created_at DESC'
);
const getStmt = db.prepare<[number], Project>('SELECT * FROM projects WHERE id = ?');
const insertStmt = db.prepare<[number, string, string, string | null]>(
  'INSERT INTO projects (organization_id, name, status, description) VALUES (?, ?, ?, ?)'
);
const updateStmt = db.prepare<[string, string, string | null, number]>(
  "UPDATE projects SET name = ?, status = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
);
const deleteStmt = db.prepare<[number]>('DELETE FROM projects WHERE id = ?');

export const projectModel = {
  listFor: (orgId: number): Project[] => listStmt.all(orgId),
  create: (input: ProjectInput): Project => {
    const result = insertStmt.run(
      input.organization_id,
      input.name,
      input.status ?? 'active',
      input.description ?? null
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },
  update: (id: number, name: string, status: string, description: string | null): Project | undefined => {
    updateStmt.run(name, status, description, id);
    return getStmt.get(id);
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
