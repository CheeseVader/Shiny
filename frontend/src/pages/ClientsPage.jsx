import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import ClientModal from '../components/ClientModal.jsx';
import { R23Donut } from '../components/VisualKitR23.jsx';
import '../phase_gmx_exact_views_r23.css';

const PAGE_SIZE = 25;
const isVerified = client => Boolean(client.email_verificado || client.telefono_verificado);
const initials = name => String(name || 'Cliente').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const percentage = (value, total) => total ? Math.round((value / total) * 100) : 0;
const formatMoney = value => Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX');
}

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [identityFilter, setIdentityFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [contactFilter, setContactFilter] = useState('all');
  const [page, setPage] = useState(1);

  async function loadClients(term = search) {
    setLoading(true);
    try {
      const body = await api(`/api/v1/clients?limit=100&search=${encodeURIComponent(term)}`);
      setClients(body.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadClients(search).catch(error => setMessage(error.message)), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function openNew() { setSelected(null); setModalOpen(true); }
  async function openEdit(rowId) {
    try {
      const body = await api(`/api/v1/clients/${rowId}`);
      setSelected(body.data); setModalOpen(true);
    } catch (error) { setMessage(error.message); }
  }
  async function saveClient(form) {
    try {
      if (selected) {
        await api(`/api/v1/clients/${selected.row_id}`, { method: 'PUT', body: JSON.stringify(form) });
        setMessage('Cliente actualizado.');
      } else {
        await api('/api/v1/clients', { method: 'POST', body: JSON.stringify(form) });
        setMessage('Cliente creado.');
      }
      setModalOpen(false); await loadClients();
    } catch (error) { setMessage(error.message); throw error; }
  }
  async function deleteClient(client) {
    if (!(await window.tcg_store_templateConfirm(`¿Eliminar ${client.nombre || client.id_cliente}?`, { title: 'Eliminar cliente', confirmText: 'Eliminar', type: 'error' }))) return;
    try {
      await api(`/api/v1/clients/${client.row_id}`, { method: 'DELETE' });
      setModalOpen(false); setMessage('Cliente eliminado.'); await loadClients();
    } catch (error) { setMessage(error.message); }
  }

  const verifiedClients = clients.filter(isVerified).length;
  const pendingClients = Math.max(0, clients.length - verifiedClients);
  const cityOptions = useMemo(() => [...new Set(clients.map(client => String(client.ciudad || '').trim()).filter(Boolean))].sort(), [clients]);
  const emailCount = clients.filter(client => String(client.email || '').trim()).length;
  const phoneCount = clients.filter(client => String(client.telefono || '').trim()).length;
  const addressCount = clients.filter(client => String(client.direccion || client.ciudad || client.estado || '').trim()).length;
  const visibleClients = useMemo(() => clients.filter(client => {
    const verified = isVerified(client);
    if (identityFilter === 'verified' && !verified) return false;
    if (identityFilter === 'pending' && verified) return false;
    if (cityFilter !== 'all' && String(client.ciudad || '') !== cityFilter) return false;
    if (contactFilter === 'complete' && (!client.email || !client.telefono)) return false;
    if (contactFilter === 'missing' && client.email && client.telefono) return false;
    return true;
  }), [clients, identityFilter, cityFilter, contactFilter]);
  const totalPages = Math.max(1, Math.ceil(visibleClients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedClients = visibleClients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  function selectIdentityFilter(value) { setIdentityFilter(value); setPage(1); }

  return (
    <div className="clients-page admin-stack r23-view r23-clients r27-clients-exact">
      <section className="r27-client-kpis" aria-label="Resumen de clientes">
        <article><i aria-hidden="true">♙</i><div><span>Clientes visibles</span><strong>{clients.length}</strong><small>Según la búsqueda actual</small></div></article>
        <article><i aria-hidden="true">♢</i><div><span>Identidad verificada</span><strong>{verifiedClients}</strong><small>Email o teléfono validado</small></div></article>
        <article className="attention"><i aria-hidden="true">△</i><div><span>Verificación pendiente</span><strong>{pendingClients}</strong><small>Requieren completar identidad</small></div></article>
        <article><i aria-hidden="true">⌖</i><div><span>Ciudades</span><strong>{cityOptions.length}</strong><small>Cobertura de clientes visibles</small></div></article>
      </section>

      <section className="r27-client-insights" aria-label="Estado y calidad de datos">
        <article className="r27-identity-card"><h3>Estado de identidad</h3><R23Donut segments={[{ label: 'Verificada', value: verifiedClients, color: '#12a866' }, { label: 'Pendiente', value: pendingClients, color: '#f59e0b' }]} center={clients.length} caption="Total" /></article>
        <article className="r27-client-quality"><h3>Calidad de datos</h3>{[['Email', percentage(emailCount, clients.length)], ['Teléfono', percentage(phoneCount, clients.length)], ['Dirección', percentage(addressCount, clients.length)]].map(([label, value]) => <div className="r27-quality-row" key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}%</strong></div>)}</article>
      </section>

      <section className="content-card r27-client-directory">
        <div className="r27-directory-head"><div><h2>Directorio de clientes</h2><p>{loading ? 'Consultando…' : `${visibleClients.length} registros visibles`}</p></div><button type="button" onClick={openNew}>＋ Nuevo cliente</button></div>
        <div className="r27-client-toolbar">
          <label className="r27-directory-search"><i aria-hidden="true">⌕</i><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar nombre, teléfono, email o ciudad" /></label>
          <button type="button" className={identityFilter === 'all' ? 'active' : ''} onClick={() => selectIdentityFilter('all')}>Todos</button>
          <button type="button" className={identityFilter === 'verified' ? 'active' : ''} onClick={() => selectIdentityFilter('verified')}><i className="dot ok" />Verificados</button>
          <button type="button" className={identityFilter === 'pending' ? 'active' : ''} onClick={() => selectIdentityFilter('pending')}><i className="dot warn" />Pendientes</button>
          <select value={cityFilter} onChange={event => { setCityFilter(event.target.value); setPage(1); }} aria-label="Filtrar por ciudad"><option value="all">Todas las ciudades</option>{cityOptions.map(city => <option key={city} value={city}>{city}</option>)}</select>
          <button type="button" className={showMoreFilters ? 'active-outline' : ''} onClick={() => setShowMoreFilters(value => !value)}>☷ Más filtros</button>
        </div>
        {showMoreFilters ? <div className="r27-more-filters"><label>Contacto<select value={contactFilter} onChange={event => { setContactFilter(event.target.value); setPage(1); }}><option value="all">Cualquier estado</option><option value="complete">Email y teléfono</option><option value="missing">Datos incompletos</option></select></label><button type="button" onClick={() => { setContactFilter('all'); setCityFilter('all'); selectIdentityFilter('all'); }}>Limpiar filtros</button></div> : null}
        {message ? <div className="message">{message}</div> : null}
        <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Ubicación</th><th>Pedidos</th><th>Total comprado</th><th>Última compra</th><th>Identidad</th><th>Acciones</th></tr></thead><tbody>
          {pagedClients.map(client => {
            const orders = client.pedidos ?? client.order_count ?? client.total_pedidos ?? 0;
            const total = client.total_comprado ?? client.total_spent ?? client.monto_compras ?? 0;
            const lastOrder = client.ultima_compra ?? client.last_order_at ?? client.fecha_ultima_compra;
            return <tr key={client.row_id}>
              <td><div className="r27-client-person"><i>{initials(client.nombre)}</i><div><strong>{client.nombre || 'Sin nombre'}</strong><small>{client.id_cliente || 'Sin ID'}</small></div></div></td>
              <td><div className="r27-contact"><span>⌕ {client.telefono || '—'}</span><span>✉ {client.email || '—'}</span></div></td>
              <td><div className="r27-location"><span>⌖ {client.ciudad || '—'}</span><small>{client.estado || '—'}</small></div></td>
              <td><span className="r27-orders">▢ {orders}</span></td><td>{formatMoney(total)}</td><td>{formatDate(lastOrder)}</td>
              <td><span className={`identity-badge ${isVerified(client) ? 'verified' : 'pending'}`}>{isVerified(client) ? 'Verificada' : 'Pendiente'}</span></td>
              <td><div className="r27-row-actions"><button type="button" className="secondary compact" onClick={() => openEdit(client.row_id)}>Ver cliente</button><button type="button" className="secondary compact dots" aria-label={`Opciones de ${client.nombre || 'cliente'}`} onClick={() => openEdit(client.row_id)}>•••</button></div></td>
            </tr>;
          })}
          {!loading && pagedClients.length === 0 ? <tr><td colSpan="8" className="empty">No hay clientes.</td></tr> : null}
        </tbody></table></div>
        <footer className="r27-directory-footer"><span>{visibleClients.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, visibleClients.length)} de ${visibleClients.length} registros` : '0 registros'}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>←</button><b>{currentPage}</b><button type="button" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>→</button></div><select aria-label="Registros por página" value={PAGE_SIZE} readOnly><option value={PAGE_SIZE}>{PAGE_SIZE} por página</option></select></footer>
        <ClientModal open={modalOpen} client={selected} onClose={() => setModalOpen(false)} onSave={saveClient} onDelete={deleteClient} />
      </section>
    </div>
  );
}
