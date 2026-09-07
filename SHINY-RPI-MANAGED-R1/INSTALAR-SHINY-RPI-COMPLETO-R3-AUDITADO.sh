#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# SHINY RPI - INSTALADOR MAESTRO R3 AUDITADO
# Raspberry Pi OS 64-bit / Raspberry Pi 4
#
# Objetivo:
# - Instalar dependencias Linux
# - Instalar Node.js 20+ y PostgreSQL
# - Crear DB/usuario local
# - Descargar la última Release privada desde CheeseVader/Shiny-Release
# - Validar SHA256 del paquete
# - Instalar backend/frontend
# - Aplicar migraciones SQL una sola vez
# - Crear servicio systemd
# - Configurar nginx
# - Instalar agente de actualizaciones administradas
# - NO instalar servicio Visual Search / OpenCV / OpenCLIP / OCR Python
#
# Requiere un updater.env junto al script o en SHINY-CONFIG:
#   GITHUB_OWNER=CheeseVader
#   GITHUB_REPO=Shiny-Release
#   GITHUB_TOKEN=...
#   DEVICE_ID=SHINY-MX-000001
#   CHANNEL=stable
#   AUTO_INSTALL=1
# ============================================================

APP_ROOT="${APP_ROOT:-/opt/shiny}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
RELEASES_DIR="${RELEASES_DIR:-$APP_ROOT/releases}"
BACKUPS_DIR="${BACKUPS_DIR:-$APP_ROOT/backups}"
CONFIG_DIR="${CONFIG_DIR:-/etc/shiny-updater}"
BIN_DIR="${BIN_DIR:-/usr/local/lib/shiny-updater}"
STATE_DIR="${STATE_DIR:-/var/lib/shiny-updater}"
LOG_DIR="${LOG_DIR:-/var/log/shiny-updater}"
SERVICE_NAME="${SERVICE_NAME:-shiny-app.service}"
APP_USER="${APP_USER:-shiny}"
APP_GROUP="${APP_GROUP:-shiny}"
APP_PORT="${APP_PORT:-8787}"
DB_NAME="${DB_NAME:-shiny_db}"
DB_USER="${DB_USER:-shiny_app}"
INSTALL_CLOUDFLARED="${INSTALL_CLOUDFLARED:-0}"

LOG_FILE="/var/log/shiny-rpi-install.log"
STAGE_ROOT="/var/tmp/shiny-rpi-install"

say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok(){ printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[AVISO]\033[0m %s\n' "$*"; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

on_error(){
  local ec=$?
  echo
  echo "============================================================"
  echo " INSTALACION DETENIDA (codigo $ec)"
  echo " Revisa: $LOG_FILE"
  echo "============================================================"
  exit "$ec"
}
trap on_error ERR

[[ "${EUID}" -eq 0 ]] || die "Ejecuta con sudo: sudo bash $0"

# ------------------------------------------------------------
# AUTOAUDITORÍA DEL PROPIO INSTALADOR
# ------------------------------------------------------------
bash -n "$0" || die "El instalador tiene sintaxis Bash inválida."

BAD_GEXEC='\\gexec'';'
if grep -nF "$BAD_GEXEC" "$0" | grep -v "BAD_GEXEC=" >/dev/null 2>&1; then
  die "Autoauditoría: metacomando psql inválido detectado."
fi

if ! python3 - "$0" <<'PYAUDIT'
from pathlib import Path
import re, sys
s = Path(sys.argv[1]).read_text(encoding="utf-8")
for m in re.finditer(r"DO\s+\$\$(.*?)\$\$\s*;", s, flags=re.S|re.I):
    if re.search(r":\s*['\"][A-Za-z_][A-Za-z0-9_]*['\"]", m.group(1)):
        raise SystemExit(1)
raise SystemExit(0)
PYAUDIT
then
  die 'Autoauditoría: variable psql dentro de DO $$ detectada.'
fi

ok "Autoauditoría interna del instalador superada."

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo " SHINY RPI - INSTALADOR MAESTRO R3 AUDITADO"
echo "============================================================"
date
echo

# ------------------------------------------------------------
# 1. Validar plataforma
# ------------------------------------------------------------
say "Validando Raspberry Pi OS / arquitectura"

ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "$ARCH" in
  arm64|aarch64) ok "Arquitectura 64-bit: $ARCH" ;;
  *)
    warn "Arquitectura detectada: $ARCH"
    warn "Este instalador fue diseñado para Raspberry Pi OS 64-bit."
    ;;
esac

[[ -f /etc/os-release ]] || die "No se encontró /etc/os-release"
. /etc/os-release
echo "Sistema: ${PRETTY_NAME:-desconocido}"

# ------------------------------------------------------------
# 2. Localizar updater.env sin mostrar secretos
# ------------------------------------------------------------
say "Buscando credencial de actualización"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_CONFIG=""

CANDIDATES=(
  "$SCRIPT_DIR/updater.env"
  "$SCRIPT_DIR/SHINY-CONFIG/updater.env"
  "/boot/firmware/SHINY-CONFIG/updater.env"
  "/boot/SHINY-CONFIG/updater.env"
  "/media/${SUDO_USER:-pi}/SHINY-CONFIG/updater.env"
)

for f in "${CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then
    SOURCE_CONFIG="$f"
    break
  fi
done

if [[ -z "$SOURCE_CONFIG" ]]; then
  # Buscar de forma limitada bajo /media y /mnt.
  SOURCE_CONFIG="$(find /media /mnt -maxdepth 4 -type f -path '*/SHINY-CONFIG/updater.env' 2>/dev/null | head -n1 || true)"
fi

[[ -n "$SOURCE_CONFIG" && -f "$SOURCE_CONFIG" ]] || die \
  "No encontré updater.env. Colócalo junto al instalador o dentro de SHINY-CONFIG."

