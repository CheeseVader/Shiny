-- ============================================================
-- CAJA-AUTH-001 - VALIDACION
-- Ejecutar DESPUES de abrir una nueva caja y registrar un movimiento.
-- ============================================================

SELECT
  row_id,id_caja,id_sucursal,estado,
  id_admin_apertura,admin_apertura,
  id_admin_cierre,admin_cierre,
  fecha_apertura,fecha_cierre
FROM shiny.caja_sesiones
WHERE id_sucursal='SUC-000009'
ORDER BY row_id DESC
LIMIT 5;

SELECT
  row_id,id_movimiento,id_caja,tipo,categoria,importe,
  id_admin,administrador,descripcion,fecha
FROM shiny.caja_movimientos
WHERE id_sucursal='SUC-000009'
ORDER BY row_id DESC
LIMIT 10;
