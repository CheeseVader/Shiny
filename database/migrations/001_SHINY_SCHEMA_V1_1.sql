-- SHINY_SCHEMA_V1_1.sql
-- PostgreSQL 18 / Shiny
-- Corrección de V1: normalización robusta de encabezados ID* y validación de índices.
-- La ejecución fallida de V1 terminó en ROLLBACK; este archivo puede ejecutarse directamente.
BEGIN;

CREATE SCHEMA IF NOT EXISTS shiny;
SET search_path TO shiny, public;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS migration_import_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_name TEXT NOT NULL,
  target_table TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  rows_read BIGINT DEFAULT 0,
  rows_inserted BIGINT DEFAULT 0,
  rows_updated BIGINT DEFAULT 0,
  rows_rejected BIGINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'STARTED',
  details JSONB
);


-- Fuente: Productos
CREATE TABLE IF NOT EXISTS productos (
  id TEXT,
  sku TEXT,
  nombre TEXT,
  descripcion TEXT,
  precio NUMERIC(18,4),
  costo NUMERIC(18,4),
  stock BIGINT,
  stock_minimo BIGINT,
  categoria TEXT,
  imagen TEXT,
  estado TEXT,
  fecha_creacion TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_productos PRIMARY KEY (id)
);


-- Fuente: PermisosAdmin
CREATE TABLE IF NOT EXISTS permisos_admin (
  email TEXT,
  modulo TEXT,
  leer BOOLEAN,
  crear BOOLEAN,
  editar BOOLEAN,
  eliminar BOOLEAN,
  autorizar BOOLEAN,
  actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_permisos_admin PRIMARY KEY (email, modulo)
);


-- Fuente: CuentasPorPagar
CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
  id TEXT,
  fecha TIMESTAMPTZ,
  proveedor TEXT,
  documento TEXT,
  vencimiento TEXT,
  total NUMERIC(18,4),
  pagado NUMERIC(18,4),
  saldo NUMERIC(18,4),
  estado TEXT,
  sucursal TEXT,
  notas TEXT,
  actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_cuentas_por_pagar PRIMARY KEY (id)
);


-- Fuente: Devoluciones
CREATE TABLE IF NOT EXISTS devoluciones (
  id TEXT,
  fecha TIMESTAMPTZ,
  tipo TEXT,
  referencia TEXT,
  cliente_proveedor TEXT,
  motivo TEXT,
  importe NUMERIC(18,4),
  resolucion TEXT,
  estado TEXT,
  reintegra_stock BOOLEAN,
  notas TEXT,
  actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_devoluciones PRIMARY KEY (id)
);


-- Fuente: CotizacionesAdmin
CREATE TABLE IF NOT EXISTS cotizaciones_admin (
  id TEXT,
  fecha TIMESTAMPTZ,
  cliente TEXT,
  email TEXT,
  telefono TEXT,
  validez_dias BIGINT,
  subtotal NUMERIC(18,4),
  descuento NUMERIC(18,4),
  total NUMERIC(18,4),
  estado TEXT,
  items_json JSONB,
  notas TEXT,
  actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_cotizaciones_admin PRIMARY KEY (id)
);


-- Fuente: SHINY_Idempotencia
CREATE TABLE IF NOT EXISTS shiny_idempotencia (
  operation_id TEXT,
  funcion TEXT,
  estado TEXT,
  fecha_creacion TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ,
  resultado_json JSONB,
  error TEXT,
  intentos BIGINT,
  CONSTRAINT pk_shiny_idempotencia PRIMARY KEY (operation_id)
);


-- Fuente: Promociones
CREATE TABLE IF NOT EXISTS promociones (
  id TEXT,
  nombre TEXT,
  tipo TEXT,
  valor NUMERIC(18,4),
  codigo TEXT,
  inicio TEXT,
  fin TEXT,
  ambito TEXT,
  estado TEXT,
  minimo_compra BIGINT,
  limite_usos BIGINT,
  usos BIGINT,
  notas TEXT,
  actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_promociones PRIMARY KEY (id)
);


-- Fuente: NotificacionesAdmin
CREATE TABLE IF NOT EXISTS notificaciones_admin (
  id TEXT,
  fecha TIMESTAMPTZ,
  tipo TEXT,
  titulo TEXT,
  mensaje TEXT,
  modulo TEXT,
  prioridad BIGINT,
  leida BOOLEAN,
  actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_notificaciones_admin PRIMARY KEY (id)
);


