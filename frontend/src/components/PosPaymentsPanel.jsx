import React,{useEffect} from 'react';

const methods=['EFECTIVO','TRANSFERENCIA','TARJETA'];

function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function money(v){return `$${n(v).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}

export default function PosPaymentsPanel({total=0,payments,setPayments}){
  const t=n(total);

  useEffect(()=>{
    setPayments(prev=>{
      const rows=Array.isArray(prev)&&prev.length?prev:[{method:'EFECTIVO',amount:t,cashReceived:t,reference:''}];
      if(rows.length===1){
        const r=rows[0];
        const old=n(r.amount);
        // Mantiene sincronizada una venta de un solo método cuando cambia cantidad/total.
        if(old===0 || Math.abs(old-t)>0.009){
          const next={...r,amount:t};
          if(next.method==='EFECTIVO' && n(next.cashReceived)<t) next.cashReceived=t;
          return [next];
        }
      }
      return rows;
    });
  },[t,setPayments]);

  const rows=Array.isArray(payments)?payments:[];
  const assigned=rows.reduce((s,r)=>s+n(r.amount),0);
  const pending=Number((t-assigned).toFixed(2));

  function update(i,patch){
    setPayments(rows.map((r,x)=>x===i?{...r,...patch}:r));
  }
  function add(){
    const used=new Set(rows.map(r=>r.method));
    const method=methods.find(m=>!used.has(m))||'TRANSFERENCIA';
    setPayments([...rows,{method,amount:Math.max(0,pending),cashReceived:method==='EFECTIVO'?Math.max(0,pending):null,reference:''}]);
  }
  function remove(i){setPayments(rows.filter((_,x)=>x!==i));}

  return <div className="pos-payments-panel" style={{display:'grid',gap:10}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <strong>Formas de pago</strong>
      <button type="button" className="secondary" onClick={add}>+ Agregar método</button>
    </div>

    {rows.map((r,i)=>{
      const amount=n(r.amount);
      const received=n(r.cashReceived);
      const change=r.method==='EFECTIVO'?Math.max(0,received-amount):0;
      return <div key={i} style={{border:'1px solid #d0d5dd',borderRadius:12,padding:12,display:'grid',gap:8}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,alignItems:'end'}}>
          <label>Método
            <select value={r.method} onChange={e=>update(i,{method:e.target.value,cashReceived:e.target.value==='EFECTIVO'?amount:null})}>
              {methods.map(m=><option key={m} value={m}>{m[0]+m.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
          <label>Importe aplicado
            <input type="number" min="0" step="0.01" value={r.amount??''} onChange={e=>update(i,{amount:e.target.value})}/>
          </label>
          {rows.length>1?<button type="button" className="secondary" onClick={()=>remove(i)}>×</button>:<span/>}
        </div>

        {r.method==='EFECTIVO'?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <label>Efectivo recibido
            <input type="number" min="0" step="0.01" value={r.cashReceived??''} onChange={e=>update(i,{cashReceived:e.target.value})}/>
          </label>
          <div><small>Cambio</small><strong style={{display:'block',fontSize:'1.2rem'}}>{money(change)}</strong></div>
        </div>:null}

        {r.method==='TRANSFERENCIA'?<label>Referencia / folio
          <input value={r.reference||''} onChange={e=>update(i,{reference:e.target.value})} placeholder="Opcional durante la auditoría"/>
        </label>:null}

        {r.method==='TARJETA'?<div style={{fontSize:'.9rem'}}>
          Mercado Pago · importe preparado. La venta sólo se autorizará cuando la integración de tarjeta sea validada.
        </div>:null}
      </div>;
    })}

    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
      <div><small>Total venta</small><strong style={{display:'block'}}>{money(t)}</strong></div>
      <div><small>Total asignado</small><strong style={{display:'block'}}>{money(assigned)}</strong></div>
      <div><small>{pending>=0?'Pendiente':'Excedente'}</small>
        <strong style={{display:'block'}}>{money(Math.abs(pending))}</strong>
      </div>
    </div>
  </div>;
}
