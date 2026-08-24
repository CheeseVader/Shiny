import { brandText } from "../config/brand.js";import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import SecureMedia from './SecureMedia.jsx';
import SlideshowMedia from './SlideshowMedia.jsx';
import BannerManager from './BannerManager.jsx';

const TEMPLATES = {
  TCG_BATTLE_ARENA: {
    name: 'TCG Battle Arena', recommended: true, premium: true,
    description: 'Competitivo y enfocado en torneos: cartas destacadas, eventos y una estética de arena TCG.',
    values: { primary: '#0b1220', secondary: '#f59e0b', accent: '#22d3ee', surface: '#111827', background: '#050914', text: '#f8fafc', muted: '#94a3b8', radius: '14', header_style: 'floating', card_style: 'glass', panel_opacity: '0.90', background_opacity: '0.30', background_overlay: '0.44', hero_height: '540', visual_fx: 'hud' }
  },
  ANIME_NEON_CITY: {
    name: 'Anime Neon City', premium: true,
    description: 'Ciudad nocturna anime/cyber con neón, paneles brillantes y hero de alto impacto.',
    values: { primary: '#11112b', secondary: '#22d3ee', accent: '#f472b6', surface: '#17172f', background: '#070716', text: '#ffffff', muted: '#c4b5fd', radius: '22', header_style: 'floating', card_style: 'glass', panel_opacity: '0.84', background_opacity: '0.40', background_overlay: '0.34', hero_height: '580', visual_fx: 'grid' }
  },
  RETRO_ARCADE_96: {
    name: 'Retro Arcade 96', premium: true,
    description: 'Arcade noventero con sensación CRT, bloques compactos y energía de gabinete clásico.',
    values: { primary: '#07111f', secondary: '#22d3ee', accent: '#ff3cac', surface: '#0b1728', background: '#030712', text: '#f8fafc', muted: '#8da2bd', radius: '8', header_style: 'solid', card_style: 'bordered', panel_opacity: '0.94', background_opacity: '0.30', background_overlay: '0.46', hero_height: '500', visual_fx: 'scanlines' }
  },
  COLLECTOR_VAULT: {
    name: 'Collector Vault', premium: true,
    description: 'Bóveda premium para singles, slabs y coleccionables de alto valor con foco en producto.',
    values: { primary: '#0b1220', secondary: '#d4af37', accent: '#67e8f9', surface: '#101827', background: '#050914', text: '#ffffff', muted: '#a5b4fc', radius: '12', header_style: 'solid', card_style: 'bordered', panel_opacity: '0.96', background_opacity: '0.18', background_overlay: '0.54', hero_height: '500', visual_fx: 'holo' }
  },
  SHONEN_CARD_FEST: {
    name: 'Shonen Card Fest', premium: true,
    description: 'Promociones, lanzamientos y eventos con una composición viva inspirada en festivales anime/TCG.',
    values: { primary: '#1e1b4b', secondary: '#fb7185', accent: '#facc15', surface: '#27224f', background: '#100d2c', text: '#fff7ed', muted: '#ddd6fe', radius: '20', header_style: 'floating', card_style: 'soft', panel_opacity: '0.90', background_opacity: '0.34', background_overlay: '0.32', hero_height: '560', visual_fx: 'sunset' }
  }
};

const pKey = (k) => `public.appearance.${k}`;
const aKey = (k) => `admin.appearance.${k}`;

