BEGIN;

-- ============================================================
-- GMX BUYLIST
-- BUY-001 MONEY PRECISION FIX
-- Preserve decimal precision in Buylist line offers
-- ============================================================

ALTER TABLE gmx.tcg_buylist_detalle
    ALTER COLUMN oferta_linea TYPE NUMERIC(18,4)
    USING oferta_linea::NUMERIC(18,4);

UPDATE gmx.tcg_buylist_detalle
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

INSERT INTO gmx.schema_migrations(version, description)
SELECT
    '061',
    'GMX Buylist - preserve decimal precision in line offers'
WHERE NOT EXISTS (
    SELECT 1
    FROM gmx.schema_migrations
    WHERE version='061'
);

COMMIT;
