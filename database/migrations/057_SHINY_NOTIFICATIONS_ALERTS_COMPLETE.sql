BEGIN;

ALTER TABLE shiny.notificaciones_admin
  ADD COLUMN IF NOT EXISTS clave TEXT,
  ADD COLUMN IF NOT EXISTS id_sucursal TEXT,
  ADD COLUMN IF NOT EXISTS sucursal TEXT,
  ADD COLUMN IF NOT EXISTS referencia TEXT,
  ADD COLUMN IF NOT EXISTS ruta TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'ABIERTA',
  ADD COLUMN IF NOT EXISTS resuelta BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primera_deteccion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultima_deteccion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_lectura TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leida_por TEXT,
  ADD COLUMN IF NOT EXISTS fecha_resolucion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resuelta_por TEXT,
  ADD COLUMN IF NOT EXISTS nota_resolucion TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE shiny.notificaciones_admin
SET estado=CASE WHEN COALESCE(resuelta,false) THEN 'RESUELTA' ELSE 'ABIERTA' END,
    primera_deteccion=COALESCE(primera_deteccion,fecha,NOW()),
    ultima_deteccion=COALESCE(ultima_deteccion,actualizacion,fecha,NOW())
WHERE estado IS NULL OR primera_deteccion IS NULL OR ultima_deteccion IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notificaciones_open_key
  ON shiny.notificaciones_admin(clave)
  WHERE clave IS NOT NULL AND COALESCE(resuelta,false)=false;

CREATE INDEX IF NOT EXISTS ix_notificaciones_scope_open
  ON shiny.notificaciones_admin(id_sucursal,resuelta,prioridad,fecha DESC);

CREATE INDEX IF NOT EXISTS ix_notificaciones_type_open
  ON shiny.notificaciones_admin(tipo,resuelta,fecha DESC);

INSERT INTO shiny.configuracion(parametro,valor) VALUES
 ('alerts.tcg_low_stock_enabled','true'),
 ('alerts.tcg_low_stock_threshold','2'),
 ('alerts.payables_enabled','true'),
 ('alerts.payables_due_days','5'),
 ('alerts.purchase_invoice_enabled','true'),
 ('alerts.purchase_invoice_days','2'),
 ('alerts.cash_difference_enabled','true'),
 ('alerts.cash_difference_threshold','1'),
 ('alerts.tcg_sync_enabled','true'),
 ('alerts.auto_generate_enabled','true'),
 ('alerts.auto_generate_minutes','15')
ON CONFLICT(parametro) DO NOTHING;

-- Dar acceso de lectura al módulo de alertas donde ya existía acceso operativo.
INSERT INTO shiny.permisos_admin(email,modulo,leer,crear,editar,eliminar,autorizar,actualizacion)
SELECT DISTINCT p.email,'NOTIFICACIONES',true,false,false,false,false,NOW()
FROM shiny.permisos_admin p
WHERE UPPER(COALESCE(p.modulo,'')) IN ('REPORTES','INVENTARIO','COMERCIAL','CAJA','TCG')
  AND NOT EXISTS(
    SELECT 1 FROM shiny.permisos_admin n
    WHERE LOWER(n.email)=LOWER(p.email) AND UPPER(n.modulo)='NOTIFICACIONES'
  );

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE shiny.notificaciones_admin TO shiny_app;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '057','Shiny 10.6.2.4.1.12.1.9 - complete notifications and alerts center'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='057');

COMMIT;
