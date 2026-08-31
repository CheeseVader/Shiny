param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-Text([string]$Path) {
  return [System.IO.File]::ReadAllText($Path)
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Backup-One([string]$Source, [string]$BackupRoot, [string]$Root) {
  $rel = $Source.Substring($Root.Length).TrimStart('\')
  $dest = Join-Path $BackupRoot $rel
  $dir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item -LiteralPath $Source -Destination $dest -Force
}

function Restore-One([string]$Source, [string]$BackupRoot, [string]$Root) {
  $rel = $Source.Substring($Root.Length).TrimStart('\')
  $bak = Join-Path $BackupRoot $rel
  if (Test-Path -LiteralPath $bak) {
    Copy-Item -LiteralPath $bak -Destination $Source -Force
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY OPERADOR -> POS R56B" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Login = Join-Path $ProjectRoot "frontend\src\pages\LoginPage.jsx"
$Protected = Join-Path $ProjectRoot "frontend\src\components\ProtectedRoute.jsx"
$Frontend = Join-Path $ProjectRoot "frontend"

foreach ($p in @($Login,$Protected)) {
  Assert-True (Test-Path -LiteralPath $p) "Falta archivo requerido: $p"
}

Write-Host "Proyecto        : $ProjectRoot"
Write-Host "Login           : $Login"
Write-Host "ProtectedRoute  : $Protected"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectRoot "_gmx_backups\OPERADOR-POS-R56B-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched = @($Login,$Protected)
foreach ($p in $Touched) { Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Backup          : $BackupRoot" -ForegroundColor DarkGray

try {
  # ------------------------------------------------------------
  # LOGIN: OPERADOR -> /admin/pos
  # ------------------------------------------------------------
  $t = Read-Text $Login

  $oldLoginTarget = "nav(kiosk ? '/admin/pedidos?kiosk=1' : '/admin/pedidos', { replace: true, state: null });"
  $newLoginTarget = "nav(kiosk ? '/admin/pos?kiosk=1' : '/admin/pos', { replace: true, state: null });"

  if ($t.Contains($oldLoginTarget)) {
    $t = $t.Replace($oldLoginTarget, $newLoginTarget)
  }
  elseif (-not $t.Contains($newLoginTarget)) {
    throw "No encontre target OPERADOR en LoginPage."
  }

  $t = $t.Replace("OPERADOR -> /admin/pedidos", "OPERADOR -> /admin/pos")
  $t = $t.Replace("/login?kiosk=1 -> /admin/pedidos?kiosk=1", "/login?kiosk=1 -> /admin/pos?kiosk=1")

  Write-Utf8NoBom $Login $t
  Write-Host "[OK] Login: OPERADOR -> POS." -ForegroundColor Green

  # ------------------------------------------------------------
  # PROTECTED ROUTE:
  # usar anchors exactos encontrados en el diagnostico.
  # ------------------------------------------------------------
  $p = Read-Text $Protected

  $oldTarget = "const operatorTarget=kiosk?'/admin/pedidos?kiosk=1':'/admin/pedidos';"
  $newTarget = "const operatorTarget=kiosk?'/admin/pos?kiosk=1':'/admin/pos';"

  if ($p.Contains($oldTarget)) {
    $p = $p.Replace($oldTarget, $newTarget)
  }
  elseif (-not $p.Contains($newTarget)) {
    throw "No encontre operatorTarget esperado en ProtectedRoute."
  }

  $oldCheck = "if(location.pathname!=='/admin/pedidos'){"
  $newCheck = "if(location.pathname!=='/admin/pos'){"

  if ($p.Contains($oldCheck)) {
    $p = $p.Replace($oldCheck, $newCheck)
  }
  elseif (-not $p.Contains($newCheck)) {
    throw "No encontre pathname de OPERADOR en ProtectedRoute."
  }

  $oldNavigate = "return <Navigate to={kiosk?'/admin/pedidos?kiosk=1':'/admin/pedidos'} replace/>;"
  $newNavigate = "return <Navigate to={kiosk?'/admin/pos?kiosk=1':'/admin/pos'} replace/>;"

  if ($p.Contains($oldNavigate)) {
    $p = $p.Replace($oldNavigate, $newNavigate)
  }
  elseif (-not $p.Contains($newNavigate)) {
    throw "No encontre Navigate final de OPERADOR en ProtectedRoute."
  }

  $p = $p.Replace("/admin/pedidos           -> POS Web", "/admin/pos               -> POS Web")
  $p = $p.Replace("/admin/pedidos?kiosk=1   -> terminal kiosk/PWA gestionada", "/admin/pos?kiosk=1       -> terminal kiosk/PWA gestionada")

  Write-Utf8NoBom $Protected $p
  Write-Host "[OK] ProtectedRoute: OPERADOR restringido a POS." -ForegroundColor Green

  # ------------------------------------------------------------
  # VALIDACION FINAL
  # ------------------------------------------------------------
  $t2 = Read-Text $Login
  $p2 = Read-Text $Protected

  Assert-True ($t2.Contains($newLoginTarget)) "Login no quedo apuntando a POS."
  Assert-True ($p2.Contains($newTarget)) "operatorTarget no quedo apuntando a POS."
  Assert-True ($p2.Contains($newCheck)) "pathname no quedo restringido a POS."
  Assert-True ($p2.Contains($newNavigate)) "Navigate final no quedo apuntando a POS."

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "npm run build fallo con codigo $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R56B ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try {
    & git diff --check -- `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/components/ProtectedRoute.jsx"

    if ($LASTEXITCODE -ne 0) {
      throw "git diff --check detecto errores en R56B."
    }

    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/components/ProtectedRoute.jsx"
  }
  finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R56B INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " OPERADOR normal -> /admin/pos" -ForegroundColor Green
  Write-Host " OPERADOR kiosk  -> /admin/pos?kiosk=1" -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow

  foreach ($p in $Touched) {
    Restore-One $p $BackupRoot $ProjectRoot
  }

  Write-Host "Rollback R56B completado." -ForegroundColor Yellow
  throw
}
