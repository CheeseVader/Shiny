BEGIN;

-- Shiny 10.6.2.4.1.3
-- Clientes: identidad única reforzada + teléfonos estrictamente numéricos.

CREATE OR REPLACE FUNCTION shiny.normalize_phone_digits(v TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(v,''),'[^0-9]','','g'),'');
$$;

-- Normaliza cualquier dato de prueba existente.
UPDATE shiny.clientes
SET telefono=shiny.normalize_phone_digits(telefono)
WHERE telefono IS NOT NULL;

-- Mantiene columnas normalizadas de 027 coherentes.
UPDATE shiny.clientes
SET telefono_normalizado=shiny.normalize_phone_digits(telefono)
WHERE telefono IS NOT NULL;

-- Constraint: si existe teléfono, solo puede contener 0-9.
ALTER TABLE shiny.clientes
  DROP CONSTRAINT IF EXISTS ck_clientes_telefono_digits_only;

ALTER TABLE shiny.clientes
  ADD CONSTRAINT ck_clientes_telefono_digits_only
  CHECK (telefono IS NULL OR telefono ~ '^[0-9]+$');

-- Índices de búsqueda.
CREATE INDEX IF NOT EXISTS ix_clientes_id_lower
  ON shiny.clientes(LOWER(id_cliente));

CREATE INDEX IF NOT EXISTS ix_clientes_cp
  ON shiny.clientes(cp);

CREATE INDEX IF NOT EXISTS ix_clientes_estado_ciudad
  ON shiny.clientes(estado,ciudad);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '043','Shiny 10.6.2.4.1.3 - Clients identity search and digits-only phones'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='043');

COMMIT;
