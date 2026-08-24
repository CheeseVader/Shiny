
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const payment=path.join(root,'backend','src','paymentService.js');
const routes=path.join(root,'backend','src','routes','payments.js');

for(const f of [payment,routes]){
  if(!fs.existsSync(f)){
    console.error(`No se encontró ${f}`);
    process.exit(2);
  }
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backups=[];
function backup(file,label){
  const b=`${file}.${label}_${stamp}.bak`;
  fs.copyFileSync(file,b);
  backups.push([file,b]);
}
function restore(){ for(const [f,b] of backups){ try{fs.copyFileSync(b,f);}catch(_){}} }
function fail(msg){ restore(); console.error(msg); console.error('Archivos restaurados automáticamente.'); process.exit(3); }

let src=fs.readFileSync(payment,'utf8');
if(!src.includes('GMX_PAY_IDEMP_001')){
  backup(payment,'PAY_IDEMP_001');
  const start=src.indexOf('export async function createStripeSessionForOrder(');
  const end=src.indexOf('\nasync function markStripePaid',start);
  if(start<0||end<0)fail('No se encontró createStripeSessionForOrder completo.');

  const replacement=`export async function createStripeSessionForOrder(order,token,baseUrl){
  // GMX_PAY_IDEMP_001
  const stripe=stripeClient();
  if(!stripe)throw new Error('CARD_GATEWAY_NOT_CONFIGURED');

  const client=await pool.connect();
  const idemKey=\`STRIPE:CARD:\${order.id_pedido}:ACTIVE\`;

  try{
    await client.query('BEGIN');

    await client.query(
      \`SELECT pg_advisory_xact_lock(hashtextextended($1,0))\`,
      [\`PAY:CARD:\${order.id_pedido}\`]
    );

    const orderR=await client.query(
      \`SELECT id_pedido,estado_pago
       FROM gmx.pedidos
       WHERE id_pedido=$1
       FOR UPDATE\`,
      [order.id_pedido]
    );
    if(!orderR.rowCount)throw new Error('ORDER_NOT_FOUND');
    if(String(orderR.rows[0].estado_pago||'').toUpperCase()==='PAGADO'){
      throw new Error('ORDER_ALREADY_PAID');
    }

    const existing=await client.query(
      \`SELECT *
       FROM gmx.payment_transactions
       WHERE id_pedido=$1
         AND proveedor='STRIPE'
         AND metodo='CARD'
         AND estado='PENDING'
       ORDER BY row_id DESC
       LIMIT 1
       FOR UPDATE\`,
      [order.id_pedido]
    );

    if(existing.rowCount){
      const tx=existing.rows[0];
      if(tx.provider_session_id){
        let current;
        try{
          current=await stripe.checkout.sessions.retrieve(tx.provider_session_id);
        }catch(_e){
          throw new Error('PAYMENT_SESSION_REUSE_FAILED');
        }

        if(current.status==='open'){
          const savedUrl=current.url||tx.metadata_json?.checkout_url||null;
          await client.query('COMMIT');
          return {provider:'STRIPE',sessionId:current.id,url:savedUrl,reused:true};
        }

        if(current.payment_status==='paid'){
          throw new Error('ORDER_ALREADY_PAID');
        }

        await client.query(
          \`UPDATE gmx.payment_transactions
           SET estado='EXPIRED',
               idempotency_key=NULL,
               fecha_actualizacion=NOW()
           WHERE row_id=$1\`,
          [tx.row_id]
        );
      }
    }

    const session=await stripe.checkout.sessions.create({
      mode:'payment',
      customer_email:order.email||undefined,
      line_items:[{
        price_data:{
          currency:'mxn',
          product_data:{name:\`Pedido GMX \${order.id_pedido}\`},
          unit_amount:Math.round(Number(order.total||0)*100)
        },
        quantity:1
      }],
      success_url:\`\${baseUrl}/tienda/pago/tarjeta/resultado?token=\${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url:\`\${baseUrl}/tienda/checkout?payment_cancelled=1\`,
      metadata:{id_pedido:order.id_pedido,public_token:token}
    });

    await client.query(
      \`INSERT INTO gmx.payment_transactions(
        id_transaccion,id_pedido,public_token,proveedor,metodo,estado,monto,moneda,
        provider_session_id,metadata_json,idempotency_key)
       VALUES($1,$2,$3,'STRIPE','CARD','PENDING',$4,'MXN',$5,$6::jsonb,$7)\`,
      [
        uid('PAY'),
        order.id_pedido,
        token,
        Number(order.total||0),
        session.id,
        JSON.stringify({checkout_url:session.url}),
        idemKey
      ]
    );

    await client.query(
      \`UPDATE gmx.pedidos
       SET payment_provider='STRIPE',
           payment_provider_session=$2,
           estado_pago='PENDIENTE',
           fecha_actualizacion=NOW()
       WHERE id_pedido=$1\`,
      [order.id_pedido,session.id]
    );

    await client.query('COMMIT');
    return {provider:'STRIPE',sessionId:session.id,url:session.url,reused:false};
  }catch(e){
    try{await client.query('ROLLBACK');}catch{}
    throw e;
  }finally{
    client.release();
  }
}
`;
  src=src.slice(0,start)+replacement+src.slice(end);
  fs.writeFileSync(payment,src,'utf8');
}else{
  console.log('paymentService.js ya tiene PAY-IDEMP-001.');
}

let rsrc=fs.readFileSync(routes,'utf8');
if(!rsrc.includes("'ORDER_ALREADY_PAID'")){
  backup(routes,'PAY_IDEMP_001');
  const old="const known=new Set(['CARD_GATEWAY_NOT_CONFIGURED','PAYMENT_SESSION_MISMATCH','TRANSFER_ACCOUNT_NOT_CONFIGURED','ORDER_NOT_FOUND','ORDER_NOT_TRANSFER','INVALID_PROOF_TYPE','INVALID_PROOF_SIZE']);";
  const neu="const known=new Set(['CARD_GATEWAY_NOT_CONFIGURED','PAYMENT_SESSION_MISMATCH','PAYMENT_SESSION_REUSE_FAILED','ORDER_ALREADY_PAID','TRANSFER_ACCOUNT_NOT_CONFIGURED','ORDER_NOT_FOUND','ORDER_NOT_TRANSFER','INVALID_PROOF_TYPE','INVALID_PROOF_SIZE']);";
  if(!rsrc.includes(old))fail('No se encontró el Set known de payments.js.');
  rsrc=rsrc.replace(old,neu);
  fs.writeFileSync(routes,rsrc,'utf8');
}

for(const f of [payment,routes]){
  const c=spawnSync('node',['--check',f],{encoding:'utf8'});
  if(c.status!==0){
    console.error(c.stdout||'');
    console.error(c.stderr||'');
    fail(`${path.basename(f)} no pasó node --check.`);
  }
}

console.log('PAY-IDEMP-001 backend aplicado correctamente.');
for(const [,b] of backups)console.log(`Backup: ${b}`);
