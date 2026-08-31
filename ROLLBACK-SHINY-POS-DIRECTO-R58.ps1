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
Write-Host " ROLLBACK SHINY POS DIRECTO R58" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Css=Join-Path $ProjectRoot "frontend\src\pages\OrdersPagePOSRecommendedR78.css"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Css) "No existe CSS POS: $Css"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\ROLLBACK-POS-DIRECTO-R58-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$rel=$Css.Substring($ProjectRoot.Length).TrimStart('\')
$bak=Join-Path $BackupRoot $rel
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bak) | Out-Null
Copy-Item -LiteralPath $Css -Destination $bak -Force

Write-Host "CSS    : $Css"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

try{
  $c=Read-Text $Css

  $start='/* SHINY_POS_DIRECT_ENTRY_R58_START */'
  $end='/* SHINY_POS_DIRECT_ENTRY_R58_END */'

  Assert-True ($c.Contains($start)) "No encontre el bloque R58. Puede que ya haya sido retirado."
  Assert-True ($c.Contains($end)) "El bloque R58 esta incompleto."

  $pattern='(?s)\r?\n?/\* SHINY_POS_DIRECT_ENTRY_R58_START \*/.*?/\* SHINY_POS_DIRECT_ENTRY_R58_END \*/\r?\n?'
  $new=[regex]::Replace($c,$pattern,"`r`n",1)

  Assert-True (-not $new.Contains($start)) "No se pudo retirar el inicio de R58."
  Assert-True (-not $new.Contains($end)) "No se pudo retirar el final de R58."

  Write-Utf8NoBom $Css $new

  Write-Host "[OK] R58 retirado. Se restaura el gate de Fullscreen." -ForegroundColor Green
  Write-Host "[OK] Se restaura el flujo original del boton Iniciar POS." -ForegroundColor Green
  Write-Host "[OK] Ctrl + Alt + X vuelve a depender del flujo protegido original." -ForegroundColor Green

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
    if($LASTEXITCODE -ne 0){
      throw "git diff --check detecto errores."
    }

    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " ROLLBACK R58 COMPLETADO" -ForegroundColor Green
  Write-Host " Fullscreen gate restaurado." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando archivo previo al rollback..." -ForegroundColor Yellow
  Copy-Item -LiteralPath $bak -Destination $Css -Force
  Write-Host "Rollback del rollback completado." -ForegroundColor Yellow
  throw
}
