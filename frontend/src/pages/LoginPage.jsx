import { brandText } from "../config/brand.js";import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../services/api.js';

export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();setLoading(true);setError('');
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('GMX_AUTH_TOKEN', r.data.token);
      localStorage.setItem('GMX_AUTH_USER', JSON.stringify(r.data.user));

      const role = String(r.data?.user?.rol || '').toUpperCase();

      // GMX POS R11 — doble modalidad:
      // - Web normal: OPERADOR -> /admin/pedidos y GMX solicita Fullscreen con un clic.
      // - Launcher/terminal kiosk: /login?kiosk=1 -> /admin/pedidos?kiosk=1.
      if (role === 'OPERADOR') {
        const kiosk = String(new URLSearchParams(location.search).get('kiosk') || '') === '1';
        nav(kiosk ? '/admin/pedidos?kiosk=1' : '/admin/pedidos', { replace: true, state: null });
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

  return <main className="login-page">
    <form className="login-card" onSubmit={submit}>
      <div className="brand-mark login-mark">G</div>
      <div className="eyebrow">{brandText("GMX · ADMIN")}</div>
      <h1>Iniciar sesión</h1>
      <p>Acceso administrativo seguro.</p>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error ? <div className="alert error">{error}</div> : null}
      <button disabled={loading}>{loading ? 'Validando...' : 'Entrar'}</button>
      <Link className="admin-forgot-link" to="/admin/recuperar-acceso">¿Olvidaste tu contraseña? Recuperar acceso</Link>
    </form>
  </main>;
}
