BEGIN;

-- GMX 10.6.2.4.1
-- Core UX / Data Integrity:
-- IDs visibles automáticos, identidad única de cliente, datos fiscales opcionales
-- e índices de búsqueda para operación con catálogos grandes.

ALTER TABLE gmx.clientes
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS colonia TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'México',
  ADD COLUMN IF NOT EXISTS rfc TEXT,
  ADD COLUMN IF NOT EXISTS razon_social TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS cp_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS uso_cfdi TEXT;

CREATE OR REPLACE FUNCTION gmx.gmx_visible_id(prefix TEXT, n BIGINT, width INTEGER DEFAULT 6)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT prefix || '-' || LPAD(n::text, width, '0');
$$;

CREATE OR REPLACE FUNCTION gmx.assign_visible_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME='clientes' AND NULLIF(TRIM(NEW.id_cliente),'') IS NULL THEN
    NEW.id_cliente := gmx.gmx_visible_id('CLI', NEW.row_id);
  ELSIF TG_TABLE_NAME='productos' AND NULLIF(TRIM(NEW.id),'') IS NULL THEN
    NEW.id := gmx.gmx_visible_id('PROD', NEW.row_id);
  ELSIF TG_TABLE_NAME='sucursales' AND NULLIF(TRIM(NEW.id_sucursal),'') IS NULL THEN
    NEW.id_sucursal := gmx.gmx_visible_id('SUC', NEW.row_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_visible_id ON gmx.clientes;
CREATE TRIGGER trg_clientes_visible_id
BEFORE INSERT ON gmx.clientes
FOR EACH ROW EXECUTE FUNCTION gmx.assign_visible_ids();

DROP TRIGGER IF EXISTS trg_productos_visible_id ON gmx.productos;
CREATE TRIGGER trg_productos_visible_id
BEFORE INSERT ON gmx.productos
FOR EACH ROW EXECUTE FUNCTION gmx.assign_visible_ids();

DROP TRIGGER IF EXISTS trg_sucursales_visible_id ON gmx.sucursales;
CREATE TRIGGER trg_sucursales_visible_id
BEFORE INSERT ON gmx.sucursales
FOR EACH ROW EXECUTE FUNCTION gmx.assign_visible_ids();

-- Completa IDs legados/vacíos de forma determinista.
UPDATE gmx.clientes
SET id_cliente=gmx.gmx_visible_id('CLI',row_id)
WHERE NULLIF(TRIM(COALESCE(id_cliente,'')),'') IS NULL;

UPDATE gmx.productos
SET id=gmx.gmx_visible_id('PROD',row_id)
WHERE NULLIF(TRIM(COALESCE(id,'')),'') IS NULL;

UPDATE gmx.sucursales
SET id_sucursal=gmx.gmx_visible_id('SUC',row_id)
WHERE NULLIF(TRIM(COALESCE(id_sucursal,'')),'') IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_visible_id
  ON gmx.clientes(id_cliente) WHERE id_cliente IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_visible_id
  ON gmx.productos(id) WHERE id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sucursales_visible_id
  ON gmx.sucursales(id_sucursal) WHERE id_sucursal IS NOT NULL;

-- Refuerzo de identidad única ya introducida en 027.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_email_normalizado
  ON gmx.clientes(email_normalizado)
  WHERE email_normalizado IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_telefono_normalizado
  ON gmx.clientes(telefono_normalizado)
  WHERE telefono_normalizado IS NOT NULL;

-- RFC es fiscal/opcional. Se normaliza, pero NO se usa como credencial.
CREATE OR REPLACE FUNCTION gmx.normalize_rfc(v TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(UPPER(regexp_replace(TRIM(COALESCE(v,'')),'\s+','','g')),'');
$$;

UPDATE gmx.clientes SET rfc=gmx.normalize_rfc(rfc) WHERE rfc IS NOT NULL;

-- Búsquedas operativas.
CREATE INDEX IF NOT EXISTS ix_clientes_nombre_lower ON gmx.clientes(LOWER(nombre));
CREATE INDEX IF NOT EXISTS ix_clientes_telefono_lower ON gmx.clientes(LOWER(telefono));
CREATE INDEX IF NOT EXISTS ix_clientes_email_lower ON gmx.clientes(LOWER(email));
CREATE INDEX IF NOT EXISTS ix_productos_nombre_lower ON gmx.productos(LOWER(nombre));
CREATE INDEX IF NOT EXISTS ix_productos_sku_lower ON gmx.productos(LOWER(sku));
CREATE INDEX IF NOT EXISTS ix_sucursales_nombre_lower ON gmx.sucursales(LOWER(nombre_sucursal));

INSERT INTO gmx.schema_migrations(version,description)
SELECT '040','GMX 10.6.2.4.1 - Core UX Data Integrity automatic IDs identity fiscal geo modal'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='040');

COMMIT;
