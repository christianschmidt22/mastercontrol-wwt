# outlook-fetch.ps1
#
# Reads unread (and recently read) mail from the locally running Outlook desktop
# app via COM automation. Outputs a JSON array of message objects to stdout.
# Each object includes attachment metadata so the Node sync service can pre-filter
# before deciding to invoke outlook-attachments.ps1.
#
# Usage:
#   powershell -NonInteractive -File outlook-fetch.ps1 [-MaxMessages <n>]
#
# Outputs:
#   JSON array on stdout; any errors are written to stderr.

param(
    [int]$MaxMessages = 100
)

$ErrorActionPreference = 'Stop'

try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
    # Outlook not running — return empty array so the caller can skip gracefully.
    @() | ConvertTo-Json
    exit 0
}

$namespace = $outlook.GetNamespace('MAPI')

# Folder IDs: 6 = Inbox, 5 = Sent Items
$folderIds = @(6, 5)

$messages = @()

foreach ($folderId in $folderIds) {
    try {
        $folder = $namespace.GetDefaultFolder($folderId)
        $items = $folder.Items
        $items.Sort('[ReceivedTime]', $true)

        $count = 0
        foreach ($item in $items) {
            if ($count -ge $MaxMessages) { break }
            if ($item.Class -ne 43) { continue }  # 43 = olMail

            # Build attachment metadata list.
            $attList = @()
            foreach ($att in $item.Attachments) {
                $contentType = ''
                try {
                    $contentType = $att.PropertyAccessor.GetProperty(
                        'http://schemas.microsoft.com/mapi/proptag/0x370E001F'
                    )
                } catch {
                    $contentType = ''
                }
                $attList += @{
                    name         = $att.FileName
                    size         = $att.Size
                    content_type = $contentType
                }
            }

            $sentOn = ''
            try { $sentOn = $item.SentOn.ToString('o') } catch { $sentOn = '' }

            $messages += @{
                internet_message_id = $item.InternetMessageId
                subject             = $item.Subject
                sender              = $item.SenderEmailAddress
                sent_at             = $sentOn
                body_preview        = $item.Body.Substring(0, [Math]::Min(500, $item.Body.Length))
                has_attachments     = if ($item.Attachments.Count -gt 0) { 1 } else { 0 }
                attachments         = $attList
            }

            $count++
        }
    } catch {
        # Log to stderr and continue with next folder.
        Write-Error "outlook-fetch.ps1: folder $folderId error: $_"
    }
}

$messages | ConvertTo-Json -Depth 4
