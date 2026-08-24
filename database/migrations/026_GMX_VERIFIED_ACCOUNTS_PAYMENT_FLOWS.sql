
BEGIN;

-- Existing client accounts from previous phases predate email verification.
UPDATE gmx.cliente_cuentas SET email_verificado=true WHERE email_verificado=false;

CREATE TABLE IF NOT EXISTS gmx.cliente_email_tokens (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  id_cuenta TEXT NOT NULL,
  id_cliente TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_cliente_email_tokens_account
  ON gmx.cliente_email_tokens(id_cuenta,expires_at);

CREATE TABLE IF NOT EXISTS gmx.payment_transactions (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_transaccion TEXT NOT NULL UNIQUE,
  id_pedido TEXT NOT NULL,
  public_token TEXT,
  proveedor TEXT NOT NULL,
  metodo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDING',
  monto NUMERIC(18,4) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  provider_session_id TEXT,
  provider_payment_id TEXT,
  referencia TEXT,
  proof_name TEXT,
  proof_mime TEXT,
  proof_path TEXT,
  proof_uploaded_at TIMESTAMPTZ,
  metadata_json JSONB,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_payment_transactions_order
  ON gmx.payment_transactions(id_pedido,fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS ix_payment_transactions_provider_session
  ON gmx.payment_transactions(provider_session_id)
  WHERE provider_session_id IS NOT NULL;

ALTER TABLE gmx.pedidos
  ADD COLUMN IF NOT EXISTS tipo_entrega TEXT NOT NULL DEFAULT 'PICKUP',
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider_session TEXT,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_proof_status TEXT;

INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('public.store.email_verification_required','true'),
 ('public.store.email_verification_hours','24'),
 ('public.store.delivery_enabled','true'),
 ('public.store.pickup_enabled','true'),
 ('public.payment.card.provider','STRIPE'),
 ('public.payment.transfer.bank_name',''),
 ('public.payment.transfer.account_holder',''),
 ('public.payment.transfer.account_number',''),
 ('public.payment.transfer.clabe',''),
 ('public.payment.transfer.instructions','Usa tu número de comprobante como referencia.'),
 ('public.payment.transfer.proof_required','true')
ON CONFLICT(parametro) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  gmx.cliente_email_tokens,
  gmx.payment_transactions
TO gmx_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '026','GMX Fase Local 10.6.2 - verified accounts payment flows admin products'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='026');

COMMIT;
