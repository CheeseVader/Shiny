BEGIN;

ALTER TABLE shiny.productos
  ADD COLUMN IF NOT EXISTS moneda_precio TEXT NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS precio_origen NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS tcg_game_code TEXT,
  ADD COLUMN IF NOT EXISTS tdc_aplicado NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS precio_mxn_calculado NUMERIC(18,4);

UPDATE shiny.productos
SET moneda_precio='MXN',
    precio_origen=COALESCE(precio_origen,precio,0),
    precio_mxn_calculado=COALESCE(precio_mxn_calculado,precio,0)
WHERE moneda_precio IS NULL
   OR precio_origen IS NULL
   OR precio_mxn_calculado IS NULL;

CREATE INDEX IF NOT EXISTS ix_productos_tcg_game_code
  ON shiny.productos(tcg_game_code)
  WHERE tcg_game_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_productos_moneda_precio
  ON shiny.productos(moneda_precio);

CREATE OR REPLACE FUNCTION shiny.apply_product_tcg_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_currency TEXT;
  v_game TEXT;
  v_rate NUMERIC;
  v_origin NUMERIC;
  v_game_exists BOOLEAN;
BEGIN
  v_currency := UPPER(TRIM(COALESCE(NULLIF(NEW.moneda_precio,''),'MXN')));
  IF v_currency NOT IN ('MXN','USD') THEN
    RAISE EXCEPTION 'PRODUCT_CURRENCY_INVALID';
  END IF;

  v_game := NULLIF(UPPER(TRIM(COALESCE(NEW.tcg_game_code,''))),'');
  IF v_game IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1
      FROM shiny.tcg_juegos
      WHERE UPPER(TRIM(COALESCE(codigo,'')))=v_game
        AND COALESCE(activo,true)=true
    ) INTO v_game_exists;

    IF NOT v_game_exists THEN
      RAISE EXCEPTION 'PRODUCT_TCG_INVALID:%',v_game;
    END IF;
  END IF;

  /*
    Legacy writers still update productos.precio directly.
    If they change precio without explicitly changing precio_origen,
    treat the new precio as a new SOURCE amount in the product's currency.
  */
  IF TG_OP='UPDATE'
     AND NEW.precio IS DISTINCT FROM OLD.precio
     AND NEW.precio_origen IS NOT DISTINCT FROM OLD.precio_origen THEN
    NEW.precio_origen := NEW.precio;
  END IF;

  v_origin := COALESCE(NEW.precio_origen,NEW.precio,0);
  IF v_origin < 0 THEN
    RAISE EXCEPTION 'PRODUCT_PRICE_INVALID';
  END IF;

  NEW.moneda_precio := v_currency;
  NEW.tcg_game_code := v_game;
  NEW.precio_origen := ROUND(v_origin,4);

  IF v_currency='USD' THEN
    IF v_game IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_TCG_REQUIRED_FOR_USD';
    END IF;

    SELECT NULLIF(source_preferences->>'usdMxnRate','')::numeric
      INTO v_rate
    FROM shiny.tcg_sync_game_config
    WHERE UPPER(game_code)=v_game
    LIMIT 1;

    IF v_rate IS NULL OR v_rate<=0 THEN
      v_rate := CASE v_game
        WHEN 'POKEMON' THEN 15
        WHEN 'YUGIOH' THEN 17
        WHEN 'MAGIC' THEN 21
        WHEN 'RIFTBOUND' THEN 30
        ELSE NULL
      END;
    END IF;

    IF v_rate IS NULL OR v_rate<=0 THEN
      RAISE EXCEPTION 'PRODUCT_TCG_FX_REQUIRED:%',v_game;
    END IF;

    NEW.tdc_aplicado := ROUND(v_rate,6);
    NEW.precio_mxn_calculado := ROUND(v_origin*v_rate,4);
    NEW.precio := NEW.precio_mxn_calculado;
  ELSE
    NEW.tdc_aplicado := NULL;
    NEW.precio_mxn_calculado := ROUND(v_origin,4);
    NEW.precio := NEW.precio_mxn_calculado;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_tcg_currency ON shiny.productos;
CREATE TRIGGER trg_productos_tcg_currency
BEFORE INSERT OR UPDATE OF precio,moneda_precio,precio_origen,tcg_game_code,tdc_aplicado
ON shiny.productos
FOR EACH ROW
EXECUTE FUNCTION shiny.apply_product_tcg_currency();

CREATE OR REPLACE FUNCTION shiny.refresh_usd_products_after_tcg_fx()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_rate NUMERIC;
  v_new_rate NUMERIC;
BEGIN
  v_old_rate := CASE WHEN TG_OP='UPDATE'
    THEN NULLIF(OLD.source_preferences->>'usdMxnRate','')::numeric
    ELSE NULL END;
  v_new_rate := NULLIF(NEW.source_preferences->>'usdMxnRate','')::numeric;

  IF v_new_rate IS DISTINCT FROM v_old_rate THEN
    UPDATE shiny.productos
    SET tdc_aplicado=v_new_rate
    WHERE moneda_precio='USD'
      AND UPPER(COALESCE(tcg_game_code,''))=UPPER(NEW.game_code);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_products_after_tcg_fx ON shiny.tcg_sync_game_config;
CREATE TRIGGER trg_refresh_products_after_tcg_fx
AFTER INSERT OR UPDATE OF source_preferences
ON shiny.tcg_sync_game_config
FOR EACH ROW
EXECUTE FUNCTION shiny.refresh_usd_products_after_tcg_fx();

-- Re-run the product trigger once for existing rows to normalize metadata.
UPDATE shiny.productos
SET precio_origen=COALESCE(precio_origen,precio,0);

INSERT INTO shiny.schema_migrations(version,description)
VALUES(
  'SHINY_PRODUCT_TCG_CURRENCY_R1',
  'Shiny - product source currency, TCG classification and per-game commercial FX'
)
ON CONFLICT(version) DO NOTHING;

COMMIT;