import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router';
import { publicApi,money } from '../../services/publicApi.js';
import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';

export default function StoreTransferPage(){
  const {token}=useParams();
  const {store}=usePublicStore();
  const [order,setOrder]=useState(null);
  const [bank,setBank]=useState(null);
  const [message,setMessage]=useState('');
  const [uploading,setUploading]=useState(false);
  const currency=store?.settings?.['public.store.currency']||'MXN';

  useEffect(()=>{
    Promise.all([publicApi(`/api/public/orders/${token}`),publicApi('/api/payments/transfer/settings')])
      .then(([o,b])=>{setOrder(o.data);setBank(b.data);})
      .catch(e=>setMessage(e.message));
  },[token]);

  async function upload(file){
    if(!file)return;
    setUploading(true);setMessage('');
    try{
      const data=await new Promise((resolve,reject)=>{
        const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);
      });
      await publicApi(`/api/payments/transfer/${token}/proof`,{method:'POST',body:JSON.stringify({file:{name:file.name,mime:file.type,data}})});
      setMessage('Comprobante recibido. Enviamos una confirmación por correo.');
      setOrder(x=>({...x,transfer_proof_status:'RECEIVED'}));
    }catch(e){setMessage(e.message);}finally{setUploading(false);}
  }

  if(!order||!bank)return <main className="public-page"><div className="public-empty">{message||'Cargando instrucciones…'}</div></main>;

  return <main className="public-page">
    <div className="public-page-head"><small>TRANSFERENCIA</small><h1>Realiza tu transferencia</h1><p>Usa exactamente la referencia indicada para identificar tu pedido.</p></div>
    {message?<div className="checkout-message">{message}</div>:null}
    <div className="transfer-layout">
      <section className="bank-card">
        <h2>Datos bancarios</h2>
        <div><span>Banco</span><b>{bank.bank_name||'Por configurar'}</b></div>
        <div><span>Titular</span><b>{bank.account_holder||'Por configurar'}</b></div>
        <div><span>Cuenta</span><b>{bank.account_number||'—'}</b></div>
        <div><span>CLABE</span><b>{bank.clabe||'—'}</b></div>
        <div className="bank-reference"><span>Referencia</span><strong>{order.numero_comprobante||order.id_pedido}</strong></div>
        <p>{bank.instructions}</p>
      </section>
      <aside className="transfer-order">
        <h2>{order.id_pedido}</h2><div className="checkout-grand"><span>Total a transferir</span><strong>{money(order.total,currency)}</strong></div>
        <label className="proof-upload">{uploading?'Subiendo…':order.transfer_proof_status==='RECEIVED'?'✓ Comprobante recibido':'Subir comprobante de transferencia'}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={uploading} onChange={e=>upload(e.target.files?.[0])}/></label>
        <small>Formatos: JPG, PNG, WebP o PDF. Máximo 10 MB.</small>
        <Link className="secondary-public full" target="_blank" to={`/tienda/comprobante/${token}`}>Imprimir pedido / comprobante</Link>
      </aside>
    </div>
  </main>;
}
