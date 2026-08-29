import { useEffect,useMemo,useState } from 'react';
import { api } from '../services/api.js';
import '../phase_gmx_exact_views_r23.css';
import '../phase10_6_2_4_1_12_2_0.css';

const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const num=v=>Number(v||0).toLocaleString('es-MX');
const date=v=>v?new Date(v).toLocaleString('es-MX'):'—';
const shortDate=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';

function csv(rows){
  if(!rows?.length)return '';
  const headers=Object.keys(rows[0]);
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  return [headers.map(q).join(','),...rows.map(r=>headers.map(h=>q(r[h])).join(','))].join('\r\n');
}
function download(name,type,text){
  const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function xml(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function excelXml(sheets){
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${
    Object.entries(sheets).map(([name,rows])=>{
      const data=rows?.length?rows:[{sin_datos:'Sin datos'}],headers=Object.keys(data[0]);
      return `<Worksheet ss:Name="${xml(name.slice(0,31))}"><Table><Row>${headers.map(h=>`<Cell><Data ss:Type="String">${xml(h)}</Data></Cell>`).join('')}</Row>${
        data.map(r=>`<Row>${headers.map(h=>`<Cell><Data ss:Type="${typeof r[h]==='number'?'Number':'String'}">${xml(r[h])}</Data></Cell>`).join('')}</Row>`).join('')
      }</Table></Worksheet>`;
    }).join('')
  }</Workbook>`;
}

const tabs=[
  ['summary','Resumen'],['sales','Ventas'],['purchases','Compras'],['returns','Devoluciones'],
  ['payables','CxP'],['expenses','Egresos'],['cash','Caja'],['inventory','Inventario'],
  ['tcg','TCG'],['alerts','Alertas'],['integrity','Auditoría de integridad']
];

function gmxHeadlineKpiFontR54K(value){
  const s=String(value??'');
  const extra=Math.max(0,s.length-7);
  return `${Math.max(10.5,22-(extra*1.25))}px`;
}
export default function ReportsPage(){
  const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),iso=d=>d.toISOString().slice(0,10);
  const [tab,setTab]=useState('summary'),[branches,setBranches]=useState([]),[branchId,setBranchId]=useState('');
  const [from,setFrom]=useState(iso(first)),[to,setTo]=useState(iso(now)),[search,setSearch]=useState('');
  const [report,setReport]=useState(null),[audit,setAudit]=useState(null);
  const [loading,setLoading]=useState(false),[message,setMessage]=useState(''),[lastUpdated,setLastUpdated]=useState(null);

  async function generate(){
    setLoading(true);
    try{
      const p=new URLSearchParams({branchId,from,to,search});
      const r=await api(`/api/v1/reports/consolidated?${p}`);
      setReport(r.data);setLastUpdated(new Date());setMessage('Reporte actualizado.');
    }catch(e){setMessage(e.message);}finally{setLoading(false);}
  }
  async function runAudit(){
    setLoading(true);try{const r=await api('/api/v1/reports/audit');setAudit(r.data);setMessage(`Auditoría ${r.data.summary.status}: ${r.data.summary.incidents} incidencia(s).`);}catch(e){setMessage(e.message);}finally{setLoading(false);}
  }

  useEffect(()=>{
    api('/api/v1/branches?includeInactive=true').then(r=>setBranches(r.data||[])).catch(()=>{});
    generate();
  },[]);
  useEffect(()=>{if(tab==='integrity'&&!audit)runAudit();},[tab]);

  const s=report?.summary||{};
  const datasets={
    sales:report?.sales||[],purchases:report?.purchases||[],returns:report?.returns||[],
    payables:report?.payables||[],expenses:report?.expenses||[],cash:report?.cash||[],
    inventory:report?.inventory||[],tcg:report?.tcg||[],alerts:report?.alerts||[]
  };

  const headlineKpis=useMemo(()=>[
    {label:'Ventas pagadas',value:money(s.sales?.total),tone:'blue',icon:'↗'},
    {label:'Transacciones',value:num(s.sales?.operaciones),tone:'violet',icon:'▦'},
    {label:'Compras',value:money(s.purchases?.total),tone:'green',icon:'$'},
    {label:'Diferencia caja',value:money(s.cash?.diferencia),tone:'amber',icon:'◇'},
    {label:'Stock productos',value:num(s.inventory?.unidades),tone:'sky',icon:'▣'},
    {label:'Alertas abiertas',value:num(s.alerts?.abiertas),tone:'teal',icon:'!'}
  ],[report]);

  function exportCurrentCsv(){
    if(!datasets[tab])return setMessage('Selecciona una pestaña de datos para exportar CSV.');
    download(`TCG_STORE_TEMPLATE_${tab}_${from}_${to}.csv`,'text/csv;charset=utf-8',`\ufeff${csv(datasets[tab])}`);
  }
  function exportExcel(){
    if(!report)return;
    download(`TCG_STORE_TEMPLATE_REPORTES_${from}_${to}.xls`,'application/vnd.ms-excel',excelXml({
      Ventas:report.sales,Compras:report.purchases,Devoluciones:report.returns,CxP:report.payables,
      Egresos:report.expenses,Caja:report.cash,Inventario:report.inventory,TCG:report.tcg,
      Alertas:report.alerts
    }));
  }

  return <div className="reports-v3-page r23-view r23-reports">
    <section className="reports-v3-heading">
      <div>
        <div className="eyebrow">ANALÍTICA · AUDITORÍA</div>
        <h1>Reportes / Auditoría</h1>
        <p>Vista consolidada financiera, operativa e integridad del negocio. Las herramientas técnicas se administran en Sistema.</p>
      </div>
      <div className="reports-v3-heading-tools">
        <div className="reports-v3-range">{shortDate(from)} - {shortDate(to)}</div>
        <div className="reports-v3-actions">
          <button className="secondary" disabled={!datasets[tab]} onClick={exportCurrentCsv}>↓ CSV actual</button>
          <button className="secondary" disabled={!report} onClick={exportExcel}>▣ Excel completo</button>
          <button className="primary" disabled={loading} onClick={generate}>{loading?'Generando…':'↻ Actualizar reporte'}</button>
        </div>
      </div>
    </section>

    <section className="reports-v3-filters">
      <label><span>Desde</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label><span>Hasta</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label><span>Sucursal</span><select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Todas las sucursales</option>{branches.map(b=><option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
      <label className="reports-v3-search"><span>Buscar</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pedido, proveedor, cliente, SKU, referencia…"/></label>
    </section>

    {message?<div className="reports-v3-message">{message}{lastUpdated?` · ${lastUpdated.toLocaleTimeString('es-MX')}`:''}</div>:null}

    <section className="reports-v3-kpis">
      {headlineKpis.map(k=><article key={k.label}>
        <div className={`reports-v3-kpi-icon ${k.tone}`}>{k.icon}</div>
        <div><span>{k.label}</span><strong
  title={String(k.value??'')}
  style={{
    fontSize:gmxHeadlineKpiFontR54K(k.value),
    lineHeight:1.05,
    letterSpacing:'-.05em',
    whiteSpace:'nowrap',
    overflow:'visible',
    textOverflow:'clip'
  }}
>{k.value}</strong><small>Datos del período seleccionado</small></div>
      </article>)}
    </section>

    {tab==='summary'?<>
      <ReportVisualSummary sales={datasets.sales} purchases={datasets.purchases}/>
      <Summary s={s}/>
    </>:null}

    <section className="reports-v3-detail">
      <div className="reports-v3-detail-title"><div><span>DETALLE</span><h2>Explorar información</h2></div></div>
      <nav className="reports-tabs-v2">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>

      {tab==='sales'?<Table rows={datasets.sales} columns={[["fecha","Fecha",date],["id_pedido","Pedido"],["nombre_cliente","Cliente"],["sucursal","Sucursal"],["canal_venta","Canal"],["metodo_pago","Pago"],["unidades","Unidades"],["total","Total",money],["estado_pedido","Estado"]]}/>:null}
      {tab==='purchases'?<Table rows={datasets.purchases} columns={[["fecha","Fecha",date],["id_compra","Compra"],["proveedor","Proveedor"],["sucursal_recepcion","Sucursal"],["estado","Estado"],["estatus_fiscal","Fiscal"],["unidades_solicitadas","Solic."],["unidades_recibidas","Recib."],["total","Total",money],["diferencia_documento","Dif. documento",money],["ultima_recepcion","Última recepción",date]]}/>:null}
      {tab==='returns'?<Table rows={datasets.returns} columns={[["fecha","Fecha",date],["id","Devolución"],["tipo","Tipo"],["referencia","Referencia"],["cliente_proveedor","Cliente / Proveedor"],["sucursales","Sucursal"],["unidades","Unidades"],["importe","Importe",money],["estado","Estado"],["motivo","Motivo"]]}/>:null}
      {tab==='payables'?<Table rows={datasets.payables} columns={[["fecha","Fecha",date],["id","CxP"],["origen","Origen"],["proveedor","Proveedor"],["documento","Documento"],["sucursal","Sucursal"],["vencimiento","Vence"],["total","Total",money],["pagado","Pagado",money],["saldo","Saldo",money],["estado","Estado"]]}/>:null}
      {tab==='expenses'?<Table rows={datasets.expenses} columns={[["fecha_gasto","Fecha",date],["id_gasto","Egreso"],["origen_modulo","Origen"],["sucursal","Sucursal"],["categoria","Categoría"],["concepto","Concepto"],["proveedor","Proveedor"],["metodo_pago","Método"],["total","Total",money],["estado","Estado"]]}/>:null}
      {tab==='cash'?<Table rows={datasets.cash} columns={[["fecha_apertura","Apertura",date],["fecha_cierre","Cierre",date],["id_caja","Caja"],["sucursal","Sucursal"],["fondo_inicial","Fondo",money],["ingresos_efectivo","Ingresos",money],["egresos_efectivo","Egresos",money],["saldo_esperado","Esperado",money],["efectivo_contado","Contado",money],["diferencia","Diferencia",money],["estado","Estado"]]}/>:null}
      {tab==='inventory'?<Table rows={datasets.inventory} columns={[["sucursal","Sucursal"],["sku","SKU"],["producto","Producto"],["stock","Stock"],["stock_minimo","Mínimo"],["fecha_actualizacion","Actualización",date]]}/>:null}
      {tab==='tcg'?<Table rows={datasets.tcg} columns={[["sucursal","Sucursal"],["sku","SKU"],["carta","Carta"],["rareza","Rareza"],["condicion","Condición"],["stock","Stock"],["stock_reservado","Reservado"],["disponible","Disponible"],["costo","Costo",money],["precio","Precio",money]]}/>:null}
      {tab==='alerts'?<Table rows={datasets.alerts} columns={[["fecha","Fecha",date],["prioridad","Prioridad"],["tipo","Tipo"],["titulo","Alerta"],["sucursal","Sucursal"],["referencia","Referencia"],["leida","Leída",yesNo],["resuelta","Resuelta",yesNo],["resuelta_por","Resuelta por"]]}/>:null}

      {tab==='integrity'?<section className="reports-audit-panel">
        <div className="reports-audit-head"><div><h2>Auditoría de integridad</h2><p>Solo lectura. Detecta inconsistencias sin modificar información.</p></div><button disabled={loading} onClick={runAudit}>Ejecutar auditoría</button></div>
        <div className="audit-kpis-v2"><article><span>Estado</span><strong>{audit?.summary?.status||'—'}</strong></article><article><span>Incidencias</span><strong>{audit?.summary?.incidents??'—'}</strong></article><article><span>Altas</span><strong>{audit?.summary?.high??'—'}</strong></article><article><span>Medias</span><strong>{audit?.summary?.medium??'—'}</strong></article></div>
        <Table rows={audit?.incidents||[]} columns={[["module","Módulo"],["severity","Severidad"],["branch","Sucursal"],["reference","Referencia"],["type","Tipo"],["message","Detalle"]]}/>
      </section>:null}
    </section>
  </div>;
}
function yesNo(v){return v?'Sí':'No';}

function ReportVisualSummary({sales=[],purchases=[]}){
  const daily=useMemo(()=>{
    const result={};
    const add=(rows,key)=>rows.forEach((row)=>{
      if(!row.fecha)return;
      const day=new Date(row.fecha).toISOString().slice(0,10);
      result[day] ||= {day,sales:0,purchases:0};
      result[day][key]+=Number(row.total||0);
    });
    add(sales,'sales');add(purchases,'purchases');
    return Object.values(result).sort((a,b)=>a.day.localeCompare(b.day)).slice(-12);
  },[sales,purchases]);
  const branches=useMemo(()=>{
    const result={};
    sales.forEach((row)=>{const key=row.sucursal||'Sin sucursal';result[key]=(result[key]||0)+Number(row.total||0);});
    return Object.entries(result).sort((a,b)=>b[1]-a[1]).slice(0,4);
  },[sales]);
  const maxDaily=Math.max(1,...daily.flatMap((item)=>[item.sales,item.purchases]));
  const branchTotal=Math.max(0,branches.reduce((acc,[,value])=>acc+value,0));
  let cursor=0;
  const shades=['#0b63f6','#2f7df5','#55a7f7','#18b8bc'];
  const gradient=branches.length?`conic-gradient(${branches.map(([,value],i)=>{const start=cursor;const pct=branchTotal?value/branchTotal*100:0;cursor+=pct;return `${shades[i]} ${start}% ${cursor}%`;}).join(',')})`:'#edf2f7';
  return <section className="reports-v3-visual-summary">
    <article className="reports-v3-chart-card">
      <div className="reports-v3-card-head"><div><h2>Ventas y comparativo por día</h2><div className="reports-v3-legend"><span className="sales">Ventas</span><span className="purchases">Compras</span></div></div></div>
      <div className="reports-v3-daily-chart">
        {daily.map((item)=><div key={item.day} className="reports-v3-day-column">
          <div className="reports-v3-day-bars"><i className="sales" title={`Ventas ${money(item.sales)}`} style={{height:`${Math.max(item.sales?4:1,(item.sales/maxDaily)*100)}%`}}/><i className="purchases" title={`Compras ${money(item.purchases)}`} style={{height:`${Math.max(item.purchases?4:1,(item.purchases/maxDaily)*100)}%`}}/></div>
          <span>{new Date(`${item.day}T12:00:00`).toLocaleDateString('es-MX',{day:'2-digit',month:'short'}).replace('.','')}</span>
        </div>)}
        {!daily.length?<div className="reports-v3-empty">Sin movimientos diarios para los filtros seleccionados.</div>:null}
      </div>
    </article>

    <article className="reports-v3-chart-card reports-v3-branch-card">
      <div className="reports-v3-card-head"><h2>Ventas por sucursal</h2></div>
      <div className="reports-v3-branch-content">
        <div className="reports-v3-donut" style={{background:gradient}}><div><span>Total</span><strong>{money(branchTotal)}</strong></div></div>
        <div className="reports-v3-branch-list">{branches.map(([label,value],i)=><div key={label}><i style={{background:shades[i]}}/><span>{label}</span><strong>{money(value)}</strong><small>{branchTotal?`${(value/branchTotal*100).toFixed(1)}%`:'0%'}</small></div>)}</div>
      </div>
      {!branches.length?<div className="reports-v3-empty">Sin ventas por sucursal.</div>:null}
    </article>
  </section>;
}

function Summary({s}){
  const blocks=[
    ['Ventas',[['Operaciones',s.sales?.operaciones],['Pagadas',s.sales?.pagadas],['Canceladas',s.sales?.canceladas],['Total',money(s.sales?.total)]]],
    ['Compras',[['Operaciones',s.purchases?.operaciones],['Recibidas',s.purchases?.recibidas],['Pendientes',s.purchases?.pendientes],['Total',money(s.purchases?.total)]]],
    ['CxP',[['Cuentas',s.payables?.cuentas],['Vencidas',s.payables?.vencidas],['Pagado',money(s.payables?.pagado)],['Saldo',money(s.payables?.saldo)]]],
    ['Egresos',[['Pagados',s.expenses?.pagados],['Pendientes',s.expenses?.pendientes],['Pagado',money(s.expenses?.totalPagado)],['Pendiente',money(s.expenses?.totalPendiente)]]],
    ['Caja',[['Sesiones',s.cash?.sesiones],['Cerradas',s.cash?.cerradas],['Ingresos',money(s.cash?.ingresos)],['Diferencia',money(s.cash?.diferencia)]]],
    ['Inventario',[['Productos',s.inventory?.productos],['Unidades',s.inventory?.unidades],['Bajo mínimo',s.inventory?.bajoMinimo],['TCG disponible',s.tcg?.disponibles]]],
    ['Alertas',[['Total',s.alerts?.total],['Abiertas',s.alerts?.abiertas],['Críticas',s.alerts?.criticas],['No leídas',s.alerts?.noLeidas]]]
  ];
  return <div className="reports-v3-summary-grid">{blocks.map(([title,rows])=><article key={title}><h3>{title}</h3><dl>{rows.map(([a,b])=><div key={a}><dt>{a}</dt><dd>{b??0}</dd></div>)}</dl></article>)}</div>;
}

function Table({rows,columns}){
  return <div className="report-table-v2"><table><thead><tr>{columns.map(c=><th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>
    {(rows||[]).map((r,i)=><tr key={r.row_id||r.id||r.id_pedido||r.id_compra||r.id_gasto||r.id_caja||i}>{columns.map(([k,_l,fmt])=><td key={k}>{fmt?fmt(r[k]):(r[k]??'—')}</td>)}</tr>)}
    {!rows?.length?<tr><td className="empty" colSpan={columns.length}>Sin información para los filtros seleccionados.</td></tr>:null}
  </tbody></table></div>;
}
