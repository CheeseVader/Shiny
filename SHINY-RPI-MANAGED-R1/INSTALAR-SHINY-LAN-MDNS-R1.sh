#!/usr/bin/env bash
set -Eeuo pipefail

LOCAL_HOSTNAME="${SHINY_LOCAL_HOSTNAME:-shyny-panel}"
LOCAL_PORT="${SHINY_LOCAL_HTTP_PORT:-80}"
SHINY_INTERNAL_PORT="${SHINY_INTERNAL_ENTRY_PORT:-8788}"

say(){ printf '\n==> %s\n' "$*"; }
ok(){ printf '[OK] %s\n' "$*"; }
warn(){ printf '[AVISO] %s\n' "$*" >&2; }
die(){ printf '[ERROR] %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Ejecuta con sudo/root."

if [[ ! "$LOCAL_HOSTNAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$ ]]; then
  die "SHINY_LOCAL_HOSTNAME invalido: $LOCAL_HOSTNAME"
fi

say "Configurando acceso LAN local para Shiny"
echo "Hostname mDNS : ${LOCAL_HOSTNAME}.local"
echo "HTTP local    : puerto ${LOCAL_PORT}"
echo "Shiny interno : 127.0.0.1:${SHINY_INTERNAL_PORT}"
echo "Red           : DHCP (NO se modifica)"

export DEBIAN_FRONTEND=noninteractive

say "Instalando Avahi y Nginx"
apt-get update
apt-get install -y avahi-daemon avahi-utils nginx curl

say "Configurando hostname mDNS"
hostnamectl set-hostname "$LOCAL_HOSTNAME"

if grep -Eq '^[[:space:]]*127\.0\.1\.1[[:space:]]+' /etc/hosts; then
  sed -i -E "s|^[[:space:]]*127\.0\.1\.1[[:space:]].*$|127.0.1.1\t${LOCAL_HOSTNAME}|" /etc/hosts
else
  printf '127.0.1.1\t%s\n' "$LOCAL_HOSTNAME" >> /etc/hosts
fi

systemctl enable --now avahi-daemon

say "Configurando Nginx como entrada local"
cat > /etc/nginx/sites-available/shiny-local <<EOF
server {
    listen ${LOCAL_PORT} default_server;
    listen [::]:${LOCAL_PORT} default_server;

    server_name ${LOCAL_HOSTNAME}.local ${LOCAL_HOSTNAME} _;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:${SHINY_INTERNAL_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

# SHINY_NGINX_PURGE_ALL_R150
find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
ln -sfn /etc/nginx/sites-available/shiny-local /etc/nginx/sites-enabled/shiny-local

nginx -t
systemctl enable nginx
systemctl restart nginx

say "Validando servicios"
systemctl is-active --quiet avahi-daemon || die "avahi-daemon no esta activo."
systemctl is-active --quiet nginx || die "nginx no esta activo."

if curl -fsS --max-time 5 "http://127.0.0.1:${SHINY_INTERNAL_PORT}/api/shiny-entry-mode" \
  | grep -q '"mode":"internal"'; then
  ok "Shiny responde como portal interno en ${SHINY_INTERNAL_PORT}."
else
  warn "No pude validar mode=internal en ${SHINY_INTERNAL_PORT}."
  warn "Si Shiny esta reiniciando, vuelve a probar despues."
fi

if curl -fsSI --max-time 5 "http://127.0.0.1:${LOCAL_PORT}/" >/dev/null 2>&1; then
  ok "Nginx responde en puerto ${LOCAL_PORT}."
else
  warn "Nginx esta activo, pero la validacion HTTP no respondio."
fi

say "Direcciones IPv4 actuales por DHCP"
hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true

echo
echo "============================================================"
echo " SHINY LAN LOCAL CONFIGURADO"
echo "============================================================"
echo "URL local:"
echo "  http://${LOCAL_HOSTNAME}.local"
echo
echo "La Raspberry CONTINUA usando DHCP."
echo "No se fijo IP, gateway ni DNS."
echo
echo "Si cambia de casa/tienda/red, el router puede asignar otra IP"
echo "y el nombre ${LOCAL_HOSTNAME}.local se vuelve a anunciar por mDNS."
echo
echo "Cloudflare sigue usando:"
echo "  127.0.0.1:8788  -> personal/admin/cajeros"
echo "  127.0.0.1:8789  -> tienda publica"
echo "============================================================"