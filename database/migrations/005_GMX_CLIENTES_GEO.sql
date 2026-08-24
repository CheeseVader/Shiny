-- GMX Fase Local 3
-- Normalización incremental de Clientes + índices geográficos.
-- NO reinicializa tablas ni elimina datos.

BEGIN;

ALTER TABLE gmx.clientes
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS colonia TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT;

UPDATE gmx.clientes
SET pais = 'México'
WHERE (pais IS NULL OR BTRIM(pais) = '')
  AND cp ~ '^[0-9]{5}$';

CREATE INDEX IF NOT EXISTS idx_clientes_id_cliente
  ON gmx.clientes (id_cliente);

CREATE INDEX IF NOT EXISTS idx_clientes_nombre
  ON gmx.clientes (nombre);

CREATE INDEX IF NOT EXISTS idx_clientes_email
  ON gmx.clientes (email);

CREATE INDEX IF NOT EXISTS idx_clientes_telefono
  ON gmx.clientes (telefono);

CREATE INDEX IF NOT EXISTS idx_clientes_cp
  ON gmx.clientes (cp);

CREATE INDEX IF NOT EXISTS idx_catalogo_cp_cp
  ON gmx.catalogo_cp (cp);

CREATE INDEX IF NOT EXISTS idx_catalogo_colonias_cp
  ON gmx.catalogo_colonias (cp);

INSERT INTO gmx.schema_migrations(version, description)
SELECT
  '005',
  'GMX Fase Local 3 - clientes normalizados y catalogos geograficos'
WHERE NOT EXISTS (
  SELECT 1
  FROM gmx.schema_migrations
  WHERE version = '005'
);

COMMIT;
