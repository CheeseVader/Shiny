import { brandText } from "../../config/brand.js";import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';

export default function StorePromotionsPage() {
  const { store } = usePublicStore();
  const rows = store?.promotions || [];
  return <main className="public-page">
    <div className="public-page-head"><small>{brandText("OFERTAS GMX")}</small><h1>Promociones</h1><p>Campañas vigentes administradas desde Promociones / Fidelidad.</p></div>
    {rows.length ? <div className="promo-public-grid">{rows.map((p) => <article key={p.row_id || p.id} className="promo-public-card">
      <span className="promo-type">{p.tipo}</span><h2>{p.nombre}</h2>
      {p.codigo ? <div className="promo-code">{p.codigo}</div> : null}
      <p>{p.tipo === 'PORCENTAJE' ? `${p.valor}% de descuento` : p.tipo === 'MONTO' ? `$${p.valor} de descuento` : 'Promoción vigente'}</p>
      <small>{p.fin ? `Válida hasta ${new Date(p.fin).toLocaleString('es-MX')}` : 'Sin fecha de término'}</small>
    </article>)}</div> : <div className="public-empty">No hay promociones vigentes por el momento.</div>}
  </main>;
}
