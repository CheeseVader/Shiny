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
  $enc=New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path,$Text,$enc)
}
function Get-DiffCheck([string]$Root,[string]$Rel){
  Push-Location $Root
  try{
    $raw=@(& cmd.exe /d /s /c "git diff --check -- `"$Rel`" 2>&1")
    return @(
      $raw |
      ForEach-Object { [string]$_ } |
      Where-Object {
        $_ -and
        ($_ -notmatch '^warning: in the working copy of .*LF will be replaced by CRLF') -and
        ($_ -notmatch '^warning: in the working copy of .*CRLF will be replaced by LF')
      }
    )
  } finally { Pop-Location }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY LOGIN R62H - FIX 500 LOGIN_FAILED" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
$Auth=Join-Path $ProjectRoot "backend\src\routes\auth.js"
$Rel="backend/src/routes/auth.js"

Assert-True (Test-Path -LiteralPath $Auth) "No existe: $Auth"

$baseline=@(Get-DiffCheck $ProjectRoot $Rel)

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\LOGIN-R62H-$stamp"
$BackupFile=Join-Path $BackupRoot "backend\src\routes\auth.js"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackupFile) | Out-Null
Copy-Item -LiteralPath $Auth -Destination $BackupFile -Force

try{
  $text=Read-Text $Auth

  $badCred="if(!email||!password)return res.status(400).json({success:false,error:'CREDENTIALS_REQUIRED'});"
  $goodCred="if(!username||!password)return res.status(400).json({success:false,error:'CREDENTIALS_REQUIRED'});"

  Assert-True ($text.Contains($badCred)) "No encontre el bug exacto !email en linea de credenciales."
  $text=$text.Replace($badCred,$goodCred)

  $badOrder="ORDER BY row_id      ORDER BY CASE"
  $goodOrder="ORDER BY CASE"
  Assert-True ($text.Contains($badOrder)) "No encontre el doble ORDER BY exacto."
  $text=$text.Replace($badOrder,$goodOrder)

  # Repair mojibake only in the known audit string if present.
  $text=$text.Replace("Inicio de sesiÃ³n local","Inicio de sesión local")

  # Whitespace cleanup, scoped to this file.
  $text=[regex]::Replace($text,'(?m)[ \t]+$','')
  $text=$text.TrimEnd("`r","`n")+"`r`n"

  Write-Utf8NoBom $Auth $text

  Write-Host "[OK] !email -> !username" -ForegroundColor Green
  Write-Host "[OK] Doble ORDER BY corregido" -ForegroundColor Green
  Write-Host "[OK] Texto de auditoria corregido" -ForegroundColor Green

  Write-Host ""
  Write-Host "=== NODE CHECK ===" -ForegroundColor Cyan
  node --check $Auth
  if($LASTEXITCODE -ne 0){ throw "node --check fallo." }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R62H ===" -ForegroundColor Cyan
  $after=@(Get-DiffCheck $ProjectRoot $Rel)
  $newErrors=@($after | Where-Object { $line=$_; -not ($baseline -contains $line) })

  if($newErrors.Count -gt 0){
    Write-Host "Errores nuevos:" -ForegroundColor Red
    $newErrors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "R62H introdujo errores nuevos de git diff --check."
  }

  Write-Host "[OK] Sin errores nuevos de git diff --check." -ForegroundColor Green

  Push-Location $ProjectRoot
  try{
    Write-Host ""
    git diff -- $Rel
    Write-Host ""
    git status --short -- $Rel
  } finally { Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R62H APLICADO" -ForegroundColor Green
  Write-Host " Reinicia el backend y prueba:" -ForegroundColor Yellow
  Write-Host "   usuario: masterivangt" -ForegroundColor Yellow
  Write-Host "   password: tu password actual" -ForegroundColor Yellow
  Write-Host " NO commit / NO push" -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  Copy-Item -LiteralPath $BackupFile -Destination $Auth -Force
  Write-Host "Rollback R62H completado." -ForegroundColor Yellow
  throw
}
