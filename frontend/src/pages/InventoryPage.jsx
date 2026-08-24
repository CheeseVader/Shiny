import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import InventoryAdjustModal from '../components/InventoryAdjustModal.jsx';
import TransferModal from '../components/TransferModal.jsx';

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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  function filePayload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, mime: file.type, data: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function downloadEntryTemplate() {
    try {
      const token = localStorage.getItem('GMX_AUTH_TOKEN') || '';
      const response = await fetch('/api/v1/inventory/entry-template.xlsx', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      if (!response.ok) throw new Error('No fue posible generar la plantilla de inventario.');
      const blob = await response.blob(), url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Plantilla_Entradas_Inventario.xlsx';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setMessage(e.message); }
  }

  async function importInventoryEntries(file) {
    if (!file) return;
    setBulkBusy(true); setBulkResult(null); setMessage('');
    try {
      const payload = await filePayload(file);
      const response = await api('/api/v1/inventory/import-entries', {
        method: 'POST', body: JSON.stringify({ file: payload })
      });
      const result = response.data || {};
      setBulkResult(result);
      setMessage(`Entrada masiva: ${Number(result.updated || 0)} fila(s) aplicadas y ${(result.errors || []).length} rechazada(s).`);
      await refresh();
    } catch (e) {
      setMessage(e.message === 'IMPORT_FILE_ALREADY_PROCESSED' ? 'Este mismo archivo ya fue procesado. No se volvió a sumar el inventario.' : e.message);
    } finally { setBulkBusy(false); }
  }

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

  return <div className="inventory-stack">
    <section className="inventory-summary inventory-summary-smart">
      <article><span>Registros encontrados</span><strong>{Number(summary.records || 0).toLocaleString('es-MX')}</strong></article>
      <article><span>Unidades</span><strong>{Number(summary.units || 0).toLocaleString('es-MX')}</strong></article>
      <article><span>Stock bajo</span><strong>{Number(summary.low_stock || 0).toLocaleString('es-MX')}</strong></article>
      <article><span>Sin stock</span><strong>{Number(summary.out_of_stock || 0).toLocaleString('es-MX')}</strong></article>
    </section>

    <section className="content-card">
      <div className="section-head inventory-head">
        <div>
          <div className="eyebrow">INVENTARIO MULTISUCURSAL</div>
          <h2>Control operativo</h2>
          <p className="section-copy">{loading ? 'Buscando…' : `${total.toLocaleString('es-MX')} resultado(s)`}</p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={downloadEntryTemplate}>Descargar plantilla de entradas</button>
          <label className="secondary file-inline">{bulkBusy ? 'Importando…' : 'Importar entradas'}
            <input type="file" accept=".xlsx,.xls" disabled={bulkBusy} onChange={(e) => {
              const file = e.target.files?.[0]; e.target.value = ''; importInventoryEntries(file);
            }} />
          </label>
          <button className="secondary" onClick={openTransfer}>Nueva transferencia</button>
        </div>
      </div>

      {tab === 'inventory' ? <div className="inventory-search-panel">
        <label className="inventory-search-main">Buscar
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, SKU, ID, código de barras o categoría…"
            autoComplete="off"
            aria-label="Buscar inventario" />
          
          <small>Búsqueda automática. No necesitas conocer el SKU exacto.</small>
        </label>

        <label>Sucursal
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas</option>
            {branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>

        <label>Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.total})</option>)}
          </select>
        </label>

        <label>Existencia
          <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
            <option value="all">Cualquier stock</option>
            <option value="available">Con existencia</option>
            <option value="low">Stock bajo</option>
            <option value="out">Sin stock</option>
          </select>
        </label>

        <label>Producto
          <select value={productStatus} onChange={(e) => setProductStatus(e.target.value)}>
            <option value="">Cualquier estado</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </label>

        <label>Ordenar
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Nombre</option>
            <option value="sku">SKU</option>
            <option value="stock">Stock</option>
            <option value="price">Precio</option>
            <option value="updated">Actualización</option>
            <option value="branch">Sucursal</option>
          </select>
        </label>

        <label>Dirección
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </select>
        </label>

        <button type="button" className="secondary inventory-clear" onClick={() => {
          setSearch('');setBranchId('');setCategory('');setStockStatus('all');setProductStatus('');setSort('name');setDirection('asc');
        }}>Limpiar filtros</button>
      </div> : null}

      {message ? <div className="message">{message}</div> : null}
      {bulkResult?.errors?.length ? <div className="product-import-errors">
        <div className="section-head"><div><strong>Filas no aplicadas</strong><p>{bulkResult.errors.length} error(es). Las filas válidas sí fueron sumadas.</p></div><button className="secondary compact" onClick={() => setBulkResult(null)}>Cerrar</button></div>
        <div className="table-wrap"><table><thead><tr><th>Fila</th><th>SKU</th><th>Motivo</th></tr></thead><tbody>
          {bulkResult.errors.map((e, i) => <tr key={`${e.row}-${i}`}><td>{e.row}</td><td>{e.sku || '—'}</td><td><code>{e.error}</code></td></tr>)}
        </tbody></table></div>
      </div> : null}

      <div className="tabs">
        <button className={tab === 'inventory' ? 'tab active' : 'tab'} onClick={() => setTab('inventory')}>Inventario</button>
        <button className={tab === 'movements' ? 'tab active' : 'tab'} onClick={() => setTab('movements')}>Movimientos</button>
        <button className={tab === 'transfers' ? 'tab active' : 'tab'} onClick={() => setTab('transfers')}>Transferencias</button>
      </div>

      {tab === 'movements' ? <div className="inventory-search-panel">
        <label className="inventory-search-main">Buscar movimientos
          <input
            type="search"
            value={movementSearch}
            onChange={(e) => setMovementSearch(e.target.value)}
            placeholder="Producto, SKU, referencia, motivo, usuario…"
            autoComplete="off"
            aria-label="Buscar movimientos de inventario" />
          
          <small>Búsqueda automática por palabras. Los espacios están permitidos.</small>
        </label>

        <label>Sucursal
          <select value={movementBranchId} onChange={(e) => setMovementBranchId(e.target.value)}>
            <option value="">Todas</option>
            {branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>

        <label>Tipo
          <select value={movementType} onChange={(e) => setMovementType(e.target.value)}>
            <option value="">Todos</option>
            {movementTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>

        <label>Desde
          <input type="date" value={movementDateFrom} onChange={(e) => setMovementDateFrom(e.target.value)} />
        </label>

        <label>Hasta
          <input type="date" value={movementDateTo} onChange={(e) => setMovementDateTo(e.target.value)} />
        </label>

        <button
          type="button"
          className="secondary inventory-clear"
          onClick={() => {
            setMovementSearch('');
            setMovementBranchId('');
            setMovementType('');
            setMovementDateFrom('');
            setMovementDateTo('');
          }}>
          
          Limpiar filtros
        </button>
      </div> : null}

      {tab === 'transfers' ? <div className="inventory-search-panel">
        <label className="inventory-search-main">Buscar transferencias
          <input
            type="search"
            value={transferSearch}
            onChange={(e) => setTransferSearch(e.target.value)}
            placeholder="ID, origen, destino, motivo, usuario, referencia…"
            autoComplete="off"
            aria-label="Buscar transferencias de inventario" />
          
          <small>Búsqueda automática por palabras. Los espacios están permitidos.</small>
        </label>

        <label>Origen
          <select value={transferOriginId} onChange={(e) => setTransferOriginId(e.target.value)}>
            <option value="">Todos</option>
            {branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>

        <label>Destino
          <select value={transferDestinationId} onChange={(e) => setTransferDestinationId(e.target.value)}>
            <option value="">Todos</option>
            {branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>

        <label>Estado
          <select value={transferStatus} onChange={(e) => setTransferStatus(e.target.value)}>
            <option value="">Todos</option>
            {transferStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>

        <label>Desde
          <input type="date" value={transferDateFrom} onChange={(e) => setTransferDateFrom(e.target.value)} />
        </label>

        <label>Hasta
          <input type="date" value={transferDateTo} onChange={(e) => setTransferDateTo(e.target.value)} />
        </label>

        <button
          type="button"
          className="secondary inventory-clear"
          onClick={() => {
            setTransferSearch('');
            setTransferOriginId('');
            setTransferDestinationId('');
            setTransferStatus('');
            setTransferDateFrom('');
            setTransferDateTo('');
          }}>
          
          Limpiar filtros
        </button>
      </div> : null}

      {tab === 'inventory' ? <>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Sucursal</th><th>ID</th><th>SKU</th><th>Código barras</th><th>Producto</th><th>Categoría</th>
              <th>Stock</th><th>Mínimo</th><th>Precio</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              {inventory.map((item) => {
                const stock = Number(item.stock || 0),min = Number(item.stock_minimo || 0);
                const state = stock === 0 ? 'out' : stock <= min ? 'warning' : 'ready';
                const label = stock === 0 ? 'Sin stock' : stock <= min ? 'Bajo' : 'OK';
                return <tr key={item.row_id}>
                  <td>{item.sucursal || item.id_sucursal}</td>
                  <td><small>{item.id_producto || '—'}</small></td>
                  <td>{item.sku || '—'}</td>
                  <td>{item.codigo_barras || '—'}</td>
                  <td><strong>{item.producto || item.id_producto}</strong></td>
                  <td>{item.categoria || '—'}</td>
                  <td>{stock}</td>
                  <td>{min}</td>
                  <td>{item.precio != null ? Number(item.precio).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—'}</td>
                  <td><span className={`module-state ${state}`}>{label}</span></td>
                  <td><button className="secondary compact" onClick={() => setAdjustItem(item)}>Ajustar</button></td>
                </tr>;
              })}
              {!loading && !inventory.length ? <tr><td colSpan="11" className="empty">No hay inventario que coincida con los filtros.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="inventory-pagination">
          <span>Página {page} de {pageCount}</span>
          <div>
            <button className="secondary compact" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
            <button className="secondary compact" disabled={page >= pageCount || loading} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Siguiente</button>
          </div>
        </div>
      </> : null}

      {tab === 'movements' ? <>
        <div className="section-head compact" style={{ marginTop: 12 }}>
          <div>
            <div className="eyebrow">TRAZABILIDAD</div>
            <h3>Movimientos de inventario</h3>
            <p className="section-copy">
              {filteredMovements.length.toLocaleString('es-MX')} de {movements.length.toLocaleString('es-MX')} movimiento(s)
            </p>
          </div>
        </div>

        <div className="table-wrap"><table>
          <thead><tr>
            <th>Fecha</th>
            <th>Sucursal</th>
            <th>Producto / SKU</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Anterior</th>
            <th>Nuevo</th>
            <th>Motivo</th>
            <th>Usuario</th>
            <th>Referencia</th>
          </tr></thead>
          <tbody>
            {filteredMovements.map((m) => <tr key={m.row_id}>
              <td>{m.fecha ? new Date(m.fecha).toLocaleString('es-MX') : '—'}</td>
              <td>{m.sucursal || m.id_sucursal || '—'}</td>
              <td>
                <strong>{m.producto || m.id_producto || '—'}</strong>
                <small style={{ display: 'block' }}>{m.sku || m.id_producto || '—'}</small>
              </td>
              <td>{m.tipo || '—'}</td>
              <td>{m.cantidad ?? '—'}</td>
              <td>{m.stock_anterior ?? '—'}</td>
              <td>{m.stock_nuevo ?? '—'}</td>
              <td>{m.motivo || '—'}</td>
              <td>
                <strong>{m.nombre_usuario || '—'}</strong>
                <small style={{ display: 'block' }}>{m.usuario || '—'}</small>
              </td>
              <td>{m.referencia || '—'}</td>
            </tr>)}
            {!filteredMovements.length ? <tr>
              <td colSpan="10" className="empty">No hay movimientos que coincidan con los filtros.</td>
            </tr> : null}
          </tbody>
        </table></div>
      </> : null}

      {tab === 'transfers' ? <>
        <div className="section-head compact" style={{ marginTop: 12 }}>
          <div>
            <div className="eyebrow">TRAZABILIDAD</div>
            <h3>Transferencias de inventario</h3>
            <p className="section-copy">
              {filteredTransfers.length.toLocaleString('es-MX')} de {transfers.length.toLocaleString('es-MX')} transferencia(s)
            </p>
          </div>
        </div>

        <div className="table-wrap"><table>
          <thead><tr>
            <th>Fecha</th>
            <th>ID</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Unidades</th>
            <th>Estado</th>
            <th>Motivo</th>
            <th>Administrador</th>
            <th>Referencia externa</th>
          </tr></thead>
          <tbody>
            {filteredTransfers.map((t) => <tr key={t.row_id}>
              <td>{t.fecha ? new Date(t.fecha).toLocaleString('es-MX') : '—'}</td>
              <td><strong>{t.id_transferencia || '—'}</strong></td>
              <td>{t.origen || t.id_origen || '—'}</td>
              <td>{t.destino || t.id_destino || '—'}</td>
              <td>{t.total_unidades ?? '—'}</td>
              <td>{t.estado || '—'}</td>
              <td>{t.motivo || '—'}</td>
              <td>
                <strong>{t.nombre_admin || '—'}</strong>
                <small style={{ display: 'block' }}>{t.email_admin || '—'}</small>
                {t.id_admin ? <small style={{ display: 'block' }}>{t.id_admin}</small> : null}
              </td>
              <td>{t.referencia_externa || '—'}</td>
            </tr>)}
            {!filteredTransfers.length ? <tr>
              <td colSpan="9" className="empty">No hay transferencias que coincidan con los filtros.</td>
            </tr> : null}
          </tbody>
        </table></div>
</> : null}

    </section>

    <InventoryAdjustModal open={Boolean(adjustItem)} item={adjustItem} onClose={() => setAdjustItem(null)} onSave={saveAdjustment} />
    <TransferModal open={transferOpen} branches={branches} products={products} onClose={() => setTransferOpen(false)} onSave={saveTransfer} />
  </div>;
}
