import { brandText } from "../../config/brand.js";import { Link } from 'react-router';
import { money } from '../../services/publicApi.js';
import { useCart } from '../../contexts/CartContext.jsx';

function imgSrc(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value) || value.startsWith('/')) return value;
  return value;
}
export default function ProductCard({ product, currency = 'MXN' }) {
  const cart = useCart();
  const stock = Number(product.stock_disponible ?? product.stock ?? 0);
  return <article className="public-product-card">
    <Link to={`/tienda/producto/${product.row_id}`} className="product-card-image">
      {product.imagen ? <img src={imgSrc(product.imagen)} alt={product.nombre || ''} loading="lazy" /> : <div className="public-image-placeholder">{brandText("GMX")}</div>}
    </Link>
    <div className="public-product-body">
      <small>{product.categoria || 'Producto'}</small>
      <Link to={`/tienda/producto/${product.row_id}`}><h3>{product.nombre}</h3></Link>
      <div className="public-product-price">{money(product.precio, currency)}</div>
      <div className="public-stock">{stock > 0 ? `${stock} disponibles` : 'Agotado'}</div>
      <button disabled={stock <= 0} onClick={() => cart.addItem({ type: 'PRODUCT', id: product.id, rowId: product.row_id, name: product.nombre, sku: product.sku, price: Number(product.precio), image: product.imagen || '', stock })}>
        {stock > 0 ? 'Agregar al carrito' : 'Agotado'}
      </button>
    </div>
  </article>;
}
