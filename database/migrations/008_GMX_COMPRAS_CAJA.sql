-- GMX Fase Local 6
-- Compras + recepción a inventario + Caja / arqueos.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_id_compra
  ON gmx.compras (id_compra)
  WHERE id_compra IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compras_fecha_estado
  ON gmx.compras (fecha DESC, estado);

CREATE INDEX IF NOT EXISTS idx_compras_proveedor
  ON gmx.compras (id_proveedor, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_compras_detalle_compra
  ON gmx.compras_detalle (id_compra, linea);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_sesiones_id_caja
  ON gmx.caja_sesiones (id_caja)
  WHERE id_caja IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_caja_sesiones_sucursal_estado
  ON gmx.caja_sesiones (id_sucursal, estado, fecha_apertura DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_movimientos_id_movimiento
  ON gmx.caja_movimientos (id_movimiento)
  WHERE id_movimiento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_caja_fecha
  ON gmx.caja_movimientos (id_caja, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_origen
  ON gmx.caja_movimientos (origen_modulo, id_origen);

INSERT INTO gmx.schema_migrations(version, description)
SELECT '008', 'GMX Fase Local 6 - compras recepcion inventario y caja'
WHERE NOT EXISTS (
  SELECT 1 FROM gmx.schema_migrations WHERE version = '008'
);

COMMIT;
