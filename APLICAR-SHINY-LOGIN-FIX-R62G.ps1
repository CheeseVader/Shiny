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
function Backup-One([string]$Source,[string]$BackupRoot,[string]$Root){
  $rel=$Source.Substring($Root.Length).TrimStart('\')
  $dest=Join-Path $BackupRoot $rel
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $dest -Force
}
function Restore-One([string]$Source,[string]$BackupRoot,[string]$Root){
  $rel=$Source.Substring($Root.Length).TrimStart('\')
  $bak=Join-Path $BackupRoot $rel
  if(Test-Path -LiteralPath $bak){ Copy-Item -LiteralPath $bak -Destination $Source -Force }
}
function Get-DiffCheck([string]$Root){
  Push-Location $Root
  try{
    $raw=@(& cmd.exe /d /s /c 'git diff --check -- "backend/src/routes/auth.js" "frontend/src/pages/LoginPage.jsx" 2>&1')
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
Write-Host " SHINY LOGIN R62G - FIX ADMIN + UTF8" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
$Auth=Join-Path $ProjectRoot "backend\src\routes\auth.js"
$Login=Join-Path $ProjectRoot "frontend\src\pages\LoginPage.jsx"
$Frontend=Join-Path $ProjectRoot "frontend"

foreach($p in @($Auth,$Login)){
  Assert-True (Test-Path -LiteralPath $p) "Falta archivo: $p"
}

$baseline=@(Get-DiffCheck $ProjectRoot)

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\LOGIN-R62G-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
foreach($p in @($Auth,$Login)){ Backup-One $p $BackupRoot $ProjectRoot }

try{
  # ----------------------------------------------------------
  # LOGIN PAGE: make the password label ASCII-safe in source.
  # Browser renders the HTML entity as "Contraseña".
  # ----------------------------------------------------------
  $loginText=Read-Text $Login

  $labelPattern='(?s)<label>[^<]*<input type="password" autoComplete="current-password"'
  $lm=@([regex]::Matches($loginText,$labelPattern))
  Assert-True ($lm.Count -eq 1) "Se esperaba 1 label de password y se encontraron $($lm.Count)."

  $loginText=[regex]::Replace(
    $loginText,
    $labelPattern,
    '<label>Contrase&ntilde;a<input type="password" autoComplete="current-password"',
    1
  )
  $loginText=[regex]::Replace($loginText,'(?m)[ \t]+$','')
  $loginText=$loginText.TrimEnd("`r","`n")+"`r`n"
  Write-Utf8NoBom $Login $loginText

  Write-Host "[OK] Etiqueta de contraseña corregida sin mojibake." -ForegroundColor Green

  # ----------------------------------------------------------
  # AUTH:
  # 1. normal username = prefix before @
  # 2. "admin" is an alias for an active SUPERADMIN
  # 3. full email remains accepted internally for compatibility
  # ----------------------------------------------------------
  $authText=Read-Text $Auth

  Assert-True ($authText.Contains("const username=String(req.body?.username||'').trim().toLowerCase();")) `
    "No encontre el login por username instalado por R62E."

  $routePattern="router\.post\('/login',rateLimit\(\{keyPrefix:'ADMIN_LOGIN',max:10\}\),async\(req,res\)=>\{.*?`r?`n\}\);"
  $rm=[regex]::Match($authText,$routePattern,[Text.RegularExpressions.RegexOptions]::Singleline)
  Assert-True $rm.Success "No pude aislar /login."

  $route=$rm.Value

  # R62G: single-quoted PowerShell string so $1 is treated literally by the regex.
  $wherePattern='WHERE\s+LOWER\(SPLIT_PART\(email,''@'',1\)\)=LOWER\(\$1\)'
  Assert-True ([regex]::IsMatch($route,$wherePattern)) "No encontre WHERE username derivado esperado."

  $whereNew=@"
WHERE (
        LOWER(SPLIT_PART(email,'@',1))=LOWER(`$1)
        OR LOWER(email)=LOWER(`$1)
        OR (LOWER(`$1)='admin' AND UPPER(rol)='SUPERADMIN')
      )
"@.TrimEnd()

  $route=[regex]::Replace($route,$wherePattern,$whereNew,1)

  # Prefer exact username/email before the generic admin alias.
  if($route -match '\s+LIMIT 1'){
    $route=[regex]::Replace(
      $route,
      '\s+LIMIT 1',
      @"
      ORDER BY CASE
        WHEN LOWER(SPLIT_PART(email,'@',1))=LOWER(`$1) THEN 0
        WHEN LOWER(email)=LOWER(`$1) THEN 1
        WHEN LOWER(`$1)='admin' AND UPPER(rol)='SUPERADMIN' THEN 2
        ELSE 9
      END, row_id
      LIMIT 1
"@,
      1
    )
  } else {
    throw "No encontre LIMIT 1 en login."
  }

  $authText=$authText.Substring(0,$rm.Index)+$route+$authText.Substring($rm.Index+$rm.Length)
  $authText=[regex]::Replace($authText,'(?m)[ \t]+$','')
  $authText=$authText.TrimEnd("`r","`n")+"`r`n"
  Write-Utf8NoBom $Auth $authText

  Write-Host "[OK] Login acepta usuario corto y alias admin para SUPERADMIN." -ForegroundColor Green

  Write-Host ""
  Write-Host "=== NODE CHECK ===" -ForegroundColor Cyan
  node --check $Auth
  if($LASTEXITCODE -ne 0){ throw "node --check auth.js fallo." }

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo." }
  } finally { Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK R62G ===" -ForegroundColor Cyan
  $after=@(Get-DiffCheck $ProjectRoot)
  $newErrors=@($after | Where-Object { $line=$_; -not ($baseline -contains $line) })

  if($newErrors.Count -gt 0){
    Write-Host "Errores nuevos:" -ForegroundColor Red
    $newErrors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "R62G introdujo errores nuevos de git diff --check."
  }

  Write-Host "[OK] Sin errores nuevos de git diff --check." -ForegroundColor Green

  Push-Location $ProjectRoot
  try{
    Write-Host ""
    git status --short
    Write-Host ""
    git diff --stat -- "backend/src/routes/auth.js" "frontend/src/pages/LoginPage.jsx"
  } finally { Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R62G INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Prueba ahora: admin + tu contraseña actual" -ForegroundColor Green
  Write-Host " NO commit / NO push" -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow
  foreach($p in @($Auth,$Login)){ Restore-One $p $BackupRoot $ProjectRoot }
  Write-Host "Rollback R62G completado." -ForegroundColor Yellow
  throw
}
