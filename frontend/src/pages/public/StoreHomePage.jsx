import { brandText } from "../../config/brand.js";import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';
import { publicApi } from '../../services/publicApi.js';
import StoreSlideshow from '../../components/public/StoreSlideshow.jsx';
import ProductCard from '../../components/public/ProductCard.jsx';
import { genericProducts } from '../../utils/publicCatalogClassification.js';

export default function StoreHomePage() {
  const { store, liveUpdate } = usePublicStore();
  const [products, setProducts] = useState([]);
  const [games, setGames] = useState([]);

  useEffect(() => {
    Promise.all([
    publicApi('/api/public/products?limit=100'),
    publicApi('/api/public/tcg/games')]
    ).then(([p, g]) => {
      const gameRows = g.data || [];
      setGames(gameRows);
      setProducts(genericProducts(p.data || [], gameRows).slice(0, 8));
    }).catch(() => {});
  }, []);


  useEffect(() => {
    if (!liveUpdate?.version) return;
    const changes = liveUpdate.changes || [];
    setProducts((rows) => rows.map((p) => {
      const hit = changes.find((c) => c.type === 'PRODUCT' && String(c.id) === String(p.id));
      return hit ? { ...p, stock_disponible: Number(hit.stock) } : p;
    }));
  }, [liveUpdate?.version]);

  const zones = store?.zones || {};
  const settings = store?.settings || {};
  const currency = settings['public.store.currency'] || 'MXN';

  return <main className="public-home">
    <StoreSlideshow slides={zones.HOME_HERO || []} settings={settings} variant="hero" />
    <StoreSlideshow slides={zones.HOME_FEATURED_BANNER || []} settings={settings} variant="wide" />

    <section className="public-section">
      <div className="public-section-head"><div><small>JUEGA · COLECCIONA</small><h2>Explora por TCG</h2></div><Link to="/tienda/tcg">Ver todo →</Link></div>
      <div className="public-game-grid">
        {games.slice(0, 6).map((g) => <Link key={g.id_juego} to={`/tienda/tcg?gameId=${encodeURIComponent(g.id_juego)}`} className="public-game-card">
          {g.imagen ? <img src={g.imagen} alt={g.nombre} /> : <div className="game-placeholder">TCG</div>}
          <strong>{g.nombre}</strong><span>{g.descripcion || 'Explorar cartas y variantes'}</span>
        </Link>)}
      </div>
    </section>

    <section className="public-section">
      <div className="public-section-head"><div><small>DESTACADOS</small><h2>Productos generales</h2></div><Link to="/tienda/catalogo">Ver catálogo →</Link></div>
      <div className="public-products-grid">{products.map((p) => <ProductCard key={p.row_id} product={p} currency={currency} />)}</div>
    </section>

    <StoreSlideshow slides={zones.HOME_MID_BANNER || []} settings={settings} variant="wide" />

    <section className="public-feature-strip">
      <div><b>📦 Pedido local</b><span>Consulta disponibilidad por sucursal.</span></div>
      <div><b>{brandText("⭐ Fidelidad GMX")}</b><span>Acumula puntos en ventas confirmadas.</span></div>
      <div><b>🏷 Promociones</b><span>{brandText("Códigos administrados directamente desde GMX.")}</span></div>
    </section>
  </main>;
}
