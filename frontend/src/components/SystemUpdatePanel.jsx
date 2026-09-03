/* SHINY_SYSTEM_UPDATE_PANEL_R1 */
import { useEffect,useState } from 'react';
import { api } from '../services/api.js';
import '../system_update_r1.css';

export default function SystemUpdatePanel(){
  const [state,setState]=useState(null);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');

  async function refresh(){
    setBusy('status');
    try{const r=await api('/api/v1/system-update/status',{cache:'no-store'});setState(r.data||null);setMessage('');}
    catch(e){setMessage(e.message);}
    finally{setBusy('');}
  }
  useEffect(()=>{refresh();},[]);

  async function forceUpdate(){
    const ok=await window.shinyConfirm?.(
      'Shiny buscará una versión mayor en GitHub y, si existe, iniciará la actualización incremental. La aplicación puede reiniciarse durante el proceso.',
      {title:'Forzar actualización',confirmText:'Actualizar'}
    );
    if(ok===false)return;
    setBusy('install');setMessage('');
    try{
      await api('/api/v1/system-update/install',{method:'POST',body:'{}'});
      setMessage('Actualización iniciada. Espera unos segundos mientras Shiny reinicia.');
      setTimeout(()=>window.location.reload(),12000);
    }catch(e){setMessage(e.message);}
    finally{setBusy('');}
  }

  return <section className="content-card shiny-system-update">
    <div className="section-head">
      <div><div className="eyebrow">SUPERADMIN · SERVIDOR</div><h2>Actualizaciones de Shiny</h2>
      <p className="section-copy">Consulta la versión instalada y fuerza la instalación de una versión mayor publicada en GitHub.</p></div>
      <button type="button" disabled={!!busy} onClick={refresh}>{busy==='status'?'Consultando…':'Buscar actualización'}</button>
    </div>
    <div className="shiny-update-grid">
      <article><span>Versión instalada</span><strong>{state?.current||'—'}</strong></article>
      <article><span>Última disponible</span><strong>{state?.latest||'—'}</strong></article>
      <article><span>Estado</span><strong>{state?.updateAvailable?'Actualización disponible':'Actualizado'}</strong></article>
      <article><span>Puente seguro</span><strong>{state?.bridgeReady?'Activo':'Pendiente'}</strong></article>
    </div>
    {message?<div className="system-settings-note">{message}</div>:null}
    {!state?.bridgeReady?<div className="architecture-note"><b>Puente privilegiado pendiente</b><p>Por seguridad, Node no recibe permisos generales de root. Ejecuta una sola vez el instalador de puente suministrado para habilitar únicamente status/check/install del updater oficial.</p></div>:null}
    <div className="shiny-update-actions">
      <button type="button" disabled={busy==='install'||!state?.bridgeReady||!state?.updateAvailable} onClick={forceUpdate}>
        {busy==='install'?'Iniciando…':'Forzar actualización'}
      </button>
    </div>
  </section>;
}