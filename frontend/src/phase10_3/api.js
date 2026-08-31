const BASE = window.location.port === '5173'
  ? 'http://127.0.0.1:8787/api/v1/tcg-ops'
  : '/api/v1/tcg-ops';
function token(){return localStorage.getItem('ADMIN_TOKEN')||localStorage.getItem('shiny_token')||localStorage.getItem('adminToken')||localStorage.getItem('token')||'';}
export async function api(path, options={}){
  const t=token();
  const headers={ 'Content-Type':'application/json', ...(options.headers||{}) };
  if(t){headers.Authorization=`Bearer ${t}`;headers['x-admin-token']=t;}
  const r=await fetch(`${BASE}${path}`,{...options,headers});
  const j=await r.json().catch(()=>({ok:false,error:`HTTP ${r.status}`}));
  if(!r.ok||j.ok===false) throw new Error(j.error||`HTTP ${r.status}`);
  return j.data;
}
export const get=(p)=>api(p);
export const post=(p,b)=>api(p,{method:'POST',body:JSON.stringify(b)});
