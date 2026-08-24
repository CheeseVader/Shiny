
BEGIN;

ALTER TABLE gmx.tcg_juegos
  ADD COLUMN IF NOT EXISTS visible_portal BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS catalogo_codigo TEXT,
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS sitio_oficial TEXT;

ALTER TABLE gmx.tcg_sets
  ADD COLUMN IF NOT EXISTS fuente_oficial TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tcg_juegos_catalogo_codigo
  ON gmx.tcg_juegos(catalogo_codigo)
  WHERE catalogo_codigo IS NOT NULL;

CREATE TABLE IF NOT EXISTS gmx.tcg_master_juegos (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  publisher TEXT,
  sitio_oficial TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden BIGINT NOT NULL DEFAULT 0,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gmx.tcg_master_sets (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_juego TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  fecha_lanzamiento DATE,
  total_cartas BIGINT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  fuente_oficial TEXT,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_juego,codigo)
);

CREATE TABLE IF NOT EXISTS gmx.tcg_master_rarezas (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_juego TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden BIGINT NOT NULL DEFAULT 0,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_juego,codigo)
);

CREATE TABLE IF NOT EXISTS gmx.importaciones (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_importacion TEXT NOT NULL UNIQUE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo TEXT NOT NULL,
  archivo TEXT,
  filas_leidas BIGINT NOT NULL DEFAULT 0,
  filas_creadas BIGINT NOT NULL DEFAULT 0,
  filas_actualizadas BIGINT NOT NULL DEFAULT 0,
  filas_error BIGINT NOT NULL DEFAULT 0,
  detalle JSONB,
  usuario TEXT
);

INSERT INTO gmx.tcg_master_juegos(codigo,nombre,publisher,sitio_oficial,activo,orden)
VALUES
 ('POKEMON','Pokémon TCG','The Pokémon Company International','https://www.pokemon.com/us/pokemon-tcg/trading-card-expansions',true,10),
 ('MAGIC','Magic: The Gathering','Wizards of the Coast','https://magic.wizards.com/en/products/card-set-archive',true,20),
 ('YUGIOH','Yu-Gi-Oh! TCG','Konami','https://www.yugioh-card.com/en/products/',true,30),
 ('ONEPIECE','One Piece Card Game','Bandai','https://en.onepiece-cardgame.com/products/',true,40),
 ('LORCANA','Disney Lorcana TCG','Ravensburger','https://www.disneylorcana.com/en-US/',true,50),
 ('DIGIMON','Digimon Card Game','Bandai','https://world.digimoncard.com/',true,60),
 ('DBSFW','Dragon Ball Super Card Game Fusion World','Bandai','https://www.dbs-cardgame.com/fw/',true,70),
 ('SWU','Star Wars: Unlimited','Fantasy Flight Games','https://starwarsunlimited.com/',true,80),
 ('FAB','Flesh and Blood','Legend Story Studios','https://fabtcg.com/',true,90),
 ('UNIONARENA','Union Arena','Bandai','https://www.unionarena-tcg.com/',true,100),
 ('WEISS','Weiß Schwarz','Bushiroad','https://en.ws-tcg.com/',true,110),
 ('VANGUARD','Cardfight!! Vanguard','Bushiroad','https://en.cf-vanguard.com/',true,120)
