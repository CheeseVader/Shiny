import express from 'express';
import { execFile } from 'child_process';

const router = express.Router();

function runNmcli(args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/nmcli', args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error((stderr || stdout || err.message || '').trim());
        e.code = err.code;
        return reject(e);
      }
      resolve(String(stdout || ''));
    });
  });
}

function hostIsLocal(req) {
  const rawHost = String(req.headers.host || '');
  const host = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':')[0];
  const h = host.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

function connectionIsLoopback(req) {
  const ip = String(req.socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function localKioskOnly(req, res, next) {
  if (process.platform !== 'linux') return res.status(404).json({ error: 'not_available' });
  if (!hostIsLocal(req) || !connectionIsLoopback(req)) {
    return res.status(403).json({ error: 'local_kiosk_only' });
  }
  next();
}

function splitEscaped(line) {
  const out = [];
  let cur = '';
  let escaped = false;
  for (const ch of line) {
    if (escaped) {
      cur += ch;
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === ':') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

router.get('/networks', localKioskOnly, async (_req, res) => {
  try {
    await runNmcli(['device', 'wifi', 'rescan'], 12000).catch(() => {});
    const raw = await runNmcli([
      '-t', '--escape', 'yes',
      '-f', 'IN-USE,SSID,SIGNAL,SECURITY',
      'device', 'wifi', 'list', '--rescan', 'auto'
    ]);

    const bySsid = new Map();

    for (const line of raw.split(/\r?\n/)) {
      if (!line) continue;
      const [inUse, ssid, signalRaw, securityRaw] = splitEscaped(line);
      if (!ssid) continue;

      const signal = Math.max(0, Math.min(100, Number(signalRaw) || 0));
      const security = String(securityRaw || '');

      const item = {
        ssid,
        signal,
        secure: security !== '' && security !== '--',
        security,
        connected: inUse === '*'
      };

      const previous = bySsid.get(ssid);
      if (!previous || item.connected || item.signal > previous.signal) {
        bySsid.set(ssid, item);
      }
    }

    const networks = [...bySsid.values()].sort((a, b) =>
      Number(b.connected) - Number(a.connected) ||
      b.signal - a.signal ||
      a.ssid.localeCompare(b.ssid)
    );

    const activeRaw = await runNmcli([
      '-t', '--escape', 'yes',
      '-f', 'ACTIVE,SSID',
      'device', 'wifi'
    ]).catch(() => '');

    let connectedSsid = '';
    for (const line of activeRaw.split(/\r?\n/)) {
      if (!line) continue;
      const parts = splitEscaped(line);
      if (parts[0] === 'yes') {
        connectedSsid = parts[1] || '';
        break;
      }
    }

    res.json({ ok: true, connectedSsid, networks });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: 'wifi_scan_failed'
    });
  }
});

let connecting = false;

router.post('/connect', localKioskOnly, express.json(), async (req, res) => {
  if (connecting) {
    return res.status(409).json({ ok: false, error: 'connection_in_progress' });
  }

  const ssid = String(req.body?.ssid || '').trim();
  const password = String(req.body?.password || '');
  const secure = Boolean(req.body?.secure);

  if (!ssid || ssid.length > 128) {
    return res.status(400).json({ ok: false, error: 'invalid_ssid' });
  }
  if (secure && !password) {
    return res.status(400).json({ ok: false, error: 'password_required' });
  }
  if (password.length > 256) {
    return res.status(400).json({ ok: false, error: 'invalid_password' });
  }

  connecting = true;

  try {
    const args = ['device', 'wifi', 'connect', ssid];
    if (password) args.push('password', password);

    // Sin shell: SSID y contraseÃ±a viajan como argumentos separados.
    await runNmcli(args, 35000);

    res.json({ ok: true, ssid });
  } catch (e) {
    const msg = String(e.message || '');
    let error = 'connection_failed';

    if (/secrets were required|password|802-11-wireless-security|wrong password|authentication/i.test(msg)) {
      error = 'bad_password';
    }

    res.status(400).json({ ok: false, error });
  } finally {
    connecting = false;
  }
});

export default router;