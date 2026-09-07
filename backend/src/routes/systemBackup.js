/* SHINY_SYSTEM_BACKUP_ENGINE_CLEAN_R1 */
import { Router } from 'express';
import { spawn } from 'node:child_process';

const router = Router();
const AGENT = '/usr/local/lib/shiny-backup/shiny-backup-agent.sh';

function role(req){ return String(req.user?.rol || req.user?.role || '').toUpperCase(); }
router.use((req,res,next)=>{
  if(role(req)!=='SUPERADMIN') return res.status(403).json({success:false,error:'SUPERADMIN_REQUIRED'});
  next();
});

function runAgent(action,timeout=30*60*1000){
  return new Promise((resolve,reject)=>{
    const child=spawn('sudo',['-n',AGENT,action],{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    const timer=setTimeout(()=>{ try{child.kill('SIGKILL')}catch{} },timeout);
    child.stdout.on('data',d=>out+=d.toString());
    child.stderr.on('data',d=>err+=d.toString());
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0){
        const e=new Error(String(err||out||`BACKUP_AGENT_EXIT_${code}`).trim());
        e.exitCode=code;
        return reject(e);
      }
      resolve(String(out).trim());
    });
  });
}

function cleanPart(v,fallback){
  const s=String(v||fallback||'UNKNOWN').toUpperCase().replace(/[^A-Z0-9_]+/g,'_');
  return s.slice(0,64)||fallback||'UNKNOWN';
}

function publicBackupError(raw){
  const s=String(raw||'');
  const stage=cleanPart(s.match(/BKP_STAGE=([A-Z0-9_]+)/i)?.[1],'UNKNOWN');
  const code=cleanPart(s.match(/BKP_CODE=([A-Z0-9_]+)/i)?.[1],'UNKNOWN');
  const diagnosticCode=`BKP-${stage}-${code}`.slice(0,140);

  let message='No fue posible completar el respaldo.';
  if(stage==='DATABASE_DUMP'||stage==='DATABASE_IDENTITY'){
    message='No fue posible generar el respaldo de la base de datos.';
  }else if(stage==='REPOSITORY_ACCESS'||stage==='RELEASE_CREATE'){
    message='No fue posible crear el respaldo remoto.';
  }else if(stage==='APP_RELEASE'||stage==='APP_MANIFEST_DOWNLOAD'){
    message='No fue posible validar la versión instalada para el respaldo.';
  }else if(stage==='CONFIG_ARCHIVE'||stage==='UPLOADS_ARCHIVE'){
    message='No fue posible preparar los archivos del respaldo.';
  }else if(stage.startsWith('UPLOAD_')){
    message='No fue posible subir los archivos del respaldo.';
  }else if(stage==='MANIFEST_BUILD'){
    message='No fue posible preparar el manifiesto del respaldo.';
  }else if(stage==='FINALIZE'){
    message='El respaldo remoto no pudo registrarse localmente.';
  }else if(stage==='DEPENDENCIES'||stage==='WORKDIR'){
    message='No fue posible preparar el entorno de respaldo.';
  }

  return {
    error:'BACKUP_FAILED',
    diagnosticCode,
    message:`${message} (${diagnosticCode})`
  };
}

router.get('/status',async(_req,res)=>{
  try{
    const out=await runAgent('status',60000);
    const data=JSON.parse(out||'{}');
    delete data.repo;
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
    res.json({success:true,data});
  }catch(e){
    console.error('[system-backup/status]',String(e?.message||e));
    res.status(500).json({
      success:false,
      error:'BACKUP_STATUS_FAILED',
      diagnosticCode:'BKP-STATUS',
      message:'No fue posible consultar el estado del respaldo. (BKP-STATUS)'
    });
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
