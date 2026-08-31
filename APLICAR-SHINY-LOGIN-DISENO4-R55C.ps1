param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-Text([string]$Path) {
  return [System.IO.File]::ReadAllText($Path)
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Backup-One([string]$Source, [string]$BackupRoot, [string]$Root) {
  $rel = $Source.Substring($Root.Length).TrimStart('\')
  $dest = Join-Path $BackupRoot $rel
  $dir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item -LiteralPath $Source -Destination $dest -Force
}

function Restore-One([string]$Source, [string]$BackupRoot, [string]$Root) {
  $rel = $Source.Substring($Root.Length).TrimStart('\')
  $bak = Join-Path $BackupRoot $rel
  if (Test-Path -LiteralPath $bak) {
    Copy-Item -LiteralPath $bak -Destination $Source -Force
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY LOGIN DESIGN 4 - R55C" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$Login = Join-Path $ProjectRoot "frontend\src\pages\LoginPage.jsx"
$Appearance = Join-Path $ProjectRoot "frontend\src\components\DualAppearanceDesigner.jsx"
$Css = Join-Path $ProjectRoot "frontend\src\phase10.css"
$Frontend = Join-Path $ProjectRoot "frontend"

foreach ($p in @($Login,$Appearance,$Css)) {
  Assert-True (Test-Path -LiteralPath $p) "Falta archivo requerido: $p"
}

Write-Host "Proyecto    : $ProjectRoot"
Write-Host "Login       : $Login"
Write-Host "Apariencias : $Appearance"
Write-Host "CSS         : $Css"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectRoot "_gmx_backups\LOGIN-DISENO4-R55C-SHINY-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Touched = @($Login,$Appearance,$Css)
foreach ($p in $Touched) { Backup-One $p $BackupRoot $ProjectRoot }

Write-Host "Backup      : $BackupRoot" -ForegroundColor DarkGray

try {
  # ------------------------------------------------------------
  # LOGIN
  # ------------------------------------------------------------
  $t = Read-Text $Login

  Assert-True ($t.Contains('<div className="brand-mark login-mark">G</div>')) "No encontre la G fija del login."
  Assert-True ($t.Contains('return <main className="login-page">')) "No encontre el main del login."
  Assert-True ($t.Contains('  const [loading, setLoading] = useState(false);')) "No encontre state loading."

  if (-not $t.Contains("import BrandLogo from '../components/BrandLogo.jsx';")) {
    $anchor = "import { api } from '../services/api.js';"
    Assert-True ($t.Contains($anchor)) "No encontre import api."
    $t = $t.Replace($anchor, $anchor + "`r`nimport BrandLogo from '../components/BrandLogo.jsx';")
  }

  if (-not $t.Contains('SHINY_LOGIN_APPEARANCE_R55')) {
    $anchor = '  const [loading, setLoading] = useState(false);'
    $patch = @'
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
    $t = $t.Replace($anchor, $patch.TrimEnd())
  }

  $t = $t.Replace(
    '<div className="brand-mark login-mark">G</div>',
    '<BrandLogo compact className="login-dynamic-brand" />'
  )

  if (-not $t.Contains('shiny-login-network-r55')) {
    $anchor = 'return <main className="login-page">'
    $patch = @'
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
    $t = $t.Replace($anchor, $patch.TrimEnd())
  }

  Write-Utf8NoBom $Login $t
  Write-Host "[OK] Login actualizado." -ForegroundColor Green

  # ------------------------------------------------------------
  # APPEARANCE DESIGNER
  # ------------------------------------------------------------
  $a = Read-Text $Appearance

  Assert-True ($a.Contains("localStorage.setItem('Shiny_ADMIN_BRAND'")) "No encontre cache de branding Shiny."
  Assert-True ($a.Contains("value={get(scope, 'logo_text', 'G')}")) "No encontre campo logo_text esperado."

  if (-not $a.Contains('SHINY_LOGIN_APPEARANCE_R55')) {
    $brandStart = $a.IndexOf("localStorage.setItem('Shiny_ADMIN_BRAND'")
    Assert-True ($brandStart -ge 0) "No encontre inicio de cache Shiny_ADMIN_BRAND."

    $brandEnd = $a.IndexOf("));", $brandStart)
    Assert-True ($brandEnd -gt $brandStart) "No encontre final de cache Shiny_ADMIN_BRAND."
    $insertAt = $brandEnd + 3

    $cache = @'

        localStorage.setItem('SHINY_LOGIN_APPEARANCE_R55', JSON.stringify({
          design: get('admin', 'login_background_design', 'network4'),
          glow: get('admin', 'login_background_glow', 'violet')
        }));
'@
    $a = $a.Insert($insertAt, $cache)
  }

  if (-not $a.Contains('Fondo del login')) {
    $field = "      <label>Texto/logo<input maxLength=""4"" value={get(scope, 'logo_text', 'G')} onChange={(e) => set(scope, 'logo_text', e.target.value)} /></label>"
    Assert-True ($a.Contains($field)) "No encontre anchor exacto Texto/logo."

    $fields = @'
      <label>Texto/logo<input maxLength="12" value={get(scope, 'logo_text', client ? 'S' : 'Shiny')} onChange={(e) => set(scope, 'logo_text', e.target.value)} /></label>
      {!client ? <>
        <label>Fondo del login
          <select value={get(scope, 'login_background_design', 'network4')} onChange={(e) => set(scope, 'login_background_design', e.target.value)}>
            <option value="network4">Diseno 4 - Red de conexiones</option>
            <option value="gradient">Gradiente limpio</option>
            <option value="solid">Fondo solido</option>
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
    $a = $a.Replace($field, $fields.TrimEnd())
  }

  $a = $a.Replace(
    "logoText: get('admin', 'logo_text', 'G')",
    "logoText: get('admin', 'logo_text', 'Shiny')"
  )

  Write-Utf8NoBom $Appearance $a
  Write-Host "[OK] Apariencias actualizado." -ForegroundColor Green

  # ------------------------------------------------------------
  # CSS
  # ------------------------------------------------------------
  $c = Read-Text $Css
  $marker = '/* SHINY_LOGIN_DESIGN4_R55_START */'

  if (-not $c.Contains($marker)) {
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
    radial-gradient(circle at 18% 18%,rgba(119,72,255,.22),transparent 31%),
    radial-gradient(circle at 82% 76%,rgba(39,121,255,.18),transparent 34%),
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
.login-page.shiny-login-r55[data-login-glow="blue"] .shiny-login-node-r55{
  box-shadow:0 0 0 7px rgba(39,121,255,.08),0 0 22px rgba(56,132,255,.95);
}
.login-page.shiny-login-r55[data-login-glow="soft"] .shiny-login-node-r55{
  box-shadow:0 0 0 5px rgba(160,170,255,.06),0 0 12px rgba(129,143,255,.55);
}
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
.login-page.shiny-login-r55 .login-card input{
  min-height:46px;
  border:1px solid #d8deea;
  border-radius:12px;
  background:#fff;
  padding:0 13px;
  outline:none;
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
    $c = $c.TrimEnd() + "`r`n`r`n" + $block.Trim() + "`r`n"
    Write-Utf8NoBom $Css $c
  }

  Write-Host "[OK] CSS Design 4 agregado." -ForegroundColor Green

  # ------------------------------------------------------------
  # BUILD + GIT CHECK
  # ------------------------------------------------------------
  Write-Host ""
  Write-Host "=== FRONTEND BUILD ===" -ForegroundColor Cyan
  Push-Location $Frontend
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "npm run build fallo con codigo $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "=== GIT DIFF CHECK ===" -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try {
    # Validar solamente los archivos modificados por R55C.
    # El repositorio puede contener cambios previos ajenos a este instalador.
    $checkArgs = @(
      '--',
      'frontend/src/pages/LoginPage.jsx',
      'frontend/src/components/DualAppearanceDesigner.jsx',
      'frontend/src/phase10.css'
    )

    & git diff --check @checkArgs
    if ($LASTEXITCODE -ne 0) {
      throw "git diff --check detecto errores en archivos R55C."
    }

    Write-Host ""
    git status --short
    Write-Host ""
    git diff --stat -- `
      "frontend/src/pages/LoginPage.jsx" `
      "frontend/src/components/DualAppearanceDesigner.jsx" `
      "frontend/src/phase10.css"
  }
  finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host " R55C-SHINY INSTALADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host " NO se realizo commit ni push." -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando..." -ForegroundColor Yellow

  foreach ($p in $Touched) {
    Restore-One $p $BackupRoot $ProjectRoot
  }

  Write-Host "Rollback R55C-SHINY completado." -ForegroundColor Yellow
  throw
}
