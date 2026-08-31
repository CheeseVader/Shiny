BEGIN;

CREATE OR REPLACE FUNCTION shiny.apply_product_identifier_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sku TEXT;
  v_barcode TEXT;
BEGIN
  v_sku := NULLIF(BTRIM(COALESCE(NEW.sku,'')),'');
  v_barcode := NULLIF(BTRIM(COALESCE(NEW.codigo_barras,'')),'');

  IF v_barcode IS NOT NULL THEN
    NEW.sku := v_barcode;
    NEW.codigo_barras := v_barcode;
    RETURN NEW;
  END IF;

  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_SKU_REQUIRED';
  END IF;

  NEW.sku := v_sku;

  -- GTIN/EAN/UPC common numeric lengths: barcode doubles as SKU.
  IF v_sku ~ '^(?:[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' THEN
    NEW.codigo_barras := v_sku;
  ELSE
    -- Internal/manual SKU: no manufacturer barcode.
    NEW.codigo_barras := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_identifier_policy ON shiny.productos;
CREATE TRIGGER trg_product_identifier_policy
BEFORE INSERT OR UPDATE OF sku,codigo_barras
ON shiny.productos
FOR EACH ROW
EXECUTE FUNCTION shiny.apply_product_identifier_policy();

-- Normalize existing rows without changing internal SKUs.
UPDATE shiny.productos
SET sku = CASE
      WHEN NULLIF(BTRIM(COALESCE(codigo_barras,'')),'') IS NOT NULL
        THEN BTRIM(codigo_barras)
      ELSE BTRIM(sku)
    END,
    codigo_barras = CASE
      WHEN NULLIF(BTRIM(COALESCE(codigo_barras,'')),'') IS NOT NULL
        THEN BTRIM(codigo_barras)
      WHEN BTRIM(COALESCE(sku,'')) ~ '^(?:[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'
        THEN BTRIM(sku)
      ELSE NULL
    END
WHERE NULLIF(BTRIM(COALESCE(sku,'')),'') IS NOT NULL;

INSERT INTO shiny.schema_migrations(version,description)
VALUES(
  'SHINY_PRODUCT_IDENTIFIER_POLICY_R1',
  'Shiny - barcode is SKU for retail products; internal SKU when no barcode'
)
ON CONFLICT(version) DO NOTHING;

COMMIT;