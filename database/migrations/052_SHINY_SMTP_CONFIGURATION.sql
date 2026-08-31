BEGIN;

INSERT INTO shiny.configuracion(parametro,valor)
VALUES
  ('email.smtp.enabled','true'),
  ('email.smtp.provider','CUSTOM'),
  ('email.smtp.host',''),
  ('email.smtp.port','587'),
  ('email.smtp.secure','false'),
  ('email.smtp.user',''),
  ('email.smtp.from_email',''),
  ('email.smtp.from_name','Shiny')
ON CONFLICT(parametro) DO NOTHING;

INSERT INTO shiny.schema_migrations(version,description)
SELECT '052','Shiny 10.6.2.4.1.11.4 - centralized SMTP configuration and test email'
WHERE NOT EXISTS(
  SELECT 1 FROM shiny.schema_migrations WHERE version='052'
);

COMMIT;
