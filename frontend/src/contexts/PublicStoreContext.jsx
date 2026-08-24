import { createContext,useContext,useEffect,useMemo,useRef,useState } from 'react';
import { publicApi } from '../services/publicApi.js';

const StoreContext=createContext(null);
const LIVE='/api/public/live-sync/events',VERSION='/api/public/live-sync/version';
const CHANNEL='gmx-storefront-live-v1';
const has=(e,names)=>{const s=(e?.sections||[]).map(x=>String(x).toLowerCase());return s.includes('all')||names.some(x=>s.includes(x));};

export function PublicStoreProvider({children}){
  const [store,setStore]=useState({settings:{},zones:{},promotions:[]});
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [liveStatus,setLiveStatus]=useState('CONNECTING');
  const [liveUpdate,setLiveUpdate]=useState({version:0,sections:[],changes:[],reason:'INITIAL'});
  const versionRef=useRef(0),reloadRef=useRef(null);

  async function reload({silent=false}={}){
    if(reloadRef.current)return reloadRef.current;
    if(!silent)setLoading(true);
    const p=(async()=>{
      try{
        const r=await publicApi('/api/public/storefront');
        setStore(r.data||{settings:{},zones:{},promotions:[]});setError('');return r.data;
      }catch(e){setError(e.message);throw e;}
      finally{if(!silent)setLoading(false);reloadRef.current=null;}
    })();
    reloadRef.current=p;return p;
  }
  async function versionFallback(){
    try{
      const r=await publicApi(VERSION);
      const v=Number(r.data?.version||0);
      if(v>versionRef.current){
        versionRef.current=v;
        const ev={version:v,sections:['all'],changes:[],reason:'VERSION_FALLBACK'};
        setLiveUpdate(ev);await reload({silent:true});
      }
    }catch{}
  }

  useEffect(()=>{
    Promise.all([reload(),publicApi(VERSION).catch(()=>({data:{version:0}}))])
      .then(([,v])=>{versionRef.current=Number(v.data?.version||0);})
      .catch(()=>{});
  },[]);

  useEffect(()=>{
    let es=null,bc=null,timer=null,reconnectTimer=null,closed=false,reconnectAttempt=0;

    const process=async(ev,{share=false}={})=>{
      const v=Number(ev?.version||0);
      if(v&&v<=versionRef.current)return;
      if(v)versionRef.current=v;
      setLiveUpdate(ev);

      if(has(ev,['appearance','settings','slideshow','media','promotions','storefront'])){
        try{await reload({silent:true});}catch{}
      }
      window.dispatchEvent(new CustomEvent('gmx-storefront-live-update',{detail:ev}));
      if(share&&bc)try{bc.postMessage(ev);}catch{}
    };

    if('BroadcastChannel' in window){
      bc=new BroadcastChannel(CHANNEL);
      bc.onmessage=e=>process(e.data||{}).catch(()=>{});
    }
    const connect=()=>{
      if(closed)return;
      try{
        es?.close();
        es=new EventSource(`${LIVE}?version=${encodeURIComponent(versionRef.current)}`);
        es.onopen=()=>{reconnectAttempt=0;setLiveStatus('LIVE');};
        es.addEventListener('storefront-version',()=>{reconnectAttempt=0;setLiveStatus('LIVE');});
        es.addEventListener('storefront-updated',e=>{
          try{reconnectAttempt=0;setLiveStatus('LIVE');process(JSON.parse(e.data||'{}'),{share:true}).catch(()=>{});}catch{}
        });
        es.addEventListener('capacity',()=>setLiveStatus('RECONNECTING'));
        es.onerror=()=>{
          try{es?.close();}catch{}
          if(closed||reconnectTimer)return;
          setLiveStatus('RECONNECTING');
          reconnectAttempt=Math.min(reconnectAttempt+1,8);
          const base=Math.min(60000,2000*(2**Math.min(reconnectAttempt,5)));
          const delay=base+Math.floor(Math.random()*Math.max(1000,base));
          reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},delay);
        };
      }catch{
        setLiveStatus('FALLBACK');
        if(!closed&&!reconnectTimer)reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},5000+Math.floor(Math.random()*5000));
      }
    };
    connect();

    const schedule=()=>{
      if(closed)return;
      // 45–75 s con jitter: 1,000 clientes no golpean /version al mismo tiempo.
      timer=setTimeout(async()=>{
        if(document.visibilityState==='visible')await versionFallback();
        schedule();
      },45000+Math.floor(Math.random()*30000));
    };
    schedule();
    const visible=()=>{if(document.visibilityState==='visible')versionFallback();};
    document.addEventListener('visibilitychange',visible);

    return()=>{
      closed=true;if(timer)clearTimeout(timer);if(reconnectTimer)clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange',visible);
      try{es?.close();bc?.close();}catch{}
    };
  },[]);

  const value=useMemo(()=>({store,loading,error,reload,liveStatus,liveUpdate,contentVersion:liveUpdate.version}),
    [store,loading,error,liveStatus,liveUpdate]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function usePublicStore(){return useContext(StoreContext);}
