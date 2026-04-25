import { db } from '../db/database.js';

export type TaskStatus = 'open' | 'done' | 'snoozed';

export interface Task {
  id: number;
  organization_id: number | null;
  contact_id: number | null;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface TaskInput {
  title: string;
  organization_id?: number | null;
  contact_id?: number | null;
  due_date?: string | null;
  status?: TaskStatus;
}

export interface TaskFilters {
  status?: TaskStatus;
  due_before?: string;
  org_id?: number;
}

export interface TaskUpdate {
  title?: string;
  due_date?: string | null;
  status?: TaskStatus;
}

const getStmt = db.prepare<[number], Task>('SELECT * FROM tasks WHERE id = ?');

const insertStmt = db.prepare<[string, number | null, number | null, string | null, TaskStatus]>(
  'INSERT INTO tasks (title, organization_id, contact_id, due_date, status) VALUES (?, ?, ?, ?, ?)'
);

const updateStmt = db.prepare<[string, string | null, TaskStatus, number]>(
  "UPDATE tasks SET title = ?, due_date = ?, status = ? WHERE id = ?"
);

const completeStmt = db.prepare<[number]>(
  "UPDATE tasks SET status = 'done', completed_at = datetime('now') WHERE id = ?"
);

const deleteStmt = db.prepare<[number]>('DELETE FROM tasks WHERE id = ?');

/**
 * Build the list query dynamically based on filters. All parameters are bound
 * to prevent injection; the WHERE clause is constructed from safe enum keys.
 */
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
      input.organization_id ?? null,
      input.contact_id ?? null,
      input.due_date ?? null,
      input.status ?? 'open'
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },

  update: (id: number, patch: TaskUpdate): Task | undefined => {
    const current = getStmt.get(id);
    if (!current) return undefined;
    updateStmt.run(
      patch.title ?? current.title,
      patch.due_date !== undefined ? (patch.due_date ?? null) : current.due_date,
      patch.status ?? current.status,
      id
    );
    return getStmt.get(id);
  },

  /** Sets status='done' and stamps completed_at = datetime('now').
   *  Returns the updated row or undefined if no task with that id exists. */
  complete: (id: number): Task | undefined => {
    const result = completeStmt.run(id);
    if (result.changes === 0) return undefined;
    return getStmt.get(id);
  },

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
