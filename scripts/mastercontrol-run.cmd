@echo off
REM ===========================================================================
REM mastercontrol-run.cmd
REM
REM Persistent launcher. Runs at every logon via the Windows Startup folder
REM shim (see scripts\install-autostart.cmd). Spawns backend and frontend as
REM separate minimized windows; each writes to its own log file so we never
REM interleave output and never depend on `concurrently`.
REM
REM We bypass `npm run dev` because that uses `concurrently` + `tsx watch`,
REM which silently hangs when stdout isn't a tty (which it isn't, under
REM autostart). Direct invocation of plain `tsx` and `vite` works.
REM ===========================================================================

setlocal

REM Project root is the parent of this script's directory.
cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"

REM Resolve node binary location.
if "%MC_NODE_BIN%"=="" (
  set "MC_NODE_BIN=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.15.0-win-x64"
)
if exist "%MC_NODE_BIN%\node.exe" (
  set "PATH=%MC_NODE_BIN%;%PATH%"
)

REM Per-user log directory. Each child gets its own log so interleaving
REM doesn't make output unreadable.
set "MC_LOG_DIR=%APPDATA%\mastercontrol"
if not exist "%MC_LOG_DIR%" mkdir "%MC_LOG_DIR%" >nul 2>&1
set "BE_LOG=%MC_LOG_DIR%\backend.log"
set "FE_LOG=%MC_LOG_DIR%\frontend.log"
set "LAUNCH_LOG=%MC_LOG_DIR%\launcher.log"

>> "%LAUNCH_LOG%" echo.
>> "%LAUNCH_LOG%" echo ============================================================
>> "%LAUNCH_LOG%" echo MasterControl launching at %DATE% %TIME%
>> "%LAUNCH_LOG%" echo PROJECT_ROOT=%PROJECT_ROOT%
>> "%LAUNCH_LOG%" echo MC_NODE_BIN=%MC_NODE_BIN%
>> "%LAUNCH_LOG%" echo BE_LOG=%BE_LOG%
>> "%LAUNCH_LOG%" echo FE_LOG=%FE_LOG%
>> "%LAUNCH_LOG%" echo ============================================================

REM Backend — plain `tsx` (no watch) so it survives non-tty stdout.
REM Production-like: edits don't auto-reload, but autostart users aren't
REM editing anyway. To get watch back, run `npm run dev` manually from
REM a developer terminal.
start "MasterControl backend" /MIN cmd /c "cd /d %PROJECT_ROOT%\backend && npx tsx src\index.ts >> %BE_LOG% 2>&1"

REM Frontend — direct vite invocation, same reasoning.
start "MasterControl frontend" /MIN cmd /c "cd /d %PROJECT_ROOT%\frontend && npx vite >> %FE_LOG% 2>&1"

REM Give the spawns a moment so logs definitely contain something on first
REM check, then exit. The two `start` commands return immediately; the
REM child windows continue running detached.
ping -n 3 127.0.0.1 >nul

>> "%LAUNCH_LOG%" echo Spawned both windows. Launcher exiting.
endlocal
exit /b 0
