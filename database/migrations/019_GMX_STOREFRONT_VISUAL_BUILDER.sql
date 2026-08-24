
-- GMX Fase Local 10.5.3
-- Storefront Visual Builder: URL media, carrusel, promo bar, hero responsive
BEGIN;

ALTER TABLE gmx.cms_banners
  ADD COLUMN IF NOT EXISTS media_source TEXT NOT NULL DEFAULT 'LIBRARY',
  ADD COLUMN IF NOT EXISTS url_desktop TEXT,
  ADD COLUMN IF NOT EXISTS url_mobile TEXT,
  ADD COLUMN IF NOT EXISTS object_fit TEXT NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS object_position TEXT NOT NULL DEFAULT 'center center',
  ADD COLUMN IF NOT EXISTS altura_desktop BIGINT,
  ADD COLUMN IF NOT EXISTS altura_tablet BIGINT,
  ADD COLUMN IF NOT EXISTS altura_mobile BIGINT,
  ADD COLUMN IF NOT EXISTS mostrar_flechas BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mostrar_indicadores BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS autoplay BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS intervalo_segundos BIGINT NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS pausa_hover BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS transicion TEXT NOT NULL DEFAULT 'FADE';

INSERT INTO gmx.configuracion(parametro,valor)
VALUES
 ('public.carousel.autoplay','true'),
 ('public.carousel.interval_seconds','6'),
 ('public.carousel.show_arrows','true'),
 ('public.carousel.show_dots','true'),
 ('public.carousel.pause_hover','true'),
 ('public.carousel.transition','FADE'),
 ('public.promo_bar.enabled','true'),
 ('public.promo_bar.autoplay','true'),
 ('public.promo_bar.interval_seconds','5'),
 ('public.promo_bar.dismissible','false'),
 ('public.promo_bar.background','#f59e0b'),
 ('public.promo_bar.text_color','#111827'),
 ('public.hero.preset','NORMAL'),
 ('public.hero.height_desktop','430'),
 ('public.hero.height_tablet','360'),
 ('public.hero.height_mobile','320'),
 ('public.hero.content_max_width','680'),
 ('public.hero.content_padding','48'),
 ('public.home.preview_sections','categories,featured,tcg,promo')
ON CONFLICT(parametro) DO NOTHING;

CREATE TABLE IF NOT EXISTS gmx.appearance_revisions (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_revision TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_json JSONB NOT NULL,
  comentario TEXT,
  id_admin TEXT,
  administrador TEXT
);

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE gmx.appearance_revisions TO gmx_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA gmx TO gmx_app;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '019','GMX Fase Local 10.5.3 - storefront visual builder'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='019');

COMMIT;
