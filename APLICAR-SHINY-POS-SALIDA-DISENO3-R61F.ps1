param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny"
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
function Get-DiffCheck([string]$Root){
  Push-Location $Root
  try{
    $raw=@(& cmd.exe /d /s /c 'git diff --check -- "frontend/src/pages/OrdersPage.jsx" "frontend/src/pages/OrdersPagePOSRecommendedR78.css" 2>&1')
    $lines=@(
      $raw |
      ForEach-Object { [string]$_ } |
      Where-Object {
        $_ -and
        ($_ -notmatch '^warning: in the working copy of .*LF will be replaced by CRLF') -and
        ($_ -notmatch '^warning: in the working copy of .*CRLF will be replaced by LF')
      }
    )
    return @($lines)
  }
  finally{
    Pop-Location
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY POS - FIX UTF8 DISENO 3 R61F" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Orders=Join-Path $ProjectRoot "frontend\src\pages\OrdersPage.jsx"
$CssPath=Join-Path $ProjectRoot "frontend\src\pages\OrdersPagePOSRecommendedR78.css"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Orders) "No existe OrdersPage.jsx"
Assert-True (Test-Path -LiteralPath $CssPath) "No existe OrdersPagePOSRecommendedR78.css"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-EXIT-R61F-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched=@($Orders,$CssPath)
foreach($p in $Touched){ Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Orders : $Orders"
Write-Host "CSS    : $CssPath"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

$baseline=@(Get-DiffCheck $ProjectRoot)
if($baseline.Count -gt 0){
  Write-Host ""
  Write-Host "Observaciones existentes ANTES de R61F:" -ForegroundColor Yellow
  $baseline | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
}

try{
  # Spanish strings built from Unicode code points.
  $qOpen=[char]0x00BF
  $oAcc=[char]0x00F3
  $nTilde=[char]0x00F1

  $title="$qOpen" + "Salir del punto de venta?"
  $msg="Ingresa tu contrase" + "$nTilde" + "a para cerrar la sesi" + "$oAcc" + "n."
  $passwordLabel="Contrase" + "$nTilde" + "a"
  $exitText="Salir de sesi" + "$oAcc" + "n"

  # ----------------------------------------------------------
  # 1) Modify ONLY the protected-exit form.
  # ----------------------------------------------------------
  $jsx=Read-Text $Orders
  $formPattern='(?s)<form(?=[^>]*className="tcg_store_template-pos-exit-card")[^>]*>.*?</form>'
  $m=[regex]::Match($jsx,$formPattern)
  Assert-True $m.Success "No encontre el modal de salida protegida."

  $modal=$m.Value

  $modal=[regex]::Replace($modal,'(?s)<h2>.*?</h2>','<h2>'+$title+'</h2>',1)
  $modal=[regex]::Replace($modal,'(?s)<p[^>]*>.*?</p>','<p>'+$msg+'</p>',1)

  $modal=[regex]::Replace(
    $modal,
    '(?s)<div className="tcg_store_template-pos-exit-context">.*?</div>',
    '',
    1
  )
  $modal=[regex]::Replace(
    $modal,
    '(?s)<small className="tcg_store_template-pos-exit-help">.*?</small>',
    '',
    1
  )

  $pwPattern='(?s)(<label[^>]*>).*?(<input[^>]*type="password"[^>]*>)'
  Assert-True ([regex]::IsMatch($modal,$pwPattern)) "No encontre input password del modal."
  $modal=[regex]::Replace($modal,$pwPattern,'$1'+$passwordLabel+'$2',1)

  $modal=[regex]::Replace(
    $modal,
    '(?s)(<button[^>]*className="secondary"[^>]*>).*?(</button>)',
    '$1Continuar en POS$2',
    1
  )
  $modal=[regex]::Replace(
    $modal,
    '(?s)(<button[^>]*className="danger"[^>]*>).*?(</button>)',
    '$1'+$exitText+'$2',
    1
  )

  # Critical R61F fix:
  # remove trailing spaces/tabs ONLY inside the modal block that this patch edits.
  $modal=[regex]::Replace($modal,'(?m)[ \t]+$','')

  $jsx=$jsx.Substring(0,$m.Index)+$modal+$jsx.Substring($m.Index+$m.Length)
  Write-Utf8NoBom $Orders $jsx
  Write-Host "[OK] Textos UTF-8 corregidos y modal sin trailing whitespace." -ForegroundColor Green

  # ----------------------------------------------------------
  # 2) Lock icon: CSS Unicode escape, no literal emoji bytes.
  # ----------------------------------------------------------
  $cssText=Read-Text $CssPath
  $afterPattern='(?s)(\.tcg_store_template-pos-exit-card::after\s*\{.*?)(content:\s*''[^'']*''\s*!important;)(.*?\})'
  Assert-True ([regex]::IsMatch($cssText,$afterPattern)) "No encontre bloque ::after del icono lock."

  $cssText=[regex]::Replace(
    $cssText,
    $afterPattern,
    '$1content:''\1F510'' !important;$3',
    1
  )

  $cssText=$cssText.TrimEnd("`r","`n")+"`r`n"
  Write-Utf8NoBom $CssPath $cssText
  Write-Host "[OK] Candado corregido." -ForegroundColor Green

  # ----------------------------------------------------------
  # 3) Verify exact intended content.
  # ----------------------------------------------------------
  $jsx2=Read-Text $Orders
  Assert-True ($jsx2.Contains($title)) "No quedo el titulo correcto."
  Assert-True ($jsx2.Contains($msg)) "No quedo el mensaje correcto."
  Assert-True ($jsx2.Contains($passwordLabel)) "No quedo la etiqueta Contrasena."
  Assert-True ($jsx2.Contains($exitText)) "No quedo el boton Salir de sesion."

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{
    Pop-Location
  }

  # ----------------------------------------------------------
  # 4) Reject only NEW diff-check problems.
  # ----------------------------------------------------------
  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R61F ===" -ForegroundColor Cyan
  $after=@(Get-DiffCheck $ProjectRoot)

  $newErrors=@(
    $after | Where-Object {
      $line=$_
      -not ($baseline -contains $line)
    }
  )

  if($newErrors.Count -gt 0){
    Write-Host "Nuevos errores introducidos por R61F:" -ForegroundColor Red
    $newErrors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "R61F introdujo errores nuevos de git diff --check."
  }

  if($after.Count -gt 0){
    Write-Host "[OK] Sin errores nuevos; quedan solo observaciones preexistentes." -ForegroundColor Yellow
  } else {
    Write-Host "[OK] git diff --check limpio." -ForegroundColor Green
  }

  Push-Location $ProjectRoot
  try{
    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- `
      "frontend/src/pages/OrdersPage.jsx" `
      "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
  }
  finally{
    Pop-Location
  }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R61F INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Diseno 3 preservado; UTF8 y candado corregidos." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  foreach($p in $Touched){ Restore-One $p $BackupRoot $ProjectRoot }
  Write-Host "Rollback R61F completado." -ForegroundColor Yellow
  throw
}
