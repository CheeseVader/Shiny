\
param([string]$ProjectRoot = (Resolve-Path ".").Path)

$ErrorActionPreference = "Stop"

Push-Location $ProjectRoot
try {
  npm install
  npm run install:all

  if (-not (Test-Path ".\backend\.env")) {
    Copy-Item ".\backend\.env.example" ".\backend\.env"
    Write-Host "Creado backend\.env"
  } else {
    Write-Host "backend\.env ya existe; no se sobrescribió."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Configura backend\.env y luego ejecuta:"
Write-Host "npm run dev"
Write-Host ""
Write-Host "Frontend React: http://localhost:5173"
Write-Host "API:            http://localhost:8787"
