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