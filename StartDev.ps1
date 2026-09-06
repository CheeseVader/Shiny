param(
    [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny",
    [string]$ReleaseRepo = "CheeseVader/Shiny-Release",
    [int]$BackendPort = 8787,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

function Stop-ShinyListener([int]$Port) {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) { return }

    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        $cmd = if ($proc) { [string]$proc.CommandLine } else { "" }

        if ($cmd -and $cmd -notmatch [regex]::Escape($ProjectRoot)) {
            throw "Puerto $Port ocupado por un proceso ajeno a Shiny. PID=$procId CMD=$cmd"
        }

        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

Set-Location $ProjectRoot

$token = (& gh auth token 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
    throw "GitHub CLI no tiene una sesion valida."
}
$token = $token.Trim()

$latestTag = (& gh release view --repo $ReleaseRepo --json tagName --jq ".tagName" 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($latestTag)) {
    throw "No se pudo consultar el release privado."
}
$DevVersion = $latestTag.Trim() -replace '^v',''

Write-Host ""
Write-Host "===== LIMPIAR INSTANCIAS ANTERIORES =====" -ForegroundColor Cyan

Stop-ShinyListener $BackendPort
Stop-ShinyListener $FrontendPort

Get-CimInstance Win32_Process |
Where-Object {
    $_.Name -eq "node.exe" -and
    ([string]$_.CommandLine) -match [regex]::Escape($ProjectRoot)
} |
ForEach-Object {
    if ($_.ProcessId -ne $PID) {
        Write-Host "Cerrando Node residual PID $($_.ProcessId)..."
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "===== BACKEND =====" -ForegroundColor Cyan

$BackendDir = Join-Path $ProjectRoot "backend"
$backendCommand = @"
`$ErrorActionPreference = 'Stop'
`$env:SHINY_GITHUB_TOKEN = '$token'
`$env:SHINY_DEV_VERSION = '$DevVersion'
`$env:NODE_ENV = 'development'
Set-Location '$BackendDir'
Write-Host '[SHINY] Backend DEV' -ForegroundColor Cyan
Write-Host '[SHINY] Version: $DevVersion' -ForegroundColor Green
Write-Host '[SHINY] GitHub privado: autenticado' -ForegroundColor Green
npm run dev
"@

Start-Process powershell.exe -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-Command",$backendCommand | Out-Null

$deadline = (Get-Date).AddSeconds(20)
do {
    Start-Sleep -Milliseconds 500
    $backendReady = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
} until ($backendReady -or (Get-Date) -gt $deadline)

if (-not $backendReady) {
    throw "El backend no abrio el puerto $BackendPort. Revisa su ventana."
}
Write-Host "[OK] Backend escuchando en $BackendPort." -ForegroundColor Green

Write-Host ""
Write-Host "===== FRONTEND =====" -ForegroundColor Cyan

$FrontendDir = Join-Path $ProjectRoot "frontend"
$frontendCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location '$FrontendDir'
Write-Host '[SHINY] Frontend DEV' -ForegroundColor Cyan
npm run dev
"@

Start-Process powershell.exe -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-Command",$frontendCommand | Out-Null

$deadline = (Get-Date).AddSeconds(20)
do {
    Start-Sleep -Milliseconds 500
    $frontendReady = Get-NetTCPConnection -LocalPort $FrontendPort -State Listen -ErrorAction SilentlyContinue
} until ($frontendReady -or (Get-Date) -gt $deadline)

if (-not $frontendReady) {
    throw "El frontend no abrio el puerto $FrontendPort. Revisa su ventana."
}

Write-Host "[OK] Frontend escuchando en $FrontendPort." -ForegroundColor Green
Write-Host ""
Write-Host "Shiny DEV listo: http://127.0.0.1:$FrontendPort" -ForegroundColor Green
Write-Host "Version DEV: $DevVersion"

# SHINY_CLOUDFLARE_DUAL_DEV_R2_BEGIN
Write-Host ""
Write-Host "===== CLOUDFLARED =====" -ForegroundColor Cyan

$cfDualLauncher = Join-Path $PSScriptRoot ".shiny-cloudflare-autostart\INICIAR-CLOUDFLARED-DUAL-DEV-R2.ps1"

if (Test-Path $cfDualLauncher) {
    & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $cfDualLauncher `
        -Cloudflared "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
        -StateDir (Join-Path $PSScriptRoot ".shiny-cloudflare-autostart")
} else {
    Write-Host "[AVISO] No existe launcher Cloudflared dual R2." -ForegroundColor Yellow
}
# SHINY_CLOUDFLARE_DUAL_DEV_R2_END
