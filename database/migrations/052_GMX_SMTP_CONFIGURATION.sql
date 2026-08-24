BEGIN;

INSERT INTO gmx.configuracion(parametro,valor)
VALUES
  ('email.smtp.enabled','true'),
  ('email.smtp.provider','CUSTOM'),
  ('email.smtp.host',''),
  ('email.smtp.port','587'),
  ('email.smtp.secure','false'),
  ('email.smtp.user',''),
  ('email.smtp.from_email',''),
  ('email.smtp.from_name','GMX')
ON CONFLICT(parametro) DO NOTHING;

INSERT INTO gmx.schema_migrations(version,description)
SELECT '052','GMX 10.6.2.4.1.11.4 - centralized SMTP configuration and test email'
WHERE NOT EXISTS(
  SELECT 1 FROM gmx.schema_migrations WHERE version='052'
);

COMMIT;
