BEGIN;

-- GMX 10.6.2.4.1.4.1
-- Fuente operativa única de stock = gmx.inventario_sucursales.
-- gmx.productos.stock queda como total agregado de compatibilidad/UI.

CREATE OR REPLACE FUNCTION gmx.recalculate_product_total_stock(p_product_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_product_id IS NULL OR TRIM(p_product_id)='' THEN
    RETURN;
  END IF;

  UPDATE gmx.productos p
  SET
    stock=COALESCE((
      SELECT SUM(COALESCE(i.stock,0))
      FROM gmx.inventario_sucursales i
      WHERE i.id_producto=p_product_id
    ),0),
    fecha_actualizacion=NOW()
  WHERE p.id=p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION gmx.sync_product_total_stock_from_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM gmx.recalculate_product_total_stock(OLD.id_producto);
    RETURN OLD;
  END IF;

  PERFORM gmx.recalculate_product_total_stock(NEW.id_producto);

  IF TG_OP='UPDATE'
     AND OLD.id_producto IS DISTINCT FROM NEW.id_producto THEN
    PERFORM gmx.recalculate_product_total_stock(OLD.id_producto);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_sync_product_stock
  ON gmx.inventario_sucursales;

CREATE TRIGGER trg_inventory_sync_product_stock
AFTER INSERT OR UPDATE OF stock,id_producto OR DELETE
ON gmx.inventario_sucursales
FOR EACH ROW
EXECUTE FUNCTION gmx.sync_product_total_stock_from_inventory();

-- Reconciliación segura de productos de prueba existentes:
-- solamente mueve el stock legacy cuando existe exactamente UNA sucursal activa.
DO $$
DECLARE
  v_branch_id TEXT;
  v_branch_name TEXT;
  v_active_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_active_count
  FROM gmx.sucursales
  WHERE COALESCE(activa,true)=true;

  IF v_active_count=1 THEN
    SELECT id_sucursal,nombre_sucursal
      INTO v_branch_id,v_branch_name
    FROM gmx.sucursales
    WHERE COALESCE(activa,true)=true
    ORDER BY row_id
    LIMIT 1;

    INSERT INTO gmx.inventario_sucursales(
      id_registro,id_sucursal,sucursal,
      id_producto,sku,producto,
      stock,stock_minimo,fecha_actualizacion
    )
    SELECT
      'INV-RECON-'||p.row_id::text,
      v_branch_id,
      v_branch_name,
      p.id,
      p.sku,
      p.nombre,
      COALESCE(p.stock,0),
      COALESCE(p.stock_minimo,0),
      NOW()
    FROM gmx.productos p
    WHERE p.id IS NOT NULL
      AND COALESCE(p.stock,0)>0
      AND NOT EXISTS(
        SELECT 1
        FROM gmx.inventario_sucursales i
        WHERE i.id_producto=p.id
      );
  END IF;
END;
$$;

-- Recalcular todos los totales después de la reconciliación.
UPDATE gmx.productos p
SET stock=COALESCE((
  SELECT SUM(COALESCE(i.stock,0))
  FROM gmx.inventario_sucursales i
  WHERE i.id_producto=p.id
),0);

CREATE INDEX IF NOT EXISTS ix_inventory_product_branch_stock
ON gmx.inventario_sucursales(id_producto,id_sucursal,stock);

INSERT INTO gmx.schema_migrations(version,description)
SELECT '045','GMX 10.6.2.4.1.4.1 - Unified multisucursal stock source and automatic aggregate'
WHERE NOT EXISTS(
  SELECT 1 FROM gmx.schema_migrations WHERE version='045'
);

COMMIT;
