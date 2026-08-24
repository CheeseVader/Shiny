import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const actionKeys = [['leer', 'Leer'], ['crear', 'Crear'], ['editar', 'Editar'], ['eliminar', 'Eliminar'], ['autorizar', 'Autorizar']];
const blank = () => ({ nombre: '', email: '', password: '', rol: 'OPERADOR', activo: true, sucursal_principal: '', sucursales_permitidas: [] });

export default function AdminPage() {
  const currentUser = useMemo(() => {try {return JSON.parse(localStorage.getItem('GMX_AUTH_USER') || '{}');} catch {return {};}}, []);
  const [users, setUsers] = useState([]),[meta, setMeta] = useState({ modules: [], roles: [], branches: [] });
  const [message, setMessage] = useState(''),[selected, setSelected] = useState(null),[form, setForm] = useState(blank()),[permissions, setPermissions] = useState([]),[effective, setEffective] = useState(null),[dirty, setDirty] = useState(false);
  const [security, setSecurity] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    const [u, m] = await Promise.all([api('/api/v1/admin/users'), api('/api/v1/admin/access/modules')]);
    setUsers(u.data || []);setMeta(m.data || { modules: [], roles: [], branches: [] });
  }
  useEffect(() => {load().catch((e) => setMessage(e.message));}, []);
  const resetSecurity = () => setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });

  function toggleBranch(target, setter, id) {
    const rows = Array.isArray(target.sucursales_permitidas) ? target.sucursales_permitidas : [];
    setter((x) => ({ ...x, sucursales_permitidas: rows.includes(id) ? rows.filter((v) => v !== id) : [...rows, id] }));
  }

  function openCreate() {
    setForm(blank());resetSecurity();setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);setForm(blank());resetSecurity();
  }

  async function createUser() {
    try {
      await api('/api/v1/admin/users', { method: 'POST', body: JSON.stringify({ ...form, currentPassword: form.rol === 'SUPERADMIN' ? security.currentPassword : undefined }) });
      closeCreate();setMessage('Usuario creado.');await load();
    } catch (e) {setMessage(e.message);}
  }

  async function selectUser(u) {
    setSelected({ ...u, sucursales_permitidas: Array.isArray(u.sucursales_permitidas) ? u.sucursales_permitidas : [] });setDirty(false);resetSecurity();
    try {
      const r = await api(`/api/v1/admin/permissions/${encodeURIComponent(u.email)}`);
      const custom = r.data?.custom || [],map = new Map(custom.map((x) => [String(x.modulo).toUpperCase(), x]));
      setPermissions((meta.modules || []).map((m) => map.get(m.id) || { modulo: m.id, leer: false, crear: false, editar: false, eliminar: false, autorizar: false, _custom: false }));
      setEffective(r.data?.effective || null);
    } catch (e) {setMessage(e.message);}
  }

  async function saveUser() {
    if (!selected) return;
    try {
      const previous = users.find((x) => x.row_id === selected.row_id),sensitive = selected.rol === 'SUPERADMIN' || previous?.rol === 'SUPERADMIN';
      const r = await api(`/api/v1/admin/users/${selected.row_id}`, { method: 'PUT', body: JSON.stringify({ ...selected, currentPassword: sensitive ? security.currentPassword : undefined }) });
      setSelected(r.data);resetSecurity();setMessage('Usuario actualizado.');await load();
    } catch (e) {setMessage(e.message);}
  }

  function val(module, key) {
    const row = permissions.find((x) => x.modulo === module);
    if (row?._custom) return row[key] === true;
    const a = { leer: 'read', crear: 'create', editar: 'edit', eliminar: 'delete', autorizar: 'authorize' }[key];
    return effective?.permissions?.[module]?.[a] === true;
  }
  function setVal(module, key, value) {
    setDirty(true);setPermissions((rows) => rows.map((x) => x.modulo === module ? { ...x, [key]: value, _custom: true } : x));
  }
  function preset(module, type) {
    const p = type === 'NONE' ? {} : type === 'READ' ? { leer: true } : type === 'OPERATE' ? { leer: true, crear: true, editar: true } : { leer: true, crear: true, editar: true, eliminar: true, autorizar: true };
    setDirty(true);setPermissions((rows) => rows.map((x) => x.modulo === module ? { ...x, leer: !!p.leer, crear: !!p.crear, editar: !!p.editar, eliminar: !!p.eliminar, autorizar: !!p.autorizar, _custom: true } : x));
  }
  async function savePermissions() {
    if (!selected || selected.rol === 'SUPERADMIN') return;
    if (!security.currentPassword) return setMessage('Escribe tu contraseÃ±a actual para autorizar el cambio.');
    const rows = permissions.filter((x) => x._custom).map(({ modulo, leer, crear, editar, eliminar, autorizar }) => ({ modulo, leer, crear, editar, eliminar, autorizar }));
    try {
      await api(`/api/v1/admin/permissions/${encodeURIComponent(selected.email)}`, { method: 'PUT', body: JSON.stringify({ permissions: rows, currentPassword: security.currentPassword }) });
      setDirty(false);resetSecurity();setMessage('Permisos actualizados.');await selectUser(selected);
    } catch (e) {setMessage(e.message);}
  }
  async function changePassword() {
    if (!selected) return;
    if (security.newPassword !== security.confirmPassword) return setMessage('Las contraseÃ±as nuevas no coinciden.');
    try {
      await api(`/api/v1/admin/users/${selected.row_id}/change-password`, { method: 'POST', body: JSON.stringify({ currentPassword: security.currentPassword, newPassword: security.newPassword }) });
      resetSecurity();setMessage('ContraseÃ±a actualizada.');
    } catch (e) {setMessage(e.message);}
  }
  async function revokeSessions() {
    if (!selected) return;
    try {
      const r = await api(`/api/v1/admin/users/${selected.row_id}/revoke-sessions`, { method: 'POST', body: JSON.stringify({ currentPassword: security.currentPassword }) });
      setMessage(`${r.data.revoked} sesiÃ³n(es) revocada(s).`);resetSecurity();
    } catch (e) {setMessage(e.message);}
  }

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesText = !q || [u.nombre, u.email, u.rol].some((v) => String(v || '').toLowerCase().includes(q));
      const matchesRole = !roleFilter || u.rol === roleFilter;
      const active = u.activo !== false;
      const matchesStatus = !statusFilter || (statusFilter === 'active' ? active : !active);
      return matchesText && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  return <div className="admin-stack admin-rbac-page">
    <section className="content-card">
      <div className="section-head gmx-users-main-head">
        <div><div className="eyebrow">SEGURIDAD Â· RBAC</div><h2>Usuarios y permisos</h2><p className="section-copy">Administra cuentas, roles, sucursales y permisos de acceso.</p></div>
        <button onClick={openCreate}>+ Nuevo usuario</button>
      </div>
      {message ? <div className="message">{message}</div> : null}

      <section className="admin-panel grow gmx-users-directory">
        <div className="gmx-panel-heading">
          <div><div className="eyebrow">DIRECTORIO</div><h3>Usuarios registrados</h3><p>{brandText("Todos los usuarios registrados en GMX.")}</p></div>
          <span className="gmx-user-count">{visibleUsers.length}</span>
        </div>

        <div className="gmx-users-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, correo o rol" />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="">Todos los roles</option>{(meta.roles || []).map((r) => <option key={r}>{r}</option>)}</select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
        </div>

        <div className="table-wrap gmx-users-table-wrap"><table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Sucursales</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{visibleUsers.map((u) => <tr key={u.row_id}>
            <td><b>{u.nombre || 'â€”'}</b></td><td>{u.email}</td><td><span className="role-pill">{u.rol}</span></td>
            <td>{u.rol === 'SUPERADMIN' ? 'Todas' : (u.sucursales_permitidas || []).length || 'Todas'}</td>
            <td><span className={`gmx-status-pill ${u.activo === false ? 'inactive' : 'active'}`}>{u.activo === false ? 'INACTIVO' : 'ACTIVO'}</span></td>
            <td><button className="secondary compact" onClick={() => selectUser(u)}>Configurar</button></td>
          </tr>)}</tbody>
        </table>{visibleUsers.length === 0 ? <div className="gmx-users-empty">No hay usuarios que coincidan con los filtros.</div> : null}</div>
      </section>
    </section>

    {createOpen ? <div className="modal-backdrop gmx-user-modal-backdrop" onMouseDown={closeCreate}>
      <section className="modal gmx-user-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="section-head"><div><div className="eyebrow">ALTA DE USUARIO</div><h3>Nuevo usuario</h3><p>Crea una cuenta y define su rol y alcance.</p></div><button className="secondary compact" onClick={closeCreate}>Cerrar</button></div>
        <div className="gmx-user-modal-form">
          <label>Nombre<input value={form.nombre} onChange={(e) => setForm((x) => ({ ...x, nombre: e.target.value }))} /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))} /></label>
          <label>Password<input type="password" value={form.password} onChange={(e) => setForm((x) => ({ ...x, password: e.target.value }))} /></label>
          <label>Rol<select value={form.rol} onChange={(e) => {const rol = e.target.value;setForm((x) => ({ ...x, rol, sucursal_principal: rol === 'SUPERADMIN' ? '' : x.sucursal_principal, sucursales_permitidas: rol === 'SUPERADMIN' ? [] : x.sucursales_permitidas }));}}>{(meta.roles || []).map((r) => <option key={r}>{r}</option>)}</select></label>
          {form.rol === 'OPERADOR' ? <>
            <label className="gmx-modal-wide">Sucursal asignada *<select value={form.sucursal_principal} onChange={(e) => {const id = e.target.value;setForm((x) => ({ ...x, sucursal_principal: id, sucursales_permitidas: id ? [id] : [] }));}}><option value="">Selecciona una sucursal</option>{(meta.branches || []).map((b) => <option key={b.id_sucursal} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <div className="rbac-info gmx-modal-wide">El OPERADOR entra directamente al POS y trabaja Ãºnicamente con esta sucursal.</div>
          </> : form.rol !== 'SUPERADMIN' ? <>
            <label className="gmx-modal-wide">Sucursal principal<select value={form.sucursal_principal} onChange={(e) => setForm((x) => ({ ...x, sucursal_principal: e.target.value }))}><option value="">Sin restricciÃ³n</option>{(meta.branches || []).map((b) => <option key={b.id_sucursal} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <div className="branch-scope-box gmx-modal-wide"><b>Sucursales permitidas</b>{(meta.branches || []).map((b) => <label key={b.id_sucursal}><input type="checkbox" checked={form.sucursales_permitidas.includes(b.id_sucursal)} onChange={() => toggleBranch(form, setForm, b.id_sucursal)} />{b.nombre_sucursal}</label>)}</div>
          </> : <div className="rbac-info gmx-modal-wide">SUPERADMIN: alcance global.</div>}
          {form.rol === 'SUPERADMIN' ? <label className="gmx-modal-wide">Tu contraseÃ±a actual<input type="password" value={security.currentPassword} onChange={(e) => setSecurity((x) => ({ ...x, currentPassword: e.target.value }))} /></label> : null}
        </div>
        <div className="gmx-user-modal-actions"><button className="secondary" onClick={closeCreate}>Cancelar</button><button disabled={!form.email || form.password.length < 10 || form.rol === 'OPERADOR' && !form.sucursal_principal} onClick={createUser}>Crear usuario</button></div>
      </section>
    </div> : null}

    {selected ? <div className="modal-backdrop gmx-user-modal-backdrop" onMouseDown={() => setSelected(null)}>
      <section className="modal gmx-user-modal gmx-user-config-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="section-head"><div><div className="eyebrow">USUARIO</div><h3>{selected.email}</h3></div><button className="secondary compact" onClick={() => setSelected(null)}>Cerrar</button></div>
        <div className="rbac-user-grid">
          <div className="rbac-user-main"><h4>Datos y alcance</h4>
            <div className="form-grid"><label>Nombre<input value={selected.nombre || ''} onChange={(e) => setSelected((x) => ({ ...x, nombre: e.target.value }))} /></label><label>Email<input value={selected.email || ''} onChange={(e) => setSelected((x) => ({ ...x, email: e.target.value }))} /></label><label>Rol<select value={selected.rol} onChange={(e) => {const rol = e.target.value;setSelected((x) => ({ ...x, rol, sucursal_principal: rol === 'SUPERADMIN' ? '' : x.sucursal_principal, sucursales_permitidas: rol === 'SUPERADMIN' ? [] : x.sucursales_permitidas }));}}>{(meta.roles || []).map((r) => <option key={r}>{r}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={selected.activo !== false} onChange={(e) => setSelected((x) => ({ ...x, activo: e.target.checked }))} />Activo</label></div>
            {selected.rol === 'OPERADOR' ? <><label>Sucursal asignada *<select value={selected.sucursal_principal || ''} onChange={(e) => {const id = e.target.value;setSelected((x) => ({ ...x, sucursal_principal: id, sucursales_permitidas: id ? [id] : [] }));}}><option value="">Selecciona una sucursal</option>{(meta.branches || []).map((b) => <option key={b.id_sucursal} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label></> : selected.rol !== 'SUPERADMIN' ? <><label>Sucursal principal<select value={selected.sucursal_principal || ''} onChange={(e) => setSelected((x) => ({ ...x, sucursal_principal: e.target.value }))}><option value="">Sin restricciÃ³n</option>{(meta.branches || []).map((b) => <option key={b.id_sucursal} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label><div className="branch-scope-box"><b>Sucursales permitidas</b>{(meta.branches || []).map((b) => <label key={b.id_sucursal}><input type="checkbox" checked={(selected.sucursales_permitidas || []).includes(b.id_sucursal)} onChange={() => toggleBranch(selected, setSelected, b.id_sucursal)} />{b.nombre_sucursal}</label>)}</div></> : <div className="rbac-info">SUPERADMIN: alcance global implÃ­cito.</div>}
            <button disabled={selected.rol === 'OPERADOR' && !selected.sucursal_principal} onClick={saveUser}>Guardar usuario / alcance</button>
          </div>
          <div className="rbac-security-panel"><h4>Seguridad</h4><label>Tu contraseÃ±a actual<input type="password" value={security.currentPassword} onChange={(e) => setSecurity((x) => ({ ...x, currentPassword: e.target.value }))} /></label><label>Nueva contraseÃ±a<input type="password" value={security.newPassword} onChange={(e) => setSecurity((x) => ({ ...x, newPassword: e.target.value }))} /></label><label>Confirmar<input type="password" value={security.confirmPassword} onChange={(e) => setSecurity((x) => ({ ...x, confirmPassword: e.target.value }))} /></label><button className="secondary" onClick={changePassword}>Cambiar contraseÃ±a</button><button className="danger" onClick={revokeSessions}>Cerrar sesiones</button></div>
        </div>
        <div className="permission-editor"><div className="permission-head"><div><h4>Permisos por mÃ³dulo / acciÃ³n</h4><p>Leer Â· Crear Â· Editar Â· Eliminar Â· Autorizar.</p></div>{selected.rol !== 'SUPERADMIN' ? <button className="secondary compact" onClick={() => {setPermissions((x) => x.map((p) => ({ ...p, _custom: false })));setDirty(true);}}>Restablecer al rol</button> : null}</div>
          {selected.rol === 'SUPERADMIN' ? <div className="rbac-info">SUPERADMIN tiene permisos totales implÃ­citos.</div> : <div className="permission-table-wrap"><table className="permission-table"><thead><tr><th>MÃ³dulo</th>{actionKeys.map(([k, l]) => <th key={k}>{l}</th>)}<th>Atajo</th></tr></thead><tbody>{(meta.modules || []).map((m) => <tr key={m.id}><td><b>{m.label}</b><small>{m.id}</small></td>{actionKeys.map(([k]) => <td key={k}><input type="checkbox" checked={val(m.id, k)} onChange={(e) => setVal(m.id, k, e.target.checked)} /></td>)}<td><select defaultValue="" onChange={(e) => {if (e.target.value) preset(m.id, e.target.value);e.target.value = '';}}><option value="">Aplicarâ€¦</option><option value="NONE">Sin acceso</option><option value="READ">Solo lectura</option><option value="OPERATE">Operar</option><option value="FULL">Total</option></select></td></tr>)}</tbody></table></div>}
          {selected.rol !== 'SUPERADMIN' ? <button disabled={!dirty} onClick={savePermissions}>Guardar permisos</button> : null}
        </div>
      </section>
    </div> : null}
  </div>;
}
