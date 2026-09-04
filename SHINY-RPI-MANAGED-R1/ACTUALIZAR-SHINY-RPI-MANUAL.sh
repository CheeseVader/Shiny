#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# SHINY RPI - ACTUALIZACION MANUAL SEGURA
#
# Uso:
#   sudo bash ACTUALIZAR-SHINY-RPI-MANUAL.sh
#
# Objetivo:
#   - Ejecutar manualmente el updater instalado en la Raspberry.
#   - No depende del timer de systemd.
#   - NO reinstala Shiny.
#   - NO toca PostgreSQL ni nginx.
#   - NO hace git pull/reset.
#   - NO usa rsync --delete.
#   - NO fuerza downgrade.
#   - Si VERSION local == VERSION GitHub, no modifica nada.
#   - Si GitHub tiene una VERSION mayor, ejecuta la actualizacion
#     incremental usando manifest files[]/delete[].
#
# Requisito:
#   /usr/local/lib/shiny-updater/shiny-update-agent.sh
#   /etc/shiny-updater/updater.env
# ============================================================

AGENT="/usr/local/lib/shiny-updater/shiny-update-agent.sh"
CONFIG="/etc/shiny-updater/updater.env"
APP_DEFAULT="/opt/shiny/app"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[AVISO]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Ejecuta este archivo con sudo bash $0"
[[ -f "$CONFIG" ]] || die "No existe $CONFIG"
[[ -f "$AGENT" ]] || die "No existe $AGENT. Este respaldo manual requiere que el updater R3.1 este instalado."

# No modificar el agente. Solo verificar que tenga sintaxis valida.
bash -n "$AGENT" || die "El updater instalado tiene un error de sintaxis. No se ejecuto ninguna actualizacion."
[[ -x "$AGENT" ]] || chmod 0755 "$AGENT"

# Cargar configuracion sin mostrar secretos.
# No imprimimos GITHUB_TOKEN.
set +u
# shellcheck disable=SC1090
source "$CONFIG"
set -u

APP_DIR="${APP_DIR:-$APP_DEFAULT}"
[[ -d "$APP_DIR" ]] || die "No existe APP_DIR=$APP_DIR"
[[ -f "$APP_DIR/VERSION" ]] || die "No existe $APP_DIR/VERSION"

LOCAL_VERSION="$(tr -d '\r\n ' < "$APP_DIR/VERSION")"

echo "============================================================"
echo " SHINY RPI - ACTUALIZACION MANUAL"
echo "============================================================"
echo "Aplicacion : $APP_DIR"
echo "Version    : $LOCAL_VERSION"
echo "Updater    : $AGENT"
echo "============================================================"

say "Verificando operaciones peligrosas en el agente instalado"

# Ignorar comentarios y revisar solo lineas ejecutables.
if grep -Ev '^[[:space:]]*(#|$)' "$AGENT" \
  | grep -Eq '^[[:space:]]*rsync([[:space:]]|$).*--delete|^[[:space:]]*git[[:space:]]+(reset|pull|checkout)([[:space:]]|$)'; then
    die "Se detecto una operacion prohibida en el updater. Se cancelo sin tocar Shiny."
fi
ok "Validacion de seguridad superada"

say "Consultando GitHub y aplicando SOLO si existe una VERSION mayor"

# El comando check del updater R3.1:
# - misma VERSION: no toca archivos;
# - VERSION remota mayor: instala si AUTO_INSTALL=1;
# - VERSION local mayor: bloquea downgrade.
#
# Para que este script sea realmente MANUAL aun si AUTO_INSTALL=0,
# primero hacemos check y luego comprobamos si quedo una version pendiente.
#
# Capturamos salida sin ocultarla.
TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

set +e
"$AGENT" check 2>&1 | tee "$TMP_OUT"
RC=${PIPESTATUS[0]}
set -e

if [[ "$RC" -ne 0 ]]; then
    echo
    die "El updater termino con codigo $RC. Revisa la salida anterior. No ejecutes parches manuales."
fi

# Obtener versiones reportadas por check, si existen.
CURRENT_REPORTED="$(awk -F= '/^CURRENT_VERSION=/{print $2}' "$TMP_OUT" | tail -n1 | tr -d '\r\n ' || true)"
LATEST_REPORTED="$(awk -F= '/^LATEST_VERSION=/{print $2}' "$TMP_OUT" | tail -n1 | tr -d '\r\n ' || true)"
STATUS_REPORTED="$(awk -F= '/^STATUS=/{print $2}' "$TMP_OUT" | tail -n1 | tr -d '\r\n ' || true)"

# Si AUTO_INSTALL=0 y check solo reporto available, ejecutar install explicitamente.
if [[ "$STATUS_REPORTED" == "available" ]]; then
    NEW_LOCAL="$(tr -d '\r\n ' < "$APP_DIR/VERSION")"

    if [[ -n "$LATEST_REPORTED" ]] && dpkg --compare-versions "$LATEST_REPORTED" gt "$NEW_LOCAL"; then
        say "Actualizacion disponible. Ejecutando instalacion manual explicita"
        "$AGENT" install
    fi
fi

FINAL_VERSION="$(tr -d '\r\n ' < "$APP_DIR/VERSION")"

say "Estado final"
"$AGENT" status || true

echo
if [[ "$FINAL_VERSION" == "$LOCAL_VERSION" ]]; then
    ok "Shiny permanece en $FINAL_VERSION. No habia una version superior pendiente o no fue necesario modificarla."
else
    ok "Shiny se actualizo manualmente: $LOCAL_VERSION -> $FINAL_VERSION"
fi

echo
echo "============================================================"
echo " ACTUALIZACION MANUAL FINALIZADA"
echo " Version instalada: $FINAL_VERSION"
echo "============================================================"
