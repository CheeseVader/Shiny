
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const file=path.join(root,'frontend','src','components','GlobalOperationProgress.jsx');

if(!fs.existsSync(file)){
  console.error(`No se encontro: ${file}`);
  process.exit(2);
}

let text=fs.readFileSync(file,'utf8');
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=`${file}.GLOBAL_ENCODING_001_V2_${stamp}.bak`;
fs.copyFileSync(file,backup);

function fail(msg){
  try{fs.copyFileSync(backup,file);}catch(_){}
  console.error(msg);
  console.error(`Se restauro el backup: ${backup}`);
  process.exit(3);
}

const map = new Map([
  ['\u00C3\u00A1','\u00E1'],
  ['\u00C3\u00A9','\u00E9'],
  ['\u00C3\u00AD','\u00ED'],
  ['\u00C3\u00B3','\u00F3'],
  ['\u00C3\u00BA','\u00FA'],
  ['\u00C3\u00B1','\u00F1'],
  ['\u00C3\u0081','\u00C1'],
  ['\u00C3\u2030','\u00C9'],
  ['\u00C3\u008D','\u00CD'],
  ['\u00C3\u201C','\u00D3'],
  ['\u00C3\u0160','\u00DA'],
  ['\u00C3\u2018','\u00D1'],
  ['\u00C2\u00BF','\u00BF'],
  ['\u00C2\u00A1','\u00A1'],
  ['\u00C2\u00B7','\u00B7'],
  ['\u00E2\u20AC\u00A6','\u2026'],
  ['\u00E2\u20AC\u201D','\u2014'],
  ['\u00E2\u20AC\u201C','\u2013'],
  ['\u00E2\u2020\u2019','\u2192'],
  ['\u00C3\u2014','\u00D7']
]);

for(const [bad,good] of map){
  text=text.split(bad).join(good);
}

fs.writeFileSync(file,text,'utf8');

// Validar residuos comunes de mojibake/replacement char.
// No usamos "node --check" porque Node 24 no valida .jsx directamente.
const residual=[];
text.split(/\r?\n/).forEach((line,i)=>{
  if(line.includes('\u00C3')||line.includes('\u00C2')||line.includes('\u00E2')||line.includes('\uFFFD')){
    residual.push(`${i+1}: ${line}`);
  }
});

if(residual.length){
  console.error('Quedaron secuencias de codificacion sospechosas:');
  console.error(residual.slice(0,30).join('\n'));
  fail(`GLOBAL-ENCODING-001 V2 detecto ${residual.length} linea(s) sospechosa(s).`);
}

// Vite/Rolldown es la validacion sintactica real del JSX.
const build=spawnSync('npm',['run','build'],{
  cwd:path.join(root,'frontend'),
  encoding:'utf8',
  shell:true
});
process.stdout.write(build.stdout||'');
process.stderr.write(build.stderr||'');

if(build.status!==0){
  fail(`El build del frontend fallo con codigo ${build.status}.`);
}

console.log('');
console.log('GLOBAL-ENCODING-001 V2 aplicado correctamente.');
console.log(`Backup: ${backup}`);
