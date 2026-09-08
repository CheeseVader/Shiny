#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny",
  [string]$ReleaseRepo = "CheeseVader/Shiny-Release"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version 2.0

function Step([string]$m){ Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok([string]$m){ Write-Host "[OK] $m" -ForegroundColor Green }
function Fail([string]$m){ throw $m }
function WriteUtf8Lf([string]$Path,[string]$Text){
  $Text=$Text.Replace("`r`n","`n").Replace("`r","`n")
  [IO.File]::WriteAllText($Path,$Text,(New-Object Text.UTF8Encoding($false)))
}

Set-Location $ProjectRoot
$Agent=Join-Path $ProjectRoot "backend\scripts\shiny-backup-agent.sh"
$Pkg=Join-Path $ProjectRoot "backend\package.json"
$Publisher=Join-Path $ProjectRoot "PUBLICAR-SHINY-RELEASE-R5.2.ps1"

foreach($f in @($Agent,$Pkg,$Publisher)){
  if(!(Test-Path -LiteralPath $f -PathType Leaf)){ Fail "Falta $f" }
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " SHINY - FIX R5 EXACT: OK UNDEFINED / VERIFY RESTORE" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

Step "Validando repo"
$dirty=@(& git status --porcelain --untracked-files=no)
if($dirty.Count){
  $dirty|ForEach-Object{Write-Host $_ -ForegroundColor Yellow}
  Fail "Hay cambios TRACKED sin commit."
}
& gh auth status *> $null
if($LASTEXITCODE -ne 0){ Fail "gh no autenticado." }

Step "Detectando ultima release real"
$raw=& gh api "repos/$ReleaseRepo/releases?per_page=100"
if($LASTEXITCODE -ne 0){ Fail "No pude consultar releases." }
$rels=(($raw -join "`n")|ConvertFrom-Json)
$c=@()
foreach($r in @($rels)){
  if($r.draft -or $r.prerelease){ continue }
  if(([string]$r.tag_name) -match '^v(\d+\.\d+\.\d+)$'){
    $c += [pscustomobject]@{V=[version]$Matches[1];T=$Matches[1]}
  }
}
if(!$c.Count){ Fail "No encontre release base." }
$base=($c|Sort-Object V -Descending|Select-Object -First 1).T
$v=[version]$base
$new="{0}.{1}.{2}" -f $v.Major,$v.Minor,($v.Build+1)
Ok "Base=$base Nueva=$new"

Step "Corrigiendo agente R5 EXACT"
$a=[IO.File]::ReadAllText($Agent)

foreach($m in @(
  'SHINY_BACKUP_ENGINE_CANONICAL_R5_EXACT',
  'VERIFY_DUMP_BY_RESTORE',
  'DUMP_CONTENT_MISMATCH',
  'verifiedExact:true'
)){
  if(!$a.Contains($m)){ Fail "El agente no contiene marcador obligatorio: $m" }
}

$bad='  ok "Dump certificado: TODAS las tablas shiny conservan el mismo numero de filas."'
$good="  printf '[OK] Dump certificado: TODAS las tablas shiny conservan el mismo numero de filas.\n'"

if($a.Contains($bad)){
  $a=$a.Replace($bad,$good)
}elseif($a -match '(?m)^\s*ok\s+"Dump certificado: TODAS las tablas shiny conservan el mismo numero de filas\."\s*$'){
  $a=[regex]::Replace(
    $a,
    '(?m)^\s*ok\s+"Dump certificado: TODAS las tablas shiny conservan el mismo numero de filas\."\s*$',
    $good
  )
}else{
  Fail "No encontre la llamada defectuosa ok del bloque VERIFY_DUMP_BY_RESTORE."
}

$definesOk=[regex]::IsMatch($a,'(?m)^\s*ok\s*\(\)\s*\{')
$usesOk=[regex]::Matches($a,'(?m)^\s*ok\s+').Count
if(!$definesOk -and $usesOk -gt 0){
  Fail "El agente aun contiene $usesOk llamada(s) a ok sin definir ok()."
}

if($a -notmatch 'chown postgres:postgres "\$db_file"'){
  Fail "Falta fix de propietario postgres:postgres para db_file."
}
if($a -match 'chown root:root "\$db_file"'){
  Fail "Regresion detectada: db_file vuelve a root:root."
}

$force="# SHINY_BACKUP_R5_VERIFY_OK_FIX_$new"
$a=[regex]::Replace($a,'(?m)^# SHINY_BACKUP_R5_VERIFY_OK_FIX_[0-9]+\.[0-9]+\.[0-9]+\s*$\n?','')
$a=$a.Replace("# SHINY_BACKUP_ENGINE_CANONICAL_R5_EXACT",
              "# SHINY_BACKUP_ENGINE_CANONICAL_R5_EXACT`n$force")
WriteUtf8Lf $Agent $a

Step "Forzando postinstall en la nueva version"
$obj=Get-Content -LiteralPath $Pkg -Raw|ConvertFrom-Json
if($obj.PSObject.Properties['shinyBackupRuntimeVersion']){
  $obj.shinyBackupRuntimeVersion=$new
}else{
  $obj|Add-Member NoteProperty shinyBackupRuntimeVersion $new
}
if($obj.PSObject.Properties['shinyBackupEngine']){
  $obj.shinyBackupEngine='R5-EXACT'
}else{
  $obj|Add-Member NoteProperty shinyBackupEngine 'R5-EXACT'
}
WriteUtf8Lf $Pkg ($obj|ConvertTo-Json -Depth 100)

Step "Certificacion antes de commit"
if(Get-Command bash -ErrorAction SilentlyContinue){
  & bash -n $Agent
  if($LASTEXITCODE -ne 0){ Fail "bash -n fallo." }
  Ok "bash -n PASS."
}else{
  Write-Host "[AVISO] bash no disponible; se valida estructura estaticamente." -ForegroundColor Yellow
}

$a2=[IO.File]::ReadAllText($Agent)
if([regex]::IsMatch($a2,'(?m)^\s*ok\s+')){
  Fail "Todavia existe una llamada a ok no permitida."
}
foreach($m in @(
  'chown postgres:postgres "$db_file"',
  "printf '[OK] Dump certificado:",
  'VERIFY_DUMP_BY_RESTORE',
  'verifiedExact:true'
)){
  if(!$a2.Contains($m)){ Fail "Certificacion fallo: falta $m" }
}

$expected=@(
  'backend/package.json',
  'backend/scripts/shiny-backup-agent.sh'
)
$changed=@(& git diff --name-only)
foreach($f in $expected){
  if($f -notin $changed){ Fail "Delta incompleto: falta $f" }
}
$badChanges=@($changed|Where-Object{$_ -notin $expected})
if($badChanges.Count){
  $badChanges|ForEach-Object{Write-Host "NO ESPERADO: $_" -ForegroundColor Red}
  Fail "Cambios fuera del alcance."
}
& git diff --check
if($LASTEXITCODE -ne 0){ Fail "git diff --check fallo." }
Ok "Fuente certificado: permiso postgres + sin helper ok indefinido."

Step "Commit SOLO agent + package"
& git add -- @($expected)
if($LASTEXITCODE -ne 0){ Fail "git add fallo." }
$staged=@(& git diff --cached --name-only)
foreach($f in $expected){
  if($f -notin $staged){ Fail "Staging incompleto: falta $f" }
}

& git commit -m "fix: certify R5 dump without undefined ok helper"
if($LASTEXITCODE -ne 0){ Fail "git commit fallo." }
$head=(& git rev-parse --short HEAD).Trim()
Ok "Commit=$head"

Step "Push"
& git push origin HEAD
if($LASTEXITCODE -ne 0){ Fail "git push fallo." }

Step "Publicando v$new desde v$base"
& powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File $Publisher `
  -Version $new `
  -BaseVersion $base `
  -ReleaseRepo $ReleaseRepo
if($LASTEXITCODE -ne 0){ Fail "Publicacion fallo." }

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " R5 EXACT CORREGIDO Y PUBLICADO" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "Base   : $base"
Write-Host "Nueva  : $new"
Write-Host "Commit : $head"
Write-Host "Fixes:"
Write-Host "  + db_file permanece postgres:postgres durante pg_restore"
Write-Host "  + eliminada llamada a helper ok() inexistente"
Write-Host "  + guardia impide publicar otra llamada ok indefinida"
Write-Host "====================================================================" -ForegroundColor Green
