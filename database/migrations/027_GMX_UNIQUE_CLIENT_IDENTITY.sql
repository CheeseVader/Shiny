
BEGIN;

CREATE OR REPLACE FUNCTION gmx.normalize_email(v TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(LOWER(TRIM(COALESCE(v,''))),'');
$$;

CREATE OR REPLACE FUNCTION gmx.normalize_phone(v TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d TEXT;
BEGIN
  d := regexp_replace(COALESCE(v,''), '\D', '', 'g');
  IF d = '' THEN
    RETURN NULL;
  END IF;

  -- Normalización base México:
  -- 10 dígitos nacionales -> +52XXXXXXXXXX
  -- 52 + 10 dígitos -> +52XXXXXXXXXX
  IF length(d)=10 THEN
    RETURN '+52' || d;
  ELSIF length(d)=12 AND left(d,2)='52' THEN
    RETURN '+' || d;
  END IF;

  -- Conserva otros formatos internacionales de forma estable.
  RETURN '+' || d;
END;
$$;

ALTER TABLE gmx.clientes
  ADD COLUMN IF NOT EXISTS email_normalizado TEXT,
  ADD COLUMN IF NOT EXISTS telefono_normalizado TEXT,
  ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telefono_verificado BOOLEAN NOT NULL DEFAULT false;

UPDATE gmx.clientes
SET email_normalizado=gmx.normalize_email(email),
    telefono_normalizado=gmx.normalize_phone(telefono)
WHERE email_normalizado IS DISTINCT FROM gmx.normalize_email(email)
   OR telefono_normalizado IS DISTINCT FROM gmx.normalize_phone(telefono);

CREATE TABLE IF NOT EXISTS gmx.cliente_identidad_unica (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('EMAIL','PHONE')),
  valor_normalizado TEXT NOT NULL,
  id_cliente TEXT NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tipo,valor_normalizado)
);

CREATE INDEX IF NOT EXISTS ix_cliente_identidad_unica_cliente
  ON gmx.cliente_identidad_unica(id_cliente,tipo);

CREATE TABLE IF NOT EXISTS gmx.cliente_identidad_conflictos (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL,
  valor_normalizado TEXT NOT NULL,
  id_cliente_canonico TEXT NOT NULL,
  id_cliente_conflicto TEXT NOT NULL,
  detectado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelto BOOLEAN NOT NULL DEFAULT false,
  detalle TEXT
);

-- El primer cliente por row_id queda como identidad canónica.
INSERT INTO gmx.cliente_identidad_unica(tipo,valor_normalizado,id_cliente)
SELECT 'EMAIL',email_normalizado,id_cliente
FROM (
  SELECT row_id,id_cliente,email_normalizado,
         row_number() OVER(PARTITION BY email_normalizado ORDER BY row_id) rn
  FROM gmx.clientes
  WHERE email_normalizado IS NOT NULL
) x
WHERE rn=1
ON CONFLICT(tipo,valor_normalizado) DO NOTHING;

INSERT INTO gmx.cliente_identidad_unica(tipo,valor_normalizado,id_cliente)
SELECT 'PHONE',telefono_normalizado,id_cliente
FROM (
  SELECT row_id,id_cliente,telefono_normalizado,
         row_number() OVER(PARTITION BY telefono_normalizado ORDER BY row_id) rn
  FROM gmx.clientes
  WHERE telefono_normalizado IS NOT NULL
) x
WHERE rn=1
ON CONFLICT(tipo,valor_normalizado) DO NOTHING;

-- Registra duplicados históricos sin fusionarlos automáticamente.
INSERT INTO gmx.cliente_identidad_conflictos(tipo,valor_normalizado,id_cliente_canonico,id_cliente_conflicto,detalle)
SELECT 'EMAIL',c.email_normalizado,u.id_cliente,c.id_cliente,'Duplicado histórico detectado al instalar 10.6.2'
FROM gmx.clientes c
JOIN gmx.cliente_identidad_unica u
  ON u.tipo='EMAIL' AND u.valor_normalizado=c.email_normalizado
WHERE c.email_normalizado IS NOT NULL
  AND c.id_cliente<>u.id_cliente
  AND NOT EXISTS(
    SELECT 1 FROM gmx.cliente_identidad_conflictos x
    WHERE x.tipo='EMAIL' AND x.valor_normalizado=c.email_normalizado
      AND x.id_cliente_conflicto=c.id_cliente AND x.resuelto=false
  );

INSERT INTO gmx.cliente_identidad_conflictos(tipo,valor_normalizado,id_cliente_canonico,id_cliente_conflicto,detalle)
SELECT 'PHONE',c.telefono_normalizado,u.id_cliente,c.id_cliente,'Duplicado histórico detectado al instalar 10.6.2'
FROM gmx.clientes c
JOIN gmx.cliente_identidad_unica u
  ON u.tipo='PHONE' AND u.valor_normalizado=c.telefono_normalizado