-- Fuente: Multimedia
CREATE TABLE IF NOT EXISTS multimedia (
  id_media TEXT,
  nombre TEXT,
  nombre_archivo TEXT,
  tipo TEXT,
  mime_type TEXT,
  categoria TEXT,
  proveedor TEXT,
  ruta TEXT,
  file_id TEXT,
  url TEXT,
  url_drive TEXT,
  tamano_bytes BIGINT,
  hash TEXT,
  activo BOOLEAN,
  fecha TIMESTAMPTZ,
  actualizacion TIMESTAMPTZ,
  admin TEXT,
  CONSTRAINT pk_multimedia PRIMARY KEY (id_media)
);


-- Fuente: Gastos
CREATE TABLE IF NOT EXISTS gastos (
  id_gasto TEXT,
  fecha_creacion TIMESTAMPTZ,
  fecha_gasto TIMESTAMPTZ,
  id_sucursal TEXT,
  sucursal TEXT,
  categoria TEXT,
  subcategoria TEXT,
  concepto TEXT,
  id_proveedor TEXT,
  proveedor TEXT,
  moneda TEXT,
  subtotal NUMERIC(18,4),
  impuestos NUMERIC(18,4),
  total NUMERIC(18,4),
  metodo_pago TEXT,
  referencia TEXT,
  comprobante_url BIGINT,
  estado TEXT,
  fecha_confirmacion TIMESTAMPTZ,
  fecha_pago TIMESTAMPTZ,
  fecha_cancelacion TIMESTAMPTZ,
  motivo_cancelacion TEXT,
  caja_registrada BOOLEAN,
  id_movimiento_caja TEXT,
  caja_reversada BOOLEAN,
  id_movimiento_caja_reverso TEXT,
  id_admin_creador TEXT,
  admin_creador TEXT,
  id_admin_actualiza TEXT,
  admin_actualiza TEXT,
  notas BIGINT,
  fecha_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_gastos PRIMARY KEY (id_gasto)
);


-- Fuente: Caja_Movimientos
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id_movimiento TEXT,
  id_caja TEXT,
  fecha TIMESTAMPTZ,
  id_sucursal TEXT,
  sucursal TEXT,
  tipo TEXT,
  categoria TEXT,
  metodo_pago TEXT,
  importe NUMERIC(18,4),
  impacto_efectivo NUMERIC(18,4),
  referencia TEXT,
  descripcion TEXT,
  origen_modulo TEXT,
  id_origen TEXT,
  id_admin TEXT,
  administrador TEXT,
  anulado BOOLEAN,
  id_movimiento_reversion TEXT,
  CONSTRAINT pk_caja_movimientos PRIMARY KEY (id_movimiento)
);


-- Fuente: Caja_Sesiones
CREATE TABLE IF NOT EXISTS caja_sesiones (
  id_caja TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  fecha_apertura TIMESTAMPTZ,
  fecha_cierre TIMESTAMPTZ,
  fondo_inicial NUMERIC(18,4),
  ingresos_efectivo NUMERIC(18,4),
  egresos_efectivo NUMERIC(18,4),
  saldo_esperado NUMERIC(18,4),
  efectivo_contado BIGINT,
  diferencia NUMERIC(18,4),
  estado TEXT,
  id_admin_apertura TEXT,
  admin_apertura TEXT,
  id_admin_cierre TEXT,
  admin_cierre TEXT,
  notas_apertura BIGINT,
  notas_cierre TEXT,
  fecha_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_caja_sesiones PRIMARY KEY (id_caja)
);


-- Fuente: Compras_Detalle
CREATE TABLE IF NOT EXISTS compras_detalle (
  id_compra TEXT,
  linea BIGINT,
  id_producto TEXT,
  sku TEXT,
  producto TEXT,
  cantidad_solicitada BIGINT,
  cantidad_recibida BIGINT,
  cantidad_pendiente BIGINT,
  costo_unitario NUMERIC(18,4),
  subtotal_linea BIGINT,
  estado_linea BIGINT,
  ultima_recepcion TEXT,
  id_transferencia_recepcion TEXT,
  tipo_item TEXT,
  CONSTRAINT pk_compras_detalle PRIMARY KEY (id_compra, linea)
);


