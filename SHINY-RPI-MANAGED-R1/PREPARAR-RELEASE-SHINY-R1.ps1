param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny",
  [Parameter(Mandatory=$true)][string]$Version,
  [string]$OutputDir = "$PWD\release-output"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if($Version -notmatch '^\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?$'){
  throw "Version inválida. Ejemplo: 1.0.8"
}

$ProjectRoot=[IO.Path]::GetFullPath($ProjectRoot)
$OutputDir=[IO.Path]::GetFullPath($OutputDir)

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "Validando árbol Shiny..." -ForegroundColor Cyan

$requiredFiles=@(
  "backend\package.json",
  "backend\package-lock.json",
  "backend\src\excelImportService.js",
  "backend\src\inventoryStockImportService.js",
  "backend\src\routes\dataExport.js",
  "backend\src\routes\inventoryStockImport.js",
  "backend\src\tcgSyncJobService.js",
  "frontend\src\components\SystemUpdatePanel.jsx"
)

foreach($rel in $requiredFiles){
  if(!(Test-Path (Join-Path $ProjectRoot $rel))){
    throw "Archivo requerido no encontrado: $rel"
  }
}

$packageJson=Get-Content (Join-Path $ProjectRoot "backend\package.json") -Raw |
  ConvertFrom-Json

if(-not $packageJson.dependencies.xlsx){
  throw "La dependencia XLSX no está declarada en backend/package.json."
}

$packageLock=Get-Content (Join-Path $ProjectRoot "backend\package-lock.json") -Raw

if($packageLock -notmatch '"node_modules/xlsx"'){
  throw "XLSX no está fijado en backend/package-lock.json."
}

$tcg=Get-Content (Join-Path $ProjectRoot "backend\src\tcgSyncJobService.js") -Raw

if($tcg -notmatch 'const\s+partial\s*='){
  throw "El release no contiene el fix TCG partial."
}

if($tcg -notmatch 'progress\s*:\s*100'){
  throw "El release no contiene finalización TCG a 100%."
}

$stage=Join-Path $env:TEMP ("shiny-release-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try{
  Write-Host "Preparando Shiny $Version..." -ForegroundColor Cyan

  $excludeDirs=@(
    ".git",
    "node_modules",
    "backups",
    "_shiny_backups",
    "dist",
    "uploads",
    "runtime",
    "logs",
    ".venv",
    "venv",
    "release-output"
  )

  $robocopyArgs=@(
    $ProjectRoot,
    $stage,
    "/E",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  )

  foreach($n in $excludeDirs){
    $robocopyArgs += "/XD"
    $robocopyArgs += (Join-Path $ProjectRoot $n)
  }

  # Nunca empaquetar archivos locales/generados.
  $robocopyArgs += "/XF"
  $robocopyArgs += (Join-Path $ProjectRoot "pokemon.json")

  & robocopy @robocopyArgs | Out-Null

  if($LASTEXITCODE -gt 7){
    throw "robocopy falló con código $LASTEXITCODE"
  }

  # Limpieza defensiva de secretos y contenido local.
  Get-ChildItem $stage -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -in @(
        "node_modules",
        ".git",
        ".venv",
        "venv",
        "uploads",
        "backups",
        "_shiny_backups",
        "release-output"
      ) -or
      $_.Name -like ".env*"
    } |
    Sort-Object FullName -Descending |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  Remove-Item (Join-Path $stage "pokemon.json") -Force -ErrorAction SilentlyContinue

  if(Test-Path (Join-Path $stage "release-output")){
    throw "SEGURIDAD: release-output apareció dentro del stage."
  }

  if(Test-Path (Join-Path $stage "pokemon.json")){
    throw "SEGURIDAD: pokemon.json apareció dentro del stage."
  }

  Set-Content `
    -Path (Join-Path $stage "VERSION") `
    -Value $Version `
    -Encoding ascii

  $archive=Join-Path $OutputDir "shiny-rpi-$Version.tar.gz"

  if(Test-Path $archive){
    Remove-Item $archive -Force
  }

  Push-Location $stage

  try{
    & tar -czf $archive .

    if($LASTEXITCODE -ne 0){
      throw "tar falló."
    }
  }
  finally{
    Pop-Location
  }

  $hash=(Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()

  $manifest=[ordered]@{
    product="Shiny"
    platform="rpi-arm64"
    version=$Version
    channel="stable"
    sha256=$hash
    package=("shiny-rpi-$Version.tar.gz")

    features=@(
      "TCG sync 97-to-100 fix",
      "System update visible progress UX",
      "Excel XLSX import",
      "Excel XLSX export",
      "Excel templates",
      "Raspberry Pi kiosk support"
    )

    dependencies=@{
      xlsx="0.18.5"
    }

    preserves=@(
      "PostgreSQL data",
      "SUPERADMIN",
      "usuarios",
      "clientes",
      "inventario",
      "ventas",
      "compras",
      ".env",
      "uploads"
    )

    generated_at=(Get-Date).ToUniversalTime().ToString("o")
  }

  $manifestPath=Join-Path $OutputDir "manifest-$Version.json"

  $manifest |
    ConvertTo-Json -Depth 8 |
    Set-Content -Path $manifestPath -Encoding UTF8

  Write-Host ""
  Write-Host "RELEASE PREPARADA" -ForegroundColor Green
  Write-Host "Paquete : $archive"
  Write-Host "Manifest: $manifestPath"
  Write-Host "SHA256  : $hash"
}
finally{
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}