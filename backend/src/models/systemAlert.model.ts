import { db } from '../db/database.js';
import { redactError } from '../middleware/errorHandler.js';

export type AlertSeverity = 'error' | 'warn' | 'info';

export interface SystemAlert {
  id: number;
  severity: AlertSeverity;
  source: string;
  message: string;
  detail: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface AlertRow {
  id: number;
  severity: AlertSeverity;
  source: string;
  message: string;
  detail: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const createStmt = db.prepare<{
  severity: AlertSeverity;
  source: string;
  message: string;
  detail: string | null;
}>(`
  INSERT INTO system_alerts (severity, source, message, detail)
  VALUES (@severity, @source, @message, @detail)
`);

const listUnreadStmt = db.prepare<[], AlertRow>(`
  SELECT * FROM system_alerts
  WHERE read_at IS NULL AND resolved_at IS NULL
  ORDER BY created_at DESC
  LIMIT 100
`);

const listRecentStmt = db.prepare<[number], AlertRow>(`
  SELECT * FROM system_alerts ORDER BY created_at DESC LIMIT ?
`);

const markReadStmt = db.prepare<[number]>(`
  UPDATE system_alerts SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?
`);

const markAllReadStmt = db.prepare<[]>(`
  UPDATE system_alerts
  SET read_at = COALESCE(read_at, datetime('now'))
  WHERE read_at IS NULL AND resolved_at IS NULL
`);

const unreadCountStmt = db.prepare<[], { cnt: number }>(`
  SELECT COUNT(*) as cnt FROM system_alerts WHERE read_at IS NULL AND resolved_at IS NULL
`);

const resolveStmt = db.prepare<[number]>(`
  UPDATE system_alerts
  SET resolved_at = COALESCE(resolved_at, datetime('now')),
      read_at = COALESCE(read_at, datetime('now'))
  WHERE id = ?
`);

const unresolveStmt = db.prepare<[number]>(`
  UPDATE system_alerts SET resolved_at = NULL WHERE id = ?
`);

export const systemAlertModel = {
  create(severity: AlertSeverity, source: string, message: string, detail?: string): SystemAlert {
    const result = createStmt.run({ severity, source, message, detail: detail ?? null });
    return {
      id: result.lastInsertRowid as number,
      severity,
      source,
      message,
      detail: detail ?? null,
      read_at: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    };
  },

  listUnread(): SystemAlert[] {
    return listUnreadStmt.all();
  },

  listRecent(limit = 50): SystemAlert[] {
    return listRecentStmt.all(limit);
  },

  listFiltered(input: {
    status?: 'active' | 'unread' | 'unresolved' | 'resolved' | 'all';
    severity?: AlertSeverity | 'all';
    source?: string | null;
    limit?: number;
  } = {}): SystemAlert[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const status = input.status ?? 'active';

    if (status === 'active') clauses.push('read_at IS NULL AND resolved_at IS NULL');
    if (status === 'unread') clauses.push('read_at IS NULL');
    if (status === 'unresolved') clauses.push('resolved_at IS NULL');
    if (status === 'resolved') clauses.push('resolved_at IS NOT NULL');
    if (input.severity && input.severity !== 'all') {
      clauses.push('severity = ?');
      params.push(input.severity);
    }
    if (input.source) {
      clauses.push('source = ?');
      params.push(input.source);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(input.limit ?? 100);
    return db
      .prepare<unknown[], AlertRow>(`SELECT * FROM system_alerts ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params);
  },

  markRead(id: number): boolean {
    return markReadStmt.run(id).changes > 0;
  },

  markAllRead(): number {
    return markAllReadStmt.run().changes;
  },

  unreadCount(): number {
    return unreadCountStmt.get()?.cnt ?? 0;
  },

  resolve(id: number): boolean {
    return resolveStmt.run(id).changes > 0;
  },

  unresolve(id: number): boolean {
    return unresolveStmt.run(id).changes > 0;
  },
};

// ---------------------------------------------------------------------------
// Convenience helper used by background jobs to log failures without
// importing the full model — keeps the call site to one line.
// ---------------------------------------------------------------------------
export function logAlert(
  severity: AlertSeverity,
  source: string,
  message: string,
  err?: unknown,
): void {
  let detail: string | undefined;
  if (err instanceof Error) detail = err.message;
  else if (err != null) detail = JSON.stringify(err);
  try {
    systemAlertModel.create(severity, source, message, detail);
  } catch (dbErr) {
    // Don't let a broken alerts table crash the job that's already failing.
    // R-013: route through the redactor before logging — `dbErr` may include
    // sensitive payloads (settings values, Anthropic auth headers, etc.).
    console.error('[systemAlert] failed to write alert', redactError(dbErr));
  }
}
