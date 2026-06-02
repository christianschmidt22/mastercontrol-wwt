# outlook-calendar-fetch.ps1
#
# Reads calendar events from Classic Outlook desktop via COM. If Classic
# Outlook is not already running, the script starts it and waits for COM to
# become available. MasterControl treats that interactive Outlook session as
# the delegated auth boundary.
#
# Usage:
#   powershell -NonInteractive -File outlook-calendar-fetch.ps1 `
#     -WindowStartIso 2026-05-04T00:00:00.000Z `
#     -WindowEndIso   2026-08-02T00:00:00.000Z
#
# Outputs:
#   JSON object on stdout: { "error": null|string, "events": [...] }

param(
    [Parameter(Mandatory = $true)]
    [string]$WindowStartIso,

    [Parameter(Mandatory = $true)]
    [string]$WindowEndIso
)

$ErrorActionPreference = 'Stop'
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

function Empty-Result($message) {
    @{
        error  = $message
        events = @()
    } | ConvertTo-Json -Depth 5
}

function Clean-JsonText($value, [int]$maxLength = 0) {
    if ($null -eq $value) { return '' }

    $raw = [string]$value
    $builder = New-Object System.Text.StringBuilder

    foreach ($ch in $raw.ToCharArray()) {
        $code = [int][char]$ch

        # JSON.parse rejects raw C0 control characters. ConvertTo-Json in
        # Windows PowerShell can leak some Outlook body controls through, so
        # normalize them before serialization. Keep tab/CR/LF for readable
        # meeting bodies. Drop surrogate code units; preserving emoji is less
        # important than producing valid JSON for the sync.
        $isBadControl = $code -lt 32 -and $code -ne 9 -and $code -ne 10 -and $code -ne 13
        $isSurrogate = $code -ge 0xD800 -and $code -le 0xDFFF
        if ($isBadControl -or $isSurrogate) {
            [void]$builder.Append(' ')
        } else {
            [void]$builder.Append($ch)
        }
    }

    $clean = $builder.ToString()
    if ($maxLength -gt 0 -and $clean.Length -gt $maxLength) {
        return $clean.Substring(0, $maxLength)
    }
    return $clean
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

    $command = Get-Command OUTLOOK.EXE -ErrorAction SilentlyContinue
    if ($command -and (Test-Path $command.Source)) {
        return $command.Source
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

function Get-OutlookComObject {
    try {
        return [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
    } catch {
        return $null
    }
}

function Test-ClassicOutlookProcess {
    $byProcess = @(Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue)
    if ($byProcess.Count -gt 0) { return $true }

    try {
        $byCim = @(Get-CimInstance Win32_Process -Filter "Name = 'OUTLOOK.EXE'" -ErrorAction SilentlyContinue)
        return $byCim.Count -gt 0
    } catch {
        return $false
    }
}

function Wait-OutlookCom {
    param([int]$Seconds)

    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        Start-Sleep -Seconds 3
        $outlookObject = Get-OutlookComObject
        if ($null -ne $outlookObject) { return $outlookObject }
    } while ((Get-Date) -lt $deadline)

    return $null
}

function Get-OrStartOutlookComObject {
    $outlookObject = Get-OutlookComObject
    if ($null -ne $outlookObject) { return $outlookObject }

    $launchMutex = New-Object System.Threading.Mutex($false, 'Global\MasterControlOutlookLaunch')
    $hasMutex = $false
    try {
        $hasMutex = $launchMutex.WaitOne([TimeSpan]::FromSeconds(75))
        if (-not $hasMutex) {
            throw "Timed out waiting for another MasterControl Outlook launch attempt to finish."
        }

        # Another sync path may have made COM available while we were waiting.
        $outlookObject = Get-OutlookComObject
        if ($null -ne $outlookObject) { return $outlookObject }

        if (Test-ClassicOutlookProcess) {
            $outlookObject = Wait-OutlookCom -Seconds 75
            if ($null -ne $outlookObject) { return $outlookObject }
            throw "Classic Outlook is already running, but COM did not become available before timeout."
        }

        $outlookExe = Resolve-OutlookExe
        if ([string]::IsNullOrWhiteSpace($outlookExe)) {
            throw "Classic Outlook is not installed or OUTLOOK.EXE could not be found."
        }
        Start-Process -FilePath $outlookExe -WindowStyle Minimized | Out-Null

        $outlookObject = Wait-OutlookCom -Seconds 75
        if ($null -ne $outlookObject) { return $outlookObject }

        throw "Classic Outlook was launched, but COM did not become available before timeout."
    } finally {
        if ($hasMutex) {
            $launchMutex.ReleaseMutex() | Out-Null
        }
        $launchMutex.Dispose()
    }
}

try {
    $windowStartUtc = [DateTime]::Parse(
        $WindowStartIso,
        $culture,
        [System.Globalization.DateTimeStyles]::AssumeUniversal -bor
        [System.Globalization.DateTimeStyles]::AdjustToUniversal
    )
    $windowEndUtc = [DateTime]::Parse(
        $WindowEndIso,
        $culture,
        [System.Globalization.DateTimeStyles]::AssumeUniversal -bor
        [System.Globalization.DateTimeStyles]::AdjustToUniversal
    )
} catch {
    Empty-Result "Invalid calendar sync window."
    exit 0
}

try {
    $outlook = Get-OrStartOutlookComObject
} catch {
    Empty-Result (Clean-JsonText $_.Exception.Message 1000)
    exit 0
}

try {
    $namespace = $outlook.GetNamespace('MAPI')
    $folder = $namespace.GetDefaultFolder(9) # 9 = olFolderCalendar
    $items = $folder.Items
    $items.Sort('[Start]')
    $items.IncludeRecurrences = $true

    $localStart = $windowStartUtc.ToLocalTime()
    $localEnd = $windowEndUtc.ToLocalTime()
    $startFilter = $localStart.ToString('MM/dd/yyyy hh:mm tt', $culture)
    $endFilter = $localEnd.ToString('MM/dd/yyyy hh:mm tt', $culture)
    $filter = "[End] >= '$startFilter' AND [Start] <= '$endFilter'"
    $restricted = $items.Restrict($filter)

    $events = @()

    foreach ($item in $restricted) {
        if ($null -eq $item) { continue }
        if ($item.Class -ne 26) { continue } # 26 = olAppointment

        $start = [DateTime]$item.Start
        $end = [DateTime]$item.End
        if ($end.ToUniversalTime() -lt $windowStartUtc -or $start.ToUniversalTime() -gt $windowEndUtc) {
            continue
        }

        $baseId = ''
        try { $baseId = Clean-JsonText $item.GlobalAppointmentID 1000 } catch { $baseId = '' }
        if ([string]::IsNullOrWhiteSpace($baseId)) {
            try { $baseId = Clean-JsonText $item.EntryID 1000 } catch { $baseId = '' }
        }
        if ([string]::IsNullOrWhiteSpace($baseId)) {
            $baseId = (Clean-JsonText $item.Subject 500) + ':' + $start.ToString('o', $culture)
        }

        $uidStart = $start.ToUniversalTime().ToString('yyyyMMddTHHmmssZ', $culture)
        $uid = 'outlook-com:self:' + $baseId + ':' + $uidStart

        $attendeeCount = 0
        try { $attendeeCount = [int]$item.Recipients.Count } catch { $attendeeCount = 0 }

        $body = ''
        try {
            $body = Clean-JsonText $item.Body 4000
        } catch {
            $body = ''
        }

        $events += @{
            uid            = $uid
            title          = Clean-JsonText $item.Subject 500
            start_at       = $start.ToUniversalTime().ToString('o', $culture)
            end_at         = $end.ToUniversalTime().ToString('o', $culture)
            location       = Clean-JsonText $item.Location 1000
            body           = $body
            organizer      = Clean-JsonText $item.Organizer 500
            attendee_count = $attendeeCount
            is_all_day     = if ($item.IsAllDayEvent) { 1 } else { 0 }
        }
    }

    @{
        error  = $null
        events = @($events)
    } | ConvertTo-Json -Depth 5
} catch {
    Empty-Result "Outlook calendar COM fetch failed."
    exit 0
}
