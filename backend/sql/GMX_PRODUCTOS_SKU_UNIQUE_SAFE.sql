-- GMX PRODUCTOS AUDIT HOTFIX V1
-- 1) Ejecutar primero. NO borra ni fusiona registros.
-- 2) Si la consulta de duplicados devuelve filas, corregirlas antes de crear el índice UNIQUE.

SELECT
  UPPER(TRIM(sku)) AS sku_normalizado,
  COUNT(*) AS total,
  ARRAY_AGG(row_id ORDER BY row_id) AS row_ids,
  ARRAY_AGG(COALESCE(id,'') ORDER BY row_id) AS ids,
  ARRAY_AGG(COALESCE(nombre,'') ORDER BY row_id) AS nombres
FROM gmx.productos
WHERE NULLIF(TRIM(COALESCE(sku,'')),'') IS NOT NULL
GROUP BY UPPER(TRIM(sku))
HAVING COUNT(*) > 1
ORDER BY sku_normalizado;

-- Ejecutar ESTE bloque solamente después de que la consulta anterior devuelva 0 filas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM gmx.productos
    WHERE NULLIF(TRIM(COALESCE(sku,'')),'') IS NOT NULL
    GROUP BY UPPER(TRIM(sku))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'GMX_PRODUCT_SKU_DUPLICATES_EXIST: resuelve los SKU duplicados antes de crear el índice.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='gmx'
      AND indexname='ux_productos_sku_normalizado'
  ) THEN
    CREATE UNIQUE INDEX ux_productos_sku_normalizado
      ON gmx.productos (UPPER(TRIM(sku)))
      WHERE NULLIF(TRIM(COALESCE(sku,'')),'') IS NOT NULL;
  END IF;
END $$;
