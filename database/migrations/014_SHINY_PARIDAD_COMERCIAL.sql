-- Shiny Fase Local 10.4 - Paridad Comercial
BEGIN;

ALTER TABLE shiny.gastos
  ALTER COLUMN comprobante_url TYPE TEXT USING comprobante_url::text;
ALTER TABLE shiny.gastos
  ALTER COLUMN notas TYPE TEXT USING notas::text;

CREATE TABLE IF NOT EXISTS shiny.devoluciones_detalle (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_devolucion TEXT NOT NULL,
  linea BIGINT NOT NULL,
  id_producto TEXT,
  sku TEXT,
  producto TEXT,
  cantidad BIGINT NOT NULL DEFAULT 0,
  precio_unitario NUMERIC(18,4) NOT NULL DEFAULT 0,
  importe NUMERIC(18,4) NOT NULL DEFAULT 0,
  stock_anterior BIGINT,
  stock_nuevo BIGINT,
  id_sucursal TEXT,
  sucursal TEXT,
  CONSTRAINT uq_devoluciones_detalle UNIQUE(id_devolucion,linea)
);

CREATE TABLE IF NOT EXISTS shiny.cuentas_por_pagar_pagos (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_pago TEXT NOT NULL UNIQUE,
  id_cxp TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  monto NUMERIC(18,4) NOT NULL,
  metodo_pago TEXT,
  referencia TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  id_movimiento_caja TEXT,
  id_admin TEXT,
  administrador TEXT,
  notas TEXT
);

CREATE INDEX IF NOT EXISTS idx_phase104_quote_state_date
  ON shiny.cotizaciones_admin(estado,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase104_provider_active
  ON shiny.proveedores(activo,nombre_comercial,razon_social);
CREATE INDEX IF NOT EXISTS idx_phase104_returns_date
  ON shiny.devoluciones(fecha DESC,estado,tipo);
CREATE INDEX IF NOT EXISTS idx_phase104_returns_reference
  ON shiny.devoluciones(referencia);
CREATE INDEX IF NOT EXISTS idx_phase104_cxp_state_due
  ON shiny.cuentas_por_pagar(estado,vencimiento);
CREATE INDEX IF NOT EXISTS idx_phase104_cxp_payments
  ON shiny.cuentas_por_pagar_pagos(id_cxp,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase104_expenses_branch_date
  ON shiny.gastos(id_sucursal,fecha_gasto DESC,estado);

-- Permisos de runtime para las nuevas estructuras y corrección defensiva de sesiones Fase 10.
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  shiny.devoluciones_detalle,
  shiny.cuentas_por_pagar_pagos
TO shiny_app;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE shiny.admin_sessions TO shiny_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA shiny TO shiny_app;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '014','Shiny Fase Local 10.4 - cotizaciones devoluciones proveedores CxP gastos'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='014');

COMMIT;