install -d -m 0700 "$CONFIG_DIR"

# Normalizar el archivo creado desde Windows:
# - CRLF -> LF
# - elimina BOM UTF-8 de la primera línea
# - elimina espacios accidentales alrededor de claves y valores
# - NO imprime el token en pantalla/log
python3 - "$SOURCE_CONFIG" "$CONFIG_DIR/updater.env" <<'PYCFG'
from pathlib import Path
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

raw = src.read_bytes()
if raw.startswith(b"\xef\xbb\xbf"):
    raw = raw[3:]

txt = raw.decode("utf-8", errors="strict").replace("\r\n", "\n").replace("\r", "\n")

out = []
for line in txt.splitlines():
    s = line.strip()
    if not s or s.startswith("#"):
        continue
    if "=" not in s:
        continue
    k, v = s.split("=", 1)
    k = k.strip()
    v = v.strip()
    # Quitar comillas exteriores accidentales, pero conservar contenido.
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
        v = v[1:-1]
    out.append(f"{k}={v}")

dst.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
PYCFG

chmod 0600 "$CONFIG_DIR/updater.env"

# shellcheck disable=SC1090
source "$CONFIG_DIR/updater.env"

: "${GITHUB_OWNER:?Falta GITHUB_OWNER}"
: "${GITHUB_REPO:?Falta GITHUB_REPO}"
: "${GITHUB_TOKEN:?Falta GITHUB_TOKEN}"
: "${DEVICE_ID:?Falta DEVICE_ID}"

# Limpiar por seguridad cualquier carácter CR residual.
GITHUB_OWNER="${GITHUB_OWNER//$'\r'/}"
GITHUB_REPO="${GITHUB_REPO//$'\r'/}"
GITHUB_TOKEN="${GITHUB_TOKEN//$'\r'/}"
DEVICE_ID="${DEVICE_ID//$'\r'/}"
CHANNEL="${CHANNEL:-stable}"
CHANNEL="${CHANNEL//$'\r'/}"
AUTO_INSTALL="${AUTO_INSTALL:-1}"
AUTO_INSTALL="${AUTO_INSTALL//$'\r'/}"

# Validaciones tempranas para evitar errores de curl difíciles de interpretar.
[[ "$GITHUB_OWNER" =~ ^[A-Za-z0-9_.-]+$ ]] || die "GITHUB_OWNER contiene caracteres inválidos."
[[ "$GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+$ ]] || die "GITHUB_REPO contiene caracteres inválidos."
[[ -n "$GITHUB_TOKEN" ]] || die "GITHUB_TOKEN está vacío."
[[ "$DEVICE_ID" =~ ^[A-Za-z0-9_.-]+$ ]] || die "DEVICE_ID contiene caracteres inválidos."

cat >> "$CONFIG_DIR/updater.env" <<EOF

APP_ROOT=$APP_ROOT
APP_DIR=$APP_DIR
RELEASES_DIR=$RELEASES_DIR
BACKUPS_DIR=$BACKUPS_DIR
STATE_DIR=$STATE_DIR
SERVICE_NAME=$SERVICE_NAME
HEALTH_URL=http://127.0.0.1:${APP_PORT}/api/health
EOF
chmod 0600 "$CONFIG_DIR/updater.env"

ok "Credencial copiada a $CONFIG_DIR/updater.env"
echo "DEVICE_ID=$DEVICE_ID"
echo "Repositorio=$GITHUB_OWNER/$GITHUB_REPO"
echo "Canal=$CHANNEL"

# ------------------------------------------------------------
# 3. Dependencias Linux
# ------------------------------------------------------------
say "Instalando dependencias del sistema"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  ca-certificates curl gnupg jq rsync tar gzip unzip git \
  build-essential python3 python3-venv python3-pip pkg-config \
  postgresql postgresql-client libpq-dev \
  nginx openssl

ok "Dependencias Linux instaladas"

# ------------------------------------------------------------
# 4. Node.js 20+
# ------------------------------------------------------------
say "Validando Node.js"

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "$NODE_MAJOR" -ge 20 ]]; then
    NEED_NODE=0
  fi
fi

if [[ "$NEED_NODE" -eq 1 ]]; then
  say "Instalando Node.js 20 LTS"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

node --version
npm --version
ok "Node.js listo"

# ------------------------------------------------------------
# 5. Usuario de servicio y directorios
# ------------------------------------------------------------
say "Preparando usuario y directorios Shiny"

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/shiny \
    --shell /usr/sbin/nologin "$APP_USER"
fi

install -d -o "$APP_USER" -g "$APP_GROUP" -m 0755 \
  "$APP_ROOT" "$APP_DIR" "$RELEASES_DIR" "$BACKUPS_DIR"
install -d -m 0755 "$BIN_DIR" "$STATE_DIR" "$LOG_DIR"

# ------------------------------------------------------------
# 6. PostgreSQL
# ------------------------------------------------------------
say "Configurando PostgreSQL"

systemctl enable --now postgresql

DB_PASS_FILE="$CONFIG_DIR/db-password"
if [[ -s "$DB_PASS_FILE" ]]; then
  DB_PASSWORD="$(cat "$DB_PASS_FILE")"
else
  DB_PASSWORD="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
  printf '%s' "$DB_PASSWORD" > "$DB_PASS_FILE"
  chmod 0600 "$DB_PASS_FILE"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 \
    --set=db_user="$DB_USER" --set=db_pass="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_pass') \gexec
SQL
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 \
    --set=db_user="$DB_USER" --set=db_pass="$DB_PASSWORD" <<'SQL'
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_pass') \gexec
SQL
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -c "ALTER DATABASE \"$DB_NAME\" OWNER TO \"$DB_USER\";" >/dev/null

ok "PostgreSQL listo: DB=$DB_NAME USER=$DB_USER"

