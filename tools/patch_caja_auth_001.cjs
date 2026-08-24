
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const repo=path.join(root,'backend','src','repositories','cashRepository.js');
const route=path.join(root,'backend','src','routes','cash.js');

for(const f of [repo,route]){
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
  console.error('Archivos restaurados automáticamente.');
  process.exit(3);
}

let src=fs.readFileSync(repo,'utf8');
if(!src.includes('GMX_CAJA_AUTH_001')){
  backup(repo,'CAJA_AUTH_001');

  const importAnchor="import { pool, query } from '../db.js';";
  if(!src.includes(importAnchor))fail('No se encontró import principal de cashRepository.js.');

  src=src.replace(importAnchor, `${importAnchor}

// GMX_CAJA_AUTH_001
function cashActor(user={}){
  const id=String(user?.id_admin||'LOCAL').trim()||'LOCAL';
  const name=String(user?.nombre||user?.email||'GMX Local').trim()||'GMX Local';
  return {id,name};
}`);

  src=src.replace(
    "export async function openCash({branchId,openingFund=0,notes=''}) {",
    "export async function openCash({branchId,openingFund=0,notes=''},user={}) {"
  );
  if(!src.includes("export async function openCash({branchId,openingFund=0,notes=''},user={}) {"))
    fail('No se pudo modificar firma openCash.');

  const openBegin="  const client=await pool.connect();\n  try{\n    await client.query('BEGIN');";
  const openPos=src.indexOf("export async function openCash(");
  const openBeginPos=src.indexOf(openBegin,openPos);
  if(openBeginPos<0)fail('No se encontró inicio de openCash.');
  src=src.slice(0,openBeginPos)+
      "  const actor=cashActor(user);\n"+src.slice(openBeginPos);

  const oldOpenValues="      ) VALUES($1,$2,$3,NOW(),$4,0,0,$4,'ABIERTA','LOCAL','GMX Local',$5,NOW())\n      RETURNING *\n    `,[id,branchId,branch.rows[0].nombre_sucursal,amount,notes||null]);";
  const newOpenValues="      ) VALUES($1,$2,$3,NOW(),$4,0,0,$4,'ABIERTA',$5,$6,$7,NOW())\n      RETURNING *\n    `,[id,branchId,branch.rows[0].nombre_sucursal,amount,actor.id,actor.name,notes||null]);";
  if(!src.includes(oldOpenValues))fail('No se encontró INSERT de apertura esperado.');
  src=src.replace(oldOpenValues,newOpenValues);

  src=src.replace(
    "export async function addCashMovement({\n  branchId,type,category='MANUAL',paymentMethod='EFECTIVO',\n  amount,reference='',description='',originModule='CAJA_LOCAL',originId=''\n}) {",
    "export async function addCashMovement({\n  branchId,type,category='MANUAL',paymentMethod='EFECTIVO',\n  amount,reference='',description='',originModule='CAJA_LOCAL',originId=''\n},user={}) {"
  );
  if(!src.includes("},user={}) {\n  const client=await pool.connect();"))
    fail('No se pudo modificar firma addCashMovement.');

  const addPos=src.indexOf("export async function addCashMovement(");
  const addBeginPos=src.indexOf(openBegin,addPos);
  if(addBeginPos<0)fail('No se encontró inicio de addCashMovement.');
  src=src.slice(0,addBeginPos)+
      "  const actor=cashActor(user);\n"+src.slice(addBeginPos);

  const oldMovValues="      ) VALUES($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'LOCAL','GMX Local',false)\n      RETURNING *\n    `,[\n      id,session.rows[0].id_caja,branchId,session.rows[0].sucursal,\n      normalizedType,normalizedCategory,\n      String(paymentMethod||'EFECTIVO').toUpperCase(),value,impact,\n      reference||null,description||null,originModule||'CAJA_LOCAL',originId||null\n    ]);";
  const newMovValues="      ) VALUES($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false)\n      RETURNING *\n    `,[\n      id,session.rows[0].id_caja,branchId,session.rows[0].sucursal,\n      normalizedType,normalizedCategory,\n      String(paymentMethod||'EFECTIVO').toUpperCase(),value,impact,\n      reference||null,description||null,originModule||'CAJA_LOCAL',originId||null,\n      actor.id,actor.name\n    ]);";
  if(!src.includes(oldMovValues))fail('No se encontró INSERT de movimiento esperado. Confirma que CAJA-FIX-002 está instalado.');
  src=src.replace(oldMovValues,newMovValues);

  src=src.replace(
    "export async function closeCash({branchId,countedCash,notes=''}) {",
    "export async function closeCash({branchId,countedCash,notes=''},user={}) {"
  );
  if(!src.includes("export async function closeCash({branchId,countedCash,notes=''},user={}) {"))
    fail('No se pudo modificar firma closeCash.');

  const closePos=src.indexOf("export async function closeCash(");
  const closeBeginPos=src.indexOf(openBegin,closePos);
  if(closeBeginPos<0)fail('No se encontró inicio de closeCash.');
  src=src.slice(0,closeBeginPos)+
      "  const actor=cashActor(user);\n"+src.slice(closeBeginPos);

  const oldClose=`      SET fecha_cierre=NOW(),efectivo_contado=$2::text,diferencia=$3,
          estado='CERRADA',id_admin_cierre='LOCAL',admin_cierre='GMX Local',
          notas_cierre=$4,fecha_actualizacion=NOW()
      WHERE id_caja=$1 RETURNING *
    \`,[fresh.id_caja,counted,difference,notes||null]);`;
  const newClose=`      SET fecha_cierre=NOW(),efectivo_contado=$2::text,diferencia=$3,
          estado='CERRADA',id_admin_cierre=$4,admin_cierre=$5,
          notas_cierre=$6,fecha_actualizacion=NOW()
      WHERE id_caja=$1 RETURNING *
    \`,[fresh.id_caja,counted,difference,actor.id,actor.name,notes||null]);`;
  if(!src.includes(oldClose))fail('No se encontró UPDATE de cierre esperado.');
  src=src.replace(oldClose,newClose);

  fs.writeFileSync(repo,src,'utf8');
}else{
  console.log('cashRepository.js ya tiene CAJA-AUTH-001.');
}

