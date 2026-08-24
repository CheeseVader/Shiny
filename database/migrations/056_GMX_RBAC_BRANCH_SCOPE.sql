BEGIN;

DELETE FROM gmx.permisos_admin a
USING gmx.permisos_admin b
WHERE LOWER(a.email)=LOWER(b.email)
  AND UPPER(a.modulo)=UPPER(b.modulo)
  AND a.row_id<b.row_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_permisos_admin_email_modulo
  ON gmx.permisos_admin(LOWER(email),UPPER(modulo));

CREATE INDEX IF NOT EXISTS ix_administradores_role_active
  ON gmx.administradores(rol,activo);

CREATE INDEX IF NOT EXISTS ix_admin_sessions_admin_active
  ON gmx.admin_sessions(id_admin,expires_at)
  WHERE revoked_at IS NULL;

UPDATE gmx.administradores SET sucursales_permitidas='[]'::jsonb
WHERE sucursales_permitidas IS NULL;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '056','GMX 10.6.2.4.1.12.1.8 - complete RBAC and branch scope'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='056');

COMMIT;
