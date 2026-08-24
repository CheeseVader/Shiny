-- =========================================================
-- GMX POS-PAGO-MIXTO-001
-- Desglose de pagos parciales/mixtos
-- =========================================================
BEGIN;

ALTER TABLE gmx.pedidos
  ADD COLUMN IF NOT EXISTS efectivo_recibido NUMERIC(18,4);

ALTER TABLE gmx.pedidos
  ADD COLUMN IF NOT EXISTS cambio_entregado NUMERIC(18,4);

CREATE TABLE IF NOT EXISTS gmx.pedido_pagos(
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_pago TEXT NOT NULL,
  id_pedido TEXT NOT NULL,
  linea INTEGER NOT NULL,
  metodo TEXT NOT NULL,
  importe_aplicado NUMERIC(18,4) NOT NULL,
  efectivo_recibido NUMERIC(18,4),
  cambio_entregado NUMERIC(18,4),
  referencia TEXT,
  proveedor TEXT,
  provider_payment_id TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  id_admin TEXT,
  administrador TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_pagos_id_pago
  ON gmx.pedido_pagos(id_pago);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_pagos_linea
  ON gmx.pedido_pagos(id_pedido,linea);

CREATE INDEX IF NOT EXISTS ix_pedido_pagos_pedido
  ON gmx.pedido_pagos(id_pedido,fecha DESC);

ALTER TABLE gmx.pedido_pagos
  DROP CONSTRAINT IF EXISTS chk_pedido_pagos_importe_positivo;
ALTER TABLE gmx.pedido_pagos
  ADD CONSTRAINT chk_pedido_pagos_importe_positivo
  CHECK (importe_aplicado > 0);

ALTER TABLE gmx.pedido_pagos
  DROP CONSTRAINT IF EXISTS chk_pedido_pagos_cambio_no_negativo;
ALTER TABLE gmx.pedido_pagos
  ADD CONSTRAINT chk_pedido_pagos_cambio_no_negativo
  CHECK (cambio_entregado IS NULL OR cambio_entregado >= 0);

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema='gmx' AND table_name='pedido_pagos';

SELECT column_name,data_type
FROM information_schema.columns
WHERE table_schema='gmx' AND table_name='pedido_pagos'
ORDER BY ordinal_position;
