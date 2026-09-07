/* SHINY_SYSTEM_BACKUP_R130 */
import { Router } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_WIN = process.platform === 'win32';

const LINUX_AGENT = '/usr/local/lib/shiny-backup/shiny-backup-agent.sh';
const WINDOWS_AGENT = path.resolve(__dirname,'../../scripts/shiny-backup-agent.ps1');

function role(req){ return String(req.user?.rol || req.user?.role || '').toUpperCase(); }
router.use((req,res,next)=>{
  if(role(req)!=='SUPERADMIN') return res.status(403).json({success:false,error:'SUPERADMIN_REQUIRED'});
  next();
});

function databaseName(){
  if(process.env.DB_NAME) return String(process.env.DB_NAME);
  if(process.env.PGDATABASE) return String(process.env.PGDATABASE);
  if(process.env.DATABASE_URL){
    try{return decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//,''));}catch{}
  }
  return 'shiny_db';
}

function runAgent(action,{stdin='',timeout=15*60*1000}={}){
  return new Promise((resolve,reject)=>{
    const command = IS_WIN ? 'powershell.exe' : 'sudo';
    const args = IS_WIN
      ? ['-NoProfile','-ExecutionPolicy','Bypass','-File',WINDOWS_AGENT,action]
      : ['-n',LINUX_AGENT,action];

    const child=spawn(command,args,{
      stdio:['pipe','pipe','pipe'],
      env:{...process.env}
    });
    let out='',err='';
    const timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}},timeout);
    child.stdout.on('data',d=>{out+=String(d)});
    child.stderr.on('data',d=>{err+=String(d)});
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0) return reject(new Error(String(err||out||`BACKUP_AGENT_EXIT_${code}`).trim()));
      resolve(String(out).trim());
    });
    if(stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

router.get('/status',async(_req,res)=>{
  try{
    const out=await runAgent('status',{timeout:30000});
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data:JSON.parse(out)});
  }catch(e){res.status(500).json({success:false,error:'BACKUP_STATUS_FAILED',message:String(e.message||e)})}
});

router.post('/configure',async(req,res)=>{
  try{
    const token=String(req.body?.token||'').trim();
    const passphrase=String(req.body?.passphrase||'');
    const owner=String(req.body?.owner||'').trim();
    const repo=String(req.body?.repo||'').trim();
    if(token.length<20) return res.status(400).json({success:false,error:'BACKUP_TOKEN_REQUIRED'});
    if(passphrase.length<12) return res.status(400).json({success:false,error:'BACKUP_PASSPHRASE_TOO_SHORT'});

    const token64=Buffer.from(token,'utf8').toString('base64');
    const pass64=Buffer.from(passphrase,'utf8').toString('base64');
    const stdin=[token64,pass64,databaseName(),owner,repo].join('\n')+'\n';
    await runAgent('configure',{stdin,timeout:60000});
    res.json({success:true,message:'Respaldo multiplataforma configurado.'});
  }catch(e){res.status(500).json({success:false,error:'BACKUP_CONFIG_FAILED',message:String(e.message||e)})}
});

for(const [pathName,action,message] of [
  ['create','create','Respaldo portable creado.'],
  ['upload','upload','Respaldo subido al repositorio privado.'],
  ['backup','backup','Respaldo portable creado y subido.']
]){
  router.post('/'+pathName,async(_req,res)=>{
    try{
      const detail=await runAgent(action);
      res.json({success:true,message,detail});
    }catch(e){res.status(500).json({success:false,error:'BACKUP_FAILED',message:String(e.message||e)})}
  });
}

router.get('/remote',async(_req,res)=>{
  try{
    const out=await runAgent('remote',{timeout:60000});
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data:JSON.parse(out||'[]')});
  }catch(e){res.status(500).json({success:false,error:'BACKUP_REMOTE_FAILED',message:String(e.message||e)})}
});

router.post('/restore-latest',async(req,res)=>{
  try{
    if(String(req.body?.confirmation||'')!=='RESTAURAR'){
      return res.status(400).json({success:false,error:'RESTORE_CONFIRMATION_REQUIRED'});
    }
    const detail=await runAgent('restore-latest',{timeout:30*60*1000});
    res.json({success:true,message:'Último respaldo restaurado correctamente.',detail});
  }catch(e){res.status(500).json({success:false,error:'BACKUP_RESTORE_FAILED',message:String(e.message||e)})}
});

router.get('/platform',(_req,res)=>{
  res.json({success:true,data:{platform:process.platform,portable:true}});
});

export default router;