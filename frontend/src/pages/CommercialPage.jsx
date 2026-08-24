import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const asArray = (v) => Array.isArray(v) ? v : [];

const RESOURCES = [
['health', '/api/v1/commercial/health'],
['branches', '/api/v1/branches?includeInactive=false'],
['clients', '/api/v1/clients?limit=500'],
['products', '/api/v1/products?limit=1000'],
['tcgInventory', '/api/v1/tcg/inventory?limit=1000'],
['providers', '/api/v1/commercial/providers'],
['quotes', '/api/v1/commercial/quotes?limit=500'],
['payables', '/api/v1/commercial/payables?limit=500'],
['expenses', '/api/v1/commercial/expenses?limit=500'],
['returns', '/api/v1/commercial/returns?limit=500'],
['purchases', '/api/v1/purchases?limit=300']];


export default function CommercialPage() {
  const [tab, setTab] = useState('quotes');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [health, setHealth] = useState(null);
  const [branches, setBranches] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [tcgInventory, setTcgInventory] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [providers, setProviders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [payables, setPayables] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [returns, setReturns] = useState([]);

  const [quote, setQuote] = useState({ branchId: '', clientId: '', clientName: '', email: '', phone: '', validityDays: 15, discount: 0, notes: '', items: [] });
  const [providerEditId, setProviderEditId] = useState(null);
  const [provider, setProvider] = useState({ razon_social: '', nombre_comercial: '', rfc: '', contacto: '', telefono: '', email: '', direccion: '', ciudad: '', estado: '', cp: '', pais: 'México', terminos_pago: 'CONTADO', dias_credito: 0, moneda: 'MXN', banco: '', cuenta_referencia: '', notas: '', activo: true });
  const [payable, setPayable] = useState({ providerId: '', document: '', dueDate: '', total: 0, branchId: '', notes: '' });
  const [payablePayment, setPayablePayment] = useState(null);
  const [payablePaymentForm, setPayablePaymentForm] = useState({ amount: 0, paymentMethod: 'TRANSFERENCIA', reference: '', notes: '' });
  const [payablePayments, setPayablePayments] = useState([]);
  const [expense, setExpense] = useState({ branchId: '', expenseDate: '', category: 'GENERAL', subcategory: '', concept: '', providerId: '', provider: '', currency: 'MXN', subtotal: 0, taxes: 0, total: 0, paymentMethod: 'TRANSFERENCIA', reference: '', receiptUrl: '', notes: '' });
  const [returnOrderId, setReturnOrderId] = useState('');
  const [returnOrder, setReturnOrder] = useState(null);
  const [returnQty, setReturnQty] = useState({});
  const [returnCondition, setReturnCondition] = useState({});
  // GMX_DEV_001D_CONDICION_DESTINO
  const [returnOptions, setReturnOptions] = useState({ reason: '', refund: false, refundMethod: 'EFECTIVO', refundReference: '', notes: '' });
  const [quoteClientSearch, setQuoteClientSearch] = useState('');
  const [quoteProductSearch, setQuoteProductSearch] = useState('');
  const [quoteHistorySearch, setQuoteHistorySearch] = useState('');
  const [quoteHistoryStatus, setQuoteHistoryStatus] = useState('');
  const [quoteClientOpen, setQuoteClientOpen] = useState(false);
  const [quoteProductOpen, setQuoteProductOpen] = useState(false);
  const [quoteConvert, setQuoteConvert] = useState(null);
  const [quoteConvertBranch, setQuoteConvertBranch] = useState('');

  async function load() {
    setLoading(true);
    const settled = await Promise.allSettled(RESOURCES.map(async ([name, url]) => [name, await api(url)]));
    const nextErrors = {};
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const [name, payload] = result.value;
      const data = payload?.data;
      if (name === 'health') setHealth(data);
      if (name === 'branches') setBranches(asArray(data));
      if (name === 'clients') setClients(asArray(data));
      if (name === 'products') setProducts(asArray(data));
      if (name === 'tcgInventory') setTcgInventory(asArray(data));
      if (name === 'providers') setProviders(asArray(data));
      if (name === 'quotes') setQuotes(asArray(data));
      if (name === 'payables') setPayables(asArray(data));
      if (name === 'expenses') setExpenses(asArray(data));
      if (name === 'returns') setReturns(asArray(data));
      if (name === 'purchases') setPurchases(asArray(data));
    }
    settled.forEach((result, index) => {
      if (result.status === 'rejected') nextErrors[RESOURCES[index][0]] = result.reason?.message || 'Error de carga';
    });
    setErrors(nextErrors);
    setLoading(false);
    setExpense((x) => {
      if (x.branchId || !branches.length) return x;
      return { ...x, branchId: branches[0]?.id_sucursal || '' };
    });
  }

  useEffect(() => {load();}, []);

  // GMX_DEV_AUD_001B_RETURN_DEEPLINK
  // Permite abrir Gestión Comercial directamente desde un pedido PAGADO.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = String(params.get('tab') || '').toLowerCase();
    const orderId = String(params.get('orderId') || '').trim();

    if (requestedTab === 'returns') setTab('returns');
    if (!orderId) return;

    setReturnOrderId(orderId);
    setTab('returns');

    let cancelled = false;
    (async () => {
      try {
        const r = await api(`/api/v1/commercial/returns-order/${encodeURIComponent(orderId)}`);
        if (cancelled) return;
        setReturnOrder(r.data);
        setReturnQty({});
        setReturnCondition(Object.fromEntries((r.data?.detalles || []).map((d) => [d.id_detalle, 'VENDIBLE'])));
        setMessage('');
        // Al venir del POS preparamos devolución real, sin ejecutarla automáticamente.
        setReturnOptions((x) => ({
          ...x,
          reason: '',
          refund: false,
          refundMethod: String(r.data?.metodo_pago || 'EFECTIVO').toUpperCase() === 'MIXTO' ?
          'EFECTIVO' :
          String(r.data?.metodo_pago || 'EFECTIVO').toUpperCase(),
          refundReference: '',
          paymentId: '',
          notes: ''
        }));
      } catch (e) {
        if (!cancelled) setMessage(e.message);
      }
    })();

    return () => {cancelled = true;};
  }, []);
  useEffect(() => {
    if (!expense.branchId && branches[0]) setExpense((x) => ({ ...x, branchId: branches[0].id_sucursal }));
    if (!quote.branchId && branches[0]) setQuote((x) => ({ ...x, branchId: branches[0].id_sucursal }));
    if (!payable.branchId && branches[0]) setPayable((x) => ({ ...x, branchId: branches[0].id_sucursal }));
  }, [branches]);

  const failedCount = Object.keys(errors).length;
  const healthOk = health && Object.values(health).every((x) => x?.ok !== false);

  function useClient(id) {
    const c = clients.find((x) => String(x.id_cliente) === String(id));
    if (!c) return;
    setQuote((x) => ({ ...x, clientId: c.id_cliente || '', clientName: c.nombre || '', email: c.email || '', phone: c.telefono || '' }));
    setQuoteClientSearch(c.nombre || '');
    setQuoteClientOpen(false);
  }

  function addQuoteItem(key) {
    const [kind, id] = String(key || '').split(':', 2);
    if (kind === 'PRODUCT') {
      const p = products.find((x) => String(x.id) === String(id));if (!p) return;
      setQuote((x) => {
        const existing = x.items.findIndex((y) => y.itemType === 'PRODUCT' && String(y.productId) === String(p.id));
        if (existing >= 0) return { ...x, items: x.items.map((y, j) => j === existing ? { ...y, quantity: Number(y.quantity || 0) + 1 } : y) };
        return { ...x, items: [...x.items, { itemType: 'PRODUCT', productId: p.id, inventoryId: null, sku: p.sku, name: p.nombre, category: p.categoria || '', quantity: 1, price: Number(p.precio || 0) }] };
      });
    } else if (kind === 'TCG') {
      const v = tcgInventory.find((x) => String(x.id_inventario) === String(id) && (!quote.branchId || String(x.id_sucursal) === String(quote.branchId)));if (!v) return;
      setQuote((x) => {
        const existing = x.items.findIndex((y) => y.itemType === 'TCG' && String(y.inventoryId) === String(v.id_inventario));
        if (existing >= 0) return { ...x, items: x.items.map((y, j) => j === existing ? { ...y, quantity: Math.min(Number(v.stock || 999999), Number(y.quantity || 0) + 1) } : y) };
        return { ...x, items: [...x.items, { itemType: 'TCG', productId: null, inventoryId: v.id_inventario, idCarta: v.id_carta, sku: v.sku, name: v.carta, cardNumber: v.numero_completo || '', rarity: v.rareza || '', condition: v.condicion || '', language: v.idioma || '', finish: v.acabado || '', branchId: v.id_sucursal, branchName: v.sucursal || '', stock: Number(v.stock || 0), quantity: 1, price: Number(Number(v.precio_oferta || 0) > 0 ? v.precio_oferta : v.precio || 0) }] };
      });
    }
    setQuoteProductSearch('');setQuoteProductOpen(false);
  }

  const filteredQuoteClients = useMemo(() => {
    const q = quoteClientSearch.trim().toLowerCase();
    const base = q ? clients.filter((c) => [c.nombre, c.telefono, c.email, c.id_cliente].some((v) => String(v || '').toLowerCase().includes(q))) : clients;
    return base.slice(0, 30);
  }, [clients, quoteClientSearch]);

  const quoteCatalog = useMemo(() => {
    const productRows = products.map((p) => ({ key: `PRODUCT:${p.id}`, kind: 'PRODUCT', name: p.nombre || 'Producto', sku: p.sku || '', id: p.id, price: Number(p.precio || 0), secondary: [p.sku, p.categoria].filter(Boolean).join(' · '), search: [p.nombre, p.sku, p.id, p.categoria, p.codigo_barras].filter(Boolean).join(' ') }));
    const cardRows = tcgInventory.filter((v) => Number(v.stock || 0) > 0 && (!quote.branchId || String(v.id_sucursal) === String(quote.branchId))).map((v) => ({ key: `TCG:${v.id_inventario}`, kind: 'TCG', name: v.carta || 'Carta TCG', sku: v.sku || '', id: v.id_inventario, price: Number(Number(v.precio_oferta || 0) > 0 ? v.precio_oferta : v.precio || 0), stock: Number(v.stock || 0), secondary: [v.numero_completo, v.rareza ? `(${v.rareza})` : '', v.condicion, v.idioma, v.acabado].filter(Boolean).join(' · '), search: [v.carta, v.numero_completo, v.rareza, v.sku, v.id_inventario, v.condicion, v.idioma, v.acabado].filter(Boolean).join(' ') }));
    return [...productRows, ...cardRows].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  }, [products, tcgInventory, quote.branchId]);

  const filteredQuoteProducts = useMemo(() => {
    const q = quoteProductSearch.trim().toLowerCase();
    const base = q ? quoteCatalog.filter((p) => String(p.search || '').toLowerCase().includes(q)) : quoteCatalog;
    return base.slice(0, 50);
  }, [quoteCatalog, quoteProductSearch]);

  const filteredQuotes = useMemo(() => {
    const q = quoteHistorySearch.trim().toLowerCase();
    return quotes.filter((row) => {
      const statusOk = !quoteHistoryStatus || String(row.estado || '').toUpperCase() === quoteHistoryStatus;
      const textOk = !q || [row.id, row.cliente, row.email, row.telefono, row.estado].
      some((v) => String(v || '').toLowerCase().includes(q));
      return statusOk && textOk;
    });
  }, [quotes, quoteHistorySearch, quoteHistoryStatus]);

  const quoteSubtotal = useMemo(() => quote.items.reduce((s, x) => s + Number(x.quantity || 0) * Number(x.price || 0), 0), [quote.items]);
  const quoteTotal = Math.max(0, quoteSubtotal - Number(quote.discount || 0));

  async function run(task, success) {
    try {
      setMessage('');
      const r = await task();
      setMessage(success(r));
      await load();
      return r;
    } catch (e) {setMessage(e.message);throw e;}
  }

  async function createQuote() {
    try {
      await run(() => api('/api/v1/commercial/quotes', { method: 'POST', body: JSON.stringify(quote) }),
      (r) => `Cotización ${r.data.id} creada por ${money(r.data.total)}.`);
      setQuote({ branchId: quote.branchId || branches[0]?.id_sucursal || '', clientId: '', clientName: '', email: '', phone: '', validityDays: 15, discount: 0, notes: '', items: [] });
    } catch {}
  }
  async function sendQuote(q) {
    if (!q.email) {
      setMessage('La cotización no tiene un correo de cliente.');
      return;
    }
    try {
      await run(
        () => api(`/api/v1/commercial/quotes/${q.row_id}/send`, { method: 'POST', body: '{}' }),
        (r) => `Cotización ${q.id} enviada correctamente a ${r.data.mail?.to || q.email}.`
      );
    } catch {}
  }
  async function quoteStatus(rowId, status) {
    try {await run(() => api(`/api/v1/commercial/quotes/${rowId}/status`, { method: 'POST', body: JSON.stringify({ status }) }), () => `Cotización actualizada a ${status}.`);} catch {}
  }
  function openQuoteConvert(q) {
    setQuoteConvert(q);
    setQuoteConvertBranch(branches[0]?.id_sucursal || '');
  }
  async function confirmQuoteConvert() {
    if (!quoteConvert || !quoteConvertBranch) return;
    try {
      await run(
        () => api(`/api/v1/commercial/quotes/${quoteConvert.row_id}/convert`, {
          method: 'POST', body: JSON.stringify({ branchId: quoteConvertBranch, paymentMethod: 'POR_DEFINIR' })
        }),
        (r) => `Pedido ${r.data.id_pedido} creado sin modificar inventario.`
      );
      setQuoteConvert(null);setQuoteConvertBranch('');
    } catch {}
  }
  const emptyProvider = { razon_social: '', nombre_comercial: '', rfc: '', contacto: '', telefono: '', email: '', direccion: '', ciudad: '', estado: '', cp: '', pais: 'México', terminos_pago: 'CONTADO', dias_credito: 0, moneda: 'MXN', banco: '', cuenta_referencia: '', notas: '', activo: true };
  function editProvider(p) {
    setProviderEditId(p.row_id);
    setProvider({ ...emptyProvider, ...p, telefono: String(p.telefono || '') });
  }
  function clearProviderForm() {setProviderEditId(null);setProvider(emptyProvider);}
  async function saveProvider() {
    try {
      const url = providerEditId ? `/api/v1/commercial/providers/${providerEditId}` : '/api/v1/commercial/providers';
      await run(() => api(url, { method: providerEditId ? 'PUT' : 'POST', body: JSON.stringify(provider) }),
      (r) => `Proveedor ${r.data.nombre_comercial || r.data.razon_social} ${providerEditId ? 'actualizado' : 'creado'}.`);
      clearProviderForm();
    } catch {}
  }
  async function toggleProvider(p) {
    try {await run(() => api(`/api/v1/commercial/providers/${p.row_id}`, { method: 'PUT', body: JSON.stringify({ ...p, activo: p.activo === false }) }), () => `Proveedor ${p.activo === false ? 'activado' : 'desactivado'}.`);} catch {}
  }
  async function createPayable() {
    try {
      await run(() => api('/api/v1/commercial/payables', { method: 'POST', body: JSON.stringify(payable) }), (r) => `CxP ${r.data.id} creada.`);
      setPayable((x) => ({ providerId: '', document: '', dueDate: '', total: 0, branchId: x.branchId || branches[0]?.id_sucursal || '', notes: '' }));
    } catch {}
  }
  async function payableFromPurchase(rowId) {
    try {await run(() => api(`/api/v1/commercial/payables/from-purchase/${rowId}`, { method: 'POST', body: '{}' }), (r) => `CxP ${r.data.id} ligada a compra.`);} catch {}
  }
  async function syncPayables() {
    try {await run(() => api('/api/v1/commercial/payables/sync-purchases', { method: 'POST', body: '{}' }), (r) => `${r.data.created} CxP creada(s) desde compras a crédito.`);} catch {}
  }
  async function openPayablePayment(x) {
    setPayablePayment(x);
    setPayablePaymentForm({ amount: Number(x.saldo || 0), paymentMethod: 'TRANSFERENCIA', reference: '', notes: '' });
    try {const r = await api(`/api/v1/commercial/payables/${x.id}/payments`);setPayablePayments(r.data || []);} catch {setPayablePayments([]);}
  }
  async function confirmPayablePayment() {
    if (!payablePayment) return;
    try {
      await run(() => api(`/api/v1/commercial/payables/${payablePayment.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ ...payablePaymentForm, branchId: payablePayment.id_sucursal || payable.branchId || branches[0]?.id_sucursal || '' })
      }), (r) => `Pago aplicado. Saldo ${money(r.data.saldo)}. Egreso ${r.data.id_gasto} registrado.`);
      setPayablePayment(null);setPayablePayments([]);
    } catch {}
  }
  async function createExpense() {
    try {await run(() => api('/api/v1/commercial/expenses', { method: 'POST', body: JSON.stringify(expense) }), (r) => `Gasto ${r.data.id_gasto} creado como PENDIENTE.`);} catch {}
  }
  async function payExpense(x) {
    try {await run(() => api(`/api/v1/commercial/expenses/${x.row_id}/pay`, { method: 'POST', body: '{}' }), () => `Gasto ${x.id_gasto} pagado.`);} catch {}
  }
  async function cancelExpense(x) {
    const reason = prompt('Motivo de cancelación:') || '';if (!reason) return;
    try {await run(() => api(`/api/v1/commercial/expenses/${x.row_id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }), () => `Gasto ${x.id_gasto} cancelado.`);} catch {}
  }
  async function loadReturnOrder() {
    const operationId = window.gmxOperation?.start?.({
      title: 'Buscando pedido',
      detail: brandText("GMX está validando el pedido y el alcance de sucursal.")
    });
    try {
      const r = await api(`/api/v1/commercial/returns-order/${encodeURIComponent(returnOrderId)}`);
      setReturnOrder(r.data);setReturnQty({});setReturnCondition(Object.fromEntries((r.data?.detalles || []).map((d) => [d.id_detalle, 'VENDIBLE'])));setMessage('');
      if (operationId) window.gmxOperation.complete(operationId, { title: 'Pedido encontrado', detail: 'El pedido está disponible para procesar una devolución.' });
    } catch (e) {
      setReturnOrder(null);setReturnQty({});setReturnCondition({});
      // El modal global traduce BRANCH_FORBIDDEN y demás códigos a mensajes claros.
      if (operationId) window.gmxOperation.fail(operationId, e);else
      setMessage(e.message);
    }
  }
  async function createReturn() {
    if (!returnOrder) return;
    if (!returnOptions.reason.trim()) return setMessage('Captura el motivo de la devolución.');
    const items = (returnOrder.detalles || []).
    filter((d) => Number(returnQty[d.id_detalle] || 0) > 0).
    map((d) => {
      const condition = String(returnCondition[d.id_detalle] || 'VENDIBLE').toUpperCase();
      const destination = condition === 'VENDIBLE' ?
      'INVENTARIO_DISPONIBLE' :
      condition === 'DANADO' ?
      'MERMA' :
      condition === 'DEFECTUOSO' ?
      'GARANTIA' :
      condition === 'INCOMPLETO' ?
      'REVISION' :
      'NO_VENDIBLE';
      return {
        detailId: d.id_detalle,
        quantity: Number(returnQty[d.id_detalle]),
        condition,
        destination
      };
    });
    if (!items.length) {
      const hasReturnableItems = (returnOrder.detalles || []).some((d) => Number(d.cantidad_disponible_devolver || 0) > 0);
      if (!hasReturnableItems) {
        const operationId = window.gmxOperation?.start?.({
          title: 'Validando devolución',
          detail: brandText("GMX está validando las unidades disponibles para devolución.")
        });
        if (operationId) {
          window.gmxOperation.fail(operationId, new Error('RETURN_NOTHING_AVAILABLE'));
        } else {
          setMessage('Todos los artículos de este pedido ya fueron devueltos. No hay unidades disponibles para devolución.');
        }
        return;
      }
      return setMessage('Selecciona al menos una partida con unidades disponibles para devolver.');
    }
    try {
      await run(() => api('/api/v1/commercial/returns/sale', { method: 'POST', body: JSON.stringify({ orderId: returnOrder.id_pedido, items, ...returnOptions }) }), (r) => `Devolución ${r.data.id} completada por ${money(r.data.importe)}.`);
      setReturnOrder(null);setReturnOrderId('');setReturnQty({});setReturnCondition({});
    } catch {}
  }

  return <div className="commercial-page">
    <header className="commercial-hero">
      <div>
        <div className="eyebrow">OPERACIÓN · FASE LOCAL 10.4.1</div>
        <h1>Gestión Comercial</h1>
        <p>Cotizaciones, devoluciones, proveedores, cuentas por pagar y gastos en un solo flujo.</p>
      </div>
    </header>

    {message ? <div className="commercial-alert">{message}</div> : null}
    {failedCount ? <section className="commercial-errors">
      <strong>Diagnóstico de carga</strong>
      <div>{Object.entries(errors).map(([k, v]) => <span key={k}><b>{k}</b>: {v}</span>)}</div>
    </section> : null}

    <nav className="commercial-nav">
      {[
      ['quotes', 'Cotizaciones', '🧾'], ['returns', 'Devoluciones', '↩'],
      ['providers', 'Proveedores', '🏢'], ['payables', 'Cuentas por pagar', '💳'], ['expenses', 'Gastos / Egresos', '💸']].
      map(([id, label, icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}
    </nav>

    {tab === 'quotes' ? <section className="commercial-section quotes-v11">
      <div className="commercial-section-head">
        <div>
          <div className="eyebrow">VENTAS · COTIZACIONES</div>
          <h2>Cotizaciones</h2>
          <p>Crea ofertas claras, dales seguimiento y conviértelas en pedidos sin descontar inventario durante la cotización.</p>
        </div>
        <span className="commercial-counter">{quotes.length} registradas</span>
      </div>

      <article className="commercial-panel quote-create-panel">
        <div className="quote-panel-head">
          <div>
            <h3>Nueva cotización</h3>
            <p>Busca clientes y productos sin necesidad de memorizar IDs o SKU.</p>
          </div>
          <div className="quote-live-total">
            <span>Total cotizado</span>
            <strong>{money(quoteTotal)}</strong>
          </div>
        </div>

        <div className="quote-customer-box">
          <div className="quote-block-title">
            <span>1</span>
            <div><strong>Cliente</strong><small>Selecciona un cliente existente. Sus datos maestros solo se editan desde Clientes.</small></div>
          </div>

          <div className={`quote-search-shell ${quoteClientOpen ? 'is-open' : ''}`}>
            <label>Buscar / seleccionar cliente
              <div className="quote-picker-input">
                <input
                  value={quoteClientSearch}
                  onFocus={() => setQuoteClientOpen(true)}
                  onChange={(e) => {setQuoteClientSearch(e.target.value);setQuoteClientOpen(true);}}
                  placeholder={`Selecciona entre ${clients.length} cliente(s) o escribe para buscar...`}
                  autoComplete="off" />
                
                <button type="button" className="quote-picker-toggle" onClick={() => setQuoteClientOpen((v) => !v)} aria-label="Mostrar clientes">⌄</button>
              </div>
            </label>
            {quoteClientOpen ? <div className="quote-suggestions">
              <div className="quote-suggestions-head">
                <span>{quoteClientSearch.trim() ? 'Resultados' : 'Clientes registrados'}</span>
                <strong>{filteredQuoteClients.length}{clients.length > filteredQuoteClients.length ? ` de ${clients.length}` : ''}</strong>
              </div>
              {filteredQuoteClients.length ?
              filteredQuoteClients.map((c) => <button type="button" key={c.row_id || c.id_cliente} onMouseDown={(e) => e.preventDefault()} onClick={() => useClient(c.id_cliente)}>
                  <span><strong>{c.nombre || 'Sin nombre'}</strong><small>{c.id_cliente}</small></span>
                  <span className="quote-result-meta"><small>{c.telefono || 'Sin teléfono'}</small><small>{c.email || 'Sin email'}</small></span>
                </button>) :
              <div className="quote-no-results">No hay clientes que coincidan con la búsqueda.</div>}
            </div> : null}
          </div>

          <div className="commercial-fields cols-4 quote-client-fields">
            <label className="span-2">Cliente / razón social<input value={quote.clientName} readOnly={!!quote.clientId} onChange={(e) => setQuote((x) => ({ ...x, clientName: e.target.value }))} placeholder="Nombre del cliente" /></label>
            <label>Email<input type="email" value={quote.email} readOnly={!!quote.clientId} onChange={(e) => setQuote((x) => ({ ...x, email: e.target.value }))} placeholder="cliente@correo.com" /></label>
            <label>Teléfono<input inputMode="numeric" value={quote.phone} readOnly={!!quote.clientId} onChange={(e) => setQuote((x) => ({ ...x, phone: e.target.value.replace(/\D/g, '') }))} placeholder="Solo números" /></label>
          </div>
          {quote.clientId ? <small className="table-subline">Datos protegidos: para modificarlos usa el módulo Clientes.</small> : null}
          {quote.clientName ? <div className="quote-selected-client quote-selected-client-v2">
            <div className="quote-selected-client-status">
              <span className="quote-selected-client-check">✓</span>
              <span>Cliente seleccionado</span>
            </div>
            <div className="quote-selected-client-main">
              <strong>{quote.clientName}</strong>
              <div className="quote-selected-client-contact">
                {quote.phone ? <span><b>Tel.</b> {quote.phone}</span> : null}
                {quote.email ? <span><b>Email</b> {quote.email}</span> : null}
                {!quote.phone && !quote.email ? <span>Sin datos de contacto</span> : null}
              </div>
            </div>
          </div> : null}
        </div>

        <div className="quote-products-box">
          <div className="quote-block-title">
            <span>2</span>
            <div><strong>Productos</strong><small>Busca por nombre, SKU, ID, código de barras o categoría.</small></div>
          </div>

          <div className="quote-catalog-toolbar">
            <label>Sucursal para disponibilidad
              <select value={quote.branchId} onChange={(e) => {const branchId = e.target.value;setQuote((x) => ({ ...x, branchId, items: x.items.filter((item) => item.itemType !== 'TCG' || String(item.branchId) === String(branchId)) }));setQuoteProductSearch('');setQuoteProductOpen(false);}}>
                <option value="">Selecciona sucursal</option>
                {branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
              </select>
            </label>
            <div className="quote-catalog-legend"><span><b>Producto / artículo</b> catálogo general</span><span><b>Carta TCG</b> variante física con stock</span></div>
          </div>

          <div className={`quote-search-shell quote-product-search ${quoteProductOpen ? 'is-open' : ''}`}>
            <label>Buscar / agregar producto
              <div className="quote-picker-input">
                <input
                  value={quoteProductSearch}
                  onFocus={() => setQuoteProductOpen(true)}
                  onChange={(e) => {setQuoteProductSearch(e.target.value);setQuoteProductOpen(true);}}
                  placeholder={`Busca entre ${quoteCatalog.length} artículo(s): productos y cartas TCG...`}
                  autoComplete="off" />
                
                <button type="button" className="quote-picker-toggle" onClick={() => setQuoteProductOpen((v) => !v)} aria-label="Mostrar productos">⌄</button>
              </div>
            </label>
            {quoteProductOpen ? <div className="quote-suggestions product-results">
              <div className="quote-suggestions-head">
                <span>{quoteProductSearch.trim() ? 'Resultados' : 'Artículos disponibles'}</span>
                <strong>{filteredQuoteProducts.length}{quoteCatalog.length > filteredQuoteProducts.length ? ` de ${quoteCatalog.length}` : ''}</strong>
              </div>
              {filteredQuoteProducts.length ?
              filteredQuoteProducts.map((p) => <button type="button" key={p.key} onMouseDown={(e) => e.preventDefault()} onClick={() => addQuoteItem(p.key)}>
                  <span><span className={`quote-kind-pill ${p.kind === 'TCG' ? 'tcg' : 'product'}`}>{p.kind === 'TCG' ? 'CARTA TCG' : 'PRODUCTO / ARTÍCULO'}</span><strong>{p.name}</strong><small>{p.secondary || `ID ${p.id}`}</small></span>
                  <span className="quote-result-meta"><strong>{money(p.price)}</strong><small>{p.kind === 'TCG' ? `Stock ${p.stock} · ${p.sku || p.id}` : `ID ${p.id}`}</small></span>
                </button>) :
              <div className="quote-no-results">No hay artículos que coincidan con la búsqueda.</div>}
            </div> : null}
          </div>

          <div className="quote-editor quote-editor-v11">
            {quote.items.length === 0 ?
            <div className="empty-box quote-empty">Busca un producto arriba para comenzar la cotización.</div> :
            quote.items.map((x, idx) => <div className="quote-item quote-item-v11" key={`${x.productId}-${idx}`}>
                <div className="quote-item-name"><span className={`quote-kind-pill ${x.itemType === 'TCG' ? 'tcg' : 'product'}`}>{x.itemType === 'TCG' ? 'CARTA TCG' : 'PRODUCTO / ARTÍCULO'}</span><strong>{x.name}{x.itemType === 'TCG' && x.rarity ? ` (${x.rarity})` : ''}</strong><small>{x.itemType === 'TCG' ? [x.cardNumber, x.sku, x.condition, x.language, x.finish, `Stock ${x.stock}`].filter(Boolean).join(' · ') : [x.sku, x.category].filter(Boolean).join(' · ')}</small></div>
                <label>Cantidad<input type="number" min="1" max={x.itemType === 'TCG' ? x.stock : undefined} value={x.quantity} onChange={(e) => setQuote((q) => ({ ...q, items: q.items.map((y, j) => j === idx ? { ...y, quantity: y.itemType === 'TCG' ? Math.min(y.stock, Math.max(1, Number(e.target.value) || 1)) : Math.max(1, Number(e.target.value) || 1) } : y) }))} /></label>
                <label>Precio unitario<input type="number" min="0" step=".01" value={x.price} onChange={(e) => setQuote((q) => ({ ...q, items: q.items.map((y, j) => j === idx ? { ...y, price: Math.max(0, Number(e.target.value) || 0) } : y) }))} /></label>
                <div className="quote-line-total"><span>Importe</span><strong>{money(Number(x.quantity || 0) * Number(x.price || 0))}</strong></div>
                <button type="button" className="danger compact" onClick={() => setQuote((q) => ({ ...q, items: q.items.filter((_, j) => j !== idx) }))}>Quitar</button>
              </div>)}
          </div>
        </div>

        <div className="quote-conditions-box">
          <div className="quote-block-title">
            <span>3</span>
            <div><strong>Condiciones</strong><small>Define vigencia, descuento y observaciones.</small></div>
          </div>
          <div className="commercial-fields cols-4">
            <label>Validez (días)<input type="number" min="1" max="365" value={quote.validityDays} onChange={(e) => setQuote((x) => ({ ...x, validityDays: Math.max(1, Number(e.target.value) || 1) }))} /></label>
            <label>Descuento MXN<input type="number" min="0" step=".01" value={quote.discount} onChange={(e) => setQuote((x) => ({ ...x, discount: Math.max(0, Number(e.target.value) || 0) }))} /></label>
            <label className="span-2">Notas<input value={quote.notes} onChange={(e) => setQuote((x) => ({ ...x, notes: e.target.value }))} placeholder="Condiciones especiales, tiempos de entrega, etc." /></label>
          </div>
        </div>

        <div className="quote-summary-bar">
          <div><span>Partidas</span><strong>{quote.items.length}</strong></div>
          <div><span>Unidades</span><strong>{quote.items.reduce((s, x) => s + Number(x.quantity || 0), 0)}</strong></div>
          <div><span>Subtotal</span><strong>{money(quoteSubtotal)}</strong></div>
          <div><span>Descuento</span><strong>{money(quote.discount)}</strong></div>
          <div className="grand"><span>Total</span><strong>{money(quoteTotal)}</strong></div>
          <button disabled={!quote.items.length || !quote.clientName.trim()} onClick={createQuote}>Guardar cotización</button>
        </div>
      </article>

      <article className="commercial-panel quote-history-panel">
        <div className="quote-history-head">
          <div><h3>Historial de cotizaciones</h3><p>Consulta y continúa el flujo sin ocupar espacio junto al formulario.</p></div>
          <div className="quote-history-filters">
            <input value={quoteHistorySearch} onChange={(e) => setQuoteHistorySearch(e.target.value)} placeholder="Buscar ID, cliente, email o teléfono..." />
            <select value={quoteHistoryStatus} onChange={(e) => setQuoteHistoryStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option>BORRADOR</option><option>ENVIADA</option><option>ACEPTADA</option><option>RECHAZADA</option><option>VENCIDA</option><option>CONVERTIDA</option>
            </select>
          </div>
        </div>

        <DataTable empty="No hay cotizaciones que coincidan con los filtros." headers={['Fecha', 'ID', 'Cliente', 'Total', 'Estado', 'Acciones']}>
          {filteredQuotes.map((q) => <tr key={q.row_id}>
            <td>{q.fecha ? new Date(q.fecha).toLocaleDateString('es-MX') : '—'}</td>
            <td><b>{q.id}</b></td>
            <td><b>{q.cliente}</b><small className="table-subline">{q.email || q.telefono || ''}</small></td>
            <td><b>{money(q.total)}</b></td>
            <td><Status value={q.estado} /></td>
            <td><div className="row-actions">
              {q.estado === 'BORRADOR' ? <button className="secondary compact" disabled={!q.email} title={!q.email ? 'La cotización no tiene email de cliente' : 'Enviar cotización por correo'} onClick={() => sendQuote(q)}>Enviar por correo</button> : null}
              {q.estado === 'ENVIADA' ? <button className="secondary compact" disabled={!q.email} onClick={() => sendQuote(q)}>Reenviar correo</button> : null}
              {q.estado === 'ENVIADA' ? <button className="secondary compact" onClick={() => quoteStatus(q.row_id, 'ACEPTADA')}>Marcar aceptada</button> : null}
              {q.estado === 'ACEPTADA' ? <button className="compact" onClick={() => openQuoteConvert(q)}>Convertir a pedido</button> : null}
            </div></td>
          </tr>)}
        </DataTable>
      </article>
    </section> : null}

    {quoteConvert ? <div className="modal-backdrop" onMouseDown={() => setQuoteConvert(null)}>
      <div className="modal quote-convert-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><div className="eyebrow">COTIZACIÓN → PEDIDO</div><h2>Convertir {quoteConvert.id}</h2><p className="section-copy">La conversión crea un pedido pendiente y no descuenta inventario todavía.</p></div>
          <button className="icon-btn" onClick={() => setQuoteConvert(null)}>×</button>
        </div>
        <label>Sucursal destino
          <select value={quoteConvertBranch} onChange={(e) => setQuoteConvertBranch(e.target.value)}>
            <option value="">Selecciona sucursal</option>
            {branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>
        <div className="quote-convert-summary">
          <span>Cliente <strong>{quoteConvert.cliente}</strong></span>
          <span>Total <strong>{money(quoteConvert.total)}</strong></span>
        </div>
        <div className="modal-actions">
          <button className="secondary" onClick={() => setQuoteConvert(null)}>Cancelar</button>
          <button disabled={!quoteConvertBranch} onClick={confirmQuoteConvert}>Crear pedido pendiente</button>
        </div>
      </div>
    </div> : null}

    {tab === 'providers' ? <section className="commercial-section commercial-master-section">
      <div className="commercial-section-head"><div><h2>Proveedores</h2><p>Maestro único: Compras, CxP y Egresos solo seleccionan estos registros.</p></div><span className="commercial-counter">{providers.length} proveedores</span></div>
      <div className="commercial-split">
        <article className="commercial-panel">
          <div className="commercial-form-head"><div><h3>{providerEditId ? 'Editar proveedor' : 'Nuevo proveedor'}</h3><small>{providerEditId ? 'Editando datos maestros' : 'Alta de proveedor'}</small></div>{providerEditId ? <button className="secondary compact" onClick={clearProviderForm}>Cancelar edición</button> : null}</div>
          <div className="commercial-fields cols-2">
            <label>Razón social<input value={provider.razon_social} onChange={(e) => setProvider((x) => ({ ...x, razon_social: e.target.value }))} /></label>
            <label>Nombre comercial<input value={provider.nombre_comercial} onChange={(e) => setProvider((x) => ({ ...x, nombre_comercial: e.target.value }))} /></label>
            <label>RFC<input value={provider.rfc} onChange={(e) => setProvider((x) => ({ ...x, rfc: e.target.value.toUpperCase() }))} /></label>
            <label>Contacto<input value={provider.contacto} onChange={(e) => setProvider((x) => ({ ...x, contacto: e.target.value }))} /></label>
            <label>Teléfono<input inputMode="numeric" value={provider.telefono} onChange={(e) => setProvider((x) => ({ ...x, telefono: e.target.value.replace(/\D/g, '') }))} placeholder="Solo números" /></label>
            <label>Email<input type="email" value={provider.email} onChange={(e) => setProvider((x) => ({ ...x, email: e.target.value }))} /></label>
            <label>Condición<select value={provider.terminos_pago} onChange={(e) => setProvider((x) => ({ ...x, terminos_pago: e.target.value, dias_credito: e.target.value === 'CONTADO' ? 0 : x.dias_credito }))}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select></label>
            <label>Días crédito<input type="number" min="0" disabled={provider.terminos_pago !== 'CREDITO'} value={provider.dias_credito} onChange={(e) => setProvider((x) => ({ ...x, dias_credito: Number(e.target.value) }))} /></label>
            <label>Moneda<select value={provider.moneda} onChange={(e) => setProvider((x) => ({ ...x, moneda: e.target.value }))}><option>MXN</option><option>USD</option></select></label>
            <label>Banco<input value={provider.banco} onChange={(e) => setProvider((x) => ({ ...x, banco: e.target.value }))} /></label>
            <label>Cuenta / referencia<input value={provider.cuenta_referencia} onChange={(e) => setProvider((x) => ({ ...x, cuenta_referencia: e.target.value }))} /></label>
            <label>País<input value={provider.pais} onChange={(e) => setProvider((x) => ({ ...x, pais: e.target.value }))} /></label>
            <label className="span-2">Dirección<input value={provider.direccion} onChange={(e) => setProvider((x) => ({ ...x, direccion: e.target.value }))} /></label>
            <label>Ciudad<input value={provider.ciudad} onChange={(e) => setProvider((x) => ({ ...x, ciudad: e.target.value }))} /></label>
            <label>Estado<input value={provider.estado} onChange={(e) => setProvider((x) => ({ ...x, estado: e.target.value }))} /></label>
            <label>CP<input inputMode="numeric" value={provider.cp} onChange={(e) => setProvider((x) => ({ ...x, cp: e.target.value.replace(/\D/g, '') }))} /></label>
            <label className="span-2">Notas<input value={provider.notas} onChange={(e) => setProvider((x) => ({ ...x, notas: e.target.value }))} /></label>
          </div>
          <button onClick={saveProvider}>{providerEditId ? 'Guardar cambios' : 'Crear proveedor'}</button>
        </article>
        <article className="commercial-panel grow"><h3>Directorio maestro</h3>
          <DataTable empty="No hay proveedores." headers={['ID', 'Proveedor', 'RFC', 'Contacto', 'Términos', 'Estado', 'Acciones']}>
            {providers.map((p) => <tr key={p.row_id}><td>{p.id_proveedor}</td><td><b>{p.nombre_comercial || p.razon_social}</b></td><td>{p.rfc || '—'}</td><td>{[p.contacto, p.telefono, p.email].filter(Boolean).join(' · ') || '—'}</td><td>{p.terminos_pago || '—'} {p.dias_credito ? `${p.dias_credito}d` : ''}</td><td><Status value={p.activo === false ? 'INACTIVO' : 'ACTIVO'} /></td><td><div className="row-actions"><button className="secondary compact" onClick={() => editProvider(p)}>Editar</button><button className="secondary compact" onClick={() => toggleProvider(p)}>{p.activo === false ? 'Activar' : 'Desactivar'}</button></div></td></tr>)}
          </DataTable>
        </article>
      </div>
    </section> : null}

    {tab === 'payables' ? <section className="commercial-section">
      <div className="commercial-section-head"><div><h2>Cuentas por pagar</h2><p>Obligaciones ligadas a proveedor/compra. Cada abono crea su egreso automáticamente.</p></div><div className="commercial-head-actions"><span className="commercial-counter">{payables.length} cuentas</span><button className="secondary compact" onClick={syncPayables}>Sincronizar compras a crédito</button></div></div>
      <div className="commercial-top-grid">
        <article className="commercial-panel">
          <h3>Nueva cuenta manual</h3>
          <div className="commercial-fields cols-2">
            <label>Proveedor<select value={payable.providerId} onChange={(e) => setPayable((x) => ({ ...x, providerId: e.target.value }))}><option value="">Selecciona...</option>{providers.filter((p) => p.activo !== false).map((p) => <option key={p.row_id} value={p.id_proveedor}>{p.nombre_comercial || p.razon_social}</option>)}</select></label>
            <label>Sucursal<select value={payable.branchId} onChange={(e) => setPayable((x) => ({ ...x, branchId: e.target.value }))}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <label>Documento<input value={payable.document} onChange={(e) => setPayable((x) => ({ ...x, document: e.target.value }))} /></label>
            <label>Vencimiento<input type="date" value={payable.dueDate} onChange={(e) => setPayable((x) => ({ ...x, dueDate: e.target.value }))} /></label>
            <label>Total<input type="number" min="0" step=".01" value={payable.total} onChange={(e) => setPayable((x) => ({ ...x, total: Number(e.target.value) }))} /></label>
            <label>Notas<input value={payable.notes} onChange={(e) => setPayable((x) => ({ ...x, notes: e.target.value }))} /></label>
          </div>
          <button disabled={!payable.providerId || !payable.branchId || Number(payable.total) <= 0} onClick={createPayable}>Crear CxP</button>
        </article>
        <article className="commercial-panel"><h3>Compras sin CxP ligada</h3>
          <DataTable dense empty="No hay compras pendientes de vincular." headers={['Compra', 'Proveedor', 'Condición', 'Total', '']}>
            {purchases.filter((p) => !payables.some((x) => String(x.id_compra || '') === String(p.id_compra))).slice(0, 15).map((p) => <tr key={p.row_id}><td>{p.id_compra}</td><td>{p.proveedor}</td><td>{p.terminos_pago || p.metodo_pago || '—'}</td><td>{money(p.total)}</td><td><button className="secondary compact" onClick={() => payableFromPurchase(p.row_id)}>Crear CxP</button></td></tr>)}
          </DataTable>
        </article>
      </div>
      <article className="commercial-panel"><h3>Obligaciones</h3>
        <DataTable empty="No hay cuentas por pagar." headers={['ID', 'Origen', 'Proveedor', 'Documento', 'Vence', 'Total', 'Pagado', 'Saldo', 'Estado', 'Acción']}>
          {payables.map((x) => <tr key={x.row_id}><td>{x.id}</td><td><span className="source-pill">{x.origen || 'MANUAL'}</span></td><td><b>{x.proveedor}</b></td><td>{x.documento || '—'}</td><td>{x.vencimiento || '—'}</td><td>{money(x.total)}</td><td>{money(x.pagado)}</td><td><b>{money(x.saldo)}</b></td><td><Status value={x.estado} /></td><td>{Number(x.saldo) > 0 && x.estado !== 'CANCELADA' ? <button className="compact" onClick={() => openPayablePayment(x)}>Registrar abono</button> : null}</td></tr>)}
        </DataTable>
      </article>
    </section> : null}

    {tab === 'expenses' ? <section className="commercial-section">
      <div className="commercial-section-head"><div><h2>Gastos / Egresos</h2><p>Historial financiero único. Compras y CxP generan sus egresos vinculados sin recaptura.</p></div><span className="commercial-counter">{expenses.length} movimientos</span></div>
      <article className="commercial-panel">
        <h3>Registrar egreso manual</h3>
        <div className="commercial-fields cols-4">
          <label>Sucursal<select value={expense.branchId} onChange={(e) => setExpense((x) => ({ ...x, branchId: e.target.value }))}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
          <label>Fecha<input type="date" value={expense.expenseDate} onChange={(e) => setExpense((x) => ({ ...x, expenseDate: e.target.value }))} /></label>
          <label>Categoría<select value={expense.category} onChange={(e) => setExpense((x) => ({ ...x, category: e.target.value }))}><option>GENERAL</option><option>RENTA</option><option>SERVICIOS</option><option>PAPELERIA</option><option>LOGISTICA</option><option>MANTENIMIENTO</option><option>IMPUESTOS</option><option>COMISIONES</option><option>OTRO</option></select></label>
          <label>Subcategoría<input value={expense.subcategory} onChange={(e) => setExpense((x) => ({ ...x, subcategory: e.target.value }))} /></label>
          <label className="span-2">Concepto<input value={expense.concept} onChange={(e) => setExpense((x) => ({ ...x, concept: e.target.value }))} /></label>
          <label>Proveedor<select value={expense.providerId} onChange={(e) => setExpense((x) => ({ ...x, providerId: e.target.value }))}><option value="">Sin proveedor</option>{providers.filter((p) => p.activo !== false).map((p) => <option key={p.row_id} value={p.id_proveedor}>{p.nombre_comercial || p.razon_social}</option>)}</select></label>
          <label>Total<input type="number" min="0" step=".01" value={expense.total} onChange={(e) => setExpense((x) => ({ ...x, total: Number(e.target.value), subtotal: Number(e.target.value) }))} /></label>
          <label>Método<select value={expense.paymentMethod} onChange={(e) => setExpense((x) => ({ ...x, paymentMethod: e.target.value }))}><option>EFECTIVO</option><option>TRANSFERENCIA</option><option>TARJETA</option><option>OTRO</option></select></label>
          <label className="span-2">Referencia<input value={expense.reference} onChange={(e) => setExpense((x) => ({ ...x, reference: e.target.value }))} /></label>
        </div>
        <div className="finance-rule-note">Efectivo modifica Caja únicamente al pagar. Transferencia, tarjeta u otro nunca cambian la caja física.</div>
        <div className="panel-actions"><button disabled={!expense.branchId || !expense.concept || Number(expense.total) <= 0} onClick={createExpense}>Crear egreso pendiente</button></div>
      </article>
      <article className="commercial-panel"><h3>Historial de egresos</h3>
        <DataTable empty="No hay gastos." headers={['Fecha', 'ID', 'Origen', 'Sucursal', 'Categoría', 'Concepto', 'Total', 'Método', 'Estado', 'Acciones']}>
          {expenses.map((x) => <tr key={x.row_id}><td>{x.fecha_gasto ? new Date(x.fecha_gasto).toLocaleDateString('es-MX') : '—'}</td><td>{x.id_gasto}</td><td><span className="source-pill">{x.origen_modulo || 'MANUAL'}</span></td><td>{x.sucursal}</td><td>{x.categoria}</td><td>{x.concepto}</td><td>{money(x.total)}</td><td>{x.metodo_pago}</td><td><Status value={x.estado} /></td><td><div className="row-actions">{x.estado === 'PENDIENTE' ? <button className="compact" onClick={() => payExpense(x)}>Pagar</button> : null}{x.estado !== 'CANCELADO' && !['CXP', 'COMPRA'].includes(String(x.origen_modulo || '').toUpperCase()) ? <button className="danger compact" onClick={() => cancelExpense(x)}>Cancelar</button> : null}</div></td></tr>)}
        </DataTable>
      </article>
    </section> : null}

    {tab === 'returns' ? <section className="commercial-section">
      <div className="commercial-section-head"><div><h2>Devoluciones</h2><p>Productos y cartas TCG, con devolución parcial, reintegro controlado y reembolso trazable.</p></div><span className="commercial-counter">{returns.length} devoluciones</span></div>
      <article className="commercial-panel">
        <h3>Nueva devolución</h3>
        <div className="return-search"><input placeholder="Ej. PED-00037" value={returnOrderId} onChange={(e) => setReturnOrderId(e.target.value)} /><button onClick={loadReturnOrder}>Buscar pedido</button></div>
        {returnOrder ? <div className="return-editor">
          <div className="return-order-head"><div><b>{returnOrder.id_pedido}</b><span>{returnOrder.nombre_cliente}</span></div><strong>{money(returnOrder.total)}</strong></div>
          <DataTable empty="Pedido sin partidas." headers={['Tipo', 'Producto', 'SKU', 'Vendido', 'Devuelto', 'Disponible', 'Precio', 'Devolver', 'Condición', 'Destino']}>
            {(returnOrder.detalles || []).map((d) => <tr key={d.id_detalle}>
              <td><span className={`source-pill ${String(d.tipo || 'PRODUCTO').toUpperCase() === 'TCG' ? 'tcg' : ''}`}>{String(d.tipo || 'PRODUCTO').toUpperCase() === 'TCG' ? 'TCG' : 'PRODUCTO'}</span></td>
              <td><b>{d.producto}</b><small className="table-subline">{d.detalle || ''}</small></td>
              <td>{d.sku}</td><td>{d.cantidad}</td><td>{d.cantidad_devuelta || 0}</td><td><b>{d.cantidad_disponible_devolver}</b></td>
              <td>{money(d.precio_unitario || d.precio)}</td>
              <td><input className="qty-small" type="number" min="0" max={d.cantidad_disponible_devolver} disabled={Number(d.cantidad_disponible_devolver) <= 0} value={returnQty[d.id_detalle] || 0} onChange={(e) => setReturnQty((x) => ({ ...x, [d.id_detalle]: Math.min(Number(d.cantidad_disponible_devolver), Math.max(0, Number(e.target.value) || 0)) }))} /></td>
              <td>
                <select
                  value={returnCondition[d.id_detalle] || 'VENDIBLE'}
                  disabled={Number(d.cantidad_disponible_devolver) <= 0}
                  onChange={(e) => setReturnCondition((x) => ({ ...x, [d.id_detalle]: e.target.value }))}>
                  
                  <option value="VENDIBLE">Vendible / Buen estado</option>
                  <option value="DANADO">Dañado</option>
                  <option value="DEFECTUOSO">Defectuoso</option>
                  <option value="INCOMPLETO">Incompleto</option>
                  <option value="NO_VENDIBLE">No vendible</option>
                </select>
              </td>
              <td>
                <small className="table-subline">
                  {(returnCondition[d.id_detalle] || 'VENDIBLE') === 'VENDIBLE' ?
                  'Inventario disponible' :
                  (returnCondition[d.id_detalle] || '') === 'DANADO' ?
                  'Merma' :
                  (returnCondition[d.id_detalle] || '') === 'DEFECTUOSO' ?
                  'Garantía' :
                  (returnCondition[d.id_detalle] || '') === 'INCOMPLETO' ?
                  'Revisión' :
                  'No vendible'}
                </small>
              </td>
            </tr>)}
          </DataTable>
          <div className="commercial-fields cols-4">
            <label className="span-2">Motivo<input value={returnOptions.reason} onChange={(e) => setReturnOptions((x) => ({ ...x, reason: e.target.value }))} /></label>
            <label className="check-field"><input type="checkbox" checked={returnOptions.refund} onChange={(e) => setReturnOptions((x) => ({ ...x, refund: e.target.checked }))} /><span>Generar reembolso</span></label>
            {returnOptions.refund ? <><label>Método reembolso<select value={returnOptions.refundMethod} onChange={(e) => setReturnOptions((x) => ({ ...x, refundMethod: e.target.value }))}><option>EFECTIVO</option><option>TRANSFERENCIA</option><option>TARJETA</option><option>OTRO</option></select></label>{returnOptions.refundMethod !== 'EFECTIVO' ? <label>Referencia reembolso<input value={returnOptions.refundReference} onChange={(e) => setReturnOptions((x) => ({ ...x, refundReference: e.target.value }))} /></label> : null}</> : null}
          </div>
          <div className="panel-actions">
            <button
              onClick={createReturn}
              disabled={!(returnOrder?.detalles || []).some((d) => Number(d.cantidad_disponible_devolver || 0) > 0)}>
              
              {(returnOrder?.detalles || []).some((d) => Number(d.cantidad_disponible_devolver || 0) > 0) ?
              'Procesar devoluci\u00f3n' :
              'Pedido devuelto en su totalidad'}
            </button>
          </div>
        </div> : null}
      </article>
      <article className="commercial-panel"><h3>Historial</h3>
        <DataTable empty="No hay devoluciones." headers={['Fecha', 'ID', 'Referencia', 'Cliente', 'Motivo', 'Importe', 'Stock', 'Estado']}>
          {returns.map((x) => <tr key={x.row_id}><td>{x.fecha ? new Date(x.fecha).toLocaleString('es-MX') : '—'}</td><td>{x.id}</td><td>{x.referencia}</td><td>{x.cliente_proveedor}</td><td>{x.motivo || '—'}</td><td>{money(x.importe)}</td><td>{x.reintegra_stock ? 'Sí' : 'No'}</td><td><Status value={x.estado} /></td></tr>)}
        </DataTable>
      </article>
    </section> : null}
    {payablePayment ? <div className="modal-backdrop" onMouseDown={() => setPayablePayment(null)}>
      <div className="modal commercial-payment-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><div className="eyebrow">CUENTAS POR PAGAR</div><h2>Registrar abono</h2><p>{payablePayment.id} · {payablePayment.proveedor}</p></div><button className="icon-btn" onClick={() => setPayablePayment(null)}>×</button></div>
        <div className="payment-summary-grid"><div><span>Total</span><strong>{money(payablePayment.total)}</strong></div><div><span>Pagado</span><strong>{money(payablePayment.pagado)}</strong></div><div><span>Saldo</span><strong>{money(payablePayment.saldo)}</strong></div></div>
        <div className="commercial-fields cols-2">
          <label>Monto<input type="number" min=".01" max={payablePayment.saldo} step=".01" value={payablePaymentForm.amount} onChange={(e) => setPayablePaymentForm((x) => ({ ...x, amount: Number(e.target.value) }))} /></label>
          <label>Método<select value={payablePaymentForm.paymentMethod} onChange={(e) => setPayablePaymentForm((x) => ({ ...x, paymentMethod: e.target.value }))}><option>TRANSFERENCIA</option><option>TARJETA</option><option>EFECTIVO</option><option>OTRO</option></select></label>
          <label>Referencia<input value={payablePaymentForm.reference} onChange={(e) => setPayablePaymentForm((x) => ({ ...x, reference: e.target.value }))} /></label>
          <label>Notas<input value={payablePaymentForm.notes} onChange={(e) => setPayablePaymentForm((x) => ({ ...x, notes: e.target.value }))} /></label>
        </div>
        {payablePaymentForm.paymentMethod === 'EFECTIVO' ? <div className="finance-rule-note">El pago usa la sucursal asignada a la CxP y requiere una caja abierta.</div> : null}
        {payablePayments.length ? <div className="payment-history-mini"><strong>Abonos anteriores</strong>{payablePayments.slice(0, 6).map((p) => <span key={p.row_id}>{new Date(p.fecha).toLocaleDateString('es-MX')} · {money(p.monto)} · {p.metodo_pago}</span>)}</div> : null}
        <div className="modal-actions"><button className="secondary" onClick={() => setPayablePayment(null)}>Cancelar</button><button disabled={Number(payablePaymentForm.amount) <= 0 || Number(payablePaymentForm.amount) > Number(payablePayment.saldo)} onClick={confirmPayablePayment}>Registrar abono</button></div>
      </div>
    </div> : null}

  </div>;
}

function Status({ value }) {
  const v = String(value || '—').toUpperCase();
  const cls = ['ACTIVO', 'PAGADA', 'COMPLETADA', 'ACEPTADA', 'ENVIADA'].includes(v) ? 'good' : ['CANCELADO', 'CANCELADA', 'RECHAZADA', 'INACTIVO'].includes(v) ? 'bad' : ['PENDIENTE', 'PARCIAL', 'BORRADOR'].includes(v) ? 'wait' : 'neutral';
  return <span className={`commercial-status ${cls}`}>{v}</span>;
}
function DataTable({ headers, children, empty, dense = false }) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return <div className={`commercial-table-wrap ${dense ? 'dense' : ''}`}><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{count ? children : <tr><td colSpan={headers.length}><div className="empty-box">{empty}</div></td></tr>}</tbody></table></div>;
}
