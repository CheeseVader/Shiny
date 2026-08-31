import { Link } from 'react-router';
import { useState } from 'react';
import { money } from '../../services/publicApi.js';
import { useCart } from '../../contexts/CartContext.jsx';
import PublicIcon from './PublicIcon.jsx';

export default function TcgCard({item,currency='MXN'}){
  const cart=useCart();
  const [favorite,setFavorite]=useState(false);
  const [added,setAdded]=useState(false);
  const stock=Number(item.stock_disponible||0);
  function addToCart(){
    cart.addItem({
      type:'TCG',id:item.id_inventario,rowId:item.row_id,name:item.carta,sku:item.sku,
      price:Number(item.precio),image:item.imagen_principal||'',stock,
      detail:[item.numero_completo,item.condicion,item.idioma].filter(Boolean).join(' · ')
    });
    setAdded(true);
    window.setTimeout(()=>setAdded(false),1400);
  }
  return <article className="public-product-card shiny-product-card tcg-card">
    <Link to={`/tienda/tcg/item/${item.row_id}`} className="product-card-image">
      {item.imagen_principal?<img src={item.imagen_principal} alt={item.carta||''} loading="lazy"/>:<div className="public-image-placeholder shiny-image-fallback"><span>Shiny</span><small>Imagen próximamente</small></div>}
      {item.rareza?<span className="tcg-badge">{item.rareza}</span>:null}
    </Link>
    <button type="button" className={`shiny-favorite ${favorite?'active':''}`} aria-label={favorite?'Quitar de favoritos':'Agregar a favoritos'} onClick={()=>setFavorite(value=>!value)}><PublicIcon name="heart" size={18}/></button>
    <div className="public-product-body">
      <small>{item.juego} · {item.set_nombre||'Set'}</small>
      <Link to={`/tienda/tcg/item/${item.row_id}`}><h3>{item.carta}{item.rareza?` (${item.rareza})`:''}</h3></Link>
      <div className="tcg-meta">{[item.numero_completo,item.condicion,item.idioma,item.acabado].filter(Boolean).join(' · ')}</div>
      <div className="shiny-card-price-row"><div className="public-product-price">{money(item.precio,currency)}</div><span className={`shiny-stock-badge ${stock>0?'ok':'out'}`}>{stock>0?`${stock} disponible${stock===1?'':'s'}`:'Agotado'}</span></div>
      <button disabled={stock<=0} onClick={addToCart}>{stock<=0?'Agotado':added?'Agregado':<>Agregar <PublicIcon name={added?'check':'cart'} size={16}/></>}</button>
    </div>
  </article>;
}
