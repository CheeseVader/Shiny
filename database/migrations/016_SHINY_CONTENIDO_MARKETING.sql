-- Shiny Fase Local 10.5 - Contenido / Marketing + arquitectura sin límites artificiales
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shiny_config_param
  ON shiny.configuracion(parametro);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shiny_promociones_id
  ON shiny.promociones(id) WHERE id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiny_promociones_codigo
  ON shiny.promociones(UPPER(codigo)) WHERE NULLIF(TRIM(codigo),'') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shiny_notificaciones_id
  ON shiny.notificaciones_admin(id) WHERE id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shiny_multimedia_id
  ON shiny.multimedia(id_media) WHERE id_media IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shiny_promociones_estado
  ON shiny.promociones(estado,inicio,fin);
CREATE INDEX IF NOT EXISTS idx_shiny_notificaciones_fecha
  ON shiny.notificaciones_admin(leida,prioridad,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_shiny_multimedia_categoria
  ON shiny.multimedia(activo,categoria,tipo);

-- Valores iniciales no destructivos.
INSERT INTO shiny.configuracion(parametro,valor)
VALUES
 ('appearance.brand_name','Shiny'),
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
  shiny.configuracion,
  shiny.promociones,
  shiny.notificaciones_admin,
  shiny.multimedia
TO shiny_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA shiny TO shiny_app;

INSERT INTO shiny.permisos_admin(email,modulo,leer,crear,editar,eliminar,autorizar,actualizacion)
SELECT p.email,'CONTENIDO',
       BOOL_OR(COALESCE(p.leer,false)),
       BOOL_OR(COALESCE(p.crear,false)),
       BOOL_OR(COALESCE(p.editar,false)),
       BOOL_OR(COALESCE(p.eliminar,false)),
       BOOL_OR(COALESCE(p.autorizar,false)),
       NOW()
FROM shiny.permisos_admin p
WHERE UPPER(COALESCE(p.modulo,'')) IN ('ADMIN','REPORTES')
  AND NOT EXISTS(
    SELECT 1 FROM shiny.permisos_admin x
    WHERE LOWER(x.email)=LOWER(p.email)
      AND UPPER(COALESCE(x.modulo,''))='CONTENIDO'
  )
GROUP BY p.email;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '016','Shiny Fase Local 10.5 - contenido marketing y bulk sin limite funcional'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='016');

COMMIT;
