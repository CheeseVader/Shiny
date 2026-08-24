param(
  [Parameter(Mandatory = $true)]
  [string]$Name,
  [string]$LegalName = "",
  [string]$Description = "Tienda especializada en TCG",
  [string]$PrimaryColor = "#121620",
  [string]$SecondaryColor = "#ffffff",
  [string]$AccentColor = "#d4af37"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $projectRoot "brand.config.json"

if (-not (Test-Path $configPath)) {
  throw "No se encontró brand.config.json en $projectRoot"
}

$brand = Get-Content $configPath -Raw | ConvertFrom-Json
$brand.name = $Name
$brand.shortName = $Name
$brand.legalName = $(if ($LegalName.Trim()) { $LegalName.Trim() } else { $Name })
$brand.posName = "$Name POS"
$brand.visionName = "$Name Vision"
$brand.description = $Description
$brand.emailFromName = $Name
$brand.primaryColor = $PrimaryColor
$brand.secondaryColor = $SecondaryColor
$brand.accentColor = $AccentColor

$json = $brand | ConvertTo-Json -Depth 10
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, $json, $utf8WithoutBom)

Write-Host "Marca configurada: $Name" -ForegroundColor Green
Write-Host "Archivo: $configPath"
Write-Host "Ejecute npm run build o npm run dev para aplicar los cambios."
