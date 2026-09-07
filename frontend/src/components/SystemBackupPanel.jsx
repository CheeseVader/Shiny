/* SHINY_BACKUP_ONE_CLICK_UI_R134_ASCII_SAFE */
import React,{useEffect,useState} from 'react';
import {api} from '../services/api.js';
import '../system_backup_r130.css';

const ch=(n)=>String.fromCharCode(n);
const TXT={
  eyebrow:`SUPERADMIN ${ch(183)} CONTINUIDAD`,
  title:`Respaldo y migraci${ch(243)}n`,
  subtitle:`El respaldo usa autom${ch(225)}ticamente la configuraci${ch(243)}n instalada de este cliente.`,
  version:`Versi${ch(243)}n`,
  latest:`${ch(218)}ltimo respaldo`,
  dash:ch(8212),
  backupOk:`Respaldo creado y subido correctamente.`,
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
      setMsg('Creando y subiendo respaldo...');
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
      <article><span>Repositorio</span><strong>{st?.repo||'Detectando...'}</strong></article>
      <article><span>Base de datos</span><strong>{st?.db||'Detectando...'}</strong></article>
      <article><span>{TXT.version}</span><strong>{st?.version||TXT.dash}</strong></article>
      <article><span>{TXT.latest}</span><strong>{st?.latestBackup||TXT.dash}</strong></article>
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