-- Fuente: Compras
CREATE TABLE IF NOT EXISTS compras (
  id_compra TEXT,
  fecha TIMESTAMPTZ,
  id_proveedor TEXT,
  proveedor TEXT,
  moneda TEXT,
  terminos_pago TEXT,
  dias_credito BIGINT,
  fecha_esperada TIMESTAMPTZ,
  tipo_documento TEXT,
  referencia_documento TEXT,
  estado TEXT,
  lineas BIGINT,
  unidades_solicitadas BIGINT,
  unidades_recibidas BIGINT,
  subtotal NUMERIC(18,4),
  impuestos NUMERIC(18,4),
  total NUMERIC(18,4),
  notas BIGINT,
  id_admin TEXT,
  administrador TEXT,
  fecha_actualizacion TIMESTAMPTZ,
  fecha_envio TIMESTAMPTZ,
  fecha_cierre TIMESTAMPTZ,
  motivo_cancelacion TEXT,
  CONSTRAINT pk_compras PRIMARY KEY (id_compra)
);


-- Fuente: CatalogoCP_US
CREATE TABLE IF NOT EXISTS catalogo_cp_us (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zip TEXT,
  estado TEXT,
  ciudad TEXT,
  codigo_estado TEXT
);


-- Fuente: CatalogoCiudades_US
CREATE TABLE IF NOT EXISTS catalogo_ciudades_us (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estado TEXT,
  ciudad TEXT
);


-- Fuente: CatalogoCPIndex_US
CREATE TABLE IF NOT EXISTS catalogo_cp_index_us (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estado TEXT,
  ciudad TEXT,
  zip TEXT
);


-- Fuente: Proveedores
CREATE TABLE IF NOT EXISTS proveedores (
  id_proveedor TEXT,
  razon_social TEXT,
  nombre_comercial TEXT,
  rfc TEXT,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  ciudad TEXT,
  estado TEXT,
  cp TEXT,
  pais TEXT,
  terminos_pago TEXT,
  dias_credito BIGINT,
  moneda TEXT,
  banco TEXT,
  cuenta_referencia TEXT,
  notas TEXT,
  activo BOOLEAN,
  fecha_registro TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_proveedores PRIMARY KEY (id_proveedor)
);


-- Fuente: TCG_Buylist_Reglas
CREATE TABLE IF NOT EXISTS tcg_buylist_reglas (
  id_regla TEXT,
  activa BOOLEAN,
  prioridad BIGINT,
  codigo_juego TEXT,
  rareza TEXT,
  condicion TEXT,
  precio_min NUMERIC(18,4),
  precio_max NUMERIC(18,4),
  stock_min BIGINT,
  stock_max BIGINT,
  ajuste_puntos BIGINT,
  porcentaje_fijo NUMERIC(18,4),
  margen_minimo_pct NUMERIC(18,4),
  descripcion TEXT,
  CONSTRAINT pk_tcg_buylist_reglas PRIMARY KEY (id_regla)
);


-- Fuente: TCG_Buylist_Auditoria
CREATE TABLE IF NOT EXISTS tcg_buylist_auditoria (
  id_auditoria TEXT,
  fecha TIMESTAMPTZ,
  id_buylist TEXT,
  accion TEXT,
  estado_anterior TEXT,
  estado_nuevo TEXT,
  detalle TEXT,
  id_admin TEXT,
  administrador TEXT,
  CONSTRAINT pk_tcg_buylist_auditoria PRIMARY KEY (id_auditoria)
);


-- Fuente: TCG_Buylist_Pagos
CREATE TABLE IF NOT EXISTS tcg_buylist_pagos (
  id_pago TEXT,
  fecha TIMESTAMPTZ,
  id_buylist TEXT,
  id_cliente TEXT,
  cliente TEXT,
  metodo_pago TEXT,
  monto NUMERIC(18,4),
  referencia TEXT,
  estado TEXT,
  id_operacion_pos TEXT,
  id_admin TEXT,
  administrador TEXT,
  CONSTRAINT pk_tcg_buylist_pagos PRIMARY KEY (id_pago)
);


-- Fuente: TCG_Buylist_Detalle
CREATE TABLE IF NOT EXISTS tcg_buylist_detalle (
  id_buylist TEXT,
  linea BIGINT,
  id_inventario_origen TEXT,
  id_carta TEXT,
  id_juego TEXT,
  id_set TEXT,
  carta TEXT,
  sku TEXT,
  rareza TEXT,
  idioma TEXT,
  condicion TEXT,
  edicion TEXT,
  graded BOOLEAN,
  empresa_grading TEXT,
  grado NUMERIC(18,4),
  certificado TEXT,
  cantidad BIGINT,
  precio_referencia NUMERIC(18,4),
  factor_condicion NUMERIC(18,4),
  porcentaje_compra NUMERIC(18,4),
  oferta_unitario NUMERIC(18,4),
  oferta_linea NUMERIC(18,4),
  precio_venta_estimado NUMERIC(18,4),
  id_sucursal TEXT,
  sucursal TEXT,
  estado_linea BIGINT,
  mensaje TEXT,
  id_inventario_ingreso TEXT,
  id_adquisicion TEXT,
  fecha_conversion TIMESTAMPTZ,
  CONSTRAINT pk_tcg_buylist_detalle PRIMARY KEY (id_buylist, linea)
);


