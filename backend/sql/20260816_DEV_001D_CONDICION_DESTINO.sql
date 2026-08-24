-- ============================================================
-- GMX DEV-001D
-- Condición / destino por partida en devoluciones
-- ============================================================
BEGIN;

ALTER TABLE gmx.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS condicion_articulo TEXT;

ALTER TABLE gmx.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS destino_articulo TEXT;

ALTER TABLE gmx.devoluciones_detalle
  ADD COLUMN IF NOT EXISTS reintegra_stock BOOLEAN;

UPDATE gmx.devoluciones_detalle dd
SET
  condicion_articulo = COALESCE(NULLIF(condicion_articulo,''),'VENDIBLE'),
  destino_articulo = COALESCE(
    NULLIF(destino_articulo,''),
    CASE
      WHEN COALESCE(dv.reintegra_stock,true)=true THEN 'INVENTARIO_DISPONIBLE'
      ELSE 'NO_VENDIBLE'
    END
  ),
  reintegra_stock = COALESCE(reintegra_stock,COALESCE(dv.reintegra_stock,true))
FROM gmx.devoluciones dv
WHERE dv.id=dd.id_devolucion;

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
        (condicion_articulo='VENDIBLE' AND reintegra_stock=true AND destino_articulo='INVENTARIO_DISPONIBLE')
        OR
        (condicion_articulo<>'VENDIBLE' AND reintegra_stock=false AND destino_articulo<>'INVENTARIO_DISPONIBLE')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_devoluciones_detalle_condicion
ON gmx.devoluciones_detalle(condicion_articulo,destino_articulo);

GRANT SELECT,INSERT,UPDATE,DELETE
ON TABLE gmx.devoluciones_detalle
TO gmx_app;

COMMIT;

SELECT
  column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='gmx'
  AND table_name='devoluciones_detalle'
  AND column_name IN ('condicion_articulo','destino_articulo','reintegra_stock')
ORDER BY ordinal_position;