ON CONFLICT(codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,publisher=EXCLUDED.publisher,sitio_oficial=EXCLUDED.sitio_oficial,
 activo=EXCLUDED.activo,orden=EXCLUDED.orden,fecha_actualizacion=NOW();

INSERT INTO gmx.tcg_master_rarezas(id_juego,codigo,nombre,activo,orden)
VALUES
 ('POKEMON','C','Common',true,10),('POKEMON','U','Uncommon',true,20),('POKEMON','R','Rare',true,30),
 ('POKEMON','RH','Reverse Holo',true,40),('POKEMON','RR','Double Rare',true,50),('POKEMON','IR','Illustration Rare',true,60),
 ('POKEMON','SIR','Special Illustration Rare',true,70),('POKEMON','HR','Hyper Rare',true,80),
 ('MAGIC','C','Common',true,10),('MAGIC','U','Uncommon',true,20),('MAGIC','R','Rare',true,30),('MAGIC','M','Mythic Rare',true,40),
 ('YUGIOH','C','Common',true,10),('YUGIOH','R','Rare',true,20),('YUGIOH','SR','Super Rare',true,30),
 ('YUGIOH','UR','Ultra Rare',true,40),('YUGIOH','SCR','Secret Rare',true,50),('YUGIOH','QCSR','Quarter Century Secret Rare',true,60),
 ('ONEPIECE','C','Common',true,10),('ONEPIECE','UC','Uncommon',true,20),('ONEPIECE','R','Rare',true,30),
 ('ONEPIECE','SR','Super Rare',true,40),('ONEPIECE','SEC','Secret Rare',true,50),('ONEPIECE','L','Leader',true,60),('ONEPIECE','SP','Special',true,70),
 ('LORCANA','C','Common',true,10),('LORCANA','U','Uncommon',true,20),('LORCANA','R','Rare',true,30),
 ('LORCANA','SR','Super Rare',true,40),('LORCANA','L','Legendary',true,50),('LORCANA','E','Enchanted',true,60),('LORCANA','I','Iconic',true,70)
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,activo=EXCLUDED.activo,orden=EXCLUDED.orden,fecha_actualizacion=NOW();

INSERT INTO gmx.tcg_master_sets(id_juego,codigo,nombre,fecha_lanzamiento,activo,fuente_oficial)
VALUES
 ('ONEPIECE','OP-01','ROMANCE DAWN','2022-12-02',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-02','PARAMOUNT WAR','2023-03-10',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-03','PILLARS OF STRENGTH','2023-06-30',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-04','KINGDOMS OF INTRIGUE','2023-09-22',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-05','Awakening of the New Era','2023-12-08',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-06','WINGS OF THE CAPTAIN','2024-03-15',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','EB-01','MEMORIAL COLLECTION','2024-05-03',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-07','500 YEARS IN THE FUTURE','2024-06-28',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-08','TWO LEGENDS','2024-09-13',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','PRB-01','ONE PIECE CARD THE BEST','2024-11-08',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-09','EMPERORS IN THE NEW WORLD','2024-12-13',true,'https://en.onepiece-cardgame.com/products/?page=2&subcategory=boosters'),
 ('ONEPIECE','OP-10','ROYAL BLOOD','2025-03-21',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','EB-02','Anime 25th Collection','2025-05-09',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','OP-11','A FIST OF DIVINE SPEED','2025-06-06',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','OP-12','LEGACY OF THE MASTER','2025-08-22',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','PRB-02','ONE PIECE CARD THE BEST vol.2','2025-10-03',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','OP-13','CARRYING ON HIS WILL','2025-11-07',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','OP14-EB04','THE AZURE SEA''S SEVEN','2026-01-16',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','EB-03','ONE PIECE HEROINES EDITION','2026-02-20',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','OP15-EB04','ADVENTURE ON KAMI''S ISLAND','2026-04-03',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','OP-16','THE TIME OF BATTLE','2026-06-12',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('ONEPIECE','OP-17','THE WORLD''S STRONGEST WARRIORS','2026-08-28',true,'https://en.onepiece-cardgame.com/products/?subcategory=boosters'),
 ('LORCANA','TFC','The First Chapter',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','ROTF','Rise of the Floodborn',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','ITI','Into The Inklands',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','UR','Ursula''s Return',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','SS','Shimmering Skies',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','AS','Azurite Sea',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','AI','Archazia''s Island',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','ROJ','Reign of Jafar',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','FAB','Fabled',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','WIW','Whispers in the Well',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','WU','Wilds Unknown',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','WS','Winterspell',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','AOTV','Attack of the Vine!',NULL,true,'https://www.disneylorcana.com/en-US/product/hyperia-city'),
 ('LORCANA','HC','Hyperia City','2026-10-23',true,'https://www.disneylorcana.com/en-US/product/hyperia-city')
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,fecha_lanzamiento=EXCLUDED.fecha_lanzamiento,
 activo=EXCLUDED.activo,fuente_oficial=EXCLUDED.fuente_oficial,fecha_actualizacion=NOW();

-- Migra los juegos actuales al vínculo de catálogo cuando el código coincide.
UPDATE gmx.tcg_juegos j
SET catalogo_codigo=m.codigo,
    publisher=COALESCE(j.publisher,m.publisher),
    sitio_oficial=COALESCE(j.sitio_oficial,m.sitio_oficial)
FROM gmx.tcg_master_juegos m
WHERE UPPER(COALESCE(j.codigo,''))=m.codigo
  AND j.catalogo_codigo IS NULL;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  gmx.tcg_master_juegos,gmx.tcg_master_sets,gmx.tcg_master_rarezas,gmx.importaciones
TO gmx_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '030','GMX 10.6.2.2 - TCG master catalog and Excel imports'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='030');

COMMIT;
