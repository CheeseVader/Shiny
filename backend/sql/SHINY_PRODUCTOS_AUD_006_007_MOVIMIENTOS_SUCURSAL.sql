-- Shiny PRODUCTOS AUD-006/007
-- Trazabilidad de stock inicial multisucursal
--
-- Ejecutar con postgres/owner del esquema antes de reiniciar Shiny.
-- Es NO destructiva: sólo agrega columnas si aún no existen.
-- Los movimientos históricos existentes permanecen intactos y sus
-- nuevas columnas quedarán NULL cuando no sea posible inferir sucursal.

BEGIN;

ALTER TABLE shiny.movimientos_inventario
  ADD COLUMN IF NOT EXISTS id_sucursal TEXT;

ALTER TABLE shiny.movimientos_inventario
  ADD COLUMN IF NOT EXISTS sucursal TEXT;

CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_id_sucursal
  ON shiny.movimientos_inventario (id_sucursal);

CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_id_producto
  ON shiny.movimientos_inventario (id_producto);

COMMIT;

-- Verificación
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema='shiny'
  AND table_name='movimientos_inventario'
  AND column_name IN ('id_sucursal','sucursal')
ORDER BY ordinal_position;
