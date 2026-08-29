import { useEffect,useMemo,useState } from 'react';
import { api } from '../services/api.js';
import '../phase_dashboard_operational_v1.css';

import '../work_exact_r26.css';
import '../dashboard_option3_premium_r36.css';
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
const compactMoney=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',notation:'compact',maximumFractionDigits:1});
const integer=new Intl.NumberFormat('es-MX',{maximumFractionDigits:0});
const percent=new Intl.NumberFormat('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1});
const pad=n=>String(n).padStart(2,'0');
const isoLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dateTime=value=>value?new Date(value).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';

function dates(period){
  const now=new Date(),to=isoLocal(now),fromDate=new Date(now);
  if(period==='TODAY')return {from:to,to};
  if(period==='7D'){fromDate.setDate(fromDate.getDate()-6);return {from:isoLocal(fromDate),to};}
  if(period==='30D'){fromDate.setDate(fromDate.getDate()-29);return {from:isoLocal(fromDate),to};}
  fromDate.setDate(1);return {from:isoLocal(fromDate),to};
}

function Metric({label,value,sub,tone='',icon='',onClick}){
  const Tag=onClick?'button':'article';
  return <Tag type={onClick?'button':undefined} className={`dash-metric ${tone} ${onClick?'dash-metric-button':''}`} onClick={onClick}>
    {icon?<span className="dash-metric-icon" aria-hidden="true">{icon}</span>:null}
    <span className="dash-metric-copy"><span>{label}</span><strong>{value}</strong>{sub?<small>{sub}</small>:null}</span>
    {onClick?<span className="dash-metric-arrow" aria-hidden="true">›</span>:null}
  </Tag>;
}

function Empty({children='Sin información para el período seleccionado.'}){return <div className="dash-empty">{children}</div>;}

function SalesTrendChart({rows=[]}){
  if(!rows.length)return <Empty/>;
  const width=760,height=268,left=58,right=18,top=22,bottom=42;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const values=rows.flatMap(x=>[Number(x.ventas||0),Number(x.utilidad||0)]);
  const maximum=Math.max(1,...values),minimum=Math.min(0,...values),span=Math.max(1,maximum-minimum);
  const step=plotWidth/Math.max(1,rows.length),barWidth=Math.min(30,Math.max(7,step*.48));
  const x=index=>left+(step*index)+(step/2),y=value=>top+((maximum-Number(value||0))/span)*plotHeight,zeroY=y(0);
  const profitPoints=rows.map((row,index)=>`${x(index)},${y(row.utilidad)}`).join(' ');
  const labelStep=Math.max(1,Math.ceil(rows.length/7));
  const grid=Array.from({length:5},(_,index)=>minimum+(span*(index/4)));
  return <div className="dash-chart-shell">
    <div className="dash-chart-legend"><span><i className="sales"/>Ventas</span><span><i className="profit"/>Utilidad bruta</span></div>
    <svg className="dash-sales-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de ventas y utilidad bruta por día">
      {grid.map((value,index)=><g key={index}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="dash-chart-gridline"/><text x={left-8} y={y(value)+4} textAnchor="end" className="dash-chart-axis">{compactMoney.format(value)}</text></g>)}
      <line x1={left} x2={width-right} y1={zeroY} y2={zeroY} className="dash-chart-zero"/>
      {rows.map((row,index)=>{
        const topY=y(row.ventas),date=new Date(`${String(row.fecha).slice(0,10)}T12:00:00`);
        return <g key={row.fecha} className="dash-chart-column">
          <rect x={x(index)-(barWidth/2)} y={Math.min(zeroY,topY)} width={barWidth} height={Math.max(1,Math.abs(zeroY-topY))} rx="5"><title>{date.toLocaleDateString('es-MX')} · Ventas {money.format(row.ventas||0)} · Utilidad {money.format(row.utilidad||0)} · {integer.format(row.pedidos||0)} pedido(s)</title></rect>
          {(index%labelStep===0||index===rows.length-1)?<text x={x(index)} y={height-14} textAnchor="middle" className="dash-chart-axis date">{date.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}</text>:null}
        </g>;
      })}
      <polyline points={profitPoints} className="dash-profit-line"/>
      {rows.map((row,index)=><circle key={`${row.fecha}-profit`} cx={x(index)} cy={y(row.utilidad)} r="4" className="dash-profit-point"><title>{money.format(row.utilidad||0)} de utilidad</title></circle>)}
    </svg>
  </div>;
}

function OrderStatusChart({rows=[]}){
  const colors={PAGADOS:'#12b76a',PENDIENTES:'#f79009',CANCELADOS:'#f04438',OTROS:'#6172f3'};
  const clean=rows.filter(x=>Number(x.total||0)>0),total=clean.reduce((sum,x)=>sum+Number(x.total||0),0);
  if(!total)return <Empty>Sin pedidos en el período seleccionado.</Empty>;
  let cursor=0;
  const segments=clean.map(row=>{
    const start=(cursor/total)*360;cursor+=Number(row.total||0);const end=(cursor/total)*360;
    return `${colors[row.estado]||colors.OTROS} ${start}deg ${end}deg`;
  });
  return <div className="dash-donut-layout">
    <div className="dash-donut" style={{background:`conic-gradient(${segments.join(',')})`}}><div><strong>{integer.format(total)}</strong><span>pedidos</span></div></div>
    <div className="dash-donut-legend">{clean.map(row=><div key={row.estado}><i style={{background:colors[row.estado]||colors.OTROS}}/><span>{String(row.estado||'Otros').toLocaleLowerCase('es-MX')}</span><strong>{integer.format(row.total)}</strong></div>)}</div>
  </div>;
}

function InventoryHealth({inventory={}}){
  const total=Number(inventory.registros||0),out=Math.min(total,Number(inventory.agotados||0)),low=Math.min(Math.max(0,total-out),Number(inventory.bajoMinimo||0)),ok=Math.max(0,total-out-low);
  const parts=[['Disponible',ok,'ready'],['Stock bajo',low,'warning'],['Agotado',out,'danger']];
  return <div className="dash-health">
    <div className="dash-health-head"><span>Salud del inventario</span><strong>{integer.format(total)} registros</strong></div>
    <div className="dash-health-track">{parts.map(([label,value,tone])=><i key={label} className={tone} style={{width:`${total?Math.max(value?2:0,(value/total)*100):0}%`}} title={`${label}: ${integer.format(value)}`}/>)}</div>
    <div className="dash-health-legend">{parts.map(([label,value,tone])=><span key={label}><i className={tone}/>{label}<strong>{integer.format(value)}</strong></span>)}</div>
  </div>;
}

function ProductBarChart({rows=[],tone='blue',empty='Sin ventas de productos en el período.'}){
  if(!rows.length)return <Empty>{empty}</Empty>;
  const maximum=Math.max(1,...rows.map(x=>Number(x.unidades||0)));
  return <div className={`dash-product-bars ${tone}`}>{rows.map((row,index)=><div className="dash-product-bar" key={`${row.producto}-${row.sku}-${index}`}>
    <div><b>{index+1}</b><span><strong>{row.producto||'Producto sin nombre'}</strong><small>{row.sku||'Sin SKU'}{row.tipo?` · ${row.tipo}`:''}</small></span><em>{integer.format(row.unidades||0)} u. · {money.format(row.ventas||0)}</em></div>
    <div className="dash-product-track"><i style={{width:`${Math.max(4,(Number(row.unidades||0)/maximum)*100)}%`}}/></div>
  </div>)}</div>;
}

function PerformanceCard({eyebrow,title,lines=[],tone='green',onClick}){
  return <article className={`dash-performance-card ${tone}`}>
    <div className="dash-performance-icon" aria-hidden="true">{tone==='green'?'▣':tone==='orange'?'◇':tone==='blue'?'↗':'!'}</div>
    <div className="dash-performance-copy"><span>{eyebrow}</span><strong>{title||'Sin información'}</strong>{lines.map((line,index)=><small key={`${line}-${index}`}>{line}</small>)}</div>
    {onClick?<button type="button" className="secondary compact" onClick={onClick}>Ver detalle</button>:null}
  </article>;
}

function DetailModal({kind,data,loading,error,search,onSearch,onClose}){
  useEffect(()=>{
    if(!kind)return undefined;
    const previous=document.body.style.overflow;
    const keydown=e=>{if(e.key==='Escape')onClose();};
    document.body.style.overflow='hidden';
    document.addEventListener('keydown',keydown);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',keydown);};
  },[kind,onClose]);
  if(!kind)return null;
  const meta={
    'stock-low':{eyebrow:'INVENTARIO',title:'Stock bajo y productos agotados',copy:'Productos que requieren resurtido en las sucursales seleccionadas.'},
    'no-movement':{eyebrow:'ROTACIÓN',title:'Productos sin movimiento',copy:'Inventario disponible con 30 días o más sin registrar una venta.'},
    alerts:{eyebrow:'ATENCIÓN',title:'Alertas abiertas',copy:'Situaciones activas que requieren revisión del negocio.'}
  }[kind];
  const term=search.trim().toLocaleLowerCase('es-MX');
  const items=(data?.items||[]).filter(item=>!term||Object.values(item).some(value=>String(value??'').toLocaleLowerCase('es-MX').includes(term)));
  return <div className="modal-backdrop dash-detail-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="dash-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dash-detail-title" onMouseDown={e=>e.stopPropagation()}>
      <header className="dash-detail-head">
        <div><div className="eyebrow">{meta.eyebrow}</div><h2 id="dash-detail-title">{meta.title}</h2><p>{meta.copy}</p></div>
        <button type="button" className="icon-btn" aria-label="Cerrar ventana" onClick={onClose}>×</button>
      </header>
      <div className="dash-detail-tools">
        <label><span>Buscar en el resultado</span><input autoFocus value={search} onChange={e=>onSearch(e.target.value)} placeholder="Producto, SKU, sucursal o alerta…"/></label>
        <div><strong>{integer.format(data?.total||0)}</strong><span>resultado(s)</span></div>
      </div>
      <div className="dash-detail-content">
        {loading?<Empty>Cargando información…</Empty>:null}
        {!loading&&error?<div className="message error">{error}</div>:null}
        {!loading&&!error&&!items.length?<Empty>{search?'No hay coincidencias con la búsqueda.':'No hay elementos que requieran atención.'}</Empty>:null}
        {!loading&&!error&&items.length?<div className="dash-detail-list">
          {kind==='stock-low'?items.map(item=><article className="dash-detail-row stock" key={`${item.id_sucursal}-${item.id_producto}`}>
            <span className={`dash-badge ${item.estado==='AGOTADO'?'danger':'warning'}`}>{item.estado==='AGOTADO'?'Agotado':'Stock bajo'}</span>
            <div><strong>{item.producto||'Producto sin nombre'}</strong><small>{item.sku||item.id_producto||'Sin SKU'} · {item.sucursal||'Sin sucursal'}</small></div>
            <div className="dash-detail-numbers"><span>Existencia <b>{integer.format(item.stock||0)}</b></span><span>Mínimo <b>{integer.format(item.stock_minimo||0)}</b></span></div>
          </article>):null}
          {kind==='no-movement'?items.map(item=><article className="dash-detail-row movement" key={`${item.id_sucursal}-${item.id_producto}`}>
            <span className="dash-badge neutral">{integer.format(item.dias_sin_venta||0)} días</span>
            <div><strong>{item.producto||'Producto sin nombre'}</strong><small>{item.sku||item.id_producto||'Sin SKU'} · {item.sucursal||'Sin sucursal'}</small></div>
            <div className="dash-detail-numbers"><span>Stock <b>{integer.format(item.stock||0)}</b></span><span>Capital <b>{money.format(item.capital_detenido||0)}</b></span></div>
          </article>):null}
          {kind==='alerts'?items.map(item=><article className="dash-detail-row alert" key={item.id}>
            <span className={`dash-badge priority-${String(item.prioridad||'').toLowerCase()}`}>{item.prioridad||'NORMAL'}</span>
            <div><strong>{item.titulo||item.tipo||'Alerta'}</strong><small>{item.mensaje||'Sin descripción'}</small><small>{item.sucursal||'Alerta general'} · {dateTime(item.ultima_deteccion||item.fecha)}</small></div>
            {item.ruta?<a className="secondary compact" href={item.ruta}>Abrir módulo</a>:null}
          </article>):null}
        </div>:null}
      </div>
      <footer className="dash-detail-footer"><span>{data?.total>(data?.items||[]).length?`Mostrando los primeros ${(data?.items||[]).length} resultados.`:'Información actualizada según los filtros del dashboard.'}</span><button type="button" className="secondary" onClick={onClose}>Cerrar</button></footer>
    </section>
  </div>;
}

export default function DashboardPage(){
  const access=useMemo(()=>{try{return JSON.parse(localStorage.getItem('GMX_AUTH_ACCESS')||'{}');}catch{return {}; }},[]);
  const [period,setPeriod]=useState('MONTH'),[branchId,setBranchId]=useState(''),[custom,setCustom]=useState(dates('MONTH'));
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [detailKind,setDetailKind]=useState(''),[detailData,setDetailData]=useState(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(''),[detailSearch,setDetailSearch]=useState('');
  const selectedDates=period==='CUSTOM'?custom:dates(period);

  async function load(){
    setLoading(true);setError('');
    try{
      const q=new URLSearchParams({from:selectedDates.from,to:selectedDates.to});if(branchId)q.set('branchId',branchId);
      const r=await api(`/api/v1/dashboard?${q.toString()}`);setData(r.data);
    }catch(e){setError(e.message||'No fue posible cargar el Dashboard.');}
    finally{setLoading(false);}
  }

  async function openDetail(kind){
    setDetailKind(kind);setDetailData(null);setDetailError('');setDetailSearch('');setDetailLoading(true);
    try{
      const q=new URLSearchParams({limit:'250'});if(branchId)q.set('branchId',branchId);
      const r=await api(`/api/v1/dashboard/details/${kind}?${q.toString()}`);setDetailData(r.data);
    }catch(e){setDetailError(e.message||'No fue posible cargar el detalle.');}
    finally{setDetailLoading(false);}
  }

  function closeDetail(){setDetailKind('');setDetailData(null);setDetailError('');setDetailSearch('');}

  useEffect(()=>{load();},[period,branchId,custom.from,custom.to]);
  const k=data?.kpis||{},trend=data?.salesTrend||[],performance=data?.productPerformance||{};
  const rangeLabel=`${selectedDates.from} → ${selectedDates.to}`;
  const change=Number(k.variacionVentas||0),changeText=`${change>=0?'+':''}${percent.format(change)}% vs. período anterior`;
  const most=performance.masVendido,least=performance.menosVendido,bestProfit=performance.mayorUtilidad;
  const cashIn=Number(data?.cash?.ingresos||0),cashOut=Number(data?.cash?.egresos||0),cashMaximum=Math.max(1,cashIn,cashOut);

  const premiumTop=(data?.topProducts||[]).slice(0,5);
  const premiumLow=Number(k.stockBajo||0);
  const premiumAlerts=Number(data?.alerts?.abiertas||0);
  const premiumCritical=Number(data?.alerts?.criticas||0);
  const premiumPending=Number(k.sinMovimiento||0);

  return <div className="dashboard-v1 admin-stack work-dashboard dash-premium-r36">
    <section className="premium36-head">
      <div>
        <h2>¡Bienvenido de regreso! <span aria-hidden="true">👋</span></h2>
        <p>Resumen general de tu negocio.</p>
      </div>
      <div className="premium36-controls">
        <label className="premium36-branch">
          <span>Sucursal:</span>
          <select value={branchId} onChange={(e)=>{
          const id=e.target.value;
          const branchName=e.target.options[e.target.selectedIndex]?.text || 'Todas las sucursales';
          setBranchId(id);
          localStorage.setItem('GMX_DASHBOARD_BRANCH_ID',id);
          localStorage.setItem('GMX_DASHBOARD_BRANCH_NAME',branchName);
          window.dispatchEvent(new CustomEvent('gmx:dashboard-branch-changed',{detail:{branchId:id,branchName}}));
        }}>
            <option value="">{access?.branchScope?.all?'Todas las sucursales':'Sucursales permitidas'}</option>
            {(data?.branches||[]).map(b=><option key={b.id_sucursal} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>

        <label className="premium36-period">
          <span>◫</span>
          <select value={period} onChange={e=>setPeriod(e.target.value)}>
            <option value="TODAY">Hoy</option>
            <option value="7D">7 días</option>
            <option value="30D">30 días</option>
            <option value="MONTH">Este mes</option>
            <option value="CUSTOM">Personalizado</option>
          </select>
        </label>

        {period==='CUSTOM'?<div className="premium36-custom">
          <input type="date" value={custom.from} onChange={e=>setCustom(x=>({...x,from:e.target.value}))}/>
          <input type="date" value={custom.to} onChange={e=>setCustom(x=>({...x,to:e.target.value}))}/>
        </div>:null}

        <button type="button" className="premium36-refresh" onClick={load} disabled={loading}>
          {loading?'Actualizando…':'Actualizar'}
        </button>
      </div>
    </section>

    {error?<div className="message error">{error}</div>:null}

    <section className="premium36-kpis">
      <article className="violet">
        <div className="premium36-kpi-icon">↗</div>
        <span>Ventas del día</span>
        <strong>{money.format(k.ventas||0)}</strong>
        <small>{changeText}</small>
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="2,27 17,23 31,25 46,15 61,20 77,9 98,14"/>
        </svg>
      </article>

      <article className="blue">
        <div className="premium36-kpi-icon">▣</div>
        <span>Pedidos</span>
        <strong>{integer.format(k.pedidos||0)}</strong>
        <small>{integer.format(k.clientesNuevos||0)} clientes nuevos</small>
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="2,25 18,21 34,23 49,13 64,17 80,8 98,11"/>
        </svg>
      </article>

      <article className="green">
        <div className="premium36-kpi-icon">⌘</div>
        <span>Productos vendidos</span>
        <strong>{integer.format(premiumTop.reduce((sum,x)=>sum+Number(x.unidades||0),0))}</strong>
        <small>{premiumTop.length} productos destacados</small>
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="2,26 16,20 31,22 45,14 60,19 74,10 98,15"/>
        </svg>
      </article>

      <article className="orange">
        <div className="premium36-kpi-icon">◎</div>
        <span>Ticket promedio</span>
        <strong>{money.format(k.ticketPromedio||0)}</strong>
        <small>{percent.format(k.margenBruto||0)}% de margen bruto</small>
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="2,26 20,23 34,24 49,15 64,19 80,11 98,16"/>
        </svg>
      </article>
    </section>

    <section className="premium36-dashboard-grid">
      <article className="premium36-card premium36-sales">
        <header>
          <div>
            <h3>Ventas <span>(Últimos 7 días)</span></h3>
          </div>
          <button type="button" className="premium36-mini-button" onClick={()=>setPeriod('7D')}>Semana⌄</button>
        </header>
        {loading&&!data?<Empty>Cargando indicadores…</Empty>:<SalesTrendChart rows={trend.slice(-7)}/>}
      </article>

      <article className="premium36-card premium36-products">
        <header>
          <h3>Productos más vendidos</h3>
        </header>

        {premiumTop.length?<div className="premium36-product-grid">
          {premiumTop.map((x,i)=><article key={`${x.producto}-${x.sku}-${i}`}>
            <div className={`premium36-product-art tone-${(i%5)+1}`}>
              {(x.imagen||x.imagen_principal||x.image_url)
                ?<img src={x.imagen||x.imagen_principal||x.image_url} alt=""/>
                :<span>{String(x.producto||'P').trim().charAt(0).toUpperCase()}</span>}
            </div>
            <strong>{x.producto||'Producto'}</strong>
            <small>{integer.format(x.unidades||0)} unidades</small>
            <b>{money.format(x.ventas||0)}</b>
          </article>)}
        </div>:<Empty/>}

        <div className="premium36-footer-link">Ver catálogo completo</div>
      </article>

      <article className="premium36-card premium36-alerts">
        <header><h3>Alertas</h3></header>
        <div className="premium36-alert-list">
          <button type="button" onClick={()=>openDetail('stock-low')}>
            <i className="stock">△</i>
            <span><strong>Stock bajo</strong><small>{integer.format(premiumLow)} productos con stock bajo</small></span>
            <b>{integer.format(premiumLow)}</b>
            <em>›</em>
          </button>

          <button type="button" onClick={()=>openDetail('no-movement')}>
            <i className="movement">◷</i>
            <span><strong>Sin movimientos</strong><small>{integer.format(premiumPending)} productos sin movimiento</small></span>
            <b>{integer.format(premiumPending)}</b>
            <em>›</em>
          </button>

          <button type="button" onClick={()=>openDetail('alerts')}>
            <i className="alerts">!</i>
            <span><strong>Alertas abiertas</strong><small>{integer.format(premiumCritical)} críticas</small></span>
            <b>{integer.format(premiumAlerts)}</b>
            <em>›</em>
          </button>
        </div>

        <button type="button" className="premium36-primary-wide" onClick={()=>openDetail('alerts')}>Ir a notificaciones</button>
      </article>

      <article className="premium36-card premium36-status">
        <header><h3>Estado del negocio</h3></header>
        <div className="premium36-status-stack">
          <OrderStatusChart rows={data?.orderStatus||[]}/>
          <InventoryHealth inventory={data?.inventory||{}}/>
          <div className="premium36-cash">
            <span>Flujo de caja abierta</span>
            <strong>{money.format(cashIn-cashOut)}</strong>
            <small>Ingresos {money.format(cashIn)} · Egresos {money.format(cashOut)}</small>
          </div>
        </div>
      </article>
    </section>

    <section className="premium36-secondary-grid">
      <article className="premium36-card">
        <header><h3>Desempeño de productos</h3></header>
        <div className="dash-performance-grid premium36-performance-grid">
          <PerformanceCard eyebrow="MÁS VENDIDO" title={most?.producto} tone="green" lines={most?[`${integer.format(most.unidades)} unidades`,money.format(most.ventas)]:[]}/>
          <PerformanceCard eyebrow="MENOS VENDIDO" title={least?.producto} tone="orange" lines={least?[`${integer.format(least.unidades)} unidades`,money.format(least.ventas)]:[]}/>
          <PerformanceCard eyebrow="MAYOR UTILIDAD" title={bestProfit?.producto} tone="blue" lines={bestProfit?[`${money.format(bestProfit.utilidad)} de utilidad`,`${percent.format(bestProfit.margen||0)}% de margen`]:[]}/>
          <PerformanceCard eyebrow="CAPITAL DETENIDO" title={`${integer.format(performance.sinMovimiento||0)} producto(s)`} tone="red" lines={[money.format(performance.capitalDetenido||0),'30 días o más sin venta']} onClick={()=>openDetail('no-movement')}/>
        </div>
      </article>

      <article className="premium36-card">
        <header><h3>Rotación alta y baja</h3></header>
        <div className="premium36-rotation-grid">
          <div>
            <span>Más vendidos</span>
            <ProductBarChart rows={data?.topProducts||[]} tone="green"/>
          </div>
          <div>
            <span>Menos vendidos</span>
            <ProductBarChart rows={data?.leastProducts||[]} tone="orange" empty="No hay productos vendidos en el período seleccionado."/>
          </div>
        </div>
      </article>
    </section>

    <div className="premium36-footnote">
      Última actualización: {data?.generatedAt?new Date(data.generatedAt).toLocaleString('es-MX'):'—'} · Los indicadores respetan el alcance de sucursal del usuario.
    </div>

    <DetailModal kind={detailKind} data={detailData} loading={detailLoading} error={detailError} search={detailSearch} onSearch={setDetailSearch} onClose={closeDetail}/>
  </div>;
}