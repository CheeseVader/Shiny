BEGIN;

-- GMX 10.6.2.4.1.3
-- Clientes: identidad única reforzada + teléfonos estrictamente numéricos.

CREATE OR REPLACE FUNCTION gmx.normalize_phone_digits(v TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(v,''),'[^0-9]','','g'),'');
$$;

-- Normaliza cualquier dato de prueba existente.
UPDATE gmx.clientes
SET telefono=gmx.normalize_phone_digits(telefono)
WHERE telefono IS NOT NULL;

-- Mantiene columnas normalizadas de 027 coherentes.
UPDATE gmx.clientes
SET telefono_normalizado=gmx.normalize_phone_digits(telefono)
WHERE telefono IS NOT NULL;

-- Constraint: si existe teléfono, solo puede contener 0-9.
ALTER TABLE gmx.clientes
  DROP CONSTRAINT IF EXISTS ck_clientes_telefono_digits_only;

ALTER TABLE gmx.clientes
  ADD CONSTRAINT ck_clientes_telefono_digits_only
  CHECK (telefono IS NULL OR telefono ~ '^[0-9]+$');

-- Índices de búsqueda.
CREATE INDEX IF NOT EXISTS ix_clientes_id_lower
  ON gmx.clientes(LOWER(id_cliente));

CREATE INDEX IF NOT EXISTS ix_clientes_cp
  ON gmx.clientes(cp);

CREATE INDEX IF NOT EXISTS ix_clientes_estado_ciudad
  ON gmx.clientes(estado,ciudad);

INSERT INTO gmx.schema_migrations(version,description)
SELECT '043','GMX 10.6.2.4.1.3 - Clients identity search and digits-only phones'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='043');

COMMIT;
