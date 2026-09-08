#!/usr/bin/env bash
set -Eeuo pipefail
# SHINY_BACKUP_ENGINE_CANONICAL_R5_EXACT
# Unico contrato publico: status | backup
# Backup compatible con RESTAURAR R2/R3:
# backup-manifest.json con format:1 y esquema obligatorio completo.

UPDATER_ENV="${SHINY_UPDATER_ENV:-/etc/shiny-updater/updater.env}"
ROOT="${SHINY_BACKUP_ROOT:-/var/lib/shiny-backup}"
BACKUPS="$ROOT/backups"
TMP="$ROOT/tmp"
LAST_JSON="$ROOT/last-backup.json"
LAST_ERROR="$ROOT/last-error.json"

BKP_STAGE="INIT"
BKP_FAILED=0

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
    emit_error "UNEXPECTED_RC_${rc}"
  fi
  exit "$rc"
}
trap on_err ERR

need(){ command -v "$1" >/dev/null 2>&1 || fail "MISSING_${1^^}"; }

[[ $EUID -eq 0 ]] || fail ROOT_REQUIRED
[[ -f "$UPDATER_ENV" ]] || fail UPDATER_CONFIG_MISSING

cfg(){
  local key="$1" line value
  line="$(grep -m1 -E "^[[:space:]]*${key}=" "$UPDATER_ENV" 2>/dev/null || true)"
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

envv(){
  local file="$1"; shift
  local key line value
  [[ -f "$file" ]] || return 0
  for key in "$@"; do
    line="$(grep -m1 -E "^[[:space:]]*${key}=" "$file" 2>/dev/null || true)"
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

GITHUB_OWNER="$(cfg GITHUB_OWNER)"
GITHUB_REPO="$(cfg GITHUB_REPO)"
GITHUB_TOKEN="$(cfg GITHUB_TOKEN)"
APP_DIR="$(cfg APP_DIR)"
CLIENT_NAME="$(cfg CLIENT_NAME)"
CLIENT_SLUG="$(cfg CLIENT_SLUG)"
DB_NAME="$(cfg DB_NAME)"
[[ -n "$DB_NAME" ]] || DB_NAME="$(cfg DB_DATABASE)"
[[ -n "$DB_NAME" ]] || DB_NAME="$(cfg PGDATABASE)"
DB_USER="$(cfg DB_USER)"
[[ -n "$DB_USER" ]] || DB_USER="$(cfg DB_USERNAME)"
[[ -n "$DB_USER" ]] || DB_USER="$(cfg PGUSER)"
DB_SCHEMA="$(cfg DB_SCHEMA)"

APP_DIR="${APP_DIR:-/opt/shiny/app}"
DB_SCHEMA="${DB_SCHEMA:-shiny}"

BACKEND_ENV="$APP_DIR/backend/.env"
[[ -n "$DB_NAME" ]] || DB_NAME="$(envv "$BACKEND_ENV" DB_NAME DB_DATABASE PGDATABASE)"
[[ -n "$DB_USER" ]] || DB_USER="$(envv "$BACKEND_ENV" DB_USER DB_USERNAME PGUSER)"
[[ -n "$DB_SCHEMA" ]] || DB_SCHEMA="$(envv "$BACKEND_ENV" DB_SCHEMA)"
DB_SCHEMA="${DB_SCHEMA:-shiny}"

[[ -n "$GITHUB_OWNER" ]] || fail GITHUB_OWNER_NOT_CONFIGURED
[[ -n "$GITHUB_REPO" ]] || fail GITHUB_REPO_NOT_CONFIGURED
[[ -n "$GITHUB_TOKEN" ]] || fail GITHUB_TOKEN_NOT_CONFIGURED
[[ "$GITHUB_REPO" == *-Release ]] || fail RELEASE_REPO_INVALID
[[ -d "$APP_DIR" ]] || fail APP_DIR_MISSING
[[ -f "$APP_DIR/VERSION" ]] || fail VERSION_FILE_MISSING

VERSION="$(tr -d '\r\n ' < "$APP_DIR/VERSION")"
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail VERSION_INVALID

[[ -n "$CLIENT_NAME" ]] || CLIENT_NAME="${GITHUB_REPO%-Release}"
if [[ -z "$CLIENT_SLUG" ]]; then
  CLIENT_SLUG="$(printf '%s' "$CLIENT_NAME" |
    sed -E 's/([a-z0-9])([A-Z])/\1_\2/g;s/[^A-Za-z0-9]+/_/g;s/^_+//;s/_+$//' |
    tr '[:upper:]' '[:lower:]')"
fi

# Si DB no viene en updater.env, descubrirla de PostgreSQL.
if [[ -z "$DB_NAME" ]]; then
  DB_NAME="$(runuser -u postgres -- psql -d postgres -Atqc \
    "SELECT datname FROM pg_database
     WHERE datistemplate=false AND datname NOT IN ('postgres')
     ORDER BY CASE WHEN datname='shiny_db' THEN 0 ELSE 1 END, datname LIMIT 1" 2>/dev/null || true)"
fi
[[ -n "$DB_NAME" ]] || fail DB_NAME_NOT_CONFIGURED

if [[ -z "$DB_USER" ]]; then
  DB_USER="$(runuser -u postgres -- psql -d postgres -Atqc \
    "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='${DB_NAME//\'/\'\'}'" 2>/dev/null || true)"
fi
[[ -n "$DB_USER" ]] || DB_USER="${CLIENT_SLUG}_app"

prepare_storage(){
  install -d -o root     -g postgres -m 0710 "$ROOT"
  install -d -o root     -g root     -m 0700 "$BACKUPS"
  install -d -o postgres -g postgres -m 0700 "$TMP"
}

prepare_storage

API="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"

gh_json(){
  local method="$1" url="$2" output="$3" body="${4:-}" code
  local -a args
  args=(-sS -o "$output" -w '%{http_code}' -X "$method"
    -H 'Accept: application/vnd.github+json'
    -H "Authorization: Bearer $GITHUB_TOKEN"
    -H 'X-GitHub-Api-Version: 2022-11-28'
    -H 'User-Agent: Shiny-Backup-R5')
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  code="$(curl "${args[@]}" "$url" || true)"
  printf '%s' "$code"
}

asset_url(){
  local release_json="$1" name="$2"
  jq -r --arg n "$name" '.assets[]? | select(.name==$n) | .url' "$release_json" | head -n1
}

download_asset(){
  local release_json="$1" name="$2" output="$3" url code
  url="$(asset_url "$release_json" "$name")"
  [[ -n "$url" && "$url" != "null" ]] || return 1
  code="$(curl -sS -L -o "$output" -w '%{http_code}' \
    -H 'Accept: application/octet-stream' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-R5' "$url" || true)"
  [[ "$code" == "200" ]]
}

upload_asset(){
  local upload_base="$1" file="$2" name encoded body code
  name="$(basename "$file")"
  encoded="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$name")"
  body="$(mktemp "$TMP/upload-response-XXXXXX.json")"
  code="$(curl -sS -o "$body" -w '%{http_code}' -X POST \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'Content-Type: application/octet-stream' \
    -H 'User-Agent: Shiny-Backup-R5' \
    --data-binary "@$file" "${upload_base}?name=${encoded}" || true)"
  rm -f "$body"
  [[ "$code" == "201" ]]
}

