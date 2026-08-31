BEGIN;
ALTER TABLE shiny.pedidos ADD COLUMN IF NOT EXISTS efectivo_recibido NUMERIC(18,4);
ALTER TABLE shiny.pedidos ADD COLUMN IF NOT EXISTS cambio_entregado NUMERIC(18,4);
COMMIT;
SELECT column_name,data_type FROM information_schema.columns
WHERE table_schema='shiny' AND table_name='pedidos'
AND column_name IN ('efectivo_recibido','cambio_entregado')
ORDER BY column_name;
