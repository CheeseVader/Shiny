-- Shiny Fase Local 10 - Seguridad / administración / cierre
BEGIN;

CREATE TABLE IF NOT EXISTS shiny.admin_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT NOT NULL,
  id_admin TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_sessions_token_hash
  ON shiny.admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin
  ON shiny.admin_sessions(id_admin,expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
  ON shiny.admin_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_phase10_admin_email
  ON shiny.administradores(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_phase10_admin_active
  ON shiny.administradores(activo);
CREATE INDEX IF NOT EXISTS idx_phase10_permissions_email_module
  ON shiny.permisos_admin(LOWER(email),modulo);
CREATE INDEX IF NOT EXISTS idx_phase10_audit_date
  ON shiny.auditoria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase10_audit_user
  ON shiny.auditoria(usuario,fecha DESC);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '012','Shiny Fase Local 10 - auth RBAC sessions backups hardening final'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='012');

COMMIT;
