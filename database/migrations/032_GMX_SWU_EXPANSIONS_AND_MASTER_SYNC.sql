
BEGIN;

INSERT INTO gmx.tcg_master_sets(
  id_juego,codigo,nombre,fecha_lanzamiento,total_cartas,activo,fuente_oficial
)
VALUES
 ('SWU','SOR','Spark of Rebellion','2024-03-08',0,true,'https://starwarsunlimited.com/products/set-1-spark-of-rebellion'),
 ('SWU','SHD','Shadows of the Galaxy','2024-07-12',0,true,'https://starwarsunlimited.com/products/set-2-shadows-of-the-galaxy'),
 ('SWU','TWI','Twilight of the Republic','2024-11-08',0,true,'https://starwarsunlimited.com/products/set-3-twilight-of-the-republic'),
 ('SWU','JTL','Jump to Lightspeed','2025-03-14',0,true,'https://starwarsunlimited.com/products/set-4-jump-to-lightspeed'),
 ('SWU','LOF','Legends of the Force','2025-07-11',0,true,'https://starwarsunlimited.com/products/set-5-legends-of-the-force'),
 ('SWU','SEC','Secrets of Power','2025-11-07',0,true,'https://starwarsunlimited.com/products/set-6-secrets-of-power'),
 ('SWU','LAW','A Lawless Time','2026-03-13',0,true,'https://starwarsunlimited.com/products/set-7-a-lawless-time'),
 ('SWU','ASH','Ashes of the Empire','2026-07-17',0,true,'https://starwarsunlimited.com/products/set-8-ashes-of-the-empire')
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,
 fecha_lanzamiento=EXCLUDED.fecha_lanzamiento,
 activo=true,
 fuente_oficial=EXCLUDED.fuente_oficial,
 fecha_actualizacion=NOW();

INSERT INTO gmx.tcg_master_rarezas(id_juego,codigo,nombre,activo,orden)
VALUES
 ('SWU','C','Common',true,10),
 ('SWU','U','Uncommon',true,20),
 ('SWU','R','Rare',true,30),
 ('SWU','L','Legendary',true,40)
ON CONFLICT(id_juego,codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre,
 activo=true,
 orden=EXCLUDED.orden,
 fecha_actualizacion=NOW();

INSERT INTO gmx.schema_migrations(version,description)
SELECT '032','GMX 10.6.2.2 - SWU official expansions and master catalog synchronization UI'
WHERE NOT EXISTS(
  SELECT 1 FROM gmx.schema_migrations WHERE version='032'
);

COMMIT;
