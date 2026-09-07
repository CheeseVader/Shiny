/* SHINY_SYSTEM_BACKUP_PANEL_R130 */
import React,{useEffect,useState} from 'react';
import {api} from '../services/api.js';
import '../system_backup_r130.css';

export default function SystemBackupPanel(){
  const[st,setSt]=useState(null);
  const[remote,setRemote]=useState([]);
  const[token,setToken]=useState('');
  const[passphrase,setPassphrase]=useState('');
  const[owner,setOwner]=useState('');
  const[repo,setRepo]=useState('');
  const[busy,setBusy]=useState('');
  const[msg,setMsg]=useState('');

  async function status(){
    try{const r=await api('/api/v1/system-backup/status');setSt(r.data||null)}
    catch(e){setMsg(e?.message||'No fue posible consultar el respaldo.')}
  }
  useEffect(()=>{status()},[]);

  async function configure(){
    if(token.trim().length<20){setMsg('Captura el token de respaldo.');return}
    if(passphrase.length<12){setMsg('La clave de cifrado debe tener al menos 12 caracteres.');return}
    try{
      setBusy('config');setMsg('');
      await api('/api/v1/system-backup/configure',{method:'POST',body:{token:token.trim(),passphrase,owner:owner.trim(),repo:repo.trim()}});
      setToken('');setPassphrase('');
      setMsg('Configuración guardada correctamente.');
      await status();
    }catch(e){setMsg(e?.message||'No fue posible guardar la configuración.')}
    finally{setBusy('')}
  }

  async function action(name){
    try{
      setBusy(name);setMsg('');
      const r=await api('/api/v1/system-backup/'+name,{method:'POST'});
      setMsg(r.message||'Operación completada.');
      await status();
      if(name==='backup'||name==='upload') await history();
    }catch(e){setMsg(e?.message||'La operación falló.')}
    finally{setBusy('')}
  }

  async function history(){
    try{
      setBusy('history');
      const r=await api('/api/v1/system-backup/remote');
      setRemote(Array.isArray(r.data)?r.data:[]);
    }catch(e){setMsg(e?.message||'No fue posible consultar GitHub.')}
    finally{setBusy('')}
  }

  async function restore(){
    const word=window.prompt('Se reemplazará la base actual. Escribe RESTAURAR para continuar.');
    if(word!=='RESTAURAR') return;
    if(!window.confirm('Antes de restaurar se creará un dump de seguridad de la base actual. ¿Continuar?')) return;
    try{
      setBusy('restore');setMsg('');
      const r=await api('/api/v1/system-backup/restore-latest',{method:'POST',body:{confirmation:'RESTAURAR'}});
      setMsg(r.message||'Restauración completada.');
      await status();
    }catch(e){setMsg(e?.message||'La restauración falló.')}
    finally{setBusy('')}
  }

  return <section className="content-card bk130">
    <div className="section-head">
      <div>
        <div className="eyebrow">SUPERADMIN · CONTINUIDAD</div>
        <h2>Respaldo y migración</h2>
        <p className="section-copy">Backup PostgreSQL portable entre Raspberry Pi/Linux y Windows.</p>
      </div>
      <button onClick={status} disabled={!!busy}>Actualizar</button>
    </div>

    <div className="bk130-grid">
      <article><span>Configuración</span><strong>{st?.configured?'Lista':'Pendiente'}</strong></article>
      <article><span>Plataforma</span><strong>{st?.platform||'—'}</strong></article>
      <article><span>Repositorio</span><strong>{st?.repo||'—'}</strong></article>
      <article><span>Último respaldo</span><strong>{st?.latestLocal||'—'}</strong></article>
    </div>

    <div className="bk130-note">
      El archivo generado es portable. La misma copia puede restaurarse en Linux/Raspberry Pi o Windows.
      El token de respaldo es independiente del token read-only del updater y la clave de cifrado nunca se sube a GitHub.
    </div>

    <div className="form-grid">
      <label>GitHub owner (opcional si puede detectarse)
        <input value={owner} onChange={e=>setOwner(e.target.value)} />
      </label>
      <label>Repositorio Release (opcional si puede detectarse)
        <input value={repo} onChange={e=>setRepo(e.target.value)} />
      </label>
      <label>Token GitHub de respaldo
        <input type="password" autoComplete="new-password" value={token} onChange={e=>setToken(e.target.value)} />
      </label>
      <label>Clave privada de cifrado
        <input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} />
      </label>
    </div>

    <div className="bk130-actions">
      <button disabled={!!busy} onClick={configure}>Guardar configuración</button>
      <button disabled={!!busy||!st?.configured} onClick={()=>action('create')}>Crear respaldo local</button>
      <button disabled={!!busy||!st?.configured} onClick={()=>action('upload')}>Subir último</button>
      <button disabled={!!busy||!st?.configured} onClick={()=>action('backup')}>Crear + subir</button>
      <button disabled={!!busy||!st?.configured} onClick={history}>Historial GitHub</button>
      <button className="danger" disabled={!!busy||!st?.configured} onClick={restore}>Restaurar último</button>
    </div>

    {msg?<div className="bk130-msg">{msg}</div>:null}

    {remote.length?<div className="table-wrap"><table>
      <thead><tr><th>Backup</th><th>Fecha</th><th>Archivos</th></tr></thead>
      <tbody>{remote.map(x=><tr key={x.id}>
        <td>{x.tag}</td><td>{x.published_at||'—'}</td>
        <td>{(x.assets||[]).map(a=>a.name).join(', ')||'—'}</td>
      </tr>)}</tbody>
    </table></div>:null}
  </section>;
}