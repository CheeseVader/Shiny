BEGIN;

ALTER TABLE shiny.productos
  ADD COLUMN IF NOT EXISTS codigo_barras TEXT;

UPDATE shiny.productos
SET codigo_barras=NULLIF(TRIM(codigo_barras),'')
WHERE codigo_barras IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_codigo_barras
  ON shiny.productos(codigo_barras)
  WHERE codigo_barras IS NOT NULL AND codigo_barras<>'';

CREATE INDEX IF NOT EXISTS ix_inventory_branch_product
  ON shiny.inventario_sucursales(id_sucursal,id_producto);

CREATE INDEX IF NOT EXISTS ix_inventory_stock
  ON shiny.inventario_sucursales(stock,stock_minimo);

CREATE INDEX IF NOT EXISTS ix_productos_categoria_estado
  ON shiny.productos(categoria,estado);

CREATE INDEX IF NOT EXISTS ix_productos_codigo_barras_lower
  ON shiny.productos(LOWER(codigo_barras))
  WHERE codigo_barras IS NOT NULL;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '044','Shiny 10.6.2.4.1.4 - Scalable inventory search filters barcode pagination'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='044');

COMMIT;