-- Fuente: TCG_Buylist
CREATE TABLE IF NOT EXISTS tcg_buylist (
  id_buylist TEXT,
  fecha TIMESTAMPTZ,
  id_cliente TEXT,
  cliente TEXT,
  telefono TEXT,
  email BIGINT,
  metodo_pago TEXT,
  referencia_pago TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  lineas BIGINT,
  unidades BIGINT,
  valor_referencia NUMERIC(18,4),
  oferta_total NUMERIC(18,4),
  estado TEXT,
  id_lote_entrada TEXT,
  id_admin TEXT,
  administrador TEXT,
  notas TEXT,
  fecha_actualizacion TIMESTAMPTZ,
  estado_pago TEXT,
  id_operacion_pos TEXT,
  fecha_aceptacion TIMESTAMPTZ,
  fecha_conversion TIMESTAMPTZ,
  fecha_cierre TIMESTAMPTZ,
  version_registro BIGINT,
  hash_operacion TEXT,
  fecha_cancelacion TIMESTAMPTZ,
  motivo_cancelacion TEXT,
  cancelacion_inventario BOOLEAN,
  cancelacion_pago BOOLEAN,
  id_reversion_pago TEXT,
  id_admin_cancelacion TEXT,
  administrador_cancelacion TEXT,
  CONSTRAINT pk_tcg_buylist PRIMARY KEY (id_buylist)
);


-- Fuente: TCG_Adquisiciones
CREATE TABLE IF NOT EXISTS tcg_adquisiciones (
  id_adquisicion TEXT,
  fecha TIMESTAMPTZ,
  tipo_entrada TEXT,
  origen_nombre TEXT,
  origen_referencia TEXT,
  documento TEXT,
  id_juego TEXT,
  id_set TEXT,
  id_carta TEXT,
  id_inventario TEXT,
  sku TEXT,
  carta TEXT,
  rareza TEXT,
  idioma TEXT,
  condicion TEXT,
  edicion TEXT,
  graded BOOLEAN,
  empresa_grading TEXT,
  grado NUMERIC(18,4),
  certificado TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  cantidad BIGINT,
  costo_unitario NUMERIC(18,4),
  costo_total NUMERIC(18,4),
  precio_venta NUMERIC(18,4),
  precio_oferta NUMERIC(18,4),
  margen_unitario NUMERIC(18,4),
  margen_porcentaje NUMERIC(18,4),
  id_admin TEXT,
  administrador TEXT,
  notas TEXT,
  estado TEXT,
  mensaje TEXT,
  CONSTRAINT pk_tcg_adquisiciones PRIMARY KEY (id_adquisicion)
);


-- Fuente: TCG_ConteoDetalle
CREATE TABLE IF NOT EXISTS tcg_conteo_detalle (
  id_detalle TEXT,
  id_conteo TEXT,
  fecha_captura TIMESTAMPTZ,
  id_inventario TEXT,
  id_carta TEXT,
  sku TEXT,
  carta TEXT,
  rareza TEXT,
  idioma TEXT,
  condicion TEXT,
  edicion TEXT,
  stock_sistema BIGINT,
  cantidad_fisica BIGINT,
  diferencia NUMERIC(18,4),
  estado_ajuste TEXT,
  id_admin_captura TEXT,
  administrador_captura TEXT,
  CONSTRAINT pk_tcg_conteo_detalle PRIMARY KEY (id_detalle)
);


-- Fuente: TCG_Conteos
CREATE TABLE IF NOT EXISTS tcg_conteos (
  id_conteo TEXT,
  fecha_inicio TIMESTAMPTZ,
  fecha_cierre TIMESTAMPTZ,
  id_sucursal TEXT,
  sucursal TEXT,
  estado TEXT,
  id_admin TEXT,
  administrador TEXT,
  notas TEXT,
  variantes_contadas BIGINT,
  unidades_sistema BIGINT,
  unidades_fisicas BIGINT,
  diferencia_unidades BIGINT,
  ajustes_aplicados TEXT,
  CONSTRAINT pk_tcg_conteos PRIMARY KEY (id_conteo)
);


