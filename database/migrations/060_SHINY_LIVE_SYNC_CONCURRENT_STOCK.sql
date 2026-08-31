BEGIN;

INSERT INTO shiny.configuracion(parametro,valor)
VALUES('live.storefront_version','0')
ON CONFLICT(parametro) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ck_inventory_branch_stock_nonnegative') THEN
    ALTER TABLE shiny.inventario_sucursales
      ADD CONSTRAINT ck_inventory_branch_stock_nonnegative CHECK (COALESCE(stock,0)>=0) NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ck_tcg_branch_stock_nonnegative') THEN
    ALTER TABLE shiny.tcg_inventario_sucursales
      ADD CONSTRAINT ck_tcg_branch_stock_nonnegative CHECK (COALESCE(stock,0)>=0) NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ck_tcg_global_stock_nonnegative') THEN
    ALTER TABLE shiny.tcg_inventario
      ADD CONSTRAINT ck_tcg_global_stock_nonnegative CHECK (COALESCE(stock,0)>=0) NOT VALID;
  END IF;
END $$;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '060','Shiny 10.6.2.4.1.12.2.0.3.6 - SSE live sync and concurrent stock protection'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='060');

COMMIT;
