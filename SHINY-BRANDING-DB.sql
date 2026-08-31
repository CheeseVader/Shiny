-- ============================================================
-- Branding DB para Shiny
-- IMPORTANTE:
-- Ejecutar SOLO contra la base independiente: shiny_db
-- Mantiene el schema tecnico shiny por compatibilidad.
-- ============================================================

BEGIN;

UPDATE shiny.configuracion SET valor='Shiny'
WHERE parametro IN (
  'appearance.brand_name',
  'public.appearance.brand_name',
  'admin.appearance.brand_name'
);

INSERT INTO shiny.configuracion(parametro,valor)
SELECT 'appearance.brand_name','Shiny'
WHERE NOT EXISTS (
  SELECT 1 FROM shiny.configuracion WHERE parametro='appearance.brand_name'
);

INSERT INTO shiny.configuracion(parametro,valor)
SELECT 'public.appearance.brand_name','Shiny'
WHERE NOT EXISTS (
  SELECT 1 FROM shiny.configuracion WHERE parametro='public.appearance.brand_name'
);

INSERT INTO shiny.configuracion(parametro,valor)
SELECT 'admin.appearance.brand_name','Shiny'
WHERE NOT EXISTS (
  SELECT 1 FROM shiny.configuracion WHERE parametro='admin.appearance.brand_name'
);

UPDATE shiny.configuracion
SET valor='Shiny'
WHERE parametro='email.smtp.from_name'
  AND (valor IS NULL OR TRIM(valor)='' OR LOWER(valor) LIKE '%shiny%');

COMMIT;