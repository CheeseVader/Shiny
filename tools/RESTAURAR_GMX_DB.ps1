param(
  [string]$Root = "C:\GMX",
  [string]$DumpFile = "",
  [switch]$RecreateDatabase
)

$ErrorActionPreference = "Stop"

function Read-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0,$idx).Trim()
    $val = $line.Substring($idx+1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or
        ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1,$val.Length-2)
    }
    $map[$key] = $val
  }
  return $map
}

Set-Location $Root

foreach ($cmd in @("psql","pg_restore")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd no esta instalado o no esta en PATH."
  }
}

$cfg = Read-DotEnv (Join-Path $Root "backend\.env")
$pgHost = if ($cfg["PGHOST"]) { $cfg["PGHOST"] } else { "127.0.0.1" }
$pgPort = if ($cfg["PGPORT"]) { $cfg["PGPORT"] } else { "5432" }
$pgDb   = if ($cfg["PGDATABASE"]) { $cfg["PGDATABASE"] } else { "gmx_db" }
$pgUser = if ($cfg["PGUSER"]) { $cfg["PGUSER"] } else { "gmx_app" }
$pgPass = $cfg["PGPASSWORD"]

if (-not $DumpFile) {
  $latestPath = Join-Path $Root "backups\database\LATEST.txt"
  if (-not (Test-Path $latestPath)) {
    throw "No se encontro LATEST.txt. Indica -DumpFile."
  }
  $latest = @{}
  Get-Content $latestPath | ForEach-Object {
    $p = $_ -split "=",2
    if ($p.Count -eq 2) { $latest[$p[0]]=$p[1] }
  }
  $DumpFile = Join-Path $Root ("backups\database\" + $latest["file"])
}

if (-not (Test-Path $DumpFile)) {
  throw "No se encontro dump: $DumpFile"
}

$oldPgPassword = $env:PGPASSWORD
try {
  if ($pgPass) { $env:PGPASSWORD=$pgPass }

  if ($RecreateDatabase) {
    Write-Host "Recreando base $pgDb..." -ForegroundColor Yellow

    & psql --host=$pgHost --port=$pgPort --username=$pgUser --dbname=postgres `
      --command="DROP DATABASE IF EXISTS `"$pgDb`";"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo eliminar la base." }

    & psql --host=$pgHost --port=$pgPort --username=$pgUser --dbname=postgres `
      --command="CREATE DATABASE `"$pgDb`" OWNER `"$pgUser`";"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la base." }
  }

  Write-Host "Restaurando $DumpFile -> $pgDb" -ForegroundColor Cyan

  & pg_restore `
    --host=$pgHost `
    --port=$pgPort `
    --username=$pgUser `
    --dbname=$pgDb `
    --no-owner `
    --no-acl `
    --exit-on-error `
    $DumpFile

  if ($LASTEXITCODE -ne 0) { throw "pg_restore fallo." }

  Write-Host "Restauracion completada." -ForegroundColor Green

  & psql --host=$pgHost --port=$pgPort --username=$pgUser --dbname=$pgDb `
    --command="SELECT current_database(), current_user, NOW();"
}
finally {
  $env:PGPASSWORD=$oldPgPassword
}
