BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_administradores_email_ci
ON shiny.administradores(LOWER(email))
WHERE email IS NOT NULL
  AND TRIM(email) <> '';

COMMIT;

SELECT indexname,indexdef
FROM pg_indexes
WHERE schemaname='shiny'
  AND tablename='administradores'
  AND indexname='uq_administradores_email_ci';