# ------------------------------------------------------------
# 7. Descargar última Release privada
# ------------------------------------------------------------
say "Consultando última Release de GitHub"

API="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"
API_HEADERS=(
  -H "Accept: application/vnd.github+json"
  -H "Authorization: Bearer $GITHUB_TOKEN"
  -H "X-GitHub-Api-Version: 2022-11-28"
)
ASSET_HEADERS=(
  -H "Accept: application/octet-stream"
  -H "Authorization: Bearer $GITHUB_TOKEN"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

rm -rf "$STAGE_ROOT"
mkdir -p "$STAGE_ROOT"
LATEST_JSON="$STAGE_ROOT/latest.json"

curl -fsSL "${API_HEADERS[@]}" "$API/releases/latest" -o "$LATEST_JSON"

TAG="$(jq -r '.tag_name // empty' "$LATEST_JSON")"
[[ -n "$TAG" ]] || die "GitHub no devolvió tag_name en releases/latest"
VERSION="${TAG#v}"

PKG_NAME="shiny-rpi-${VERSION}.tar.gz"
MANIFEST_NAME="manifest-${VERSION}.json"

asset_api_url(){
  local name="$1"
  jq -r --arg n "$name" '.assets[] | select(.name==$n) | .url' "$LATEST_JSON" | head -n1
}

PKG_URL="$(asset_api_url "$PKG_NAME")"
MANIFEST_URL="$(asset_api_url "$MANIFEST_NAME")"

[[ -n "$PKG_URL" ]] || die "No existe asset $PKG_NAME en Release $TAG"
[[ -n "$MANIFEST_URL" ]] || die "No existe asset $MANIFEST_NAME en Release $TAG"

RELEASE_DIR="$RELEASES_DIR/$VERSION"
mkdir -p "$RELEASE_DIR"

curl -fsSL "${ASSET_HEADERS[@]}" \
  "$MANIFEST_URL" -o "$RELEASE_DIR/$MANIFEST_NAME"

curl -fsSL "${ASSET_HEADERS[@]}" \
  "$PKG_URL" -o "$RELEASE_DIR/$PKG_NAME"

if ! jq -e '.sha256 and (.sha256 | type=="string") and (.sha256 | length > 0)' \
  "$RELEASE_DIR/$MANIFEST_NAME" >/dev/null 2>&1; then
  die "Manifest descargado sin sha256. GitHub devolvió metadata del asset en vez del archivo."
fi

EXPECTED_SHA="$(jq -r '.sha256' "$RELEASE_DIR/$MANIFEST_NAME" | tr -d '\r\n' | tr 'A-F' 'a-f')"
ACTUAL_SHA="$(sha256sum "$RELEASE_DIR/$PKG_NAME" | awk '{print $1}' | tr 'A-F' 'a-f')"

[[ -n "$EXPECTED_SHA" ]] || die "Manifest sin sha256"
[[ "$EXPECTED_SHA" == "$ACTUAL_SHA" ]] || die \
  "SHA256 incorrecto. Esperado=$EXPECTED_SHA Actual=$ACTUAL_SHA"

ok "Release $TAG descargada y SHA256 validado"

# ------------------------------------------------------------
# 8. Extraer aplicación SIN Visual Search Python
# ------------------------------------------------------------
say "Instalando código Shiny"

STAGE_APP="$STAGE_ROOT/app"
mkdir -p "$STAGE_APP"
tar -xzf "$RELEASE_DIR/$PKG_NAME" -C "$STAGE_APP"

# Si el tar contiene una carpeta raíz única, entrar en ella.
if [[ ! -d "$STAGE_APP/backend" && ! -d "$STAGE_APP/frontend" ]]; then
  ONLY_DIR="$(find "$STAGE_APP" -mindepth 1 -maxdepth 1 -type d | head -n1 || true)"
  if [[ -n "$ONLY_DIR" && -d "$ONLY_DIR/backend" ]]; then
    STAGE_APP="$ONLY_DIR"
  fi
fi

[[ -d "$STAGE_APP/backend" ]] || die "El paquete no contiene backend/"
[[ -d "$STAGE_APP/frontend" ]] || die "El paquete no contiene frontend/"

# Copiar código. No se instala el servicio pesado visual.
rsync -a --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'backend/.env' \
  --exclude 'node_modules' \
  --exclude 'backend/node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude 'backend/uploads' \
  --exclude 'uploads' \
  --exclude '_shiny_backups' \
  --exclude 'services/visual-search-beta' \
  "$STAGE_APP/" "$APP_DIR/"

rm -rf "$APP_DIR/services/visual-search-beta" 2>/dev/null || true

printf '%s\n' "$VERSION" > "$APP_DIR/VERSION"

ok "Código instalado en $APP_DIR"
ok "Visual Search Python / OpenCV / OpenCLIP omitidos"

# ------------------------------------------------------------
# 9. Configurar backend
# ------------------------------------------------------------
say "Configurando backend"

BACKEND_ENV="$APP_DIR/backend/.env"

upsert_env(){
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

upsert_env "$BACKEND_ENV" "NODE_ENV" "production"
upsert_env "$BACKEND_ENV" "HOST" "0.0.0.0"
upsert_env "$BACKEND_ENV" "PORT" "$APP_PORT"
upsert_env "$BACKEND_ENV" "PGHOST" "127.0.0.1"
upsert_env "$BACKEND_ENV" "PGPORT" "5432"
upsert_env "$BACKEND_ENV" "PGDATABASE" "$DB_NAME"
upsert_env "$BACKEND_ENV" "PGUSER" "$DB_USER"
upsert_env "$BACKEND_ENV" "PGPASSWORD" "$DB_PASSWORD"
upsert_env "$BACKEND_ENV" "SHINY_VISUAL_SEARCH_DISABLED" "1"
upsert_env "$BACKEND_ENV" "VISUAL_SEARCH_ENABLED" "0"

chmod 0600 "$BACKEND_ENV"

# ------------------------------------------------------------
# 10. npm install + build
# ------------------------------------------------------------
say "Instalando dependencias Node.js"

npm_install_dir(){
  local dir="$1" prod="${2:-0}"
  [[ -f "$dir/package.json" ]] || return 0
  echo "-- npm: $dir"
  if [[ "$prod" == "1" ]]; then
    if [[ -f "$dir/package-lock.json" ]]; then
      (cd "$dir" && npm ci --omit=dev)
    else
      (cd "$dir" && npm install --omit=dev)
    fi
  else
    if [[ -f "$dir/package-lock.json" ]]; then
      (cd "$dir" && npm ci)
    else
      (cd "$dir" && npm install)
    fi
  fi
}

# Root sólo si realmente tiene package.json.
npm_install_dir "$APP_DIR" 0
npm_install_dir "$APP_DIR/backend" 0
npm_install_dir "$APP_DIR/frontend" 0

say "Compilando frontend"

if [[ -f "$APP_DIR/frontend/package.json" ]]; then
  if node -e "const p=require('$APP_DIR/frontend/package.json'); process.exit(p.scripts&&p.scripts.build?0:1)"; then
    (cd "$APP_DIR/frontend" && npm run build)
  else
    die "frontend/package.json no tiene script build"
  fi
fi

ok "Frontend compilado"

# ------------------------------------------------------------
# 11. Base de datos limpia + preflight integral de migraciones
# ------------------------------------------------------------
say "Preparando base Shiny con baseline V2.2 y validación integral"

MIGRATION_DIR=""
for d in "$APP_DIR/database/migrations" "$APP_DIR/backend/database/migrations" "$APP_DIR/backend/migrations"; do
  if [[ -d "$d" ]]; then MIGRATION_DIR="$d"; break; fi
done
[[ -n "$MIGRATION_DIR" ]] || die "No encontré database/migrations."

RESET_SQL="$MIGRATION_DIR/SHINY_RESET_SCHEMA_V2_2.sql"
[[ -f "$RESET_SQL" ]] || die "Falta baseline obligatorio: SHINY_RESET_SCHEMA_V2_2.sql"

# 001_SHINY_SCHEMA_V1_1.sql es legado y define configuracion.valor como NUMERIC.
# Las migraciones modernas (016, 050, etc.) insertan texto; por eso una
# instalación nueva debe arrancar desde RESET_SCHEMA_V2_2, donde valor es TEXT.
#
# Esta instalación RPi está destinada a entrega nueva. Sólo permitimos
# reconstrucción automática si NO existen administradores ni datos operativos.
ADMIN_ROWS="$(sudo -u postgres psql -d "$DB_NAME" -tAc \
  "SELECT CASE WHEN to_regclass('shiny.administradores') IS NULL THEN 0 ELSE (SELECT count(*) FROM shiny.administradores) END;" \
  2>/dev/null | tr -d '[:space:]' || echo 0)"
PRODUCT_ROWS="$(sudo -u postgres psql -d "$DB_NAME" -tAc \
  "SELECT CASE WHEN to_regclass('shiny.productos') IS NULL THEN 0 ELSE (SELECT count(*) FROM shiny.productos) END;" \
  2>/dev/null | tr -d '[:space:]' || echo 0)"
ORDER_ROWS="$(sudo -u postgres psql -d "$DB_NAME" -tAc \
  "SELECT CASE WHEN to_regclass('shiny.pedidos') IS NULL THEN 0 ELSE (SELECT count(*) FROM shiny.pedidos) END;" \
  2>/dev/null | tr -d '[:space:]' || echo 0)"

if [[ "${ADMIN_ROWS:-0}" -gt 0 || "${PRODUCT_ROWS:-0}" -gt 0 || "${ORDER_ROWS:-0}" -gt 0 ]]; then
  die "La BD ya contiene datos reales (admins=$ADMIN_ROWS productos=$PRODUCT_ROWS pedidos=$ORDER_ROWS). R2.1 no reconstruye una BD con datos."
fi

# Roles técnicos históricos requeridos por 003/004.
for role in shiny_user; do
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$role'" | grep -qx '1'; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $role NOLOGIN;" >/dev/null
  fi
done

# ------------------------------------------------------------------
# PREFLIGHT: probar TODA la cadena en una BD temporal antes de tocar
# nuevamente shiny_db. Si una migración futura es incompatible, el
# instalador se detiene aquí y la BD real queda sin reconstruir.
# ------------------------------------------------------------------
PREFLIGHT_DB="shiny_preflight_$$"
PREFLIGHT_DIR="$(mktemp -d /tmp/shiny-preflight.XXXXXX)"

# mktemp crea el directorio 0700 propiedad de root. Como el preflight se
# ejecuta con el usuario postgres, hay que entregarle explícitamente ese
# directorio antes de que psql intente abrir los .sql.
chown postgres:postgres "$PREFLIGHT_DIR"
chmod 0700 "$PREFLIGHT_DIR"

cleanup_preflight() {
  sudo -u postgres dropdb --if-exists "$PREFLIGHT_DB" >/dev/null 2>&1 || true
  rm -rf "$PREFLIGHT_DIR" >/dev/null 2>&1 || true
}
trap cleanup_preflight EXIT

sudo -u postgres createdb "$PREFLIGHT_DB"

install -o postgres -g postgres -m 0600   "$RESET_SQL" "$PREFLIGHT_DIR/SHINY_RESET_SCHEMA_V2_2.sql"

# Ajustar referencias literales al nombre de BD sólo dentro de las copias
# temporales; nunca modifica los SQL del release.
while IFS= read -r -d '' sql; do
  name="$(basename "$sql")"
  case "$name" in
    001_SHINY_SCHEMA_V1_1.sql|SHINY_RESET_SCHEMA_V2_2.sql) continue ;;
  esac
  sed "s/\\bshiny_db\\b/$PREFLIGHT_DB/g" "$sql" > "$PREFLIGHT_DIR/$name"
  chown postgres:postgres "$PREFLIGHT_DIR/$name"
  chmod 0600 "$PREFLIGHT_DIR/$name"
done < <(find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)

# Validación de acceso antes de iniciar PostgreSQL preflight.
sudo -u postgres test -r "$PREFLIGHT_DIR/SHINY_RESET_SCHEMA_V2_2.sql"   || die "Preflight interno: postgres no puede leer el baseline temporal."

echo "Preflight: baseline SHINY_RESET_SCHEMA_V2_2.sql"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$PREFLIGHT_DB" -f "$PREFLIGHT_DIR/SHINY_RESET_SCHEMA_V2_2.sql" >/dev/null

PREFLIGHT_COUNT=0
while IFS= read -r -d '' sql; do
  name="$(basename "$sql")"
  echo "Preflight: $name"
  if ! sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$PREFLIGHT_DB" -f "$sql" >/dev/null; then
    echo "[ERROR] PREFLIGHT falló en: $name" >&2
    echo "[ERROR] shiny_db NO fue reconstruida por R2.1." >&2
    exit 41
  fi
  PREFLIGHT_COUNT=$((PREFLIGHT_COUNT+1))
done < <(find "$PREFLIGHT_DIR" -maxdepth 1 -type f -name '*.sql' ! -name 'SHINY_RESET_SCHEMA_V2_2.sql' -print0 | sort -z)

# Validaciones semánticas que ya detectan el fallo visto en 016.
CFG_TYPE="$(sudo -u postgres psql -d "$PREFLIGHT_DB" -tAc \
 "SELECT data_type FROM information_schema.columns WHERE table_schema='shiny' AND table_name='configuracion' AND column_name='valor';" | tr -d '[:space:]')"
[[ "$CFG_TYPE" == "text" || "$CFG_TYPE" == "charactervarying" ]] || \
  die "Preflight inválido: shiny.configuracion.valor quedó tipo '$CFG_TYPE', debe aceptar texto."

PREFLIGHT_TABLES="$(sudo -u postgres psql -d "$PREFLIGHT_DB" -tAc \
 "SELECT count(*) FROM information_schema.tables WHERE table_schema='shiny';" | tr -d '[:space:]')"
[[ "${PREFLIGHT_TABLES:-0}" -gt 20 ]] || die "Preflight incompleto: sólo $PREFLIGHT_TABLES tablas shiny."

ok "Preflight completo: $PREFLIGHT_COUNT migraciones, $PREFLIGHT_TABLES tablas."

# El preflight pasó: ahora sí reconstruimos la BD real de entrega nueva.
cleanup_preflight
trap - EXIT

say "Reconstruyendo schema shiny con baseline V2.2 validado"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<'SQL'
DROP SCHEMA IF EXISTS shiny CASCADE;
SQL

sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$RESET_SQL"

# Tracker del instalador fuera del schema shiny.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<'SQL'
DROP TABLE IF EXISTS public.shiny_installer_migrations;
CREATE TABLE public.shiny_installer_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.shiny_installer_migrations(filename)
VALUES ('SHINY_RESET_SCHEMA_V2_2.sql');
SQL

while IFS= read -r -d '' sql; do
  name="$(basename "$sql")"
  case "$name" in
    001_SHINY_SCHEMA_V1_1.sql|SHINY_RESET_SCHEMA_V2_2.sql) continue ;;
  esac

  echo "Aplicando validada: $name"
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$sql"

  esc="${name//\'/\'\'}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
    -c "INSERT INTO public.shiny_installer_migrations(filename) VALUES ('$esc') ON CONFLICT DO NOTHING;" >/dev/null
