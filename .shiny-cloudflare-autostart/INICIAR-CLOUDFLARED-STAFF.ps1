$ErrorActionPreference = 'SilentlyContinue'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$stdout  = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\cloudflared-staff.out.log'
$stderr  = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\cloudflared-staff.err.log'
$urlFile = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\staff-url.txt'
$pidFile = 'C:\Users\igarcia\Videos\Shiny\.shiny-cloudflare-autostart\staff.pid'

# Esperar hasta 2 minutos a que Shiny staff esté disponible.
for ($i=0; $i -lt 120; $i++) {
    try {
        $r = Invoke-WebRequest 'http://127.0.0.1:8788/api/shiny-entry-mode' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { break }
    } catch {}
    Start-Sleep -Seconds 1
}

# Evitar duplicados.
if (Test-Path $pidFile) {
    try {
        $oldPid = [int](Get-Content $pidFile -Raw)
        $old = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($old -and $old.ProcessName -eq 'cloudflared') { exit 0 }
    } catch {}
}

Remove-Item $stdout,$stderr,$urlFile -Force -ErrorAction SilentlyContinue

$p = Start-Process -FilePath $cloudflared 
    -ArgumentList 'tunnel --url http://127.0.0.1:8788 --no-autoupdate' 
    -WindowStyle Hidden 
    -RedirectStandardOutput $stdout 
    -RedirectStandardError $stderr 
    -PassThru

Set-Content -Path $pidFile -Value $p.Id -Encoding ascii

for ($i=0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    $txt = ''
    if (Test-Path $stdout) { $txt += Get-Content $stdout -Raw -ErrorAction SilentlyContinue }
    if (Test-Path $stderr) { $txt += "
" + (Get-Content $stderr -Raw -ErrorAction SilentlyContinue) }

    $m = [regex]::Matches($txt, 'https://[a-z0-9-]+\.trycloudflare\.com', 'IgnoreCase')
    if ($m.Count -gt 0) {
        Set-Content -Path $urlFile -Value $m[$m.Count - 1].Value -Encoding ascii
        break
    }
}