export default function DualAppearanceDesigner({ settings, setSettings, media = [] }) {
  const [liveMedia, setLiveMedia] = useState(media || []);
  useEffect(() => setLiveMedia(media || []), [media]);

  async function refreshMediaLibrary() {
    try {
      const r = await api('/api/v1/content/media');
      setLiveMedia(r.data || []);
    } catch {}
  }

  useEffect(() => {
    window.addEventListener('gmx-media-library-updated', refreshMediaLibrary);
    return () => window.removeEventListener('gmx-media-library-updated', refreshMediaLibrary);
  }, []);

  const [scope, setScope] = useState('client');
  const [device, setDevice] = useState('desktop');
  const [runtime, setRuntime] = useState({ zones: {}, promotions: [], settings: {} });
  const [message, setMessage] = useState('');
  const [fullPreview, setFullPreview] = useState(false);
  const [builderTab, setBuilderTab] = useState('theme');

  useEffect(() => {
    api('/api/v1/cms/storefront-runtime?preview=true').then((r) => setRuntime(r.data || { zones: {}, promotions: [], settings: {} })).catch(() => {});
  }, []);

  function get(scopeName, key, fallback = '') {
    const prefix = scopeName === 'client' ? pKey(key) : aKey(key);
    const legacy = `appearance.${key}`;
    return settings[prefix] ?? settings[legacy] ?? fallback;
  }
  function set(scopeName, key, value) {
    const full = scopeName === 'client' ? pKey(key) : aKey(key);
    setSettings((x) => ({ ...x, [full]: String(value) }));
  }

  function applyTemplate(id) {
    const t = TEMPLATES[id];if (!t) return;
    setSettings((cur) => {
      const next = { ...cur, [pKey('template')]: id };
      Object.entries(t.values).forEach(([k, v]) => next[pKey(k)] = String(v));
      return next;
    });
    setMessage(`Template ${t.name} aplicado a la vista Cliente. Guarda para hacerlo permanente.`);
  }

  async function save() {
    const prefix = scope === 'client' ? 'public.appearance.' : 'admin.appearance.';
    const payload = Object.fromEntries(Object.entries(settings).filter(([k]) => k.startsWith(prefix)));
    try {
      await api('/api/v1/content/settings', { method: 'PUT', body: JSON.stringify(payload) });
      if (scope === 'admin') window.dispatchEvent(new Event('gmx-theme-changed'));
      setMessage(scope === 'client' ? 'Tema del CLIENTE guardado.' : 'Tema de ADMINISTRACIÓN guardado.');
    } catch (e) {setMessage(e.message);}
  }

  const publicStyle = {
    '--p-primary': get('client', 'primary', '#111827'),
    '--p-secondary': get('client', 'secondary', '#f59e0b'),
    '--p-accent': get('client', 'accent', '#8b5cf6'),
    '--p-surface': get('client', 'surface', '#111827'),
    '--p-bg': get('client', 'background', '#090e1a'),
    '--p-text': get('client', 'text', '#f8fafc'),
    '--p-muted': get('client', 'muted', '#94a3b8'),
    '--p-radius': `${Number(get('client', 'radius', '18'))}px`,
    '--p-panel-opacity': get('client', 'panel_opacity', '0.88')
  };

  return <div className="dual-designer">
    {message ? <div className="message">{message}</div> : null}
    <div className="designer-toolbar">
      <div className="scope-switch">
        <button className={scope === 'client' ? 'active' : ''} onClick={() => setScope('client')}>🛍 Cliente / Tienda</button>
        <button className={scope === 'admin' ? 'active' : ''} onClick={() => setScope('admin')}>🛠 Administración</button>
      </div>
      <div className="device-switch">
        <button className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>▱ Desktop</button>
        <button className={device === 'tablet' ? 'active' : ''} onClick={() => setDevice('tablet')}>▯ Tablet</button>
        <button className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}>▯ Móvil</button>
      </div>
      <button onClick={save}>Guardar {scope === 'client' ? 'tienda' : 'admin'}</button>
    </div>

    {scope === 'client' ? <>
      <div className="store-builder-tabs">
        <button className={builderTab === 'theme' ? 'active' : ''} onClick={() => setBuilderTab('theme')}>🎨 Tema / Templates</button>
        <button className={builderTab === 'hero' ? 'active' : ''} onClick={() => setBuilderTab('hero')}>🎞 Slideshow / Hero</button>
        <button className={builderTab === 'preview' ? 'active' : ''} onClick={() => setBuilderTab('preview')}>👁 Preview</button>
      </div>

      {builderTab === 'theme' ? <>
        <section className="template-section">
          <div className="designer-section-title"><div><h3>Templates Arcade / TCG / Anime</h3><p>Cinco estilos dinámicos como punto de partida; después puedes ajustar cada detalle.</p></div></div>
          <div className="template-grid">
            {Object.entries(TEMPLATES).map(([id, t]) => <button key={id} className={`template-card ${t.premium ? 'premium-template' : ''} ${get('client', 'template') === id ? 'selected' : ''}`} onClick={() => applyTemplate(id)}>
              <div className="template-badges">{t.premium ? <span className="premium-badge">ARCADE / TCG</span> : null}{t.recommended ? <span className="recommended">RECOMENDADO</span> : null}</div>
              <strong>{t.name}</strong><small>{t.description}</small>
              <div className="template-swatches"><i style={{ background: t.values.background }} /><i style={{ background: t.values.primary }} /><i style={{ background: t.values.secondary }} /><i style={{ background: t.values.accent }} /></div>
            </button>)}
          </div>
        </section>
        <div className="designer-layout">
          <ThemeForm title="Personalización de tienda" scope="client" get={get} set={set} media={liveMedia} />
          <StorePreview device={device} style={publicStyle} settings={settings} get={get} runtime={runtime} onOpenFull={() => setFullPreview(true)} />
        </div>
      </> : null}

      {builderTab === 'hero' ? <section className="hero-builder-wrap">
        <div className="designer-section-title"><div><h3>Slideshow / Hero</h3><p>Gestiona slides, imágenes, URLs, vigencia, autoplay y comportamiento responsive mientras observas el resultado.</p></div></div>
        <div className="hero-builder-grid">
          <BannerManager
            media={liveMedia}
            onMediaChanged={refreshMediaLibrary}
            onChanged={async () => {
              try {
                const r = await api('/api/v1/cms/storefront-runtime?preview=true');
                setRuntime(r.data || { zones: {}, promotions: [], settings: {} });
              } catch {}
            }} />
          
          <StorePreview device={device} style={publicStyle} settings={settings} get={get} runtime={runtime} heroOnly onOpenFull={() => setFullPreview(true)} />
        </div>
      </section> : null}

      {builderTab === 'preview' ? <StorePreview device={device} style={publicStyle} settings={settings} get={get} runtime={runtime} onOpenFull={() => setFullPreview(true)} /> : null}

      {fullPreview ? <div className="fullscreen-preview-modal">
        <div className="fullscreen-preview-toolbar"><strong>Preview completo · {device}</strong><button onClick={() => setFullPreview(false)}>Cerrar ✕</button></div>
        <StorePreview device={device} style={publicStyle} settings={settings} get={get} runtime={runtime} full />
      </div> : null}
    </> : <>
      <div className="designer-layout">
        <ThemeForm title="Personalización del servidor / admin" scope="admin" get={get} set={set} media={liveMedia} />
        <AdminPreview device={device} get={get} />
      </div>
    </>}
  </div>;
}

