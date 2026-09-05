#!/usr/bin/env bash
set -Eeuo pipefail

# SHINY_RPI_AUTO_R1_4
# Provision autocontenido para una RPi existente:
# - AUTO_INSTALL=1
# - updater ~20 s despues del arranque y cada 6 h
# - LAN/mDNS shyny-panel.local
# - Cloudflare Quick Tunnel STAFF -> 8788
# - STORE -> 8789 solo si SHINY_CF_ENABLE_STORE=1
#
# Debe ejecutarse como root desde npm postinstall/updater.

log(){ echo "[SHINY-RPI-AUTO] $*"; }
warn(){ echo "[SHINY-RPI-AUTO][AVISO] $*" >&2; }

if [[ "$(id -u)" -ne 0 ]]; then
  warn "Sin privilegios root; omitiendo provision del sistema."
  exit 0
fi

[[ "$(uname -s)" == "Linux" ]] || exit 0

APP_DIR="${APP_DIR:-/opt/shiny/app}"
CONFIG="${SHINY_UPDATER_CONFIG:-/etc/shiny-updater/updater.env}"
STATE_DIR="/var/lib/shiny-cloudflare"
BIN_DIR="/usr/local/lib/shiny-cloudflare"
LOCAL_HOSTNAME="${SHINY_LOCAL_HOSTNAME:-shyny-panel}"
STAFF_PORT="${SHINY_INTERNAL_ENTRY_PORT:-8788}"
STORE_PORT="${SHINY_STORE_ENTRY_PORT:-8789}"
ENABLE_STORE="${SHINY_CF_ENABLE_STORE:-0}"
SERVICE_NAME="${SERVICE_NAME:-shiny-app.service}"
APP_USER="${SHINY_APP_USER:-shiny}"

mkdir -p "$STATE_DIR" "$BIN_DIR"
chmod 0755 "$STATE_DIR" "$BIN_DIR"

# Cargar configuracion existente sin imprimir secretos.
if [[ -f "$CONFIG" ]]; then
  set +u
  # shellcheck disable=SC1090
  source "$CONFIG"
  set -u
  SERVICE_NAME="${SERVICE_NAME:-shiny-app.service}"
APP_USER="${SHINY_APP_USER:-shiny}"
fi

# ------------------------------------------------------------
# 1. AUTO_INSTALL=1 preservando el resto de updater.env
# ------------------------------------------------------------
if [[ -f "$CONFIG" ]]; then
  python3 - "$CONFIG" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
raw=p.read_text(encoding="utf-8-sig", errors="replace").replace("\r\n","\n")
out=[]
seen=False
for line in raw.splitlines():
    if line.startswith("AUTO_INSTALL="):
        out.append("AUTO_INSTALL=1")
        seen=True
    else:
        out.append(line)
if not seen:
    out.append("AUTO_INSTALL=1")
p.write_text("\n".join(out).rstrip()+"\n", encoding="utf-8")
PY
  chmod 0600 "$CONFIG"
  log "AUTO_INSTALL=1 configurado."
else
  warn "No existe $CONFIG; no se pudo persistir AUTO_INSTALL."
fi

# ------------------------------------------------------------
# 2. Updater automatico al boot y periodico
# ------------------------------------------------------------
cat > /etc/systemd/system/shiny-updater.timer <<'EOF'
[Unit]
Description=Shiny - comprobacion automatica de actualizaciones

[Timer]
OnBootSec=45s
OnUnitActiveSec=5min
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
EOF

# ------------------------------------------------------------
# 3. LAN/mDNS AUTOCONTENIDO
#    No depende de que SHINY-RPI-MANAGED-R1 llegue en el delta.
# ------------------------------------------------------------
# SHINY_UPDATER_RUNTIME_FIX_R118_BEGIN
configure_updater_runtime(){
  local agent="/usr/local/lib/shiny-updater/shiny-update-agent.sh"

  [[ -f "$agent" ]] || {
    warn "No existe $agent; se omite hardening del updater."
    return 0
  }

  python3 - "$agent" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
s = p.read_text(encoding="utf-8")

old = """fetch_releases(){
  curl -fsSL "${api_headers[@]}" "$API/releases?per_page=100" -o "$RELEASES_JSON"
}"""

new = """fetch_releases(){
  local bust tmp
  bust="$(date +%s)"
  tmp="${RELEASES_JSON}.tmp"

  rm -f "$tmp"

  curl -fsSL \
    --retry 5 \
    --retry-all-errors \
    --retry-delay 3 \
    --connect-timeout 10 \
    --max-time 45 \
    "${api_headers[@]}" \
    -H "Cache-Control: no-cache" \
    -H "Pragma: no-cache" \
    "$API/releases?per_page=100&page=1&_=${bust}" \
    -o "$tmp"

  jq -e 'type=="array"' "$tmp" >/dev/null
  mv -f "$tmp" "$RELEASES_JSON"
}"""

if old in s:
    s = s.replace(old, new, 1)
elif 'Cache-Control: no-cache' in s and 'retry-all-errors' in s:
    pass
else:
    print("Updater con formato no reconocido; se deja intacto.", file=sys.stderr)
    raise SystemExit(0)

p.write_text(s, encoding="utf-8")
PY

  bash -n "$agent" || {
    warn "El updater no paso bash -n tras hardening."
    return 0
  }

  chmod 0755 "$agent" || true
  log "Updater runtime endurecido: Releases sin cache + reintentos."
}
configure_updater_runtime || warn "No se pudo persistir hardening del updater."
# SHINY_UPDATER_RUNTIME_FIX_R118_END

