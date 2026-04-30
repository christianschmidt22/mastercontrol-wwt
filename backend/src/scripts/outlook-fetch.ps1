param(
    [int]$Limit = 50
)

$ErrorActionPreference = 'Stop'

try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
    # Outlook not running — output empty result with an error flag
    @{ error = 'Outlook is not running'; messages = @() } | ConvertTo-Json -Depth 3
    exit 0
}

$namespace = $outlook.GetNamespace('MAPI')
$results = [System.Collections.Generic.List[hashtable]]::new()

function Get-Preview($body) {
    if (-not $body) { return '' }
    $clean = $body -replace '\r\n|\r|\n', ' ' -replace '\s+', ' '
    if ($clean.Length -gt 255) { return $clean.Substring(0, 255) }
    return $clean
}

function Get-Recipients($recipients) {
    $list = @()
    foreach ($r in $recipients) { $list += $r.Address }
    return $list
}

# Inbox = folder 6, Sent Items = folder 5
foreach ($folderId in @(6, 5)) {
    try {
        $folder = $namespace.GetDefaultFolder($folderId)
        $items = $folder.Items
        $items.Sort('[ReceivedTime]', $true)
        $count = 0
        foreach ($item in $items) {
            if ($count -ge $Limit) { break }
            # 43 = olMailItem
            if ($item.Class -ne 43) { continue }
            $results.Add(@{
                internet_message_id = $item.InternetMessageId
                subject             = $item.Subject
                from_email          = $item.SenderEmailAddress
                from_name           = $item.SenderName
                to_emails           = @(Get-Recipients $item.Recipients)
                cc_emails           = @()
                sent_at             = $item.SentOn.ToUniversalTime().ToString('o')
                has_attachments     = [int]($item.Attachments.Count -gt 0)
                body_preview        = Get-Preview $item.Body
            })
            $count++
        }
    } catch {
        # Folder not accessible — skip silently
    }
}

@{ error = $null; messages = $results } | ConvertTo-Json -Depth 5
