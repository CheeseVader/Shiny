param(
    [string]$Cloudflared,
    [string]$StateDir
)

$ErrorActionPreference = "Stop"

function Start-TunnelWorker {
    param(
        [string]$Name,
        [string]$UrlFile,
        [string]$LogFile
    )

    $worker = Join-Path $StateDir ("worker-" + $Name.ToLower() + "-r2.ps1")
    $workerText = @"
param(
    [string]`$Cloudflared,
    [string]`$UrlFile,
    [string]`$LogFile
)

`$ErrorActionPreference = 'Continue'

while (`$true) {
    try {
        while (-not (Test-NetConnection 127.0.0.1 -Port 5173 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
            Start-Sleep -Seconds 1
        }

        Remove-Item `$UrlFile -Force -ErrorAction SilentlyContinue

        & `$Cloudflared tunnel --url http://127.0.0.1:5173 --no-autoupdate 2>&1 |
            ForEach-Object {
                `$line = [string]`$_
                Add-Content -Path `$LogFile -Value `$line

                if (`$line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                    `$u = `$Matches[0]
                    Set-Content -Path `$UrlFile -Value `$u -Encoding ascii
                }
            }
    } catch {
        Add-Content -Path `$LogFile -Value ("ERROR: " + `$_.Exception.Message)
    }

    Start-Sleep -Seconds 5
}
"@

    [System.IO.File]::WriteAllText(
        $worker,
        $workerText,
        (New-Object System.Text.UTF8Encoding($false))
    )

    Start-Process powershell.exe `
        -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy","Bypass",
            "-WindowStyle","Hidden",
            "-File","`"$worker`"",
            "-Cloudflared","`"$Cloudflared`"",
            "-UrlFile","`"$UrlFile`"",
            "-LogFile","`"$LogFile`""
        ) `
        -WindowStyle Hidden | Out-Null
}

$staffUrl = Join-Path $StateDir "staff-url.txt"
$storeUrl = Join-Path $StateDir "store-url.txt"
$staffLog = Join-Path $StateDir "cloudflared-staff.log"
$storeLog = Join-Path $StateDir "cloudflared-store.log"

Remove-Item $staffUrl,$storeUrl -Force -ErrorAction SilentlyContinue

Start-TunnelWorker -Name "STAFF" -UrlFile $staffUrl -LogFile $staffLog
Start-Sleep -Seconds 1
Start-TunnelWorker -Name "STORE" -UrlFile $storeUrl -LogFile $storeLog

function Wait-Url([string]$Path) {
    for ($i=0; $i -lt 90; $i++) {
        if (Test-Path $Path) {
            try {
                $u = (Get-Content $Path -Raw).Trim()
                if ($u -match '^https://[a-z0-9-]+\.trycloudflare\.com/?$') {
                    return $u.TrimEnd('/')
                }
            } catch {}
        }
        Start-Sleep -Seconds 1
    }
    return $null
}

$staff = Wait-Url $staffUrl
$store = Wait-Url $storeUrl

Write-Host ""
Write-Host "===== CLOUDFLARED DUAL DEV R2 =====" -ForegroundColor Cyan

if ($staff) {
    Write-Host "[OK] ADMIN / CAJERO:" -ForegroundColor Green
    Write-Host "     $staff/login" -ForegroundColor Cyan
} else {
    Write-Host "[AVISO] No se obtuvo URL STAFF." -ForegroundColor Yellow
}

if ($store) {
    Write-Host "[OK] TIENDA:" -ForegroundColor Green
    Write-Host "     $store/tienda" -ForegroundColor Cyan
} else {
    Write-Host "[AVISO] No se obtuvo URL TIENDA." -ForegroundColor Yellow
}