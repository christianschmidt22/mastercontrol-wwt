# Scheduler Install — Windows Task Scheduler

**Decision context**: see [ADR-0004](../adr/0004-task-scheduler-not-windows-service.md) for why we use Task Scheduler instead of a Windows Service.

Two Task Scheduler entries are registered once under the current user account. No elevation (UAC) required.

---

## 1. Prerequisites

- Node 18.18 or later on PATH (verified: Node 24.15.0 on the target machine).
- Repo cloned at `C:\mastercontrol\`.
- `npm install` completed successfully in both workspaces.
- Claude Code authenticated with `claude /login`, and Settings ->
  **Core Claude Authentication** set to **Claude Code login** or **Auto**.
  An Anthropic API key remains an optional fallback if you force API-key mode.

---

## 2. Install — PowerShell commands

Open a regular (non-elevated) PowerShell terminal and run the two blocks below.

### 2a. MasterControl Backend — start at logon

```powershell
# Trigger: At logon of the current user.
# Action: start the full dev server (backend :3001 + frontend :5173).
# The root-level dev script uses concurrently to start both processes.

$action  = New-ScheduledTaskAction `
    -Execute 'npm.cmd' `
    -Argument '--prefix C:\mastercontrol run dev' `
    -WorkingDirectory 'C:\mastercontrol'

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName   'MasterControl Backend' `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -RunLevel   Limited `
    -Description 'Start MasterControl dev server at user logon.'
```

`-RunLevel Limited` means the task runs as the current user without elevation. `-ExecutionTimeLimit 0` removes the 72-hour default timeout so the long-lived server process is not killed.

### 2b. MasterControl Scheduler Tick — hourly safety net

```powershell
# Trigger: Every 1 hour, indefinitely, while the user is logged on.
# Action: run runMissedJobs() and exit 0.
# The tick CLI is idempotent; a second firing for the same fire_time is a no-op.

$action  = New-ScheduledTaskAction `
    -Execute 'npm.cmd' `
    -Argument '--prefix C:\mastercontrol\backend run scheduler:tick' `
    -WorkingDirectory 'C:\mastercontrol\backend'

$trigger = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Hours 1) `
    -Once `
    -At (Get-Date -Minute 0 -Second 0)

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances Queue

Register-ScheduledTask `
    -TaskName   'MasterControl Scheduler Tick' `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -RunLevel   Limited `
    -Description 'Hourly safety-net: run missed report jobs and exit.'
```

`-MultipleInstances Queue` prevents overlapping runs if a tick takes longer than expected. The 10-minute execution limit is generous; a tick normally completes in under 5 seconds.

---

## 3. Verification

**a. Confirm entries exist.**
Open Task Scheduler (`taskschd.msc`). In the left pane, select **Task Scheduler Library**. Both `MasterControl Backend` and `MasterControl Scheduler Tick` should appear with **Status: Ready** and **Enabled: Yes**.

**b. Trigger a manual tick run.**
Right-click `MasterControl Scheduler Tick` → **Run**. Wait a few seconds. Check the run result two ways:

- In Task Scheduler, refresh and check **Last Run Result** — `0x0` means success.
- Query the database:
  ```
  GET http://127.0.0.1:3001/api/reports/<schedule-id>/runs
  ```
  A row with `status='done'` confirms the tick reached the database. If
  auth is not configured, the run may be `status='failed'` with an auth
  error; either outcome means the CLI ran correctly.

**c. Confirm the backend starts at logon.**
Reboot or log off and log back in. After the desktop appears, browse to `http://127.0.0.1:5173`. If the app loads, the logon trigger fired and both processes are running. If the page does not load within ~20 seconds, check the Troubleshooting section below.

---

## 4. Uninstall

```powershell
Unregister-ScheduledTask -TaskName 'MasterControl Backend'      -Confirm:$false
Unregister-ScheduledTask -TaskName 'MasterControl Scheduler Tick' -Confirm:$false
```

This removes only the Task Scheduler entries. It does not stop any currently running process; terminate those manually if needed (`Get-Process node | Stop-Process`).

---

## 5. Troubleshooting

- **Last Run Result: `0x1`** — Node not on PATH for the task's user context. This usually means Node was installed per-user (e.g., via nvm or fnm) and the PATH set in the user's shell profile is not inherited by Task Scheduler. Fix: in the task's **Actions** tab, set the full path to `node.exe` explicitly (e.g., `C:\Users\schmichr\AppData\Roaming\fnm\node.exe`) or switch to **Run only when user is logged on** so the interactive session's PATH applies. Never use **Run whether user is logged on or not** for these tasks — Claude Code OAuth credentials and DPAPI-encrypted fallback secrets are scoped to the interactive user profile and will not work under a non-interactive session.

- **Tick fires but no row appears in `report_runs`** — the schedule's `last_run_at` is already at or after the most recent fire-time. This is expected behavior: `runMissedJobs()` is idempotent by design, and the `UNIQUE(schedule_id, fire_time)` constraint silently drops duplicate inserts. To confirm the tick is working, check **Last Run Result** in Task Scheduler (`0x0` = success) rather than counting new rows.

- **Backend does not start at logon** — run the dev command manually from a PowerShell window to see the real error:
  ```powershell
  npm --prefix C:\mastercontrol run dev
  ```
  Common causes: a stale process holding port 3001 or 5173 from a previous session. Find and kill it:
  ```powershell
  Get-NetTCPConnection -LocalPort 3001 | ForEach-Object { Get-Process -Id $_.OwningProcess } | Stop-Process
  ```
  Then restart. If the error is a permission or binding failure, confirm the user account owns the process and that no firewall rule blocks loopback on those ports.

- **Tasks behave oddly after a user-account change** — the tasks are registered to the original user's SID. Re-register them under the new account by running the `Register-ScheduledTask` commands above in a session for that user. Do not change the principal to SYSTEM; these tasks rely on the interactive user's environment and DPAPI key store.
