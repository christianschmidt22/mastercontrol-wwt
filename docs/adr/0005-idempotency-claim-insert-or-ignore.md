# ADR-0005: Idempotency via claim() on UNIQUE(schedule_id, fire_time)

**Status**: Accepted
**Date**: 2026-04-25
**Implements**: R-028, docs/REVIEW.md

---

## Context

The scheduler can fire a job more than once for the same nominal cron
fire-time. Two concrete scenarios:

1. **Machine wake after suspend**: `start()` calls `runMissedJobs()`.
   If the backend also crashed and was restarted by the hourly Task
   Scheduler tick, both the logon-trigger start and the tick's
   `scheduler:tick` CLI could attempt the same missed fire within a
   short window.

2. **Clock-aligned node-cron tick meets catch-up**: If the backend is
   restarted at the exact minute a cron expression fires, the live
   `node-cron` handler and the `runMissedJobs()` catch-up in `start()`
   may both compute the same `fire_time`.

Without idempotency, both callers would execute the Anthropic call and
write two report files for the same nominal run — wasteful and
potentially confusing.

The question was which layer should own the idempotency guarantee and
how to implement it with the minimum of coordination overhead.

### Option A — Application-level lock (mutex / advisory DB lock)

Before executing, the service acquires an in-process mutex and checks
whether a run for this `(schedule_id, fire_time)` already exists.

*Cons*: Does not protect across the process restart boundary. The
crash-restart case (two separate processes) is the primary failure mode.
An in-process mutex is useless there.

### Option B — Separate "check then act" DB query

Before inserting a `report_runs` row, do `SELECT 1 FROM report_runs
WHERE schedule_id = ? AND fire_time = ?`. If a row exists, skip.

*Cons*: Check-then-act is a race condition — two concurrent callers
(even in the same process via async interleaving) can both see "no row"
and both proceed to insert. The window is small but real.

### Option C — INSERT OR IGNORE on UNIQUE(schedule_id, fire_time) (chosen)

The `report_runs` table carries:

```sql
UNIQUE(schedule_id, fire_time)
```

`reportRunModel.claim()` does:

```sql
INSERT OR IGNORE INTO report_runs (schedule_id, report_id, fire_time, status)
VALUES (?, ?, ?, 'queued');
```

`INSERT OR IGNORE` is atomic in SQLite. Exactly one caller's insert
succeeds; all others get `changes = 0`. The caller checks
`db.lastInsertRowid` to determine whether it won.

---

## Decision

**INSERT OR IGNORE on `UNIQUE(schedule_id, fire_time)`** is the
idempotency primitive.

`reportRunModel.claim({ schedule_id, report_id, fire_time })` returns:
- The newly inserted `ReportRun` row if `changes = 1` (this caller won).
- `undefined` if `changes = 0` (another caller already claimed it —
  skip execution).

The `id` is read from `db.lastInsertRowid` immediately after the INSERT,
which is the correct synchronous better-sqlite3 pattern for fetching
the auto-incremented PK without a second SELECT round-trip.

The UNIQUE constraint applies only when `schedule_id IS NOT NULL`. SQLite
treats `NULL` as distinct in UNIQUE constraints, so ad-hoc "run now"
calls (with `schedule_id = NULL`) can all insert even for the same
`fire_time` — this is intentional.

---

## Consequences

### Positive
- Idempotency is enforced at the DB layer, which survives process
  restarts. No in-process state is needed.
- `INSERT OR IGNORE` is a single atomic statement. No race condition.
- The UNIQUE index also serves as a fast lookup key for history queries.
- Adding a second scheduler process (hypothetical future) would be safe
  without changing any application logic.

### Negative / trade-offs
- `db.lastInsertRowid` is `0` when `changes = 0` (the insert was
  ignored). The caller must check `changes` explicitly, not just test
  whether `lastInsertRowid` is nonzero. `reportRunModel.claim()` handles
  this: it returns `undefined` on `changes = 0`, and callers treat
  `undefined` as "already claimed — skip".
- Ad-hoc runs are not deduplicated. Two rapid "run now" clicks on the
  same report produce two runs. This is intentional — manual runs are
  driven by explicit user intent and should not silently collapse.

---

## References
- `backend/src/models/reportRun.model.ts` — `claim()` implementation
- `backend/src/db/migrations/006_reports.sql` — UNIQUE constraint DDL
- `backend/src/services/scheduler.service.ts` — `runMissedJobs()` caller
- `backend/src/services/reports.service.ts` — `runReport()` caller
- `docs/REVIEW.md` R-028 — requirement origin
