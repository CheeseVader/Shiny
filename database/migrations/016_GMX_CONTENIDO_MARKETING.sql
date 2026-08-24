-- GMX Fase Local 10.5 - Contenido / Marketing + arquitectura sin límites artificiales
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gmx_config_param
  ON gmx.configuracion(parametro);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gmx_promociones_id
  ON gmx.promociones(id) WHERE id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gmx_promociones_codigo
  ON gmx.promociones(UPPER(codigo)) WHERE NULLIF(TRIM(codigo),'') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gmx_notificaciones_id
  ON gmx.notificaciones_admin(id) WHERE id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gmx_multimedia_id
  ON gmx.multimedia(id_media) WHERE id_media IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gmx_promociones_estado
  ON gmx.promociones(estado,inicio,fin);
CREATE INDEX IF NOT EXISTS idx_gmx_notificaciones_fecha
  ON gmx.notificaciones_admin(leida,prioridad,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gmx_multimedia_categoria
  ON gmx.multimedia(activo,categoria,tipo);

-- Valores iniciales no destructivos.
INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('appearance.brand_name','GMX'),
 ('appearance.logo_text','G'),
 ('appearance.primary','#101828'),
 ('appearance.surface','#ffffff'),
 ('appearance.background','#f2f4f7'),
 ('appearance.radius','14'),
 ('appearance.density','comfortable'),
 ('appearance.sidebar_compact','false'),
 ('store.currency','MXN'),
 ('store.locale','es-MX'),
 ('alerts.low_stock_enabled','true'),
 ('alerts.low_stock_threshold','5')
ON CONFLICT (parametro) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  gmx.configuracion,
  gmx.promociones,
  gmx.notificaciones_admin,
  gmx.multimedia
TO gmx_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.permisos_admin(email,modulo,leer,crear,editar,eliminar,autorizar,actualizacion)
SELECT p.email,'CONTENIDO',
       BOOL_OR(COALESCE(p.leer,false)),
       BOOL_OR(COALESCE(p.crear,false)),
       BOOL_OR(COALESCE(p.editar,false)),
       BOOL_OR(COALESCE(p.eliminar,false)),
       BOOL_OR(COALESCE(p.autorizar,false)),
       NOW()
FROM gmx.permisos_admin p
WHERE UPPER(COALESCE(p.modulo,'')) IN ('ADMIN','REPORTES')
  AND NOT EXISTS(
    SELECT 1 FROM gmx.permisos_admin x
    WHERE LOWER(x.email)=LOWER(p.email)
      AND UPPER(COALESCE(x.modulo,''))='CONTENIDO'
  )
GROUP BY p.email;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '016','GMX Fase Local 10.5 - contenido marketing y bulk sin limite funcional'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='016');

COMMIT;
