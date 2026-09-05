import { brandText } from "../config/brand.js";import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../services/api.js';
import BrandLogo from '../components/BrandLogo.jsx';

import './LoginPageR63.css';
import './LoginNetworkR117.css';
export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // SHINY_RPI_WIFI_LOGIN_R117_STATE
  const [networkState,setNetworkState]=useState({loading:true,wifiUiAvailable:false,connected:false,ssid:'',localIp:''});
  const [wifiOpening,setWifiOpening]=useState(false);
  const [wifiMessage,setWifiMessage]=useState('');
  const [loginAppearance,setLoginAppearance] = useState(() => {
    try {
      const cached=JSON.parse(localStorage.getItem('SHINY_LOGIN_APPEARANCE_R55')||'{}');
      return {
        design:String(cached.design||'network4'),
        glow:String(cached.glow||'violet'),
        mediaId:String(cached.mediaId||''),
        opacity:Math.max(0,Math.min(1,Number(cached.opacity??1)||1)),
        fit:['cover','contain','fill'].includes(String(cached.fit||''))?String(cached.fit):'cover'
      };
    } catch {
      return {design:'network4',glow:'violet',mediaId:'',opacity:1,fit:'cover'};
    }
  });

  useEffect(() => {
    let alive=true;
    fetch('/api/auth/login-appearance',{cache:'no-store'})
      .then(async(r)=>{
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((body)=>{
        if(!alive)return;
        const x=body?.data||{};
        const next={
          design:String(x.design||'network4'),
          glow:String(x.glow||'violet'),
          mediaId:String(x.mediaId||''),
          opacity:Math.max(0,Math.min(1,Number(x.opacity??1)||1)),
          fit:['cover','contain','fill'].includes(String(x.fit||''))?String(x.fit):'cover'
        };
        setLoginAppearance(next);
        try{localStorage.setItem('SHINY_LOGIN_APPEARANCE_R55',JSON.stringify(next));}catch{}
      })
      .catch(()=>{});
    return ()=>{alive=false;};
  },[]);

  // SHINY_RPI_WIFI_LOGIN_R117_EFFECT
  useEffect(()=>{let alive=true;
    async function refresh(){try{const r=await fetch('/api/rpi-network/status',{cache:'no-store'});const b=await r.json();if(alive)setNetworkState({loading:false,wifiUiAvailable:!!b.wifiUiAvailable,connected:!!b.connected,ssid:String(b.ssid||''),localIp:String(b.localIp||'')});}catch{if(alive)setNetworkState(x=>({...x,loading:false}));}}
    refresh();const t=setInterval(refresh,5000);return()=>{alive=false;clearInterval(t);};
  },[]);
  async function openWifiSettings(){setWifiOpening(true);setWifiMessage('');try{const r=await fetch('/api/rpi-network/open-wifi',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const b=await r.json().catch(()=>({}));if(!r.ok||b.success===false)throw new Error(b.message||`HTTP ${r.status}`);setWifiMessage('Administrador de redes abierto. Selecciona Wi-Fi y escribe la contraseña.');}catch(e){setWifiMessage(e.message||'No se pudo abrir Wi-Fi.');}finally{setWifiOpening(false);}}
  async function submit(e) {
    e.preventDefault();setLoading(true);setError('');
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem('SHINY_AUTH_TOKEN', r.data.token);
      localStorage.setItem('SHINY_AUTH_USER', JSON.stringify(r.data.user));

      const role = String(r.data?.user?.rol || '').toUpperCase();

      // Shiny POS R11 â€” doble modalidad:
      // - Web normal: OPERADOR -> /admin/pos y Shiny solicita Fullscreen con un clic.
      // - Launcher/terminal kiosk: /login?kiosk=1 -> /admin/pos?kiosk=1.
      if (role === 'OPERADOR') {
        const kiosk = String(new URLSearchParams(location.search).get('kiosk') || '') === '1';
        nav(kiosk ? '/admin/pos?kiosk=1' : '/admin/pos', { replace: true, state: null });
        return;
      }

      const requested = String(location.state?.from || '');
      const target = requested.startsWith('/admin') ? requested : '/admin/dashboard';
      nav(target, { replace: true, state: null });
    } catch (e2) {
      const map = {
        INVALID_CREDENTIALS: 'Usuario/correo o contraseña incorrectos.',
        CREDENTIALS_REQUIRED: 'Escribe usuario o correo y contraseña.',
        TOO_MANY_ATTEMPTS: 'Demasiados intentos. Espera antes de volver a intentar.'
      };
      setError(map[e2.message] || e2.message);
    } finally {setLoading(false);}
  }

  return <main className={`login-page shiny-login-r55 design-${loginAppearance.design}`} data-login-glow={loginAppearance.glow}>
      {loginAppearance.design==='custom' && loginAppearance.mediaId ?
        <img
          className="shiny-login-custom-background-r63m"
          src={`/api/auth/login-background?v=${encodeURIComponent(loginAppearance.mediaId)}`}
          alt=""
          aria-hidden="true"
          style={{
            opacity:loginAppearance.opacity,
            objectFit:loginAppearance.fit
          }}
        /> : null}
    <div className="shiny-login-network-r55" aria-hidden="true">
      <span className="shiny-login-orb-r55 orb-a" />
      <span className="shiny-login-orb-r55 orb-b" />
      <span className="shiny-login-orb-r55 orb-c" />
      <span className="shiny-login-line-r55 line-a" />
      <span className="shiny-login-line-r55 line-b" />
      <span className="shiny-login-line-r55 line-c" />
      <span className="shiny-login-node-r55 node-a" />
      <span className="shiny-login-node-r55 node-b" />
      <span className="shiny-login-node-r55 node-c" />
      <span className="shiny-login-node-r55 node-d" />
      <span className="shiny-login-node-r55 node-e" />
    </div>
    <form className="login-card" onSubmit={submit}>
      <BrandLogo compact className="login-dynamic-brand" />
      <div className="eyebrow">{brandText("Shiny · ADMIN")}</div>
      <h1>Iniciar sesión</h1>
      <p>Acceso administrativo seguro.</p>
      {/* SHINY_RPI_WIFI_LOGIN_R117_UI */}
      <div className={`shiny-login-wifi-r117 ${networkState.connected?'is-online':'is-offline'}`}>
        <div className="wifi-row"><div className="wifi-state"><span className="wifi-dot"/><span className="wifi-name">{networkState.loading?'Comprobando red...':networkState.connected?`Wi-Fi: ${networkState.ssid}`:'Sin Wi-Fi conectada'}</span></div>{networkState.localIp?<span className="wifi-ip">{networkState.localIp}</span>:null}</div>
        {networkState.wifiUiAvailable?<button type="button" className="wifi-config-btn" disabled={wifiOpening} onClick={openWifiSettings}>{wifiOpening?'Abriendo Wi-Fi...':'Configurar Wi-Fi'}</button>:null}
        {wifiMessage?<div className="wifi-message">{wifiMessage}</div>:null}
      </div>
      <label>Usuario o correo<input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} required /></label>
      <label>Contrase&ntilde;a<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error ? <div className="alert error">{error}</div> : null}
      <button disabled={loading}>{loading ? 'Validando...' : 'Entrar'}</button>

    </form>
  </main>;
}
