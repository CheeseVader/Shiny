/* SHINY_SYSTEM_UPDATE_R1 */
import { Router } from 'express';
import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';

const router = Router();
const APP_DIR = process.env.SHINY_APP_DIR || '/opt/shiny/app';
const VERSION_FILE = `${APP_DIR}/VERSION`;
const AGENT = '/usr/local/lib/shiny-updater/shiny-update-agent.sh';
const RELEASE_API = 'https://api.github.com/repos/CheeseVader/Shiny-Release/releases/latest';

function role(req){ return String(req.user?.rol || req.user?.role || '').toUpperCase(); }
function superadmin(req,res,next){
  if(role(req)!=='SUPERADMIN') return res.status(403).json({success:false,error:'SUPERADMIN_REQUIRED'});
  next();
}
function currentVersion(){
  try{return fs.readFileSync(VERSION_FILE,'utf8').trim() || '0.0.0';}catch{return '0.0.0';}
}
function sudoAgent(action){
  return new Promise((resolve,reject)=>{
    execFile('sudo',['-n',AGENT,action],{timeout:120000,maxBuffer:1024*1024},(e,stdout,stderr)=>{
      if(e){ const x=new Error(String(stderr||stdout||e.message).trim()||e.message); x.code=e.code; return reject(x); }
      resolve(String(stdout||''));
    });
  });
}
async function latestVersion(){
  const r=await fetch(RELEASE_API,{headers:{Accept:'application/vnd.github+json','User-Agent':'Shiny-System-Update/1.0'}});
  if(!r.ok)throw new Error(`GITHUB_RELEASE_HTTP_${r.status}`);
  const j=await r.json();
  return String(j.tag_name||'').replace(/^v/,'');
}
async function bridgeReady(){
  if(process.platform!=='linux')return false;
  try{await sudoAgent('status');return true;}catch{return false;}
}

router.use(superadmin);

router.get('/status',async(_req,res)=>{
  try{
    const current=currentVersion();
    let latest=null,remoteError=null;
    try{latest=await latestVersion();}catch(e){remoteError=String(e.message||e);}
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data:{current,latest,updateAvailable:!!latest&&latest!==current,bridgeReady:await bridgeReady(),remoteError}});
  }catch(e){res.status(500).json({success:false,error:'UPDATE_STATUS_FAILED',message:String(e.message||e)});}
});

router.post('/check',async(_req,res)=>{
  try{
    const out=await sudoAgent('check');
    res.json({success:true,data:{output:out,current:currentVersion()}});
  }catch(e){
    const msg=String(e.message||e);
    res.status(503).json({success:false,error:'UPDATE_BRIDGE_REQUIRED',message:msg.includes('password')?'Puente privilegiado no instalado.':'No fue posible ejecutar el updater.',detail:msg.slice(0,500)});
  }
});

router.post('/install',async(_req,res)=>{
  if(process.platform!=='linux')return res.status(400).json({success:false,error:'RPI_ONLY'});
  if(!(await bridgeReady()))return res.status(503).json({success:false,error:'UPDATE_BRIDGE_REQUIRED',message:'El puente seguro de actualización todavía no está instalado.'});
  try{
    const child=spawn('sudo',['-n',AGENT,'install'],{detached:true,stdio:'ignore'});
    child.unref();
    res.status(202).json({success:true,data:{started:true,current:currentVersion()}});
  }catch(e){res.status(500).json({success:false,error:'UPDATE_START_FAILED',message:String(e.message||e)});}
});

export default router;