import { execFile } from 'node:child_process';

/*
 * SHINY_TCG_CURL_TRANSPORT_R2
 *
 * En ciertas Raspberry/entornos de red, curl funciona correctamente pero el
 * fetch global de Node no logra salir por DNS/IPv6/TLS/proxy.
 *
 * Para el módulo TCG usamos curl como transporte de red. Se fuerza IPv4,
 * redirects, compresión, timeouts y reintentos.
 */

function curlExec(args, { timeout = 240000, maxBuffer = 128 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      args,
      {
        encoding: null,
        timeout: timeout + 5000,
        maxBuffer,
        env: process.env
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = Buffer.isBuffer(stderr)
            ? stderr.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 500)
            : String(stderr || error.message || error).replace(/\s+/g, ' ').trim().slice(0, 500);
          const e = new Error(`REMOTE_CURL_FAILED:${detail || error.message || error}`);
          e.cause = error;
          reject(e);
          return;
        }
        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || ''));
      }
    );
  });
}

function headerArgs(headers = {}) {
  const out = [];
  for (const [k, v] of Object.entries(headers || {})) {
    if (v === undefined || v === null || v === '') continue;
    out.push('-H', `${k}: ${v}`);
  }
  return out;
}

export async function tcgFetchBuffer(
  url,
  {
    headers = {},
    timeout = 240000,
    userAgent = 'SHINY-TCG-RPI/2.0'
  } = {}
) {
  const seconds = Math.max(5, Math.ceil(Number(timeout || 240000) / 1000));
  const args = [
    '-4',
    '--http1.1',
    '-L',
    '--fail-with-body',
    '--silent',
    '--show-error',
    '--compressed',
    '--connect-timeout', '60',
    '--max-time', String(seconds),
    '--retry', '4',
    '--retry-delay', '2',
    '--retry-all-errors',
    '-A', userAgent,
    ...headerArgs(headers),
    String(url)
  ];

  try {
    return await curlExec(args, { timeout });
  } catch (e) {
    const host = (() => { try { return new URL(url).host; } catch { return 'remote'; } })();
    throw new Error(`${String(e.message || e)}:${host}`);
  }
}

export async function tcgFetchJson(
  url,
  {
    headers = {},
    timeout = 240000,
    delayMs = 0,
    userAgent = 'SHINY-TCG-RPI/2.0'
  } = {}
) {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

  const buffer = await tcgFetchBuffer(url, {
    headers: {
      Accept: 'application/json',
      ...headers
    },
    timeout,
    userAgent
  });

  const text = buffer.toString('utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    const host = (() => { try { return new URL(url).host; } catch { return 'remote'; } })();
    throw new Error(
      `REMOTE_INVALID_JSON:${host}:${String(e.message || e).slice(0, 180)}:` +
      text.replace(/\s+/g, ' ').slice(0, 180)
    );
  }
}
