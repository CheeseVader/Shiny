BEGIN;

-- ============================================================
-- Shiny BUYLIST
-- BUY-001 MONEY PRECISION FIX
-- Preserve decimal precision in Buylist line offers
-- ============================================================

ALTER TABLE shiny.tcg_buylist_detalle
    ALTER COLUMN oferta_linea TYPE NUMERIC(18,4)
    USING oferta_linea::NUMERIC(18,4);

UPDATE shiny.tcg_buylist_detalle
SET oferta_linea =
    ROUND(
        COALESCE(oferta_unitario,0) *
        COALESCE(cantidad,0),
        4
    )
WHERE oferta_linea IS DISTINCT FROM
    ROUND(
        COALESCE(oferta_unitario,0) *
        COALESCE(cantidad,0),
        4
    );

INSERT INTO shiny.schema_migrations(version, description)
SELECT
    '061',
    'Shiny Buylist - preserve decimal precision in line offers'
WHERE NOT EXISTS (
    SELECT 1
    FROM shiny.schema_migrations
    WHERE version='061'
);

COMMIT;
