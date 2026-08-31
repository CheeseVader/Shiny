-- Shiny Fase Local 10.3 - Paridad TCG operativa
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phase103_tcg_conteos_id
  ON shiny.tcg_conteos(id_conteo) WHERE id_conteo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phase103_tcg_conteos_sucursal
  ON shiny.tcg_conteos(id_sucursal,fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_phase103_tcg_conteo_detalle
  ON shiny.tcg_conteo_detalle(id_conteo,id_inventario);
CREATE INDEX IF NOT EXISTS idx_phase103_tcg_escaneos
  ON shiny.tcg_escaneos(fecha DESC,id_sucursal,accion);
CREATE INDEX IF NOT EXISTS idx_phase103_tcg_inventory_lookup
  ON shiny.tcg_inventario(sku,id_inventario,id_carta);
CREATE INDEX IF NOT EXISTS idx_phase103_tcg_branch_inventory
  ON shiny.tcg_inventario_sucursales(id_sucursal,id_inventario);
CREATE INDEX IF NOT EXISTS idx_phase103_orders_tcg
  ON shiny.pedidos(canal_venta,fecha DESC,id_sucursal);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '013','Shiny Fase Local 10.3 - TCG POS scanner transfers labels counts bulk'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='013');

COMMIT;
