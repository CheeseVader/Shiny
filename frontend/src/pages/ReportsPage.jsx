import { useEffect,useMemo,useState } from 'react';
import { api } from '../services/api.js';

const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const num=v=>Number(v||0).toLocaleString('es-MX');
const date=v=>v?new Date(v).toLocaleString('es-MX'):'—';

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
  const kpis=useMemo(()=>[
    ['Ventas pagadas',money(s.sales?.total)],['Unidades vendidas',num(s.sales?.unidades)],
    ['Compras',money(s.purchases?.total)],['Unidades recibidas',num(s.purchases?.unidades)],
    ['CxP pendiente',money(s.payables?.saldo)],['CxP vencidas',num(s.payables?.vencidas)],
    ['Egresos pagados',money(s.expenses?.totalPagado)],['Devoluciones',money(s.returns?.importe)],
    ['Diferencia caja',money(s.cash?.diferencia)],['Stock productos',num(s.inventory?.unidades)],
    ['TCG disponible',num(s.tcg?.disponibles)],['Alertas abiertas',num(s.alerts?.abiertas)]
  ],[report]);

  const datasets={
    sales:report?.sales||[],purchases:report?.purchases||[],returns:report?.returns||[],
    payables:report?.payables||[],expenses:report?.expenses||[],cash:report?.cash||[],
    inventory:report?.inventory||[],tcg:report?.tcg||[],alerts:report?.alerts||[]
  };

  function exportCurrentCsv(){
    if(!datasets[tab])return setMessage('Selecciona una pestaña de datos para exportar CSV.');
    download(`GMX_${tab}_${from}_${to}.csv`,'text/csv;charset=utf-8',`\ufeff${csv(datasets[tab])}`);
  }
  function exportExcel(){
    if(!report)return;
    download(`GMX_REPORTES_${from}_${to}.xls`,'application/vnd.ms-excel',excelXml({
      Ventas:report.sales,Compras:report.purchases,Devoluciones:report.returns,CxP:report.payables,
      Egresos:report.expenses,Caja:report.cash,Inventario:report.inventory,TCG:report.tcg,
      Alertas:report.alerts
    }));
  }

  return <div className="reports-v2-page">
    <header className="reports-v2-hero">
      <div><div className="eyebrow">ANALÍTICA · AUDITORÍA</div><h1>Reportes / Auditoría</h1><p>Vista consolidada financiera, operativa e integridad del negocio. Las herramientas técnicas se administran en Sistema.</p></div>
      <div className="reports-v2-actions"><button className="secondary" disabled={!datasets[tab]} onClick={exportCurrentCsv}>CSV actual</button><button className="secondary" disabled={!report} onClick={exportExcel}>Excel completo</button><button disabled={loading} onClick={generate}>{loading?'Generando…':'Actualizar reporte'}</button></div>
    </header>

    <section className="reports-v2-filters">
      <label>Sucursal<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Todas permitidas</option>{branches.map(b=><option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
      <label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label className="grow">Buscar<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pedido, proveedor, cliente, SKU, referencia…"/></label>
    </section>

    {message?<div className="message">{message}{lastUpdated?` · ${lastUpdated.toLocaleTimeString('es-MX')}`:''}</div>:null}
    <div className="reports-kpis-v2">{kpis.map(([a,b])=><article key={a}><span>{a}</span><strong>{b}</strong></article>)}</div>

    <nav className="reports-tabs-v2">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>

    {tab==='summary'?<Summary s={s}/>:null}
    {tab==='sales'?<Table rows={datasets.sales} columns={[['fecha','Fecha',date],['id_pedido','Pedido'],['nombre_cliente','Cliente'],['sucursal','Sucursal'],['canal_venta','Canal'],['metodo_pago','Pago'],['unidades','Unidades'],['total','Total',money],['estado_pedido','Estado']]}/>:null}
    {tab==='purchases'?<Table rows={datasets.purchases} columns={[['fecha','Fecha',date],['id_compra','Compra'],['proveedor','Proveedor'],['sucursal_recepcion','Sucursal'],['estado','Estado'],['estatus_fiscal','Fiscal'],['unidades_solicitadas','Solic.'],['unidades_recibidas','Recib.'],['total','Total',money],['diferencia_documento','Dif. documento',money],['ultima_recepcion','Última recepción',date]]}/>:null}
    {tab==='returns'?<Table rows={datasets.returns} columns={[['fecha','Fecha',date],['id','Devolución'],['tipo','Tipo'],['referencia','Referencia'],['cliente_proveedor','Cliente / Proveedor'],['sucursales','Sucursal'],['unidades','Unidades'],['importe','Importe',money],['estado','Estado'],['motivo','Motivo']]}/>:null}
    {tab==='payables'?<Table rows={datasets.payables} columns={[['fecha','Fecha',date],['id','CxP'],['origen','Origen'],['proveedor','Proveedor'],['documento','Documento'],['sucursal','Sucursal'],['vencimiento','Vence'],['total','Total',money],['pagado','Pagado',money],['saldo','Saldo',money],['estado','Estado']]}/>:null}
    {tab==='expenses'?<Table rows={datasets.expenses} columns={[['fecha_gasto','Fecha',date],['id_gasto','Egreso'],['origen_modulo','Origen'],['sucursal','Sucursal'],['categoria','Categoría'],['concepto','Concepto'],['proveedor','Proveedor'],['metodo_pago','Método'],['total','Total',money],['estado','Estado']]}/>:null}
    {tab==='cash'?<Table rows={datasets.cash} columns={[['fecha_apertura','Apertura',date],['fecha_cierre','Cierre',date],['id_caja','Caja'],['sucursal','Sucursal'],['fondo_inicial','Fondo',money],['ingresos_efectivo','Ingresos',money],['egresos_efectivo','Egresos',money],['saldo_esperado','Esperado',money],['efectivo_contado','Contado',money],['diferencia','Diferencia',money],['estado','Estado']]}/>:null}
    {tab==='inventory'?<Table rows={datasets.inventory} columns={[['sucursal','Sucursal'],['sku','SKU'],['producto','Producto'],['stock','Stock'],['stock_minimo','Mínimo'],['fecha_actualizacion','Actualización',date]]}/>:null}
    {tab==='tcg'?<Table rows={datasets.tcg} columns={[['sucursal','Sucursal'],['sku','SKU'],['carta','Carta'],['rareza','Rareza'],['condicion','Condición'],['stock','Stock'],['stock_reservado','Reservado'],['disponible','Disponible'],['costo','Costo',money],['precio','Precio',money]]}/>:null}
    {tab==='alerts'?<Table rows={datasets.alerts} columns={[['fecha','Fecha',date],['prioridad','Prioridad'],['tipo','Tipo'],['titulo','Alerta'],['sucursal','Sucursal'],['referencia','Referencia'],['leida','Leída',yesNo],['resuelta','Resuelta',yesNo],['resuelta_por','Resuelta por']]}/>:null}

    {tab==='integrity'?<section className="reports-audit-panel">
      <div className="reports-audit-head"><div><h2>Auditoría de integridad</h2><p>Solo lectura. Detecta inconsistencias sin modificar información.</p></div><button disabled={loading} onClick={runAudit}>Ejecutar auditoría</button></div>
      <div className="audit-kpis-v2"><article><span>Estado</span><strong>{audit?.summary?.status||'—'}</strong></article><article><span>Incidencias</span><strong>{audit?.summary?.incidents??'—'}</strong></article><article><span>Altas</span><strong>{audit?.summary?.high??'—'}</strong></article><article><span>Medias</span><strong>{audit?.summary?.medium??'—'}</strong></article></div>
      <Table rows={audit?.incidents||[]} columns={[['module','Módulo'],['severity','Severidad'],['branch','Sucursal'],['reference','Referencia'],['type','Tipo'],['message','Detalle']]}/>
    </section>:null}
  </div>;
}
function yesNo(v){return v?'Sí':'No';}
function Summary({s}){
  const blocks=[
    ['Ventas',[['Operaciones',s.sales?.operaciones],['Pagadas',s.sales?.pagadas],['Canceladas',s.sales?.canceladas],['Total',money(s.sales?.total)]]],
    ['Compras',[['Operaciones',s.purchases?.operaciones],['Recibidas',s.purchases?.recibidas],['Pendientes',s.purchases?.pendientes],['Total',money(s.purchases?.total)]]],
    ['CxP',[['Cuentas',s.payables?.cuentas],['Vencidas',s.payables?.vencidas],['Pagado',money(s.payables?.pagado)],['Saldo',money(s.payables?.saldo)]]],
    ['Egresos',[['Pagados',s.expenses?.pagados],['Pendientes',s.expenses?.pendientes],['Pagado',money(s.expenses?.totalPagado)],['Pendiente',money(s.expenses?.totalPendiente)]]],
    ['Caja',[['Sesiones',s.cash?.sesiones],['Cerradas',s.cash?.cerradas],['Ingresos',money(s.cash?.ingresos)],['Diferencia',money(s.cash?.diferencia)]]],
    ['Inventario',[['Productos',s.inventory?.productos],['Unidades',s.inventory?.unidades],['Bajo mínimo',s.inventory?.bajoMinimo],['TCG disponible',s.tcg?.disponibles]]],
    ['Devoluciones',[['Operaciones',s.returns?.operaciones],['Unidades',s.returns?.unidades],['Importe',money(s.returns?.importe)],['—','—']]],
    ['Alertas',[['Total',s.alerts?.total],['Abiertas',s.alerts?.abiertas],['Críticas',s.alerts?.criticas],['No leídas',s.alerts?.noLeidas]]]
  ];
  return <div className="reports-summary-grid-v2">{blocks.map(([title,rows])=><article key={title}><h3>{title}</h3><dl>{rows.map(([a,b])=><div key={a}><dt>{a}</dt><dd>{b??0}</dd></div>)}</dl></article>)}</div>;
}
function Table({rows,columns}){
  return <div className="report-table-v2"><table><thead><tr>{columns.map(c=><th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>
    {(rows||[]).map((r,i)=><tr key={r.row_id||r.id||r.id_pedido||r.id_compra||r.id_gasto||r.id_caja||i}>{columns.map(([k,_l,fmt])=><td key={k}>{fmt?fmt(r[k]):(r[k]??'—')}</td>)}</tr>)}
    {!rows?.length?<tr><td className="empty" colSpan={columns.length}>Sin información para los filtros seleccionados.</td></tr>:null}
  </tbody></table></div>;
}
