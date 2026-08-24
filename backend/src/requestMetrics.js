import { performance } from 'node:perf_hooks';

const startedAt=Date.now();
const MAX_SAMPLES=Math.max(1000,Number(process.env.GMX_HTTP_METRIC_SAMPLES||20000));
const samples=[];
let total=0,success=0,clientErrors=0,serverErrors=0,inFlight=0,peakInFlight=0;
const byGroup=new Map();

function groupOf(req){
  const p=String(req.originalUrl||req.url||'').split('?')[0];
  if(p.startsWith('/api/public/live-sync/events'))return 'sse';
  if(p.startsWith('/api/public/products'))return 'public.products';
  if(p.startsWith('/api/public/search'))return 'public.search';
  if(p.startsWith('/api/public/storefront'))return 'public.storefront';
  if(p.startsWith('/api/public/categories'))return 'public.categories';
  if(p.startsWith('/api/public/tcg'))return 'public.tcg';
  if(p.startsWith('/api/public'))return 'public.other';
  if(p.startsWith('/api/auth'))return 'auth';
  if(p.startsWith('/api/v1'))return 'api.v1';
  if(p.startsWith('/api/health'))return 'health';
  return 'other';
}
function pct(sorted,p){
  if(!sorted.length)return 0;
  const i=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
  return Math.round(sorted[i]*100)/100;
}
function summary(list){
  const a=[...list].sort((x,y)=>x-y);
  if(!a.length)return {count:0,p50_ms:0,p95_ms:0,p99_ms:0,max_ms:0};
  return {count:a.length,p50_ms:pct(a,50),p95_ms:pct(a,95),p99_ms:pct(a,99),max_ms:Math.round(a[a.length-1]*100)/100};
}
function addSample(group,ms){
  samples.push({group,ms});
  if(samples.length>MAX_SAMPLES)samples.splice(0,samples.length-MAX_SAMPLES);
  let g=byGroup.get(group);
  if(!g){g={total:0,success:0,clientErrors:0,serverErrors:0,samples:[]};byGroup.set(group,g);}
  g.total++;
  g.samples.push(ms);
  if(g.samples.length>Math.max(500,Math.floor(MAX_SAMPLES/4)))g.samples.shift();
  return g;
}

export function requestMetricsMiddleware(req,res,next){
  // Las conexiones SSE son largas y se miden por su manager, no como latencia HTTP normal.
  if(String(req.originalUrl||req.url||'').startsWith('/api/public/live-sync/events'))return next();
  const start=performance.now();
  const group=groupOf(req);
  inFlight++;peakInFlight=Math.max(peakInFlight,inFlight);
  let done=false;
  const finish=()=>{
    if(done)return;done=true;inFlight=Math.max(0,inFlight-1);
    const ms=performance.now()-start;
    total++;
    const g=addSample(group,ms);
    if(res.statusCode>=500){serverErrors++;g.serverErrors++;}
    else if(res.statusCode>=400){clientErrors++;g.clientErrors++;}
    else{success++;g.success++;}
  };
  res.once('finish',finish);res.once('close',finish);
  next();
}

export function getRequestMetrics(){
  const groups={};
  for(const [name,g] of byGroup){groups[name]={...summary(g.samples),total:g.total,success:g.success,client_errors:g.clientErrors,server_errors:g.serverErrors};}
  return {
    since:new Date(startedAt).toISOString(),total,success,client_errors:clientErrors,server_errors:serverErrors,
    in_flight:inFlight,peak_in_flight:peakInFlight,latency:summary(samples.map(x=>x.ms)),groups
  };
}

export function resetRequestMetrics(){
  samples.length=0;byGroup.clear();total=success=clientErrors=serverErrors=inFlight=peakInFlight=0;
}
