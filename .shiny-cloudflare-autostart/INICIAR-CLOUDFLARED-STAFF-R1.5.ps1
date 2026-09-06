$ErrorActionPreference = 'SilentlyContinue'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$watchLog   = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\autostart-watch.log'
$stdout     = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\cloudflared-staff.out.log'
$stderr     = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\cloudflared-staff.err.log'
$urlFile    = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\staff-url.txt'
$pidFile    = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\staff.pid'

function Log([string]$m) {
    Add-Content -Path $watchLog -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8
}

Log "Watcher iniciado."

# Si ya existe una instancia válida creada por este launcher, no duplicarla.
if (Test-Path $pidFile) {
    try {
        $oldPid = [int](Get-Content $pidFile -Raw)
        $old = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($old -and $old.ProcessName -eq 'cloudflared') {
            Log "cloudflared ya activo PID=$oldPid. No se duplica."
            exit 0
        }
    } catch {}
}

# Esperar SIN LIMITE a que Shiny staff esté disponible.
Log "Esperando Shiny en 127.0.0.1:8788..."
while ($true) {
    try {
        $r = Invoke-WebRequest 'http://127.0.0.1:8788/api/shiny-entry-mode' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            Log "Shiny disponible. Iniciando cloudflared."
            break
        }
    } catch {}
    Start-Sleep -Seconds 2
}

Remove-Item $stdout,$stderr,$urlFile -Force -ErrorAction SilentlyContinue

$p = Start-Process -FilePath $cloudflared 
    -ArgumentList 'tunnel --url http://127.0.0.1:8788 --no-autoupdate' 
    -WindowStyle Hidden 
    -RedirectStandardOutput $stdout 
    -RedirectStandardError $stderr 
    -PassThru

Set-Content -Path $pidFile -Value $p.Id -Encoding ascii
Log "cloudflared iniciado PID=$($p.Id)."

# Capturar URL y confirmar registro.
for ($i=0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 1

    $txt = ''
    if (Test-Path $stdout) { $txt += Get-Content $stdout -Raw -ErrorAction SilentlyContinue }
    if (Test-Path $stderr) { $txt += "
" + (Get-Content $stderr -Raw -ErrorAction SilentlyContinue) }

    if ($txt -match 'Registered tunnel connection') {
        Log "Tunnel registrado correctamente."
    }

    $m = [regex]::Matches($txt, 'https://[a-z0-9-]+\.trycloudflare\.com', 'IgnoreCase')
    if ($m.Count -gt 0) {
        $url = $m[$m.Count - 1].Value
        Set-Content -Path $urlFile -Value $url -Encoding ascii
        Log "URL capturada: $url"
        break
    }

    if ($p.HasExited) {
        Log "cloudflared terminó prematuramente. ExitCode=$($p.ExitCode)"
        exit 3
    }
}

# Mantener watcher vivo para reiniciar cloudflared si se cae mientras Shiny sigue disponible.
while ($true) {
    Start-Sleep -Seconds 5

    $proc = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
    if (-not $proc) {
        Log "cloudflared dejó de ejecutarse. Reiniciando watcher."
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\INICIAR-CLOUDFLARED-STAFF-R1.5.ps1'
        exit 0
    }
}