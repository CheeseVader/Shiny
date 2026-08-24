import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import ClientModal from '../components/ClientModal.jsx';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadClients(term = search) {
    setLoading(true);

    try {
      const body = await api(
        `/api/v1/clients?limit=100&search=${encodeURIComponent(term)}`
      );
      setClients(body.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{
    const timer=setTimeout(()=>{
      loadClients(search).catch(error=>setMessage(error.message));
    },300);
    return()=>clearTimeout(timer);
  },[search]);

  function openNew() {
    setSelected(null);
    setModalOpen(true);
  }

  async function openEdit(rowId) {
    try {
      const body = await api(`/api/v1/clients/${rowId}`);
      setSelected(body.data);
      setModalOpen(true);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveClient(form) {
    try {
      if (selected) {
        await api(`/api/v1/clients/${selected.row_id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
        setMessage('Cliente actualizado.');
      } else {
        await api('/api/v1/clients', {
          method: 'POST',
          body: JSON.stringify(form)
        });
        setMessage('Cliente creado.');
      }

      setModalOpen(false);
      await loadClients();
    } catch (error) {
      setMessage(error.message);
      throw error;
    }
  }

  async function deleteClient(client) {
    if (!(await window.gmxConfirm(`¿Eliminar ${client.nombre || client.id_cliente}?`,{title:'Eliminar cliente',confirmText:'Eliminar',type:'error'}))) {
      return;
    }

    try {
      await api(`/api/v1/clients/${client.row_id}`, {
        method: 'DELETE'
      });

      setModalOpen(false);
      setMessage('Cliente eliminado.');
      await loadClients();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    loadClients(search).catch(error => setMessage(error.message));
  }

  return (
    <section className="content-card">
      <div className="section-head client-tools">
        <div>
          <div className="eyebrow">POSTGRESQL · CRM</div>
          <h2>Clientes</h2>
          <p className="section-copy">
            {loading
              ? 'Consultando…'
              : `${clients.length} registros visibles`}
          </p>
        </div>

        <form className="actions" onSubmit={submitSearch}>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar nombre, teléfono, email, ID, CP, ciudad o estado…"
          />
          <span className="client-live-search-status">{loading?'Buscando…':'Búsqueda automática'}</span>
          <button type="button" onClick={openNew}>
            Nuevo cliente
          </button>
        </form>
      </div>

      {message ? <div className="message">{message}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>ID</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>CP</th>
              <th>Ciudad</th>
              <th>Estado</th>
              <th>Identidad</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {clients.map(client => (
              <tr key={client.row_id}>
                <td>{client.row_id}</td>
                <td>{client.id_cliente || '—'}</td>
                <td><strong>{client.nombre || 'Sin nombre'}</strong></td>
                <td>{client.telefono || '—'}</td>
                <td>{client.email || '—'}</td>
                <td>{client.cp || '—'}</td>
                <td>{client.ciudad || '—'}</td>
                <td>{client.estado || '—'}</td>
                <td>
                  <span className={`identity-badge ${client.email_verificado||client.telefono_verificado?'verified':'pending'}`}>
                    {client.email_verificado||client.telefono_verificado?'Verificada':'Pendiente'}
                  </span>
                </td>
                <td>
                  <button
                    className="secondary compact"
                    onClick={() => openEdit(client.row_id)}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}

            {!loading && clients.length === 0 ? (
              <tr>
                <td colSpan="10" className="empty">
                  No hay clientes.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ClientModal
        open={modalOpen}
        client={selected}
        onClose={() => setModalOpen(false)}
        onSave={saveClient}
        onDelete={deleteClient}
      />
    </section>
  );
}
