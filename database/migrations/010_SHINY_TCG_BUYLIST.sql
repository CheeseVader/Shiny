-- Shiny Fase Local 8 - Buylist TCG
BEGIN;

CREATE INDEX IF NOT EXISTS idx_phase8_buylist_id
  ON shiny.tcg_buylist(id_buylist);
CREATE INDEX IF NOT EXISTS idx_phase8_buylist_estado_fecha
  ON shiny.tcg_buylist(estado,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase8_buylist_cliente
  ON shiny.tcg_buylist(id_cliente,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase8_buylist_sucursal
  ON shiny.tcg_buylist(id_sucursal,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase8_buylist_detalle
  ON shiny.tcg_buylist_detalle(id_buylist,linea);
CREATE INDEX IF NOT EXISTS idx_phase8_buylist_pagos
  ON shiny.tcg_buylist_pagos(id_buylist,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase8_buylist_auditoria
  ON shiny.tcg_buylist_auditoria(id_buylist,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_phase8_buylist_reglas
  ON shiny.tcg_buylist_reglas(activa,prioridad);

INSERT INTO shiny.schema_migrations(version,description)
SELECT '010','Shiny Fase Local 8 - Buylist TCG valuacion pago conversion cancelacion'
WHERE NOT EXISTS(SELECT 1 FROM shiny.schema_migrations WHERE version='010');

COMMIT;
