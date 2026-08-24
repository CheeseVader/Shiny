import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { authenticatedDownload } from '../utils/download.js';
import DualAppearanceDesigner from '../components/DualAppearanceDesigner.jsx';
import SecureMedia from '../components/SecureMedia.jsx';

const DEFAULT_APPEARANCE = {
  'appearance.brand_name': brandText("GMX"), 'appearance.logo_text': 'G', 'appearance.primary': '#101828',
  'appearance.surface': '#ffffff', 'appearance.background': '#f2f4f7', 'appearance.radius': '14',
  'appearance.density': 'comfortable', 'appearance.sidebar_compact': 'false'
};

export default function ContentMarketingPage() {
  const [tab, setTab] = useState('appearance');
  const [settings, setSettings] = useState({ ...DEFAULT_APPEARANCE });
  const [media, setMedia] = useState([]);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [impact, setImpact] = useState(null);
  const [checkingImpact, setCheckingImpact] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [importingUrls, setImportingUrls] = useState(false);

  async function load() {
    const settled = await Promise.allSettled([
    api('/api/v1/content/settings'),
    api('/api/v1/content/media')]
    );
    if (settled[0].status === 'fulfilled') {
      const obj = Object.fromEntries((settled[0].value.data || []).map((x) => [x.parametro, x.valor]));
      const next = { ...DEFAULT_APPEARANCE, ...obj };
      setSettings(next);applyAppearance(next);
    }
    if (settled[1].status === 'fulfilled') setMedia(settled[1].value.data || []);
    const errors = settled.filter((x) => x.status === 'rejected').map((x) => x.reason?.message).filter(Boolean);
    if (errors.length) setMessage(errors.join(' · '));
  }
  useEffect(() => {load();}, []);

  function applyAppearance(v) {
    const root = document.documentElement;
    root.style.setProperty('--gmx-primary', v['appearance.primary'] || '#101828');
    root.style.setProperty('--gmx-surface', v['appearance.surface'] || '#ffffff');
    root.style.setProperty('--gmx-background', v['appearance.background'] || '#f2f4f7');
    root.style.setProperty('--gmx-radius', `${Number(v['appearance.radius'] || 14)}px`);
    document.body.dataset.gmxDensity = v['appearance.density'] || 'comfortable';
  }

  async function uploadMedia(file, category = 'GENERAL') {
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('GMX_AUTH_TOKEN') || '';
      const r = await fetch('/api/v1/content/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Authorization': `Bearer ${token}`,
          'X-TCG-Store-Template-File-Name': encodeURIComponent(file.name),
          'X-TCG-Store-Template-File-Type': file.type || 'application/octet-stream',
          'X-TCG-Store-Template-Category': encodeURIComponent(category)
        }, body: file
      });
      const b = await r.json();
      if (!r.ok || b.success === false) throw new Error(b.message || b.error || `HTTP ${r.status}`);
      setMessage(b.data?.duplicate ? brandText(
        `"${file.name}" ya existía en Multimedia. GMX evitó crear un duplicado.`) :
      `Multimedia cargada: ${file.name}`);
      await load();
      window.dispatchEvent(new CustomEvent('gmx-media-library-updated', { detail: { id_media: b.data?.id_media } }));
    } catch (e) {setMessage(e.message);} finally {setUploading(false);}
  }

  async function toggleMedia(m) {
    try {
      await api(`/api/v1/content/media/${m.id_media}/active`, { method: 'POST', body: JSON.stringify({ active: m.activo === false }) });
      await load();
    } catch (e) {setMessage(e.message);}
  }

  async function requestDelete(m) {
    setDeleteTarget(m);setImpact(null);setCheckingImpact(true);
    try {
      const r = await api(`/api/v1/content/media/${m.id_media}/impact`);
      setImpact(r.data || { references: [], totalReferences: 0 });
    } catch (e) {
      setImpact({ error: e.message, references: [], totalReferences: 0 });
    } finally {setCheckingImpact(false);}
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const label = deleteTarget.nombre || deleteTarget.nombre_archivo || deleteTarget.id_media;
    try {
      const r = await api(`/api/v1/content/media/${deleteTarget.id_media}?detach=true`, { method: 'DELETE' });
      const detached = Number(r.data?.detachedReferences || 0);
      setMessage(detached ?
      `Multimedia eliminada: ${label}. También se retiró de ${detached} configuración(es) donde estaba en uso.` :
      `Multimedia eliminada: ${label}.`);
      setDeleteTarget(null);setImpact(null);
      await load();
      window.dispatchEvent(new Event('gmx-content-changed'));
    } catch (e) {setMessage(e.message);} finally
    {setDeleting(false);}
  }

  async function openMedia(m) {
    try {await authenticatedDownload(`/api/v1/content/media/${m.id_media}/file`, m.nombre_archivo || m.nombre || 'archivo');}
    catch (e) {setMessage(e.message);}
  }

  const duplicateHashes = useMemo(() => {
    const count = {};
    media.forEach((m) => {if (m.hash) count[m.hash] = (count[m.hash] || 0) + 1;});
    return count;
  }, [media]);


  async function uploadMany(files) {
    const list = [...(files || [])];if (!list.length) return;
    setUploading(true);let ok = 0,failed = 0;
    for (const file of list) {
      try {
        const token = localStorage.getItem('GMX_AUTH_TOKEN') || '';
        const r = await fetch('/api/v1/content/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'Authorization': `Bearer ${token}`,
            'X-TCG-Store-Template-File-Name': encodeURIComponent(file.name),
            'X-TCG-Store-Template-File-Type': file.type || 'application/octet-stream', 'X-TCG-Store-Template-Category': 'GENERAL' },
          body: file
        });
        const b = await r.json();
        if (!r.ok || b.success === false) throw new Error(b.message || b.error || `HTTP ${r.status}`);
        ok++;
      } catch {failed++;}
    }
    setUploading(false);await load();
    setMessage(`${ok} archivo(s) cargado(s)${failed ? ` · ${failed} con error` : ''}.`);
    window.dispatchEvent(new CustomEvent('gmx-media-library-updated'));
  }

  async function importUrls() {
    const urls = urlText.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
    if (!urls.length) return setMessage('Pega al menos una URL de imagen.');
    setImportingUrls(true);
    try {
      const r = await api('/api/v1/content/media/import-urls', {
        method: 'POST', body: JSON.stringify({ urls, category: 'GENERAL' })
      });
      const rows = r.data || [],ok = rows.filter((x) => x.success).length,fail = rows.length - ok;
      setMessage(`${ok} imagen(es) descargada(s) y guardada(s) localmente${fail ? ` · ${fail} con error` : ''}.`);
      setUrlText('');await load();
      window.dispatchEvent(new CustomEvent('gmx-media-library-updated'));
    } catch (e) {setMessage(e.message);} finally
    {setImportingUrls(false);}
  }

  return <div className="contentmk-page">
    <header className="contentmk-hero">
      <div>
        <div className="eyebrow">CONTENIDO · MARKETING</div>
        <h1>{settings['appearance.brand_name'] || brandText("GMX")} Content Center</h1>
        <p>Apariencia de la tienda/backoffice y biblioteca multimedia. Hero y slideshow se administran dentro de Apariencia.</p>
      </div>
      <div className="contentmk-kpis"><span><b>{media.length}</b> multimedia</span></div>
    </header>

    {message ? <div className="message">{message}</div> : null}

    <nav className="contentmk-nav contentmk-nav-clean">
      {[
      ['appearance', '🎨', 'Apariencia'],
      ['media', '🖼', 'Multimedia']].
      map(([id, icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}
    </nav>

    {tab === 'appearance' ? <section className="contentmk-section">
      <div className="section-title">
        <div><h2>Apariencia</h2><p>Diseña la tienda del cliente y el backoffice. Slideshow / Hero está integrado en Cliente / Tienda.</p></div>
      </div>
      <DualAppearanceDesigner settings={settings} setSettings={setSettings} media={media} />
    </section> : null}

    {tab === 'media' ? <section className="contentmk-section">
      <div className="section-title">
        <div><h2>Biblioteca multimedia</h2><p>Repositorio único de imágenes, videos y archivos utilizados por la apariencia del portal.</p></div>
        <label className="upload-button">{uploading ? 'Subiendo...' : 'Subir imágenes'}<input type="file" accept="image/*" multiple disabled={uploading} onChange={(e) => uploadMany(e.target.files)} /></label>
      </div>
      <div className="media-import-panel">
        <div><h3>Importar imágenes desde URL</h3>
          <p>{brandText("Pega una o varias URLs, una por línea. GMX las descarga y guarda localmente, por lo que el portal deja de depender del servidor externo.")}</p></div>
        <textarea rows="5" value={urlText} onChange={(e) => setUrlText(e.target.value)}
        placeholder={"https://sitio.com/imagen1.jpg\nhttps://sitio.com/imagen2.webp"} />
        <div className="media-import-actions">
          <span>Máximo 100 URLs · 20 MB por imagen.</span>
          <button disabled={importingUrls || !urlText.trim()} onClick={importUrls}>
            {importingUrls ? 'Descargando…' : 'Descargar y guardar localmente'}
          </button>
        </div>
      </div>
      <div className="media-grid">{media.map((m) => {
          const duplicate = !!m.hash && duplicateHashes[m.hash] > 1;
          return <article className={`media-card media-card-preview ${m.activo === false ? 'inactive' : ''}`} key={m.row_id}>
          <button className="media-thumbnail" type="button" onClick={() => openMedia(m)} title={`Abrir ${m.nombre || m.nombre_archivo}`}>
            {m.tipo === 'IMAGE' || String(m.mime_type || '').startsWith('image/') ?
              <SecureMedia
                mediaId={m.id_media}
                className="media-thumbnail-image"
                alt={m.nombre || m.nombre_archivo || 'Imagen multimedia'} /> :

              <div className="media-thumbnail-fallback">{m.tipo === 'VIDEO' ? '🎬' : '📄'}</div>}
            <span className="media-thumbnail-hover">Vista previa</span>
          </button>
          <div className="media-card-info">
            <strong>{m.nombre || m.nombre_archivo}</strong>
            <span>{m.categoria || 'GENERAL'} · {formatBytes(m.tamano_bytes)}</span>
            <small>{m.mime_type}</small>
            {m.url_origen ? <small className="media-origin-note" title={m.url_origen}>Importada desde URL · guardada localmente</small> : null}
            {duplicate ? <small className="media-duplicate-note">Registro duplicado detectado · puedes eliminar el sobrante de forma segura</small> : null}
          </div>
          <div className="row-actions">
            <button className="secondary compact" onClick={() => openMedia(m)}>Abrir</button>
            <button className="secondary compact" onClick={() => toggleMedia(m)}>{m.activo === false ? 'Activar' : 'Desactivar'}</button>
            <button className="danger compact" onClick={() => requestDelete(m)}>Eliminar</button>
          </div>
        </article>;
        })}
      {!media.length ? <div className="empty-box">La biblioteca está vacía.</div> : null}</div>
    </section> : null}

    {deleteTarget ? <div className="gmx-confirm-backdrop" role="presentation">
      <div className="gmx-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-media-title">
        <div className="gmx-confirm-icon">!</div>
        <div>
          <div className="eyebrow danger-text">ELIMINACIÓN PERMANENTE</div>
          <h2 id="delete-media-title">¿Eliminar multimedia?</h2>
          <p><b>{deleteTarget.nombre || deleteTarget.nombre_archivo || deleteTarget.id_media}</b> se eliminará permanentemente.</p>

          {checkingImpact ? <div className="impact-loading"><span className="mini-spinner" /> Revisando dónde se utiliza…</div> : null}
          {!checkingImpact && impact?.error ? <div className="impact-warning">{impact.error}</div> : null}
          {!checkingImpact && !impact?.error && Number(impact?.totalReferences || 0) > 0 ? <div className="impact-warning">
            <strong>Actualmente está en uso en {impact.totalReferences} referencia(s):</strong>
            <ul>{(impact.references || []).map((x, i) => <li key={`${x.source}-${x.reference}-${i}`}>{x.label}</li>)}</ul>
            <p>{brandText("Si continúas, GMX retirará automáticamente el archivo de estas configuraciones y después lo eliminará.")}</p>
          </div> : null}
          {!checkingImpact && !impact?.error && Number(impact?.totalReferences || 0) === 0 ? <div className="impact-safe">No hay configuraciones activas que dependan de este archivo.</div> : null}

          <div className="gmx-confirm-actions">
            <button className="secondary" disabled={deleting} onClick={() => {setDeleteTarget(null);setImpact(null);}}>Cancelar</button>
            <button className="danger" disabled={checkingImpact || deleting || !!impact?.error} onClick={confirmDelete}>
              {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </div>
    </div> : null}
  </div>;
}

function formatBytes(v) {
  const n = Number(v || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