done < <(find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)

# Restaurar credenciales y mínimos privilegios de runtime.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  --set=db_user="$DB_USER" --set=db_pass="$DB_PASSWORD" <<'SQL'
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOCREATEROLE NOCREATEDB NOSUPERUSER NOREPLICATION', :'db_user', :'db_pass') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'db_user') \gexec

GRANT USAGE ON SCHEMA shiny, public TO :"db_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shiny, public TO :"db_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA shiny, public TO :"db_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiny, public TO :"db_user";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shiny
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"db_user";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shiny
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"db_user";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shiny
  GRANT EXECUTE ON FUNCTIONS TO :"db_user";
SQL

export PGPASSWORD="$DB_PASSWORD"
RUNTIME_USER="$(psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT current_user;' | tr -d '[:space:]')"
RUNTIME_CFG_TYPE="$(psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc \
 "SELECT data_type FROM information_schema.columns WHERE table_schema='shiny' AND table_name='configuracion' AND column_name='valor';" | tr -d '[:space:]')"
RUNTIME_TABLES="$(psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc \
 "SELECT count(*) FROM information_schema.tables WHERE table_schema='shiny';" | tr -d '[:space:]')"
unset PGPASSWORD

[[ "$RUNTIME_USER" == "$DB_USER" ]] || die "Runtime DB user incorrecto: $RUNTIME_USER"
[[ "$RUNTIME_CFG_TYPE" == "text" || "$RUNTIME_CFG_TYPE" == "charactervarying" ]] || \
  die "configuracion.valor incorrecto después de instalación: $RUNTIME_CFG_TYPE"
