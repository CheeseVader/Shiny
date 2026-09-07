#!/usr/bin/env bash
set -Eeuo pipefail
# SHINY_BACKUP_ONE_CLICK_AGENT_R137
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
for c in curl jq tar pg_dump psql runuser sha256sum python3 node; do need "$c"; done

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
DB_NAME="${DB_NAME:-${DB_DATABASE:-${PGDATABASE:-}}}"
DB_USER="${DB_USER:-${DB_USERNAME:-${PGUSER:-}}}"
DB_SCHEMA="${DB_SCHEMA:-}"

env_value(){
  local file="$1"; shift
  local key line value
  [[ -f "$file" ]] || return 0
  for key in "$@"; do
    line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 || true)"
    [[ -n "$line" ]] || continue
    value="${line#*=}"
    value="${value%$'\r'}"
    if [[ ${#value} -ge 2 && "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ ${#value} -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
    printf '%s' "$value"
    return 0
  done
  return 0
}

BACKEND_ENV="$APP_DIR/backend/.env"
[[ -n "$DB_NAME" ]] || DB_NAME="$(env_value "$BACKEND_ENV" DB_NAME DB_DATABASE PGDATABASE)"
[[ -n "$DB_USER" ]] || DB_USER="$(env_value "$BACKEND_ENV" DB_USER DB_USERNAME PGUSER)"
[[ -n "$DB_SCHEMA" ]] || DB_SCHEMA="$(env_value "$BACKEND_ENV" DB_SCHEMA)"
DB_SCHEMA="${DB_SCHEMA:-shiny}"

# Ultimo fallback: detectar la BD real en PostgreSQL sin inventar nombres.
if [[ -z "$DB_NAME" ]] && command -v runuser >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  if [[ -n "$DB_USER" ]]; then
    DB_USER_SQL="${DB_USER//\'/\'\'}"
    DB_NAME="$(runuser -u postgres -- psql -d postgres -Atqc \
      "SELECT d.datname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE r.rolname='${DB_USER_SQL}' AND d.datistemplate=false ORDER BY CASE WHEN d.datname='shiny_db' THEN 0 ELSE 1 END,d.datname LIMIT 1" \
      2>/dev/null || true)"
  fi
  if [[ -z "$DB_NAME" ]]; then
    DB_NAME="$(runuser -u postgres -- psql -d postgres -Atqc \
      "SELECT datname FROM pg_database WHERE datistemplate=false AND datname NOT IN ('postgres') ORDER BY CASE WHEN datname='shiny_db' THEN 0 ELSE 1 END,datname LIMIT 1" \
      2>/dev/null || true)"
  fi
fi

if [[ -z "$DB_USER" && -n "$DB_NAME" ]] && command -v runuser >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  DB_NAME_SQL="${DB_NAME//\'/\'\'}"
  DB_USER="$(runuser -u postgres -- psql -d postgres -Atqc \
    "SELECT r.rolname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname='${DB_NAME_SQL}' LIMIT 1" \
    2>/dev/null || true)"
fi

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
# El dump corre como postgres. ROOT/TMP permiten solo traversal al grupo postgres.
chown root:postgres "$ROOT" "$TMP" 2>/dev/null || true
chmod 0710 "$ROOT" "$TMP"
chown root:root "$BACKUPS" 2>/dev/null || true
chmod 0700 "$BACKUPS"

API="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"
api(){
  curl -fsS \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-OneClick-R133' "$@"
}

status(){
  local last=''
  if [[ -f "$LAST_JSON" ]]; then last="$(jq -r '.tag // empty' "$LAST_JSON" 2>/dev/null || true)"; fi
  jq -cn \
    --arg db "$DB_NAME" \
    --arg version "$VERSION" \
    --arg latest "$last" \
    '{configured:true,platform:"linux",db:$db,version:$version,latestBackup:$latest}'
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

# SHINY_BACKUP_WRITE_ACCESS_R137
# Regla:
#   1) probar PRIMERO la credencial que ya esta instalada;
#   2) si ya tiene escritura, NO ejecutar ninguna migracion;
#   3) solo si sigue siendo read-only, intentar la migracion cifrada R136.
#
# Esto corrige R136, que intentaba descifrar la migracion antes de comprobar
# si el token instalado ya habia sido actualizado directamente en GitHub.

current_repo_access_r137(){
  local probe code is_private can_push
  probe="$(mktemp "$TMP/access-r137-XXXXXX.json")"

  code="$(curl -sS -o "$probe" -w '%{http_code}' \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-OneClick-R137' \
    "$API" || true)"

  if [[ "$code" != "200" ]]; then
    rm -f "$probe"
    return 20
  fi

  is_private="$(jq -r '.private // false' "$probe")"
  can_push="$(jq -r '.permissions.push // false' "$probe")"
  rm -f "$probe"

  [[ "$is_private" == "true" ]] || return 21
  [[ "$can_push" == "true" ]] || return 22
  return 0
}

migrate_backup_credential_r137(){
  local asset_name release_json asset_url asset_id asset_file
  local new_token probe code can_push is_private tmpcfg

  # La migracion publicada en 1.0.36 permanece util aunque la app ya sea 1.0.37.
  asset_name="shiny-credential-migration-1.0.36.json"
  release_json="$(mktemp "$TMP/cred-r137-release-XXXXXX.json")"

  if ! api "$API/releases/tags/v1.0.36" > "$release_json"; then
    rm -f "$release_json"
    fail CREDENTIAL_MIGRATION_RELEASE_UNAVAILABLE
  fi

  asset_url="$(jq -r --arg n "$asset_name" '.assets[]? | select(.name==$n) | .url' "$release_json" | head -n1)"
  asset_id="$(jq -r --arg n "$asset_name" '.assets[]? | select(.name==$n) | .id' "$release_json" | head -n1)"

  [[ -n "$asset_url" && "$asset_url" != "null" ]] || {
    rm -f "$release_json"
    fail CREDENTIAL_MIGRATION_ASSET_MISSING
  }

  asset_file="$(mktemp "$TMP/cred-r137-XXXXXX.json")"
  if ! curl -fsSL \
      -H 'Accept: application/octet-stream' \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      "$asset_url" -o "$asset_file"; then
    rm -f "$release_json" "$asset_file"
    fail CREDENTIAL_MIGRATION_DOWNLOAD_FAILED
  fi

  if ! new_token="$(
    CURRENT_TOKEN="$GITHUB_TOKEN" EXPECTED_OWNER="$GITHUB_OWNER" EXPECTED_REPO="$GITHUB_REPO" \
    node - "$asset_file" <<'NODE'
const fs=require('fs');
const crypto=require('crypto');

try{
  const file=process.argv[2];
  const p=JSON.parse(fs.readFileSync(file,'utf8'));
  const oldToken=process.env.CURRENT_TOKEN||'';

  if(oldToken.length<20 || p.schema!==1 || p.cipher!=='AES-256-GCM') process.exit(2);

  const salt=Buffer.from(p.salt,'base64');
  const iv=Buffer.from(p.iv,'base64');
  const tag=Buffer.from(p.tag,'base64');
  const ct=Buffer.from(p.ciphertext,'base64');
  const key=crypto.pbkdf2Sync(Buffer.from(oldToken,'utf8'),salt,Number(p.iterations||150000),32,'sha256');

  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(ct),decipher.final()]);
  const data=JSON.parse(plain.toString('utf8'));

  if(data.version!=='1.0.36') process.exit(3);
  if(data.owner!==process.env.EXPECTED_OWNER || data.repo!==process.env.EXPECTED_REPO) process.exit(4);
  if(typeof data.token!=='string' || data.token.length<20) process.exit(5);

  process.stdout.write(data.token);
}catch{
  process.exit(6);
}
NODE
  )"; then
    rm -f "$release_json" "$asset_file"
    fail CREDENTIAL_MIGRATION_DECRYPT_FAILED
  fi

  probe="$(mktemp "$TMP/cred-r137-probe-XXXXXX.json")"
  code="$(curl -sS -o "$probe" -w '%{http_code}' \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $new_token" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-OneClick-R137' \
    "$API" || true)"

  [[ "$code" == "200" ]] || {
    rm -f "$release_json" "$asset_file" "$probe"
    unset new_token
    fail BACKUP_TOKEN_VALIDATION_FAILED
  }

  is_private="$(jq -r '.private // false' "$probe")"
  can_push="$(jq -r '.permissions.push // false' "$probe")"

  [[ "$is_private" == "true" ]] || {
    rm -f "$release_json" "$asset_file" "$probe"
    unset new_token
    fail BACKUP_REPO_MUST_BE_PRIVATE
  }
  [[ "$can_push" == "true" ]] || {
    rm -f "$release_json" "$asset_file" "$probe"
    unset new_token
    fail BACKUP_TOKEN_WRITE_REQUIRED
  }

  tmpcfg="$(mktemp)"
  NEW_TOKEN="$new_token" python3 - "$UPDATER_ENV" "$tmpcfg" <<'PYCFG'
from pathlib import Path
import os,sys

src=Path(sys.argv[1])
dst=Path(sys.argv[2])
new=os.environ.get('NEW_TOKEN','')
if len(new)<20:
    raise SystemExit(2)

lines=src.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n').splitlines()
out=[]
done=False
for line in lines:
    if line.startswith('GITHUB_TOKEN=') and not done:
        out.append('GITHUB_TOKEN='+new)
        done=True
    else:
        out.append(line)
if not done:
    out.append('GITHUB_TOKEN='+new)
dst.write_text('\n'.join(out)+'\n',encoding='utf-8',newline='\n')
PYCFG

  install -o root -g root -m 0600 "$tmpcfg" "$UPDATER_ENV"
  rm -f "$tmpcfg"

  # La operacion actual debe usar inmediatamente la credencial nueva.
  GITHUB_TOKEN="$new_token"

  printf '{"version":"1.0.37","migratedAt":"%s"}\n' "$(date -Iseconds)" > "$ROOT/credential-r137.done"
  chmod 0600 "$ROOT/credential-r137.done"

  # Asset de transporte de un solo uso: eliminarlo solo DESPUES de confirmar escritura.
  if [[ "$asset_id" =~ ^[0-9]+$ ]]; then
    curl -fsS -X DELETE \
      -H 'Accept: application/vnd.github+json' \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      "$API/releases/assets/$asset_id" >/dev/null 2>&1 || true
  fi

  rm -f "$release_json" "$asset_file" "$probe"
  unset new_token
}

