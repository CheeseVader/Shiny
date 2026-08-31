BEGIN;

ALTER TABLE shiny.tcg_buylist_detalle
  ADD COLUMN IF NOT EXISTS precio_mercado NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS moneda_mercado TEXT,
  ADD COLUMN IF NOT EXISTS proveedor_mercado TEXT,
  ADD COLUMN IF NOT EXISTS precio_tienda NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS precio_base_buylist NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS fuente_base_buylist TEXT;

CREATE INDEX IF NOT EXISTS ix_buylist_detalle_price_source
  ON shiny.tcg_buylist_detalle(fuente_base_buylist);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '048','Shiny 10.6.2.4.1.10 - Buylist market/store/base pricing engine'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='048');

COMMIT;
