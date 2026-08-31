BEGIN;

INSERT INTO shiny.configuracion(parametro,valor)
VALUES
  ('finance.fx.banxico_enabled','true'),
  ('finance.fx.tijuana_enabled','true'),
  ('finance.fx.priority','TIJUANA_THEN_BANXICO'),
  ('finance.fx.max_age_days','3'),
  ('finance.fx.block_if_stale','true')
ON CONFLICT(parametro) DO NOTHING;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '050','Shiny 10.6.2.4.1.10.2 - global finance FX configuration'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='050');

COMMIT;
