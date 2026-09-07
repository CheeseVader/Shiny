/* SHINY_SYSTEM_BACKUP_ONE_CLICK_R138_PRIVATE */
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

function publicBackupError(raw){
  const s=String(raw||'');

  if(/PG_DUMP_FAILED|pg_dump/i.test(s)) return {
    error:'PG_DUMP_FAILED',
    diagnosticCode:'BKP-DB',
    message:'No fue posible generar el respaldo de la base de datos.'
  };

  if(/BACKUP_REPO_MUST_BE_PRIVATE/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-PRIVATE',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/CREDENTIAL_MIGRATION_DECRYPT_FAILED/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-CRED-KEY',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/CREDENTIAL_MIGRATION_(ASSET_MISSING|DOWNLOAD_FAILED|RELEASE_UNAVAILABLE)/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-CRED-ASSET',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/BACKUP_TOKEN_(WRITE_REQUIRED|VALIDATION_FAILED)|BACKUP_ACCESS_CHECK_FAILED/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-CRED-WRITE',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/BACKUP_RELEASE_CREATE_FAILED_AFTER_MIGRATION/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-RELEASE-AFTER-CRED',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/BACKUP_RELEASE_CREATE_FAILED/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-RELEASE',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/BACKUP_UPLOAD_DATABASE_FAILED/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-UPLOAD-DB',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/BACKUP_UPLOAD_CONFIG_FAILED/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-UPLOAD-CONFIG',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/BACKUP_UPLOAD_FILES_FAILED/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-UPLOAD-FILES',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/BACKUP_UPLOAD_MANIFEST_FAILED/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-UPLOAD-MANIFEST',
    message:'No fue posible almacenar el respaldo.'
  };

  if(/GITHUB|HTTP_4|HTTP_5|release|upload|TOKEN|CREDENTIAL|STORAGE/i.test(s)) return {
    error:'BACKUP_STORAGE_FAILED',
    diagnosticCode:'BKP-STORAGE',
    message:'No fue posible almacenar el respaldo.'
  };

  return {
    error:'BACKUP_FAILED',
    diagnosticCode:'BKP-GENERAL',
    message:'No fue posible completar el respaldo.'
  };
}

router.get('/status',async(_req,res)=>{
  try{
    const out=await runAgent('status',60000);
    const data=JSON.parse(out||'{}');
    delete data.repo;
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data});
  }catch(e){
    console.error('[system-backup/status]',String(e?.message||e));
    res.status(500).json({
      success:false,
      error:'BACKUP_STATUS_FAILED',
      diagnosticCode:'BKP-STATUS',
      message:'No fue posible consultar el estado del respaldo.'
    });
  }
});

router.post('/backup',async(_req,res)=>{
  try{
    await runAgent('backup');
    res.json({
      success:true,
      message:'Respaldo creado correctamente.'
    });
  }catch(e){
    console.error('[system-backup/backup]',String(e?.message||e));
    const pub=publicBackupError(e?.message||e);
    res.status(500).json({success:false,...pub});
  }
});

export default router;