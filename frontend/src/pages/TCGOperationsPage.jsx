import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { api } from '../services/api.js';
import { parseCsv, toCsv, downloadText } from '../utils/csv.js';
import '../phase_gmx_exact_views_r23.css';
import '../tcg_operations_premium_r34.css';



import '../gmx_tcg_operations_final.css';
import '../tcg_operations_color_r75.css';

function OpsR75Icon({ name }) {
  const p = {
    activity:<><path d="M4 12h3l2-5 4 10 2-5h5"/></>,
    transfer:<><path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3"/></>,
    adjust:<><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
    count:<><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4v3h6V4M8 12l2 2 4-4M8 17h7"/></>,
    labels:<><path d="M4 12V5h7l9 9-7 7-9-9Z"/><circle cx="8" cy="9" r="1"/></>,
    bulk:<><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></>,
    history:<><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></>
  };
  return <svg className="gmx-r75-ops-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{p[name]||p.activity}</svg>;
}

const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export default function TCGOperationsPage() {
  const [tab, setTab] = useState('move');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [variants, setVariants] = useState([]);
  const [movements, setMovements] = useState([]);
  const [counts, setCounts] = useState([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [moveSearch, setMoveSearch] = useState('');
  const [adjustSearch, setAdjustSearch] = useState('');
  const [labelSearch, setLabelSearch] = useState('');
  const [labelCodeType, setLabelCodeType] = useState('QR');

  const [transfer, setTransfer] = useState({ code: '', originBranchId: '', destBranchId: '', quantity: 1, reason: '' });
  const [adjust, setAdjust] = useState({ code: '', branchId: '', targetStock: 0, reason: '' });

  const [labelSelection, setLabelSelection] = useState({});
  const [labelSize, setLabelSize] = useState('50x30');
  const [showPrice, setShowPrice] = useState(true);
  const [labelHtml, setLabelHtml] = useState('');

  const [activeCount, setActiveCount] = useState(null);
  const [countCode, setCountCode] = useState('');
  const [bulkRows, setBulkRows] = useState([]);
  const [opsGameFilter,setOpsGameFilter]=useState('');
  const [opsExpansionFilter,setOpsExpansionFilter]=useState('');
  const [opsPanel,setOpsPanel]=useState('dashboard');

  async function loadCore() {
    const b = await api('/api/v1/branches?includeInactive=false');
    setBranches(b.data || []);
    if (!branchId && b.data?.[0]) {
      const id = b.data[0].id_sucursal;
      setBranchId(id);
      setTransfer((x) => ({ ...x, originBranchId: id }));
      setAdjust((x) => ({ ...x, branchId: id }));
    }
  }

  async function loadOperational() {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const [v, m, c] = await Promise.all([
    api(`/api/v1/tcg-ops/variants${q}${q ? '&' : '?'}limit=500`),
    api(`/api/v1/tcg-ops/movements${q}${q ? '&' : '?'}limit=500`),
    api(`/api/v1/tcg-ops/counts${q}${q ? '&' : '?'}limit=200`)]
    );
    setVariants(v.data || []);
    setMovements(m.data || []);
    setCounts(c.data || []);
  }

  useEffect(() => {loadCore().catch((e) => setMessage(e.message));}, []);
  useEffect(() => {
    if (branchId) {
      setTransfer((x) => ({ ...x, originBranchId: x.originBranchId || branchId }));
      setAdjust((x) => ({ ...x, branchId }));
      loadOperational().catch((e) => setMessage(e.message));
    }
  }, [branchId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return variants.filter((v) =>
    v.id_sucursal === branchId && (
    !q || [
    v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q)))
    );
  }, [variants, search, branchId]);


  const moveVariants = useMemo(() => {
    const q = moveSearch.trim().toLowerCase();
    return variants.filter((v) =>
    v.id_sucursal === transfer.originBranchId && (
    !q || [v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q)))
    ).slice(0, 100);
  }, [variants, transfer.originBranchId, moveSearch]);

  const adjustVariants = useMemo(() => {
    const q = adjustSearch.trim().toLowerCase();
    return variants.filter((v) =>
    v.id_sucursal === adjust.branchId && (
    !q || [v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q)))
    ).slice(0, 100);
  }, [variants, adjust.branchId, adjustSearch]);

  const labelVariants = useMemo(() => {
    const q = labelSearch.trim().toLowerCase();
    return filtered.filter((v) =>
    !q || [v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q))
    );
  }, [filtered, labelSearch]);
  const opsGames=useMemo(()=>{
    const values=variants
      .map(v=>v.juego||v.nombre_juego||v.game||v.id_juego)
      .filter(Boolean)
      .map(String);
    return [...new Set(values)].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  },[variants]);

  const opsExpansions=useMemo(()=>{
    const rows=variants.filter(v=>
      !opsGameFilter ||
      String(v.juego||v.nombre_juego||v.game||v.id_juego||'')===opsGameFilter
    );
    const values=rows
      .map(v=>v.expansion||v.nombre_set||v.set||v.edicion||v.id_set)
      .filter(Boolean)
      .map(String);
    return [...new Set(values)].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  },[variants,opsGameFilter]);

  const opsFiltered=useMemo(()=>{
    const q=String(search||'').trim().toLowerCase();
    return variants.filter(v=>{
      const game=String(v.juego||v.nombre_juego||v.game||v.id_juego||'');
      const expansion=String(v.expansion||v.nombre_set||v.set||v.edicion||v.id_set||'');
      if(opsGameFilter && game!==opsGameFilter)return false;
      if(opsExpansionFilter && expansion!==opsExpansionFilter)return false;
      if(!q)return true;
      return [
        v.carta,v.sku,v.id_inventario,v.rareza,
        v.condicion,v.idioma,v.edicion,v.id_set
      ].some(x=>String(x||'').toLowerCase().includes(q));
    });
  },[variants,search,opsGameFilter,opsExpansionFilter]);
  const opsStats=useMemo(()=>{
    const today=new Date().toDateString();
    const todayRows=movements.filter(m=>{
      const raw=m.fecha||m.fecha_movimiento||m.created_at||m.fecha_creacion;
      if(!raw)return false;
      const d=new Date(raw);
      return !Number.isNaN(d.getTime())&&d.toDateString()===today;
    });
    const kind=(m)=>String(m.tipo||m.tipo_movimiento||m.operation||'').toUpperCase();
    const transfers=todayRows.filter(m=>kind(m).includes('TRANSFER')).length;
    const adjustments=todayRows.filter(m=>kind(m).includes('ADJUST')||kind(m).includes('AJUST')).length;
    const openCounts=counts.filter(c=>{
      const s=String(c.estado||c.status||'').toUpperCase();
      return !s||s.includes('OPEN')||s.includes('ABIER')||s.includes('ACTIV');
    }).length;
    return {todayMoves:todayRows.length,transfers,adjustments,openCounts,totalMoves:movements.length};
  },[movements,counts]);
