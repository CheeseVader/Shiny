BEGIN;

ALTER TABLE shiny.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS id_proveedor TEXT,
  ADD COLUMN IF NOT EXISTS id_compra TEXT,
  ADD COLUMN IF NOT EXISTS origen TEXT,
  ADD COLUMN IF NOT EXISTS moneda TEXT,
  ADD COLUMN IF NOT EXISTS id_sucursal TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxp_compra
  ON shiny.cuentas_por_pagar(id_compra)
  WHERE id_compra IS NOT NULL AND id_compra<>'';

ALTER TABLE shiny.gastos
  ADD COLUMN IF NOT EXISTS origen_modulo TEXT,
  ADD COLUMN IF NOT EXISTS id_origen TEXT;

CREATE INDEX IF NOT EXISTS ix_gastos_origen
  ON shiny.gastos(origen_modulo,id_origen);

ALTER TABLE shiny.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS id_detalle_pedido TEXT,
  ADD COLUMN IF NOT EXISTS tipo_item TEXT,
  ADD COLUMN IF NOT EXISTS id_inventario TEXT,
  ADD COLUMN IF NOT EXISTS id_carta TEXT;

CREATE INDEX IF NOT EXISTS ix_devoluciones_detalle_order_line
  ON shiny.devoluciones_detalle(id_detalle_pedido)
  WHERE id_detalle_pedido IS NOT NULL;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '054','Shiny 10.6.2.4.1.12.1.5 - complete commercial management integration'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='054');

COMMIT;
