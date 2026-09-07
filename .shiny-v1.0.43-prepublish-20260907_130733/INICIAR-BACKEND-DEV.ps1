$ErrorActionPreference = "Stop"

Set-Location "C:\Users\igarcia\Videos\Shiny"

Write-Host ""
Write-Host "===== SHINY BACKEND DEV =====" -ForegroundColor Cyan

$token = (& gh auth token 2>$null)

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
    throw "No fue posible obtener el token de GitHub CLI."
}

$env:SHINY_GITHUB_TOKEN = $token.Trim()
$env:SHINY_DEV_VERSION   = "1.0.12"
$env:NODE_ENV            = "development"

Write-Host "[OK] Version: $env:SHINY_DEV_VERSION" -ForegroundColor Green
Write-Host "[OK] GitHub token: cargado" -ForegroundColor Green
Write-Host "[OK] NODE_ENV: $env:NODE_ENV" -ForegroundColor Green

Set-Location "C:\Users\igarcia\Videos\Shiny\backend"

npm run dev