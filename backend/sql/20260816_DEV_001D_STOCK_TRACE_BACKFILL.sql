-- ============================================================
-- DEV-001D-STOCK-TRACE
-- Backfill seguro para devoluciones NO reintegradas con stock NULL.
--
-- PRODUCTO GENERAL:
-- toma el último stock_nuevo registrado antes (o en) la devolución.
--
-- No altera inventario, caja, reembolsos ni movimientos.
-- ============================================================
BEGIN;

WITH snapshot AS (
  SELECT
    dd.row_id,
    m.stock_nuevo AS stock_snapshot
  FROM shiny.devoluciones_detalle dd
  JOIN shiny.devoluciones d
    ON d.id=dd.id_devolucion
  JOIN LATERAL (
    SELECT mi.stock_nuevo
    FROM shiny.movimientos_inventario_sucursales mi
    WHERE mi.id_sucursal=dd.id_sucursal
      AND (
        (dd.id_producto IS NOT NULL AND mi.id_producto=dd.id_producto)
        OR
        (dd.sku IS NOT NULL AND mi.sku=dd.sku)
      )
      AND mi.fecha<=d.fecha
      AND mi.stock_nuevo IS NOT NULL
    ORDER BY mi.fecha DESC,mi.row_id DESC
    LIMIT 1
  ) m ON true
  WHERE dd.reintegra_stock=false
    AND dd.tipo_item<>'TCG'
    AND (dd.stock_anterior IS NULL OR dd.stock_nuevo IS NULL)
)
UPDATE shiny.devoluciones_detalle dd
SET
  stock_anterior=s.stock_snapshot,
  stock_nuevo=s.stock_snapshot
FROM snapshot s
WHERE dd.row_id=s.row_id;

COMMIT;

-- Validación específica de la prueba DAÑADO
SELECT
  id_devolucion,
  sku,
  producto,
  condicion_articulo,
  destino_articulo,
  reintegra_stock,
  stock_anterior,
  stock_nuevo
FROM shiny.devoluciones_detalle
WHERE id_devolucion='DEV-1786902935731-LNV7F';

-- Debe devolver 0 para productos generales históricos corregibles:
SELECT
  dd.id_devolucion,
  dd.sku,
  dd.condicion_articulo,
  dd.destino_articulo,
  dd.stock_anterior,
  dd.stock_nuevo
FROM shiny.devoluciones_detalle dd
WHERE dd.reintegra_stock=false
  AND dd.tipo_item<>'TCG'
  AND (dd.stock_anterior IS NULL OR dd.stock_nuevo IS NULL);
