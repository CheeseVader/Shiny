import { useState } from 'react';
import { api } from '../services/api.js';
import '../return_pin_authorization_r77.css';

export default function ReturnAuthorizationPage() {
  const [generatedPin,setGeneratedPin]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  async function generatePin(){
    if(busy)return;
    setBusy(true);
    setMessage('');
    try{
      const response=await api('/api/v1/commercial/returns/pin/generate',{
        method:'POST',
        body:'{}'
      });
      setGeneratedPin(response?.data||null);
    }catch(error){
      setGeneratedPin(null);
      setMessage(error?.message||'No fue posible generar el código de autorización.');
    }finally{
      setBusy(false);
    }
  }

  return <section className="commercial-section shiny-return-auth-page">
    <div className="shiny-r73-title">
      <div>
        <div className="eyebrow">AUTORIZACIÓN POS</div>
        <h2>Generar código</h2>
        <p>Genera un código temporal para autorizar devoluciones y descuentos manuales en Punto de Venta.</p>
      </div>
    </div>

    <section className="shiny-r77-pin-card">
      <div className="shiny-r77-pin-copy">
        <span className="eyebrow">AUTORIZACIÓN POS</span>
        <strong>Código temporal para devoluciones y descuentos</strong>
        <small>Un solo uso · vigencia 5 minutos · validación en Punto de Venta</small>
      </div>

      {generatedPin?.pin ? <div className="shiny-r77-pin-value">
        <span>Código activo</span>
        <strong>{generatedPin.pin}</strong>
        <small>Vence {generatedPin.expiresAt ? new Date(generatedPin.expiresAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) : 'en 5 min'}</small>
      </div> : null}

      <button
        type="button"
        className="shiny-r77-pin-generate"
        disabled={busy}
        onClick={generatePin}
      >
        {busy ? 'Generando…' : generatedPin?.pin ? 'Generar nuevo código' : 'Generar código'}
      </button>
    </section>

    {message ? <div className="commercial-panel"><p>{message}</p></div> : null}
  </section>;
}