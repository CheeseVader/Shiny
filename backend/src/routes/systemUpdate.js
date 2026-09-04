/* SHINY_SYSTEM_UPDATE_R2 */
import { Router } from 'express';
import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';

const router = Router();

const IS_LINUX = process.platform === 'linux';
const APP_DIR = process.env.SHINY_APP_DIR || '/opt/shiny/app';
const VERSION_FILE = `${APP_DIR}/VERSION`;
const AGENT = '/usr/local/lib/shiny-updater/shiny-update-agent.sh';
const RELEASE_API = 'https://api.github.com/repos/CheeseVader/Shiny-Release/releases/latest';

const DEV_VERSION = process.env.SHINY_DEV_VERSION || '0.0.0-dev';
const DEV_GITHUB_TOKEN =
  process.env.SHINY_GITHUB_TOKEN ||
  process.env.GITHUB_TOKEN ||
  '';

function role(req){
  return String(req.user?.rol || req.user?.role || '').toUpperCase();
}

function superadmin(req,res,next){
  if(role(req)!=='SUPERADMIN'){
    return res.status(403).json({
      success:false,
      error:'SUPERADMIN_REQUIRED'
    });
  }

  next();
}

function currentVersion(){
  if(!IS_LINUX){
    return DEV_VERSION;
  }

  try{
    return fs.readFileSync(VERSION_FILE,'utf8').trim() || '0.0.0';
  }catch{
    return '0.0.0';
  }
}

function sudoAgent(action){
  return new Promise((resolve,reject)=>{
    execFile(
      'sudo',
      ['-n',AGENT,action],
      {
        timeout:120000,
        maxBuffer:1024*1024
      },
      (e,stdout,stderr)=>{
        if(e){
          const x=new Error(
            String(stderr||stdout||e.message).trim() || e.message
          );

          x.code=e.code;
          return reject(x);
        }

        resolve(String(stdout||''));
      }
    );
  });
}

function parseAgentStatus(output){
  const text=String(output||'');

  const currentMatch=text.match(
    /^CURRENT_VERSION=(.+)$/m
  );

  const current=String(
    currentMatch?.[1] || currentVersion()
  ).trim();

  const jsonStart=text.indexOf('{');

  if(jsonStart<0){
    return {
      current,
      latest:null,
      agentStatus:null,
      agentMessage:null,
      checkedAt:null
    };
  }

  try{
    const state=JSON.parse(text.slice(jsonStart));

    return {
      current:String(
        state.current_version || current
      ).trim(),

      latest:state.available_version
        ? String(state.available_version).trim()
        : null,

      agentStatus:state.status || null,
      agentMessage:state.message || null,
      checkedAt:state.checked_at || null
    };
  }catch{
    return {
      current,
      latest:null,
      agentStatus:null,
      agentMessage:null,
      checkedAt:null
    };
  }
}

async function latestVersion(){
  const headers={
    Accept:'application/vnd.github+json',
    'User-Agent':'Shiny-System-Update/2.0',
    'X-GitHub-Api-Version':'2022-11-28'
  };

  if(DEV_GITHUB_TOKEN){
    headers.Authorization=`Bearer ${DEV_GITHUB_TOKEN}`;
  }

  const r=await fetch(
    RELEASE_API,
    {headers}
  );

  if(!r.ok){
    throw new Error(
      `GITHUB_RELEASE_HTTP_${r.status}`
    );
  }

  const j=await r.json();

  return String(
    j.tag_name || ''
  ).replace(/^v/,'');
}

async function bridgeReady(){
  if(!IS_LINUX){
    return false;
  }

  try{
    await sudoAgent('status');
    return true;
  }catch{
    return false;
  }
}

