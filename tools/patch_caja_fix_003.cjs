
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\Shiny';
const file=path.join(root,'backend','src','repositories','cashRepository.js');

if(!fs.existsSync(file)){
  console.error(`No se encontro ${file}`);
  process.exit(2);
}

let src=fs.readFileSync(file,'utf8');

if(src.includes('SHINY_CAJA_FIX_003')){
  console.log('CAJA-FIX-003 ya estaba aplicado.');
  process.exit(0);
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=`${file}.CAJA_FIX_003_${stamp}.bak`;
fs.copyFileSync(file,backup);

function fail(msg){
  try{fs.copyFileSync(backup,file);}catch(_){}
  console.error(msg);
  console.error(`Restaurado desde: ${backup}`);
  process.exit(3);
}

const old = `    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0) throw new Error('INVALID_AMOUNT');
    const impact=cashImpact(normalizedType,paymentMethod,value);
    const id=\`CAJMOV-LOCAL-\${Date.now()}-\${Math.random().toString(16).slice(2,7)}\`;`;

const neu = `    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0) throw new Error('INVALID_AMOUNT');
    const impact=cashImpact(normalizedType,paymentMethod,value);

    // SHINY_CAJA_FIX_003
    // Un egreso manual en EFECTIVO no puede dejar la caja por debajo de cero.
    // Antes de validar, recalculamos la sesion dentro de la misma transaccion
    // para trabajar contra el saldo mas reciente.
    const freshSession=await recalcSession(client,session.rows[0].id_caja);
    const currentExpected=Number(freshSession?.saldo_esperado||0);
    if(normalizedType==='EGRESO' && impact<0){
      const resultingExpected=Number((currentExpected-Math.abs(impact)).toFixed(4));
      if(resultingExpected<0){
        const err=new Error('INSUFFICIENT_CASH_BALANCE');
        err.currentExpected=currentExpected;
        err.requested=value;
        err.resultingExpected=resultingExpected;
        throw err;
      }
    }

    const id=\`CAJMOV-LOCAL-\${Date.now()}-\${Math.random().toString(16).slice(2,7)}\`;`;

if(!src.includes(old)){
  fail('No se encontro el bloque amount/impact esperado. Verifica que CAJA-FIX-002 siga instalado.');
}

src=src.replace(old,neu);
fs.writeFileSync(file,src,'utf8');

const check=spawnSync('node',['--check',file],{encoding:'utf8'});
if(check.status!==0){
  console.error(check.stdout||'');
  console.error(check.stderr||'');
  fail('cashRepository.js no paso node --check.');
}

console.log('CAJA-FIX-003 backend aplicado correctamente.');
console.log(`Backup: ${backup}`);
