# Desktop App Launch

MasterControl's supported daily-use launch path is the installed Electron app:

```text
%LOCALAPPDATA%\Programs\MasterControl_work\MasterControl_work.exe
```

The desktop app owns the local backend and serves the packaged frontend from
inside the installer bundle. It should be launched from the Start menu,
desktop shortcut, or pinned taskbar icon named `MasterControl_work`.

## Removed Legacy Launchers

Do not reinstall the old Startup-folder or Task Scheduler launchers. Those
paths started the repo dev servers directly:

- backend on `http://127.0.0.1:3001`
- Vite frontend on `http://127.0.0.1:5173`

They were useful before the desktop wrapper existed, but they can now open an
older browser/dev instance beside the packaged app. If one appears again,
remove this file if present:

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MasterControl.cmd
```

Also verify Task Scheduler has no `MasterControl Backend` or
`MasterControl Scheduler Tick` entries.

## Development Only

`npm run dev` and `npm run dev:desktop` remain available for local development
and QA from the repo. They are not the user-facing way to run MasterControl.
