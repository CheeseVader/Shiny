-- GMX Fase Local 9 - Reportes + Auditoría
-- Solo agrega índices de lectura. No modifica datos operativos.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_phase9_pedidos_report
  ON gmx.pedidos(id_sucursal,fecha DESC,estado_pedido);
CREATE INDEX IF NOT EXISTS idx_phase9_buylist_report
  ON gmx.tcg_buylist(id_sucursal,fecha DESC,estado);
CREATE INDEX IF NOT EXISTS idx_phase9_tcg_mov_report
  ON gmx.tcg_movimientos_sucursales(fecha DESC,id_sucursal_origen,id_sucursal_destino);
CREATE INDEX IF NOT EXISTS idx_phase9_inv_mov_report
  ON gmx.movimientos_inventario_sucursales(fecha DESC,id_sucursal);
CREATE INDEX IF NOT EXISTS idx_phase9_compras_report
  ON gmx.compras(fecha DESC,estado);
CREATE INDEX IF NOT EXISTS idx_phase9_caja_mov_report
  ON gmx.caja_movimientos(fecha DESC,id_sucursal,tipo);

INSERT INTO gmx.schema_migrations(version,description)
SELECT '011','GMX Fase Local 9 - reportes auditoria e integridad PostgreSQL'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='011');

COMMIT;
