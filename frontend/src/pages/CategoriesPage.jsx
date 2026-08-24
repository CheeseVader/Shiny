import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const EMPTY = { id: '', nombre: '', estado: 'Activo' };

export default function CategoriesPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const result = await api('/api/v1/categories');
    setRows(Array.isArray(result?.data) ? result.data : []);
  }

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es');
    return rows.filter((row) => {
      const matchText = !q || String(row.nombre || '').toLocaleLowerCase('es').includes(q);
      const matchStatus = !status || String(row.estado || 'Activo') === status;
      return matchText && matchStatus;
    });
  }, [rows, search, status]);

  const totalActive = rows.filter((x) => String(x.estado || 'Activo') === 'Activo').length;
  const totalProducts = rows.reduce((sum, x) => sum + Number(x.total_productos || 0), 0);

  function openNew() {
    setForm(EMPTY);
    setEditing(true);
    setMessage('');
  }

  function openEdit(row) {
    setForm({
      id: String(row.id || ''),
      nombre: String(row.nombre || ''),
      estado: String(row.estado || 'Activo')
    });
    setEditing(true);
    setMessage('');
  }

  async function save(e) {
    e.preventDefault();
    const nombre = form.nombre.trim();
    if (!nombre) {
      setMessage('El nombre de la categoría es obligatorio.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      if (form.id) {
        await api(`/api/v1/categories/${encodeURIComponent(form.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ nombre, estado: form.estado })
        });
        setMessage('Categoría actualizada.');
      } else {
        await api('/api/v1/categories', {
          method: 'POST',
          body: JSON.stringify({ nombre, estado: form.estado })
        });
        setMessage('Categoría creada.');
      }

      setEditing(false);
      setForm(EMPTY);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page">
    <div className="page-head">
      <div>
        <small>CATÁLOGO MAESTRO</small>
        <h1>Categorías</h1>
        <p>Administra las categorías utilizadas por Productos, Inventario, Compras y la tienda pública.</p>
      </div>
      <button type="button" className="primary" onClick={openNew}>+ Nueva categoría</button>
    </div>

    <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
      <article className="kpi-card"><span>Total categorías</span><strong>{rows.length}</strong></article>
      <article className="kpi-card"><span>Categorías activas</span><strong>{totalActive}</strong></article>
      <article className="kpi-card"><span>Productos clasificados</span><strong>{totalProducts}</strong></article>
    </div>

    <section className="panel">
      <div className="filters" style={{ gridTemplateColumns: 'minmax(260px,1fr) 220px' }}>
        <label>Buscar
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre de categoría" />
        </label>
        <label>Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="Activo">Activas</option>
            <option value="Inactivo">Inactivas</option>
          </select>
        </label>
      </div>

      {message ? <div className="message">{message}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Productos asociados</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? visible.map((row) =>
            <tr key={row.id}>
                <td>
                  <strong>{row.nombre}</strong>
                  <div className="muted">{row.id}</div>
                </td>
                <td>{Number(row.total_productos || 0)}</td>
                <td>
                  <span className={`status ${String(row.estado || 'Activo').toLowerCase() === 'activo' ? 'active' : 'inactive'}`}>
                    {row.estado || 'Activo'}
                  </span>
                </td>
                <td>
                  <button type="button" className="secondary compact" onClick={() => openEdit(row)}>Editar</button>
                </td>
              </tr>
            ) : <tr><td colSpan="4" className="empty">No se encontraron categorías.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {editing ? <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card" onSubmit={save} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div>
            <small>CATÁLOGO MAESTRO</small>
            <h2>{form.id ? 'Editar categoría' : 'Nueva categoría'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={() => setEditing(false)}>×</button>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label>Nombre *
            <input
              autoFocus
              value={form.nombre}
              onChange={(e) => setForm((x) => ({ ...x, nombre: e.target.value }))}
              placeholder="Ej. Deck Boxes"
              maxLength="120" />
            
          </label>

          <label>Estado
            <select value={form.estado} onChange={(e) => setForm((x) => ({ ...x, estado: e.target.value }))}>
              <option value="Activo">Activa</option>
              <option value="Inactivo">Inactiva</option>
            </select>
          </label>

          {form.id ? <p className="muted" style={{ margin: 0 }}>{brandText("\n            Si cambias el nombre, GMX actualizará también los productos actualmente asociados a esta categoría.\n          ")}

          </p> : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar categoría'}</button>
        </div>
      </form>
    </div> : null}
  </div>;
}
