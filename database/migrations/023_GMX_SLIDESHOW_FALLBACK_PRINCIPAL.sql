
BEGIN;

ALTER TABLE gmx.cms_banners
  ADD COLUMN IF NOT EXISTS fallback_principal BOOLEAN NOT NULL DEFAULT false;

-- Seleccionar automáticamente como fallback el MAIN de mayor prioridad por zona,
-- solo cuando aún no exista uno explícito.
WITH ranked AS (
  SELECT row_id,zona,
         ROW_NUMBER() OVER (PARTITION BY zona ORDER BY prioridad,row_id) AS rn
  FROM gmx.cms_banners
  WHERE tipo='MAIN' AND activo=true
),
chosen AS (
  SELECT row_id,zona FROM ranked WHERE rn=1
)
UPDATE gmx.cms_banners b
SET fallback_principal=true,
    permanente=true,
    fecha_inicio=NULL,
    fecha_fin=NULL
FROM chosen c
WHERE b.row_id=c.row_id
  AND NOT EXISTS (
    SELECT 1 FROM gmx.cms_banners x
    WHERE x.zona=b.zona AND x.fallback_principal=true
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_cms_banner_fallback_por_zona
  ON gmx.cms_banners(zona)
  WHERE fallback_principal=true;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '023','GMX Fase Local 10.5.8 - slideshow fallback principal por zona'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='023');

COMMIT;
