import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router';
import { publicApi } from '../../services/publicApi.js';
import { useCart } from '../../contexts/CartContext.jsx';

export default function StoreCardResultPage(){
  const [params]=useSearchParams();
  const cart=useCart();
  const [state,setState]=useState('checking');
  const [token]=useState(params.get('token')||'');
  const sessionId=params.get('session_id')||'';

  useEffect(()=>{
    if(!token||!sessionId){setState('error');return;}
    publicApi('/api/payments/stripe/confirm',{method:'POST',body:JSON.stringify({token,sessionId})})
      .then(r=>{
        if(r.data?.paid){
          cart.clear();sessionStorage.removeItem('GMX_PENDING_CARD_ORDER');setState('paid');
          window.open(`/tienda/comprobante/${token}`,'gmx_receipt');
        }else setState('pending');
      }).catch(()=>setState('error'));
  },[token,sessionId]);

  return <main className="public-page"><div className="payment-result-card">
    {state==='checking'?<><div className="verification-icon">💳</div><h1>Verificando pago…</h1></>:null}
    {state==='paid'?<><div className="verification-icon success">✓</div><h1>Pago confirmado</h1><p>El comprobante se abrió en una nueva pestaña y también se envió la confirmación por correo.</p><div className="order-actions"><Link className="public-cta" target="_blank" to={`/tienda/comprobante/${token}`}>Abrir comprobante</Link><Link className="secondary-public" to={`/tienda/pedido/${token}`}>Ver pedido</Link></div></>:null}
    {state==='pending'?<><div className="verification-icon">…</div><h1>Pago en proceso</h1><p>El proveedor todavía no reporta el pago como completado.</p></>:null}
    {state==='error'?<><div className="verification-icon error">!</div><h1>No pudimos verificar el pago</h1><p>Consulta el pedido o intenta nuevamente desde el carrito.</p><Link className="public-cta" to="/tienda/cuenta">Mi cuenta</Link></>:null}
  </div></main>;
}
