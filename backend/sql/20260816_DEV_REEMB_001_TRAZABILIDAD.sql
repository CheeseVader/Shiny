-- ============================================================
-- GMX DEV-REEMB-001
-- Trazabilidad automática de devoluciones / reembolsos
-- Fecha: 2026-08-16
--
-- OBJETIVOS
-- 1) Toda devolución crea eventos de auditoría.
-- 2) Todo EGRESO de caja categoría DEVOLUCION crea/relaciona
--    un registro formal en gmx.devoluciones_reembolsos.
-- 3) Idempotente: no duplica reembolsos ni eventos.
-- 4) Backfill de devoluciones/reembolsos ya existentes.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Índices de protección / búsqueda
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_devoluciones_reembolsos_id_reembolso
ON gmx.devoluciones_reembolsos(id_reembolso)
WHERE id_reembolso IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_devoluciones_reembolsos_idempotency
ON gmx.devoluciones_reembolsos(idempotency_key)
WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_devoluciones_eventos_id_evento
ON gmx.devoluciones_eventos(id_evento)
WHERE id_evento IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_devoluciones_reembolsos_devolucion
ON gmx.devoluciones_reembolsos(id_devolucion, fecha DESC);

CREATE INDEX IF NOT EXISTS ix_devoluciones_eventos_devolucion
ON gmx.devoluciones_eventos(id_devolucion, fecha DESC);

