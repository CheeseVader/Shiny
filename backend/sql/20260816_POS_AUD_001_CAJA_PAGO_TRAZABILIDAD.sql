-- =========================================================
-- GMX POS-AUD-001 FIX
-- Caja + estado_pago + idempotencia financiera
-- Fecha: 2026-08-16
-- =========================================================

BEGIN;

-- Corrige únicamente pedidos POS locales ya pagados cuyo estado financiero
-- quedó con el default PENDIENTE. No crea movimientos de caja históricos.
UPDATE gmx.pedidos
SET estado_pago='PAGADO',
    fecha_actualizacion=NOW()
WHERE canal_venta='POS_LOCAL'
  AND UPPER(COALESCE(estado_pedido,''))='PAGADO'
  AND UPPER(COALESCE(estado_pago,''))='PENDIENTE';

-- Una venta POS sólo puede tener un ingreso de caja activo por pedido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_mov_pos_venta_activa
ON gmx.caja_movimientos(id_origen)
WHERE origen_modulo='POS_LOCAL'
  AND categoria='VENTA'
  AND COALESCE(anulado,false)=false
  AND id_origen IS NOT NULL;

COMMIT;

-- Validación informativa
SELECT
  COUNT(*) AS pos_pagados_con_estado_pago_pendiente
FROM gmx.pedidos
WHERE canal_venta='POS_LOCAL'
  AND UPPER(COALESCE(estado_pedido,''))='PAGADO'
  AND UPPER(COALESCE(estado_pago,''))='PENDIENTE';
