/**
 * In-process scheduler service (Phase 2 § Step 6a).
 *
 * Two responsibilities, called in this order from the Express startup path:
 *   1. `runMissedJobs()` — on boot, replay any cron fires that occurred while
 *      the process / machine was off. Compares each enabled schedule's
 *      `last_run_at` against `getMostRecentCronTime()`; if the latter is
 *      newer, calls `runReport(scheduleId, mostRecentFireTime)` and awaits
 *      it. The function does not return until every missed job finishes
 *      (completion order is unconstrained).
 *   2. `startInProcessScheduler()` — registers a `node-cron` job per enabled
 *      schedule for the lifetime of the process. The tasks run for the
 *      lifetime of the process; we don't track them because we don't stop
 *      them (the Express process exits with the user's machine).
 *
 * The `scheduler:tick` CLI calls `runMissedJobs()` on its own (without
 * registering live cron jobs) so the Windows Task Scheduler hourly safety
 * net catches anything the in-process scheduler missed (e.g. backend crash).
 *
 * Idempotency for double-fire scenarios is enforced by the
 * `UNIQUE(schedule_id, fire_time)` constraint on `report_runs` (Decision G);
 * `runReport` uses `INSERT OR IGNORE` so two ticks for the same `fire_time`
 * silently collapse to one run.
 */

import cron from 'node-cron';
import { reportScheduleModel } from '../models/reportSchedule.model.js';
import { runReport } from './reports.service.js';
import { getMostRecentCronTime } from '../lib/cronUtils.js';

/**
 * Replay any cron fires whose nominal fire-time is later than the schedule's
 * stored `last_run_at`. Awaits each `runReport` call so the function does not
 * return until every missed job has completed (or failed).
 */
export async function runMissedJobs(): Promise<void> {
  const nowSecs = Math.floor(Date.now() / 1000);
  const schedules = reportScheduleModel.getEnabled();

  for (const s of schedules) {
    const mostRecentFireTime = getMostRecentCronTime(s.cron_expr, nowSecs);
    if (mostRecentFireTime === null) continue;
    const lastRun = s.last_run_at;
    if (lastRun !== null && lastRun !== undefined && lastRun >= mostRecentFireTime) {
      // Already ran for this fire-time (or later); nothing to catch up.
      continue;
    }
    await runReport(s.id, mostRecentFireTime);
  }
}

/**
 * Register a live `node-cron` task per enabled schedule. Each tick fires
 * `runReport` with the current wall-clock time as the fire-time. The
 * `report_runs` UNIQUE constraint plus `runMissedJobs()` cover the edge case
 * where the in-process tick and the catch-up path race on the same fire-time.
 *
 * Tasks are not tracked / stopped — they run for the lifetime of the
 * process. This matches Phase 2 Decision B (in-process scheduler, Task
 * Scheduler hourly safety net).
 */
export function startInProcessScheduler(): void {
  const schedules = reportScheduleModel.getEnabled();
  for (const s of schedules) {
    cron.schedule(s.cron_expr, () => {
      const fireTime = Math.floor(Date.now() / 1000);
      // Fire-and-forget: cron callbacks have no awaiter. Errors inside
      // runReport are caught and recorded on the report_runs row by the
      // reports service itself, so the catch here is just defence-in-depth
      // to keep node-cron from logging an unhandled rejection.
      runReport(s.id, fireTime).catch((err) => {
        console.error('[scheduler] runReport failed', {
          schedule_id: s.id,
          fire_time: fireTime,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }
}
