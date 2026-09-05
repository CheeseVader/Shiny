import React, { useEffect, useMemo, useState } from 'react';
import './RpiWifiManager.css';

export default function RpiWifiManager({ open, onClose }) {
  const [networks, setNetworks] = useState([]);
  const [connectedSsid, setConnectedSsid] = useState('');
  const [selected, setSelected] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');

  const selectedNetwork = useMemo(
    () => networks.find((n) => n.ssid === selected) || null,
    [networks, selected]
  );

  async function refreshNetworks() {
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/rpi-wifi/networks', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || 'scan_failed');

      setNetworks(Array.isArray(data.networks) ? data.networks : []);
      setConnectedSsid(data.connectedSsid || '');

      if (!selected && data.connectedSsid) {
        setSelected(data.connectedSsid);
      }
    } catch {
      setMessage('No fue posible obtener las redes Wi-Fi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      refreshNetworks();
    } else {
      setPassword('');
      setShowPassword(false);
      setMessage('');
    }
  }, [open]);

  async function connect() {
    if (!selectedNetwork) return;

    if (selectedNetwork.secure && !password) {
      setMessage('Escribe la contraseÃ±a de la red.');
      return;
    }

    setConnecting(true);
    setMessage('Conectandoâ€¦');

    try {
      const response = await fetch('/api/rpi-wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: selectedNetwork.ssid,
          secure: selectedNetwork.secure,
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data?.error === 'bad_password') {
          setMessage('No fue posible conectarse. Verifica la contraseÃ±a.');
        } else {
          setMessage('No fue posible conectarse a esta red.');
        }
        return;
      }

      setConnectedSsid(selectedNetwork.ssid);
      setPassword('');
      setMessage(`Conectado a ${selectedNetwork.ssid}.`);
      setTimeout(refreshNetworks, 1200);
    } catch {
      // El cambio de red puede interrumpir brevemente la peticiÃ³n.
      setMessage('Verificando la nueva conexiÃ³nâ€¦');
      setTimeout(refreshNetworks, 1800);
    } finally {
      setConnecting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="rpiwifi-overlay" role="dialog" aria-modal="true" aria-label="Configurar Wi-Fi">
      <section className="rpiwifi-modal">
        <header className="rpiwifi-header">
          <div>
            <h2>Configurar Wi-Fi</h2>
            <p>
              {connectedSsid
                ? <>Conectado actualmente: <strong>{connectedSsid}</strong></>
                : 'Selecciona una red disponible'}
            </p>
          </div>
          <button type="button" className="rpiwifi-close" onClick={onClose} aria-label="Cerrar">Ã—</button>
        </header>

        <div className="rpiwifi-list">
          {loading && networks.length === 0 && (
            <div className="rpiwifi-empty">Buscando redesâ€¦</div>
          )}

          {!loading && networks.length === 0 && (
            <div className="rpiwifi-empty">No se encontraron redes.</div>
          )}

          {networks.map((network) => (
            <button
              type="button"
              key={network.ssid}
              className={`rpiwifi-network ${selected === network.ssid ? 'selected' : ''}`}
              onClick={() => {
                setSelected(network.ssid);
                setPassword('');
                setMessage('');
              }}
            >
              <span className="rpiwifi-signal">ðŸ“¶</span>
              <span className="rpiwifi-name">
                <strong>{network.ssid}</strong>
                <small>{network.connected ? 'Conectada' : `${network.signal}% de seÃ±al`}</small>
              </span>
              <span className="rpiwifi-security">
                {network.secure ? 'ðŸ”’' : 'Abierta'}
              </span>
            </button>
          ))}
        </div>

        {selectedNetwork && (
          <div className="rpiwifi-form">
            <div className="rpiwifi-selected">
              Red seleccionada: <strong>{selectedNetwork.ssid}</strong>
            </div>

            {selectedNetwork.secure && (
              <label className="rpiwifi-label">
                <span>ContraseÃ±a Wi-Fi</span>
                <div className="rpiwifi-password">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') connect();
                    }}
                    autoComplete="off"
                    autoFocus
                    placeholder="Escribe la contraseÃ±a"
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </label>
            )}
          </div>
        )}

        {message && <div className="rpiwifi-message">{message}</div>}

        <footer className="rpiwifi-actions">
          <button
            type="button"
            className="rpiwifi-secondary"
            onClick={refreshNetworks}
            disabled={loading || connecting}
          >
            {loading ? 'Buscandoâ€¦' : 'Actualizar redes'}
          </button>

          <button
            type="button"
            className="rpiwifi-primary"
            onClick={connect}
            disabled={!selectedNetwork || connecting}
          >
            {connecting ? 'Conectandoâ€¦' : 'Conectar'}
          </button>
        </footer>
      </section>
    </div>
  );
}