configure_lan(){
  export DEBIAN_FRONTEND=noninteractive
  if ! command -v avahi-daemon >/dev/null 2>&1 || ! command -v nginx >/dev/null 2>&1 || ! command -v nmcli >/dev/null 2>&1; then
    apt-get update -y || { warn "Sin Internet para instalar dependencias; Shiny continuara."; return 0; }
    apt-get install -y avahi-daemon avahi-utils nginx curl network-manager xterm || warn "Dependencias de red incompletas."
  fi

  systemctl enable NetworkManager >/dev/null 2>&1 || true
  systemctl start NetworkManager >/dev/null 2>&1 || true
  nmcli networking on >/dev/null 2>&1 || true
  nmcli radio wifi on >/dev/null 2>&1 || true

  hostnamectl set-hostname "$LOCAL_HOSTNAME" >/dev/null 2>&1 || true
  if grep -qE '^[[:space:]]*127\.0\.1\.1[[:space:]]+' /etc/hosts; then
    sed -i -E "s|^[[:space:]]*127\.0\.1\.1[[:space:]].*$|127.0.1.1\t$LOCAL_HOSTNAME|" /etc/hosts
  else
    printf '127.0.1.1\t%s\n' "$LOCAL_HOSTNAME" >> /etc/hosts
  fi

  if grep -qE '^[#[:space:]]*host-name=' /etc/avahi/avahi-daemon.conf; then
    sed -i -E "s|^[#[:space:]]*host-name=.*$|host-name=$LOCAL_HOSTNAME|" /etc/avahi/avahi-daemon.conf
  else
    sed -i "/^\[server\]/a host-name=$LOCAL_HOSTNAME" /etc/avahi/avahi-daemon.conf
  fi
  systemctl enable avahi-daemon >/dev/null 2>&1 || true
  systemctl restart avahi-daemon >/dev/null 2>&1 || true

  # 1.0.17: NO habilitar shiny-local; evita duplicate default_server.
  rm -f /etc/nginx/sites-enabled/shiny-local
  if nginx -t; then
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl restart nginx >/dev/null 2>&1 || true
    log "LAN: http://${LOCAL_HOSTNAME}.local/login"
  else
    warn "nginx -t fallo; no se reinicia."
  fi
}
configure_lan || warn "Provision LAN/mDNS incompleto; Shiny continuara."


# ------------------------------------------------------------
# SHINY_RPI_WIFI_UI_R117
# Administrador Wi-Fi disponible desde /login sin autenticar.
# Solo abre NetworkManager; Shiny nunca recibe la password.
# ------------------------------------------------------------
configure_wifi_ui(){
  local kiosk_user kiosk_uid kiosk_home
  kiosk_user="$(ps -eo user=,comm= | awk '$2 ~ /^chromium/ {print $1; exit}')"
  if [[ -z "$kiosk_user" ]]; then
    kiosk_user="$(awk -F: '$3>=1000 && $3<60000 && $7 !~ /(nologin|false)$/ {print $1; exit}' /etc/passwd)"
  fi
  [[ -n "$kiosk_user" ]] || { warn "Sin usuario grafico para Wi-Fi UI."; return 0; }
  kiosk_uid="$(id -u "$kiosk_user")"
  kiosk_home="$(getent passwd "$kiosk_user" | cut -d: -f6)"

  cat > /usr/local/bin/shiny-open-wifi-ui <<EOF
#!/usr/bin/env bash
set -e
U="$kiosk_user"; UIDX="$kiosk_uid"; H="$kiosk_home"
export HOME="\$H" XDG_RUNTIME_DIR="/run/user/\$UIDX" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/\$UIDX/bus"
export DISPLAY="\${DISPLAY:-:0}" WAYLAND_DISPLAY="\${WAYLAND_DISPLAY:-wayland-0}"
exec runuser -u "\$U" -- env HOME="\$HOME" XDG_RUNTIME_DIR="\$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="\$DBUS_SESSION_BUS_ADDRESS" DISPLAY="\$DISPLAY" WAYLAND_DISPLAY="\$WAYLAND_DISPLAY" xterm -title "Shiny - Configurar Wi-Fi" -geometry 92x28 -e nmtui-connect
EOF
  chmod 0755 /usr/local/bin/shiny-open-wifi-ui

  cat > /etc/systemd/system/shiny-wifi-ui.service <<'EOF'
[Unit]
Description=Shiny - abrir administrador Wi-Fi
After=graphical.target NetworkManager.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/shiny-open-wifi-ui
TimeoutStartSec=120
EOF

  cat > /etc/sudoers.d/shiny-wifi-ui <<EOF
${APP_USER:-shiny} ALL=(root) NOPASSWD: /bin/systemctl --no-block start shiny-wifi-ui.service
${APP_USER:-shiny} ALL=(root) NOPASSWD: /usr/bin/systemctl --no-block start shiny-wifi-ui.service
EOF
  chmod 0440 /etc/sudoers.d/shiny-wifi-ui
  visudo -cf /etc/sudoers.d/shiny-wifi-ui >/dev/null || rm -f /etc/sudoers.d/shiny-wifi-ui
  systemctl daemon-reload
}
configure_wifi_ui || warn "Wi-Fi UI incompleta; Shiny continuara."