ensure_backup_write_access_r137(){
  local rc=0

  # IMPORTANTE: si el token que YA esta instalado tiene write, continuar directo.
  if current_repo_access_r137; then
    return 0
  else
    rc=$?
  fi

  case "$rc" in
    20) fail BACKUP_STORAGE_UNAVAILABLE ;;
    21) fail BACKUP_REPO_MUST_BE_PRIVATE ;;
    22) ;;
    *) fail BACKUP_ACCESS_CHECK_FAILED ;;
  esac

  # Solo llegamos aqui cuando el token actual puede leer pero NO escribir.
  migrate_backup_credential_r137

  # Certificar nuevamente despues de la migracion.
  if current_repo_access_r137; then
    return 0
  else
    rc=$?
  fi

  case "$rc" in
    20) fail BACKUP_STORAGE_UNAVAILABLE ;;
    21) fail BACKUP_REPO_MUST_BE_PRIVATE ;;
    22) fail BACKUP_TOKEN_WRITE_REQUIRED ;;
    *) fail BACKUP_ACCESS_CHECK_FAILED ;;
  esac
}
backup(){
  ensure_backup_write_access_r137
  local stamp tag work db_asset db_file db_sha
  local app_tag app_asset app_manifest release_json app_manifest_url app_sha
  local config_asset='' config_file='' config_sha='' uploads_asset='' uploads_file='' uploads_sha=''
  local release_payload release_created upload_url upload_base manifest release_id

  stamp="$(date +%Y%m%d-%H%M%S)"
  tag="backup-$stamp"
  work="$(mktemp -d "$TMP/create-XXXXXX")"
  chown postgres:postgres "$work"
  trap 'rm -rf "$work" >/dev/null 2>&1 || true' EXIT

  # Confirmar acceso al repo y obtener la app exacta instalada.
  repo_meta="$work/repository.json"
  api "$API" > "$repo_meta" || fail BACKUP_STORAGE_UNAVAILABLE
  [[ "$(jq -r '.private // false' "$repo_meta")" == "true" ]] || fail BACKUP_REPO_MUST_BE_PRIVATE
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
      -H 'User-Agent: Shiny-Backup-OneClick-R133' \
      --data "$release_payload" "$API/releases")"; then
    fail BACKUP_RELEASE_CREATE_FAILED
  fi

  upload_url="$(printf '%s' "$release_created" | jq -r '.upload_url // empty')"
  [[ -n "$upload_url" ]] || fail GITHUB_UPLOAD_URL_MISSING
  upload_base="${upload_url%%\{*}"

  release_id="$(printf '%s' "$release_created" | jq -r '.id // empty')"
  [[ "$release_id" =~ ^[0-9]+$ ]] || fail GITHUB_RELEASE_ID_MISSING

  # Datos primero; manifest AL FINAL. Si algo falla, borrar prerelease parcial.
  if ! upload_asset "$upload_base" "$db_file"; then
    api -X DELETE "$API/releases/$release_id" >/dev/null 2>&1 || true
    fail BACKUP_UPLOAD_DATABASE_FAILED
  fi
  if [[ -n "$config_file" ]] && ! upload_asset "$upload_base" "$config_file"; then
    api -X DELETE "$API/releases/$release_id" >/dev/null 2>&1 || true
    fail BACKUP_UPLOAD_CONFIG_FAILED
  fi
  if [[ -n "$uploads_file" ]] && ! upload_asset "$upload_base" "$uploads_file"; then
    api -X DELETE "$API/releases/$release_id" >/dev/null 2>&1 || true
    fail BACKUP_UPLOAD_FILES_FAILED
  fi
  if ! upload_asset "$upload_base" "$manifest"; then
    api -X DELETE "$API/releases/$release_id" >/dev/null 2>&1 || true
    fail BACKUP_UPLOAD_MANIFEST_FAILED
  fi

  cp -f "$manifest" "$BACKUPS/$tag-backup-manifest.json"
  jq -cn --arg tag "$tag" --arg created "$(date -Iseconds)" --arg repo "$GITHUB_OWNER/$GITHUB_REPO" \
    '{tag:$tag,createdAt:$created,repo:$repo}' > "$LAST_JSON"
  chmod 600 "$LAST_JSON"

  echo "[OK] BACKUP=$tag"

  echo "[OK] DATABASE=$DB_NAME"
}

case "${1:-status}" in
  status) status ;;
  backup) backup ;;
  *) fail 'USAGE status|backup' ;;
esac