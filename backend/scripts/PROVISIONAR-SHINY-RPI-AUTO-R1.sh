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
# 3. Wi-Fi UI legacy: retirada en 1.0.21
# El administrador Wi-Fi actual vive dentro de Shiny (/api/rpi-wifi).
# ------------------------------------------------------------
remove_legacy_wifi_ui(){
  systemctl disable --now shiny-wifi-ui.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/shiny-wifi-ui.service
  rm -f /usr/local/bin/shiny-open-wifi-ui
  rm -f /etc/sudoers.d/shiny-wifi-ui
  systemctl daemon-reload
}
remove_legacy_wifi_ui || warn "No se pudo limpiar completamente Wi-Fi UI legacy."

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
# 4A. Recarga automatica del kiosk despues de una release
# El kiosk no es systemd: shiny-kiosk.sh es watchdog y relanza Chromium.
# ------------------------------------------------------------
configure_kiosk_release_refresh(){
  cat > /usr/local/sbin/shiny-refresh-kiosk-after-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
sleep 4
mapfile -t pids < <(pgrep -f 'chromium.*shiny-kiosk-profile|chromium-browser.*shiny-kiosk-profile' || true)
if (( ${#pids[@]} > 0 )); then
  kill -TERM "${pids[@]}" 2>/dev/null || true
fi
exit 0
EOF
  chmod 0755 /usr/local/sbin/shiny-refresh-kiosk-after-update
  chown root:root /usr/local/sbin/shiny-refresh-kiosk-after-update
  cat > /etc/systemd/system/shiny-kiosk-version-refresh.service <<'EOF'
[Unit]
Description=Shiny - recargar Chromium kiosk despues de actualizar
After=graphical.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/shiny-refresh-kiosk-after-update
EOF
  cat > /etc/systemd/system/shiny-kiosk-version-refresh.path <<'EOF'
[Unit]
Description=Shiny - vigilar nueva VERSION instalada
[Path]
PathChanged=/opt/shiny/app/VERSION
Unit=shiny-kiosk-version-refresh.service
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now shiny-kiosk-version-refresh.path >/dev/null 2>&1 || warn "No se pudo activar recarga automatica del kiosk."
}
configure_kiosk_release_refresh || warn "Recarga automatica kiosk incompleta; Shiny continuara."

# ------------------------------------------------------------
# SHINY_FRONTEND_GUARD_R125
# Endurece el updater instalado:
# - si files[] o delete[] toca frontend/, SIEMPRE reconstruye frontend
# - npm frontend solo si lo pide el manifest o falta Vite local
# - build en directorio temporal y swap solo despues de build valido
# El manifest sigue siendo la autoridad para QUE archivos se copian.
# ------------------------------------------------------------
configure_updater_frontend_guard(){
  local agent="/usr/local/lib/shiny-updater/shiny-update-agent.sh"

  if [[ ! -f "$agent" ]]; then
    warn "Updater agent no existe todavia; guardia frontend se aplicara en un provision posterior."
    return 0
  fi

  if grep -q 'SHINY_FRONTEND_GUARD_R125' "$agent"; then
    return 0
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    warn "python3 no disponible; no se pudo endurecer updater frontend."
    return 0
  fi

  python3 - "$agent" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8")

if "SHINY_FRONTEND_GUARD_R125" in text:
    raise SystemExit(0)

old = r'''  if [[ "$(jq -r '.npm_frontend // false' "$work/$manifest")" == "true" ]]; then
    if [[ -f "$APP_DIR/frontend/package-lock.json" ]]; then
      (cd "$APP_DIR/frontend" && npm ci)
    elif [[ -f "$APP_DIR/frontend/package.json" ]]; then
      (cd "$APP_DIR/frontend" && npm install)
    fi
  fi

  if [[ "$(jq -r '.build_frontend // false' "$work/$manifest")" == "true" ]]; then
    (cd "$APP_DIR/frontend" && npm run build)
  fi'''

new = r'''  # SHINY_FRONTEND_GUARD_R125
  local frontend_changed="false"
  local need_npm_frontend
  local need_build_frontend
  local frontend_tmp
  local frontend_old

  if jq -e '
      [(.files // [])[], ((.delete // [])[])] |
      any(.[]; startswith("frontend/"))
    ' "$work/$manifest" >/dev/null 2>&1; then
    frontend_changed="true"
  fi

  need_npm_frontend="$(jq -r '.npm_frontend // false' "$work/$manifest")"
  need_build_frontend="$(jq -r '.build_frontend // false' "$work/$manifest")"

  if [[ "$frontend_changed" == "true" ]]; then
    need_build_frontend="true"
  fi

  if [[ "$need_build_frontend" == "true" && ! -x "$APP_DIR/frontend/node_modules/.bin/vite" ]]; then
    need_npm_frontend="true"
  fi

  if [[ "$need_npm_frontend" == "true" ]]; then
    if [[ -f "$APP_DIR/frontend/package-lock.json" ]]; then
      (cd "$APP_DIR/frontend" && npm ci)
    elif [[ -f "$APP_DIR/frontend/package.json" ]]; then
      (cd "$APP_DIR/frontend" && npm install)
    else
      echo "ERROR: frontend requiere npm pero no existe package.json"
      return 9
    fi
  fi

  if [[ "$need_build_frontend" == "true" ]]; then
    frontend_tmp="$APP_DIR/frontend/.dist-r125-${ver}-$$"
    frontend_old="$APP_DIR/frontend/.dist-old-r125-${ver}-$$"
    rm -rf -- "$frontend_tmp" "$frontend_old"

    echo "FRONTEND: rebuild obligatorio para v$ver"
    if ! (cd "$APP_DIR/frontend" && npm run build -- --outDir "$frontend_tmp"); then
      rm -rf -- "$frontend_tmp"
      echo "ERROR: build frontend fallo; dist anterior permanece intacto."
      return 9
    fi

    if [[ ! -f "$frontend_tmp/index.html" ]]; then
      rm -rf -- "$frontend_tmp"
      echo "ERROR: build frontend no genero index.html; dist anterior permanece intacto."
      return 9
    fi

    if [[ -d "$APP_DIR/frontend/dist" ]]; then
      mv "$APP_DIR/frontend/dist" "$frontend_old"
    fi

    if mv "$frontend_tmp" "$APP_DIR/frontend/dist"; then
      rm -rf -- "$frontend_old"
      echo "FRONTEND: dist nuevo activado correctamente."
    else
      rm -rf -- "$APP_DIR/frontend/dist" "$frontend_tmp"
      if [[ -d "$frontend_old" ]]; then
        mv "$frontend_old" "$APP_DIR/frontend/dist"
      fi
      echo "ERROR: no se pudo activar dist nuevo; se restauro dist anterior."
      return 9
    fi
  fi'''

if old not in text:
    print("No se encontro el bloque R4 esperado para npm/build frontend.", file=sys.stderr)
    raise SystemExit(2)

text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8", newline="\n")
PY

  local rc=$?
  if [[ "$rc" -ne 0 ]]; then
    warn "No se pudo instalar guardia frontend R125 en updater runtime."
    return 0
  fi

  chmod 0755 "$agent"
  chown root:root "$agent"

  if ! bash -n "$agent"; then
    warn "Updater endurecido no paso bash -n."
    return 0
  fi

  if ! grep -q 'SHINY_FRONTEND_GUARD_R125' "$agent"; then
    warn "Updater runtime no contiene marcador R125."
    return 0
  fi

  echo "[SHINY] Updater frontend guard R125 instalado."
}
configure_updater_frontend_guard || warn "Guardia frontend R125 incompleta; Shiny continuara."

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


# SHINY_GEO_CATALOG_R128_BEGIN
GEO_RESTORE="$APP_DIR/backend/scripts/ensure-geo-catalog-rpi.sh"
if [[ -f "$GEO_RESTORE" ]]; then
  chmod 0755 "$GEO_RESTORE" || true
  APP_DIR="$APP_DIR" bash "$GEO_RESTORE" || warn "Restauracion geografica pendiente; Shiny continuara."
else
  warn "No encontre $GEO_RESTORE"
fi
# SHINY_GEO_CATALOG_R128_END
exit 0