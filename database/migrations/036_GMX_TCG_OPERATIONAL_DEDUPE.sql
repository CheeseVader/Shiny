
BEGIN;

SET client_encoding TO 'UTF8';

-- ------------------------------------------------------------
-- Consolidate operational TCG duplicates against the master catalog.
-- A legacy row may have codigo=POKEMON but catalogo_codigo NULL,
-- while a newer row has catalogo_codigo=POKEMON.
-- ------------------------------------------------------------
DO $$
DECLARE
  m RECORD;
  canonical RECORD;
  dup RECORD;
  ds RECORD;
  target_set_id TEXT;
BEGIN
  FOR m IN
    SELECT codigo,nombre
    FROM gmx.tcg_master_juegos
    WHERE activo=true
  LOOP
    SELECT *
    INTO canonical
    FROM gmx.tcg_juegos
    WHERE UPPER(COALESCE(catalogo_codigo,codigo,''))=UPPER(m.codigo)
       OR LOWER(TRIM(COALESCE(nombre,'')))=LOWER(TRIM(m.nombre))
    ORDER BY
      CASE WHEN catalogo_codigo=m.codigo THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(activo,true)=true THEN 0 ELSE 1 END,
      row_id
    LIMIT 1;

    IF canonical.row_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Normalize canonical identity.
    UPDATE gmx.tcg_juegos
    SET catalogo_codigo=m.codigo,
        codigo=m.codigo,
        nombre=m.nombre
    WHERE row_id=canonical.row_id;

    FOR dup IN
      SELECT *
      FROM gmx.tcg_juegos
      WHERE row_id<>canonical.row_id
        AND (
          UPPER(COALESCE(catalogo_codigo,codigo,''))=UPPER(m.codigo)
          OR LOWER(TRIM(COALESCE(nombre,'')))=LOWER(TRIM(m.nombre))
        )
      ORDER BY row_id
    LOOP
      -- Merge duplicate sets into canonical TCG.
      FOR ds IN
        SELECT *
        FROM gmx.tcg_sets
        WHERE id_juego=dup.id_juego
        ORDER BY row_id
      LOOP
        SELECT id_set
        INTO target_set_id
        FROM gmx.tcg_sets
        WHERE id_juego=canonical.id_juego
          AND (
            (NULLIF(TRIM(COALESCE(ds.codigo,'')),'') IS NOT NULL
              AND UPPER(COALESCE(codigo,''))=UPPER(ds.codigo))
            OR LOWER(TRIM(nombre))=LOWER(TRIM(ds.nombre))
          )
        ORDER BY row_id
        LIMIT 1;

        IF target_set_id IS NOT NULL THEN
          -- If cards still exist, point them to the canonical set.
          UPDATE gmx.tcg_cartas
          SET id_juego=canonical.id_juego,
              id_set=target_set_id
          WHERE id_juego=dup.id_juego
            AND id_set=ds.id_set;

          DELETE FROM gmx.tcg_sets
          WHERE row_id=ds.row_id;
        ELSE
          UPDATE gmx.tcg_sets
          SET id_juego=canonical.id_juego
          WHERE row_id=ds.row_id;
        END IF;

        target_set_id:=NULL;
      END LOOP;

      -- Merge rarities. Cards store rarity text, so duplicate rarity
      -- definitions can safely be consolidated by code/name.
      DELETE FROM gmx.tcg_rarezas r
      USING gmx.tcg_rarezas keep
      WHERE r.id_juego=dup.id_juego
        AND keep.id_juego=canonical.id_juego
        AND (
          (NULLIF(TRIM(COALESCE(r.codigo,'')),'') IS NOT NULL
            AND UPPER(COALESCE(keep.codigo,''))=UPPER(r.codigo))
          OR LOWER(TRIM(keep.nombre))=LOWER(TRIM(r.nombre))
        );

      UPDATE gmx.tcg_rarezas
      SET id_juego=canonical.id_juego
      WHERE id_juego=dup.id_juego;

      -- Remaining cards/snapshots.
      UPDATE gmx.tcg_cartas
      SET id_juego=canonical.id_juego
      WHERE id_juego=dup.id_juego;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='gmx' AND table_name='tcg_adquisiciones' AND column_name='id_juego'
      ) THEN
        EXECUTE format(
          'UPDATE gmx.tcg_adquisiciones SET id_juego=%L WHERE id_juego=%L',
          canonical.id_juego,dup.id_juego
        );
      END IF;

      DELETE FROM gmx.tcg_juegos
      WHERE row_id=dup.row_id;
    END LOOP;
  END LOOP;
END $$;

-- Defensive guard for future writes. A trigger is used instead of a new
-- unique index so unrelated legacy/manual duplicates cannot abort this hotfix.
CREATE OR REPLACE FUNCTION gmx.prevent_duplicate_tcg_game()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_code TEXT;
BEGIN
  resolved_code:=UPPER(COALESCE(
    NULLIF(TRIM(NEW.catalogo_codigo),''),
    NULLIF(TRIM(NEW.codigo),'')
  ));

  IF resolved_code IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS(
    SELECT 1
    FROM gmx.tcg_juegos x
    WHERE x.row_id<>COALESCE(NEW.row_id,-1)
      AND UPPER(COALESCE(
        NULLIF(TRIM(x.catalogo_codigo),''),
        NULLIF(TRIM(x.codigo),'')
      ))=resolved_code
  ) THEN
    RAISE EXCEPTION 'TCG_GAME_DUPLICATE:%',resolved_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_tcg_game ON gmx.tcg_juegos;
CREATE TRIGGER trg_prevent_duplicate_tcg_game
BEFORE INSERT OR UPDATE OF catalogo_codigo,codigo
ON gmx.tcg_juegos
FOR EACH ROW
EXECUTE FUNCTION gmx.prevent_duplicate_tcg_game();

INSERT INTO gmx.schema_migrations(version,description)
SELECT '036','GMX 10.6.2.3.3 - consolidate duplicate operational TCGs and enforce unique resolved game code'
WHERE NOT EXISTS(
  SELECT 1 FROM gmx.schema_migrations WHERE version='036'
);

COMMIT;
