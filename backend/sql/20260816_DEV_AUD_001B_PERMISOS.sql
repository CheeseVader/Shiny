-- =========================================================
-- DEV-AUD-001B
-- Permisos del flujo de Devoluciones / Reembolsos
-- Seguro para re-ejecución
-- =========================================================
BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  shiny.devoluciones,
  shiny.devoluciones_detalle,
  shiny.devoluciones_reembolsos,
  shiny.devoluciones_eventos
TO shiny_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA shiny
TO shiny_app;

COMMIT;

SELECT
    table_name,
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='shiny'
  AND table_name IN (
      'devoluciones',
      'devoluciones_detalle',
      'devoluciones_reembolsos',
      'devoluciones_eventos'
  )
  AND grantee='shiny_app'
ORDER BY table_name,privilege_type;
