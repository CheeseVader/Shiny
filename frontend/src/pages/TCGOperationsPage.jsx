import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { api } from '../services/api.js';
import { parseCsv, toCsv, downloadText } from '../utils/csv.js';

const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export default function TCGOperationsPage() {
  const [tab, setTab] = useState('move');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [variants, setVariants] = useState([]);
  const [movements, setMovements] = useState([]);
  const [counts, setCounts] = useState([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [moveSearch, setMoveSearch] = useState('');
  const [adjustSearch, setAdjustSearch] = useState('');
  const [labelSearch, setLabelSearch] = useState('');
  const [labelCodeType, setLabelCodeType] = useState('QR');

  const [transfer, setTransfer] = useState({ code: '', originBranchId: '', destBranchId: '', quantity: 1, reason: '' });
  const [adjust, setAdjust] = useState({ code: '', branchId: '', targetStock: 0, reason: '' });

  const [labelSelection, setLabelSelection] = useState({});
  const [labelSize, setLabelSize] = useState('50x30');
  const [showPrice, setShowPrice] = useState(true);
  const [labelHtml, setLabelHtml] = useState('');

  const [activeCount, setActiveCount] = useState(null);
  const [countCode, setCountCode] = useState('');
  const [bulkRows, setBulkRows] = useState([]);

  async function loadCore() {
    const b = await api('/api/v1/branches?includeInactive=false');
    setBranches(b.data || []);
    if (!branchId && b.data?.[0]) {
      const id = b.data[0].id_sucursal;
      setBranchId(id);
      setTransfer((x) => ({ ...x, originBranchId: id }));
      setAdjust((x) => ({ ...x, branchId: id }));
    }
  }

  async function loadOperational() {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const [v, m, c] = await Promise.all([
    api(`/api/v1/tcg-ops/variants${q}${q ? '&' : '?'}limit=500`),
    api(`/api/v1/tcg-ops/movements${q}${q ? '&' : '?'}limit=500`),
    api(`/api/v1/tcg-ops/counts${q}${q ? '&' : '?'}limit=200`)]
    );
    setVariants(v.data || []);
    setMovements(m.data || []);
    setCounts(c.data || []);
  }

  useEffect(() => {loadCore().catch((e) => setMessage(e.message));}, []);
  useEffect(() => {
    if (branchId) {
      setTransfer((x) => ({ ...x, originBranchId: x.originBranchId || branchId }));
      setAdjust((x) => ({ ...x, branchId }));
      loadOperational().catch((e) => setMessage(e.message));
    }
  }, [branchId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return variants.filter((v) =>
    v.id_sucursal === branchId && (
    !q || [
    v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q)))
    );
  }, [variants, search, branchId]);


  const moveVariants = useMemo(() => {
    const q = moveSearch.trim().toLowerCase();
    return variants.filter((v) =>
    v.id_sucursal === transfer.originBranchId && (
    !q || [v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q)))
    ).slice(0, 100);
  }, [variants, transfer.originBranchId, moveSearch]);

  const adjustVariants = useMemo(() => {
    const q = adjustSearch.trim().toLowerCase();
    return variants.filter((v) =>
    v.id_sucursal === adjust.branchId && (
    !q || [v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q)))
    ).slice(0, 100);
  }, [variants, adjust.branchId, adjustSearch]);

  const labelVariants = useMemo(() => {
    const q = labelSearch.trim().toLowerCase();
    return filtered.filter((v) =>
    !q || [v.carta, v.sku, v.id_inventario, v.rareza, v.condicion, v.idioma, v.edicion].
    some((x) => String(x || '').toLowerCase().includes(q))
    );
  }, [filtered, labelSearch]);

  function variantText(v) {
    const cardLabel = `${v.carta || 'Carta'}${v.rareza ? ` (${v.rareza})` : ''}`;
    return [
    cardLabel,
    v.sku,
    v.id_inventario,
    [v.idioma, v.condicion, v.acabado, v.edicion].filter(Boolean).join(' · '),
    `Stock ${Number(v.stock || 0)}`].
    filter(Boolean).join(' — ');
  }

  async function doTransfer() {
    try {
      const r = await api('/api/v1/tcg-ops/transfer', { method: 'POST', body: JSON.stringify(transfer) });
      setMessage(`Transferencia ${r.data.id_movimiento}: origen ${r.data.origin_stock}, destino ${r.data.dest_stock}`);
      setTransfer((x) => ({ ...x, code: '', quantity: 1, reason: '' }));
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  async function doAdjust() {
    try {
      const r = await api('/api/v1/tcg-ops/adjust', { method: 'POST', body: JSON.stringify(adjust) });
      setMessage(`Ajuste ${r.data.id_movimiento}: ${r.data.delta >= 0 ? '+' : ''}${r.data.delta}`);
      setAdjust((x) => ({ ...x, code: '', reason: '' }));
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }


  function code39Svg(text) {
    const patterns = {
      '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn',
      '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
      'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn',
      'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
      'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
      'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
      '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn'
    };
    const value = `*${String(text || '').toUpperCase().replace(/[^0-9A-Z. \-]/g, '-')}*`;
    let x = 10,rects = '';
    for (const ch of value) {
      const p = patterns[ch] || patterns['-'];
      for (let i = 0; i < p.length; i++) {
        const w = p[i] === 'w' ? 3 : 1;
        if (i % 2 === 0) rects += `<rect x="${x}" y="5" width="${w}" height="44" fill="black"/>`;
        x += w;
      }
      x += 1;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 54" preserveAspectRatio="none">${rects}</svg>`;
  }

  function code128Svg(text) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    JsBarcode(svg, String(text || ''), {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      height: 42,
      width: 1.4
    });

    return svg.outerHTML;
  }
  async function generateLabels() {
    const chosen = variants.flatMap((v) => {
      const qty = Number(labelSelection[v.id_inventario] || 0);
      return qty > 0 ? Array.from({ length: qty }, () => v) : [];
    }).slice(0, 1000);
    if (!chosen.length) {setMessage('Selecciona al menos una etiqueta.');return;}
    const nodes = [];
    for (const v of chosen) {
      const payload = `TCG-STORE-TEMPLATE-TCG:${v.id_inventario}`;
      const data = labelCodeType === 'QR' ?
      await QRCode.toDataURL(payload, { margin: 0, width: 180, errorCorrectionLevel: 'M' }) :
      null;
      nodes.push(`<div class="print-label size-${labelSize} type-${labelCodeType.toLowerCase()}">
        ${labelCodeType === 'QR' ?
      `<img src="${data}" class="qr"/>` :
      `<div class="barcode">${code128Svg(v.id_inventario || v.sku || '')}</div>`}
        <div class="label-info"><strong>${escapeHtml(v.carta || '')}</strong>
        <span>${escapeHtml(v.sku || '')}</span>
        <span>${escapeHtml([v.rareza, v.idioma, v.condicion, v.edicion].filter(Boolean).join(' · '))}</span>
        ${showPrice ? `<b>${escapeHtml(money(Number(v.precio_oferta || 0) > 0 ? v.precio_oferta : v.precio))}</b>` : ''}
        <small class="label-payload">${escapeHtml(payload)}</small></div></div>`);
    }
    setLabelHtml(nodes.join(''));
    setTimeout(() => window.print(), 100);
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function newCount() {
    try {
      const r = await api('/api/v1/tcg-ops/counts', { method: 'POST', body: JSON.stringify({ branchId }) });
      setMessage(`Conteo ${r.data.id_conteo} abierto en modo ciego.`);
      await openCount(r.data.id_conteo);
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  async function openCount(id) {
    try {
      const r = await api(`/api/v1/tcg-ops/counts/${id}`);
      setActiveCount(r.data);
    } catch (e) {setMessage(e.message);}
  }

  async function captureCount() {
    try {
      await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/capture`, {
        method: 'POST',
        body: JSON.stringify({ code: countCode })
      });
      setCountCode('');
      await openCount(activeCount.id_conteo);
    } catch (e) {setMessage(e.message);}
  }

  async function setPhysical(d, value) {
    try {
      await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/capture`, {
        method: 'POST',
        body: JSON.stringify({ code: d.id_inventario, quantity: Number(value) })
      });
      await openCount(activeCount.id_conteo);
    } catch (e) {setMessage(e.message);}
  }

  async function closeCount(apply) {
    if (!(await window.gmxConfirm(
      apply ? '¿Cerrar y aplicar diferencias al inventario?' : '¿Cerrar sin aplicar diferencias?',
      { title: apply ? 'Aplicar conteo' : 'Cerrar conteo', confirmText: apply ? 'Aplicar diferencias' : 'Cerrar sin aplicar' }
    ))) return;
    try {
      const r = await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/close`, {
        method: 'POST', body: JSON.stringify({ applyAdjustments: apply, zeroUncounted: false })
      });
      setMessage(`Conteo ${r.data.status}. Diferencia ${r.data.diffTotal}.`);
      setActiveCount(null);
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  function downloadBlindCount() {
    if (!activeCount) return;
    const rows = (activeCount.details || []).map((d) => ({
      SKU: d.sku,
      IDInventario: d.id_inventario,
      Carta: d.carta,
      Rareza: d.rareza,
      Idioma: d.idioma,
      Condicion: d.condicion,
      Edicion: d.edicion,
      CantidadFisica: ''
    }));
    downloadText(`TCG_CONTEO_CIEGO_${activeCount.id_conteo}.csv`, toCsv(rows));
  }

  async function importBlind(file) {
    const rows = parseCsv(await file.text());
    for (const r of rows) {
      const code = r.IDInventario || r.SKU || r.Codigo;
      if (!code || r.CantidadFisica === '') continue;
      await api(`/api/v1/tcg-ops/counts/${activeCount.id_conteo}/capture`, {
        method: 'POST',
        body: JSON.stringify({ code, quantity: Number(r.CantidadFisica) })
      });
    }
    setMessage(`Conteo importado: ${rows.length} fila(s).`);
    await openCount(activeCount.id_conteo);
  }

  async function importBulk(file) {
    const rows = parseCsv(await file.text()).map((r) => ({
      operation: r.operation || r.Operacion || r.OPERACION,
      branchId: r.branchId || r.Sucursal || r.IDSucursal,
      originBranchId: r.originBranchId || r.SucursalOrigen,
      destBranchId: r.destBranchId || r.SucursalDestino,
      code: r.code || r.Codigo || r.SKU || r.IDInventario,
      quantity: Number(r.quantity || r.Cantidad || 1),
      targetStock: r.targetStock === '' ? undefined : Number(r.targetStock || r.StockObjetivo),
      reference: r.reference || r.Referencia || 'BULK',
      reason: r.reason || r.Motivo || 'Operación masiva'
    }));
    setBulkRows(rows);
  }

  async function runBulk() {
    try {
      const r = await api('/api/v1/tcg-ops/bulk', { method: 'POST', body: JSON.stringify({ rows: bulkRows }) });
      setMessage(`Operación masiva: ${r.data.ok} correctas, ${r.data.failed} fallidas.`);
      await loadOperational();
    } catch (e) {setMessage(e.message);}
  }

  function bulkTemplate() {
    downloadText(
      'GMX_TCG_MOVIMIENTOS_TEMPLATE.csv',
      'operation,branchId,originBranchId,destBranchId,code,quantity,targetStock,reference,reason\r\nTRANSFER,,SUC-001,SUC-002,TCG-SKU,1,,REF-002,Transferencia\r\nADJUST,SUC-001,,,TCG-SKU,1,10,REF-003,Ajuste físico'
    );
  }

  return <div className="tcgops-stack tcgops-essential">
    <section className="content-card">
      <div className="section-head">
        <div>
          <div className="eyebrow">TCG · OPERACIÓN ESENCIAL</div>
          <h2>Operación TCG</h2>
          <p className="section-copy">Herramientas físicas que no están cubiertas por POS ni por el Catálogo Maestro.</p>
        </div>
        <span className="phase-pill">10.6.2.4.1.9</span>
      </div>

      {message ? <div className="message">{message === 'VARIANT_NOT_IN_COUNT' ? 'La variante no pertenece al conteo activo. Vuelve a descargar la plantilla del conteo actual.' : message}</div> : null}

      <div className="tcgops-toolbar">
        <label>Sucursal
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}
          </select>
        </label>
        <label className="tcgops-search">Buscar variante física
          <input placeholder="Carta, SKU, ID, rareza, condición…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="tabs tcgops-tabs tcgops-tabs-essential">
        <button className={tab === 'move' ? 'tab active' : 'tab'} onClick={() => setTab('move')}>Movimientos</button>
        <button className={tab === 'labels' ? 'tab active' : 'tab'} onClick={() => setTab('labels')}>Etiquetas</button>
        <button className={tab === 'count' ? 'tab active' : 'tab'} onClick={() => setTab('count')}>Conteo físico</button>
      </div>

      {tab === 'move' ? <div className="tcgops-body">
        <div className="tcgops-purpose-note">
          <strong>Transferencias y ajustes.</strong>
          Las entradas de mercancía se hacen desde <b>Centro TCG → Recepción</b> y las ventas desde <b>Pedidos / POS</b>.
        </div>

        <div className="tcgops-two">
          <section className="ops-card">
            <h3>Transferencia entre sucursales</h3>
            <p>Selecciona una variante disponible en la sucursal origen. No necesitas memorizar SKU ni IDs.</p>
            <label>Buscar variante<input value={moveSearch} onChange={(e) => setMoveSearch(e.target.value)} placeholder="Carta, SKU, rareza, condición…" /></label>
            <label>Variante
              <select value={transfer.code} onChange={(e) => setTransfer((x) => ({ ...x, code: e.target.value }))}>
                <option value="">Selecciona</option>
                {moveVariants.map((v) => <option key={`${v.id_inventario}-${v.id_sucursal}`} value={v.id_inventario || v.sku}>{variantText(v)}</option>)}
              </select>
            </label>
            <label>Origen<select value={transfer.originBranchId} onChange={(e) => setTransfer((x) => ({ ...x, originBranchId: e.target.value }))}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <label>Destino<select value={transfer.destBranchId} onChange={(e) => setTransfer((x) => ({ ...x, destBranchId: e.target.value }))}><option value="">Selecciona</option>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <label>Cantidad<input type="number" min="1" value={transfer.quantity} onChange={(e) => setTransfer((x) => ({ ...x, quantity: Number(e.target.value) }))} /></label>
            <label>Motivo<input value={transfer.reason} onChange={(e) => setTransfer((x) => ({ ...x, reason: e.target.value }))} /></label>
            <button onClick={doTransfer}>Transferir</button>
          </section>

          <section className="ops-card">
            <h3>Ajuste controlado</h3>
            <p>Para correcciones físicas justificadas. Selecciona una variante existente.</p>
            <label>Buscar variante<input value={adjustSearch} onChange={(e) => setAdjustSearch(e.target.value)} placeholder="Carta, SKU, rareza, condición…" /></label>
            <label>Variante
              <select value={adjust.code} onChange={(e) => {
                const code = e.target.value;
                const v = adjustVariants.find((x) => (x.id_inventario || x.sku) === code);
                setAdjust((x) => ({ ...x, code, targetStock: v ? Number(v.stock || 0) : x.targetStock }));
              }}>
                <option value="">Selecciona</option>
                {adjustVariants.map((v) => <option key={`${v.id_inventario}-${v.id_sucursal}`} value={v.id_inventario || v.sku}>{variantText(v)}</option>)}
              </select>
            </label>
            <label>Sucursal<select value={adjust.branchId} onChange={(e) => setAdjust((x) => ({ ...x, branchId: e.target.value }))}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
            <label>Stock objetivo<input type="number" min="0" value={adjust.targetStock} onChange={(e) => setAdjust((x) => ({ ...x, targetStock: Number(e.target.value) }))} /></label>
            <label>Motivo<input value={adjust.reason} onChange={(e) => setAdjust((x) => ({ ...x, reason: e.target.value }))} /></label>
            <button onClick={doAdjust}>Aplicar ajuste</button>
          </section>
        </div>

        <section className="tcgops-movement-history">
          <div className="section-head compact">
            <div><h3>Historial de movimientos</h3><p>Transferencias, recepciones, ajustes, ventas y conciliaciones quedan visibles aquí.</p></div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>SKU</th><th>Origen</th><th>Destino</th><th>Cantidad</th><th>Referencia</th></tr></thead>
            <tbody>{movements.map((m) => <tr key={m.row_id}>
              <td>{m.fecha ? new Date(m.fecha).toLocaleString('es-MX') : '—'}</td><td>{m.tipo}</td><td>{m.sku}</td>
              <td>{m.sucursal_origen || '—'}</td><td>{m.sucursal_destino || '—'}</td><td>{m.cantidad}</td><td>{m.referencia || '—'}</td>
            </tr>)}</tbody>
          </table></div>
        </section>

        <details className="tcgops-advanced">
          <summary>Operaciones masivas avanzadas</summary>
          <p>Solo para transferencias y ajustes por lote. Las entradas normales deben registrarse mediante Recepción.</p>
          <div className="actions">
            <button className="secondary" onClick={bulkTemplate}>Descargar plantilla</button>
            <label className="file-btn">Cargar CSV<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && importBulk(e.target.files[0])} /></label>
            <button onClick={runBulk} disabled={!bulkRows.length}>Ejecutar {bulkRows.length || ''}</button>
          </div>
          {bulkRows.length ? <div className="message">Archivo preparado: {bulkRows.length} fila(s).</div> : null}
        </details>
      </div> : null}

      {tab === 'labels' ? <div className="tcgops-body">
        <div className="tcgops-purpose-note">
          <strong>Etiquetado de variantes físicas.</strong> Aquí sí se conserva una función TCG específica porque cada variante puede cambiar por idioma, condición, acabado o edición.
        </div>
        <div className="label-controls label-controls-improved">
          <input className="label-search" value={labelSearch} onChange={(e) => setLabelSearch(e.target.value)} placeholder="Buscar carta, SKU, ID, rareza…" />
          <select value={labelSize} onChange={(e) => setLabelSize(e.target.value)}><option value="50x30">50 × 30 mm</option><option value="60x40">60 × 40 mm</option></select>
          <select value={labelCodeType} onChange={(e) => setLabelCodeType(e.target.value)}>
            <option value="QR">Código QR</option>
            <option value="BARCODE">Código de barras</option>
          </select>
          <label className="check-label"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />Mostrar precio</label>
          <button className="secondary" onClick={() => setLabelSelection(Object.fromEntries(labelVariants.filter((v) => Number(v.stock || 0) > 0).map((v) => [v.id_inventario, 1])))}>Seleccionar con stock</button>
          <button onClick={generateLabels}>Generar / imprimir</button>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Carta / producto TCG</th><th>SKU / ID</th><th>Variante</th><th>Stock</th><th>Etiquetas</th></tr></thead>
          <tbody>{labelVariants.map((v) => <tr key={`${v.id_inventario}-${v.id_sucursal}`}>
            <td><strong>{v.carta}</strong></td>
            <td>{v.sku}<small className="block">{v.id_inventario}</small></td>
            <td>{[v.rareza, v.idioma, v.condicion, v.acabado, v.edicion].filter(Boolean).join(' · ') || '—'}</td>
            <td>{v.stock}</td>
            <td><input className="qty-small" type="number" min="0" max="1000" value={labelSelection[v.id_inventario] || 0} onChange={(e) => setLabelSelection((x) => ({ ...x, [v.id_inventario]: Number(e.target.value) }))} /></td>
          </tr>)}</tbody>
        </table></div>
        <div className="label-print-area" dangerouslySetInnerHTML={{ __html: labelHtml }} />
      </div> : null}

      {tab === 'count' ? <div className="tcgops-body">
        <div className="tcgops-purpose-note">
          <strong>Conteo físico.</strong> La plantilla es el método principal para inventarios grandes; el conteo manual por fila queda como alternativa para inventarios pequeños.
        </div>
        {!activeCount ? <>
          <div className="actions"><button onClick={newCount}>Nuevo conteo ciego</button></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Inicio</th><th>ID</th><th>Sucursal</th><th>Estado</th><th>Variantes</th><th>Diferencia</th><th></th></tr></thead>
            <tbody>{counts.map((c) => <tr key={c.row_id}>
              <td>{c.fecha_inicio ? new Date(c.fecha_inicio).toLocaleString('es-MX') : '—'}</td><td>{c.id_conteo}</td><td>{c.sucursal}</td><td>{c.estado}</td><td>{c.variantes_contadas}</td><td>{c.diferencia_unidades}</td>
              <td><button className="secondary compact" onClick={() => openCount(c.id_conteo)}>Abrir</button></td>
            </tr>)}</tbody>
          </table></div>
        </> : <section className="count-box">
          <div className="section-head"><div><div className="eyebrow">CONTEO CIEGO</div><h3>{activeCount.id_conteo} · {activeCount.sucursal}</h3></div><button className="secondary compact" onClick={() => setActiveCount(null)}>Cerrar vista</button></div>
          {activeCount.estado === 'ABIERTO' ? <>
            <div className="count-template-primary">
              <div>
                <strong>Método recomendado: plantilla de conteo</strong>
                <p>Descarga la plantilla generada desde el inventario actual, captura únicamente la cantidad física y vuelve a importarla.</p>
              </div>
              <div className="actions">
                <button className="secondary" onClick={downloadBlindCount}>1. Descargar plantilla</button>
                <label className="file-btn">2. Importar conteo<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && importBlind(e.target.files[0])} /></label>
              </div>
            </div>
            <details className="count-manual-fallback">
              <summary>Conteo manual guiado (opcional)</summary>
              <p>Úsalo cuando el conteo sea pequeño o no sea práctico trabajar con archivo. Escribe la cantidad física directamente en cada variante.</p>
            </details>
            <div className="table-wrap"><table>
              <thead><tr><th>Carta</th><th>SKU</th><th>Rareza</th><th>Condición</th><th>Cantidad física</th></tr></thead>
              <tbody>{(activeCount.details || []).map((d) => <tr key={d.row_id}>
                <td>{d.carta}</td><td>{d.sku}</td><td>{d.rareza || '—'}</td><td>{d.condicion}</td>
                <td><input className="qty-small" type="number" min="0" value={d.cantidad_fisica ?? ''} onBlur={(e) => e.target.value !== '' && setPhysical(d, e.target.value)} onChange={(e) => setActiveCount((c) => ({ ...c, details: c.details.map((x) => x.row_id === d.row_id ? { ...x, cantidad_fisica: e.target.value } : x) }))} /></td>
              </tr>)}</tbody>
            </table></div>
            <div className="count-footer"><button className="secondary" onClick={() => closeCount(false)}>Cerrar sin ajustes</button><button onClick={() => closeCount(true)}>Cerrar y conciliar inventario</button></div>
          </> : <div className="message">Conteo {activeCount.estado}. Sistema: {activeCount.unidades_sistema} · físico: {activeCount.unidades_fisicas} · diferencia: {activeCount.diferencia_unidades}</div>}
        </section>}
      </div> : null}
    </section>
  </div>;
}
