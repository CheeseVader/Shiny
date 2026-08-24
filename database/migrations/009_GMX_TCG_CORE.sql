-- GMX Fase Local 7 - Núcleo TCG
BEGIN;

CREATE INDEX IF NOT EXISTS idx_phase7_tcg_juegos_id
  ON gmx.tcg_juegos(id_juego) WHERE id_juego IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phase7_tcg_sets_id
  ON gmx.tcg_sets(id_set) WHERE id_set IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phase7_tcg_rarezas_id
  ON gmx.tcg_rarezas(id_rareza) WHERE id_rareza IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phase7_tcg_cartas_id
  ON gmx.tcg_cartas(id_carta) WHERE id_carta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phase7_tcg_inventario_id
  ON gmx.tcg_inventario(id_inventario) WHERE id_inventario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phase7_tcg_inv_sucursal_registro
  ON gmx.tcg_inventario_sucursales(id_registro) WHERE id_registro IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tcg_cartas_juego_set
  ON gmx.tcg_cartas(id_juego,id_set,nombre);
CREATE INDEX IF NOT EXISTS idx_tcg_inv_carta_variant
  ON gmx.tcg_inventario(id_carta,idioma,condicion,acabado,edicion);
CREATE INDEX IF NOT EXISTS idx_tcg_inv_sucursal_lookup
  ON gmx.tcg_inventario_sucursales(id_sucursal,id_inventario);
CREATE INDEX IF NOT EXISTS idx_tcg_adquisiciones_fecha
  ON gmx.tcg_adquisiciones(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_tcg_adquisiciones_carta
  ON gmx.tcg_adquisiciones(id_carta,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_tcg_movimientos_fecha
  ON gmx.tcg_movimientos_sucursales(fecha DESC);

INSERT INTO gmx.schema_migrations(version,description)
SELECT '009','GMX Fase Local 7 - nucleo TCG catalogos inventario adquisiciones'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='009');

COMMIT;
