#!/usr/bin/env bash
set -Eeuo pipefail
[ "${EUID}" -eq 0 ] || { echo "Ejecuta con sudo."; exit 1; }

APP="/opt/shiny/app"
AGENT="/usr/local/lib/shiny-updater/shiny-update-agent.sh"
SUDOERS="/etc/sudoers.d/shiny-updater-web"
AUTOSTART="/etc/xdg/autostart/Shiny-Kiosk.desktop"

[ -x "$AGENT" ] || { echo "No existe updater: $AGENT"; exit 2; }
[ -x "$APP/kiosk/shiny-kiosk.sh" ] || chmod 0755 "$APP/kiosk/shiny-kiosk.sh"
[ -f "$APP/kiosk/Shiny-Kiosk.desktop" ] || { echo "Falta desktop Kiosk en la app."; exit 3; }

cat > "$SUDOERS" <<EOF
shiny ALL=(root) NOPASSWD: $AGENT status
shiny ALL=(root) NOPASSWD: $AGENT check
shiny ALL=(root) NOPASSWD: $AGENT install
EOF
chmod 0440 "$SUDOERS"
visudo -cf "$SUDOERS"

mkdir -p /etc/xdg/autostart
cp -f "$APP/kiosk/Shiny-Kiosk.desktop" "$AUTOSTART"
chmod 0644 "$AUTOSTART"

echo "============================================================"
echo " SHINY RPI BRIDGE R1 INSTALADO"
echo "============================================================"
echo "Updater web: habilitado SOLO para status/check/install."
echo "Kiosk global: $AUTOSTART"
echo "En el siguiente login/reinicio, Shiny Kiosk cerrara el panel y abrira Chromium --kiosk."
echo "============================================================"