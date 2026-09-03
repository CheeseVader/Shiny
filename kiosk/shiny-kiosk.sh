#!/usr/bin/env bash
set -u
URL="${SHINY_KIOSK_URL:-http://127.0.0.1/}"
PROFILE="${HOME}/.config/shiny-kiosk-profile"
mkdir -p "$PROFILE"

# Raspberry Pi OS Bookworm/Labwc, LXDE/X11 y otros paneles comunes.
command -v lxpanelctl >/dev/null 2>&1 && lxpanelctl exit >/dev/null 2>&1 || true
pkill -x wf-panel-pi >/dev/null 2>&1 || true
pkill -x lxpanel >/dev/null 2>&1 || true
pkill -x waybar >/dev/null 2>&1 || true
sleep 1

BROWSER=""
for c in chromium chromium-browser; do
  if command -v "$c" >/dev/null 2>&1; then BROWSER="$(command -v "$c")"; break; fi
done
[ -n "$BROWSER" ] || exit 20

exec "$BROWSER" \
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