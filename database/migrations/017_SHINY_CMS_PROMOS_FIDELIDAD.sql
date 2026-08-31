
-- Shiny Fase Local 10.5.1
-- CMS Visual + promociones transaccionales + fidelidad
BEGIN;

CREATE TABLE IF NOT EXISTS shiny.cms_banners (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_banner TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  zona TEXT NOT NULL DEFAULT 'HOME_HERO',
  tipo TEXT NOT NULL DEFAULT 'CAMPAIGN',
  titulo TEXT,
  subtitulo TEXT,
  texto_cta TEXT,
  ruta_cta TEXT,
  id_media_desktop TEXT,
  id_media_mobile TEXT,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  prioridad BIGINT NOT NULL DEFAULT 100,
  exclusivo BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  publicado BOOLEAN NOT NULL DEFAULT false,
  overlay_opacity NUMERIC(8,4) NOT NULL DEFAULT 0.20,
  text_align TEXT NOT NULL DEFAULT 'LEFT',
  notas TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cms_banners_runtime
  ON shiny.cms_banners(zona,publicado,activo,fecha_inicio,fecha_fin,prioridad);

CREATE TABLE IF NOT EXISTS shiny.promociones_redenciones (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_redencion TEXT NOT NULL UNIQUE,
  id_promocion TEXT NOT NULL,
  codigo TEXT,
  id_pedido TEXT NOT NULL,
  id_cliente TEXT,
  canal TEXT NOT NULL,
  subtotal NUMERIC(18,4) NOT NULL DEFAULT 0,
  descuento NUMERIC(18,4) NOT NULL DEFAULT 0,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estado TEXT NOT NULL DEFAULT 'APLICADA',
  fecha_reversion TIMESTAMPTZ,
  motivo_reversion TEXT,
  UNIQUE(id_promocion,id_pedido)
);

CREATE INDEX IF NOT EXISTS idx_promociones_redenciones_promo
  ON shiny.promociones_redenciones(id_promocion,estado,fecha);
CREATE INDEX IF NOT EXISTS idx_promociones_redenciones_pedido
  ON shiny.promociones_redenciones(id_pedido,estado);

CREATE TABLE IF NOT EXISTS shiny.fidelidad_cuentas (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cliente TEXT NOT NULL UNIQUE,
  puntos_disponibles BIGINT NOT NULL DEFAULT 0,
  puntos_generados BIGINT NOT NULL DEFAULT 0,
  puntos_redimidos BIGINT NOT NULL DEFAULT 0,
  puntos_expirados BIGINT NOT NULL DEFAULT 0,
  nivel TEXT NOT NULL DEFAULT 'BASE',
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shiny.fidelidad_movimientos (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_movimiento TEXT NOT NULL UNIQUE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  id_cliente TEXT NOT NULL,
  tipo TEXT NOT NULL,
  puntos BIGINT NOT NULL,
  saldo_anterior BIGINT NOT NULL,
  saldo_nuevo BIGINT NOT NULL,
  id_pedido TEXT,
  referencia TEXT,
  fecha_expiracion TIMESTAMPTZ,
  motivo TEXT,
  id_admin TEXT,
  administrador TEXT,
  reversa_de TEXT
);

CREATE INDEX IF NOT EXISTS idx_fidelidad_mov_cliente
  ON shiny.fidelidad_movimientos(id_cliente,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_fidelidad_mov_pedido
  ON shiny.fidelidad_movimientos(id_pedido,tipo);

ALTER TABLE shiny.promociones
  ADD COLUMN IF NOT EXISTS canales TEXT,
  ADD COLUMN IF NOT EXISTS id_sucursal TEXT,
  ADD COLUMN IF NOT EXISTS target_json JSONB,
  ADD COLUMN IF NOT EXISTS acumulable_puntos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS acumulable_otras BOOLEAN DEFAULT false;

ALTER TABLE shiny.pedidos
  ADD COLUMN IF NOT EXISTS id_promocion TEXT,
  ADD COLUMN IF NOT EXISTS codigo_promocional TEXT,
  ADD COLUMN IF NOT EXISTS descuento_promocion NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS puntos_redimidos BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_puntos NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS puntos_generados BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_antes_beneficios NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS beneficios_revertidos BOOLEAN DEFAULT false;

INSERT INTO shiny.configuracion(parametro,valor)
VALUES
 ('appearance.background_media_id',''),
 ('appearance.background_opacity','0.18'),
 ('appearance.background_overlay','0.30'),
 ('appearance.background_blur','0'),
 ('appearance.background_position','center center'),
 ('appearance.background_size','cover'),
 ('appearance.background_fixed','true'),
 ('appearance.panel_opacity','0.90'),
 ('loyalty.enabled','true'),
 ('loyalty.points_per_mxn','0.10'),
 ('loyalty.mxn_per_point','0.10'),
 ('loyalty.max_redemption_percent','30'),
 ('loyalty.min_purchase_to_earn','0'),
 ('loyalty.expiration_months','12'),
 ('loyalty.allow_with_promo','true'),
 ('loyalty.tcg_enabled','true'),
 ('loyalty.product_enabled','true')
ON CONFLICT (parametro) DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  shiny.cms_banners,
  shiny.promociones_redenciones,
  shiny.fidelidad_cuentas,
  shiny.fidelidad_movimientos
TO shiny_app;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA shiny TO shiny_app;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '017','Shiny Fase Local 10.5.1 - CMS banners promociones POS fidelidad'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='017');

COMMIT;
