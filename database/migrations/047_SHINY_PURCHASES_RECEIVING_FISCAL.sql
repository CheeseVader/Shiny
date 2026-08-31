BEGIN;

-- Shiny 10.6.2.4.1.6 — Compras / Recepción / Comprobación fiscal

ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS id_sucursal_recepcion TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS sucursal_recepcion TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS estatus_fiscal TEXT NOT NULL DEFAULT 'SIN_COMPROBANTE';
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS uuid_cfdi TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS fecha_documento TIMESTAMPTZ;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS subtotal_documento NUMERIC(18,4);
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS descuentos NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS iva NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS ieps NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS retenciones NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS otros_cargos NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS total_documento NUMERIC(18,4);
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS diferencia_documento NUMERIC(18,4);
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS metodo_pago TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS documento_nombre TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS documento_mime TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS documento_base64 TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS xml_nombre TEXT;
ALTER TABLE shiny.compras ADD COLUMN IF NOT EXISTS xml_cfdi TEXT;

ALTER TABLE shiny.compras_detalle ADD COLUMN IF NOT EXISTS descuento_linea NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras_detalle ADD COLUMN IF NOT EXISTS impuesto_tipo TEXT;
ALTER TABLE shiny.compras_detalle ADD COLUMN IF NOT EXISTS impuesto_tasa NUMERIC(9,6) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras_detalle ADD COLUMN IF NOT EXISTS impuesto_importe NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE shiny.compras_detalle ADD COLUMN IF NOT EXISTS total_linea NUMERIC(18,4);
ALTER TABLE shiny.compras_detalle ADD COLUMN IF NOT EXISTS producto_nuevo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_compras_fiscal ON shiny.compras(estatus_fiscal,fecha DESC);
CREATE INDEX IF NOT EXISTS ix_compras_branch ON shiny.compras(id_sucursal_recepcion,fecha DESC);
CREATE INDEX IF NOT EXISTS ix_compras_uuid_cfdi ON shiny.compras(uuid_cfdi) WHERE uuid_cfdi IS NOT NULL;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '047','Shiny 10.6.2.4.1.6 - Purchases receiving, fiscal status, document reconciliation and new products'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='047');

COMMIT;
