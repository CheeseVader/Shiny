const buckets=new Map();
const WINDOW_MS=Math.max(1000,Number(process.env.SHINY_PUBLIC_RATE_WINDOW_MS||60000));
const MAX_REQUESTS=Math.max(10,Number(process.env.SHINY_PUBLIC_RATE_MAX||240));
const AUTH_WINDOW_MS=Math.max(1000,Number(process.env.SHINY_AUTH_RATE_WINDOW_MS||900000));
const AUTH_MAX=Math.max(3,Number(process.env.SHINY_AUTH_RATE_MAX||20));
const CLEAN_EVERY_MS=Math.max(WINDOW_MS,60000);
let lastCleanup=Date.now();

function ipOf(req){
  // req.ip respeta Express trust proxy cuando éste se configure explícitamente.
  // No confiamos directamente en X-Forwarded-For para evitar spoofing.
  return req.ip||req.socket?.remoteAddress||'unknown';
}
function cleanup(now){
  if(now-lastCleanup<CLEAN_EVERY_MS)return;
  lastCleanup=now;
  for(const [key,b] of buckets){if(now>=b.resetAt)buckets.delete(key);}
}
function allow(key,limit,windowMs){
  const now=Date.now();cleanup(now);
  let b=buckets.get(key);
  if(!b||now>=b.resetAt){b={count:0,resetAt:now+windowMs};buckets.set(key,b);}
  b.count++;
  return {ok:b.count<=limit,remaining:Math.max(0,limit-b.count),resetAt:b.resetAt};
}
function apply(req,res,next,{namespace,limit,windowMs}){
  if(req.method==='OPTIONS')return next();
  const r=allow(`${namespace}:${ipOf(req)}`,limit,windowMs);
  res.setHeader('RateLimit-Limit',String(limit));
  res.setHeader('RateLimit-Remaining',String(r.remaining));
  res.setHeader('RateLimit-Reset',String(Math.ceil(r.resetAt/1000)));
  if(r.ok)return next();
  res.setHeader('Retry-After',String(Math.max(1,Math.ceil((r.resetAt-Date.now())/1000))));
  return res.status(429).json({success:false,error:'RATE_LIMITED',message:'Demasiadas solicitudes. Intenta nuevamente en unos momentos.'});
}

export function publicApiRateLimit(req,res,next){
  // SSE tiene su propio control de capacidad/reconexión y no debe entrar al contador HTTP normal.
  if(String(req.path||'').startsWith('/live-sync/events'))return next();
  return apply(req,res,next,{namespace:'public',limit:MAX_REQUESTS,windowMs:WINDOW_MS});
}
export function authRateLimit(req,res,next){
  // Limita intentos de escritura/autenticación, no consultas GET de sesión/perfil.
  if(!['POST','PUT','PATCH'].includes(String(req.method||'GET').toUpperCase()))return next();
  return apply(req,res,next,{namespace:'auth',limit:AUTH_MAX,windowMs:AUTH_WINDOW_MS});
}

