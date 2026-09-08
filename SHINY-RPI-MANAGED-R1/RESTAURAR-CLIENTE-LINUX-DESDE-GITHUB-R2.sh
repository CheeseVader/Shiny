#!/usr/bin/env bash
set -Eeuo pipefail

# RESTAURAR-CLIENTE-LINUX-DESDE-GITHUB-R2.1.sh
#
# Recuperacion de desastre. NO clona Shiny.
# Usa el MISMO repositorio <Cliente>-Release.
#
# Releases de app:    v1.0.0, v1.0.1, ...
# Releases de backup: backup-YYYYMMDD-HHMMSS
#
# El restaurador:
#  - detecta configuracion existente si la hay
#  - NO llama shiny-backup-agent.sh para restaurar; evita incompatibilidad USAGE status|backup
#  - NO pide clave privada para backups one-click format:1; el dump actual no va cifrado
#  - en disco nuevo solo pide Cliente + token si no puede recuperarlos
#  - busca el ultimo backup-* en <Cliente>-Release
#  - descarga backup-manifest.json
#  - descarga DB/config/uploads
#  - descarga la release EXACTA de app indicada por el manifest
#  - valida SHA256 ANTES de destruir nada
#  - restaura PostgreSQL, config, uploads y servicios Linux/RPi
#  - Admin 8788 / Tienda 8789 / local -> Admin
#  - valida SUPERADMIN admin / Angie12345
#
# NOTA: el boton interno de Shiny NO debe pedir owner/repo/token:
# esos valores deben quedar en la configuracion instalada. Este script
# tambien intenta reutilizarlos cuando existen.

APP_ROOT="${APP_ROOT:-/opt/shiny}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
UPDATER_ENV="${UPDATER_ENV:-/etc/shiny-updater/updater.env}"
BACKUP_ENV="${BACKUP_ENV:-/etc/shiny-backup/backup.env}"
BACKUPS_DIR="${BACKUPS_DIR:-$APP_ROOT/disaster-backups}"
SERVICE_NAME="${SERVICE_NAME:-shiny-app.service}"
APP_USER="${APP_USER:-shiny}"
APP_GROUP="${APP_GROUP:-shiny}"
BACKEND_PORT=8787
STAFF_PORT=8788
STORE_PORT=8789
STAGE="/var/tmp/shiny-client-restore"

