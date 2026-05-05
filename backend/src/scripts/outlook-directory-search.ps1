# outlook-directory-search.ps1
#
# Searches the Outlook/Exchange address book for WWT users through the running
# Classic Outlook COM session. It does not launch Outlook.

param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [int]$Limit = 20,

    [int]$ScanLimit = 5000
)

$ErrorActionPreference = 'Stop'

function Result($error, $results) {
    @{
        error = $error
        results = @($results)
    } | ConvertTo-Json -Depth 5
}

$needle = $Query.Trim().ToLowerInvariant()
if ($needle.Length -lt 2) {
    Result "Search text must be at least 2 characters." @()
    exit 0
}

try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
    Result "Classic Outlook is not running or COM is not accessible." @()
    exit 0
}

try {
    $namespace = $outlook.GetNamespace('MAPI')
    $addressLists = @($namespace.AddressLists)
    $preferred = @($addressLists | Where-Object { $_.Name -match 'Global Address List|GAL|WWT' })
    if ($preferred.Count -eq 0) { $preferred = $addressLists }

    $results = @()
    $seen = @{}
    $scanned = 0

    foreach ($list in $preferred) {
        if ($results.Count -ge $Limit -or $scanned -ge $ScanLimit) { break }
        $entries = $list.AddressEntries
        if ($null -eq $entries) { continue }

        $count = [Math]::Min($entries.Count, $ScanLimit - $scanned)
        for ($i = 1; $i -le $count; $i++) {
            if ($results.Count -ge $Limit -or $scanned -ge $ScanLimit) { break }
            $scanned++

            try {
                $entry = $entries.Item($i)
                if ($null -eq $entry) { continue }

                $displayName = [string]$entry.Name
                $email = ''
                $title = ''
                $department = ''
                $office = ''
                $phone = ''

                try {
                    $exchangeUser = $entry.GetExchangeUser()
                    if ($null -ne $exchangeUser) {
                        $email = [string]$exchangeUser.PrimarySmtpAddress
                        $title = [string]$exchangeUser.JobTitle
                        $department = [string]$exchangeUser.Department
                        $office = [string]$exchangeUser.OfficeLocation
                        $phone = [string]$exchangeUser.BusinessTelephoneNumber
                    }
                } catch {
                    $email = ''
                }

                if ([string]::IsNullOrWhiteSpace($email)) {
                    try { $email = [string]$entry.Address } catch { $email = '' }
                }
                if ([string]::IsNullOrWhiteSpace($email)) { continue }
                if ($email.ToLowerInvariant() -notlike '*@wwt.com') { continue }
                if ($seen.ContainsKey($email.ToLowerInvariant())) { continue }

                $haystack = (@($displayName, $email, $title, $department, $office) -join ' ').ToLowerInvariant()
                if (-not $haystack.Contains($needle)) { continue }

                $seen[$email.ToLowerInvariant()] = $true
                $results += @{
                    name       = $displayName
                    email      = $email
                    title      = $title
                    department = $department
                    office     = $office
                    phone      = $phone
                    source     = $list.Name
                }
            } catch {
                continue
            }
        }
    }

    Result $null $results
} catch {
    Result "Outlook directory search failed." @()
}
