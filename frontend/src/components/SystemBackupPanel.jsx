/* SHINY_BACKUP_ONE_CLICK_UI_R136_PRIVATE */
import React,{useEffect,useState} from 'react';
import {api} from '../services/api.js';
import '../system_backup_r130.css';

const ch=(n)=>String.fromCharCode(n);
const TXT={
  eyebrow:`SUPERADMIN ${ch(183)} CONTINUIDAD`,
  title:`Respaldo y migraci${ch(243)}n`,
  subtitle:`Crea un respaldo de recuperaci${ch(243)}n del sistema.`,
  status:`Estado`,
  ready:`Listo`,
  unavailable:`No disponible`,
  db:`Base de datos`,
  version:`Versi${ch(243)}n`,
  latest:`${ch(218)}ltimo respaldo`,
  none:`A${ch(250)}n no hay respaldo`,
  backupOk:`Respaldo creado correctamente.`,
  statusFail:`No fue posible consultar el estado del respaldo.`,
  backupFail:`No fue posible crear el respaldo.`
};

export default function SystemBackupPanel(){
  const [st,setSt]=useState(null);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  async function status(){
    try{
      const r=await api('/api/v1/system-backup/status');
      setSt(r.data||null);
    }catch(e){
      setMsg(e?.message||TXT.statusFail);
    }
  }

  useEffect(()=>{status()},[]);

  async function backup(){
    try{
      setBusy(true);
      setMsg('Creando respaldo...');
      const r=await api('/api/v1/system-backup/backup',{method:'POST'});
      setMsg(r.message||TXT.backupOk);
      await status();
    }catch(e){
      setMsg(e?.message||TXT.backupFail);
    }finally{
      setBusy(false);
    }
  }

  return <section className="content-card bk130">
    <div className="section-head">
      <div>
        <div className="eyebrow">{TXT.eyebrow}</div>
        <h2>{TXT.title}</h2>
        <p className="section-copy">{TXT.subtitle}</p>
      </div>
    </div>

    <div className="bk130-grid">
      <article><span>{TXT.status}</span><strong>{st?.configured===false?TXT.unavailable:TXT.ready}</strong></article>
      <article><span>{TXT.db}</span><strong>{st?.db||'Detectando...'}</strong></article>
      <article><span>{TXT.version}</span><strong>{st?.version||'-'}</strong></article>
      <article><span>{TXT.latest}</span><strong>{st?.latestBackup||TXT.none}</strong></article>
    </div>

    <div className="bk130-actions">
      <button disabled={busy||st?.configured===false} onClick={backup}>{busy?'Respaldando...':'Respaldar'}</button>
    </div>

    {msg?<div className="bk130-msg">{msg}</div>:null}
  </section>;
}