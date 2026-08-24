-- GMX INVENTARIO AUD-002A
-- Migración segura e idempotente del historial legacy.
-- NO elimina gmx.movimientos_inventario.

BEGIN;

INSERT INTO gmx.movimientos_inventario_sucursales (
  id_movimiento,fecha,id_sucursal,sucursal,id_producto,sku,producto,
  tipo,cantidad,stock_anterior,stock_nuevo,motivo,
  id_admin,nombre_usuario,usuario,referencia
)
SELECT
  m.id_movimiento,m.fecha,m.id_sucursal,m.sucursal,m.id_producto,m.sku,m.producto,
  m.tipo,m.cantidad,m.stock_anterior,m.stock_nuevo,m.motivo,
  NULL,
  COALESCE(NULLIF(TRIM(m.usuario),''),NULLIF(TRIM(m.origen),''),'GMX Legacy'),
  NULLIF(TRIM(m.usuario),''),
  COALESCE(NULLIF(TRIM(m.origen),''),'LEGACY_MOVIMIENTO')
FROM gmx.movimientos_inventario m
WHERE NULLIF(TRIM(COALESCE(m.id_movimiento,'')),'') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gmx.movimientos_inventario_sucursales s
    WHERE s.id_movimiento=m.id_movimiento
  );

COMMIT;

SELECT COUNT(*) AS legacy_total FROM gmx.movimientos_inventario;

SELECT COUNT(*) AS legacy_pendientes_de_migrar
FROM gmx.movimientos_inventario m
WHERE NULLIF(TRIM(COALESCE(m.id_movimiento,'')),'') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gmx.movimientos_inventario_sucursales s
    WHERE s.id_movimiento=m.id_movimiento
  );

SELECT
  row_id,id_movimiento,fecha,id_sucursal,sucursal,id_producto,sku,producto,
  tipo,cantidad,stock_anterior,stock_nuevo,motivo,nombre_usuario,usuario,referencia
FROM gmx.movimientos_inventario_sucursales
ORDER BY fecha DESC NULLS LAST,row_id DESC
LIMIT 25;
