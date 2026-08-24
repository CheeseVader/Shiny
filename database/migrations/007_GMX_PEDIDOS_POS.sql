-- GMX Fase Local 5
-- Pedidos + POS + sincronización transaccional con inventario.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_pedidos_id_pedido
  ON gmx.pedidos (id_pedido);

CREATE INDEX IF NOT EXISTS idx_pedidos_fecha
  ON gmx.pedidos (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente
  ON gmx.pedidos (id_cliente, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_sucursal
  ON gmx.pedidos (id_sucursal, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado
  ON gmx.pedidos (estado_pedido, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_pedidos_id_pedido
  ON gmx.detalle_pedidos (id_pedido);

CREATE INDEX IF NOT EXISTS idx_detalle_pedidos_producto
  ON gmx.detalle_pedidos (id_producto);

INSERT INTO gmx.schema_migrations(version, description)
SELECT
  '007',
  'GMX Fase Local 5 - pedidos POS e inventario transaccional'
WHERE NOT EXISTS (
  SELECT 1 FROM gmx.schema_migrations WHERE version = '007'
);

COMMIT;
