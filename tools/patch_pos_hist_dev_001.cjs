
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\Shiny';
const orders=path.join(root,'frontend','src','pages','OrdersPage.jsx');
const commercial=path.join(root,'backend','src','repositories','commercialRepository.js');

for(const f of [orders,commercial]){
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
function restore(){
  for(const [f,b] of backups){
    try{fs.copyFileSync(b,f);}catch(_){}
  }
}
function fail(msg){
  restore();
  console.error(msg);
  console.error('Los archivos fueron restaurados automáticamente.');
  process.exit(3);
}
function rep(src,a,b,label){
  const i=src.indexOf(a);
  if(i<0)fail(`No se encontró el ancla: ${label}`);
  return src.slice(0,i)+b+src.slice(i+a.length);
}

// ======================================================
// BACKEND: enriquecer listado de devoluciones con resumen
// ======================================================
let back=fs.readFileSync(commercial,'utf8');
if(!back.includes('SHINY_POS_HIST_DEV_001')){
  backup(commercial,'POS_HIST_DEV_001');

  const oldFn=`export async function listReturns({limit=300}={}){
  return query(\`SELECT * FROM shiny.devoluciones ORDER BY fecha DESC NULLS LAST,row_id DESC LIMIT $1\`,
    [Math.min(Math.max(i(limit)||300,1),1000)]);
}`;

  const newFn=`export async function listReturns({limit=300}={}){
  // SHINY_POS_HIST_DEV_001
  // Incluye resumen por pedido para que Historial POS distinga devolución parcial/total.
  return query(\`
    SELECT d.*,
      COALESCE((
        SELECT SUM(dp.cantidad)
        FROM shiny.detalle_pedidos dp
        WHERE dp.id_pedido=d.referencia
      ),0)::bigint AS unidades_vendidas_pedido,
      COALESCE((
        SELECT SUM(dd.cantidad)
        FROM shiny.devoluciones_detalle dd
        JOIN shiny.devoluciones dx ON dx.id=dd.id_devolucion
        WHERE dx.referencia=d.referencia
          AND UPPER(COALESCE(dx.estado,''))<>'CANCELADA'
      ),0)::bigint AS unidades_devueltas_pedido
    FROM shiny.devoluciones d
    ORDER BY d.fecha DESC NULLS LAST,d.row_id DESC
    LIMIT $1
  \`,[Math.min(Math.max(i(limit)||300,1),1000)]);
}`;

  back=rep(back,oldFn,newFn,'listReturns');
  fs.writeFileSync(commercial,back,'utf8');
}else{
  console.log('Backend POS-HIST-DEV-001 ya aplicado.');
}

// ======================================================
// FRONTEND: combinar pedidos + estado comercial devolución
// ======================================================
let front=fs.readFileSync(orders,'utf8');
if(!front.includes('SHINY_POS_HIST_DEV_001')){
  backup(orders,'POS_HIST_DEV_001');

  const oldLoad=`  async function loadOrders(term = orderSearch) {
    const params = new URLSearchParams({
      limit: '200',
      search: term
    });
    const body = await api(\`/api/v1/orders?\${params.toString()}\`);
    setOrders(body.data);
  }`;

  const newLoad=`  async function loadOrders(term = orderSearch) {
    // SHINY_POS_HIST_DEV_001
    const params = new URLSearchParams({
      limit: '200',
      search: term
    });

    const [body,returnsBody]=await Promise.all([
      api(\`/api/v1/orders?\${params.toString()}\`),
      api('/api/v1/commercial/returns?limit=1000').catch(()=>({data:[]}))
    ]);

    const returnByOrder=new Map();
    for(const r of (returnsBody.data||[])){
      const orderId=String(r.referencia||'').trim();
      if(!orderId||returnByOrder.has(orderId))continue;

      const sold=Number(r.unidades_vendidas_pedido||0);
      const returned=Number(r.unidades_devueltas_pedido||0);
      let returnStatus='';
      if(returned>0){
        returnStatus=sold>0 && returned>=sold?'DEVUELTO TOTAL':'DEVUELTO PARCIAL';
      }
      returnByOrder.set(orderId,{
        returnStatus,
        sold,
        returned
      });
    }

    setOrders((body.data||[]).map(order=>{
      const ret=returnByOrder.get(String(order.id_pedido||''));
      return {
        ...order,
        estado_devolucion:ret?.returnStatus||'',
        unidades_vendidas_originales:ret?.sold||Number(order.unidades||0),
        unidades_devueltas:ret?.returned||0
      };
    }));
  }`;

  front=rep(front,oldLoad,newLoad,'loadOrders');

  // Cambiar texto del badge sin tocar estado_pedido persistido.
  if(front.includes("{order.estado_pedido || 'â€”'}")){
    front=front.replace(
      "{order.estado_pedido || 'â€”'}",
      "{order.estado_devolucion || order.estado_pedido || 'â€”'}"
    );
  }else if(front.includes("{order.estado_pedido || '—'}")){
    front=front.replace(
      "{order.estado_pedido || '—'}",
      "{order.estado_devolucion || order.estado_pedido || '—'}"
    );
  }else{
    fail('No se encontró la expresión visual estado_pedido.');
  }

  // Ajustar clase del badge para devolución.
  const classOld="className={`module-state ${String(order.estado_pedido || '').toUpperCase() === 'CANCELADO' ? 'warning' : 'ready'}`}";
  const classNew="className={`module-state ${String(order.estado_devolucion||order.estado_pedido||'').toUpperCase().includes('DEVUELTO')||String(order.estado_pedido||'').toUpperCase()==='CANCELADO' ? 'warning' : 'ready'}`}";
  if(front.includes(classOld)){
    front=front.replace(classOld,classNew);
  } else {
    const classOld2="className={`module-state ${String(order.estado_pedido || '').toUpperCase() === 'CANCELADO' ? 'warning' : 'ready'}`}";
    if(front.includes(classOld2))front=front.replace(classOld2,classNew);
  }

  fs.writeFileSync(orders,front,'utf8');
}else{
  console.log('Frontend POS-HIST-DEV-001 ya aplicado.');
}

// Validar backend
let check=spawnSync('node',['--check',commercial],{encoding:'utf8'});
if(check.status!==0){
  console.error(check.stdout||'');
  console.error(check.stderr||'');
  fail('commercialRepository.js no pasó node --check.');
}

// Build frontend
const frontendDir=path.join(root,'frontend');
let build;
if(process.platform==='win32'){
  build=spawnSync(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',
    ['/d','/s','/c','npm run build'],
    {cwd:frontendDir,encoding:'utf8',windowsHide:true});
}else{
  build=spawnSync('npm',['run','build'],{cwd:frontendDir,encoding:'utf8'});
}
console.log(build.stdout||'');
if(build.stderr)console.error(build.stderr);
if(build.status!==0)fail('Frontend no compiló.');

console.log('POS-HIST-DEV-001 aplicado y compilado correctamente.');
for(const [,b] of backups)console.log(`Backup: ${b}`);
