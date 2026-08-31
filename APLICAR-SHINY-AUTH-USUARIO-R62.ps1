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
function Replace-Once([string]$Text,[string]$Old,[string]$New,[string]$Label){
  $idx=$Text.IndexOf($Old,[System.StringComparison]::Ordinal)
  if($idx -lt 0){ throw "Anchor no encontrado: $Label" }
  if($Text.IndexOf($Old,$idx+$Old.Length,[System.StringComparison]::Ordinal) -ge 0){
    throw "Anchor ambiguo: $Label"
  }
  return $Text.Substring(0,$idx)+$New+$Text.Substring($idx+$Old.Length)
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY AUTH USUARIO + CONTRASENA R62" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Backend=Join-Path $ProjectRoot "backend"
$Frontend=Join-Path $ProjectRoot "frontend"
$Auth=Join-Path $Backend "src\routes\auth.js"
$Admin=Join-Path $Backend "src\routes\admin.js"
$Login=Join-Path $Frontend "src\pages\LoginPage.jsx"
$AdminPage=Join-Path $Frontend "src\pages\AdminPage.jsx"
$Migration=Join-Path $Backend "sql\20260831_AUTH_USERNAME_R62.sql"
$tempMigration=Join-Path $Backend "_r62_apply_username.mjs"

foreach($p in @($Auth,$Admin,$Login,$AdminPage)){
  Assert-True (Test-Path -LiteralPath $p) "Falta archivo requerido: $p"
}

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\AUTH-USERNAME-R62-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched=@($Auth,$Admin,$Login,$AdminPage)
foreach($p in $Touched){ Backup-One $p $BackupRoot $ProjectRoot }
if(Test-Path -LiteralPath $Migration){ Backup-One $Migration $BackupRoot $ProjectRoot }

Write-Host "Proyecto : $ProjectRoot"
Write-Host "Backup   : $BackupRoot" -ForegroundColor DarkGray

try{
  $authText=Read-Text $Auth
  $adminText=Read-Text $Admin
  $loginText=Read-Text $Login
  $adminPageText=Read-Text $AdminPage

  Assert-True ($authText.Contains("router.post('/login'")) "No existe login backend esperado."
  Assert-True ($authText.Contains("req.body?.email")) "Auth ya no coincide con login por email."
  Assert-True ($adminText.Contains("ensureAdminEmailAvailable(email)")) "Admin create no coincide con diagnostico."
  Assert-True ($adminText.Contains("ensureAdminEmailAvailable(newEmail,rowId)")) "Admin update no coincide con diagnostico."
  Assert-True ($loginText.Contains('body: JSON.stringify({ email, password })')) "LoginPage no coincide con diagnostico."
  Assert-True ($adminPageText.Contains('form.email')) "AdminPage no contiene form.email esperado."

  $sql=@'
BEGIN;

ALTER TABLE shiny.administradores
  ADD COLUMN IF NOT EXISTS username TEXT;

DO $$
DECLARE
  r RECORD;
  base_name TEXT;
  candidate TEXT;
  suffix_num INTEGER;
BEGIN
  FOR r IN
    SELECT row_id,id_admin,email,username
    FROM shiny.administradores
    WHERE username IS NULL OR BTRIM(username)=''
    ORDER BY row_id
  LOOP
    base_name := LOWER(COALESCE(NULLIF(SPLIT_PART(COALESCE(r.email,''),'@',1),''),NULLIF(r.id_admin,''),'usuario'));
    base_name := REGEXP_REPLACE(base_name,'[^a-z0-9._-]+','','g');

    IF LENGTH(base_name) < 3 THEN
      base_name := 'user' || r.row_id::TEXT;
    END IF;

    base_name := LEFT(base_name,26);
    candidate := base_name;
    suffix_num := 1;

    WHILE EXISTS(
      SELECT 1 FROM shiny.administradores a
      WHERE a.row_id<>r.row_id
        AND LOWER(COALESCE(a.username,''))=LOWER(candidate)
    ) LOOP
      suffix_num := suffix_num + 1;
      candidate := LEFT(base_name,26) || suffix_num::TEXT;
    END LOOP;

    UPDATE shiny.administradores
    SET username=candidate
    WHERE row_id=r.row_id;
  END LOOP;
END $$;

ALTER TABLE shiny.administradores
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_shiny_administradores_username_ci
  ON shiny.administradores(LOWER(username));

COMMIT;
'@
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Migration) | Out-Null
  Write-Utf8NoBom $Migration ($sql.Trim()+"`r`n")
  Write-Host "[OK] Migracion SQL preparada." -ForegroundColor Green

  $migJs=@'
import 'dotenv/config';
import fs from 'node:fs';
import { pool } from './src/db.js';

const sql=fs.readFileSync('./sql/20260831_AUTH_USERNAME_R62.sql','utf8');
const client=await pool.connect();
try{
  await client.query(sql);
  const r=await client.query(`
    SELECT row_id,id_admin,nombre,username,rol,activo
    FROM shiny.administradores
    ORDER BY row_id
  `);
  console.log('R62_DB_MIGRATION=OK');
  console.table(r.rows);
}catch(e){
  console.error('R62_DB_MIGRATION=ERROR',e?.message||e);
  process.exitCode=1;
}finally{
  client.release();
  await pool.end();
}
'@
  Write-Utf8NoBom $tempMigration ($migJs.Trim()+"`n")

  Push-Location $Backend
  try{
    node $tempMigration
    if($LASTEXITCODE -ne 0){ throw "Fallo migracion DB R62." }
  } finally { Pop-Location }

  Remove-Item -LiteralPath $tempMigration -Force -ErrorAction SilentlyContinue
  Write-Host "[OK] DB username listo." -ForegroundColor Green

  # AUTH LOGIN
  $authText=Read-Text $Auth
  $loginPattern="router\.post\('/login',rateLimit\(\{keyPrefix:'ADMIN_LOGIN',max:10\}\),async\(req,res\)=>\{.*?`r?`n\}\);"
  $m=[regex]::Match($authText,$loginPattern,[System.Text.RegularExpressions.RegexOptions]::Singleline)
  Assert-True $m.Success "No pude aislar router.post('/login')."
  $block=$m.Value

  $block=[regex]::Replace(
    $block,
    "const email=String\(req\.body\?\.email\|\|''\)\.trim\(\)\.toLowerCase\(\);",
    "const username=String(req.body?.username||'').trim().toLowerCase();",
    1
  )
  Assert-True ($block.Contains('const username=')) "No se cambio variable login."

  $before=$block
  $block=[regex]::Replace($block,'LOWER\(email\)\s*=\s*LOWER\((\$\d+)\)','LOWER(username)=LOWER($1)',1)
  if($block -eq $before){
    $block=[regex]::Replace($block,'LOWER\(email\)\s*=\s*(\$\d+)','LOWER(username)=LOWER($1)',1)
  }
  $block=[regex]::Replace($block,'\[email\]','[username]',1)
  $block=$block.Replace('nombre,email,rol','nombre,email,username,rol')
  if($block.Contains('email:admin.email') -and -not $block.Contains('username:admin.username')){
    $block=$block.Replace('email:admin.email','email:admin.email,username:admin.username')
  }

  Assert-True ($block.Contains('LOWER(username)')) "No se cambio lookup auth a username."
  Assert-True ($block.Contains('[username]')) "No se cambio parametro auth a username."

  $authText=$authText.Substring(0,$m.Index)+$block+$authText.Substring($m.Index+$m.Length)
  Write-Utf8NoBom $Auth $authText
  Write-Host "[OK] Login backend por username." -ForegroundColor Green

  # ADMIN ROUTES
  $adminText=Read-Text $Admin
  $adminText=$adminText.Replace(
    'SELECT row_id,id_admin,nombre,email,rol,activo,fecha_creacion,fecha_actualizacion,',
    'SELECT row_id,id_admin,nombre,email,username,rol,activo,fecha_creacion,fecha_actualizacion,'
  )

  $postStart=$adminText.IndexOf("router.post('/users'")
  $putStart=$adminText.IndexOf("router.put('/users/:rowId'")
  Assert-True ($postStart -ge 0 -and $putStart -gt $postStart) "No pude aislar CREATE /users."

  $pre=$adminText.Substring(0,$postStart)
  $postBlock=$adminText.Substring($postStart,$putStart-$postStart)
  $rest=$adminText.Substring($putStart)

  $emailDecl=[regex]::Match($postBlock,"const email=.*?;")
  Assert-True $emailDecl.Success "No encontre const email en CREATE."

  $createIdentity=@'
const username=String(b.username||'').trim().toLowerCase();
    if(!/^[a-z0-9._-]{3,32}$/.test(username))throw new Error('INVALID_USERNAME');
    const usernameExists=await query(`SELECT 1 FROM shiny.administradores WHERE LOWER(username)=LOWER($1) LIMIT 1`,[username]);
    if(usernameExists.rowCount)throw new Error('USERNAME_ALREADY_EXISTS');
    const email=`${username}@shiny.local`;
'@
  $postBlock=$postBlock.Substring(0,$emailDecl.Index)+$createIdentity.Trim()+$postBlock.Substring($emailDecl.Index+$emailDecl.Length)

  $auditAnchor="    await audit(req,'ADMIN','CREATE_USER'"
  $auditIdx=$postBlock.IndexOf($auditAnchor)
  Assert-True ($auditIdx -ge 0) "No encontre audit CREATE_USER."
  $persistCreate=@'
    await query(`UPDATE shiny.administradores SET username=$2,fecha_actualizacion=NOW() WHERE id_admin=$1`,[id,username]);
    r.rows[0].username=username;

'@
  $postBlock=$postBlock.Substring(0,$auditIdx)+$persistCreate+$postBlock.Substring($auditIdx)
  $postBlock=$postBlock.Replace('`${email} rol=${requestedRole}`','`${username} rol=${requestedRole}`')
  $adminText=$pre+$postBlock+$rest

  $putStart=$adminText.IndexOf("router.put('/users/:rowId'")
  $nextRoute=$adminText.IndexOf("router.post('/users/:rowId/send-password-reset'",$putStart)
  Assert-True ($putStart -ge 0 -and $nextRoute -gt $putStart) "No pude aislar UPDATE /users."

  $pre=$adminText.Substring(0,$putStart)
  $putBlock=$adminText.Substring($putStart,$nextRoute-$putStart)
  $rest=$adminText.Substring($nextRoute)

  $newEmailDecl=[regex]::Match($putBlock,"const newEmail=.*?;")
  Assert-True $newEmailDecl.Success "No encontre const newEmail en UPDATE."

  $updateIdentity=@'
const newUsername=String(b.username??existing.username??'').trim().toLowerCase();
    if(!/^[a-z0-9._-]{3,32}$/.test(newUsername))throw new Error('INVALID_USERNAME');
    const usernameExists=await query(`SELECT 1 FROM shiny.administradores WHERE LOWER(username)=LOWER($1) AND row_id<>$2 LIMIT 1`,[newUsername,rowId]);
    if(usernameExists.rowCount)throw new Error('USERNAME_ALREADY_EXISTS');
    const newEmail=existing.email;
'@
  $putBlock=$putBlock.Substring(0,$newEmailDecl.Index)+$updateIdentity.Trim()+$putBlock.Substring($newEmailDecl.Index+$newEmailDecl.Length)

  $responseAnchor='    res.json({success:true,data:r.rows[0]});'
  $respIdx=$putBlock.IndexOf($responseAnchor)
  Assert-True ($respIdx -ge 0) "No encontre response UPDATE."
  $persistUpdate=@'
    await query(`UPDATE shiny.administradores SET username=$2,fecha_actualizacion=NOW() WHERE row_id=$1`,[rowId,newUsername]);
    r.rows[0].username=newUsername;

'@
  $putBlock=$putBlock.Substring(0,$respIdx)+$persistUpdate+$putBlock.Substring($respIdx)
  $putBlock=$putBlock.Replace('${existing.email} -> ${r.rows[0].email};','${existing.username} -> ${newUsername};')

  $adminText=$pre+$putBlock+$rest
  $adminText=$adminText.Replace('id_admin,nombre,email,rol,activo','id_admin,nombre,email,username,rol,activo')

  Write-Utf8NoBom $Admin $adminText
  Write-Host "[OK] Alta/edicion backend por username." -ForegroundColor Green

  # LOGIN PAGE
  $loginText=Read-Text $Login
  $statePattern='const\s*\[\s*email\s*,\s*setEmail\s*\]\s*=\s*useState\((.*?)\);'
  $sm=[regex]::Match($loginText,$statePattern,[System.Text.RegularExpressions.RegexOptions]::Singleline)
  Assert-True $sm.Success "No encontre state email/setEmail."
  $loginText=$loginText.Substring(0,$sm.Index)+"const [username, setUsername] = useState($($sm.Groups[1].Value));"+$loginText.Substring($sm.Index+$sm.Length)

  $loginText=$loginText.Replace('body: JSON.stringify({ email, password })','body: JSON.stringify({ username, password })')

  $oldInput='<label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>'
  $newInput='<label>Usuario<input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} required /></label>'
  $loginText=Replace-Once $loginText $oldInput $newInput 'Login Email input'
  $loginText=$loginText.Replace('<label>Password<input type="password"','<label>Contraseña<input type="password"')
  $loginText=[regex]::Replace($loginText,'<Link[^>]*to="/admin/recuperar-acceso"[^>]*>.*?</Link>','',[System.Text.RegularExpressions.RegexOptions]::Singleline)

  Write-Utf8NoBom $Login $loginText
  Write-Host "[OK] Login visual Usuario + Contraseña." -ForegroundColor Green

  # ADMIN PAGE
  $adminPageText=Read-Text $AdminPage
  $adminPageText=$adminPageText.Replace('[u.nombre, u.email, u.rol]','[u.nombre, u.username, u.rol]')
  $adminPageText=$adminPageText.Replace("u?.nombre || u?.email || '?'","u?.nombre || u?.username || '?'")
  $adminPageText=$adminPageText.Replace('placeholder="Buscar por nombre o correo..."','placeholder="Buscar por nombre o usuario..."')
  $adminPageText=$adminPageText.Replace('<small>{u.email}</small>','<small>@{u.username}</small>')
  $adminPageText=$adminPageText.Replace('<p>{selected.email}</p>','<p>@{selected.username}</p>')

  $oldSelected='<label>Correo electrónico<input value={selected.email||''''} onChange={(e)=>setSelected(x=>({...x,email:e.target.value}))}/></label>'
  $newSelected='<label>Usuario<input value={selected.username||''''} onChange={(e)=>setSelected(x=>({...x,username:e.target.value.toLowerCase()}))} autoCapitalize="none" spellCheck={false}/></label>'
  $adminPageText=Replace-Once $adminPageText $oldSelected $newSelected 'Admin selected email'

  $oldCreate='<label>Email<input type="email" value={form.email} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))} /></label>'
  $newCreate='<label>Usuario<input type="text" value={form.username||''''} onChange={(e) => setForm((x) => ({ ...x, username: e.target.value.toLowerCase() }))} autoCapitalize="none" spellCheck={false} /></label>'
  $adminPageText=Replace-Once $adminPageText $oldCreate $newCreate 'Admin create email'
  $adminPageText=$adminPageText.Replace('<label>Password<input type="password"','<label>Contraseña<input type="password"')

  Assert-True (-not $adminPageText.Contains('form.email')) "AdminPage aun contiene form.email."
  Assert-True ($adminPageText.Contains('form.username')) "AdminPage no quedo con form.username."
  Write-Utf8NoBom $AdminPage $adminPageText
  Write-Host "[OK] Gestion de usuarios sin email visible." -ForegroundColor Green

  Write-Host ""
  Write-Host "=== NODE CHECK ===" -ForegroundColor Cyan
  node --check $Auth
  if($LASTEXITCODE -ne 0){ throw "node --check auth.js fallo." }
  node --check $Admin
  if($LASTEXITCODE -ne 0){ throw "node --check admin.js fallo." }

  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try{
    npm run build
    if($LASTEXITCODE -ne 0){ throw "npm run build fallo." }
  } finally { Pop-Location }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try{
    & cmd.exe /d /s /c 'git diff --check -- "backend/src/routes/auth.js" "backend/src/routes/admin.js" "frontend/src/pages/LoginPage.jsx" "frontend/src/pages/AdminPage.jsx" "backend/sql/20260831_AUTH_USERNAME_R62.sql" 2>&1'
    if($LASTEXITCODE -ne 0){ throw "git diff --check detecto errores R62." }

    Write-Host ""
    git status --short
    Write-Host ""
    git diff --stat -- `
      "backend/src/routes/auth.js" `
      "backend/src/routes/admin.js" `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/pages/AdminPage.jsx" `
      "backend/sql/20260831_AUTH_USERNAME_R62.sql"
  } finally { Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R62 INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Login: USUARIO + CONTRASENA" -ForegroundColor Green
  Write-Host " Email ya no se solicita visualmente." -ForegroundColor Green
  Write-Host " Email tecnico interno se conserva para compatibilidad." -ForegroundColor Yellow
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Remove-Item -LiteralPath $tempMigration -Force -ErrorAction SilentlyContinue

  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando archivos..." -ForegroundColor Yellow

  foreach($p in $Touched){ Restore-One $p $BackupRoot $ProjectRoot }

  $migBak=Join-Path $BackupRoot ($Migration.Substring($ProjectRoot.Length).TrimStart('\'))
  if(Test-Path -LiteralPath $migBak){
    Copy-Item -LiteralPath $migBak -Destination $Migration -Force
  } elseif(Test-Path -LiteralPath $Migration){
    Remove-Item -LiteralPath $Migration -Force
  }

  Write-Host "Rollback de archivos R62 completado." -ForegroundColor Yellow
  Write-Host "Si la migracion DB ya hizo COMMIT, username permanece en DB." -ForegroundColor Yellow
  Write-Host "Eso no elimina usuarios ni cambia contrasenas existentes." -ForegroundColor Yellow
  throw
}