delete_release(){
  local id="${1:-}" tag="${2:-}"
  [[ "$id" =~ ^[0-9]+$ ]] || return 0
  curl -fsS -X DELETE \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: Shiny-Backup-R5' \
    "$API/releases/$id" >/dev/null 2>&1 || true
  if [[ -n "$tag" ]]; then
    curl -fsS -X DELETE \
      -H 'Accept: application/vnd.github+json' \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      -H 'User-Agent: Shiny-Backup-R5' \
      "$API/git/refs/tags/$tag" >/dev/null 2>&1 || true
  fi
}

status(){
  jq -cn \
    --arg db "$DB_NAME" \
    --arg user "$DB_USER" \
    --arg schema "$DB_SCHEMA" \
    --arg version "$VERSION" \
    --arg latest "$(jq -r '.tag // empty' "$LAST_JSON" 2>/dev/null || true)" \
    '{configured:true,engine:"R5-EXACT",format:1,db:$db,dbUser:$user,schema:$schema,version:$version,latestBackup:$latest}'
}

backup(){
  local work stamp tag repo_body repo_code
  local app_tag app_asset app_manifest release_json app_sha
  local db_asset db_file db_sha
  local config_asset="" config_file="" config_sha=""
  local uploads_asset="" uploads_file="" uploads_sha=""
  local manifest release_payload release_body release_code release_id upload_url upload_base
  local -a cfg_paths=()

  BKP_STAGE="DEPENDENCIES"
  for c in curl jq tar pg_dump psql runuser sha256sum python3; do need "$c"; done

  BKP_STAGE="STORAGE"
  prepare_storage

  # PRUEBA REAL como postgres antes del dump.
  local probe
  probe="$(mktemp -d "$TMP/probe-XXXXXX")"
  chown postgres:postgres "$probe"
  runuser -u postgres -- sh -c "printf ok > '$probe/test'" || fail POSTGRES_TMP_WRITE_FAILED
  [[ "$(cat "$probe/test")" == "ok" ]] || fail POSTGRES_TMP_WRITE_FAILED
  rm -rf "$probe"

  BKP_STAGE="REPOSITORY_ACCESS"
  repo_body="$(mktemp "$TMP/repo-XXXXXX.json")"
  repo_code="$(gh_json GET "$API" "$repo_body")"
  [[ "$repo_code" == "200" ]] || fail REPOSITORY_HTTP_FAILED
  [[ "$(jq -r '.private // false' "$repo_body")" == "true" ]] || fail REPOSITORY_NOT_PRIVATE
  rm -f "$repo_body"

  stamp="$(date +%Y%m%d-%H%M%S)"
  tag="backup-${stamp}-${RANDOM}"

  BKP_STAGE="WORKDIR"
  work="$(mktemp -d "$TMP/create-XXXXXX")"
  chown postgres:postgres "$work"
  chmod 0700 "$work"
  trap '[[ -n "${work:-}" ]] && rm -rf "$work" 2>/dev/null || true' EXIT

  BKP_STAGE="APP_RELEASE"
  app_tag="v$VERSION"
  release_json="$work/app-release.json"
  [[ "$(gh_json GET "$API/releases/tags/$app_tag" "$release_json")" == "200" ]] \
    || fail "APP_RELEASE_NOT_FOUND_${app_tag}"

  app_asset="shiny-rpi-$VERSION.tar.gz"
  if ! jq -e --arg n "$app_asset" '.assets[]? | select(.name==$n)' "$release_json" >/dev/null; then
    app_asset="$(jq -r '[.assets[].name | select(endswith(".tar.gz"))][0] // empty' "$release_json")"
  fi
  [[ -n "$app_asset" ]] || fail APP_PACKAGE_ASSET_MISSING

  # El SHA de la app se obtiene del manifest de la release si existe.
  app_manifest="manifest-$VERSION.json"
  if jq -e --arg n "$app_manifest" '.assets[]? | select(.name==$n)' "$release_json" >/dev/null; then
    download_asset "$release_json" "$app_manifest" "$work/$app_manifest" || fail APP_MANIFEST_DOWNLOAD_FAILED
    app_sha="$(jq -r '.sha256 // empty' "$work/$app_manifest" | tr 'A-F' 'a-f')"
  else
    # Fallback seguro: descargar el TAR y calcular su hash.
    download_asset "$release_json" "$app_asset" "$work/$app_asset" || fail APP_PACKAGE_DOWNLOAD_FAILED
    app_sha="$(sha256sum "$work/$app_asset" | awk '{print tolower($1)}')"
    rm -f "$work/$app_asset"
  fi
  [[ "$app_sha" =~ ^[0-9a-f]{64}$ ]] || fail APP_SHA_INVALID

  BKP_STAGE="ACTIVE_DATABASE_IDENTITY"
  # RESTAURACION != CLONACION: el backup debe salir de la MISMA BD que usa el backend.
  # Si .env declara otra BD, se aborta antes de producir un respaldo engañoso.
  if [[ -f "$APP_DIR/backend/.env" ]]; then
    runtime_db="$(sed -nE 's/^[[:space:]]*(PGDATABASE|DB_NAME)[[:space:]]*=[[:space:]]*["'\'']?([^"'\'']+)["'\'']?[[:space:]]*$/\2/p' "$APP_DIR/backend/.env" | tail -n1 || true)"
    if [[ -n "${runtime_db:-}" && "$runtime_db" != "$DB_NAME" ]]; then
      fail "ACTIVE_DB_MISMATCH_runtime_${runtime_db}_backup_${DB_NAME}"
    fi
  fi
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -tAc \
    "SELECT current_database();" | grep -qx "$DB_NAME" || fail ACTIVE_DB_NOT_REACHABLE

  BKP_STAGE="SOURCE_TABLE_COUNTS"
  source_counts="$work/source-table-counts.json"
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -At <<'SQLCOUNTS' > "$work/source-counts.tsv"
SELECT format('%I.%I', schemaname, tablename) || E'\t' ||
       (xpath('/row/c/text()', query_to_xml(
          format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename),
          false, true, ''
        )))[1]::text
