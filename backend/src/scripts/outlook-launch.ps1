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
    # Classic Outlook is OUTLOOK.EXE; new Outlook is olk.exe.
    # We only care about classic for COM purposes.
    return [bool](Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue)
}

# 1. Already running and COM accessible → use as-is, do NOT mark we-started-it.
if (Test-OutlookCom) {
    @{ launched = $false; ready = $true; weStartedIt = $false; error = $null } | ConvertTo-Json
    exit 0
}

# 2. Classic process exists but COM not yet ready (e.g., still loading) → wait, but
#    do NOT mark we-started-it (the user already had it open).
if (Test-ClassicOutlookProcess) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-OutlookCom) {
            @{ launched = $false; ready = $true; weStartedIt = $false; error = $null } | ConvertTo-Json
            exit 0
        }
    }
    @{ launched = $false; ready = $false; weStartedIt = $false; error = 'Classic Outlook is running but COM did not become accessible' } | ConvertTo-Json
    exit 0
}

# 3. Nothing classic running → launch it MINIMIZED.
try {
    Start-Process outlook.exe -ArgumentList '/min' -WindowStyle Minimized
} catch {
    @{ launched = $false; ready = $false; weStartedIt = $false; error = "Failed to launch Outlook: $_" } | ConvertTo-Json
    exit 0
}

# 4. Wait for COM to come up. Once it does, give Outlook a few extra seconds to
#    finish initial folder sync before reporting ready.
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

# Give Outlook 5 more seconds to settle initial sync activity. This is empirical —
# folders need time to populate before Items.Sort and similar calls behave well.
Start-Sleep -Seconds 5

@{ launched = $true; ready = $true; weStartedIt = $true; error = $null } | ConvertTo-Json