function ThemeForm({ title, scope, get, set, media }) {
  const client = scope === 'client';
  return <article className="contentmk-card theme-form">
    <h3>{title}</h3>
    <div className="contentmk-fields cols2">
      <label>Nombre de marca<input value={get(scope, 'brand_name', brandText("GMX"))} onChange={(e) => set(scope, 'brand_name', e.target.value)} /></label>
      <label>Texto/logo<input maxLength="4" value={get(scope, 'logo_text', 'G')} onChange={(e) => set(scope, 'logo_text', e.target.value)} /></label>
      <label>Principal<input type="color" value={get(scope, 'primary', '#111827')} onChange={(e) => set(scope, 'primary', e.target.value)} /></label>
      {client ? <label>Secundario<input type="color" value={get(scope, 'secondary', '#f59e0b')} onChange={(e) => set(scope, 'secondary', e.target.value)} /></label> : null}
      {client ? <label>Acento<input type="color" value={get(scope, 'accent', '#8b5cf6')} onChange={(e) => set(scope, 'accent', e.target.value)} /></label> : null}
      <label>Superficie<input type="color" value={get(scope, 'surface', '#ffffff')} onChange={(e) => set(scope, 'surface', e.target.value)} /></label>
      <label>Fondo<input type="color" value={get(scope, 'background', '#f2f4f7')} onChange={(e) => set(scope, 'background', e.target.value)} /></label>
      {client ? <label>Texto<input type="color" value={get(scope, 'text', '#f8fafc')} onChange={(e) => set(scope, 'text', e.target.value)} /></label> : null}
      <label className="span2">Imagen background<select value={get(scope, 'background_media_id', '')} onChange={(e) => set(scope, 'background_media_id', e.target.value)}><option value="">Sin imagen</option>{media.filter((m) => m.activo !== false).map((m) => <option key={m.id_media} value={m.id_media}>{m.nombre || m.nombre_archivo}</option>)}</select></label>
      <label>Radio<input type="range" min="4" max="30" value={get(scope, 'radius', client ? '18' : '14')} onChange={(e) => set(scope, 'radius', e.target.value)} /><span>{get(scope, 'radius', client ? '18' : '14')} px</span></label>
      <label>Opacidad paneles<input type="range" min=".55" max="1" step=".05" value={get(scope, 'panel_opacity', client ? '.88' : '.90')} onChange={(e) => set(scope, 'panel_opacity', e.target.value)} /><span>{Math.round(Number(get(scope, 'panel_opacity', client ? '.88' : '.90')) * 100)}%</span></label>
      <label>Opacidad background<input type="range" min="0" max="1" step=".05" value={get(scope, 'background_opacity', client ? '.28' : '.18')} onChange={(e) => set(scope, 'background_opacity', e.target.value)} /><span>{Math.round(Number(get(scope, 'background_opacity', client ? '.28' : '.18')) * 100)}%</span></label>
      <label>Overlay<input type="range" min="0" max=".85" step=".05" value={get(scope, 'background_overlay', client ? '.38' : '.30')} onChange={(e) => set(scope, 'background_overlay', e.target.value)} /><span>{Math.round(Number(get(scope, 'background_overlay', client ? '.38' : '.30')) * 100)}%</span></label>
      {client ? <label>Altura Hero<input type="range" min="320" max="720" step="20" value={get(scope, 'hero_height', '520')} onChange={(e) => set(scope, 'hero_height', e.target.value)} /><span>{get(scope, 'hero_height', '520')} px</span></label> : null}
      {client ? <label>Estilo header<select value={get(scope, 'header_style', 'floating')} onChange={(e) => set(scope, 'header_style', e.target.value)}><option value="floating">Floating</option><option value="solid">Sólido</option><option value="transparent">Transparente</option></select></label> : null}
      {client ? <label>Tarjetas<select value={get(scope, 'card_style', 'glass')} onChange={(e) => set(scope, 'card_style', e.target.value)}><option value="glass">Glass</option><option value="bordered">Bordeadas</option><option value="soft">Soft</option></select></label> : null}
    </div>
  </article>;
}

