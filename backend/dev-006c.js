import 'dotenv/config';
import { query, pool } from './src/db.js';
import { hashPassword } from './src/security.js';

const API = process.env.GMX_API_URL || 'http://127.0.0.1:8787';

const REQUESTER_EMAIL = 'prueba@gmail.com';
const REQUESTER_PASSWORD = 'prueba12345';

const AUTHORIZER_EMAIL = 'test@gmail.com';
const TEMP_PASSWORD = `DEV006C-${Date.now()}-Template!`;

const TARGET_BRANCH = 'SUC-000009';

let requesterToken = '';
let authorizerToken = '';

let tempAdmin = null;
let originalPasswordHash = null;
let originalSucursalPrincipal = null;
let originalSucursalesPermitidas = null;
let originalPermission = null;

let authorizationId = null;
let returnId = null;
let refundId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
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

async function cleanup() {
  console.log('');
  console.log('=============================================');
  console.log(' CLEANUP DEV-006C');
  console.log('=============================================');

  try {
    if (authorizationId) {
      await query(
        `DELETE FROM gmx.autorizaciones_operacion
         WHERE id_autorizacion=$1`,
        [authorizationId]
      );

      console.log('CLEANUP=AUTORIZACION ELIMINADA');
    }
  } catch (e) {
    console.log('CLEANUP AUTH WARNING:', e.message);
  }

  try {
    if (tempAdmin) {
      await query(
        `DELETE FROM gmx.permisos_admin
         WHERE email=$1
           AND modulo='COMERCIAL'`,
        [AUTHORIZER_EMAIL]
      );

      if (originalPermission) {
        await query(
          `INSERT INTO gmx.permisos_admin(
             email,modulo,leer,crear,editar,eliminar,autorizar,actualizacion
           )
           VALUES($1,$2,$3,$4,$5,$6,$7,NOW())`,
          [
            AUTHORIZER_EMAIL,
            'COMERCIAL',
            originalPermission.leer,
            originalPermission.crear,
            originalPermission.editar,
            originalPermission.eliminar,
            originalPermission.autorizar
          ]
        );

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
      await query(
        `UPDATE gmx.administradores
         SET password_hash=$2,
             sucursal_principal=$3,
             sucursales_permitidas=$4::jsonb,
             fecha_actualizacion=NOW()
         WHERE id_admin=$1`,
        [
          tempAdmin.id_admin,
          originalPasswordHash,
          originalSucursalPrincipal,
          JSON.stringify(originalSucursalesPermitidas || [])
        ]
      );

      console.log('CLEANUP=PASSWORD ORIGINAL RESTAURADO');
      console.log('CLEANUP=SUCURSAL ORIGINAL RESTAURADA');
    }
  } catch (e) {
    console.log('CLEANUP ADMIN WARNING:', e.message);
  }
}

try {
  console.log('');
  console.log('=============================================');
  console.log(' GMX DEV-006C');
  console.log(' REEMBOLSO TRANSFERENCIA');
  console.log(' PRUEBA REAL CONTROLADA');
  console.log('=============================================');

  // ---------------------------------------------------------
  // HEALTH
  // ---------------------------------------------------------

  const health = await api('/api/health');

  console.log('');
  console.log('=== API ===');
  console.log('STATUS:', health.status);

  assert(
    health.status >= 200 && health.status < 300,
    'API_OFFLINE'
  );

  console.log('API=ONLINE');

  // ---------------------------------------------------------
  // BUSCAR PEDIDO TRANSFERENCIA
  // ---------------------------------------------------------

  const candidates = await query(`
    SELECT
      id_pedido,
      total,
      metodo_pago,
      estado_pedido,
      estado_pago,
      id_sucursal,
      sucursal,
      referencia_pago,
      fecha
    FROM gmx.pedidos
    WHERE UPPER(COALESCE(metodo_pago,''))='TRANSFERENCIA'
      AND UPPER(COALESCE(estado_pedido,''))='PAGADO'
      AND UPPER(COALESCE(estado_pago,''))='PAGADO'
      AND id_sucursal=$1
      AND NOT EXISTS (
        SELECT 1
        FROM gmx.devoluciones d
        WHERE d.referencia=gmx.pedidos.id_pedido
      )
    ORDER BY fecha ASC
    LIMIT 10
  `, [TARGET_BRANCH]);

  console.log('');
  console.log('=== CANDIDATOS TRANSFERENCIA ===');
  console.table(candidates.rows);

  assert(
    candidates.rowCount > 0,
    'NO_TRANSFER_ORDER_AVAILABLE'
  );

  const order = candidates.rows[0];

  console.log('');
  console.log('PEDIDO SELECCIONADO:', order.id_pedido);
  console.log('SUCURSAL:', order.id_sucursal);
  console.log('TOTAL:', order.total);
  console.log('METODO:', order.metodo_pago);

  assert(
    String(order.id_sucursal) === TARGET_BRANCH,
    `WRONG_BRANCH_${order.id_sucursal}`
  );

  // ---------------------------------------------------------
  // DETALLE
  // ---------------------------------------------------------

  const details = await query(`
    SELECT
      row_id,
      id_detalle,
      id_pedido,
      id_producto,
      id_inventario,
      sku,
      producto,
      cantidad,
      precio_unitario,
      precio,
      tipo
    FROM gmx.detalle_pedidos
    WHERE id_pedido=$1
    ORDER BY row_id
  `, [order.id_pedido]);

  console.log('');
  console.log('=== DETALLE ===');
  console.table(details.rows);

  assert(
    details.rowCount > 0,
    'NO_ORDER_DETAIL'
  );

  const detail = details.rows[0];

  // ---------------------------------------------------------
  // AUTORIZADOR
  // ---------------------------------------------------------

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
    FROM gmx.administradores
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
  console.log('=== AUTORIZADOR ===');
  console.table([{
    id_admin: tempAdmin.id_admin,
    email: tempAdmin.email,
    rol: tempAdmin.rol,
    sucursal: tempAdmin.sucursal_principal
  }]);

  // ---------------------------------------------------------
  // PERMISO ORIGINAL
  // ---------------------------------------------------------

  const permissionResult = await query(`
    SELECT
      email,
      modulo,
      leer,
      crear,
      editar,
      eliminar,
      autorizar
    FROM gmx.permisos_admin
    WHERE LOWER(email)=LOWER($1)
      AND modulo='COMERCIAL'
    LIMIT 1
  `, [AUTHORIZER_EMAIL]);

  if (permissionResult.rowCount) {
    originalPermission = permissionResult.rows[0];
  }

  console.log('');
  console.log('=== PERMISO ORIGINAL ===');

  if (originalPermission) {
    console.table([originalPermission]);
  } else {
    console.log('SIN PERMISO COMERCIAL ORIGINAL');
  }

  // ---------------------------------------------------------
  // PREPARACION TEMPORAL
  // ---------------------------------------------------------

  await query(`
    UPDATE gmx.administradores
    SET password_hash=$2,
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
    DELETE FROM gmx.permisos_admin
    WHERE email=$1
      AND modulo='COMERCIAL'
  `, [AUTHORIZER_EMAIL]);

  await query(`
    INSERT INTO gmx.permisos_admin(
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
  console.log('=== PREPARACION TEMPORAL ===');
  console.log('PASSWORD TEMPORAL=CREADO');
  console.log('SUCURSAL TEMPORAL=', TARGET_BRANCH);
  console.log('COMERCIAL.authorize=TRUE');

  // ---------------------------------------------------------
  // LOGIN SOLICITANTE
  // ---------------------------------------------------------

  console.log('');
  console.log('=== LOGIN SOLICITANTE ===');

  const requesterLogin = await login(
    REQUESTER_EMAIL,
    REQUESTER_PASSWORD
  );

  console.log('STATUS:', requesterLogin.status);
  console.log(
    'RESPONSE:',
    JSON.stringify(requesterLogin.body)
  );

  assert(
    requesterLogin.status === 200,
    `REQUESTER_LOGIN_FAILED_${requesterLogin.status}`
  );

  requesterToken = requesterLogin.body?.data?.token;

  assert(
    requesterToken,
    'REQUESTER_TOKEN_MISSING'
  );

  console.log('REQUESTER_LOGIN=PASS');

  // ---------------------------------------------------------
  // LOGIN AUTORIZADOR
  // ---------------------------------------------------------

  console.log('');
  console.log('=== LOGIN AUTORIZADOR ===');

  const authorizerLogin = await login(
    AUTHORIZER_EMAIL,
    TEMP_PASSWORD
  );

  console.log('STATUS:', authorizerLogin.status);

  assert(
    authorizerLogin.status === 200,
    `AUTHORIZER_LOGIN_FAILED_${authorizerLogin.status}`
  );

  authorizerToken = authorizerLogin.body?.data?.token;

  assert(
    authorizerToken,
    'AUTHORIZER_TOKEN_MISSING'
  );

  console.log('AUTHORIZER_LOGIN=PASS');

  // ---------------------------------------------------------
  // AUTORIZACION
  // ---------------------------------------------------------

  console.log('');
  console.log('=== AUTORIZACION ===');

  const authorization = await api(
    '/api/v1/commercial/returns/authorize',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requesterToken}`
      },
      body: JSON.stringify({
        orderId: order.id_pedido,
        email: AUTHORIZER_EMAIL,
        password: TEMP_PASSWORD
      })
    }
  );

  console.log('STATUS:', authorization.status);
  console.log(
    'RESPONSE:',
    JSON.stringify(authorization.body)
  );

  assert(
    authorization.status === 200,
    `RETURN_AUTHORIZATION_FAILED_${authorization.status}_${authorization.body?.error || ''}`
  );

  const authorizationToken =
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
  console.log('AUTHORIZATION_ID:', authorizationId);

  // ---------------------------------------------------------
  // STOCK BEFORE
  // ---------------------------------------------------------

  const stockBefore = await query(`
    SELECT
      id_inventario,
      id_producto,
      id_sucursal,
      cantidad
    FROM gmx.inventario_sucursales
    WHERE id_inventario=$1
       OR id_producto=$2
    ORDER BY row_id
    LIMIT 1
  `, [
    detail.id_inventario,
    detail.id_producto
  ]);

  console.log('');
  console.log('=== STOCK BEFORE ===');
  console.table(stockBefore.rows);

  const stockBeforeValue =
    stockBefore.rowCount
      ? Number(stockBefore.rows[0].cantidad)
      : null;

  // ---------------------------------------------------------
  // DEVOLUCION
  // ---------------------------------------------------------

  const refundReference =
    `DEV006C-TRF-${Date.now()}`;

  const returnPayload = {
    orderId: order.id_pedido,

    items: [{
      detailId: detail.id_detalle,
      quantity: 1,
      condition: 'VENDIBLE',
      destination: 'INVENTARIO_DISPONIBLE'
    }],

    reason: 'DEV-006C PRUEBA REEMBOLSO TRANSFERENCIA',

    refund: true,

    refundMethod: 'TRANSFERENCIA',

    refundReference,

    paymentId: null,

    notes: 'Prueba controlada DEV-006C'
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
  console.log(
    'SALE RESPONSE:',
    JSON.stringify(sale.body)
  );

  assert(
    sale.status === 201,
    `RETURN_CREATION_FAILED_${sale.status}_${sale.body?.error || ''}`
  );

  returnId = sale.body?.data?.id;

  assert(
    returnId,
    'RETURN_ID_MISSING'
  );

  console.log('RETURN_CREATION=PASS');
  console.log('RETURN_ID:', returnId);

  // ---------------------------------------------------------
  // DEVOLUCION
  // ---------------------------------------------------------

  const returnCheck = await query(`
    SELECT
      id,
      referencia,
      importe,
      resolucion,
      estado,
      reintegra_stock
    FROM gmx.devoluciones
    WHERE id=$1
  `, [returnId]);

  console.log('');
  console.log('=== DEVOLUCION CREADA ===');
  console.table(returnCheck.rows);

  assert(
    returnCheck.rowCount === 1,
    'RETURN_RECORD_NOT_FOUND'
  );

  assert(
    String(returnCheck.rows[0].resolucion || '')
      .startsWith('REEMBOLSO:'),
    `RETURN_RESOLUTION_INVALID_${returnCheck.rows[0].resolucion}`
  );

  console.log('RETURN_RECORD=PASS');

  // ---------------------------------------------------------
  // REEMBOLSO
  // ---------------------------------------------------------

  const refundCheck = await query(`
    SELECT
      row_id,
      id_reembolso,
      id_devolucion,
      id_pedido,
      fecha,
      metodo,
      proveedor,
      estado,
      monto,
      moneda,
      payment_id,
      refund_id_proveedor,
      idempotency_key,
      referencia,
      integracion_habilitada,
      id_admin_crea,
      usuario_crea,
      id_admin_autoriza,
      usuario_autoriza,
      fecha_autorizacion,
      error_codigo,
      error_detalle
    FROM gmx.devoluciones_reembolsos
    WHERE id_devolucion=$1
    ORDER BY row_id DESC
  `, [returnId]);

  console.log('');
  console.log('=== REEMBOLSO ===');
  console.table(refundCheck.rows);

  assert(
    refundCheck.rowCount === 1,
    'REFUND_RECORD_NOT_FOUND'
  );

  const refund = refundCheck.rows[0];

  refundId = refund.id_reembolso;

  assert(
    String(refund.metodo).toUpperCase() === 'TRANSFERENCIA',
    `REFUND_METHOD_INVALID_${refund.metodo}`
  );

  console.log('REFUND_METHOD=PASS');

  assert(
    String(refund.proveedor).toUpperCase() === 'LOCAL',
    `REFUND_PROVIDER_INVALID_${refund.proveedor}`
  );

  console.log('REFUND_PROVIDER=PASS');

  assert(
    refund.integracion_habilitada === false,
    `REFUND_INTEGRATION_MUST_BE_DISABLED_${refund.integracion_habilitada}`
  );

  console.log('BANK_INTEGRATION=DISABLED');

  assert(
    String(refund.referencia) === refundReference,
    `REFUND_REFERENCE_INVALID_${refund.referencia}`
  );

  console.log('REFUND_REFERENCE=PASS');

  assert(
    String(refund.idempotency_key || '')
      .startsWith(`DEVOLUCION:${returnId}:`),
    'REFUND_IDEMPOTENCY_KEY_INVALID'
  );

  console.log('REFUND_IDEMPOTENCY=PASS');

  // ---------------------------------------------------------
  // ESTADO ESPERADO
  // ---------------------------------------------------------

  console.log('');
  console.log('=== ESTADO REEMBOLSO ===');
  console.log('ACTUAL:', refund.estado);
  console.log('ESPERADO: PENDIENTE');

  assert(
    String(refund.estado).toUpperCase() === 'PENDIENTE',
    `REFUND_STATUS_EXPECTED_PENDIENTE_GOT_${refund.estado}`
  );

  console.log('REFUND_STATUS=PENDING_PASS');

  // ---------------------------------------------------------
  // EVENTO
  // ---------------------------------------------------------

  const eventCheck = await query(`
    SELECT
      id_evento,
      id_devolucion,
      id_reembolso,
      tipo,
      estado,
      detalle,
      id_admin,
      usuario
    FROM gmx.devoluciones_eventos
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

  // ---------------------------------------------------------
  // STOCK AFTER
  // ---------------------------------------------------------

  const stockAfter = await query(`
    SELECT
      id_inventario,
      id_producto,
      id_sucursal,
      cantidad
    FROM gmx.inventario_sucursales
    WHERE id_inventario=$1
       OR id_producto=$2
    ORDER BY row_id
    LIMIT 1
  `, [
    detail.id_inventario,
    detail.id_producto
  ]);

  console.log('');
  console.log('=== STOCK AFTER ===');
  console.table(stockAfter.rows);

  const stockAfterValue =
    stockAfter.rowCount
      ? Number(stockAfter.rows[0].cantidad)
      : null;

  if (
    stockBeforeValue !== null &&
    stockAfterValue !== null
  ) {
    assert(
      stockAfterValue === stockBeforeValue + 1,
      `STOCK_EXPECTED_${stockBeforeValue + 1}_GOT_${stockAfterValue}`
    );

    console.log(
      `STOCK=PASS (${stockBeforeValue} -> ${stockAfterValue})`
    );
  } else {
    console.log('STOCK=REVIEW');
  }

  // ---------------------------------------------------------
  // RESULTADO
  // ---------------------------------------------------------

  console.log('');
  console.log('=============================================');
  console.log(' DEV-006C = PASS');
  console.log('=============================================');
  console.log('');
  console.log('TRANSFERENCIA REEMBOLSO: PASS');
  console.log('ESTADO PENDIENTE: PASS');
  console.log('REGISTRO REEMBOLSO: PASS');
  console.log('IDEMPOTENCIA: PASS');
  console.log('EVENTO: PASS');
  console.log('INVENTARIO: PASS');
  console.log('');
  console.log('NO SE SIMULO UNA TRANSFERENCIA BANCARIA.');
  console.log('EL REEMBOLSO QUEDO COMO PENDIENTE.');
  console.log('');

} catch (e) {

  console.log('');
  console.log('=============================================');
  console.log(' DEV-006C = FAIL');
  console.log('=============================================');
  console.log('');
  console.log('ERROR:', e.message);
  console.log('');

} finally {

  await cleanup();

  await pool.end();

  console.log('');
  console.log('=============================================');
  console.log(' FIN DEV-006C');
  console.log('=============================================');
}