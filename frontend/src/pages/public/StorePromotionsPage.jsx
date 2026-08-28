import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { brandText } from '../../config/brand.js';
import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';
import PublicIcon from '../../components/public/PublicIcon.jsx';

function valueLabel(promotion = {}) {
  const type = String(promotion.tipo || '').toUpperCase();
  if (type === 'PORCENTAJE') return `${Number(promotion.valor || 0)}% de descuento`;
  if (type === 'MONTO') return `$${Number(promotion.valor || 0).toLocaleString('es-MX')} de descuento`;
  if (type.includes('PUNTO')) return `${Number(promotion.valor || 2)}x puntos GMX`;
  return 'Beneficio exclusivo';
}

function expiryLabel(value) {
  if (!value) return 'Sin fecha de término';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Vigencia disponible en términos';
  return `Válida hasta ${date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

function countdown(value) {
  const end = value ? new Date(value).getTime() : 0;
  const difference = Math.max(0, end - Date.now());
  return {
    days: String(Math.floor(difference / 86400000)).padStart(2, '0'),
    hours: String(Math.floor((difference / 3600000) % 24)).padStart(2, '0'),
    minutes: String(Math.floor((difference / 60000) % 60)).padStart(2, '0')
  };
}

export default function StorePromotionsPage() {
  const { store } = usePublicStore();
  const rows = store?.promotions || [];
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState('');
  const featured = rows[0] || null;
  const timer = countdown(featured?.fin);

  const visible = useMemo(() => rows.filter((promotion) => {
    const type = String(promotion.tipo || '').toUpperCase();
    if (filter === 'coupon') return Boolean(promotion.codigo);
    if (filter === 'discount') return type === 'PORCENTAJE' || type === 'MONTO';
    if (filter === 'loyalty') return type.includes('PUNTO') || type.includes('FIDEL');
    return true;
  }), [rows, filter]);

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  }

  return <main className="public-page gmx-promotions-page">
    <div className="public-page-head gmx-promotions-head"><small>{brandText('OFERTAS GMX')}</small><h1>Promociones</h1><p>Aprovecha beneficios exclusivos en cartas, accesorios y productos sellados.</p></div>

    <section className="gmx-featured-promotion">
      <div className="gmx-featured-copy">
        <span className="gmx-feature-badge">{featured ? valueLabel(featured) : 'Beneficios para coleccionistas'}</span>
        <h2>{featured?.nombre || 'Semana del coleccionista'}</h2>
        <p>{featured ? 'Campaña vigente administrada directamente desde GMX.' : 'Explora el catálogo y descubre las próximas ofertas de la comunidad GMX.'}</p>
        {featured?.fin ? <div className="gmx-countdown"><span><b>{timer.days}</b><small>Días</small></span><span><b>{timer.hours}</b><small>Horas</small></span><span><b>{timer.minutes}</b><small>Min</small></span></div> : null}
        <Link to="/tienda/catalogo">Ver productos <PublicIcon name="arrow" size={17}/></Link>
      </div>
      <div className="gmx-promo-art" aria-hidden="true"><div className="gmx-promo-deck"/><div className="gmx-promo-card one"/><div className="gmx-promo-card two"/><div className="gmx-promo-box">GMX</div></div>
    </section>

    <section className="gmx-promo-benefits">
      <article><PublicIcon name="truck" size={34}/><span><b>Envío gratis desde $999</b><small>En compras elegibles a todo México.</small><Link to="/tienda/catalogo">Ver productos <PublicIcon name="arrow" size={13}/></Link></span></article>
      <article><PublicIcon name="star" size={34}/><span><b>Fidelidad GMX</b><small>Acumula puntos en ventas confirmadas.</small><Link to="/tienda/cuenta">Ver mis puntos <PublicIcon name="arrow" size={13}/></Link></span></article>
      <article><PublicIcon name="tag" size={34}/><span><b>Accesorios seleccionados</b><small>Fundas, deck boxes y protección.</small><Link to="/tienda/catalogo">Ver accesorios <PublicIcon name="arrow" size={13}/></Link></span></article>
    </section>

    <section className="gmx-active-promotions">
      <div className="public-section-head"><div><small>BENEFICIOS VIGENTES</small><h2>Ofertas activas</h2></div><span className="gmx-public-result-count">{visible.length} promoción{visible.length === 1 ? '' : 'es'}</span></div>
      <div className="gmx-promotion-filters">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todas</button>
        <button className={filter === 'discount' ? 'active' : ''} onClick={() => setFilter('discount')}>Descuentos</button>
        <button className={filter === 'coupon' ? 'active' : ''} onClick={() => setFilter('coupon')}>Cupones</button>
        <button className={filter === 'loyalty' ? 'active' : ''} onClick={() => setFilter('loyalty')}>Fidelidad</button>
      </div>

      {visible.length ? <div className="promo-public-grid gmx-promo-grid">{visible.map((promotion, index) => <article key={promotion.row_id || promotion.id || index} className="promo-public-card gmx-promo-card-item">
        <div className="gmx-promo-card-visual"><span>-{String(promotion.tipo || '').toUpperCase() === 'PORCENTAJE' ? `${Number(promotion.valor || 0)}%` : 'GMX'}</span><div className="gmx-mini-deck"/></div>
        <div className="gmx-promo-card-body"><span className="promo-type">{promotion.tipo || 'PROMOCIÓN'}</span><h2>{promotion.nombre}</h2><strong>{valueLabel(promotion)}</strong><small>{expiryLabel(promotion.fin)}</small>
          {promotion.codigo ? <button className="gmx-inline-code" onClick={() => copyCode(promotion.codigo)}><span>{promotion.codigo}</span><PublicIcon name={copied === promotion.codigo ? 'check' : 'copy'} size={16}/></button> : null}
          <Link to="/tienda/catalogo">Ver productos <PublicIcon name="arrow" size={15}/></Link>
        </div>
      </article>)}</div> : <div className="gmx-empty-state gmx-promo-empty"><div className="gmx-empty-icon"><PublicIcon name="tag" size={29}/></div><h2>{rows.length ? 'No hay promociones de este tipo' : 'Próximamente habrá nuevas promociones'}</h2><p>{rows.length ? 'Selecciona otra categoría para consultar los beneficios vigentes.' : 'El catálogo sigue disponible y aquí publicaremos las siguientes campañas GMX.'}</p><Link to="/tienda/catalogo">Explorar catálogo</Link></div>}
    </section>

    {rows.find((promotion) => promotion.codigo) ? (() => {
      const coupon = rows.find((promotion) => promotion.codigo);
      return <section className="gmx-coupon-band"><div className="gmx-coupon-icon"><PublicIcon name="tag" size={28}/></div><div><b>Cupón disponible</b><small>Utiliza el código durante el checkout, sujeto a la vigencia de la promoción.</small></div><code>{coupon.codigo}</code><button onClick={() => copyCode(coupon.codigo)}>{copied === coupon.codigo ? 'Código copiado' : 'Copiar código'}</button><small>{expiryLabel(coupon.fin)}</small></section>;
    })() : null}

    <section className="gmx-promo-bottom">
      <article><PublicIcon name="star" size={34}/><div><h2>Fidelidad GMX</h2><p>Compra, acumula puntos y obtén recompensas exclusivas.</p><div className="gmx-loyalty-progress"><i/></div><Link to="/tienda/cuenta">Conoce los beneficios</Link></div></article>
      <article><PublicIcon name="mail" size={34}/><div><h2>Recibe próximas promociones</h2><p>Crea tu cuenta para consultar beneficios, pedidos y puntos GMX.</p><Link to="/tienda/cuenta">Ingresar / Crear cuenta</Link></div></article>
    </section>
  </main>;
}
