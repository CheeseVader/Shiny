#!/usr/bin/env bash
set -euo pipefail

CONFIG="${SHINY_UPDATER_CONFIG:-/etc/shiny-updater/updater.env}"
[[ -f "$CONFIG" ]] || { echo "No existe $CONFIG"; exit 2; }

# shellcheck disable=SC1090
source "$CONFIG"

: "${GITHUB_OWNER:?}"
: "${GITHUB_REPO:?}"
: "${GITHUB_TOKEN:?}"
: "${DEVICE_ID:?}"
: "${APP_DIR:?}"
: "${RELEASES_DIR:?}"
: "${BACKUPS_DIR:?}"
: "${STATE_DIR:?}"
: "${SERVICE_NAME:?}"

API="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"
STATE_JSON="$STATE_DIR/state.json"
LATEST_JSON="$STATE_DIR/latest.json"

mkdir -p "$STATE_DIR" "$RELEASES_DIR" "$BACKUPS_DIR"

json_get() {
  python3 - "$1" "$2" <<'PY'
import json,sys
p,key=sys.argv[1],sys.argv[2]
d=json.load(open(p,encoding="utf-8"))
v=d
for part in key.split("."):
    if isinstance(v,dict): v=v.get(part)
    else: v=None; break
if v is None: sys.exit(3)
print(v)
PY
}

current_version() {
  if [[ -f "$APP_DIR/VERSION" ]]; then
    tr -d '\r\n ' < "$APP_DIR/VERSION"
  else
    echo "0.0.0"
  fi
}

github_headers=(-H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28")

fetch_latest() {
  curl -fsSL "${github_headers[@]}" "$API/releases/latest" -o "$LATEST_JSON"
}

asset_url_by_name() {
  local name="$1"
  python3 - "$LATEST_JSON" "$name" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8"))
name=sys.argv[2]
for a in d.get("assets",[]):
    if a.get("name")==name:
        print(a.get("url",""))
        raise SystemExit(0)
raise SystemExit(4)
PY
}

download_asset() {
  local api_url="$1" out="$2"
  curl -fsSL "${github_headers[@]}" -H "Accept: application/octet-stream" "$api_url" -o "$out"
}

write_state() {
  local status="$1" available="$2" message="$3"
  python3 - "$STATE_JSON" "$status" "$available" "$message" "$(current_version)" "$DEVICE_ID" <<'PY'
import json,sys,datetime
p,status,available,message,current,device=sys.argv[1:]
d={
 "device_id":device,
 "current_version":current,
 "available_version":available,
 "status":status,
 "message":message,
 "checked_at":datetime.datetime.now(datetime.timezone.utc).isoformat()
}
open(p,"w",encoding="utf-8").write(json.dumps(d,indent=2,ensure_ascii=False))
PY
}

check_cmd() {
  fetch_latest
  local tag ver cur
  tag="$(json_get "$LATEST_JSON" tag_name)"
  ver="${tag#v}"
  cur="$(current_version)"
  if [[ "$ver" == "$cur" ]]; then
    write_state "up_to_date" "$ver" "Sin actualización pendiente."
    echo "Shiny ya está actualizado: $cur"
  else
    write_state "available" "$ver" "Actualización disponible."
    echo "Actualización disponible: $cur -> $ver"
    if [[ "${AUTO_INSTALL:-0}" == "1" ]]; then
      install_cmd
    fi
  fi
}

install_cmd() {
  fetch_latest
  local tag ver cur pkg_name manifest_name pkg_url manifest_url work backup
  tag="$(json_get "$LATEST_JSON" tag_name)"
  ver="${tag#v}"
  cur="$(current_version)"
  pkg_name="shiny-rpi-${ver}.tar.gz"
  manifest_name="manifest-${ver}.json"

  if [[ "$ver" == "$cur" ]]; then
    echo "Ya está instalada la versión $ver"
    exit 0
  fi

  pkg_url="$(asset_url_by_name "$pkg_name")"
  manifest_url="$(asset_url_by_name "$manifest_name")"
  [[ -n "$pkg_url" && -n "$manifest_url" ]] || {
    write_state "error" "$ver" "Release incompleta: faltan assets."
    echo "Faltan $pkg_name o $manifest_name"
    exit 5
  }

  work="$RELEASES_DIR/$ver"
  mkdir -p "$work"
  download_asset "$manifest_url" "$work/$manifest_name"
  download_asset "$pkg_url" "$work/$pkg_name"

  local expected actual
  expected="$(python3 - "$work/$manifest_name" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8"))
