-- GMX Fase Local 4
-- Inventario + Sucursales + Movimientos + Transferencias
-- Incremental: no reinicializa ni elimina datos.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_sucursales_id_sucursal
  ON gmx.sucursales (id_sucursal);

CREATE INDEX IF NOT EXISTS idx_sucursales_activa
  ON gmx.sucursales (activa);

CREATE INDEX IF NOT EXISTS idx_inv_suc_id_sucursal
  ON gmx.inventario_sucursales (id_sucursal);

CREATE INDEX IF NOT EXISTS idx_inv_suc_id_producto
  ON gmx.inventario_sucursales (id_producto);

CREATE INDEX IF NOT EXISTS idx_inv_suc_sucursal_producto
  ON gmx.inventario_sucursales (id_sucursal, id_producto);

CREATE INDEX IF NOT EXISTS idx_mov_inv_suc_fecha
  ON gmx.movimientos_inventario_sucursales (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_mov_inv_suc_sucursal
  ON gmx.movimientos_inventario_sucursales (id_sucursal, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_mov_inv_suc_producto
  ON gmx.movimientos_inventario_sucursales (id_producto, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_fecha
  ON gmx.inventario_transferencias (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_origen
  ON gmx.inventario_transferencias (id_origen, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_destino
  ON gmx.inventario_transferencias (id_destino, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_inv_trans_det_transferencia
  ON gmx.inventario_transferencias_detalle (id_transferencia);

INSERT INTO gmx.schema_migrations(version, description)
SELECT
  '006',
  'GMX Fase Local 4 - inventario sucursales movimientos y transferencias'
WHERE NOT EXISTS (
  SELECT 1 FROM gmx.schema_migrations WHERE version = '006'
);

COMMIT;
