/* SHINY_RPI_KIOSK_PROVISIONER_R2 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function safeWrite(file, content, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { encoding: 'utf8', mode });
  try { fs.chmodSync(file, mode); } catch {}
}

try {
  if (process.platform === 'linux' && String(process.env.SHINY_KIOSK_DISABLE || '') !== '1') {
    const home = os.homedir();
    const desktop = fs.existsSync(path.join(home,'Escritorio')) ? path.join(home,'Escritorio') : path.join(home,'Desktop');
    const entry = `[Desktop Entry]
Version=1.0
Type=Application
Name=Shiny Kiosk
Comment=Shiny pantalla completa
Exec=/opt/shiny/app/kiosk/shiny-kiosk.sh
Icon=web-browser
Terminal=false
StartupNotify=false
`;
    safeWrite(path.join(desktop,'Shiny-Kiosk.desktop'),entry,0o755);
    console.log('[SHINY KIOSK] Launcher R2 preparado.');
  }
} catch (e) {
  console.warn('[SHINY KIOSK] Provisionador R2:', e?.message || e);
}