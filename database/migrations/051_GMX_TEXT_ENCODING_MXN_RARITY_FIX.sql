BEGIN;

-- GMX 10.6.2.4.1.10.2.2.1
-- Version segura para Windows/psql.
-- Este archivo contiene solamente ASCII y construye caracteres Unicode
-- mediante U&'...' para evitar errores de conversion WIN1252 -> UTF8.

UPDATE gmx.configuracion
SET valor =
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(
  REPLACE(valor,
    U&'\00C3\00A1', U&'\00E1'),
    U&'\00C3\00A9', U&'\00E9'),
    U&'\00C3\00AD', U&'\00ED'),
    U&'\00C3\00B3', U&'\00F3'),
    U&'\00C3\00BA', U&'\00FA'),
    U&'\00C3\00B1', U&'\00F1'),
    U&'\00C3\0081', U&'\00C1'),
    U&'\00C3\0089', U&'\00C9'),
    U&'\00C3\008D', U&'\00CD'),
    U&'\00C3\0093', U&'\00D3'),
    U&'\00C3\009A', U&'\00DA'),
    U&'\00C3\0091', U&'\00D1'),
    U&'\00C2\00BF', U&'\00BF'),
    U&'\00C2\00A1', U&'\00A1'),
    U&'\00E2\20AC\201C', U&'\2013'),
    U&'\00E2\20AC\201D', U&'\2014'),
    U&'\00EF\00BB\00BF', '')
WHERE valor LIKE '%' || U&'\00C3' || '%'
   OR valor LIKE '%' || U&'\00C2' || '%'
   OR valor LIKE '%' || U&'\00E2' || '%'
   OR valor LIKE '%' || U&'\00EF\00BB\00BF' || '%';

-- Corrige de forma explicita la instruccion observada en Configuracion.
INSERT INTO gmx.configuracion(parametro,valor)
VALUES(
  'public.payment.transfer.instructions',
  U&'Usa tu n\00FAmero de comprobante como referencia.'
)
ON CONFLICT(parametro) DO UPDATE
SET valor =
  CASE
    WHEN gmx.configuracion.valor IS NULL
      OR gmx.configuracion.valor = ''
      OR gmx.configuracion.valor LIKE '%' || U&'n\00C3\00BAmero' || '%'
    THEN EXCLUDED.valor
    ELSE gmx.configuracion.valor
  END;

INSERT INTO gmx.schema_migrations(version,description)
SELECT
  '051',
  'GMX 10.6.2.4.1.10.2.2 - text encoding, MXN labels and TCG rarity display'
WHERE NOT EXISTS(
  SELECT 1
  FROM gmx.schema_migrations
  WHERE version='051'
);

COMMIT;
