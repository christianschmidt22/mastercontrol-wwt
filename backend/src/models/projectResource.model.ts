import { db } from '../db/database.js';

export interface ProjectResource {
  id: number;
  project_id: number;
  organization_id: number;
  name: string;
  role: string | null;
  team: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectResourceInput {
  project_id: number;
  organization_id: number;
  name: string;
  role?: string | null;
  team?: string | null;
  notes?: string | null;
}

export interface ProjectResourceUpdate {
  name?: string;
  role?: string | null;
  team?: string | null;
  notes?: string | null;
}

const getStmt = db.prepare<[number], ProjectResource>(
  'SELECT * FROM project_resources WHERE id = ?',
);

const listByProjectStmt = db.prepare<[number], ProjectResource>(
  'SELECT * FROM project_resources WHERE project_id = ? ORDER BY name ASC',
);

const insertStmt = db.prepare<[number, number, string, string | null, string | null, string | null]>(
  `INSERT INTO project_resources (project_id, organization_id, name, role, team, notes)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const updateStmt = db.prepare<[string, string | null, string | null, string | null, number]>(
  `UPDATE project_resources
   SET name = ?, role = ?, team = ?, notes = ?, updated_at = datetime('now')
   WHERE id = ?`,
);

const deleteStmt = db.prepare<[number]>('DELETE FROM project_resources WHERE id = ?');

export const projectResourceModel = {
  listByProject: (projectId: number): ProjectResource[] =>
    listByProjectStmt.all(projectId),

  get: (id: number): ProjectResource | undefined => getStmt.get(id),

  create: (input: ProjectResourceInput): ProjectResource => {
    const result = insertStmt.run(
      input.project_id,
      input.organization_id,
      input.name,
      input.role ?? null,
      input.team ?? null,
      input.notes ?? null,
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },

  update: (id: number, patch: ProjectResourceUpdate): ProjectResource | undefined => {
    const current = getStmt.get(id);
    if (!current) return undefined;
    updateStmt.run(
      patch.name ?? current.name,
      patch.role !== undefined ? (patch.role ?? null) : current.role,
      patch.team !== undefined ? (patch.team ?? null) : current.team,
      patch.notes !== undefined ? (patch.notes ?? null) : current.notes,
      id,
    );
    return getStmt.get(id);
  },

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
