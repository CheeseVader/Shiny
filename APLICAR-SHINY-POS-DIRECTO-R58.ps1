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

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY POS DIRECTO SIN GATE R58" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Css=Join-Path $ProjectRoot "frontend\src\pages\OrdersPagePOSRecommendedR78.css"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Css) "No existe CSS POS: $Css"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-DIRECTO-R58-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$rel=$Css.Substring($ProjectRoot.Length).TrimStart('\')
$bak=Join-Path $BackupRoot $rel
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bak) | Out-Null
Copy-Item -LiteralPath $Css -Destination $bak -Force

Write-Host "CSS    : $Css"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

try{
  $c=Read-Text $Css
  $marker='/* SHINY_POS_DIRECT_ENTRY_R58_START */'

  if(-not $c.Contains($marker)){
    $block=@'

/* SHINY_POS_DIRECT_ENTRY_R58_START */
/*
  El navegador normal no puede entrar a Fullscreen automaticamente sin
  una accion del usuario. Para que OPERADOR entre directo al POS, se
  elimina visualmente el gate obligatorio y el terminal queda utilizable
  inmediatamente. El modo kiosk/PWA puede seguir manejando fullscreen
  desde el launcher del dispositivo.
*/
.tcg_store_template-pos-fullscreen-gate{
  display:none !important;
}
/* SHINY_POS_DIRECT_ENTRY_R58_END */
'@
    $c=$c.TrimEnd()+"`r`n`r`n"+$block.Trim()+"`r`n"
    Write-Utf8NoBom $Css $c
  }

  $verify=Read-Text $Css
  Assert-True ($verify.Contains($marker)) "No quedo aplicado R58."
  Assert-True ($verify.Contains(".tcg_store_template-pos-fullscreen-gate")) "No quedo selector del gate."

  Write-Host "[OK] Gate de inicio POS desactivado visualmente." -ForegroundColor Green

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R58 ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
    if($LASTEXITCODE -ne 0){
      throw "git diff --check detecto errores en R58."
    }

    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R58 INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " OPERADOR entra directo al POS sin pantalla Iniciar POS." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  Copy-Item -LiteralPath $bak -Destination $Css -Force
  Write-Host "Rollback R58 completado." -ForegroundColor Yellow
  throw
}