-- Fuente: TCG_Inventario
CREATE TABLE IF NOT EXISTS tcg_inventario (
  id_inventario TEXT,
  id_carta TEXT,
  sku TEXT,
  idioma TEXT,
  condicion TEXT,
  acabado TEXT,
  edicion TEXT,
  graded BOOLEAN,
  empresa_grading TEXT,
  grado NUMERIC(18,4),
  certificado TEXT,
  costo NUMERIC(18,4),
  precio NUMERIC(18,4),
  precio_oferta NUMERIC(18,4),
  stock BIGINT,
  stock_reservado BIGINT,
  ubicacion TEXT,
  sucursal TEXT,
  estado_venta TEXT,
  fecha_entrada TIMESTAMPTZ,
  ultima_actualizacion TIMESTAMPTZ,
  rareza TEXT,
  CONSTRAINT pk_tcg_inventario PRIMARY KEY (id_inventario)
);


-- Fuente: TCG_Escaneos
CREATE TABLE IF NOT EXISTS tcg_escaneos (
  id_escaneo TEXT,
  fecha TIMESTAMPTZ,
  codigo TEXT,
  tipo_codigo TEXT,
  accion TEXT,
  id_inventario TEXT,
  id_carta TEXT,
  sku TEXT,
  carta TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  cantidad BIGINT,
  resultado TEXT,
  id_admin TEXT,
  administrador TEXT,
  CONSTRAINT pk_tcg_escaneos PRIMARY KEY (id_escaneo)
);


-- Fuente: TCG_Juegos
CREATE TABLE IF NOT EXISTS tcg_juegos (
  id_juego TEXT,
  nombre TEXT,
  codigo TEXT,
  imagen TEXT,
  descripcion TEXT,
  activo BOOLEAN,
  orden BIGINT,
  CONSTRAINT pk_tcg_juegos PRIMARY KEY (id_juego)
);


-- Fuente: TCG_Sets
CREATE TABLE IF NOT EXISTS tcg_sets (
  id_set TEXT,
  id_juego TEXT,
  nombre TEXT,
  codigo TEXT,
  logo_imagen TEXT,
  banner_imagen TEXT,
  descripcion TEXT,
  fecha_lanzamiento TIMESTAMPTZ,
  total_cartas BIGINT,
  activo BOOLEAN,
  orden BIGINT,
  CONSTRAINT pk_tcg_sets PRIMARY KEY (id_set)
);


-- Fuente: TCG_Rarezas
CREATE TABLE IF NOT EXISTS tcg_rarezas (
  id_rareza TEXT,
  id_juego TEXT,
  codigo TEXT,
  nombre TEXT,
  orden BIGINT,
  activo BOOLEAN,
  CONSTRAINT pk_tcg_rarezas PRIMARY KEY (id_rareza)
);


-- Fuente: TCG_Cartas
CREATE TABLE IF NOT EXISTS tcg_cartas (
  id_carta TEXT,
  id_juego TEXT,
  id_set TEXT,
  nombre TEXT,
  numero_carta TEXT,
  numero_set TEXT,
  numero_completo TEXT,
  rareza TEXT,
  tipo_carta TEXT,
  subtipo TEXT,
  artista TEXT,
  descripcion TEXT,
  imagen_principal TEXT,
  estado_catalogo TEXT,
  fecha_creacion TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_tcg_cartas PRIMARY KEY (id_carta)
);


-- Fuente: TCG_MovimientosSucursales
CREATE TABLE IF NOT EXISTS tcg_movimientos_sucursales (
  id_movimiento TEXT,
  fecha TIMESTAMPTZ,
  tipo TEXT,
  id_inventario TEXT,
  id_carta TEXT,
  sku TEXT,
  id_sucursal_origen TEXT,
  sucursal_origen TEXT,
  id_sucursal_destino TEXT,
  sucursal_destino TEXT,
  cantidad BIGINT,
  stock_origen_anterior BIGINT,
  stock_origen_nuevo BIGINT,
  stock_destino_anterior BIGINT,
  stock_destino_nuevo BIGINT,
  stock_global_anterior BIGINT,
  stock_global_nuevo BIGINT,
  referencia TEXT,
  motivo TEXT,
  id_admin TEXT,
  administrador TEXT,
  CONSTRAINT pk_tcg_movimientos_sucursales PRIMARY KEY (id_movimiento)
);


