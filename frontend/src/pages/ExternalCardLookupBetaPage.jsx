import { brandText } from '../config/brand.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import '../externalCardLookupBeta.css';
import '../externalCardVisualR3.css';

const GAMES = [
  { id: 'POKEMON', label: 'Pokémon', source: 'Pokémon TCG API / TCGdex' },
  { id: 'YUGIOH', label: 'Yu-Gi-Oh!', source: 'YGOPRODeck' },
  { id: 'MAGIC', label: 'Magic: The Gathering', source: 'Scryfall' }
];
const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const FINISHES = ['NORMAL', 'HOLO', 'REVERSE_HOLO', 'FOIL'];
const CHUNK_RESOLVE = 500;
const CHUNK_INSTALL = 200;
const CHUNK_RECEIVE = 500;

function clean(value) {
  return String(value || '').trim();
}

function normalized(value) {
  return clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function identityKey(item) {
  return [item.game, item.source, item.external_id, item.set_code || item.set_name,
    item.collector_number, normalized(item.name), item.language || 'EN'].map(clean).join('|');
}

function money(value, currency = 'USD') {
  const number = Number(value);
  return Number.isFinite(number) ? `${currency === 'USD' ? '$' : ''}${number.toFixed(2)} ${currency}` : '—';
}

function imageSrc(value) {
  const url = clean(value);
  if (url.includes('assets.tcgdex.net') && !/\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(url)) return `${url}/high.webp`;
  return url;
}

function extractOcrQuery(text) {
  const ignored = /^(basic|stage|trainer|energy|pokemon|pokémon|spell|trap|monster|effect|atk|def|illustrator|illus|hp|first edition|1st edition)$/i;
  const lines = String(text || '').split(/\r?\n/)
    .map((line) => line.replace(/[^A-Za-z0-9À-ÿ'’:\- ]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 3 && line.length <= 60);
  return lines.find((line) => !ignored.test(line)) || lines[0] || '';
}

function chunks(list, size) {
  const output = [];
  for (let index = 0; index < list.length; index += size) output.push(list.slice(index, index + size));
  return output;
}

function statusLabel(status) {
  if (status === 'INTERNET_IDENTIFIED') return 'Identificada en Internet';
  if (status === 'MATCHED') return 'Relacionado localmente';
  if (status === 'AMBIGUOUS') return 'Revisar identidad';
  if (status === 'NOT_FOUND') return 'Fuera del catálogo GMX';
  if (status === 'ERROR') return 'Error de enriquecimiento';
  return 'En cola';
}

function candidateIdentity(item) {
  return {
    key: identityKey(item), game: item.game, source: item.source, external_id: item.external_id,
    name: item.name, set_name: item.set_name, set_code: item.set_code,
    collector_number: item.collector_number, language: item.language || 'EN', rarity: item.rarity,
    type: item.type, description: item.description, image: item.image,
    source_url: item.raw_hint?.source_url || '', internet_prices: item.internet_prices || []
  };
}

function PricePanel({ resolution }) {
  if (!resolution) return <div className="visual-r2-empty">Selecciona una coincidencia del catálogo de Internet.</div>;
  if (resolution.status !== 'INTERNET_IDENTIFIED') return <div className={`visual-r2-resolution ${resolution.status?.toLowerCase()}`}>
    <strong>{statusLabel(resolution.status)}</strong>
    <span>{resolution.status === 'AMBIGUOUS' ? 'Hay más de una carta posible. No se creará producto automáticamente.' :
      'Sin coincidencia segura en el catálogo maestro actual. Sincroniza el set con el módulo TCG existente.'}</span>
  </div>;
  const price = resolution.preferred_price;
  const cache = resolution.price_cache || {};
  return <div className="visual-r2-enrichment">
    <div className="visual-r2-price-head">
      <div><span>Precio preferente desde Internet</span><strong>{money(price?.market, price?.currency)}</strong></div>
      <span className={cache.fresh ? 'fresh' : 'stale'}>{cache.fresh ? 'Vigente' : 'Pendiente de actualización'}</span>
    </div>
    <div className="visual-r2-price-grid">
      <div><span>Low</span><strong>{money(price?.low, price?.currency)}</strong></div>
      <div><span>Mid</span><strong>{money(price?.mid, price?.currency)}</strong></div>
      <div><span>High</span><strong>{money(price?.high, price?.currency)}</strong></div>
      <div><span>Market</span><strong>{money(price?.market, price?.currency)}</strong></div>
    </div>
    <p className="visual-r2-cache-note">
      {resolution.tcgplayer_prices?.length ? `TCGplayer por proveedor de Internet · ${resolution.tcgplayer_prices.length} variante(s)` :
        'El proveedor de Internet no entregó precio TCGplayer; se muestra otra fuente cuando existe.'}
      {' · '}Origen {cache.origin === 'INTERNET' ? 'Internet consultado ahora' : 'caché GMX'}.
    </p>
    <div className="visual-r2-id-grid">
      <div><span>Master Card ID local</span><strong>{resolution.master?.row_id || 'No existe localmente'}</strong></div>
      <div><span>TCGplayer productId</span><strong>{resolution.tcgplayer?.product_id || 'No guardado'}</strong></div>
      <div><span>TCGplayer SKU</span><strong>{resolution.tcgplayer?.sku || 'No guardado'}</strong></div>
      <div><span>Producto GMX</span><strong>{resolution.operational?.card?.id_carta || 'Aún no creado'}</strong></div>
    </div>
  </div>;
}

/* GMX_EXTERNAL_REFERENCE_R13E */
function gmxExternalMarketplaceUrls(item,query){
  const name=String(item?.name||query||'').trim();
  const set=String(item?.set_code||item?.set_name||'').trim();
  const number=String(item?.collector_number||'').trim();
  const full=[name,set,number].filter(Boolean).join(' ').trim();
  const encoded=encodeURIComponent(full||name);

  return {
    tcgplayer:`https://www.tcgplayer.com/search/all/product?q=${encoded}&view=grid`,
    collectr:`https://www.collectr.com/search?query=${encoded}`
  };
}
export default function ExternalCardLookupBetaPage() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [mode, setMode] = useState('individual');
  const [game, setGame] = useState('YUGIOH');
  const [image, setImage] = useState('');
  const [query, setQuery] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [gmxRefOpen,setGmxRefOpen]=useState(false);
  const [gmxRefSource,setGmxRefSource]=useState('TCGplayer');
  const [gmxRefUrl,setGmxRefUrl]=useState('');
  const [gmxRefPrice,setGmxRefPrice]=useState('');
  const [gmxRefCondition,setGmxRefCondition]=useState('Near Mint');
  const [gmxRefVariant,setGmxRefVariant]=useState('');
  const [gmxRefSaved,setGmxRefSaved]=useState(null);
  const [resolution, setResolution] = useState(null);
  const [branches, setBranches] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [imageErrors, setImageErrors] = useState({});
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkResolveBusy, setBulkResolveBusy] = useState(false);
  const [entry, setEntry] = useState({
    id_sucursal: '', cantidad: 1, idioma: 'EN', condicion: 'NM', acabado: 'NORMAL', edicion: '',
    costo_unitario: 0, precio_venta: 0, precio_oferta: 0, origen_nombre: 'Búsqueda Visual',
    origen_referencia: '', notas: ''
  });
  const source = useMemo(() => GAMES.find((item) => item.id === game)?.source || '', [game]);
  const physicalCount = useMemo(() => bulkItems.reduce((sum, item) => sum + Number(item.count || 0), 0), [bulkItems]);

  useEffect(() => {
    api('/api/v1/branches?includeInactive=false').then((response) => {
      const list = response?.data || [];
      setBranches(list);
      setEntry((current) => ({ ...current, id_sucursal: current.id_sucursal || list[0]?.id_sucursal || '' }));
    }).catch(() => {});
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (mode !== 'bulk' || bulkResolveBusy) return undefined;
    const pending = bulkItems.filter((item) => item.resolve_status === 'PENDING').slice(0, CHUNK_RESOLVE);
    if (!pending.length) return undefined;
    const timer = window.setTimeout(() => resolveBulk(pending), 120);
    return () => window.clearTimeout(timer);
  }, [bulkItems, bulkResolveBusy, mode]);

  async function stopCamera() {
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return setMessage('Este navegador no permite acceso directo a la cámara.');
    setCameraBusy(true);
    setMessage('');
    try {
      await stopCamera();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
          facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }
        } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('CAMERA_NOT_READY');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
    } catch (error) {
      console.error(brandText('[GMX Visual TCG Camera]'), error);
      setMessage(error?.name === 'NotAllowedError' ? 'Permiso de cámara denegado.' : 'No fue posible abrir la cámara.');
    } finally {
      setCameraBusy(false);
    }
  }

  function prepareImage(img) {
    const ratio = 63 / 88;
    const sw = img.videoWidth || img.width;
    const sh = img.videoHeight || img.height;
    let ch = sh * (img.videoWidth ? 0.9 : 1);
    let cw = ch * ratio;
    if (cw > sw * 0.9) { cw = sw * 0.9; ch = cw / ratio; }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1400 / ch);
    canvas.width = Math.max(1, Math.round(cw * scale));
    canvas.height = Math.max(1, Math.round(ch * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  async function capturePhoto() {
    if (!videoRef.current?.videoWidth) return setMessage('La cámara todavía no está lista.');
    setImage(prepareImage(videoRef.current));
    setQuery('');
    clearIdentification();
    setMessage('Foto capturada. Identifica la carta.');
    await stopCamera();
  }

  function fileChosen(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImage(prepareImage(img));
        setQuery('');
        clearIdentification();
        setMessage('Imagen preparada. Identifica la carta.');
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  function clearIdentification() {
    setRows([]); setSelected(null); setResolution(null); setOcrText(''); setImageErrors({});
  }

  async function runOcr(silent = false) {
    if (!image) return '';
    setOcrBusy(true);
    if (!silent) setMessage('Leyendo texto de la carta…');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const result = await worker.recognize(image);
      await worker.terminate();
      const text = String(result?.data?.text || '').trim();
      const candidate = extractOcrQuery(text);
      setOcrText(text);
      if (candidate) setQuery(candidate);
      if (!silent) setMessage(candidate ? `Texto sugerido: ${candidate}` : 'No obtuve un nombre claro; escríbelo manualmente.');
      return candidate;
    } catch (error) {
      console.error(brandText('[GMX Visual TCG OCR]'), error);
      if (!silent) setMessage('OCR no disponible; escribe el nombre manualmente.');
      return '';
    } finally {
      setOcrBusy(false);
    }
  }

  async function resolveOne(item) {
    setResolveBusy(true);
    setResolution(null);
    try {
      const response = await api('/api/v1/external-card-beta/resolve-gmx', {
        method: 'POST', body: JSON.stringify({ identity: candidateIdentity(item) })
      });
      setResolution(response?.data || null);
      return response?.data || null;
    } catch (error) {
      setMessage(error?.message || 'La carta fue encontrada en Internet, pero no fue posible comprobar su existencia en GMX.');
      return null;
    } finally {
      setResolveBusy(false);
    }
  }

  async function choose(item) {
    setSelected(item);
    await resolveOne(item);
  }

  async function search(kind = 'photo') {
    let effectiveQuery = clean(query);
    if (kind === 'photo' && !image) return setMessage('Primero captura o selecciona una carta.');
    setSearchBusy(true); clearIdentification();
    try {
      if (effectiveQuery.length < 2 && kind === 'photo') effectiveQuery = clean(await runOcr(true));
      if (effectiveQuery.length < 2) return setMessage('Escribe el nombre de la carta o usa OCR.');
      setMessage(kind === 'photo' ? 'Identificando y comparando candidatos…' : 'Buscando candidatos…');
      const response = kind === 'photo' ? await api('/api/v1/external-card-beta/visual-search', {
        method: 'POST', body: JSON.stringify({ game, q: effectiveQuery })
      }) : await api(`/api/v1/external-card-beta/search?${new URLSearchParams({ game, q: effectiveQuery })}`);
      const found = kind === 'photo' ? response?.data?.matches || [] : response?.data?.rows || [];
      setRows(found);
      if (!found.length) return setMessage('La fuente externa no encontró una identidad candidata.');
      setMessage(`Identidad encontrada en Internet mediante ${source}. Comprobando después si ya existe en GMX…`);
      await choose(found[0]);
    } catch (error) {
      setMessage(error?.message || 'No fue posible identificar la carta.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function createOperationalProduct() {
    if (resolution?.status !== 'INTERNET_IDENTIFIED' || !selected) return;
    setMutationBusy(true);
    try {
      const response = await api('/api/v1/external-card-beta/ensure-operational', {
        method: 'POST', body: JSON.stringify({ identity: candidateIdentity(selected) })
      });
      setResolution((current) => ({ ...current, operational: {
        ...current.operational, card: response.data, variants: current.operational?.variants || []
      } }));
      setMessage(`Producto TCG actual listo: ${response.data.id_carta}.`);
    } catch (error) {
      setMessage(error?.message || 'No fue posible crear el producto TCG.');
    } finally {
      setMutationBusy(false);
    }
  }

  async function receiveIndividual() {
    const cardId = resolution?.operational?.card?.id_carta;
    if (!cardId) return setMessage('Primero crea o relaciona el producto TCG actual.');
    if (!entry.id_sucursal) return setMessage('Selecciona una sucursal.');
    setMutationBusy(true);
    try {
      const response = await api('/api/v1/tcg/inventory/receive', {
        method: 'POST', body: JSON.stringify({ ...entry, id_carta: cardId })
      });
      setMessage(`Existencia agregada. SKU ${response.data?.sku || 'creado'} · stock sucursal ${response.data?.stock_sucursal ?? '—'}.`);
    } catch (error) {
      setMessage(error?.message || 'No fue posible agregar existencia.');
    } finally {
      setMutationBusy(false);
    }
  }

  function addToBulk() {
    if (!selected) return setMessage('Selecciona la identidad exacta antes de contarla.');
    const identity = candidateIdentity(selected);
    setBulkItems((current) => {
      const index = current.findIndex((item) => item.key === identity.key);
      if (index >= 0) return current.map((item, position) => position === index ? { ...item, count: item.count + 1 } : item);
      return [...current, { key: identity.key, identity, preview: selected, count: 1, resolve_status: 'PENDING', resolution: null }];
    });
    setImage(''); setQuery(''); clearIdentification();
    setMessage('Carta contada. La resolución de catálogo y precios continúa en segundo plano. Captura la siguiente.');
  }

  async function resolveBulk(items) {
    setBulkResolveBusy(true);
    const keys = new Set(items.map((item) => item.key));
    setBulkItems((current) => current.map((item) => keys.has(item.key) && item.resolve_status === 'PENDING' ? { ...item, resolve_status: 'RESOLVING' } : item));
    try {
      const response = await api('/api/v1/external-card-beta/bulk-resolve-gmx', {
        method: 'POST', body: JSON.stringify({ identities: items.map((item) => item.identity) })
      });
      const results = new Map((response?.data?.rows || []).map((row) => [row.key, row]));
      setBulkItems((current) => current.map((item) => keys.has(item.key) ? {
        ...item, resolution: results.get(item.key) || null,
        resolve_status: results.get(item.key)?.status || 'NOT_FOUND'
      } : item));
    } catch (error) {
      setBulkItems((current) => current.map((item) => keys.has(item.key) ? { ...item, resolve_status: 'ERROR' } : item));
      setMessage(error?.message || 'Falló un bloque de enriquecimiento; la captura puede continuar.');
    } finally {
      setBulkResolveBusy(false);
    }
  }

  function changeBulkCount(key, delta) {
    setBulkItems((current) => current.map((item) => item.key === key ? { ...item, count: Math.max(0, item.count + delta) } : item).filter((item) => item.count > 0));
  }

  async function receiveBulk() {
    if (!entry.id_sucursal) return setMessage('Selecciona una sucursal para recibir el lote.');
    if (bulkItems.some((item) => ['PENDING', 'RESOLVING'].includes(item.resolve_status))) return setMessage('El enriquecimiento del lote sigue en proceso. La captura puede continuar mientras termina.');
    const matched = bulkItems.filter((item) => item.resolution?.status === 'INTERNET_IDENTIFIED');
    if (!matched.length) return setMessage('No hay identidades confirmadas mediante los proveedores de Internet.');
    setMutationBusy(true);
    try {
      const missing = matched.filter((item) => !item.resolution.operational?.card?.id_carta);
      const installed = new Map();
      for (const block of chunks(missing, CHUNK_INSTALL)) {
        const response = await api('/api/v1/external-card-beta/bulk-ensure-operational', {
          method: 'POST', body: JSON.stringify({ identities: block.map((item) => item.identity) })
        });
        for (const card of response?.data?.cards || []) installed.set(card.key, card.id_carta);
      }
      const receiptRows = matched.map((item) => ({
        ...entry,
        id_carta: item.resolution.operational?.card?.id_carta || installed.get(item.key),
        cantidad: item.count,
        origen_referencia: entry.origen_referencia || `VISUAL-${new Date().toISOString().slice(0, 10)}`
      })).filter((item) => item.id_carta);
      let ok = 0; let failed = 0;
      for (const block of chunks(receiptRows, CHUNK_RECEIVE)) {
        const response = await api('/api/v1/tcg/inventory/receive-bulk', {
          method: 'POST', body: JSON.stringify({ rows: block, sourceType: 'ADQUISICION' })
        });
        ok += Number(response?.data?.ok || 0); failed += Number(response?.data?.failed || 0);
      }
      setMessage(`Lote recibido: ${ok} identidad(es) única(s) correctas, ${failed} con error; ${matched.reduce((sum, item) => sum + item.count, 0)} carta(s) físicas procesadas.`);
    } catch (error) {
      setMessage(error?.message || 'No fue posible recibir el lote.');
    } finally {
      setMutationBusy(false);
    }
  }

  const entryFields = <div className="visual-r2-entry-grid">
    <label>Sucursal<select value={entry.id_sucursal} onChange={(event) => setEntry((current) => ({ ...current, id_sucursal: event.target.value }))}>
      <option value="">Selecciona</option>{branches.map((branch) => <option key={branch.row_id} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
    </select></label>
    {mode === 'individual' ? <label>Cantidad<input type="number" min="1" value={entry.cantidad} onChange={(event) => setEntry((current) => ({ ...current, cantidad: Math.max(1, Number(event.target.value) || 1) }))}/></label> : null}
    <label>Idioma<input value={entry.idioma} onChange={(event) => setEntry((current) => ({ ...current, idioma: event.target.value.toUpperCase() }))}/></label>
    <label>Condición<select value={entry.condicion} onChange={(event) => setEntry((current) => ({ ...current, condicion: event.target.value }))}>{CONDITIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Acabado<select value={entry.acabado} onChange={(event) => setEntry((current) => ({ ...current, acabado: event.target.value }))}>{FINISHES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Edición<input value={entry.edicion} onChange={(event) => setEntry((current) => ({ ...current, edicion: event.target.value }))}/></label>
    <label>Costo unitario<input type="number" min="0" step="0.01" value={entry.costo_unitario} onChange={(event) => setEntry((current) => ({ ...current, costo_unitario: Number(event.target.value) || 0 }))}/></label>
    <label>Precio venta<input type="number" min="0" step="0.01" value={entry.precio_venta} onChange={(event) => setEntry((current) => ({ ...current, precio_venta: Number(event.target.value) || 0 }))}/></label>
    <label>Precio oferta<input type="number" min="0" step="0.01" value={entry.precio_oferta} onChange={(event) => setEntry((current) => ({ ...current, precio_oferta: Number(event.target.value) || 0 }))}/></label>
  </div>;
  function gmxOpenMarketplace(kind){
    if(!selected){
      setMessage?.('Selecciona primero una coincidencia.');
      return;
    }
    const urls=gmxExternalMarketplaceUrls(selected,query);
    const url=kind==='collectr'?urls.collectr:urls.tcgplayer;
    window.open(url,'_blank','noopener,noreferrer');
  }

  function gmxStartReference(sourceName='TCGplayer'){
    if(!selected){
      setMessage?.('Selecciona primero una coincidencia.');
      return;
    }
    const urls=gmxExternalMarketplaceUrls(selected,query);
    setGmxRefSource(sourceName);
    setGmxRefUrl(sourceName==='Collectr'?urls.collectr:urls.tcgplayer);
    setGmxRefPrice(Number(selected?.market_price_usd)>0?Number(selected.market_price_usd).toFixed(2):'');
    setGmxRefCondition('Near Mint');
    setGmxRefVariant('');
    setGmxRefSaved(null);
    setGmxRefOpen(true);
  }

  async function gmxPaste(setter){
    try{
      const text=await navigator.clipboard.readText();
      setter(String(text||'').trim());
    }catch{
      if(typeof setMessage==='function'){
        setMessage('El navegador no permitió leer el portapapeles. Usa Ctrl+V.');
      }
    }
  }

  function gmxSaveReferenceTest(){
    if(!selected)return;

    const cleaned=String(gmxRefPrice||'')
      .replace(/[^0-9.,]/g,'')
      .replace(',','.');
    const parsed=cleaned?Number(cleaned):null;

    const payload={
      id:`gmx-ref-${Date.now()}`,
      card:{
        source:selected.source||source||'',
        game:selected.game||game||'',
        external_id:selected.external_id||'',
        name:selected.name||'',
        set_name:selected.set_name||'',
        set_code:selected.set_code||'',
        collector_number:selected.collector_number||'',
        rarity:selected.rarity||'',
        type:selected.type||'',
        language:selected.language||'',
        image:selected.image||''
      },
      reference:{
        marketplace:gmxRefSource,
        url:String(gmxRefUrl||'').trim(),
        condition:gmxRefCondition,
        variant:String(gmxRefVariant||'').trim(),
        price_usd:Number.isFinite(parsed)?parsed:null,
        captured_at:new Date().toISOString(),
        capture_method:'manual_user_confirmed'
      }
    };

    const key='gmx.externalReferenceTests.v1';
    let current=[];
    try{
      current=JSON.parse(localStorage.getItem(key)||'[]');
      if(!Array.isArray(current))current=[];
    }catch{
      current=[];
    }

    current.unshift(payload);
    localStorage.setItem(key,JSON.stringify(current.slice(0,50)));
    setGmxRefSaved(payload);

    if(typeof setMessage==='function'){
      setMessage(`Referencia de prueba guardada desde ${gmxRefSource}. Inventario sin cambios.`);
    }
  }

  return <div className="gmx-external-parity visual-r2">
    <section className="content-card visual-r2-hero">
      <div><div className="eyebrow">BÚSQUEDA VISUAL · INTERNET PRIMERO</div><h2>Alta Externa Beta R3</h2>
        <p>Identifica la carta en Internet aunque no exista en GMX; después comprueba producto, precio e inventario local.</p></div>
      <div className="visual-r2-mode"><button className={mode === 'individual' ? 'active' : ''} onClick={() => setMode('individual')}>Individual</button>
        <button className={mode === 'bulk' ? 'active' : ''} onClick={() => setMode('bulk')}>Bulk</button></div>
    </section>

    <section className="content-card visual-r2-capture">
      <div className="visual-r2-toolbar"><div className="external-game-tabs">{GAMES.map((item) => <button key={item.id} className={game === item.id ? 'active' : ''} onClick={() => { setGame(item.id); clearIdentification(); }}>{item.label}</button>)}</div>
        {mode === 'bulk' ? <div className="visual-r2-counters"><strong>{physicalCount}</strong><span>físicas</span><strong>{bulkItems.length}</strong><span>únicas</span></div> : null}</div>
      <div className="visual-r2-capture-grid">
        <div><div className={`external-parity-camera ${cameraActive ? 'active' : ''}`}><video ref={videoRef} autoPlay playsInline muted/>{!cameraActive ? <div className="external-parity-camera-placeholder"><strong>Cámara apagada</strong><span>Abre la cámara o selecciona un archivo.</span></div> : null}</div>
          <div className="external-parity-camera-actions">{cameraActive ? <><button onClick={capturePhoto}>Capturar foto</button><button className="secondary" onClick={stopCamera}>Cerrar</button></> : <button onClick={startCamera} disabled={cameraBusy}>{cameraBusy ? 'Abriendo…' : 'Abrir cámara'}</button>}
            <label className="secondary external-parity-file-btn">Seleccionar archivo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={fileChosen}/></label></div></div>
        <div className="external-parity-preview">{image ? <img src={image} alt="Carta capturada"/> : <div><strong>Siguiente carta</strong><span>Encuádrela completa.</span></div>}</div>
      </div>
      <div className="visual-r2-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre detectado o búsqueda manual"/>
        <button onClick={() => search('photo')} disabled={searchBusy || ocrBusy || !image}>{searchBusy ? 'Identificando…' : 'Identificar foto'}</button>
        <button className="secondary" onClick={() => runOcr(false)} disabled={ocrBusy || !image}>{ocrBusy ? 'Leyendo…' : 'OCR'}</button>
        <button className="secondary" onClick={() => search('text')} disabled={searchBusy}>Buscar texto</button></div>
      {message ? <div className="message visual-r2-message">{message}</div> : null}
      {ocrText ? <details className="external-parity-ocr"><summary>Texto OCR</summary><pre>{ocrText}</pre></details> : null}
    </section>

    <section className="content-card visual-r2-results">
      <div className="visual-r2-section-head"><div><h3>Identidad desde Internet</h3><p>{rows.length ? `${rows.length} candidato(s) en ${source}` : 'Sin candidatos todavía.'}</p></div>{resolveBusy ? <span className="visual-r2-working">Comprobando existencia en GMX…</span> : null}</div>
      <div className="visual-r2-result-grid"><div className="external-parity-match-list">{rows.slice(0, 10).map((item, index) => {
        const key = `${identityKey(item)}|${index}`; const src = imageSrc(item.image);
        return <article key={key} className={`external-parity-match ${selected === item ? 'selected' : ''}`} onClick={() => choose(item)}>
          <div className="external-parity-rank">#{index + 1}</div><div className="external-parity-thumb">{src && !imageErrors[key] ? <img src={src} alt="" onError={() => setImageErrors((current) => ({ ...current, [key]: true }))}/> : <span>TCG</span>}</div>
          <div className="external-parity-match-info"><strong>{item.name}</strong><span>{[item.set_name, item.set_code, item.collector_number].filter(Boolean).join(' · ')}</span><small>{item.rarity || '—'}</small></div>
          <div className="external-parity-score"><strong>{item.internet_match_score == null ? 'WEB' : `${Math.round(Number(item.internet_match_score))}%`}</strong><span>Internet</span></div>
        </article>;
      })}{!rows.length ? <div className="visual-r2-empty">La captura no espera precios: primero identifica la carta.</div> : null}</div>
        <PricePanel resolution={resolution}/></div>
      {mode === 'bulk' && selected ? <button className="visual-r2-next" onClick={addToBulk}>Contar esta carta y seguir inmediatamente</button> : null}
    </section>

    {mode === 'individual' ? <section className="content-card visual-r2-operation"><div className="visual-r2-section-head"><div><h3>Producto y existencia</h3><p>Usa exactamente el modelo TCG actual: carta → variante/SKU → stock por sucursal.</p></div></div>
      {entryFields}<div className="visual-r2-operation-actions">{resolution?.status === 'INTERNET_IDENTIFIED' && !resolution.operational?.card ? <button onClick={createOperationalProduct} disabled={mutationBusy}>Crear producto desde identidad de Internet</button> : null}
        <button onClick={receiveIndividual} disabled={mutationBusy || !resolution?.operational?.card}>{mutationBusy ? 'Procesando…' : 'Agregar existencia'}</button>
        {resolution?.preferred_price?.market != null ? <button className="secondary" onClick={() => setEntry((current) => ({ ...current, precio_venta: Number(resolution.preferred_price.market) }))}>Usar Market como precio</button> : null}</div></section> :
      <section className="content-card visual-r2-bulk"><div className="visual-r2-section-head"><div><h3>Lote deduplicado</h3><p>{physicalCount} carta(s) físicas → {bulkItems.length} identidad(es) única(s). El precio nunca bloquea la captura.</p></div><span>{bulkResolveBusy ? 'Enriqueciendo…' : 'Cola al día'}</span></div>
        <div className="visual-r2-bulk-list">{bulkItems.map((item) => <article key={item.key}><div><strong>{item.identity.name}</strong><span>{[item.identity.set_code, item.identity.collector_number].filter(Boolean).join(' · ') || 'Sin numeración'}</span></div>
          <span className={`visual-r2-status ${String(item.resolve_status).toLowerCase()}`}>{statusLabel(item.resolve_status)}</span><div className="visual-r2-stepper"><button onClick={() => changeBulkCount(item.key, -1)}>−</button><strong>{item.count}</strong><button onClick={() => changeBulkCount(item.key, 1)}>+</button></div></article>)}
          {!bulkItems.length ? <div className="visual-r2-empty">Cada identidad se consulta una sola vez aunque aparezca miles de veces.</div> : null}</div>
        <h4>Valores comunes para recepción</h4>{entryFields}<div className="visual-r2-operation-actions"><button onClick={receiveBulk} disabled={mutationBusy || !bulkItems.length}>{mutationBusy ? 'Procesando lote…' : 'Crear faltantes y recibir lote'}</button></div>
      </section>}
  
    {selected?<section className="content-card gmx-ref-r13e">
      <div className="gmx-ref-r13e-head">
        <div>
          <div className="eyebrow">PRUEBA · REFERENCIA EXTERNA</div>
          <h3>Usar selección desde marketplace</h3>
          <p>
            Abre la búsqueda en el marketplace, selecciona visualmente la impresión correcta
            y vuelve a GMX para confirmar precio, condición, variante y URL.
          </p>
        </div>
        <div className="gmx-ref-r13e-badge">NO MODIFICA INVENTARIO</div>
      </div>

      <div className="gmx-ref-r13e-card">
        <strong>{selected?.name||'Carta seleccionada'}</strong>
        <span>
          {[selected?.set_name,selected?.set_code,selected?.collector_number]
            .filter(Boolean).join(' · ')||'Sin set / número'}
        </span>
      </div>

      <div className="gmx-ref-r13e-actions">
        <button type="button" onClick={()=>gmxOpenMarketplace('tcgplayer')}>Abrir en TCGplayer</button>
        <button type="button" className="secondary" onClick={()=>gmxOpenMarketplace('collectr')}>Abrir en Collectr</button>
        <button type="button" className="secondary" onClick={()=>gmxStartReference('TCGplayer')}>Capturar referencia</button>
      </div>

      {gmxRefOpen?<div className="gmx-ref-r13e-form">
        <div className="gmx-ref-r13e-form-head">
          <strong>Confirmar datos observados</strong>
          <button type="button" className="secondary" onClick={()=>setGmxRefOpen(false)}>Cerrar</button>
        </div>

        <div className="gmx-ref-r13e-grid">
          <label>
            <span>Marketplace</span>
            <select value={gmxRefSource} onChange={e=>{
              const next=e.target.value;
              setGmxRefSource(next);
              const urls=gmxExternalMarketplaceUrls(selected,query);
              if(next==='TCGplayer')setGmxRefUrl(urls.tcgplayer);
              if(next==='Collectr')setGmxRefUrl(urls.collectr);
            }}>
              <option>TCGplayer</option>
              <option>Collectr</option>
              <option>Otro</option>
            </select>
          </label>

          <label>
            <span>Condición</span>
            <select value={gmxRefCondition} onChange={e=>setGmxRefCondition(e.target.value)}>
              <option>Near Mint</option>
              <option>Lightly Played</option>
              <option>Moderately Played</option>
              <option>Heavily Played</option>
              <option>Damaged</option>
              <option>Sin especificar</option>
            </select>
          </label>

          <label>
            <span>Precio observado (USD)</span>
            <div className="gmx-ref-r13e-input-action">
              <input value={gmxRefPrice} onChange={e=>setGmxRefPrice(e.target.value)} placeholder="Ej. 2.49"/>
              <button type="button" className="secondary" onClick={()=>gmxPaste(setGmxRefPrice)}>Pegar</button>
            </div>
          </label>

          <label>
            <span>Variante / impresión</span>
            <div className="gmx-ref-r13e-input-action">
              <input value={gmxRefVariant} onChange={e=>setGmxRefVariant(e.target.value)} placeholder="Ej. Foil / Alt Art"/>
              <button type="button" className="secondary" onClick={()=>gmxPaste(setGmxRefVariant)}>Pegar</button>
            </div>
          </label>

          <label className="gmx-ref-r13e-url">
            <span>URL exacta</span>
            <div className="gmx-ref-r13e-input-action">
              <input value={gmxRefUrl} onChange={e=>setGmxRefUrl(e.target.value)} placeholder="Pega la URL exacta del producto"/>
              <button type="button" className="secondary" onClick={()=>gmxPaste(setGmxRefUrl)}>Pegar</button>
            </div>
          </label>
        </div>

        <div className="gmx-ref-r13e-save">
          <button type="button" onClick={gmxSaveReferenceTest}>Guardar prueba en GMX</button>
          <span>Se guarda sólo en localStorage de este navegador. No toca BD, producto ni stock.</span>
        </div>

        {gmxRefSaved?<div className="gmx-ref-r13e-success">
          <strong>✓ Referencia guardada</strong>
          <span>
            {gmxRefSaved.card.name} · {gmxRefSaved.reference.marketplace}
            {gmxRefSaved.reference.price_usd!==null?` · $${gmxRefSaved.reference.price_usd.toFixed(2)} USD`:''}
            {gmxRefSaved.reference.condition?` · ${gmxRefSaved.reference.condition}`:''}
          </span>
        </div>:null}
      </div>:null}
    </section>:null}
</div>;
}
