
BEGIN;

-- Nuevos TCG solicitados / verificados.
INSERT INTO gmx.tcg_master_juegos(codigo,nombre,publisher,sitio_oficial,activo,orden)
VALUES
 ('RIFTBOUND','Riftbound: League of Legends TCG','Riot Games','https://riftbound.leagueoflegends.com/',true,45),
 ('FFTCG','FINAL FANTASY Trading Card Game','Square Enix / Hobby Japan','https://fftcg.square-enix-games.com/en',true,55),
 ('PALWORLD','Palworld OFFICIAL CARD GAME','Bushiroad / Pocketpair','https://en.palworld-official-cardgame.com/',true,65)
ON CONFLICT(codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,publisher=EXCLUDED.publisher,sitio_oficial=EXCLUDED.sitio_oficial,
 activo=EXCLUDED.activo,orden=EXCLUDED.orden,fecha_actualizacion=NOW();

-- Riftbound: sets publicados a la fecha de esta fase.
INSERT INTO gmx.tcg_master_sets(id_juego,codigo,nombre,fecha_lanzamiento,activo,fuente_oficial)
VALUES
 ('RIFTBOUND','ORI','Origins',NULL,true,'https://riftbound.leagueoflegends.com/en-us/tcg-cards/'),
 ('RIFTBOUND','SPI','Spiritforged',NULL,true,'https://riftbound.leagueoflegends.com/en-us/news/announcements/state-of-the-game-feb-2026/'),
 ('RIFTBOUND','UNL','Unleashed',NULL,true,'https://riftbound.leagueoflegends.com/en-us/news/announcements/the-unleashed-overview/'),
 ('RIFTBOUND','VEN','Vendetta','2026-07-31',true,'https://riftbound.leagueoflegends.com/en-us/news/announcements/the-vendetta-overview/')
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,fecha_lanzamiento=EXCLUDED.fecha_lanzamiento,
 activo=EXCLUDED.activo,fuente_oficial=EXCLUDED.fuente_oficial,fecha_actualizacion=NOW();

-- FFTCG: catálogo completo que el Card Browser oficial expone actualmente.
INSERT INTO gmx.tcg_master_sets(id_juego,codigo,nombre,activo,fuente_oficial)
VALUES
 ('FFTCG','OPUS-I','Opus I',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-II','Opus II',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-III','Opus III',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-IV','Opus IV',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-V','Opus V',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-VI','Opus VI',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-VII','Opus VII',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-VIII','Opus VIII',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-IX','Opus IX',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-X','Opus X',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-XI','Opus XI',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-XII','Opus XII',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-XIII','Opus XIII',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','OPUS-XIV','Opus XIV',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','CRYSTAL-DOMINION','Crystal Dominion',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','EMISSARIES-OF-LIGHT','Emissaries of Light',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','REBELLIONS-CALL','Rebellion''s Call',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','RESURGENCE-OF-POWER','Resurgence of Power',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','FROM-NIGHTMARES','From Nightmares',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','DAWN-OF-HEROES','Dawn of Heroes',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','BEYOND-DESTINY','Beyond Destiny',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','HIDDEN-HOPE','Hidden Hope',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','HIDDEN-TRIALS','Hidden Trials',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','HIDDEN-LEGENDS','Hidden Legends',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','TEARS-OF-THE-PLANET','Tears of the Planet',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','GUNSLINGER-IN-THE-ABYSS','Gunslinger in the Abyss',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','JOURNEY-OF-DISCOVERY','Journey of Discovery',true,'https://fftcg.square-enix-games.com/en/card-browser'),
 ('FFTCG','DREAMLIKE-OCEANS','Dreamlike Oceans',true,'https://fftcg.square-enix-games.com/en'),
 ('FFTCG','BLISSFUL-ETERNITY','Blissful Eternity',true,'https://fftcg.square-enix-games.com/en')
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,
 activo=EXCLUDED.activo,
 fuente_oficial=EXCLUDED.fuente_oficial,
 fecha_actualizacion=NOW();

UPDATE gmx.tcg_master_sets
SET fecha_lanzamiento=CASE codigo
  WHEN 'DREAMLIKE-OCEANS' THEN DATE '2026-03-27'
  WHEN 'BLISSFUL-ETERNITY' THEN DATE '2026-08-07'
  ELSE fecha_lanzamiento
END
WHERE id_juego='FFTCG'
  AND codigo IN ('DREAMLIKE-OCEANS','BLISSFUL-ETERNITY');

-- Palworld: primer booster publicado a la fecha.
INSERT INTO gmx.tcg_master_sets(id_juego,codigo,nombre,fecha_lanzamiento,total_cartas,activo,fuente_oficial)
VALUES
 ('PALWORLD','EBP01','Dawn of Palpagos','2026-07-30',100,true,'https://en.palworld-official-cardgame.com/products/bp01')
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,fecha_lanzamiento=EXCLUDED.fecha_lanzamiento,total_cartas=EXCLUDED.total_cartas,
 activo=EXCLUDED.activo,fuente_oficial=EXCLUDED.fuente_oficial,fecha_actualizacion=NOW();

-- Rarezas estrictamente separadas por TCG.
INSERT INTO gmx.tcg_master_rarezas(id_juego,codigo,nombre,activo,orden)
VALUES
 ('RIFTBOUND','C','Common',true,10),
 ('RIFTBOUND','U','Uncommon',true,20),
 ('RIFTBOUND','R','Rare',true,30),
 ('RIFTBOUND','E','Epic',true,40),
 ('RIFTBOUND','ALT','Alt Art',true,50),
 ('RIFTBOUND','OVER','Overnumbered',true,60),
 ('RIFTBOUND','ULT','Ultimate',true,70),

 ('FFTCG','C','Common',true,10),
 ('FFTCG','R','Rare',true,20),
 ('FFTCG','H','Hero',true,30),
 ('FFTCG','L','Legend',true,40),
 ('FFTCG','S','Starter',true,50),
 ('FFTCG','B','Boss',true,60),
 ('FFTCG','PR','Promo',true,70),

 ('PALWORLD','C','Common',true,10),
 ('PALWORLD','U','Uncommon',true,20),
 ('PALWORLD','R','Rare',true,30),
 ('PALWORLD','RR','Double Rare',true,40),
 ('PALWORLD','SR','Super Rare',true,50),
 ('PALWORLD','OSR','Over Special Rare',true,60),
 ('PALWORLD','SP','Special',true,70),
 ('PALWORLD','SSP','Special Super Parallel',true,80),
 ('PALWORLD','SSS','Special Super Special',true,90),
 ('PALWORLD','TD','Trial Deck',true,100),
 ('PALWORLD','TSR','Trial Deck Super Rare',true,110),
 ('PALWORLD','TSP','Trial Deck Super Parallel',true,120),
 ('PALWORLD','PR','Promo',true,130)
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,activo=EXCLUDED.activo,orden=EXCLUDED.orden,fecha_actualizacion=NOW();

-- ============================================================
-- INTEGRIDAD DE ALCANCE TCG
-- Ningún set o rareza puede mezclarse con otro juego.
-- ============================================================

CREATE OR REPLACE FUNCTION gmx.validate_tcg_card_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  set_game TEXT;
  rarity_owner TEXT;
BEGIN
  IF NEW.id_juego IS NULL OR NEW.id_set IS NULL THEN
    RAISE EXCEPTION 'TCG_GAME_AND_SET_REQUIRED';
  END IF;

  SELECT id_juego INTO set_game
  FROM gmx.tcg_sets
  WHERE id_set=NEW.id_set
  ORDER BY row_id
  LIMIT 1;

  IF set_game IS NULL THEN
    RAISE EXCEPTION 'TCG_SET_NOT_FOUND';
  END IF;

  IF set_game<>NEW.id_juego THEN
    RAISE EXCEPTION 'TCG_SET_GAME_MISMATCH';
  END IF;

  IF NULLIF(TRIM(COALESCE(NEW.rareza,'')),'') IS NOT NULL THEN
    SELECT id_juego INTO rarity_owner
    FROM gmx.tcg_rarezas
    WHERE id_juego=NEW.id_juego
      AND (
        LOWER(TRIM(COALESCE(nombre,'')))=LOWER(TRIM(NEW.rareza))
        OR LOWER(TRIM(COALESCE(codigo,'')))=LOWER(TRIM(NEW.rareza))
      )
      AND COALESCE(activo,true)=true
    ORDER BY row_id
    LIMIT 1;

    IF rarity_owner IS NULL THEN
      RAISE EXCEPTION 'TCG_RARITY_GAME_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tcg_cards_scope_guard ON gmx.tcg_cartas;
CREATE TRIGGER trg_tcg_cards_scope_guard
BEFORE INSERT OR UPDATE OF id_juego,id_set,rareza
ON gmx.tcg_cartas
FOR EACH ROW
EXECUTE FUNCTION gmx.validate_tcg_card_scope();

-- Inventario hereda la rareza y la identidad TCG desde la carta.
-- Nunca se acepta una rareza manual diferente de la carta.
CREATE OR REPLACE FUNCTION gmx.sync_tcg_inventory_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  card_rarity TEXT;
BEGIN
  SELECT rareza INTO card_rarity
  FROM gmx.tcg_cartas
  WHERE id_carta=NEW.id_carta
  ORDER BY row_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TCG_INVENTORY_CARD_NOT_FOUND';
  END IF;

  NEW.rareza := card_rarity;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tcg_inventory_scope_guard ON gmx.tcg_inventario;
CREATE TRIGGER trg_tcg_inventory_scope_guard
BEFORE INSERT OR UPDATE OF id_carta,rareza
ON gmx.tcg_inventario
FOR EACH ROW
EXECUTE FUNCTION gmx.sync_tcg_inventory_scope();

-- Verificación adicional en snapshots de adquisiciones.
CREATE OR REPLACE FUNCTION gmx.validate_tcg_acquisition_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  c_game TEXT;
  c_set TEXT;
  c_rarity TEXT;
BEGIN
  IF NEW.id_carta IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id_juego,id_set,rareza
  INTO c_game,c_set,c_rarity
  FROM gmx.tcg_cartas
  WHERE id_carta=NEW.id_carta
  ORDER BY row_id LIMIT 1;

  IF c_game IS NULL THEN
    RAISE EXCEPTION 'TCG_ACQUISITION_CARD_NOT_FOUND';
  END IF;

  NEW.id_juego := c_game;
  NEW.id_set := c_set;
  NEW.rareza := c_rarity;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tcg_acquisition_scope_guard ON gmx.tcg_adquisiciones;
CREATE TRIGGER trg_tcg_acquisition_scope_guard
BEFORE INSERT OR UPDATE OF id_carta,id_juego,id_set,rareza
ON gmx.tcg_adquisiciones
FOR EACH ROW
EXECUTE FUNCTION gmx.validate_tcg_acquisition_scope();

INSERT INTO gmx.schema_migrations(version,description)
SELECT '031','GMX 10.6.2.2 - Riftbound FFTCG Palworld and strict TCG scope integrity'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='031');

COMMIT;
