BEGIN;

-- Backfill CONTROLADO para la venta de auditoria ya cancelada antes de POS-FIX-001.
-- Solo actua si:
--   1) el pedido existe y esta CANCELADO,
--   2) hubo un pago EFECTIVO PAGADO,
--   3) existe el movimiento POS original,
--   4) no existe ya una reversion POS_CANCELACION,
--   5) existe una caja ABIERTA para la sucursal.

DO $$
DECLARE
  v_order_id text := 'PED-LOCAL-1786936950246-b3fdc8';
  v_branch text;
  v_branch_name text;
  v_cash_total numeric(18,4);
  v_cash_row bigint;
  v_cash_id text;
  v_orig_row bigint;
  v_orig_mov text;
  v_rev_mov text;
  v_admin text;
  v_admin_name text;
BEGIN
  SELECT p.id_sucursal,p.sucursal
    INTO v_branch,v_branch_name
  FROM gmx.pedidos p
  WHERE p.id_pedido=v_order_id
    AND UPPER(COALESCE(p.estado_pedido,''))='CANCELADO'
  FOR UPDATE;

  IF v_branch IS NULL THEN
    RAISE NOTICE 'Backfill omitido: pedido no encontrado o no cancelado.';
    RETURN;
  END IF;

  SELECT COALESCE(SUM(pp.importe_aplicado),0)
    INTO v_cash_total
  FROM gmx.pedido_pagos pp
  WHERE pp.id_pedido=v_order_id
    AND UPPER(COALESCE(pp.metodo,''))='EFECTIVO'
    AND UPPER(COALESCE(pp.estado,''))='PAGADO';

  IF COALESCE(v_cash_total,0)<=0 THEN
    RAISE NOTICE 'Backfill omitido: no hay pago efectivo PAGADO.';
    RETURN;
  END IF;

  IF EXISTS(
    SELECT 1 FROM gmx.caja_movimientos
    WHERE origen_modulo='POS_CANCELACION'
      AND id_origen=v_order_id
      AND categoria='CANCELACION_VENTA'
      AND COALESCE(anulado,false)=false
  ) THEN
    RAISE NOTICE 'Backfill omitido: reversion ya existe.';
    RETURN;
  END IF;

  SELECT row_id,id_movimiento,id_admin,administrador
    INTO v_orig_row,v_orig_mov,v_admin,v_admin_name
  FROM gmx.caja_movimientos
  WHERE origen_modulo='POS_LOCAL'
    AND id_origen=v_order_id
    AND categoria='VENTA'
    AND UPPER(COALESCE(metodo_pago,''))='EFECTIVO'
    AND COALESCE(anulado,false)=false
  ORDER BY row_id
  LIMIT 1
  FOR UPDATE;

  IF v_orig_row IS NULL THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_NOT_FOUND';
  END IF;

  SELECT row_id,id_caja
    INTO v_cash_row,v_cash_id
  FROM gmx.caja_sesiones
  WHERE id_sucursal=v_branch
    AND UPPER(COALESCE(estado,''))='ABIERTA'
    AND fecha_cierre IS NULL
  ORDER BY fecha_apertura DESC,row_id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_cash_row IS NULL THEN
    RAISE EXCEPTION 'CASH_SESSION_REQUIRED_FOR_CANCELLATION';
  END IF;

  v_rev_mov := 'CAJCAN-POS-'||
    floor(extract(epoch from clock_timestamp())*1000)::text||'-'||
    substr(md5(random()::text),1,6);

  INSERT INTO gmx.caja_movimientos(
    id_movimiento,id_caja,fecha,id_sucursal,sucursal,tipo,categoria,
    metodo_pago,importe,impacto_efectivo,referencia,descripcion,
    origen_modulo,id_origen,id_admin,administrador,anulado,id_movimiento_reversion
  ) VALUES(
    v_rev_mov,v_cash_id,NOW(),v_branch,v_branch_name,'EGRESO','CANCELACION_VENTA',
    'EFECTIVO',v_cash_total,-v_cash_total,v_order_id,
    'Reversion cancelacion venta POS','POS_CANCELACION',v_order_id,
    v_admin,v_admin_name,false,v_orig_mov
  );

  UPDATE gmx.caja_movimientos
  SET id_movimiento_reversion=v_rev_mov
  WHERE row_id=v_orig_row;

  UPDATE gmx.caja_sesiones
  SET egresos_efectivo=COALESCE(egresos_efectivo,0)+v_cash_total,
      saldo_esperado=COALESCE(fondo_inicial,0)
        +COALESCE(ingresos_efectivo,0)
        -(COALESCE(egresos_efectivo,0)+v_cash_total),
      fecha_actualizacion=NOW()
  WHERE row_id=v_cash_row;

  UPDATE gmx.pedido_pagos
  SET estado='REEMBOLSADO'
  WHERE id_pedido=v_order_id
    AND UPPER(COALESCE(metodo,''))='EFECTIVO'
    AND UPPER(COALESCE(estado,''))='PAGADO';

  UPDATE gmx.pedidos
  SET estado_pago='REEMBOLSADO',
      fecha_actualizacion=NOW()
  WHERE id_pedido=v_order_id;
END $$;

COMMIT;

SELECT
  id_pedido,estado_pedido,venta_confirmada,estado_pago,total,metodo_pago
FROM gmx.pedidos
WHERE id_pedido='PED-LOCAL-1786936950246-b3fdc8';

SELECT
  id_pago,metodo,importe_aplicado,estado
FROM gmx.pedido_pagos
WHERE id_pedido='PED-LOCAL-1786936950246-b3fdc8'
ORDER BY linea;

SELECT
  row_id,id_movimiento,tipo,categoria,metodo_pago,importe,impacto_efectivo,
  referencia,origen_modulo,id_origen,id_movimiento_reversion
FROM gmx.caja_movimientos
WHERE referencia='PED-LOCAL-1786936950246-b3fdc8'
   OR id_origen='PED-LOCAL-1786936950246-b3fdc8'
ORDER BY row_id;

SELECT
  id_caja,fondo_inicial,ingresos_efectivo,egresos_efectivo,saldo_esperado,estado
FROM gmx.caja_sesiones
WHERE id_sucursal='SUC-000010'
  AND UPPER(COALESCE(estado,''))='ABIERTA'
ORDER BY fecha_apertura DESC,row_id DESC
LIMIT 1;
