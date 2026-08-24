
BEGIN;

ALTER TABLE gmx.cms_banners
  ADD COLUMN IF NOT EXISTS permanente BOOLEAN NOT NULL DEFAULT false;

UPDATE gmx.cms_banners
SET permanente = true
WHERE fecha_inicio IS NULL AND fecha_fin IS NULL;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '022','GMX Fase Local 10.5.8 - slideshow permanent flag and safe media deletion'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='022');

COMMIT;
