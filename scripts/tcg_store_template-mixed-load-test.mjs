import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

const base=new URL(process.argv[2]||'http://127.0.0.1:8787');
const sseClients=Math.max(1,Number(process.argv[3]||1000));
const holdSeconds=Math.max(10,Number(process.argv[4]||60));
const httpRps=Math.max(1,Number(process.argv[5]||20));
const rampPerSecond=Math.max(1,Number(process.argv[6]||500));
const transport=base.protocol==='https:'?https:http;
const sockets=[];
const latencies=[];
const statusCounts=new Map();
let sseOpened=0,sseFailed=0,sseClosed=0,httpOk=0,httpFailed=0,http429=0,httpBytes=0;
let intentionalSseShutdown=false;

const paths=[
  '/api/public/storefront',
  '/api/public/products?limit=24',
  '/api/public/categories',
  '/api/public/search?q=card&limit=12'
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function pct(a,p){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.ceil(s.length*p/100)-1)]*100)/100;}
function getJson(pathname){
  return new Promise(resolve=>{
    const t=performance.now();
    const req=transport.get(new URL(pathname,base),{headers:{Accept:'application/json','User-Agent':'SHINY-Mixed-Load/1.0'},agent:false},res=>{
      let bytes=0;res.on('data',c=>bytes+=c.length);res.on('end',()=>resolve({status:res.statusCode||0,ms:performance.now()-t,bytes}));
    });
    req.setTimeout(10000,()=>req.destroy(new Error('HTTP_TIMEOUT')));
    req.on('error',()=>resolve({status:0,ms:performance.now()-t,bytes:0}));
  });
}
function openSse(i){
  return new Promise(resolve=>{
    const u=new URL('/api/public/live-sync/events',base);
    const req=transport.get(u,{headers:{Accept:'text/event-stream','User-Agent':`SHINY-Mixed-SSE/${i}`},agent:false},res=>{
      if(res.statusCode!==200){sseFailed++;res.resume();resolve();return;}
      let resolved=false;sseOpened++;sockets.push(req);
      res.once('data',()=>{if(!resolved){resolved=true;resolve();}});
      res.on('close',()=>sseClosed++);res.on('error',()=>{if(!intentionalSseShutdown)sseFailed++;});
      setTimeout(()=>{if(!resolved){resolved=true;resolve();}},2000);
    });
    req.setTimeout((holdSeconds+60)*1000);
    req.on('error',()=>{if(!intentionalSseShutdown)sseFailed++;resolve();});
  });
}
async function metrics(){
  const r=await getJson('/api/health/traffic');
  if(r.status!==200)return null;
  return new Promise(resolve=>{
    let data='';const req=transport.get(new URL('/api/health/traffic',base),{headers:{Accept:'application/json'},agent:false},res=>{
      res.on('data',c=>data+=c);res.on('end',()=>{try{resolve(JSON.parse(data).data||null);}catch{resolve(null);}});
    });req.on('error',()=>resolve(null));
  });
}

console.log(`[Shiny MIXED] SSE ramp: ${sseClients} clients · ${rampPerSecond}/s`);
for(let baseIndex=0;baseIndex<sseClients;baseIndex+=rampPerSecond){
  const batch=Math.min(rampPerSecond,sseClients-baseIndex);
  await Promise.all(Array.from({length:batch},(_,j)=>openSse(baseIndex+j)));
  console.log(`[Shiny MIXED] SSE requested=${Math.min(baseIndex+batch,sseClients)} opened=${sseOpened} failed=${sseFailed} closed=${sseClosed}`);
  if(baseIndex+batch<sseClients)await sleep(1000);
}
const before=await metrics();
console.log(`[Shiny MIXED] holding ${holdSeconds}s + HTTP ${httpRps} req/s`);
const start=performance.now();
let seq=0;
while((performance.now()-start)<holdSeconds*1000){
  const tick=performance.now();
  const jobs=[];
  for(let i=0;i<httpRps;i++){
    const path=paths[(seq++)%paths.length];
    jobs.push(getJson(path).then(r=>{
      latencies.push(r.ms);httpBytes+=r.bytes;statusCounts.set(r.status,(statusCounts.get(r.status)||0)+1);
      if(r.status===429){http429++;httpFailed++;}
      else if(r.status>=200&&r.status<400)httpOk++;else httpFailed++;
    }));
  }
  await Promise.all(jobs);
  const spent=performance.now()-tick;if(spent<1000)await sleep(1000-spent);
}
const during=await metrics();
intentionalSseShutdown=true;
for(const req of sockets)try{req.destroy();}catch{}
await sleep(500);
const after=await metrics();
const result={
  target:String(base),sse:{requested:sseClients,opened:sseOpened,failed:sseFailed,closed:sseClosed},
  http:{target_rps:httpRps,requests:httpOk+httpFailed,ok:httpOk,failed:httpFailed,rate_limited:http429,bytes:httpBytes,
    latency_ms:{p50:pct(latencies,50),p95:pct(latencies,95),p99:pct(latencies,99),max:latencies.length?Math.round(Math.max(...latencies)*100)/100:0},
    statuses:Object.fromEntries([...statusCounts].sort((a,b)=>a[0]-b[0]))},
  metrics:{before,during,after}
};
console.log(JSON.stringify(result,null,2));
if(sseOpened!==sseClients||sseFailed>0||httpFailed>0)process.exitCode=2;