function StorePreview({ device, style, get, runtime, heroOnly = false, onOpenFull = () => {}, full = false }) {
  const zones = runtime?.zones || {};
  const promos = runtime?.promotions || [];
  const width = full ? '100%' : device === 'desktop' ? 1180 : device === 'tablet' ? 760 : 390;
  const bgId = get('client', 'background_media_id', '');
  const showFeatured = String(runtime?.settings?.['public.home.featured_banner_enabled'] ?? 'true') === 'true';
  const showMid = String(runtime?.settings?.['public.home.mid_banner_enabled'] ?? 'true') === 'true';

  return <article className={`preview-shell ${full ? 'full' : ''}`}>
    <div className="preview-label"><strong>PREVIEW CLIENTE</strong><div><span>{device.toUpperCase()} · {full ? 'FULL' : `${width}px`}</span>{!full ? <button className="preview-popout" onClick={onOpenFull}>⛶ Pantalla completa</button> : null}</div></div>
    <div className={`store-preview device-${device} fx-${get('client', 'visual_fx', 'none')}`} style={{ ...style, maxWidth: width }}>
      {bgId ? <SecureMedia mediaId={bgId} className="store-background" /> : null}
      <div className="store-overlay" style={{ opacity: Number(get('client', 'background_overlay', '.38')) }} />

      {!heroOnly ? <header className={`store-header ${get('client', 'header_style', 'floating')}`}>
        <div className="store-brand"><b>{get('client', 'logo_text', 'G')}</b><strong>{get('client', 'brand_name', brandText("GMX"))}</strong></div>
        <div className="store-search">🔎 Buscar cartas, productos, sets...</div>
        <nav><span>Magic</span><span>Yu-Gi-Oh!</span><span>Pokémon</span><span>One Piece</span><span>Más</span><span>👤</span><span>🛒 3</span></nav>
      </header> : null}

      {!heroOnly && promos.length && String(runtime?.settings?.['public.promo_bar.enabled'] ?? 'true') === 'true' ?
      <div className="promo-strip">🏷 {promos[0].nombre} {promos[0].codigo ? `· Código ${promos[0].codigo}` : ''}</div> : null}

      <main className="store-main-flow">
        <PreviewCarousel
          device={device}
          banners={zones.HOME_HERO || []}
          runtime={runtime}
          variant="hero"
          fallbackTitle="Tu tienda geek y TCG"
          fallbackSubtitle="Explora singles, productos sellados, accesorios y promociones." />
        

        {!heroOnly && showFeatured ? <PreviewCarousel
          device={device}
          banners={zones.HOME_FEATURED_BANNER || []}
          runtime={runtime}
          variant="wide"
          fallbackTitle=""
          fallbackSubtitle=""
          hideWhenEmpty /> :
        null}

        {!heroOnly ? <section className="store-section compact-section">
          <div className="store-title"><h2>Best Sellers</h2><span>Ver todos →</span></div>
          <div className="product-row">{[1, 2, 3, 4].map((x) => <div className="product-mock" key={x}><div className="card-art">TCG</div><b>Carta destacada</b><small>Near Mint</small><strong>$299.00</strong></div>)}</div>
        </section> : null}

        {!heroOnly && showMid ? <PreviewCarousel
          device={device}
          banners={zones.HOME_MID_BANNER || []}
          runtime={runtime}
          variant="wide"
          hideWhenEmpty /> :
        null}

        {!heroOnly ? <section className="store-section compact-section">
          <div className="store-title"><h2>Explora por TCG</h2><span>Catálogo completo →</span></div>
          <div className="category-row"><div>⚡ Pokémon</div><div>🔥 Magic</div><div>🐉 Yu-Gi-Oh!</div><div>🏴‍☠️ One Piece</div></div>
        </section> : null}
      </main>
    </div>
  </article>;
}

