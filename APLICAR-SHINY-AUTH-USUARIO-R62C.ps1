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
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $dest -Force
}
function Restore-One([string]$Source,[string]$BackupRoot,[string]$Root){
  $rel=$Source.Substring($Root.Length).TrimStart('\')
  $bak=Join-Path $BackupRoot $rel
  if(Test-Path -LiteralPath $bak){
    Copy-Item -LiteralPath $bak -Destination $Source -Force
  }
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
Write-Host " SHINY AUTH USUARIO + CONTRASENA R62C" -ForegroundColor Cyan
Write-Host " SIN ALTER TABLE / SIN PRIVILEGIOS OWNER" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Backend=Join-Path $ProjectRoot "backend"
$Frontend=Join-Path $ProjectRoot "frontend"
$Auth=Join-Path $Backend "src\routes\auth.js"
$Admin=Join-Path $Backend "src\routes\admin.js"
$Login=Join-Path $Frontend "src\pages\LoginPage.jsx"
$AdminPage=Join-Path $Frontend "src\pages\AdminPage.jsx"

foreach($p in @($Auth,$Admin,$Login,$AdminPage)){
  Assert-True (Test-Path -LiteralPath $p) "Falta archivo requerido: $p"
}

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot=Join-Path $ProjectRoot "_gmx_backups\AUTH-USERNAME-R62C-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched=@($Auth,$Admin,$Login,$AdminPage)
foreach($p in $Touched){ Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Proyecto : $ProjectRoot"
Write-Host "Backup   : $BackupRoot" -ForegroundColor DarkGray

try{
  $authText=Read-Text $Auth
  $adminText=Read-Text $Admin
  $loginText=Read-Text $Login
  $adminPageText=Read-Text $AdminPage

  Assert-True ($authText.Contains("router.post('/login'")) "No existe login backend esperado."
  Assert-True ($authText.Contains("req.body?.email")) "Auth actual no coincide con login por email."

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

  $before=$block
  $block=[regex]::Replace(
    $block,
    'LOWER\(email\)\s*=\s*LOWER\((\$\d+)\)',
    "LOWER(SPLIT_PART(email,'@',1))=LOWER(`$1)",
    1
  )
  if($block -eq $before){
    $block=[regex]::Replace(
      $block,
      'LOWER\(email\)\s*=\s*(\$\d+)',
      "LOWER(SPLIT_PART(email,'@',1))=LOWER(`$1)",
      1
    )
  }

  $block=[regex]::Replace($block,'\[email\]','[username]',1)

  if($block.Contains('email:admin.email') -and -not $block.Contains('username:String')){
    $block=$block.Replace(
      'email:admin.email',
      "email:admin.email,username:String(admin.email||'').split('@')[0]"
    )
  }

  Assert-True ($block.Contains("SPLIT_PART(email,'@',1)")) "No se pudo cambiar lookup a username."
  Assert-True ($block.Contains('[username]')) "No se pudo cambiar parametro login."

  $authText=$authText.Substring(0,$m.Index)+$block+$authText.Substring($m.Index+$m.Length)
  Write-Utf8NoBom $Auth $authText
  Write-Host "[OK] Backend login por username sin tocar schema." -ForegroundColor Green

  Assert-True ($adminText.Contains("router.post('/users'")) "No existe POST /users esperado."
  Assert-True ($adminText.Contains("ensureAdminEmailAvailable(email)")) "CREATE users no coincide con diagnostico."

  $adminText=$adminText.Replace(
    'SELECT row_id,id_admin,nombre,email,rol,activo,fecha_creacion,fecha_actualizacion,',
    "SELECT row_id,id_admin,nombre,email,SPLIT_PART(email,'@',1) AS username,rol,activo,fecha_creacion,fecha_actualizacion,"
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
    const email=`${username}@shiny.local`;
'@
  $postBlock=$postBlock.Substring(0,$emailDecl.Index)+$createIdentity.Trim()+$postBlock.Substring($emailDecl.Index+$emailDecl.Length)

  $postBlock=$postBlock.Replace(
    'RETURNING row_id,id_admin,nombre,email,rol,activo,sucursal_principal,sucursales_permitidas',
    "RETURNING row_id,id_admin,nombre,email,SPLIT_PART(email,'@',1) AS username,rol,activo,sucursal_principal,sucursales_permitidas"
  )
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
  $putBlock=$putBlock.Substring(0,$newEmailDecl.Index)+"const newEmail=existing.email;"+$putBlock.Substring($newEmailDecl.Index+$newEmailDecl.Length)

  $putBlock=$putBlock.Replace(
    'RETURNING row_id,id_admin,nombre,email,rol,activo,sucursal_principal,sucursales_permitidas',
    "RETURNING row_id,id_admin,nombre,email,SPLIT_PART(email,'@',1) AS username,rol,activo,sucursal_principal,sucursales_permitidas"
  )

  $adminText=$pre+$putBlock+$rest
  $adminText=$adminText.Replace(
    'id_admin,nombre,email,rol,activo',
    "id_admin,nombre,email,SPLIT_PART(email,'@',1) AS username,rol,activo"
  )

  Write-Utf8NoBom $Admin $adminText
  Write-Host "[OK] Usuarios backend: username visible; email queda interno." -ForegroundColor Green

  Assert-True ($loginText.Contains('body: JSON.stringify({ email, password })')) "LoginPage no coincide con diagnostico."

  $statePattern='const\s*\[\s*email\s*,\s*setEmail\s*\]\s*=\s*useState\((.*?)\);'
  $sm=[regex]::Match($loginText,$statePattern,[System.Text.RegularExpressions.RegexOptions]::Singleline)
  Assert-True $sm.Success "No encontre state email/setEmail."

  $loginText=$loginText.Substring(0,$sm.Index)+"const [username, setUsername] = useState($($sm.Groups[1].Value));"+$loginText.Substring($sm.Index+$sm.Length)
  $loginText=$loginText.Replace(
    'body: JSON.stringify({ email, password })',
    'body: JSON.stringify({ username, password })'
  )

  $oldInput='<label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>'
  $newInput='<label>Usuario<input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} required /></label>'
  $loginText=Replace-Once $loginText $oldInput $newInput 'Login input Email'
  $loginText=$loginText.Replace('<label>Password<input type="password"','<label>Contraseña<input type="password"')

  $loginText=[regex]::Replace(
    $loginText,
    '<Link[^>]*to="/admin/recuperar-acceso"[^>]*>.*?</Link>',
    '',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  Write-Utf8NoBom $Login $loginText
  Write-Host "[OK] Portal: Usuario + password." -ForegroundColor Green

  Assert-True ($adminPageText.Contains('form.email')) "AdminPage no coincide con diagnostico."

  $adminPageText=$adminPageText.Replace('[u.nombre, u.email, u.rol]','[u.nombre, u.username, u.rol]')
  $adminPageText=$adminPageText.Replace("u?.nombre || u?.email || '?'","u?.nombre || u?.username || '?'")
  $adminPageText=$adminPageText.Replace(
    'placeholder="Buscar por nombre o correo..."',
    'placeholder="Buscar por nombre o usuario..."'
  )
  $adminPageText=$adminPageText.Replace('<small>{u.email}</small>','<small>@{u.username}</small>')
  $adminPageText=$adminPageText.Replace('<p>{selected.email}</p>','<p>@{selected.username}</p>')

  # R62C: current AdminPage has minor text/encoding variants.
  # Match structurally instead of depending on the exact accented label.
  $selectedPattern='(?s)<label>[^<]*<input\s+value=\{selected\.email\|\|''''\}\s+onChange=\{\(e\)=>setSelected\(x=>\(\{\.\.\.x,email:e\.target\.value\}\)\)\}/></label>'
  $selectedMatches=@([regex]::Matches($adminPageText,$selectedPattern))
  Assert-True ($selectedMatches.Count -eq 1) "Admin selected email: se esperaba 1 campo y se encontraron $($selectedMatches.Count)."
  $newSelected='<label>Usuario<input value={selected.username||''''} readOnly title="El usuario de cuentas existentes se conserva para proteger sesiones y permisos internos."/></label>'
  $adminPageText=[regex]::Replace($adminPageText,$selectedPattern,$newSelected,1)

  $createPattern='(?s)<label>Email<input\s+type="email"\s+value=\{form\.email\}\s+onChange=\{\(e\)\s*=>\s*setForm\(\(x\)\s*=>\s*\(\{\s*\.\.\.x,\s*email:\s*e\.target\.value\s*\}\)\)\}\s*/></label>'
  $createMatches=@([regex]::Matches($adminPageText,$createPattern))
  Assert-True ($createMatches.Count -eq 1) "Admin create email: se esperaba 1 campo y se encontraron $($createMatches.Count)."
  $newCreate='<label>Usuario<input type="text" value={form.username||''''} onChange={(e) => setForm((x) => ({ ...x, username: e.target.value.toLowerCase() }))} autoCapitalize="none" spellCheck={false} /></label>'
  $adminPageText=[regex]::Replace($adminPageText,$createPattern,$newCreate,1)

  # ASCII-safe JSX expression prevents mojibake in PowerShell source.
  $adminPageText=$adminPageText.Replace('<label>Password<input type="password"','<label>{''Contrase\u00f1a''}<input type="password"')

  Write-Utf8NoBom $AdminPage $adminPageText
  Write-Host "[OK] Gestion usuarios: sin email visible." -ForegroundColor Green

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
    & cmd.exe /d /s /c 'git diff --check -- "backend/src/routes/auth.js" "backend/src/routes/admin.js" "frontend/src/pages/LoginPage.jsx" "frontend/src/pages/AdminPage.jsx" 2>&1'
    if($LASTEXITCODE -ne 0){ throw "git diff --check detecto errores R62C." }

    Write-Host ""
    git status --short
    Write-Host ""
    git diff --stat -- `
      "backend/src/routes/auth.js" `
      "backend/src/routes/admin.js" `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/pages/AdminPage.jsx"
  } finally { Pop-Location }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R62C INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Login: USUARIO + CONTRASENA" -ForegroundColor Green
  Write-Host " Sin ALTER TABLE y sin privilegios owner." -ForegroundColor Green
  Write-Host " Usuarios existentes: parte antes de @." -ForegroundColor Green
  Write-Host " Usuarios nuevos: username@shiny.local interno." -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando archivos..." -ForegroundColor Yellow
  foreach($p in $Touched){ Restore-One $p $BackupRoot $ProjectRoot }
  Write-Host "Rollback R62C completado." -ForegroundColor Yellow
  throw
}
