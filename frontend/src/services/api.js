const ADMIN_PATH_PREFIXES=[
  '/dashboard',
  '/productos',
  '/clientes',
  '/inventario',
  '/sucursales',
  '/pedidos',
  '/compras',
  '/comercial',
  '/contenido',
  '/tcg-operacion',
  '/buylist',
  '/reportes',
  '/administracion',
  '/sistema'
];

function isAdministrativeLocation(){
  const pathname=window.location.pathname||'/';
  return ADMIN_PATH_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`));
}

export async function api(path,options={}){
  const token=localStorage.getItem('GMX_AUTH_TOKEN')||'';
  const headers={
    'Content-Type':'application/json',
    ...(options.headers||{})
  };
  if(token)headers.Authorization=`Bearer ${token}`;

  const response=await fetch(path,{...options,headers});
  let body={};
  try{body=await response.json();}catch{}

  if(response.status===401){
    localStorage.removeItem('GMX_AUTH_TOKEN');
    localStorage.removeItem('GMX_AUTH_USER');

    // Un endpoint administrativo jamás debe expulsar a un visitante de la tienda
    // hacia /login. Solo una página del backoffice puede hacer esa redirección.
    if(isAdministrativeLocation()){
      window.location.replace('/login');
    }
  }

  if(!response.ok||body.success===false){
    const error=new Error(body.message||body.error||`HTTP ${response.status}`);
    error.status=response.status;
    error.code=body.error||body.code||`HTTP_${response.status}`;
    error.data=body;
    error.response={status:response.status,data:body};
    throw error;
  }
  return body;
}
