-- Shiny Fase Local 1 React
-- Crear rol local de aplicación con permisos CRUD.
-- Ejecutar como postgres y asignar contraseña después con:
--   \password shiny_app

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'shiny_app'
  ) THEN
    CREATE ROLE shiny_app LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE shiny_db TO shiny_app;
GRANT USAGE ON SCHEMA shiny TO shiny_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA shiny
TO shiny_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA shiny
TO shiny_app;

ALTER DEFAULT PRIVILEGES FOR ROLE shiny_user IN SCHEMA shiny
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shiny_app;

ALTER DEFAULT PRIVILEGES FOR ROLE shiny_user IN SCHEMA shiny
GRANT USAGE, SELECT ON SEQUENCES TO shiny_app;

ALTER ROLE shiny_app IN DATABASE shiny_db
SET search_path TO shiny, public;
