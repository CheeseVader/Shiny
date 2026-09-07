#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny",
    [string]$ReleaseRepo = "CheeseVader/Shiny-Release"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Step([string]$m){ Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok([string]$m){ Write-Host "[OK] $m" -ForegroundColor Green }
function Warn([string]$m){ Write-Host "[AVISO] $m" -ForegroundColor Yellow }
function Fail([string]$m){ throw $m }
function Write-Utf8NoBom([string]$Path,[string]$Text){
    [IO.File]::WriteAllText($Path,$Text,(New-Object Text.UTF8Encoding($false)))
}

function Get-NextPatchVersion([version]$v){
    return ("{0}.{1}.{2}" -f $v.Major,$v.Minor,($v.Build + 1))
}

Set-Location $ProjectRoot

$Panel     = Join-Path $ProjectRoot 'frontend\src\components\SystemBackupPanel.jsx'
$Route     = Join-Path $ProjectRoot 'backend\src\routes\systemBackup.js'
$Agent     = Join-Path $ProjectRoot 'backend\scripts\shiny-backup-agent.sh'
$Bootstrap = Join-Path $ProjectRoot 'backend\scripts\shiny-rpi-system-bootstrap.cjs'
$Pkg       = Join-Path $ProjectRoot 'backend\package.json'
$Publisher = Join-Path $ProjectRoot 'PUBLICAR-SHINY-RELEASE-R5.2.ps1'

$Required = @($Panel,$Route,$Agent,$Bootstrap,$Pkg,$Publisher)
foreach($p in $Required){ if(!(Test-Path -LiteralPath $p)){ Fail "Falta archivo requerido: $p" } }

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " SHINY - ACTUALIZACION RESPALDO DE UN CLIC R1" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Metodo : Release normal + Updater R4"
Write-Host "RPi    : NO se parchea manualmente"
Write-Host "Repo   : $ReleaseRepo"
Write-Host ""

Step 'Validando herramientas y repositorio'
foreach($cmd in @('git','gh','node','npm')){
    if(-not (Get-Command $cmd -ErrorAction SilentlyContinue)){ Fail "$cmd no esta disponible en PATH." }
}
& git rev-parse --is-inside-work-tree *> $null
if($LASTEXITCODE -ne 0){ Fail "ProjectRoot no es un repositorio Git: $ProjectRoot" }
$tracked = @(& git status --porcelain --untracked-files=no)
if($LASTEXITCODE -ne 0){ Fail 'No pude consultar git status.' }
if($tracked.Count -gt 0){
    $tracked | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Fail 'Hay cambios TRACKED sin commit. No voy a mezclar esta actualizacion con otros cambios.'
}
& gh auth status *> $null
if($LASTEXITCODE -ne 0){ Fail 'GitHub CLI no esta autenticado.' }
Ok 'Repositorio limpio y GitHub disponible.'

Step 'Detectando version publicada actual'
$relsRaw = & gh api "repos/$ReleaseRepo/releases?per_page=100"
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($relsRaw -join "`n"))){ Fail "No pude consultar releases de $ReleaseRepo." }
$rels = (($relsRaw -join "`n") | ConvertFrom-Json)
$candidates = @()
foreach($r in @($rels)){
    if([bool]$r.draft -or [bool]$r.prerelease){ continue }
    $tag = [string]$r.tag_name
    if($tag -match '^v(\d+\.\d+\.\d+)$'){
        $candidates += [pscustomobject]@{ Version=[version]$Matches[1]; Text=$Matches[1]; Tag=$tag }
    }
}
if($candidates.Count -eq 0){ Fail "No encontre una Release semver publicada en $ReleaseRepo." }
$baseObj = $candidates | Sort-Object Version -Descending | Select-Object -First 1
$BaseVersion = [string]$baseObj.Text
$NewVersion = Get-NextPatchVersion ([version]$BaseVersion)
Ok "Base publicada: $BaseVersion"
Ok "Nueva version : $NewVersion"

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Safety = Join-Path $ProjectRoot "release-output\pre-update-backup-oneclick-$stamp"
New-Item -ItemType Directory -Force -Path $Safety | Out-Null
foreach($p in @($Panel,$Route,$Agent,$Bootstrap,$Pkg)){
    Copy-Item -LiteralPath $p -Destination (Join-Path $Safety ([IO.Path]::GetFileName($p))) -Force
}
Ok "Copia preventiva: $Safety"