[[ "${RUNTIME_TABLES:-0}" -gt 20 ]] || die "Instalación DB incompleta: $RUNTIME_TABLES tablas."

ok "BD instalada desde baseline V2.2."
ok "Cadena completa validada ANTES de aplicarla."
ok "Runtime PostgreSQL validado como $DB_USER."

# ------------------------------------------------------------
# 12. Runner backend
# ------------------------------------------------------------
say "Creando servicio Shiny"

RUNNER="$BIN_DIR/run-shiny-backend.sh"
cat > "$RUNNER" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
cd "$APP_DIR/backend"
set -a
source "$BACKEND_ENV"
set +a

if node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts.start?0:1)" 2>/dev/null; then
  exec npm start
fi

for f in src/server.js src/index.js server.js index.js app.js; do
  if [[ -f "\$f" ]]; then
    exec node "\$f"
  fi
done

echo "No se encontró script npm start ni entrypoint conocido." >&2
exit 20
EOF
chmod 0755 "$RUNNER"

cat > "/etc/systemd/system/$SERVICE_NAME" <<EOF
[Unit]
Description=Shiny Application Backend
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR/backend
Environment=NODE_ENV=production
ExecStart=$RUNNER
Restart=on-failure
RestartSec=5
TimeoutStartSec=90
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
EOF

chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"
chown root:root "$BACKEND_ENV"
chmod 0600 "$BACKEND_ENV"
# Permitir al usuario Shiny leer sólo el env mediante grupo propio.
chgrp "$APP_GROUP" "$BACKEND_ENV"
chmod 0640 "$BACKEND_ENV"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 4
systemctl --no-pager --full status "$SERVICE_NAME" || true

# ------------------------------------------------------------
# 13. Nginx
# ------------------------------------------------------------
say "Configurando nginx"

NGINX_SITE="/etc/nginx/sites-available/shiny"
cat > "$NGINX_SITE" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;
    client_max_body_size 50m;

    root $APP_DIR/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/shiny
nginx -t
systemctl enable --now nginx
systemctl reload nginx

ok "nginx configurado en puerto 80"

# ------------------------------------------------------------
# 14. Helper de migraciones para futuras actualizaciones
# ------------------------------------------------------------
cat > "$BIN_DIR/apply-sql-migrations.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/shiny/app}"
BACKEND_ENV="$APP_DIR/backend/.env"
[[ -f "$BACKEND_ENV" ]] || exit 0

set -a
source "$BACKEND_ENV"
set +a

DB="${PGDATABASE:-shiny_db}"
APP_DB_USER="${PGUSER:-shiny_app}"
APP_DB_PASS="${PGPASSWORD:-}"

DIR=""
for d in "$APP_DIR/database/migrations" "$APP_DIR/backend/database/migrations" "$APP_DIR/backend/migrations"; do
  [[ -d "$d" ]] && { DIR="$d"; break; }
done
[[ -n "$DIR" ]] || exit 0

# Las migraciones Shiny son administrativas y se ejecutan siempre como
# postgres; el usuario de aplicación nunca recibe CREATEROLE/SUPERUSER.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='shiny_user'" | grep -qx '1'; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c 'CREATE ROLE shiny_user NOLOGIN;' >/dev/null
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
CREATE TABLE IF NOT EXISTS public.shiny_installer_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

while IFS= read -r -d '' sql; do
  name="$(basename "$sql")"
  case "$name" in
    001_SHINY_SCHEMA_V1_1.sql|SHINY_RESET_SCHEMA_V2_2.sql) continue ;;
  esac
  esc="${name//\'/\'\'}"
  x="$(sudo -u postgres psql -d "$DB" -tAc \
    "SELECT 1 FROM public.shiny_installer_migrations WHERE filename='$esc' LIMIT 1;" \
    | tr -d '[:space:]' || true)"
  [[ "$x" == "1" ]] && continue

  echo "Aplicando migración como postgres: $name"
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$sql"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" \
    -c "INSERT INTO public.shiny_installer_migrations(filename) VALUES ('$esc') ON CONFLICT DO NOTHING;" >/dev/null
