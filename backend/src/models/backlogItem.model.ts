import { db } from '../db/database.js';

export type BacklogStatus = 'open' | 'done' | 'snoozed';

export interface BacklogItem {
  id: number;
  title: string;
  notes: string | null;
  due_date: string | null;
  status: BacklogStatus;
  created_at: string;
  completed_at: string | null;
}

export interface BacklogItemCreate {
  title: string;
  notes?: string | null;
  due_date?: string | null;
  status?: BacklogStatus;
}

export interface BacklogItemUpdate {
  title?: string;
  notes?: string | null;
  due_date?: string | null;
  status?: BacklogStatus;
}

const listAllStmt = db.prepare<[], BacklogItem>(
  `SELECT * FROM backlog_items ORDER BY
     CASE status WHEN 'open' THEN 0 WHEN 'snoozed' THEN 1 ELSE 2 END,
     CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
     due_date ASC,
     created_at DESC`,
);

const listByStatusStmt = db.prepare<[BacklogStatus], BacklogItem>(
  `SELECT * FROM backlog_items WHERE status = ? ORDER BY
     CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
     due_date ASC,
     created_at DESC`,
);

const getStmt = db.prepare<[number], BacklogItem>(
  'SELECT * FROM backlog_items WHERE id = ?',
);

const insertStmt = db.prepare<
  [string, string | null, string | null, BacklogStatus]
>(
  `INSERT INTO backlog_items (title, notes, due_date, status)
   VALUES (?, ?, ?, ?)`,
);

// Straight UPDATE — caller resolves "leave existing vs. clear" before
// calling. completed_at is set to now() when status flips to 'done' and
// cleared otherwise.
const updateStmt = db.prepare<
  [string, string | null, string | null, BacklogStatus, string | null, number]
>(
  `UPDATE backlog_items
     SET title = ?,
         notes = ?,
         due_date = ?,
         status = ?,
         completed_at = ?
   WHERE id = ?`,
);

const completeStmt = db.prepare<[number]>(
  `UPDATE backlog_items
     SET status = 'done', completed_at = datetime('now')
   WHERE id = ?`,
);

const deleteStmt = db.prepare<[number]>('DELETE FROM backlog_items WHERE id = ?');

export const backlogItemModel = {
  list: (status?: BacklogStatus): BacklogItem[] =>
    status ? listByStatusStmt.all(status) : listAllStmt.all(),

  get: (id: number): BacklogItem | null => getStmt.get(id) ?? null,

  create: (input: BacklogItemCreate): BacklogItem => {
    const result = insertStmt.run(
      input.title,
      input.notes ?? null,
      input.due_date ?? null,
      input.status ?? 'open',
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },

  update: (id: number, patch: BacklogItemUpdate): BacklogItem | null => {
    const existing = getStmt.get(id);
    if (!existing) return null;

    const nextTitle = patch.title ?? existing.title;
    const nextNotes = 'notes' in patch ? (patch.notes ?? null) : existing.notes;
    const nextDue = 'due_date' in patch ? (patch.due_date ?? null) : existing.due_date;
    const nextStatus = patch.status ?? existing.status;

    let nextCompletedAt = existing.completed_at;
    if (nextStatus === 'done' && existing.completed_at === null) {
      nextCompletedAt = new Date().toISOString();
    } else if (nextStatus !== 'done') {
      nextCompletedAt = null;
    }

    updateStmt.run(nextTitle, nextNotes, nextDue, nextStatus, nextCompletedAt, id);
    return getStmt.get(id) ?? null;
  },

  complete: (id: number): BacklogItem | null => {
    completeStmt.run(id);
    return getStmt.get(id) ?? null;
  },

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
