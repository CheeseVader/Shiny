import { useEffect, useState } from 'react';

function money(value) {
  if (value === null || value === '' || typeof value === 'undefined') return '—';
  return Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function OrderDetailModal({ open, order, onClose, onCancel }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReason('');
  }, [order, open]);

  if (!open || !order) return null;

  const cancelled = String(order.estado_pedido || '').toUpperCase() === 'CANCELADO';

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal order-detail-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">PEDIDO</div>
            <h2>{order.id_pedido}</h2>
            <p className="section-copy">
              {order.fecha ? new Date(order.fecha).toLocaleString('es-MX') : '—'} · {order.sucursal || 'Sin sucursal'}
            </p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>×</button>
        </div>

        <div className="order-summary-grid">
          <div><span>Cliente</span><strong>{order.nombre_cliente || 'Público general'}</strong></div>
          <div><span>Pago</span><strong>{order.metodo_pago || '—'}</strong></div>
          <div><span>Estado</span><strong>{order.estado_pedido || '—'}</strong></div>
          <div><span>Total</span><strong>{money(order.total)}</strong></div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>SKU</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              {(order.detalles || []).map(detail => (
                <tr key={detail.row_id}>
                  <td>{detail.sku || '—'}</td>
                  <td>{detail.producto || detail.id_producto}</td>
                  <td>{detail.cantidad}</td>
                  <td>{money(detail.precio_unitario ?? detail.precio)}</td>
                  <td>{money(detail.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!cancelled ? (
          <div className="cancel-order-box">
            <label>
              Motivo de cancelación
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Opcional" />
            </label>
            <button className="danger" type="button" onClick={() => onCancel(order, reason)}>
              Cancelar venta y devolver stock
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
