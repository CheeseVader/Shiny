
BEGIN;

ALTER TABLE shiny.tcg_master_cards
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_catalog_change_at TIMESTAMPTZ;

ALTER TABLE shiny.tcg_master_sets
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_catalog_change_at TIMESTAMPTZ;

ALTER TABLE shiny.tcg_card_price_current
  ADD COLUMN IF NOT EXISTS source_hash TEXT;

CREATE INDEX IF NOT EXISTS ix_tcg_master_cards_incremental
  ON shiny.tcg_master_cards(game_code,set_code,provider_code,external_id,source_hash);

CREATE INDEX IF NOT EXISTS ix_tcg_price_current_incremental
  ON shiny.tcg_card_price_current(master_card_id,price_provider,variant,currency,source_hash);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '037','Shiny 10.6.2.3.9 - incremental TCG catalog and pricing sync'
WHERE NOT EXISTS(
  SELECT 1 FROM shiny.schema_migrations WHERE version='037'
);

COMMIT;
