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

# Already running?
if (Test-OutlookCom) {
    @{ launched = $false; ready = $true; error = $null } | ConvertTo-Json
    exit 0
}

# Launch it
try {
    Start-Process outlook.exe
} catch {
    @{ launched = $false; ready = $false; error = "Failed to launch Outlook: $_" } | ConvertTo-Json
    exit 0
}

# Poll until COM is accessible or timeout
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-OutlookCom) {
        @{ launched = $true; ready = $true; error = $null } | ConvertTo-Json
        exit 0
    }
}

@{ launched = $true; ready = $false; error = "Outlook launched but did not become accessible within ${TimeoutSeconds}s" } | ConvertTo-Json
