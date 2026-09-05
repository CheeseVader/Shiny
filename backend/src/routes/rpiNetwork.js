import { Router } from 'express';
import os from 'node:os';
import { execFile } from 'node:child_process';

import fs from 'node:fs';
const router=Router();

function run(c,a=[],timeout=4000){
  return new Promise(r=>
    execFile(c,a,{timeout},(e,out='',err='')=>
      r({
        ok:!e,
        out:String(out).trim(),
        err:String(err).trim()
      })
    )
  );
}

/* SHINY_ACCESS_URLS_R125 */
function readTextFile(path){
  try{return fs.readFileSync(path,'utf8').trim();}catch{return '';}
}
function normalizedPublicUrl(value){
  const s=String(value||'').trim();
  return /^https?:\/\//i.test(s)?s:'';
}
function ip(){
  for(const rows of Object.values(os.networkInterfaces())){
    for(const x of rows||[]){
      if(x?.family==='IPv4'&&!x.internal){
        return x.address||'';
      }
    }
  }
  return '';
}

/*
 * SHINY_RPI_WIFI_LOCAL_KIOSK_R117
 *
 * nginx y cloudflared pueden conectar al backend desde loopback.
 * Por eso remoteAddress por si solo NO demuestra que sea el kiosk.
 *
 * El kiosk real abre:
 *   http://127.0.0.1/login?kiosk=1
 *
 * nginx conserva Host, por lo que exigimos:
 *   1. backend recibido desde loopback
 *   2. Host del navegador = 127.0.0.1 / localhost / ::1
 */
function isLocalKiosk(req){
  const remote=String(req.socket?.remoteAddress||'')
    .replace(/^::ffff:/,'');

  const loopback=
    remote==='127.0.0.1' ||
    remote==='::1';

  const host=String(req.headers.host||'')
    .trim()
    .toLowerCase();

  const localHost=
    /^127\.0\.0\.1(?::\d+)?$/.test(host) ||
    /^localhost(?::\d+)?$/.test(host) ||
    /^\[::1\](?::\d+)?$/.test(host);

  return loopback && localHost;
}

router.get('/status',async(_q,res)=>{
  let ssid='',device='';
  if(process.platform==='linux'){
    const r=await run('nmcli',['-t','-f','ACTIVE,SSID,DEVICE','dev','wifi'],3000);
    const line=r.out.split(/\r?\n/).find(x=>x.startsWith('yes:'));
    if(line){
      const a=line.split(':');
      device=a.at(-1)||'';
      ssid=a.slice(1,-1).join(':');
    }
  }

  const hostname=os.hostname();
  const localIp=ip();
  const localUrl=hostname?`http://${hostname}.local`:(localIp?`http://${localIp}`:'');

  const staffUrl=normalizedPublicUrl(
    process.env.SHINY_STAFF_PUBLIC_URL ||
    process.env.SHINY_PUBLIC_STAFF_URL ||
    readTextFile('/var/lib/shiny-cloudflare/staff.url')
  );

  const storeUrl=normalizedPublicUrl(
    process.env.SHINY_STORE_PUBLIC_URL ||
    process.env.SHINY_PUBLIC_STORE_URL ||
    readTextFile('/var/lib/shiny-cloudflare/store.url')
  );

  res.json({
    success:true,
    wifiUiAvailable:process.platform==='linux',
    connected:Boolean(ssid),
    ssid,
    device,
    localIp,
    hostname,
    access:{localUrl,staffUrl,storeUrl}
  });
});
router.post('/open-wifi',async(req,res)=>{

  if(process.platform!=='linux'){
    return res.status(409).json({
      success:false,
      message:'Disponible solo en Raspberry Pi.'
    });
  }

  if(!isLocalKiosk(req)){
    return res.status(403).json({
      success:false,
      message:'La configuración Wi-Fi solo puede abrirse desde el kiosk local.'
    });
  }

  if(Date.now()-last<3000){
    return res.status(429).json({
      success:false,
      message:'Espera unos segundos.'
    });
  }

  last=Date.now();

  /*
   * --no-block es necesario porque shiny-wifi-ui.service
   * mantiene abierta la ventana hasta que el usuario termina.
   */
  const r=await run(
    '/usr/bin/sudo',
    [
      '/bin/systemctl',
      '--no-block',
      'start',
      'shiny-wifi-ui.service'
    ],
    5000
  );

  if(!r.ok){
    return res.status(503).json({
      success:false,
      message:'No se pudo abrir el administrador Wi-Fi.',
      detail:r.err||r.out
    });
  }

  res.json({
    success:true,
    message:'Administrador Wi-Fi solicitado.'
  });
});

export default router;