let rsrc=fs.readFileSync(route,'utf8');
if(!rsrc.includes('GMX_CAJA_AUTH_001')){
  backup(route,'CAJA_AUTH_001');

  rsrc=rsrc.replace(
    "try{res.status(201).json({success:true,data:await openCash(req.body)});}",
    "try{/* GMX_CAJA_AUTH_001 */res.status(201).json({success:true,data:await openCash(req.body,req.user)});}"
  );
  rsrc=rsrc.replace(
    "try{res.status(201).json({success:true,data:await addCashMovement(req.body)});}",
    "try{res.status(201).json({success:true,data:await addCashMovement(req.body,req.user)});}"
  );
  rsrc=rsrc.replace(
    "try{res.json({success:true,data:await closeCash(req.body)});}",
    "try{res.json({success:true,data:await closeCash(req.body,req.user)});}"
  );

  if(!rsrc.includes('openCash(req.body,req.user)') ||
     !rsrc.includes('addCashMovement(req.body,req.user)') ||
     !rsrc.includes('closeCash(req.body,req.user)')){
    fail('No se pudieron modificar las tres rutas de Caja.');
  }

  fs.writeFileSync(route,rsrc,'utf8');
}else{
  console.log('cash.js ya tiene CAJA-AUTH-001.');
}

for(const f of [repo,route]){
  const c=spawnSync('node',['--check',f],{encoding:'utf8'});
  if(c.status!==0){
    console.error(c.stdout||'');
    console.error(c.stderr||'');
    fail(`${path.basename(f)} no pasó node --check.`);
  }
}

console.log('CAJA-AUTH-001 aplicado correctamente.');
for(const [,b] of backups)console.log(`Backup: ${b}`);
