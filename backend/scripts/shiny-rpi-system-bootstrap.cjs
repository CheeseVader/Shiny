// SHINY_BACKUP_REPROVISION_R151 - reinstala agente format:1 via postinstall
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function out(msg) {
  console.log(`[SHINY RPI BOOTSTRAP] ${msg}`);
}

if (process.platform !== 'linux') {
  out('No es Linux; se omite.');
  process.exit(0);
}

if (typeof process.getuid === 'function' && process.getuid() !== 0) {
  out('npm no se esta ejecutando como root; se omite provision de sistema.');
  process.exit(0);
}

const script = path.resolve(__dirname, 'PROVISIONAR-SHINY-RPI-AUTO-R1.sh');

if (!fs.existsSync(script)) {
  out(`No existe ${script}; se omite.`);
  process.exit(0);
}

try {
  fs.chmodSync(script, 0o755);
} catch {}

/* SHINY_BACKUP_BOOTSTRAP_R131
 * Instala el agente privilegiado de backup durante npm postinstall.
 * El Updater R4 ejecuta npm backend como root cuando backend/package.json cambia.
 */
function provisionBackupAgentR131() {
  const appDir = process.env.APP_DIR || '/opt/shiny/app';
  const appUser = process.env.APP_USER || 'shiny';
  const src = path.join(appDir, 'backend', 'scripts', 'shiny-backup-agent.sh');
  const crypto = path.join(appDir, 'backend', 'scripts', 'shiny-backup-crypto.cjs');
  const dstDir = '/usr/local/lib/shiny-backup';
  const dst = path.join(dstDir, 'shiny-backup-agent.sh');
  const sudoers = '/etc/sudoers.d/shiny-backup';

  if (!fs.existsSync(src)) throw new Error(`Falta ${src}`);
  if (!fs.existsSync(crypto)) throw new Error(`Falta ${crypto}`);

  fs.mkdirSync(dstDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync('/etc/shiny-backup', { recursive: true, mode: 0o700 });
  fs.mkdirSync('/var/lib/shiny-backup', { recursive: true, mode: 0o700 });
  fs.mkdirSync('/var/lib/shiny-backup/backups', { recursive: true, mode: 0o700 });
  fs.mkdirSync('/var/lib/shiny-backup/tmp', { recursive: true, mode: 0o700 });

  /* SHINY_BACKUP_LF_NORMALIZE_R134 */
  const normalizedAgentR134 = fs.readFileSync(src, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  fs.writeFileSync(dst, normalizedAgentR134, { encoding: 'utf8', mode: 0o755 });
  fs.chmodSync(dst, 0o755);

  fs.writeFileSync(
    sudoers,
    `${appUser} ALL=(root) NOPASSWD: ${dst}\n`,
    { encoding: 'utf8', mode: 0o440 }
  );
  fs.chmodSync(sudoers, 0o440);

  const check = spawnSync('/usr/sbin/visudo', ['-cf', sudoers], {
    stdio: 'pipe',
    encoding: 'utf8'
  });
  if ((check.status ?? 1) !== 0) {
    try { fs.unlinkSync(sudoers); } catch {}
    throw new Error(`sudoers invalido: ${(check.stderr || check.stdout || '').trim()}`);
  }

  out(`Backup R1.31 provisionado: ${dst}`);
}

try {
  provisionBackupAgentR131();
} catch (error) {
  out(`ERROR provisionando backup R1.31: ${error.message}`);
  process.exit(31);
}
const result = spawnSync('/bin/bash', [script], {
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_DIR: process.env.APP_DIR || '/opt/shiny/app'
  }
});

if (result.error) {
  out(`No se pudo ejecutar provisionador: ${result.error.message}`);
  // Nunca romper npm install por una falla de infraestructura remota.
  process.exit(0);
}

if ((result.status ?? 0) !== 0) {
  out(`Provisionador termino con codigo ${result.status}; Shiny continuara.`);
  process.exit(0);
}

out('Provision de sistema completado.');
process.exit(0);