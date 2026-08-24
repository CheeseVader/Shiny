import { useEffect, useMemo, useState } from 'react';

export default function TransferModal({ open, branches, products, onClose, onSave }) {
  const activeBranches = useMemo(
    () => branches.filter(branch => branch.activa !== false),
    [branches]
  );

  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setOriginId(activeBranches[0]?.id_sucursal || '');
    setDestinationId(activeBranches[1]?.id_sucursal || '');
    setProductId(products[0]?.id || '');
    setQuantity('');
    setReason('');
  }, [open, branches, products]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">TRANSFERENCIA</div>
            <h2>Mover inventario entre sucursales</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={event => {
          event.preventDefault();
          onSave({ originId, destinationId, productId, quantity, reason });
        }}>
          <div className="form-grid">
            <label>Origen
              <select value={originId} onChange={event => setOriginId(event.target.value)} required>
                <option value="">Selecciona</option>
                {activeBranches.map(branch => (
                  <option key={branch.row_id} value={branch.id_sucursal}>
                    {branch.nombre_sucursal}
                  </option>
                ))}
              </select>
            </label>

            <label>Destino
              <select value={destinationId} onChange={event => setDestinationId(event.target.value)} required>
                <option value="">Selecciona</option>
                {activeBranches.map(branch => (
                  <option key={branch.row_id} value={branch.id_sucursal}>
                    {branch.nombre_sucursal}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">Producto
              <select value={productId} onChange={event => setProductId(event.target.value)} required>
                <option value="">Selecciona</option>
                {products.map(product => (
                  <option key={product.row_id} value={product.id}>
                    {product.nombre || product.sku || product.id}
                  </option>
                ))}
              </select>
            </label>

            <label>Cantidad
              <input type="number" min="1" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} />
            </label>

            <label>Motivo
              <input value={reason} onChange={event => setReason(event.target.value)} />
            </label>
          </div>

          <div className="modal-actions">
            <div className="spacer" />
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button type="submit">Transferir</button>
          </div>
        </form>
      </div>
    </div>
  );
}
