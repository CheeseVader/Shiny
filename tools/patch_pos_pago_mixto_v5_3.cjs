const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const file=path.join(root,'frontend','src','pages','OrdersPage.jsx');
if(!fs.existsSync(file)){console.error(`No se encontró ${file}`);process.exit(2);}

let src=fs.readFileSync(file,'utf8');
if(src.includes('GMX_POS_PAGO_MIXTO_001_V5_3')){
  console.log('POS-PAGO-MIXTO-001 V5.3 ya estaba aplicado.');
  process.exit(0);
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=`${file}.POS_PAGO_MIXTO_001_V5_3_${stamp}.bak`;
fs.copyFileSync(file,backup);

function fail(msg){
  fs.copyFileSync(backup,file);
  console.error(msg);
  console.error(`OrdersPage.jsx restaurado desde: ${backup}`);
  process.exit(3);
}

function replaceOnce(search,replacement,label){
  const i=src.indexOf(search);
  if(i<0)fail(`No se encontró el ancla: ${label}`);
  src=src.slice(0,i)+replacement+src.slice(i+search.length);
}

// 1) Marcador.
replaceOnce(
  "export default function OrdersPage() {",
  "export default function OrdersPage() {\n  // GMX_POS_PAGO_MIXTO_001_V5_3",
  "component marker"
);

// 2) Limpiar mensaje anterior ANTES de una nueva operación.
// Esto evita que un error local anterior siga visible durante el siguiente cobro.
replaceOnce(
  "  async function checkout() {\n    if (!branchId) {",
  "  async function checkout() {\n    setMessage('');\n    if (!branchId) {",
  "checkout start"
);

// 3) Efectivo principal nunca hereda referencia global.
// Métodos no efectivo pueden seguir usando paymentReference como referencia principal.
const oldRef="reference:index===0?paymentReference:String(row.reference||'')";
const newRef="reference:index===0?(paymentMethod==='EFECTIVO'?'':paymentReference):String(row.reference||'')";
replaceOnce(oldRef,newRef,"payment reference mapping");

// 4) El campo Referencia global sólo se muestra si el método PRINCIPAL no es efectivo.
// Para transferencia secundaria, MixedPaymentsPanel ya contiene Referencia / folio.
const refLabel=`            <label>Referencia
              <input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} />
            </label>`;
if(src.includes(refLabel)){
  src=src.replace(
    refLabel,
`            {paymentMethod!=='EFECTIVO'?<label>Referencia
              <input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} />
            </label>:null}`
  );
}else{
  // Variante tolerante: ubicar label exacto por texto y envolverlo.
  const marker='<label>Referencia';
  const pos=src.indexOf(marker);
  if(pos<0)fail('No se encontró el campo global Referencia.');
  const end=src.indexOf('</label>',pos);
  if(end<0)fail('No se pudo delimitar el campo global Referencia.');
  const block=src.slice(pos,end+'</label>'.length);
  const wrapped=`{paymentMethod!=='EFECTIVO'?${block}:null}`;
  src=src.slice(0,pos)+wrapped+src.slice(end+'</label>'.length);
}

fs.writeFileSync(file,src,'utf8');

// Validación real con Vite.
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
  fs.copyFileSync(backup,file);
  console.error('Build falló; OrdersPage.jsx fue restaurado automáticamente.');
  console.error(`Backup: ${backup}`);
  process.exit(4);
}

console.log('POS-PAGO-MIXTO-001 V5.3 aplicado y compilado correctamente.');
console.log(`Backup: ${backup}`);
