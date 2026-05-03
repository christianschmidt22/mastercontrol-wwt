import { db } from '../db/database.js';

export type TaskStatus = 'open' | 'done' | 'snoozed';
export type TaskKind = 'task' | 'question';

export interface Task {
  id: number;
  organization_id: number | null;
  contact_id: number | null;
  project_id: number | null;
  title: string;
  details: string | null;
  kind: TaskKind;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface TaskInput {
  title: string;
  organization_id?: number | null;
  contact_id?: number | null;
  project_id?: number | null;
  details?: string | null;
  kind?: TaskKind;
  due_date?: string | null;
  status?: TaskStatus;
}

export interface TaskFilters {
  status?: TaskStatus;
  due_before?: string;
  org_id?: number;
  contact_id?: number;
  project_id?: number;
  kind?: TaskKind;
}

export interface TaskUpdate {
  title?: string;
  organization_id?: number | null;
  contact_id?: number | null;
  project_id?: number | null;
  details?: string | null;
  kind?: TaskKind;
  due_date?: string | null;
  status?: TaskStatus;
}

const getStmt = db.prepare<[number], Task>('SELECT * FROM tasks WHERE id = ?');

const insertStmt = db.prepare<[
  string,
  string | null,
  TaskKind,
  number | null,
  number | null,
  number | null,
  string | null,
  TaskStatus,
]>(
  `INSERT INTO tasks (title, details, kind, organization_id, contact_id, project_id, due_date, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const updateStmt = db.prepare<[
  string,
  string | null,
  TaskKind,
  number | null,
  number | null,
  number | null,
  string | null,
  TaskStatus,
  TaskStatus,
  TaskStatus,
  number,
]>(
  `UPDATE tasks
   SET title = ?,
       details = ?,
       kind = ?,
       organization_id = ?,
       contact_id = ?,
       project_id = ?,
       due_date = ?,
       status = ?,
       completed_at = CASE
         WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now'))
         WHEN ? IN ('open', 'snoozed') THEN NULL
         ELSE completed_at
       END
   WHERE id = ?`
);

const completeStmt = db.prepare<[number]>(
  "UPDATE tasks SET status = 'done', completed_at = COALESCE(completed_at, datetime('now')) WHERE id = ?"
);

const deleteStmt = db.prepare<[number]>('DELETE FROM tasks WHERE id = ?');

function buildListQuery(filters: TaskFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.status !== undefined) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.due_before !== undefined) {
    clauses.push('due_date < ?');
    params.push(filters.due_before);
  }
  if (filters.org_id !== undefined) {
    clauses.push('organization_id = ?');
    params.push(filters.org_id);
  }
  if (filters.contact_id !== undefined) {
    clauses.push('contact_id = ?');
    params.push(filters.contact_id);
  }
  if (filters.project_id !== undefined) {
    clauses.push('project_id = ?');
    params.push(filters.project_id);
  }
  if (filters.kind !== undefined) {
    clauses.push('kind = ?');
    params.push(filters.kind);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return {
    sql: `SELECT * FROM tasks ${where} ORDER BY due_date ASC, created_at ASC`,
    params,
  };
}

export const taskModel = {
  list: (filters: TaskFilters = {}): Task[] => {
    const { sql, params } = buildListQuery(filters);
    return db.prepare<unknown[], Task>(sql).all(...params);
  },

  get: (id: number): Task | undefined => getStmt.get(id),

  create: (input: TaskInput): Task => {
    const result = insertStmt.run(
      input.title,
      input.details ?? null,
      input.kind ?? 'task',
      input.organization_id ?? null,
      input.contact_id ?? null,
      input.project_id ?? null,
      input.due_date ?? null,
      input.status ?? 'open'
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },

  update: (id: number, patch: TaskUpdate): Task | undefined => {
    const current = getStmt.get(id);
    if (!current) return undefined;
    const nextStatus = patch.status ?? current.status;
    updateStmt.run(
      patch.title ?? current.title,
      patch.details !== undefined ? (patch.details ?? null) : current.details,
      patch.kind ?? current.kind,
      patch.organization_id !== undefined ? (patch.organization_id ?? null) : current.organization_id,
      patch.contact_id !== undefined ? (patch.contact_id ?? null) : current.contact_id,
      patch.project_id !== undefined ? (patch.project_id ?? null) : current.project_id,
      patch.due_date !== undefined ? (patch.due_date ?? null) : current.due_date,
      nextStatus,
      nextStatus,
      nextStatus,
      id
    );
    return getStmt.get(id);
  },

  complete: (id: number): Task | undefined => {
    const result = completeStmt.run(id);
    if (result.changes === 0) return undefined;
    return getStmt.get(id);
  },

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
