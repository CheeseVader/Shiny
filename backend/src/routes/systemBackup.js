/* SHINY_SYSTEM_BACKUP_ONE_CLICK_R1 */
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
      if(code!==0) return reject(new Error(String(err||out||`BACKUP_AGENT_EXIT_${code}`).trim()));
      resolve(String(out).trim());
    });
  });
}

router.get('/status',async(_req,res)=>{
  try{
    const out=await runAgent('status',60000);
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data:JSON.parse(out||'{}')});
  }catch(e){
    res.status(500).json({success:false,error:'BACKUP_STATUS_FAILED',message:String(e.message||e)});
  }
});

router.post('/backup',async(_req,res)=>{
  try{
    const detail=await runAgent('backup');
    res.json({success:true,message:'Respaldo creado y subido correctamente.',detail});
  }catch(e){
    res.status(500).json({success:false,error:'BACKUP_FAILED',message:String(e.message||e)});
  }
});

export default router;