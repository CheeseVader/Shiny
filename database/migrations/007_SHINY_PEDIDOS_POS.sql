-- Shiny Fase Local 5
-- Pedidos + POS + sincronización transaccional con inventario.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_pedidos_id_pedido
  ON shiny.pedidos (id_pedido);

CREATE INDEX IF NOT EXISTS idx_pedidos_fecha
  ON shiny.pedidos (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente
  ON shiny.pedidos (id_cliente, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_sucursal
  ON shiny.pedidos (id_sucursal, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado
  ON shiny.pedidos (estado_pedido, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_pedidos_id_pedido
  ON shiny.detalle_pedidos (id_pedido);

CREATE INDEX IF NOT EXISTS idx_detalle_pedidos_producto
  ON shiny.detalle_pedidos (id_producto);

INSERT INTO shiny.schema_migrations(version, description)
SELECT
  '007',
  'Shiny Fase Local 5 - pedidos POS e inventario transaccional'
WHERE NOT EXISTS (
  SELECT 1 FROM shiny.schema_migrations WHERE version = '007'
);

COMMIT;