FROM pg_tables
WHERE schemaname='shiny'
ORDER BY tablename;
SQLCOUNTS
  python3 - "$work/source-counts.tsv" "$source_counts" <<'PYCOUNTS'
import json,sys
src,out=sys.argv[1:3]
d={}
for line in open(src,encoding='utf-8'):
    line=line.rstrip('\n')
    if not line: continue
    k,v=line.split('\t',1)
    v=v.replace('<c>','').replace('</c>','').strip()
    d[k]=int(v)
json.dump(d,open(out,'w',encoding='utf-8'),sort_keys=True,separators=(',',':'))
PYCOUNTS
  [[ -s "$source_counts" ]] || fail SOURCE_TABLE_COUNTS_EMPTY

  BKP_STAGE="DATABASE_DUMP"
  db_asset="${DB_NAME}-${stamp}.dump"
  db_file="$work/$db_asset"
  runuser -u postgres -- pg_dump -Fc --no-owner --no-privileges \
    -d "$DB_NAME" -f "$db_file" || fail PG_DUMP_FAILED
  # El dump se crea como postgres y la certificacion tambien se ejecuta como postgres.
  # No cambiarlo a root:root antes de VERIFY_DUMP_BY_RESTORE: eso provoca Permission denied.
  chown postgres:postgres "$db_file"
  chmod 0600 "$db_file"
  db_sha="$(sha256sum "$db_file" | awk '{print tolower($1)}')"
  [[ "$db_sha" =~ ^[0-9a-f]{64}$ ]] || fail DB_SHA_INVALID

  BKP_STAGE="VERIFY_DUMP_BY_RESTORE"
  # Certificación fuerte: restaurar el dump en una BD temporal y comparar
  # TODAS las tablas del schema shiny por número de filas.
  verify_db="shiny_verify_${stamp}_${RANDOM}"
  verify_db="${verify_db//-/_}"
  runuser -u postgres -- createdb "$verify_db" || fail VERIFY_DB_CREATE_FAILED
  verify_cleanup(){
    runuser -u postgres -- psql -X -d postgres -v ON_ERROR_STOP=1 -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${verify_db}' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
    runuser -u postgres -- dropdb --if-exists "$verify_db" >/dev/null 2>&1 || true
  }
  if ! runuser -u postgres -- pg_restore --no-owner -d "$verify_db" "$db_file"; then
    verify_cleanup
    fail VERIFY_PG_RESTORE_FAILED
  fi

  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$verify_db" -At <<'SQLVERIFY' > "$work/restored-counts.tsv"
