import { brandText } from "../../config/brand.js";import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useClientAuth } from '../../contexts/ClientAuthContext.jsx';
import { publicApi, money } from '../../services/publicApi.js';
import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';
import GeoSelectFields from '../../components/public/GeoSelectFields.jsx';

export default function StoreAccountPage() {
  const auth = useClientAuth();
  const { store } = usePublicStore();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', country: 'México', state: '', city: '', zip: '', settlement: '', address: '' });
  const [message, setMessage] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [orders, setOrders] = useState([]);
  const [loyalty, setLoyalty] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState({
    alias: 'Casa', nombre_receptor: '', telefono: '',
    address: '', city: '', state: '', zip: '', settlement: '', country: 'México',
    principal: true
  });
  const currency = store?.settings?.['public.store.currency'] || 'MXN';

  async function loadPrivate() {
    if (!auth.user) return;
    try {
      const [o, l, d] = await Promise.all([publicApi('/api/client/orders'), publicApi('/api/client/loyalty'), publicApi('/api/client/addresses')]);
      setOrders(o.data || []);setLoyalty(l.data || null);setAddresses(d.data || []);
    } catch (e) {setMessage(e.message);}
  }
  useEffect(() => {loadPrivate();}, [auth.user?.id_cliente]);

  async function saveAddress(e) {
    e.preventDefault();setMessage('');
    try {
      const payload = {
        alias: address.alias,
        nombre_receptor: address.nombre_receptor,
        telefono: address.telefono,
        direccion: [address.address, address.settlement].filter(Boolean).join(', '),
        ciudad: address.city,
        estado: address.state,
        cp: address.zip,
        pais: address.country || 'México',
        principal: address.principal
      };
      await publicApi('/api/client/addresses', { method: 'POST', body: JSON.stringify(payload) });
      setMessage('Dirección guardada.');
      const d = await publicApi('/api/client/addresses');setAddresses(d.data || []);
      setAddress((x) => ({ ...x, address: '', zip: '', settlement: '' }));
    } catch (e2) {setMessage(e2.message);}
  }

  async function submit(e) {
    e.preventDefault();setMessage('');setVerificationUrl('');
    try {
      if (mode === 'login') {
        await auth.login(form.email, form.password);
        setMessage('Sesión iniciada.');
      } else {
        const result = await auth.register(form);
        setMessage(`Cuenta creada. Enviamos un correo de confirmación a ${result?.email || form.email}. Debes confirmar tu correo antes de iniciar sesión.`);
        if (result?.development_verification_url) setVerificationUrl(result.development_verification_url);
      }
    } catch (e2) {
      const map = {
        EMAIL_NOT_VERIFIED: 'Debes confirmar tu correo electrónico antes de iniciar sesión.',
        CLIENT_ACCOUNT_EXISTS: 'Ya existe una cuenta con ese correo.',
        CLIENT_EMAIL_ALREADY_REGISTERED: 'Ese correo ya está asociado a un cliente. Inicia sesión o recupera tu cuenta.',
        CLIENT_PHONE_ALREADY_REGISTERED: 'Ese número de teléfono ya está asociado a un cliente. Inicia sesión o recupera tu cuenta.',
        CLIENT_IDENTITY_EXISTS: 'Los datos proporcionados ya están asociados a una cuenta existente.',
        CUSTOMER_IDENTITY_CONFLICT: 'El correo y teléfono proporcionados pertenecen a registros distintos. Contacta a soporte para validar tu identidad.',
        INVALID_CLIENT_CREDENTIALS: 'Correo o contraseña incorrectos.'
      };
      setMessage(map[e2.message] || e2.message);
    }
  }

  if (auth.loading) return <main className="public-page"><div className="public-empty">Cargando cuenta…</div></main>;

  if (!auth.user) return <main className="public-page">
    <div className="public-page-head"><small>{brandText("CUENTA GMX")}</small><h1>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1><p>Tu cuenta de cliente es independiente del acceso administrativo.</p></div>
    {message ? <div className="checkout-message">{message}</div> : null}
    {verificationUrl ? <div className="dev-verification"><b>Modo local:</b> si SMTP todavía no está configurado, puedes probar la confirmación con <a href={verificationUrl}>este enlace</a>.</div> : null}
    <div className="client-auth-shell">
      <div className="client-auth-switch"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Iniciar sesión</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Crear cuenta</button></div>
      <form className="client-auth-card" onSubmit={submit}>
        {mode === 'register' ? <>
          <label>Nombre completo<input required value={form.name} onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))} /></label>
          <label>Teléfono<input required value={form.phone} onChange={(e) => setForm((x) => ({ ...x, phone: e.target.value }))} /></label>
        </> : null}
        <label>Email<input required type="email" value={form.email} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))} /></label>
        <label>Contraseña<input required type="password" minLength="8" value={form.password} onChange={(e) => setForm((x) => ({ ...x, password: e.target.value }))} /><small>Mínimo 8 caracteres, con letras y números.</small></label>
        {mode === 'register' ? <><h3>Dirección principal</h3><GeoSelectFields value={form} onChange={setForm} /></> : null}
        <button>{mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}</button>
        {mode === 'login' ? <Link className="forgot-password-link" to="/tienda/recuperar-cuenta">¿Olvidaste tu contraseña? Recuperar cuenta</Link> : null}
      </form>
    </div>
  </main>;

  const points = Number(loyalty?.account?.puntos_disponibles || 0);
  const pointValue = Number(store?.settings?.['loyalty.point_value_mxn'] || .1);
  return <main className="public-page">
    <div className="account-user-head"><div><small>MI CUENTA</small><h1>{auth.user.nombre || auth.user.email}</h1><p>{auth.user.email}</p></div><button onClick={auth.logout}>Cerrar sesión</button></div>
    {message ? <div className="checkout-message">{message}</div> : null}
    <div className="client-account-metrics"><div><span>Puntos</span><strong>{points.toLocaleString('es-MX')}</strong></div><div><span>Valor aproximado</span><strong>{money(points * pointValue, currency)}</strong></div><div><span>Pedidos</span><strong>{orders.length}</strong></div></div>
    <section className="account-loyalty-card">
      <div className="account-loyalty-head"><div><h2>Mis puntos</h2><p>{brandText("Movimientos de fidelidad registrados en GMX.")}</p></div><strong>{points.toLocaleString('es-MX')} pts</strong></div>
      {(loyalty?.movements || []).length ? <div className="loyalty-public-ledger">
        {(loyalty.movements || []).slice(0, 20).map((m, i) => <div key={`${m.fecha}-${i}`}>
          <span><b>{m.tipo}</b><small>{new Date(m.fecha).toLocaleString('es-MX')} · {m.id_pedido || m.motivo || 'Movimiento'}</small></span>
          <strong className={Number(m.puntos) >= 0 ? 'positive' : 'negative'}>{Number(m.puntos) >= 0 ? '+' : ''}{Number(m.puntos)} pts</strong>
          <em>Saldo {Number(m.saldo_nuevo || 0).toLocaleString('es-MX')}</em>
        </div>)}
      </div> : <div className="public-empty small">Aún no tienes movimientos de puntos.</div>}
    </section>

    <div className="client-account-columns">
      <section className="account-orders-card"><h2>Mis pedidos</h2>{orders.length ? orders.map((o) => <Link key={o.id_pedido} className="client-order-row" to={`/tienda/pedido/${o.public_token}`}><div><b>{o.id_pedido}</b><small>{new Date(o.fecha).toLocaleString('es-MX')}</small></div><span>{o.estado_pedido}</span><strong>{money(o.total, currency)}</strong></Link>) : <div className="public-empty small">Aún no tienes pedidos.</div>}</section>
      <section className="account-orders-card"><h2>Mis direcciones</h2>
        <div className="saved-addresses">{addresses.map((d) => <div className="saved-address" key={d.id_direccion}><b>{d.alias || 'Dirección'}{d.principal ? ' · Principal' : ''}</b><span>{d.direccion}</span><small>{[d.ciudad, d.estado, d.cp].filter(Boolean).join(', ')}</small></div>)}</div>
        <form className="address-form" onSubmit={saveAddress}>
          <label>Alias<input placeholder="Casa, Trabajo..." value={address.alias} onChange={(e) => setAddress((x) => ({ ...x, alias: e.target.value }))} /></label>
          <label>Nombre receptor<input value={address.nombre_receptor} onChange={(e) => setAddress((x) => ({ ...x, nombre_receptor: e.target.value }))} /></label>
          <label>Teléfono<input type="tel" inputMode="tel" value={address.telefono} onChange={(e) => setAddress((x) => ({ ...x, telefono: e.target.value }))} /></label>
          <GeoSelectFields value={address} onChange={setAddress} />
          <label className="address-primary"><input type="checkbox" checked={address.principal} onChange={(e) => setAddress((x) => ({ ...x, principal: e.target.checked }))} /> Usar como principal</label>
          <button>Guardar dirección</button>
        </form>
      </section>
    </div>
  </main>;
}
