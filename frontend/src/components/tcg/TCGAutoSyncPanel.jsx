import { brandText } from "../../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api.js';

function when(value) {
  if (!value) return 'Nunca';
  try {return new Date(value).toLocaleString('es-MX');} catch {return String(value);}
}
function money(value, currency) {
  if (value == null || value === '') return '—';
  try {return Number(value).toLocaleString('es-MX', { style: 'currency', currency: currency || 'USD' });}
  catch {return `${value} ${currency || ''}`;}
}

export default function TCGAutoSyncPanel() {
  const [providers, setProviders] = useState([]);
  const [gameCode, setGameCode] = useState('');
  const [sets, setSets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [syncPrices, setSyncPrices] = useState(true);
  const [downloadImages, setDownloadImages] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [frequency, setFrequency] = useState('WEEKLY');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [cards, setCards] = useState([]);
  const [priceCard, setPriceCard] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [priceProvider, setPriceProvider] = useState('');
  const [lastCardSyncResult, setLastCardSyncResult] = useState(null);

  const current = providers.find((x) => x.game_code === gameCode) || null;

  async function loadProviders(preferred = '') {
    const r = await api('/api/v1/tcg-sync/providers');
    const list = r.data || [];
    setProviders(list);
    const next = preferred || gameCode || list[0]?.game_code || '';
    if (next) setGameCode(next);
    return list;
  }

  async function loadSets(code = gameCode) {
    if (!code) {setSets([]);return;}
    const r = await api(`/api/v1/tcg-sync/games/${encodeURIComponent(code)}/sets`);
    const list = r.data || [];
    setSets(list);
    const cfg = providers.find((x) => x.game_code === code);
    const configured = Array.isArray(cfg?.selected_sets) ? cfg.selected_sets : [];
    if (configured.length) setSelected(configured.filter((x) => list.some((s) => s.codigo === x)));
  }

  useEffect(() => {loadProviders().catch((e) => setMessage(e.message));}, []);

  useEffect(() => {
    if (!gameCode) return;
    const p = providers.find((x) => x.game_code === gameCode);
    setSyncPrices(p?.sync_prices !== false);
    setDownloadImages(p?.download_images === true);
    setAutoSync(p?.auto_sync_enabled === true);
    setFrequency(p?.auto_sync_frequency || 'WEEKLY');
    setSelected(Array.isArray(p?.selected_sets) ? p.selected_sets : []);
    setCards([]);setPriceData(null);setPriceCard(null);setSearch('');setLastCardSyncResult(null);
    loadSets(gameCode).catch((e) => setMessage(e.message));
  }, [gameCode, providers.length]);

  function toggleSet(code) {
    setSelected((x) => x.includes(code) ? x.filter((v) => v !== code) : [...x, code]);
  }

  async function saveConfig() {
    if (!gameCode) return;
    setBusy('config');setMessage('');
    try {
      await api(`/api/v1/tcg-sync/games/${encodeURIComponent(gameCode)}/config`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true, region: 'NA_LATAM', language: 'en',
          syncCards: true, syncPrices, downloadImages,
          selectedSets: selected, autoSyncEnabled: autoSync, autoSyncFrequency: frequency
        })
      });
      setMessage('Configuración de sincronización guardada.');
      await loadProviders(gameCode);
    } catch (e) {setMessage(e.message);} finally {setBusy('');}
  }

  async function syncSets() {
    if (!gameCode) return;
    setBusy('sets');setMessage('');
    try {
      const r = await api(`/api/v1/tcg-sync/games/${encodeURIComponent(gameCode)}/sync-sets`, {
        method: 'POST', body: '{}'
      });
      setMessage(
        r.data.mode === 'REMOTE_API' ?
        `${r.data.sourceUsed || r.data.provider}: ${r.data.sets} expansiones actualizadas.${r.data.warning ? ` ${r.data.warning}` : ''}` :
        `${r.data.provider}: catálogo maestro disponible (${r.data.sets} expansiones).`
      );
      await loadProviders(gameCode);
      await loadSets(gameCode);
    } catch (e) {
      setMessage(`No fue posible sincronizar expansiones: ${e.message}`);
      try {await loadProviders(gameCode);} catch {}
    } finally {setBusy('');}
  }

  async function syncCards() {
    if (!selected.length) return;
    setBusy('cards');setMessage('');
    try {
      const ok = await window.gmxConfirm?.(
        `Se sincronizarán únicamente ${selected.length} expansión(es) de ${current?.game_name || gameCode}. ¿Continuar?`,
        { title: 'Sincronización selectiva', confirmText: 'Sincronizar' }
      );
      if (ok === false) return;
      const r = await api(`/api/v1/tcg-sync/games/${encodeURIComponent(gameCode)}/sync-cards`, {
        method: 'POST',
        body: JSON.stringify({ setCodes: selected, downloadImages, syncPrices })
      });
      setLastCardSyncResult(r.data || null);
      const warnings = (r.data.sets || []).filter((x) => x.warning).length;
      const errors = (r.data.errors || []).length;
      if (errors) {
        setMessage(`${r.data.cards} cartas y ${r.data.prices} precios sincronizados. ${errors} expansión(es) con error. Revisa el detalle debajo.`);
      } else if (warnings) {
        setMessage(`${r.data.cards} cartas y ${r.data.prices} precios sincronizados correctamente usando fallback en ${warnings} expansión(es).`);
      } else {
        setMessage(`${r.data.cards} cartas y ${r.data.prices} precios sincronizados correctamente.`);
      }
      await loadProviders(gameCode);
      await loadSets(gameCode);
    } catch (e) {
      setLastCardSyncResult(null);
      setMessage(`No fue posible sincronizar cartas: ${e.message}`);
    } finally {setBusy('');}
  }

  async function install() {
    if (!selected.length) return;
    setBusy('install');setMessage('');
    try {
      const r = await api(`/api/v1/tcg-sync/games/${encodeURIComponent(gameCode)}/install`, {
        method: 'POST', body: JSON.stringify({ setCodes: selected })
      });
      setMessage(brandText(`Instalado en GMX: ${r.data.sets} expansiones, ${r.data.rarities} rarezas y ${r.data.cards} cartas sincronizadas.`));
    } catch (e) {setMessage(e.message);} finally {setBusy('');}
  }

  async function addSelectedToStore() {
    if (!selected.length || !gameCode) return;
    const ok = await window.gmxConfirm?.(brandText(
      `GMX revisará ${selected.length} expansión(es) de ${current?.game_name || gameCode}. Si ya existen, solo actualizará cambios y precios; no tocará stock ni costos. ¿Continuar?`),
    { title: 'Agregar expansiones a mi tienda', confirmText: 'Agregar' }
    );
    if (ok === false) return;

    const op = window.gmxOperation?.start({
      title: `Agregando ${selected.length} expansión(es)`,
      detail: 'Preparando trabajo…',
      progress: 1,
      etaSeconds: null,
      meta: { setsDone: 0, setsTotal: selected.length, cardsDone: 0, cardsTotal: 0, currentSet: '' }
    });

    setBusy('add');setMessage('');setLastCardSyncResult(null);

    try {
      const token = localStorage.getItem('GMX_AUTH_TOKEN') || '';
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-TCG-Store-Template-Progress': 'manual'
      };

      const startResponse = await fetch(`/api/v1/tcg-sync/games/${encodeURIComponent(gameCode)}/add-job`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ setCodes: selected, downloadImages, syncPrices })
      });
      const startJson = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok) throw new Error(startJson.message || startJson.error || `HTTP ${startResponse.status}`);

      const jobId = startJson.data?.id;
      if (!jobId) throw new Error('SYNC_JOB_ID_MISSING');

      let finalJob = null;
      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        const statusResponse = await fetch(`/api/v1/tcg-sync/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${token}`, 'X-TCG-Store-Template-Progress': 'manual' },
          cache: 'no-store'
        });
        const statusJson = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusJson.message || statusJson.error || `HTTP ${statusResponse.status}`);

        const job = statusJson.data || {};
        finalJob = job;

        window.gmxOperation?.update(op, {
          progress: Number(job.progress || 0),
          detail: job.message || 'Procesando…',
          etaSeconds: job.etaSeconds,
          meta: {
            setsDone: Number(job.processedSets || 0),
            setsTotal: Number(job.selectedSets || selected.length),
            cardsDone: Number(job.processedCards || 0),
            cardsTotal: Number(job.estimatedCards || 0),
            currentSet: job.currentSet || ''
          }
        });

        if (job.status === 'completed') break;
        if (job.status === 'failed') throw new Error(job.error || job.message || 'SYNC_JOB_FAILED');
      }

      const syncResult = finalJob?.result?.sync || null;
      const installResult = finalJob?.result?.install || {};
      const inc = finalJob?.result?.incrementalSummary || {};
      setLastCardSyncResult(syncResult);
      setMessage(
        `Listo: ${inc.insertedCards || 0} carta(s) nuevas, ${inc.updatedCards || 0} carta(s) actualizadas, ${inc.updatedPrices || 0} precio(s) actualizado(s) y ${inc.unchangedCards || 0} carta(s) sin cambios.`
      );

      await loadProviders(gameCode);
      await loadSets(gameCode);

      window.gmxOperation?.complete(op, {
        title: 'Expansiones agregadas',
        detail: 'El catálogo seleccionado ya está disponible en tu tienda.',
        keepMs: 1400
      });
    } catch (e) {
      setMessage(`No fue posible agregar las expansiones: ${e.message}`);
      window.gmxOperation?.fail(op, e);
    } finally {
      setBusy('');
    }
  }

  async function findCards(e) {
    e?.preventDefault();
    if (!gameCode) return;
    setBusy('search');
    try {
      const qs = new URLSearchParams({ gameCode, search, limit: '100' });
      const r = await api(`/api/v1/tcg-sync/cards?${qs}`);
      setCards(r.data || []);
    } catch (e2) {setMessage(e2.message);} finally {setBusy('');}
  }

  async function compare(card) {
    setPriceCard(card);setPriceData(null);setPriceProvider('');
    try {
      const r = await api(`/api/v1/tcg-sync/cards/${card.row_id}/prices`);
      setPriceData(r.data);
    } catch (e) {setMessage(e.message);}
  }

  const filteredPrices = useMemo(() => {
    const all = priceData?.prices || [];
    return priceProvider ? all.filter((x) => x.price_provider === priceProvider) : all;
  }, [priceData, priceProvider]);

  const priceProviders = useMemo(() => [...new Set((priceData?.prices || []).map((x) => x.price_provider))], [priceData]);

  return <div className="tcg-autosync-page">
    <section className="tcg-sync-explainer">
      <div><span>SYNC SELECTIVO</span><h3>Catálogo automático por TCG</h3><p>{brandText("GMX solo consulta el TCG seleccionado. Después eliges exactamente qué expansiones descargar.")}</p></div>
      <div className="tcg-sync-flow"><b>TCG</b><i>→</i><b>Expansiones</b><i>→</i><b>Cartas</b><i>→</i><b>Imágenes / precios</b></div>
    </section>

    {message ? <div className="message">{message}</div> : null}

    <div className="tcg-sync-layout">
      <aside className="tcg-provider-list">
        <div className="tcg-provider-head"><h3>TCG disponibles</h3><small>{providers.length} proveedores</small></div>
        {providers.map((p) => <button key={p.game_code} className={gameCode === p.game_code ? 'active' : ''} onClick={() => setGameCode(p.game_code)}>
          <div><b>{p.game_name || p.game_code}</b><small>{p.provider_name}</small></div>
          <span className={`provider-status ${String(p.status || '').toLowerCase()}`}>{p.supports_cards ? 'API completa' : 'Catálogo'}</span>
        </button>)}
      </aside>

      <main className="tcg-sync-main">
        {current ? <>
          <section className="tcg-sync-provider-card">
            <div className="tcg-sync-provider-title">
              <div><span>{current.provider_name}</span><h2>{current.game_name || current.game_code}</h2><p>{current.publisher || ''}</p></div>
              <div className="tcg-provider-capabilities">
                <span className={current.supports_sets ? 'yes' : 'no'}>Expansiones</span>
                <span className={current.supports_cards ? 'yes' : 'no'}>Cartas</span>
                <span className={current.supports_images ? 'yes' : 'no'}>Imágenes</span>
                <span className={current.supports_prices ? 'yes' : 'no'}>Precios</span>
              </div>
            </div>

            <div className="tcg-sync-stats">
              <div><span>Expansiones maestro</span><strong>{Number(current.master_sets || 0).toLocaleString('es-MX')}</strong></div>
              <div><span>Cartas sincronizadas</span><strong>{Number(current.master_cards || 0).toLocaleString('es-MX')}</strong></div>
              <div><span>Última sync sets</span><strong>{when(current.last_sets_sync_at)}</strong></div>
              <div><span>Última sync cartas</span><strong>{when(current.last_cards_sync_at)}</strong></div>
            </div>
            {current.last_error ? <div className="tcg-provider-error">{current.last_error}</div> : null}

            <div className="tcg-sync-actions">
              <button onClick={syncSets} disabled={!!busy}>{busy === 'sets' ? 'Actualizando…' : '1. Actualizar expansiones'}</button>
              <button className="secondary" onClick={saveConfig} disabled={!!busy}>{busy === 'config' ? 'Guardando…' : 'Guardar configuración'}</button>
            </div>
          </section>

          <section className="tcg-select-sets-card">
            <div className="section-head compact">
              <div><h3>2. Selecciona expansiones</h3><p>Solo las marcadas serán consideradas para cartas, imágenes, precios e instalación.</p></div>
              <div className="tcg-set-select-actions">
                <button className="secondary compact" onClick={() => setSelected(sets.map((x) => x.codigo))}>Todas</button>
                <button className="secondary compact" onClick={() => setSelected([])}>Ninguna</button>
              </div>
            </div>

            <div className="tcg-select-sets-grid">
              {sets.map((set) => <label key={set.row_id} className={selected.includes(set.codigo) ? 'selected' : ''}>
                <input type="checkbox" checked={selected.includes(set.codigo)} onChange={() => toggleSet(set.codigo)} />
                <div><b>{set.codigo} · {set.nombre}</b><small>{set.fecha_lanzamiento ? String(set.fecha_lanzamiento).slice(0, 10) : 'Fecha no registrada'} · {Number(set.total_cartas || 0)} cartas</small></div>
                <span>{Number(set.synced_cards || 0) > 0 ? `${set.synced_cards} sync` : 'No sync'}</span>
              </label>)}
              {!sets.length ? <div className="public-empty small">Primero actualiza las expansiones de este TCG.</div> : null}
            </div>
          </section>

          <section className="tcg-sync-options-card">
            <h3>3. Opciones</h3>
            <div className="tcg-sync-options">
              <label><input type="checkbox" checked={syncPrices} disabled={!current.supports_prices} onChange={(e) => setSyncPrices(e.target.checked)} /> Incluir precios de mercado</label>
              <label><input type="checkbox" checked={downloadImages} disabled={!current.supports_images} onChange={(e) => setDownloadImages(e.target.checked)} />{brandText(" Guardar imágenes en GMX")}</label>
              <label><input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} /> Mantener actualizado automáticamente</label>
              <label>Frecuencia<select value={frequency} disabled={!autoSync} onChange={(e) => setFrequency(e.target.value)}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option></select></label>
            </div>
            <div className="tcg-sync-actions">
              {current.supports_cards ?
              <button onClick={addSelectedToStore} disabled={!!busy || !selected.length}>
                  {busy === 'add' ? brandText("Agregando a GMX…") : `4. Agregar ${selected.length} expansión(es) a mi tienda`}
                </button> :
              <div className="tcg-catalog-only-note">
                  Este proveedor está en modo Catálogo. Las expansiones maestras pueden instalarse, pero la descarga automática de cartas se habilitará cuando exista un adaptador estructurado seguro.
                </div>}
              {!current.supports_cards ? <button className="secondary" onClick={install} disabled={!!busy || !selected.length}>{busy === 'install' ? 'Agregando…' : 'Agregar seleccionadas a mi tienda'}</button> : null}
            </div>
          </section>

          {lastCardSyncResult ? <section className="tcg-sync-result-card">
            <div className="section-head compact"><div><h3>Resultado de la última sincronización</h3><p>Detalle por expansión y fuente utilizada.</p></div></div>
            <div className="tcg-sync-result-list">
              {(lastCardSyncResult.sets || []).map((x) => <article key={`ok-${x.setCode}`} className={x.warning ? 'warning' : 'success'}>
                <div><b>{x.setCode}</b><small>{x.sourceUsed || 'Proveedor configurado'}</small></div>
                <span>{x.cards} cartas · {x.prices} precios</span>
                {x.warning ? <p>{x.warning}</p> : null}
              </article>)}
              {(lastCardSyncResult.errors || []).map((x, i) => <article key={`err-${x.setCode}-${i}`} className="error">
                <div><b>{x.setCode}</b><small>Error</small></div>
                <span>0 cartas</span>
                <p>{x.error}</p>
              </article>)}
            </div>
          </section> : null}

          <section className="tcg-price-compare-card">
            <div className="section-head compact"><div><h3>Comparar precios</h3><p>{brandText("Busca una carta ya sincronizada. GMX mantiene cada fuente y moneda por separado.")}</p></div></div>
            <form className="tcg-price-search" onSubmit={findCards}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o número de carta" />
              <button>{busy === 'search' ? 'Buscando…' : 'Buscar'}</button>
            </form>

            {cards.length ? <div className="tcg-price-card-grid">{cards.slice(0, 24).map((card) => <button key={card.row_id} onClick={() => compare(card)}>
              <div className="tcg-sync-card-image">{card.image_local_url || card.image_small_url || card.image_large_url ? <img src={card.image_local_url || card.image_small_url || card.image_large_url} alt="" /> : <span>{brandText("GMX")}</span>}</div>
              <div><b>{card.name}</b><small>{card.set_code} · {card.collector_number || card.number || '—'} · {card.rarity || '—'}</small><span>{card.price_sources} fuentes/precios</span></div>
            </button>)}</div> : null}

            {priceData ? <div className="tcg-price-comparison">
              <div className="tcg-price-selected">
                <div className="tcg-price-large-image">{priceData.card.image_local_url || priceData.card.image_large_url || priceData.card.image_small_url ? <img src={priceData.card.image_local_url || priceData.card.image_large_url || priceData.card.image_small_url} alt="" /> : <span>Sin imagen</span>}</div>
                <div><small>{priceData.card.game_code} · {priceData.card.set_code}</small><h3>{priceData.card.name}</h3><p>{priceData.card.collector_number || priceData.card.number} · {priceData.card.rarity || 'Sin rareza'}</p></div>
              </div>
              <label className="tcg-price-provider-select">Comparar desde<select value={priceProvider} onChange={(e) => setPriceProvider(e.target.value)}><option value="">Todas las fuentes</option>{priceProviders.map((x) => <option key={x}>{x}</option>)}</select></label>
              <div className="table-wrap"><table><thead><tr><th>Fuente</th><th>Variante</th><th>Moneda</th><th>Low</th><th>Mid</th><th>High</th><th>Market</th><th>Trend</th><th></th></tr></thead>
                <tbody>{filteredPrices.map((p) => <tr key={`${p.row_id}-${p.price_provider}-${p.variant}`}><td><b>{p.price_provider}</b></td><td>{p.variant}</td><td>{p.currency}</td><td>{money(p.low, p.currency)}</td><td>{money(p.mid, p.currency)}</td><td>{money(p.high, p.currency)}</td><td><strong>{money(p.market, p.currency)}</strong></td><td>{money(p.trend, p.currency)}</td><td>{p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer">Abrir mercado</a> : '—'}</td></tr>)}</tbody>
              </table></div>
              {!filteredPrices.length ? <div className="public-empty small">Esta impresión todavía no tiene precios disponibles en el proveedor seleccionado.</div> : null}
            </div> : null}
          </section>
        </> : <div className="public-empty">Selecciona un TCG.</div>}
      </main>
    </div>
  </div>;
}
