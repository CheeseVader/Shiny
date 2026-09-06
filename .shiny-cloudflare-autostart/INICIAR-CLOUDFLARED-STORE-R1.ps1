$ErrorActionPreference = 'Continue'
$stateDir = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart'
$urlFile = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\store-url.txt'
$logFile = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\cloudflared-store.log'
$pidFile = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\store-watcher.pid'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$target = 'http://127.0.0.1:5173/tienda'

Set-Content -Path $pidFile -Value $PID -Encoding ascii

function Log([string]$m) {
    Add-Content -Path $logFile -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m)
}

Log "Watcher STORE iniciado. PID=$PID"

while ($true) {
    while (-not (Test-NetConnection 127.0.0.1 -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
        Start-Sleep -Seconds 2
    }

    Remove-Item $urlFile -Force -ErrorAction SilentlyContinue
    Log "Vite disponible. Lanzando cloudflared STORE."

    try {
        & $cloudflared tunnel --url $target --no-autoupdate 2>&1 | ForEach-Object {
            $line = [string]$_
            Add-Content -Path $logFile -Value $line

            if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                $u = $Matches[0]
                Set-Content -Path $urlFile -Value $u -Encoding ascii
                Log "URL STORE capturada: $u"
            }
        }
    } catch {
        Log "ERROR STORE: $($_.Exception.Message)"
    }

    Log "cloudflared STORE termino. Reintentando en 5s."
    Start-Sleep -Seconds 5
}