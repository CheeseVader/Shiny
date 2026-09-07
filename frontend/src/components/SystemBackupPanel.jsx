/* SHINY_BACKUP_ONE_CLICK_UI_R1 */
import React,{useEffect,useState} from 'react';
import {api} from '../services/api.js';
import '../system_backup_r130.css';

export default function SystemBackupPanel(){
  const [st,setSt]=useState(null);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  async function status(){
    try{
      const r=await api('/api/v1/system-backup/status');
      setSt(r.data||null);
    }catch(e){
      setMsg(e?.message||'No fue posible consultar el estado del respaldo.');
    }
  }

  useEffect(()=>{status()},[]);

  async function backup(){
    try{
      setBusy(true);
      setMsg('Creando y subiendo respaldo...');
      const r=await api('/api/v1/system-backup/backup',{method:'POST'});
      setMsg(r.message||'Respaldo creado y subido correctamente.');
      await status();
    }catch(e){
      setMsg(e?.message||'No fue posible crear el respaldo.');
    }finally{
      setBusy(false);
    }
  }

  return <section className="content-card bk130">
    <div className="section-head">
      <div>
        <div className="eyebrow">SUPERADMIN Â· CONTINUIDAD</div>
        <h2>Respaldo y migraciÃ³n</h2>
        <p className="section-copy">El respaldo usa automÃ¡ticamente la configuraciÃ³n instalada de este cliente.</p>
      </div>
    </div>

    <div className="bk130-grid">
      <article><span>Repositorio</span><strong>{st?.repo||'Detectando...'}</strong></article>
      <article><span>Base de datos</span><strong>{st?.db||'Detectando...'}</strong></article>
      <article><span>VersiÃ³n</span><strong>{st?.version||'â€”'}</strong></article>
      <article><span>Ãšltimo respaldo</span><strong>{st?.latestBackup||'â€”'}</strong></article>
    </div>

    <div className="bk130-note">
      No requiere capturar owner, repositorio, token ni claves. El respaldo se publica como backup-* en el mismo Shiny-Release configurado en el equipo.
    </div>

    <div className="bk130-actions">
      <button disabled={busy||st?.configured===false} onClick={backup}>{busy?'Respaldando...':'Respaldar'}</button>
    </div>

    {msg?<div className="bk130-msg">{msg}</div>:null}
  </section>;
}