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
Write-Host " SHINY OPERADOR -> POS R56" -ForegroundColor Cyan
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
$BackupRoot = Join-Path $ProjectRoot "_gmx_backups\OPERADOR-POS-R56-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched = @($Login,$Protected)
foreach ($p in $Touched) { Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Backup          : $BackupRoot" -ForegroundColor DarkGray

try {
  # ------------------------------------------------------------
  # 1) LOGIN: OPERADOR entra directo a /admin/pos
  # ------------------------------------------------------------
  $t = Read-Text $Login

  Assert-True ($t.Contains("if (role === 'OPERADOR')")) "No encontre bloque OPERADOR en LoginPage."

  $oldLoginTarget = "nav(kiosk ? '/admin/pedidos?kiosk=1' : '/admin/pedidos', { replace: true, state: null });"
  $newLoginTarget = "nav(kiosk ? '/admin/pos?kiosk=1' : '/admin/pos', { replace: true, state: null });"

  if ($t.Contains($oldLoginTarget)) {
    $t = $t.Replace($oldLoginTarget, $newLoginTarget)
  }
  elseif (-not $t.Contains($newLoginTarget)) {
    throw "No encontre target de OPERADOR esperado en LoginPage."
  }

  # Comentarios, si existen.
  $t = $t.Replace("OPERADOR -> /admin/pedidos", "OPERADOR -> /admin/pos")
  $t = $t.Replace("/login?kiosk=1 -> /admin/pedidos?kiosk=1", "/login?kiosk=1 -> /admin/pos?kiosk=1")

  Write-Utf8NoBom $Login $t
  Write-Host "[OK] Login: OPERADOR -> POS." -ForegroundColor Green

  # ------------------------------------------------------------
  # 2) PROTECTED ROUTE: impedir que OPERADOR vuelva a Pedidos.
  # ------------------------------------------------------------
  $p = Read-Text $Protected

  Assert-True ($p.Contains("String(currentUser?.rol||'').toUpperCase()==='OPERADOR'")) "No encontre control de rol OPERADOR en ProtectedRoute."

  $oldTarget = "const operatorTarget=kiosk?'/admin/pedidos?kiosk=1':'/admin/pedidos';"
  $newTarget = "const operatorTarget=kiosk?'/admin/pos?kiosk=1':'/admin/pos';"

  if ($p.Contains($oldTarget)) {
    $p = $p.Replace($oldTarget, $newTarget)
  }
  elseif (-not $p.Contains($newTarget)) {
    throw "No encontre operatorTarget esperado."
  }

  $oldPathCheck = "if(location.pathname!=='/admin/pedidos'){"
  $newPathCheck = "if(location.pathname!=='/admin/pos'){"

  if ($p.Contains($oldPathCheck)) {
    $p = $p.Replace($oldPathCheck, $newPathCheck)
  }
  elseif (-not $p.Contains($newPathCheck)) {
    throw "No encontre validacion de pathname OPERADOR."
  }

  $oldFallback = "return <Navigate to={kiosk?'/admin/pedidos?kiosk=1':'/admin/pedidos'} replace/>;"
  $newFallback = "return <Navigate to={kiosk?'/admin/pos?kiosk=1':'/admin/pos'} replace/>;"

  if ($p.Contains($oldFallback)) {
    $p = $p.Replace($oldFallback, $newFallback)
  }
  elseif (-not $p.Contains($newFallback)) {
    throw "No encontre fallback Navigate de OPERADOR."
  }

  $p = $p.Replace("/admin/pedidos           -> POS Web", "/admin/pos               -> POS Web")
  $p = $p.Replace("/admin/pedidos?kiosk=1   -> terminal kiosk/PWA gestionada", "/admin/pos?kiosk=1       -> terminal kiosk/PWA gestionada")

  Write-Utf8NoBom $Protected $p
  Write-Host "[OK] ProtectedRoute: OPERADOR queda restringido a POS." -ForegroundColor Green

  # ------------------------------------------------------------
  # 3) VALIDACION DE ANCHORS FINALES
  # ------------------------------------------------------------
  $t2 = Read-Text $Login
  $p2 = Read-Text $Protected

  Assert-True ($t2.Contains("nav(kiosk ? '/admin/pos?kiosk=1' : '/admin/pos', { replace: true, state: null });")) "Login no quedo apuntando a POS."
  Assert-True ($p2.Contains("const operatorTarget=kiosk?'/admin/pos?kiosk=1':'/admin/pos';")) "ProtectedRoute no quedo apuntando a POS."
  Assert-True ($p2.Contains("if(location.pathname!=='/admin/pos'){")) "ProtectedRoute no restringe a /admin/pos."

  # ------------------------------------------------------------
  # 4) BUILD
  # ------------------------------------------------------------
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

  # ------------------------------------------------------------
  # 5) GIT CHECK SOLO SOBRE ARCHIVOS R56
  # ------------------------------------------------------------
  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R56 ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try {
    & git diff --check -- `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/components/ProtectedRoute.jsx"

    if ($LASTEXITCODE -ne 0) {
      throw "git diff --check detecto errores en R56."
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
  Write-Host " R56 INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " OPERADOR abre /admin/pos" -ForegroundColor Green
  Write-Host " KIOSK abre /admin/pos?kiosk=1" -ForegroundColor Green
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

  Write-Host "Rollback R56 completado." -ForegroundColor Yellow
  throw
}
