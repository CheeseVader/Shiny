
const fs=require('fs');
const path=require('path');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\Shiny';
const file=path.join(root,'backend','src','repositories','ordersRepository.js');

if(!fs.existsSync(file)){
  console.error(`No se encontro: ${file}`);
  process.exit(2);
}

let src=fs.readFileSync(file,'utf8');

if(src.includes('SHINY_POS_FIX_001')){
  console.log('POS-FIX-001 ya estaba aplicado.');
  process.exit(0);
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=`${file}.POS_FIX_001_${stamp}.bak`;
fs.copyFileSync(file,backup);

function fail(msg){
  try{fs.copyFileSync(backup,file);}catch(_){}
  console.error(msg);
  console.error(`Restaurado desde: ${backup}`);
  process.exit(3);
}

const marker = `export async function searchPosCatalog({`;
const helper = `
// SHINY_POS_FIX_001
async function reverseCashSaleOnCancellation(client,{order,branch,user=null}){
  const payments=await client.query(\`
    SELECT COALESCE(SUM(importe_aplicado),0)::numeric AS cash_total
    FROM shiny.pedido_pagos
    WHERE id_pedido=$1
      AND UPPER(COALESCE(metodo,''))='EFECTIVO'
      AND UPPER(COALESCE(estado,''))='PAGADO'
  \`,[order.id_pedido]);

  const cashTotal=Number(payments.rows[0]?.cash_total||0);
  if(!(cashTotal>0))return {reversed:false,amount:0};

  const existing=await client.query(\`
    SELECT row_id,id_movimiento
    FROM shiny.caja_movimientos
    WHERE origen_modulo='POS_CANCELACION'
      AND id_origen=$1
      AND categoria='CANCELACION_VENTA'
      AND COALESCE(anulado,false)=false
    ORDER BY row_id
    LIMIT 1
    FOR UPDATE
  \`,[order.id_pedido]);

  if(existing.rowCount){
    return {reversed:true,amount:cashTotal,id_movimiento:existing.rows[0].id_movimiento,reused:true};
  }

  const original=await client.query(\`
    SELECT *
    FROM shiny.caja_movimientos
    WHERE origen_modulo='POS_LOCAL'
      AND id_origen=$1
      AND categoria='VENTA'
      AND UPPER(COALESCE(metodo_pago,''))='EFECTIVO'
      AND COALESCE(anulado,false)=false
    ORDER BY row_id
    LIMIT 1
    FOR UPDATE
  \`,[order.id_pedido]);

  if(!original.rowCount)throw new Error('POS_CASH_MOVEMENT_NOT_FOUND');

  const cash=await lockOpenCashSession(client,branch.id_sucursal);
  if(!cash)throw new Error('CASH_SESSION_REQUIRED_FOR_CANCELLATION');

  const actorId=String(user?.id_admin||'').trim();
  const actorName=String(user?.nombre||user?.email||'Shiny Local POS').trim();

  const reversal=await client.query(\`
    INSERT INTO shiny.caja_movimientos(
      id_movimiento,id_caja,fecha,id_sucursal,sucursal,tipo,categoria,
      metodo_pago,importe,impacto_efectivo,referencia,descripcion,
      origen_modulo,id_origen,id_admin,administrador,anulado,id_movimiento_reversion
    )
    VALUES(
      'CAJCAN-POS-'||floor(extract(epoch from clock_timestamp())*1000)::text||'-'||substr(md5(random()::text),1,6),
      $1,NOW(),$2,$3,'EGRESO','CANCELACION_VENTA','EFECTIVO',$4,-$4,$5,
      'Reversion cancelacion venta POS','POS_CANCELACION',$5,NULLIF($6,''),$7,false,$8
    )
    RETURNING row_id,id_movimiento
  \`,[
    cash.id_caja,branch.id_sucursal,branch.nombre_sucursal,cashTotal,
    order.id_pedido,actorId,actorName,original.rows[0].id_movimiento
  ]);

  await client.query(\`
    UPDATE shiny.caja_movimientos
    SET id_movimiento_reversion=$2
    WHERE row_id=$1
  \`,[original.rows[0].row_id,reversal.rows[0].id_movimiento]);

  await client.query(\`
    UPDATE shiny.caja_sesiones
    SET egresos_efectivo=COALESCE(egresos_efectivo,0)+$2,
        saldo_esperado=COALESCE(fondo_inicial,0)
          +COALESCE(ingresos_efectivo,0)
          -(COALESCE(egresos_efectivo,0)+$2),
        fecha_actualizacion=NOW()
    WHERE row_id=$1
  \`,[cash.row_id,cashTotal]);

  await client.query(\`
    UPDATE shiny.pedido_pagos
    SET estado='REEMBOLSADO'
    WHERE id_pedido=$1
      AND UPPER(COALESCE(metodo,''))='EFECTIVO'
      AND UPPER(COALESCE(estado,''))='PAGADO'
  \`,[order.id_pedido]);

  return {
    reversed:true,
    amount:cashTotal,
    id_movimiento:reversal.rows[0].id_movimiento,
    reused:false
  };
}

`;

if(!src.includes(marker))fail('No se encontro el marcador searchPosCatalog para insertar helper.');
src=src.replace(marker,helper+marker);

const old = `    await reverseBenefitsTx(client,{order,user,reason:reason||'CancelaciÃ³n POS'});

    await client.query(\`
      UPDATE shiny.pedidos
      SET estado_pedido='CANCELADO',venta_confirmada=false,inventario_liberado=true,`;

const oldUtf8 = `    await reverseBenefitsTx(client,{order,user,reason:reason||'Cancelación POS'});

    await client.query(\`
      UPDATE shiny.pedidos
      SET estado_pedido='CANCELADO',venta_confirmada=false,inventario_liberado=true,`;

const replacement = `    await reverseBenefitsTx(client,{order,user,reason:reason||'Cancelación POS'});

    // SHINY_POS_FIX_001
    const cashReversal=await reverseCashSaleOnCancellation(client,{order,branch,user});

    await client.query(\`
      UPDATE shiny.pedidos
      SET estado_pedido='CANCELADO',
          venta_confirmada=false,
          inventario_liberado=true,
          estado_pago=CASE WHEN $3::boolean THEN 'REEMBOLSADO' ELSE estado_pago END,`;

let target=null;
if(src.includes(oldUtf8)) target=oldUtf8;
else if(src.includes(old)) target=old;
else fail('No se encontro el bloque reverseBenefitsTx / UPDATE pedidos esperado.');

src=src.replace(target,replacement);

const oldParams = `    \`,[reason,rowId]);

    await client.query('COMMIT');`;
const newParams = `    \`,[reason,rowId,cashReversal.reversed===true]);

    await client.query('COMMIT');`;

if(!src.includes(oldParams))fail('No se encontro el cierre UPDATE pedidos esperado.');
src=src.replace(oldParams,newParams);

fs.writeFileSync(file,src,'utf8');
console.log('POS-FIX-001 backend aplicado correctamente.');
console.log(`Backup: ${backup}`);