-- ------------------------------------------------------------
-- Función: evento al crear devolución
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION gmx.fn_dev_audit_devolucion_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM gmx.devoluciones_eventos e
    WHERE e.id_devolucion = NEW.id
      AND e.tipo = 'DEVOLUCION_CREADA'
  ) THEN
    INSERT INTO gmx.devoluciones_eventos(
      id_evento,
      id_devolucion,
      id_reembolso,
      fecha,
      tipo,
      estado,
      detalle,
      id_admin,
      usuario
    )
    VALUES(
      'DEVEVT-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
        || '-' || upper(substr(md5(random()::text),1,6)),
      NEW.id,
      NULL,
      COALESCE(NEW.fecha, now()),
      'DEVOLUCION_CREADA',
      COALESCE(NEW.estado,''),
      'Devolución creada. Referencia: ' || COALESCE(NEW.referencia,''),
      NULL,
      current_user
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_audit_devolucion_insert
ON gmx.devoluciones;

CREATE TRIGGER trg_dev_audit_devolucion_insert
AFTER INSERT ON gmx.devoluciones
FOR EACH ROW
EXECUTE FUNCTION gmx.fn_dev_audit_devolucion_insert();

-- ------------------------------------------------------------
-- Función: evento cuando cambia el estado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION gmx.fn_dev_audit_devolucion_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT EXISTS (
      SELECT 1
      FROM gmx.devoluciones_eventos e
      WHERE e.id_devolucion = NEW.id
        AND e.tipo = 'ESTADO_DEVOLUCION'
        AND COALESCE(e.estado,'') = COALESCE(NEW.estado,'')
    ) THEN
      INSERT INTO gmx.devoluciones_eventos(
        id_evento,
        id_devolucion,
        id_reembolso,
        fecha,
        tipo,
        estado,
        detalle,
        id_admin,
        usuario
      )
      VALUES(
        'DEVEVT-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
          || '-' || upper(substr(md5(random()::text),1,6)),
        NEW.id,
        NULL,
        COALESCE(NEW.actualizacion, now()),
        'ESTADO_DEVOLUCION',
        COALESCE(NEW.estado,''),
        'Estado de devolución actualizado de '
          || COALESCE(OLD.estado,'')
          || ' a ' || COALESCE(NEW.estado,''),
        NULL,
        current_user
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_audit_devolucion_estado
ON gmx.devoluciones;

CREATE TRIGGER trg_dev_audit_devolucion_estado
AFTER UPDATE OF estado ON gmx.devoluciones
FOR EACH ROW
EXECUTE FUNCTION gmx.fn_dev_audit_devolucion_estado();

-- ------------------------------------------------------------
-- Función principal:
-- al insertar EGRESO / DEVOLUCION en caja, formaliza reembolso
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION gmx.fn_dev_audit_caja_reembolso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_dev RECORD;
  v_id_reembolso text;
  v_key text;
BEGIN
  IF upper(COALESCE(NEW.tipo,'')) <> 'EGRESO'
     OR upper(COALESCE(NEW.categoria,'')) <> 'DEVOLUCION'
     OR COALESCE(NEW.anulado,false) = true
  THEN
    RETURN NEW;
  END IF;

  -- En el flujo actual, id_origen contiene DEV-...
  SELECT d.*
    INTO v_dev
  FROM gmx.devoluciones d
  WHERE d.id = NEW.id_origen
  ORDER BY d.row_id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- No bloqueamos caja si existiera un egreso legacy no enlazado.
    RETURN NEW;
  END IF;

  v_key := 'CAJA-DEVOLUCION:' || COALESCE(NEW.id_movimiento,'');
  v_id_reembolso := 'REEMB-' ||
      floor(extract(epoch from COALESCE(NEW.fecha,clock_timestamp())) * 1000)::bigint::text
      || '-' || upper(substr(md5(COALESCE(NEW.id_movimiento,'') || random()::text),1,6));

  IF NOT EXISTS (
    SELECT 1
    FROM gmx.devoluciones_reembolsos r
    WHERE r.idempotency_key = v_key
       OR (r.id_devolucion = v_dev.id
           AND r.referencia = NEW.id_movimiento)
  ) THEN
    INSERT INTO gmx.devoluciones_reembolsos(
      id_reembolso,
      id_devolucion,
      id_pedido,
      fecha,
      metodo,
      proveedor,
      estado,
      monto,
      moneda,
      payment_id,
      refund_id_proveedor,
      idempotency_key,
      referencia,
      integracion_habilitada,
      id_admin_crea,
      usuario_crea,
      id_admin_autoriza,
      usuario_autoriza,
      fecha_autorizacion,
      error_codigo,
      error_detalle,
      fecha_actualizacion
    )
    VALUES(
      v_id_reembolso,
      v_dev.id,
      v_dev.referencia,
      COALESCE(NEW.fecha,now()),
      upper(COALESCE(NEW.metodo_pago,'EFECTIVO')),
      CASE
        WHEN upper(COALESCE(NEW.metodo_pago,'')) = 'EFECTIVO' THEN 'CAJA'
        ELSE 'LOCAL'
      END,
      'COMPLETADO',
      abs(COALESCE(NEW.importe,0)),
      'MXN',
      NULL,
      NEW.id_movimiento,
      v_key,
      NEW.id_movimiento,
      false,
      NEW.id_admin,
      NEW.administrador,
      NEW.id_admin,
      NEW.administrador,
      COALESCE(NEW.fecha,now()),
      NULL,
      NULL,
      COALESCE(NEW.fecha,now())
    );
  ELSE
    SELECT r.id_reembolso
      INTO v_id_reembolso
    FROM gmx.devoluciones_reembolsos r
    WHERE r.idempotency_key = v_key
       OR (r.id_devolucion = v_dev.id
           AND r.referencia = NEW.id_movimiento)
    ORDER BY r.row_id DESC
    LIMIT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM gmx.devoluciones_eventos e
    WHERE e.id_devolucion = v_dev.id
      AND e.tipo = 'REEMBOLSO_REGISTRADO'
      AND e.id_reembolso = v_id_reembolso
  ) THEN
    INSERT INTO gmx.devoluciones_eventos(
      id_evento,
      id_devolucion,
      id_reembolso,
      fecha,
      tipo,
      estado,
      detalle,
      id_admin,
      usuario
    )
    VALUES(
      'DEVEVT-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
        || '-' || upper(substr(md5(random()::text),1,6)),
      v_dev.id,
      v_id_reembolso,
      COALESCE(NEW.fecha,now()),
      'REEMBOLSO_REGISTRADO',
      'COMPLETADO',
      'Reembolso ' || upper(COALESCE(NEW.metodo_pago,'EFECTIVO'))
        || ' por $' || abs(COALESCE(NEW.importe,0))::text
        || '. Movimiento caja: ' || COALESCE(NEW.id_movimiento,''),
      NEW.id_admin,
      NEW.administrador
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_audit_caja_reembolso
ON gmx.caja_movimientos;

CREATE TRIGGER trg_dev_audit_caja_reembolso
AFTER INSERT ON gmx.caja_movimientos
FOR EACH ROW
EXECUTE FUNCTION gmx.fn_dev_audit_caja_reembolso();

-- ------------------------------------------------------------
-- BACKFILL
-- Reembolsos efectivos ya materializados en caja pero sin registro formal
-- ------------------------------------------------------------
INSERT INTO gmx.devoluciones_reembolsos(
  id_reembolso,
  id_devolucion,
  id_pedido,
  fecha,
  metodo,
  proveedor,
  estado,
  monto,
  moneda,
  payment_id,
  refund_id_proveedor,
  idempotency_key,
  referencia,
  integracion_habilitada,
  id_admin_crea,
  usuario_crea,
  id_admin_autoriza,
  usuario_autoriza,
  fecha_autorizacion,
  error_codigo,
  error_detalle,
  fecha_actualizacion
)
SELECT
  'REEMB-BF-' || c.row_id::text || '-' || upper(substr(md5(c.id_movimiento),1,6)),
  d.id,
  d.referencia,
  c.fecha,
  upper(COALESCE(c.metodo_pago,'EFECTIVO')),
  CASE
    WHEN upper(COALESCE(c.metodo_pago,''))='EFECTIVO' THEN 'CAJA'
    ELSE 'LOCAL'
  END,
  'COMPLETADO',
  abs(COALESCE(c.importe,0)),
  'MXN',
  NULL,
  c.id_movimiento,
  'CAJA-DEVOLUCION:' || c.id_movimiento,
  c.id_movimiento,
  false,
  c.id_admin,
  c.administrador,
  c.id_admin,
  c.administrador,
  c.fecha,
  NULL,
  NULL,
  c.fecha
FROM gmx.caja_movimientos c
JOIN gmx.devoluciones d
  ON d.id = c.id_origen
WHERE upper(COALESCE(c.tipo,''))='EGRESO'
  AND upper(COALESCE(c.categoria,''))='DEVOLUCION'
  AND COALESCE(c.anulado,false)=false
  AND NOT EXISTS (
    SELECT 1
    FROM gmx.devoluciones_reembolsos r
    WHERE r.idempotency_key = 'CAJA-DEVOLUCION:' || c.id_movimiento
       OR (r.id_devolucion=d.id AND r.referencia=c.id_movimiento)
  );

-- Eventos de creación para devoluciones existentes sin evento
INSERT INTO gmx.devoluciones_eventos(
  id_evento,id_devolucion,id_reembolso,fecha,tipo,estado,detalle,id_admin,usuario
)
SELECT
  'DEVEVT-BF-C-' || d.row_id::text || '-' || upper(substr(md5(d.id),1,6)),
  d.id,
  NULL,
  d.fecha,
  'DEVOLUCION_CREADA',
  d.estado,
  'Evento reconstruido por DEV-REEMB-001. Referencia: ' || COALESCE(d.referencia,''),
  NULL,
  'BACKFILL'
FROM gmx.devoluciones d
WHERE NOT EXISTS (
  SELECT 1 FROM gmx.devoluciones_eventos e
  WHERE e.id_devolucion=d.id AND e.tipo='DEVOLUCION_CREADA'
);

-- Eventos de reembolso para registros formalizados sin evento
INSERT INTO gmx.devoluciones_eventos(
  id_evento,id_devolucion,id_reembolso,fecha,tipo,estado,detalle,id_admin,usuario
)
SELECT
  'DEVEVT-BF-R-' || r.row_id::text || '-' || upper(substr(md5(r.id_reembolso),1,6)),
  r.id_devolucion,
  r.id_reembolso,
  r.fecha,
  'REEMBOLSO_REGISTRADO',
  r.estado,
  'Evento reconstruido por DEV-REEMB-001. Reembolso '
    || COALESCE(r.metodo,'') || ' por $' || COALESCE(r.monto,0)::text,
  r.id_admin_crea,
  COALESCE(r.usuario_crea,'BACKFILL')
FROM gmx.devoluciones_reembolsos r
WHERE NOT EXISTS (
  SELECT 1 FROM gmx.devoluciones_eventos e
  WHERE e.id_devolucion=r.id_devolucion
    AND e.id_reembolso=r.id_reembolso
    AND e.tipo='REEMBOLSO_REGISTRADO'
);

-- Permisos de funciones/tablas para la aplicación
GRANT SELECT,INSERT,UPDATE,DELETE
ON TABLE
  gmx.devoluciones,
  gmx.devoluciones_detalle,
  gmx.devoluciones_reembolsos,
  gmx.devoluciones_eventos
TO gmx_app;

GRANT USAGE,SELECT
ON ALL SEQUENCES IN SCHEMA gmx
TO gmx_app;

COMMIT;

-- ============================================================
-- VALIDACIÓN ESPECÍFICA DE LA DEVOLUCIÓN DE AUDITORÍA
-- ============================================================
SELECT
  r.row_id,
  r.id_reembolso,
  r.id_devolucion,
  r.id_pedido,
  r.fecha,
  r.metodo,
  r.proveedor,
  r.estado,
  r.monto,
  r.moneda,
  r.refund_id_proveedor,
  r.idempotency_key,
  r.referencia,
  r.id_admin_crea,
  r.usuario_crea
FROM gmx.devoluciones_reembolsos r
WHERE r.id_devolucion='DEV-1786900926665-XHO65'
ORDER BY r.row_id;

SELECT
  e.row_id,
  e.id_evento,
  e.id_devolucion,
  e.id_reembolso,
  e.fecha,
  e.tipo,
  e.estado,
  e.detalle,
  e.id_admin,
  e.usuario
FROM gmx.devoluciones_eventos e
WHERE e.id_devolucion='DEV-1786900926665-XHO65'
ORDER BY e.row_id;

-- Debe regresar 0:
SELECT
  d.id AS devolucion_sin_reembolso_formal
FROM gmx.devoluciones d
JOIN gmx.caja_movimientos c
  ON c.id_origen=d.id
 AND upper(COALESCE(c.tipo,''))='EGRESO'
 AND upper(COALESCE(c.categoria,''))='DEVOLUCION'
 AND COALESCE(c.anulado,false)=false
LEFT JOIN gmx.devoluciones_reembolsos r
  ON r.id_devolucion=d.id
 AND r.referencia=c.id_movimiento
WHERE r.row_id IS NULL;
