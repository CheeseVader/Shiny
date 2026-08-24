
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const file=path.join(root,'backend','src','repositories','cashRepository.js');

if(!fs.existsSync(file)){
  console.error(`No se encontró ${file}`);
  process.exit(2);
}

let src=fs.readFileSync(file,'utf8');

if(src.includes('GMX_CAJA_FIX_002')){
  console.log('CAJA-FIX-002 ya estaba aplicado.');
  process.exit(0);
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=`${file}.CAJA_FIX_002_${stamp}.bak`;
fs.copyFileSync(file,backup);

function fail(msg){
  try{fs.copyFileSync(backup,file);}catch(_){}
  console.error(msg);
  console.error(`Restaurado desde: ${backup}`);
  process.exit(3);
}

const old = `    const normalizedType=String(type||'').toUpperCase();
    if(!['INGRESO','EGRESO'].includes(normalizedType)) throw new Error('INVALID_MOVEMENT_TYPE');
    const value=Number(amount);`;

const neu = `    const normalizedType=String(type||'').toUpperCase();
    if(!['INGRESO','EGRESO'].includes(normalizedType)) throw new Error('INVALID_MOVEMENT_TYPE');

    // GMX_CAJA_FIX_002
    // Reglas semánticas del catálogo de motivos de Caja.
    // Frontend y backend deben aceptar exactamente las mismas combinaciones.
    const normalizedCategory=String(category||'MANUAL').toUpperCase();
    const allowedCategories={
      INGRESO:new Set(['DEPOSITO','MANUAL','AJUSTE']),
      EGRESO:new Set(['RETIRO','MANUAL','AJUSTE'])
    };
    if(!allowedCategories[normalizedType].has(normalizedCategory)){
      throw new Error('INVALID_MOVEMENT_CATEGORY');
    }

    const value=Number(amount);`;

if(!src.includes(old)){
  fail('No se encontró el bloque de validación type/amount esperado.');
}

src=src.replace(old,neu);

// Usar la categoría ya normalizada en el INSERT.
const oldInsert = `      normalizedType,String(category||'MANUAL').toUpperCase(),
      String(paymentMethod||'EFECTIVO').toUpperCase(),value,impact,`;

const newInsert = `      normalizedType,normalizedCategory,
      String(paymentMethod||'EFECTIVO').toUpperCase(),value,impact,`;

if(!src.includes(oldInsert)){
  fail('No se encontró el bloque INSERT de categoria esperado.');
}
src=src.replace(oldInsert,newInsert);

fs.writeFileSync(file,src,'utf8');

const check=spawnSync('node',['--check',file],{encoding:'utf8'});
if(check.status!==0){
  console.error(check.stdout||'');
  console.error(check.stderr||'');
  fail('cashRepository.js no pasó node --check.');
}

console.log('CAJA-FIX-002 backend aplicado correctamente.');
console.log(`Backup: ${backup}`);
