export async function publicApi(path,options={}){
  const headers={
    ...(options.body?{'Content-Type':'application/json'}:{}),
    ...(options.headers||{})
  };
  const response=await fetch(path,{credentials:'same-origin',...options,headers});
  let body={};
  try{body=await response.json();}catch{}
  if(!response.ok||body.success===false){
    throw new Error(body.message||body.error||`HTTP ${response.status}`);
  }
  return body;
}

export function money(value,currency='MXN',locale='es-MX'){
  return new Intl.NumberFormat(locale,{style:'currency',currency}).format(Number(value||0));
}
