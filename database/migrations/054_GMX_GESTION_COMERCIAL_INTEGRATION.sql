BEGIN;

ALTER TABLE gmx.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS id_proveedor TEXT,
  ADD COLUMN IF NOT EXISTS id_compra TEXT,
  ADD COLUMN IF NOT EXISTS origen TEXT,
  ADD COLUMN IF NOT EXISTS moneda TEXT,
  ADD COLUMN IF NOT EXISTS id_sucursal TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxp_compra
  ON gmx.cuentas_por_pagar(id_compra)
  WHERE id_compra IS NOT NULL AND id_compra<>'';

ALTER TABLE gmx.gastos
  ADD COLUMN IF NOT EXISTS origen_modulo TEXT,
  ADD COLUMN IF NOT EXISTS id_origen TEXT;

CREATE INDEX IF NOT EXISTS ix_gastos_origen
  ON gmx.gastos(origen_modulo,id_origen);

ALTER TABLE gmx.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS id_detalle_pedido TEXT,
  ADD COLUMN IF NOT EXISTS tipo_item TEXT,
  ADD COLUMN IF NOT EXISTS id_inventario TEXT,
  ADD COLUMN IF NOT EXISTS id_carta TEXT;

CREATE INDEX IF NOT EXISTS ix_devoluciones_detalle_order_line
  ON gmx.devoluciones_detalle(id_detalle_pedido)
  WHERE id_detalle_pedido IS NOT NULL;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '054','GMX 10.6.2.4.1.12.1.5 - complete commercial management integration'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='054');

COMMIT;
