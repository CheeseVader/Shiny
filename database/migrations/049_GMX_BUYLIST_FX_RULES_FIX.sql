BEGIN;

CREATE TABLE IF NOT EXISTS gmx.fx_rates (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate_date DATE NOT NULL,
  rate NUMERIC(18,8) NOT NULL,
  source TEXT NOT NULL,
  location TEXT,
  is_operational BOOLEAN NOT NULL DEFAULT false,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fx_rates_pair_date_source_location
  ON gmx.fx_rates(
    base_currency,
    quote_currency,
    rate_date,
    source,
    (COALESCE(location,''))
  );

CREATE INDEX IF NOT EXISTS ix_fx_rates_pair_date
  ON gmx.fx_rates(base_currency,quote_currency,rate_date DESC,fetched_at DESC);

ALTER TABLE gmx.tcg_buylist_detalle
  ADD COLUMN IF NOT EXISTS precio_mercado_mxn NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS tipo_cambio_mercado NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS fuente_tipo_cambio TEXT,
  ADD COLUMN IF NOT EXISTS fecha_tipo_cambio DATE;

GRANT SELECT,INSERT,UPDATE,DELETE ON gmx.fx_rates TO gmx_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '049','GMX 10.6.2.4.1.10.1 - Buylist daily USD/MXN FX and catalog driven rules'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='049');

COMMIT;