Step 'Actualizando interfaz: un solo boton Respaldar'
$panelText = @'
/* SHINY_BACKUP_ONE_CLICK_UI_R1 */
import React,{useEffect,useState} from 'react';
import {api} from '../services/api.js';
import '../system_backup_r130.css';

export default function SystemBackupPanel(){
  const [st,setSt]=useState(null);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  async function status(){
    try{
      const r=await api('/api/v1/system-backup/status');
      setSt(r.data||null);
    }catch(e){
      setMsg(e?.message||'No fue posible consultar el estado del respaldo.');
    }
  }

  useEffect(()=>{status()},[]);

  async function backup(){
    try{
      setBusy(true);
      setMsg('Creando y subiendo respaldo...');
      const r=await api('/api/v1/system-backup/backup',{method:'POST'});
      setMsg(r.message||'Respaldo creado y subido correctamente.');
      await status();
    }catch(e){
      setMsg(e?.message||'No fue posible crear el respaldo.');
    }finally{
      setBusy(false);
    }
  }

  return <section className="content-card bk130">
    <div className="section-head">
      <div>
        <div className="eyebrow">SUPERADMIN · CONTINUIDAD</div>
        <h2>Respaldo y migración</h2>
        <p className="section-copy">El respaldo usa automáticamente la configuración instalada de este cliente.</p>
      </div>
    </div>

    <div className="bk130-grid">
      <article><span>Repositorio</span><strong>{st?.repo||'Detectando...'}</strong></article>
      <article><span>Base de datos</span><strong>{st?.db||'Detectando...'}</strong></article>
      <article><span>Versión</span><strong>{st?.version||'—'}</strong></article>
      <article><span>Último respaldo</span><strong>{st?.latestBackup||'—'}</strong></article>
    </div>

    <div className="bk130-note">
      No requiere capturar owner, repositorio, token ni claves. El respaldo se publica como backup-* en el mismo Shiny-Release configurado en el equipo.
    </div>

    <div className="bk130-actions">
      <button disabled={busy||st?.configured===false} onClick={backup}>{busy?'Respaldando...':'Respaldar'}</button>
    </div>

    {msg?<div className="bk130-msg">{msg}</div>:null}
  </section>;
}
'@
Write-Utf8NoBom $Panel $panelText
Ok 'SystemBackupPanel.jsx: solo un boton de accion.'

Step 'Actualizando API de respaldo automatico'
$routeText = @'
/* SHINY_SYSTEM_BACKUP_ONE_CLICK_R1 */
import { Router } from 'express';
import { spawn } from 'node:child_process';

const router = Router();
const AGENT = '/usr/local/lib/shiny-backup/shiny-backup-agent.sh';

function role(req){ return String(req.user?.rol || req.user?.role || '').toUpperCase(); }
router.use((req,res,next)=>{
  if(role(req)!=='SUPERADMIN') return res.status(403).json({success:false,error:'SUPERADMIN_REQUIRED'});
  next();
});

function runAgent(action,timeout=30*60*1000){
  return new Promise((resolve,reject)=>{
    const child=spawn('sudo',['-n',AGENT,action],{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    const timer=setTimeout(()=>{ try{child.kill('SIGKILL')}catch{} },timeout);
    child.stdout.on('data',d=>out+=d.toString());
    child.stderr.on('data',d=>err+=d.toString());
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0) return reject(new Error(String(err||out||`BACKUP_AGENT_EXIT_${code}`).trim()));
      resolve(String(out).trim());
    });
  });
}

router.get('/status',async(_req,res)=>{
  try{
    const out=await runAgent('status',60000);
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data:JSON.parse(out||'{}')});
  }catch(e){
    res.status(500).json({success:false,error:'BACKUP_STATUS_FAILED',message:String(e.message||e)});
  }
});

