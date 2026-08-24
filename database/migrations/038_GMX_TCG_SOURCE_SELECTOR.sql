BEGIN;

ALTER TABLE gmx.tcg_sync_game_config
  ADD COLUMN IF NOT EXISTS source_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE gmx.tcg_sync_game_config
SET source_preferences='{}'::jsonb
WHERE source_preferences IS NULL;

COMMENT ON COLUMN gmx.tcg_sync_game_config.source_preferences IS
'Admin source selection for catalog, images, prices and fallback policy.';

COMMIT;
