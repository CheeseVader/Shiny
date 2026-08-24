import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import VisionScannerModal from '../components/VisionScannerModal.jsx';
import VisionCandidatePicker from '../components/VisionCandidatePicker.jsx';
import { visionQueries, scoreVisionCandidate } from '../utils/vision.js';
import TCGAutoSyncPanel from '../components/tcg/TCGAutoSyncPanel.jsx';
import TCGMasterCatalogBrowser from '../components/tcg/TCGMasterCatalogBrowser.jsx';

const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });


/* GMX_TCG_INVENTORY_FILTER_R1 */
function gmxNorm(value = '') {
  return String(value ?? '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toUpperCase().
  replace(/[^A-Z0-9]+/g, '').
  trim();
}

function gmxGameCode(game) {
  return gmxNorm(
    game?.catalogo_codigo ||
    game?.codigo ||
    game?.code ||
    game?.game_code ||
    ''
  );
}

function gmxInventoryRowGameCode(row) {
  const direct = gmxNorm(
    row?.tcg_clasificado ||
    row?.tcg ||
    row?.game_code ||
    row?.codigo_juego ||
    row?.catalogo_codigo ||
    ''
  );
  if (direct) return direct;

  const sku = gmxNorm(row?.sku || '');
  if (sku.includes('YGO')) return 'YUGIOH';
  if (sku.includes('POK')) return 'POKEMON';
  if (sku.includes('MTG')) return 'MAGIC';
  if (sku.includes('ONEPIECE') || sku.includes('GMXSEAOP')) return 'ONEPIECE';
  if (sku.includes('RIF')) return 'RIFTBOUND';

  const text = gmxNorm([
  row?.nombre,
  row?.producto,
  row?.descripcion,
  row?.categoria,
  row?.subcategoria].
  filter(Boolean).join(' '));

  if (text.includes('YUGIOH')) return 'YUGIOH';
  if (text.includes('POKEMON')) return 'POKEMON';
  if (text.includes('MAGIC') || text.includes('MTG')) return 'MAGIC';
  if (text.includes('ONEPIECE')) return 'ONEPIECE';
  if (text.includes('RIFTBOUND')) return 'RIFTBOUND';

  return '';
}

function gmxRowMatchesSelectedGame(row, selectedGameId, games) {
  if (!selectedGameId) return true;

  const selected = (games || []).find(
    (g) => String(g.id_juego) === String(selectedGameId)
  );
  if (!selected) return false;

  // Singles / native TCG inventory.
  if (row?.id_juego != null && String(row.id_juego) !== '') {
    return String(row.id_juego) === String(selectedGameId);
  }

  // Sealed products use catalog classification codes.
  const selectedCode = gmxGameCode(selected);
  const rowCode = gmxInventoryRowGameCode(row);

  if (selectedCode && rowCode) {
    return selectedCode === rowCode;
  }

  return false;
}

function gmxInventorySearchText(row) {
  return [
  row?.carta,
  row?.nombre,
  row?.producto,
  row?.sku,
  row?.codigo_barras,
  row?.numero_completo,
  row?.categoria,
  row?.subcategoria,
  row?.rareza,
  row?.set_nombre,
  row?.expansion].

  filter(Boolean).
  join(' ').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toUpperCase();
}

/* GMX_TCG_FILTER_R2 */
function gmxR2Norm(value = '') {
  return String(value ?? '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toUpperCase().
  replace(/[^A-Z0-9]+/g, '').
  trim();
}

function gmxR2GameKeyFromText(value = '') {
  const t = gmxR2Norm(value);

  if (!t) return '';
  if (t.includes('YUGIOH') || t.includes('YGO')) return 'YUGIOH';
  if (t.includes('POKEMON') || t.includes('PKMN')) return 'POKEMON';
  if (t.includes('MAGICTHEGATHERING') || t.includes('MAGIC') || t.includes('MTG')) return 'MAGIC';
  if (t.includes('ONEPIECE') || t.includes('OPCG')) return 'ONEPIECE';
  if (t.includes('RIFTBOUND')) return 'RIFTBOUND';
  if (t.includes('LORCANA')) return 'LORCANA';
  if (t.includes('DIGIMON')) return 'DIGIMON';
  if (t.includes('DRAGONBALL') || t.includes('DBSFW')) return 'DBSFW';
  if (t.includes('STARWARSUNLIMITED') || t.includes('SWU')) return 'SWU';
  if (t.includes('FLESHANDBLOOD') || t.includes('FAB')) return 'FAB';
  if (t.includes('UNIONARENA')) return 'UNIONARENA';
  if (t.includes('WEISSSCHWARZ') || t.includes('WEISS')) return 'WEISS';
  if (t.includes('VANGUARD')) return 'VANGUARD';

  return t;
}

function gmxR2SelectedGameKey(selectedGameId, games = []) {
  if (!selectedGameId) return '';

  const game = (games || []).find(
    (g) => String(g.id_juego) === String(selectedGameId)
  );

  if (!game) {
    return gmxR2GameKeyFromText(selectedGameId);
  }

  return gmxR2GameKeyFromText(
    game.catalogo_codigo ||
    game.codigo ||
    game.game_code ||
    game.nombre ||
    selectedGameId
  );
}

function gmxR2RowGameKey(row = {}) {
  const direct = [
  row.tcg_clasificado,
  row.tcg,
  row.game_code,
  row.codigo_juego,
  row.catalogo_codigo].
  find((v) => String(v || '').trim());

  if (direct) {
    return gmxR2GameKeyFromText(direct);
  }

  const sku = gmxR2Norm(row.sku || '');

  if (sku.includes('GMXSEAYGO') || sku.includes('YGO')) return 'YUGIOH';
  if (sku.includes('GMXSEAPOK') || sku.includes('POK')) return 'POKEMON';
  if (sku.includes('GMXSEAMTG') || sku.includes('MTG')) return 'MAGIC';
  if (sku.includes('GMXSEAOP')) return 'ONEPIECE';
  if (sku.includes('GMXSEARIF') || sku.includes('RIF')) return 'RIFTBOUND';

  return gmxR2GameKeyFromText([
  row.juego,
  row.nombre_juego,
  row.nombre,
  row.producto,
  row.carta,
  row.descripcion,
  row.subcategoria,
  row.categoria].
  filter(Boolean).join(' '));
}

function gmxR2MatchesGame(row, selectedGameId, games = []) {
  if (!selectedGameId) return true;

  const selectedKey = gmxR2SelectedGameKey(selectedGameId, games);

  // Native singles: id_juego is authoritative when it really belongs to
  // the TCG inventory model.
  const rowType = gmxR2Norm(row.tipo || row.item_type || row.type || '');
  const looksSingle =
  rowType.includes('SINGLE') ||
  rowType === 'TCG' ||
  !!row.id_carta ||
  !!row.carta;

  if (looksSingle && row.id_juego != null && String(row.id_juego) !== '') {
    return String(row.id_juego) === String(selectedGameId);
  }

  const rowKey = gmxR2RowGameKey(row);
  return !!selectedKey && !!rowKey && selectedKey === rowKey;
}

function gmxR2MatchesSearch(row, q = '') {
  const query = String(q || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  trim().
  toUpperCase();

  if (!query) return true;

  const haystack = [
  row.producto,
  row.nombre,
  row.carta,
  row.sku,
  row.codigo,
  row.codigo_barras,
  row.numero_completo,
  row.categoria,
  row.subcategoria,
  row.juego].

  filter(Boolean).
  join(' ').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toUpperCase();

  return query.
  split(/\s+/).
  filter(Boolean).
  every((token) => haystack.includes(token));
}
export default function TCGPage() {
  const [tab, setTab] = useState('mastercatalog');
  const [games, setGames] = useState([]);
  const [sets, setSets] = useState([]);
  const [rarities, setRarities] = useState([]);
  const [cards, setCards] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [acquisitions, setAcquisitions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [generalProducts, setGeneralProducts] = useState([]);
  const [inventoryBranchFilter, setInventoryBranchFilter] = useState('');
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState('TODO');
  const [message, setMessage] = useState('');
  const [masterGames, setMasterGames] = useState([]);
  const [masterGameCode, setMasterGameCode] = useState('');
  const [masterSets, setMasterSets] = useState([]);
  const [masterRarities, setMasterRarities] = useState([]);
  const [importing, setImporting] = useState(false);
  const [receiptBulk, setReceiptBulk] = useState(null);
  const [receiptBulkBusy, setReceiptBulkBusy] = useState(false);
  const [receiptBulkProgress, setReceiptBulkProgress] = useState({ processed: 0, total: 0, ok: 0, failed: 0 });
  const [receiptBulkErrors, setReceiptBulkErrors] = useState([]);
  const [inventoryGameFilter, setInventoryGameFilter] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventorySetFilter, setInventorySetFilter] = useState('');
  const [inventoryRarityFilter, setInventoryRarityFilter] = useState('');
  const [inventoryCommercialEdit, setInventoryCommercialEdit] = useState(null);
  const [inventoryCommercialBusy, setInventoryCommercialBusy] = useState(false);
  const [entryGameFilter, setEntryGameFilter] = useState('');
  const [entrySetFilter, setEntrySetFilter] = useState('');
  const [visionOpen, setVisionOpen] = useState(false);
  const [visionCandidates, setVisionCandidates] = useState([]);
  const [visionPickerOpen, setVisionPickerOpen] = useState(false);
  const [operationalMasterSets, setOperationalMasterSets] = useState([]);
  const [operationalMasterRarities, setOperationalMasterRarities] = useState([]);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [gameFilter, setGameFilter] = useState('');
  const [setFilter, setSetFilter] = useState('');
  const [search, setSearch] = useState('');

  const [setForm, setSetForm] = useState({ id_juego: '', nombre: '', codigo: '', fecha_lanzamiento: '', total_cartas: 0, activo: true, orden: 0 });
  const [rarityForm, setRarityForm] = useState({ id_juego: '', codigo: '', nombre: '', orden: 0, activo: true });
  const [cardForm, setCardForm] = useState({ id_juego: '', id_set: '', nombre: '', numero_carta: '', numero_set: '', numero_completo: '', rareza: '', tipo_carta: '', subtipo: '', artista: '', descripcion: '', estado_catalogo: 'ACTIVA' });

  const [entry, setEntry] = useState({
    id_carta: '', id_sucursal: '', idioma: 'ES', condicion: 'NM', acabado: 'NORMAL', edicion: '',
    graded: false, empresa_grading: '', grado: '', certificado: '', cantidad: 1, costo_unitario: 0,
    precio_venta: 0, precio_oferta: 0, tipo_entrada: 'COMPRA', origen_nombre: '', origen_referencia: '', documento: '', notas: ''
  });

  async function loadAll() {
    const [g, s, r, c, i, a, b, p, mg] = await Promise.all([
    api('/api/v1/tcg/games'),
    api('/api/v1/tcg/sets'),
    api('/api/v1/tcg/rarities'),
    api('/api/v1/tcg/cards?limit=1000'),
    api('/api/v1/tcg/inventory?limit=1000'),
    api('/api/v1/tcg/acquisitions?limit=300'),
    api('/api/v1/branches?includeInactive=false'),
    api('/api/v1/products?limit=1000'),
    api('/api/v1/tcg/master/games')]
    );
    setGames(g.data);setMasterGames(mg.data || []);setSets(s.data);setRarities(r.data);setCards(c.data);setInventory(i.data);setAcquisitions(a.data);setBranches(b.data);setGeneralProducts(p.data || []);
    if (!setForm.id_juego && g.data[0]) setSetForm((x) => ({ ...x, id_juego: g.data[0].id_juego }));
    if (!rarityForm.id_juego && g.data[0]) setRarityForm((x) => ({ ...x, id_juego: g.data[0].id_juego }));
    if (!cardForm.id_juego && g.data[0]) setCardForm((x) => ({ ...x, id_juego: g.data[0].id_juego }));
    if (!entry.id_sucursal && b.data[0]) setEntry((x) => ({ ...x, id_sucursal: b.data[0].id_sucursal }));
    if (!entry.id_carta && c.data[0]) setEntry((x) => ({ ...x, id_carta: c.data[0].id_carta }));
    if (!masterGameCode && mg.data?.[0]) setMasterGameCode(mg.data[0].codigo);
    const initialOperationalGame = setForm.id_juego || g.data?.[0]?.id_juego || '';
    if (initialOperationalGame && !setForm.id_juego) {
      setSetForm((x) => ({ ...x, id_juego: initialOperationalGame }));
      setRarityForm((x) => ({ ...x, id_juego: initialOperationalGame }));
    }
  }

  useEffect(() => {loadAll().catch((e) => setMessage(e.message));}, []);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => (!gameFilter || c.id_juego === gameFilter) && (!setFilter || c.id_set === setFilter) && (!q || [c.nombre, c.numero_completo, c.id_carta, c.rareza].some((v) => String(v || '').toLowerCase().includes(q))));
  }, [cards, gameFilter, setFilter, search]);

  const visibleSets = useMemo(() => sets.filter((s) => !gameFilter || s.id_juego === gameFilter), [sets, gameFilter]);
  const inventorySets = useMemo(() => sets.filter((x) => !inventoryGameFilter || x.id_juego === inventoryGameFilter), [sets, inventoryGameFilter]);
  const inventoryRarities = useMemo(() => rarities.filter((x) => !inventoryGameFilter || x.id_juego === inventoryGameFilter), [rarities, inventoryGameFilter]);
  const filteredInventoryBase = useMemo(() => inventory.filter((x) =>
  (!inventoryBranchFilter || String(x.id_sucursal || '') === String(inventoryBranchFilter)) && (
  !inventoryGameFilter || x.id_juego === inventoryGameFilter) && (
  !inventorySetFilter || x.id_set === inventorySetFilter) && (
  !inventoryRarityFilter || String(x.rareza || '').toLowerCase() === String(inventoryRarityFilter).toLowerCase())
  ), [inventory, inventoryBranchFilter, inventoryGameFilter, inventorySetFilter, inventoryRarityFilter]);
  const filteredInventory = filteredInventoryBase.filter((x) => {
    if (!gmxRowMatchesSelectedGame(x, inventoryGameFilter, games)) return false;
    const q = String(inventorySearch || '').
    normalize('NFD').
    replace(/[\u0300-\u036f]/g, '').
    trim().
    toUpperCase();
    return !q || gmxInventorySearchText(x).includes(q);
  });

  const filteredGeneralProducts = useMemo(() => generalProducts.filter((x) => {
    const categoria = String(x.categoria || '').trim().toLowerCase();

    const isSellado = categoria === 'tcg sellado';
    const isAccesorio = categoria === 'accesorios';

    if (!isSellado && !isAccesorio) return false;

    if (inventoryBranchFilter) {
      const branchValue = String(
        x.id_sucursal ||
        x.branch_id ||
        x.branchId ||
        ''
      );

      if (branchValue && branchValue !== String(inventoryBranchFilter)) return false;
    }

    if (inventoryTypeFilter === 'SELLADO' && !isSellado) return false;
    if (inventoryTypeFilter === 'ACCESORIOS' && !isAccesorio) return false;

    return true;
  }), [generalProducts, inventoryBranchFilter, inventoryTypeFilter]);

  const visibleSingles = useMemo(() => {
    if (inventoryTypeFilter === 'SELLADO' || inventoryTypeFilter === 'ACCESORIOS') return [];
    return filteredInventory;
  }, [filteredInventory, inventoryTypeFilter]);

  const visibleGeneralProducts = useMemo(() => {
    if (inventoryTypeFilter === 'SINGLES') return [];
    return filteredGeneralProducts;
  }, [filteredGeneralProducts, inventoryTypeFilter]);

  const unifiedStock = useMemo(() => {
    const singles = visibleSingles.reduce((a, x) => a + Number(x.stock || 0), 0);
    const products = visibleGeneralProducts.reduce((a, x) => a + Number(x.stock || 0), 0);
    return singles + products;
  }, [visibleSingles, visibleGeneralProducts]);

  const selladoCount = useMemo(() =>
  filteredGeneralProducts.filter((x) =>
  String(x.categoria || '').trim().toLowerCase() === 'tcg sellado'
  ).length,
  [filteredGeneralProducts]);

  const accesoriosCount = useMemo(() =>
  filteredGeneralProducts.filter((x) =>
  String(x.categoria || '').trim().toLowerCase() === 'accesorios'
  ).length,
  [filteredGeneralProducts]);
  const entrySets = useMemo(
    () => sets.filter((x) => !entryGameFilter || x.id_juego === entryGameFilter),
    [sets, entryGameFilter]
  );

  const entryCards = useMemo(
    () => cards.filter((x) =>
    (!entryGameFilter || x.id_juego === entryGameFilter) && (
    !entrySetFilter || x.id_set === entrySetFilter)
    ),
    [cards, entryGameFilter, entrySetFilter]
  );

  useEffect(() => {
    if (entrySetFilter && !entrySets.some((x) => x.id_set === entrySetFilter)) {
      setEntrySetFilter('');
    }
  }, [entryGameFilter, entrySetFilter, entrySets]);



  async function create(kind, form, reset) {
    try {
      await api(`/api/v1/tcg/catalog/${kind}`, { method: 'POST', body: JSON.stringify(form) });
      setMessage('Registro TCG creado.');
      reset();
      await loadAll();
    } catch (e) {setMessage(e.message);}
  }

  async function loadMasterDetail(code) {
    setMasterGameCode(code);
    if (!code) {setMasterSets([]);setMasterRarities([]);return;}
    try {
      const [s, r] = await Promise.all([
      api(`/api/v1/tcg/master/sets?gameCode=${encodeURIComponent(code)}`),
      api(`/api/v1/tcg/master/rarities?gameCode=${encodeURIComponent(code)}`)]
      );
      setMasterSets(s.data || []);setMasterRarities(r.data || []);
    } catch (e) {setMessage(e.message);}
  }

  useEffect(() => {if (masterGameCode) loadMasterDetail(masterGameCode);}, [masterGameCode]);

  async function activateMaster(code, visiblePortal = false) {
    try {
      const r = await api(`/api/v1/tcg/master/games/${encodeURIComponent(code)}/activate`, {
        method: 'POST', body: JSON.stringify({ visiblePortal })
      });
      setMessage(brandText(`${r.data.game.nombre} agregado a GMX con ${r.data.sets} sets y ${r.data.rarities} rarezas.`));
      await loadAll();
    } catch (e) {setMessage(e.message);}
  }

  async function setVisibility(game, value) {
    try {
      await api(`/api/v1/tcg/games/${game.row_id}/visibility`, {
        method: 'PUT', body: JSON.stringify({ visiblePortal: value })
      });
      setMessage(value ? `${game.nombre} visible en portal cliente.` : `${game.nombre} oculto del portal cliente.`);
      try {
        localStorage.setItem('GMX_TCG_VISIBILITY_VERSION', String(Date.now()));
        window.dispatchEvent(new CustomEvent('gmx:tcg-visibility-changed'));
      } catch {}
      await loadAll();
    } catch (e) {setMessage(e.message);}
  }

  async function downloadDynamicTemplate() {
    try {
      const token = localStorage.getItem('GMX_AUTH_TOKEN') || '';
      const response = await fetch('/api/v1/tcg/template.xlsx', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('No fue posible generar la plantilla.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;a.download = 'GMX_Plantillas_Importacion_Dinamica.xlsx';
      document.body.appendChild(a);a.click();a.remove();
      URL.revokeObjectURL(url);
      setMessage('Plantilla generada con juegos, expansiones y rarezas actuales.');
    } catch (e) {setMessage(e.message);}
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, mime: file.type, data: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function importExcel(kind, file) {
    if (!file) return;
    setImporting(true);setMessage('');
    try {
      const payload = await readFile(file);
      const path = kind === 'cards' ? '/api/v1/tcg/imports/cards' : '/api/v1/tcg/imports/master';
      const r = await api(path, { method: 'POST', body: JSON.stringify({ file: payload }) });
      setMessage(`Importación terminada: ${r.data.created} creados, ${r.data.updated} actualizados, ${r.data.errors.length} errores.`);
      if (r.data.errors.length) window.gmxNotify?.(`Importación completada con ${r.data.errors.length} filas con error.`, { type: 'warning', duration: 7000 });
      await loadAll();
    } catch (e) {setMessage(e.message);} finally {setImporting(false);}
  }

  async function loadOperationalMaster(gameId) {
    const game = games.find((g) => g.id_juego === gameId);
    const code = String(game?.catalogo_codigo || game?.codigo || '').toUpperCase();
    if (!code) {
      setOperationalMasterSets([]);
      setOperationalMasterRarities([]);
      return;
    }
    try {
      const [s, r] = await Promise.all([
      api(`/api/v1/tcg/master/sets?gameCode=${encodeURIComponent(code)}`),
      api(`/api/v1/tcg/master/rarities?gameCode=${encodeURIComponent(code)}`)]
      );
      setOperationalMasterSets(s.data || []);
      setOperationalMasterRarities(r.data || []);
    } catch (e) {
      setOperationalMasterSets([]);
      setOperationalMasterRarities([]);
      setMessage(e.message);
    }
  }

  async function syncOperationalMaster(gameId) {
    const game = games.find((g) => g.id_juego === gameId);
    const code = String(game?.catalogo_codigo || game?.codigo || '').toUpperCase();
    if (!game || !code) {
      setMessage('Selecciona un TCG vinculado al catálogo maestro.');
      return;
    }
    setCatalogSyncing(true);
    try {
      const r = await api(`/api/v1/tcg/master/games/${encodeURIComponent(code)}/activate`, {
        method: 'POST',
        body: JSON.stringify({ visiblePortal: game.visible_portal !== false })
      });
      setMessage(
        `${game.nombre}: ${r.data.sets} expansiones y ${r.data.rarities} rarezas sincronizadas desde el catálogo maestro.`
      );
      window.gmxNotify?.(
        `${game.nombre} actualizado desde el catálogo maestro.`,
        { type: 'success' }
      );
      await loadAll();
      await loadOperationalMaster(gameId);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setCatalogSyncing(false);
    }
  }


  async function downloadReceiptTemplate() {
    try {
      const token = localStorage.getItem('GMX_AUTH_TOKEN') || '';
      const response = await fetch('/api/v1/tcg/inventory/receipt-template.xlsx', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      if (!response.ok) throw new Error('No fue posible generar la plantilla de recepción.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;a.download = 'GMX_TCG_Recepcion_Masiva.xlsx';
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      setMessage('Plantilla de recepción generada desde la DBA actual.');
    } catch (e) {setMessage(e.message);}
  }

  async function prepareReceiptBulk(file) {
    if (!file) return;
    setReceiptBulkBusy(true);
    setReceiptBulk(null);
    setReceiptBulkErrors([]);
    setReceiptBulkProgress({ processed: 0, total: 0, ok: 0, failed: 0 });
    try {
      const payload = await readFile(file);
      const r = await api('/api/v1/tcg/inventory/receipt-parse', {
        method: 'POST', body: JSON.stringify({ file: payload })
      });
      setReceiptBulk(r.data);
      setReceiptBulkErrors(r.data.errors || []);
      setReceiptBulkProgress({
        processed: 0, total: Number(r.data.validRows || 0), ok: 0, failed: Number(r.data.invalidRows || 0)
      });
      setMessage(
        `Archivo validado: ${r.data.totalRows} fila(s), ${r.data.validRows} válida(s), ${r.data.invalidRows} con error.`
      );
    } catch (e) {setMessage(e.message);} finally
    {setReceiptBulkBusy(false);}
  }

  async function runReceiptBulk() {
    const rows = receiptBulk?.rows || [];
    if (!rows.length) return;
    setReceiptBulkBusy(true);
    const chunkSize = 500;
    let processed = 0,ok = 0,failed = Number(receiptBulk.invalidRows || 0);
    const runtimeErrors = [...(receiptBulk.errors || [])];

    try {
      for (let start = 0; start < rows.length; start += chunkSize) {
        const chunk = rows.slice(start, start + chunkSize);
        const r = await api('/api/v1/tcg/inventory/receive-bulk', {
          method: 'POST',
          body: JSON.stringify({ rows: chunk })
        });
        ok += Number(r.data.ok || 0);
        failed += Number(r.data.failed || 0);
        for (const error of (r.data.result || []).filter((x) => !x.ok)) {
          runtimeErrors.push({
            row: Number(chunk[error.index]?.source_row || start + error.index + 2),
            error: error.error
          });
        }
        processed += chunk.length;
        setReceiptBulkProgress({ processed, total: rows.length, ok, failed });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setReceiptBulkErrors(runtimeErrors);
      setMessage(`Recepción masiva terminada: ${ok} correcta(s), ${failed} con error.`);
      window.gmxNotify?.(
        failed ? `Recepción completada con ${failed} error(es).` : `${ok} fila(s) recibidas correctamente.`,
        { type: failed ? 'warning' : 'success', duration: 7000 }
      );
      await loadAll();
    } catch (e) {
      setMessage(`Proceso detenido después de ${processed} fila(s): ${e.message}`);
    } finally {
      setReceiptBulkBusy(false);
    }
  }


  function editInventoryCommercial(row) {
    setInventoryCommercialEdit({
      id_inventario: row.id_inventario,
      sku: row.sku,
      carta: row.carta || row.id_carta,
      costo: Number(row.costo || 0),
      precio: Number(row.precio || 0),
      precio_oferta: Number(row.precio_oferta || 0),
      estado_venta: row.estado_venta || 'DISPONIBLE'
    });
  }

  async function saveInventoryCommercial() {
    if (!inventoryCommercialEdit) return;

    try {
      setInventoryCommercialBusy(true);

      const x = inventoryCommercialEdit;

      await api(
        `/api/v1/tcg/inventory/${encodeURIComponent(x.id_inventario)}/commercial`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            costo: Number(x.costo || 0),
            precio: Number(x.precio || 0),
            precio_oferta: Number(x.precio_oferta || 0),
            estado_venta: x.estado_venta || 'DISPONIBLE'
          })
        }
      );

      setMessage(`Datos comerciales actualizados: ${x.sku}`);

      window.gmxNotify?.(
        `Precio actualizado: ${x.sku}`,
        { type: 'success', duration: 5000 }
      );

      setInventoryCommercialEdit(null);
      await loadAll();

    } catch (e) {
      setMessage(e.message);
    } finally {
      setInventoryCommercialBusy(false);
    }
  }

  async function receive() {
    async function handleVisionTcgResult(result) {
      const queries = visionQueries(result, { max: 7 });
      const found = new Map();

      for (const q of queries) {
        try {
          const r = await api(`/api/v1/tcg/cards?search=${encodeURIComponent(q)}&limit=40`);
          for (const card of r.data || []) {
            const score = scoreVisionCandidate(card, result);
            const key = String(card.id_carta || card.row_id);
            const previous = found.get(key);
            if (!previous || score > previous.score) found.set(key, { ...card, key, score });
          }
        } catch {}
      }

      const candidates = [...found.values()].
      filter((x) => x.score >= 0.18).
      sort((a, b) => b.score - a.score).
      slice(0, 10);

      setVisionCandidates(candidates);
      setVisionOpen(false);
      setVisionPickerOpen(true);
    }

    function pickVisionTcgCard(card) {
      if (card.id_juego) setEntryGameFilter(card.id_juego);
      if (card.id_set) setEntrySetFilter(card.id_set);
      setEntry((x) => ({ ...x, id_carta: card.id_carta }));
      setTab('entry');
      setVisionPickerOpen(false);
      setMessage(`Carta reconocida: ${card.nombre || card.id_carta}. Confirma idioma, condición, acabado, cantidad y precio antes de recibir.`);
    }

    try {
      const r = await api('/api/v1/tcg/inventory/receive', { method: 'POST', body: JSON.stringify(entry) });
      setMessage(`Entrada registrada: ${r.data.id_adquisicion} · ${r.data.sku}`);
      await loadAll();
    } catch (e) {setMessage(e.message);}
  }

  const gmxVisibleInventory = (filteredInventory || []).filter((row) =>
  gmxR2MatchesGame(row, inventoryGameFilter, games) &&
  gmxR2MatchesSearch(row, inventorySearch)
  );

  /* GMX_PRODUCT_TABLE_FILTER_R23 */
  const gmxVisibleProducts = (visibleGeneralProducts || []).filter((row) =>
  gmxR2MatchesGame(row, inventoryGameFilter, games) &&
  gmxR2MatchesSearch(row, inventorySearch)
  );
  return <div className="tcg-stack">
    <section className="content-card">
      <div className="section-head">
        <div><div className="eyebrow">TRADING CARD GAME</div><h2>Centro TCG local</h2></div>
        <span className="phase-pill">Catálogo Maestro TCG</span>
      </div>
      {message ? <div className="message">{message}</div> : null}
      <div className="tabs tcg-tabs-dedup">
        <button className={tab === 'mastercatalog' ? 'tab active' : 'tab'} onClick={() => setTab('mastercatalog')}>Catálogo Maestro</button>
        <button className={tab === 'inventory' ? 'tab active' : 'tab'} onClick={() => setTab('inventory')}>Inventario</button>
        <button className={tab === 'entry' ? 'tab active' : 'tab'} onClick={() => setTab('entry')}>Recepción</button>
        <button className={tab === 'acq' ? 'tab active' : 'tab'} onClick={() => setTab('acq')}>Historial de adquisiciones</button>
        <button className={tab === 'autosync' ? 'tab active' : 'tab'} onClick={() => setTab('autosync')}>Auto Sync</button>
      </div>

      {tab === 'inventory' ? <div className="tcg-body">
        <div className="tcg-kpis">
  <article>
    <span>Art�culos visibles</span>
    <strong>{visibleSingles.length + visibleGeneralProducts.length}</strong>
  </article>

  <article>
    <span>Stock visible</span>
    <strong>{unifiedStock}</strong>
  </article>

  <article>
    <span>TCG Sellado</span>
    <strong>{selladoCount}</strong>
  </article>

  <article>
    <span>Accesorios</span>
    <strong>{accesoriosCount}</strong>
  </article>
</div>
        <div className="tcg-filter tcg-scope-filter">
          <select
            value={inventoryBranchFilter}
            onChange={(e) => setInventoryBranchFilter(e.target.value)}>
            
  <option value="">Todas las sucursales</option>
  {branches.map((b) =>
            <option
              key={b.row_id || b.id_sucursal}
              value={b.id_sucursal}>
              
      {b.nombre_sucursal || b.codigo || b.id_sucursal}
    </option>
            )}
</select>

<select
            value={inventoryTypeFilter}
            onChange={(e) => setInventoryTypeFilter(e.target.value)}>
            
  <option value="TODO">Todo el inventario TCG</option>
  <option value="SINGLES">Singles</option>
  <option value="SELLADO">TCG Sellado</option>
  <option value="ACCESORIOS">Accesorios</option>
</select>
<select value={inventoryGameFilter} onChange={(e) => {setInventoryGameFilter(e.target.value);setInventorySetFilter('');setInventoryRarityFilter('');}}>
            <option value="">Todos los TCG</option>{games.map((g) => <option key={g.row_id} value={g.id_juego}>{g.nombre}</option>)}
          </select>
          <input
            type="search"
            value={inventorySearch}
            onChange={(e) => setInventorySearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o codigo"
            className="tcg-inventory-search" />
          
        </div>

        
{/* GMX_GENERAL_PRODUCTS_R6 */}
{visibleGeneralProducts.length > 0 ?
        <div className="table-wrap" style={{ marginTop: 18 }}>
  <table>
    <thead>
      <tr>
        <th>Tipo</th>
        <th>Producto</th>
        <th>SKU</th>
        <th>C�digo</th>
        <th>Categor�a</th>
        <th>Stock</th>
        <th>Costo</th>
        <th>Precio</th>
        <th>Estado</th>
      </tr>
    </thead>

    <tbody>
      {gmxVisibleProducts.map((x, i) =>
              <tr key={x.row_id || x.id || x.sku || i}>
          <td>
            {String(x.categoria || '').toLowerCase() === 'tcg sellado' ?
                  'SELLADO' :
                  'ACCESORIO'}
          </td>

          <td>
            <strong>{x.nombre || '�'}</strong>
          </td>

          <td>{x.sku || '�'}</td>

          <td>{x.codigo_barras || '�'}</td>

          <td>{x.categoria || '�'}</td>

          <td>{Number(x.stock || 0)}</td>

          <td>{money(Number(x.costo || 0))}</td>

          <td>{money(Number(x.precio || 0))}</td>

          <td>{x.estado || '�'}</td>
        </tr>
              )}
    </tbody>
  </table>
</div> :
        null}
{inventoryCommercialEdit ?
        <section className="tcg-entry-card">
            <div className="section-head compact">
              <div>
                <span className="eyebrow">EDICIÓN COMERCIAL</span>
                <h3>{inventoryCommercialEdit.carta}</h3>
                <p>{inventoryCommercialEdit.sku}</p>
              </div>
            </div>

            <div className="form-grid">

              <label>
                Costo
                <input
                type="number"
                min="0"
                step=".01"
                value={inventoryCommercialEdit.costo}
                onChange={(e) => setInventoryCommercialEdit((x) => ({
                  ...x,
                  costo: e.target.value
                }))} />
              
              </label>

              <label>
                Precio tienda
                <input
                type="number"
                min="0"
                step=".01"
                value={inventoryCommercialEdit.precio}
                onChange={(e) => setInventoryCommercialEdit((x) => ({
                  ...x,
                  precio: e.target.value
                }))} />
              
              </label>

              <label>
                Precio oferta
                <input
                type="number"
                min="0"
                step=".01"
                value={inventoryCommercialEdit.precio_oferta}
                onChange={(e) => setInventoryCommercialEdit((x) => ({
                  ...x,
                  precio_oferta: e.target.value
                }))} />
              
              </label>

              <label>
                Estado
                <select
                value={inventoryCommercialEdit.estado_venta}
                onChange={(e) => setInventoryCommercialEdit((x) => ({
                  ...x,
                  estado_venta: e.target.value
                }))}>
                
                  <option value="DISPONIBLE">DISPONIBLE</option>
                  <option value="NO_DISPONIBLE">NO DISPONIBLE</option>
                  <option value="PAUSADO">PAUSADO</option>
                </select>
              </label>

            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
              type="button"
              disabled={inventoryCommercialBusy}
              onClick={saveInventoryCommercial}>
              
                {inventoryCommercialBusy ? 'Guardando...' : 'Guardar cambios'}
              </button>

              <button
              type="button"
              className="secondary"
              disabled={inventoryCommercialBusy}
              onClick={() => setInventoryCommercialEdit(null)}>
              
                Cancelar
              </button>
            </div>

          </section> :
        null}

        <div className="table-wrap"><table><thead><tr><th>TCG</th><th>Expansión</th><th>Sucursal</th><th>SKU</th><th>Carta</th><th>Idioma</th><th>Condición</th><th>Acabado</th><th>Rareza</th><th>Stock</th><th>Global</th><th>Costo</th><th>Precio</th><th>Oferta</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibleSingles.map((x, i) => {
                const game = games.find((g) => g.id_juego === x.id_juego);const set = sets.find((st) => st.id_set === x.id_set);
                return <tr key={`${x.row_id}-${x.id_sucursal || i}`}><td><b>{game?.nombre || x.id_juego || '—'}</b></td><td>{set?.nombre || x.id_set || '—'}</td><td>{x.sucursal || '—'}</td><td>{x.sku}</td><td><strong>{x.carta || x.id_carta}</strong></td><td>{x.idioma}</td><td>{x.condicion}</td><td>{x.acabado}</td><td>{x.rareza || '—'}</td><td>{x.stock ?? 0}</td><td>{x.stock_global ?? 0}</td><td>{money(x.costo)}</td>
<td>{money(x.precio)}</td>
<td>{Number(x.precio_oferta || 0) > 0 ? money(x.precio_oferta) : '—'}</td>
<td>{x.estado_venta || 'DISPONIBLE'}</td>
<td>
  <button
                      type="button"
                      className="secondary"
                      onClick={() => editInventoryCommercial(x)}>
                      
    Editar
  </button>
</td>
</tr>;
              })}</tbody></table></div>
      </div> : null}

      {tab === 'entry' ? <div className="tcg-body tcg-reception-v2">
        <div className="tcg-reception-intro">
          <div>
            <span className="eyebrow">RECEPCIÓN TCG</span>
            <h3>Entrada individual o masiva</h3>
            <p>Usa individual para pocas variantes. Para inventarios existentes o lotes grandes usa la plantilla masiva.</p>
          </div>
        </div>

        <div className="tcg-reception-grid">
          <section className="tcg-entry-card">
            <div className="section-head compact">
              <div><h3>Recepción individual</h3><p>Para una carta/variante puntual.</p></div><button type="button" className="secondary" onClick={() => setVisionOpen(true)}>◉ Escanear carta</button>
            </div>
            <div className="form-grid">
              <label>TCG<select value={entryGameFilter} onChange={(e) => {setEntryGameFilter(e.target.value);setEntrySetFilter('');setEntry((x) => ({ ...x, id_carta: '' }));}}><option value="">Selecciona TCG</option>{games.map((g) => <option key={g.row_id} value={g.id_juego}>{g.nombre}</option>)}</select></label>
              <label>Expansión<select value={entrySetFilter} onChange={(e) => {setEntrySetFilter(e.target.value);setEntry((x) => ({ ...x, id_carta: '' }));}}><option value="">Todas</option>{entrySets.map((s) => <option key={s.row_id} value={s.id_set}>{s.nombre}</option>)}</select></label>
              <label className="wide">Carta<select value={entry.id_carta} onChange={(e) => setEntry((x) => ({ ...x, id_carta: e.target.value }))}><option value="">Selecciona carta</option>{entryCards.map((c) => <option key={c.row_id} value={c.id_carta}>{c.nombre} · {c.numero_completo || ''}{c.rareza ? ` (${c.rareza})` : ''}</option>)}</select></label>
              <label>Sucursal<select value={entry.id_sucursal} onChange={(e) => setEntry((x) => ({ ...x, id_sucursal: e.target.value }))}>{branches.map((b) => <option key={b.row_id} value={b.id_sucursal}>{b.nombre_sucursal}</option>)}</select></label>
              <label>Idioma<select value={entry.idioma} onChange={(e) => setEntry((x) => ({ ...x, idioma: e.target.value }))}><option>ES</option><option>EN</option><option>JP</option></select></label>
              <label>Condición<select value={entry.condicion} onChange={(e) => setEntry((x) => ({ ...x, condicion: e.target.value }))}><option>NM</option><option>LP</option><option>MP</option><option>HP</option><option>DMG</option></select></label>
              <label>Acabado<select value={entry.acabado} onChange={(e) => setEntry((x) => ({ ...x, acabado: e.target.value }))}><option>NORMAL</option><option>HOLO</option><option>REVERSE_HOLO</option><option>FOIL</option></select></label>
              <label>Edición<input value={entry.edicion} onChange={(e) => setEntry((x) => ({ ...x, edicion: e.target.value }))} /></label>
              <label>Cantidad<input type="number" min="1" value={entry.cantidad} onChange={(e) => setEntry((x) => ({ ...x, cantidad: Number(e.target.value) }))} /></label>
              <label>Costo unitario<input type="number" min="0" step=".01" value={entry.costo_unitario} onChange={(e) => setEntry((x) => ({ ...x, costo_unitario: Number(e.target.value) }))} /></label>
              <label>Precio tienda<input type="number" min="0" step=".01" value={entry.precio_venta} onChange={(e) => setEntry((x) => ({ ...x, precio_venta: Number(e.target.value) }))} /></label>
              <label>Precio oferta<input type="number" min="0" step=".01" value={entry.precio_oferta} onChange={(e) => setEntry((x) => ({ ...x, precio_oferta: Number(e.target.value) }))} /></label>
              <label>Origen<input value={entry.origen_nombre} onChange={(e) => setEntry((x) => ({ ...x, origen_nombre: e.target.value }))} placeholder="Proveedor / cliente / inventario inicial" /></label>
              <label>Referencia<input value={entry.origen_referencia} onChange={(e) => setEntry((x) => ({ ...x, origen_referencia: e.target.value }))} /></label>
              <label className="check-label"><input type="checkbox" checked={entry.graded} onChange={(e) => setEntry((x) => ({ ...x, graded: e.target.checked }))} />Graded</label>
              {entry.graded ? <><label>Empresa grading<input value={entry.empresa_grading} onChange={(e) => setEntry((x) => ({ ...x, empresa_grading: e.target.value }))} /></label><label>Grado<input type="number" min="0" max="10" step=".1" value={entry.grado} onChange={(e) => setEntry((x) => ({ ...x, grado: e.target.value }))} /></label><label>Certificado<input value={entry.certificado} onChange={(e) => setEntry((x) => ({ ...x, certificado: e.target.value }))} /></label>      <VisionScannerModal open={visionOpen} title="Reconocer carta TCG" onClose={() => setVisionOpen(false)} onResult={handleVisionTcgResult} />
      <VisionCandidatePicker
                  open={visionPickerOpen}
                  title="Selecciona la carta"
                  subtitle="La foto identifica la carta; confirma después la variante física."
                  items={visionCandidates}
                  onClose={() => setVisionPickerOpen(false)}
                  onPick={pickVisionTcgCard} />
                
</> : null}
            </div>
            <button onClick={receive}>Registrar recepción</button>
          </section>

          <section className="tcg-bulk-receive-card">
            <div className="section-head compact">
              <div><span className="eyebrow">BULK</span><h3>Recepción masiva</h3><p>Inventario físico existente o adquisiciones de cualquier tamaño.</p></div>
            </div>

            <div className="tcg-bulk-flow">
              <article><b>1</b><span><strong>Descarga plantilla</strong><small>Generada con cartas y sucursales actuales.</small></span></article>
              <article><b>2</b><span><strong>Completa filas</strong><small>INVENTARIO_INICIAL o ADQUISICION.</small></span></article>
              <article><b>3</b><span><strong>Validar</strong><small>No modifica inventario.</small></span></article>
              <article><b>4</b><span><strong>Procesar</strong><small>Bloques internos de 500 filas, sin límite fijo de filas.</small></span></article>
            </div>

            <div className="actions tcg-bulk-actions">
              <button className="secondary" onClick={downloadReceiptTemplate}>Descargar plantilla</button>
              <label className="file-btn">{receiptBulkBusy && !receiptBulk ? 'Validando…' : 'Seleccionar archivo'}<input type="file" accept=".xlsx,.xls" disabled={receiptBulkBusy} onChange={(e) => e.target.files?.[0] && prepareReceiptBulk(e.target.files[0])} /></label>
            </div>

            {receiptBulk ? <div className="tcg-bulk-validation">
              <div className="tcg-bulk-kpis">
                <article><span>Filas</span><strong>{receiptBulk.totalRows}</strong></article>
                <article><span>Válidas</span><strong>{receiptBulk.validRows}</strong></article>
                <article><span>Con error</span><strong>{receiptBulk.invalidRows}</strong></article>
              </div>

              <div className="tcg-bulk-progress">
                <div><span>Procesadas</span><strong>{receiptBulkProgress.processed} / {receiptBulkProgress.total}</strong></div>
                <progress max={Math.max(1, receiptBulkProgress.total)} value={receiptBulkProgress.processed} />
                <small>{receiptBulkProgress.ok} correctas · {receiptBulkProgress.failed} errores</small>
              </div>

              <button onClick={runReceiptBulk} disabled={receiptBulkBusy || !receiptBulk.validRows}>
                {receiptBulkBusy ? 'Procesando…' : `Procesar ${receiptBulk.validRows} fila(s)`}
              </button>
            </div> : null}

            {receiptBulkErrors.length ? <details className="tcg-bulk-errors">
              <summary>{receiptBulkErrors.length} fila(s) con observaciones / error</summary>
              <div className="table-wrap"><table><thead><tr><th>Fila</th><th>Error</th></tr></thead>
                <tbody>{receiptBulkErrors.slice(0, 300).map((e, i) => <tr key={`${e.row}-${i}`}><td>{e.row}</td><td>{e.error}</td></tr>)}</tbody>
              </table></div>
              {receiptBulkErrors.length > 300 ? <small>Se muestran los primeros 300 errores.</small> : null}
            </details> : null}
          </section>
        </div>
      </div> : null}

      {tab === 'mastercatalog' ? <div className="tcg-master-unified">
        <TCGMasterCatalogBrowser />

        <section className="tcg-master-admin-tools">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">ADMINISTRACIÓN DEL MAESTRO</span>
              <h3>Publicación y mantenimiento</h3>
              <p>Las funciones que antes estaban separadas en Catálogos e Importar Excel ahora viven aquí.</p>
            </div>
          </div>

          <div className="tcg-master-admin-grid">
            <article>
              <h4>{brandText("Agregar TCG a GMX")}</h4>
              <p>Selecciona un TCG del maestro y decide si debe mostrarse inmediatamente en el portal.</p>
              <label>TCG
                <select value={masterGameCode} onChange={(e) => setMasterGameCode(e.target.value)}>
                  <option value="">Selecciona</option>
                  {masterGames.map((g) => <option key={g.codigo} value={g.codigo}>
                    {g.nombre}{g.agregado_tienda ? ' · ya agregado' : ''}
                  </option>)}
                </select>
              </label>
              {masterGameCode ? <div className="tcg-master-summary">
                <span>{masterSets.length} expansiones</span>
                <span>{masterRarities.length} rarezas</span>
              </div> : null}
              <div className="tcg-master-actions">
                <button onClick={() => activateMaster(masterGameCode, false)} disabled={!masterGameCode}>Agregar oculto</button>
                <button onClick={() => activateMaster(masterGameCode, true)} disabled={!masterGameCode}>Agregar y mostrar</button>
              </div>
            </article>

            <article>
              <h4>TCG publicados en la tienda</h4>
              <p>Solo controla visibilidad. El contenido continúa viniendo del Catálogo Maestro.</p>
              <div className="tcg-game-toggle-grid tcg-game-toggle-compact">
                {games.map((g) => <div key={g.row_id} className="tcg-store-game-row">
                  <span><strong>{g.nombre}</strong><small>{g.codigo || g.catalogo_codigo || g.id_juego}</small></span>
                  <label className="tcg-visible-toggle">
                    <input type="checkbox" checked={g.visible_portal !== false} onChange={(e) => setVisibility(g, e.target.checked)} />
                    <span>{g.visible_portal !== false ? 'Visible' : 'Oculto'}</span>
                  </label>
                </div>)}
                {!games.length ? <div className="public-empty small">{brandText("Todavía no hay TCG agregados a GMX.")}</div> : null}
              </div>
            </article>
          </div>

          <details className="tcg-master-import-tools">
            <summary>Importación manual / mantenimiento avanzado</summary>
            <p>Úsalo solo cuando una fuente automática no tenga todavía el contenido requerido. No crea un segundo catálogo.</p>
            <div className="tcg-import-center tcg-import-center-inline">
              <section className="tcg-import-card">
                <h4>{brandText("Plantilla GMX")}</h4>
                <p>Plantilla estructurada para Cartas TCG, Juegos, Sets y Rarezas.</p>
                <button type="button" onClick={downloadDynamicTemplate}>Descargar plantilla actualizada</button>
              </section>
              <section className="tcg-import-card">
                <h4>Importar cartas al maestro</h4>
                <p>Actualiza por juego + set + número; crea solo las cartas que no existan.</p>
                <label className="file-action">{importing ? 'Importando…' : 'Seleccionar Excel de cartas'}
                  <input type="file" accept=".xlsx,.xls" disabled={importing} onChange={(e) => importExcel('cards', e.target.files?.[0])} />
                </label>
              </section>
              <section className="tcg-import-card">
                <h4>Actualizar estructura maestra</h4>
                <p>Importa Juegos, Sets y Rarezas cuando todavía no estén disponibles vía Auto Sync.</p>
                <label className="file-action">{importing ? 'Importando…' : 'Seleccionar Excel maestro'}
                  <input type="file" accept=".xlsx,.xls" disabled={importing} onChange={(e) => importExcel('master', e.target.files?.[0])} />
                </label>
              </section>
            </div>
          </details>
        </section>
      </div> : null}

      {tab === 'autosync' ? <TCGAutoSyncPanel /> : null}

      {tab === 'acq' ? <div className="tcg-acq-history"><div className="section-head compact"><div><span className="eyebrow">TRAZABILIDAD</span><h3>Historial de adquisiciones</h3><p>Consulta de recepciones ya registradas. No es un segundo flujo de entrada.</p></div></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>ID</th><th>TCG</th><th>Expansión</th><th>Rareza</th><th>Tipo</th><th>Origen</th><th>Carta</th><th>SKU</th><th>Sucursal</th><th>Cantidad</th><th>Costo</th><th>Venta</th><th>Estado</th></tr></thead><tbody>{acquisitions.map((a) => <tr key={a.row_id}><td>{a.fecha ? new Date(a.fecha).toLocaleString('es-MX') : '—'}</td><td>{a.id_adquisicion}</td><td>{games.find((g) => g.id_juego === a.id_juego)?.nombre || a.id_juego || '—'}</td><td>{sets.find((st) => st.id_set === a.id_set)?.nombre || a.id_set || '—'}</td><td>{a.rareza || '—'}</td><td>{a.tipo_entrada}</td><td>{a.origen_nombre || '—'}</td><td>{a.carta}</td><td>{a.sku}</td><td>{a.sucursal}</td><td>{a.cantidad}</td><td>{money(a.costo_total)}</td><td>{money(a.precio_venta)}</td><td>{a.estado}</td></tr>)}</tbody></table></div></div> : null}
    </section>
  </div>;
}
