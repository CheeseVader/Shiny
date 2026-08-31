param(
  [string]$Root = "C:\Users\igarcia\Videos\Shiny",
  [string]$CommitMessage = "",
  [switch]$Push
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

function Test-GitTracked([string]$Path) {
  # No usar --error-unmatch porque PowerShell 7 puede convertir STDERR
  # de git en NativeCommandError cuando ErrorActionPreference=Stop.
  $result = & git ls-files -- "$Path" 2>$null
  return -not [string]::IsNullOrWhiteSpace(($result -join "`n"))
}

Set-Location $Root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git no esta instalado o no esta en PATH."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump no esta instalado o no esta en PATH."
}

$envFile = Join-Path $Root "backend\.env"
$cfg = Read-DotEnv $envFile

$pgHost = if ($cfg["PGHOST"]) { $cfg["PGHOST"] } else { "127.0.0.1" }
$pgPort = if ($cfg["PGPORT"]) { $cfg["PGPORT"] } else { "5432" }
$pgDb   = if ($cfg["PGDATABASE"]) { $cfg["PGDATABASE"] } else { "shiny_db" }
$pgUser = if ($cfg["PGUSER"]) { $cfg["PGUSER"] } else { "shiny_app" }
$pgPass = $cfg["PGPASSWORD"]

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dbDir = Join-Path $Root "backups\database"
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

# Reutiliza el dump mas reciente si fue creado en los ultimos 10 minutos y existe LATEST.txt,
# para evitar generar otro innecesariamente tras un fallo de validacion Git.
$latestMeta = Join-Path $dbDir "LATEST.txt"
$dumpFile = $null
$hashFile = $null
$reuse = $false

if (Test-Path $latestMeta) {
  $latest = @{}
  Get-Content $latestMeta | ForEach-Object {
    $p = $_ -split "=",2
    if ($p.Count -eq 2) { $latest[$p[0]] = $p[1] }
  }
  if ($latest["file"]) {
    $candidate = Join-Path $dbDir $latest["file"]
    if (Test-Path $candidate) {
      $age = (Get-Date) - (Get-Item $candidate).LastWriteTime
      if ($age.TotalMinutes -lt 10) {
        $dumpFile = $candidate
        $hashFile = $candidate + ".sha256"
        $reuse = $true
      }
    }
  }
}

if (-not $reuse) {
  $dumpFile = Join-Path $dbDir ("shiny_db_" + $stamp + ".dump")
  $hashFile = $dumpFile + ".sha256"

  Write-Host ""
  Write-Host "=== RESPALDO POSTGRESQL ===" -ForegroundColor Cyan
  Write-Host "Host: $pgHost"
  Write-Host "Puerto: $pgPort"
  Write-Host "Base: $pgDb"
  Write-Host "Usuario: $pgUser"
  Write-Host "Destino: $dumpFile"

  $oldPgPassword = $env:PGPASSWORD
  try {
    if ($pgPass) { $env:PGPASSWORD = $pgPass }

    & pg_dump `
      --host=$pgHost `
      --port=$pgPort `
      --username=$pgUser `
      --dbname=$pgDb `
      --format=custom `
      --no-owner `
      --no-acl `
      --file=$dumpFile

    if ($LASTEXITCODE -ne 0) {
      throw "pg_dump fallo con codigo $LASTEXITCODE."
    }
  }
  finally {
    $env:PGPASSWORD = $oldPgPassword
  }

  $hash = Get-FileHash -Algorithm SHA256 $dumpFile
  "$($hash.Hash)  $([IO.Path]::GetFileName($dumpFile))" | Set-Content -Encoding ASCII $hashFile

  @(
    "file=$([IO.Path]::GetFileName($dumpFile))"
    "sha256=$($hash.Hash)"
    "created=$(Get-Date -Format o)"
    "database=$pgDb"
  ) | Set-Content -Encoding UTF8 $latestMeta

  Write-Host "Dump creado correctamente." -ForegroundColor Green
  Write-Host "SHA256: $($hash.Hash)"
}
else {
  Write-Host ""
  Write-Host "=== RESPALDO POSTGRESQL ===" -ForegroundColor Cyan
  Write-Host "Reutilizando dump reciente: $dumpFile" -ForegroundColor Yellow
  if (Test-Path $hashFile) {
    Write-Host "Hash existente: $(Get-Content $hashFile)"
  }
}

Write-Host ""
Write-Host "=== VALIDACION DE SEGURIDAD ===" -ForegroundColor Cyan

$danger = @(
  "backend/.env",
  "frontend/.env",
  ".env"
)

foreach($d in $danger) {
  if (Test-GitTracked $d) {
    throw "SEGURIDAD: $d esta siendo rastreado por Git. Retiralo del indice antes de continuar."
  }
}

Write-Host "Archivos .env no rastreados: OK" -ForegroundColor Green

if (-not (Test-Path ".git")) {
  git init
  if ($LASTEXITCODE -ne 0) { throw "git init fallo." }
}

Write-Host ""
Write-Host "=== GIT STATUS ===" -ForegroundColor Cyan
git status --short

git add -A
if ($LASTEXITCODE -ne 0) { throw "git add fallo." }

# Segunda validacion DESPUES de git add.
foreach($d in $danger) {
  if (Test-GitTracked $d) {
    git reset -- "$d" 2>$null
    throw "SEGURIDAD: $d intento entrar al commit. Se retiro del staging. Revisa .gitignore."
  }
}

$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "No hay cambios nuevos para commit." -ForegroundColor Yellow
} else {
  if (-not $CommitMessage) {
    $CommitMessage = "backup: Shiny completo + DB $stamp"
  }
  git commit -m $CommitMessage
  if ($LASTEXITCODE -ne 0) { throw "git commit fallo." }
}

Write-Host ""
Write-Host "Ultimo commit:" -ForegroundColor Cyan
git log -1 --oneline

if ($Push) {
  $remote = git remote
  if (-not $remote) {
    throw "No hay remote Git configurado."
  }

  $branch = git branch --show-current
  if (-not $branch) { $branch = "main" }

  git push -u origin $branch
  if ($LASTEXITCODE -ne 0) { throw "git push fallo." }

  Write-Host "Push completado." -ForegroundColor Green
}

Write-Host ""
Write-Host "RESPALDO Shiny COMPLETADO." -ForegroundColor Green
Write-Host "DB: $dumpFile"
Write-Host "Hash: $hashFile"