done < <(find "$DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)

# Restaurar permisos runtime del usuario de aplicación.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" \
  --set=db_user="$APP_DB_USER" --set=db_pass="$APP_DB_PASS" <<'SQL'
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOCREATEROLE NOCREATEDB NOSUPERUSER NOREPLICATION', :'db_user', :'db_pass') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'db_user') \gexec

GRANT USAGE ON SCHEMA shiny, public TO :"db_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shiny, public TO :"db_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA shiny, public TO :"db_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiny, public TO :"db_user";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shiny
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"db_user";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shiny
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"db_user";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shiny
  GRANT EXECUTE ON FUNCTIONS TO :"db_user";
SQL
EOF
chmod 0755 "$BIN_DIR/apply-sql-migrations.sh"

# ------------------------------------------------------------
# 15. Agente administrado de actualizaciones
# ------------------------------------------------------------
say "Instalando agente de actualizaciones"

cat > "$BIN_DIR/shiny-update-agent.sh" <<'AGENT'
#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG="${SHINY_UPDATER_CONFIG:-/etc/shiny-updater/updater.env}"
[[ -f "$CONFIG" ]] || { echo "No existe $CONFIG"; exit 2; }
# Normalizar CRLF/BOM por si updater.env fue editado desde Windows.
sed -i '1s/^\xEF\xBB\xBF//' "$CONFIG" 2>/dev/null || true
sed -i 's/\r$//' "$CONFIG" 2>/dev/null || true

# shellcheck disable=SC1090
source "$CONFIG"

GITHUB_OWNER="${GITHUB_OWNER//$'\r'/}"
GITHUB_REPO="${GITHUB_REPO//$'\r'/}"
GITHUB_TOKEN="${GITHUB_TOKEN//$'\r'/}"
DEVICE_ID="${DEVICE_ID//$'\r'/}"

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

api_headers=(-H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28")
asset_headers=(-H "Accept: application/octet-stream" -H "Authorization: Bearer $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28")

current_version(){
  [[ -f "$APP_DIR/VERSION" ]] && tr -d '\r\n ' < "$APP_DIR/VERSION" || echo "0.0.0"
}

fetch_latest(){ curl -fsSL "${api_headers[@]}" "$API/releases/latest" -o "$LATEST_JSON"; }

asset_url(){
  local n="$1"
  jq -r --arg n "$n" '.assets[] | select(.name==$n) | .url' "$LATEST_JSON" | head -n1
}

download_asset(){
  curl -fsSL "${asset_headers[@]}" "$1" -o "$2"
}

write_state(){
  local status="$1" available="$2" message="$3"
  jq -n \
    --arg device "$DEVICE_ID" \
    --arg current "$(current_version)" \
    --arg available "$available" \
    --arg status "$status" \
    --arg message "$message" \
    --arg checked "$(date -Iseconds)" \
    '{device_id:$device,current_version:$current,available_version:$available,status:$status,message:$message,checked_at:$checked}' \
    > "$STATE_JSON"
}

check_cmd(){
  fetch_latest
  local tag ver cur
  tag="$(jq -r '.tag_name' "$LATEST_JSON")"
  ver="${tag#v}"
  cur="$(current_version)"
  if [[ "$ver" == "$cur" ]]; then
    write_state "up_to_date" "$ver" "Sin actualización pendiente."
    echo "CURRENT_VERSION=$cur"
    echo "LATEST_VERSION=$ver"
    echo "STATUS=up_to_date"
  else
    write_state "available" "$ver" "Actualización disponible."
    echo "CURRENT_VERSION=$cur"
    echo "LATEST_VERSION=$ver"
    echo "STATUS=available"
    [[ "${AUTO_INSTALL:-0}" == "1" ]] && install_cmd
  fi
}

install_cmd(){
  fetch_latest
  local tag ver cur pkg manifest work pkg_url manifest_url expected actual backup stage
  tag="$(jq -r '.tag_name' "$LATEST_JSON")"
  ver="${tag#v}"
  cur="$(current_version)"
  [[ "$ver" != "$cur" ]] || { echo "Ya está instalada $ver"; exit 0; }

  pkg="shiny-rpi-${ver}.tar.gz"
  manifest="manifest-${ver}.json"
  pkg_url="$(asset_url "$pkg")"
  manifest_url="$(asset_url "$manifest")"
  [[ -n "$pkg_url" && -n "$manifest_url" ]] || { echo "Release incompleta"; exit 5; }

  work="$RELEASES_DIR/$ver"
  mkdir -p "$work"
  download_asset "$manifest_url" "$work/$manifest"
  download_asset "$pkg_url" "$work/$pkg"

  if ! jq -e '.sha256 and (.sha256 | type=="string") and (.sha256 | length > 0)' "$work/$manifest" >/dev/null 2>&1; then
    write_state "error" "$ver" "Manifest descargado sin sha256."
    echo "ERROR: manifest descargado sin sha256."
    exit 6
  fi
  expected="$(jq -r '.sha256' "$work/$manifest" | tr -d '\r\n' | tr 'A-F' 'a-f')"
  actual="$(sha256sum "$work/$pkg" | awk '{print $1}' | tr 'A-F' 'a-f')"
  [[ "$expected" == "$actual" ]] || { write_state "error" "$ver" "SHA256 inválido."; exit 6; }

  backup="$BACKUPS_DIR/pre-${ver}-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  rsync -a --exclude node_modules --exclude .git "$APP_DIR/" "$backup/app/"

  stage="$work/stage"
  rm -rf "$stage"; mkdir -p "$stage"
  tar -xzf "$work/$pkg" -C "$stage"

  if [[ ! -d "$stage/backend" ]]; then
    only="$(find "$stage" -mindepth 1 -maxdepth 1 -type d | head -n1 || true)"
    [[ -n "$only" && -d "$only/backend" ]] && stage="$only"
  fi

  cp "$APP_DIR/backend/.env" "$work/backend.env.preserve"

  rsync -a --delete \
    --exclude '.env' \
    --exclude 'backend/.env' \
    --exclude 'backend/uploads' \
    --exclude 'uploads' \
    --exclude '_shiny_backups' \
    --exclude 'services/visual-search-beta' \
    "$stage/" "$APP_DIR/"

  rm -rf "$APP_DIR/services/visual-search-beta" 2>/dev/null || true
  cp "$work/backend.env.preserve" "$APP_DIR/backend/.env"

  if [[ -f "$APP_DIR/backend/package-lock.json" ]]; then
    (cd "$APP_DIR/backend" && npm ci)
  elif [[ -f "$APP_DIR/backend/package.json" ]]; then
    (cd "$APP_DIR/backend" && npm install)
  fi

  if [[ -f "$APP_DIR/frontend/package-lock.json" ]]; then
    (cd "$APP_DIR/frontend" && npm ci)
  elif [[ -f "$APP_DIR/frontend/package.json" ]]; then
    (cd "$APP_DIR/frontend" && npm install)
  fi

  (cd "$APP_DIR/frontend" && npm run build)

  if [[ -x /usr/local/lib/shiny-updater/apply-sql-migrations.sh ]]; then
    /usr/local/lib/shiny-updater/apply-sql-migrations.sh
  fi

  echo "$ver" > "$APP_DIR/VERSION"
  chown -R shiny:shiny "$APP_DIR"
  chown root:shiny "$APP_DIR/backend/.env"
  chmod 0640 "$APP_DIR/backend/.env"

  systemctl restart "$SERVICE_NAME"
  sleep 5

  health="${HEALTH_URL:-http://127.0.0.1:8787/api/health}"
  if ! curl -fsS --max-time 10 "$health" >/dev/null; then
    echo "Health check falló; rollback."
    systemctl stop "$SERVICE_NAME" || true
    rsync -a --delete "$backup/app/" "$APP_DIR/"
    systemctl start "$SERVICE_NAME" || true
    write_state "rollback" "$ver" "Health check falló; rollback aplicado."
    exit 8
  fi

  write_state "installed" "$ver" "Actualización instalada."
  echo "Actualización $ver instalada correctamente."
}

status_cmd(){
  echo "DEVICE_ID=$DEVICE_ID"
  echo "CURRENT_VERSION=$(current_version)"
  [[ -f "$STATE_JSON" ]] && cat "$STATE_JSON" || echo "Sin estado previo."
}

case "${1:-status}" in
  status) status_cmd ;;
  check) check_cmd ;;
  install) install_cmd ;;
  *) echo "Uso: $0 {status|check|install}"; exit 1 ;;
