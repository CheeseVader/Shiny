-- Shiny 10.4.1 - permisos comerciales + hardening de runtime
BEGIN;

GRANT USAGE ON SCHEMA shiny TO shiny_app;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  shiny.cotizaciones_admin,
  shiny.devoluciones,
  shiny.proveedores,
  shiny.cuentas_por_pagar,
  shiny.gastos,
  shiny.devoluciones_detalle,
  shiny.cuentas_por_pagar_pagos,
  shiny.compras,
  shiny.compras_detalle,
  shiny.productos,
  shiny.clientes,
  shiny.sucursales,
  shiny.pedidos,
  shiny.detalle_pedidos,
  shiny.inventario_sucursales,
  shiny.movimientos_inventario_sucursales,
  shiny.caja_sesiones,
  shiny.caja_movimientos,
  shiny.auditoria
TO shiny_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA shiny TO shiny_app;

-- Si existen permisos explícitos de COMPRAS o PEDIDOS, crear COMERCIAL con la unión
-- de esos permisos sin reemplazar una configuración COMERCIAL ya existente.
INSERT INTO shiny.permisos_admin(email,modulo,leer,crear,editar,eliminar,autorizar,actualizacion)
SELECT p.email,'COMERCIAL',
       BOOL_OR(COALESCE(p.leer,false)),
       BOOL_OR(COALESCE(p.crear,false)),
       BOOL_OR(COALESCE(p.editar,false)),
       BOOL_OR(COALESCE(p.eliminar,false)),
       BOOL_OR(COALESCE(p.autorizar,false)),
       NOW()
FROM shiny.permisos_admin p
WHERE UPPER(COALESCE(p.modulo,'')) IN ('COMPRAS','PEDIDOS')
  AND NOT EXISTS(
    SELECT 1 FROM shiny.permisos_admin x
    WHERE LOWER(x.email)=LOWER(p.email) AND UPPER(COALESCE(x.modulo,''))='COMERCIAL'
  )
GROUP BY p.email;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '015','Shiny 10.4.1 - commercial runtime permissions and UI/data hotfix'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='015');

COMMIT;