function PreviewCarousel({ device, banners = [], runtime, variant = 'hero', fallbackTitle = '', fallbackSubtitle = '', hideWhenEmpty = false }) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = banners.length ? banners[Math.min(slide, banners.length - 1)] : null;

  useEffect(() => {if (slide >= banners.length && banners.length) setSlide(0);}, [banners.length, slide]);

  const globalAutoplay = String(runtime?.settings?.['public.carousel.autoplay'] ?? 'true') === 'true';
  const seconds = Math.max(2, Number(current?.intervalo_segundos || runtime?.settings?.['public.carousel.interval_seconds'] || 6));
  useEffect(() => {
    if (banners.length < 2 || !globalAutoplay || current?.autoplay === false || paused) return;
    const id = setInterval(() => setSlide((x) => (x + 1) % banners.length), seconds * 1000);
    return () => clearInterval(id);
  }, [banners.length, globalAutoplay, current?.autoplay, paused, seconds]);

  if (hideWhenEmpty && !banners.length) return null;

  const defaultHeight = variant === 'hero' ?
  Number(device === 'mobile' ? runtime?.settings?.['public.hero.height_mobile'] || 320 : device === 'tablet' ? runtime?.settings?.['public.hero.height_tablet'] || 360 : runtime?.settings?.['public.hero.height_desktop'] || 430) :
  Number(device === 'mobile' ? runtime?.settings?.['public.home.featured_banner_height_mobile'] || 180 : device === 'tablet' ? runtime?.settings?.['public.home.featured_banner_height_tablet'] || 230 : runtime?.settings?.['public.home.featured_banner_height_desktop'] || 270);

  const ownHeight = Number(device === 'mobile' ? current?.altura_mobile || 0 : device === 'tablet' ? current?.altura_tablet || 0 : current?.altura_desktop || 0);
  const height = ownHeight || defaultHeight;
  const next = () => banners.length && setSlide((x) => (x + 1) % banners.length);
  const prev = () => banners.length && setSlide((x) => (x - 1 + banners.length) % banners.length);

  return <section className={`preview-carousel preview-carousel-${variant}`} style={{ height }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <BannerVisual banner={current} device={device} />
    <div className="hero-dark" style={{ opacity: Number(current?.overlay_opacity ?? (variant === 'hero' ? .28 : .12)) }} />
    {variant === 'hero' || current?.titulo || current?.subtitulo ? <div className={`hero-copy ${variant === 'wide' ? 'wide-copy' : ''} align-${String(current?.text_align || 'LEFT').toLowerCase()}`}>
      {variant === 'hero' ? <small>COLECCIONA · JUEGA · DISFRUTA</small> : null}
      {current?.titulo || fallbackTitle ? <h1>{current?.titulo || fallbackTitle}</h1> : null}
      {current?.subtitulo || fallbackSubtitle ? <p>{current?.subtitulo || fallbackSubtitle}</p> : null}
      {current?.texto_cta || variant === 'hero' ? <div className="hero-actions"><button>{current?.texto_cta || 'Explorar catálogo'}</button>{variant === 'hero' ? <button className="ghost">Buscar cartas TCG</button> : null}</div> : null}
    </div> : null}

    {banners.length > 1 && current?.mostrar_flechas !== false ? <>
      <button className="carousel-arrow prev" onClick={prev}>‹</button>
      <button className="carousel-arrow next" onClick={next}>›</button>
    </> : null}

    {banners.length > 1 && current?.mostrar_indicadores !== false ? <div className="carousel-dots">
      {banners.map((_, idx) => <button key={idx} className={idx === slide ? 'active' : ''} onClick={() => setSlide(idx)} />)}
    </div> : null}
  </section>;
}

function BannerVisual({ banner, device }) {
  return <SlideshowMedia banner={banner} device={device} />;
}

function AdminPreview({ device, get }) {
  const width = device === 'desktop' ? 1100 : device === 'tablet' ? 760 : 390;
  return <article className="preview-shell"><div className="preview-label"><strong>PREVIEW ADMIN</strong><span>{device.toUpperCase()}</span></div>
    <div className={`admin-preview device-${device}`} style={{ maxWidth: width, background: get('admin', 'background', '#f2f4f7'), borderRadius: Number(get('admin', 'radius', '14')) }}>
      <aside style={{ background: get('admin', 'primary', '#101828') }}><b>{get('admin', 'logo_text', 'G')}</b><strong>{get('admin', 'brand_name', brandText("GMX"))}</strong><span>Dashboard</span><span>Productos</span><span>Pedidos</span><span>TCG</span></aside>
      <main><small>{brandText("GMX ADMIN")}</small><h2>Dashboard</h2><div className="admin-metrics"><div>Productos<br /><b>128</b></div><div>Pedidos<br /><b>37</b></div></div><div className="admin-table-mock">Vista del servidor / backoffice</div></main>
    </div>
  </article>;
}
