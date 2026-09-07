#!/usr/bin/env bash
set -Eeuo pipefail
# SHINY_BACKUP_ENGINE_CLEAN_R140
# SHINY_BACKUP_EXIT_CLEANUP_R141
# Motor de respaldo autocontenido.
# No imprime repositorio, owner, token ni secretos en status/respuestas.

UPDATER_ENV="${SHINY_UPDATER_CONFIG:-/etc/shiny-updater/updater.env}"
ROOT="${SHINY_BACKUP_ROOT:-/var/lib/shiny-backup}"
BACKUPS="$ROOT/backups"
TMP="$ROOT/tmp"
LAST_JSON="$ROOT/last-backup.json"
LAST_ERROR="$ROOT/last-error.json"

BKP_STAGE="INIT"
BKP_FAILED=0
BKP_WORKDIR=""

emit_error(){
  local code="${1:-UNSPECIFIED}"
  printf '[ERROR] BKP_STAGE=%s\n' "${BKP_STAGE:-UNKNOWN}" >&2
  printf '[ERROR] BKP_CODE=%s\n' "$code" >&2
}

fail(){
  local code="${1:-BACKUP_FAILED}"
  BKP_FAILED=1
  emit_error "$code"
  exit 1
}

on_err(){
  local rc=$?
  if [[ "${BKP_FAILED:-0}" != "1" ]]; then
    if declare -F write_last_error >/dev/null 2>&1; then
      write_last_error "${BKP_STAGE:-UNKNOWN}" "UNEXPECTED_RC_${rc}" || true
    fi
    emit_error "UNEXPECTED_RC_${rc}"
  fi
  exit "$rc"
}
trap on_err ERR

cleanup_workdir(){
  local d="${BKP_WORKDIR:-}"
  if [[ -n "$d" && -d "$d" ]]; then
    rm -rf -- "$d" >/dev/null 2>&1 || true
  fi
}
trap cleanup_workdir EXIT

need(){ command -v "$1" >/dev/null 2>&1 || fail "MISSING_${1^^}"; }

[[ $EUID -eq 0 ]] || fail ROOT_REQUIRED
[[ -f "$UPDATER_ENV" ]] || fail UPDATER_CONFIG_MISSING

