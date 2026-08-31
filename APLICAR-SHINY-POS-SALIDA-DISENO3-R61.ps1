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
Write-Host " SHINY POS - SALIDA PROTEGIDA DISENO 3 R61" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Orders=Join-Path $ProjectRoot "frontend\src\pages\OrdersPage.jsx"
$Css=Join-Path $ProjectRoot "frontend\src\pages\OrdersPagePOSRecommendedR78.css"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Orders) "No existe OrdersPage.jsx"
Assert-True (Test-Path -LiteralPath $Css) "No existe OrdersPagePOSRecommendedR78.css"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-EXIT-DISENO3-R61-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched=@($Orders,$Css)
foreach($p in $Touched){ Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Orders : $Orders"
Write-Host "CSS    : $Css"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

try{
  # ----------------------------------------------------------
  # 1) Simplificar textos del modal en OrdersPage.jsx
  # ----------------------------------------------------------
  $jsx=Read-Text $Orders
  $replaceCount=0

  $pairs=@(
    @('Salida protegida','¿Salir del punto de venta?'),
    @('El punto de venta está bloqueado. Usa Volver a pantalla completa para continuar, o autoriza la salida con la contraseña del operador.','Ingresa tu contraseña para cerrar la sesión.'),
    @('Volver a pantalla completa','Continuar en POS'),
    @('Autorizar salida','Salir de sesión'),
    @('La salida autorizada cerrará esta sesión del operador.','')
  )

  foreach($pair in $pairs){
    $old=[string]$pair[0]
    $new=[string]$pair[1]
    if($jsx.Contains($old)){
      $jsx=$jsx.Replace($old,$new)
      $replaceCount++
    }
  }

  if([regex]::IsMatch($jsx,'El punto de venta está bloqueado\.[\s\S]{0,120}?contraseña del operador\.')){
    $jsx=[regex]::Replace(
      $jsx,
      'El punto de venta está bloqueado\.[\s\S]{0,120}?contraseña del operador\.',
      'Ingresa tu contraseña para cerrar la sesión.',
      1
    )
  }

  Assert-True ($replaceCount -ge 3) "No pude localizar con seguridad los textos del modal en OrdersPage.jsx."

  $jsx=[regex]::Replace($jsx,'<p>\s*</p>','',1)

  Write-Utf8NoBom $Orders $jsx
  Write-Host "[OK] Textos del modal simplificados." -ForegroundColor Green

  # ----------------------------------------------------------
  # 2) Aplicar CSS Premium Oscuro Diseno 3 1:1
  # ----------------------------------------------------------
  $css=Read-Text $Css

  $pattern='(?s)/\* SHINY_POS_EXIT_DESIGN3_R61_START \*/.*?/\* SHINY_POS_EXIT_DESIGN3_R61_END \*/\r?\n?'

  $block=@'
/* SHINY_POS_EXIT_DESIGN3_R61_START */
.tcg_store_template-pos-exit-lock{
  position:fixed !important;
  inset:0 !important;
  z-index:2147483000 !important;
  display:grid !important;
  place-items:center !important;
  padding:24px !important;
  background:rgba(4,8,20,.72) !important;
  backdrop-filter:blur(8px) !important;
  -webkit-backdrop-filter:blur(8px) !important;
}

.tcg_store_template-pos-exit-card{
  position:relative !important;
  width:min(560px,calc(100vw - 32px)) !important;
  max-height:calc(100vh - 48px) !important;
  overflow:auto !important;
  display:grid !important;
  gap:18px !important;
  margin:0 !important;
  padding:26px 26px 24px !important;
  border:1px solid rgba(139,92,246,.18) !important;
  border-radius:24px !important;
  background:#020617 !important;
  color:#ffffff !important;
  box-shadow:0 32px 90px rgba(2,8,23,.52) !important;
}

.tcg_store_template-pos-exit-card::before{
  content:'SHINY POS' !important;
  display:block !important;
  margin-bottom:2px !important;
  color:#c4b5fd !important;
  font-size:11px !important;
  font-weight:900 !important;
  letter-spacing:.18em !important;
  text-transform:uppercase !important;
}

.tcg_store_template-pos-exit-card::after{
  content:'🔐' !important;
  position:absolute !important;
  top:22px !important;
  right:22px !important;
  width:48px !important;
  height:48px !important;
  display:grid !important;
  place-items:center !important;
  border-radius:16px !important;
  background:rgba(124,58,237,.18) !important;
  border:1px solid rgba(196,181,253,.18) !important;
  font-size:22px !important;
  line-height:1 !important;
}

.tcg_store_template-pos-exit-card h2{
  margin:0 !important;
  padding-right:64px !important;
  color:#ffffff !important;
  font-size:32px !important;
  line-height:1.06 !important;
  letter-spacing:-.03em !important;
  font-weight:900 !important;
}

.tcg_store_template-pos-exit-card > p{
  margin:0 !important;
  color:#94a3b8 !important;
  font-size:15px !important;
  line-height:1.6 !important;
  max-width:420px !important;
}

.tcg_store_template-pos-exit-shield,
.tcg_store_template-pos-exit-context,
.tcg_store_template-pos-exit-help{
  display:none !important;
}

.tcg_store_template-pos-exit-card label{
  display:grid !important;
  gap:8px !important;
  margin-top:2px !important;
  color:#cbd5e1 !important;
  font-size:14px !important;
  font-weight:800 !important;
}

.tcg_store_template-pos-exit-card input{
  width:100% !important;
  min-height:52px !important;
  box-sizing:border-box !important;
  padding:0 16px !important;
  border:1px solid rgba(148,163,184,.32) !important;
  border-radius:14px !important;
  outline:none !important;
  background:#0f172a !important;
  color:#ffffff !important;
  font-size:17px !important;
  font-weight:700 !important;
  box-shadow:none !important;
}

.tcg_store_template-pos-exit-card input::placeholder{
  color:#64748b !important;
}

.tcg_store_template-pos-exit-card input:focus{
  border-color:#8b5cf6 !important;
  box-shadow:0 0 0 4px rgba(124,58,237,.16) !important;
}

.tcg_store_template-pos-exit-error{
  padding:12px 14px !important;
  border:1px solid rgba(248,113,113,.28) !important;
  border-radius:12px !important;
  background:rgba(127,29,29,.30) !important;
  color:#fecaca !important;
  font-size:13px !important;
  font-weight:800 !important;
}

.tcg_store_template-pos-exit-actions{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:12px !important;
  margin-top:2px !important;
}

.tcg_store_template-pos-exit-actions button{
  min-height:50px !important;
  padding:0 16px !important;
  border-radius:14px !important;
  font-size:15px !important;
  font-weight:900 !important;
  letter-spacing:-.01em !important;
  cursor:pointer !important;
  transition:transform .15s ease, box-shadow .15s ease, opacity .15s ease !important;
}

.tcg_store_template-pos-exit-actions button:hover{
  transform:translateY(-1px) !important;
}

.tcg_store_template-pos-exit-actions .secondary{
  border:1px solid rgba(71,85,105,.95) !important;
  background:#0f172a !important;
  color:#e2e8f0 !important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03) !important;
}

.tcg_store_template-pos-exit-actions .danger{
  border:1px solid #7c3aed !important;
  background:#7c3aed !important;
  color:#ffffff !important;
  box-shadow:0 12px 30px rgba(124,58,237,.28) !important;
}

.tcg_store_template-pos-exit-actions .danger:hover{
  background:#8b5cf6 !important;
  border-color:#8b5cf6 !important;
}

@media (max-width:560px){
  .tcg_store_template-pos-exit-lock{
    padding:14px !important;
  }
  .tcg_store_template-pos-exit-card{
    width:100% !important;
    padding:22px 18px 18px !important;
    border-radius:20px !important;
  }
  .tcg_store_template-pos-exit-card::after{
    top:18px !important;
    right:18px !important;
    width:42px !important;
    height:42px !important;
    border-radius:14px !important;
    font-size:19px !important;
  }
  .tcg_store_template-pos-exit-card h2{
    font-size:27px !important;
    padding-right:52px !important;
  }
  .tcg_store_template-pos-exit-actions{
    grid-template-columns:1fr !important;
  }
}
/* SHINY_POS_EXIT_DESIGN3_R61_END */
'@

  if([regex]::IsMatch($css,$pattern)){
    $css=[regex]::Replace($css,$pattern,($block.Trim()+"`r`n"),1)
  } else {
    $css=$css.TrimEnd("`r","`n"," ","`t")+"`r`n`r`n"+$block.Trim()+"`r`n"
  }

  Write-Utf8NoBom $Css $css
  Write-Host "[OK] CSS Diseno 3 aplicado." -ForegroundColor Green

  # ----------------------------------------------------------
  # 3) Build + checks
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
  Write-Host "=== GIT DIFF CHECK R61 ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- `
      "frontend/src/pages/OrdersPage.jsx" `
      "frontend/src/pages/OrdersPagePOSRecommendedR78.css"
    if($LASTEXITCODE -ne 0){
      throw "git diff --check detecto errores en R61."
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
  Write-Host " R61 INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Popup salida protegida simplificado + Diseno 3 premium." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  foreach($p in $Touched){ Restore-One $p $BackupRoot $ProjectRoot }
  Write-Host "Rollback R61 completado." -ForegroundColor Yellow
  throw
}
