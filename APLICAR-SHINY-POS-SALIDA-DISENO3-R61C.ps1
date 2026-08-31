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

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY POS - FIX UTF8 DISENO 3 R61C" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Orders=Join-Path $ProjectRoot "frontend\src\pages\OrdersPage.jsx"
$CssPath=Join-Path $ProjectRoot "frontend\src\pages\OrdersPagePOSRecommendedR78.css"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Orders) "No existe OrdersPage.jsx"
Assert-True (Test-Path -LiteralPath $CssPath) "No existe OrdersPagePOSRecommendedR78.css"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-EXIT-R61C-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched=@($Orders,$CssPath)
foreach($p in $Touched){ Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Orders : $Orders"
Write-Host "CSS    : $CssPath"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

try{
  # Build correct Spanish strings from Unicode code points.
  $qOpen = [char]0x00BF
  $aAcc  = [char]0x00E1
  $oAcc  = [char]0x00F3
  $nTilde= [char]0x00F1

  $title = "$qOpen" + "Salir del punto de venta?"
  $msg = "Ingresa tu contrase" + "$nTilde" + "a para cerrar la sesi" + "$oAcc" + "n."
  $passwordLabel = "Contrase" + "$nTilde" + "a"
  $exitText = "Salir de sesi" + "$oAcc" + "n"

  # ----------------------------------------------------------
  # 1) Fix only the protected-exit form block.
  # ----------------------------------------------------------
  $jsx=Read-Text $Orders

  $formPattern='(?s)<form(?=[^>]*className="tcg_store_template-pos-exit-card")[^>]*>.*?</form>'
  $m=[regex]::Match($jsx,$formPattern)
  Assert-True $m.Success "No encontre el modal de salida protegida."

  $modal=$m.Value

  # Replace heading, description, label and button text regardless of mojibake.
  $modal=[regex]::Replace(
    $modal,
    '(?s)<h2>.*?</h2>',
    '<h2>' + $title + '</h2>',
    1
  )

  $modal=[regex]::Replace(
    $modal,
    '(?s)<p[^>]*>.*?</p>',
    '<p>' + $msg + '</p>',
    1
  )

  # Hide any context/help remnants textually if they still exist.
  $modal=[regex]::Replace(
    $modal,
    '(?s)<small className="tcg_store_template-pos-exit-help">.*?</small>',
    '',
    1
  )

  # Password label: preserve input JSX after the text.
  $modal=[regex]::Replace(
    $modal,
    '(?s)(<label[^>]*>).*?(<input[^>]*className="tcg_store_template-pos-exit-password-input"[^>]*>)',
    '$1' + $passwordLabel + '$2',
    1
  )

  # Fallback if current input has no class.
  if($modal -notmatch [regex]::Escape($passwordLabel)){
    $modal=[regex]::Replace(
      $modal,
      '(?s)(<label[^>]*>).*?(<input[^>]*type="password"[^>]*>)',
      '$1' + $passwordLabel + '$2',
      1
    )
  }

  # Buttons by class, preserving all handlers/attrs.
  $modal=[regex]::Replace(
    $modal,
    '(?s)(<button[^>]*className="secondary"[^>]*>).*?(</button>)',
    '$1Continuar en POS$2',
    1
  )
  $modal=[regex]::Replace(
    $modal,
    '(?s)(<button[^>]*className="danger"[^>]*>).*?(</button>)',
    '$1' + $exitText + '$2',
    1
  )

  $jsx=$jsx.Substring(0,$m.Index)+$modal+$jsx.Substring($m.Index+$m.Length)

  Write-Utf8NoBom $Orders $jsx
  Write-Host "[OK] Textos UTF-8 del popup corregidos." -ForegroundColor Green

  # ----------------------------------------------------------
  # 2) Fix CSS lock icon using ASCII-only Unicode escape.
  # ----------------------------------------------------------
  $cssText=Read-Text $CssPath

  # Replace literal/mojibake lock content with CSS unicode escape.
  $cssText=[regex]::Replace(
    $cssText,
    "(?m)^\s*content:'[^']*'\s*!important;\s*$",
    {
      param($match)
      if($match.Value -match 'content:' -and $match.Index -gt 0){
        $before=$cssText.Substring([Math]::Max(0,$match.Index-250), [Math]::Min(250,$match.Index))
        if($before -match 'tcg_store_template-pos-exit-card::after'){
          return "  content:'\1F510' !important;"
        }
      }
      return $match.Value
    }
  )

  # More deterministic fallback for the exact ::after block.
  $afterPattern='(?s)(\.tcg_store_template-pos-exit-card::after\s*\{.*?)(content:\s*''[^'']*''\s*!important;)(.*?\})'
  if([regex]::IsMatch($cssText,$afterPattern)){
    $cssText=[regex]::Replace(
      $cssText,
      $afterPattern,
      '$1content:''\1F510'' !important;$3',
      1
    )
  }

  Write-Utf8NoBom $CssPath $cssText
  Write-Host "[OK] Icono lock corregido con escape CSS Unicode." -ForegroundColor Green

  # ----------------------------------------------------------
  # 3) Validate exact intended content.
  # ----------------------------------------------------------
  $jsx2=Read-Text $Orders
  Assert-True ($jsx2.Contains($title)) "No quedo titulo correcto."
  Assert-True ($jsx2.Contains($msg)) "No quedo mensaje correcto."
  Assert-True ($jsx2.Contains($passwordLabel)) "No quedo etiqueta Contrasena correcta."
  Assert-True ($jsx2.Contains($exitText)) "No quedo texto Salir de sesion correcto."

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R61C ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- `
      "frontend/src/pages/OrdersPage.jsx" `
      "frontend/src/pages/OrdersPagePOSRecommendedR78.css"

    if($LASTEXITCODE -ne 0){
      throw "git diff --check detecto errores en R61C."
    }

    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- `
      "frontend/src/pages/OrdersPage.jsx" `
      "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R61C INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Mojibake corregido en popup Diseno 3." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  foreach($p in $Touched){ Restore-One $p $BackupRoot $ProjectRoot }
  Write-Host "Rollback R61C completado." -ForegroundColor Yellow
  throw
}
