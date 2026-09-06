$ErrorActionPreference = "Continue"

$cloudflared = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe"
$staffPort = 5173
$watchLog    = "C:\\Users\\igarcia\\Videos\\Shiny\\.shiny-cloudflare-autostart\\autostart-watch.log"
$cfLog       = "C:\\Users\\igarcia\\Videos\\Shiny\\.shiny-cloudflare-autostart\\cloudflared-staff.log"
$urlFile     = "C:\\Users\\igarcia\\Videos\\Shiny\\.shiny-cloudflare-autostart\\staff-url.txt"
$watchPid    = "C:\\Users\\igarcia\\Videos\\Shiny\\.shiny-cloudflare-autostart\\watcher.pid"

function Log([string]$m) {
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
    Add-Content -Path $watchLog -Value $line -Encoding UTF8
}

Set-Content -Path $watchPid -Value $PID -Encoding ascii
Log "Watcher R1.6 iniciado. PID=$PID"

while ($true) {

    Log "Esperando Shiny en 127.0.0.1:$staffPort..."

    while ($true) {
        try {
            $r = Invoke-WebRequest "http://127.0.0.1:$staffPort/api/shiny-entry-mode" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { break }
        } catch {}
        Start-Sleep -Seconds 2
    }

    Log "Shiny disponible. Lanzando cloudflared."
    Remove-Item $cfLog,$urlFile -Force -ErrorAction SilentlyContinue

    try {
        & $cloudflared tunnel --url "http://127.0.0.1:$staffPort" --no-autoupdate 2>&1 |
            ForEach-Object {
                $line = [string]$_
                Add-Content -Path $cfLog -Value $line -Encoding UTF8

                if ($line -match "Registered tunnel connection") {
                    Log "Tunnel registrado correctamente."
                }

                $m = [regex]::Match($line, "https://[a-z0-9-]+\.trycloudflare\.com", "IgnoreCase")
                if ($m.Success -and $m.Value -notmatch "^https://api\.trycloudflare\.com$") {
                    Set-Content -Path $urlFile -Value $m.Value -Encoding ascii
                    Log "URL capturada: $($m.Value)"
                }
            }
    } catch {
        Log "Error ejecutando cloudflared: $($_.Exception.Message)"
    }

    Log "cloudflared terminÃ³. Reintentando en 5 segundos."
    Start-Sleep -Seconds 5
}