esac
AGENT
chmod 0755 "$BIN_DIR/shiny-update-agent.sh"

cat > /etc/systemd/system/shiny-updater.service <<EOF
[Unit]
Description=Shiny Managed Update Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$BIN_DIR/shiny-update-agent.sh check
User=root
Group=root
Nice=10
EOF

cat > /etc/systemd/system/shiny-updater.timer <<'EOF'
[Unit]
Description=Consulta periódica de actualizaciones Shiny

[Timer]
OnBootSec=45s
OnUnitActiveSec=5min
AccuracySec=15s
RandomizedDelaySec=0
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now shiny-updater.timer

# SHINY_RPI_AUTO_R1_BEGIN
# Provision de sistema final: updater inmediato, LAN/mDNS y dos Quick Tunnels.
RPI_AUTO_PROVISION="$APP_DIR/SHINY-RPI-MANAGED-R1/PROVISIONAR-SHINY-RPI-AUTO-R1.sh"
if [[ -f "$RPI_AUTO_PROVISION" ]]; then
  chmod 0755 "$RPI_AUTO_PROVISION"
  APP_DIR="$APP_DIR" "$RPI_AUTO_PROVISION" || warn "Provision RPi automatico no pudo completarse."
else
  warn "No existe $RPI_AUTO_PROVISION"
fi
# SHINY_RPI_AUTO_R1_ENDok "Updater instalado. AUTO_INSTALL=${AUTO_INSTALL}"

# ------------------------------------------------------------
# 16. Cloudflared opcional
# ------------------------------------------------------------
if [[ "$INSTALL_CLOUDFLARED" == "1" ]]; then
  say "Instalando cloudflared"
  TMP_DEB="$STAGE_ROOT/cloudflared.deb"
  curl -fsSL \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb" \
    -o "$TMP_DEB"
  dpkg -i "$TMP_DEB" || apt-get -f install -y
  cloudflared --version
  warn "cloudflared instalado, pero NO se configuró un túnel/token."
fi


# SHINY_LAN_MDNS_R1_BEGIN
# Acceso LAN local independiente de Internet.
# Mantiene DHCP y publica http://shyny-panel.local mediante mDNS + Nginx.
LAN_INSTALLER="$SCRIPT_DIR/INSTALAR-SHINY-LAN-MDNS-R1.sh"
if [[ -f "$LAN_INSTALLER" ]]; then
  chmod 0755 "$LAN_INSTALLER"
  bash "$LAN_INSTALLER"
else
  warn "No encontre $LAN_INSTALLER; se omite configuracion LAN/mDNS."
fi
# SHINY_LAN_MDNS_R1_END
# ------------------------------------------------------------
# 17. Validaciones
# ------------------------------------------------------------
say "Validando instalación"

systemctl is-enabled "$SERVICE_NAME" >/dev/null
systemctl is-enabled nginx >/dev/null
systemctl is-enabled shiny-updater.timer >/dev/null

echo "Backend local:"
BACKEND_OK=0
for url in \
  "http://127.0.0.1:${APP_PORT}/api/health" \
  "http://127.0.0.1:${APP_PORT}/health" \
  "http://127.0.0.1:${APP_PORT}/"; do
  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    echo "  OK $url"
    BACKEND_OK=1
    break
  fi
done

if [[ "$BACKEND_OK" -ne 1 ]]; then
  warn "Backend no respondió aún. Se mostrarán logs."
  journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
fi

if curl -fsS --max-time 5 http://127.0.0.1/ >/dev/null 2>&1; then
  ok "Frontend/nginx responde en http://127.0.0.1/"
else
  warn "nginx no respondió correctamente."
fi

"$BIN_DIR/shiny-update-agent.sh" check || warn "El updater no pudo consultar GitHub."

# ------------------------------------------------------------
# 18. Retirar copia de token de partición/USB
# ------------------------------------------------------------
if [[ "$SOURCE_CONFIG" != "$CONFIG_DIR/updater.env" ]]; then
  rm -f "$SOURCE_CONFIG" || true
  ok "Se eliminó la copia de updater.env del medio de instalación."
fi

rm -rf "$STAGE_ROOT"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo
echo "============================================================"
echo " SHINY RPI INSTALADO"
echo "============================================================"
echo "Version      : $VERSION"
echo "Device ID    : $DEVICE_ID"
echo "Aplicacion   : $APP_DIR"
echo "Backend      : 127.0.0.1:$APP_PORT"
echo "Web local    : http://${IP:-IP_DE_LA_RPI}/"
echo "Servicio     : $SERVICE_NAME"
echo "Updater      : shiny-updater.timer"
echo "Auto install : $AUTO_INSTALL"
echo "Visual/OCR   : servicio Python NO instalado"
echo
echo "Comandos utiles:"
echo "  sudo systemctl status $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"
echo "  sudo $BIN_DIR/shiny-update-agent.sh status"
echo "  sudo $BIN_DIR/shiny-update-agent.sh check"
echo
echo "Recomendado: reiniciar una vez:"
echo "  sudo reboot"
echo "============================================================"
