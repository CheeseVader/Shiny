param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-Utf8([string]$Path) {
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8([string]$Path, [string]$Text) {
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}

function Backup-File([string]$Source, [string]$BackupRoot, [string]$Root) {
  $rel = $Source.Substring($Root.Length).TrimStart('\')
  $dest = Join-Path $BackupRoot $rel
  $dir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item -LiteralPath $Source -Destination $dest -Force
}

function Restore-File([string]$Source, [string]$BackupRoot, [string]$Root) {
  $rel = $Source.Substring($Root.Length).TrimStart('\')
  $backup = Join-Path $BackupRoot $rel
  if (Test-Path -LiteralPath $backup) {
    Copy-Item -LiteralPath $backup -Destination $Source -Force
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY LOGIN - DISENO 4 + BRANDING DINAMICO R55-SHINY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "No existe ProjectRoot: $ProjectRoot"

$login = Join-Path $ProjectRoot "frontend\src\pages\LoginPage.jsx"
$appearance = Join-Path $ProjectRoot "frontend\src\components\DualAppearanceDesigner.jsx"
$phase10 = Join-Path $ProjectRoot "frontend\src\phase10.css"
$frontend = Join-Path $ProjectRoot "frontend"

foreach ($p in @($login,$appearance,$phase10)) {
  Assert-True (Test-Path -LiteralPath $p) "Falta archivo requerido: $p"
}

Write-Host "Proyecto     : $ProjectRoot"
Write-Host "Login        : $login"
Write-Host "Apariencias  : $appearance"
Write-Host "CSS          : $phase10"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $ProjectRoot "_gmx_backups\LOGIN-DISENO4-R55-SHINY-$stamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$filesToBackup = @($login,$appearance,$phase10)
foreach ($p in $filesToBackup) { Backup-File $p $backupRoot $ProjectRoot }

Write-Host "Backup       : $backupRoot" -ForegroundColor DarkGray

$created = @()

try {
  # ----------------------------------------------------------
  # 1) LOGIN: reemplazo controlado, sin tocar autenticacion.
  # ----------------------------------------------------------
  $loginText = Read-Utf8 $login

  Assert-True ($loginText -match 'className="brand-mark login-mark"') "No encontre anchor real de la G del login."
  Assert-True ($loginText -match 'return\s+<main className="login-page"') "No encontre return principal del login."

  if ($loginText -notmatch "BrandLogo from '../components/BrandLogo\.jsx'") {
    $loginText = $loginText -replace "import \{ api \} from '\.\./services/api\.js';", "import { api } from '../services/api.js';`r`nimport BrandLogo from '../components/BrandLogo.jsx';"
  }

  if ($loginText -notmatch 'SHINY_LOGIN_APPEARANCE_R55') {
    $anchor = "  const [loading, setLoading] = useState(false);"
    Assert-True ($loginText.Contains($anchor)) "No encontre anchor loading en LoginPage."

    $statePatch = @'
  const [loading, setLoading] = useState(false);
  const [loginAppearance] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('SHINY_LOGIN_APPEARANCE_R55') || '{}');
      return {
        design: String(cached.design || 'network4'),
        glow: String(cached.glow || 'violet')
      };
    } catch {
      return { design: 'network4', glow: 'violet' };
    }
  });
'@
    $loginText = $loginText.Replace($anchor, $statePatch.TrimEnd())
  }

  $loginText = [regex]::Replace(
    $loginText,
    '<div className="brand-mark login-mark">G</div>',
    '<BrandLogo compact className="login-dynamic-brand" />',
    1
  )

  if ($loginText -notmatch 'shiny-login-network-r55') {
    $mainAnchor = 'return <main className="login-page">'
    $mainReplacement = @'
return <main className={`login-page shiny-login-r55 design-${loginAppearance.design}`} data-login-glow={loginAppearance.glow}>
    <div className="shiny-login-network-r55" aria-hidden="true">
      <span className="shiny-login-orb-r55 orb-a" />
      <span className="shiny-login-orb-r55 orb-b" />
      <span className="shiny-login-orb-r55 orb-c" />
      <span className="shiny-login-line-r55 line-a" />
      <span className="shiny-login-line-r55 line-b" />
      <span className="shiny-login-line-r55 line-c" />
      <span className="shiny-login-node-r55 node-a" />
      <span className="shiny-login-node-r55 node-b" />
      <span className="shiny-login-node-r55 node-c" />
      <span className="shiny-login-node-r55 node-d" />
      <span className="shiny-login-node-r55 node-e" />
    </div>
'@
    $loginText = $loginText.Replace($mainAnchor, $mainReplacement.TrimEnd())
  }

  # Corrige solo textos visibles del login cuando estan en mojibake.
  $replacements = @{
    'Shiny Â· ADMIN' = 'Shiny · ADMIN'
    'Iniciar sesiÃ³n' = 'Iniciar sesión'
    'contraseÃ±a' = 'contraseña'
    'Â¿Olvidaste tu contraseÃ±a?' = '¿Olvidaste tu contraseña?'
  }
  foreach ($k in $replacements.Keys) {
    $loginText = $loginText.Replace($k, $replacements[$k])
  }

  Write-Utf8 $login $loginText
  Write-Host "[OK] LoginPage: branding dinamico + Diseno 4." -ForegroundColor Green

  # ----------------------------------------------------------
  # 2) APARIENCIAS: cache pre-auth del fondo del login.
  #    Se guarda junto con el tema de administracion.
  # ----------------------------------------------------------
  $appearanceText = Read-Utf8 $appearance

  Assert-True ($appearanceText -match "localStorage\.setItem\('Shiny_ADMIN_BRAND'") "No encontre cache Shiny_ADMIN_BRAND."
  Assert-True ($appearanceText -match "Nombre de marca") "No encontre ThemeForm de Apariencias."

  if ($appearanceText -notmatch 'SHINY_LOGIN_APPEARANCE_R55') {
    $brandCachePattern = "(?s)(localStorage\.setItem\('Shiny_ADMIN_BRAND',\s*JSON\.stringify\(\{.*?\}\)\);)"
    $m = [regex]::Match($appearanceText, $brandCachePattern)
    Assert-True $m.Success "No pude aislar bloque Shiny_ADMIN_BRAND."

    $cachePatch = @'
$1
        localStorage.setItem('SHINY_LOGIN_APPEARANCE_R55', JSON.stringify({
          design: get('admin', 'login_background_design', 'network4'),
          glow: get('admin', 'login_background_glow', 'violet')
        }));
'@
    $appearanceText = [regex]::Replace($appearanceText, $brandCachePattern, $cachePatch.TrimEnd(), 1)
  }

  if ($appearanceText -notmatch 'Fondo del login') {
    $brandFieldPattern = "(<label>Texto/logo<input[^>]*value=\{get\(scope,\s*'logo_text',\s*'G'\)\}.*?</label>)"
    $m2 = [regex]::Match($appearanceText, $brandFieldPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    Assert-True $m2.Success "No encontre campo Texto/logo para insertar Fondo del login."

    $loginFields = @'
$1
      {!client ? <>
        <label>Fondo del login
          <select value={get(scope, 'login_background_design', 'network4')} onChange={(e) => set(scope, 'login_background_design', e.target.value)}>
            <option value="network4">Diseño 4 · Red de conexiones</option>
            <option value="gradient">Gradiente limpio</option>
            <option value="solid">Fondo sólido</option>
          </select>
        </label>
        <label>Resplandor del login
          <select value={get(scope, 'login_background_glow', 'violet')} onChange={(e) => set(scope, 'login_background_glow', e.target.value)}>
            <option value="violet">Violeta / azul</option>
            <option value="blue">Azul</option>
            <option value="soft">Suave</option>
          </select>
        </label>
      </> : null}
'@
    $appearanceText = [regex]::Replace(
      $appearanceText,
      $brandFieldPattern,
      $loginFields.TrimEnd(),
      [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
  }

  # Default admin: dejar de sugerir G fija.
  $appearanceText = $appearanceText.Replace("logoText: get('admin', 'logo_text', 'G')", "logoText: get('admin', 'logo_text', 'Shiny')")
  $appearanceText = $appearanceText.Replace("value={get(scope, 'logo_text', 'G')}", "value={get(scope, 'logo_text', client ? 'S' : 'Shiny')}")

  Write-Utf8 $appearance $appearanceText
  Write-Host "[OK] Apariencias: selector de fondo del login + cache pre-auth." -ForegroundColor Green

  # ----------------------------------------------------------
  # 3) CSS aislado, al final de phase10.css para ganar cascade.
  # ----------------------------------------------------------
  $css = Read-Utf8 $phase10
  $marker = "/* SHINY_LOGIN_DESIGN4_R55_START */"

  if ($css -notmatch [regex]::Escape($marker)) {
    $block = @'

/* SHINY_LOGIN_DESIGN4_R55_START */
.login-page.shiny-login-r55{
  position:relative;
  isolation:isolate;
  min-height:100vh;
  display:grid;
  place-items:center;
  overflow:hidden;
  padding:32px 18px;
  background:
    radial-gradient(circle at 18% 18%, rgba(119,72,255,.22), transparent 31%),
    radial-gradient(circle at 82% 76%, rgba(39,121,255,.18), transparent 34%),
    linear-gradient(135deg,#07111f 0%,#0a1630 46%,#11162d 100%) !important;
}
.login-page.shiny-login-r55.design-gradient{
  background:linear-gradient(135deg,#08111f,#17213d 55%,#201c42) !important;
}
.login-page.shiny-login-r55.design-solid{
  background:#0b1324 !important;
}
.shiny-login-network-r55{
  position:absolute;
  inset:0;
  z-index:-1;
  pointer-events:none;
  overflow:hidden;
}
.shiny-login-orb-r55{
  position:absolute;
  width:34vw;
  height:34vw;
  min-width:320px;
  min-height:320px;
  border-radius:50%;
  filter:blur(34px);
  opacity:.34;
}
.shiny-login-orb-r55.orb-a{left:-10%;top:-14%;background:#6d4aff;}
.shiny-login-orb-r55.orb-b{right:-12%;bottom:-18%;background:#286bff;}
.shiny-login-orb-r55.orb-c{left:43%;top:31%;width:18vw;height:18vw;background:#8b5cf6;opacity:.14;}
.shiny-login-line-r55{
  position:absolute;
  height:1px;
  transform-origin:left center;
  background:linear-gradient(90deg,transparent,rgba(125,110,255,.72),rgba(64,151,255,.38),transparent);
  box-shadow:0 0 12px rgba(102,116,255,.35);
}
.shiny-login-line-r55.line-a{width:58vw;left:2%;top:29%;transform:rotate(18deg);}
.shiny-login-line-r55.line-b{width:52vw;right:-5%;top:58%;transform:rotate(-22deg);}
.shiny-login-line-r55.line-c{width:46vw;left:28%;bottom:18%;transform:rotate(11deg);}
.shiny-login-node-r55{
  position:absolute;
  width:9px;
  height:9px;
  border-radius:50%;
  background:#b9b4ff;
  border:2px solid rgba(255,255,255,.78);
  box-shadow:0 0 0 7px rgba(113,91,255,.08),0 0 22px rgba(114,102,255,.92);
}
.shiny-login-node-r55.node-a{left:13%;top:33%;}
.shiny-login-node-r55.node-b{left:34%;top:45%;}
.shiny-login-node-r55.node-c{right:18%;top:29%;}
.shiny-login-node-r55.node-d{right:29%;bottom:24%;}
.shiny-login-node-r55.node-e{left:19%;bottom:18%;}
.login-page.shiny-login-r55[data-login-glow="blue"] .shiny-login-node-r55{box-shadow:0 0 0 7px rgba(39,121,255,.08),0 0 22px rgba(56,132,255,.95);}
.login-page.shiny-login-r55[data-login-glow="soft"] .shiny-login-node-r55{box-shadow:0 0 0 5px rgba(160,170,255,.06),0 0 12px rgba(129,143,255,.55);}
.login-page.shiny-login-r55.design-gradient .shiny-login-network-r55,
.login-page.shiny-login-r55.design-solid .shiny-login-network-r55{opacity:.28;}

.login-page.shiny-login-r55 .login-card{
  position:relative;
  width:min(430px,calc(100vw - 32px));
  padding:34px 34px 28px !important;
  border:1px solid rgba(255,255,255,.68) !important;
  border-radius:24px !important;
  background:rgba(255,255,255,.97) !important;
  box-shadow:0 30px 90px rgba(0,0,0,.38),0 0 0 1px rgba(123,103,255,.05) !important;
  backdrop-filter:blur(18px);
}
.login-page.shiny-login-r55 .login-dynamic-brand{
  justify-content:center;
  margin:0 auto 14px;
}
.login-page.shiny-login-r55 .login-dynamic-brand .dynamic-brand-symbol{
  min-width:54px;
  height:54px;
  border-radius:16px;
  padding:0 13px;
  display:grid;
  place-items:center;
  background:linear-gradient(135deg,#6d43f5,#2f7df4);
  color:#fff;
  font-weight:900;
  box-shadow:0 10px 24px rgba(89,78,229,.28);
}
.login-page.shiny-login-r55 .login-dynamic-brand .dynamic-brand-wordmark{
  display:flex;
  flex-direction:column;
}
.login-page.shiny-login-r55 .login-dynamic-brand .dynamic-brand-wordmark strong{
  color:#111827;
  font-size:18px;
  line-height:1.05;
}
.login-page.shiny-login-r55 .login-dynamic-brand .dynamic-brand-wordmark small{
  color:#667085;
  margin-top:3px;
}
.login-page.shiny-login-r55 .login-card>.eyebrow{
  text-align:center;
  letter-spacing:.11em;
  color:#6c4ee8;
  font-weight:800;
}
.login-page.shiny-login-r55 .login-card h1{
  text-align:center;
  margin-top:5px;
  font-size:30px;
  letter-spacing:-.035em;
  color:#111827;
}
.login-page.shiny-login-r55 .login-card>p{
  text-align:center;
  margin-top:7px;
  margin-bottom:8px;
}
.login-page.shiny-login-r55 .login-card label{
  font-size:12px;
  color:#344054;
}
.login-page.shiny-login-r55 .login-card input{
  min-height:46px;
  border:1px solid #d8deea;
  border-radius:12px;
  background:#fff;
  padding:0 13px;
  outline:none;
  transition:border-color .15s,box-shadow .15s;
}
.login-page.shiny-login-r55 .login-card input:focus{
  border-color:#7756ef;
  box-shadow:0 0 0 4px rgba(119,86,239,.10);
}
.login-page.shiny-login-r55 .login-card>button{
  min-height:48px;
  border:0;
  border-radius:12px;
  background:linear-gradient(135deg,#6d43f5,#2f7df4);
  box-shadow:0 10px 24px rgba(87,77,225,.24);
  font-weight:800;
}
.login-page.shiny-login-r55 .admin-forgot-link{
  text-align:center;
  margin-top:2px;
}
@media (max-width:560px){
  .login-page.shiny-login-r55{padding:18px 14px;}
  .login-page.shiny-login-r55 .login-card{padding:27px 22px 23px !important;border-radius:20px !important;}
  .login-page.shiny-login-r55 .login-card h1{font-size:27px;}
}
/* SHINY_LOGIN_DESIGN4_R55_END */
'@
    $css = $css.TrimEnd() + "`r`n" + $block.Trim() + "`r`n"
    Write-Utf8 $phase10 $css
  }

  Write-Host "[OK] CSS Diseno 4 agregado al final de phase10.css." -ForegroundColor Green

  # ----------------------------------------------------------
  # 4) Validaciones
  # ----------------------------------------------------------
  Write-Host ""
  Write-Host "=== VALIDACION FRONTEND ===" -ForegroundColor Cyan
  Push-Location $frontend
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build fallo con codigo $LASTEXITCODE" }
  }
  finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try {
    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "git diff --check detecto errores." }

    Write-Host ""
    git status --short
    Write-Host ""
    git diff --stat
  }
  finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R55-SHINY INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " Login: Diseno 4 + branding dinamico Shiny" -ForegroundColor Green
  Write-Host " Apariencias: selector del fondo del login" -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow

  foreach ($p in $filesToBackup) {
    Restore-File $p $backupRoot $ProjectRoot
  }

  foreach ($p in $created) {
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
  }

  Write-Host "Rollback R55-SHINY completado." -ForegroundColor Yellow
  throw
}
