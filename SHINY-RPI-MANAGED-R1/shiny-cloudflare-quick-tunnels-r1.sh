#!/usr/bin/env bash
set -Eeuo pipefail

INTERNAL_PORT="${SHINY_INTERNAL_ENTRY_PORT:-8788}"
STORE_PORT="${SHINY_STORE_ENTRY_PORT:-8789}"
WITH_STORE=0

if [[ "${1:-}" == "--with-store" ]]; then
  WITH_STORE=1
fi

STATE_DIR="${HOME}/.shiny/cloudflare-quick"
mkdir -p "$STATE_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[ERROR] Falta comando: $1"
    exit 1
  }
}

stop_one() {
  local name="$1"
  local pidfile="$STATE_DIR/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$pidfile"
  fi
}

wait_url() {
  local logfile="$1"
  local i
  for i in $(seq 1 50); do
    if [[ -f "$logfile" ]]; then
      local url
      url="$(grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$logfile" | tail -n1 || true)"
      if [[ -n "$url" ]]; then
        printf '%s' "$url"
        return 0
      fi
    fi
    sleep 0.5
  done
  return 1
}

start_one() {
  local name="$1"
  local port="$2"
  local logfile="$STATE_DIR/${name}.log"
  local pidfile="$STATE_DIR/${name}.pid"

  stop_one "$name"
  : > "$logfile"

  nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:${port}" \
    >"$logfile" 2>&1 &
  local pid=$!
  printf '%s\n' "$pid" > "$pidfile"

  local url=""
  if url="$(wait_url "$logfile")"; then
    printf '%s\n' "$url" > "$STATE_DIR/${name}.url"
    echo "$url"
  else
    echo "[ERROR] No se genero URL para $name. Log: $logfile" >&2
    return 1
  fi
}

need cloudflared
need curl

echo "==> Comprobando PORTAL PERSONAL en 127.0.0.1:${INTERNAL_PORT}"
MODE="$(curl -fsS "http://127.0.0.1:${INTERNAL_PORT}/api/shiny-entry-mode" | tr -d '\n' || true)"
if [[ "$MODE" != *'"mode":"internal"'* && "$MODE" != *'"mode": "internal"'* ]]; then
  echo "[ERROR] Shiny no responde como internal en ${INTERNAL_PORT}"
  echo "Respuesta: $MODE"
  exit 1
fi

PORTAL_URL="$(start_one portal "$INTERNAL_PORT")"

echo
echo "============================================================"
echo " SHINY ONLINE - QUICK TUNNEL"
echo "============================================================"
echo "PORTAL PERSONAL / ADMIN / CAJEROS:"
echo "$PORTAL_URL"
echo "Entrada esperada: /login"

if [[ "$WITH_STORE" -eq 1 ]]; then
  echo
  echo "==> Comprobando TIENDA PUBLICA en 127.0.0.1:${STORE_PORT}"
  STORE_MODE="$(curl -fsS "http://127.0.0.1:${STORE_PORT}/api/shiny-entry-mode" | tr -d '\n' || true)"
  if [[ "$STORE_MODE" != *'"mode":"store"'* && "$STORE_MODE" != *'"mode": "store"'* ]]; then
    echo "[ERROR] Shiny no responde como store en ${STORE_PORT}"
    echo "Respuesta: $STORE_MODE"
    exit 1
  fi

  STORE_URL="$(start_one store "$STORE_PORT")"
  echo
  echo "TIENDA PUBLICA:"
  echo "$STORE_URL"
  echo "Entrada esperada: /tienda"
else
  stop_one store
  rm -f "$STATE_DIR/store.url"
  echo
  echo "TIENDA PUBLICA: DESACTIVADA"
  echo "Para habilitarla:"
  echo "  $0 --with-store"
fi

echo "============================================================"
echo "Estado/logs: $STATE_DIR"
echo "Nota: trycloudflare.com cambia al reiniciar cada Quick Tunnel."