-- Fuente: TCG_InventarioSucursales
CREATE TABLE IF NOT EXISTS tcg_inventario_sucursales (
  id_registro TEXT,
  id_inventario TEXT,
  id_carta TEXT,
  sku TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  stock BIGINT,
  stock_reservado BIGINT,
  ultima_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_tcg_inventario_sucursales PRIMARY KEY (id_registro)
);


-- Fuente: InventarioTransferenciasDetalle
CREATE TABLE IF NOT EXISTS inventario_transferencias_detalle (
  id_detalle TEXT,
  id_transferencia TEXT,
  id_producto TEXT,
  sku TEXT,
  producto TEXT,
  cantidad BIGINT,
  stock_origen_anterior BIGINT,
  stock_origen_nuevo BIGINT,
  stock_destino_anterior BIGINT,
  stock_destino_nuevo BIGINT,
  CONSTRAINT pk_inventario_transferencias_detalle PRIMARY KEY (id_detalle)
);


-- Fuente: InventarioTransferencias
CREATE TABLE IF NOT EXISTS inventario_transferencias (
  id_transferencia TEXT,
  fecha TIMESTAMPTZ,
  tipo TEXT,
  id_origen TEXT,
  origen TEXT,
  id_destino TEXT,
  destino TEXT,
  estado TEXT,
  total_unidades BIGINT,
  proveedor TEXT,
  referencia_externa BIGINT,
  motivo TEXT,
  id_admin TEXT,
  nombre_admin TEXT,
  email_admin TEXT,
  fecha_completada TIMESTAMPTZ,
  CONSTRAINT pk_inventario_transferencias PRIMARY KEY (id_transferencia)
);


-- Fuente: MovimientosInventarioSucursales
CREATE TABLE IF NOT EXISTS movimientos_inventario_sucursales (
  id_movimiento TEXT,
  fecha TIMESTAMPTZ,
  id_sucursal TEXT,
  sucursal TEXT,
  id_producto TEXT,
  sku TEXT,
  producto TEXT,
  tipo TEXT,
  cantidad BIGINT,
  stock_anterior BIGINT,
  stock_nuevo BIGINT,
  motivo TEXT,
  id_admin TEXT,
  nombre_usuario TEXT,
  usuario TEXT,
  referencia TEXT,
  CONSTRAINT pk_movimientos_inventario_sucursales PRIMARY KEY (id_movimiento)
);


-- Fuente: InventarioSucursales
CREATE TABLE IF NOT EXISTS inventario_sucursales (
  id_registro TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  id_producto TEXT,
  sku TEXT,
  producto TEXT,
  stock BIGINT,
  stock_minimo BIGINT,
  fecha_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_inventario_sucursales PRIMARY KEY (id_registro)
);


-- Fuente: CatalogoCiudades
CREATE TABLE IF NOT EXISTS catalogo_ciudades (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estado TEXT,
  valor NUMERIC(18,4),
  municipio TEXT,
  ciudad TEXT,
  etiqueta TEXT
);


-- Fuente: CatalogoCPIndex
CREATE TABLE IF NOT EXISTS catalogo_cp_index (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estado TEXT,
  ciudad TEXT,
  cp TEXT
);


-- Fuente: CatalogoColonias
CREATE TABLE IF NOT EXISTS catalogo_colonias (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cp TEXT,
  colonia TEXT,
  tipo_asentamiento TEXT,
  estado TEXT,
  municipio TEXT,
  ciudad TEXT
);


-- Fuente: CatalogoCP
CREATE TABLE IF NOT EXISTS catalogo_cp (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cp TEXT,
  estado TEXT,
  municipio TEXT,
  ciudad TEXT,
  colonia TEXT,
  tipo_asentamiento TEXT,
  clave_estado TEXT,
  clave_municipio TEXT,
  clave_ciudad TEXT
);


-- Fuente: Auditoria
CREATE TABLE IF NOT EXISTS auditoria (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha TIMESTAMPTZ,
  modulo TEXT,
  accion TEXT,
  referencia TEXT,
  detalle TEXT,
  usuario TEXT
);


-- Fuente: Sucursales
CREATE TABLE IF NOT EXISTS sucursales (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sucursal TEXT,
  nombre_sucursal TEXT,
  codigo TEXT,
  direccion TEXT,
  ciudad TEXT,
  estado TEXT,
  cp TEXT,
  telefono TEXT,
  email TEXT,
  activa BOOLEAN,
  fecha_registro TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ
);


