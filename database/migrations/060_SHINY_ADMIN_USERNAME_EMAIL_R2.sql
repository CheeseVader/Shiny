-- SHINY SUPERADMIN EMAIL R2
BEGIN;

ALTER TABLE shiny.administradores
  ADD COLUMN IF NOT EXISTS username VARCHAR(32);

UPDATE shiny.administradores
SET username = LOWER(SPLIT_PART(email,'@',1))
WHERE username IS NULL OR BTRIM(username)='';

DO $$
DECLARE r RECORD;
DECLARE candidate TEXT;
DECLARE n INTEGER;
BEGIN
  FOR r IN
    SELECT row_id, username
    FROM shiny.administradores
    ORDER BY row_id
  LOOP
    candidate := LOWER(BTRIM(r.username));
    IF candidate IS NULL OR candidate='' OR candidate !~ '^[a-z0-9._-]{3,32}$' THEN
      candidate := 'user' || r.row_id::text;
    END IF;

    n := 0;
    WHILE EXISTS (
      SELECT 1 FROM shiny.administradores a
      WHERE a.row_id<>r.row_id AND LOWER(a.username)=LOWER(candidate)
    ) LOOP
      n := n + 1;
      candidate := LEFT(REGEXP_REPLACE(LOWER(BTRIM(r.username)),'[^a-z0-9._-]','','g'), 24)
                   || '-' || r.row_id::text || CASE WHEN n>1 THEN '-'||n::text ELSE '' END;
    END LOOP;

    UPDATE shiny.administradores SET username=candidate WHERE row_id=r.row_id;
  END LOOP;
END $$;

ALTER TABLE shiny.administradores
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_administradores_username_lower
  ON shiny.administradores(LOWER(username));

INSERT INTO shiny.schema_migrations(version,description,applied_at)
SELECT '060','Shiny - usuario y correo administrativo independientes',NOW()
WHERE NOT EXISTS (SELECT 1 FROM shiny.schema_migrations WHERE version='060');

COMMIT;
