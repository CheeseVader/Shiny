import { useEffect,useState } from 'react';

export default function SecureMedia({mediaId,className='',alt='',style={}}){
  const [src,setSrc]=useState('');
  useEffect(()=>{
    let url='';
    let cancelled=false;
    async function load(){
      if(!mediaId){setSrc('');return;}
      try{
        const token=localStorage.getItem('SHINY_AUTH_TOKEN')||'';
        const r=await fetch(`/api/v1/content/media/${encodeURIComponent(mediaId)}/file`,{
          headers:token?{Authorization:`Bearer ${token}`}:{}
        });
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const blob=await r.blob();
        if(cancelled)return;
        url=URL.createObjectURL(blob);setSrc(url);
      }catch{if(!cancelled)setSrc('');}
    }
    load();
    return()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[mediaId]);
  if(!src)return null;
  return <img src={src} alt={alt} className={className} style={style}/>;
}
