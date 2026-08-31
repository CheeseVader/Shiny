BEGIN;

ALTER TABLE shiny.sucursales
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS colonia TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'México';

UPDATE shiny.sucursales
SET
  municipio=COALESCE(NULLIF(municipio,''),NULLIF(ciudad,'')),
  pais=COALESCE(NULLIF(pais,''),'México')
WHERE municipio IS NULL OR pais IS NULL;

ALTER TABLE shiny.proveedores
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS colonia TEXT;

UPDATE shiny.proveedores
SET municipio=COALESCE(NULLIF(municipio,''),NULLIF(ciudad,''))
WHERE municipio IS NULL;

CREATE INDEX IF NOT EXISTS ix_sucursales_geo
  ON shiny.sucursales(estado,municipio,ciudad,cp);
CREATE INDEX IF NOT EXISTS ix_proveedores_geo
  ON shiny.proveedores(estado,municipio,ciudad,cp);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '041','Shiny 10.6.2.4.1.1 - demographic standardization and geo catalog readiness'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='041');

COMMIT;
