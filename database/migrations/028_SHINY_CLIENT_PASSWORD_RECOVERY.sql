
BEGIN;

CREATE TABLE IF NOT EXISTS shiny.cliente_password_reset_tokens (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  id_cuenta TEXT NOT NULL,
  id_cliente TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  completed_ip TEXT
);

CREATE INDEX IF NOT EXISTS ix_cliente_password_reset_account
  ON shiny.cliente_password_reset_tokens(id_cuenta,expires_at);

INSERT INTO shiny.configuracion(parametro,valor)
VALUES
 ('public.store.password_reset_enabled','true'),
 ('public.store.password_reset_minutes','30')
ON CONFLICT(parametro) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE
ON shiny.cliente_password_reset_tokens
TO shiny_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA shiny TO shiny_app;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '028','Shiny 10.6.2 - client account password recovery'
WHERE NOT EXISTS(
  SELECT 1 FROM shiny.schema_migrations WHERE version='028'
);

COMMIT;
