-- =========================================================
-- DEV-AUD-001B
-- Permisos del flujo de Devoluciones / Reembolsos
-- Seguro para re-ejecución
-- =========================================================
BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  gmx.devoluciones,
  gmx.devoluciones_detalle,
  gmx.devoluciones_reembolsos,
  gmx.devoluciones_eventos
TO gmx_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA gmx
TO gmx_app;

COMMIT;

SELECT
    table_name,
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='gmx'
  AND table_name IN (
      'devoluciones',
      'devoluciones_detalle',
      'devoluciones_reembolsos',
      'devoluciones_eventos'
  )
  AND grantee='gmx_app'
ORDER BY table_name,privilege_type;
