/* SHINY_RPI_KIOSK_PROVISIONER_R1
 * Se ejecuta al iniciar el backend.
 * Solo actua en Linux/Raspberry Pi y escribe dentro del HOME del usuario del servicio.
 * No requiere root y no toca .env, DB, branding, uploads ni configuracion del cliente.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function firstExisting(items) {
  return items.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || '';
}

function safeWrite(file, content, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { encoding: 'utf8', mode });
  try { fs.chmodSync(file, mode); } catch {}
}

function provisionRpiKiosk() {
  if (process.platform !== 'linux') return;
  if (String(process.env.SHINY_KIOSK_DISABLE || '') === '1') return;

  const home = os.homedir();
  if (!home || home === '/' || !fs.existsSync(home)) return;

  const browser = firstExisting([
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ]);

  if (!browser) {
    console.warn('[SHINY KIOSK] Chromium no encontrado; se conserva PWA fullscreen.');
    return;
  }

  const url = String(process.env.SHINY_KIOSK_URL || 'http://127.0.0.1/').trim();
  const profile = path.join(home, '.config', 'shiny-kiosk-profile');
  const binDir = path.join(home, '.local', 'bin');
  const launcher = path.join(binDir, 'shiny-kiosk');
  const desktopDir = firstExisting([
    path.join(home, 'Desktop'),
    path.join(home, 'Escritorio')
  ]) || path.join(home, 'Desktop');
  const desktopFile = path.join(desktopDir, 'Shiny-Kiosk.desktop');
  const autostartDir = path.join(home, '.config', 'autostart');
  const autostartFile = path.join(autostartDir, 'Shiny-Kiosk.desktop');

  const shell = `#!/usr/bin/env bash
set -u
BROWSER=${JSON.stringify(browser)}
URL=${JSON.stringify(url)}
PROFILE=${JSON.stringify(profile)}
mkdir -p "$PROFILE"
exec "$BROWSER" \
  --kiosk "$URL" \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --disable-features=TranslateUI \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  --start-fullscreen
`;

  const entry = `[Desktop Entry]
Version=1.0
Type=Application
Name=Shiny Kiosk
Comment=Shiny en pantalla completa
Exec=${launcher}
Icon=web-browser
Terminal=false
Categories=Office;
StartupNotify=false
`;

  safeWrite(launcher, shell, 0o755);
  safeWrite(desktopFile, entry, 0o755);

  const autostart = String(process.env.SHINY_KIOSK_AUTOSTART ?? '1') !== '0';
  if (autostart) {
    safeWrite(autostartFile, entry, 0o644);
  } else {
    try { fs.rmSync(autostartFile, { force: true }); } catch {}
  }

  console.log(`[SHINY KIOSK] Configurado para ${home}; autostart=${autostart ? 'on' : 'off'}`);
}

try {
  provisionRpiKiosk();
} catch (err) {
  // Nunca impedir que Shiny inicie por un problema del launcher gráfico.
  console.warn('[SHINY KIOSK] No se pudo provisionar:', err?.message || err);
}