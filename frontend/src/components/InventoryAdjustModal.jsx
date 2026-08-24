import { useEffect, useMemo, useState } from 'react';

export default function InventoryAdjustModal({ open, item, onClose, onSave }) {
  const [mode, setMode] = useState('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setMode('add');
    setQuantity('');
    setReason('');
  }, [item, open]);

  const currentStock=Number(item?.stock||0);
  const quantityIsValid=useMemo(()=>{
    if(quantity==='')return false;
    const qty=Number(quantity);
    if(!Number.isFinite(qty)||!Number.isInteger(qty))return false;
    if(mode==='set')return qty>=0;
    if(qty<1)return false;
    if(mode==='remove'&&qty>currentStock)return false;
    return true;
  },[mode,quantity,currentStock]);

  const nextStock=useMemo(()=>{
    if(!quantityIsValid)return null;
    const qty=Number(quantity);
    if(mode==='add')return currentStock+qty;
    if(mode==='remove')return currentStock-qty;
    return qty;
  },[mode,quantity,currentStock,quantityIsValid]);

  if (!open || !item) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal inventory-adjust-modal" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-head inventory-adjust-head">
          <div>
            <div className="eyebrow">AJUSTE DE INVENTARIO</div>
            <h2>{item.producto || item.sku || item.id_producto}</h2>
            <p className="section-copy">{item.sucursal} · stock actual <strong>{currentStock}</strong></p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <form className="inventory-adjust-form" onSubmit={event => {
          event.preventDefault();
          const normalizedReason=reason.trim();
          if(!normalizedReason){
            event.currentTarget.querySelector('textarea[name="adjustmentReason"]')?.reportValidity();
            return;
          }
          onSave({ mode, quantity, reason: normalizedReason });
        }}>
          <div className="inventory-adjust-fields">
            <label>
              <span>Operación</span>
              <select value={mode} onChange={event => setMode(event.target.value)}>
                <option value="add">Entrada / sumar</option>
                <option value="remove">Salida / restar</option>
                <option value="set">Establecer stock exacto</option>
              </select>
            </label>

            <label>
              <span>{mode==='set'?'Stock nuevo':'Cantidad'}</span>
              <input
                type="number"
                min={mode==='set' ? 0 : 1}
                max={mode==='remove' ? currentStock : undefined}
                step="1"
                required
                value={quantity}
                onChange={event => setQuantity(event.target.value)}
                placeholder={mode==='set'?'Ej. 20':'Ej. 5'}
              />
            </label>

            <label className="inventory-adjust-reason">
              <span>Motivo</span>
              <textarea
                name="adjustmentReason"
                rows="3"
                required
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="Ej. recepción, corrección física, merma…"
              />
            </label>
          </div>

          <div className="inventory-adjust-preview">
            <span>Stock actual <strong>{currentStock}</strong></span>
            <span>→</span>
            <span>Stock resultante <strong>{nextStock===null?'—':nextStock}</strong></span>
          </div>

          <div className="modal-actions inventory-adjust-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button type="submit">Aplicar ajuste</button>
          </div>
        </form>
      </div>
    </div>
  );
}
