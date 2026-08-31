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
Write-Host " SHINY POS BRANDING DINAMICO R57" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Orders=Join-Path $ProjectRoot "frontend\src\pages\OrdersPage.jsx"
$Css=Join-Path $ProjectRoot "frontend\src\pages\OrdersPagePOSRecommendedR78.css"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Orders) "No existe OrdersPage.jsx"
Assert-True (Test-Path -LiteralPath $Css) "No existe OrdersPagePOSRecommendedR78.css"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-BRANDING-R57-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched=@($Orders,$Css)
foreach($p in $Touched){ Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Orders : $Orders"
Write-Host "CSS    : $Css"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

try{
  # ----------------------------------------------------------
  # OrdersPage: usar branding administrativo real.
  # ----------------------------------------------------------
  $t=Read-Text $Orders

  Assert-True ($t.Contains("const posBrandName = 'Shiny';")) "No encontre anchor const posBrandName = 'Shiny';"

  if(-not $t.Contains("import useAdminBrand from '../hooks/useAdminBrand.js';")){
    $lines=$t -split "`r?`n"
    $lastImport=-1
    for($i=0;$i -lt $lines.Length;$i++){
      if($lines[$i] -match '^import '){ $lastImport=$i }
      elseif($lastImport -ge 0){ break }
    }
    Assert-True ($lastImport -ge 0) "No pude localizar imports de OrdersPage."

    $before=@()
    $after=@()
    if($lastImport -ge 0){ $before=@($lines[0..$lastImport]) }
    if($lastImport+1 -lt $lines.Length){ $after=@($lines[($lastImport+1)..($lines.Length-1)]) }

    $newLines=@()
    $newLines += $before
    $newLines += "import useAdminBrand from '../hooks/useAdminBrand.js';"
    $newLines += $after
    $t=[string]::Join("`r`n",$newLines)
  }

  $replacement=@'
const posBrand = useAdminBrand();
  const posBrandName = String(posBrand?.name || 'Shiny').trim() || 'Shiny';
'@

  $t=$t.Replace("const posBrandName = 'Shiny';",$replacement.TrimEnd())

  Write-Utf8NoBom $Orders $t
  Write-Host "[OK] OrdersPage usa useAdminBrand()." -ForegroundColor Green

  # ----------------------------------------------------------
  # CSS: evitar recorte visual de la primera letra.
  # ----------------------------------------------------------
  $c=Read-Text $Css
  $marker='/* SHINY_POS_BRANDING_R57_START */'

  if(-not $c.Contains($marker)){
    $block=@'

/* SHINY_POS_BRANDING_R57_START */
.tcg_store_template-pos-brand,
.shiny-pos-brand,
.shiny-pos-brand-protected{
  display:inline-flex !important;
  align-items:center !important;
  min-width:max-content !important;
  overflow:visible !important;
  text-indent:0 !important;
  padding-left:2px !important;
  white-space:nowrap !important;
}
.tcg_store_template-pos-brand::first-letter,
.shiny-pos-brand::first-letter,
.shiny-pos-brand-protected::first-letter{
  color:inherit !important;
  opacity:1 !important;
  visibility:visible !important;
}
/* SHINY_POS_BRANDING_R57_END */
'@
    $c=$c.TrimEnd()+"`r`n`r`n"+$block.Trim()+"`r`n"
    Write-Utf8NoBom $Css $c
  }

  Write-Host "[OK] CSS evita recorte de branding en POS." -ForegroundColor Green

  # ----------------------------------------------------------
  # Validacion de contenido
  # ----------------------------------------------------------
  $t2=Read-Text $Orders
  Assert-True ($t2.Contains("import useAdminBrand from '../hooks/useAdminBrand.js';")) "No quedo import useAdminBrand."
  Assert-True ($t2.Contains("const posBrand = useAdminBrand();")) "No quedo hook de branding."
  Assert-True ($t2.Contains("const posBrandName = String(posBrand?.name || 'Shiny').trim() || 'Shiny';")) "No quedo posBrandName dinamico."
  Assert-True (-not $t2.Contains("const posBrandName = 'Shiny';")) "Sigue existiendo posBrandName hardcodeado."

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R57 ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- `
      "frontend/src/pages/OrdersPage.jsx" `
      "frontend/src/pages/OrdersPagePOSRecommendedR78.css"

    if($LASTEXITCODE -ne 0){
      throw "git diff --check detecto errores en R57."
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
  Write-Host " R57 INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " POS toma nombre desde branding administrativo." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow

  foreach($p in $Touched){ Restore-One $p $BackupRoot $ProjectRoot }

  Write-Host "Rollback R57 completado." -ForegroundColor Yellow
  throw
}
