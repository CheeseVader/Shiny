import { useEffect,useMemo,useState } from 'react';
import { api } from '../services/api.js';
import LoyaltyManager from '../components/LoyaltyManager.jsx';

const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const emptyPromotion=()=>({
  nombre:'',tipo:'PORCENTAJE',valor:'',codigo:'',inicio:'',fin:'',ambito:'GENERAL',
  estado:'ACTIVA',minimo_compra:'0',limite_usos:'',limite_por_cliente:'',max_discount:'',
  notas:'',canales:'TODOS',id_sucursal:'',acumulable_puntos:true,acumulable_otras:false,visible_publico:true
});

export default function PromotionsLoyaltyPage(){
  const [tab,setTab]=useState('promotions');
  const [promotions,setPromotions]=useState([]);
  const [redemptions,setRedemptions]=useState([]);
  const [branches,setBranches]=useState([]);
  const [clients,setClients]=useState([]);
  const [form,setForm]=useState(emptyPromotion());
  const [editRowId,setEditRowId]=useState(null);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){
    const [p,r,b,c]=await Promise.all([
      api('/api/v1/content/promotions'),
      api('/api/v1/content/promotions/redemptions?limit=500'),
      api('/api/v1/branches?includeInactive=false'),
      api('/api/v1/clients?limit=1000')
    ]);
    setPromotions(p.data||[]);
    setRedemptions(r.data||[]);
    setBranches(b.data||[]);
    setClients(c.data||[]);
  }
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);

  const filtered=useMemo(()=>promotions.filter(p=>{
    const q=search.trim().toLowerCase();
    if(status&&String(p.estado||'').toUpperCase()!==status)return false;
    return !q||[p.nombre,p.codigo,p.tipo,p.ambito,p.nombre_sucursal].some(v=>String(v||'').toLowerCase().includes(q));
  }),[promotions,search,status]);

  const active=promotions.filter(p=>String(p.estado).toUpperCase()==='ACTIVA').length;
  const applied=redemptions.filter(r=>r.estado==='APLICADA');
  const discountTotal=applied.reduce((a,x)=>a+Number(x.descuento||0),0);

  function editPromotion(p){
    setEditRowId(p.row_id);
    setForm({
      ...emptyPromotion(),...p,
      valor:p.valor??'',
      minimo_compra:p.minimo_compra??'0',
      limite_usos:p.limite_usos??'',
      limite_por_cliente:p.limite_por_cliente??'',
      max_discount:p.max_discount??'',
      inicio:p.inicio?String(p.inicio).slice(0,16):'',
      fin:p.fin?String(p.fin).slice(0,16):'',
      id_sucursal:p.id_sucursal||''
    });
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function reset(){setEditRowId(null);setForm(emptyPromotion());}

  async function save(){
    setBusy(true);
    try{
      const url=editRowId?`/api/v1/content/promotions/${editRowId}`:'/api/v1/content/promotions';
      const r=await api(url,{method:editRowId?'PUT':'POST',body:JSON.stringify(form)});
      setMessage(`Promoción ${r.data.codigo} ${editRowId?'actualizada':'creada'} correctamente.`);
      reset();await load();
    }catch(e){setMessage(e.message);}finally{setBusy(false);}
  }

  async function toggle(p){
    try{
      await api(`/api/v1/content/promotions/${p.row_id}`,{
        method:'PUT',body:JSON.stringify({...p,estado:String(p.estado).toUpperCase()==='ACTIVA'?'INACTIVA':'ACTIVA'})
      });
      await load();
    }catch(e){setMessage(e.message);}
  }

  return <div className="benefits-admin-page">
    <header className="benefits-hero">
      <div><div className="eyebrow">GESTIÓN · BENEFICIOS</div><h1>Promociones / Fidelidad</h1><p>Motor maestro utilizado por POS y tienda pública. Las ventas solo consumen estas reglas.</p></div>
      <div className="benefit-kpis">
        <span><b>{promotions.length}</b> promociones</span>
        <span><b>{active}</b> activas</span>
        <span><b>{applied.length}</b> redenciones</span>
        <span><b>{money(discountTotal)}</b> descuentos</span>
      </div>
    </header>
    {message?<div className="message">{message}</div>:null}

    <nav className="benefits-tabs">
      <button className={tab==='promotions'?'active':''} onClick={()=>setTab('promotions')}>Promociones / Cupones</button>
      <button className={tab==='redemptions'?'active':''} onClick={()=>setTab('redemptions')}>Redenciones</button>
      <button className={tab==='loyalty'?'active':''} onClick={()=>setTab('loyalty')}>Fidelidad / Puntos</button>
    </nav>

    {tab==='promotions'?<div className="benefits-grid">
      <section className="benefits-card promo-editor">
        <div className="benefits-card-head"><div><h2>{editRowId?'Editar promoción':'Nueva promoción'}</h2><p>{editRowId?'Modifica la regla maestra seleccionada.':'Crea una regla reutilizable por los canales autorizados.'}</p></div>{editRowId?<button className="secondary compact" onClick={reset}>Cancelar edición</button>:null}</div>
        <div className="benefits-fields cols2">
          <label className="span2">Nombre<input value={form.nombre} onChange={e=>setForm(x=>({...x,nombre:e.target.value}))} placeholder="Ej. Fin de semana Pokémon"/></label>
          <label>Código<input value={form.codigo} onChange={e=>setForm(x=>({...x,codigo:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')}))} placeholder="POKEMON15"/></label>
          <label>Estado<select value={form.estado} onChange={e=>setForm(x=>({...x,estado:e.target.value}))}><option>ACTIVA</option><option>INACTIVA</option></select></label>
          <label>Tipo<select value={form.tipo} onChange={e=>setForm(x=>({...x,tipo:e.target.value}))}><option value="PORCENTAJE">Porcentaje</option><option value="MONTO">Monto fijo</option><option value="ENVIO">Envío</option></select></label>
          <label>Valor<input type="number" min="0" max={form.tipo==='PORCENTAJE'?100:undefined} step=".01" disabled={form.tipo==='ENVIO'} value={form.valor} onChange={e=>setForm(x=>({...x,valor:e.target.value}))}/></label>
          <label>Compra mínima<input type="number" min="0" step=".01" value={form.minimo_compra} onChange={e=>setForm(x=>({...x,minimo_compra:e.target.value}))}/></label>
          <label>Tope de descuento<input type="number" min="0" step=".01" value={form.max_discount} onChange={e=>setForm(x=>({...x,max_discount:e.target.value}))} placeholder="Vacío = sin tope"/></label>
          <label>Límite global<input type="number" min="0" value={form.limite_usos} onChange={e=>setForm(x=>({...x,limite_usos:e.target.value}))} placeholder="Vacío = ilimitado"/></label>
          <label>Límite por cliente<input type="number" min="0" value={form.limite_por_cliente} onChange={e=>setForm(x=>({...x,limite_por_cliente:e.target.value}))} placeholder="Vacío = ilimitado"/></label>
          <label>Ámbito<select value={form.ambito} onChange={e=>setForm(x=>({...x,ambito:e.target.value}))}><option value="GENERAL">General</option><option value="PRODUCTOS">Productos</option><option value="TCG">TCG</option></select></label>
          <label>Sucursal<select value={form.id_sucursal} onChange={e=>setForm(x=>({...x,id_sucursal:e.target.value}))}><option value="">Todas las sucursales</option>{branches.map(b=><option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
          <label>Inicio<input type="datetime-local" value={form.inicio} onChange={e=>setForm(x=>({...x,inicio:e.target.value}))}/></label>
          <label>Fin<input type="datetime-local" value={form.fin} onChange={e=>setForm(x=>({...x,fin:e.target.value}))}/></label>
          <label>Canales<select value={form.canales||'TODOS'} onChange={e=>setForm(x=>({...x,canales:e.target.value}))}><option value="TODOS">Todos</option><option value="POS_LOCAL">POS Productos</option><option value="TCG_POS">POS TCG</option><option value="PEDIDOS">Pedidos</option><option value="PUBLIC">Tienda pública</option><option value="POS_LOCAL,TCG_POS">POS Productos + TCG</option><option value="POS_LOCAL,TCG_POS,PEDIDOS,PUBLIC">Todos los canales de venta</option></select></label>
          <label className="check-field"><input type="checkbox" checked={form.visible_publico!==false} onChange={e=>setForm(x=>({...x,visible_publico:e.target.checked}))}/><span>Mostrar en promociones públicas</span></label>
          <label className="check-field"><input type="checkbox" checked={form.acumulable_puntos!==false} onChange={e=>setForm(x=>({...x,acumulable_puntos:e.target.checked}))}/><span>Permitir combinar con puntos</span></label>
          <label className="check-field"><input type="checkbox" checked={form.acumulable_otras===true} onChange={e=>setForm(x=>({...x,acumulable_otras:e.target.checked}))}/><span>Reservado para combinación futura entre promociones</span></label>
          <label className="span2">Notas<textarea rows="2" value={form.notas||''} onChange={e=>setForm(x=>({...x,notas:e.target.value}))}/></label>
        </div>
        <div className="benefits-rule-note">El código se valida en el backend al momento de cobrar. Cambiar una promoción no altera ventas ni redenciones anteriores.</div>
        <button disabled={busy||!form.nombre.trim()||!form.codigo.trim()||(form.tipo!=='ENVIO'&&Number(form.valor)<=0)} onClick={save}>{busy?'Guardando...':editRowId?'Guardar cambios':'Crear promoción'}</button>
      </section>

      <section className="benefits-card promo-list">
        <div className="benefits-card-head"><div><h2>Promociones registradas</h2><p>Estado y consumo real del motor comercial.</p></div></div>
        <div className="promo-filterbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, código, tipo…"/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos los estados</option><option>ACTIVA</option><option>INACTIVA</option></select></div>
        <div className="benefits-table"><table><thead><tr><th>Promoción</th><th>Regla</th><th>Alcance</th><th>Usos</th><th>Vigencia</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
          {filtered.map(p=><tr key={p.row_id}>
            <td><b>{p.nombre}</b><small>{p.codigo}</small></td>
            <td>{p.tipo==='PORCENTAJE'?`${Number(p.valor)}%`:p.tipo==='MONTO'?money(p.valor):'Envío'}{p.max_discount?` · máx ${money(p.max_discount)}`:''}<small>Mín. {money(p.minimo_compra)}</small></td>
            <td>{p.ambito}<small>{p.nombre_sucursal||'Todas las sucursales'} · {p.canales||'TODOS'}</small></td>
            <td><b>{p.usos_reales??p.usos??0}</b>{p.limite_usos?` / ${p.limite_usos}`:''}<small>{p.limite_por_cliente?`Máx ${p.limite_por_cliente} por cliente`:'Sin límite individual'}</small></td>
            <td>{p.inicio?new Date(p.inicio).toLocaleDateString('es-MX'):'Sin inicio'}<small>{p.fin?`hasta ${new Date(p.fin).toLocaleDateString('es-MX')}`:'sin vencimiento'}</small></td>
            <td><span className={`promo-state ${String(p.estado).toLowerCase()}`}>{p.estado}</span></td>
            <td><div className="row-actions"><button className="secondary compact" onClick={()=>editPromotion(p)}>Editar</button><button className="secondary compact" onClick={()=>toggle(p)}>{String(p.estado).toUpperCase()==='ACTIVA'?'Desactivar':'Activar'}</button></div></td>
          </tr>)}
          {!filtered.length?<tr><td colSpan="7"><div className="empty-box">No hay promociones con esos filtros.</div></td></tr>:null}
        </tbody></table></div>
      </section>
    </div>:null}

    {tab==='redemptions'?<section className="benefits-card">
      <div className="benefits-card-head"><div><h2>Historial de redenciones</h2><p>Auditoría de promociones realmente aplicadas o revertidas.</p></div><span>{redemptions.length} movimientos</span></div>
      <div className="benefits-table"><table><thead><tr><th>Fecha</th><th>Promoción</th><th>Código</th><th>Pedido</th><th>Cliente</th><th>Canal</th><th>Subtotal</th><th>Descuento</th><th>Estado</th></tr></thead><tbody>
        {redemptions.map(r=><tr key={r.row_id}><td>{new Date(r.fecha).toLocaleString('es-MX')}</td><td><b>{r.promocion||r.id_promocion}</b></td><td>{r.codigo||'—'}</td><td>{r.id_pedido}</td><td>{r.cliente||r.id_cliente||'Público general'}</td><td>{r.canal}</td><td>{money(r.subtotal)}</td><td><b>-{money(r.descuento)}</b></td><td><span className={`promo-state ${String(r.estado).toLowerCase()}`}>{r.estado}</span></td></tr>)}
        {!redemptions.length?<tr><td colSpan="9"><div className="empty-box">Aún no hay redenciones.</div></td></tr>:null}
      </tbody></table></div>
    </section>:null}

    {tab==='loyalty'?<section className="benefits-loyalty">
      <div className="benefits-card-head"><div><h2>Fidelidad / Puntos</h2><p>Reglas globales, saldo por cliente y ledger auditable.</p></div></div>
      <LoyaltyManager clients={clients}/>
    </section>:null}
  </div>;
}
