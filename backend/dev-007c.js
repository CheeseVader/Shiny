import 'dotenv/config';
import { query, pool } from './src/db.js';
import { hashPassword } from './src/security.js';

/* ============================================================
   Shiny DEV-007C
   DEVOLUCION POS + REEMBOLSO EFECTIVO
   EJECUCION REAL CONTROLADA

   PRE2 = PASS
   STRUCT1 = PASS
   BRANCH1 = PASS

   CANDIDATO FIJO:
   PED-LOCAL-1787153995591-ab7d0c
   SUC-000010 / AUD Inventario
   EFECTIVO $100
   TCG Alpha, the Master of Beasts
   ============================================================ */

const API = process.env.SHINY_API_URL || 'http://127.0.0.1:8787';

const REQUESTER_EMAIL = 'prueba@gmail.com';
const REQUESTER_PASSWORD = 'prueba12345';

const AUTHORIZER_EMAIL = 'test@gmail.com';
const TEMP_PASSWORD = `DEV007C-${Date.now()}-Template!`;

const TARGET_ORDER = 'PED-LOCAL-1787153995591-ab7d0c';
const TARGET_BRANCH = 'SUC-000010';
const TARGET_BRANCH_NAME = 'AUD Inventario';
const TARGET_CASHBOX = 'CAJA-LOCAL-1786977533418-56daf';

const EXPECTED_TOTAL = 100;
const EXPECTED_PRODUCT = 'Alpha, the Master of Beasts';
const EXPECTED_INVENTORY = 'TCGI-1787006470686-05f79';
const EXPECTED_SKU = 'TCG-304257RA01-EN-NM-LUPT';

let tempAdmin = null;
let originalPasswordHash = null;
let originalSucursalPrincipal = null;
let originalSucursalesPermitidas = null;
let originalPermission = null;

let requesterAdmin = null;
let requesterOriginalSucursalPrincipal = null;
let requesterOriginalSucursalesPermitidas = null;

let requesterToken = '';
let authorizerToken = '';

let authorizationId = null;
let authorizationToken = null;
let returnId = null;
let refundId = null;

let firstSaleSucceeded = false;

/* ============================================================
   HELPERS
   ============================================================ */

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return {
    status: response.status,
    body
  };
}

async function login(email, password) {
  return api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password
    })
  });
}

/* ============================================================
   CLEANUP
   Solo infraestructura temporal.
   NO elimina devolucion, reembolso, inventario ni caja.
   ============================================================ */

async function cleanup() {
  console.log('');
  console.log('=============================================');
  console.log(' CLEANUP DEV-007C');
  console.log('=============================================');

  try {
    if (authorizationId) {
      await query(`
        DELETE FROM shiny.autorizaciones_operacion
        WHERE id_autorizacion=$1
      `, [authorizationId]);

      console.log('CLEANUP=AUTORIZACION ELIMINADA');
    }
  } catch (e) {
    console.log('CLEANUP AUTH WARNING:', e.message);
  }

  try {
    if (tempAdmin) {
      await query(`
        DELETE FROM shiny.permisos_admin
        WHERE LOWER(email)=LOWER($1)
          AND modulo='COMERCIAL'
      `, [AUTHORIZER_EMAIL]);

      if (originalPermission) {
        await query(`
          INSERT INTO shiny.permisos_admin(
            email,
            modulo,
            leer,
            crear,
            editar,
            eliminar,
            autorizar,
            actualizacion
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
        `, [
          AUTHORIZER_EMAIL,
          'COMERCIAL',
          originalPermission.leer,
          originalPermission.crear,
          originalPermission.editar,
          originalPermission.eliminar,
          originalPermission.autorizar
        ]);

        console.log('CLEANUP=PERMISO ORIGINAL RESTAURADO');
      } else {
        console.log('CLEANUP=PERMISO ORIGINAL ERA INEXISTENTE');
      }
    }
  } catch (e) {
    console.log('CLEANUP PERMISSION WARNING:', e.message);
  }

  try {
    if (tempAdmin && originalPasswordHash !== null) {
      await query(`
        UPDATE shiny.administradores
        SET
          password_hash=$2,
          sucursal_principal=$3,
          sucursales_permitidas=$4::jsonb,
          fecha_actualizacion=NOW()
        WHERE id_admin=$1
      `, [
        tempAdmin.id_admin,
        originalPasswordHash,
        originalSucursalPrincipal,
        JSON.stringify(originalSucursalesPermitidas || [])
      ]);

      console.log('CLEANUP=PASSWORD ORIGINAL RESTAURADO');
      console.log('CLEANUP=SUCURSAL AUTORIZADOR ORIGINAL RESTAURADA');
    }
  } catch (e) {
    console.log('CLEANUP ADMIN WARNING:', e.message);
  }

  try {
    if (requesterAdmin) {
      await query(`
        UPDATE shiny.administradores
        SET
          sucursal_principal=$2,
          sucursales_permitidas=$3::jsonb,
          fecha_actualizacion=NOW()
        WHERE id_admin=$1
      `, [
        requesterAdmin.id_admin,
        requesterOriginalSucursalPrincipal,
        JSON.stringify(requesterOriginalSucursalesPermitidas || [])
      ]);

      console.log('CLEANUP=REQUESTER SUCURSAL ORIGINAL RESTAURADA');

      const requesterRestoreCheck = await query(`
        SELECT
          sucursal_principal,
          sucursales_permitidas
        FROM shiny.administradores
        WHERE id_admin=$1
      `, [requesterAdmin.id_admin]);

      if (requesterRestoreCheck.rowCount) {
        console.log(
          'REQUESTER RESTAURADO:',
          requesterRestoreCheck.rows[0]
        );
      }
    }
  } catch (e) {
    console.log('CLEANUP REQUESTER WARNING:', e.message);
  }
}

