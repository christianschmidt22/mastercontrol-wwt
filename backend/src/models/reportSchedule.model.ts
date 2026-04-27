import { db } from '../db/database.js';

/**
 * Phase 2 / Step 5a — reportSchedule model.
 *
 * Backed by `report_schedules` from migration 006_reports.sql:
 *   id, report_id, cron_expr, enabled (0|1),
 *   next_run_at INTEGER (UNIX seconds), last_run_at INTEGER,
 *   created_at.
 *
 * `next_run_at` / `last_run_at` are stored as INTEGER UNIX seconds so they
 * round-trip cleanly through JSON (no floating-point noise) — see the
 * Phase 2 plan § 006_reports.sql.
 */

interface ReportScheduleRow {
  id: number;
  report_id: number;
  cron_expr: string;
  enabled: number;
  next_run_at: number | null;
  last_run_at: number | null;
  created_at: string;
}

export interface ReportSchedule {
  id: number;
  report_id: number;
  cron_expr: string;
  enabled: boolean;
  next_run_at: number | null;
  last_run_at: number | null;
  created_at: string;
}

export interface ReportScheduleInput {
  cron_expr: string;
  enabled?: boolean;
  next_run_at?: number | null;
}

const listByReportStmt = db.prepare<[number], ReportScheduleRow>(
  `SELECT * FROM report_schedules
    WHERE report_id = ?
    ORDER BY id ASC`,
);

const getStmt = db.prepare<[number], ReportScheduleRow>(
  'SELECT * FROM report_schedules WHERE id = ?',
);

const getByReportStmt = db.prepare<[number], ReportScheduleRow>(
  `SELECT * FROM report_schedules
    WHERE report_id = ?
    ORDER BY id ASC
    LIMIT 1`,
);

const getEnabledStmt = db.prepare<[], ReportScheduleRow>(
  `SELECT s.*
     FROM report_schedules s
     JOIN reports r ON r.id = s.report_id
    WHERE s.enabled = 1
      AND r.enabled = 1`,
);

const insertStmt = db.prepare<
  [number, string, number, number | null]
>(
  `INSERT INTO report_schedules (report_id, cron_expr, enabled, next_run_at)
   VALUES (?, ?, ?, ?)`,
);

const updateCoreStmt = db.prepare<[string, number, number | null, number]>(
  `UPDATE report_schedules
      SET cron_expr = ?,
          enabled = ?,
          next_run_at = ?
    WHERE id = ?`,
);

const updateLastRunStmt = db.prepare<[number, number]>(
  'UPDATE report_schedules SET last_run_at = ? WHERE id = ?',
);

const updateNextRunStmt = db.prepare<[number | null, number]>(
  'UPDATE report_schedules SET next_run_at = ? WHERE id = ?',
);

const deleteStmt = db.prepare<[number]>(
  'DELETE FROM report_schedules WHERE id = ?',
);

const deleteByReportExceptStmt = db.prepare<[number, number]>(
  'DELETE FROM report_schedules WHERE report_id = ? AND id != ?',
);

const replaceScheduleForReport = db.transaction(
  (reportId: number, input: ReportScheduleInput): number => {
    const existing = getByReportStmt.get(reportId);
    if (existing) {
      const enabled = input.enabled === false ? 0 : 1;
      updateCoreStmt.run(input.cron_expr, enabled, input.next_run_at ?? null, existing.id);
      deleteByReportExceptStmt.run(reportId, existing.id);
      return existing.id;
    }
    const result = insertStmt.run(
      reportId,
      input.cron_expr,
      input.enabled === false ? 0 : 1,
      input.next_run_at ?? null,
    );
    return Number(result.lastInsertRowid);
  },
);

function hydrate(row: ReportScheduleRow): ReportSchedule {
  return {
    id: row.id,
    report_id: row.report_id,
    cron_expr: row.cron_expr,
    enabled: row.enabled === 1,
    next_run_at: row.next_run_at,
    last_run_at: row.last_run_at,
    created_at: row.created_at,
  };
}

export const reportScheduleModel = {
  listByReport: (reportId: number): ReportSchedule[] =>
    listByReportStmt.all(reportId).map(hydrate),

  get: (id: number): ReportSchedule | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  /** Used by scheduler.service to register node-cron jobs. */
  getEnabled: (): ReportSchedule[] =>
    getEnabledStmt.all().map(hydrate),

  /**
   * Idempotent upsert keyed on report_id. Phase 2 supports one canonical cron
   * expression per report; changing the expression replaces the existing row
   * instead of adding a second enabled schedule.
   */
  upsert: (
    reportId: number,
    input: ReportScheduleInput,
  ): ReportSchedule => {
    const id = replaceScheduleForReport(reportId, input);
    return hydrate(getStmt.get(id)!);
  },

  updateLastRun: (id: number, fireTime: number): void => {
    updateLastRunStmt.run(fireTime, id);
  },

  updateNextRun: (id: number, nextAt: number | null): void => {
    updateNextRunStmt.run(nextAt, id);
  },

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
