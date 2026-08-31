
BEGIN;

ALTER TABLE shiny.cms_banners
  ADD COLUMN IF NOT EXISTS permanente BOOLEAN NOT NULL DEFAULT false;

UPDATE shiny.cms_banners
SET permanente = true
WHERE fecha_inicio IS NULL AND fecha_fin IS NULL;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '022','Shiny Fase Local 10.5.8 - slideshow permanent flag and safe media deletion'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='022');

COMMIT;
