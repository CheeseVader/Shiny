BEGIN;

DELETE FROM shiny.permisos_admin a
USING shiny.permisos_admin b
WHERE LOWER(a.email)=LOWER(b.email)
  AND UPPER(a.modulo)=UPPER(b.modulo)
  AND a.row_id<b.row_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_permisos_admin_email_modulo
  ON shiny.permisos_admin(LOWER(email),UPPER(modulo));

CREATE INDEX IF NOT EXISTS ix_administradores_role_active
  ON shiny.administradores(rol,activo);

CREATE INDEX IF NOT EXISTS ix_admin_sessions_admin_active
  ON shiny.admin_sessions(id_admin,expires_at)
  WHERE revoked_at IS NULL;

UPDATE shiny.administradores SET sucursales_permitidas='[]'::jsonb
WHERE sucursales_permitidas IS NULL;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '056','Shiny 10.6.2.4.1.12.1.8 - complete RBAC and branch scope'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='056');

COMMIT;