# R1.40: NO ejecutar updater.env como shell. Solo leer claves conocidas.
# Esto evita que una linea mal formada en el archivo de configuracion produzca
# un error de parseo antes de que el agente pueda emitir BKP_STAGE/BKP_CODE.
cfg_value(){
  local key="$1" line value
  line="$(grep -m1 -E "^${key}=" "$UPDATER_ENV" 2>/dev/null || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ ${#value} -ge 2 && "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:${#value}-2}"
  elif [[ ${#value} -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

BKP_STAGE="CONFIG_LOAD"
GITHUB_OWNER="$(cfg_value GITHUB_OWNER)"
GITHUB_REPO="$(cfg_value GITHUB_REPO)"
GITHUB_TOKEN="$(cfg_value GITHUB_TOKEN)"
APP_DIR="$(cfg_value APP_DIR)"
CLIENT_NAME="$(cfg_value CLIENT_NAME)"
CLIENT_SLUG="$(cfg_value CLIENT_SLUG)"
DB_NAME="$(cfg_value DB_NAME)"
[[ -n "$DB_NAME" ]] || DB_NAME="$(cfg_value DB_DATABASE)"
[[ -n "$DB_NAME" ]] || DB_NAME="$(cfg_value PGDATABASE)"
DB_USER="$(cfg_value DB_USER)"
[[ -n "$DB_USER" ]] || DB_USER="$(cfg_value DB_USERNAME)"
[[ -n "$DB_USER" ]] || DB_USER="$(cfg_value PGUSER)"
DB_SCHEMA="$(cfg_value DB_SCHEMA)"
APP_DIR="${APP_DIR:-/opt/shiny/app}"

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
}

BACKEND_ENV="$APP_DIR/backend/.env"
[[ -n "$DB_NAME" ]] || DB_NAME="$(env_value "$BACKEND_ENV" DB_NAME DB_DATABASE PGDATABASE)"
[[ -n "$DB_USER" ]] || DB_USER="$(env_value "$BACKEND_ENV" DB_USER DB_USERNAME PGUSER)"
[[ -n "$DB_SCHEMA" ]] || DB_SCHEMA="$(env_value "$BACKEND_ENV" DB_SCHEMA)"
DB_SCHEMA="${DB_SCHEMA:-shiny}"

BKP_STAGE="CONFIG_VALIDATE"
[[ -n "$GITHUB_OWNER" ]] || fail GITHUB_OWNER_NOT_CONFIGURED
[[ -n "$GITHUB_REPO" ]] || fail GITHUB_REPO_NOT_CONFIGURED
[[ -n "$GITHUB_TOKEN" ]] || fail GITHUB_TOKEN_NOT_CONFIGURED
[[ -d "$APP_DIR" ]] || fail APP_DIR_MISSING
[[ -f "$APP_DIR/VERSION" ]] || fail VERSION_FILE_MISSING

VERSION="$(tr -d '\r\n ' < "$APP_DIR/VERSION")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail VERSION_INVALID
[[ "$GITHUB_REPO" == *-Release ]] || fail RELEASE_REPO_INVALID

if [[ -z "$CLIENT_NAME" ]]; then CLIENT_NAME="${GITHUB_REPO%-Release}"; fi
if [[ -z "$CLIENT_SLUG" ]]; then
  CLIENT_SLUG="$(printf '%s' "$CLIENT_NAME" | sed -E 's/([a-z0-9])([A-Z])/\1_\2/g;s/[^A-Za-z0-9]+/_/g;s/^_+//;s/_+$//' | tr '[:upper:]' '[:lower:]')"
fi
DB_USER="${DB_USER:-${CLIENT_SLUG}_app}"

mkdir -p "$ROOT" "$BACKUPS" "$TMP"
chown root:postgres "$ROOT" "$TMP" 2>/dev/null || true
chmod 0710 "$ROOT" "$TMP"
chown root:root "$BACKUPS" 2>/dev/null || true
chmod 0700 "$BACKUPS"

API="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"

write_last_error(){
  local stage="${1:-UNKNOWN}" code="${2:-UNKNOWN}"
  jq -cn --arg stage "$stage" --arg code "$code" --arg at "$(date -Iseconds)" \
    '{stage:$stage,code:$code,at:$at}' > "$LAST_ERROR.tmp" 2>/dev/null || return 0
  chmod 0600 "$LAST_ERROR.tmp" 2>/dev/null || true
  mv -f "$LAST_ERROR.tmp" "$LAST_ERROR" 2>/dev/null || true
}

fail_stage(){
  local code="${1:-BACKUP_FAILED}"
  write_last_error "${BKP_STAGE:-UNKNOWN}" "$code"
  fail "$code"
}

gh_json(){
  local method="$1" url="$2" output="$3" body="${4:-}"
  local code args
  args=(-sS -o "$output" -w '%{http_code}' -X "$method"
    -H 'Accept: application/vnd.github+json'
    -H "Authorization: Bearer $GITHUB_TOKEN"
    -H 'X-GitHub-Api-Version: 2022-11-28'
    -H 'User-Agent: Shiny-Backup-Engine-Clean-R1')
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  code="$(curl "${args[@]}" "$url" || true)"
  printf '%s' "$code"
}

download_asset(){
  local url="$1" output="$2" code
  code="$(curl -sS -L -o "$output" -w '%{http_code}' \
    -H 'Accept: application/octet-stream' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-Engine-Clean-R1' \
    "$url" || true)"
  [[ "$code" == "200" ]]
}

upload_asset(){
  local upload_base="$1" file="$2" name encoded code body
  name="$(basename "$file")"
  encoded="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$name")"
  body="$(mktemp "$TMP/upload-response-XXXXXX.json")"
  code="$(curl -sS -o "$body" -w '%{http_code}' -X POST \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'Content-Type: application/octet-stream' \
    -H 'User-Agent: Shiny-Backup-Engine-Clean-R1' \
    --data-binary "@$file" \
    "${upload_base}?name=${encoded}" || true)"
  rm -f "$body"
  [[ "$code" == "201" ]]
}

delete_remote_release(){
  local release_id="${1:-}" tag="${2:-}"
  [[ "$release_id" =~ ^[0-9]+$ ]] || return 0
  curl -fsS -X DELETE \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-Engine-Clean-R1' \
    "$API/releases/$release_id" >/dev/null 2>&1 || true
  if [[ -n "$tag" ]]; then
    curl -fsS -X DELETE \
      -H 'Accept: application/vnd.github+json' \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      -H 'User-Agent: Shiny-Backup-Engine-Clean-R1' \
      "$API/git/refs/tags/$tag" >/dev/null 2>&1 || true
  fi
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

archive_paths(){
  local output="$1"; shift
  local tries=0
  while (( tries < 2 )); do
    rm -f "$output"
    if tar -czf "$output" -C "$APP_DIR" "$@" 2>/dev/null; then return 0; fi
    tries=$((tries+1))
    sleep 1
  done
  return 1
}

backup(){
  local stamp tag work db_asset db_file db_sha
  local app_tag app_asset app_manifest release_json app_manifest_url app_sha
  local config_asset='' config_file='' config_sha='' uploads_asset='' uploads_file='' uploads_sha=''
  local manifest release_payload release_body release_code release_id upload_url upload_base
  local repo_body repo_code app_code
  local -a cfg_paths=()

  BKP_STAGE="DEPENDENCIES"
  for c in curl jq tar pg_dump psql runuser sha256sum python3; do need "$c"; done

  BKP_STAGE="DATABASE_IDENTITY"
  if [[ -z "$DB_NAME" ]]; then
    DB_NAME="$(runuser -u postgres -- psql -d postgres -Atqc \
      "SELECT datname FROM pg_database WHERE datistemplate=false AND datname NOT IN ('postgres') ORDER BY CASE WHEN datname='shiny_db' THEN 0 ELSE 1 END,datname LIMIT 1" \
      2>/dev/null || true)"
  fi
  [[ -n "$DB_NAME" ]] || fail_stage DB_NAME_NOT_CONFIGURED
  [[ "$DB_SCHEMA" == "shiny" ]] || fail_stage DB_SCHEMA_UNEXPECTED

  stamp="$(date +%Y%m%d-%H%M%S)"
  tag="backup-${stamp}-$RANDOM"

  BKP_STAGE="WORKDIR"
  work="$(mktemp -d "$TMP/create-XXXXXX")" || fail_stage WORKDIR_CREATE_FAILED
  chown root:postgres "$work" || fail_stage WORKDIR_CHOWN_FAILED
  chmod 0770 "$work" || fail_stage WORKDIR_CHMOD_FAILED
  BKP_WORKDIR="$work"

  BKP_STAGE="REPOSITORY_ACCESS"
  repo_body="$work/repository.json"
  repo_code="$(gh_json GET "$API" "$repo_body")"
  [[ "$repo_code" == "200" ]] || fail_stage REPOSITORY_HTTP_FAILED
  [[ "$(jq -r '.private // false' "$repo_body" 2>/dev/null)" == "true" ]] || fail_stage REPOSITORY_NOT_PRIVATE

  BKP_STAGE="APP_RELEASE"
  app_tag="v$VERSION"
  release_json="$work/app-release.json"
  app_code="$(gh_json GET "$API/releases/tags/$app_tag" "$release_json")"
  [[ "$app_code" == "200" ]] || fail_stage APP_RELEASE_NOT_FOUND

  app_asset="shiny-rpi-$VERSION.tar.gz"
  jq -e --arg n "$app_asset" '.assets[]? | select(.name==$n)' "$release_json" >/dev/null 2>&1 \
    || fail_stage APP_PACKAGE_ASSET_MISSING

  app_manifest="manifest-$VERSION.json"
  app_manifest_url="$(jq -r --arg n "$app_manifest" '.assets[]? | select(.name==$n) | .url' "$release_json" | head -n1)"
  [[ -n "$app_manifest_url" && "$app_manifest_url" != "null" ]] || fail_stage APP_MANIFEST_ASSET_MISSING

  BKP_STAGE="APP_MANIFEST_DOWNLOAD"
  download_asset "$app_manifest_url" "$work/$app_manifest" || fail_stage APP_MANIFEST_DOWNLOAD_FAILED
  app_sha="$(jq -r '.sha256 // empty' "$work/$app_manifest" 2>/dev/null || true)"
  [[ "$app_sha" =~ ^[A-Fa-f0-9]{64}$ ]] || fail_stage APP_MANIFEST_SHA_INVALID

  BKP_STAGE="DATABASE_DUMP"
  db_asset="${DB_NAME}-${stamp}.dump"
  db_file="$work/$db_asset"
  runuser -u postgres -- pg_dump -Fc --no-owner --no-privileges -d "$DB_NAME" -f "$db_file" \
    || fail_stage PG_DUMP_FAILED
  chown root:root "$db_file" || fail_stage DB_DUMP_CHOWN_FAILED
  chmod 0600 "$db_file" || fail_stage DB_DUMP_CHMOD_FAILED
  db_sha="$(sha256sum "$db_file" | awk '{print $1}')" || fail_stage DB_DUMP_SHA_FAILED
  [[ "$db_sha" =~ ^[A-Fa-f0-9]{64}$ ]] || fail_stage DB_DUMP_SHA_INVALID

  BKP_STAGE="CONFIG_ARCHIVE"
  for p in \
    config/instance.json config/instance.local.json brand.config.json frontend/public/brand.config.json \
    backend/uploads frontend/public/uploads; do
    [[ -e "$APP_DIR/$p" ]] && cfg_paths+=("$p")
  done
  if [[ ${#cfg_paths[@]} -gt 0 ]]; then
    config_asset="client-config-$stamp.tar.gz"
    config_file="$work/$config_asset"
    archive_paths "$config_file" "${cfg_paths[@]}" || fail_stage CONFIG_ARCHIVE_FAILED
    config_sha="$(sha256sum "$config_file" | awk '{print $1}')" || fail_stage CONFIG_SHA_FAILED
  fi

  BKP_STAGE="UPLOADS_ARCHIVE"
  if [[ -d "$APP_DIR/uploads" && -n "$(find "$APP_DIR/uploads" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    uploads_asset="uploads-$stamp.tar.gz"
    uploads_file="$work/$uploads_asset"
    if ! tar -czf "$uploads_file" -C "$APP_DIR/uploads" . 2>/dev/null; then
      sleep 1
      tar -czf "$uploads_file" -C "$APP_DIR/uploads" . 2>/dev/null || fail_stage UPLOADS_ARCHIVE_FAILED
    fi
    uploads_sha="$(sha256sum "$uploads_file" | awk '{print $1}')" || fail_stage UPLOADS_SHA_FAILED
  fi

  BKP_STAGE="MANIFEST_BUILD"
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
    --arg dbSchema "$DB_SCHEMA" \
    --arg dbAsset "$db_asset" \
    --arg dbSha "$db_sha" \
    --arg cfgAsset "$config_asset" \
    --arg cfgSha "$config_sha" \
    --arg upAsset "$uploads_asset" \
    --arg upSha "$uploads_sha" \
    '{format:1,client:$client,createdAt:$created,
      app:{owner:$owner,releaseRepo:$repo,tag:$appTag,asset:$appAsset,sha256:$appSha},
      database:{name:$dbName,schema:$dbSchema,runtimeUser:$dbUser,asset:$dbAsset,sha256:$dbSha}}
     + (if $cfgAsset!="" then {config:{asset:$cfgAsset,sha256:$cfgSha}} else {} end)
     + (if $upAsset!="" then {uploads:{asset:$upAsset,sha256:$upSha}} else {} end)' > "$manifest" \
    || fail_stage MANIFEST_BUILD_FAILED
  jq -e '.format==1 and .app.sha256 and .database.sha256' "$manifest" >/dev/null 2>&1 \
    || fail_stage MANIFEST_VALIDATION_FAILED

  BKP_STAGE="RELEASE_CREATE"
  release_payload="$(jq -cn --arg tag "$tag" --arg name "$CLIENT_NAME backup $stamp" \
    '{tag_name:$tag,name:$name,body:"Respaldo automatico de continuidad.",draft:false,prerelease:true}')" \
    || fail_stage RELEASE_PAYLOAD_FAILED
  release_body="$work/release-created.json"
  release_code="$(gh_json POST "$API/releases" "$release_body" "$release_payload")"
  case "$release_code" in
    201) ;;
    401|403) fail_stage RELEASE_AUTH_WRITE_REQUIRED ;;
    422) fail_stage RELEASE_VALIDATION_FAILED ;;
    *) fail_stage RELEASE_CREATE_HTTP_FAILED ;;
  esac

  release_id="$(jq -r '.id // empty' "$release_body" 2>/dev/null || true)"
  upload_url="$(jq -r '.upload_url // empty' "$release_body" 2>/dev/null || true)"
  [[ "$release_id" =~ ^[0-9]+$ ]] || fail_stage RELEASE_ID_MISSING
  [[ -n "$upload_url" && "$upload_url" != "null" ]] || {
    delete_remote_release "$release_id" "$tag"
    fail_stage RELEASE_UPLOAD_URL_MISSING
  }
  upload_base="${upload_url%%\{*}"

  BKP_STAGE="UPLOAD_DATABASE"
  if ! upload_asset "$upload_base" "$db_file"; then
    delete_remote_release "$release_id" "$tag"
    fail_stage UPLOAD_DATABASE_FAILED
  fi

  if [[ -n "$config_file" ]]; then
    BKP_STAGE="UPLOAD_CONFIG"
    if ! upload_asset "$upload_base" "$config_file"; then
      delete_remote_release "$release_id" "$tag"
      fail_stage UPLOAD_CONFIG_FAILED
    fi
  fi

  if [[ -n "$uploads_file" ]]; then
    BKP_STAGE="UPLOAD_FILES"
    if ! upload_asset "$upload_base" "$uploads_file"; then
      delete_remote_release "$release_id" "$tag"
      fail_stage UPLOAD_FILES_FAILED
    fi
  fi

  BKP_STAGE="UPLOAD_MANIFEST"
  if ! upload_asset "$upload_base" "$manifest"; then
    delete_remote_release "$release_id" "$tag"
    fail_stage UPLOAD_MANIFEST_FAILED
  fi

  BKP_STAGE="FINALIZE"
  cp -f "$manifest" "$BACKUPS/$tag-backup-manifest.json" || fail_stage LOCAL_MANIFEST_COPY_FAILED
  jq -cn --arg tag "$tag" --arg created "$(date -Iseconds)" \
    '{tag:$tag,createdAt:$created}' > "$LAST_JSON.tmp" || fail_stage LAST_STATE_BUILD_FAILED
  chmod 0600 "$LAST_JSON.tmp" || fail_stage LAST_STATE_CHMOD_FAILED
  mv -f "$LAST_JSON.tmp" "$LAST_JSON" || fail_stage LAST_STATE_SAVE_FAILED
  rm -f "$LAST_ERROR" 2>/dev/null || true

  BKP_STAGE="DONE"
  echo "[OK] BACKUP=$tag"
  echo "[OK] DATABASE=$DB_NAME"
}

case "${1:-status}" in
  status) status ;;
  backup) backup ;;
  *) fail USAGE_STATUS_OR_BACKUP ;;
esac
