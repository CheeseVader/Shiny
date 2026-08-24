import { brandText } from "../config/brand.js";import ProductLocalImageManager from './ProductLocalImageManager.jsx';
import { useEffect, useState } from 'react';

const empty = { sku: '', codigo_barras: '', nombre: '', descripcion: '', precio: '', costo: '', stock: '', initial_stock: '', initial_branch_id: '', stock_minimo: '0', categoria: '', imagen: '', estado: 'Activo' };
export default function ProductModal({ open, product, initialValues = null, categories = [], branches = [], canSave = true, canDelete = false, canViewCost = false, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(empty);
  useEffect(() => {setForm(product ? {
      sku: product.sku ?? '', codigo_barras: product.codigo_barras ?? '', nombre: product.nombre ?? '', descripcion: product.descripcion ?? '',
      precio: product.precio ?? '', costo: product.costo ?? '', stock: product.stock ?? '', initial_stock: '', initial_branch_id: '', stock_minimo: product.stock_minimo ?? '',
      categoria: product.categoria ?? '', imagen: product.imagen ?? '', estado: product.estado || 'Activo'
    } : initialValues ? { ...empty, ...initialValues } : empty);}, [product, initialValues, open]);
  if (!open) return null;
  const change = (e) => setForm((x) => ({ ...x, [e.target.name]: e.target.value }));
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal product-modal-complete" onMouseDown={(e) => e.stopPropagation()}>
    <div className="modal-head"><div><div className="eyebrow">{brandText("GMX · PRODUCTOS")}</div><h2>{product ? `Editar ${product.nombre || product.id}` : 'Nuevo producto'}</h2></div><button className="icon-btn" onClick={onClose}>×</button></div>
    <form onSubmit={(e) => {e.preventDefault();onSave(form);}}>
      <div className="form-grid">
        <label>SKU *<input required name="sku" value={form.sku} onChange={change} autoComplete="off" /></label>
            <label>
              Código de barras
              <input
              name="codigo_barras"
              inputMode="numeric"
              value={form.codigo_barras}
              onChange={change}
              placeholder="Escanea o captura código" />
            
            </label>
        <label className="wide">Nombre<input required name="nombre" value={form.nombre} onChange={change} /></label>
        <label className="wide">Descripción<textarea name="descripcion" rows="3" value={form.descripcion} onChange={change} /></label>
        <label>Precio *<input required name="precio" type="number" min="0" step=".01" value={form.precio} onChange={change} /></label>
        {canViewCost ? <label>Costo administrativo<input name="costo" type="number" min="0" step=".01" value={form.costo} onChange={change} /></label> : null}
        <label>{product ? 'Stock total' : 'Stock inicial'}
          {product ?
            <input value={form.stock ?? 0} disabled readOnly title="Se calcula sumando todas las sucursales" /> :
            <input name="initial_stock" type="number" min="0" step="1" value={form.initial_stock} onChange={change} />
            }
        </label>
        {!product && Number(form.initial_stock || 0) > 0 ? <label>Sucursal receptora *
          <select name="initial_branch_id" required value={form.initial_branch_id} onChange={change}>
            <option value="">Selecciona sucursal</option>
            {branches.filter((b) => b.activa !== false).map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label> : null}
        <div className="wide product-stock-source-note">
          El stock físico se administra por sucursal desde Inventario. El catálogo muestra el total consolidado.
        </div>
        <label>Stock mínimo<input name="stock_minimo" type="number" min="0" step="1" value={form.stock_minimo} onChange={change} /></label>
        <label>Categoría *
          <select name="categoria" required value={form.categoria} onChange={change}>
            <option value="">Selecciona categoría</option>
            {form.categoria && !categories.some((c) => c.nombre === form.categoria) ?
              <option value={form.categoria} disabled>{form.categoria} · no disponible</option> :
              null}
            {categories.map((c) => <option key={c.id || c.nombre} value={c.nombre}>{c.nombre}</option>)}
          </select>
          {!categories.length ? <small className="field-help warning-text">No hay categorías activas disponibles.</small> : null}
        </label>
        <label>Estado<select name="estado" value={form.estado} onChange={change}><option>Activo</option><option>Inactivo</option><option>Agotado</option></select></label>
        <ProductLocalImageManager sku={form.sku} image={form.imagen} onChange={(url) => setForm((x) => ({ ...x, imagen: String(url || '') }))} />
      <label className="wide">Imagen / URL<input name="imagen" value={form.imagen} onChange={change} placeholder="https://... o ruta pública" /></label>
        {form.imagen ? <div className="wide product-image-preview"><img src={form.imagen} alt="Vista previa" /></div> : null}
      </div>
      <div className="modal-actions">
        {product && canDelete ? <button type="button" className="danger" onClick={() => onDelete?.(product)}>Dar de baja</button> : null}
        <div className="spacer" />
        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        {canSave ? <button>Guardar</button> : null}
      </div>
    </form>
  </div></div>;
}
