
BEGIN;

CREATE TABLE IF NOT EXISTS gmx.tcg_sync_providers (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_code TEXT NOT NULL UNIQUE,
  provider_code TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'API',
  official_source_url TEXT,
  status TEXT NOT NULL DEFAULT 'READY',
  supports_sets BOOLEAN NOT NULL DEFAULT true,
  supports_cards BOOLEAN NOT NULL DEFAULT false,
  supports_images BOOLEAN NOT NULL DEFAULT false,
  supports_prices BOOLEAN NOT NULL DEFAULT false,
  requires_api_key BOOLEAN NOT NULL DEFAULT false,
  last_sets_sync_at TIMESTAMPTZ,
  last_cards_sync_at TIMESTAMPTZ,
  last_prices_sync_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS gmx.tcg_sync_game_config (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_code TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  region TEXT NOT NULL DEFAULT 'NA_LATAM',
  language TEXT NOT NULL DEFAULT 'en',
  sync_cards BOOLEAN NOT NULL DEFAULT true,
  sync_prices BOOLEAN NOT NULL DEFAULT true,
  download_images BOOLEAN NOT NULL DEFAULT false,
  selected_sets JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_sync_frequency TEXT NOT NULL DEFAULT 'WEEKLY',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gmx.tcg_master_cards (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  external_id TEXT NOT NULL,
  set_code TEXT NOT NULL,
  name TEXT NOT NULL,
  number TEXT,
  collector_number TEXT,
  rarity TEXT,
  card_type TEXT,
  subtype TEXT,
  artist TEXT,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  image_small_url TEXT,
  image_large_url TEXT,
  image_local_url TEXT,
  purchase_url TEXT,
  source_url TEXT,
  external_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(provider_code,external_id,set_code,language)
);

CREATE INDEX IF NOT EXISTS ix_tcg_master_cards_game_set
  ON gmx.tcg_master_cards(game_code,set_code,name);

CREATE TABLE IF NOT EXISTS gmx.tcg_card_price_current (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  master_card_id BIGINT NOT NULL REFERENCES gmx.tcg_master_cards(row_id) ON DELETE CASCADE,
  price_provider TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'default',
  currency TEXT NOT NULL,
  low NUMERIC,
  mid NUMERIC,
  high NUMERIC,
  market NUMERIC,
  trend NUMERIC,
  source_url TEXT,
  provider_updated_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(master_card_id,price_provider,variant,currency)
);

CREATE TABLE IF NOT EXISTS gmx.tcg_card_price_history (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  master_card_id BIGINT NOT NULL REFERENCES gmx.tcg_master_cards(row_id) ON DELETE CASCADE,
  price_provider TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'default',
  currency TEXT NOT NULL,
  low NUMERIC,
  mid NUMERIC,
  high NUMERIC,
  market NUMERIC,
  trend NUMERIC,
  source_url TEXT,
  provider_updated_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tcg_price_history_card_date
  ON gmx.tcg_card_price_history(master_card_id,fetched_at DESC);

ALTER TABLE gmx.tcg_cartas
  ADD COLUMN IF NOT EXISTS master_card_id BIGINT,
  ADD COLUMN IF NOT EXISTS provider_code TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS image_source_url TEXT;

ALTER TABLE gmx.tcg_inventario
  ADD COLUMN IF NOT EXISTS master_card_id BIGINT;

-- Provider capabilities. Catalog-only providers remain selectable without
-- forcing unsupported full-card scraping.
INSERT INTO gmx.tcg_sync_providers(
  game_code,provider_code,provider_name,source_kind,official_source_url,status,
  supports_sets,supports_cards,supports_images,supports_prices,requires_api_key
)
VALUES
 ('POKEMON','POKEMON_TCG_API','Pokémon TCG API','API','https://docs.pokemontcg.io/','READY',true,true,true,true,false),
 ('MAGIC','SCRYFALL','Scryfall','API','https://scryfall.com/docs/api','READY',true,true,true,true,false),
 ('YUGIOH','YGOPRODECK','YGOPRODeck','API','https://ygoprodeck.com/api-guide/','READY',true,true,true,true,false),

 ('ONEPIECE','ONEPIECE_OFFICIAL','ONE PIECE Official','OFFICIAL_CATALOG','https://en.onepiece-cardgame.com/cardlist/','CATALOG_ONLY',true,false,true,false,false),
 ('LORCANA','LORCANA_OFFICIAL','Disney Lorcana Official','OFFICIAL_CATALOG','https://cards.disneylorcana.com/','CATALOG_ONLY',true,false,true,false,false),
 ('SWU','SWU_OFFICIAL','Star Wars: Unlimited Official','OFFICIAL_CATALOG','https://starwarsunlimited.com/','CATALOG_ONLY',true,false,true,false,false),
 ('RIFTBOUND','RIFTBOUND_OFFICIAL','Riftbound Official','OFFICIAL_CATALOG','https://riftbound.leagueoflegends.com/','CATALOG_ONLY',true,false,true,false,false),
 ('FFTCG','FFTCG_OFFICIAL','FINAL FANTASY TCG Official','OFFICIAL_CATALOG','https://fftcg.square-enix-games.com/en/card-browser','CATALOG_ONLY',true,false,true,false,false),
 ('PALWORLD','PALWORLD_OFFICIAL','Palworld Official Card Game','OFFICIAL_CATALOG','https://en.palworld-official-cardgame.com/','CATALOG_ONLY',true,false,true,false,false),
 ('DIGIMON','DIGIMON_OFFICIAL','Digimon Card Game Official','OFFICIAL_CATALOG','https://world.digimoncard.com/','CATALOG_ONLY',true,false,true,false,false),
 ('DBSFW','DBSFW_OFFICIAL','Dragon Ball Super Fusion World Official','OFFICIAL_CATALOG','https://www.dbs-cardgame.com/fw/','CATALOG_ONLY',true,false,true,false,false),
 ('FAB','FAB_OFFICIAL','Flesh and Blood Official','OFFICIAL_CATALOG','https://fabtcg.com/','CATALOG_ONLY',true,false,true,false,false),
 ('UNIONARENA','UNIONARENA_OFFICIAL','Union Arena Official','OFFICIAL_CATALOG','https://www.unionarena-tcg.com/','CATALOG_ONLY',true,false,true,false,false),
 ('WEISS','WEISS_OFFICIAL','Weiß Schwarz Official','OFFICIAL_CATALOG','https://en.ws-tcg.com/','CATALOG_ONLY',true,false,true,false,false),
 ('VANGUARD','VANGUARD_OFFICIAL','Cardfight!! Vanguard Official','OFFICIAL_CATALOG','https://en.cf-vanguard.com/','CATALOG_ONLY',true,false,true,false,false)
ON CONFLICT(game_code) DO UPDATE SET
 provider_code=EXCLUDED.provider_code,
 provider_name=EXCLUDED.provider_name,
 source_kind=EXCLUDED.source_kind,
 official_source_url=EXCLUDED.official_source_url,
 status=EXCLUDED.status,
 supports_sets=EXCLUDED.supports_sets,
 supports_cards=EXCLUDED.supports_cards,
 supports_images=EXCLUDED.supports_images,
 supports_prices=EXCLUDED.supports_prices,
 requires_api_key=EXCLUDED.requires_api_key;

INSERT INTO gmx.tcg_sync_game_config(game_code)
SELECT codigo FROM gmx.tcg_master_juegos
ON CONFLICT(game_code) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  gmx.tcg_sync_providers,
  gmx.tcg_sync_game_config,
  gmx.tcg_master_cards,
  gmx.tcg_card_price_current,
  gmx.tcg_card_price_history
TO gmx_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '034','GMX 10.6.2.3 - selective TCG auto sync, master cards, images and multi-source prices'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='034');

COMMIT;
