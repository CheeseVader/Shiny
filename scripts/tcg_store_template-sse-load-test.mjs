import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

const target=new URL(process.argv[2]||'http://127.0.0.1:8787/api/public/live-sync/events');
const clients=Math.max(1,Number(process.argv[3]||1000));
const holdSeconds=Math.max(5,Number(process.argv[4]||60));
const rampPerSecond=Math.max(1,Number(process.argv[5]||250));
const transport=target.protocol==='https:'?https:http;
const sockets=[];
let opened=0,failed=0,closed=0,bytes=0;
const started=performance.now();

function openOne(i){
  return new Promise(resolve=>{
    const req=transport.get(target,{headers:{Accept:'text/event-stream','User-Agent':`SHINY-SSE-Load/${i}`},agent:false},res=>{
      if(res.statusCode!==200){failed++;res.resume();resolve();return;}
      opened++;sockets.push(req);
      res.on('data',chunk=>{bytes+=chunk.length;resolve();});
      res.on('close',()=>closed++);
      res.on('error',()=>failed++);
      setTimeout(resolve,2000);
    });
    req.setTimeout((holdSeconds+30)*1000);
    req.on('error',()=>{failed++;resolve();});
  });
}

for(let base=0;base<clients;base+=rampPerSecond){
  const batch=Math.min(rampPerSecond,clients-base);
  await Promise.all(Array.from({length:batch},(_,j)=>openOne(base+j)));
  const elapsed=Math.round((performance.now()-started)/1000);
  console.log(`[Shiny LOAD] requested=${Math.min(base+batch,clients)} opened=${opened} failed=${failed} closed=${closed} elapsed=${elapsed}s`);
  if(base+batch<clients)await new Promise(r=>setTimeout(r,1000));
}

console.log(`[Shiny LOAD] holding ${holdSeconds}s · opened=${opened} failed=${failed}`);
await new Promise(r=>setTimeout(r,holdSeconds*1000));
for(const req of sockets)try{req.destroy();}catch{}
console.log(JSON.stringify({target:String(target),requested:clients,opened,failed,closed,bytes,holdSeconds,rampPerSecond,totalSeconds:Math.round((performance.now()-started)/1000)},null,2));
