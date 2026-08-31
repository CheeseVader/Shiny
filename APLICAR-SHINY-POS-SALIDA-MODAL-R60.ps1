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
Write-Host " SHINY POS SALIDA PROTEGIDA MODAL R60" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Css=Join-Path $ProjectRoot "frontend\src\pages\OrdersPagePOSRecommendedR78.css"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Css) "No existe CSS POS: $Css"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-EXIT-MODAL-R60-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$rel=$Css.Substring($ProjectRoot.Length).TrimStart('\')
$bak=Join-Path $BackupRoot $rel
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bak) | Out-Null
Copy-Item -LiteralPath $Css -Destination $bak -Force

Write-Host "CSS    : $Css"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

try{
  $c=Read-Text $Css
  $marker='/* SHINY_POS_EXIT_MODAL_R60_START */'

  if(-not $c.Contains($marker)){
    $block=@'

/* SHINY_POS_EXIT_MODAL_R60_START */
.tcg_store_template-pos-exit-lock{
  position:fixed !important;
  inset:0 !important;
  z-index:2147483000 !important;
  display:grid !important;
  place-items:center !important;
  padding:24px !important;
  background:rgba(4,10,22,.72) !important;
  backdrop-filter:blur(8px) !important;
  -webkit-backdrop-filter:blur(8px) !important;
}

.tcg_store_template-pos-exit-card{
  width:min(520px,calc(100vw - 32px)) !important;
  max-height:calc(100vh - 48px) !important;
  overflow:auto !important;
  display:grid !important;
  gap:16px !important;
  margin:0 !important;
  padding:28px !important;
  border:1px solid #d9e1ec !important;
  border-radius:20px !important;
  background:#ffffff !important;
  color:#172033 !important;
  box-shadow:0 30px 90px rgba(2,8,23,.36) !important;
}

.tcg_store_template-pos-exit-shield{
  justify-self:start !important;
  display:inline-flex !important;
  align-items:center !important;
  min-height:36px !important;
  padding:0 12px !important;
  border-radius:999px !important;
  background:#eef4ff !important;
  color:#155eef !important;
  font-size:13px !important;
  font-weight:900 !important;
  letter-spacing:.02em !important;
}

.tcg_store_template-pos-exit-card h2{
  margin:0 !important;
  font-size:27px !important;
  line-height:1.1 !important;
  letter-spacing:-.03em !important;
  color:#101828 !important;
}

.tcg_store_template-pos-exit-card > p{
  margin:0 !important;
  color:#667085 !important;
  font-size:14px !important;
  line-height:1.55 !important;
}

.tcg_store_template-pos-exit-context{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:10px !important;
}

.tcg_store_template-pos-exit-context > span{
  display:grid !important;
  gap:4px !important;
  min-width:0 !important;
  padding:12px 14px !important;
  border:1px solid #e4e7ec !important;
  border-radius:12px !important;
  background:#f8fafc !important;
}

.tcg_store_template-pos-exit-context small{
  color:#667085 !important;
  font-size:11px !important;
  font-weight:700 !important;
  text-transform:uppercase !important;
  letter-spacing:.05em !important;
}

.tcg_store_template-pos-exit-context strong{
  color:#101828 !important;
  font-size:14px !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
  white-space:nowrap !important;
}

.tcg_store_template-pos-exit-card label{
  display:grid !important;
  gap:7px !important;
  color:#344054 !important;
  font-size:13px !important;
  font-weight:700 !important;
}

.tcg_store_template-pos-exit-card input{
  width:100% !important;
  min-height:46px !important;
  box-sizing:border-box !important;
  padding:0 13px !important;
  border:1px solid #d0d5dd !important;
  border-radius:11px !important;
  outline:none !important;
  background:#fff !important;
  color:#101828 !important;
  font-size:16px !important;
}

.tcg_store_template-pos-exit-card input:focus{
  border-color:#155eef !important;
  box-shadow:0 0 0 4px rgba(21,94,239,.10) !important;
}

.tcg_store_template-pos-exit-error{
  padding:10px 12px !important;
  border:1px solid #fecdca !important;
  border-radius:10px !important;
  background:#fff1f0 !important;
  color:#b42318 !important;
  font-size:13px !important;
  font-weight:700 !important;
}

.tcg_store_template-pos-exit-actions{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:10px !important;
}

.tcg_store_template-pos-exit-actions button{
  min-height:46px !important;
  border-radius:11px !important;
  padding:0 14px !important;
  font-size:14px !important;
  font-weight:850 !important;
  cursor:pointer !important;
}

.tcg_store_template-pos-exit-actions .secondary{
  border:1px solid #d0d5dd !important;
  background:#fff !important;
  color:#344054 !important;
}

.tcg_store_template-pos-exit-actions .danger{
  border:1px solid #d92d20 !important;
  background:#d92d20 !important;
  color:#fff !important;
}

.tcg_store_template-pos-exit-help{
  color:#667085 !important;
  font-size:11px !important;
  line-height:1.45 !important;
  text-align:center !important;
}

@media (max-width:560px){
  .tcg_store_template-pos-exit-lock{
    padding:14px !important;
  }
  .tcg_store_template-pos-exit-card{
    width:100% !important;
    padding:22px 18px !important;
    border-radius:16px !important;
  }
  .tcg_store_template-pos-exit-context,
  .tcg_store_template-pos-exit-actions{
    grid-template-columns:1fr !important;
  }
}
/* SHINY_POS_EXIT_MODAL_R60_END */
'@
    $c=$c.TrimEnd("`r","`n"," ","`t")+"`r`n`r`n"+$block.Trim()+"`r`n"
    Write-Utf8NoBom $Css $c
  }

  $verify=Read-Text $Css
  Assert-True ($verify.Contains($marker)) "No quedo aplicado R60."

  Write-Host "[OK] Salida protegida convertida a modal centrado." -ForegroundColor Green

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R60 ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
    if($LASTEXITCODE -ne 0){
      throw "git diff --check detecto errores en R60."
    }

    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R60 INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Salida protegida ahora es modal/popup." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  Copy-Item -LiteralPath $bak -Destination $Css -Force
  Write-Host "Rollback R60 completado." -ForegroundColor Yellow
  throw
}
