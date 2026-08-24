
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.argv[2] || 'C:\\Users\\SrsGarciaEspinoza\\Videos\\GMX';
const file = path.join(root,'frontend','src','pages','PurchasesCashPage.jsx');

if (!fs.existsSync(file)) {
  console.error(`No se encontro: ${file}`);
  process.exit(2);
}

const dir = path.dirname(file);
const base = path.basename(file);

// Buscar backup PREVIO al intento UI-ENCODING-001 V1.
// Excluimos V2/V3/current para no restaurar una version ya danada.
const candidates = fs.readdirSync(dir)
  .filter(n =>
    n.startsWith(base + '.UI_ENCODING_001_') &&
    n.endsWith('.bak') &&
    !n.includes('UI_ENCODING_001_V2') &&
    !n.includes('UI_ENCODING_001_V3')
  )
  .map(n => {
    const full = path.join(dir,n);
    return {name:n,full,mtime:fs.statSync(full).mtimeMs};
  })
  .sort((a,b)=>b.mtime-a.mtime);

if (!candidates.length) {
  console.error('No se encontro backup previo UI_ENCODING_001_*.bak.');
  console.error('No se modifico el archivo.');
  process.exit(3);
}

const source = candidates[0].full;
const stamp = new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const currentBackup = `${file}.UI_ENCODING_001_V3_CURRENT_${stamp}.bak`;
fs.copyFileSync(file,currentBackup);

function restoreCurrentAndFail(msg){
  try{ fs.copyFileSync(currentBackup,file); }catch(_){}
  console.error(msg);
  console.error(`Restaurado estado previo V3: ${currentBackup}`);
  process.exit(4);
}

try {
  // Restaurar fuente recuperable previa a V1.
  fs.copyFileSync(source,file);
  let text = fs.readFileSync(file,'utf8');

  // Mapeo explicito. Todo se expresa con escapes Unicode para que
  // este patcher sea ASCII-safe y no dependa de la pagina de codigos.
  const map = new Map([
    ['\u00C3\u00A1','\u00E1'], // a acute
    ['\u00C3\u00A9','\u00E9'], // e acute
    ['\u00C3\u00AD','\u00ED'], // i acute
    ['\u00C3\u00B3','\u00F3'], // o acute
    ['\u00C3\u00BA','\u00FA'], // u acute
    ['\u00C3\u00B1','\u00F1'], // n tilde

    ['\u00C3\u0081','\u00C1'], // A acute (latin1-style)
    ['\u00C3\u2030','\u00C9'], // E acute via cp1252 0x89
    ['\u00C3\u008D','\u00CD'], // I acute
    ['\u00C3\u201C','\u00D3'], // O acute via cp1252 0x93
    ['\u00C3\u0160','\u00DA'], // U acute via cp1252 0x9A
    ['\u00C3\u2018','\u00D1'], // N tilde via cp1252 0x91

    ['\u00C2\u00BF','\u00BF'], // inverted question
    ['\u00C2\u00A1','\u00A1'], // inverted exclamation
    ['\u00C2\u00B7','\u00B7'], // middle dot
    ['\u00C2\u00B0','\u00B0'], // degree

    ['\u00E2\u20AC\u00A6','\u2026'], // ellipsis
    ['\u00E2\u20AC\u201D','\u2014'], // em dash
    ['\u00E2\u20AC\u201C','\u2013'], // en dash
    ['\u00E2\u2020\u2019','\u2192'], // right arrow
    ['\u00E2\u2020\u0090','\u2190'], // left arrow
    ['\u00E2\u0152\u201E','\u2304'], // down caret
    ['\u00C3\u2014','\u00D7'],       // multiplication sign

    ['\u00E2\u20AC\u0153','\u201C'], // left double quote
    ['\u00E2\u20AC\u009D','\u201D'], // right double quote
    ['\u00E2\u20AC\u02DC','\u2018'], // left single quote
    ['\u00E2\u20AC\u2122','\u2019']  // right single quote
  ]);

  for (const [bad,good] of map) {
    text = text.split(bad).join(good);
  }

  fs.writeFileSync(file,text,'utf8');

  // Validacion de residuos clasicos y replacement char.
  const suspicious = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line,idx)=>{
    if (line.includes('\u00C3') || line.includes('\u00C2') ||
        line.includes('\u00E2') || line.includes('\uFFFD')) {
      suspicious.push(`${idx+1}: ${line}`);
    }
  });

  if (suspicious.length) {
    console.error('Quedan secuencias sospechosas despues de reparar:');
    console.error(suspicious.slice(0,30).join('\n'));
    restoreCurrentAndFail(`UI-ENCODING-001 V3 detecto ${suspicious.length} lineas sospechosas.`);
  }

  const build = spawnSync('npm',['run','build'],{
    cwd:path.join(root,'frontend'),
    encoding:'utf8',
    shell:true
  });

  process.stdout.write(build.stdout || '');
  process.stderr.write(build.stderr || '');

  if (build.status !== 0) {
    restoreCurrentAndFail(`Build fallo con codigo ${build.status}.`);
  }

  console.log('');
  console.log('UI-ENCODING-001 V3 aplicado correctamente.');
  console.log(`Fuente restaurada: ${source}`);
  console.log(`Backup estado previo V3: ${currentBackup}`);
} catch (e) {
  restoreCurrentAndFail(e && e.message ? e.message : String(e));
}
