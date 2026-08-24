BEGIN;

CREATE TABLE IF NOT EXISTS gmx.devoluciones_reembolsos (
  row_id BIGSERIAL PRIMARY KEY,
  id_reembolso TEXT NOT NULL UNIQUE,
  id_devolucion TEXT NOT NULL,
  id_pedido TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metodo TEXT NOT NULL,
  proveedor TEXT NOT NULL DEFAULT 'MANUAL',
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  payment_id TEXT,
  refund_id_proveedor TEXT,
  idempotency_key TEXT UNIQUE,
  referencia TEXT,
  integracion_habilitada BOOLEAN NOT NULL DEFAULT FALSE,
  id_admin_crea TEXT,
  usuario_crea TEXT,
  id_admin_autoriza TEXT,
  usuario_autoriza TEXT,
  fecha_autorizacion TIMESTAMPTZ,
  error_codigo TEXT,
  error_detalle TEXT,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_reembolsos_devolucion ON gmx.devoluciones_reembolsos(id_devolucion);
CREATE INDEX IF NOT EXISTS idx_dev_reembolsos_pedido ON gmx.devoluciones_reembolsos(id_pedido);
CREATE INDEX IF NOT EXISTS idx_dev_reembolsos_estado ON gmx.devoluciones_reembolsos(estado);

CREATE TABLE IF NOT EXISTS gmx.devoluciones_eventos (
  row_id BIGSERIAL PRIMARY KEY,
  id_evento TEXT NOT NULL UNIQUE,
  id_devolucion TEXT NOT NULL,
  id_reembolso TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL,
  detalle TEXT,
  id_admin TEXT,
  usuario TEXT
);
CREATE INDEX IF NOT EXISTS idx_dev_eventos_devolucion ON gmx.devoluciones_eventos(id_devolucion,fecha);

COMMENT ON TABLE gmx.devoluciones_reembolsos IS 'Preparación de reembolsos. Integraciones externas permanecen deshabilitadas hasta validación posterior a auditoría.';
COMMENT ON COLUMN gmx.devoluciones_reembolsos.integracion_habilitada IS 'Debe permanecer FALSE hasta aprobar auditoría y pruebas sandbox.';

COMMIT;
