import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import VisionScannerModal from '../components/VisionScannerModal.jsx';
import VisionCandidatePicker from '../components/VisionCandidatePicker.jsx';
import { visionQueries, scoreVisionCandidate } from '../utils/vision.js';
import InventoryAdjustModal from '../components/InventoryAdjustModal.jsx';
import TransferModal from '../components/TransferModal.jsx';
import { R23BarList } from '../components/VisualKitR23.jsx';
import '../phase_shiny_exact_views_r23.css';
import '../phase_inventory_inv_b_r31.css';
import '../shiny_inventory_option_b_color_final.css';
const PAGE_SIZE = 50;

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [branches, setBranches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stockStatus, setStockStatus] = useState('all');
  const [productStatus, setProductStatus] = useState('');
  const [sort, setSort] = useState('name');
  const [direction, setDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ records: 0, units: 0, low_stock: 0, out_of_stock: 0 });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('inventory');
  const [message, setMessage] = useState('');
  const [adjustItem, setAdjustItem] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const [visionCandidates, setVisionCandidates] = useState([]);
  const [visionPickerOpen, setVisionPickerOpen] = useState(false);
  const [shinyGameFilter,setGmxGameFilter] = useState('');
  const [shinySetFilter,setGmxSetFilter] = useState('');
  const [shinyTypeFilter,setGmxTypeFilter] = useState('');


  // INVENTARIO-AUD-006A · filtros propios del historial.
  const [movementSearch, setMovementSearch] = useState('');
  const [movementBranchId, setMovementBranchId] = useState('');
  const [movementType, setMovementType] = useState('');
  const [movementDateFrom, setMovementDateFrom] = useState('');
  const [movementDateTo, setMovementDateTo] = useState('');

  // INVENTARIO-AUD-007 · filtros propios de transferencias.
  const [transferSearch, setTransferSearch] = useState('');
  const [transferOriginId, setTransferOriginId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferStatus, setTransferStatus] = useState('');
  const [transferDateFrom, setTransferDateFrom] = useState('');
  const [transferDateTo, setTransferDateTo] = useState('');

  async function loadBranches() {
    const body = await api('/api/v1/branches?includeInactive=true');
    setBranches(body.data || []);
  }

  async function loadCategories() {
    const body = await api('/api/v1/products/meta/categories');
    setCategories(body.data || []);
  }

  async function loadInventory(targetPage = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((targetPage - 1) * PAGE_SIZE),
        branchId, search, category, stockStatus, productStatus, sort, direction
      });
      const body = await api(`/api/v1/inventory?${params}`);
      setInventory(body.data || []);
      setTotal(Number(body.total || 0));
      setSummary(body.summary || {});
    } finally {
      setLoading(false);
    }
  }

  async function loadMovements() {
    const params = new URLSearchParams({ limit: '500' });
    const body = await api(`/api/v1/inventory/movements?${params}`);
    setMovements(body.data || []);
  }

  async function loadTransfers() {
    const body = await api('/api/v1/inventory/transfers?limit=100');
    setTransfers(body.data || []);
  }

  async function refresh() {
    await Promise.all([loadInventory(page), loadMovements(), loadTransfers()]);
  }

  useEffect(() => {
    Promise.all([loadBranches(), loadCategories(), loadMovements(), loadTransfers()]).
    catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => {
      loadInventory(1).catch((e) => setMessage(e.message));
    }, 300);
    return () => clearTimeout(timer);
  }, [branchId, search, category, stockStatus, productStatus, sort, direction]);

  useEffect(() => {
    if (page === 1) return;
    loadInventory(page).catch((e) => setMessage(e.message));
  }, [page]);

  useEffect(() => {
    if (tab === 'movements') loadMovements().catch((e) => setMessage(e.message));
    if (tab === 'transfers') loadTransfers().catch((e) => setMessage(e.message));
  }, [tab]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const movementTypes = useMemo(() => {
    return [...new Set(
      movements.
      map((m) => String(m.tipo || '').trim()).
      filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es'));
  }, [movements]);

  const filteredMovements = useMemo(() => {
    const q = String(movementSearch || '').trim().toLocaleLowerCase('es-MX');
    const from = movementDateFrom ? new Date(`${movementDateFrom}T00:00:00`) : null;
    const to = movementDateTo ? new Date(`${movementDateTo}T23:59:59.999`) : null;

    return movements.
    filter((m) => {
      if (movementBranchId && String(m.id_sucursal || '') !== movementBranchId) return false;
      if (movementType && String(m.tipo || '') !== movementType) return false;

      const date = m.fecha ? new Date(m.fecha) : null;
      if (from && (!date || date < from)) return false;
      if (to && (!date || date > to)) return false;

      if (q) {
        const haystack = [
        m.producto, m.sku, m.id_producto, m.referencia, m.motivo,
        m.nombre_usuario, m.usuario, m.tipo, m.sucursal, m.id_sucursal,
        m.id_movimiento].
        map((v) => String(v || '')).join(' ').toLocaleLowerCase('es-MX');

        const tokens = q.split(/\s+/).filter(Boolean);
        if (!tokens.every((token) => haystack.includes(token))) return false;
      }

      return true;
    }).
    sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha).getTime() : 0;
      const db = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (db !== da) return db - da;
      return Number(b.row_id || 0) - Number(a.row_id || 0);
    });
  }, [
  movements, movementSearch, movementBranchId, movementType,
  movementDateFrom, movementDateTo]
  );


  const transferStatuses = useMemo(() => {
    return [...new Set(
      transfers.map((t) => String(t.estado || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es'));
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    const q = String(transferSearch || '').trim().toLocaleLowerCase('es-MX');
    const from = transferDateFrom ? new Date(`${transferDateFrom}T00:00:00`) : null;
    const to = transferDateTo ? new Date(`${transferDateTo}T23:59:59.999`) : null;

    return transfers.
    filter((t) => {
      if (transferOriginId && String(t.id_origen || '') !== transferOriginId) return false;
      if (transferDestinationId && String(t.id_destino || '') !== transferDestinationId) return false;
      if (transferStatus && String(t.estado || '') !== transferStatus) return false;

      const date = t.fecha ? new Date(t.fecha) : null;
      if (from && (!date || date < from)) return false;
      if (to && (!date || date > to)) return false;

      if (q) {
        const haystack = [
        t.id_transferencia, t.origen, t.id_origen, t.destino, t.id_destino,
        t.estado, t.motivo, t.nombre_admin, t.email_admin, t.id_admin,
        t.referencia_externa, t.tipo, t.proveedor].
        map((v) => String(v || '')).join(' ').toLocaleLowerCase('es-MX');

        const tokens = q.split(/\s+/).filter(Boolean);
        if (!tokens.every((token) => haystack.includes(token))) return false;
      }

      return true;
    }).
    sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha).getTime() : 0;
      const db = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (db !== da) return db - da;
      return Number(b.row_id || 0) - Number(a.row_id || 0);
    });
  }, [
  transfers, transferSearch, transferOriginId, transferDestinationId,
  transferStatus, transferDateFrom, transferDateTo]
  );

  async function handleVisionInventoryResult(result) {
      const activeBranch = branchId || branches[0]?.id_sucursal || '';
      if (!activeBranch) throw new Error('Selecciona una sucursal antes de agregar existencia.');

      const queries = visionQueries(result, { max: 6 });
      const found = new Map();

      for (const q of queries) {
        try {
          const r = await api(`/api/v1/products?limit=80&search=${encodeURIComponent(q)}`);
          for (const p of r.data || []) {
            const score = scoreVisionCandidate(p, result);
            const key = String(p.id || p.row_id || p.sku);
            const previous = found.get(key);
            if (!previous || score > previous.score) found.set(key, { ...p, key, score });
          }
        } catch {}
      }

      const candidates = [...found.values()].
      filter((x) => x.score >= 0.20).
      sort((a, b) => b.score - a.score).
      slice(0, 8);

      setVisionCandidates(candidates);
      setVisionOpen(false);
      setVisionPickerOpen(true);
  }

  function pickVisionInventoryProduct(product) {
      const activeBranch = branchId || branches[0]?.id_sucursal || '';
      const branch = branches.find((x) => String(x.id_sucursal) === String(activeBranch));
      setAdjustItem({
        id_sucursal: activeBranch,
        sucursal: branch?.nombre_sucursal || branch?.nombre || activeBranch,
        id_producto: product.id,
        producto: product.nombre,
        sku: product.sku,
        stock: 0,
        stock_minimo: Number(product.stock_minimo || 0)
      });
      setVisionPickerOpen(false);
  }

  async function openTransfer() {
    try {
      if (!products.length) {
        const body = await api('/api/v1/products?limit=200');
        setProducts(body.data || []);
      }
      setTransferOpen(true);
    } catch (e) {setMessage(e.message);}
  }

  async function saveAdjustment({ mode, quantity, reason }) {
    if (!adjustItem) return;
    try {
      await api('/api/v1/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          branchId: adjustItem.id_sucursal,
          productId: adjustItem.id_producto,
          mode, quantity, reason
        })
      });
      setAdjustItem(null);
      setMessage('Inventario actualizado y movimiento registrado.');
      await refresh();
    } catch (e) {setMessage(e.message);}
  }

  async function saveTransfer(form) {
    try {
      const body = await api('/api/v1/inventory/transfer', { method: 'POST', body: JSON.stringify(form) });
      setTransferOpen(false);
      setMessage(`Transferencia ${body.data.transferId} completada.`);
      await refresh();
    } catch (e) {setMessage(e.message);}
  }

  const branchStock = Object.values(inventory.reduce((result, row) => {
    const key = String(row.id_sucursal || row.sucursal || row.nombre_sucursal || 'Sin sucursal');
    const label = row.nombre_sucursal || row.sucursal || branches.find((branch) => String(branch.id_sucursal) === key)?.nombre_sucursal || key;
    result[key] = result[key] || { key, label, value: 0 };
    result[key].value += Number(row.stock ?? row.existencia ?? row.cantidad ?? 0);
    return result;
  }, {}));
  const availableUnits = Math.max(0, Number(summary.records || total || 0) - Number(summary.low_stock || 0) - Number(summary.out_of_stock || 0));
  const shinyFinalDashboard = useMemo(() => {
    const baseRows = (inventory || []).filter((item) => {
      const game = String(item.juego || item.nombre_juego || item.tcg || '').trim();
      const setName = String(item.expansion || item.set_nombre || item.edicion || '').trim();
      const type = String(item.tipo || item.categoria || '').trim();

      if(shinyGameFilter && game !== shinyGameFilter) return false;
      if(shinySetFilter && setName !== shinySetFilter) return false;
      if(shinyTypeFilter && type !== shinyTypeFilter) return false;
      return true;
    });

    const games=[...new Set((inventory||[])
      .map(item=>String(item.juego||item.nombre_juego||item.tcg||'').trim())
      .filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'es'));

    const sets=[...new Set((inventory||[])
      .filter(item=>{
        if(!shinyGameFilter) return true;
        return String(item.juego||item.nombre_juego||item.tcg||'').trim()===shinyGameFilter;
      })
      .map(item=>String(item.expansion||item.set_nombre||item.edicion||'').trim())
      .filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'es'));

    const types=[...new Set((inventory||[])
      .map(item=>String(item.tipo||item.categoria||'').trim())
      .filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'es'));

    const totalValue=baseRows.reduce((sum,item)=>
      sum + (Number(item.stock||0) * Number(item.precio||0)),0);

    const skuCount=new Set(baseRows
      .map(item=>String(item.sku||'').trim())
      .filter(Boolean)).size;

    const groups={};
    baseRows.forEach(item=>{
      const label=String(item.juego||item.nombre_juego||item.tcg||item.categoria||'Otros').trim()||'Otros';
      if(!groups[label]) groups[label]={label,units:0,value:0};
      const units=Number(item.stock||0);
      const value=units*Number(item.precio||0);
      groups[label].units+=units;
      groups[label].value+=value;
    });

    const byGame=Object.values(groups)
      .sort((a,b)=>b.value-a.value)
      .slice(0,5);

    const totalGroupValue=Math.max(1,byGame.reduce((sum,x)=>sum+x.value,0));
    byGame.forEach(x=>x.percent=Math.round((x.value/totalGroupValue)*100));

    const top=[...baseRows]
      .map(item=>({...item,_value:Number(item.stock||0)*Number(item.precio||0)}))
      .sort((a,b)=>b._value-a._value)
      .slice(0,5);

    const low=[...baseRows]
      .filter(item=>{
        const stock=Number(item.stock||0);
        const min=Number(item.stock_minimo||0);
        return stock>0 && stock<=min;
      })
      .sort((a,b)=>Number(a.stock||0)-Number(b.stock||0))
      .slice(0,5);

    return {rows:baseRows,games,sets,types,totalValue,skuCount,byGame,top,low};
  }, [inventory,shinyGameFilter,shinySetFilter,shinyTypeFilter]);

  function shinyFinalMoney(value){
    return Number(value||0).toLocaleString('es-MX',{
      style:'currency',
      currency:'MXN',
      maximumFractionDigits:2
    });
  }

  function shinyFinalExport(){
    const rows=shinyFinalDashboard.rows||[];
    const headers=['Producto','Expansion','Rareza','Condicion','Idioma','SKU','Unidades','Valor Unitario','Valor Total','Estado'];
    const csv=[
      headers.join(','),
      ...rows.map(item=>{
        const stock=Number(item.stock||0);
        const min=Number(item.stock_minimo||0);
        const state=stock===0?'Sin stock':stock<=min?'Stock bajo':'Disponible';
        return [
          item.producto||item.id_producto||'',
          item.expansion||item.set_nombre||item.edicion||'',
          item.rareza||'',
          item.condicion||'',
          item.idioma||'',
          item.sku||'',
          stock,
          Number(item.precio||0),
          stock*Number(item.precio||0),
          state
        ].map(v=>`"${String(v).replaceAll('"','""')}"`).join(',');
      })
    ].join('\n');

    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`inventario-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const shinyLowStockItems = useMemo(() => {
    return inventory
      .filter((item) => {
        const stock = Number(item.stock || 0);
        const min = Number(item.stock_minimo || 0);
        return stock > 0 && stock <= min;
      })
      .sort((a,b) => Number(a.stock || 0) - Number(b.stock || 0))
      .slice(0,6);
  }, [inventory]);
  const shinyOptionBStats = useMemo(() => {
    const rows = inventory || [];
    const value = rows.reduce((sum,item) => sum + (Number(item.stock || 0) * Number(item.precio || 0)), 0);
    const skuCount = new Set(rows.map(item => String(item.sku || '').trim()).filter(Boolean)).size;

    const groups = {};
    rows.forEach((item) => {
      const label = String(
        item.juego ||
        item.nombre_juego ||
        item.tcg ||
        item.linea ||
        item.categoria ||
        'Otros'
      ).trim() || 'Otros';
      if(!groups[label]) groups[label] = { label, units:0, value:0 };
      const units = Number(item.stock || 0);
      const rowValue = units * Number(item.precio || 0);
      groups[label].units += units;
      groups[label].value += rowValue;
    });

    const byGame = Object.values(groups)
      .sort((a,b) => b.value - a.value)
      .slice(0,4);

    const totalGameValue = Math.max(1, byGame.reduce((sum,x) => sum + x.value,0));
    byGame.forEach((x) => { x.percent = Math.round((x.value / totalGameValue) * 100); });

    const top = [...rows]
      .map(item => ({
        ...item,
        _value: Number(item.stock || 0) * Number(item.precio || 0)
      }))
      .sort((a,b) => b._value - a._value)
      .slice(0,5);

    return {
      value,
      skuCount,
      byGame,
      top
    };
  }, [inventory]);

  function shinyMoney(value){
    return Number(value || 0).toLocaleString('es-MX',{
      style:'currency',
      currency:'MXN',
      maximumFractionDigits:2
    });
  }

  function shinyExportInventory(){
    const rows = inventory || [];
    const headers = ['Producto','SKU','Categoria','Sucursal','Stock','Precio','Estado'];
    const csv = [
      headers.join(','),
      ...rows.map(item => [
        item.producto || item.id_producto || '',
        item.sku || '',
        item.categoria || '',
        item.sucursal || item.id_sucursal || '',
        Number(item.stock || 0),
        Number(item.precio || 0),
        Number(item.stock || 0) === 0 ? 'Sin stock' :
          Number(item.stock || 0) <= Number(item.stock_minimo || 0) ? 'Stock bajo' : 'Disponible'
      ].map(value => `"${String(value).replaceAll('"','""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }



  return <div className="inventory-stack shiny-inv-final-color">
    <section className="shiny-inv-final-shell">

      <header className="shiny-inv-final-head">
        <div>
          <h2>Inventario TCG</h2>
          <p>Consulta y control de inventario</p>
        </div>
        <div className="shiny-inv-final-head-actions">
          <button type="button" onClick={shinyFinalExport}>
            <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/></svg>
            Exportar
          </button>
          <button type="button" className="refresh" onClick={()=>refresh().catch((e)=>setMessage(e.message))}>
            <svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9m2 6a7 7 0 0 0 12.5 2.5L20 15"/></svg>
            Actualizar
          </button>
        </div>
      </header>

      <section className="shiny-inv-final-filters">
        <label>
          <span>Sucursal</span>
          <div className="select-wrap purple">
            <span className="field-icon">
              <svg viewBox="0 0 24 24"><path d="M4 10h16v10H4zM3 10l2-6h14l2 6M8 10V7h8v3"/></svg>
            </span>
            <select value={branchId} onChange={(e)=>setBranchId(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {branches.map(b=><option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
            </select>
          </div>
        </label>

        <label>
          <span>TCG</span>
          <div className="select-wrap blue">
            <span className="field-icon">
              <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M9 11h6"/></svg>
            </span>
            <select value={shinyGameFilter} onChange={(e)=>{setGmxGameFilter(e.target.value);setGmxSetFilter('');}}>
              <option value="">Todos los TCG</option>
              {shinyFinalDashboard.games.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </label>

        <label>
          <span>Expansión</span>
          <div className="select-wrap green">
            <span className="field-icon">
              <svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>
            </span>
            <select value={shinySetFilter} onChange={(e)=>setGmxSetFilter(e.target.value)}>
              <option value="">Todas las expansiones</option>
              {shinyFinalDashboard.sets.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </label>

        <label>
          <span>Tipo</span>
          <div className="select-wrap orange">
            <span className="field-icon">
              <svg viewBox="0 0 24 24"><path d="m4 8 8-4 8 4-8 4-8-4Zm0 4 8 4 8-4M4 16l8 4 8-4"/></svg>
            </span>
            <select value={shinyTypeFilter} onChange={(e)=>setGmxTypeFilter(e.target.value)}>
              <option value="">Todos los tipos</option>
              {shinyFinalDashboard.types.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </label>

        <label className="search-field">
          <span>&nbsp;</span>
          <div>
            <input type="search" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar carta, SKU o ID..." />
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          </div>
        </label>

        <button type="button" className="clear-filters" onClick={()=>{
          setSearch('');
          setBranchId('');
          setCategory('');
          setStockStatus('all');
          setProductStatus('');
          setGmxGameFilter('');
          setGmxSetFilter('');
          setGmxTypeFilter('');
        }}>
          <svg viewBox="0 0 24 24"><path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"/></svg>
          Limpiar filtros
        </button>
      </section>

      <section className="shiny-inv-final-kpis">
        <article>
          <span className="kpi-icon purple">
            <svg viewBox="0 0 24 24"><path d="M15 7.5c0-1.4-1.3-2.5-3-2.5S9 6.1 9 7.5s1 2 3 2.5 3 1.2 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5M12 3v14"/></svg>
          </span>
          <div><small>Valor de inventario</small><strong className="purple-text">{shinyFinalMoney(shinyFinalDashboard.totalValue)}</strong><span>MXN</span><em>↑ Inventario visible</em></div>
        </article>

        <article>
          <span className="kpi-icon blue">
            <svg viewBox="0 0 24 24"><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/></svg>
          </span>
          <div><small>Unidades totales</small><strong className="blue-text">{Number(summary.units||0).toLocaleString('es-MX')}</strong><span>cartas</span><em>↑ Existencia total</em></div>
        </article>

        <article>
          <span className="kpi-icon green">
            <svg viewBox="0 0 24 24"><path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/></svg>
          </span>
          <div><small>SKUs únicos</small><strong className="green-text">{shinyFinalDashboard.skuCount.toLocaleString('es-MX')}</strong><span>SKUs</span><em>↑ Página actual</em></div>
        </article>

        <article>
          <span className="kpi-icon orange">
            <svg viewBox="0 0 24 24"><path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>
          </span>
          <div><small>Stock bajo</small><strong className="orange-text">{Number(summary.low_stock||0).toLocaleString('es-MX')}</strong><span>cartas</span><em className="warning">• Atención requerida</em></div>
        </article>
      </section>

      {message ? <div className="message shiny-inv-final-message">{message}</div> : null}

      <nav className="shiny-inv-final-tabs">
        <button className={tab==='inventory'?'active':''} onClick={()=>setTab('inventory')}>
          <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M8 11h3m2 0h3"/></svg>
          Inventario
        </button>
        <button className={tab==='movements'?'active':''} onClick={()=>setTab('movements')}>
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>
          Movimientos
        </button>
        <button className={tab==='transfers'?'active':''} onClick={()=>setTab('transfers')}>
          <svg viewBox="0 0 24 24"><path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3"/></svg>
          Transferencias
        </button>
      </nav>

      {tab === 'inventory' ? <>
        <section className="shiny-inv-final-panels">

          <article className="shiny-inv-final-panel">
            <div className="panel-head"><h3>Por TCG</h3></div>
            <div className="tcg-bars">
              {shinyFinalDashboard.byGame.length ? shinyFinalDashboard.byGame.map((item,index)=>{
                const classes=['purple','blue','green','orange','pink'];
                return <div className="tcg-row" key={item.label}>
                  <span className={`tcg-logo ${classes[index%classes.length]}`}>{String(item.label).slice(0,1).toUpperCase()}</span>
                  <strong>{item.label}</strong>
                  <span className="bar-track"><i className={classes[index%classes.length]} style={{width:`${Math.max(4,item.percent)}%`}} /></span>
                  <b>{item.percent}%</b>
                  <em>{shinyFinalMoney(item.value)}</em>
                </div>;
              }) : <div className="empty">Sin información para mostrar.</div>}
            </div>
            <button type="button" className="panel-link" onClick={()=>setGmxGameFilter('')}>Ver todos los TCG <span>›</span></button>
          </article>

          <article className="shiny-inv-final-panel">
            <div className="panel-head"><h3>Top 5 por valor</h3></div>
            <div className="top-list">
              {shinyFinalDashboard.top.length ? shinyFinalDashboard.top.map((item,index)=>
                <button type="button" key={item.row_id||`${item.sku}-${index}`} onClick={()=>setAdjustItem(item)}>
                  {item.imagen_url||item.imagen?<img src={item.imagen_url||item.imagen} alt="" />:<span className="mini-thumb">◇</span>}
                  <div className="top-name"><strong>{item.producto||item.id_producto}</strong><small>{item.expansion||item.set_nombre||item.edicion||item.categoria||'—'}</small></div>
                  <span className={`rarity ${String(item.rareza||'').toLowerCase().includes('secret')?'secret':'ultra'}`}>{item.rareza||'Ultra'}</span>
                  <small>{Number(item.stock||0)} unid.</small>
                  <b>{shinyFinalMoney(item._value)}</b>
                </button>
              ) : <div className="empty">Sin información para mostrar.</div>}
            </div>
            <button type="button" className="panel-link">Ver todas las cartas <span>›</span></button>
          </article>

          <article className="shiny-inv-final-panel low-stock-panel">
            <div className="panel-head"><h3>Stock bajo <span>(Atención requerida)</span></h3></div>
            <div className="low-list">
              {shinyFinalDashboard.low.length ? shinyFinalDashboard.low.map((item,index)=>
                <button type="button" key={item.row_id||`${item.sku}-${index}`} onClick={()=>setAdjustItem(item)}>
                  {item.imagen_url||item.imagen?<img src={item.imagen_url||item.imagen} alt="" />:<span className="mini-thumb">◇</span>}
                  <strong>{item.producto||item.id_producto}</strong>
                  <span>{Number(item.stock||0)} {Number(item.stock||0)===1?'unidad':'unidades'}</span>
                </button>
              ) : <div className="empty">Sin productos con stock bajo.</div>}
            </div>
            <button type="button" className="panel-link orange-link" onClick={()=>setStockStatus('low')}>Ver todos los de stock bajo <span>›</span></button>
          </article>

        </section>

        <section className="shiny-inv-final-table-card">
          <div className="table-head">
            <h3>Inventario</h3>
            <div><span>Mostrar</span><select disabled><option>50</option></select><span>registros</span></div>
          </div>

          <div className="table-wrap-final">
            <table>
              <thead><tr><th>Carta</th><th>Expansión</th><th>Rareza</th><th>Condición</th><th>Idioma</th><th>SKU</th><th>Unidades</th><th>Valor Unit.</th><th>Valor Total</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {shinyFinalDashboard.rows.map((item)=>{
                  const stock=Number(item.stock||0);
                  const min=Number(item.stock_minimo||0);
                  const state=stock===0?'out':stock<=min?'low':'ok';
                  const rarity=String(item.rareza||'').toLowerCase().includes('secret')?'secret':'ultra';
                  return <tr key={item.row_id}>
                    <td><div className="product-cell">{item.imagen_url||item.imagen?<img src={item.imagen_url||item.imagen} alt="" />:<span className="mini-thumb">◇</span>}<strong>{item.producto||item.id_producto}</strong></div></td>
                    <td>{item.expansion||item.set_nombre||item.edicion||'—'}</td>
                    <td><span className={`rarity ${rarity}`}>{item.rareza||'—'}</span></td>
                    <td>{item.condicion||'—'}</td>
                    <td>{item.idioma||'—'}</td>
                    <td>{item.sku||'—'}</td>
                    <td>{stock}</td>
                    <td>{shinyFinalMoney(item.precio)}</td>
                    <td>{shinyFinalMoney(stock*Number(item.precio||0))}</td>
                    <td><span className={`status-dot ${state}`} /></td>
                    <td><div className="row-actions">
                      <button type="button" className="edit" onClick={()=>setAdjustItem(item)}>
                        <svg viewBox="0 0 24 24"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></svg>
                      </button>
                      <button type="button" className="transfer" onClick={openTransfer}>
                        <svg viewBox="0 0 24 24"><path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3"/></svg>
                      </button>
                    </div></td>
                  </tr>;
                })}
                {!loading&&!shinyFinalDashboard.rows.length?<tr><td colSpan="11" className="empty">No hay inventario que coincida con los filtros.</td></tr>:null}
              </tbody>
            </table>
          </div>

          <footer className="shiny-inv-final-pagination">
            <span>{shinyFinalDashboard.rows.length ? `${((page-1)*PAGE_SIZE)+1} a ${Math.min(page*PAGE_SIZE,total)} de ${total.toLocaleString('es-MX')} resultados` : `0 de ${total.toLocaleString('es-MX')} resultados`}</span>
            <div>
              <button disabled={page<=1||loading} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button>
              <button className="active">{page}</button>
              {page<pageCount?<button onClick={()=>setPage(Math.min(pageCount,page+1))}>{page+1}</button>:null}
              {page+1<pageCount?<button onClick={()=>setPage(Math.min(pageCount,page+2))}>{page+2}</button>:null}
              {page+2<pageCount?<span>…</span>:null}
              {page+2<pageCount?<button onClick={()=>setPage(pageCount)}>{pageCount}</button>:null}
              <button disabled={page>=pageCount||loading} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>›</button>
            </div>
          </footer>
        </section>
      </> : null}

      {tab === 'movements' ? <>
        <section className="shiny-inv-final-subfilters">
          <label className="wide"><span>Buscar movimientos</span><input type="search" value={movementSearch} onChange={(e)=>setMovementSearch(e.target.value)} placeholder="Producto, SKU, referencia, motivo, usuario…" /></label>
          <label><span>Sucursal</span><select value={movementBranchId} onChange={(e)=>setMovementBranchId(e.target.value)}><option value="">Todas</option>{branches.map(b=><option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
          <label><span>Tipo</span><select value={movementType} onChange={(e)=>setMovementType(e.target.value)}><option value="">Todos</option>{movementTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
          <label><span>Desde</span><input type="date" value={movementDateFrom} onChange={(e)=>setMovementDateFrom(e.target.value)} /></label>
          <label><span>Hasta</span><input type="date" value={movementDateTo} onChange={(e)=>setMovementDateTo(e.target.value)} /></label>
        </section>
        <section className="shiny-inv-final-table-card subtable">
          <div className="table-head"><h3>Movimientos</h3><span>{filteredMovements.length.toLocaleString('es-MX')} registros</span></div>
          <div className="table-wrap-final"><table><thead><tr><th>Fecha</th><th>Sucursal</th><th>Producto / SKU</th><th>Tipo</th><th>Cantidad</th><th>Anterior</th><th>Nuevo</th><th>Motivo</th><th>Usuario</th><th>Referencia</th></tr></thead><tbody>
            {filteredMovements.map(m=><tr key={m.row_id}><td>{m.fecha?new Date(m.fecha).toLocaleString('es-MX'):'—'}</td><td>{m.sucursal||m.id_sucursal||'—'}</td><td><strong>{m.producto||m.id_producto||'—'}</strong></td><td>{m.tipo||'—'}</td><td>{m.cantidad??'—'}</td><td>{m.stock_anterior??'—'}</td><td>{m.stock_nuevo??'—'}</td><td>{m.motivo||'—'}</td><td>{m.nombre_usuario||m.usuario||'—'}</td><td>{m.referencia||'—'}</td></tr>)}
          </tbody></table></div>
        </section>
      </> : null}

      {tab === 'transfers' ? <>
        <section className="shiny-inv-final-subfilters">
          <label className="wide"><span>Buscar transferencias</span><input type="search" value={transferSearch} onChange={(e)=>setTransferSearch(e.target.value)} placeholder="ID, origen, destino, motivo, usuario…" /></label>
          <label><span>Origen</span><select value={transferOriginId} onChange={(e)=>setTransferOriginId(e.target.value)}><option value="">Todos</option>{branches.map(b=><option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
          <label><span>Destino</span><select value={transferDestinationId} onChange={(e)=>setTransferDestinationId(e.target.value)}><option value="">Todos</option>{branches.map(b=><option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
          <label><span>Estado</span><select value={transferStatus} onChange={(e)=>setTransferStatus(e.target.value)}><option value="">Todos</option>{transferStatuses.map(status=><option key={status} value={status}>{status}</option>)}</select></label>
        </section>
        <section className="shiny-inv-final-table-card subtable">
          <div className="table-head"><h3>Transferencias</h3><span>{filteredTransfers.length.toLocaleString('es-MX')} registros</span></div>
          <div className="table-wrap-final"><table><thead><tr><th>Fecha</th><th>ID</th><th>Origen</th><th>Destino</th><th>Unidades</th><th>Estado</th><th>Motivo</th><th>Administrador</th><th>Referencia</th></tr></thead><tbody>
            {filteredTransfers.map(t=><tr key={t.row_id}><td>{t.fecha?new Date(t.fecha).toLocaleString('es-MX'):'—'}</td><td><strong>{t.id_transferencia||'—'}</strong></td><td>{t.origen||t.id_origen||'—'}</td><td>{t.destino||t.id_destino||'—'}</td><td>{t.total_unidades??'—'}</td><td>{t.estado||'—'}</td><td>{t.motivo||'—'}</td><td>{t.nombre_admin||t.email_admin||'—'}</td><td>{t.referencia_externa||'—'}</td></tr>)}
          </tbody></table></div>
        </section>
      </> : null}

      <VisionScannerModal open={visionOpen} title="Reconocer producto para inventario" onClose={()=>setVisionOpen(false)} onResult={handleVisionInventoryResult} />
      <VisionCandidatePicker open={visionPickerOpen} title="Producto encontrado" subtitle={brandText("Selecciona el producto; después se abrirá el ajuste de inventario para confirmar cantidad.")} items={visionCandidates} onClose={()=>setVisionPickerOpen(false)} onPick={pickVisionInventoryProduct} />
    </section>
    <InventoryAdjustModal open={Boolean(adjustItem)} item={adjustItem} onClose={() => setAdjustItem(null)} onSave={saveAdjustment} />
    <TransferModal open={transferOpen} branches={branches} products={products} onClose={() => setTransferOpen(false)} onSave={saveTransfer} />
  </div>;
}
