/**
 * electron/main.js
 * Point d'entrée Electron.
 * - Fork le serveur executor (server-executor.js) sur le port 3002
 * - Ouvre une BrowserWindow qui charge l'app Angular Frankenstein
 */

const { app, BrowserWindow, dialog } = require('electron');
const { fork } = require('child_process');
const path = require('path');

// Évite un crash fatal si le pipe stdout/stderr du launcher se ferme
process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });

const ANGULAR_URL = process.env.ANGULAR_URL || 'http://localhost:4202';

let executorProcess = null;
let mainWindow = null;

function startExecutorServer() {
  const executorPath = path.join(__dirname, 'executor', 'server-executor.js');

  executorProcess = fork(executorPath, [], {
    stdio: 'inherit'
  });

  executorProcess.on('error', (err) => {
    console.error('[Electron] Erreur du serveur executor:', err);
  });

  executorProcess.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      console.error(`[Electron] Serveur executor terminé avec code=${code}, signal=${signal}`);
    }
  });

  console.log('[Electron] Serveur executor démarré (port 3002)');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Frankenstein Child',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  console.log(`[Electron] Chargement de l'app Angular : ${ANGULAR_URL}`);

  loadWithRetry(mainWindow, ANGULAR_URL, 20);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Tente de charger l'URL toutes les 3s si Angular n'est pas encore prêt
function loadWithRetry(win, url, retriesLeft) {
  win.loadURL(url).then(() => {
    console.log('[Electron] App Angular chargée avec succès.');
  }).catch((err) => {
    if (retriesLeft > 0 && !win.isDestroyed()) {
      console.log(`[Electron] Angular pas encore prêt, nouvelle tentative dans 3s (${retriesLeft} restantes)...`);
      setTimeout(() => loadWithRetry(win, url, retriesLeft - 1), 3000);
    } else {
      console.error('[Electron] Impossible de charger Angular:', err);
      dialog.showErrorBox(
        'Erreur de chargement',
        `Impossible de se connecter à ${url}\n\nVérifie que le serveur Angular est bien démarré.`
      );
    }
  });
}

app.whenReady().then(() => {
  startExecutorServer();
  setTimeout(createWindow, 500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (executorProcess) {
    console.log('[Electron] Arrêt du serveur executor...');
    executorProcess.kill('SIGTERM');
    executorProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
