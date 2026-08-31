param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny",
  [string]$PosUrl = "http://127.0.0.1:5173/login?kiosk=1"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-True([bool]$Condition,[string]$Message){
  if(-not $Condition){ throw $Message }
}
function Read-Text([string]$Path){
  [System.IO.File]::ReadAllText($Path)
}
function Write-Utf8NoBom([string]$Path,[string]$Text){
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path,$Text,$enc)
}
function Backup-One([string]$Source,[string]$BackupRoot,[string]$Root){
  $rel=$Source.Substring($Root.Length).TrimStart('\')
  $dest=Join-Path $BackupRoot $rel
  $dir=Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item -LiteralPath $Source -Destination $dest -Force
}
function Restore-One([string]$Source,[string]$BackupRoot,[string]$Root){
  $rel=$Source.Substring($Root.Length).TrimStart('\')
  $bak=Join-Path $BackupRoot $rel
  if(Test-Path -LiteralPath $bak){
    Copy-Item -LiteralPath $bak -Destination $Source -Force
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY POS KIOSK REAL R59" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Login=Join-Path $ProjectRoot "frontend\src\pages\LoginPage.jsx"
$Protected=Join-Path $ProjectRoot "frontend\src\components\ProtectedRoute.jsx"
$Orders=Join-Path $ProjectRoot "frontend\src\pages\OrdersPage.jsx"
$Frontend=Join-Path $ProjectRoot "frontend"
$Launcher=Join-Path $ProjectRoot "INICIAR-SHINY-POS-KIOSK.cmd"

foreach($p in @($Login,$Protected,$Orders)){
  Assert-True (Test-Path -LiteralPath $p) "Falta archivo requerido: $p"
}

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-KIOSK-R59-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched=@($Login,$Protected)
foreach($p in $Touched){ Backup-One $p $BackupRoot $ProjectRoot }

if(Test-Path -LiteralPath $Launcher){
  Backup-One $Launcher $BackupRoot $ProjectRoot
}

Write-Host "Proyecto   : $ProjectRoot"
Write-Host "Launcher   : $Launcher"
Write-Host "URL kiosk  : $PosUrl"
Write-Host "Backup     : $BackupRoot" -ForegroundColor DarkGray

try{
  # ----------------------------------------------------------
  # 1) Asegurar login OPERADOR -> POS, conservando kiosk=1.
  # ----------------------------------------------------------
  $loginText=Read-Text $Login

  $oldLogin="nav(kiosk ? '/admin/pedidos?kiosk=1' : '/admin/pedidos', { replace: true, state: null });"
  $newLogin="nav(kiosk ? '/admin/pos?kiosk=1' : '/admin/pos', { replace: true, state: null });"

  if($loginText.Contains($oldLogin)){
    $loginText=$loginText.Replace($oldLogin,$newLogin)
  }
  elseif(-not $loginText.Contains($newLogin)){
    throw "No encontre target OPERADOR compatible en LoginPage."
  }

  Write-Utf8NoBom $Login $loginText
  Write-Host "[OK] Login OPERADOR conserva kiosk=1 y abre POS." -ForegroundColor Green

  # ----------------------------------------------------------
  # 2) Asegurar ProtectedRoute -> POS.
  # ----------------------------------------------------------
  $protectedText=Read-Text $Protected

  $oldTarget="const operatorTarget=kiosk?'/admin/pedidos?kiosk=1':'/admin/pedidos';"
  $newTarget="const operatorTarget=kiosk?'/admin/pos?kiosk=1':'/admin/pos';"
  if($protectedText.Contains($oldTarget)){
    $protectedText=$protectedText.Replace($oldTarget,$newTarget)
  }
  elseif(-not $protectedText.Contains($newTarget)){
    throw "No encontre operatorTarget compatible en ProtectedRoute."
  }

  $oldCheck="if(location.pathname!=='/admin/pedidos'){"
  $newCheck="if(location.pathname!=='/admin/pos'){"
  if($protectedText.Contains($oldCheck)){
    $protectedText=$protectedText.Replace($oldCheck,$newCheck)
  }
  elseif(-not $protectedText.Contains($newCheck)){
    throw "No encontre pathname OPERADOR compatible en ProtectedRoute."
  }

  $oldNavigate="return <Navigate to={kiosk?'/admin/pedidos?kiosk=1':'/admin/pedidos'} replace/>;"
  $newNavigate="return <Navigate to={kiosk?'/admin/pos?kiosk=1':'/admin/pos'} replace/>;"
  if($protectedText.Contains($oldNavigate)){
    $protectedText=$protectedText.Replace($oldNavigate,$newNavigate)
  }
  elseif(-not $protectedText.Contains($newNavigate)){
    throw "No encontre Navigate OPERADOR compatible en ProtectedRoute."
  }

  Write-Utf8NoBom $Protected $protectedText
  Write-Host "[OK] ProtectedRoute restringe OPERADOR a POS." -ForegroundColor Green

  # ----------------------------------------------------------
  # 3) Validar que OrdersPage ya soporta kiosk=1 y salida.
  # ----------------------------------------------------------
  $ordersText=Read-Text $Orders
  Assert-True ($ordersText.Contains("new URLSearchParams(window.location.search).get('kiosk')") -or
               $ordersText.Contains('new URLSearchParams(window.location.search).get(`kiosk`)')) `
               "OrdersPage no contiene deteccion kiosk=1."

  Assert-True ($ordersText.Contains("Ctrl + Alt + X") -or $ordersText.Contains("Ctrl + Alt + X")) `
               "OrdersPage no contiene la salida protegida Ctrl + Alt + X."

  Write-Host "[OK] OrdersPage ya soporta kiosk=1 y Ctrl + Alt + X." -ForegroundColor Green

  # ----------------------------------------------------------
  # 4) Crear launcher KIOSK dedicado.
  #    Usa perfil independiente para no tocar Chrome normal.
  # ----------------------------------------------------------
  $cmd = @"
@echo off
setlocal

set "SHINY_URL=$PosUrl"
set "SHINY_PROFILE=%LOCALAPPDATA%\ShinyPOSKiosk"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto RUN_CHROME

set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto RUN_CHROME

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto RUN_EDGE

set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto RUN_EDGE

echo.
echo ERROR: No se encontro Google Chrome ni Microsoft Edge.
echo Instala uno de los navegadores o ajusta la ruta en este archivo.
pause
exit /b 1

:RUN_CHROME
start "" "%CHROME%" ^
  --kiosk "%SHINY_URL%" ^
  --user-data-dir="%SHINY_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-session-crashed-bubble ^
  --disable-infobars ^
  --disable-features=TranslateUI
exit /b 0

:RUN_EDGE
start "" "%EDGE%" ^
  --kiosk "%SHINY_URL%" ^
  --edge-kiosk-type=fullscreen ^
  --user-data-dir="%SHINY_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-session-crashed-bubble
exit /b 0
"@

  [System.IO.File]::WriteAllText($Launcher,$cmd,(New-Object System.Text.ASCIIEncoding))
  Assert-True (Test-Path -LiteralPath $Launcher) "No se pudo crear launcher."
  Write-Host "[OK] Launcher KIOSK creado." -ForegroundColor Green

  # ----------------------------------------------------------
  # 5) Build y validacion.
  # ----------------------------------------------------------
  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R59 ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/components/ProtectedRoute.jsx"

    if($LASTEXITCODE -ne 0){
      throw "git diff --check detecto errores en R59."
    }

    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/components/ProtectedRoute.jsx"
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R59 INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Usa INICIAR-SHINY-POS-KIOSK.cmd para abrir el POS." -ForegroundColor Green
  Write-Host " El navegador inicia directamente en modo KIOSK." -ForegroundColor Green
  Write-Host " Ctrl + Alt + X permanece como salida protegida de Shiny." -ForegroundColor Green
  Write-Host ""
  Write-Host " IMPORTANTE:" -ForegroundColor Yellow
  Write-Host " ALT+TAB es una funcion de Windows y no puede bloquearse" -ForegroundColor Yellow
  Write-Host " de forma confiable desde React/Chrome. Para bloqueo total" -ForegroundColor Yellow
  Write-Host " se requiere Windows Assigned Access con usuario POS dedicado." -ForegroundColor Yellow
  Write-Host ""
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow

  foreach($p in $Touched){ Restore-One $p $BackupRoot $ProjectRoot }

  if(Test-Path -LiteralPath (Join-Path $BackupRoot "INICIAR-SHINY-POS-KIOSK.cmd")){
    Copy-Item -LiteralPath (Join-Path $BackupRoot "INICIAR-SHINY-POS-KIOSK.cmd") -Destination $Launcher -Force
  }
  elseif(Test-Path -LiteralPath $Launcher){
    Remove-Item -LiteralPath $Launcher -Force
  }

  Write-Host "Rollback R59 completado." -ForegroundColor Yellow
  throw
}
