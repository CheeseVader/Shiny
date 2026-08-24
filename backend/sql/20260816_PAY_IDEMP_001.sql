BEGIN;

ALTER TABLE gmx.payment_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_provider_session
ON gmx.payment_transactions(proveedor, provider_session_id)
WHERE provider_session_id IS NOT NULL AND provider_session_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_idempotency_key
ON gmx.payment_transactions(idempotency_key)
WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS ix_payment_transactions_order_method_state
ON gmx.payment_transactions(id_pedido, proveedor, metodo, estado, fecha_creacion DESC);

GRANT SELECT,INSERT,UPDATE,DELETE
ON TABLE gmx.payment_transactions
TO gmx_app;

COMMIT;

SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='gmx'
  AND table_name='payment_transactions'
  AND column_name='idempotency_key';

SELECT indexname,indexdef
FROM pg_indexes
WHERE schemaname='gmx'
  AND tablename='payment_transactions'
  AND indexname IN (
    'uq_payment_transactions_provider_session',
    'uq_payment_transactions_idempotency_key',
    'ix_payment_transactions_order_method_state'
  )
ORDER BY indexname;
