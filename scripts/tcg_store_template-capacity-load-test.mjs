import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

const base=new URL(process.argv[2]||'http://127.0.0.1:8787');
const requested=Math.max(1,Number(process.argv[3]||20000));
const holdSeconds=Math.max(10,Number(process.argv[4]||60));
const httpRps=Math.max(0,Number(process.argv[5]||25));
const rampPerSecond=Math.max(1,Number(process.argv[6]||1000));
const transport=base.protocol==='https:'?https:http;
const sockets=[];
const latencies=[];
const statusCounts=new Map();
let opened=0,failed=0,closed=0,rejected=0,httpOk=0,httpFailed=0,http429=0,httpBytes=0;
let intentionalShutdown=false;

const paths=[
  '/api/public/storefront',
  '/api/public/products?limit=24',
  '/api/public/categories',
  '/api/public/search?q=card&limit=12'
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function pct(a,p){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.ceil(s.length*p/100)-1)]*100)/100;}
function requestJson(pathname){
  return new Promise(resolve=>{
    const t=performance.now();let body='';let bytes=0;
    const req=transport.get(new URL(pathname,base),{headers:{Accept:'application/json','User-Agent':'SHINY-Capacity/1.0'},agent:false},res=>{
      res.on('data',c=>{bytes+=c.length;body+=c;});
      res.on('end',()=>{let json=null;try{json=JSON.parse(body);}catch{}resolve({status:res.statusCode||0,ms:performance.now()-t,bytes,json});});
    });
    req.setTimeout(15000,()=>req.destroy(new Error('HTTP_TIMEOUT')));
    req.on('error',()=>resolve({status:0,ms:performance.now()-t,bytes:0,json:null}));
  });
}
async function metrics(){
  const r=await requestJson('/api/health/traffic');
  return r.status===200?r.json?.data||null:null;
}
async function liveStatus(){
  const r=await requestJson('/api/public/live-sync/status');
  return r.status===200?r.json?.data||null:null;
}
function openSse(i){
  return new Promise(resolve=>{
    let settled=false;
    const done=()=>{if(!settled){settled=true;resolve();}};
    const req=transport.get(new URL('/api/public/live-sync/events',base),{
      headers:{Accept:'text/event-stream','User-Agent':`SHINY-Capacity-SSE/${i}`},agent:false
    },res=>{
      if(res.statusCode!==200){
        if(res.statusCode===503||res.statusCode===429)rejected++;
        failed++;res.resume();done();return;
      }
      opened++;sockets.push(req);
      res.once('data',done);
      res.on('close',()=>closed++);
      res.on('error',()=>{if(!intentionalShutdown)failed++;});
      setTimeout(done,2500);
    });
    req.setTimeout((holdSeconds+120)*1000);
    req.on('error',()=>{if(!intentionalShutdown)failed++;done();});
  });
}

const preflight=await liveStatus();
if(!preflight){
  console.error('[Shiny CAPACITY] ERROR: no se pudo leer /api/public/live-sync/status');
  process.exit(3);
}
const existing=Number(preflight.connections||0);
const maxConnections=Number(preflight.maxConnections||0);
const available=Math.max(0,maxConnections-existing);
console.log(`[Shiny CAPACITY] preflight existing=${existing} max=${maxConnections} available=${available} requested=${requested}`);
if(maxConnections>0&&requested>available){
  console.error(`[Shiny CAPACITY] ABORTADO: faltan ${requested-available} slots SSE. Cierra pestañas/storefront que mantengan EventSource y vuelve a ejecutar. No se cambió ningún límite.`);
  process.exit(4);
}

console.log(`[Shiny CAPACITY] SSE ramp: ${requested} clients · ${rampPerSecond}/s`);
for(let baseIndex=0;baseIndex<requested;baseIndex+=rampPerSecond){
  const batch=Math.min(rampPerSecond,requested-baseIndex);
  await Promise.all(Array.from({length:batch},(_,j)=>openSse(baseIndex+j)));
  console.log(`[Shiny CAPACITY] requested=${Math.min(baseIndex+batch,requested)} opened=${opened} failed=${failed} rejected=${rejected} closed=${closed}`);
  if(failed>0){
    console.error('[Shiny CAPACITY] se detectó un fallo durante la rampa; se detiene el crecimiento por seguridad.');
    break;
  }
  if(baseIndex+batch<requested)await sleep(1000);
}
const before=await metrics();
if(opened===requested&&failed===0){
  console.log(`[Shiny CAPACITY] holding ${holdSeconds}s + HTTP ${httpRps} req/s`);
  const start=performance.now();let seq=0;
  while((performance.now()-start)<holdSeconds*1000){
    const tick=performance.now();const jobs=[];
    for(let i=0;i<httpRps;i++){
      const path=paths[(seq++)%paths.length];
      jobs.push(requestJson(path).then(r=>{
        latencies.push(r.ms);httpBytes+=r.bytes;statusCounts.set(r.status,(statusCounts.get(r.status)||0)+1);
        if(r.status===429){http429++;httpFailed++;}
        else if(r.status>=200&&r.status<400)httpOk++;else httpFailed++;
      }));
    }
    await Promise.all(jobs);
    const spent=performance.now()-tick;if(spent<1000)await sleep(1000-spent);
  }
}
const during=await metrics();
intentionalShutdown=true;
for(const req of sockets)try{req.destroy();}catch{}
await sleep(750);
const after=await metrics();
const postflight=await liveStatus();
const result={
  target:String(base),
  capacity:{configured_max:maxConnections,existing_before:existing,requested,opened,failed,rejected,closed},
  http:{target_rps:httpRps,requests:httpOk+httpFailed,ok:httpOk,failed:httpFailed,rate_limited:http429,bytes:httpBytes,
    latency_ms:{p50:pct(latencies,50),p95:pct(latencies,95),p99:pct(latencies,99),max:latencies.length?Math.round(Math.max(...latencies)*100)/100:0},
    statuses:Object.fromEntries([...statusCounts].sort((a,b)=>a[0]-b[0]))},
  metrics:{before,during,after},postflight
};
console.log(JSON.stringify(result,null,2));
if(opened!==requested||failed>0||rejected>0||httpFailed>0)process.exitCode=2;
