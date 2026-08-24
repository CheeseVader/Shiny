BEGIN;

ALTER TABLE gmx.promociones
  ADD COLUMN IF NOT EXISTS limite_por_cliente BIGINT,
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS visible_publico BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS ix_promociones_branch_active
  ON gmx.promociones(id_sucursal,estado,inicio,fin);

CREATE INDEX IF NOT EXISTS ix_promociones_redenciones_client
  ON gmx.promociones_redenciones(id_promocion,id_cliente,estado,fecha)
  WHERE id_cliente IS NOT NULL;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '055','GMX 10.6.2.4.1.12.1.6 - promotions and loyalty complete master module'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='055');

COMMIT;
