param(
    [string]$Cloudflared,
    [string]$UrlFile,
    [string]$LogFile
)

$ErrorActionPreference = 'Continue'

while ($true) {
    try {
        while (-not (Test-NetConnection 127.0.0.1 -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
            Start-Sleep -Seconds 1
        }

        Remove-Item $UrlFile -Force -ErrorAction SilentlyContinue

        & $Cloudflared tunnel --url http://127.0.0.1:5173 --no-autoupdate 2>&1 |
            ForEach-Object {
                $line = [string]$_
                Add-Content -Path $LogFile -Value $line

                if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                    $u = $Matches[0]
                    Set-Content -Path $UrlFile -Value $u -Encoding ascii
                }
            }
    } catch {
        Add-Content -Path $LogFile -Value ("ERROR: " + $_.Exception.Message)
    }

    Start-Sleep -Seconds 5
}