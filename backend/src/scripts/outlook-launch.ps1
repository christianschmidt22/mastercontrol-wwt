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
    $byProcess = [bool](Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue)
    if ($byProcess) { return $true }

    try {
        return [bool](Get-CimInstance Win32_Process -Filter "Name = 'OUTLOOK.EXE'" -ErrorAction SilentlyContinue)
    } catch {
        return $false
    }
}

function Resolve-OutlookExe {
    $appPathKeys = @(
        'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE',
        'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE',
        'Registry::HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE'
    )

    foreach ($key in $appPathKeys) {
        try {
            $value = (Get-ItemProperty -Path $key -ErrorAction Stop).'(default)'
            if (-not [string]::IsNullOrWhiteSpace($value) -and (Test-Path $value)) {
                return $value
            }
        } catch {}
    }

    $candidates = @(
        "$env:ProgramFiles\Microsoft Office\root\Office16\OUTLOOK.EXE",
        "${env:ProgramFiles(x86)}\Microsoft Office\root\Office16\OUTLOOK.EXE",
        "$env:ProgramFiles\Microsoft Office\Office16\OUTLOOK.EXE",
        "${env:ProgramFiles(x86)}\Microsoft Office\Office16\OUTLOOK.EXE"
    )

    foreach ($candidate in $candidates) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

function Wait-OutlookCom {
    param([int]$Seconds)

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-OutlookCom) { return $true }
    }
    return $false
}

$launchMutex = New-Object System.Threading.Mutex($false, 'Global\MasterControlOutlookLaunch')
$hasMutex = $false

# 1. Already running and COM accessible → use as-is, do NOT mark we-started-it.
if (Test-OutlookCom) {
    @{ launched = $false; ready = $true; weStartedIt = $false; error = $null } | ConvertTo-Json
    exit 0
}

try {
    $hasMutex = $launchMutex.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds))
    if (-not $hasMutex) {
        @{
            launched    = $false
            ready       = $false
            weStartedIt = $false
            error       = "Timed out waiting for another MasterControl Outlook launch attempt to finish."
        } | ConvertTo-Json
        exit 0
    }

    # Another script may have started Outlook while we waited on the mutex.
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
        if (Wait-OutlookCom -Seconds $TimeoutSeconds) {
            @{ launched = $false; ready = $true; weStartedIt = $false; error = $null } | ConvertTo-Json
            exit 0
        }
        @{
            launched    = $false
            ready       = $false
            weStartedIt = $false
            error       = "Classic Outlook process is running but COM did not become accessible within ${TimeoutSeconds}s. It may be stuck on a dialog (profile picker, password prompt, etc)."
        } | ConvertTo-Json
        exit 0
    }

    # 3. Nothing classic running → launch MINIMIZED. Resolve the real Classic
    # Outlook executable instead of relying on PATH/App Execution Alias.
    $outlookExe = Resolve-OutlookExe
    if ([string]::IsNullOrWhiteSpace($outlookExe)) {
        @{ launched = $false; ready = $false; weStartedIt = $false; error = "Classic Outlook executable was not found." } | ConvertTo-Json
        exit 0
    }

    try {
        # Outlook does NOT accept /min as a switch — it returns "command line
        # argument is not valid". Rely on -WindowStyle Minimized.
        Start-Process -FilePath $outlookExe -WindowStyle Minimized
    } catch {
        @{ launched = $false; ready = $false; weStartedIt = $false; error = "Failed to launch Outlook: $_" } | ConvertTo-Json
        exit 0
    }

    # 4. Wait for COM to come up.
    if (-not (Wait-OutlookCom -Seconds $TimeoutSeconds)) {
        @{ launched = $true; ready = $false; weStartedIt = $true; error = "Outlook launched but did not become accessible within ${TimeoutSeconds}s" } | ConvertTo-Json
        exit 0
    }

    # Settle delay — folders need a moment to populate before Items.Sort behaves.
    Start-Sleep -Seconds 5

    @{ launched = $true; ready = $true; weStartedIt = $true; error = $null } | ConvertTo-Json
} finally {
    if ($hasMutex) {
        $launchMutex.ReleaseMutex() | Out-Null
    }
    $launchMutex.Dispose()
}
