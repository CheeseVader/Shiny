
-- Shiny Fase Local 10.6
-- Portal Público React
BEGIN;

ALTER TABLE shiny.pedidos
  ADD COLUMN IF NOT EXISTS public_token TEXT,
  ADD COLUMN IF NOT EXISTS public_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origen_publico TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_public_token
  ON shiny.pedidos(public_token)
  WHERE public_token IS NOT NULL;

INSERT INTO shiny.configuracion(parametro,valor)
VALUES
 ('public.store.enabled','true'),
 ('public.store.currency','MXN'),
 ('public.store.locale','es-MX'),
 ('public.store.checkout_enabled','true'),
 ('public.store.allow_guest_checkout','true'),
 ('public.store.order_expiration_hours','48'),
 ('public.store.show_stock','true'),
 ('public.store.show_loyalty_estimate','true'),
 ('public.store.contact_email',''),
 ('public.store.contact_phone','')
ON CONFLICT(parametro) DO NOTHING;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '024','Shiny Fase Local 10.6 - Portal Publico React'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='024');

COMMIT;
