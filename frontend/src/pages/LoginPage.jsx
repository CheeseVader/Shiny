import { brandText } from "../config/brand.js";import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../services/api.js';
import BrandLogo from '../components/BrandLogo.jsx';

export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginAppearance] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('SHINY_LOGIN_APPEARANCE_R55') || '{}');
      return {
        design: String(cached.design || 'network4'),
        glow: String(cached.glow || 'violet')
      };
    } catch {
      return { design: 'network4', glow: 'violet' };
    }
  });

  async function submit(e) {
    e.preventDefault();setLoading(true);setError('');
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem('SHINY_AUTH_TOKEN', r.data.token);
      localStorage.setItem('SHINY_AUTH_USER', JSON.stringify(r.data.user));

      const role = String(r.data?.user?.rol || '').toUpperCase();

      // Shiny POS R11 — doble modalidad:
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
        INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
        CREDENTIALS_REQUIRED: 'Escribe correo y contraseña.',
        TOO_MANY_ATTEMPTS: 'Demasiados intentos. Espera antes de volver a intentar.'
      };
      setError(map[e2.message] || e2.message);
    } finally {setLoading(false);}
  }

  return <main className={`login-page shiny-login-r55 design-${loginAppearance.design}`} data-login-glow={loginAppearance.glow}>
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
      <label>Usuario<input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} required /></label>
      <label>Contrase&ntilde;a<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error ? <div className="alert error">{error}</div> : null}
      <button disabled={loading}>{loading ? 'Validando...' : 'Entrar'}</button>

    </form>
  </main>;
}
