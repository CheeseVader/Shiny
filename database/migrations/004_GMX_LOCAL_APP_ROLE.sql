-- GMX Fase Local 1 React
-- Crear rol local de aplicación con permisos CRUD.
-- Ejecutar como postgres y asignar contraseña después con:
--   \password gmx_app

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'gmx_app'
  ) THEN
    CREATE ROLE gmx_app LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE gmx_db TO gmx_app;
GRANT USAGE ON SCHEMA gmx TO gmx_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA gmx
TO gmx_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA gmx
TO gmx_app;

ALTER DEFAULT PRIVILEGES FOR ROLE gmx_user IN SCHEMA gmx
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gmx_app;

ALTER DEFAULT PRIVILEGES FOR ROLE gmx_user IN SCHEMA gmx
GRANT USAGE, SELECT ON SEQUENCES TO gmx_app;

ALTER ROLE gmx_app IN DATABASE gmx_db
SET search_path TO gmx, public;
