
BEGIN;

SET client_encoding TO 'UTF8';

-- Remove invented test TCG "conosmon" from operational catalog.
DO $$
DECLARE
  target_ids TEXT[];
BEGIN
  SELECT COALESCE(array_agg(id_juego),ARRAY[]::TEXT[])
  INTO target_ids
  FROM gmx.tcg_juegos
  WHERE LOWER(TRIM(COALESCE(nombre,'')))='conosmon'
     OR LOWER(TRIM(COALESCE(codigo,'')))='conosmon'
     OR LOWER(TRIM(COALESCE(catalogo_codigo,'')))='conosmon'
     OR LOWER(TRIM(COALESCE(id_juego,'')))='conosmon';

  IF cardinality(target_ids)>0 THEN
    DELETE FROM gmx.tcg_rarezas WHERE id_juego=ANY(target_ids);
    DELETE FROM gmx.tcg_sets WHERE id_juego=ANY(target_ids);
    DELETE FROM gmx.tcg_juegos WHERE id_juego=ANY(target_ids);
  END IF;
END $$;

-- Remove it from master catalog too if it was ever inserted there.
DELETE FROM gmx.tcg_master_rarezas
WHERE LOWER(TRIM(COALESCE(id_juego,'')))='conosmon';

DELETE FROM gmx.tcg_master_sets
WHERE LOWER(TRIM(COALESCE(id_juego,'')))='conosmon';

DELETE FROM gmx.tcg_sync_game_config
WHERE LOWER(TRIM(COALESCE(game_code,'')))='conosmon';

DELETE FROM gmx.tcg_sync_providers
WHERE LOWER(TRIM(COALESCE(game_code,'')))='conosmon';

DELETE FROM gmx.tcg_master_juegos
WHERE LOWER(TRIM(COALESCE(codigo,'')))='conosmon'
   OR LOWER(TRIM(COALESCE(nombre,'')))='conosmon';

-- Repair the most visible UTF-8 labels without depending on terminal code page.
UPDATE gmx.tcg_master_juegos
SET nombre=U&'Pok\00E9mon TCG',
    publisher=U&'The Pok\00E9mon Company International'
WHERE codigo='POKEMON';

UPDATE gmx.tcg_juegos
SET nombre=U&'Pok\00E9mon TCG',
    publisher=U&'The Pok\00E9mon Company International'
WHERE COALESCE(catalogo_codigo,codigo)='POKEMON';

UPDATE gmx.tcg_sync_providers
SET provider_name=U&'Pok\00E9mon TCG API'
WHERE game_code='POKEMON';

UPDATE gmx.tcg_master_juegos
SET nombre='Yu-Gi-Oh! TCG'
WHERE codigo='YUGIOH';

UPDATE gmx.tcg_juegos
SET nombre='Yu-Gi-Oh! TCG'
WHERE COALESCE(catalogo_codigo,codigo)='YUGIOH';

UPDATE gmx.tcg_master_juegos
SET nombre=U&'Wei\00DF Schwarz'
WHERE codigo='WEISS';

INSERT INTO gmx.schema_migrations(version,description)
SELECT '035','GMX 10.6.2.3.1 - remove Conosmon, dynamic public TCG visibility and sync diagnostics'
WHERE NOT EXISTS(
  SELECT 1 FROM gmx.schema_migrations WHERE version='035'
);

COMMIT;
