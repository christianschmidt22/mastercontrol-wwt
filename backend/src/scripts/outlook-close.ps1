$ErrorActionPreference = 'SilentlyContinue'

try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
    $outlook.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null
    @{ closed = $true; error = $null } | ConvertTo-Json
} catch {
    @{ closed = $false; error = "$_" } | ConvertTo-Json
}
