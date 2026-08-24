import { Link } from 'react-router';
import { money } from '../../services/publicApi.js';
import { useCart } from '../../contexts/CartContext.jsx';

export default function TcgCard({item,currency='MXN'}){
  const cart=useCart();
  const stock=Number(item.stock_disponible||0);
  return <article className="public-product-card tcg-card">
    <Link to={`/tienda/tcg/item/${item.row_id}`} className="product-card-image">
      {item.imagen_principal?<img src={item.imagen_principal} alt={item.carta||''} loading="lazy"/>:<div className="public-image-placeholder">TCG</div>}
      {item.rareza?<span className="tcg-badge">{item.rareza}</span>:null}
    </Link>
    <div className="public-product-body">
      <small>{item.juego} · {item.set_nombre||'Set'}</small>
      <Link to={`/tienda/tcg/item/${item.row_id}`}><h3>{item.carta}{item.rareza?` (${item.rareza})`:''}</h3></Link>
      <div className="tcg-meta">{[item.numero_completo,item.condicion,item.idioma,item.acabado].filter(Boolean).join(' · ')}</div>
      <div className="public-product-price">{money(item.precio,currency)}</div>
      <div className="public-stock">{stock} disponibles</div>
      <button disabled={stock<=0} onClick={()=>cart.addItem({
        type:'TCG',id:item.id_inventario,rowId:item.row_id,name:item.carta,sku:item.sku,
        price:Number(item.precio),image:item.imagen_principal||'',stock,
        detail:[item.numero_completo,item.condicion,item.idioma].filter(Boolean).join(' · ')
      })}>Agregar al carrito</button>
    </div>
  </article>;
}
