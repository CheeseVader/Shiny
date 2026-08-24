import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const defaults = {
  'loyalty.enabled': 'true',
  'loyalty.earn_percent': '1.00',
  'loyalty.point_value_mxn': '0.10',
  'loyalty.max_redemption_percent': '30',
  'loyalty.min_purchase_to_earn': '0',
  'loyalty.expiration_months': '12',
  'loyalty.allow_with_promo': 'true',
  'loyalty.tcg_enabled': 'true',
  'loyalty.product_enabled': 'true',
  'loyalty.earn_basis': 'NET_AFTER_DISCOUNTS',
  'loyalty.earn_rounding': 'FLOOR',
  'loyalty.show_points_on_receipt': 'true'
};

export default function LoyaltyManager({ clients = [] }) {
  const [clientId, setClientId] = useState('');
  const [data, setData] = useState(null);
  const [points, setPoints] = useState(0);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [rules, setRules] = useState({ ...defaults });
  const [exampleSale, setExampleSale] = useState(1000);

  useEffect(() => {
    api('/api/v1/content/settings?prefix=loyalty.').
    then((r) => setRules({ ...defaults, ...Object.fromEntries((r.data || []).map((x) => [x.parametro, x.valor])) })).
    catch((e) => setMessage(e.message));
  }, []);

  async function load(id = clientId) {
    if (!id) {setData(null);return;}
    try {
      const r = await api(`/api/v1/benefits/clients/${id}`);
      setData(r.data);setMessage('');
    } catch (e) {setMessage(e.message);}
  }

  async function adjust() {
    try {
      const r = await api(`/api/v1/benefits/clients/${clientId}/adjust`, {
        method: 'POST', body: JSON.stringify({ points, reason })
      });
      setData(r.data);setPoints(0);setReason('');setMessage('Ajuste registrado en el ledger.');
    } catch (e) {setMessage(e.message);}
  }

  function setRule(key, value) {setRules((x) => ({ ...x, [key]: String(value) }));}

  async function saveRules() {
    try {
      await api('/api/v1/content/settings', { method: 'PUT', body: JSON.stringify(rules) });
      setMessage('Reglas de fidelidad guardadas. Las siguientes ventas usarán esta configuración.');
    } catch (e) {setMessage(e.message);}
  }

  const calc = useMemo(() => {
    const sale = Math.max(0, Number(exampleSale || 0));
    const percent = Math.max(0, Number(rules['loyalty.earn_percent'] || 0));
    const pointValue = Math.max(.0001, Number(rules['loyalty.point_value_mxn'] || .1));
    const rewardValue = sale * (percent / 100);
    const raw = rewardValue / pointValue;
    const rounding = String(rules['loyalty.earn_rounding'] || 'FLOOR').toUpperCase();
    const earned = rounding === 'ROUND' ? Math.round(raw) : rounding === 'CEIL' ? Math.ceil(raw) : Math.floor(raw);
    return { sale, percent, pointValue, rewardValue, earned };
  }, [rules, exampleSale]);

  return <div className="loyalty-admin-v2">
    {message ? <div className="message">{message}</div> : null}

    <article className="contentmk-card loyalty-rules-card">
      <div className="loyalty-rules-head">
        <div><h3>Reglas de fidelidad</h3><p>Estas reglas se aplican automáticamente a cada venta identificada con un cliente.</p></div>
        <button onClick={saveRules}>Guardar reglas</button>
      </div>

      <div className="contentmk-fields cols3">
        <label className="check-field"><input type="checkbox" checked={rules['loyalty.enabled'] === 'true'} onChange={(e) => setRule('loyalty.enabled', e.target.checked)} /><span>Programa activo</span></label>

        <label>% de recompensa por venta
          <input type="number" min="0" max="100" step=".01" value={rules['loyalty.earn_percent']} onChange={(e) => setRule('loyalty.earn_percent', e.target.value)} />
          <small>Ej. 2% significa devolver al cliente valor equivalente al 2% de su compra en puntos.</small>
        </label>

        <label>Valor de 1 punto (MXN)
          <input type="number" min=".01" step=".01" value={rules['loyalty.point_value_mxn']} onChange={(e) => setRule('loyalty.point_value_mxn', e.target.value)} />
          <small>Ej. $0.10 por punto → 10 puntos = $1.00 MXN.</small>
        </label>

        <label>Máximo de compra pagable con puntos (%)
          <input type="number" min="0" max="100" step="1" value={rules['loyalty.max_redemption_percent']} onChange={(e) => setRule('loyalty.max_redemption_percent', e.target.value)} />
        </label>

        <label>Compra mínima para generar puntos
          <input type="number" min="0" step=".01" value={rules['loyalty.min_purchase_to_earn']} onChange={(e) => setRule('loyalty.min_purchase_to_earn', e.target.value)} />
        </label>

        <label>Caducidad de puntos (meses)
          <input type="number" min="0" step="1" value={rules['loyalty.expiration_months']} onChange={(e) => setRule('loyalty.expiration_months', e.target.value)} />
          <small>0 = sin caducidad automática.</small>
        </label>

        <label>Base para recompensa
          <select value={rules['loyalty.earn_basis']} onChange={(e) => setRule('loyalty.earn_basis', e.target.value)}>
            <option value="NET_AFTER_DISCOUNTS">Total neto después de descuentos</option>
            <option value="SUBTOTAL_BEFORE_DISCOUNTS">Subtotal antes de descuentos</option>
          </select>
        </label>

        <label>Redondeo de puntos
          <select value={rules['loyalty.earn_rounding']} onChange={(e) => setRule('loyalty.earn_rounding', e.target.value)}>
            <option value="FLOOR">Hacia abajo</option>
            <option value="ROUND">Al más cercano</option>
            <option value="CEIL">Hacia arriba</option>
          </select>
        </label>

        <label className="check-field"><input type="checkbox" checked={rules['loyalty.allow_with_promo'] === 'true'} onChange={(e) => setRule('loyalty.allow_with_promo', e.target.checked)} /><span>Combinar puntos + promociones</span></label>
        <label className="check-field"><input type="checkbox" checked={rules['loyalty.product_enabled'] === 'true'} onChange={(e) => setRule('loyalty.product_enabled', e.target.checked)} /><span>Generar puntos en POS Productos</span></label>
        <label className="check-field"><input type="checkbox" checked={rules['loyalty.tcg_enabled'] === 'true'} onChange={(e) => setRule('loyalty.tcg_enabled', e.target.checked)} /><span>Generar puntos en POS TCG</span></label>
        <label className="check-field"><input type="checkbox" checked={rules['loyalty.show_points_on_receipt'] === 'true'} onChange={(e) => setRule('loyalty.show_points_on_receipt', e.target.checked)} /><span>Mostrar puntos en comprobante</span></label>
      </div>

      <div className="loyalty-example">
        <div>
          <label>Ejemplo de venta<input type="number" min="0" step="100" value={exampleSale} onChange={(e) => setExampleSale(Number(e.target.value || 0))} /></label>
        </div>
        <div className="loyalty-formula">
          <span>Venta <b>${calc.sale.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b></span>
          <span>Recompensa {calc.percent}% <b>${calc.rewardValue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
          <span>Valor punto <b>${calc.pointValue.toFixed(2)}</b></span>
          <strong>Genera aproximadamente {calc.earned.toLocaleString('es-MX')} puntos</strong>
        </div>
      </div>

      <div className="architecture-note">
        <b>Registro por venta</b>
        <p>{brandText("Al confirmar una venta con cliente, GMX guarda los puntos generados en ")}<code>pedidos.puntos_generados</code> y crea un movimiento <code>GENERACION</code> en el ledger. Si se usan puntos, registra también <code>REDENCION</code>. Cancelaciones y devoluciones crean movimientos inversos en lugar de borrar historial.</p>
      </div>
    </article>

    <div className="loyalty-account-grid">
      <article className="contentmk-card">
        <h3>Cuenta de cliente</h3>
        <div className="contentmk-fields cols2">
          <label className="span2">Cliente<select value={clientId} onChange={(e) => {setClientId(e.target.value);load(e.target.value);}}><option value="">Selecciona...</option>{clients.map((c) => <option key={c.row_id} value={c.id_cliente}>{c.nombre} · {c.email || c.telefono || c.id_cliente}</option>)}</select></label>
          <div className="loyalty-balance"><span>Saldo</span><strong>{Number(data?.account?.puntos_disponibles || 0)} pts</strong><small>Nivel {data?.account?.nivel || 'BASE'}</small></div>
          <div className="loyalty-balance"><span>Valor aproximado</span><strong>${(Number(data?.account?.puntos_disponibles || 0) * Number(rules['loyalty.point_value_mxn'] || .1)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>según valor actual por punto</small></div>
          <label>Ajuste (+ / -)<input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value || 0))} /></label>
          <label>Motivo<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obligatorio para auditoría" /></label>
        </div>
        <button disabled={!clientId || !points || !reason.trim()} onClick={adjust}>Registrar ajuste</button>
      </article>

      <article className="contentmk-card"><h3>Ledger de puntos</h3>
        <div className="contentmk-table"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Puntos</th><th>Saldo</th><th>Pedido</th><th>Motivo</th></tr></thead><tbody>
        {(data?.movements || []).map((m) => <tr key={m.row_id}><td>{new Date(m.fecha).toLocaleString('es-MX')}</td><td>{m.tipo}</td><td className={Number(m.puntos) >= 0 ? 'points-plus' : 'points-minus'}>{Number(m.puntos) >= 0 ? '+' : ''}{m.puntos}</td><td>{m.saldo_nuevo}</td><td>{m.id_pedido || '—'}</td><td>{m.motivo || '—'}</td></tr>)}
        {!data?.movements?.length ? <tr><td colSpan="6"><div className="empty-box">Selecciona un cliente para ver sus ventas y movimientos de fidelidad.</div></td></tr> : null}
        </tbody></table></div>
      </article>
    </div>
  </div>;
}
