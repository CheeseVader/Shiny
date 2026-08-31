-- Shiny Fase Local 9 - Reportes + Auditoría
-- Solo agrega índices de lectura. No modifica datos operativos.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_phase9_pedidos_report
  ON shiny.pedidos(id_sucursal,fecha DESC,estado_pedido);
CREATE INDEX IF NOT EXISTS idx_phase9_buylist_report
  ON shiny.tcg_buylist(id_sucursal,fecha DESC,estado);
CREATE INDEX IF NOT EXISTS idx_phase9_tcg_mov_report
  ON shiny.tcg_movimientos_sucursales(fecha DESC,id_sucursal_origen,id_sucursal_destino);
CREATE INDEX IF NOT EXISTS idx_phase9_inv_mov_report
  ON shiny.movimientos_inventario_sucursales(fecha DESC,id_sucursal);
CREATE INDEX IF NOT EXISTS idx_phase9_compras_report
  ON shiny.compras(fecha DESC,estado);
CREATE INDEX IF NOT EXISTS idx_phase9_caja_mov_report
  ON shiny.caja_movimientos(fecha DESC,id_sucursal,tipo);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '011','Shiny Fase Local 9 - reportes auditoria e integridad PostgreSQL'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='011');

COMMIT;
