import { Link } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';
import { publicApi } from '../../services/publicApi.js';
import StoreSlideshow from '../../components/public/StoreSlideshow.jsx';
import ProductCard from '../../components/public/ProductCard.jsx';
import PublicIcon from '../../components/public/PublicIcon.jsx';
import { genericProducts } from '../../utils/publicCatalogClassification.js';

function themeForGame(game = {}) {
  const key = `${game.catalogo_codigo || game.codigo || ''} ${game.nombre || ''}`.toLowerCase();
  if (key.includes('pokemon')) return 'pokemon';
  if (key.includes('magic') || key.includes('mtg')) return 'magic';
  if (key.includes('yugioh') || key.includes('yu-gi')) return 'yugioh';
  if (key.includes('riftbound')) return 'riftbound';
  return 'gmx';
}

export default function StoreHomePage() {
  const { store, liveUpdate } = usePublicStore();
  const [products, setProducts] = useState([]);
  const [games, setGames] = useState([]);
  const [productTab, setProductTab] = useState('popular');

  useEffect(() => {
    Promise.all([
      publicApi('/api/public/products?limit=100'),
      publicApi('/api/public/tcg/games')
    ]).then(([productResponse, gameResponse]) => {
      const gameRows = gameResponse.data || [];
      setGames(gameRows);
      setProducts(genericProducts(productResponse.data || [], gameRows).slice(0, 12));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!liveUpdate?.version) return;
    const changes = liveUpdate.changes || [];
    setProducts((rows) => rows.map((product) => {
      const hit = changes.find((change) => change.type === 'PRODUCT' && String(change.id) === String(product.id));
      return hit ? { ...product, stock_disponible: Number(hit.stock) } : product;
    }));
  }, [liveUpdate?.version]);

  const zones = store?.zones || {};
  const settings = store?.settings || {};
  const currency = settings['public.store.currency'] || 'MXN';
  const promotion = store?.promotions?.[0] || null;

  const visibleProducts = useMemo(() => {
    const rows = [...products];
    if (productTab === 'new') rows.reverse();
    if (productTab === 'offers') {
      const discounted = rows.filter((product) => Number(product.precio_regular || 0) > Number(product.precio || 0));
      return (discounted.length ? discounted : rows).slice(0, 8);
    }
    if (productTab === 'popular') rows.sort((a, b) => Number(b.stock_disponible || 0) - Number(a.stock_disponible || 0));
    return rows.slice(0, 8);
  }, [products, productTab]);

  return <main className="public-home gmx-home">
    <section className="gmx-home-hero">
      <div className="gmx-hero-glow" />
      <div className="gmx-hero-copy">
        <span className="gmx-eyebrow">CARTAS · ACCESORIOS · COLECCIONABLES</span>
        <h1>Encuentra tu<br/>próxima carta</h1>
        <p>Miles de cartas, accesorios y productos sellados para coleccionistas y jugadores en México.</p>
        <div className="gmx-hero-actions">
          <Link className="public-cta" to="/tienda/catalogo">Explorar catálogo <PublicIcon name="arrow" size={17} /></Link>
          <Link className="gmx-secondary-cta" to="/tienda/promociones">Ver promociones</Link>
        </div>
      </div>
      <div className="gmx-hero-visual" aria-hidden="true">
        <div className="gmx-deck-stack"><i/><i/><i/></div>
        <div className="gmx-card-back gmx-card-one"><span>GMX</span></div>
        <div className="gmx-card-back gmx-card-two"><span>TCG</span></div>
        <div className="gmx-deck-box"><span>GMX</span></div>
      </div>
    </section>

    <section className="gmx-trust-strip" aria-label="Beneficios de compra">
      <div><PublicIcon name="shield" /><span><b>Envíos seguros</b><small>A todo México con paqueterías confiables.</small></span></div>
      <div><PublicIcon name="check" /><span><b>Stock verificado</b><small>Existencias actualizadas antes de comprar.</small></span></div>
      <div><PublicIcon name="package" /><span><b>Compra protegida</b><small>Productos revisados y empaque seguro.</small></span></div>
    </section>

    <section className="public-section gmx-home-section">
      <div className="public-section-head">
        <div><small>JUEGA · COLECCIONA</small><h2>Explora por TCG</h2></div>
        <Link to="/tienda/tcg">Ver todos <PublicIcon name="arrow" size={15} /></Link>
      </div>
      <div className="public-game-grid gmx-game-grid">
        {games.slice(0, 4).map((game) => <Link
          key={game.id_juego}
          to={`/tienda/tcg?gameId=${encodeURIComponent(game.id_juego)}`}
          className="public-game-card gmx-game-card"
          data-game-theme={themeForGame(game)}
        >
          {game.imagen ? <img src={game.imagen} alt="" /> : <div className="gmx-game-art"><i/><i/><i/></div>}
          <div className="gmx-game-copy"><strong>{game.nombre}</strong><span>{game.descripcion || 'Cartas, producto sellado y accesorios'}</span><em>Explorar <PublicIcon name="arrow" size={15} /></em></div>
        </Link>)}
      </div>
    </section>

    {zones.HOME_HERO?.length ? <div className="gmx-managed-banner"><StoreSlideshow slides={zones.HOME_HERO} settings={settings} variant="wide" /></div> : null}

    <section className="public-section gmx-home-section gmx-products-section">
      <div className="public-section-head gmx-products-heading">
        <div><small>SELECCIÓN GMX</small><h2>Destacados para ti</h2></div>
        <div className="gmx-product-tabs" role="tablist" aria-label="Orden de productos">
          <button className={productTab === 'popular' ? 'active' : ''} onClick={() => setProductTab('popular')}>Más vendidos</button>
          <button className={productTab === 'new' ? 'active' : ''} onClick={() => setProductTab('new')}>Novedades</button>
          <button className={productTab === 'offers' ? 'active' : ''} onClick={() => setProductTab('offers')}>Ofertas</button>
        </div>
      </div>
      {visibleProducts.length
        ? <div className="public-products-grid gmx-home-products">{visibleProducts.map((product) => <ProductCard key={product.row_id} product={product} currency={currency} />)}</div>
        : <div className="gmx-empty-inline"><PublicIcon name="package" size={28} /><span><b>Estamos preparando nuevos productos</b><small>Mientras tanto, explora el catálogo de cartas TCG.</small></span><Link to="/tienda/tcg">Explorar TCG</Link></div>}
      <Link className="gmx-see-catalog" to="/tienda/catalogo">Ver todo el catálogo <PublicIcon name="arrow" size={15} /></Link>
    </section>

    {zones.HOME_FEATURED_BANNER?.length ? <div className="gmx-managed-banner"><StoreSlideshow slides={zones.HOME_FEATURED_BANNER} settings={settings} variant="wide" /></div> : null}

    <section className="gmx-promotion-band">
      <div className="gmx-promo-gift"><PublicIcon name="tag" size={29} /></div>
      <div><h2>{promotion?.nombre || 'Promociones exclusivas cada semana'}</h2><p>{promotion ? 'Aprovecha esta campaña por tiempo limitado.' : 'Descuentos, cupones y sorpresas para la comunidad GMX.'}</p></div>
      <Link to="/tienda/promociones">Ver promociones <PublicIcon name="arrow" size={16} /></Link>
    </section>

    {zones.HOME_MID_BANNER?.length ? <div className="gmx-managed-banner"><StoreSlideshow slides={zones.HOME_MID_BANNER} settings={settings} variant="wide" /></div> : null}
  </main>;
}