SELECT format('%I.%I', schemaname, tablename) || E'\t' ||
       (xpath('/row/c/text()', query_to_xml(
          format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename),
          false, true, ''
        )))[1]::text
FROM pg_tables
WHERE schemaname='shiny'
ORDER BY tablename;
SQLVERIFY
  restored_counts="$work/restored-table-counts.json"
  python3 - "$work/restored-counts.tsv" "$restored_counts" <<'PYVERIFY'
import json,sys
src,out=sys.argv[1:3]
d={}
for line in open(src,encoding='utf-8'):
    line=line.rstrip('\n')
    if not line: continue
    k,v=line.split('\t',1)
    v=v.replace('<c>','').replace('</c>','').strip()
    d[k]=int(v)
json.dump(d,open(out,'w',encoding='utf-8'),sort_keys=True,separators=(',',':'))
PYVERIFY

  if ! cmp -s "$source_counts" "$restored_counts"; then
    echo "SOURCE_COUNTS=$(cat "$source_counts")" >&2
    echo "RESTORED_COUNTS=$(cat "$restored_counts")" >&2
    verify_cleanup
    fail DUMP_CONTENT_MISMATCH
  fi
  verify_cleanup
  ok "Dump certificado: TODAS las tablas shiny conservan el mismo numero de filas."

  BKP_STAGE="CONFIG_ARCHIVE"
  for p in \
    config/instance.json \
    config/instance.local.json \
    brand.config.json \
    frontend/public/brand.config.json; do
    [[ -e "$APP_DIR/$p" ]] && cfg_paths+=("$p")
  done
  if [[ ${#cfg_paths[@]} -gt 0 ]]; then
    config_asset="client-config-${stamp}.tar.gz"
    config_file="$work/$config_asset"
    tar -czf "$config_file" -C "$APP_DIR" "${cfg_paths[@]}" || fail CONFIG_ARCHIVE_FAILED
    config_sha="$(sha256sum "$config_file" | awk '{print tolower($1)}')"
  fi

  BKP_STAGE="UPLOADS_ARCHIVE"
  if [[ -d "$APP_DIR/uploads" && -n "$(find "$APP_DIR/uploads" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
    uploads_asset="uploads-${stamp}.tar.gz"
    uploads_file="$work/$uploads_asset"
    tar -czf "$uploads_file" -C "$APP_DIR/uploads" . || fail UPLOADS_ARCHIVE_FAILED
    uploads_sha="$(sha256sum "$uploads_file" | awk '{print tolower($1)}')"
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
    --arg dbSchema "$DB_SCHEMA" \
    --arg dbUser "$DB_USER" \
    --arg dbAsset "$db_asset" \
    --arg dbSha "$db_sha" \
    --slurpfile tableCounts "$source_counts" \
    --arg cfgAsset "$config_asset" \
    --arg cfgSha "$config_sha" \
    --arg upAsset "$uploads_asset" \
    --arg upSha "$uploads_sha" \
    '{
      format:1,
      client:$client,
      createdAt:$created,
      app:{
        owner:$owner,
        releaseRepo:$repo,
        tag:$appTag,
        asset:$appAsset,
        sha256:$appSha
      },
      database:{
        name:$dbName,
        schema:$dbSchema,
        runtimeUser:$dbUser,
        asset:$dbAsset,
        sha256:$dbSha,
        verifiedExact:true,
        tableCounts:$tableCounts[0]
      }
    }
    + (if $cfgAsset!="" then {config:{asset:$cfgAsset,sha256:$cfgSha}} else {} end)
    + (if $upAsset!="" then {uploads:{asset:$upAsset,sha256:$upSha}} else {} end)' \
    > "$manifest" || fail MANIFEST_BUILD_FAILED

  BKP_STAGE="MANIFEST_VALIDATE"
  jq -e '
    (.format == 1) and
    ((.client // "") != "") and
    ((.app.owner // "") != "") and
    ((.app.releaseRepo // "") != "") and
    ((.app.tag // "") != "") and
    ((.app.asset // "") != "") and
    ((.app.sha256 // "") | test("^[A-Fa-f0-9]{64}$")) and
    ((.database.name // "") != "") and
    ((.database.schema // "") == "shiny") and
    ((.database.runtimeUser // "") != "") and
    ((.database.asset // "") != "") and
    ((.database.sha256 // "") | test("^[A-Fa-f0-9]{64}$")) and
    (.database.verifiedExact == true) and
    ((.database.tableCounts // {}) | type=="object") and
    ((.database.tableCounts // {}) | length > 0)
  ' "$manifest" >/dev/null || fail BACKUP_MANIFEST_FORMAT1_INVALID

  # Validacion adicional: los nombres del manifest deben corresponder a archivos reales.
  [[ -f "$work/$(jq -r '.database.asset' "$manifest")" ]] || fail MANIFEST_DB_ASSET_NOT_REAL
  if jq -e '.config.asset? // empty' "$manifest" >/dev/null; then
    c="$(jq -r '.config.asset // empty' "$manifest")"
    [[ -z "$c" || -f "$work/$c" ]] || fail MANIFEST_CONFIG_ASSET_NOT_REAL
  fi
  if jq -e '.uploads.asset? // empty' "$manifest" >/dev/null; then
    u="$(jq -r '.uploads.asset // empty' "$manifest")"
    [[ -z "$u" || -f "$work/$u" ]] || fail MANIFEST_UPLOADS_ASSET_NOT_REAL
  fi

  BKP_STAGE="RELEASE_CREATE"
  release_payload="$(jq -cn --arg tag "$tag" --arg name "$CLIENT_NAME backup $stamp" \
    '{tag_name:$tag,name:$name,body:"Respaldo exacto Shiny R5 format:1 + verificacion de contenido.",draft:false,prerelease:true}')"
  release_body="$work/release-created.json"
  release_code="$(gh_json POST "$API/releases" "$release_body" "$release_payload")"
  [[ "$release_code" == "201" ]] || fail RELEASE_CREATE_FAILED

  release_id="$(jq -r '.id // empty' "$release_body")"
  upload_url="$(jq -r '.upload_url // empty' "$release_body")"
  [[ "$release_id" =~ ^[0-9]+$ ]] || fail RELEASE_ID_MISSING
  [[ -n "$upload_url" && "$upload_url" != "null" ]] || {
    delete_release "$release_id" "$tag"
    fail RELEASE_UPLOAD_URL_MISSING
  }
  upload_base="${upload_url%%\{*}"

  BKP_STAGE="UPLOAD_DATABASE"
  upload_asset "$upload_base" "$db_file" || {
    delete_release "$release_id" "$tag"
    fail UPLOAD_DATABASE_FAILED
  }

  if [[ -n "$config_file" ]]; then
    BKP_STAGE="UPLOAD_CONFIG"
    upload_asset "$upload_base" "$config_file" || {
      delete_release "$release_id" "$tag"
      fail UPLOAD_CONFIG_FAILED
    }
  fi

  if [[ -n "$uploads_file" ]]; then
    BKP_STAGE="UPLOAD_FILES"
    upload_asset "$upload_base" "$uploads_file" || {
      delete_release "$release_id" "$tag"
      fail UPLOAD_FILES_FAILED
    }
  fi

  # EL MANIFEST SE SUBE AL FINAL.
  # Asi un release nunca parece restaurable si antes fallaron sus datos.
  BKP_STAGE="UPLOAD_MANIFEST"
  upload_asset "$upload_base" "$manifest" || {
    delete_release "$release_id" "$tag"
    fail UPLOAD_MANIFEST_FAILED
  }

  BKP_STAGE="FINAL_VERIFY"
  verify="$work/final-release.json"
  [[ "$(gh_json GET "$API/releases/tags/$tag" "$verify")" == "200" ]] || fail FINAL_RELEASE_VERIFY_FAILED

  # Descargar DE GITHUB el mismo manifest publicado y volverlo a validar.
  published="$work/published-backup-manifest.json"
  download_asset "$verify" "backup-manifest.json" "$published" || fail FINAL_MANIFEST_DOWNLOAD_FAILED

  jq -e '
    (.format == 1) and
    ((.client // "") != "") and
    ((.app.owner // "") != "") and
    ((.app.releaseRepo // "") != "") and
    ((.app.tag // "") != "") and
    ((.app.asset // "") != "") and
    ((.app.sha256 // "") | test("^[A-Fa-f0-9]{64}$")) and
    ((.database.name // "") != "") and
    ((.database.schema // "") == "shiny") and
    ((.database.runtimeUser // "") != "") and
    ((.database.asset // "") != "") and
    ((.database.sha256 // "") | test("^[A-Fa-f0-9]{64}$")) and
    (.database.verifiedExact == true) and
    ((.database.tableCounts // {}) | type=="object") and
    ((.database.tableCounts // {}) | length > 0)
  ' "$published" >/dev/null || {
    delete_release "$release_id" "$tag"
    fail PUBLISHED_MANIFEST_INVALID
  }

  # Certificar que GitHub contiene los assets declarados.
  for required in \
    "$(jq -r '.database.asset' "$published")" \
    "$(jq -r '.config.asset // empty' "$published")" \
    "$(jq -r '.uploads.asset // empty' "$published")" \
    "backup-manifest.json"; do
    [[ -z "$required" ]] && continue
    jq -e --arg n "$required" '.assets[]? | select(.name==$n)' "$verify" >/dev/null || {
      delete_release "$release_id" "$tag"
      fail "PUBLISHED_ASSET_MISSING_${required}"
    }
  done

  BKP_STAGE="FINALIZE"
  cp -f "$published" "$BACKUPS/${tag}-backup-manifest.json"
  chmod 0600 "$BACKUPS/${tag}-backup-manifest.json"

  jq -cn --arg tag "$tag" --arg created "$(date -Iseconds)" \
    --arg db "$DB_NAME" --arg format "1" \
    '{tag:$tag,createdAt:$created,database:$db,format:($format|tonumber)}' > "$LAST_JSON.tmp"
  chmod 0600 "$LAST_JSON.tmp"
  mv -f "$LAST_JSON.tmp" "$LAST_JSON"
  rm -f "$LAST_ERROR" 2>/dev/null || true

  BKP_STAGE="DONE"
  echo "[OK] BACKUP_COMPLETE"
  echo "TAG=$tag"
  echo "DB=$DB_NAME"
  echo "FORMAT=1"
  echo "MANIFEST=VALIDATED_FROM_GITHUB"
}

case "${1:-status}" in
  status) status ;;
  backup) backup ;;
  *) fail USAGE_STATUS_OR_BACKUP ;;
esac