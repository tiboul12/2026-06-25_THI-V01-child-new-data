'use strict';

const { spawn, exec } = require('child_process');
const net     = require('net');
const express = require('express');
const path    = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 9000;

const SERVICES = [
  { id: 'api',      name: 'API',      port: 3001, cmd: 'node',       args: ['server/server-data.js'],                                     color: '#10b981' },
  { id: 'agent',    name: 'Agent',    port: 3002, cmd: 'node',       args: ['server/server-agent.js'],                                    color: '#6366f1' },
  { id: 'portail',  name: 'Portail',  port: 4202, cmd: 'npx',        args: ['nx', 'serve', 'portail'],  env: { NX_DAEMON: 'false' },   color: '#f59e0b' },
  { id: 'projets',  name: 'Projets',  port: 4203, cmd: 'npx',        args: ['nx', 'serve', 'projets'],  env: { NX_DAEMON: 'false' },   color: '#3b82f6' },
  { id: 'electron', name: 'Electron', port: null, cmd: 'powershell', args: ['-ExecutionPolicy', 'Bypass', '-File', 'start-electron.ps1'], color: '#a855f7' },
];

const procs = {};
const logs  = {};
SERVICES.forEach(s => (logs[s.id] = []));

const ANSI_RE = /\x1B\[[0-9;?]*[A-Za-z]|\x1B[()][0-9A-Z]/g;
const strip   = s => s.replace(ANSI_RE, '').replace(/\r/g, '').trim();

function addLog(id, raw) {
  const text = strip(raw);
  if (!text) return;
  logs[id].push({ t: Date.now(), text });
  if (logs[id].length > 300) logs[id].splice(0, 100);
}

// ─── Port utils ──────────────────────────────────────────────────────────────

function portFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function freePort(port) {
  return new Promise(resolve => {
    exec(`netstat -ano | findstr ":${port} "`, (_e, out) => {
      if (!out || !out.trim()) return resolve();
      const pids = new Set();
      out.trim().split(/\r?\n/).forEach(line => {
        const p = line.trim().split(/\s+/);
        if (p.length >= 5 && p[3] === 'LISTENING') pids.add(p[4]);
      });
      if (!pids.size) return resolve();
      let n = pids.size;
      pids.forEach(pid => exec(`taskkill /PID ${pid} /T /F`, () => { if (!--n) resolve(); }));
    });
  });
}

// ─── Service management ──────────────────────────────────────────────────────

async function start(id) {
  const svc = SERVICES.find(s => s.id === id);
  if (!svc || procs[id]) return;

  if (svc.port && !(await portFree(svc.port))) {
    addLog(id, `[launcher] Port ${svc.port} occupé → libération`);
    await freePort(svc.port);
    await new Promise(r => setTimeout(r, 600));
  }

  addLog(id, '[launcher] Démarrage...');

  const proc = spawn(svc.cmd, svc.args, {
    cwd: ROOT, shell: true, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(svc.env ?? {}) },
  });

  procs[id] = { proc, pid: proc.pid, startedAt: Date.now() };

  const pipe = d => d.toString().split(/\r?\n/).forEach(l => addLog(id, l));
  proc.stdout.on('data', pipe);
  proc.stderr.on('data', pipe);
  proc.on('close', code => { addLog(id, `[launcher] Arrêté (code ${code ?? '?'})`); delete procs[id]; });
  proc.on('error', e   => { addLog(id, `[launcher] Erreur spawn: ${e.message}`);   delete procs[id]; });
}

function stop(id) {
  return new Promise(resolve => {
    const p = procs[id];
    if (!p) return resolve();
    addLog(id, '[launcher] Arrêt...');
    exec(`taskkill /PID ${p.pid} /T /F`, () => { delete procs[id]; setTimeout(resolve, 400); });
  });
}

async function getStatus() {
  return Promise.all(SERVICES.map(async svc => ({
    id:          svc.id,
    name:        svc.name,
    port:        svc.port,
    color:       svc.color,
    running:     !!procs[svc.id],
    portActive:  svc.port ? !(await portFree(svc.port)) : null,
    pid:         procs[svc.id]?.pid       ?? null,
    startedAt:   procs[svc.id]?.startedAt ?? null,
  })));
}

// ─── Express ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get('/',             (_,   res) => res.sendFile(path.join(__dirname, 'launcher-ui.html')));
app.get('/api/status',   async (_, res) => res.json(await getStatus()));
app.get('/api/logs/:id', (req, res) => res.json(logs[req.params.id] ?? []));

app.post('/api/start/:id', async (req, res) => { await start(req.params.id); res.json({ ok: true }); });
app.post('/api/stop/:id',  async (req, res) => { await stop(req.params.id);  res.json({ ok: true }); });

app.post('/api/start-all', async (_, res) => {
  await Promise.all(SERVICES.map(s => start(s.id)));
  res.json({ ok: true });
});

app.post('/api/stop-all', async (_, res) => {
  for (const s of SERVICES) await stop(s.id);
  res.json({ ok: true });
});

app.post('/api/shutdown', async (_, res) => {
  res.json({ ok: true });
  setTimeout(async () => {
    for (const s of SERVICES) await stop(s.id);
    process.exit(0);
  }, 200);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────

async function quit() {
  console.log('\n[launcher] Arrêt de tous les services...');
  for (const s of SERVICES) await stop(s.id);
  process.exit(0);
}
process.on('SIGINT',  quit);
process.on('SIGTERM', quit);

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║   Worganic Launcher                  ║`);
  console.log(`║   Dashboard → http://localhost:${PORT} ║`);
  console.log('╚══════════════════════════════════════╝\n');
  SERVICES.forEach(s => start(s.id));
});
