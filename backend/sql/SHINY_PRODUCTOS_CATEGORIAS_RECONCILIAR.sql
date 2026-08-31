-- Shiny PRODUCTOS AUD-005
-- Categorías controladas: reconciliación NO destructiva.
-- Inserta en shiny.categorias únicamente las categorías que ya están usadas
-- por productos y que todavía no existen en el catálogo.
--
-- Puede ejecutarse una vez antes de reiniciar Shiny.
-- No modifica shiny.productos y no elimina categorías.

BEGIN;

INSERT INTO shiny.categorias(id,nombre,estado)
SELECT
  'CAT-' || UPPER(SUBSTRING(MD5(LOWER(TRIM(src.categoria))) FROM 1 FOR 12)),
  TRIM(src.categoria),
  'Activo'
FROM (
  SELECT DISTINCT categoria
  FROM shiny.productos
  WHERE NULLIF(TRIM(COALESCE(categoria,'')),'') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM shiny.categorias c
  WHERE LOWER(TRIM(COALESCE(c.nombre,'')))=LOWER(TRIM(src.categoria))
);

COMMIT;

-- Verificación:
SELECT id,nombre,estado
FROM shiny.categorias
ORDER BY nombre;
