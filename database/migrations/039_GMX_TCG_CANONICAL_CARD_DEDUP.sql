
BEGIN;

ALTER TABLE gmx.tcg_master_cards
  ADD COLUMN IF NOT EXISTS canonical_key TEXT,
  ADD COLUMN IF NOT EXISTS source_refs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Build the same canonical identity GMX will use during future syncs.
UPDATE gmx.tcg_master_cards
SET canonical_key = lower(concat_ws('|',
  trim(game_code),
  trim(set_code),
  trim(COALESCE(NULLIF(collector_number,''),NULLIF(number,''),'__NO_NUMBER__')),
  trim(name),
  trim(COALESCE(NULLIF(language,''),'en'))
))
WHERE canonical_key IS NULL OR canonical_key='';

CREATE TEMP TABLE gmx_card_canonical_map ON COMMIT DROP AS
SELECT
  row_id,
  canonical_key,
  MIN(row_id) OVER (PARTITION BY canonical_key) AS keeper_id
FROM gmx.tcg_master_cards
WHERE canonical_key IS NOT NULL AND canonical_key<>'';

CREATE INDEX ON gmx_card_canonical_map(row_id);
CREATE INDEX ON gmx_card_canonical_map(keeper_id);

-- Preserve all known provider/external identifiers on the keeper.
WITH refs AS (
  SELECT
    m.keeper_id,
    jsonb_object_agg(c.provider_code,c.external_id) AS refs
  FROM gmx_card_canonical_map m
  JOIN gmx.tcg_master_cards c ON c.row_id=m.row_id
  GROUP BY m.keeper_id
)
UPDATE gmx.tcg_master_cards k
SET source_refs=COALESCE(k.source_refs,'{}'::jsonb)||refs.refs
FROM refs
WHERE k.row_id=refs.keeper_id;

-- Copy current prices from duplicates to keeper. If the same market row exists twice,
-- keep/update it with the newest fetched value.
INSERT INTO gmx.tcg_card_price_current(
  master_card_id,price_provider,variant,currency,low,mid,high,market,trend,
  source_url,provider_updated_at,fetched_at,source_hash
)
SELECT
  m.keeper_id,p.price_provider,p.variant,p.currency,p.low,p.mid,p.high,p.market,p.trend,
  p.source_url,p.provider_updated_at,p.fetched_at,p.source_hash
FROM gmx.tcg_card_price_current p
JOIN gmx_card_canonical_map m ON m.row_id=p.master_card_id
WHERE m.row_id<>m.keeper_id
ON CONFLICT(master_card_id,price_provider,variant,currency) DO UPDATE SET
  low=CASE WHEN EXCLUDED.fetched_at>=gmx.tcg_card_price_current.fetched_at THEN EXCLUDED.low ELSE gmx.tcg_card_price_current.low END,
  mid=CASE WHEN EXCLUDED.fetched_at>=gmx.tcg_card_price_current.fetched_at THEN EXCLUDED.mid ELSE gmx.tcg_card_price_current.mid END,
  high=CASE WHEN EXCLUDED.fetched_at>=gmx.tcg_card_price_current.fetched_at THEN EXCLUDED.high ELSE gmx.tcg_card_price_current.high END,
  market=CASE WHEN EXCLUDED.fetched_at>=gmx.tcg_card_price_current.fetched_at THEN EXCLUDED.market ELSE gmx.tcg_card_price_current.market END,
  trend=CASE WHEN EXCLUDED.fetched_at>=gmx.tcg_card_price_current.fetched_at THEN EXCLUDED.trend ELSE gmx.tcg_card_price_current.trend END,
  source_url=CASE WHEN EXCLUDED.fetched_at>=gmx.tcg_card_price_current.fetched_at THEN EXCLUDED.source_url ELSE gmx.tcg_card_price_current.source_url END,
  provider_updated_at=GREATEST(gmx.tcg_card_price_current.provider_updated_at,EXCLUDED.provider_updated_at),
  fetched_at=GREATEST(gmx.tcg_card_price_current.fetched_at,EXCLUDED.fetched_at),
  source_hash=CASE WHEN EXCLUDED.fetched_at>=gmx.tcg_card_price_current.fetched_at THEN EXCLUDED.source_hash ELSE gmx.tcg_card_price_current.source_hash END;

-- History has no unique restriction, so it can simply be reassigned.
UPDATE gmx.tcg_card_price_history h
SET master_card_id=m.keeper_id
FROM gmx_card_canonical_map m
WHERE h.master_card_id=m.row_id
  AND m.row_id<>m.keeper_id;

-- Preserve operational references if any card was already installed / inventoried.
UPDATE gmx.tcg_cartas c
SET master_card_id=m.keeper_id
FROM gmx_card_canonical_map m
WHERE c.master_card_id=m.row_id
  AND m.row_id<>m.keeper_id;

UPDATE gmx.tcg_inventario i
SET master_card_id=m.keeper_id
FROM gmx_card_canonical_map m
WHERE i.master_card_id=m.row_id
  AND m.row_id<>m.keeper_id;

-- Current duplicate price rows can now be removed because their values were copied.
DELETE FROM gmx.tcg_card_price_current p
USING gmx_card_canonical_map m
WHERE p.master_card_id=m.row_id
  AND m.row_id<>m.keeper_id;

-- Prefer useful image/content from any duplicate if keeper lacks it.
WITH merged AS (
  SELECT
    m.keeper_id,
    MAX(NULLIF(c.image_local_url,'')) AS image_local_url,
    MAX(NULLIF(c.image_large_url,'')) AS image_large_url,
    MAX(NULLIF(c.image_small_url,'')) AS image_small_url,
    MAX(NULLIF(c.rarity,'')) AS rarity,
    MAX(NULLIF(c.card_type,'')) AS card_type,
    MAX(NULLIF(c.artist,'')) AS artist
  FROM gmx_card_canonical_map m
  JOIN gmx.tcg_master_cards c ON c.row_id=m.row_id
  GROUP BY m.keeper_id
)
UPDATE gmx.tcg_master_cards k
SET
  image_local_url=COALESCE(NULLIF(k.image_local_url,''),merged.image_local_url),
  image_large_url=COALESCE(NULLIF(k.image_large_url,''),merged.image_large_url),
  image_small_url=COALESCE(NULLIF(k.image_small_url,''),merged.image_small_url),
  rarity=COALESCE(NULLIF(k.rarity,''),merged.rarity),
  card_type=COALESCE(NULLIF(k.card_type,''),merged.card_type),
  artist=COALESCE(NULLIF(k.artist,''),merged.artist)
FROM merged
WHERE k.row_id=merged.keeper_id;

DELETE FROM gmx.tcg_master_cards c
USING gmx_card_canonical_map m
WHERE c.row_id=m.row_id
  AND m.row_id<>m.keeper_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tcg_master_cards_canonical_key
  ON gmx.tcg_master_cards(canonical_key)
  WHERE canonical_key IS NOT NULL AND canonical_key<>'';

CREATE INDEX IF NOT EXISTS ix_tcg_master_cards_canonical_lookup
  ON gmx.tcg_master_cards(game_code,set_code,collector_number,name,language);

COMMIT;
