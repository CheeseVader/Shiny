#!/usr/bin/env bash
set -Eeuo pipefail

LOG="/tmp/shiny-bridge-repair.log"
exec > >(tee -a "$LOG") 2>&1

echo
echo "============================================================"
echo " SHINY - REPARACION SEGURA BRIDGE / UPDATER"
echo "============================================================"
date

if [ "${EUID}" -ne 0 ]; then
    echo "[ERROR] Este reparador necesita sudo/root."
    exit 1
fi

APP="/opt/shiny/app"
AGENT="/usr/local/lib/shiny-updater/shiny-update-agent.sh"
SUDOERS="/etc/sudoers.d/shiny-updater-web"
AUTOSTART="/etc/xdg/autostart/Shiny-Kiosk.desktop"
SERVICE="shiny-app.service"

TMP_SUDOERS=""

cleanup() {
    if [ -n "${TMP_SUDOERS:-}" ] && [ -f "$TMP_SUDOERS" ]; then
        rm -f "$TMP_SUDOERS"
    fi
}

trap cleanup EXIT

echo
echo "===== 1. PREVALIDACIONES ====="

if [ ! -d "$APP" ]; then
    echo "[ERROR] No existe la aplicacion:"
    echo "$APP"
    exit 10
fi

if ! id shiny >/dev/null 2>&1; then
    echo "[ERROR] No existe el usuario shiny."
    exit 11
fi

if ! command -v visudo >/dev/null 2>&1; then
    echo "[ERROR] No existe visudo."
    exit 12
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "[ERROR] No existe systemctl."
    exit 13
fi

echo "[OK] Aplicacion encontrada."
echo "[OK] Usuario shiny encontrado."
echo "[OK] visudo disponible."
echo "[OK] systemctl disponible."

echo
echo "===== 2. VERSION INSTALADA ====="

if [ -f "$APP/VERSION" ]; then
    echo -n "Version instalada: "
    tr -d '\r\n ' < "$APP/VERSION"
    echo
else
    echo "[ADVERTENCIA] No existe $APP/VERSION"
fi

echo
echo "===== 3. VERIFICAR AGENTE ====="

if [ ! -f "$AGENT" ]; then
    echo "[ERROR] No existe updater:"
    echo "$AGENT"
    exit 20
fi

chmod 0755 "$AGENT"

if [ ! -x "$AGENT" ]; then
    echo "[ERROR] El agente no pudo hacerse ejecutable."
    exit 21
fi

echo "[OK] Agente disponible:"
ls -l "$AGENT"

echo
echo "===== 4. PREPARAR SUDOERS EN TEMPORAL ====="

TMP_SUDOERS="$(mktemp /tmp/shiny-updater-web.XXXXXX)"

cat > "$TMP_SUDOERS" <<EOF
shiny ALL=(root) NOPASSWD: $AGENT status
shiny ALL=(root) NOPASSWD: $AGENT check
shiny ALL=(root) NOPASSWD: $AGENT install
EOF

chmod 0440 "$TMP_SUDOERS"

echo "Validando regla ANTES de instalarla..."

if ! visudo -cf "$TMP_SUDOERS"; then
    echo "[ERROR] La nueva regla sudoers es invalida."
    exit 30
fi

echo "[OK] Regla temporal valida."

echo
echo "===== 5. INSTALAR BRIDGE ====="

install -o root -g root -m 0440 \
    "$TMP_SUDOERS" \
    "$SUDOERS"

if ! visudo -cf "$SUDOERS"; then
    echo "[ERROR] La regla instalada no paso validacion."
    rm -f "$SUDOERS"
    exit 31
fi

echo "[OK] Bridge sudoers instalado y validado."
echo "$SUDOERS"

echo
echo "===== 6. KIOSK GLOBAL ====="

if [ -f "$APP/kiosk/shiny-kiosk.sh" ]; then
    chmod 0755 "$APP/kiosk/shiny-kiosk.sh"
    echo "[OK] Launcher kiosk encontrado."
else
    echo "[ADVERTENCIA] No existe kiosk/shiny-kiosk.sh."
fi

if [ -f "$APP/kiosk/Shiny-Kiosk.desktop" ]; then
    mkdir -p /etc/xdg/autostart

    cp -f \
        "$APP/kiosk/Shiny-Kiosk.desktop" \
        "$AUTOSTART"

    chmod 0644 "$AUTOSTART"

    echo "[OK] Kiosk global configurado:"
    echo "$AUTOSTART"
else
    echo "[ADVERTENCIA] No existe Shiny-Kiosk.desktop."
    echo "[INFO] Esto NO invalida la reparacion del bridge."
fi

echo
echo "===== 7. PROBAR STATUS COMO SHINY ====="

if sudo -u shiny sudo -n "$AGENT" status; then
    echo "[OK] STATUS autorizado por bridge."
else
    RC=$?
    echo "[ERROR] STATUS fallo. Codigo: $RC"
    exit 40
fi

echo
echo "===== 8. PROBAR CHECK REAL ====="

if sudo -u shiny sudo -n "$AGENT" check; then
    echo "[OK] CHECK autorizado y ejecutado."
else
    RC=$?
    echo "[ERROR] CHECK fallo. Codigo: $RC"
    echo "[INFO] Revisar configuracion/token del updater."
    exit 41
fi

echo
echo "===== 9. ESTADO DESPUES DEL CHECK ====="

if ! sudo -u shiny sudo -n "$AGENT" status; then
    echo "[ADVERTENCIA] No fue posible leer status despues del check."
fi

echo
echo "===== 10. REINICIAR BACKEND ====="

systemctl restart "$SERVICE"

sleep 5

if systemctl is-active --quiet "$SERVICE"; then
    echo "[OK] $SERVICE ACTIVO."
else
    echo "[ERROR] $SERVICE no quedo activo."
    systemctl status "$SERVICE" --no-pager -l || true
    exit 50
fi

echo
echo "===== 11. VALIDACION FINAL DEL BRIDGE ====="

if sudo -u shiny sudo -n "$AGENT" status >/dev/null; then
    echo "[OK] Backend puede disponer del bridge privilegiado."
else
    echo "[ERROR] El bridge dejo de responder."
    exit 60
fi

echo
echo "============================================================"
echo " REPARACION TERMINADA CORRECTAMENTE"
echo "============================================================"
echo
echo "[OK] Bridge instalado."
echo "[OK] status autorizado."
echo "[OK] check autorizado."
echo "[OK] install autorizado."
echo "[OK] Backend reiniciado."
echo
echo "Siguiente prueba:"
echo "Sistema -> Actualizaciones -> Buscar actualizacion"
echo
echo "Log:"
echo "$LOG"
echo "============================================================"
