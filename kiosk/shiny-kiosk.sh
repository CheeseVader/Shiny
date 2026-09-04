#!/usr/bin/env bash
set -u

# ============================================================
# SHINY RPI KIOSK WATCHDOG R2
#
# Mantiene Chromium en modo kiosk.
# Si Chromium termina o falla, lo vuelve a iniciar.
#
# Salida intencional:
#   touch ~/.config/shiny-kiosk-stop
#   y cerrar Chromium.
# ============================================================

URL="${SHINY_KIOSK_URL:-http://127.0.0.1/login?kiosk=1}"
PROFILE="${HOME}/.config/shiny-kiosk-profile"
STOP_FILE="${HOME}/.config/shiny-kiosk-stop"
RESTART_DELAY="${SHINY_KIOSK_RESTART_DELAY:-3}"

mkdir -p "$PROFILE"

# Eliminar una orden de parada antigua al iniciar una sesión nueva.
rm -f "$STOP_FILE"

# Raspberry Pi OS Bookworm/Labwc, LXDE/X11 y paneles comunes.
command -v lxpanelctl >/dev/null 2>&1 && lxpanelctl exit >/dev/null 2>&1 || true
pkill -x wf-panel-pi >/dev/null 2>&1 || true
pkill -x lxpanel >/dev/null 2>&1 || true
pkill -x waybar >/dev/null 2>&1 || true
sleep 1

BROWSER=""

for c in chromium chromium-browser; do
  if command -v "$c" >/dev/null 2>&1; then
    BROWSER="$(command -v "$c")"
    break
  fi
done

if [ -z "$BROWSER" ]; then
  echo "[SHINY KIOSK] Chromium no encontrado." >&2
  exit 20
fi

echo "[SHINY KIOSK] Watchdog iniciado."
echo "[SHINY KIOSK] Browser: $BROWSER"
echo "[SHINY KIOSK] URL: $URL"

while true; do

  if [ -f "$STOP_FILE" ]; then
    echo "[SHINY KIOSK] Parada solicitada."
    rm -f "$STOP_FILE"
    exit 0
  fi

  echo "[SHINY KIOSK] Iniciando Chromium..."

  "$BROWSER" \
    --kiosk "$URL" \
    --start-fullscreen \
    --user-data-dir="$PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-features=TranslateUI \
    --overscroll-history-navigation=0 \
    --disable-pinch

  RC=$?

  echo "[SHINY KIOSK] Chromium termino. Codigo: $RC"

  if [ -f "$STOP_FILE" ]; then
    echo "[SHINY KIOSK] Parada solicitada despues de Chromium."
    rm -f "$STOP_FILE"
    exit 0
  fi

  echo "[SHINY KIOSK] Reiniciando en ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"

done
