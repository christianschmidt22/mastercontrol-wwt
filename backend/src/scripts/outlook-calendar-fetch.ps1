# outlook-calendar-fetch.ps1
#
# Reads calendar events from the locally running Outlook desktop app via COM.
# The script intentionally does not launch Outlook. MasterControl treats the
# user's Classic Outlook session as the delegated auth boundary.
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

function Empty-Result($message) {
    @{
        error  = $message
        events = @()
    } | ConvertTo-Json -Depth 5
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
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
    $classic = @(Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue)
    $newOutlook = @(Get-Process -Name olk -ErrorAction SilentlyContinue)
    if ($classic.Count -eq 0 -and $newOutlook.Count -gt 0) {
        Empty-Result "New Outlook is running, but Classic Outlook COM is not available. Open Classic Outlook (OUTLOOK.EXE) for calendar sync."
    } else {
        Empty-Result "Classic Outlook is not running or COM is not accessible."
    }
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
        try { $baseId = [string]$item.GlobalAppointmentID } catch { $baseId = '' }
        if ([string]::IsNullOrWhiteSpace($baseId)) {
            try { $baseId = [string]$item.EntryID } catch { $baseId = '' }
        }
        if ([string]::IsNullOrWhiteSpace($baseId)) {
            $baseId = ([string]$item.Subject) + ':' + $start.ToString('o', $culture)
        }

        $uidStart = $start.ToUniversalTime().ToString('yyyyMMddTHHmmssZ', $culture)
        $uid = 'outlook-com:self:' + $baseId + ':' + $uidStart

        $attendeeCount = 0
        try { $attendeeCount = [int]$item.Recipients.Count } catch { $attendeeCount = 0 }

        $body = ''
        try {
            $rawBody = [string]$item.Body
            $body = $rawBody.Substring(0, [Math]::Min(4000, $rawBody.Length))
        } catch {
            $body = ''
        }

        $events += @{
            uid            = $uid
            title          = [string]$item.Subject
            start_at       = $start.ToUniversalTime().ToString('o', $culture)
            end_at         = $end.ToUniversalTime().ToString('o', $culture)
            location       = [string]$item.Location
            body           = $body
            organizer      = [string]$item.Organizer
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
