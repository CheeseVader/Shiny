BEGIN;

ALTER TABLE shiny.pedidos
  ADD COLUMN IF NOT EXISTS pos_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_pos_idempotency_key
ON shiny.pedidos(pos_idempotency_key)
WHERE pos_idempotency_key IS NOT NULL
  AND pos_idempotency_key <> '';

CREATE INDEX IF NOT EXISTS ix_pedidos_pos_idempotency_lookup
ON shiny.pedidos(pos_idempotency_key,row_id DESC)
WHERE pos_idempotency_key IS NOT NULL
  AND pos_idempotency_key <> '';

COMMIT;

SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='shiny'
  AND table_name='pedidos'
  AND column_name='pos_idempotency_key';

SELECT indexname,indexdef
FROM pg_indexes
WHERE schemaname='shiny'
  AND tablename='pedidos'
  AND indexname IN (
    'uq_pedidos_pos_idempotency_key',
    'ix_pedidos_pos_idempotency_lookup'
  )
ORDER BY indexname;
