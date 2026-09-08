#!/usr/bin/env node
/* SHINY_BACKUP_RUNTIME_REPAIR_R5_EXACT
 * Instala SIEMPRE el mismo agente fuente certificado.
 * Corrige propietarios/permisos y verifica copia exacta.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');

function die(m){ console.error(`[SHINY BACKUP R4 ERROR] ${m}`); process.exit(40); }
function run(cmd,args,opts={}){
  return spawnSync(cmd,args,{encoding:'utf8',stdio:'pipe',...opts});
}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}

if(process.platform!=='linux'){
  console.log('[SHINY BACKUP R4] No es Linux; se omite provision.');
  process.exit(0);
}
if(typeof process.getuid==='function' && process.getuid()!==0){
  die('ROOT_REQUIRED_FOR_RUNTIME_REPAIR');
}

const appDir=process.env.APP_DIR||'/opt/shiny/app';
const src=path.join(appDir,'backend','scripts','shiny-backup-agent.sh');
const dstDir='/usr/local/lib/shiny-backup';
const dst=path.join(dstDir,'shiny-backup-agent.sh');
const sudoers='/etc/sudoers.d/shiny-backup';

if(!fs.existsSync(src)) die(`AGENT_SOURCE_MISSING ${src}`);
let text=fs.readFileSync(src,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
if(!text.includes('SHINY_BACKUP_ENGINE_CANONICAL_R5_EXACT')) die('AGENT_SOURCE_NOT_R4');
if(!text.includes('format:1')) die('AGENT_SOURCE_FORMAT1_MISSING');
fs.writeFileSync(src,text,{encoding:'utf8',mode:0o755});

let q=run('/bin/bash',['-n',src]);
if((q.status??1)!==0) die(`AGENT_BASH_INVALID ${(q.stderr||q.stdout||'').trim()}`);

const dirs=[
  ['/usr/bin/install',['-d','-o','root','-g','postgres','-m','0710','/var/lib/shiny-backup']],
  ['/usr/bin/install',['-d','-o','root','-g','root','-m','0700','/var/lib/shiny-backup/backups']],
  ['/usr/bin/install',['-d','-o','postgres','-g','postgres','-m','0700','/var/lib/shiny-backup/tmp']],
  ['/usr/bin/install',['-d','-o','root','-g','root','-m','0755',dstDir]]
];
for(const [cmd,args] of dirs){
  const r=run(cmd,args);
  if((r.status??1)!==0) die(`STORAGE_PREP_FAILED ${(r.stderr||r.stdout||'').trim()}`);
}

fs.copyFileSync(src,dst);
fs.chmodSync(dst,0o755);
if(sha(src)!==sha(dst)) die('AGENT_COPY_SHA_MISMATCH');

let appUser=String(process.env.APP_USER||'').trim();
if(!appUser){
  const s=run('/bin/systemctl',['show','-p','User','--value','shiny-app.service']);
  if((s.status??1)===0) appUser=String(s.stdout||'').trim();
}
if(!appUser) appUser='shiny';

const id=run('/usr/bin/id',['-u',appUser]);
if((id.status??1)!==0) die(`APP_USER_NOT_FOUND ${appUser}`);

fs.writeFileSync(sudoers,`${appUser} ALL=(root) NOPASSWD: ${dst}\n`,{encoding:'utf8',mode:0o440});
fs.chmodSync(sudoers,0o440);

const vs=run('/usr/sbin/visudo',['-cf',sudoers]);
if((vs.status??1)!==0){
  try{fs.unlinkSync(sudoers);}catch{}
  die(`SUDOERS_INVALID ${(vs.stderr||vs.stdout||'').trim()}`);
}

const syntax=run('/bin/bash',['-n',dst]);
if((syntax.status??1)!==0) die('INSTALLED_AGENT_BASH_INVALID');

console.log('[SHINY BACKUP R4] Agente canonico instalado.');
console.log(`[SHINY BACKUP R4] SHA256 ${sha(dst)}`);
console.log('[SHINY BACKUP R4] storage: root:postgres 0710 / tmp postgres:postgres 0700');