say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok(){ printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[AVISO]\033[0m %s\n' "$*"; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Ejecuta con sudo."

read_tty(){
  local prompt="$1" default="${2:-}" v=""
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " v </dev/tty || true
    printf '%s' "${v:-$default}"
  else
    read -r -p "$prompt: " v </dev/tty || true
    printf '%s' "$v"
  fi
}

get_env(){
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -nE "s/^[[:space:]]*${key}=(.*)$/\1/p" "$file" | tail -n1 | sed -E 's/^["'\'']//;s/["'\'']$//'
}

cleanup(){ rm -rf "$STAGE" >/dev/null 2>&1 || true; }
trap cleanup EXIT
rm -rf "$STAGE"; mkdir -p "$STAGE"

# ------------------------------------------------------------
# 1. Identidad ya instalada
# ------------------------------------------------------------
say "Detectando identidad del cliente"

OWNER="$(get_env "$BACKUP_ENV" GITHUB_OWNER)"
[[ -n "$OWNER" ]] || OWNER="$(get_env "$UPDATER_ENV" GITHUB_OWNER)"
RELEASE_REPO="$(get_env "$BACKUP_ENV" GITHUB_REPO)"
[[ -n "$RELEASE_REPO" ]] || RELEASE_REPO="$(get_env "$UPDATER_ENV" GITHUB_REPO)"
TOKEN="$(get_env "$BACKUP_ENV" GITHUB_TOKEN)"
[[ -n "$TOKEN" ]] || TOKEN="$(get_env "$UPDATER_ENV" GITHUB_TOKEN)"

CLIENT_NAME=""
if [[ -n "$RELEASE_REPO" && "$RELEASE_REPO" == *-Release ]]; then
  CLIENT_NAME="${RELEASE_REPO%-Release}"
fi

if [[ -z "$CLIENT_NAME" ]]; then
  CLIENT_NAME="$(read_tty "Cliente existente a recuperar (ej. The_Base)")"
fi
[[ "$CLIENT_NAME" =~ ^[A-Za-z0-9_.-]+$ ]] || die "Cliente invalido."

OWNER="${OWNER:-CheeseVader}"
RELEASE_REPO="${RELEASE_REPO:-${CLIENT_NAME}-Release}"

if [[ -z "$TOKEN" ]]; then
  TOKEN="$(read_tty "GitHub token de recuperacion")"
fi
[[ -n "$TOKEN" ]] || die "Token requerido para repositorio privado."

CLIENT_COMPACT="$(printf '%s' "$CLIENT_NAME" | tr -cd '[:alnum:]')"
CLIENT_HOST="$(printf '%s' "$CLIENT_COMPACT" | tr '[:upper:]' '[:lower:]')"
CLIENT_SLUG="$(printf '%s' "$CLIENT_NAME" | sed -E 's/([a-z0-9])([A-Z])/\1_\2/g;s/[^A-Za-z0-9]+/_/g;s/^_+//;s/_+$//' | tr '[:upper:]' '[:lower:]')"

echo "Cliente : $CLIENT_NAME"
echo "GitHub  : $OWNER/$RELEASE_REPO"

# ------------------------------------------------------------
# 2. Dependencias minimas
# ------------------------------------------------------------
say "Preparando dependencias"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl jq ca-certificates tar gzip openssl postgresql postgresql-client nginx avahi-daemon
command -v node >/dev/null 2>&1 || apt-get install -y nodejs npm
systemctl enable --now postgresql >/dev/null 2>&1 || true

HDR=(
 -H "Authorization: Bearer $TOKEN"
 -H "Accept: application/vnd.github+json"
 -H "X-GitHub-Api-Version: 2022-11-28"
 -H "User-Agent: Shiny-Restore-R2.1"
)
API="https://api.github.com/repos/$OWNER/$RELEASE_REPO"

curl -fsS "${HDR[@]}" "$API" >/dev/null || die "No puedo acceder a $OWNER/$RELEASE_REPO."

# ------------------------------------------------------------
# 3. Encontrar ultimo backup-* EN EL MISMO Release repo
# ------------------------------------------------------------
say "Buscando ultimo backup en $RELEASE_REPO"

ALL="$STAGE/releases.json"
curl -fsS "${HDR[@]}" "$API/releases?per_page=100" -o "$ALL"

BACKUP_TAG="$(jq -r '
  [.[] | select((.tag_name // "") | startswith("backup-"))]
  | sort_by(.published_at // .created_at)
  | reverse
  | .[0].tag_name // empty
' "$ALL")"
[[ -n "$BACKUP_TAG" ]] || die "No hay releases backup-* en $OWNER/$RELEASE_REPO."

BACKUP_JSON="$STAGE/backup-release.json"
curl -fsS "${HDR[@]}" "$API/releases/tags/$BACKUP_TAG" -o "$BACKUP_JSON"

asset_url(){
  local json="$1" name="$2"
  jq -r --arg n "$name" '.assets[] | select(.name==$n) | .url' "$json" | head -n1
}
download_asset(){
  local json="$1" name="$2" out="$3" url
  url="$(asset_url "$json" "$name")"
  [[ -n "$url" ]] || die "Falta asset '$name'."
  curl -fsSL "${HDR[@]}" -H "Accept: application/octet-stream" "$url" -o "$out"
}
sha_check(){
  local f="$1" expected="$2" label="$3" actual
  [[ -n "$expected" && "$expected" != "null" ]] || die "SHA256 ausente: $label."
  actual="$(sha256sum "$f" | awk '{print tolower($1)}')"
  expected="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')"
  [[ "$actual" == "$expected" ]] || die "SHA256 incorrecto: $label."
  ok "SHA256 $label"
}

MANIFEST="$STAGE/backup-manifest.json"
if ! download_asset "$BACKUP_JSON" "backup-manifest.json" "$MANIFEST"; then
  die "El ultimo backup no usa el formato one-click actual (falta backup-manifest.json). Crea un respaldo nuevo desde Shiny 1.0.44+ y vuelve a intentar."
fi

FORMAT="$(jq -r '.format // empty' "$MANIFEST")"
if [[ "$FORMAT" != "1" ]]; then
  die "Formato de backup no soportado por R2.1: ${FORMAT:-AUSENTE}. El backup seleccionado no fue generado por el agente format:1."
fi
ok "Formato one-click format:1 detectado. No requiere clave privada de cifrado."

M_CLIENT="$(jq -r '.client // empty' "$MANIFEST")"
[[ "$M_CLIENT" == "$CLIENT_NAME" ]] || die "Backup de otro cliente: $M_CLIENT."

M_OWNER="$(jq -r '.app.owner // empty' "$MANIFEST")"
M_REPO="$(jq -r '.app.releaseRepo // empty' "$MANIFEST")"
APP_TAG="$(jq -r '.app.tag // empty' "$MANIFEST")"
APP_ASSET="$(jq -r '.app.asset // empty' "$MANIFEST")"
APP_SHA="$(jq -r '.app.sha256 // empty' "$MANIFEST")"

[[ "$M_OWNER" == "$OWNER" ]] || die "Owner del manifest no coincide."
[[ "$M_REPO" == "$RELEASE_REPO" ]] || die "Repo del manifest no coincide."
[[ "$APP_TAG" != backup-* ]] || die "Manifest apunta a otro backup, no a release de app."

DB_NAME="$(jq -r '.database.name // empty' "$MANIFEST")"
DB_USER="$(jq -r '.database.runtimeUser // empty' "$MANIFEST")"
DB_SCHEMA="$(jq -r '.database.schema // "shiny"' "$MANIFEST")"
DB_ASSET="$(jq -r '.database.asset // empty' "$MANIFEST")"
DB_SHA="$(jq -r '.database.sha256 // empty' "$MANIFEST")"
[[ "$DB_SCHEMA" == "shiny" ]] || die "Schema esperado shiny."
[[ -n "$DB_NAME" && -n "$DB_ASSET" ]] || die "Manifest DB incompleto."
DB_USER="${DB_USER:-${CLIENT_SLUG}_app}"

# ------------------------------------------------------------
# 4. Descargar TODO y validar ANTES de tocar la instalacion
# ------------------------------------------------------------
say "Descargando backup $BACKUP_TAG"

DB_FILE="$STAGE/$DB_ASSET"
download_asset "$BACKUP_JSON" "$DB_ASSET" "$DB_FILE"
sha_check "$DB_FILE" "$DB_SHA" "PostgreSQL"

CONFIG_FILE=""
CONFIG_ASSET="$(jq -r '.config.asset // empty' "$MANIFEST")"
if [[ -n "$CONFIG_ASSET" && "$CONFIG_ASSET" != "null" ]]; then
  CONFIG_FILE="$STAGE/$CONFIG_ASSET"
  download_asset "$BACKUP_JSON" "$CONFIG_ASSET" "$CONFIG_FILE"
  sha_check "$CONFIG_FILE" "$(jq -r '.config.sha256 // empty' "$MANIFEST")" "config"
fi

UPLOADS_FILE=""
UPLOADS_ASSET="$(jq -r '.uploads.asset // empty' "$MANIFEST")"
if [[ -n "$UPLOADS_ASSET" && "$UPLOADS_ASSET" != "null" ]]; then
  UPLOADS_FILE="$STAGE/$UPLOADS_ASSET"
  download_asset "$BACKUP_JSON" "$UPLOADS_ASSET" "$UPLOADS_FILE"
  sha_check "$UPLOADS_FILE" "$(jq -r '.uploads.sha256 // empty' "$MANIFEST")" "uploads"
fi

APP_JSON="$STAGE/app-release.json"
curl -fsS "${HDR[@]}" "$API/releases/tags/$APP_TAG" -o "$APP_JSON" \
  || die "No existe release de app $APP_TAG."

APP_FILE="$STAGE/$APP_ASSET"
download_asset "$APP_JSON" "$APP_ASSET" "$APP_FILE"
sha_check "$APP_FILE" "$APP_SHA" "app $APP_TAG"

ok "Todo descargado y validado. Ahora si se permite restaurar."

# ------------------------------------------------------------
# 5. Copia preventiva local
# ------------------------------------------------------------
say "Copia preventiva local"
STAMP="$(date +%Y%m%d-%H%M%S)"
PRE="$BACKUPS_DIR/pre-restore-$STAMP"
mkdir -p "$PRE"
if [[ -d "$APP_DIR" && -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | head -n1)" ]]; then
  tar -czf "$PRE/app.tar.gz" -C "$APP_DIR" .
fi
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -qx 1; then
  sudo -u postgres pg_dump -Fc "$DB_NAME" -f "$PRE/database.dump" || true
fi

# ------------------------------------------------------------
# 6. App exacta + datos persistentes
# ------------------------------------------------------------
say "Restaurando aplicacion exacta $APP_TAG"
systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
rm -rf "$APP_DIR"; mkdir -p "$APP_DIR" "$STAGE/app"
tar -xzf "$APP_FILE" -C "$STAGE/app"

SRC="$STAGE/app"
if [[ ! -d "$SRC/backend" ]]; then
  D="$(find "$SRC" -mindepth 1 -maxdepth 1 -type d | head -n1 || true)"
  [[ -n "$D" && -d "$D/backend" ]] && SRC="$D"
fi
[[ -d "$SRC/backend" && -d "$SRC/frontend" ]] || die "Release de app invalida."
cp -a "$SRC"/. "$APP_DIR"/

[[ -n "$CONFIG_FILE" ]] && tar -xzf "$CONFIG_FILE" -C "$APP_DIR"
if [[ -n "$UPLOADS_FILE" ]]; then
  mkdir -p "$APP_DIR/uploads"
  tar -xzf "$UPLOADS_FILE" -C "$APP_DIR/uploads"
fi

# ------------------------------------------------------------
# 7. DB exacta. NO migraciones, NO geo init, NO recrear admin.
# ------------------------------------------------------------
say "Restaurando base de datos exacta"
DB_PASSWORD="$(openssl rand -base64 40 | tr -dc 'A-Za-z0-9' | head -c 32)"
[[ ${#DB_PASSWORD} -ge 24 ]] || die "Password DB no generado."

QPASS="${DB_PASSWORD//\'/\'\'}"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -qx 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DB_USER\" LOGIN PASSWORD '$QPASS';"
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$QPASS';"
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -qx 1; then
  sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c \
   "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid<>pg_backend_pid();" >/dev/null
  sudo -u postgres dropdb "$DB_NAME"
fi
sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

if pg_restore -l "$DB_FILE" >/dev/null 2>&1; then
  sudo -u postgres pg_restore --no-owner --role="$DB_USER" -d "$DB_NAME" "$DB_FILE"
else
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$DB_FILE"
fi

sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
ALTER DATABASE "$DB_NAME" OWNER TO "$DB_USER";
GRANT USAGE, CREATE ON SCHEMA shiny TO "$DB_USER";
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA shiny TO "$DB_USER";
GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA shiny TO "$DB_USER";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiny TO "$DB_USER";
ALTER ROLE "$DB_USER" IN DATABASE "$DB_NAME" SET search_path TO shiny,public;
SQL

# ------------------------------------------------------------
# 8. Runtime y servicios
# ------------------------------------------------------------
say "Reconstruyendo runtime Linux/RPi"
ENVFILE="$APP_DIR/backend/.env"
touch "$ENVFILE"
upsert(){
  local k="$1" v="$2"
  if grep -qE "^${k}=" "$ENVFILE"; then sed -i "s|^${k}=.*|${k}=${v}|" "$ENVFILE"
  else printf '%s=%s\n' "$k" "$v" >> "$ENVFILE"; fi
}
upsert NODE_ENV production
upsert PORT "$BACKEND_PORT"
upsert DB_HOST 127.0.0.1
upsert DB_PORT 5432
upsert DB_NAME "$DB_NAME"
upsert DB_DATABASE "$DB_NAME"
upsert DB_USER "$DB_USER"
upsert DB_USERNAME "$DB_USER"
upsert DB_PASSWORD "$DB_PASSWORD"
upsert DB_SCHEMA shiny
chmod 600 "$ENVFILE"

id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/shiny --shell /usr/sbin/nologin "$APP_USER"
getent group "$APP_GROUP" >/dev/null || groupadd --system "$APP_GROUP"
mkdir -p "$APP_ROOT"
chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"

for d in "$APP_DIR" "$APP_DIR/backend" "$APP_DIR/frontend"; do
  [[ -f "$d/package.json" ]] || continue
  if [[ -f "$d/package-lock.json" ]]; then (cd "$d" && npm ci); else (cd "$d" && npm install); fi
done
(cd "$APP_DIR/frontend" && npm run build)

RUNNER="/usr/local/bin/shiny-client-runner"
cat > "$RUNNER" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
cd "$APP_DIR/backend"
set -a
source "$ENVFILE"
set +a
if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.start?0:1)" 2>/dev/null; then
 exec npm start
fi
exec node src/server.js
EOF
chmod +x "$RUNNER"

cat > "/etc/systemd/system/$SERVICE_NAME" <<EOF
[Unit]
Description=$CLIENT_NAME application
After=network-online.target postgresql.service
Wants=network-online.target
[Service]
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR/backend
ExecStart=$RUNNER
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/shiny-client <<EOF
server {
 listen 80 default_server;
 listen [::]:80 default_server;
 server_name ${CLIENT_HOST}.local _;
 location = / { return 302 /login; }
 location / {
   proxy_pass http://127.0.0.1:${STAFF_PORT};
   proxy_http_version 1.1;
   proxy_set_header Host \$host;
   proxy_set_header X-Real-IP \$remote_addr;
   proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
   proxy_set_header Upgrade \$http_upgrade;
   proxy_set_header Connection "upgrade";
 }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/shiny-client /etc/nginx/sites-enabled/shiny-client
nginx -t
hostnamectl set-hostname "$CLIENT_HOST" || true
systemctl enable --now avahi-daemon >/dev/null 2>&1 || true

# Guarda configuracion recuperada para que el modulo interno de respaldo
# ya no vuelva a preguntar owner/repo.
mkdir -p "$(dirname "$BACKUP_ENV")"
cat > "$BACKUP_ENV" <<EOF
GITHUB_OWNER=$OWNER
GITHUB_REPO=$RELEASE_REPO
CLIENT_NAME=$CLIENT_NAME
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_SCHEMA=shiny
EOF
chmod 600 "$BACKUP_ENV"

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl enable --now nginx
systemctl restart nginx

# ------------------------------------------------------------
# 9. Validacion
# ------------------------------------------------------------
say "Validando recuperacion"
for _ in $(seq 1 60); do
  curl -sS --max-time 2 "http://127.0.0.1:${BACKEND_PORT}/" >/dev/null 2>&1 && break
  sleep 2
done

redirect(){
  curl -sS -o /dev/null -D - --max-time 5 "$1" \
   | awk 'BEGIN{IGNORECASE=1}/^Location:/{gsub("\r","");print $2;exit}' || true
}
[[ "$(redirect "http://127.0.0.1:${STAFF_PORT}/")" =~ ^/login/?$ ]] || die "8788 no abre Admin."
[[ "$(redirect "http://127.0.0.1:${STORE_PORT}/")" =~ ^/tienda/?$ ]] || die "8789 no abre Tienda."
[[ "$(redirect "http://127.0.0.1/")" =~ ^/login/?$ ]] || die "Puerto 80 no abre Admin."

COUNT="$(sudo -u postgres psql -X -d "$DB_NAME" -tAc \
 "SELECT count(*) FROM shiny.administradores WHERE lower(coalesce(username,''))='admin' AND upper(coalesce(rol,''))='SUPERADMIN' AND coalesce(activo,true)=true;" | tr -d '[:space:]')"
[[ "${COUNT:-0}" -ge 1 ]] || die "El respaldo no contiene admin SUPERADMIN activo."

HTTP="$(curl -sS -o "$STAGE/login.json" -w '%{http_code}' \
 -H 'Content-Type: application/json' \
 -X POST --data '{"username":"admin","password":"Angie12345"}' \
 "http://127.0.0.1:${BACKEND_PORT}/api/auth/login" || true)"
[[ "$HTTP" == 200 ]] || die "admin / Angie12345 no valida despues de restaurar."

IP="$(hostname -I | awk '{print $1}')"
ok "Restauracion completa"
echo
echo "============================================================"
echo "Cliente       : $CLIENT_NAME"
echo "Repo unico    : $OWNER/$RELEASE_REPO"
echo "Backup        : $BACKUP_TAG"
echo "App           : $APP_TAG"
echo "DB            : $DB_NAME"
echo "SUPERADMIN    : admin / Angie12345 VALIDADO"
echo "Admin         : http://127.0.0.1/"
echo "mDNS          : http://${CLIENT_HOST}.local/"
echo "LAN           : http://${IP:-IP}/"
echo "Tienda        : http://127.0.0.1:${STORE_PORT}/"
echo "============================================================"
