BEGIN;

ALTER TABLE shiny.compras_detalle
  ADD COLUMN IF NOT EXISTS id_inventario TEXT,
  ADD COLUMN IF NOT EXISTS id_carta TEXT;

CREATE INDEX IF NOT EXISTS ix_compras_detalle_tcg_inventory
  ON shiny.compras_detalle(id_inventario)
  WHERE id_inventario IS NOT NULL;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '053','Shiny 10.6.2.4.1.12.1.4 - purchases unified product/TCG catalog and cash split'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='053');

COMMIT;
