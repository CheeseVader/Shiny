import { brandText } from "../config/brand.js";import { useEffect, useState } from 'react';

export default function SlideshowMedia({ banner, device = 'desktop' }) {
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState('idle');
  const [detail, setDetail] = useState('');
  const mobile = device === 'mobile' && (banner?.url_mobile || banner?.id_media_mobile);

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    async function load() {
      setSrc('');
      setDetail('');
      if (!banner) {setStatus('empty');return;}

      const source = String(banner.media_source || 'LIBRARY').toUpperCase();
      if (source === 'URL') {
        const url = mobile ? banner.url_mobile || banner.url_desktop : banner.url_desktop;
        if (!url) {setStatus('missing');setDetail('El slide no tiene URL de imagen.');return;}
        setStatus('loading');
        setSrc(url);
        return;
      }

      const mediaId = mobile ? banner.id_media_mobile : banner.id_media_desktop;
      if (!mediaId) {setStatus('missing');setDetail('El slide no tiene imagen asignada en Multimedia.');return;}

      const token = localStorage.getItem('SHINY_AUTH_TOKEN') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      try {
        setStatus('loading');
        const st = await fetch(`/api/v1/cms/media-preview/${encodeURIComponent(mediaId)}/status`, { headers });
        const sj = await st.json().catch(() => ({}));
        if (!st.ok || sj.success === false) throw new Error(sj.message || sj.error || `HTTP ${st.status}`);
        if (!sj.data?.file_exists) {
          setStatus('missing');
          setDetail(brandText(`La imagen ${sj.data?.nombre || mediaId} existe en PostgreSQL, pero Shiny no encontró el archivo físico. Vuelve a subirla una vez; las nuevas cargas quedarán en backend/storage/media.`));
          return;
        }
        const r = await fetch(`/api/v1/cms/media-preview/${encodeURIComponent(mediaId)}/file`, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setDetail(e.message || 'No fue posible cargar la imagen.');
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [banner?.row_id, banner?.media_source, banner?.url_desktop, banner?.url_mobile, banner?.id_media_desktop, banner?.id_media_mobile, device, mobile]);

  if (status === 'empty') return null;

  if (status === 'missing' || status === 'error') {
    return <div className="slideshow-media-diagnostic">
      <strong>⚠ Imagen del slideshow no disponible</strong>
      <span>{detail}</span>
      <small>{String(banner?.media_source || 'LIBRARY').toUpperCase() === 'URL' ? 'Revisa la URL configurada.' : 'Vuelve a seleccionar o subir la imagen en Slideshow / Hero.'}</small>
    </div>;
  }

  if (!src) return <div className="slideshow-media-loading">Cargando imagen…</div>;

  return <img
    src={src}
    className="hero-media"
    alt={banner?.nombre || ''}
    onLoad={() => setStatus('ready')}
    onError={() => {
      setStatus('error');
      setDetail(String(banner?.media_source || 'LIBRARY').toUpperCase() === 'URL' ?
      'El navegador no pudo cargar la URL externa.' :
      'El archivo se obtuvo pero no pudo representarse como imagen.');
    }}
    style={{
      objectFit: banner?.object_fit || 'cover',
      objectPosition: banner?.object_position || 'center center'
    }} />;

}
