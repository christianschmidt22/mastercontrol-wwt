param(
    [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'SilentlyContinue'

function Test-OutlookCom {
    try {
        $o = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($o) | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-ClassicOutlookProcess {
    # Classic Outlook is OUTLOOK.EXE.
    return [bool](Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue)
}

function Stop-ZombieClassicOutlook {
    # If OUTLOOK.EXE is running but COM is dead, it's a hung instance from a
    # previous failed launch. Kill it so we can restart cleanly.
    Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1000
}

# 1. Already running and COM accessible → use as-is, do NOT mark we-started-it.
if (Test-OutlookCom) {
    @{ launched = $false; ready = $true; weStartedIt = $false; error = $null } | ConvertTo-Json
    exit 0
}

# 2. Classic process exists but COM not yet ready → wait the FULL timeout for
#    it to come up. Cold-start with new Outlook also running can take 20-30s.
#    Killing too early causes us to murder our own still-booting instance and
#    spawn a duplicate. If it really is hung after the full timeout, return
#    error rather than thrashing.
if (Test-ClassicOutlookProcess) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-OutlookCom) {
            @{ launched = $false; ready = $true; weStartedIt = $false; error = $null } | ConvertTo-Json
            exit 0
        }
    }
    @{
        launched    = $false
        ready       = $false
        weStartedIt = $false
        error       = "Classic Outlook process is running but COM did not become accessible within ${TimeoutSeconds}s. It may be stuck on a dialog (profile picker, password prompt, etc)."
    } | ConvertTo-Json
    exit 0
}

# 3. Nothing classic running → launch MINIMIZED. New Outlook (olk.exe) may
#    also be running; classic and new Outlook can coexist.
try {
    # Outlook does NOT accept /min as a switch — it returns "command line argument
    # is not valid". Rely solely on -WindowStyle Minimized which routes through
    # ShellExecuteEx with SW_SHOWMINIMIZED.
    Start-Process outlook.exe -WindowStyle Minimized
} catch {
    @{ launched = $false; ready = $false; weStartedIt = $false; error = "Failed to launch Outlook: $_" } | ConvertTo-Json
    exit 0
}

# 4. Wait for COM to come up.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$comReady = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-OutlookCom) {
        $comReady = $true
        break
    }
}

if (-not $comReady) {
    @{ launched = $true; ready = $false; weStartedIt = $true; error = "Outlook launched but did not become accessible within ${TimeoutSeconds}s" } | ConvertTo-Json
    exit 0
}

# Settle delay — folders need a moment to populate before Items.Sort behaves.
Start-Sleep -Seconds 5

@{ launched = $true; ready = $true; weStartedIt = $true; error = $null } | ConvertTo-Json
