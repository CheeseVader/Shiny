import { brandText } from "../config/brand.js";import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import '../externalCardLookupBeta.css';

const GAMES = [
{ id: 'POKEMON', label: 'Pokémon', source: 'TCGdex' },
{ id: 'YUGIOH', label: 'Yu-Gi-Oh!', source: 'YGOPRODeck' },
{ id: 'MAGIC', label: 'Magic: The Gathering', source: 'Scryfall' }];


function money(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)} USD` : '—';
}

function imageSrc(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.includes('assets.tcgdex.net') && !/\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(v)) {
    return `${v}/high.webp`;
  }
  return v;
}

function normalizeExternalQuery(value) {
  return String(value || '').
  replace(/[._/\\]+/g, ' ').
  replace(/[^A-Za-z0-9À-ÿ'’:\- ]+/g, ' ').
  replace(/\s+/g, ' ').
  trim();
}
function extractOcrQuery(text) {
  const lines = String(text || '').
  split(/\r?\n/).
  map((x) => x.replace(/[^A-Za-z0-9À-ÿ'’:\- ]+/g, ' ').replace(/\s+/g, ' ').trim()).
  filter((x) => x.length >= 3 && x.length <= 60);

  const ignored = /^(basic|stage|trainer|energy|pokemon|pokémon|spell|trap|monster|effect|atk|def|illustrator|illus|hp|first edition|1st edition)$/i;
  return lines.find((x) => !ignored.test(x)) || lines[0] || '';
}

export default function ExternalCardLookupBetaPage() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [game, setGame] = useState('YUGIOH');
  const [image, setImage] = useState('');
  const [query, setQuery] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [imageErrors, setImageErrors] = useState({});

  const source = useMemo(() => GAMES.find((x) => x.id === game)?.source || '', [game]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Este navegador no permite acceso directo a la cámara.');
      return;
    }

    setCameraBusy(true);
    setMessage('');

    try {
      await stopCamera();

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true
        });
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('CAMERA_VIDEO_NOT_READY');

      video.srcObject = stream;
      await video.play();

      setCameraActive(true);
    } catch (e) {
      console.error(brandText("[GMX External Beta Camera]"), e);
      const name = String(e?.name || '');
      setMessage(
        name === 'NotAllowedError' ? 'Permiso de cámara denegado.' :
        name === 'NotFoundError' ? 'No se encontró una cámara disponible.' :
        name === 'NotReadableError' ? 'La cámara está siendo utilizada por otra aplicación.' :
        'No fue posible abrir la cámara.'
      );
      setCameraActive(false);
    } finally {
      setCameraBusy(false);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;

    if (!video?.videoWidth || !video?.videoHeight) {
      setMessage('La cámara todavía no está lista. Espera un segundo e inténtalo nuevamente.');
      return;
    }

    const ratio = 63 / 88;
    const sw = video.videoWidth;
    const sh = video.videoHeight;

    let ch = sh * 0.90;
    let cw = ch * ratio;

    if (cw > sw * 0.90) {
      cw = sw * 0.90;
      ch = cw / ratio;
    }

    const sx = Math.max(0, (sw - cw) / 2);
    const sy = Math.max(0, (sh - ch) / 2);

    const scale = Math.min(1, 1400 / ch);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cw * scale));
    canvas.height = Math.max(1, Math.round(ch * scale));

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setMessage('No fue posible preparar la captura.');
      return;
    }

    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);

    const captured = canvas.toDataURL('image/jpeg', 0.90);

    if (!captured || captured.length < 100) {
      setMessage('No fue posible generar la fotografía.');
      return;
    }

    setImage(captured);
    setRows([]);
    setSelected(null);
    setOcrText('');
    setImageErrors({});
    setMessage('Foto capturada correctamente.');

    await stopCamera();
  }

  function fileChosen(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const ratio = 63 / 88;
        const sw = img.width;
        const sh = img.height;

        let ch = sh;
        let cw = ch * ratio;

        if (cw > sw) {
          cw = sw;
          ch = cw / ratio;
        }

        const sx = Math.max(0, (sw - cw) / 2);
        const sy = Math.max(0, (sh - ch) / 2);

        const scale = Math.min(1, 1400 / ch);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(cw * scale));
        canvas.height = Math.max(1, Math.round(ch * scale));

        canvas.getContext('2d', { alpha: false }).
        drawImage(img, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);

        setImage(canvas.toDataURL('image/jpeg', 0.9));
        setRows([]);
        setSelected(null);
        setOcrText('');
        setImageErrors({});
        setMessage('Imagen preparada correctamente.');
      };

      img.src = String(reader.result || '');
    };

    reader.readAsDataURL(file);
  }

  async function runOcr() {
    if (!image) {
      setMessage('Primero captura o selecciona una carta.');
      return;
    }

    setOcrBusy(true);
    setMessage('Leyendo texto de la carta…');

    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const result = await worker.recognize(image);
      await worker.terminate();

      const text = String(result?.data?.text || '').trim();
      const candidate = extractOcrQuery(text);

      setOcrText(text);

      if (candidate) {
        setQuery(candidate);
        setMessage(`Texto sugerido: ${candidate}`);
      } else {
        setMessage('No pude obtener un nombre claro. Puedes escribirlo manualmente.');
      }
    } catch (e) {
      console.error(brandText("[GMX External Beta OCR]"), e);
      setMessage('No fue posible completar OCR. Puedes escribir el nombre manualmente.');
    } finally {
      setOcrBusy(false);
    }
  }

  async function searchByPhoto() {
    if (!image) {
      setMessage('Primero captura una fotografía de la carta.');
      return;
    }

    setSearchBusy(true);
    setRows([]);
    setSelected(null);
    setImageErrors({});

    let effectiveQuery = normalizeExternalQuery(query);

    try {
      if (effectiveQuery.length < 2) {
        setMessage('Leyendo la carta para obtener candidatos externos…');

        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const result = await worker.recognize(image);
        await worker.terminate();

        const text = String(result?.data?.text || '').trim();
        effectiveQuery = normalizeExternalQuery(extractOcrQuery(text));

        setOcrText(text);
        if (effectiveQuery) setQuery(effectiveQuery);
      }

      if (effectiveQuery.length < 2) {
        setMessage('No pude leer el nombre. Escríbelo en el campo de búsqueda y vuelve a presionar “Buscar por foto”.');
        return;
      }

      setMessage(`Buscando "${effectiveQuery}" y comparando imágenes externas…`);

      const response = await api('/api/v1/external-card-beta/visual-search', {
        method: 'POST',
        body: JSON.stringify({
          game,
          q: effectiveQuery,
          image_base64: image
        })
      });

      const matches = response?.data?.matches || [];
      setRows(matches);

      if (matches.length) {
        setSelected(matches[0]);
        const top = Math.round(Number(matches[0]?.visual_similarity || 0) * 100);
        setMessage(`Mejor coincidencia visual: ${top}%.`);
      } else {
        setMessage(response?.data?.message || 'No se encontraron coincidencias visuales externas.');
      }
    } catch (e) {
      console.error(brandText("[GMX External Photo Search]"), e);
      setMessage(e?.message || 'No fue posible realizar la búsqueda por fotografía.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function searchByText() {
    const q = String(query || '').trim();

    if (q.length < 2) {
      setMessage('Escribe al menos 2 caracteres.');
      return;
    }

    setSearchBusy(true);
    setRows([]);
    setSelected(null);
    setImageErrors({});
    setMessage('');

    try {
      const params = new URLSearchParams({ game, q });
      const response = await api(`/api/v1/external-card-beta/search?${params}`);

      const found = response?.data?.rows || [];
      setRows(found);

      if (!found.length) {
        setMessage('La fuente externa no encontró coincidencias.');
      }
    } catch (e) {
      setMessage(e?.message || 'No fue posible consultar la fuente externa.');
    } finally {
      setSearchBusy(false);
    }
  }

  return <div className="gmx-external-parity">
    <section className="content-card external-parity-hero">
      <div>
        <div className="eyebrow">LABORATORIO · MÓDULO AISLADO</div>
        <h2>Alta Externa Beta</h2>
        <p>
          Mismo flujo de captura que Búsqueda Visual Beta, pero consultando fuentes externas.
          Esta prueba sigue siendo de solo lectura.
        </p>
      </div>

      <div className="external-parity-status">
        <strong>SOLO LECTURA</strong>
        <span>{source}</span>
      </div>
    </section>

    <section className="content-card external-parity-camera-panel">
      <div className="external-parity-camera-head">
        <div>
          <h3>Cámara en vivo</h3>
          <p>Coloca únicamente la carta dentro de la ventana.</p>
        </div>

        <div className="external-game-tabs">
          {GAMES.map((g) => <button
            type="button"
            key={g.id}
            className={game === g.id ? 'active' : ''}
            onClick={() => {
              setGame(g.id);
              setRows([]);
              setSelected(null);
              setMessage('');
            }}>
            {g.label}</button>)}
        </div>
      </div>

      <div className={`external-parity-camera ${cameraActive ? 'active' : ''}`}>
        <video ref={videoRef} autoPlay playsInline muted />

        {!cameraActive ? <div className="external-parity-camera-placeholder">
          <strong>Cámara apagada</strong>
          <span>Presiona “Abrir cámara”.</span>
        </div> : null}
      </div>

      <div className="external-parity-camera-actions">
        {!cameraActive ?
        <button type="button" onClick={startCamera} disabled={cameraBusy}>
            {cameraBusy ? 'Abriendo cámara…' : 'Abrir cámara'}
          </button> :

        <>
            <button type="button" onClick={capturePhoto}>Capturar foto</button>
            <button type="button" className="secondary" onClick={stopCamera}>Cerrar cámara</button>
          </>
        }
      </div>
    </section>

    <section className="content-card external-parity-workbench">
      <div className="external-parity-capture">
        <h3>1. Imagen capturada</h3>

        <div className="external-parity-preview">
          {image ?
          <img src={image} alt="Carta capturada" /> :
          <div>
              <strong>Sin fotografía todavía</strong>
              <span>Abre la cámara y captura una carta.</span>
            </div>}
        </div>

        <div className="external-parity-file-row">
          <label className="secondary external-parity-file-btn">
            Seleccionar archivo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={fileChosen} />
            
          </label>
        </div>

        <div className="external-parity-actions">
          <button
            type="button"
            onClick={searchByPhoto}
            disabled={!image || searchBusy || ocrBusy}>
            
            {searchBusy ? 'Comparando imagen…' : 'Buscar por foto'}
          </button>

          {image ? <button
            type="button"
            className="secondary"
            onClick={runOcr}
            disabled={ocrBusy || searchBusy}>
            
            {ocrBusy ? 'Leyendo…' : 'Detectar nombre con OCR'}
          </button> : null}

          {image ? <button
            type="button"
            className="secondary"
            onClick={() => {
              setImage('');
              setQuery('');
              setOcrText('');
              setRows([]);
              setSelected(null);
              setMessage('');
            }}>
            Limpiar captura</button> : null}
        </div>

        <label className="external-parity-query">
          <span>Nombre / texto de búsqueda</span>
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej. Dark Magician" />
            
            <button type="button" className="secondary" onClick={searchByText} disabled={searchBusy}>
              Buscar por texto
            </button>
          </div>
        </label>

        {message ? <div className="message">{message}</div> : null}

        {ocrText ? <details className="external-parity-ocr">
          <summary>Ver texto OCR detectado</summary>
          <pre>{ocrText}</pre>
        </details> : null}
      </div>

      <div className="external-parity-results">
        <div className="external-parity-results-head">
          <div>
            <h3>2. Coincidencias externas</h3>
            <p>{rows.length ? `Top ${Math.min(rows.length, 10)} desde ${source}` : 'Resultados externos por imagen o texto.'}</p>
          </div>

          <div className="external-parity-metrics">
            <span>Fuente <strong>{source}</strong></span>
            <span>Resultados <strong>{rows.length}</strong></span>
          </div>
        </div>

        {!rows.length && !searchBusy ? <div className="external-parity-empty">
          Los resultados aparecerán aquí después de analizar una imagen.
        </div> : null}

        {searchBusy ? <div className="external-parity-empty">
          Generando candidatos y comparando imágenes…
        </div> : null}

        {rows.length ? <div className="external-parity-match-list">
          {rows.map((item, index) => {
            const key = `${item.source}-${item.external_id}-${item.set_code}-${index}`;
            const src = imageSrc(item.image);
            const broken = imageErrors[key];

            return <article
              className={`external-parity-match ${selected === item ? 'selected' : ''}`}
              key={key}
              onClick={() => setSelected(item)}>
              
              <div className="external-parity-rank">#{index + 1}</div>

              <div className="external-parity-thumb">
                {src && !broken ?
                <img
                  src={src}
                  alt={item.name || 'Carta'}
                  onError={() => setImageErrors((x) => ({ ...x, [key]: true }))} /> :

                <span>TCG</span>}
              </div>

              <div className="external-parity-match-info">
                <strong>{item.name || 'Carta sin nombre'}</strong>
                <span>{[item.set_name, item.set_code, item.collector_number].filter(Boolean).join(' · ') || 'Sin set'}</span>
                <small>{[item.rarity, item.type].filter(Boolean).join(' · ')}</small>
              </div>

              <div className="external-parity-score">
                {item.visual_similarity !== undefined ?
                <>
                    <strong>{Math.round(Number(item.visual_similarity || 0) * 100)}%</strong>
                    <span>similitud</span>
                  </> :
                <>
                    <strong>—</strong>
                    <span>texto</span>
                  </>}
              </div>
            </article>;
          })}
        </div> : null}
      </div>
    </section>

    {selected ? <section className="content-card external-parity-detail">
      <div className="external-parity-detail-image">
        {imageSrc(selected.image) ?
        <img src={imageSrc(selected.image)} alt={selected.name || 'Carta externa'} /> :
        <span>Sin imagen</span>}
      </div>

      <div className="external-parity-detail-data">
        <div className="eyebrow">FICHA EXTERNA · NO GUARDADA</div>
        <h2>{selected.name}</h2>

        <div className="external-parity-fields">
          <div><span>Juego</span><strong>{GAMES.find((x) => x.id === selected.game)?.label || selected.game || '—'}</strong></div>
          <div><span>Fuente</span><strong>{selected.source || source}</strong></div>
          <div><span>Set</span><strong>{selected.set_name || '—'}</strong></div>
          <div><span>Código</span><strong>{selected.set_code || '—'}</strong></div>
          <div><span>Número</span><strong>{selected.collector_number || '—'}</strong></div>
          <div><span>Rareza</span><strong>{selected.rarity || '—'}</strong></div>
          <div><span>Idioma</span><strong>{selected.language || '—'}</strong></div>
          <div><span>Mercado orientativo</span><strong>{money(selected.market_price_usd)}</strong></div>
        </div>

        {selected.description ? <p>{selected.description}</p> : null}

        <div className="external-parity-safe">
          Esta ficha es solamente de consulta. No se ha creado ningún producto ni movimiento de inventario.
        </div>
      </div>
    </section> : null}
  </div>;
}
