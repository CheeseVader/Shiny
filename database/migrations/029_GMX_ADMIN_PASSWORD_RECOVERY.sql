
BEGIN;

CREATE TABLE IF NOT EXISTS gmx.admin_password_reset_tokens (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  id_admin TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  completed_ip TEXT
);

CREATE INDEX IF NOT EXISTS ix_admin_password_reset_admin
  ON gmx.admin_password_reset_tokens(id_admin,expires_at);

INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('security.admin_password_reset_enabled','true'),
 ('security.admin_password_reset_minutes','20')
ON CONFLICT(parametro) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE
ON gmx.admin_password_reset_tokens
TO gmx_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '029','GMX 10.6.2.1 - admin account password recovery'
WHERE NOT EXISTS(
  SELECT 1 FROM gmx.schema_migrations WHERE version='029'
);

COMMIT;
