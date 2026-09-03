#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# SHINY RPI - KIOSK REAL R1
# Crea un launcher de escritorio que abre Shiny en Chromium
# con --kiosk, sin barra superior del navegador ni decoraciones.
# No modifica la app, PostgreSQL, updater ni configuracion Shiny.
# ============================================================

APP_URL="${APP_URL:-http://127.0.0.1/}"
KIOSK_NAME="${KIOSK_NAME:-Shiny Kiosk}"
AUTOSTART="${AUTOSTART:-0}"

die(){ echo "[ERROR] $*" >&2; exit 1; }
ok(){ echo "[OK] $*"; }
info(){ echo "==> $*"; }

if [[ "${EUID}" -eq 0 ]]; then
  # Si se ejecuto con sudo, crear launcher para el usuario real.
  TARGET_USER="${SUDO_USER:-}"
  [[ -n "$TARGET_USER" && "$TARGET_USER" != "root" ]] || die "Ejecuta con: sudo bash $0 (desde tu usuario de escritorio)."
else
  TARGET_USER="$(id -un)"
fi

TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
[[ -n "$TARGET_HOME" && -d "$TARGET_HOME" ]] || die "No pude determinar HOME de $TARGET_USER."

# Detectar escritorio en ingles/espanol, con fallback.
DESKTOP_DIR=""
for d in "$TARGET_HOME/Desktop" "$TARGET_HOME/Escritorio"; do
  if [[ -d "$d" ]]; then DESKTOP_DIR="$d"; break; fi
done
if [[ -z "$DESKTOP_DIR" ]]; then
  DESKTOP_DIR="$TARGET_HOME/Desktop"
  mkdir -p "$DESKTOP_DIR"
  chown "$TARGET_USER":"$TARGET_USER" "$DESKTOP_DIR"
fi

# Raspberry Pi OS Bookworm suele usar chromium.
BROWSER=""
for b in chromium chromium-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    BROWSER="$(command -v "$b")"
    break
  fi
done

if [[ -z "$BROWSER" ]]; then
  info "Chromium no encontrado. Instalando..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y chromium || \
    DEBIAN_FRONTEND=noninteractive apt-get install -y chromium-browser
  for b in chromium chromium-browser; do
    if command -v "$b" >/dev/null 2>&1; then
      BROWSER="$(command -v "$b")"
      break
    fi
  done
fi
[[ -n "$BROWSER" ]] || die "No pude localizar Chromium."

BIN_DIR="$TARGET_HOME/.local/bin"
PROFILE_DIR="$TARGET_HOME/.config/shiny-kiosk"
LAUNCHER="$BIN_DIR/shiny-kiosk"
DESKTOP_FILE="$DESKTOP_DIR/Shiny-Kiosk.desktop"
AUTOSTART_DIR="$TARGET_HOME/.config/autostart"
AUTOSTART_FILE="$AUTOSTART_DIR/Shiny-Kiosk.desktop"

mkdir -p "$BIN_DIR" "$PROFILE_DIR"
chown -R "$TARGET_USER":"$TARGET_USER" "$BIN_DIR" "$PROFILE_DIR"

info "Creando launcher KIOSK real"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
set -u

APP_URL="${APP_URL}"
BROWSER="${BROWSER}"
PROFILE_DIR="${PROFILE_DIR}"

# Evitar dos instancias kiosk simultaneas.
pkill -f "\${BROWSER}.*--user-data-dir=\${PROFILE_DIR}" >/dev/null 2>&1 || true
sleep 0.5

exec "\${BROWSER}" \
  --kiosk "\${APP_URL}" \
  --user-data-dir="\${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --disable-features=TranslateUI \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  --start-fullscreen
EOF

chmod 755 "$LAUNCHER"
chown "$TARGET_USER":"$TARGET_USER" "$LAUNCHER"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=${KIOSK_NAME}
Comment=Shiny en modo kiosko
Exec=${LAUNCHER}
Icon=web-browser
Terminal=false
Categories=Office;
StartupNotify=false
EOF

chmod 755 "$DESKTOP_FILE"
chown "$TARGET_USER":"$TARGET_USER" "$DESKTOP_FILE"

# Marcar como confiable cuando gio esta disponible.
if command -v gio >/dev/null 2>&1; then
  sudo -u "$TARGET_USER" gio set "$DESKTOP_FILE" metadata::trusted true >/dev/null 2>&1 || true
fi

if [[ "$AUTOSTART" == "1" ]]; then
  mkdir -p "$AUTOSTART_DIR"
  cp -f "$DESKTOP_FILE" "$AUTOSTART_FILE"
  chown -R "$TARGET_USER":"$TARGET_USER" "$AUTOSTART_DIR"
  chmod 644 "$AUTOSTART_FILE"
  ok "Autostart habilitado."
else
  rm -f "$AUTOSTART_FILE" 2>/dev/null || true
fi

echo
echo "============================================================"
echo " SHINY KIOSK INSTALADO"
echo "============================================================"
echo "Usuario : $TARGET_USER"
echo "URL     : $APP_URL"
echo "Browser : $BROWSER"
echo "Acceso  : $DESKTOP_FILE"
echo
echo "Haz doble clic en: Shiny-Kiosk"
echo "Para salir del modo kiosk de Chromium: Alt+F4"
echo "============================================================"
