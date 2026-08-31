BEGIN;

ALTER TABLE shiny.payment_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_provider_session
ON shiny.payment_transactions(proveedor, provider_session_id)
WHERE provider_session_id IS NOT NULL AND provider_session_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_idempotency_key
ON shiny.payment_transactions(idempotency_key)
WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS ix_payment_transactions_order_method_state
ON shiny.payment_transactions(id_pedido, proveedor, metodo, estado, fecha_creacion DESC);

GRANT SELECT,INSERT,UPDATE,DELETE
ON TABLE shiny.payment_transactions
TO shiny_app;

COMMIT;

SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='shiny'
  AND table_name='payment_transactions'
  AND column_name='idempotency_key';

SELECT indexname,indexdef
FROM pg_indexes
WHERE schemaname='shiny'
  AND tablename='payment_transactions'
  AND indexname IN (
    'uq_payment_transactions_provider_session',
    'uq_payment_transactions_idempotency_key',
    'ix_payment_transactions_order_method_state'
  )
ORDER BY indexname;
