# Autostart at logon

> Make MasterControl run automatically when you sign in to Windows, no
> manual `npm run dev` needed.

## Install (one-time)

From any cmd prompt — no admin rights required:

```cmd
cd C:\mastercontrol
scripts\install-autostart.cmd
```

That copies a small shim into your Windows Startup folder
(`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MasterControl.cmd`).
At every logon, the shim runs `scripts\mastercontrol-run.cmd`, which
launches `npm run dev` from the repo root.

(We use the Startup folder, not Task Scheduler. Task Scheduler's locked-down
environment doesn't always inherit a usable PATH for tsx; the Startup folder
runs in the user's normal session context and behaves like opening a cmd
window yourself.)

## Run it now without rebooting

```cmd
C:\mastercontrol\scripts\mastercontrol-run.cmd
```

…or double-click that file. Then open `http://localhost:5173` as usual.

## Where the logs live

```
%APPDATA%\mastercontrol\dev.log
```

That's `C:\Users\<you>\AppData\Roaming\mastercontrol\dev.log`. Both the
backend and frontend log streams are appended there. Tail it live with:

```cmd
powershell Get-Content -Wait %APPDATA%\mastercontrol\dev.log
```

## Stop it (current session)

```cmd
taskkill /F /IM node.exe
```

That kills both the backend and frontend Vite processes. They restart at the
next logon — to disable autostart entirely, run the uninstaller below.

## Uninstall

```cmd
cd C:\mastercontrol
scripts\uninstall-autostart.cmd
```

Removes the shim from the Startup folder. Doesn't touch a currently running
process (use the `taskkill` line above for that).

## Verify the shim is installed

```cmd
dir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MasterControl.cmd"
```

If listed, autostart is configured.

## What gets started

The launcher runs `npm run dev` from the repo root, which spawns:
- Backend on `http://127.0.0.1:3001` (Express + better-sqlite3)
- Frontend Vite dev server on `http://localhost:5173`

Both bind to loopback only (R-001). Nothing on your network can reach them.

## Path lookup

The launcher first checks for a `MC_NODE_BIN` env var, then falls back to
the winget Node LTS install location at
`%LocalAppData%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*\node-v24.15.0-win-x64`.

If your Node lives elsewhere, set `MC_NODE_BIN` in the user environment
(`setx MC_NODE_BIN "<path-to-folder-containing-node.exe>"`) and re-run the
launcher.

## Why Startup folder instead of Task Scheduler

- **No admin required.** Anyone can drop files in their own Startup folder.
- **Honest environment.** The shim runs in the user's normal session; PATH,
  AppData, etc. are exactly what you'd see if you opened a cmd window
  yourself. Task Scheduler with `RunLevel:Limited` *should* match this but
  in practice doesn't always — tsx silently dies for instance.
- **One file, easy to remove.** Delete the `.cmd` from the Startup folder
  and autostart is gone. No `schtasks /Delete` to remember.
- **No new dependencies.** Pure Windows built-ins.

If you'd rather use Task Scheduler (e.g. you want it to also run at boot
without a logon), see the legacy `git log` for the previous PowerShell
`Register-ScheduledTask` recipe — it's preserved for reference.