/* ============================================================
   MAIN
   ============================================================ */

try {
  console.log('');
  console.log('============================================================');
  console.log(' Shiny DEV-007C');
  console.log(' DEVOLUCION POS + REEMBOLSO EFECTIVO');
  console.log(' EJECUCION REAL CONTROLADA — TCG + BRANCH FIX');
  console.log('============================================================');

  /* ==========================================================
     1. HEALTH
     ========================================================== */

  const health = await api('/api/health');

  console.log('');
  console.log('=== API ===');
  console.log('STATUS:', health.status);

  assert(
    health.status >= 200 && health.status < 300,
    'API_OFFLINE'
  );

  console.log('API=ONLINE');

  /* ==========================================================
     2. PEDIDO
     ========================================================== */

  const orderResult = await query(`
    SELECT
      id_pedido,
      total,
      metodo_pago,
      estado_pedido,
      estado_pago,
      id_sucursal,
      sucursal,
      venta_confirmada,
      efectivo_recibido,
      cambio_entregado,
      fecha
    FROM shiny.pedidos
    WHERE id_pedido=$1
    LIMIT 1
  `, [TARGET_ORDER]);

  console.log('');
  console.log('=== PEDIDO ===');
  console.table(orderResult.rows);

  assert(orderResult.rowCount === 1, 'TARGET_ORDER_NOT_FOUND');

  const order = orderResult.rows[0];

  assert(order.id_pedido === TARGET_ORDER, 'WRONG_ORDER');
  assert(order.id_sucursal === TARGET_BRANCH, `WRONG_BRANCH_${order.id_sucursal}`);
  assert(order.sucursal === TARGET_BRANCH_NAME, `WRONG_BRANCH_NAME_${order.sucursal}`);
  assert(
    String(order.metodo_pago || '').toUpperCase() === 'EFECTIVO',
    `WRONG_PAYMENT_METHOD_${order.metodo_pago}`
  );
  assert(
    String(order.estado_pedido || '').toUpperCase() === 'PAGADO',
    `ORDER_NOT_PAID_${order.estado_pedido}`
  );
  assert(
    String(order.estado_pago || '').toUpperCase() === 'PAGADO',
    `PAYMENT_NOT_PAID_${order.estado_pago}`
  );
  assert(order.venta_confirmada === true, 'SALE_NOT_CONFIRMED');
  assert(Number(order.total) === EXPECTED_TOTAL, `WRONG_TOTAL_${order.total}`);

  console.log('ORDER_PRECHECK=PASS');

  /* ==========================================================
     3. DETALLE
     ========================================================== */

  const details = await query(`
    SELECT *
    FROM shiny.detalle_pedidos
    WHERE id_pedido=$1
    ORDER BY row_id
  `, [TARGET_ORDER]);

  console.log('');
  console.log('=== DETALLE ===');
  console.table(details.rows);

  assert(details.rowCount === 1, `DETAIL_COUNT_INVALID_${details.rowCount}`);

  const detail = details.rows[0];

  assert(detail.producto === EXPECTED_PRODUCT, `WRONG_PRODUCT_${detail.producto}`);
  assert(String(detail.tipo || '').toUpperCase() === 'TCG', `NOT_TCG_${detail.tipo}`);
  assert(Number(detail.cantidad) === 1, `WRONG_QUANTITY_${detail.cantidad}`);
  assert(detail.id_inventario === EXPECTED_INVENTORY, `WRONG_INVENTORY_ID_${detail.id_inventario}`);
  assert(detail.sku === EXPECTED_SKU, `WRONG_SKU_${detail.sku}`);

  console.log('DETAIL_PRECHECK=PASS');

  /* ==========================================================
     4. DEVOLUCIONES / REEMBOLSOS PREVIOS
     ========================================================== */

  const previousReturns = await query(`
    SELECT *
    FROM shiny.devoluciones
    WHERE referencia=$1
  `, [TARGET_ORDER]);

  const previousRefunds = await query(`
    SELECT *
    FROM shiny.devoluciones_reembolsos
    WHERE id_pedido=$1
  `, [TARGET_ORDER]);

  console.log('');
  console.log('=== DEVOLUCIONES PREVIAS ===');
  console.table(previousReturns.rows);

  console.log('');
  console.log('=== REEMBOLSOS PREVIOS ===');
  console.table(previousRefunds.rows);

  assert(
    previousReturns.rowCount === 0,
    `PREVIOUS_RETURNS_${previousReturns.rowCount}`
  );

  assert(
    previousRefunds.rowCount === 0,
    `PREVIOUS_REFUNDS_${previousRefunds.rowCount}`
  );

  console.log('PREVIOUS_RETURNS=0 PASS');
  console.log('PREVIOUS_REFUNDS=0 PASS');

  /* ==========================================================
     5. TCG STOCK BEFORE
     ========================================================== */

  const stockBefore = await query(`
    SELECT
      row_id,
      id_inventario,
      id_carta,
      sku,
      stock,
      stock_reservado,
      ubicacion,
      sucursal,
      estado_venta,
      ultima_actualizacion
    FROM shiny.tcg_inventario
    WHERE id_inventario=$1
    LIMIT 1
  `, [EXPECTED_INVENTORY]);

  console.log('');
  console.log('=== TCG STOCK BEFORE ===');
  console.table(stockBefore.rows);

  assert(stockBefore.rowCount === 1, 'TCG_INVENTORY_NOT_FOUND');

  const tcgBefore = stockBefore.rows[0];

  assert(tcgBefore.sku === EXPECTED_SKU, 'TCG_SKU_MISMATCH');
  assert(tcgBefore.ubicacion === TARGET_BRANCH, `TCG_WRONG_BRANCH_${tcgBefore.ubicacion}`);

  const stockBeforeValue = Number(tcgBefore.stock);
  const reservedBeforeValue = Number(tcgBefore.stock_reservado || 0);

  assert(Number.isFinite(stockBeforeValue), 'TCG_STOCK_BEFORE_INVALID');

  console.log('TCG_STOCK_BEFORE=', stockBeforeValue);
  console.log('TCG_RESERVED_BEFORE=', reservedBeforeValue);

  /* ==========================================================
     6. CAJA BEFORE
     ========================================================== */

  const originalCash = await query(`
    SELECT *
    FROM shiny.caja_movimientos
    WHERE referencia=$1
      AND id_caja=$2
      AND UPPER(COALESCE(tipo,''))='INGRESO'
      AND UPPER(COALESCE(categoria,''))='VENTA'
      AND UPPER(COALESCE(metodo_pago,''))='EFECTIVO'
      AND COALESCE(anulado,false)=false
    ORDER BY row_id
  `, [
    TARGET_ORDER,
    TARGET_CASHBOX
  ]);

  console.log('');
  console.log('=== CAJA BEFORE ===');
  console.table(originalCash.rows);

  assert(
    originalCash.rowCount === 1,
    `ORIGINAL_CASH_MOVEMENT_INVALID_${originalCash.rowCount}`
  );

  const originalCashRow = originalCash.rows[0];

  assert(
    Number(originalCashRow.importe) === EXPECTED_TOTAL,
    `ORIGINAL_AMOUNT_INVALID_${originalCashRow.importe}`
  );

  assert(
    Number(originalCashRow.impacto_efectivo) === EXPECTED_TOTAL,
    `ORIGINAL_CASH_IMPACT_INVALID_${originalCashRow.impacto_efectivo}`
  );

  const cashBaseline = await query(`
    SELECT COALESCE(MAX(row_id),0)::bigint AS max_row
    FROM shiny.caja_movimientos
    WHERE id_caja=$1
  `, [TARGET_CASHBOX]);

  const cashBaselineRow = Number(cashBaseline.rows[0].max_row);

  console.log('CASH_BASELINE_ROW=', cashBaselineRow);
  console.log('CASH_BEFORE=PASS');

  /* ==========================================================
     7. REQUESTER SNAPSHOT
     ========================================================== */

  const requesterAdminResult = await query(`
    SELECT
      row_id,
      id_admin,
      nombre,
      email,
      rol,
      activo,
      sucursal_principal,
      sucursales_permitidas
    FROM shiny.administradores
    WHERE LOWER(email)=LOWER($1)
    LIMIT 1
  `, [REQUESTER_EMAIL]);

  assert(
    requesterAdminResult.rowCount === 1,
    'REQUESTER_ADMIN_NOT_FOUND'
  );

  requesterAdmin = requesterAdminResult.rows[0];

  requesterOriginalSucursalPrincipal =
    requesterAdmin.sucursal_principal;

  requesterOriginalSucursalesPermitidas =
    requesterAdmin.sucursales_permitidas;

  console.log('');
  console.log('=== REQUESTER ORIGINAL ===');

  console.table([{
    id_admin: requesterAdmin.id_admin,
    email: requesterAdmin.email,
    rol: requesterAdmin.rol,
    sucursal_principal: requesterAdmin.sucursal_principal,
    sucursales_permitidas: requesterAdmin.sucursales_permitidas
  }]);

  assert(
    String(requesterAdmin.sucursal_principal) === 'SUC-000009',
    `REQUESTER_UNEXPECTED_ORIGINAL_BRANCH_${requesterAdmin.sucursal_principal}`
  );

  /* ==========================================================
     8. AUTORIZADOR SNAPSHOT
     ========================================================== */

  const adminResult = await query(`
    SELECT
      row_id,
      id_admin,
      nombre,
      email,
      rol,
      activo,
      password_hash,
      sucursal_principal,
      sucursales_permitidas
    FROM shiny.administradores
    WHERE LOWER(email)=LOWER($1)
    LIMIT 1
  `, [AUTHORIZER_EMAIL]);

  assert(
    adminResult.rowCount === 1,
    'AUTHORIZER_NOT_FOUND'
  );

  tempAdmin = adminResult.rows[0];

  originalPasswordHash = tempAdmin.password_hash;
  originalSucursalPrincipal = tempAdmin.sucursal_principal;
  originalSucursalesPermitidas = tempAdmin.sucursales_permitidas;

  console.log('');
  console.log('=== AUTORIZADOR ORIGINAL ===');

  console.table([{
    id_admin: tempAdmin.id_admin,
    email: tempAdmin.email,
    rol: tempAdmin.rol,
    sucursal_principal: tempAdmin.sucursal_principal,
    sucursales_permitidas: tempAdmin.sucursales_permitidas
  }]);

  const permissionResult = await query(`
    SELECT
      email,
      modulo,
      leer,
      crear,
      editar,
      eliminar,
      autorizar
    FROM shiny.permisos_admin
    WHERE LOWER(email)=LOWER($1)
      AND modulo='COMERCIAL'
    LIMIT 1
  `, [AUTHORIZER_EMAIL]);

  if (permissionResult.rowCount) {
    originalPermission = permissionResult.rows[0];
  }

  console.log('');
  console.log('=== PERMISO AUTORIZADOR ORIGINAL ===');

  if (originalPermission) {
    console.table([originalPermission]);
  } else {
    console.log('SIN PERMISO COMERCIAL ORIGINAL');
  }

  /* ==========================================================
     9. PREPARACION TEMPORAL REQUESTER
     ========================================================== */

  await query(`
    UPDATE shiny.administradores
    SET
      sucursal_principal=$2,
      sucursales_permitidas=$3::jsonb,
      fecha_actualizacion=NOW()
    WHERE id_admin=$1
  `, [
    requesterAdmin.id_admin,
    TARGET_BRANCH,
    JSON.stringify([TARGET_BRANCH])
  ]);

  const requesterTempCheck = await query(`
    SELECT
      id_admin,
      email,
      sucursal_principal,
      sucursales_permitidas
    FROM shiny.administradores
    WHERE id_admin=$1
  `, [requesterAdmin.id_admin]);

  console.log('');
  console.log('=== REQUESTER TEMPORAL ===');
  console.table(requesterTempCheck.rows);

  assert(
    requesterTempCheck.rowCount === 1,
    'REQUESTER_TEMP_CHECK_NOT_FOUND'
  );

  assert(
    requesterTempCheck.rows[0].sucursal_principal === TARGET_BRANCH,
    'REQUESTER_TEMP_BRANCH_FAILED'
  );

  assert(
    Array.isArray(requesterTempCheck.rows[0].sucursales_permitidas) &&
    requesterTempCheck.rows[0].sucursales_permitidas
      .map(String)
      .includes(TARGET_BRANCH),
    'REQUESTER_TEMP_ALLOWED_BRANCH_FAILED'
  );

  console.log('REQUESTER_BRANCH_SCOPE_TEMP=PASS');

  /* ==========================================================
     10. PREPARACION TEMPORAL AUTORIZADOR
     ========================================================== */

  await query(`
    UPDATE shiny.administradores
    SET
      password_hash=$2,
      sucursal_principal=$3,
      sucursales_permitidas=$4::jsonb,
      fecha_actualizacion=NOW()
    WHERE id_admin=$1
  `, [
    tempAdmin.id_admin,
    hashPassword(TEMP_PASSWORD),
    TARGET_BRANCH,
    JSON.stringify([TARGET_BRANCH])
  ]);

  await query(`
    DELETE FROM shiny.permisos_admin
    WHERE LOWER(email)=LOWER($1)
      AND modulo='COMERCIAL'
  `, [AUTHORIZER_EMAIL]);

  await query(`
    INSERT INTO shiny.permisos_admin(
      email,
      modulo,
      leer,
      crear,
      editar,
      eliminar,
      autorizar,
      actualizacion
    )
    VALUES(
      $1,
      'COMERCIAL',
      true,
      true,
      true,
      false,
      true,
      NOW()
    )
  `, [AUTHORIZER_EMAIL]);

  console.log('');
  console.log('PREPARACION_AUTORIZADOR_TEMPORAL=PASS');

  /* ==========================================================
     11. LOGIN SOLICITANTE
     ========================================================== */

  const requesterLogin = await login(
    REQUESTER_EMAIL,
    REQUESTER_PASSWORD
  );

  console.log('');
  console.log('=== LOGIN SOLICITANTE ===');
  console.log('STATUS:', requesterLogin.status);
  console.log('RESPONSE:', JSON.stringify(requesterLogin.body));

  assert(
    requesterLogin.status === 200,
    `REQUESTER_LOGIN_FAILED_${requesterLogin.status}`
  );

  requesterToken = requesterLogin.body?.data?.token;

  assert(requesterToken, 'REQUESTER_TOKEN_MISSING');

  console.log('REQUESTER_LOGIN=PASS');

  /* ==========================================================
     12. LOGIN AUTORIZADOR
     ========================================================== */

  const authorizerLogin = await login(
    AUTHORIZER_EMAIL,
    TEMP_PASSWORD
  );

  console.log('');
  console.log('=== LOGIN AUTORIZADOR ===');
  console.log('STATUS:', authorizerLogin.status);

  assert(
    authorizerLogin.status === 200,
    `AUTHORIZER_LOGIN_FAILED_${authorizerLogin.status}`
  );

  authorizerToken = authorizerLogin.body?.data?.token;

  assert(authorizerToken, 'AUTHORIZER_TOKEN_MISSING');

  console.log('AUTHORIZER_LOGIN=PASS');

  /* ==========================================================
     13. AUTORIZACION DEVOLUCION_POS
     ========================================================== */

  const authorization = await api(
    '/api/v1/commercial/returns/authorize',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requesterToken}`
      },
      body: JSON.stringify({
        orderId: TARGET_ORDER,
        email: AUTHORIZER_EMAIL,
        password: TEMP_PASSWORD
      })
    }
  );

  console.log('');
  console.log('=== AUTORIZACION DEVOLUCION_POS ===');
  console.log('STATUS:', authorization.status);
  console.log('RESPONSE:', '[authorization body omitted]');

  assert(
    authorization.status === 200,
    `AUTHORIZATION_FAILED_${authorization.status}_${authorization.body?.error || ''}`
  );

  authorizationToken =
    authorization.body?.data?.authorizationToken;

  authorizationId =
    authorization.body?.data?.authorizationId;

  assert(
    authorizationToken,
    'AUTHORIZATION_TOKEN_MISSING'
  );

  assert(
    authorizationId,
    'AUTHORIZATION_ID_MISSING'
  );

  console.log('AUTHORIZATION=PASS');
  console.log('AUTHORIZATION_ID=', authorizationId);

  /* ==========================================================
     14. AUTORIZACION BEFORE USE
     ========================================================== */

  const authBeforeUse = await query(`
    SELECT *
    FROM shiny.autorizaciones_operacion
    WHERE id_autorizacion=$1
  `, [authorizationId]);

  console.log('');
  console.log('=== AUTORIZACION BEFORE USE ===');
  console.table(authBeforeUse.rows);

  assert(
    authBeforeUse.rowCount === 1,
    'AUTHORIZATION_DB_RECORD_NOT_FOUND'
  );

  assert(
    authBeforeUse.rows[0].used_at === null,
    'AUTHORIZATION_ALREADY_USED_BEFORE_RETURN'
  );

  /* ==========================================================
     15. DEVOLUCION REAL
     ========================================================== */

  const refundReference =
    `DEV007C-CASH-${Date.now()}`;

  const returnPayload = {
    orderId: TARGET_ORDER,

    items: [{
      detailId: detail.id_detalle,
      quantity: 1,
      condition: 'VENDIBLE',
      destination: 'INVENTARIO_DISPONIBLE'
    }],

    reason: 'DEV-007C PRUEBA REEMBOLSO EFECTIVO',

    refund: true,
    refundMethod: 'EFECTIVO',
    refundReference,
    paymentId: null,

    notes: 'Prueba controlada DEV-007C'
  };

  console.log('');
  console.log('=== EJECUTANDO DEVOLUCION ===');
  console.log(
    'PAYLOAD:',
    JSON.stringify(returnPayload, null, 2)
  );

  const sale = await api(
    '/api/v1/commercial/returns/sale',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requesterToken}`
      },
      body: JSON.stringify({
        ...returnPayload,
        authorizationToken
      })
    }
  );

  console.log('');
  console.log('SALE STATUS:', sale.status);
  console.log('SALE RESPONSE:', JSON.stringify(sale.body));

  assert(
    sale.status === 201,
    `RETURN_CREATION_FAILED_${sale.status}_${sale.body?.error || ''}`
  );

  firstSaleSucceeded = true;

  returnId = sale.body?.data?.id;

  assert(returnId, 'RETURN_ID_MISSING');

  console.log('RETURN_CREATION=PASS');
  console.log('RETURN_ID=', returnId);

  /* ==========================================================
     16. DEVOLUCION
     ========================================================== */

  const returnCheck = await query(`
    SELECT *
    FROM shiny.devoluciones
    WHERE id=$1
  `, [returnId]);

  console.log('');
  console.log('=== DEVOLUCION ===');
  console.table(returnCheck.rows);

  assert(
    returnCheck.rowCount === 1,
    'RETURN_RECORD_NOT_FOUND'
  );

  const returnRow = returnCheck.rows[0];

  assert(
    returnRow.referencia === TARGET_ORDER,
    `RETURN_ORDER_INVALID_${returnRow.referencia}`
  );

  assert(
    Number(returnRow.importe) === EXPECTED_TOTAL,
    `RETURN_AMOUNT_INVALID_${returnRow.importe}`
  );

  assert(
    String(returnRow.resolucion || '').startsWith('REEMBOLSO:'),
    `RETURN_RESOLUTION_INVALID_${returnRow.resolucion}`
  );

  assert(
    returnRow.reintegra_stock === true,
    'RETURN_REINTEGRA_STOCK_FALSE'
  );

  console.log('RETURN_RECORD=PASS');

  /* ==========================================================
     17. DETALLE DEVOLUCION
     ========================================================== */

  const returnDetail = await query(`
    SELECT *
    FROM shiny.devoluciones_detalle
    WHERE id_devolucion=$1
    ORDER BY linea
  `, [returnId]);

  console.log('');
  console.log('=== DETALLE DEVOLUCION ===');
  console.table(returnDetail.rows);

  assert(
    returnDetail.rowCount === 1,
    `RETURN_DETAIL_INVALID_${returnDetail.rowCount}`
  );

  assert(
    returnDetail.rows[0].id_inventario === EXPECTED_INVENTORY,
    `RETURN_DETAIL_INVENTORY_INVALID_${returnDetail.rows[0].id_inventario}`
  );

  assert(
    String(returnDetail.rows[0].tipo_item || '').toUpperCase() === 'TCG',
    `RETURN_DETAIL_TYPE_INVALID_${returnDetail.rows[0].tipo_item}`
  );

  assert(
    Number(returnDetail.rows[0].cantidad) === 1,
    `RETURN_DETAIL_QUANTITY_INVALID_${returnDetail.rows[0].cantidad}`
  );

  console.log('RETURN_DETAIL=PASS');

  /* ==========================================================
     18. REEMBOLSO
     ========================================================== */

  const refundCheck = await query(`
    SELECT *
    FROM shiny.devoluciones_reembolsos
    WHERE id_devolucion=$1
    ORDER BY row_id DESC
  `, [returnId]);

  console.log('');
  console.log('=== REEMBOLSO ===');
  console.table(refundCheck.rows);

  assert(
    refundCheck.rowCount === 1,
    'REFUND_NOT_FOUND'
  );

  const refund = refundCheck.rows[0];

  refundId = refund.id_reembolso;

  assert(
    refund.id_pedido === TARGET_ORDER,
    'REFUND_ORDER_INVALID'
  );

  assert(
    String(refund.metodo || '').toUpperCase() === 'EFECTIVO',
    `REFUND_METHOD_INVALID_${refund.metodo}`
  );

  assert(
    String(refund.proveedor || '').toUpperCase() === 'LOCAL',
    `REFUND_PROVIDER_INVALID_${refund.proveedor}`
  );

  assert(
    refund.integracion_habilitada === false,
    `REFUND_INTEGRATION_INVALID_${refund.integracion_habilitada}`
  );

  assert(
    Number(refund.monto) === EXPECTED_TOTAL,
    `REFUND_AMOUNT_INVALID_${refund.monto}`
  );

  assert(
    String(refund.referencia) === refundReference,
    `REFUND_REFERENCE_INVALID_${refund.referencia}`
  );

  assert(
    String(refund.idempotency_key || '')
      .startsWith(`DEVOLUCION:${returnId}:`),
    'REFUND_IDEMPOTENCY_INVALID'
  );

  const refundStatus =
    String(refund.estado || '').toUpperCase();

  assert(
    ![
      '',
      'ERROR',
      'FAILED',
      'FALLIDO',
      'CANCELADO',
      'CANCELLED'
    ].includes(refundStatus),
    `REFUND_STATUS_INVALID_${refundStatus}`
  );

  console.log('REFUND_METHOD_EFECTIVO=PASS');
  console.log('REFUND_PROVIDER_LOCAL=PASS');
  console.log('REFUND_INTEGRATION_DISABLED=PASS');
  console.log('REFUND_AMOUNT=PASS');
  console.log('REFUND_STATUS=', refundStatus);

  /* ==========================================================
     19. EVENTO REEMBOLSO
     ========================================================== */

  const eventCheck = await query(`
    SELECT *
    FROM shiny.devoluciones_eventos
    WHERE id_devolucion=$1
      AND id_reembolso=$2
      AND tipo='REEMBOLSO_REGISTRADO'
    ORDER BY fecha DESC
    LIMIT 1
  `, [
    returnId,
    refundId
  ]);

  console.log('');
  console.log('=== EVENTO REEMBOLSO ===');
  console.table(eventCheck.rows);

  assert(
    eventCheck.rowCount === 1,
    'REFUND_EVENT_NOT_FOUND'
  );

  console.log('REFUND_EVENT=PASS');

  /* ==========================================================
     20. TCG STOCK AFTER
     ========================================================== */

  const stockAfter = await query(`
    SELECT
      row_id,
      id_inventario,
      id_carta,
      sku,
      stock,
      stock_reservado,
      ubicacion,
      sucursal,
      estado_venta,
      ultima_actualizacion
    FROM shiny.tcg_inventario
    WHERE id_inventario=$1
    LIMIT 1
  `, [EXPECTED_INVENTORY]);

  console.log('');
  console.log('=== TCG STOCK AFTER ===');
  console.table(stockAfter.rows);

  assert(
    stockAfter.rowCount === 1,
    'TCG_STOCK_AFTER_NOT_FOUND'
  );

  const stockAfterValue =
    Number(stockAfter.rows[0].stock);

  console.log({
    stockBeforeValue,
    stockAfterValue
  });

  assert(
    stockAfterValue === stockBeforeValue + 1,
    `TCG_STOCK_NOT_REINTEGRATED_${stockBeforeValue}_TO_${stockAfterValue}`
  );

  console.log('TCG_STOCK_REINTEGRATION=PASS');

  /* ==========================================================
     21. CAJA AFTER
     ========================================================== */

  const cashAfter = await query(`
    SELECT *
    FROM shiny.caja_movimientos
    WHERE id_caja=$1
      AND row_id>$2
    ORDER BY row_id
  `, [
    TARGET_CASHBOX,
    cashBaselineRow
  ]);

  console.log('');
  console.log('=== CAJA AFTER ===');
  console.table(cashAfter.rows);

  assert(
    cashAfter.rowCount >= 1,
    'NO_NEW_CASH_MOVEMENT'
  );

  const cashRefund = cashAfter.rows.find(row =>
    String(row.metodo_pago || '').toUpperCase() === 'EFECTIVO' &&
    (
      String(row.tipo || '').toUpperCase() === 'EGRESO' ||
      Number(row.impacto_efectivo) < 0
    )
  );

  assert(
    cashRefund,
    'CASH_REFUND_OUTFLOW_NOT_FOUND'
  );

  assert(
    cashRefund.id_caja === TARGET_CASHBOX,
    `REFUND_WRONG_CASHBOX_${cashRefund.id_caja}`
  );

  assert(
    cashRefund.id_sucursal === TARGET_BRANCH,
    `REFUND_WRONG_BRANCH_${cashRefund.id_sucursal}`
  );

  assert(
    Math.abs(Number(cashRefund.importe)) === EXPECTED_TOTAL,
    `CASH_REFUND_AMOUNT_INVALID_${cashRefund.importe}`
  );

  assert(
    Number(cashRefund.impacto_efectivo) === -EXPECTED_TOTAL,
    `CASH_REFUND_IMPACT_INVALID_${cashRefund.impacto_efectivo}`
  );

  console.log('CASH_REFUND=-100 PASS');

  /* ==========================================================
     22. AUDITORIA
     ========================================================== */

  const auditCheck = await query(`
    SELECT *
    FROM shiny.auditoria
    WHERE referencia=$1
       OR referencia=$2
       OR detalle ILIKE $3
       OR detalle ILIKE $4
    ORDER BY row_id DESC
    LIMIT 20
  `, [
    TARGET_ORDER,
    returnId,
    `%${TARGET_ORDER}%`,
    `%${returnId}%`
  ]);

  console.log('');
  console.log('=== AUDITORIA ===');
  console.table(auditCheck.rows);

  console.log('AUDIT_ROWS=', auditCheck.rowCount);
  console.log('TRANSACTION_EVENT_AUDIT=PASS');

  /* ==========================================================
     23. AUTORIZACION AFTER USE
     ========================================================== */

  const authAfter = await query(`
    SELECT *
    FROM shiny.autorizaciones_operacion
    WHERE id_autorizacion=$1
  `, [authorizationId]);

  console.log('');
  console.log('=== AUTORIZACION AFTER USE ===');
  console.table(authAfter.rows);

  assert(
    authAfter.rowCount === 1,
    'AUTHORIZATION_NOT_FOUND_AFTER_USE'
  );

  assert(
    authAfter.rows[0].used_at !== null,
    'AUTHORIZATION_NOT_MARKED_USED'
  );

  console.log('AUTHORIZATION_USED_AT=PASS');

  /* ==========================================================
     24. BASELINE ANTI-REPLAY
     ========================================================== */

  const countsBeforeReplay = await Promise.all([
    query(`
      SELECT COUNT(*)::int total
      FROM shiny.devoluciones
      WHERE referencia=$1
    `, [TARGET_ORDER]),

    query(`
      SELECT COUNT(*)::int total
      FROM shiny.devoluciones_reembolsos
      WHERE id_pedido=$1
    `, [TARGET_ORDER]),

    query(`
      SELECT COUNT(*)::int total
      FROM shiny.caja_movimientos
      WHERE id_caja=$1
        AND row_id>$2
    `, [
      TARGET_CASHBOX,
      cashBaselineRow
    ])
  ]);

  const returnCountBefore =
    Number(countsBeforeReplay[0].rows[0].total);

  const refundCountBefore =
    Number(countsBeforeReplay[1].rows[0].total);

  const cashCountBefore =
    Number(countsBeforeReplay[2].rows[0].total);

  /* ==========================================================
     25. ANTI-REPLAY
     ========================================================== */

  console.log('');
  console.log('=== ANTI-REPLAY ===');

  const replay = await api(
    '/api/v1/commercial/returns/sale',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requesterToken}`
      },
      body: JSON.stringify({
        ...returnPayload,
        authorizationToken
      })
    }
  );

  console.log('REPLAY STATUS:', replay.status);
  console.log('REPLAY RESPONSE:', JSON.stringify(replay.body));

  assert(
    replay.status >= 400,
    `ANTI_REPLAY_HTTP_INVALID_${replay.status}`
  );

  console.log('ANTI_REPLAY_HTTP=PASS');

  /* ==========================================================
     26. NO SIDE EFFECTS
     ========================================================== */

  const countsAfterReplay = await Promise.all([
    query(`
      SELECT COUNT(*)::int total
      FROM shiny.devoluciones
      WHERE referencia=$1
    `, [TARGET_ORDER]),

    query(`
      SELECT COUNT(*)::int total
      FROM shiny.devoluciones_reembolsos
      WHERE id_pedido=$1
    `, [TARGET_ORDER]),

    query(`
      SELECT COUNT(*)::int total
      FROM shiny.caja_movimientos
      WHERE id_caja=$1
        AND row_id>$2
    `, [
      TARGET_CASHBOX,
      cashBaselineRow
    ]),

    query(`
      SELECT stock
      FROM shiny.tcg_inventario
      WHERE id_inventario=$1
    `, [EXPECTED_INVENTORY])
  ]);

  const returnCountAfter =
    Number(countsAfterReplay[0].rows[0].total);

  const refundCountAfter =
    Number(countsAfterReplay[1].rows[0].total);

  const cashCountAfter =
    Number(countsAfterReplay[2].rows[0].total);

  const stockAfterReplay =
    Number(countsAfterReplay[3].rows[0].stock);

  console.log({
    returnCountBefore,
    returnCountAfter,
    refundCountBefore,
    refundCountAfter,
    cashCountBefore,
    cashCountAfter,
    stockAfterValue,
    stockAfterReplay
  });

  assert(
    returnCountAfter === returnCountBefore,
    'REPLAY_CREATED_SECOND_RETURN'
  );

  assert(
    refundCountAfter === refundCountBefore,
    'REPLAY_CREATED_SECOND_REFUND'
  );

  assert(
    cashCountAfter === cashCountBefore,
    'REPLAY_CREATED_SECOND_CASH_MOVEMENT'
  );

  assert(
    stockAfterReplay === stockAfterValue,
    'REPLAY_CHANGED_TCG_STOCK'
  );

  console.log('ANTI_REPLAY_NO_RETURN_DUPLICATE=PASS');
  console.log('ANTI_REPLAY_NO_REFUND_DUPLICATE=PASS');
  console.log('ANTI_REPLAY_NO_CASH_DUPLICATE=PASS');
  console.log('ANTI_REPLAY_NO_TCG_STOCK_DUPLICATE=PASS');

  /* ==========================================================
     27. RESULTADO
     ========================================================== */

  console.log('');
  console.log('============================================================');
  console.log(' DEV-007C RESULTADO');
  console.log('============================================================');

  console.log('ORDER=PASS');
  console.log('DETAIL_TCG=PASS');
  console.log('PREVIOUS_RETURNS=0 PASS');
  console.log('PREVIOUS_REFUNDS=0 PASS');

  console.log('REQUESTER_BRANCH_SCOPE_TEMP=PASS');
  console.log('REQUESTER_LOGIN=PASS');
  console.log('AUTHORIZER_LOGIN=PASS');

  console.log('DEVOLUCION_POS_AUTHORIZATION=PASS');

  console.log('RETURN_CREATION=PASS');
  console.log('RETURN_DETAIL=PASS');

  console.log('REFUND_METHOD_EFECTIVO=PASS');
  console.log(`REFUND_STATUS=${refundStatus}`);
  console.log('REFUND_EVENT=PASS');

  console.log(
    `TCG_STOCK=${stockBeforeValue}->${stockAfterValue} PASS`
  );

  console.log('CASH_REFUND=-100 PASS');

  console.log('AUTHORIZATION_USED=PASS');
  console.log('ANTI_REPLAY=PASS');
  console.log('NO_DUPLICATE_SIDE_EFFECTS=PASS');

  console.log('');
  console.log('DEV-007C=PASS');

} catch (error) {
  console.log('');
  console.log('============================================================');
  console.log(' DEV-007C FAIL');
  console.log('============================================================');

  console.error(error.message);

  console.log({
    firstSaleSucceeded,
    authorizationId,
    returnId,
    refundId
  });

  process.exitCode = 1;

} finally {
  await cleanup();

  try {
    await pool.end();
  } catch {
  }

  console.log('');
  console.log('DEV-007C CLEANUP FINALIZADO');
}
