import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import BranchModal from '../components/BranchModal.jsx';

export default function BranchesPage() {
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('GMX_AUTH_USER') || '{}');
    } catch {
      return {};
    }
  }, []);

  const isSuperadmin =
    String(currentUser.rol || '').toUpperCase() === 'SUPERADMIN';

  const [branches, setBranches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const body = await api('/api/v1/branches?includeInactive=true');
    setBranches(body.data || []);
  }

  useEffect(() => {
    load().catch(error => setMessage(error.message));
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
      ? `\u00BFReactivar ${branch.nombre_sucursal||'esta sucursal'}? Volvera a estar disponible para nuevas operaciones.`
      : `\u00BFDeshabilitar ${branch.nombre_sucursal||'esta sucursal'}? El stock, movimientos e historial se conservaran.`;

    const ok = await window.gmxConfirm?.(
      question,
      {title:`${action} sucursal`,confirmText:action}
    );

    if(ok===false)return;

    try {
      if(active){
        await api(`/api/v1/branches/${branch.row_id}/reactivate`, {
          method:'PATCH'
        });
        setMessage('Sucursal reactivada.');
      } else {
        await api(`/api/v1/branches/${branch.row_id}`, {
          method:'DELETE'
        });
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
        await api(`/api/v1/branches/${selected.row_id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });

        setMessage('Sucursal actualizada.');
      } else {
        await api('/api/v1/branches', {
          method: 'POST',
          body: JSON.stringify(form)
        });

        setMessage('Sucursal creada.');
      }

      setOpen(false);
      await load();
    } catch (error) {
      setMessage(error.message);
      throw error;
    }
  }

  return (
    <section className="content-card">
      <div className="section-head">
        <div>
          <div className="eyebrow">OPERACIÓN · MULTISUCURSAL</div>
          <h2>Sucursales</h2>
          <p className="section-copy">
            {branches.length} sucursales registradas
          </p>
        </div>

        {isSuperadmin ? (
          <button onClick={newBranch}>Nueva sucursal</button>
        ) : null}
      </div>

      {message ? <div className="message">{message}</div> : null}

      <div className="branch-grid">
        {branches.map(branch => (
          <article className="branch-card" key={branch.row_id}>
            <div className="branch-card-head">
              <div>
                <strong>{branch.nombre_sucursal || 'Sin nombre'}</strong>
                <span>
                  ID: {branch.id_sucursal || '—'}
                </span>
                <span>
                  Código: {branch.codigo || '—'}
                </span>
              </div>

              <span
                className={`module-state ${
                  branch.activa !== false ? 'ready' : 'planned'
                }`}
              >
                {branch.activa !== false ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <div className="branch-meta">
              <span>{branch.direccion || 'Sin dirección'}</span>
              <span>
                {[branch.ciudad, branch.estado, branch.cp]
                  .filter(Boolean)
                  .join(' · ') || 'Ubicación pendiente'}
              </span>
              <span>{branch.telefono || branch.email || 'Sin contacto'}</span>
            </div>

            {isSuperadmin ? (
              <div className="branch-admin-actions">
                <button
                  className="secondary compact"
                  onClick={() => edit(branch.row_id)}
                >
                  Editar
                </button>
                {branch.activa!==false ? (
                  <button
                    className="danger compact"
                    onClick={() => setBranchActive(branch,false)}
                  >
                    Deshabilitar
                  </button>
                ) : (
                  <button
                    className="secondary compact"
                    onClick={() => setBranchActive(branch,true)}
                  >
                    Reactivar
                  </button>
                )}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {isSuperadmin ? (
        <BranchModal
          open={open}
          branch={selected}
          onClose={() => setOpen(false)}
          onSave={save}
        />
      ) : null}
    </section>
  );
}
