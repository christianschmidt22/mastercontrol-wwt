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
import type { ScheduledTask } from 'node-cron';
import { reportScheduleModel } from '../models/reportSchedule.model.js';
import { runReport } from './reports.service.js';
import { getMostRecentCronTime } from '../lib/cronUtils.js';
import { scanExternalMasterNoteEdits } from './masterNote.service.js';
import { logAlert } from '../models/systemAlert.model.js';
import { getHeartbeatConfig, runHeartbeatOnce } from './heartbeat.service.js';

interface RegisteredSchedule {
  cronExpr: string;
  task: ScheduledTask;
}

let schedulerStarted = false;
const registered = new Map<number, RegisteredSchedule>();
let masterNoteScanTask: ScheduledTask | null = null;
let heartbeatTask: ScheduledTask | null = null;
let heartbeatCronExpr: string | null = null;
let heartbeatRunning = false;

/** Hourly cron expression: top of every hour. */
const MASTER_NOTE_SCAN_CRON = '0 * * * *';

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
    // runReport already records the failure on the report_runs row. We catch
    // here so one failing schedule doesn't abort catch-up for the rest of the
    // loop, and so a fresh-DB / no-API-key boot doesn't escalate to a
    // top-level warning every time.
    try {
      await runReport(s.id, mostRecentFireTime);
    } catch (err) {
      console.warn('[scheduler] missed-job runReport failed', {
        schedule_id: s.id,
        fire_time: mostRecentFireTime,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Register a live `node-cron` task per enabled schedule. Tasks are tracked so
 * UI edits can reschedule them without requiring a backend restart. The
 * `report_runs` UNIQUE constraint plus `runMissedJobs()` cover the edge case
 * where the in-process tick and the catch-up path race on the same nominal
 * fire-time.
 */
export function startInProcessScheduler(): void {
  schedulerStarted = true;
  refreshInProcessScheduler();
  registerMasterNoteScanJob();
  registerHeartbeatJob();
}

/**
 * Outlook sync — every 15 minutes.
 * Fetches inbox + sentItems from Microsoft Graph, upserts into
 * outlook_messages, and runs org mention matching. No-ops if not connected.
 */
function registerHeartbeatJob(): void {
  const { check_interval_minutes: interval } = getHeartbeatConfig();
  const cronExpr = interval === 60 ? '0 * * * *' : `*/${interval} * * * *`;

  if (heartbeatTask && heartbeatCronExpr === cronExpr) return;
  if (heartbeatTask) {
    heartbeatTask.stop();
    heartbeatTask = null;
  }

  heartbeatCronExpr = cronExpr;
  heartbeatTask = cron.schedule(cronExpr, () => {
    void runHeartbeatSafely();
  });
  void runHeartbeatSafely();
}

async function runHeartbeatSafely(): Promise<void> {
  if (heartbeatRunning) return;
  heartbeatRunning = true;
  try {
    await runHeartbeatOnce();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logAlert('warn', 'heartbeat', `Heartbeat job failed: ${message}`);
  } finally {
    heartbeatRunning = false;
  }
}

/**
 * Hourly job: re-scan master_notes.md files for external edits (e.g. from
 * VS Code or OneDrive sync) and feed any changes through the LLM extraction
 * pipeline. Idempotent w.r.t. content sha — `processMasterNote` short-
 * circuits when nothing has changed since the last ingest.
 */
function registerMasterNoteScanJob(): void {
  if (masterNoteScanTask) return;
  masterNoteScanTask = cron.schedule(MASTER_NOTE_SCAN_CRON, () => {
    scanExternalMasterNoteEdits().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logAlert(
        'warn',
        'masterNoteScan',
        `External master-note scan job failed: ${message}`,
      );
    });
  });
}

export function notifySchedulesChanged(): void {
  if (!schedulerStarted) return;
  refreshInProcessScheduler();
}

export function stopInProcessScheduler(): void {
  for (const { task } of registered.values()) {
    task.stop();
  }
  registered.clear();
  if (masterNoteScanTask) {
    masterNoteScanTask.stop();
    masterNoteScanTask = null;
  }
  if (heartbeatTask) {
    heartbeatTask.stop();
    heartbeatTask = null;
  }
  heartbeatCronExpr = null;
  heartbeatRunning = false;
  schedulerStarted = false;
}

export function notifyHeartbeatConfigChanged(): void {
  if (!schedulerStarted) return;
  registerHeartbeatJob();
}

export function refreshInProcessScheduler(): void {
  const schedules = reportScheduleModel.getEnabled();
  const enabledIds = new Set(schedules.map((s) => s.id));

  for (const [id, entry] of registered) {
    const schedule = schedules.find((s) => s.id === id);
    if (!schedule || schedule.cron_expr !== entry.cronExpr) {
      entry.task.stop();
      registered.delete(id);
    }
  }

  for (const s of schedules) {
    if (registered.has(s.id)) continue;

    const task = cron.schedule(s.cron_expr, () => {
      const nowSecs = Math.floor(Date.now() / 1000) + 1;
      const fireTime = getMostRecentCronTime(s.cron_expr, nowSecs) ?? Math.floor(Date.now() / 1000);
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
    registered.set(s.id, { cronExpr: s.cron_expr, task });
  }

  for (const id of registered.keys()) {
    if (!enabledIds.has(id)) {
      const entry = registered.get(id);
      entry?.task.stop();
      registered.delete(id);
    }
  }
}
