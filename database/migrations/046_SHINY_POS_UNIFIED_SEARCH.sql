BEGIN;

-- Shiny 10.6.2.4.1.5 — POS / Buscador Unificado

CREATE INDEX IF NOT EXISTS ix_pos_products_name_lower
  ON shiny.productos(LOWER(nombre));

CREATE INDEX IF NOT EXISTS ix_pos_products_sku_lower
  ON shiny.productos(LOWER(sku));

CREATE INDEX IF NOT EXISTS ix_pos_products_barcode_lower
  ON shiny.productos(LOWER(codigo_barras))
  WHERE codigo_barras IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_pos_tcg_cards_name_lower
  ON shiny.tcg_cartas(LOWER(nombre));

CREATE INDEX IF NOT EXISTS ix_pos_tcg_cards_number_lower
  ON shiny.tcg_cartas(LOWER(numero_completo))
  WHERE numero_completo IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_pos_tcg_inventory_sku_lower
  ON shiny.tcg_inventario(LOWER(sku))
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_pos_tcg_inventory_branch_stock
  ON shiny.tcg_inventario_sucursales(id_sucursal,id_inventario,stock);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '046','Shiny 10.6.2.4.1.5 - POS unified search indexes'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='046');

COMMIT;
