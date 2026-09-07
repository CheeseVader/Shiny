#!/usr/bin/env bash
set -Eeuo pipefail
# SHINY_BACKUP_AGENT_LINUX_R130

APP_DIR="${SHINY_APP_DIR:-/opt/shiny/app}"
CONFIG="/etc/shiny-backup/backup.env"
UPDATER_CONFIG="/etc/shiny-updater/updater.env"
ROOT="/var/lib/shiny-backup"
BACKUPS="$ROOT/backups"
TMP="$ROOT/tmp"
CRYPTO="$APP_DIR/backend/scripts/shiny-backup-crypto.cjs"
SERVICE="${SERVICE_NAME:-shiny-app.service}"

die(){ echo "[ERROR] $*" >&2; exit 1; }
ok(){ echo "[OK] $*"; }
[[ $EUID -eq 0 ]] || die ROOT_REQUIRED
mkdir -p "$BACKUPS" "$TMP" /etc/shiny-backup
chmod 700 "$ROOT" "$BACKUPS" "$TMP" /etc/shiny-backup

b64d(){ printf '%s' "$1" | base64 -d; }

load_cfg(){
  [[ -f "$CONFIG" ]] || die BACKUP_NOT_CONFIGURED
  # shellcheck disable=SC1090
  source "$CONFIG"
  : "${GITHUB_OWNER:?}" "${GITHUB_REPO:?}" "${TOKEN_B64:?}" "${PASS_B64:?}" "${DB_NAME:?}"
  GITHUB_BACKUP_TOKEN="$(b64d "$TOKEN_B64")"
  SHINY_BACKUP_PASSPHRASE="$(b64d "$PASS_B64")"
  export SHINY_BACKUP_PASSPHRASE
}

gh(){
  curl -fsS \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_BACKUP_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' "$@"
}

