# outlook-freebusy.ps1
#
# Finds shared free time for selected WWT users via Outlook/Exchange FreeBusy.
# This exposes availability only, not meeting subjects or private details.

param(
    [Parameter(Mandatory = $true)]
    [string]$ParticipantsJson,

    [Parameter(Mandatory = $true)]
    [string]$StartDate,

    [Parameter(Mandatory = $true)]
    [string]$EndDate,

    [int]$WorkStartMinutes = 480,
    [int]$WorkEndMinutes = 960,
    [Parameter(Mandatory = $true)]
    [string]$WeekdaysJson,
    [string]$IncludeSelf = 'true',
    [int]$SlotMinutes = 30,
    [int]$MinimumDurationMinutes = 30
)

$ErrorActionPreference = 'Stop'
$culture = [System.Globalization.CultureInfo]::InvariantCulture

function Result($error, $slots, $participants, $unresolved) {
    @{
        error = $error
        slots = @($slots)
        participants = @($participants)
        unresolved = @($unresolved)
    } | ConvertTo-Json -Depth 6
}

try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
    Result "Classic Outlook is not running or COM is not accessible." @() @() @()
    exit 0
}

try {
    $namespace = $outlook.GetNamespace('MAPI')
    $parsedEmails = $ParticipantsJson | ConvertFrom-Json
    $emails = @()
    if ($null -ne $parsedEmails) {
        foreach ($email in $parsedEmails) {
            if (-not [string]::IsNullOrWhiteSpace([string]$email)) {
                $emails += [string]$email
            }
        }
    }

    $parsedWeekdays = $WeekdaysJson | ConvertFrom-Json
    $weekdays = @()
    if ($null -ne $parsedWeekdays) {
        foreach ($day in $parsedWeekdays) {
            $weekdays += [int]$day
        }
    }

    $shouldIncludeSelf = $IncludeSelf -eq 'true' -or $IncludeSelf -eq '1' -or $IncludeSelf -eq 'yes'

    if ($shouldIncludeSelf) {
        try {
            $selfUser = $namespace.CurrentUser.AddressEntry.GetExchangeUser()
            if ($null -ne $selfUser -and -not [string]::IsNullOrWhiteSpace($selfUser.PrimarySmtpAddress)) {
                $emails = @($selfUser.PrimarySmtpAddress) + $emails
            }
        } catch { }
    }

    $emails = @($emails | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
    if ($emails.Count -eq 0) {
        Result "Choose at least one WWT user, or include yourself." @() @() @()
        exit 0
    }

    $rangeStart = [DateTime]::ParseExact($StartDate, 'yyyy-MM-dd', $culture).Date
    $rangeEnd = [DateTime]::ParseExact($EndDate, 'yyyy-MM-dd', $culture).Date.AddDays(1)
    if ($rangeEnd -le $rangeStart) {
        Result "End date must be after start date." @() @() @()
        exit 0
    }

    $resolved = @()
    $unresolved = @()
    foreach ($email in $emails) {
        $recipient = $namespace.CreateRecipient([string]$email)
        if ($recipient.Resolve()) {
            $freeBusy = [string]$recipient.FreeBusy($rangeStart, $SlotMinutes, $true)
            $resolved += @{
                email = [string]$email
                name = [string]$recipient.Name
                freebusy = $freeBusy
            }
        } else {
            $unresolved += [string]$email
        }
    }

    if ($resolved.Count -eq 0) {
        Result "None of the requested users resolved in Outlook." @() @() $unresolved
        exit 0
    }

    $slots = @()
    $openStart = $null
    $openEnd = $null

    function Add-OpenSlot($slotStart, $slotEnd) {
        $duration = [int]($slotEnd - $slotStart).TotalMinutes
        if ($duration -lt $MinimumDurationMinutes) { return }
        $script:slots += @{
            date = $slotStart.ToString('yyyy-MM-dd', $culture)
            start_time = $slotStart.ToString('h:mm tt', $culture)
            end_time = $slotEnd.ToString('h:mm tt', $culture)
            start_at = $slotStart.ToString('s', $culture)
            end_at = $slotEnd.ToString('s', $culture)
            duration_minutes = $duration
        }
    }

    $cursor = $rangeStart
    while ($cursor -lt $rangeEnd) {
        $dayAllowed = $weekdays -contains [int]$cursor.DayOfWeek
        $minutes = ($cursor.Hour * 60) + $cursor.Minute
        $withinHours = $minutes -ge $WorkStartMinutes -and ($minutes + $SlotMinutes) -le $WorkEndMinutes
        $slotEnd = $cursor.AddMinutes($SlotMinutes)

        $allFree = $dayAllowed -and $withinHours
        if ($allFree) {
            $index = [int][Math]::Floor(($cursor - $rangeStart).TotalMinutes / $SlotMinutes)
            foreach ($person in $resolved) {
                $fb = [string]$person.freebusy
                if ($index -lt 0 -or $index -ge $fb.Length -or $fb.Substring($index, 1) -ne '0') {
                    $allFree = $false
                    break
                }
            }
        }

        if ($allFree) {
            if ($null -eq $openStart) { $openStart = $cursor }
            $openEnd = $slotEnd
        } elseif ($null -ne $openStart) {
            Add-OpenSlot $openStart $openEnd
            $openStart = $null
            $openEnd = $null
        }

        $cursor = $slotEnd
    }

    if ($null -ne $openStart) {
        Add-OpenSlot $openStart $openEnd
    }

    $participantSummary = @($resolved | ForEach-Object { @{ email = $_.email; name = $_.name } })
    Result $null $slots $participantSummary $unresolved
} catch {
    Result ("Outlook FreeBusy lookup failed: " + $_.Exception.Message) @() @() @()
}
