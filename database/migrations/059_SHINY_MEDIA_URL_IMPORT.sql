BEGIN;
ALTER TABLE shiny.multimedia ADD COLUMN IF NOT EXISTS url_origen TEXT;
CREATE INDEX IF NOT EXISTS ix_multimedia_hash_active ON shiny.multimedia(hash,activo);
INSERT INTO shiny.schema_migrations(version,description)
SELECT '059','Shiny 10.6.2.4.1.12.2.0.3 - media URL import and sync'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='059');
COMMIT;
