import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import BranchModal from '../components/BranchModal.jsx';
import '../phase_shiny_exact_views_r23.css';
import './BranchesOption3.css';

const SALES_PERIOD_DAYS = 30;

const money = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN'
});

const number = (value) => Number(value || 0).toLocaleString('es-MX');

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function BranchIcon({ name }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  };

  if (name === 'active') {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>;
  }
  if (name === 'inventory') {
    return <svg {...common}><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8M12 13v8"/></svg>;
  }
  if (name === 'sales') {
    return <svg {...common}><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-7"/></svg>;
  }
  if (name === 'search') {
    return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  }
  if (name === 'location') {
    return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
  }
  if (name === 'phone') {
    return <svg {...common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z"/></svg>;
  }
  if (name === 'eye') {
    return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>;
  }
  if (name === 'edit') {
    return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>;
  }
  if (name === 'calendar') {
    return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>;
  }
  return <svg {...common}><path d="M3 10h18M5 10v10h14V10M4 4h16l2 6H2l2-6ZM9 14h6v6"/></svg>;
}

function SalesSparkline({ values = [] }) {
  const safe = values.length ? values.map((value) => Math.max(0, Number(value || 0))) : [0];
  const max = Math.max(1, ...safe);
  const width = 230;
  const height = 48;
  const points = safe.map((value, index) => {
    const x = safe.length === 1 ? width / 2 : index / (safe.length - 1) * width;
    const y = height - 5 - value / max * 36;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = [`0,${height}`, ...points, `${width},${height}`].join(' ');
  const lastPoint = points.at(-1).split(',');

  return <svg className="suc3-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Ventas diarias de los últimos 30 días">
    <polygon points={area} />
    <polyline points={points.join(' ')} />
    {safe.some(Boolean) ? <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3" /> : null}
  </svg>;
}

function ComparisonBars({ rows, field, color, format = number }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[field] || 0)));
  return <div className="suc3-comparison-bars">
    {rows.map((row) => {
      const value = Number(row[field] || 0);
      return <div className="suc3-comparison-row" key={`${field}-${row.key}`}>
        <span title={row.label}>{row.label}</span>
        <i><b style={{ width: `${value / max * 100}%`, background: color }} /></i>
        <strong>{format(value)}</strong>
      </div>;
    })}
    {!rows.length ? <div className="suc3-empty-comparison">Sin información disponible.</div> : null}
  </div>;
}

