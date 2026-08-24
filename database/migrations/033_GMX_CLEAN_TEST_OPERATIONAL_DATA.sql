
BEGIN;

CREATE TABLE IF NOT EXISTS gmx.test_data_cleanup_audit (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cleanup_version TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_by TEXT NOT NULL DEFAULT CURRENT_USER,
  counts_before JSONB NOT NULL,
  note TEXT
);

INSERT INTO gmx.test_data_cleanup_audit(cleanup_version,counts_before,note)
SELECT '033',
  jsonb_build_object(
    'productos',(SELECT COUNT(*) FROM gmx.productos),
    'tcg_cartas',(SELECT COUNT(*) FROM gmx.tcg_cartas),
    'tcg_inventario',(SELECT COUNT(*) FROM gmx.tcg_inventario),
    'tcg_inventario_sucursales',(SELECT COUNT(*) FROM gmx.tcg_inventario_sucursales),
    'tcg_adquisiciones',(SELECT COUNT(*) FROM gmx.tcg_adquisiciones),
    'tcg_buylist',(SELECT COUNT(*) FROM gmx.tcg_buylist),
    'tcg_buylist_detalle',(SELECT COUNT(*) FROM gmx.tcg_buylist_detalle),
    'tcg_movimientos_sucursales',(SELECT COUNT(*) FROM gmx.tcg_movimientos_sucursales),
    'tcg_escaneos',(SELECT COUNT(*) FROM gmx.tcg_escaneos),
    'tcg_conteos',(SELECT COUNT(*) FROM gmx.tcg_conteos),
    'tcg_conteo_detalle',(SELECT COUNT(*) FROM gmx.tcg_conteo_detalle),
    'inventario_sucursales',(SELECT COUNT(*) FROM gmx.inventario_sucursales)
  ),
  'Limpieza explícita solicitada por el usuario: datos operativos de prueba. Catálogo maestro, usuarios, clientes, configuración y sucursales se conservan.';

-- TCG operational TEST data: dependency-safe order.
-- Buylist rules are CONFIGURATION and are intentionally preserved.
DELETE FROM gmx.tcg_buylist_auditoria;
DELETE FROM gmx.tcg_buylist_pagos;
DELETE FROM gmx.tcg_buylist_detalle;
DELETE FROM gmx.tcg_buylist;

DELETE FROM gmx.tcg_conteo_detalle;
DELETE FROM gmx.tcg_conteos;
DELETE FROM gmx.tcg_escaneos;
DELETE FROM gmx.tcg_movimientos_sucursales;
DELETE FROM gmx.tcg_adquisiciones;
DELETE FROM gmx.tcg_inventario_sucursales;
DELETE FROM gmx.tcg_inventario;
DELETE FROM gmx.tcg_cartas;

-- General product TEST inventory.
DELETE FROM gmx.inventario_transferencias_detalle;
DELETE FROM gmx.inventario_transferencias;
DELETE FROM gmx.inventario_sucursales;
DELETE FROM gmx.productos;

-- Import logs are development/test operational history.
DELETE FROM gmx.importaciones;

-- IMPORTANT:
-- tcg_juegos / tcg_sets / tcg_rarezas are NOT deleted.
-- tcg_master_* is NOT deleted.
-- users / clients / config / branches are NOT deleted.

INSERT INTO gmx.schema_migrations(version,description)
SELECT '033','GMX 10.6.2.3 - explicit cleanup of test product and TCG operational data'
WHERE NOT EXISTS(SELECT 1 FROM gmx.schema_migrations WHERE version='033');

COMMIT;
