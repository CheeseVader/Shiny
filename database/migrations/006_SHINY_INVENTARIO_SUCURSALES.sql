-- Shiny Fase Local 4
-- Inventario + Sucursales + Movimientos + Transferencias
-- Incremental: no reinicializa ni elimina datos.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_sucursales_id_sucursal
  ON shiny.sucursales (id_sucursal);

CREATE INDEX IF NOT EXISTS idx_sucursales_activa
  ON shiny.sucursales (activa);

CREATE INDEX IF NOT EXISTS idx_inv_suc_id_sucursal
  ON shiny.inventario_sucursales (id_sucursal);

CREATE INDEX IF NOT EXISTS idx_inv_suc_id_producto
  ON shiny.inventario_sucursales (id_producto);

CREATE INDEX IF NOT EXISTS idx_inv_suc_sucursal_producto
  ON shiny.inventario_sucursales (id_sucursal, id_producto);

CREATE INDEX IF NOT EXISTS idx_mov_inv_suc_fecha
  ON shiny.movimientos_inventario_sucursales (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_mov_inv_suc_sucursal
  ON shiny.movimientos_inventario_sucursales (id_sucursal, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_mov_inv_suc_producto
  ON shiny.movimientos_inventario_sucursales (id_producto, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_fecha
  ON shiny.inventario_transferencias (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_origen
  ON shiny.inventario_transferencias (id_origen, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_destino
  ON shiny.inventario_transferencias (id_destino, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_det_transferencia
  ON shiny.inventario_transferencias_detalle (id_transferencia);

INSERT INTO shiny.schema_migrations(version, description)
SELECT
  '006',
  'Shiny Fase Local 4 - inventario sucursales movimientos y transferencias'
WHERE NOT EXISTS (
  SELECT 1 FROM shiny.schema_migrations WHERE version = '006'
);

COMMIT;
