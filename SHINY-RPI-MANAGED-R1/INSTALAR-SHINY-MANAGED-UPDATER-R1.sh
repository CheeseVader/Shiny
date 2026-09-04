#!/usr/bin/env bash
set -euo pipefail

# SHINY RPI MANAGED UPDATER R1
# Instala un agente local de actualizaciones administradas.
# No guarda usuario/contraseña personal de GitHub.
# Usa un token de SOLO LECTURA en /etc/shiny-updater/updater.env

APP_ROOT="${APP_ROOT:-/opt/shiny}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
RELEASES_DIR="${RELEASES_DIR:-$APP_ROOT/releases}"
BACKUPS_DIR="${BACKUPS_DIR:-$APP_ROOT/backups}"
CONFIG_DIR="${CONFIG_DIR:-/etc/shiny-updater}"
BIN_DIR="${BIN_DIR:-/usr/local/lib/shiny-updater}"
STATE_DIR="${STATE_DIR:-/var/lib/shiny-updater}"
LOG_DIR="${LOG_DIR:-/var/log/shiny-updater}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Ejecuta este instalador con sudo."
    exit 1
  fi
}

ask() {
  local prompt="$1" default="${2:-}" value
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " value
    echo "${value:-$default}"
  else
    read -r -p "$prompt: " value
    echo "$value"
  fi
}

require_root

echo "============================================================"
echo " SHINY RPI MANAGED UPDATER R1"
echo "============================================================"
echo

GITHUB_OWNER="$(ask "GitHub Organization/Owner para releases" "ShinyPOS")"
GITHUB_REPO="$(ask "Repositorio privado de releases" "shiny-rpi-releases")"
CHANNEL="$(ask "Canal" "stable")"
DEVICE_ID="$(ask "ID de esta Raspberry" "SHINY-MX-0001")"
SERVICE_NAME="$(ask "Servicio systemd principal de Shiny" "shiny-app.service")"

echo
echo "IMPORTANTE:"
echo "- Usa un Fine-grained token o credencial de SOLO LECTURA para Releases/Contents."
echo "- No uses tu contraseña ni un token con escritura."
echo
read -r -s -p "Token GitHub de SOLO LECTURA (no se mostrará): " GITHUB_TOKEN
echo
if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "Token vacío; abortando."
  exit 2
fi

install -d -m 0755 "$BIN_DIR" "$STATE_DIR" "$LOG_DIR" "$RELEASES_DIR" "$BACKUPS_DIR"
install -d -m 0700 "$CONFIG_DIR"

cat > "$CONFIG_DIR/updater.env" <<EOF
GITHUB_OWNER=$GITHUB_OWNER
GITHUB_REPO=$GITHUB_REPO
GITHUB_TOKEN=$GITHUB_TOKEN
CHANNEL=$CHANNEL
DEVICE_ID=$DEVICE_ID
APP_ROOT=$APP_ROOT
APP_DIR=$APP_DIR
RELEASES_DIR=$RELEASES_DIR
BACKUPS_DIR=$BACKUPS_DIR
STATE_DIR=$STATE_DIR
SERVICE_NAME=$SERVICE_NAME
AUTO_INSTALL=0
EOF
chmod 0600 "$CONFIG_DIR/updater.env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 0755 "$SCRIPT_DIR/shiny-update-agent.sh" "$BIN_DIR/shiny-update-agent.sh"

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
OnBootSec=5min
OnUnitActiveSec=6h
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now shiny-updater.timer

echo
echo "Instalación completada."
echo "Config: $CONFIG_DIR/updater.env"
echo "Estado: $STATE_DIR"
echo
echo "Comandos:"
echo "  sudo $BIN_DIR/shiny-update-agent.sh status"
echo "  sudo $BIN_DIR/shiny-update-agent.sh check"
echo "  sudo $BIN_DIR/shiny-update-agent.sh install"
echo
echo "AUTO_INSTALL queda DESACTIVADO por seguridad."
