const token=localStorage.getItem('SHINY_AUTH_TOKEN');
const id='PROD-000014';

const original={
  sku:'TEST-PRODUCTOS-004-CAT003',
  nombre:'TEST PRODUCTOS 004 CAT003',
  precio:125,
  costo:75,
  stock_minimo:2,
  categoria:'Mats',
  estado:'Activo'
};

const updated={
  ...original,
  nombre:'TEST PRODUCTOS 004 CAT003 - UPDATE',
  precio:126
};

async function call(url,options={}){
  const r=await fetch(url,{
    credentials:'include',
    ...options,
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+token,
      ...(options.headers||{})
    }
  });
  let body=null;
  try{body=await r.json();}catch{}
  return {status:r.status,body};
}

const before=await call('/api/v1/products/'+id,{method:'GET'});
console.log('BEFORE',before);

const upd=await call('/api/v1/products/'+id,{
  method:'PUT',
  body:JSON.stringify(updated)
});
console.log('UPDATE',upd);

const afterUpdate=await call('/api/v1/products/'+id,{method:'GET'});
console.log('AFTER_UPDATE',afterUpdate);

const restore=await call('/api/v1/products/'+id,{
  method:'PUT',
  body:JSON.stringify(original)
});
console.log('RESTORE',restore);

const afterRestore=await call('/api/v1/products/'+id,{method:'GET'});
console.log('AFTER_RESTORE',afterRestore);

const del=await call('/api/v1/products/'+id,{method:'DELETE'});
console.log('DELETE_EXPECTED_409_IF_STOCK',del);

const final=await call('/api/v1/products/'+id,{method:'GET'});
console.log('FINAL',final);

console.log({
  UPDATE_PASS:upd.status>=200&&upd.status<300,
  RESTORE_PASS:restore.status>=200&&restore.status<300,
  DELETE_BLOCKED_EXPECTED:del.status===409,
  FINAL_GET:final.status===200
});