configure(){
  IFS= read -r token64
  IFS= read -r pass64
  IFS= read -r db
  IFS= read -r owner
  IFS= read -r repo

  token="$(b64d "$token64")"
  pass="$(b64d "$pass64")"
  [[ ${#token} -ge 20 ]] || die TOKEN_INVALID
  [[ ${#pass} -ge 12 ]] || die PASSPHRASE_TOO_SHORT
  [[ "$db" =~ ^[A-Za-z0-9_-]+$ ]] || die DB_NAME_INVALID

  if [[ -z "$owner" || -z "$repo" ]]; then
    if [[ -f "$UPDATER_CONFIG" ]]; then
      [[ -n "$owner" ]] || owner="$(grep -m1 '^GITHUB_OWNER=' "$UPDATER_CONFIG" | cut -d= -f2- || true)"
      [[ -n "$repo"  ]] || repo="$(grep -m1 '^GITHUB_REPO=' "$UPDATER_CONFIG" | cut -d= -f2- || true)"
    fi
  fi
  [[ -n "$owner" && -n "$repo" ]] || die GITHUB_REPOSITORY_REQUIRED

  code="$(curl -sS -o /tmp/shiny-backup-test.json -w '%{http_code}' \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $token" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "https://api.github.com/repos/$owner/$repo" || true)"
  rm -f /tmp/shiny-backup-test.json
  [[ "$code" == "200" ]] || die "GITHUB_REPO_HTTP_$code"

  umask 077
  cat > "$CONFIG" <<EOF
GITHUB_OWNER=$owner
GITHUB_REPO=$repo
TOKEN_B64=$token64
PASS_B64=$pass64
DB_NAME=$db
EOF
  chmod 600 "$CONFIG"
  unset token pass
  ok "CONFIGURED"
  echo "REPO=$owner/$repo"
  echo "DB=$db"
}

status(){
  if [[ -f "$CONFIG" ]]; then
    owner="$(grep -m1 '^GITHUB_OWNER=' "$CONFIG"|cut -d= -f2- || true)"
    repo="$(grep -m1 '^GITHUB_REPO=' "$CONFIG"|cut -d= -f2- || true)"
    db="$(grep -m1 '^DB_NAME=' "$CONFIG"|cut -d= -f2- || true)"
    configured=true
  else
    owner=""; repo=""; db=""; configured=false
  fi
  latest="$(find "$BACKUPS" -maxdepth 1 -type f -name '*.dump.enc' -printf '%T@ %f\n' 2>/dev/null|sort -nr|head -1|cut -d' ' -f2- || true)"
  count="$(find "$BACKUPS" -maxdepth 1 -type f -name '*.dump.enc' 2>/dev/null|wc -l|tr -d ' ')"
  printf '{"configured":%s,"platform":"linux","portable":true,"repo":"%s","db":"%s","localCount":%s,"latestLocal":"%s"}\n' \
    "$configured" "$owner/$repo" "$db" "${count:-0}" "${latest:-}"
}

create(){
  load_cfg
  command -v pg_dump >/dev/null || die PG_DUMP_NOT_FOUND
  command -v node >/dev/null || die NODE_NOT_FOUND
  [[ -f "$CRYPTO" ]] || die CRYPTO_HELPER_NOT_FOUND

  stamp="$(date +%Y%m%d-%H%M%S)"
  work="$(mktemp -d "$TMP/create-XXXXXX")"
  chmod 700 "$work"
  chown postgres:postgres "$work"
  raw="$work/database.dump"
  enc="$BACKUPS/shiny-${DB_NAME}-${stamp}.dump.enc"

  runuser -u postgres -- pg_dump -Fc --no-owner --no-privileges -d "$DB_NAME" -f "$raw"
  chown root:root "$raw"
  chmod 600 "$raw"

  SHINY_BACKUP_PASSPHRASE="$SHINY_BACKUP_PASSPHRASE" node "$CRYPTO" encrypt "$raw" "$enc"
  rm -rf "$work"
  chmod 600 "$enc"

  (cd "$BACKUPS" && sha256sum "$(basename "$enc")") > "$enc.sha256"
  chmod 600 "$enc.sha256"

  appver="unknown"
  [[ -f "$APP_DIR/VERSION" ]] && appver="$(tr -d '\r\n' < "$APP_DIR/VERSION")"
  size="$(stat -c '%s' "$enc")"
  cat > "$enc.json" <<EOF
{"format":"SHINY_BACKUP","backupVersion":1,"appVersion":"$appver","databaseEngine":"postgresql","databaseFormat":"custom","database":"$DB_NAME","sourcePlatform":"linux","portable":true,"cipher":"AES-256-GCM","kdf":"PBKDF2-SHA256","iterations":250000,"createdAt":"$(date -Iseconds)","bytes":$size,"file":"$(basename "$enc")"}
EOF
  chmod 600 "$enc.json"
  ok "BACKUP_CREATED"
  echo "FILE=$enc"
}

latest_local(){
  find "$BACKUPS" -maxdepth 1 -type f -name '*.dump.enc' -printf '%T@ %p\n'|sort -nr|head -1|cut -d' ' -f2-
}

upload(){
  load_cfg
  command -v jq >/dev/null || die JQ_NOT_FOUND
  enc="$(latest_local)"
  [[ -n "$enc" && -f "$enc" ]] || die NO_LOCAL_BACKUP
  [[ -f "$enc.sha256" && -f "$enc.json" ]] || die BACKUP_METADATA_MISSING

  tag="backup-$(date +%Y%m%d-%H%M%S)"
  body="$(jq -cn --arg tag "$tag" \
    '{tag_name:$tag,name:$tag,body:"Encrypted portable Shiny PostgreSQL backup. Not an application release.",draft:false,prerelease:true}')"

  rel="$(curl -fsS -X POST \
    -H 'Accept: application/vnd.github+json' \
    -H "Authorization: Bearer $GITHUB_BACKUP_TOKEN" \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'Content-Type: application/json' \
    --data "$body" \
    "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/releases")"

  upload_url="$(printf '%s' "$rel"|jq -r '.upload_url // empty'|sed 's/{.*$//')"
  [[ -n "$upload_url" ]] || die RELEASE_CREATE_FAILED

  for f in "$enc" "$enc.sha256" "$enc.json"; do
    n="$(basename "$f")"
    curl -fsS -X POST \
      -H 'Accept: application/vnd.github+json' \
      -H "Authorization: Bearer $GITHUB_BACKUP_TOKEN" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      -H 'Content-Type: application/octet-stream' \
      --data-binary "@$f" \
      "$upload_url?name=$n" >/dev/null
  done
  ok "BACKUP_UPLOADED"
  echo "TAG=$tag"
}

remote(){
  load_cfg
  command -v jq >/dev/null || die JQ_NOT_FOUND
  gh "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/releases?per_page=100" |
    jq -c '[.[]|select(.prerelease==true and (.tag_name|startswith("backup-")))|{id,tag:.tag_name,published_at,assets:[.assets[]|{id,name,size}]}]'
}

download_latest(){
  load_cfg
  command -v jq >/dev/null || die JQ_NOT_FOUND
  data="$(gh "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/releases?per_page=100")"
  rel="$(printf '%s' "$data"|jq -c '[.[]|select(.prerelease==true and (.tag_name|startswith("backup-")))]|sort_by(.created_at)|reverse|.[0]//empty')"
  [[ -n "$rel" ]] || die NO_REMOTE_BACKUP

  work="$(mktemp -d "$TMP/restore-XXXXXX")"
  chmod 700 "$work"

  printf '%s' "$rel" | jq -c '.assets[]|select(.name|endswith(".dump.enc") or endswith(".sha256") or endswith(".dump.enc.json"))' |
  while IFS= read -r a; do
    id="$(printf '%s' "$a"|jq -r '.id')"
    name="$(printf '%s' "$a"|jq -r '.name')"
    curl -fsSL \
      -H 'Accept: application/octet-stream' \
      -H "Authorization: Bearer $GITHUB_BACKUP_TOKEN" \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/releases/assets/$id" \
      -o "$work/$name"
  done
  echo "$work"
}

restore_latest(){
  load_cfg
  command -v pg_restore >/dev/null || die PG_RESTORE_NOT_FOUND
  work="$(download_latest)"
  enc="$(find "$work" -maxdepth 1 -name '*.dump.enc'|head -1)"
  sha="$(find "$work" -maxdepth 1 -name '*.sha256'|head -1)"
  [[ -f "$enc" && -f "$sha" ]] || die REMOTE_BACKUP_INCOMPLETE

  (cd "$work" && sha256sum -c "$(basename "$sha")")
  raw="$work/database.dump"
  SHINY_BACKUP_PASSPHRASE="$SHINY_BACKUP_PASSPHRASE" node "$CRYPTO" decrypt "$enc" "$raw"

  safety="$BACKUPS/pre-restore-${DB_NAME}-$(date +%Y%m%d-%H%M%S).dump"
  runuser -u postgres -- pg_dump -Fc --no-owner --no-privileges -d "$DB_NAME" -f "$safety"
  chown root:root "$safety"; chmod 600 "$safety"

  systemctl stop "$SERVICE" || true
  set +e
  runuser -u postgres -- pg_restore --clean --if-exists --no-owner --no-privileges -d "$DB_NAME" "$raw"
  rc=$?
  set -e
  systemctl start "$SERVICE" || true
  rm -rf "$work"
  [[ $rc -eq 0 ]] || die "PG_RESTORE_FAILED_$rc"
  ok "RESTORE_COMPLETE"
  echo "SAFETY_BACKUP=$safety"
}

case "${1:-status}" in
  configure) configure;;
  status) status;;
  create) create;;
  upload) upload;;
  backup) create; upload;;
  remote) remote;;
  restore-latest) restore_latest;;
  *) die "USAGE configure|status|create|upload|backup|remote|restore-latest";;
esac