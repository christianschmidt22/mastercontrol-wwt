@echo off
REM ===========================================================================
REM mastercontrol-run.cmd
REM
REM Simple persistent launcher. Lives in the Windows Startup folder so it
REM runs at every user logon. Single `npm run dev` invocation — if the
REM process crashes, the launcher exits and the user double-clicks the
REM Startup shortcut to relaunch (or signs out + back in).
REM
REM Window visibility: visible by default so logs are inspectable. To run
REM minimized, change the Startup shortcut's "Run" property to "Minimized".
REM ===========================================================================

setlocal

REM Project root is the parent of this script's directory.
cd /d "%~dp0.."

REM Ensure node + npm are findable. Standard winget Node LTS install path.
if "%MC_NODE_BIN%"=="" (
  set "MC_NODE_BIN=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.15.0-win-x64"
)
if exist "%MC_NODE_BIN%\node.exe" (
  set "PATH=%MC_NODE_BIN%;%PATH%"
)

REM Log directory (per-user). Tail with:
REM   powershell Get-Content -Wait %APPDATA%\mastercontrol\dev.log
set "MC_LOG_DIR=%APPDATA%\mastercontrol"
if not exist "%MC_LOG_DIR%" mkdir "%MC_LOG_DIR%" >nul 2>&1
set "MC_LOG=%MC_LOG_DIR%\dev.log"

echo ============================================================ >> "%MC_LOG%"
echo MasterControl starting %DATE% %TIME% >> "%MC_LOG%"
echo PROJECT_ROOT=%CD% >> "%MC_LOG%"
echo PATH first segment=%MC_NODE_BIN% >> "%MC_LOG%"
echo ============================================================ >> "%MC_LOG%"

REM Run dev mode. Output streams to the log file. Single shot — exits when
REM npm exits. No loop. If the process dies, sign out + back in (or
REM double-click the Startup shortcut) to relaunch.
call npm run dev >> "%MC_LOG%" 2>&1

echo. >> "%MC_LOG%"
echo MasterControl exited %DATE% %TIME% (code %ERRORLEVEL%) >> "%MC_LOG%"
