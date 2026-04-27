@echo off
REM ===========================================================================
REM uninstall-autostart.cmd
REM
REM Removes the MasterControl shim from the Windows Startup folder. Does
REM NOT stop a currently running instance — kill those manually with
REM `taskkill /F /IM node.exe`.
REM ===========================================================================

setlocal

set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MasterControl.cmd"

if exist "%TARGET%" (
  del /F /Q "%TARGET%"
  echo Removed %TARGET%
) else (
  echo No autostart shim was installed at %TARGET%. Nothing to do.
)

REM Also clean up any legacy Task Scheduler entry from earlier installs.
schtasks /Delete /F /TN MasterControl >nul 2>&1
if %ERRORLEVEL% EQU 0 echo Removed legacy Task Scheduler entry "MasterControl".

echo.
echo Note: any currently running MasterControl process is unaffected.
echo Stop it with:  taskkill /F /IM node.exe
