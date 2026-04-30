# outlook-attachments.ps1
#
# Saves all attachments for a single Outlook message to a target directory.
# Outputs a JSON manifest of saved files.
#
# Usage:
#   powershell -NonInteractive -File outlook-attachments.ps1 `
#     -MessageId "<message-id>" -TargetDir "C:\path\to\dir"

param(
    [string]$MessageId,
    [string]$TargetDir
)

$ErrorActionPreference = 'Stop'

# -------------------------------------------------------------------------
# Find a message by its internet message ID across common folders.
# -------------------------------------------------------------------------
function Find-Message {
    param($Namespace, [string]$InternetMessageId)

    foreach ($folderId in @(6, 5)) {  # 6 = Inbox, 5 = Sent Items
        try {
            $folder = $Namespace.GetDefaultFolder($folderId)
            $filter = "@SQL=""http://schemas.microsoft.com/mapi/proptag/0x1035001F"" = '$InternetMessageId'"
            $items = $folder.Items.Restrict($filter)
            if ($items.Count -gt 0) {
                return $items.Item(1)
            }
        } catch {
            # Folder unavailable or filter failed — try next folder.
        }
    }
    return $null
}

# -------------------------------------------------------------------------
# Main
# -------------------------------------------------------------------------

try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
    @{ error = 'Outlook not running'; saved = @() } | ConvertTo-Json -Depth 3
    exit 0
}

$namespace = $outlook.GetNamespace('MAPI')
$message = Find-Message -Namespace $namespace -InternetMessageId $MessageId

if (-not $message) {
    @{ error = 'Message not found'; saved = @() } | ConvertTo-Json -Depth 3
    exit 0
}

if (-not (Test-Path $TargetDir)) {
    try {
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    } catch {
        @{ error = "Could not create target directory: $_"; saved = @() } | ConvertTo-Json -Depth 3
        exit 0
    }
}

$saved = @()

foreach ($att in $message.Attachments) {
    try {
        # Sanitize filename to avoid path traversal and illegal characters.
        $safeName = $att.FileName -replace '[\\/:*?"<>|]', '_'
        $destPath = Join-Path $TargetDir $safeName
        $att.SaveAsFile($destPath)
        $saved += @{
            name      = $att.FileName
            safe_name = $safeName
            size      = $att.Size
            path      = $destPath
        }
    } catch {
        # Log individual save failure to stderr; continue with remaining attachments.
        Write-Error "outlook-attachments.ps1: failed to save attachment '$($att.FileName)': $_"
    }
}

@{ error = $null; saved = $saved } | ConvertTo-Json -Depth 3
