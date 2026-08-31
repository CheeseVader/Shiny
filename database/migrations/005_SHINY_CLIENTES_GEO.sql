-- Shiny Fase Local 3
-- Normalización incremental de Clientes + índices geográficos.
-- NO reinicializa tablas ni elimina datos.

BEGIN;

ALTER TABLE shiny.clientes
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS colonia TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT;

UPDATE shiny.clientes
SET pais = 'México'
WHERE (pais IS NULL OR BTRIM(pais) = '')
  AND cp ~ '^[0-9]{5}$';

CREATE INDEX IF NOT EXISTS idx_clientes_id_cliente
  ON shiny.clientes (id_cliente);

CREATE INDEX IF NOT EXISTS idx_clientes_nombre
  ON shiny.clientes (nombre);

CREATE INDEX IF NOT EXISTS idx_clientes_email
  ON shiny.clientes (email);

CREATE INDEX IF NOT EXISTS idx_clientes_telefono
  ON shiny.clientes (telefono);

CREATE INDEX IF NOT EXISTS idx_clientes_cp
  ON shiny.clientes (cp);

CREATE INDEX IF NOT EXISTS idx_catalogo_cp_cp
  ON shiny.catalogo_cp (cp);

CREATE INDEX IF NOT EXISTS idx_catalogo_colonias_cp
  ON shiny.catalogo_colonias (cp);

INSERT INTO shiny.schema_migrations(version, description)
SELECT
  '005',
  'Shiny Fase Local 3 - clientes normalizados y catalogos geograficos'
WHERE NOT EXISTS (
  SELECT 1
  FROM shiny.schema_migrations
  WHERE version = '005'
);

COMMIT;