router.post('/backup',async(_req,res)=>{
  try{
    const detail=await runAgent('backup');
    res.json({success:true,message:'Respaldo creado y subido correctamente.',detail});
  }catch(e){
    res.status(500).json({success:false,error:'BACKUP_FAILED',message:String(e.message||e)});
  }
});

export default router;
'@
Write-Utf8NoBom $Route $routeText
Ok 'systemBackup.js actualizado.'

Step 'Actualizando agente Linux/RPi compatible con restauradores R2'
$agentText = @'
#!/usr/bin/env bash
set -Eeuo pipefail
# SHINY_BACKUP_ONE_CLICK_AGENT_R1
# Usa /etc/shiny-updater/updater.env. No solicita datos interactivos.
# Publica backup-* como prerelease dentro del MISMO <Cliente>-Release.

UPDATER_ENV="${SHINY_UPDATER_CONFIG:-/etc/shiny-updater/updater.env}"
ROOT="${SHINY_BACKUP_ROOT:-/var/lib/shiny-backup}"
BACKUPS="$ROOT/backups"
TMP="$ROOT/tmp"
LAST_JSON="$ROOT/last-backup.json"

fail(){ echo "[ERROR] $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || fail "Falta dependencia: $1"; }
json_escape(){ python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'; }

[[ $EUID -eq 0 ]] || fail ROOT_REQUIRED
[[ -f "$UPDATER_ENV" ]] || fail "No existe $UPDATER_ENV"
for c in curl jq tar pg_dump sha256sum python3; do need "$c"; done

# Normalizar CRLF/BOM sin imprimir secretos.
sed -i '1s/^\xEF\xBB\xBF//' "$UPDATER_ENV" 2>/dev/null || true
sed -i 's/\r$//' "$UPDATER_ENV" 2>/dev/null || true
# shellcheck disable=SC1090
source "$UPDATER_ENV"

GITHUB_OWNER="${GITHUB_OWNER:-}"
GITHUB_REPO="${GITHUB_REPO:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
APP_DIR="${APP_DIR:-/opt/shiny/app}"
CLIENT_NAME="${CLIENT_NAME:-}"
CLIENT_SLUG="${CLIENT_SLUG:-}"
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_SCHEMA="${DB_SCHEMA:-shiny}"

[[ -n "$GITHUB_OWNER" ]] || fail GITHUB_OWNER_NOT_CONFIGURED
[[ -n "$GITHUB_REPO" ]] || fail GITHUB_REPO_NOT_CONFIGURED
[[ -n "$GITHUB_TOKEN" ]] || fail GITHUB_TOKEN_NOT_CONFIGURED
[[ -n "$DB_NAME" ]] || fail DB_NAME_NOT_CONFIGURED
[[ "$DB_SCHEMA" == "shiny" ]] || fail "DB_SCHEMA esperado shiny; actual=$DB_SCHEMA"
[[ -d "$APP_DIR" ]] || fail "No existe APP_DIR=$APP_DIR"
[[ -f "$APP_DIR/VERSION" ]] || fail "No existe $APP_DIR/VERSION"

if [[ -z "$CLIENT_NAME" ]]; then
  CLIENT_NAME="${GITHUB_REPO%-Release}"
fi
if [[ -z "$CLIENT_SLUG" ]]; then
  CLIENT_SLUG="$(printf '%s' "$CLIENT_NAME" | sed -E 's/([a-z0-9])([A-Z])/\1_\2/g;s/[^A-Za-z0-9]+/_/g;s/^_+//;s/_+$//' | tr '[:upper:]' '[:lower:]')"
fi
DB_USER="${DB_USER:-${CLIENT_SLUG}_app}"
VERSION="$(tr -d '\r\n ' < "$APP_DIR/VERSION")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "VERSION invalida: $VERSION"
[[ "$GITHUB_REPO" == *-Release ]] || fail "Repo inesperado: $GITHUB_REPO. Debe ser <Cliente>-Release."

mkdir -p "$BACKUPS" "$TMP"
chmod 700 "$ROOT" "$BACKUPS" "$TMP"

API="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"
api(){
  curl -fsS \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-OneClick-R1' "$@"
}

status(){
  local last=''
  if [[ -f "$LAST_JSON" ]]; then last="$(jq -r '.tag // empty' "$LAST_JSON" 2>/dev/null || true)"; fi
  jq -cn \
    --arg repo "$GITHUB_OWNER/$GITHUB_REPO" \
    --arg db "$DB_NAME" \
    --arg version "$VERSION" \
    --arg latest "$last" \
    '{configured:true,platform:"linux",repo:$repo,db:$db,version:$version,latestBackup:$latest}'
}

upload_asset(){
  local upload_base="$1" file="$2" name encoded
  name="$(basename "$file")"
  encoded="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$name")"
  curl -fsS -X POST \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'Content-Type: application/octet-stream' \
    --data-binary "@$file" \
    "${upload_base}?name=${encoded}" >/dev/null
}

backup(){
  local stamp tag work db_asset db_file db_sha
  local app_tag app_asset app_manifest release_json app_manifest_url app_sha
  local config_asset='' config_file='' config_sha='' uploads_asset='' uploads_file='' uploads_sha=''
  local release_payload release_created upload_url upload_base manifest

  stamp="$(date +%Y%m%d-%H%M%S)"
  tag="backup-$stamp"
  work="$(mktemp -d "$TMP/create-XXXXXX")"
  chown postgres:postgres "$work"
  trap 'rm -rf "$work" >/dev/null 2>&1 || true' EXIT

  # Confirmar acceso al repo y obtener la app exacta instalada.
  api "$API" >/dev/null || fail "No puedo acceder a $GITHUB_OWNER/$GITHUB_REPO"
  app_tag="v$VERSION"
  release_json="$work/app-release.json"
  api "$API/releases/tags/$app_tag" > "$release_json" || fail "No existe app release $app_tag"
  app_asset="shiny-rpi-$VERSION.tar.gz"
  jq -e --arg n "$app_asset" '.assets[] | select(.name==$n)' "$release_json" >/dev/null \
    || fail "La release $app_tag no contiene $app_asset"

  app_manifest="manifest-$VERSION.json"
  app_manifest_url="$(jq -r --arg n "$app_manifest" '.assets[] | select(.name==$n) | .url' "$release_json" | head -n1)"
  [[ -n "$app_manifest_url" ]] || fail "La release $app_tag no contiene $app_manifest"
  curl -fsSL \
    -H 'Accept: application/octet-stream' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "$app_manifest_url" -o "$work/$app_manifest"
  app_sha="$(jq -r '.sha256 // empty' "$work/$app_manifest")"
  [[ "$app_sha" =~ ^[A-Fa-f0-9]{64}$ ]] || fail "SHA256 de app ausente/invalido"

  # Base PostgreSQL exacta.
  db_asset="${DB_NAME}-${stamp}.dump"
  db_file="$work/$db_asset"
  runuser -u postgres -- pg_dump -Fc --no-owner --no-privileges -d "$DB_NAME" -f "$db_file" \
    || fail PG_DUMP_FAILED
  db_sha="$(sha256sum "$db_file" | awk '{print $1}')"

  # Configuracion local NO secreta y persistencia adicional.
  mapfile -t cfg_paths < <(
    for p in \
      config/instance.json config/instance.local.json brand.config.json frontend/public/brand.config.json \
      backend/uploads frontend/public/uploads; do
      [[ -e "$APP_DIR/$p" ]] && printf '%s\n' "$p"
    done
  )
  if [[ ${#cfg_paths[@]} -gt 0 ]]; then
    config_asset="client-config-$stamp.tar.gz"
    config_file="$work/$config_asset"
    tar -czf "$config_file" -C "$APP_DIR" "${cfg_paths[@]}"
    config_sha="$(sha256sum "$config_file" | awk '{print $1}')"
  fi

  if [[ -d "$APP_DIR/uploads" && -n "$(find "$APP_DIR/uploads" -mindepth 1 -maxdepth 1 2>/dev/null | head -n1)" ]]; then
    uploads_asset="uploads-$stamp.tar.gz"
    uploads_file="$work/$uploads_asset"
    tar -czf "$uploads_file" -C "$APP_DIR/uploads" .
    uploads_sha="$(sha256sum "$uploads_file" | awk '{print $1}')"
  fi

  manifest="$work/backup-manifest.json"
  jq -n \
    --arg client "$CLIENT_NAME" \
    --arg created "$(date -Iseconds)" \
    --arg owner "$GITHUB_OWNER" \
    --arg repo "$GITHUB_REPO" \
    --arg appTag "$app_tag" \
    --arg appAsset "$app_asset" \
    --arg appSha "$app_sha" \
    --arg dbName "$DB_NAME" \
    --arg dbUser "$DB_USER" \
    --arg dbAsset "$db_asset" \
    --arg dbSha "$db_sha" \
    --arg cfgAsset "$config_asset" \
    --arg cfgSha "$config_sha" \
    --arg upAsset "$uploads_asset" \
    --arg upSha "$uploads_sha" \
    '{format:1,client:$client,createdAt:$created,
      app:{owner:$owner,releaseRepo:$repo,tag:$appTag,asset:$appAsset,sha256:$appSha},
      database:{name:$dbName,schema:"shiny",runtimeUser:$dbUser,asset:$dbAsset,sha256:$dbSha}}
     + (if $cfgAsset!="" then {config:{asset:$cfgAsset,sha256:$cfgSha}} else {} end)
     + (if $upAsset!="" then {uploads:{asset:$upAsset,sha256:$upSha}} else {} end)' > "$manifest"

  # Crear backup-* como prerelease para NO desplazar releases/latest de la app.
  release_payload="$(jq -cn --arg tag "$tag" --arg name "$CLIENT_NAME backup $stamp" \
    '{tag_name:$tag,name:$name,body:"Respaldo automatico de continuidad.",draft:false,prerelease:true}')"
  if ! release_created="$(curl -fsS -X POST \
      -H 'Accept: application/vnd.github+json' \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      -H 'Content-Type: application/json' \
      -H 'User-Agent: Shiny-Backup-OneClick-R1' \
      --data "$release_payload" "$API/releases")"; then
    fail "GitHub rechazo crear $tag. El token instalado necesita permiso de escritura Contents en $GITHUB_REPO."
  fi

  upload_url="$(printf '%s' "$release_created" | jq -r '.upload_url // empty')"
  [[ -n "$upload_url" ]] || fail GITHUB_UPLOAD_URL_MISSING
  upload_base="${upload_url%%\{*}"

  upload_asset "$upload_base" "$manifest"
  upload_asset "$upload_base" "$db_file"
  [[ -n "$config_file" ]] && upload_asset "$upload_base" "$config_file"
  [[ -n "$uploads_file" ]] && upload_asset "$upload_base" "$uploads_file"

  cp -f "$manifest" "$BACKUPS/$tag-backup-manifest.json"
  jq -cn --arg tag "$tag" --arg created "$(date -Iseconds)" --arg repo "$GITHUB_OWNER/$GITHUB_REPO" \
    '{tag:$tag,createdAt:$created,repo:$repo}' > "$LAST_JSON"
  chmod 600 "$LAST_JSON"

  echo "[OK] BACKUP=$tag"
  echo "[OK] REPO=$GITHUB_OWNER/$GITHUB_REPO"
  echo "[OK] DATABASE=$DB_NAME"
}

case "${1:-status}" in
  status) status ;;
  backup) backup ;;
  *) fail 'USAGE status|backup' ;;