const opsRecent=useMemo(()=>movements.slice(0,8),[movements]);

  function opsMoney(v){
    return Number(v||0).toLocaleString('es-MX',{
      style:'currency',
      currency:'MXN',
      maximumFractionDigits:2
    });
  }

  function opsGo(target){
    if(target==='labels'){
      setTab('labels');
      setOpsPanel('module');
      return;
    }
    if(target==='count'){
      setTab('count');
      setOpsPanel('module');
      return;
    }
    setTab('move');
    setOpsPanel('module');
  }

  function variantText(v) {
    const cardLabel = `${v.carta || 'Carta'}${v.rareza ? ` (${v.rareza})` : ''}`;
    return [
    cardLabel,
    v.sku,
    v.id_inventario,
    [v.idioma, v.condicion, v.acabado, v.edicion].filter(Boolean).join(' Â· '),
    `Stock ${Number(v.stock || 0)}`].
    filter(Boolean).join(' â ');
  }

  async function doTransfer() {
    try {
      const r = await api('/api/v1/tcg-ops/transfer', { method: 'POST', body: JSON.stringify(transfer) });
      setMessage(`Transferencia ${r.data.id_movimiento}: origen ${r.data.origin_stock}, destino ${r.data.dest_stock}`);
      setTransfer((x) => ({ ...x, code: '', quantity: 1, reason: '' }));
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  async function doAdjust() {
    try {
      const r = await api('/api/v1/tcg-ops/adjust', { method: 'POST', body: JSON.stringify(adjust) });
      setMessage(`Ajuste ${r.data.id_movimiento}: ${r.data.delta >= 0 ? '+' : ''}${r.data.delta}`);
      setAdjust((x) => ({ ...x, code: '', reason: '' }));
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }


  function code39Svg(text) {
    const patterns = {
      '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn',
      '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
      'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn',
      'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
      'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
      'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
      '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn'
    };
    const value = `*${String(text || '').toUpperCase().replace(/[^0-9A-Z. \-]/g, '-')}*`;
    let x = 10,rects = '';
    for (const ch of value) {
      const p = patterns[ch] || patterns['-'];
      for (let i = 0; i < p.length; i++) {
        const w = p[i] === 'w' ? 3 : 1;
        if (i % 2 === 0) rects += `<rect x="${x}" y="5" width="${w}" height="44" fill="black"/>`;
        x += w;
      }
      x += 1;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 54" preserveAspectRatio="none">${rects}</svg>`;
  }

  function code128Svg(text) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    JsBarcode(svg, String(text || ''), {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      height: 42,
      width: 1.4
    });

    return svg.outerHTML;
  }
  async function generateLabels() {
    const chosen = variants.flatMap((v) => {
      const qty = Number(labelSelection[v.id_inventario] || 0);
      return qty > 0 ? Array.from({ length: qty }, () => v) : [];
    }).slice(0, 1000);
    if (!chosen.length) {setMessage('Selecciona al menos una etiqueta.');return;}
    const nodes = [];
    for (const v of chosen) {
      const payload = `TCG-STORE-TEMPLATE-TCG:${v.id_inventario}`;
      const data = labelCodeType === 'QR' ?
      await QRCode.toDataURL(payload, { margin: 0, width: 180, errorCorrectionLevel: 'M' }) :
      null;
      nodes.push(`<div class="print-label size-${labelSize} type-${labelCodeType.toLowerCase()}">
        ${labelCodeType === 'QR' ?
      `<img src="${data}" class="qr"/>` :
      `<div class="barcode">${code128Svg(v.id_inventario || v.sku || '')}</div>`}
        <div class="label-info"><strong>${escapeHtml(v.carta || '')}</strong>
        <span>${escapeHtml(v.sku || '')}</span>
        <span>${escapeHtml([v.rareza, v.idioma, v.condicion, v.edicion].filter(Boolean).join(' Â· '))}</span>
        ${showPrice ? `<b>${escapeHtml(money(Number(v.precio_oferta || 0) > 0 ? v.precio_oferta : v.precio))}</b>` : ''}
        <small class="label-payload">${escapeHtml(payload)}</small></div></div>`);
    }
    setLabelHtml(nodes.join(''));
    setTimeout(() => window.print(), 100);
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function newCount() {
    try {
      const r = await api('/api/v1/tcg-ops/counts', { method: 'POST', body: JSON.stringify({ branchId }) });
      setMessage(`Conteo ${r.data.id_conteo} abierto en modo ciego.`);
      await openCount(r.data.id_conteo);
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  async function openCount(id) {
    try {
      const r = await api(`/api/v1/tcg-ops/counts/${id}`);
      setActiveCount(r.data);
    } catch (e) {setMessage(e.message);}
  }

  async function captureCount() {
    try {
      await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/capture`, {
        method: 'POST',
        body: JSON.stringify({ code: countCode })
      });
      setCountCode('');
      await openCount(activeCount.id_conteo);
    } catch (e) {setMessage(e.message);}
  }

  async function setPhysical(d, value) {
    try {
      await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/capture`, {
        method: 'POST',
        body: JSON.stringify({ code: d.id_inventario, quantity: Number(value) })
      });
      await openCount(activeCount.id_conteo);
    } catch (e) {setMessage(e.message);}
  }

  async function closeCount(apply) {
    if (!(await window.tcg_store_templateConfirm(
      apply ? 'Â¿Cerrar y aplicar diferencias al inventario?' : 'Â¿Cerrar sin aplicar diferencias?',
      { title: apply ? 'Aplicar conteo' : 'Cerrar conteo', confirmText: apply ? 'Aplicar diferencias' : 'Cerrar sin aplicar' }
    ))) return;
    try {
      const r = await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/close`, {
        method: 'POST', body: JSON.stringify({ applyAdjustments: apply, zeroUncounted: false })
      });
      setMessage(`Conteo ${r.data.status}. Diferencia ${r.data.diffTotal}.`);
      setActiveCount(null);
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  function downloadBlindCount() {
    if (!activeCount) return;
    const rows = (activeCount.details || []).map((d) => ({
      SKU: d.sku,
      IDInventario: d.id_inventario,
      Carta: d.carta,
      Rareza: d.rareza,
      Idioma: d.idioma,
      Condicion: d.condicion,
      Edicion: d.edicion,
      CantidadFisica: ''
    }));
    downloadText(`TCG_CONTEO_CIEGO_${activeCount.id_conteo}.csv`, toCsv(rows));
  }

  async function importBlind(file) {
    const rows = parseCsv(await file.text());
    for (const r of rows) {
      const code = r.IDInventario || r.SKU || r.Codigo;
      if (!code || r.CantidadFisica === '') continue;
      await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/capture`, {
        method: 'POST',
        body: JSON.stringify({ code, quantity: Number(r.CantidadFisica) })
      });
    }
    setMessage(`Conteo importado: ${rows.length} fila(s).`);
    await openCount(activeCount.id_conteo);
  }

  async function importBulk(file) {
    const rows = parseCsv(await file.text()).map((r) => ({
      operation: r.operation || r.Operacion || r.OPERACION,
      branchId: r.branchId || r.Sucursal || r.IDSucursal,
      originBranchId: r.originBranchId || r.SucursalOrigen,
      destBranchId: r.destBranchId || r.SucursalDestino,
      code: r.code || r.Codigo || r.SKU || r.IDInventario,
      quantity: Number(r.quantity || r.Cantidad || 1),
      targetStock: r.targetStock === '' ? undefined : Number(r.targetStock || r.StockObjetivo),
      reference: r.reference || r.Referencia || 'BULK',
      reason: r.reason || r.Motivo || 'OperaciÃ³n masiva'
    }));
    setBulkRows(rows);
  }

  async function runBulk() {
    try {
      const r = await api('/api/v1/tcg-ops/bulk', { method: 'POST', body: JSON.stringify({ rows: bulkRows }) });
      setMessage(`OperaciÃ³n masiva: ${r.data.ok} correctas, ${r.data.failed} fallidas.`);
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  function bulkTemplate() {
    downloadText(
      'TCG_STORE_TEMPLATE_TCG_MOVIMIENTOS_TEMPLATE.csv',
      'operation,branchId,originBranchId,destBranchId,code,quantity,targetStock,reference,reason\r\nTRANSFER,,SUC-001,SUC-002,TCG-SKU,1,,REF-002,Transferencia\r\nADJUST,SUC-001,,,TCG-SKU,1,10,REF-003,Ajuste fÃ­sico'
    );
  }

  const inventoryInsights = useMemo(() => {
    const typeCounts = movements.reduce((acc, item) => {
      const key = String(item.tipo || 'OTRO').toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const movementTypes = Object.entries(typeCounts).
      sort((a, b) => b[1] - a[1]).
      slice(0, 5);
    const maxType = Math.max(1, ...movementTypes.map(([, value]) => value));

    const branchStock = branches.map((branch) => ({
      id: branch.id_sucursal,
      name: branch.nombre_sucursal,
      units: variants.
        filter((item) => item.id_sucursal === branch.id_sucursal).
        reduce((sum, item) => sum + Number(item.stock || 0), 0)
    })).sort((a, b) => b.units - a.units);
    const maxBranch = Math.max(1, ...branchStock.map((item) => item.units));

    const now = new Date();
    const activity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const count = movements.filter((item) => {
        const value = new Date(item.fecha);
        return Number.isFinite(value.getTime()) && value >= date && value < next;
      }).length;
      return {
        label: date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', ''),
        count
      };
    });
    const maxActivity = Math.max(1, ...activity.map((item) => item.count));
    return { movementTypes, maxType, branchStock, maxBranch, activity, maxActivity };
  }, [movements, variants, branches]);

  const premiumActivityPoints=inventoryInsights.activity.map((item,index)=>{
    const x=8+(index*(84/Math.max(1,inventoryInsights.activity.length-1)));
    const y=84-(Number(item.count||0)/Math.max(1,inventoryInsights.maxActivity))*62;
    return `${x},${y}`;
  }).join(' ');
  const premiumActivityArea=`8,88 ${premiumActivityPoints} 92,88`;
  return <div className={`tcgops-stack tcgops-essential gmx-ops-final ${opsPanel==='module'?'is-module':'is-dashboard'}`}>
    <section className="content-card gmx-ops-final-shell">

      <div className="gmx-ops-final-head">
        <div>
          <span className="eyebrow">OPERACIÓN</span>
          <h2>Operación TCG</h2>
          <p>Ejecuta movimientos físicos, conteos, ajustes y etiquetado.</p>
        </div>
        <label>
          Sucursal activa
          <select value={branchId} onChange={e=>setBranchId(e.target.value)}>
            {branches.map(b=><option key={b.row_id||b.id_sucursal} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>
      </div>

      {message?<div className="message gmx-ops-final-message">{message==='VARIANT_NOT_IN_COUNT'?'La variante no pertenece al conteo activo. Vuelve a descargar la plantilla del conteo actual.':message}</div>:null}

      <div className="gmx-ops-final-kpis gmx-r75-ops-kpis">
        <article className="blue"><OpsR75Icon name="activity"/><span>Movimientos hoy</span><strong>{opsStats.todayMoves}</strong><small>actividad registrada</small></article>
        <article className="cyan"><OpsR75Icon name="transfer"/><span>Transferencias hoy</span><strong>{opsStats.transfers}</strong><small>entre sucursales</small></article>
        <article className="orange"><OpsR75Icon name="adjust"/><span>Ajustes hoy</span><strong>{opsStats.adjustments}</strong><small>correcciones físicas</small></article>
        <article className="green"><OpsR75Icon name="count"/><span>Conteos abiertos</span><strong>{opsStats.openCounts}</strong><small>en proceso</small></article>
        <article className="purple"><OpsR75Icon name="history"/><span>Historial</span><strong>{opsStats.totalMoves}</strong><small>movimientos cargados</small></article>
      </div>

      <div className="gmx-ops-final-dashboard">
        <div className="gmx-ops-final-main">
          <section className="gmx-ops-final-card">
            <div className="gmx-ops-final-title"><div><h3>Actividad reciente</h3><p>Últimos movimientos de la sucursal activa.</p></div><button type="button" onClick={()=>opsGo('move')}>Ver historial ›</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Operación</th><th>Carta / SKU</th><th>Cantidad</th><th>Origen → Destino</th></tr></thead>
                <tbody>
                  {opsRecent.length?opsRecent.map((m,i)=>{
                    const raw=m.fecha||m.fecha_movimiento||m.created_at||m.fecha_creacion;
                    const qty=Number(m.cantidad??m.quantity??m.delta??0);
                    return <tr key={m.row_id||m.id_movimiento||i}>
                      <td>{raw?new Date(raw).toLocaleString('es-MX'):'—'}</td>
                      <td><span className="gmx-ops-final-badge">{m.tipo||m.tipo_movimiento||m.operation||'Movimiento'}</span></td>
                      <td><strong>{m.carta||m.sku||m.id_inventario||'—'}</strong></td>
                      <td>{qty>0?'+':''}{qty}</td>
                      <td>{m.sucursal_origen||m.origen||'—'} {' → '} {m.sucursal_destino||m.destino||m.sucursal||'—'}</td>
                    </tr>;
                  }):<tr><td colSpan="5">No hay movimientos recientes.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="gmx-ops-final-card">
            <div className="gmx-ops-final-title"><div><h3>Acciones rápidas</h3><p>Herramientas operativas.</p></div></div>
            <div className="gmx-ops-final-actions gmx-r75-ops-actions">
              <button className="blue" type="button" onClick={()=>opsGo('move')}><b><OpsR75Icon name="transfer"/></b><span>Transferir</span><small>Mover entre sucursales</small></button>
              <button className="orange" type="button" onClick={()=>opsGo('move')}><b><OpsR75Icon name="adjust"/></b><span>Ajuste manual</span><small>Corregir stock físico</small></button>
              <button className="green" type="button" onClick={()=>opsGo('count')}><b><OpsR75Icon name="count"/></b><span>Conteo físico</span><small>Iniciar o continuar</small></button>
              <button className="purple" type="button" onClick={()=>opsGo('labels')}><b><OpsR75Icon name="labels"/></b><span>Etiquetas</span><small>QR y código de barras</small></button>
              <button className="cyan" type="button" onClick={()=>opsGo('move')}><b><OpsR75Icon name="bulk"/></b><span>Operación masiva</span><small>Procesar archivo CSV</small></button>
            </div>
          </aside>
        </div>

        <div className="gmx-ops-final-bottom">
          <section className="gmx-ops-final-card">
            <div className="gmx-ops-final-title"><div><h3>Conteos en proceso</h3><p>Seguimiento de conteos físicos abiertos.</p></div><button type="button" onClick={()=>opsGo('count')}>Abrir conteos ›</button></div>
            <div className="gmx-ops-final-list">
              {counts.filter(c=>{
                const s=String(c.estado||c.status||'').toUpperCase();
                return !s||s.includes('OPEN')||s.includes('ABIER')||s.includes('ACTIV');
              }).slice(0,5).map((c,i)=><div key={c.row_id||c.id_conteo||i}><div><strong>{c.id_conteo||`Conteo ${i+1}`}</strong><small>{c.sucursal||'Sucursal activa'}</small></div><span>EN PROCESO</span></div>)}
              {!opsStats.openCounts?<div className="gmx-ops-final-empty">No hay conteos abiertos.</div>:null}
            </div>
          </section>

          <section className="gmx-ops-final-card">
            <div className="gmx-ops-final-title"><div><h3>Resumen operativo</h3><p>Estado de las herramientas operativas.</p></div></div>
            <div className="gmx-ops-final-list">
              <div><span>Sucursal activa</span><strong>{branches.find(b=>String(b.id_sucursal)===String(branchId))?.nombre_sucursal||'—'}</strong></div>
              <div><span>Movimientos cargados</span><strong>{movements.length}</strong></div>
              <div><span>Conteos registrados</span><strong>{counts.length}</strong></div>
              <div><span>Filas masivas preparadas</span><strong>{bulkRows.length}</strong></div>
            </div>
          </section>
        </div>
      </div>

      <div className="gmx-ops-final-nav">
        <button type="button" onClick={()=>setOpsPanel('dashboard')}>â Resumen</button>
        <button
          type="button"
          className={tab==='move'?'active':''}
          onClick={()=>{setTab('move');setOpsPanel('module');}}
        >
          Movimientos
        </button>
        <button
          type="button"
          className={tab==='labels'?'active':''}
          onClick={()=>{setTab('labels');setOpsPanel('module');}}
        >
          Etiquetas
        </button>
        <button
          type="button"
          className={tab==='count'?'active':''}
          onClick={()=>{setTab('count');setOpsPanel('module');}}
        >
          Conteo fÃ­sico
        </button>
      </div>
{tab === 'move' ? <div className="tcgops-body">
        <div className="tcgops-purpose-note">
          <strong>Transferencias y ajustes.</strong>
          Las entradas de mercancÃ­a se hacen desde <b>Centro TCG â RecepciÃ³n</b> y las ventas desde <b>Pedidos / POS</b>.
        </div>

        <div className="tcgops-two">
          <section className="ops-card">
            <h3>Transferencia entre sucursales</h3>
            <p>Selecciona una variante disponible en la sucursal origen. No necesitas memorizar SKU ni IDs.</p>
            <label>Buscar variante<input value={moveSearch} onChange={(e) => setMoveSearch(e.target.value)} placeholder="Carta, SKU, rareza, condiciÃ³nâ¦" /></label>
            <label>Variante
              <select value={transfer.code} onChange={(e) => setTransfer((x) => ({ ...x, code: e.target.value }))}>
                <option value="">Selecciona</option>
                {moveVariants.map((v) => <option key={`${v.id_inventario}-${v.id_sucursal}`} value={v.id_inventario || v.sku}>{variantText(v)}</option>)}
              </select>
            </label>
            <label>Origen<select value={transfer.originBranchId} onChange={(e) => setTransfer((x) => ({ ...x, originBranchId: e.target.value }))}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <label>Destino<select value={transfer.destBranchId} onChange={(e) => setTransfer((x) => ({ ...x, destBranchId: e.target.value }))}><option value="">Selecciona</option>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <label>Cantidad<input type="number" min="1" value={transfer.quantity} onChange={(e) => setTransfer((x) => ({ ...x, quantity: Number(e.target.value) }))} /></label>
            <label>Motivo<input value={transfer.reason} onChange={(e) => setTransfer((x) => ({ ...x, reason: e.target.value }))} /></label>
            <button onClick={doTransfer}>Transferir</button>
          </section>

          <section className="ops-card">
            <h3>Ajuste controlado</h3>
            <p>Para correcciones fÃ­sicas justificadas. Selecciona una variante existente.</p>
            <label>Buscar variante<input value={adjustSearch} onChange={(e) => setAdjustSearch(e.target.value)} placeholder="Carta, SKU, rareza, condiciÃ³nâ¦" /></label>
            <label>Variante
              <select value={adjust.code} onChange={(e) => {
                const code = e.target.value;
                const v = adjustVariants.find((x) => (x.id_inventario || x.sku) === code);
                setAdjust((x) => ({ ...x, code, targetStock: v ? Number(v.stock || 0) : x.targetStock }));
              }}>
                <option value="">Selecciona</option>
                {adjustVariants.map((v) => <option key={`${v.id_inventario}-${v.id_sucursal}`} value={v.id_inventario || v.sku}>{variantText(v)}</option>)}
              </select>
            </label>
            <label>Sucursal<select value={adjust.branchId} onChange={(e) => setAdjust((x) => ({ ...x, branchId: e.target.value }))}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <label>Stock objetivo<input type="number" min="0" value={adjust.targetStock} onChange={(e) => setAdjust((x) => ({ ...x, targetStock: Number(e.target.value) }))} /></label>
            <label>Motivo<input value={adjust.reason} onChange={(e) => setAdjust((x) => ({ ...x, reason: e.target.value }))} /></label>
            <button onClick={doAdjust}>Aplicar ajuste</button>
          </section>
        </div>

        <section className="tcgops-movement-history">
          <div className="section-head compact">
            <div><h3>Historial de movimientos</h3><p>Transferencias, recepciones, ajustes, ventas y conciliaciones quedan visibles aquÃ­.</p></div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>SKU</th><th>Origen</th><th>Destino</th><th>Cantidad</th><th>Referencia</th></tr></thead>
            <tbody>{movements.map((m) => <tr key={m.row_id}>
              <td>{m.fecha ? new Date(m.fecha).toLocaleString('es-MX') : 'â'}</td><td>{m.tipo}</td><td>{m.sku}</td>
              <td>{m.sucursal_origen || 'â'}</td><td>{m.sucursal_destino || 'â'}</td><td>{m.cantidad}</td><td>{m.referencia || 'â'}</td>
            </tr>)}</tbody>
          </table></div>
        </section>

        <details className="tcgops-advanced">
          <summary>Operaciones masivas avanzadas</summary>
          <p>Solo para transferencias y ajustes por lote. Las entradas normales deben registrarse mediante RecepciÃ³n.</p>
          <div className="actions">
            <button className="secondary" onClick={bulkTemplate}>Descargar plantilla</button>
            <label className="file-btn">Cargar CSV<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && importBulk(e.target.files[0])} /></label>
            <button onClick={runBulk} disabled={!bulkRows.length}>Ejecutar {bulkRows.length || ''}</button>
          </div>
          {bulkRows.length ? <div className="message">Archivo preparado: {bulkRows.length} fila(s).</div> : null}
        </details>
      </div> : null}

      {tab === 'labels' ? <div className="tcgops-body">
        <div className="tcgops-purpose-note">
          <strong>Etiquetado de variantes fÃ­sicas.</strong> AquÃ­ sÃ­ se conserva una funciÃ³n TCG especÃ­fica porque cada variante puede cambiar por idioma, condiciÃ³n, acabado o ediciÃ³n.
        </div>
        <div className="label-controls label-controls-improved">
          <input className="label-search" value={labelSearch} onChange={(e) => setLabelSearch(e.target.value)} placeholder="Buscar carta, SKU, ID, rarezaâ¦" />
          <select value={labelSize} onChange={(e) => setLabelSize(e.target.value)}><option value="50x30">50 Ã 30 mm</option><option value="60x40">60 Ã 40 mm</option></select>
          <select value={labelCodeType} onChange={(e) => setLabelCodeType(e.target.value)}>
            <option value="QR">CÃ³digo QR</option>
            <option value="BARCODE">CÃ³digo de barras</option>
          </select>
          <label className="check-label"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />Mostrar precio</label>
          <button className="secondary" onClick={() => setLabelSelection(Object.fromEntries(labelVariants.filter((v) => Number(v.stock || 0) > 0).map((v) => [v.id_inventario, 1])))}>Seleccionar con stock</button>
          <button onClick={generateLabels}>Generar / imprimir</button>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Carta / producto TCG</th><th>SKU / ID</th><th>Variante</th><th>Stock</th><th>Etiquetas</th></tr></thead>
          <tbody>{labelVariants.map((v) => <tr key={`${v.id_inventario}-${v.id_sucursal}`}>
            <td><strong>{v.carta}</strong></td>
            <td>{v.sku}<small className="block">{v.id_inventario}</small></td>
            <td>{[v.rareza, v.idioma, v.condicion, v.acabado, v.edicion].filter(Boolean).join(' Â· ') || 'â'}</td>
            <td>{v.stock}</td>
            <td><input className="qty-small" type="number" min="0" max="1000" value={labelSelection[v.id_inventario] || 0} onChange={(e) => setLabelSelection((x) => ({ ...x, [v.id_inventario]: Number(e.target.value) }))} /></td>
          </tr>)}</tbody>
        </table></div>
        <div className="label-print-area" dangerouslySetInnerHTML={{ __html: labelHtml }} />
      </div> : null}

      {tab === 'count' ? <div className="tcgops-body">
        <div className="tcgops-purpose-note">
          <strong>Conteo fÃ­sico.</strong> La plantilla es el mÃ©todo principal para inventarios grandes; el conteo manual por fila queda como alternativa para inventarios pequeÃ±os.
        </div>
        {!activeCount ? <>
          <div className="actions"><button onClick={newCount}>Nuevo conteo ciego</button></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Inicio</th><th>ID</th><th>Sucursal</th><th>Estado</th><th>Variantes</th><th>Diferencia</th><th></th></tr></thead>
            <tbody>{counts.map((c) => <tr key={c.row_id}>
              <td>{c.fecha_inicio ? new Date(c.fecha_inicio).toLocaleString('es-MX') : 'â'}</td><td>{c.id_conteo}</td><td>{c.sucursal}</td><td>{c.estado}</td><td>{c.variantes_contadas}</td><td>{c.diferencia_unidades}</td>
              <td><button className="secondary compact" onClick={() => openCount(c.id_conteo)}>Abrir</button></td>
            </tr>)}</tbody>
          </table></div>
        </> : <section className="count-box">
          <div className="section-head"><div><div className="eyebrow">CONTEO CIEGO</div><h3>{activeCount.id_conteo} Â· {activeCount.sucursal}</h3></div><button className="secondary compact" onClick={() => setActiveCount(null)}>Cerrar vista</button></div>
          {activeCount.estado === 'ABIERTO' ? <>
            <div className="count-template-primary">
              <div>
                <strong>MÃ©todo recomendado: plantilla de conteo</strong>
                <p>Descarga la plantilla generada desde el inventario actual, captura Ãºnicamente la cantidad fÃ­sica y vuelve a importarla.</p>
              </div>
              <div className="actions">
                <button className="secondary" onClick={downloadBlindCount}>1. Descargar plantilla</button>
                <label className="file-btn">2. Importar conteo<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && importBlind(e.target.files[0])} /></label>
              </div>
            </div>
            <details className="count-manual-fallback">
              <summary>Conteo manual guiado (opcional)</summary>
              <p>Ãsalo cuando el conteo sea pequeÃ±o o no sea prÃ¡ctico trabajar con archivo. Escribe la cantidad fÃ­sica directamente en cada variante.</p>
            </details>
            <div className="table-wrap"><table>
              <thead><tr><th>Carta</th><th>SKU</th><th>Rareza</th><th>CondiciÃ³n</th><th>Cantidad fÃ­sica</th></tr></thead>
              <tbody>{(activeCount.details || []).map((d) => <tr key={d.row_id}>
                <td>{d.carta}</td><td>{d.sku}</td><td>{d.rareza || 'â'}</td><td>{d.condicion}</td>
                <td><input className="qty-small" type="number" min="0" value={d.cantidad_fisica ?? ''} onBlur={(e) => e.target.value !== '' && setPhysical(d, e.target.value)} onChange={(e) => setActiveCount((c) => ({ ...c, details: c.details.map((x) => x.row_id === d.row_id ? { ...x, cantidad_fisica: e.target.value } : x) }))} /></td>
              </tr>)}</tbody>
            </table></div>
            <div className="count-footer"><button className="secondary" onClick={() => closeCount(false)}>Cerrar sin ajustes</button><button onClick={() => closeCount(true)}>Cerrar y conciliar inventario</button></div>
          </> : <div className="message">Conteo {activeCount.estado}. Sistema: {activeCount.unidades_sistema} Â· fÃ­sico: {activeCount.unidades_fisicas} Â· diferencia: {activeCount.diferencia_unidades}</div>}
        </section>}
      </div> : null}
    </section>
  </div>;
}

