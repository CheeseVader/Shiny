BEGIN;

CREATE INDEX IF NOT EXISTS ix_reports_pedidos_branch_date
  ON gmx.pedidos(id_sucursal,fecha DESC);
CREATE INDEX IF NOT EXISTS ix_reports_compras_branch_date
  ON gmx.compras(id_sucursal_recepcion,fecha DESC);
CREATE INDEX IF NOT EXISTS ix_reports_gastos_branch_date
  ON gmx.gastos(id_sucursal,fecha_gasto DESC);
CREATE INDEX IF NOT EXISTS ix_reports_cash_branch_open
  ON gmx.caja_sesiones(id_sucursal,fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS ix_reports_inventory_branch_product
  ON gmx.inventario_sucursales(id_sucursal,id_producto);
CREATE INDEX IF NOT EXISTS ix_reports_tcg_branch_inventory
  ON gmx.tcg_inventario_sucursales(id_sucursal,id_inventario);
CREATE INDEX IF NOT EXISTS ix_reports_audit_date_module
  ON gmx.auditoria(fecha DESC,modulo);

INSERT INTO gmx.schema_migrations(version,description)
SELECT '058','GMX 10.6.2.4.1.12.2.0 - complete reports and audit indexes'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='058');

COMMIT;
