-- Shiny Phase 1 - Read-only API role
-- Run as postgres/superuser or role with CREATE ROLE privileges.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiny_api_readonly') THEN
    CREATE ROLE shiny_api_readonly LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE shiny_db TO shiny_api_readonly;
GRANT USAGE ON SCHEMA shiny TO shiny_api_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA shiny TO shiny_api_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE shiny_user IN SCHEMA shiny
GRANT SELECT ON TABLES TO shiny_api_readonly;

-- Set password interactively after running this file:
--   \password shiny_api_readonly