# ------------------------------------------------------------
# 4. cloudflared
# ------------------------------------------------------------
install_cloudflared(){
  command -v cloudflared >/dev/null 2>&1 && return 0

  log "Instalando cloudflared..."
  local arch deb_arch url tmp
  arch="$(uname -m)"
  case "$arch" in
    aarch64|arm64) deb_arch="arm64" ;;
    armv7l|armhf)  deb_arch="armhf" ;;
    x86_64|amd64) deb_arch="amd64" ;;
    *)
      warn "Arquitectura no soportada para cloudflared: $arch"
      return 1
      ;;
  esac

  tmp="/var/tmp/cloudflared-${deb_arch}.deb"
  url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${deb_arch}.deb"

  if ! curl -fL --connect-timeout 10 --max-time 120 "$url" -o "$tmp"; then
    warn "No se pudo descargar cloudflared; Shiny seguira local."
    rm -f "$tmp"
    return 1
  fi

  if ! dpkg -i "$tmp"; then
    apt-get -f install -y || true
    dpkg -i "$tmp" || {
      rm -f "$tmp"
      return 1
    }
  fi
  rm -f "$tmp"
  command -v cloudflared >/dev/null 2>&1
}

cat > "$BIN_DIR/run-quick-tunnel.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

NAME="${1:?nombre requerido}"
PORT="${2:?puerto requerido}"
STATE_DIR="/var/lib/shiny-cloudflare"
URL_FILE="$STATE_DIR/${NAME}.url"
LOG_FILE="$STATE_DIR/${NAME}.log"

mkdir -p "$STATE_DIR"
rm -f "$URL_FILE"
: > "$LOG_FILE"

# Esperar al listener de Shiny sin bloquear el servicio principal.
while ! curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; do
  sleep 2
done

cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate 2>&1 |
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$LOG_FILE"
  if [[ "$line" =~ https://[a-z0-9-]+\.trycloudflare\.com ]]; then
    printf '%s\n' "${BASH_REMATCH[0]}" > "$URL_FILE"
    chmod 0644 "$URL_FILE"
  fi
done
EOF
chmod 0755 "$BIN_DIR/run-quick-tunnel.sh"

write_cf_service(){
  local name="$1" port="$2" label="$3"
  cat > "/etc/systemd/system/shiny-cloudflared-${name}.service" <<EOF
[Unit]
Description=Shiny Cloudflare Quick Tunnel - ${label}
After=network-online.target ${SERVICE_NAME}
Wants=network-online.target
Requires=${SERVICE_NAME}

[Service]
Type=simple
ExecStart=${BIN_DIR}/run-quick-tunnel.sh ${name} ${port}
Restart=always
RestartSec=5
User=root
Group=root

[Install]
WantedBy=multi-user.target
EOF
}

if install_cloudflared; then
  write_cf_service "staff" "$STAFF_PORT" "Admin y Cajero"

  systemctl daemon-reload
  systemctl enable shiny-cloudflared-staff.service >/dev/null 2>&1 || true
  systemctl restart shiny-cloudflared-staff.service || true
  log "Cloudflared STAFF -> ${STAFF_PORT} configurado."

  if [[ "$ENABLE_STORE" == "1" ]]; then
    write_cf_service "store" "$STORE_PORT" "Tienda"
    systemctl daemon-reload
    systemctl enable shiny-cloudflared-store.service >/dev/null 2>&1 || true
    systemctl restart shiny-cloudflared-store.service || true
    log "Cloudflared STORE -> ${STORE_PORT} configurado."
  else
    systemctl disable --now shiny-cloudflared-store.service >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/shiny-cloudflared-store.service
    rm -f "$STATE_DIR/store.url"
    systemctl daemon-reload
    log "STORE Cloudflare desactivado por defecto (SHINY_CF_ENABLE_STORE=0)."
  fi
fi

# ------------------------------------------------------------
# 5. Activar nuevo timer
# ------------------------------------------------------------
systemctl daemon-reload
systemctl enable shiny-updater.timer >/dev/null 2>&1 || true
systemctl restart shiny-updater.timer || true

log "Provision RPi automatico completado."
log "STAFF URL: $STATE_DIR/staff.url"
if [[ "$ENABLE_STORE" == "1" ]]; then
  log "STORE URL: $STATE_DIR/store.url"
fi

exit 0