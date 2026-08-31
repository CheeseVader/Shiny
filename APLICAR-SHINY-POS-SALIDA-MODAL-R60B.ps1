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
Write-Host " SHINY POS SALIDA MODAL FORZADA R60B" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Orders=Join-Path $ProjectRoot "frontend\src\pages\OrdersPage.jsx"
$Frontend=Join-Path $ProjectRoot "frontend"

Assert-True (Test-Path -LiteralPath $Orders) "No existe OrdersPage.jsx"

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\POS-EXIT-MODAL-R60B-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
Backup-One $Orders $BackupRoot $ProjectRoot

Write-Host "Orders : $Orders"
Write-Host "Backup : $BackupRoot" -ForegroundColor DarkGray

try{
  $t=Read-Text $Orders

  $oldBackdrop='<div className="tcg_store_template-pos-exit-lock" role="dialog" aria-modal="true" aria-label="Salida protegida del punto de venta">'
  $newBackdrop=@'
<div
        className="tcg_store_template-pos-exit-lock"
        role="dialog"
        aria-modal="true"
        aria-label="Salida protegida del punto de venta"
        style={{
          position:'fixed',
          inset:0,
          zIndex:2147483000,
          display:'grid',
          placeItems:'center',
          padding:'24px',
          background:'rgba(4,10,22,.72)',
          backdropFilter:'blur(8px)',
          WebkitBackdropFilter:'blur(8px)'
        }}
      >
'@

  Assert-True ($t.Contains($oldBackdrop) -or $t.Contains("zIndex:2147483000")) "No encontre anchor del backdrop de salida protegida."
  if($t.Contains($oldBackdrop)){
    $t=$t.Replace($oldBackdrop,$newBackdrop.TrimEnd())
  }

  $oldForm='<form className="tcg_store_template-pos-exit-card" onSubmit={authorizeOperatorExit}>'
  if(-not $t.Contains($oldForm)){
    # fallback for minified/alternate function name around current source
    $m=[regex]::Match($t,'<form className="tcg_store_template-pos-exit-card" onSubmit=\{[^}]+\}>')
    Assert-True $m.Success "No encontre form de salida protegida."
    $oldForm=$m.Value
  }

  if(-not $t.Contains("width:'min(520px,calc(100vw - 32px))'")){
    $submitExpr=[regex]::Match($oldForm,'onSubmit=\{[^}]+\}').Value
    Assert-True ([string]::IsNullOrWhiteSpace($submitExpr) -eq $false) "No pude preservar onSubmit del form."

    $newForm=@"
<form
          className="tcg_store_template-pos-exit-card"
          $submitExpr
          style={{
            width:'min(520px,calc(100vw - 32px))',
            maxHeight:'calc(100vh - 48px)',
            overflow:'auto',
            display:'grid',
            gap:'16px',
            margin:0,
            padding:'28px',
            border:'1px solid #d9e1ec',
            borderRadius:'20px',
            background:'#fff',
            color:'#172033',
            boxShadow:'0 30px 90px rgba(2,8,23,.36)'
          }}
        >
"@
    $t=$t.Replace($oldForm,$newForm.TrimEnd())
  }

  Write-Utf8NoBom $Orders $t

  $verify=Read-Text $Orders
  Assert-True ($verify.Contains("zIndex:2147483000")) "No quedo estilo inline del backdrop."
  Assert-True ($verify.Contains("width:'min(520px,calc(100vw - 32px))'")) "No quedo estilo inline del modal."

  Write-Host "[OK] Modal forzado directamente desde JSX." -ForegroundColor Green

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R60B ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & git diff --check -- "frontend/src/pages/OrdersPage.jsx"
    if($LASTEXITCODE -ne 0){ throw "git diff --check detecto errores en R60B." }

    Write-Host ""
    git status --short

    Write-Host ""
    git diff --stat -- "frontend/src/pages/OrdersPage.jsx"
  }
  finally{ Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R60B INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Salida protegida ahora se fuerza como modal real." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  Restore-One $Orders $BackupRoot $ProjectRoot
  Write-Host "Rollback R60B completado." -ForegroundColor Yellow
  throw
}
