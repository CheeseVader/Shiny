/* SHINY_SYSTEM_BACKUP_RUNTIME_R140 */
import { Router } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const router = Router();
const AGENT = '/usr/local/lib/shiny-backup/shiny-backup-agent.sh';
const AGENT_MARKER = 'SHINY_BACKUP_ENGINE_CLEAN_R140';

function role(req){ return String(req.user?.rol || req.user?.role || '').toUpperCase(); }
router.use((req,res,next)=>{
  if(role(req)!=='SUPERADMIN') return res.status(403).json({success:false,error:'SUPERADMIN_REQUIRED'});
  next();
});

function marker(stage,code){
  return `[ERROR] BKP_STAGE=${stage}\n[ERROR] BKP_CODE=${code}`;
}

function classifyRuntime(raw,exitCode){
  const s=String(raw||'');
  if(/BKP_STAGE=/i.test(s)&&/BKP_CODE=/i.test(s)) return s;
  if(/password is required/i.test(s)) return `${s}\n${marker('RUNTIME','SUDO_PASSWORD_REQUIRED')}`;
  if(/not allowed to execute|sudoers/i.test(s)) return `${s}\n${marker('RUNTIME','SUDO_NOT_ALLOWED')}`;
  if(/No such file or directory/i.test(s)) return `${s}\n${marker('RUNTIME','AGENT_NOT_FOUND')}`;
  if(/Permission denied/i.test(s)) return `${s}\n${marker('RUNTIME','AGENT_PERMISSION_DENIED')}`;
  if(/bash\\r|bash\r/i.test(s)) return `${s}\n${marker('RUNTIME','AGENT_CRLF')}`;
  if(/syntax error|unexpected EOF/i.test(s)) return `${s}\n${marker('RUNTIME','AGENT_SYNTAX_ERROR')}`;
  const n=Number.isInteger(exitCode)?exitCode:'UNKNOWN';
  return `${s}\n${marker('RUNTIME',`AGENT_EXIT_${n}`)}`;
}

function localRuntimePreflight(){
  if(!fs.existsSync(AGENT)) throw new Error(marker('RUNTIME','AGENT_NOT_INSTALLED'));
  try{ fs.accessSync(AGENT,fs.constants.R_OK|fs.constants.X_OK); }
  catch{ throw new Error(marker('RUNTIME','AGENT_NOT_EXECUTABLE')); }

  let head='';
  try{ head=fs.readFileSync(AGENT,'utf8').slice(0,8192); }
  catch{ throw new Error(marker('RUNTIME','AGENT_NOT_READABLE')); }

  if(head.includes('\r')) throw new Error(marker('RUNTIME','AGENT_CRLF'));
  if(!head.includes(AGENT_MARKER)) throw new Error(marker('RUNTIME','AGENT_VERSION_MISMATCH'));
}

function runAgent(action,timeout=30*60*1000){
  return new Promise((resolve,reject)=>{
    try{ localRuntimePreflight(); }
    catch(e){ reject(e); return; }

    const child=spawn('/usr/bin/sudo',['-n',AGENT,action],{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    const timer=setTimeout(()=>{ try{child.kill('SIGKILL')}catch{} },timeout);

    child.stdout.on('data',d=>out+=d.toString());
    child.stderr.on('data',d=>err+=d.toString());

    child.on('error',e=>{
      clearTimeout(timer);
      reject(new Error(`${String(e?.message||e)}\n${marker('RUNTIME','SPAWN_FAILED')}`));
    });

    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0){
        const raw=String(err||out||'').trim();
        const e=new Error(classifyRuntime(raw,code));
        e.exitCode=code;
        return reject(e);
      }
      resolve(String(out).trim());
    });
  });
}

function cleanPart(v,fallback){
  const s=String(v||fallback||'UNKNOWN').toUpperCase().replace(/[^A-Z0-9_]+/g,'_');
  return s.slice(0,80)||fallback||'UNKNOWN';
}

function publicBackupError(raw){
  const s=String(raw||'');
  const stage=cleanPart(s.match(/BKP_STAGE=([A-Z0-9_]+)/i)?.[1],'RUNTIME');
  const code=cleanPart(s.match(/BKP_CODE=([A-Z0-9_]+)/i)?.[1],'UNCLASSIFIED');
  const diagnosticCode=`BKP-${stage}-${code}`.slice(0,160);

  let message='No fue posible completar el respaldo.';
  if(stage==='RUNTIME') message='No fue posible iniciar el motor de respaldo.';
  else if(stage==='DATABASE_DUMP'||stage==='DATABASE_IDENTITY') message='No fue posible generar el respaldo de la base de datos.';
  else if(stage==='REPOSITORY_ACCESS'||stage==='RELEASE_CREATE') message='No fue posible crear el respaldo remoto.';
  else if(stage==='APP_RELEASE'||stage==='APP_MANIFEST_DOWNLOAD') message='No fue posible validar la versión instalada para el respaldo.';
  else if(stage==='CONFIG_ARCHIVE'||stage==='UPLOADS_ARCHIVE') message='No fue posible preparar los archivos del respaldo.';
  else if(stage.startsWith('UPLOAD_')) message='No fue posible subir los archivos del respaldo.';
  else if(stage==='MANIFEST_BUILD') message='No fue posible preparar el manifiesto del respaldo.';
  else if(stage==='FINALIZE') message='El respaldo remoto no pudo registrarse localmente.';
  else if(stage==='DEPENDENCIES'||stage==='WORKDIR'||stage==='CONFIG_LOAD'||stage==='CONFIG_VALIDATE') message='No fue posible preparar el entorno de respaldo.';

  return {error:'BACKUP_FAILED',diagnosticCode,message:`${message} (${diagnosticCode})`};
}

router.get('/status',async(_req,res)=>{
  try{
    const out=await runAgent('status',60000);
    const data=JSON.parse(out||'{}');
    delete data.repo;
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
    res.json({success:true,data});
  }catch(e){
    const raw=String(e?.message||e);
    console.error('[system-backup/status]',raw);
    const pub=publicBackupError(raw);
    res.status(500).json({success:false,...pub});
  }
});

router.post('/backup',async(_req,res)=>{
  try{
    await runAgent('backup');
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,message:'Respaldo creado correctamente.'});
  }catch(e){
    const raw=String(e?.message||e);
    console.error('[system-backup/backup]',raw);
    const pub=publicBackupError(raw);
    res.status(500).json({success:false,...pub});
  }
});

export default router;
