
-- GMX Fase Local 10.5.2
-- Separación visual ADMIN / CLIENTE + templates storefront
BEGIN;

-- Mantener el tema actual como base administrativa.
INSERT INTO gmx.configuracion(parametro,valor)
SELECT 'admin.' || parametro, valor
FROM gmx.configuracion
WHERE parametro LIKE 'appearance.%'
ON CONFLICT(parametro) DO NOTHING;

-- Tema público independiente.
INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('public.appearance.template','TCG_ARENA'),
 ('public.appearance.brand_name','GMX'),
 ('public.appearance.logo_text','G'),
 ('public.appearance.primary','#111827'),
 ('public.appearance.secondary','#f59e0b'),
 ('public.appearance.accent','#8b5cf6'),
 ('public.appearance.surface','#111827'),
 ('public.appearance.background','#090e1a'),
 ('public.appearance.text','#f8fafc'),
 ('public.appearance.muted','#94a3b8'),
 ('public.appearance.radius','18'),
 ('public.appearance.header_style','floating'),
 ('public.appearance.card_style','glass'),
 ('public.appearance.background_media_id',''),
 ('public.appearance.background_opacity','0.28'),
 ('public.appearance.background_overlay','0.38'),
 ('public.appearance.background_blur','0'),
 ('public.appearance.panel_opacity','0.88'),
 ('public.appearance.hero_height','520'),
 ('public.appearance.hero_content_width','720'),
 ('public.appearance.show_promo_strip','true'),
 ('public.appearance.show_categories','true'),
 ('public.appearance.show_featured','true'),
 ('public.appearance.show_tcg_shortcut','true')
ON CONFLICT(parametro) DO NOTHING;

INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('admin.appearance.template','GMX_ADMIN'),
 ('admin.appearance.brand_name','GMX'),
 ('admin.appearance.logo_text','G')
ON CONFLICT(parametro) DO NOTHING;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '018','GMX Fase Local 10.5.2 - dual theme and TCG storefront templates'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='018');

COMMIT;
