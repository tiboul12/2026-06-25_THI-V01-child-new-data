/**
 * start-dev.js
 * Lance Angular (ng serve) puis Electron une fois le port 4200 disponible.
 * Usage : node start-dev.js
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const ANGULAR_PORT = 4202;
const CHECK_INTERVAL = 1000;
const MAX_WAIT_MS = 120000;

function tryConnect(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

function waitForPort(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    async function check() {
      const ok = await tryConnect(port, '127.0.0.1') || await tryConnect(port, '::1');
      if (ok) return resolve();
      if (Date.now() - start >= timeout) return reject(new Error(`Timeout : port ${port} non disponible après ${timeout / 1000}s`));
      setTimeout(check, CHECK_INTERVAL);
    }
    check();
  });
}

function spawnProcess(cmd, args, cwd, label) {
  const proc = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
  proc.on('error', (err) => console.error(`[${label}] Erreur:`, err.message));
  return proc;
}

async function main() {
  const root = __dirname;
  const angularDir = path.join(root, 'frankenstein');
  const electronDir = path.join(root, 'electron');

  console.log('[Dev] Démarrage de Angular (ng serve)...');
  const ngProc = spawnProcess('npm', ['start'], angularDir, 'Angular');

  console.log(`[Dev] Attente du port ${ANGULAR_PORT}...`);
  try {
    await waitForPort(ANGULAR_PORT, MAX_WAIT_MS);
  } catch (err) {
    console.error('[Dev]', err.message);
    ngProc.kill();
    process.exit(1);
  }

  console.log('[Dev] Angular prêt — démarrage de Electron...');
  const electronProc = spawnProcess('npm', ['start'], electronDir, 'Electron');

  function cleanup() {
    console.log('\n[Dev] Arrêt...');
    electronProc.kill();
    ngProc.kill();
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  electronProc.on('exit', () => { ngProc.kill(); process.exit(0); });
}

main();