async function linuxStatus(){
  const bridge=await bridgeReady();
  const fallbackCurrent=currentVersion();

  if(!bridge){
    return {
      current:fallbackCurrent,
      latest:null,
      updateAvailable:false,
      bridgeReady:false,
      bridgeRequired:true,
      platform:process.platform,
      environment:'production',
      remoteError:null,
      agentStatus:null,
      agentMessage:null,
      checkedAt:null
    };
  }

  try{
    const out=await sudoAgent('status');
    const state=parseAgentStatus(out);

    return {
      current:state.current,
      latest:state.latest,
      updateAvailable:
        !!state.latest &&
        state.latest!==state.current,

      bridgeReady:true,
      bridgeRequired:true,
      platform:process.platform,
      environment:'production',
      remoteError:null,
      agentStatus:state.agentStatus,
      agentMessage:state.agentMessage,
      checkedAt:state.checkedAt
    };
  }catch(e){
    return {
      current:fallbackCurrent,
      latest:null,
      updateAvailable:false,
      bridgeReady:false,
      bridgeRequired:true,
      platform:process.platform,
      environment:'production',
      remoteError:String(e.message||e),
      agentStatus:null,
      agentMessage:null,
      checkedAt:null
    };
  }
}

async function developmentStatus(){
  const current=currentVersion();

  let latest=null;
  let remoteError=null;

  try{
    latest=await latestVersion();
  }catch(e){
    remoteError=String(e.message||e);
  }

  return {
    current,
    latest,
    updateAvailable:
      !!latest &&
      latest!==current,

    bridgeReady:false,
    bridgeRequired:false,
    platform:process.platform,
    environment:'development',
    remoteError,
    agentStatus:null,
    agentMessage:null,
    checkedAt:null
  };
}

router.use(superadmin);

router.get('/status',async(_req,res)=>{
  try{
    const data=IS_LINUX
      ? await linuxStatus()
      : await developmentStatus();

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    res.json({
      success:true,
      data
    });
  }catch(e){
    res.status(500).json({
      success:false,
      error:'UPDATE_STATUS_FAILED',
      message:String(e.message||e)
    });
  }
});

router.post('/check',async(_req,res)=>{
  if(!IS_LINUX){
    try{
      const latest=await latestVersion();
      const current=currentVersion();

      return res.json({
        success:true,
        data:{
          current,
          latest,
          updateAvailable:
            !!latest &&
            latest!==current,

          bridgeReady:false,
          bridgeRequired:false,
          platform:process.platform,
          environment:'development',
          remoteError:null
        }
      });
    }catch(e){
      return res.status(502).json({
        success:false,
        error:'UPDATE_REMOTE_CHECK_FAILED',
        message:String(e.message||e)
      });
    }
  }

  try{
    const out=await sudoAgent('check');
    const statusOut=await sudoAgent('status');
    const state=parseAgentStatus(statusOut);

    res.json({
      success:true,
      data:{
        output:out,
        current:state.current,
        latest:state.latest,
        updateAvailable:
          !!state.latest &&
          state.latest!==state.current,

        bridgeReady:true,
        bridgeRequired:true,
        platform:process.platform,
        environment:'production',
        remoteError:null,
        agentStatus:state.agentStatus,
        agentMessage:state.agentMessage,
        checkedAt:state.checkedAt
      }
    });
  }catch(e){
    const msg=String(e.message||e);

    res.status(503).json({
      success:false,
      error:'UPDATE_BRIDGE_REQUIRED',
      message:msg.includes('password')
        ?'Puente privilegiado no instalado.'
        :'No fue posible ejecutar el updater.',
      detail:msg.slice(0,500)
    });
  }
});

router.post('/install',async(_req,res)=>{
  if(!IS_LINUX){
    return res.status(400).json({
      success:false,
      error:'RPI_ONLY'
    });
  }

  if(!(await bridgeReady())){
    return res.status(503).json({
      success:false,
      error:'UPDATE_BRIDGE_REQUIRED',
      message:
        'El puente seguro de actualización todavía no está instalado.'
    });
  }

  try{
    const child=spawn(
      'sudo',
      ['-n',AGENT,'install'],
      {
        detached:true,
        stdio:'ignore'
      }
    );

    child.unref();

    res.status(202).json({
      success:true,
      data:{
        started:true,
        current:currentVersion()
      }
    });
  }catch(e){
    res.status(500).json({
      success:false,
      error:'UPDATE_START_FAILED',
      message:String(e.message||e)
    });
  }
});

export default router;
