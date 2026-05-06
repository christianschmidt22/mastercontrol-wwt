# outlook-directory-search.ps1
#
# Searches the Outlook/Exchange address book for WWT users through the running
# Classic Outlook COM session. It does not launch Outlook.

param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [int]$Limit = 20,

    [int]$ScanLimit = 25000
)

$ErrorActionPreference = 'Stop'

function Result($error, $results) {
    @{
        error = $error
        results = @($results)
    } | ConvertTo-Json -Depth 5
}

function Build-DirectoryResult($entry, $source) {
    if ($null -eq $entry) { return $null }

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
    if ([string]::IsNullOrWhiteSpace($email)) { return $null }
    if ($email.ToLowerInvariant() -notlike '*@wwt.com') { return $null }
    if ($displayName.Contains('@') -and [string]::IsNullOrWhiteSpace($title) -and [string]::IsNullOrWhiteSpace($department) -and [string]::IsNullOrWhiteSpace($office) -and [string]::IsNullOrWhiteSpace($phone)) {
        return $null
    }

    return @{
        name       = $displayName
        email      = $email
        title      = $title
        department = $department
        office     = $office
        phone      = $phone
        source     = $source
    }
}

function Add-DirectoryResult($result) {
    if ($null -eq $result) { return $false }
    $emailKey = ([string]$result.email).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($emailKey)) { return $false }
    if ($seen.ContainsKey($emailKey)) { return $false }

    $seen[$emailKey] = $true
    $script:results += $result
    return $true
}

$needle = $Query.Trim().ToLowerInvariant()
if ($needle.Length -lt 2) {
    Result "Search text must be at least 2 characters." @()
    exit 0
}
$terms = @($needle -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
    Result "Classic Outlook is not running or COM is not accessible." @()
    exit 0
}

try {
    $namespace = $outlook.GetNamespace('MAPI')
    $script:results = @()
    $seen = @{}

    $resolverCandidates = New-Object System.Collections.Generic.List[string]
    if ($terms.Count -eq 1) {
        [void]$resolverCandidates.Add($Query.Trim())
    }
    if ($terms.Count -ge 2) {
        $first = [string]$terms[0]
        $last = [string]$terms[$terms.Count - 1]
        if (-not [string]::IsNullOrWhiteSpace($first) -and -not [string]::IsNullOrWhiteSpace($last)) {
            [void]$resolverCandidates.Add("$first.$last@wwt.com")
            [void]$resolverCandidates.Add("$first$last@wwt.com")
            [void]$resolverCandidates.Add(($first.Substring(0, 1) + "$last@wwt.com"))
            [void]$resolverCandidates.Add("$last, $first")
            [void]$resolverCandidates.Add("$first $last")
            [void]$resolverCandidates.Add("$last $first")
        }
    }

    foreach ($candidate in @($resolverCandidates | Select-Object -Unique)) {
        try {
            $recipient = $namespace.CreateRecipient([string]$candidate)
            if ($recipient.Resolve()) {
                $direct = Build-DirectoryResult $recipient.AddressEntry 'Outlook resolver'
                if ($null -ne $direct) {
                    [void](Add-DirectoryResult $direct)
                }
            }
        } catch { }
    }

    if ($results.Count -gt 0 -and $terms.Count -ge 2) {
        Result $null $results
        exit 0
    }

    if ($results.Count -gt 0 -and $terms.Count -eq 1) {
        $directName = ([string]$results[0].name).Trim().ToLowerInvariant()
        $directLastName = (($directName -split ',', 2)[0]).Trim()
        if ($directLastName.StartsWith($needle)) {
            Result $null $results
            exit 0
        }
    }

    $addressLists = @($namespace.AddressLists)
    $preferred = @($addressLists | Where-Object { $_.Name -match 'Global Address List|GAL|WWT' })
    if ($preferred.Count -eq 0) { $preferred = $addressLists }

    $scanned = 0
    $scanBackwards = $false
    $sortTerm = if ($terms.Count -ge 2) { [string]$terms[$terms.Count - 1] } else { [string]$terms[0] }
    if (-not [string]::IsNullOrWhiteSpace($sortTerm)) {
        $firstChar = [char]$sortTerm.Substring(0, 1)
        $scanBackwards = [int]$firstChar -ge [int][char]'n'
    }

    foreach ($list in $preferred) {
        if ($results.Count -ge $Limit -or $scanned -ge $ScanLimit) { break }
        $entries = $list.AddressEntries
        if ($null -eq $entries) { continue }

        $count = [Math]::Min($entries.Count, $ScanLimit - $scanned)
        for ($offset = 0; $offset -lt $count; $offset++) {
            if ($results.Count -ge $Limit -or $scanned -ge $ScanLimit) { break }
            $scanned++

            try {
                $i = if ($scanBackwards) { $entries.Count - $offset } else { $offset + 1 }
                $entry = $entries.Item($i)
                if ($null -eq $entry) { continue }

                $result = Build-DirectoryResult $entry $list.Name
                if ($null -eq $result) { continue }
                $displayName = [string]$result.name
                $email = [string]$result.email
                $title = [string]$result.title
                $department = [string]$result.department
                $office = [string]$result.office

                $haystack = (@($displayName, $email, $title, $department, $office) -join ' ').ToLowerInvariant()
                $matchesAllTerms = $true
                foreach ($term in $terms) {
                    if (-not $haystack.Contains($term)) {
                        $matchesAllTerms = $false
                        break
                    }
                }
                if (-not $matchesAllTerms) { continue }

                [void](Add-DirectoryResult $result)
            } catch {
                continue
            }
        }
    }

    Result $null $results
} catch {
    Result ("Outlook directory search failed: " + $_.Exception.Message) @()
}
