import { brandText } from "../config/brand.js";import { NavLink, Outlet, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { usePublicStore } from '../contexts/PublicStoreContext.jsx';
import { useCart } from '../contexts/CartContext.jsx';
import { useClientAuth } from '../contexts/ClientAuthContext.jsx';
import { publicApi } from '../services/publicApi.js';

export default function PublicStoreLayout() {
  const { store, loading, error } = usePublicStore();
  const cart = useCart();
  const clientAuth = useClientAuth();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [searchType, setSearchType] = useState('ALL');
  const [tcgGames, setTcgGames] = useState([]);
  const s = store?.settings || {};
  const brand = s['public.appearance.brand_name'] || brandText("GMX");
  const logo = s['public.appearance.logo_text'] || 'G';

  async function loadVisibleTcgGames() {
    try {
      const r = await publicApi(`/api/public/tcg/games?_=${Date.now()}`);
      setTcgGames(Array.isArray(r.data) ? r.data : []);
    } catch {
      setTcgGames([]);
    }
  }

  useEffect(() => {
    loadVisibleTcgGames();

    const refresh = () => loadVisibleTcgGames();
    const storage = (e) => {
      if (e.key === 'GMX_TCG_VISIBILITY_VERSION') refresh();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('storage', storage);
    window.addEventListener('gmx:tcg-visibility-changed', refresh);
    document.addEventListener('visibilitychange', visibility);

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', storage);
      window.removeEventListener('gmx:tcg-visibility-changed', refresh);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  function submitSearch(e) {
    e.preventDefault();
    const q = search.trim();
    if (!q) {nav('/tienda/catalogo');return;}
    if (searchType === 'PRODUCT') nav(`/tienda/catalogo?q=${encodeURIComponent(q)}`);else
    if (searchType === 'TCG') nav(`/tienda/tcg?q=${encodeURIComponent(q)}`);else
    nav(`/tienda/buscar?q=${encodeURIComponent(q)}`);
  }

  return <div className="public-store" style={{
    '--ps-primary': s['public.appearance.primary'] || '#111827',
    '--ps-secondary': s['public.appearance.secondary'] || '#f59e0b',
    '--ps-accent': s['public.appearance.accent'] || '#8b5cf6',
    '--ps-surface': s['public.appearance.surface'] || '#111827',
    '--ps-bg': s['public.appearance.background'] || '#090e1a',
    '--ps-text': s['public.appearance.text'] || '#f8fafc',
    '--ps-muted': s['public.appearance.muted'] || '#94a3b8',
    '--ps-radius': `${Number(s['public.appearance.radius'] || 18)}px`
  }}>
    <header className="public-header">
      <div className="public-header-main">
        <NavLink to="/tienda" className="public-brand"><b>{logo}</b><strong>{brand}</strong></NavLink>
        <form className="public-search" onSubmit={submitSearch}>
          <select aria-label="Tipo de búsqueda" value={searchType} onChange={(e) => setSearchType(e.target.value)}>
            <option value="ALL">Todo</option><option value="PRODUCT">Productos</option><option value="TCG">TCG</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cartas, productos, sets..." />
          <button aria-label="Buscar">⌕</button>
        </form>
        <nav className="public-account-nav">
          <NavLink to="/tienda/cuenta">{clientAuth.user?.nombre ? `Hola, ${String(clientAuth.user.nombre).split(' ')[0]}` : 'Ingresar / Cuenta'}</NavLink>
          <NavLink to="/tienda/carrito" className="cart-link">🛒 <span>{cart.count}</span></NavLink>
        </nav>
      </div>
      <nav className="public-category-nav">
        {tcgGames.map((game) => <NavLink
          key={game.id_juego}
          to={`/tienda/tcg?gameId=${encodeURIComponent(game.id_juego)}`}>
          {game.nombre}</NavLink>)}
        <NavLink to="/tienda/catalogo">Productos</NavLink>
        <NavLink to="/tienda/promociones">Promociones</NavLink>
      </nav>
    </header>

    {store?.promotions?.length ? <div className="public-promo-bar">
      🏷 {store.promotions[0].nombre}{store.promotions[0].codigo ? <> · Código <b>{store.promotions[0].codigo}</b></> : null}
    </div> : null}

    {loading ? <div className="public-system-message">Cargando tienda…</div> : null}
    {error ? <div className="public-system-message error">{error}</div> : null}

    <Outlet />

    <footer className="public-footer">
      <div><strong>{brand}</strong><p>Tu tienda geek y TCG.</p></div>
      <div><b>Comprar</b><NavLink to="/tienda/catalogo">Catálogo</NavLink><NavLink to="/tienda/tcg">TCG</NavLink><NavLink to="/tienda/promociones">Promociones</NavLink></div>
      <div><b>Mi cuenta</b><NavLink to="/tienda/cuenta">Perfil</NavLink><NavLink to="/tienda/cuenta">Mis pedidos</NavLink><NavLink to="/tienda/cuenta">Mis puntos</NavLink></div>
      <div><b>Ayuda</b><NavLink to="/tienda/carrito">Carrito</NavLink><span>Envíos</span><span>Devoluciones</span></div>
    </footer>
  </div>;
}
