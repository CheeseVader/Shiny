BEGIN;

ALTER TABLE gmx.sucursales
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS colonia TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'México';

UPDATE gmx.sucursales
SET
  municipio=COALESCE(NULLIF(municipio,''),NULLIF(ciudad,'')),
  pais=COALESCE(NULLIF(pais,''),'México')
WHERE municipio IS NULL OR pais IS NULL;

ALTER TABLE gmx.proveedores
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS colonia TEXT;

UPDATE gmx.proveedores
SET municipio=COALESCE(NULLIF(municipio,''),NULLIF(ciudad,''))
WHERE municipio IS NULL;

CREATE INDEX IF NOT EXISTS ix_sucursales_geo
  ON gmx.sucursales(estado,municipio,ciudad,cp);
CREATE INDEX IF NOT EXISTS ix_proveedores_geo
  ON gmx.proveedores(estado,municipio,ciudad,cp);

INSERT INTO gmx.schema_migrations(version,description)
SELECT '041','GMX 10.6.2.4.1.1 - demographic standardization and geo catalog readiness'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='041');

COMMIT;
