
const fs=require('fs');
const path=require('path');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const file=path.join(root,'backend','src','repositories','ordersRepository.js');
if(!fs.existsSync(file)){console.error(`No se encontro: ${file}`);process.exit(2);}

let src=fs.readFileSync(file,'utf8');
if(!src.includes('GMX_POS_FIX_001')){
  console.error('POS-FIX-001 no esta instalado. V2 requiere V1.');
  process.exit(3);
}
if(src.includes('GMX_POS_FIX_001_V2')){
  console.log('POS-FIX-001 V2 ya estaba aplicado.');
  process.exit(0);
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=`${file}.POS_FIX_001_V2_${stamp}.bak`;
fs.copyFileSync(file,backup);

function fail(msg){
  try{fs.copyFileSync(backup,file);}catch(_){}
  console.error(msg);
  console.error(`Restaurado desde: ${backup}`);
  process.exit(4);
}

// PostgreSQL puede dejar parámetros de protocolo extendido con tipo "unknown"
// cuando se usan directamente con operador unario negativo. Forzamos NUMERIC.
const oldInsert=`      $1,NOW(),$2,$3,'EGRESO','CANCELACION_VENTA','EFECTIVO',$4,-$4,$5,
      'Reversion cancelacion venta POS','POS_CANCELACION',$5,NULLIF($6,''),$7,false,$8`;

const newInsert=`      $1,NOW(),$2,$3,'EGRESO','CANCELACION_VENTA','EFECTIVO',$4::numeric,-($4::numeric),$5,
      'Reversion cancelacion venta POS','POS_CANCELACION',$5,NULLIF($6,''),$7,false,$8`;

if(!src.includes(oldInsert))fail('No se encontro el INSERT de reversion esperado.');
src=src.replace(oldInsert,newInsert);

const oldUpdate=`    SET egresos_efectivo=COALESCE(egresos_efectivo,0)+$2,
        saldo_esperado=COALESCE(fondo_inicial,0)
          +COALESCE(ingresos_efectivo,0)
          -(COALESCE(egresos_efectivo,0)+$2),`;

const newUpdate=`    SET egresos_efectivo=COALESCE(egresos_efectivo,0)+($2::numeric),
        saldo_esperado=COALESCE(fondo_inicial,0)
          +COALESCE(ingresos_efectivo,0)
          -(COALESCE(egresos_efectivo,0)+($2::numeric)),`;

if(!src.includes(oldUpdate))fail('No se encontro el UPDATE de caja esperado.');
src=src.replace(oldUpdate,newUpdate);

// Marca de versión para auditoría.
src=src.replace('// GMX_POS_FIX_001\nasync function reverseCashSaleOnCancellation',
`// GMX_POS_FIX_001
// GMX_POS_FIX_001_V2 - casts NUMERIC explicitos para evitar "operator is not unique - unknown"
async function reverseCashSaleOnCancellation`);

fs.writeFileSync(file,src,'utf8');
console.log('POS-FIX-001 V2 aplicado correctamente.');
console.log(`Backup: ${backup}`);