-- Fuente: Administradores
CREATE TABLE IF NOT EXISTS administradores (
  id_admin TEXT,
  nombre TEXT,
  email TEXT,
  password_hash TEXT,
  rol TEXT,
  activo BOOLEAN,
  fecha_creacion TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ,
  sucursal_principal TEXT,
  sucursales_permitidas JSONB,
  CONSTRAINT pk_administradores PRIMARY KEY (id_admin)
);


-- Fuente: MovimientosInventario
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id_movimiento TEXT,
  fecha TIMESTAMPTZ,
  id_producto TEXT,
  sku TEXT,
  producto TEXT,
  tipo TEXT,
  cantidad BIGINT,
  stock_anterior BIGINT,
  stock_nuevo BIGINT,
  motivo TEXT,
  origen TEXT,
  usuario TEXT,
  legacy_col_13 TEXT,
  CONSTRAINT pk_movimientos_inventario PRIMARY KEY (id_movimiento)
);


-- Fuente: Categorias
CREATE TABLE IF NOT EXISTS categorias (
  id TEXT,
  nombre TEXT,
  estado TEXT,
  CONSTRAINT pk_categorias PRIMARY KEY (id)
);


-- Fuente: Pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id_pedido TEXT,
  fecha TIMESTAMPTZ,
  id_cliente TEXT,
  nombre_cliente TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  ciudad TEXT,
  estado TEXT,
  cp TEXT,
  metodo_pago TEXT,
  subtotal NUMERIC(18,4),
  envio NUMERIC(18,4),
  total NUMERIC(18,4),
  estado_pedido TEXT,
  referencia_pago TEXT,
  comprobante TEXT,
  fecha_pago TIMESTAMPTZ,
  notas TEXT,
  fecha_actualizacion TIMESTAMPTZ,
  inventario_liberado BOOLEAN,
  fecha_expiracion_reserva TIMESTAMPTZ,
  id_admin_venta TEXT,
  vendedor TEXT,
  id_sucursal TEXT,
  sucursal TEXT,
  canal_venta TEXT,
  venta_confirmada BOOLEAN,
  CONSTRAINT pk_pedidos PRIMARY KEY (id_pedido)
);


-- Fuente: DetallePedidos
CREATE TABLE IF NOT EXISTS detalle_pedidos (
  id_pedido TEXT,
  id_producto TEXT,
  producto TEXT,
  cantidad BIGINT,
  precio NUMERIC(18,4),
  subtotal NUMERIC(18,4),
  id_detalle TEXT,
  sku TEXT,
  precio_unitario NUMERIC(18,4),
  tipo TEXT,
  id_inventario TEXT,
  detalle TEXT,
  CONSTRAINT pk_detalle_pedidos PRIMARY KEY (id_detalle)
);


-- Fuente: Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id_cliente TEXT,
  nombre TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  fecha_registro TIMESTAMPTZ,
  legacy_col_7 TEXT,
  legacy_col_8 TEXT,
  legacy_col_9 TEXT,
  legacy_col_10 TEXT,
  ciudad TEXT,
  estado TEXT,
  cp TEXT,
  fecha_actualizacion TIMESTAMPTZ,
  CONSTRAINT pk_clientes PRIMARY KEY (id_cliente)
);


-- Fuente: Configuracion
CREATE TABLE IF NOT EXISTS configuracion (
  parametro TEXT,
  valor NUMERIC(18,4),
  CONSTRAINT pk_configuracion PRIMARY KEY (parametro)
);


-- Fuente: Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  usuario TEXT,
  password TEXT,
  rol TEXT,
  estado TEXT,
  CONSTRAINT pk_usuarios PRIMARY KEY (usuario)
);


-- Fuente: Dashboard
CREATE TABLE IF NOT EXISTS dashboard_legacy (
  row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_col_1 TEXT
);


-- Índices validados contra las columnas generadas

