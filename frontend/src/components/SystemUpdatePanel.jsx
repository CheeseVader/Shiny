/* SHINY_SYSTEM_UPDATE_PANEL_R2 */
import { useEffect,useRef,useState } from 'react';
import { api } from '../services/api.js';
import '../system_update_r1.css';

const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

export default function SystemUpdatePanel(){
  const [state,setState]=useState(null);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [activity,setActivity]=useState(null);
  const mountedRef=useRef(true);

  async function refresh({silent=false}={}){
    if(!silent)setBusy('status');
    try{
      const r=await api('/api/v1/system-update/status',{cache:'no-store'});
      if(mountedRef.current){
        setState(r.data||null);
        if(!silent)setMessage('');
      }
      return r.data||null;
    }catch(e){
      if(!silent&&mountedRef.current)setMessage(e.message);
      throw e;
    }finally{
      if(!silent&&mountedRef.current)setBusy('');
    }
  }

  useEffect(()=>{
    mountedRef.current=true;
    refresh().catch(()=>{});
    return()=>{mountedRef.current=false;};
  },[]);

  async function checkForUpdates(){
    if(busy)return;

    setBusy('check');
    setMessage('');

    try{
      await api('/api/v1/system-update/check',{
        method:'POST',
        body:'{}',
        headers:{
          'Content-Type':'application/json',
          'X-TCG-Store-Template-Progress':'manual'
        }
      });

      const r=await api('/api/v1/system-update/status',{
        cache:'no-store'
      });

      const next=r.data||null;

      if(mountedRef.current){
        setState(next);

        if(next?.remoteError){
          setMessage(`No fue posible consultar GitHub: ${next.remoteError}`);
        }else if(next?.updateAvailable){
          setMessage(
            `Nueva versión disponible: ${next.current} → ${next.latest}.`
          );
        }else{
          setMessage(
            `Shiny ${next?.current||''} está actualizado.`
          );
        }
      }

      return next;

    }catch(e){
      if(mountedRef.current){
        setMessage(
          e?.message||
          'No fue posible buscar actualizaciones.'
        );
      }

      throw e;

    }finally{
      if(mountedRef.current)setBusy('');
    }
  }
  function progressOperation(id,progress,detail){
    const value=Math.max(0,Math.min(100,Number(progress||0)));
    if(mountedRef.current)setActivity({progress:value,detail});
    try{
      window.shinyOperation?.update(id,{
        progress:value,
        detail
      });
    }catch{}
  }

  async function forceUpdate(){
    const current=state?.current||'versión actual';
    const target=state?.latest||'nueva versión';

    const ok=await window.shinyConfirm?.(
      `Shiny actualizará ${current} → ${target}. Durante el proceso la aplicación puede reiniciarse. No apagues la Raspberry Pi.`,
      {
        title:'Actualizar Shiny',
        confirmText:'Actualizar'
      }
    );

    if(ok===false)return;

    setBusy('install');
    setMessage('');

    let operationId=null;
    let phaseTimer=null;

    try{
      operationId=window.shinyOperation?.start({
        title:'Actualizando Shiny',
        detail:`Preparando actualización ${current} → ${target}…`,
        progress:5,
        meta:{current,target,type:'system-update'}
      })||null;

      setActivity({
        progress:5,
        detail:`Preparando actualización ${current} → ${target}…`
      });

      const startedAt=Date.now();

      const phases=[
        {after:0,   progress:5, detail:'Preparando actualización…'},
        {after:1200,progress:12,detail:'Verificando puente seguro…'},
        {after:2800,progress:20,detail:`Solicitando Shiny ${target}…`},
        {after:5500,progress:35,detail:'Descargando paquete de actualización…'},
        {after:10000,progress:52,detail:'Verificando integridad del paquete…'},
        {after:16000,progress:68,detail:'Instalando archivos de Shiny…'},
        {after:24000,progress:80,detail:'Actualizando dependencias y aplicación…'},
        {after:34000,progress:90,detail:'Preparando reinicio de servicios…'},
        {after:45000,progress:94,detail:'Reiniciando Shiny y verificando versión…'}
      ];

      let lastPhase=-1;

      phaseTimer=setInterval(()=>{
        const elapsed=Date.now()-startedAt;
        let index=0;

        for(let i=0;i<phases.length;i++){
          if(elapsed>=phases[i].after)index=i;
        }

        if(index!==lastPhase){
          lastPhase=index;
          const p=phases[index];
          progressOperation(operationId,p.progress,p.detail);
        }
      },500);

      progressOperation(
        operationId,
        8,
        'Iniciando agente seguro de actualización…'
      );

      await api('/api/v1/system-update/install',{
        method:'POST',
        body:'{}',
        headers:{
          'Content-Type':'application/json',
          'X-TCG-Store-Template-Progress':'manual'
        }
      });

      progressOperation(
        operationId,
        18,
        `Actualización ${current} → ${target} iniciada.`
      );

      /*
       * El agente Linux trabaja desacoplado.
       * Los porcentajes intermedios representan fases visuales.
       * El 100% SOLO se muestra cuando el backend vuelve y VERSION
       * confirma que realmente se instaló la versión objetivo.
       */
      const timeoutAt=Date.now()+180000;
      let confirmed=false;
      let latestStatus=null;

      while(Date.now()<timeoutAt){
        await wait(2000);

        try{
          const r=await api('/api/v1/system-update/status',{
            cache:'no-store'
          });

          latestStatus=r.data||null;

          if(mountedRef.current&&latestStatus){
            setState(latestStatus);
          }

          if(
            target &&
            latestStatus?.current &&
            String(latestStatus.current)===String(target)
          ){
            confirmed=true;
            break;
          }
        }catch{
          /*
           * Durante el reinicio es normal que el backend
           * desaparezca temporalmente.
           */
        }
      }

      if(!confirmed){
        throw new Error(
          `La actualización fue iniciada, pero Shiny no confirmó la versión ${target} dentro del tiempo esperado. Revisa el estado del servidor antes de reintentar.`
        );
      }

      clearInterval(phaseTimer);
      phaseTimer=null;

      progressOperation(
        operationId,
        100,
        `Shiny ${target} instalado correctamente.`
      );

      try{
        window.shinyOperation?.complete(operationId,{
          title:'Actualización completada',
          detail:`Shiny ${target} está instalado y listo.`,
          keepMs:3500
        });
      }catch{}

      if(mountedRef.current){
        setActivity({
          progress:100,
          detail:`Shiny ${target} instalado correctamente.`
        });
        setMessage(`Actualización completada. Shiny ${target} está instalado.`);
      }

      await wait(2800);
      window.location.reload();

    }catch(e){
      if(phaseTimer)clearInterval(phaseTimer);

      const detail=String(
        e?.message||
        'No fue posible completar la actualización.'
      );

      try{
        if(operationId)window.shinyOperation?.fail(operationId,detail);
      }catch{}

      if(mountedRef.current){
        setMessage(detail);
        setActivity(null);
      }
    }finally{
      if(phaseTimer)clearInterval(phaseTimer);
      if(mountedRef.current)setBusy('');
    }
  }

  const progress=Number(activity?.progress||0);
  const bridgeRequired=state?.bridgeRequired!==false;
  const latestKnown=!!state?.latest&&!state?.remoteError;
  const statusLabel=!latestKnown
    ?'Sin verificar'
    :state?.updateAvailable
      ?'Actualización disponible'
      :'Actualizado';
  const bridgeLabel=!bridgeRequired
    ?'No requerido'
    :state?.bridgeReady
      ?'Activo'
      :'Pendiente';

  return <section className="content-card shiny-system-update">
    <div className="section-head">
      <div>
        <div className="eyebrow">SUPERADMIN · SERVIDOR</div>
        <h2>Actualizaciones de Shiny</h2>
        <p className="section-copy">
          Consulta la versión instalada y actualiza Shiny de forma segura desde GitHub.
        </p>
      </div>

      <button
        type="button"
        disabled={!!busy}
        onClick={()=>checkForUpdates().catch(()=>{})}
      >
        {busy==='check'?'Buscando…':'Buscar actualización'}
      </button>
    </div>

    <div className="shiny-update-grid">
      <article>
        <span>Versión instalada</span>
        <strong>{state?.current||'—'}</strong>
      </article>

      <article>
        <span>Última disponible</span>
        <strong>{state?.latest||'—'}</strong>
      </article>

      <article>
        <span>Estado</span>
        <strong>
          {statusLabel}
        </strong>
      </article>

      <article>
        <span>Puente seguro</span>
        <strong>{bridgeLabel}</strong>
      </article>
    </div>

    {busy==='install'&&activity?
      <div className="shiny-update-running" role="status" aria-live="polite">
        <div className="shiny-update-running-head">
          <div className="shiny-update-gears" aria-hidden="true">
            <span>⚙</span>
            <span>⚙</span>
            <span>⚙</span>
          </div>

          <div>
            <strong>Actualizando Shiny</strong>
            <p>{activity.detail}</p>
          </div>

          <b>{progress}%</b>
        </div>

        <div className="shiny-update-progress-track">
          <i style={{width:`${progress}%`}}/>
        </div>

        <small>
          No apagues ni desconectes la Raspberry Pi durante la actualización.
        </small>
      </div>
    :null}

    {message?
      <div className="system-settings-note">{message}</div>
    :null}

    {bridgeRequired&&!state?.bridgeReady?
      <div className="architecture-note">
        <b>Puente privilegiado pendiente</b>
        <p>
          Por seguridad, Node no recibe permisos generales de root.
          Instala una sola vez el puente seguro para habilitar
          status/check/install del updater oficial.
        </p>
      </div>
    :null}

    <div className="shiny-update-actions">
      <button
        type="button"
        disabled={
          busy==='install'||
          !bridgeRequired||
          !state?.bridgeReady||
          !state?.updateAvailable
        }
        onClick={forceUpdate}
      >
        {busy==='install'?'Actualizando…':'Instalar actualización'}
      </button>
    </div>
  </section>;
}