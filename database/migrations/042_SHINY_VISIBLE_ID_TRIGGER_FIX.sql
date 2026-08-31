
BEGIN;

-- Shiny 10.6.2.4.1.2
-- Hotfix: separar triggers de IDs visibles por tabla.
-- Corrige:
--   record "new" has no field "id_cliente"
-- al insertar sucursales/productos.

DROP TRIGGER IF EXISTS trg_clientes_visible_id ON shiny.clientes;
DROP TRIGGER IF EXISTS trg_productos_visible_id ON shiny.productos;
DROP TRIGGER IF EXISTS trg_sucursales_visible_id ON shiny.sucursales;

DROP FUNCTION IF EXISTS shiny.assign_visible_ids();

CREATE OR REPLACE FUNCTION shiny.assign_cliente_visible_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(TRIM(COALESCE(NEW.id_cliente,'')),'') IS NULL THEN
    NEW.id_cliente := shiny.shiny_visible_id('CLI', NEW.row_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shiny.assign_producto_visible_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(TRIM(COALESCE(NEW.id,'')),'') IS NULL THEN
    NEW.id := shiny.shiny_visible_id('PROD', NEW.row_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shiny.assign_sucursal_visible_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(TRIM(COALESCE(NEW.id_sucursal,'')),'') IS NULL THEN
    NEW.id_sucursal := shiny.shiny_visible_id('SUC', NEW.row_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clientes_visible_id
BEFORE INSERT ON shiny.clientes
FOR EACH ROW
EXECUTE FUNCTION shiny.assign_cliente_visible_id();

CREATE TRIGGER trg_productos_visible_id
BEFORE INSERT ON shiny.productos
FOR EACH ROW
EXECUTE FUNCTION shiny.assign_producto_visible_id();

CREATE TRIGGER trg_sucursales_visible_id
BEFORE INSERT ON shiny.sucursales
FOR EACH ROW
EXECUTE FUNCTION shiny.assign_sucursal_visible_id();

INSERT INTO shiny.schema_migrations(version,description)
SELECT
  '042',
  'Shiny 10.6.2.4.1.2 - Fix automatic visible ID triggers per table'
WHERE NOT EXISTS (
  SELECT 1 FROM shiny.schema_migrations WHERE version='042'
);

COMMIT;