CREATE INDEX IF NOT EXISTS idx_productos_sku ON productos (sku);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes (email);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes (telefono);
CREATE INDEX IF NOT EXISTS idx_sucursales_codigo ON sucursales (codigo);
CREATE INDEX IF NOT EXISTS idx_pedidos_id_cliente ON pedidos (id_cliente);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos (fecha);
CREATE INDEX IF NOT EXISTS idx_pedidos_id_sucursal ON pedidos (id_sucursal);
CREATE INDEX IF NOT EXISTS idx_detalle_pedidos_id_pedido ON detalle_pedidos (id_pedido);
CREATE INDEX IF NOT EXISTS idx_detalle_pedidos_id_producto ON detalle_pedidos (id_producto);
CREATE INDEX IF NOT EXISTS idx_inventario_sucursales_id_sucursal ON inventario_sucursales (id_sucursal);
CREATE INDEX IF NOT EXISTS idx_inventario_sucursales_id_producto ON inventario_sucursales (id_producto);
CREATE INDEX IF NOT EXISTS idx_inventario_sucursales_id_sucursal_id_producto ON inventario_sucursales (id_sucursal, id_producto);
CREATE INDEX IF NOT EXISTS idx_compras_id_proveedor ON compras (id_proveedor);
CREATE INDEX IF NOT EXISTS idx_compras_detalle_id_compra ON compras_detalle (id_compra);
CREATE INDEX IF NOT EXISTS idx_tcg_sets_id_juego ON tcg_sets (id_juego);
CREATE INDEX IF NOT EXISTS idx_tcg_cartas_id_juego ON tcg_cartas (id_juego);
CREATE INDEX IF NOT EXISTS idx_tcg_cartas_id_set ON tcg_cartas (id_set);
CREATE INDEX IF NOT EXISTS idx_tcg_cartas_nombre ON tcg_cartas (nombre);
CREATE INDEX IF NOT EXISTS idx_tcg_cartas_id_set_nombre ON tcg_cartas (id_set, nombre);
CREATE INDEX IF NOT EXISTS idx_tcg_inventario_id_carta ON tcg_inventario (id_carta);
CREATE INDEX IF NOT EXISTS idx_tcg_inventario_sku ON tcg_inventario (sku);
CREATE INDEX IF NOT EXISTS idx_tcg_inventario_sucursales_id_inventario ON tcg_inventario_sucursales (id_inventario);
CREATE INDEX IF NOT EXISTS idx_tcg_inventario_sucursales_id_sucursal ON tcg_inventario_sucursales (id_sucursal);
CREATE INDEX IF NOT EXISTS idx_tcg_inventario_sucursales_id_sucursal_id_inventario ON tcg_inventario_sucursales (id_sucursal, id_inventario);
CREATE INDEX IF NOT EXISTS idx_tcg_buylist_id_cliente ON tcg_buylist (id_cliente);
CREATE INDEX IF NOT EXISTS idx_tcg_buylist_id_sucursal ON tcg_buylist (id_sucursal);
CREATE INDEX IF NOT EXISTS idx_tcg_buylist_detalle_id_buylist ON tcg_buylist_detalle (id_buylist);
CREATE INDEX IF NOT EXISTS idx_tcg_buylist_detalle_id_carta ON tcg_buylist_detalle (id_carta);
CREATE INDEX IF NOT EXISTS idx_tcg_buylist_pagos_id_buylist ON tcg_buylist_pagos (id_buylist);
CREATE INDEX IF NOT EXISTS idx_catalogo_cp_cp ON catalogo_cp (cp);
CREATE INDEX IF NOT EXISTS idx_catalogo_cp_estado ON catalogo_cp (estado);
CREATE INDEX IF NOT EXISTS idx_catalogo_cp_ciudad ON catalogo_cp (ciudad);
CREATE INDEX IF NOT EXISTS idx_catalogo_cp_cp_estado_ciudad ON catalogo_cp (cp, estado, ciudad);
CREATE INDEX IF NOT EXISTS idx_catalogo_colonias_cp ON catalogo_colonias (cp);
CREATE INDEX IF NOT EXISTS idx_catalogo_colonias_cp_colonia ON catalogo_colonias (cp, colonia);
CREATE INDEX IF NOT EXISTS idx_catalogo_cp_index_cp ON catalogo_cp_index (cp);
CREATE INDEX IF NOT EXISTS idx_catalogo_cp_us_zip ON catalogo_cp_us (zip);
CREATE INDEX IF NOT EXISTS idx_catalogo_cp_index_us_zip ON catalogo_cp_index_us (zip);
CREATE INDEX IF NOT EXISTS idx_pedidos_id_cliente_fecha ON pedidos (id_cliente, fecha);

-- FKs se agregarán en 002 después de importar y auditar datos legados.
INSERT INTO schema_migrations(version,description)
VALUES ('001','Shiny schema base V1.1 - 53 hojas, índices validados y control de migraciones')
ON CONFLICT (version) DO NOTHING;
COMMIT;
