import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const moneyMxn = (v) => `${money(v)} MXN`;
const marketMoney = (v, currency = '') => {
  const n = Number(v || 0);if (!n) return '—';
  try {return n.toLocaleString('es-MX', { style: 'currency', currency: currency || 'MXN' });}
  catch {return `${n.toFixed(2)} ${currency || ''}`.trim();}
};
const friendlyBuylistError = (value) => {
  const msg = String(value || '');
  if (msg === 'BUYLIST_PRICE_REQUIRED' || msg === 'PRICE_REFERENCE_REQUIRED')
  return 'No hay precio de mercado comparable ni precio de tienda para esta carta. Captura el precio de tienda para poder valuarla.';
  if (msg === 'BUYLIST_USD_MXN_RATE_REQUIRED' || msg.includes('Configuración → Finanzas'))
  return 'Existe precio de mercado en USD, pero no hay un tipo de cambio vigente. Configúralo en Configuración → Finanzas.';
  if (msg.startsWith('BUYLIST_FOREIGN_MARKET_PRICE:'))
  return `Existe precio de mercado en ${msg.split(':')[1] || 'moneda extranjera'}, pero no hay conversión configurada.`;
  return msg;
};

export default function BuylistPage() {
  const [tab, setTab] = useState('new');
  const [clients, setClients] = useState([]);
  const [branches, setBranches] = useState([]);
  const [cardSearch, setCardSearch] = useState('');
  const [cardResults, setCardResults] = useState([]);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [games, setGames] = useState([]);
  const [ruleRarities, setRuleRarities] = useState([]);
  const [fx, setFx] = useState(null);
  const [buylists, setBuylists] = useState([]);
  const [clientId, setClientId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [items, setItems] = useState([]);
  const [buylistImportLoading, setBuylistImportLoading] = useState(false);
  const [buylistImportErrors, setBuylistImportErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [paymentReference, setPaymentReference] = useState('');
  const [ruleForm, setRuleForm] = useState({ prioridad: 100, codigo_juego: '', rareza: '', condicion: '', precio_min: '', precio_max: '', stock_min: '', stock_max: '', ajuste_puntos: 0, porcentaje_fijo: '', margen_minimo_pct: '', descripcion: '', activa: true });

  async function loadAll() {
    const [c, b, r, bl, g, fxr] = await Promise.all([
    api('/api/v1/clients?limit=300'),
    api('/api/v1/branches?includeInactive=false'),
    api('/api/v1/buylist/rules'),
    api('/api/v1/buylist?limit=300'),
    api('/api/v1/tcg/games'),
    api('/api/v1/buylist/fx/status')]
    );
    setClients(c.data);setBranches(b.data);setRules(r.data);setBuylists(bl.data);setGames(g.data || []);setFx(fxr.data || null);
    if (!branchId && b.data[0]) setBranchId(b.data[0].id_sucursal);
  }
  useEffect(() => {loadAll().catch((e) => setMessage(e.message));}, []);
  useEffect(() => {
    const game = games.find((g) => String(g.codigo || '').toUpperCase() === String(ruleForm.codigo_juego || '').toUpperCase());
    if (!game) {setRuleRarities([]);return;}
    api(`/api/v1/tcg/rarities?gameId=${encodeURIComponent(game.id_juego)}`).
    then((r) => setRuleRarities(r.data || [])).
    catch(() => setRuleRarities([]));
  }, [ruleForm.codigo_juego, games]);

  const total = useMemo(() => preview?.total || 0, [preview]);

  function addCard(c) {
    if (!c?.id_carta) return;
    setItems((cur) => [...cur, { id_carta: c.id_carta, carta: c.nombre, rareza: c.rareza || '', idioma: 'ES', condicion: 'NM', edicion: '', graded: false, empresa_grading: '', grado: '', certificado: '', cantidad: 1, precio_tienda_override: 0 }]);
    setCardSearch('');
    setCardResults([]);
    setPreview(null);
  }

  useEffect(() => {
    const term = cardSearch.trim();

    if (term.length < 2) {
      setCardResults([]);
      setCardSearchLoading(false);
      return;
    }

    let active = true;

    const timer = setTimeout(() => {
      setCardSearchLoading(true);

      api(`/api/v1/tcg/cards?search=${encodeURIComponent(term)}&limit=20`).
      then((r) => {
        if (active) setCardResults(r.data || []);
      }).
      catch((e) => {
        if (active) {
          setCardResults([]);
          setMessage(e.message);
        }
      }).
      finally(() => {
        if (active) setCardSearchLoading(false);
      });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cardSearch]);
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');

        resolve(
          comma >= 0 ?
          result.slice(comma + 1) :
          result
        );
      };

      reader.onerror = () => {
        reject(
          reader.error ||
          new Error('No fue posible leer el archivo Excel.')
        );
      };

      reader.readAsDataURL(file);
    });
  }

  async function importBuylistExcel(file) {
    if (!file) return;

    setBuylistImportLoading(true);
    setBuylistImportErrors([]);
    setPreview(null);

    try {
      const extension = String(
        file.name.split('.').pop() || ''
      ).toLowerCase();

      if (!['xlsx', 'xls'].includes(extension)) {
        throw new Error(
          'Formato no válido. Selecciona un archivo .xlsx o .xls.'
        );
      }

      const data = await fileToBase64(file);

      const parsed = await api(
        '/api/v1/buylist/import-preview',
        {
          method: 'POST',
          body: JSON.stringify({
            file: {
              name: file.name,
              type: file.type,
              data
            }
          })
        }
      );

      const rows = parsed?.data?.rows || [];

      if (!rows.length) {
        throw new Error(
          'El archivo Excel no contiene filas para importar.'
        );
      }

      const imported = [];
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};

        const line =
        Number(row.row_number) ||
        i + 2;

        const codigo = String(
          row.codigo || ''
        ).trim();

        const nombre = String(
          row.nombre || ''
        ).trim();

        const search = codigo || nombre;

        if (!search) {
          errors.push(
            `Fila ${line}: falta código o nombre.`
          );
          continue;
        }

        let result;

        try {
          result = await api(
            `/api/v1/tcg/cards?search=${encodeURIComponent(search)}&limit=20`
          );
        } catch (e) {
          errors.push(
            `Fila ${line}: error buscando "${search}": ${e.message}`
          );
          continue;
        }

        const cards = result.data || [];
        const normalized = search.toUpperCase();

        let card = cards.find((c) =>
        String(c.id_carta || '').
        toUpperCase() === normalized
        );

        if (!card) {
          card = cards.find((c) =>
          String(c.numero_completo || '').
          toUpperCase() === normalized
          );
        }

        if (!card && nombre) {
          const target = nombre.toUpperCase();

          const exact = cards.filter((c) =>
          String(c.nombre || '').
          trim().
          toUpperCase() === target
          );

          if (exact.length === 1) {
            card = exact[0];
          }

          if (exact.length > 1) {
            errors.push(
              `Fila ${line}: nombre ambiguo "${nombre}". Usa código.`
            );
            continue;
          }
        }

        if (!card) {
          if (cards.length === 1) {
            card = cards[0];
          } else {
            errors.push(
              `Fila ${line}: carta no encontrada o ambigua "${search}".`
            );
            continue;
          }
        }

        const cantidad = Math.max(
          1,
          Math.trunc(
            Number(row.cantidad || 1) || 1
          )
        );

        const condicion = String(
          row.condicion || 'NM'
        ).trim().toUpperCase();

        const idioma = String(
          row.idioma || 'ES'
        ).trim().toUpperCase();

        const gradedRaw = String(
          row.graded || ''
        ).trim().toLowerCase();

        const graded = [
        '1',
        'true',
        'si',
        'sí',
        'yes',
        'y'].
        includes(gradedRaw);

        imported.push({
          id_carta: card.id_carta,
          carta: card.nombre,

          rareza: String(
            row.rareza ||
            card.rareza ||
            ''
          ).trim(),

          idioma,
          condicion,

          edicion: String(
            row.edicion || ''
          ).trim(),

          graded,

          empresa_grading: String(
            row.empresa_grading || ''
          ).trim(),

          grado: String(
            row.grado || ''
          ).trim(),

          certificado: String(
            row.certificado || ''
          ).trim(),

          cantidad,
          precio_tienda_override: 0
        });
      }

      setBuylistImportErrors(errors);

      if (imported.length) {
        setItems((current) => [
        ...current,
        ...imported]
        );
      }

      setMessage(
        `Importación Excel: ${imported.length} línea(s) agregada(s)` + (
        errors.length ?
        ` · ${errors.length} error(es)` :
        '')
      );

    } catch (e) {
      setMessage(
        `Error importando Excel: ${e.message}`
      );
    } finally {
      setBuylistImportLoading(false);
    }
  }

  async function downloadBuylistTemplate() {
    try {
      setMessage('');
      setBuylistImportErrors([]);

      const response = await fetch(
        '/api/v1/buylist/template.xlsx',
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('GMX_AUTH_TOKEN')}`
          }
        }
      );

      if (!response.ok) {
        let message = 'No fue posible descargar la plantilla Excel.';

        try {
          const body = await response.json();
          message = body?.message || body?.error || message;
        } catch {}

        throw new Error(message);
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error('La plantilla recibida está vacía.');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = 'GMX_Buylist_Plantilla.xlsx';

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      setMessage('Plantilla Excel descargada correctamente.');

    } catch (e) {
      setMessage(
        `Error descargando plantilla: ${e.message}`
      );
    }
  }
  async function valuate() {
    try {
      const r = await api('/api/v1/buylist/preview', { method: 'POST', body: JSON.stringify({ branchId, items }) });
      setPreview(r.data);setMessage(`Valuación lista: ${money(r.data.total)}`);
    } catch (e) {setMessage(friendlyBuylistError(e.message));}
  }
  async function saveDraft() {
    try {
      const r = await api('/api/v1/buylist', { method: 'POST', body: JSON.stringify({ clientId, branchId, items }) });
      setItems([]);setPreview(null);setMessage(`Buylist ${r.data.id_buylist} creada.`);
      await loadAll();setTab('history');
    } catch (e) {setMessage(friendlyBuylistError(e.message));}
  }
  async function openBuylist(rowId) {
    try {const r = await api(`/api/v1/buylist/${rowId}`);setSelected(r.data);} catch (e) {setMessage(e.message);}
  }
  async function action(path, body = {}) {
    try {
      const r = await api(`/api/v1/buylist/${selected.row_id}/${path}`, { method: 'POST', body: JSON.stringify(body) });
      setSelected(r.data);setMessage(`Buylist ${r.data.id_buylist}: ${r.data.estado}`);
      await loadAll();
    } catch (e) {setMessage(e.message);}
  }

  async function addRule() {
    try {
      await api('/api/v1/buylist/rules', { method: 'POST', body: JSON.stringify(ruleForm) });
      setMessage('Regla creada.');const r = await api('/api/v1/buylist/rules');setRules(r.data);
    } catch (e) {setMessage(e.message);}
  }

  return <div className="buylist-stack">
    <section className="content-card">
      <div className="section-head"><div><div className="eyebrow">TCG · BUYLIST</div><h2>Compra de cartas a clientes</h2></div><span className="phase-pill">Fase Local 8</span></div>
      {message ? <div className="message">{message}</div> : null}
      <div className="tabs">
        <button className={tab === 'new' ? 'tab active' : 'tab'} onClick={() => setTab('new')}>Nueva Buylist</button>
        <button className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>Historial</button>
        <button className={tab === 'rules' ? 'tab active' : 'tab'} onClick={() => setTab('rules')}>Reglas</button>
      </div>

      {tab === 'new' ? <div className="buylist-body">
        <div className="buylist-top">
          <label>Cliente<select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Público general</option>{clients.map((c) => <option key={c.row_id} value={c.id_cliente}>{c.nombre || c.id_cliente}</option>)}</select></label>
          <label>Sucursal<select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
          <label className="buylist-card-search">
            Buscar carta por nombre o código
            <input
              type="search"
              value={cardSearch}
              placeholder="Ej. Lava Golem o RA01-EN001"
              autoComplete="off"
              onChange={(e) => setCardSearch(e.target.value)} />
            

            {cardSearchLoading ? <small>Buscando...</small> : null}

            {cardSearch.trim().length >= 2 && !cardSearchLoading && cardResults.length === 0 ?
            <small>Sin resultados</small> :
            null}

            {cardResults.length > 0 ?
            <div className="buylist-card-results">
                {cardResults.map((c) =>
              <button
                key={c.id_carta}
                type="button"
                className="buylist-card-result"
                onClick={() => addCard(c)}>
                
                    <strong>{c.nombre}</strong>
                    <span>{c.numero_completo || c.id_carta}{c.rareza ? ` · ${c.rareza}` : ''}</span>
                  </button>
              )}
              </div> :
            null}
          </label>
        </div>
        <div className="buylist-import-card">
          <div>
            <strong>Importar cartas desde Excel</strong>

            <small className="block">
              Carga múltiples cartas desde un archivo Excel.
              Formatos admitidos: .xlsx y .xls.
            </small>

            <small className="block">
              Identificación por código o nombre.
              Las filas con errores no serán agregadas.
            </small>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
            
            <label
              className="secondary compact"
              style={{
                cursor: buylistImportLoading ?
                'not-allowed' :
                'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '40px',
                padding: '0 16px',
                border: '1px solid currentColor',
                borderRadius: '8px',
                fontWeight: 700
              }}>
              
              {buylistImportLoading ?
              'Importando...' :
              'Importar Excel'}

              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                disabled={buylistImportLoading}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];

                  if (file) {
                    importBuylistExcel(file);
                  }

                  e.target.value = '';
                }} />
              
            </label>

            <button
              type="button"
              className="secondary compact"
              onClick={downloadBuylistTemplate}
              disabled={buylistImportLoading}
              style={{
                minHeight: '40px',
                padding: '0 16px',
                fontWeight: 700
              }}>
              
              Descargar plantilla
            </button>
          </div>
        </div>

        {buylistImportErrors.length > 0 ?
        <div className="message">
            <strong>Filas no importadas:</strong>

            <ul>
              {buylistImportErrors.map((error, i) =>
            <li key={i}>{error}</li>
            )}
            </ul>
          </div> :
        null}
        <div className="buylist-pricing-note">
          <strong>Valuación automática.</strong>{brandText("\n          GMX convierte precios USD a MXN con el TC vigente y compara Mercado MXN contra Precio tienda. La base predeterminada es el menor de ambos; después aplica condición y reglas Buylist.\n        ")}

        </div>
        <div className={`buylist-fx-card buylist-fx-readonly ${fx?.available ? 'is-ready' : 'is-missing'}`}>
          <div>
            <span className="eyebrow">TC GLOBAL USD → MXN</span>
            <strong>{fx?.available ? `${Number(fx.rate).toFixed(4)} MXN/USD` : 'Tipo de cambio no disponible'}</strong>
            <small>{fx?.available ?
              `${fx.source}${fx.location ? ` · ${fx.location}` : ''} · ${fx.rate_date}` :
              'Configúralo en Configuración → Finanzas.'}</small>
          </div>
        </div>
        <div className="buylist-lines">{items.map((x, i) => <div className="buylist-line" key={i}>
          <div><strong>{x.carta}</strong><span>{x.rareza || 'Sin rareza'}</span></div>
          <label>Cond.<select value={x.condicion} onChange={(e) => {setItems((a) => a.map((y, j) => j === i ? { ...y, condicion: e.target.value } : y));setPreview(null);}}><option>NM</option><option>LP</option><option>MP</option><option>HP</option><option>DMG</option></select></label>
          <label>Idioma<select value={x.idioma} onChange={(e) => setItems((a) => a.map((y, j) => j === i ? { ...y, idioma: e.target.value } : y))}><option>ES</option><option>EN</option><option>JP</option></select></label>
          <label>Cant.<input type="number" min="1" value={x.cantidad} onChange={(e) => {setItems((a) => a.map((y, j) => j === i ? { ...y, cantidad: Number(e.target.value) } : y));setPreview(null);}} /></label>
          <label>Precio tienda
            <input type="number" min="0" step=".01" value={x.precio_tienda_override || ''} placeholder="Automático si existe" onChange={(e) => {setItems((a) => a.map((y, j) => j === i ? { ...y, precio_tienda_override: Number(e.target.value || 0) } : y));setPreview(null);}} />
          </label>
          <button className="danger compact" onClick={() => {setItems((a) => a.filter((_, j) => j !== i));setPreview(null);}}>×</button>
        </div>)}</div>
        <div className="buylist-actions"><button className="secondary" onClick={valuate} disabled={!items.length}>Valuar</button><div><span>Oferta calculada</span><strong>{moneyMxn(total)}</strong></div><button onClick={saveDraft} disabled={!preview}>Guardar Buylist</button></div>
        {preview ? <div className="table-wrap buylist-price-table"><table><thead><tr>
          <th>Carta</th><th>Condición</th><th>Mercado MXN</th><th>{brandText("Tienda GMX (MXN)")}</th><th>Base Buylist (MXN)</th><th>Origen base</th><th>% compra</th><th>Oferta unit. (MXN)</th><th>Oferta línea (MXN)</th><th>Regla</th>
        </tr></thead><tbody>{preview.items.map((x, i) => <tr key={i}>
          <td><strong>{x.carta}</strong><small className="block">{x.proveedor_mercado || 'Sin fuente de mercado'}</small></td>
          <td>{x.condicion}</td>
          <td>
            <strong>{x.precio_mercado_mxn ? moneyMxn(x.precio_mercado_mxn) : x.moneda_mercado === 'MXN' ? moneyMxn(x.precio_mercado) : '—'}</strong>
            {x.moneda_mercado === 'USD' && x.precio_mercado ?
                  <small className="block">Origen: {marketMoney(x.precio_mercado, 'USD')} · TC {Number(x.tipo_cambio_mercado || 0).toFixed(4)} MXN/USD</small> :
                  <small className="block">{x.proveedor_mercado || 'Precio de mercado'}</small>}
          </td>
          <td>{moneyMxn(x.precio_tienda)}</td>
          <td><strong>{moneyMxn(x.precio_base_buylist)}</strong></td>
          <td><span className="buylist-base-pill">{String(x.fuente_base_buylist || '').replaceAll('_', ' ')}</span></td>
          <td>{x.porcentaje_compra}%</td><td>{moneyMxn(x.oferta_unitario)}</td><td>{moneyMxn(x.oferta_linea)}</td><td>{x.regla?.id_regla || 'BASE'}</td>
        </tr>)}</tbody></table></div> : null}
      </div> : null}

      {tab === 'history' ? <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Buylist</th><th>Cliente</th><th>Sucursal</th><th>Unidades</th><th>Oferta</th><th>Estado</th><th>Pago</th><th></th></tr></thead><tbody>{buylists.map((b) => <tr key={b.row_id}><td>{b.fecha ? new Date(b.fecha).toLocaleString('es-MX') : '—'}</td><td>{b.id_buylist}</td><td>{b.cliente || 'Público general'}</td><td>{b.sucursal}</td><td>{b.unidades}</td><td>{moneyMxn(b.oferta_total)}</td><td>{b.estado}</td><td>{b.estado_pago}</td><td><button className="secondary compact" onClick={() => openBuylist(b.row_id)}>Abrir</button></td></tr>)}</tbody></table></div> : null}

      {tab === 'rules' ? <div className="buylist-body">
        <div className="rule-form"><h3>Nueva regla</h3><div className="form-grid">
          <label>Prioridad<input type="number" value={ruleForm.prioridad} onChange={(e) => setRuleForm((x) => ({ ...x, prioridad: Number(e.target.value) }))} /></label>
          <label>TCG<select value={ruleForm.codigo_juego} onChange={(e) => setRuleForm((x) => ({ ...x, codigo_juego: e.target.value, rareza: '' }))}>
            <option value="">Todos los TCG</option>
            {games.map((g) => <option key={g.row_id} value={g.codigo}>{g.nombre}</option>)}
          </select></label>
          <label>Rareza<select value={ruleForm.rareza} onChange={(e) => setRuleForm((x) => ({ ...x, rareza: e.target.value }))} disabled={!ruleForm.codigo_juego}>
            <option value="">Todas las rarezas</option>
            {ruleRarities.map((r) => <option key={r.row_id || r.id_rareza || r.nombre} value={r.nombre || r.rareza || r.codigo}>{r.nombre || r.rareza || r.codigo}</option>)}
          </select></label>
          <label>Condición<select value={ruleForm.condicion} onChange={(e) => setRuleForm((x) => ({ ...x, condicion: e.target.value }))}><option value="">Todas</option><option>NM</option><option>LP</option><option>MP</option><option>HP</option><option>DMG</option></select></label>
          <label>% fijo<input type="number" value={ruleForm.porcentaje_fijo} onChange={(e) => setRuleForm((x) => ({ ...x, porcentaje_fijo: e.target.value }))} /></label>
          <label>Ajuste puntos<input type="number" value={ruleForm.ajuste_puntos} onChange={(e) => setRuleForm((x) => ({ ...x, ajuste_puntos: e.target.value }))} /></label>
          <label>Margen mínimo %<input type="number" value={ruleForm.margen_minimo_pct} onChange={(e) => setRuleForm((x) => ({ ...x, margen_minimo_pct: e.target.value }))} /></label>
          <label>Descripción (opcional)<input placeholder="Ej. Pokémon alta demanda" value={ruleForm.descripcion} onChange={(e) => setRuleForm((x) => ({ ...x, descripcion: e.target.value }))} /></label>
        </div><button onClick={addRule}>Crear regla</button></div>
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Activa</th><th>Prioridad</th><th>Juego</th><th>Rareza</th><th>Condición</th><th>% fijo</th><th>Ajuste</th><th>Margen</th></tr></thead><tbody>{rules.map((r) => <tr key={r.row_id}><td>{r.id_regla}</td><td>{r.activa ? 'Sí' : 'No'}</td><td>{r.prioridad}</td><td>{r.codigo_juego || 'Todos'}</td><td>{r.rareza || 'Todas'}</td><td>{r.condicion || 'Todas'}</td><td>{r.porcentaje_fijo ?? '—'}</td><td>{r.ajuste_puntos ?? 0}</td><td>{r.margen_minimo_pct ?? '—'}</td></tr>)}</tbody></table></div>
      </div> : null}
    </section>

    {selected ? <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><div className="modal buylist-modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div><div className="eyebrow">BUYLIST</div><h2>{selected.id_buylist}</h2><p className="section-copy">{selected.cliente} · {money(selected.oferta_total)}</p></div><button className="icon-btn" onClick={() => setSelected(null)}>×</button></div>
      <div className="buylist-status"><span>Estado <strong>{selected.estado}</strong></span><span>Pago <strong>{selected.estado_pago}</strong></span></div>
      <div className="table-wrap"><table><thead><tr><th>Carta</th><th>Cant.</th><th>Cond.</th><th>Oferta unit.</th><th>Total</th><th>Inventario</th></tr></thead><tbody>{(selected.detalles || []).map((d) => <tr key={d.row_id}><td>{d.carta}</td><td>{d.cantidad}</td><td>{d.condicion}</td><td>{moneyMxn(d.oferta_unitario)}</td><td>{moneyMxn(d.oferta_linea)}</td><td>{d.id_inventario_ingreso || '—'}</td></tr>)}</tbody></table></div>
      {selected.estado === 'BORRADOR' ? <div className="decision-box"><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>EFECTIVO</option><option>TRANSFERENCIA</option><option>CREDITO_TIENDA</option></select><input placeholder="Referencia pago" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /><button onClick={() => action('decision', { decision: 'ACCEPT', paymentMethod, reference: paymentReference })}>Aceptar</button><button className="danger" onClick={() => action('decision', { decision: 'REJECT', reason: 'Cliente rechazó la oferta' })}>Rechazar</button></div> : null}
      {selected.estado === 'ACEPTADA' && selected.estado_pago === 'PENDIENTE' ? <button onClick={() => action('pay')}>Registrar pago</button> : null}
      {selected.estado === 'ACEPTADA' && selected.estado_pago === 'PAGADO' ? <button onClick={() => action('convert')}>Convertir a inventario</button> : null}
      {!['CANCELADA', 'RECHAZADA'].includes(selected.estado) ? <button className="danger secondary-danger" onClick={() => {const reason = prompt('Motivo de cancelación:') || '';action('cancel', { reason });}}>Cancelar / revertir</button> : null}
      <div className="audit-list"><h3>Auditoría</h3>{(selected.auditoria || []).map((a) => <div key={a.row_id}><strong>{a.accion}</strong><span>{a.estado_anterior || '—'} → {a.estado_nuevo || '—'}</span><small>{a.detalle || ''}</small></div>)}</div>
    </div></div> : null}
  </div>;
}
