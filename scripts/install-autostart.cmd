@echo off
REM ===========================================================================
REM install-autostart.cmd
REM
REM Copies a launcher shortcut into the user's Windows Startup folder so
REM MasterControl runs automatically at every logon. No admin rights needed.
REM
REM Idempotent — re-running replaces the existing entry.
REM ===========================================================================

setlocal

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP_DIR%\MasterControl.cmd"
set "SOURCE=%~dp0mastercontrol-run.cmd"

if not exist "%SOURCE%" (
  echo ERROR: launcher not found at %SOURCE%
  exit /b 1
)

if not exist "%STARTUP_DIR%" (
  echo ERROR: Windows Startup folder not found at %STARTUP_DIR%
  exit /b 1
)

REM Wrapper that just calls the real launcher. Keeps the actual logic in
REM scripts\mastercontrol-run.cmd so future updates only need a `git pull`,
REM no re-install.
> "%TARGET%" echo @echo off
>> "%TARGET%" echo REM MasterControl autostart shim. Edit scripts\mastercontrol-run.cmd, not this.
>> "%TARGET%" echo call "%SOURCE%"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo FAILED: could not write %TARGET%
  exit /b 1
)

echo.
echo --------------------------------------------------------------------
echo Installed shim at:
echo     %TARGET%
echo It will run %SOURCE% at every logon.
echo.
echo Start it now without rebooting:
echo     %SOURCE%
echo Or double-click the shim file to test.
echo.
echo View logs at:    %%APPDATA%%\mastercontrol\dev.log
echo Uninstall with:  scripts\uninstall-autostart.cmd
echo --------------------------------------------------------------------
