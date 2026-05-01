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

function Test-NewOutlookProcess {
    # New Outlook is olk.exe (WebView2 PWA wrapper). It does NOT expose COM.
    # Critical: Windows policy only allows ONE Outlook (classic OR new) to run
    # at a time. If olk.exe is up, attempting Start-Process outlook.exe fails
    # with a modal dialog.
    return [bool](Get-Process -Name olk -ErrorAction SilentlyContinue)
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

# 2. New Outlook is the only thing running → we CANNOT launch classic. Windows
#    will pop a modal "Only one version of Outlook can run at a time" dialog.
#    Bail with a clear error so the caller can surface it to the user.
if ((Test-NewOutlookProcess) -and -not (Test-ClassicOutlookProcess)) {
    @{
        launched   = $false
        ready      = $false
        weStartedIt = $false
        error      = 'New Outlook (olk.exe) is open. Windows blocks running classic Outlook alongside it. Close new Outlook before sync can run.'
    } | ConvertTo-Json
    exit 0
}

# 3. Classic process exists but COM not yet ready → wait briefly. If it never
#    becomes accessible it's a zombie from a previous failed launch — kill and
#    relaunch.
if (Test-ClassicOutlookProcess) {
    $shortDeadline = (Get-Date).AddSeconds([Math]::Min(10, $TimeoutSeconds))
    while ((Get-Date) -lt $shortDeadline) {
        Start-Sleep -Milliseconds 500
        if (Test-OutlookCom) {
            @{ launched = $false; ready = $true; weStartedIt = $false; error = $null } | ConvertTo-Json
            exit 0
        }
    }
    # Hung. Kill it and fall through to launch fresh.
    Stop-ZombieClassicOutlook
}

# 4. Nothing classic running (or the zombie was just killed) → launch MINIMIZED.
#    Re-check new Outlook in case it appeared between earlier checks.
if (Test-NewOutlookProcess) {
    @{
        launched   = $false
        ready      = $false
        weStartedIt = $false
        error      = 'New Outlook (olk.exe) is open. Close it before sync can run.'
    } | ConvertTo-Json
    exit 0
}

try {
    # Outlook does NOT accept /min as a switch — it returns "command line argument
    # is not valid". Rely solely on -WindowStyle Minimized which routes through
    # ShellExecuteEx with SW_SHOWMINIMIZED. If Outlook ignores the hint, the
    # window will appear normally; the user can minimize manually or set
    # "Hide When Minimized" once.
    Start-Process outlook.exe -WindowStyle Minimized
} catch {
    @{ launched = $false; ready = $false; weStartedIt = $false; error = "Failed to launch Outlook: $_" } | ConvertTo-Json
    exit 0
}

# 5. Wait for COM to come up.
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
