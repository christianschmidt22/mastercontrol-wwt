import { db } from '../db/database.js';

/**
 * Phase 2 / Step 5a — reportRun model.
 *
 * Backed by `report_runs` from migration 006_reports.sql with
 * UNIQUE(schedule_id, fire_time). `create()` uses INSERT OR IGNORE so a
 * second tick fired for the same `(schedule_id, fire_time)` — for example
 * if `runMissedJobs()` and a node-cron tick race at the cron boundary —
 * silently no-ops rather than throwing. The caller can detect whether the
 * row was newly inserted via the returned `created` flag.
 */

export type ReportRunStatus = 'queued' | 'running' | 'done' | 'failed';

interface ReportRunRow {
  id: number;
  schedule_id: number;
  fire_time: number;
  started_at: string;
  finished_at: string | null;
  status: ReportRunStatus;
  output_path: string | null;
  output_sha256: string | null;
  summary: string | null;
  error: string | null;
}

export interface ReportRun {
  id: number;
  schedule_id: number;
  fire_time: number;
  started_at: string;
  finished_at: string | null;
  status: ReportRunStatus;
  output_path: string | null;
  output_sha256: string | null;
  summary: string | null;
  error: string | null;
}

export interface ReportRunInput {
  schedule_id: number;
  fire_time: number;
  status?: ReportRunStatus;
}

export interface ReportRunStatusUpdate {
  output_path?: string | null;
  output_sha256?: string | null;
  summary?: string | null;
  error?: string | null;
  finished_at?: string | null;
}

export interface ReportRunCreateResult {
  /** The run row, either newly inserted or pre-existing. */
  run: ReportRun;
  /** True when this call inserted a new row, false when UNIQUE collided. */
  created: boolean;
}

// INSERT OR IGNORE + RETURNING * — when the UNIQUE(schedule_id, fire_time)
// constraint trips, RETURNING returns no rows. We then re-query the existing
// row to populate `run` and report `created=false` to the caller.
const insertIgnoreStmt = db.prepare<
  [number, number, ReportRunStatus],
  ReportRunRow
>(
  `INSERT OR IGNORE INTO report_runs (schedule_id, fire_time, status)
   VALUES (?, ?, ?)
   RETURNING *`,
);

const findByKeyStmt = db.prepare<[number, number], ReportRunRow>(
  `SELECT * FROM report_runs
    WHERE schedule_id = ? AND fire_time = ?
    LIMIT 1`,
);

const getStmt = db.prepare<[number], ReportRunRow>(
  'SELECT * FROM report_runs WHERE id = ?',
);

const listByScheduleStmt = db.prepare<[number, number], ReportRunRow>(
  `SELECT * FROM report_runs
    WHERE schedule_id = ?
    ORDER BY fire_time DESC, id DESC
    LIMIT ?`,
);

const getLastRunStmt = db.prepare<[number], ReportRunRow>(
  `SELECT * FROM report_runs
    WHERE schedule_id = ?
    ORDER BY fire_time DESC, id DESC
    LIMIT 1`,
);

const updateStatusStmt = db.prepare<
  [
    ReportRunStatus,
    string | null, // output_path
    string | null, // output_sha256
    string | null, // summary
    string | null, // error
    string | null, // finished_at — caller passes ISO string or null
    number,
  ]
>(
  `UPDATE report_runs
      SET status = ?,
          output_path     = COALESCE(?, output_path),
          output_sha256   = COALESCE(?, output_sha256),
          summary         = COALESCE(?, summary),
          error           = COALESCE(?, error),
          finished_at     = COALESCE(?, finished_at)
    WHERE id = ?`,
);

function hydrate(row: ReportRunRow): ReportRun {
  return { ...row };
}

export const reportRunModel = {
  /**
   * Insert a new run row, idempotent on UNIQUE(schedule_id, fire_time).
   * Returns `{ run, created }` so callers can detect whether they actually
   * acquired the run slot or another tick beat them to it.
   */
  create: (input: ReportRunInput): ReportRunCreateResult => {
    const status: ReportRunStatus = input.status ?? 'queued';
    const inserted = insertIgnoreStmt.get(
      input.schedule_id,
      input.fire_time,
      status,
    );
    if (inserted) {
      return { run: hydrate(inserted), created: true };
    }
    // Conflict — fetch the pre-existing row.
    const existing = findByKeyStmt.get(input.schedule_id, input.fire_time);
    if (!existing) {
      // Should be unreachable: INSERT OR IGNORE returned nothing yet no
      // existing row was found. Surface a clear error rather than an
      // implicit undefined.
      throw new Error(
        `reportRunModel.create: insert ignored but no existing row found for schedule=${input.schedule_id} fire_time=${input.fire_time}`,
      );
    }
    return { run: hydrate(existing), created: false };
  },

  get: (id: number): ReportRun | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  listBySchedule: (scheduleId: number, limit = 20): ReportRun[] =>
    listByScheduleStmt.all(scheduleId, limit).map(hydrate),

  getLastRun: (scheduleId: number): ReportRun | undefined => {
    const row = getLastRunStmt.get(scheduleId);
    return row ? hydrate(row) : undefined;
  },

  /**
   * Update a run row's status, optionally setting any of the result fields.
   * `finished_at` defaults to the current ISO timestamp when status is
   * 'done' or 'failed' and the caller did not explicitly supply one.
   * Other extras (output_path, output_sha256, summary, error) are merged
   * via COALESCE so passing `undefined` leaves the existing column value
   * untouched.
   */
  updateStatus: (
    id: number,
    status: ReportRunStatus,
    extra: ReportRunStatusUpdate = {},
  ): void => {
    let finishedAt: string | null;
    if (extra.finished_at !== undefined) {
      finishedAt = extra.finished_at;
    } else if (status === 'done' || status === 'failed') {
      finishedAt = new Date().toISOString();
    } else {
      finishedAt = null;
    }
    updateStatusStmt.run(
      status,
      extra.output_path ?? null,
      extra.output_sha256 ?? null,
      extra.summary ?? null,
      extra.error ?? null,
      finishedAt,
      id,
    );
  },
};
