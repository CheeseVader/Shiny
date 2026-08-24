param(
  [Parameter(Mandatory=$true)]
  [ValidateNotNullOrEmpty()]
  [string]$ClientName,

  [string]$DestinationRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = "Stop"
$source = $PSScriptRoot
$safeFolderName = ($ClientName.Trim() -replace '[^A-Za-z0-9._-]+','-').Trim('-')
if(-not $safeFolderName){ throw "INVALID_CLIENT_NAME" }
$destination = Join-Path $DestinationRoot $safeFolderName

if(Test-Path -LiteralPath $destination){
  throw "DESTINATION_ALREADY_EXISTS: $destination"
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null

robocopy $source $destination /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 `
  /XD `
    (Join-Path $source ".git") `
    (Join-Path $source "node_modules") `
    (Join-Path $source "frontend\node_modules") `
    (Join-Path $source "frontend\dist") `
    (Join-Path $source "backend\node_modules") `
    (Join-Path $source "backend\dist") `
    (Join-Path $source "services\visual-search-beta\.venv") `
    (Join-Path $source "backups") `
  /XF ".env" ".env.local" ".env.production" "*.log" "*.dump" "*.bak" "*.bundle"

if($LASTEXITCODE -gt 7){ throw "ROBOCOPY_FAILED: $LASTEXITCODE" }

$brandPath = Join-Path $destination "brand.config.json"
$brand = Get-Content -LiteralPath $brandPath -Raw | ConvertFrom-Json
$brand.name = $ClientName.Trim()
$brand.shortName = $ClientName.Trim()
$brand.legalName = $ClientName.Trim()
$brand.posName = "$($ClientName.Trim()) POS"
$brand.visionName = "$($ClientName.Trim()) Vision"
$brand.emailFromName = $ClientName.Trim()
$brand | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $brandPath -Encoding UTF8

foreach($dataPath in @(
  "backend\storage\media",
  "backend\storage\tcg-images",
  "backend\storage\product-images",
  "backend\uploads\products"
)){
  $full = Join-Path $destination $dataPath
  if(Test-Path -LiteralPath $full){
    Get-ChildItem -LiteralPath $full -Force | Remove-Item -Recurse -Force
  } else {
    New-Item -ItemType Directory -Path $full -Force | Out-Null
  }
  New-Item -ItemType File -Path (Join-Path $full ".gitkeep") -Force | Out-Null
}

Push-Location $destination
try {
  git init
  git branch -M main
  git add .
  git commit -m "Create $ClientName application"
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "CLIENT_APPLICATION_CREATED" -ForegroundColor Green
Write-Host "Name: $ClientName"
Write-Host "Path: $destination"
