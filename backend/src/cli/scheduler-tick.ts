/**
 * `scheduler:tick` CLI — invoked hourly by Windows Task Scheduler as a
 * safety net behind the in-process `node-cron` scheduler that runs inside
 * the long-lived backend process (Phase 2 § Step 6a, Decision B).
 *
 * Responsibilities:
 *   1. Apply any pending DB migrations (the long-lived backend would have
 *      done this on its own boot; we do it again here so the CLI is safe to
 *      run even if the user has not started the backend yet today).
 *   2. Run `runMissedJobs()` once. Each missed job is awaited; idempotency
 *      is guaranteed by `report_runs.UNIQUE(schedule_id, fire_time)` so the
 *      CLI can race the in-process scheduler without double-firing.
 *   3. Exit cleanly. The process must terminate so Task Scheduler frees its
 *      slot — there are no lingering timers / sockets to clean up after
 *      `runMissedJobs()` returns.
 *
 * Errors are logged via `console.error` (no shared logger in this codebase
 * yet; the redacting error handler lives in middleware/errorHandler.ts and
 * is wired to Express, not stdout). We log only the message to avoid the
 * raw-stack-trace leak risk addressed by R-013.
 */

import { runMigrations } from '../db/database.js';
import { runMissedJobs } from '../services/scheduler.service.js';

async function main(): Promise<void> {
  await runMigrations();
  await runMissedJobs();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[scheduler:tick] failed', { message });
    process.exit(1);
  });
