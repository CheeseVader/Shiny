import { useMemo,useState } from 'react';
import { useNavigate } from 'react-router';

export default function TopBar({ title, subtitle, health, onMenu }) {
  const nav=useNavigate();
  const [loggingOut,setLoggingOut]=useState(false);
  const user=useMemo(()=>{
    try{return JSON.parse(localStorage.getItem('SHINY_AUTH_USER')||'null');}
    catch{return null;}
  },[]);

  const dbText = health?.success
    ? `${health.database.database} · ${health.database.db_user} · ${health.db_ms} ms`
    : health
      ? 'PostgreSQL sin conexión'
      : 'Comprobando PostgreSQL…';

  function logout(){
    if(loggingOut)return;

    const token=localStorage.getItem('SHINY_AUTH_TOKEN');
    setLoggingOut(true);

    // Seguridad primero: retirar el acceso local y desmontar el backoffice
    // antes de esperar cualquier respuesta de red.
    localStorage.removeItem('SHINY_AUTH_TOKEN');
    localStorage.removeItem('SHINY_AUTH_USER');
    nav('/login',{replace:true});

    // Revocar la sesión del servidor en segundo plano. keepalive permite
    // terminar la petición aunque React ya haya desmontado el TopBar.
    if(token){
      fetch('/api/auth/logout',{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`},
        keepalive:true
      }).catch(()=>{});
    }
  }

  return (
    <header className="app-topbar">
      <div className="title-row">
        <button className="mobile-menu" type="button" onClick={onMenu}>☰</button>
        <div>
          {subtitle ? <div className="eyebrow">{subtitle}</div> : null}
          <h1>{title}</h1>
        </div>
      </div>

      <div className="admin-topbar-actions">
        <div className={`db-badge ${health?.success ? 'ok' : health ? 'error' : ''}`}>
          <span className="status-dot" />
          {dbText}
        </div>

        <div className="admin-session-box">
          <div className="admin-session-user">
            <span className="admin-avatar">{String(user?.nombre||user?.email||'A').slice(0,1).toUpperCase()}</span>
            <span className="admin-session-copy">
              <b>{user?.nombre||'Administrador'}</b>
              <small>{user?.rol||user?.email||'ADMIN'}</small>
            </span>
          </div>
          <button className="admin-logout-button" type="button" onClick={logout} disabled={loggingOut}>
            {loggingOut?'Cerrando…':'Cerrar sesión'}
          </button>
        </div>
      </div>
    </header>
  );
}
