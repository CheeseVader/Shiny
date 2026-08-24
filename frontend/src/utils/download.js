export async function authenticatedDownload(path,filename){
  const token=localStorage.getItem('GMX_AUTH_TOKEN')||'';
  const headers={};
  if(token)headers.Authorization=`Bearer ${token}`;
  const r=await fetch(path,{headers});
  if(!r.ok){
    let message=`HTTP ${r.status}`;
    try{const b=await r.json();message=b.message||b.error||message;}catch{}
    throw new Error(message);
  }
  const blob=await r.blob();
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename||'GMX_export.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