WHERE c.telefono_normalizado IS NOT NULL
  AND c.id_cliente<>u.id_cliente
  AND NOT EXISTS(
    SELECT 1 FROM gmx.cliente_identidad_conflictos x
    WHERE x.tipo='PHONE' AND x.valor_normalizado=c.telefono_normalizado
      AND x.id_cliente_conflicto=c.id_cliente AND x.resuelto=false
  );

CREATE OR REPLACE FUNCTION gmx.sync_cliente_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_email TEXT;
  owner_phone TEXT;
BEGIN
  NEW.email_normalizado := gmx.normalize_email(NEW.email);
  NEW.telefono_normalizado := gmx.normalize_phone(NEW.telefono);

  IF NEW.email_normalizado IS NOT NULL THEN
    SELECT id_cliente INTO owner_email
    FROM gmx.cliente_identidad_unica
    WHERE tipo='EMAIL' AND valor_normalizado=NEW.email_normalizado;

    IF owner_email IS NOT NULL AND owner_email<>NEW.id_cliente THEN
      RAISE EXCEPTION 'CLIENT_EMAIL_ALREADY_LINKED';
    END IF;
  END IF;

  IF NEW.telefono_normalizado IS NOT NULL THEN
    SELECT id_cliente INTO owner_phone
    FROM gmx.cliente_identidad_unica
    WHERE tipo='PHONE' AND valor_normalizado=NEW.telefono_normalizado;

    IF owner_phone IS NOT NULL AND owner_phone<>NEW.id_cliente THEN
      RAISE EXCEPTION 'CLIENT_PHONE_ALREADY_LINKED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_identity_guard ON gmx.clientes;
CREATE TRIGGER trg_clientes_identity_guard
BEFORE INSERT OR UPDATE OF email,telefono,id_cliente
ON gmx.clientes
FOR EACH ROW
EXECUTE FUNCTION gmx.sync_cliente_identity();

CREATE OR REPLACE FUNCTION gmx.claim_cliente_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_normalizado IS NOT NULL THEN
    INSERT INTO gmx.cliente_identidad_unica(tipo,valor_normalizado,id_cliente,fecha_actualizacion)
    VALUES('EMAIL',NEW.email_normalizado,NEW.id_cliente,NOW())
    ON CONFLICT(tipo,valor_normalizado) DO UPDATE
      SET fecha_actualizacion=NOW()
      WHERE gmx.cliente_identidad_unica.id_cliente=EXCLUDED.id_cliente;
  END IF;

  IF NEW.telefono_normalizado IS NOT NULL THEN
    INSERT INTO gmx.cliente_identidad_unica(tipo,valor_normalizado,id_cliente,fecha_actualizacion)
    VALUES('PHONE',NEW.telefono_normalizado,NEW.id_cliente,NOW())
    ON CONFLICT(tipo,valor_normalizado) DO UPDATE
      SET fecha_actualizacion=NOW()
      WHERE gmx.cliente_identidad_unica.id_cliente=EXCLUDED.id_cliente;
  END IF;

  IF TG_OP='UPDATE' THEN
    IF OLD.email_normalizado IS NOT NULL
       AND OLD.email_normalizado IS DISTINCT FROM NEW.email_normalizado THEN
      DELETE FROM gmx.cliente_identidad_unica
       WHERE tipo='EMAIL' AND valor_normalizado=OLD.email_normalizado AND id_cliente=OLD.id_cliente;
    END IF;

    IF OLD.telefono_normalizado IS NOT NULL
       AND OLD.telefono_normalizado IS DISTINCT FROM NEW.telefono_normalizado THEN
      DELETE FROM gmx.cliente_identidad_unica
       WHERE tipo='PHONE' AND valor_normalizado=OLD.telefono_normalizado AND id_cliente=OLD.id_cliente;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_identity_claim ON gmx.clientes;
CREATE TRIGGER trg_clientes_identity_claim
AFTER INSERT OR UPDATE OF email,telefono,id_cliente
ON gmx.clientes
FOR EACH ROW
EXECUTE FUNCTION gmx.claim_cliente_identity();

CREATE OR REPLACE FUNCTION gmx.release_cliente_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM gmx.cliente_identidad_unica
  WHERE id_cliente=OLD.id_cliente;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_identity_release ON gmx.clientes;
CREATE TRIGGER trg_clientes_identity_release
AFTER DELETE ON gmx.clientes
FOR EACH ROW EXECUTE FUNCTION gmx.release_cliente_identity();

GRANT SELECT,INSERT,UPDATE,DELETE ON
  gmx.cliente_identidad_unica,
  gmx.cliente_identidad_conflictos
TO gmx_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '027','GMX 10.6.2 - unique normalized client identity email phone'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='027');

COMMIT;