print(d["sha256"])
PY
)"
  actual="$(sha256sum "$work/$pkg_name" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || {
    write_state "error" "$ver" "SHA256 inválido."
    echo "Checksum inválido."
    exit 6
  }

  # Backup completo de código/config técnica local.
  # PostgreSQL NO se sustituye. Las migraciones se ejecutan desde el release.
  backup="$BACKUPS_DIR/pre-${ver}-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  if [[ -d "$APP_DIR" ]]; then
    rsync -a --delete-excluded \
      --exclude 'node_modules' \
      --exclude '.git' \
      "$APP_DIR/" "$backup/app/"
  fi

  local stage
  stage="$work/stage"
  rm -rf "$stage"
  mkdir -p "$stage"
  tar -xzf "$work/$pkg_name" -C "$stage"

  [[ -f "$stage/package.json" || -d "$stage/backend" ]] || {
    write_state "error" "$ver" "Paquete no parece ser Shiny."
    echo "Paquete inválido."
    exit 7
  }

  # Preservar secretos/config del cliente.
  local env_backup=""
  if [[ -f "$APP_DIR/.env" ]]; then
    env_backup="$work/.env.preserve"
    cp "$APP_DIR/.env" "$env_backup"
  fi
  if [[ -f "$APP_DIR/backend/.env" ]]; then
    cp "$APP_DIR/backend/.env" "$work/backend.env.preserve"
  fi

  rsync -a --delete \
    --exclude '.env' \
    --exclude 'backend/.env' \
    --exclude 'backend/uploads' \
    --exclude 'uploads' \
    --exclude '_shiny_backups' \
    "$stage/" "$APP_DIR/"

  [[ -n "$env_backup" && -f "$env_backup" ]] && cp "$env_backup" "$APP_DIR/.env"
  [[ -f "$work/backend.env.preserve" ]] && cp "$work/backend.env.preserve" "$APP_DIR/backend/.env"

  # Dependencias / build.
  if [[ -f "$APP_DIR/package-lock.json" ]]; then
    (cd "$APP_DIR" && npm ci --omit=dev || npm install --omit=dev)
  fi
  if [[ -f "$APP_DIR/backend/package-lock.json" ]]; then
    (cd "$APP_DIR/backend" && npm ci --omit=dev || npm install --omit=dev)
  fi
  if [[ -f "$APP_DIR/frontend/package-lock.json" ]]; then
    (cd "$APP_DIR/frontend" && npm ci)
  fi

  if [[ -f "$APP_DIR/package.json" ]]; then
    (cd "$APP_DIR" && npm run build)
  elif [[ -f "$APP_DIR/frontend/package.json" ]]; then
    (cd "$APP_DIR/frontend" && npm run build)
  fi

  # Migraciones incrementales, sólo si el proyecto ya expone un comando.
  if [[ -f "$APP_DIR/package.json" ]] && grep -q '"migrate"' "$APP_DIR/package.json"; then
    (cd "$APP_DIR" && npm run migrate)
  elif [[ -f "$APP_DIR/backend/package.json" ]] && grep -q '"migrate"' "$APP_DIR/backend/package.json"; then
    (cd "$APP_DIR/backend" && npm run migrate)
  fi

  echo "$ver" > "$APP_DIR/VERSION"

  systemctl restart "$SERVICE_NAME"
  sleep 4

  # Health check configurable; default local.
  local health="${HEALTH_URL:-http://127.0.0.1:8787/api/health}"
  if ! curl -fsS --max-time 10 "$health" >/dev/null; then
    echo "Health check falló. Ejecutando rollback..."
    systemctl stop "$SERVICE_NAME" || true
    rsync -a --delete "$backup/app/" "$APP_DIR/"
    systemctl start "$SERVICE_NAME" || true
    write_state "rollback" "$ver" "Health check falló; se restauró versión anterior."
    exit 8
  fi

  write_state "installed" "$ver" "Actualización instalada correctamente."
  echo "Actualización $ver instalada correctamente."
}

status_cmd() {
  echo "DEVICE_ID=$DEVICE_ID"
  echo "CURRENT_VERSION=$(current_version)"
  if [[ -f "$STATE_JSON" ]]; then
    cat "$STATE_JSON"
  else
    echo "Sin estado previo."
  fi
}

case "${1:-status}" in
  check) check_cmd ;;
  install) install_cmd ;;
  status) status_cmd ;;
  *)
    echo "Uso: $0 {status|check|install}"
    exit 1
    ;;
esac
