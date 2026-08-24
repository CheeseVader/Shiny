
BEGIN;

CREATE TABLE IF NOT EXISTS gmx.cliente_cuentas (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cuenta TEXT NOT NULL UNIQUE,
  id_cliente TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  email_verificado BOOLEAN NOT NULL DEFAULT false,
  ultimo_login TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_cuentas_email
  ON gmx.cliente_cuentas(LOWER(email));

CREATE TABLE IF NOT EXISTS gmx.cliente_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  id_cuenta TEXT NOT NULL,
  id_cliente TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS ix_cliente_sessions_cliente
  ON gmx.cliente_sessions(id_cliente,expires_at);

CREATE TABLE IF NOT EXISTS gmx.cliente_direcciones (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_direccion TEXT NOT NULL UNIQUE,
  id_cliente TEXT NOT NULL,
  alias TEXT,
  nombre_receptor TEXT,
  telefono TEXT,
  direccion TEXT NOT NULL,
  ciudad TEXT,
  estado TEXT,
  cp TEXT,
  pais TEXT NOT NULL DEFAULT 'México',
  principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_cliente_direcciones_cliente
  ON gmx.cliente_direcciones(id_cliente,activo);

CREATE TABLE IF NOT EXISTS gmx.email_outbox (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_email TEXT NOT NULL UNIQUE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  destinatario TEXT NOT NULL,
  asunto TEXT NOT NULL,
  html TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDING',
  intentos BIGINT NOT NULL DEFAULT 0,
  ultimo_error TEXT,
  enviado_at TIMESTAMPTZ,
  referencia TEXT
);
CREATE INDEX IF NOT EXISTS ix_email_outbox_estado
  ON gmx.email_outbox(estado,fecha);

ALTER TABLE gmx.pedidos
  ADD COLUMN IF NOT EXISTS numero_comprobante TEXT,
  ADD COLUMN IF NOT EXISTS metodo_pago_publico TEXT,
  ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS email_confirmacion_estado TEXT,
  ADD COLUMN IF NOT EXISTS id_cuenta_cliente TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_numero_comprobante
  ON gmx.pedidos(numero_comprobante)
  WHERE numero_comprobante IS NOT NULL;

INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('public.store.customer_accounts_enabled','true'),
 ('public.store.card_payment_enabled','true'),
 ('public.store.transfer_payment_enabled','true'),
 ('public.store.cash_payment_enabled','true'),
 ('public.store.receipt_auto_open','true'),
 ('public.store.email_confirmation_enabled','true'),
 ('public.store.client_session_hours','168'),
 ('security.admin_route_obscurity','false'),
 ('security.admin_api_requires_admin_session','true')
ON CONFLICT(parametro) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  gmx.cliente_cuentas,
  gmx.cliente_sessions,
  gmx.cliente_direcciones,
  gmx.email_outbox
TO gmx_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '025','GMX Fase Local 10.6.1 - client accounts security checkout receipt email'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='025');

COMMIT;
