import { monitorEventLoopDelay } from 'node:perf_hooks';
import os from 'node:os';
import { pool } from './db.js';
import { getStorefrontLiveStats } from './storefrontLiveSync.js';
import { getRequestMetrics } from './requestMetrics.js';

const histogram=monitorEventLoopDelay({resolution:20});
histogram.enable();
const startedAt=Date.now();
let lastCpu=process.cpuUsage();
let lastCpuAt=process.hrtime.bigint();

const mb=n=>Math.round((Number(n||0)/1024/1024)*10)/10;
const ms=n=>Number.isFinite(n)?Math.round(n/1e6*100)/100:0;
const round2=n=>Math.round(Number(n||0)*100)/100;
const logicalCpus=()=>{
  try{
    if(typeof os.availableParallelism==='function') return Math.max(1,os.availableParallelism());
  }catch{}
  try{return Math.max(1,(os.cpus()||[]).length||1);}catch{return 1;}
};
function cpuPct(){
  const now=process.hrtime.bigint();
  const usage=process.cpuUsage(lastCpu);
  const elapsedUs=Number(now-lastCpuAt)/1000;
  lastCpu=process.cpuUsage();
  lastCpuAt=now;
  if(elapsedUs<=0)return {normalized:0,raw:0,logical:logicalCpus()};
  // process.cpuUsage() suma tiempo de CPU de todos los hilos del proceso.
  // Por eso puede superar 100% en una máquina multi-core. Conservamos el
  // valor raw para diagnóstico y exponemos cpu_pct_interval normalizado a
  // la capacidad lógica disponible del host (0..100 aprox.).
  const raw=((usage.user+usage.system)/elapsedUs)*100;
  const logical=logicalCpus();
  return {normalized:Math.min(100,raw/logical),raw,logical};
}

export function getTrafficMetrics(){
  const mem=process.memoryUsage();
  const cpu=cpuPct();
  return {
    at:new Date().toISOString(),
    uptime_seconds:Math.floor((Date.now()-startedAt)/1000),
    process:{
      pid:process.pid,node:process.version,
      cpu_pct_interval:round2(cpu.normalized),
      cpu_pct_process_raw:round2(cpu.raw),
      logical_cpus:cpu.logical,
      rss_mb:mb(mem.rss),heap_used_mb:mb(mem.heapUsed),heap_total_mb:mb(mem.heapTotal),external_mb:mb(mem.external),
      system_free_mb:mb(os.freemem()),system_total_mb:mb(os.totalmem())
    },
    event_loop:{
      min_ms:ms(histogram.min),mean_ms:ms(histogram.mean),max_ms:ms(histogram.max),
      p50_ms:ms(histogram.percentile(50)),p95_ms:ms(histogram.percentile(95)),p99_ms:ms(histogram.percentile(99))
    },
    postgres:{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount},
    http:getRequestMetrics(),
    sse:getStorefrontLiveStats()
  };
}
export function resetTrafficHistogram(){histogram.reset();}
