
const fs=require('fs');
const path=require('path');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const files={
  repo:path.join(root,'backend','src','repositories','ordersRepository.js'),
  route:path.join(root,'backend','src','routes','orders.js'),
  front:path.join(root,'frontend','src','pages','OrdersPage.jsx')
};

for(const f of Object.values(files)){
  if(!fs.existsSync(f)){console.error(`No se encontro ${f}`);process.exit(2);}
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backups=[];
function saveBackup(file){
  const b=`${file}.POS_FIX_002_${stamp}.bak`;
  fs.copyFileSync(file,b);
  backups.push([file,b]);
}
function fail(msg){
  for(const [file,b] of backups.reverse()){try{fs.copyFileSync(b,file);}catch(_){}}
  console.error(msg);
  console.error('Rollback aplicado.');
  process.exit(3);
}

let repo=fs.readFileSync(files.repo,'utf8');
let route=fs.readFileSync(files.route,'utf8');
let front=fs.readFileSync(files.front,'utf8');

if(repo.includes('GMX_POS_FIX_002') && route.includes('GMX_POS_FIX_002') && front.includes('GMX_POS_FIX_002')){
  console.log('POS-FIX-002 ya estaba aplicado.');
  process.exit(0);
}

saveBackup(files.repo); saveBackup(files.route); saveBackup(files.front);

// =========================
// ordersRepository.js
// =========================
repo=repo.replace(
`export async function createSale({
  branchId,
  clientId = '',
  paymentMethod = 'EFECTIVO',`,
`export async function createSale({
  branchId,
  clientId = '',
  saleRequestId = '',
  paymentMethod = 'EFECTIVO',`
);
if(!repo.includes("saleRequestId = ''"))fail('No se pudo ampliar la firma createSale.');

repo=repo.replace(
`  try {
    await client.query('BEGIN');

    const branch = await fetchBranch(client, branchId);`,
`  try {
    await client.query('BEGIN');

    // GMX_POS_FIX_002
    // Idempotencia fuerte de la venta POS.
    const idemKey=String(saleRequestId||'').trim();
    if(!idemKey)throw new Error('SALE_REQUEST_ID_REQUIRED');
    if(idemKey.length>160)throw new Error('INVALID_SALE_REQUEST_ID');

    await client.query(
      \`SELECT pg_advisory_xact_lock(hashtextextended($1,0))\`,
      [\`POS:SALE:\${idemKey}\`]
    );

    const existingSale=await client.query(\`
      SELECT row_id,id_pedido
      FROM gmx.pedidos
      WHERE pos_idempotency_key=$1
      ORDER BY row_id
      LIMIT 1
      FOR UPDATE
    \`,[idemKey]);

    if(existingSale.rowCount){
      await client.query('COMMIT');
      const existingOrder=await getOrder(existingSale.rows[0].row_id);
      return {...existingOrder,idempotent_reuse:true,inventory_updates:[]};
    }

    const branch = await fetchBranch(client, branchId);`
);
if(!repo.includes("POS:SALE:"))fail('No se pudo insertar el lock idempotente.');

repo=repo.replace(
`        puntos_redimidos,descuento_puntos,puntos_generados,total_antes_beneficios,estado_pago,efectivo_recibido,cambio_entregado
      )`,
`        puntos_redimidos,descuento_puntos,puntos_generados,total_antes_beneficios,estado_pago,efectivo_recibido,cambio_entregado,
        pos_idempotency_key
      )`
);

repo=repo.replace(
`        NOW(),false,$18,$19,$16,$17,'POS_LOCAL',true,$20,$21,$22,$23,$24,$25,$11,'PAGADO',$26,$27
      )`,
`        NOW(),false,$18,$19,$16,$17,'POS_LOCAL',true,$20,$21,$22,$23,$24,$25,$11,'PAGADO',$26,$27,$28
      )`
);

repo=repo.replace(
`      benefit.pointsUsed,benefit.loyaltyDiscount,benefit.pointsEarned,efectivoRecibido,cambioEntregado
    ]);`,
`      benefit.pointsUsed,benefit.loyaltyDiscount,benefit.pointsEarned,efectivoRecibido,cambioEntregado,
      idemKey
    ]);`
);

repo=repo.replace(
`      ...result,
      inventory_updates:prepared.map(line=>line.itemType==='PRODUCT'`,
`      ...result,
      idempotent_reuse:false,
      inventory_updates:prepared.map(line=>line.itemType==='PRODUCT'`
);

if(!repo.includes("pos_idempotency_key") || !repo.includes("idempotent_reuse:false"))fail('No se completo el parche de createSale.');

// =========================
// routes/orders.js
// =========================
route=route.replace(
`router.post('/pos', async (req, res) => {`,
`// GMX_POS_FIX_002
router.post('/pos', async (req, res) => {`
);
route=route.replace(
`      branchId: String(req.body.branchId || '').trim(),
      clientId: String(req.body.clientId || '').trim(),
      paymentMethod: String(req.body.paymentMethod || 'EFECTIVO').trim(),`,
`      branchId: String(req.body.branchId || '').trim(),
      clientId: String(req.body.clientId || '').trim(),
      saleRequestId: String(req.body.saleRequestId || '').trim(),
      paymentMethod: String(req.body.paymentMethod || 'EFECTIVO').trim(),`
);
route=route.replace(
`    if(code==='CASH_SESSION_REQUIRED'){`,
`    if(code==='SALE_REQUEST_ID_REQUIRED'){
      message='No fue posible identificar este intento de venta. Vuelve a intentarlo.';
    }else if(code==='INVALID_SALE_REQUEST_ID'){
      message='El identificador del intento de venta no es válido.';
    }else if(code==='CASH_SESSION_REQUIRED'){`
);
if(!route.includes("saleRequestId: String(req.body.saleRequestId"))fail('No se pudo parchear la ruta /pos.');

// =========================
// frontend OrdersPage.jsx
// =========================
front=front.replace(
`  const [productCategory,setProductCategory]=useState('');`,
`  const [productCategory,setProductCategory]=useState('');

  // GMX_POS_FIX_002
  // Si una respuesta se pierde, el mismo payload reutiliza la misma clave.
  // Si carrito/pagos cambian, se genera una clave nueva.
  const [saleAttempt,setSaleAttempt]=useState({key:'',fingerprint:''});`
);
if(!front.includes("const [saleAttempt"))fail('No se pudo agregar saleAttempt.');

const checkoutStart = `    try {
      const body = await api('/api/v1/orders/pos', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          clientId,
          paymentMethod,
          paymentReference,
          payments:payments.map((row,index)=>( {
`;
if(front.includes(checkoutStart)){
  fail('Formato inesperado detectado; no aplicar parche parcial.');
}

// Reemplazo por regex del bloque API dentro de checkout.
const re=/    try \{\r?\n      const body = await api\('\/api\/v1\/orders\/pos', \{\r?\n        method: 'POST',\r?\n        body: JSON\.stringify\(\{\r?\n([\s\S]*?)\r?\n        \}\)\r?\n      \}\);/;
const m=front.match(re);
if(!m)fail('No se encontro el POST checkout esperado.');

const payloadBody=m[1];
const newBlock=`    try {
      const salePayload={
${payloadBody}
      };

      const fingerprint=JSON.stringify(salePayload);
      const requestKey=(saleAttempt.key&&saleAttempt.fingerprint===fingerprint)
        ?saleAttempt.key
        :\`POSREQ-\${Date.now()}-\${globalThis.crypto?.randomUUID?.()||Math.random().toString(16).slice(2)}\`;

      if(requestKey!==saleAttempt.key||fingerprint!==saleAttempt.fingerprint){
        setSaleAttempt({key:requestKey,fingerprint});
      }

      const body = await api('/api/v1/orders/pos', {
        method: 'POST',
        body: JSON.stringify({...salePayload,saleRequestId:requestKey})
      });`;

front=front.replace(re,newBlock);

// Al completar exitosamente, liberar intento.
front=front.replace(
`      setCompletedOrder(body.data);
      setCart([]);`,
`      setCompletedOrder(body.data);
      setSaleAttempt({key:'',fingerprint:''});
      setCart([]);`
);

if(!front.includes("saleRequestId:requestKey") || !front.includes("setSaleAttempt({key:'',fingerprint:''})"))fail('No se completo parche frontend.');

fs.writeFileSync(files.repo,repo,'utf8');
fs.writeFileSync(files.route,route,'utf8');
fs.writeFileSync(files.front,front,'utf8');

console.log('POS-FIX-002 aplicado correctamente.');
console.log('Backups:');
for(const [,b] of backups)console.log(b);
