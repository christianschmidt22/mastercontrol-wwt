# ADR-0004: Use Windows Task Scheduler, not a Windows Service, for Phase 2 scheduling

**Status**: Accepted
**Date**: 2026-04-25
**Deciders**: Christian Schmidt (user), architecture review (Q-3 resolution)
**Supersedes**: the `§ Scheduler design` section of `docs/PRD.md` v0.4 which
described a Windows Service as the primary runtime.

---

## Context

MasterControl needs scheduled jobs — first the Daily Task Review, later
other user-defined reports. The primary constraint is a Windows 11 laptop
that suspends whenever the lid closes.

Two approaches were evaluated:

### Option A — Windows Service (original PRD plan)

Install the Node backend as a Windows Service via `node-windows` or `nssm`.
A Task Scheduler watchdog entry pings the backend's `/health` endpoint every
5 minutes during a logged-in session and starts the service if it's not
responding.

*Pros*: Services survive user logoff; service manager provides structured
restart policies; Windows Event Log integration.

*Cons*:
- Requires an elevated (admin) PowerShell session at install time — UAC
  prompt every time the service is installed or updated.
- `node-windows` installs a local copy of `winsw.exe` + generates XML service
  definitions — two non-trivial moving parts the user must understand to
  debug.
- `nssm` is a third-party binary that must be downloaded separately and kept
  current.
- A service that survives logoff provides **no correctness benefit** for this
  use case: the user's laptop is never "on without being logged in." It is
  either active (lid open, user at keyboard) or suspended (lid closed).
- The Performance reviewer's item #10 noted: "Collapse to Task Scheduler
  only — the correctness ceiling is the same for a laptop that only runs
  while the user is logged in."

### Option B — Windows Task Scheduler only (this decision)

Two Task Scheduler entries, registered once via a PowerShell script
(`docs/ops/scheduler-install.md`):

1. **`MasterControl Backend`** — trigger: *At logon* (current user). Action:
   start the Express backend. The backend process is long-lived for the
   duration of the session.

2. **`MasterControl Scheduler Tick`** — trigger: *Repeat every 1 hour*
   (active when user is logged in). Action: `npm run --prefix
   C:\mastercontrol\backend scheduler:tick`. This runs a small CLI script
   that calls `runMissedJobs()` and exits.

Inside the running backend process, `node-cron` fires jobs at their normal
cron times while the process is awake.

On every backend startup (including after the machine wakes from suspend),
`runMissedJobs()` computes the most-recent fire-time for each enabled
schedule and fires any job whose `last_run_at` is earlier than that
fire-time. Idempotency is enforced by `UNIQUE(schedule_id, fire_time)` in
`report_runs` — a second call for the same fire-time is a silent no-op.

*Pros*:
- Installation is a single `Register-ScheduledTask` PowerShell command run
  as the current user — **no UAC elevation required**.
- No third-party binaries beyond what npm already provides.
- The Task Scheduler entries are visible in the standard Windows Task
  Scheduler UI, making them easy to inspect, pause, or delete.
- Equivalent correctness to Option A for the target hardware: the backend
  runs whenever the user is logged in; `runMissedJobs()` catches anything
  that fired while the lid was closed; the hourly safety-net tick catches
  any crash that the logon trigger missed.

*Cons*:
- Lower correctness ceiling than a Service: if the user is logged in but
  hasn't started the backend (unlikely given the logon trigger, but
  possible), reports don't run until the backend is started.
- No Windows Event Log integration — failures surface in the backend's
  stdout log only.

---

## Decision

**Use Windows Task Scheduler only (Option B).**

The correctness gap between Option A and Option B is negligible for a
single-user laptop app. Option B installs without elevation, has no
third-party binary dependencies, and is debuggable by any user who can open
Task Scheduler. The `runMissedJobs()` catch-up logic provides the same
"no silent drops on suspend" guarantee that motivated the Service option in
the first place.

---

## Consequences

### Positive
- Install is a single PowerShell script the user can read and audit.
- No admin UAC prompt at install or update time.
- No `node-windows` or `nssm` dependencies in `package.json`.
- `docs/ops/scheduler-install.md` is a short, self-contained one-pager.
- The architecture is honest about the hardware: the backend is a dev-style
  process, not an enterprise service.

### Negative / mitigations
- If the backend crashes and the user doesn't restart it, the hourly
  `scheduler:tick` will run `runMissedJobs()` but cannot start the HTTP
  server (the tick script is a minimal CLI that exits after running jobs).
  **Mitigation**: the logon Task Scheduler entry re-starts the backend on
  next logon; the hourly tick ensures reports still fire even if the HTTP
  server is down.
- No structured restart policy. **Mitigation**: acceptable for a single-user
  local app. If stability becomes a concern, promote to a Service in Phase 3
  (see below).

### Future
If the user's requirements ever include:
- Running reports overnight while the machine is awake but the user is
  logged off, or
- 24/7 background operation on a machine that stays on

…the path forward is to register the backend as a Service via `nssm` or
`node-windows`, running as the interactive user (not LocalSystem — per
Security reviewer item #5a). The `runMissedJobs()` + idempotency logic is
equally correct under a Service runtime, so that transition is mechanical.

---

## References
- `docs/REVIEW.md` item Q-3 (open question now resolved by this ADR)
- `docs/REVIEW.md` Performance #10 (recommendation to collapse to Task Scheduler)
- `docs/REVIEW.md` Security #5a (if Service, run as interactive user)
- `docs/plans/phase-2.md` § Step 6 — Scheduler
- `docs/ops/scheduler-install.md` — install script (created in Phase 2 Step 11)
