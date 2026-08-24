
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const file=path.join(root,'backend','src','repositories','commercialRepository.js');

if(!fs.existsSync(file)){
  console.error(`No se encontró ${file}`);
  process.exit(2);
}

let src=fs.readFileSync(file,'utf8');

if(src.includes('GMX_DEV_001D_STOCK_TRACE_FIX')){
  console.log('DEV-001D-STOCK-TRACE ya estaba aplicado.');
  process.exit(0);
}

if(!src.includes("const reintegrateItem=condition==='VENDIBLE';")){
  console.error('No se encontró DEV-001D base (reintegrateItem). Instala DEV-001D antes de este fix.');
  process.exit(3);
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=`${file}.DEV_001D_STOCK_TRACE_${stamp}.bak`;
fs.copyFileSync(file,backup);

function fail(msg){
  fs.copyFileSync(backup,file);
  console.error(msg);
  console.error(`Restaurado desde: ${backup}`);
  process.exit(4);
}

const anchor="      let before=null,after=null;\n";
const i=src.indexOf(anchor);
if(i<0)fail('No se encontró el ancla let before=null,after=null;');

const replacement=`      let before=null,after=null;

      // GMX_DEV_001D_STOCK_TRACE_FIX
      // En devoluciones NO vendibles no movemos inventario, pero sí dejamos
      // evidencia explícita del stock disponible antes/después (mismo valor).
      if(!reintegrateItem){
        if(itemType==='TCG'){
          if(!det.id_inventario)throw new Error(\`TCG_DETAIL_WITHOUT_INVENTORY:\${det.id_detalle}\`);
          const stockSnapshot=await client.query(\`
            SELECT stock
            FROM gmx.tcg_inventario_sucursales
            WHERE id_sucursal=$1 AND id_inventario=$2
            ORDER BY row_id
            LIMIT 1
            FOR SHARE
          \`,[branch.id_sucursal,det.id_inventario]);
          before=stockSnapshot.rowCount?n(stockSnapshot.rows[0].stock):0;
          after=before;
        }else{
          const stockSnapshot=await client.query(\`
            SELECT stock
            FROM gmx.inventario_sucursales
            WHERE id_sucursal=$1 AND id_producto=$2
            ORDER BY row_id
            LIMIT 1
            FOR SHARE
          \`,[branch.id_sucursal,det.id_producto]);
          before=stockSnapshot.rowCount?n(stockSnapshot.rows[0].stock):0;
          after=before;
        }
      }
`;

src=src.slice(0,i)+replacement+src.slice(i+anchor.length);
fs.writeFileSync(file,src,'utf8');

const check=spawnSync('node',['--check',file],{encoding:'utf8'});
if(check.status!==0){
  console.error(check.stdout||'');
  console.error(check.stderr||'');
  fail('commercialRepository.js no pasó node --check.');
}

console.log('DEV-001D-STOCK-TRACE aplicado correctamente.');
console.log(`Backup: ${backup}`);
