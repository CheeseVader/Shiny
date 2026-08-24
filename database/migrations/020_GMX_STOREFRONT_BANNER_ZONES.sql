
-- GMX Fase Local 10.5.4
-- Zonas reales de banners en storefront y preview
BEGIN;

INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('public.home.hero_enabled','true'),
 ('public.home.featured_banner_enabled','true'),
 ('public.home.mid_banner_enabled','true'),
 ('public.home.featured_banner_height_desktop','270'),
 ('public.home.featured_banner_height_tablet','230'),
 ('public.home.featured_banner_height_mobile','180'),
 ('public.home.mid_banner_height_desktop','240'),
 ('public.home.mid_banner_height_tablet','210'),
 ('public.home.mid_banner_height_mobile','170'),
 ('public.home.content_max_width','1440'),
 ('public.home.banner_gap','18')
ON CONFLICT(parametro) DO NOTHING;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '020','GMX Fase Local 10.5.4 - storefront banner zones and live preview'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='020');

COMMIT;
