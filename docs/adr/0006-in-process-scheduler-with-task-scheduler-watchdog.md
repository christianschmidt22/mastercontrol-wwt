# ADR-0006: In-process node-cron with Windows Task Scheduler as watchdog

**Status**: Accepted
**Date**: 2026-04-25
**Depends on**: ADR-0004 (Task Scheduler over Windows Service)

---

## Context

ADR-0004 decided to use Windows Task Scheduler instead of a Windows
Service for Phase 2 scheduling. That decision answered the question of
*how to start the backend*. This ADR answers a narrower question: once
the backend is running, **how do scheduled jobs fire within the process**?

Two sub-options exist inside the Task-Scheduler-only approach:

### Option A — OS-only scheduling (no in-process scheduler)

Every job fires via a dedicated Windows Task Scheduler entry. Each entry
runs a CLI command (`npm run scheduler:tick --schedule=<id>`) at its cron
time. The backend process has no awareness of time; it just executes work
when the CLI calls the API.

*Pros*: No in-process timing logic. Failures are isolated — one schedule's
CLI invocation crashing does not affect others.

*Cons*:
- Each report requires its own Task Scheduler entry. Managing N schedules
  means N entries registered via PowerShell. Adding or removing a user-defined
  report requires re-running the registration script.
- Windows Task Scheduler has limited cron-expression support. Arbitrary
  cron expressions would need a translation layer.
- The backend must handle concurrent HTTP calls from multiple simultaneous
  CLI invocations. Currently that is safe (better-sqlite3 is synchronous)
  but the mental model is more complex.
- No way to display "next run at" or "last ran at" in the UI without
  re-querying the Task Scheduler from the backend — a privileged OS call.

### Option B — In-process node-cron + Task Scheduler watchdog (chosen)

`node-cron` runs inside the backend Express process. Each enabled
`report_schedules` row registers one `node-cron` task at process start
(`scheduler.service.start()`). The Task Scheduler has exactly **two
static entries** (registered once at install, independent of how many
reports the user creates):

1. **At logon** — starts the backend. The backend's `start()` call
   registers all active schedules and fires catch-up.
2. **Hourly safety-net** — runs `scheduler:tick` CLI to call
   `runMissedJobs()` and exit. This is the watchdog: it catches anything
   the in-process scheduler missed (e.g., the backend crashed between
   logon start and the next cron tick).

---

## Decision

**In-process `node-cron` is the primary scheduler. Windows Task Scheduler
provides exactly two static entries (logon start + hourly watchdog), not
one-per-schedule.**

This means:
- Adding a new user-defined report creates a `report_schedules` row in
  the DB. On next `start()` (or the next `scheduler:tick` call), it is
  registered automatically. No Task Scheduler manipulation required.
- `node-cron` fires jobs at their nominal cron times while the process
  is alive. The fire timestamp is computed at the moment of firing (wall
  clock, floored to seconds).
- `runMissedJobs()` catches fire-times missed while the process was down
  (machine suspended, process crashed). The `UNIQUE(schedule_id, fire_time)`
  idempotency primitive (ADR-0005) makes the combination safe.
- `stop()` destroys all `node-cron` tasks and sets `activeTasks = null`.
  Calling `start()` again after `stop()` re-registers everything fresh.
  This is used in tests and on graceful shutdown.

---

## Consequences

### Positive
- Zero OS-level side effects when a report is created, updated, or
  deleted — all scheduling state lives in the DB and the in-process
  task map.
- The UI can display next/last run times from `report_schedules` DB
  columns, updated by `scheduler.service` directly.
- The Task Scheduler install script (`docs/ops/scheduler-install.md`)
  remains a fixed two-entry PowerShell script regardless of how many
  reports the user defines.
- `node-cron` validates cron expressions at registration time and logs
  a warning for invalid ones (skips them cleanly rather than crashing).

### Negative / trade-offs
- If the backend process dies after `start()` returns but before the
  next `node-cron` tick, the hourly `scheduler:tick` will call
  `runMissedJobs()` and catch up. But the HTTP server is down until the
  process is restarted (logon trigger or manual). This is acceptable
  for a single-user local app.
- Schedule changes (new report, edited cron expression, disabled
  schedule) take effect on the next call to `start()`. For a running
  process this means changes are not live-applied. Workaround: restart
  the backend, or (future) add a `POST /api/scheduler/reload` endpoint.

---

## References
- `backend/src/services/scheduler.service.ts`
- `docs/adr/0004-task-scheduler-not-windows-service.md` — parent decision
- `docs/adr/0005-idempotency-claim-insert-or-ignore.md` — idempotency
- `docs/REVIEW.md` Performance #10