esac
'@
Write-Utf8NoBom $Agent $agentText
Ok 'shiny-backup-agent.sh actualizado al formato de restauradores R2.'

Step 'Asegurando provision del agente mediante npm postinstall'
$bootText = [IO.File]::ReadAllText($Bootstrap)
if($bootText -notmatch '/usr/local/lib/shiny-backup'){
    $anchor = "const result = spawnSync('/bin/bash', [script], {"
    if(-not $bootText.Contains($anchor)){ Fail 'No encontre ancla del bootstrap para provisionar agente backup.' }
    $block = @'
/* SHINY_BACKUP_ONE_CLICK_BOOTSTRAP_R1 */
function provisionBackupOneClickAgent() {
  const appDir = process.env.APP_DIR || '/opt/shiny/app';
  const appUser = process.env.APP_USER || 'shiny';
  const src = path.join(appDir, 'backend', 'scripts', 'shiny-backup-agent.sh');
  const dstDir = '/usr/local/lib/shiny-backup';
  const dst = path.join(dstDir, 'shiny-backup-agent.sh');
  const sudoers = '/etc/sudoers.d/shiny-backup';

  if (!fs.existsSync(src)) throw new Error(`Falta ${src}`);
  fs.mkdirSync(dstDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync('/var/lib/shiny-backup', { recursive: true, mode: 0o700 });
  fs.mkdirSync('/var/lib/shiny-backup/backups', { recursive: true, mode: 0o700 });
  fs.mkdirSync('/var/lib/shiny-backup/tmp', { recursive: true, mode: 0o700 });
  fs.copyFileSync(src, dst);
  fs.chmodSync(dst, 0o755);
  fs.writeFileSync(sudoers, `${appUser} ALL=(root) NOPASSWD: ${dst}\n`, { encoding: 'utf8', mode: 0o440 });
  fs.chmodSync(sudoers, 0o440);
  const check = spawnSync('/usr/sbin/visudo', ['-cf', sudoers], { stdio:'pipe', encoding:'utf8' });
  if ((check.status ?? 1) !== 0) {
    try { fs.unlinkSync(sudoers); } catch {}
    throw new Error(`sudoers invalido: ${(check.stderr || check.stdout || '').trim()}`);
  }
  out(`Backup one-click provisionado: ${dst}`);
}
try { provisionBackupOneClickAgent(); }
catch (error) { out(`ERROR backup one-click: ${error.message}`); process.exit(32); }

'@
    $bootText = $bootText.Replace($anchor,$block+$anchor)
    Write-Utf8NoBom $Bootstrap $bootText
    Ok 'Bootstrap ampliado para instalar el agente.'
}else{
    Ok 'Bootstrap ya provisiona /usr/local/lib/shiny-backup.'
}

Step 'Forzando npm_backend en el delta para ejecutar postinstall'
$pkgText = [IO.File]::ReadAllText($Pkg)
$property = 'shinyBackupOneClickVersion'
if($pkgText -match ('"'+[regex]::Escape($property)+'"\s*:\s*"[^"]*"')){
    $pkgText = [regex]::Replace($pkgText,('"'+[regex]::Escape($property)+'"\s*:\s*"[^"]*"'),('"'+$property+'": "'+$NewVersion+'"'),1)
}else{
    $lastBrace = $pkgText.LastIndexOf('}')
    if($lastBrace -lt 0){ Fail 'backend/package.json invalido.' }
    $before = $pkgText.Substring(0,$lastBrace).TrimEnd()
    $after = $pkgText.Substring($lastBrace)
    if($before.EndsWith(',')){
        $pkgText = $before + "`n  `"$property`": `"$NewVersion`"`n" + $after
    }else{
        $pkgText = $before + ",`n  `"$property`": `"$NewVersion`"`n" + $after
    }
}
Write-Utf8NoBom $Pkg $pkgText
try { $pkgCheck = Get-Content -LiteralPath $Pkg -Raw | ConvertFrom-Json } catch { Fail 'backend/package.json quedo invalido.' }
if([string]$pkgCheck.$property -ne $NewVersion){ Fail "No quedo $property=$NewVersion" }
$post = $pkgCheck.scripts.PSObject.Properties['postinstall']
if($null -eq $post -or -not ([string]$post.Value).Contains('shiny-rpi-system-bootstrap.cjs')){
    Fail 'backend/package.json no conserva postinstall de shiny-rpi-system-bootstrap.cjs.'
}
Ok "package.json fuerza npm_backend=true para $NewVersion."

Step 'Validando sintaxis'
& node --check $Route
if($LASTEXITCODE -ne 0){ Fail 'systemBackup.js invalido.' }
& node --check $Bootstrap
if($LASTEXITCODE -ne 0){ Fail 'shiny-rpi-system-bootstrap.cjs invalido.' }
if(Get-Command bash -ErrorAction SilentlyContinue){
    & bash -n $Agent
    if($LASTEXITCODE -ne 0){ Fail 'shiny-backup-agent.sh invalido.' }
}else{
    Warn 'bash no esta disponible en Windows; la sintaxis del agente se validara en Linux/RPi.'
}

Step 'Compilando frontend'
Push-Location (Join-Path $ProjectRoot 'frontend')
try {
    & npm run build
    if($LASTEXITCODE -ne 0){ Fail 'Frontend no compilo.' }
} finally { Pop-Location }
Ok 'Frontend compilado.'

Step 'Validando que la interfaz no conserve configuraciones manuales'
$panelCheck = [IO.File]::ReadAllText($Panel)
foreach($forbidden in @('Guardar configuración','Token GitHub','Clave privada','Crear respaldo local','Subir último','Crear + subir','Historial GitHub','Restaurar último')){
    if($panelCheck.Contains($forbidden)){ Fail "La interfaz todavia contiene: $forbidden" }
}
$buttonCount = ([regex]::Matches($panelCheck,'<button\b')).Count
if($buttonCount -ne 1){ Fail "SystemBackupPanel debe tener exactamente 1 button; detectados=$buttonCount" }
if($panelCheck -notmatch '>Respaldar<'){ Fail 'No encontre el boton Respaldar.' }
Ok 'Interfaz certificada: un solo boton Respaldar.'

Step 'Validando diff antes del commit'
& git diff --check
if($LASTEXITCODE -ne 0){ Fail 'git diff --check fallo.' }
$Intended = @(
  'backend/package.json',
  'backend/scripts/shiny-backup-agent.sh',
  'backend/scripts/shiny-rpi-system-bootstrap.cjs',
  'backend/src/routes/systemBackup.js',
  'frontend/src/components/SystemBackupPanel.jsx'
)
$changed = @(& git diff --name-only)
$unexpected = @($changed | Where-Object { $_ -notin $Intended })
if($unexpected.Count -gt 0){
    $unexpected | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Fail 'Aparecieron cambios fuera del alcance de esta actualizacion.'
}
if($changed.Count -eq 0){ Fail 'No se generaron cambios.' }
$changed | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }

Step "Creando commit de actualizacion $NewVersion"
& git add -- @($Intended)
if($LASTEXITCODE -ne 0){ Fail 'git add fallo.' }
& git commit -m "fix: make backup one-click and use client release repo"
if($LASTEXITCODE -ne 0){ Fail 'git commit fallo.' }
$NewHead = (& git rev-parse --short HEAD).Trim()
Ok "Commit: $NewHead"

Step "Publicando Release v$NewVersion por R5.2"
& $Publisher -Version $NewVersion -ReleaseRepo $ReleaseRepo -BaseVersion $BaseVersion
if($LASTEXITCODE -ne 0){ Fail "PUBLICAR-SHINY-RELEASE-R5.2.ps1 fallo para $NewVersion." }

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " ACTUALIZACION SHINY v$NewVersion PUBLICADA" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "Base              : $BaseVersion"
Write-Host "Nueva version     : $NewVersion"
Write-Host "Commit            : $NewHead"
Write-Host "Despliegue RPi    : Updater R4"
Write-Host "Interfaz          : un solo boton Respaldar"
Write-Host "Destino backups   : Shiny-Release"
Write-Host "Restauradores     : formato R2"
Write-Host ""
Write-Host "En la RPi NO ejecutes este archivo ni copies archivos manualmente." -ForegroundColor Yellow
Write-Host "Para instalar inmediatamente desde la RPi, usa SOLO el updater:" -ForegroundColor Yellow
Write-Host "  sudo /usr/local/lib/shiny-updater/shiny-update-agent.sh install" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Green
