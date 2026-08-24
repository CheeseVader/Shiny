-- ============================================================
-- GMX DEV-001D SQL FIX V2
-- Corrige referencia ambigua de reintegra_stock
-- ============================================================

BEGIN;

ALTER TABLE gmx.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS condicion_articulo TEXT;

ALTER TABLE gmx.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS destino_articulo TEXT;

ALTER TABLE gmx.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS reintegra_stock BOOLEAN;

UPDATE gmx.devoluciones_detalle AS dd
SET
  condicion_articulo = COALESCE(NULLIF(dd.condicion_articulo,''),'VENDIBLE'),
  destino_articulo = COALESCE(
    NULLIF(dd.destino_articulo,''),
    CASE
      WHEN COALESCE(dv.reintegra_stock,true)=true THEN 'INVENTARIO_DISPONIBLE'
      ELSE 'NO_VENDIBLE'
    END
  ),
  reintegra_stock = COALESCE(dd.reintegra_stock, COALESCE(dv.reintegra_stock,true))
FROM gmx.devoluciones AS dv
WHERE dv.id = dd.id_devolucion;

-- Cualquier detalle sin cabecera asociada se normaliza de forma segura.
UPDATE gmx.devoluciones_detalle AS dd
SET
  condicion_articulo = COALESCE(NULLIF(dd.condicion_articulo,''),'VENDIBLE'),
  destino_articulo = COALESCE(NULLIF(dd.destino_articulo,''),'INVENTARIO_DISPONIBLE'),
  reintegra_stock = COALESCE(dd.reintegra_stock,true)
WHERE dd.condicion_articulo IS NULL
   OR dd.destino_articulo IS NULL
   OR dd.reintegra_stock IS NULL;

ALTER TABLE gmx.devoluciones_detalle
  ALTER COLUMN condicion_articulo SET DEFAULT 'VENDIBLE';

ALTER TABLE gmx.devoluciones_detalle
  ALTER COLUMN destino_articulo SET DEFAULT 'INVENTARIO_DISPONIBLE';

ALTER TABLE gmx.devoluciones_detalle
  ALTER COLUMN reintegra_stock SET DEFAULT true;

ALTER TABLE gmx.devoluciones_detalle
  ALTER COLUMN condicion_articulo SET NOT NULL;

ALTER TABLE gmx.devoluciones_detalle
  ALTER COLUMN destino_articulo SET NOT NULL;

ALTER TABLE gmx.devoluciones_detalle
  ALTER COLUMN reintegra_stock SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ck_devoluciones_detalle_condicion'
      AND conrelid='gmx.devoluciones_detalle'::regclass
  ) THEN
    ALTER TABLE gmx.devoluciones_detalle
      ADD CONSTRAINT ck_devoluciones_detalle_condicion
      CHECK (condicion_articulo IN ('VENDIBLE','DANADO','DEFECTUOSO','INCOMPLETO','NO_VENDIBLE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ck_devoluciones_detalle_destino'
      AND conrelid='gmx.devoluciones_detalle'::regclass
  ) THEN
    ALTER TABLE gmx.devoluciones_detalle
      ADD CONSTRAINT ck_devoluciones_detalle_destino
      CHECK (destino_articulo IN ('INVENTARIO_DISPONIBLE','MERMA','GARANTIA','REVISION','NO_VENDIBLE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ck_devoluciones_detalle_stock_condicion'
      AND conrelid='gmx.devoluciones_detalle'::regclass
  ) THEN
    ALTER TABLE gmx.devoluciones_detalle
      ADD CONSTRAINT ck_devoluciones_detalle_stock_condicion
      CHECK (
        (condicion_articulo='VENDIBLE'
         AND reintegra_stock=true
         AND destino_articulo='INVENTARIO_DISPONIBLE')
        OR
        (condicion_articulo<>'VENDIBLE'
         AND reintegra_stock=false
         AND destino_articulo<>'INVENTARIO_DISPONIBLE')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_devoluciones_detalle_condicion
ON gmx.devoluciones_detalle(condicion_articulo,destino_articulo);

GRANT SELECT,INSERT,UPDATE,DELETE
ON TABLE gmx.devoluciones_detalle
TO gmx_app;

COMMIT;

-- Validación
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema='gmx'
  AND table_name='devoluciones_detalle'
  AND column_name IN ('condicion_articulo','destino_articulo','reintegra_stock')
ORDER BY ordinal_position;

SELECT
  conname,
  pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid='gmx.devoluciones_detalle'::regclass
  AND conname IN (
    'ck_devoluciones_detalle_condicion',
    'ck_devoluciones_detalle_destino',
    'ck_devoluciones_detalle_stock_condicion'
  )
ORDER BY conname;
