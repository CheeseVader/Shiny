-- GMX Phase 1 - Read-only API role
-- Run as postgres/superuser or role with CREATE ROLE privileges.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gmx_api_readonly') THEN
    CREATE ROLE gmx_api_readonly LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE gmx_db TO gmx_api_readonly;
GRANT USAGE ON SCHEMA gmx TO gmx_api_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA gmx TO gmx_api_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE gmx_user IN SCHEMA gmx
GRANT SELECT ON TABLES TO gmx_api_readonly;

-- Set password interactively after running this file:
--   \password gmx_api_readonly
