-- GMX 10.4.1 - permisos comerciales + hardening de runtime
BEGIN;

GRANT USAGE ON SCHEMA gmx TO gmx_app;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  gmx.cotizaciones_admin,
  gmx.devoluciones,
  gmx.proveedores,
  gmx.cuentas_por_pagar,
  gmx.gastos,
  gmx.devoluciones_detalle,
  gmx.cuentas_por_pagar_pagos,
  gmx.compras,
  gmx.compras_detalle,
  gmx.productos,
  gmx.clientes,
  gmx.sucursales,
  gmx.pedidos,
  gmx.detalle_pedidos,
  gmx.inventario_sucursales,
  gmx.movimientos_inventario_sucursales,
  gmx.caja_sesiones,
  gmx.caja_movimientos,
  gmx.auditoria
TO gmx_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

-- Si existen permisos explícitos de COMPRAS o PEDIDOS, crear COMERCIAL con la unión
-- de esos permisos sin reemplazar una configuración COMERCIAL ya existente.
INSERT INTO gmx.permisos_admin(email,modulo,leer,crear,editar,eliminar,autorizar,actualizacion)
SELECT p.email,'COMERCIAL',
       BOOL_OR(COALESCE(p.leer,false)),
       BOOL_OR(COALESCE(p.crear,false)),
       BOOL_OR(COALESCE(p.editar,false)),
       BOOL_OR(COALESCE(p.eliminar,false)),
       BOOL_OR(COALESCE(p.autorizar,false)),
       NOW()
FROM gmx.permisos_admin p
WHERE UPPER(COALESCE(p.modulo,'')) IN ('COMPRAS','PEDIDOS')
  AND NOT EXISTS(
    SELECT 1 FROM gmx.permisos_admin x
    WHERE LOWER(x.email)=LOWER(p.email) AND UPPER(COALESCE(x.modulo,''))='COMERCIAL'
  )
GROUP BY p.email;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '015','GMX 10.4.1 - commercial runtime permissions and UI/data hotfix'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='015');

COMMIT;
