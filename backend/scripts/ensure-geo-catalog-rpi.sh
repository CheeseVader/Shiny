#!/usr/bin/env bash
set -Eeuo pipefail

# SHINY_GEO_CATALOG_R128_R14
# Restaura shiny.catalogo_cp SOLO cuando esta vacio.

APP_DIR="${APP_DIR:-/opt/shiny/app}"
BACKEND_DIR="${APP_DIR}/backend"
ENV_FILE="${BACKEND_DIR}/.env"
GEO_CSV="${BACKEND_DIR}/data/geo/catalogo_cp_mexico.csv"

log(){ echo "[SHINY-GEO-R128] $*"; }
warn(){ echo "[SHINY-GEO-R128][AVISO] $*" >&2; }

if ! command -v psql >/dev/null 2>&1; then
  warn "psql no disponible."
  exit 0
fi

if [[ ! -s "$GEO_CSV" ]]; then
  warn "No existe catalogo empaquetado: $GEO_CSV"
  exit 0
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export PGDATABASE="${PGDATABASE:-gmx_db}"
export PGUSER="${PGUSER:-gmx_app}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"

ready=0
for _ in $(seq 1 30); do
  if psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" != "1" ]]; then
  warn "PostgreSQL no disponible; Shiny continuara."
  exit 0
fi

exists="$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT to_regclass('shiny.catalogo_cp') IS NOT NULL" 2>/dev/null || true)"
if [[ "$exists" != "t" ]]; then
  warn "shiny.catalogo_cp aun no existe."
  exit 0
fi

count="$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT COUNT(*) FROM shiny.catalogo_cp" 2>/dev/null || echo 0)"
count="${count//[[:space:]]/}"

if [[ "$count" =~ ^[0-9]+$ ]] && (( count > 0 )); then
  log "Catalogo ya cargado ($count registros). No se modifica."
  exit 0
fi

log "Catalogo vacio. Restaurando datos geograficos..."

psql -X -v ON_ERROR_STOP=1 <<'SHINY_GEO_SQL'
\copy shiny.catalogo_cp(cp,estado,municipio,ciudad,colonia,tipo_asentamiento,clave_estado,clave_municipio,clave_ciudad) FROM '/opt/shiny/app/backend/data/geo/catalogo_cp_mexico.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
SHINY_GEO_SQL

after="$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT COUNT(*) FROM shiny.catalogo_cp" 2>/dev/null || echo 0)"
after="${after//[[:space:]]/}"

if [[ ! "$after" =~ ^[0-9]+$ ]] || (( after <= 0 )); then
  warn "Restauracion sin registros."
  exit 1
fi

log "Catalogo geografico restaurado: $after registros."
exit 0