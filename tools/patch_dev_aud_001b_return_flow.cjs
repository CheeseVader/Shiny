const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const ordersFile=path.join(root,'frontend','src','pages','OrdersPage.jsx');
const commercialFile=path.join(root,'frontend','src','pages','CommercialPage.jsx');

for(const f of [ordersFile,commercialFile]){
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
  return b;
}
function restoreAll(){
  for(const [file,b] of backups){
    try{fs.copyFileSync(b,file);}catch(_){}
  }
}
function fail(msg){
  restoreAll();
  console.error(msg);
  console.error('Los archivos originales fueron restaurados.');
  process.exit(3);
}
function replaceOnce(src,search,replacement,label){
  const i=src.indexOf(search);
  if(i<0)fail(`No se encontró el ancla: ${label}`);
  return src.slice(0,i)+replacement+src.slice(i+search.length);
}

// =========================================================
// 1. OrdersPage.jsx: acceso explícito a Devolución/Reembolso
// =========================================================
let orders=fs.readFileSync(ordersFile,'utf8');

if(!orders.includes('GMX_DEV_AUD_001B_RETURN_FLOW')){
  backup(ordersFile,'DEV_AUD_001B');

  // Función de navegación.
  const anchor="  function openPayOrder(order){";
  orders=replaceOnce(
    orders,
    anchor,
`  // GMX_DEV_AUD_001B_RETURN_FLOW
  function openReturnFlow(order){
    if(!order?.id_pedido)return;
    window.location.href=\`/admin/comercial?tab=returns&orderId=\${encodeURIComponent(order.id_pedido)}\`;
  }

${anchor}`,
    'openPayOrder'
  );

  // Botón en Historial para pedidos PAGADOS.
  const paidAnchor="{String(order.estado_pedido||'').toUpperCase()==='PAGADO'?<>";
  orders=replaceOnce(
    orders,
    paidAnchor,
`${paidAnchor}
                            <button className="secondary compact" onClick={()=>openReturnFlow(order)}>Devolver / Reembolso</button>`,
    'acciones pedido PAGADO'
  );

  fs.writeFileSync(ordersFile,orders,'utf8');
}else{
  console.log('OrdersPage.jsx: flujo devolución ya aplicado.');
}

// =========================================================
// 2. CommercialPage.jsx: recibir pedido desde POS por query
// =========================================================
let commercial=fs.readFileSync(commercialFile,'utf8');

if(!commercial.includes('GMX_DEV_AUD_001B_RETURN_DEEPLINK')){
  backup(commercialFile,'DEV_AUD_001B');

  const effectAnchor="  useEffect(()=>{load();},[]);";
  commercial=replaceOnce(
    commercial,
    effectAnchor,
`${effectAnchor}

  // GMX_DEV_AUD_001B_RETURN_DEEPLINK
  // Permite abrir Gestión Comercial directamente desde un pedido PAGADO.
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const requestedTab=String(params.get('tab')||'').toLowerCase();
    const orderId=String(params.get('orderId')||'').trim();

    if(requestedTab==='returns')setTab('returns');
    if(!orderId)return;

    setReturnOrderId(orderId);
    setTab('returns');

    let cancelled=false;
    (async()=>{
      try{
        const r=await api(\`/api/v1/commercial/returns-order/\${encodeURIComponent(orderId)}\`);
        if(cancelled)return;
        setReturnOrder(r.data);
        setReturnQty({});
        setMessage('');
        // Al venir del POS preparamos devolución real, sin ejecutarla automáticamente.
        setReturnOptions(x=>({
          ...x,
          reason:'',
          reintegrateStock:true,
          refund:false,
          refundMethod:String(r.data?.metodo_pago||'EFECTIVO').toUpperCase()==='MIXTO'
            ?'EFECTIVO'
            :String(r.data?.metodo_pago||'EFECTIVO').toUpperCase(),
          refundReference:'',
          paymentId:'',
          notes:''
        }));
      }catch(e){
        if(!cancelled)setMessage(e.message);
      }
    })();

    return()=>{cancelled=true;};
  },[]);`,
    'useEffect load'
  );

  fs.writeFileSync(commercialFile,commercial,'utf8');
}else{
  console.log('CommercialPage.jsx: deep-link devolución ya aplicado.');
}

// =========================================================
// 3. Build frontend; restaurar automáticamente si falla
// =========================================================
const frontendDir=path.join(root,'frontend');
let result;
if(process.platform==='win32'){
  result=spawnSync(
    process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',
    ['/d','/s','/c','npm run build'],
    {cwd:frontendDir,encoding:'utf8',windowsHide:true}
  );
}else{
  result=spawnSync('npm',['run','build'],{cwd:frontendDir,encoding:'utf8'});
}

console.log(result.stdout||'');
if(result.stderr)console.error(result.stderr);

if(result.error||result.status!==0){
  restoreAll();
  console.error('BUILD FALLÓ. OrdersPage.jsx y CommercialPage.jsx fueron restaurados.');
  process.exit(4);
}

console.log('DEV-AUD-001B flujo Devolución/Reembolso aplicado y compilado correctamente.');
for(const [,b] of backups)console.log(`Backup: ${b}`);