export default function BranchesPage() {
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('Shiny_AUTH_USER') || '{}');
    } catch {
      return {};
    }
  }, []);

  const isSuperadmin = String(currentUser.rol || '').toUpperCase() === 'SUPERADMIN';
  const [branches, setBranches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [detailsBranchId, setDetailsBranchId] = useState(null);
  const [metrics, setMetrics] = useState({ inventory: {}, sales: {}, salesSeries: {} });

  async function load() {
    const [body, inventoryBody, ordersBody] = await Promise.all([
      api('/api/v1/branches?includeInactive=true'),
      api('/api/v1/inventory?limit=1000').catch(() => ({ data: [] })),
      api('/api/v1/orders?limit=1000').catch(() => ({ data: [] }))
    ]);

    setBranches(body.data || []);

    const inventoryByBranch = {};
    (inventoryBody.data || []).forEach((row) => {
      const key = String(row.id_sucursal || row.sucursal || row.nombre_sucursal || '');
      if (!key) return;
      inventoryByBranch[key] = (inventoryByBranch[key] || 0) + Number(row.stock ?? row.existencia ?? row.cantidad ?? 0);
    });

    const periodDays = Array.from({ length: SALES_PERIOD_DAYS }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (SALES_PERIOD_DAYS - 1 - index));
      return dayKey(date);
    });
    const periodIndex = new Map(periodDays.map((key, index) => [key, index]));
    const salesByBranch = {};
    const salesSeriesByBranch = {};

    (ordersBody.data || []).forEach((row) => {
      if (String(row.estado || row.estado_pedido || '').toUpperCase().includes('CANCEL')) return;

      const key = String(row.id_sucursal || row.sucursal || row.nombre_sucursal || '');
      const orderDay = dayKey(row.fecha || row.created_at || row.fecha_creacion);
      const seriesIndex = periodIndex.get(orderDay);
      if (!key || seriesIndex === undefined) return;

      const total = Number(row.total || 0);
      salesByBranch[key] = (salesByBranch[key] || 0) + total;
      salesSeriesByBranch[key] ||= Array(SALES_PERIOD_DAYS).fill(0);
      salesSeriesByBranch[key][seriesIndex] += total;
    });

    setMetrics({ inventory: inventoryByBranch, sales: salesByBranch, salesSeries: salesSeriesByBranch });
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  function newBranch() {
    if (!isSuperadmin) return;
    setSelected(null);
    setOpen(true);
  }

  async function edit(rowId) {
    if (!isSuperadmin) return;
    try {
      const body = await api(`/api/v1/branches/${rowId}`);
      setSelected(body.data);
      setOpen(true);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function setBranchActive(branch, active) {
    if (!isSuperadmin) return;

    const action = active ? 'Reactivar' : 'Deshabilitar';
    const question = active
      ? `¿Reactivar ${branch.nombre_sucursal || 'esta sucursal'}? Volverá a estar disponible para nuevas operaciones.`
      : `¿Deshabilitar ${branch.nombre_sucursal || 'esta sucursal'}? El stock, movimientos e historial se conservarán.`;
    const ok = await window.tcg_store_templateConfirm?.(question, { title: `${action} sucursal`, confirmText: action });
    if (ok === false) return;

    try {
      if (active) {
        await api(`/api/v1/branches/${branch.row_id}/reactivate`, { method: 'PATCH' });
        setMessage('Sucursal reactivada.');
      } else {
        await api(`/api/v1/branches/${branch.row_id}`, { method: 'DELETE' });
        setMessage('Sucursal deshabilitada. El historial y stock se conservaron.');
      }
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function save(form) {
    if (!isSuperadmin) {
      setMessage('Solo SUPERADMIN puede modificar sucursales.');
      return;
    }

    try {
      if (selected) {
        await api(`/api/v1/branches/${selected.row_id}`, { method: 'PUT', body: JSON.stringify(form) });
        setMessage('Sucursal actualizada.');
      } else {
        await api('/api/v1/branches', { method: 'POST', body: JSON.stringify(form) });
        setMessage('Sucursal creada.');
      }
      setOpen(false);
      await load();
    } catch (error) {
      setMessage(error.message);
      throw error;
    }
  }

  const activeBranches = branches.filter((branch) => branch.activa !== false).length;
  const cities = useMemo(() => Array.from(new Set(branches.map((branch) => branch.ciudad).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [branches]);

  const branchMetricRows = branches.map((branch) => {
    const keys = Array.from(new Set([branch.id_sucursal, branch.nombre_sucursal, branch.codigo].filter(Boolean).map(String)));
    const findValue = (source) => keys.reduce((total, key) => total + Number(source?.[key] || 0), 0);
    const salesSeries = Array(SALES_PERIOD_DAYS).fill(0);
    keys.forEach((key) => {
      (metrics.salesSeries?.[key] || []).forEach((value, index) => {
        salesSeries[index] += Number(value || 0);
      });
    });
    return {
      key: branch.row_id,
      label: branch.nombre_sucursal || branch.codigo || 'Sucursal',
      inventory: findValue(metrics.inventory),
      sales: findValue(metrics.sales),
      salesSeries
    };
  });

  const metricByBranchId = new Map(branchMetricRows.map((row) => [row.key, row]));
  const totalInventory = branchMetricRows.reduce((total, row) => total + row.inventory, 0);
  const totalSales = branchMetricRows.reduce((total, row) => total + row.sales, 0);
  const normalizedQuery = normalize(query);
  const visibleBranches = branches.filter((branch) => {
    const matchesCity = !cityFilter || branch.ciudad === cityFilter;
    const searchSource = normalize([
      branch.nombre_sucursal,
      branch.id_sucursal,
      branch.codigo,
      branch.direccion,
      branch.ciudad,
      branch.estado,
      branch.cp
    ].filter(Boolean).join(' '));
    return matchesCity && (!normalizedQuery || searchSource.includes(normalizedQuery));
  });

  return (
    <div className="branches-page admin-stack suc3-page">
      <header className="suc3-toolbar">
        <div className="suc3-title-block">
          <div className="suc3-eyebrow">OPERACIÓN · MULTISUCURSAL</div>
          <h2>Directorio de sucursales</h2>
          <p>{branches.length} sucursales registradas</p>
        </div>

        <div className="suc3-toolbar-actions">
          <label className="suc3-search">
            <BranchIcon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar sucursal..." aria-label="Buscar sucursal" />
          </label>
          <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} aria-label="Filtrar por ciudad">
            <option value="">Todas las ciudades</option>
            {cities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          {isSuperadmin ? <button className="suc3-primary" type="button" onClick={newBranch}><span>＋</span>Nueva sucursal</button> : null}
        </div>
      </header>

      {message ? <div className="suc3-message" role="status">{message}</div> : null}

      <section className="suc3-kpis" aria-label="Resumen de sucursales">
        <article><i><BranchIcon name="store" /></i><div><span>Total sucursales</span><strong>{number(branches.length)}</strong></div></article>
        <article><i className="green"><BranchIcon name="active" /></i><div><span>Sucursales activas</span><strong>{number(activeBranches)}</strong></div></article>
        <article><i><BranchIcon name="inventory" /></i><div><span>Inventario total</span><strong>{number(totalInventory)}</strong></div></article>
        <article><i className="green"><BranchIcon name="sales" /></i><div><span>Ventas · 30 días</span><strong>{money(totalSales)} <small>MXN</small></strong></div></article>
      </section>

      <section className="suc3-card-grid" aria-label="Sucursales">
        {visibleBranches.map((branch) => {
          const branchMetrics = metricByBranchId.get(branch.row_id) || { inventory: 0, sales: 0, salesSeries: [] };
          const detailsOpen = detailsBranchId === branch.row_id;
          const location = [branch.ciudad, branch.estado, branch.cp].filter(Boolean).join(' · ') || 'Ubicación pendiente';
          const contact = branch.telefono || branch.email || 'Sin contacto';

          return <article className={`suc3-branch-card ${branch.activa === false ? 'inactive' : ''}`} key={branch.row_id}>
            <div className="suc3-card-heading">
              <div className="suc3-branch-identity">
                <i><BranchIcon name="store" /></i>
                <div><h3>{branch.nombre_sucursal || 'Sin nombre'}</h3><p>{branch.id_sucursal || 'Sin ID'} · {branch.codigo || 'Sin código'}</p></div>
              </div>
              <span className={`suc3-status ${branch.activa !== false ? 'active' : ''}`}>{branch.activa !== false ? 'Activa' : 'Inactiva'}</span>
            </div>

            <div className="suc3-contact-lines">
              <span><BranchIcon name="location" />{location}</span>
              <span><BranchIcon name="phone" />{contact}</span>
            </div>

            <div className="suc3-card-metrics">
              <div className="suc3-inventory-metric"><span>Inventario</span><strong>{number(branchMetrics.inventory)}</strong><small>unidades</small></div>
              <div className="suc3-sales-metric">
                <div><span>Ventas · 30 días</span><strong>{money(branchMetrics.sales)} <small>MXN</small></strong></div>
                <SalesSparkline values={branchMetrics.salesSeries} />
              </div>
            </div>

            {detailsOpen ? <div className="suc3-details" role="region" aria-label={`Detalle de ${branch.nombre_sucursal || 'sucursal'}`}>
              <div><span>Dirección</span><strong>{branch.direccion || 'Sin dirección configurada'}</strong></div>
              <div><span>Correo</span><strong>{branch.email || 'Sin correo configurado'}</strong></div>
              <div><span>Municipio</span><strong>{branch.municipio || branch.ciudad || 'Sin municipio configurado'}</strong></div>
            </div> : null}

            <div className="suc3-card-actions">
              <button className="suc3-action" type="button" onClick={() => setDetailsBranchId(detailsOpen ? null : branch.row_id)} aria-expanded={detailsOpen}><BranchIcon name="eye" />{detailsOpen ? 'Ocultar detalle' : 'Ver detalle'}</button>
              {isSuperadmin ? <button className="suc3-action" type="button" onClick={() => edit(branch.row_id)}><BranchIcon name="edit" />Editar</button> : null}
              {isSuperadmin ? <details className="suc3-more">
                <summary aria-label="Más acciones">•••</summary>
                <div><button type="button" onClick={() => setBranchActive(branch, branch.activa === false)}>{branch.activa === false ? 'Reactivar' : 'Deshabilitar'}</button></div>
              </details> : null}
            </div>
          </article>;
        })}

        {!visibleBranches.length ? <div className="suc3-empty-state">No hay sucursales que coincidan con la búsqueda.</div> : null}
      </section>

      <section className="suc3-comparison" aria-label="Comparativo de sucursales">
        <div className="suc3-comparison-heading">
          <h3>Comparativo de sucursales</h3>
          <span><BranchIcon name="calendar" />Últimos 30 días⌄</span>
        </div>
        <div className="suc3-comparison-grid">
          <article><h4>Inventario</h4><ComparisonBars rows={branchMetricRows} field="inventory" color="#173f7a" /></article>
          <article><h4>Ventas</h4><ComparisonBars rows={branchMetricRows} field="sales" color="#12a866" format={money} /></article>
        </div>
      </section>

      {isSuperadmin ? <BranchModal open={open} branch={selected} onClose={() => setOpen(false)} onSave={save} /> : null}
    </div>
  );
}
