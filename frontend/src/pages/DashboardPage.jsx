import { useEffect,useMemo,useState } from 'react';
import { api } from '../services/api.js';
import '../phase_dashboard_operational_v1.css';

const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
const integer=new Intl.NumberFormat('es-MX',{maximumFractionDigits:0});
const pad=n=>String(n).padStart(2,'0');
const isoLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function dates(period){
  const now=new Date(),to=isoLocal(now),fromDate=new Date(now);
  if(period==='TODAY')return {from:to,to};
  if(period==='7D'){fromDate.setDate(fromDate.getDate()-6);return {from:isoLocal(fromDate),to};}
  if(period==='30D'){fromDate.setDate(fromDate.getDate()-29);return {from:isoLocal(fromDate),to};}
  fromDate.setDate(1);return {from:isoLocal(fromDate),to};
}
function Metric({label,value,sub,tone=''}){return <article className={`dash-metric ${tone}`}><span>{label}</span><strong>{value}</strong>{sub?<small>{sub}</small>:null}</article>;}
function Empty({children='Sin información para el período seleccionado.'}){return <div className="dash-empty">{children}</div>;}

export default function DashboardPage(){
  const access=useMemo(()=>{try{return JSON.parse(localStorage.getItem('GMX_AUTH_ACCESS')||'{}');}catch{return {}; }},[]);
  const [period,setPeriod]=useState('MONTH'),[branchId,setBranchId]=useState(''),[custom,setCustom]=useState(dates('MONTH'));
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const selectedDates=period==='CUSTOM'?custom:dates(period);
  async function load(){
    setLoading(true);setError('');
    try{
      const q=new URLSearchParams({from:selectedDates.from,to:selectedDates.to});if(branchId)q.set('branchId',branchId);
      const r=await api(`/api/v1/dashboard?${q.toString()}`);setData(r.data);
    }catch(e){setError(e.message||'No fue posible cargar el Dashboard.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[period,branchId,custom.from,custom.to]);
  const k=data?.kpis||{},trend=data?.salesTrend||[],max=Math.max(1,...trend.map(x=>Number(x.ventas||0)));
  const rangeLabel=`${selectedDates.from} → ${selectedDates.to}`;
  return <div className="dashboard-v1 admin-stack">
    <section className="dash-toolbar content-card">
      <div><div className="eyebrow">OPERACIÓN · TIEMPO REAL</div><h2>Dashboard</h2><p className="section-copy">Resumen ejecutivo de ventas, inventario, clientes y operación · {rangeLabel}</p></div>
      <div className="dash-filters">
        <select value={period} onChange={e=>setPeriod(e.target.value)}><option value="TODAY">Hoy</option><option value="7D">7 días</option><option value="30D">30 días</option><option value="MONTH">Este mes</option><option value="CUSTOM">Personalizado</option></select>
        {period==='CUSTOM'?<><input type="date" value={custom.from} onChange={e=>setCustom(x=>({...x,from:e.target.value}))}/><input type="date" value={custom.to} onChange={e=>setCustom(x=>({...x,to:e.target.value}))}/></>:null}
        <select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">{access?.branchScope?.all?'Todas las sucursales':'Sucursales permitidas'}</option>{(data?.branches||[]).map(b=><option key={b.id_sucursal} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select>
        <button className="secondary" onClick={load} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</button>
      </div>
    </section>

    {error?<div className="message error">{error}</div>:null}
    <section className="dash-metrics-grid">
      <Metric label="Ventas" value={money.format(k.ventas||0)} sub={`${integer.format(k.pedidos||0)} pedidos`} tone="primary"/>
      <Metric label="Ticket promedio" value={money.format(k.ticketPromedio||0)} sub={`${integer.format(k.pedidos||0)} pedidos · ${integer.format(k.clientesCompradores||0)} compradores`}/>
      <Metric label="Clientes nuevos" value={integer.format(k.clientesNuevos||0)} sub="En el período"/>
      <Metric label="Stock bajo" value={integer.format(k.stockBajo||0)} sub={`${integer.format(k.agotados||0)} agotados`} tone={(k.stockBajo||k.agotados)?'warning':''}/>
      <Metric label="Buylist pendientes" value={integer.format(data?.buylist?.pendientes||0)} sub={`${integer.format(data?.buylist?.pagadas||0)} pagadas`}/>
      <Metric label="Cajas abiertas" value={integer.format(data?.cash?.abiertas||0)} sub={`Ingresos ${money.format(data?.cash?.ingresos||0)}`}/>
      <Metric label="Compras pendientes" value={integer.format(data?.purchases?.pendientes||0)} sub={`${integer.format(data?.purchases?.total||0)} compras en el período`}/>
      <Metric label="Alertas abiertas" value={integer.format(data?.alerts?.abiertas||0)} sub={`${integer.format(data?.alerts?.criticas||0)} críticas`} tone={data?.alerts?.criticas?'danger':''}/>
    </section>

    <section className="dash-main-grid">
      <article className="content-card dash-panel dash-trend">
        <div className="dash-panel-head"><div><div className="eyebrow">VENTAS</div><h3>Tendencia del período</h3></div><span>{trend.length} día(s) con ventas</span></div>
        {loading&&!data?<Empty>Cargando indicadores…</Empty>:trend.length?<div className="dash-bars">{trend.map(x=><div className="dash-bar-row" key={x.fecha}><span>{new Date(`${String(x.fecha).slice(0,10)}T12:00:00`).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}</span><div className="dash-bar-track"><i style={{width:`${Math.max(2,(Number(x.ventas||0)/max)*100)}%`}}/></div><strong>{money.format(x.ventas||0)}</strong></div>)}</div>:<Empty/>}
      </article>

      <article className="content-card dash-panel">
        <div className="dash-panel-head"><div><div className="eyebrow">INVENTARIO</div><h3>Disponibilidad</h3></div></div>
        <div className="dash-mini-grid"><div><span>Producto · unidades</span><strong>{integer.format(data?.inventory?.unidades||0)}</strong></div><div><span>Producto · agotados</span><strong>{integer.format(data?.inventory?.agotados||0)}</strong></div><div><span>TCG · variantes</span><strong>{integer.format(data?.tcg?.variantes||0)}</strong></div><div><span>TCG · disponibles</span><strong>{integer.format(data?.tcg?.disponibles||0)}</strong></div></div>
        <div className="dash-status-line"><span>Buylist pagado en período</span><strong>{money.format(data?.buylist?.montoPagado||0)}</strong></div><div className="dash-status-line"><span>Compras del período</span><strong>{money.format(data?.purchases?.monto||0)}</strong></div>
      </article>
    </section>

    <section className="dash-main-grid lower">
      <article className="content-card dash-panel">
        <div className="dash-panel-head"><div><div className="eyebrow">RANKING</div><h3>Productos y TCG más vendidos</h3></div></div>
        {(data?.topProducts||[]).length?<div className="dash-ranking">{data.topProducts.map((x,i)=><div key={`${x.producto}-${x.sku}-${i}`}><b>{i+1}</b><span><strong>{x.producto}</strong><small>{x.sku||'Sin SKU'}{x.tipo?` · ${x.tipo}`:''}</small></span><em>{integer.format(x.unidades)} u.</em><strong title={Number(x.ventas||0)===0&&x.tipo==='TCG'?'El detalle de esta venta TCG no tiene importe unitario registrado.':'Importe acumulado del detalle'}>{money.format(x.ventas)}</strong></div>)}</div>:<Empty/>}
      </article>

      <article className="content-card dash-panel">
        <div className="dash-panel-head"><div><div className="eyebrow">ACTIVIDAD</div><h3>Pedidos recientes</h3></div></div>
        {(data?.recentOrders||[]).length?<div className="dash-orders">{data.recentOrders.map(x=><div key={x.id_pedido}><span><strong>{x.id_pedido}</strong><small>{x.nombre_cliente||'Cliente mostrador'} · {x.sucursal||'Sin sucursal'}</small></span><em>{x.estado_pedido||'—'}</em><strong>{money.format(Number(x.total||0))}</strong></div>)}</div>:<Empty/>}
      </article>
    </section>
    <div className="dash-footnote">Última actualización: {data?.generatedAt?new Date(data.generatedAt).toLocaleString('es-MX'):'—'} · Los indicadores respetan el alcance de sucursal del usuario.</div>
  </div>;
}
