
-- Shiny Fase Local 10.5.5
-- Slideshow media hardening + loyalty business rules
BEGIN;

INSERT INTO shiny.configuracion(parametro,valor)
VALUES
 ('loyalty.earn_percent','1.00'),
 ('loyalty.point_value_mxn','0.10'),
 ('loyalty.earn_rounding','FLOOR'),
 ('loyalty.earn_basis','NET_AFTER_DISCOUNTS'),
 ('loyalty.show_points_on_receipt','true')
ON CONFLICT (parametro) DO NOTHING;

-- Compatibilidad: conservar reglas anteriores mientras el nuevo panel las sustituye.
INSERT INTO shiny.configuracion(parametro,valor)
VALUES
 ('loyalty.max_redemption_percent','30'),
 ('loyalty.min_purchase_to_earn','0'),
 ('loyalty.expiration_months','12'),
 ('loyalty.allow_with_promo','true'),
 ('loyalty.tcg_enabled','true'),
 ('loyalty.product_enabled','true')
ON CONFLICT (parametro) DO NOTHING;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '021','Shiny Fase Local 10.5.5 - slideshow media and configurable loyalty'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='021');

COMMIT;
