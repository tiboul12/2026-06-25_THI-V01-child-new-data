/**
 * Worganic Platform - Executor Server (Local Electron)
 * =====================================================
 * Responsable : exécution des IA (Claude CLI, Gemini CLI) sur le PC de l'utilisateur.
 * Ce serveur tourne localement dans l'application Electron.
 *
 * Port: 3002
 *
 * NE stocke AUCUNE donnée. NE lit PAS le dossier /data du cloud.
 * Reçoit les prompts depuis Angular via HTTP POST et stream le résultat via SSE.
 *
 * Routes exposées :
 *   POST /execute-prompt        → Lance claude/gemini CLI, stream SSE
 *   POST /execute-file-prompt   → Lance claude CLI pour un fichier, stream SSE
 *   POST /execute-workflow-ai   → Lance claude/gemini CLI pour workflow, stream SSE
 *   POST /stop-execution        → Tue le process CLI en cours
 *   GET  /api/cli-status        → Statut complet des CLI (cache)
 *   GET  /api/cli-check-only    → Statut CLI instantané (cache seulement)
 *   GET  /sync-model            → Sync model depuis fichiers Claude locaux
 *   POST /sync-model-force      → Force sync model
 *   POST /change-model          → Change le modèle actif (settings.local.json)
 *   GET  /get-model             → Retourne le modèle actif
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

// ============================================================
// Configuration
// ============================================================

const app = express();
const PORT = process.env.EXECUTOR_PORT || 3002;

// Fichiers de settings Claude (sur le PC de l'utilisateur)
const SETTINGS_GLOBAL_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const SETTINGS_LOCAL_FILE = path.join(os.homedir(), '.claude', 'settings.local.json');

// Store running AI processes by stepId
const runningProcesses = new Map();

// Modèles disponibles par provider (synchronisés avec server-data DEFAULT_MODELS)
const DEFAULT_MODELS = {
    gemini: [
        { value: 'gemini-3.1-pro-preview',  label: 'Gemini 3.1 Pro (Preview)',  costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-3-flash',          label: 'Gemini 3 Flash',            costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-3-flash-preview',  label: 'Gemini 3 Flash (Preview)',  costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-2.5-pro-preview',  label: 'Gemini 2.5 Pro (Preview)',  costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash',          costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-2.0-pro-preview',  label: 'Gemini 2.0 Pro (Preview)',  costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro',            costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash',          costInput: 0.075, costOutput: 0.30 }
    ],
    claude: [
        { value: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6',          costInput: 3.00,  costOutput: 15.00 },
        { value: 'claude-opus-4-6',              label: 'Claude Opus 4.6',            costInput: 15.00, costOutput: 75.00 },
        { value: 'claude-haiku-4-5-20251001',    label: 'Claude Haiku 4.5',           costInput: 0.80,  costOutput: 4.00 },
        { value: 'claude-3-7-sonnet-latest',     label: 'Claude 3.7 Sonnet (Latest)', costInput: 3.00,  costOutput: 15.00 },
        { value: 'claude-3-5-sonnet-latest',     label: 'Claude 3.5 Sonnet',          costInput: 3.00,  costOutput: 15.00 },
        { value: 'claude-3-5-haiku-latest',      label: 'Claude 3.5 Haiku',           costInput: 0.80,  costOutput: 4.00 },
        { value: 'claude-3-opus-latest',         label: 'Claude 3 Opus',              costInput: 15.00, costOutput: 75.00 }
    ]
};

// Cache for CLI status
let cachedCliStatus = {
    gemini: { installed: false, version: '', models: [], lastCheck: 0 },
    claude: { installed: false, version: '', models: [], lastCheck: 0 },
    loading: false
};

// ============================================================
// Middleware
// ============================================================

app.use(cors({
    origin: [
        'http://localhost:4200',
        'http://localhost:4201',
        'http://localhost:4202',
        'http://localhost:3001',
        'http://127.0.0.1:4200',
        'http://127.0.0.1:4201',
        'http://127.0.0.1:4202',
        // Ajouter l'URL de prod Angular ici :
        // 'https://app.worganic.com'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`[EXECUTOR] ${req.method} ${req.url}`);
    next();
});

// ============================================================
// Settings helpers (lecture/écriture des settings Claude locaux)
// ============================================================

function readConfSettings() {
    // Fallback minimal si aucun settings n'est trouvé
    return { model: 'claude-sonnet-4-6', provider: 'claude' };
}

function readGlobalSettings() {
    try {
        const content = fs.readFileSync(SETTINGS_GLOBAL_FILE, 'utf8');
        const settings = JSON.parse(content);
        return {
            model: settings.model || null,
            provider: settings.provider || 'claude'
        };
    } catch (err) {
        return null;
    }
}

function readLocalSettings() {
    try {
        const content = fs.readFileSync(SETTINGS_LOCAL_FILE, 'utf8');
        const settings = JSON.parse(content);
        return {
            model: settings.model || null,
            provider: settings.provider || 'claude'
        };
    } catch (err) {
        return null;
    }
}

function writeLocalSettings(settings) {
    try {
        let localSettings = {};
        if (fs.existsSync(SETTINGS_LOCAL_FILE)) {
            try {
                const content = fs.readFileSync(SETTINGS_LOCAL_FILE, 'utf8');
                localSettings = JSON.parse(content);
            } catch (parseErr) { /* ignore */ }
        } else {
            fs.mkdirSync(path.dirname(SETTINGS_LOCAL_FILE), { recursive: true });
        }

        if (settings.model) localSettings.model = settings.model;
        if (settings.provider) localSettings.provider = settings.provider;

        fs.writeFileSync(SETTINGS_LOCAL_FILE, JSON.stringify(localSettings, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Error writing settings.local.json:', err);
        return false;
    }
}

function getCurrentSettings() {
    const local = readLocalSettings();
    const global = readGlobalSettings();
    const conf = readConfSettings();

    return {
        model: (local && local.model) || (global && global.model) || conf.model || 'claude-sonnet-4-6',
        provider: (local && local.provider) || (global && global.provider) || conf.provider || 'claude'
    };
}

function syncModelFromGlobal() {
    const global = readGlobalSettings();
    const local = readLocalSettings();

    const source = global;

    let syncResults = {
        synced: false,
        model: (source && source.model) || (local && local.model) || 'claude-sonnet-4-6',
        provider: (source && source.provider) || (local && local.provider) || 'claude',
        changes: []
    };

    if (!source) return syncResults;

    const localModel = local ? local.model : null;
    const localProvider = local ? local.provider : 'claude';

    let needsUpdate = false;
    let newSettings = {};

    if (source.model && localModel !== source.model) {
        needsUpdate = true;
        newSettings.model = source.model;
        syncResults.changes.push({ key: 'model', from: localModel, to: source.model });
    }

    if (source.provider && localProvider !== source.provider) {
        needsUpdate = true;
        newSettings.provider = source.provider;
        syncResults.changes.push({ key: 'provider', from: localProvider, to: source.provider });
    }

    if (needsUpdate) {
        writeLocalSettings(newSettings);
        syncResults.synced = true;
        syncResults.model = newSettings.model || syncResults.model;
        syncResults.provider = newSettings.provider || syncResults.provider;
    }

    return syncResults;
}

// ============================================================
// CLI Status Cache
// ============================================================

async function refreshCliStatusCache(provider) {
    console.log(`[CLI-CACHE] Refreshing CLI status (Provider: ${provider || 'ALL'})...`);

    if (cachedCliStatus.loading) {
        return;
    }
    cachedCliStatus.loading = true;

    const checkCli = async (commands) => {
        const cmdList = Array.isArray(commands) ? commands : [commands];

        let npmGlobalPath = '';
        if (process.platform === 'win32') {
            try {
                npmGlobalPath = require('child_process').execSync('npm config get prefix', { encoding: 'utf8' }).trim();
            } catch (e) {}
        }

        for (const cmd of cmdList) {
            const pathsToTry = [cmd];
            if (npmGlobalPath) {
                pathsToTry.push(path.join(npmGlobalPath, cmd));
                pathsToTry.push(path.join(npmGlobalPath, 'node_modules', '.bin', cmd));
            }

            for (const fullPath of pathsToTry) {
                const res = await new Promise((resolve) => {
                    const proc = spawn(fullPath, ['--version'], { shell: true });
                    let out = '';
                    let err = '';
                    proc.stdout?.on('data', (d) => { out += d.toString(); });
                    proc.stderr?.on('data', (d) => { err += d.toString(); });

                    const t = setTimeout(() => {
                        try { proc.kill(); } catch(e) {}
                        resolve(null);
                    }, 15000);

                    proc.on('close', (code) => {
                        clearTimeout(t);
                        const v = (out.trim() || err.trim()).split('\n')[0];
                        if (v && (code === 0 || /^\d+\.\d+/.test(v))) resolve(v);
                        else resolve(null);
                    });
                    proc.on('error', () => { clearTimeout(t); resolve(null); });
                });
                if (res) return res;
            }
        }
        return null;
    };

    try {
        const checkGemini = !provider || provider === 'gemini';
        const checkClaude = !provider || provider === 'claude';

        if (checkGemini) {
            const gVer = await checkCli(['gemini', 'gemini-cli', 'gemini.cmd']);
            cachedCliStatus.gemini.installed = !!gVer;
            cachedCliStatus.gemini.version = gVer || '';
            cachedCliStatus.gemini.lastCheck = Date.now();
            if (gVer) cachedCliStatus.gemini.models = DEFAULT_MODELS.gemini;
        }

        if (checkClaude) {
            const cVer = await checkCli(['claude', 'claude-code', 'claude.cmd']);
            cachedCliStatus.claude.installed = !!cVer;
            cachedCliStatus.claude.version = cVer || '';
            cachedCliStatus.claude.lastCheck = Date.now();
            if (cVer) cachedCliStatus.claude.models = DEFAULT_MODELS.claude;
        }

        console.log('[CLI-CACHE] Refresh complete.');
    } catch (e) {
        console.error('[CLI-CACHE] Error:', e);
    } finally {
        cachedCliStatus.loading = false;
    }
}

// ============================================================
// SSE Helpers
// ============================================================

function setupSSE(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
}

function sseWrite(res, type, message, extra) {
    const data = { type, message, ...extra };
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ============================================================
// ROUTES: Model Settings
// ============================================================

// GET /sync-model - Sync model depuis les settings Claude globaux
app.get('/sync-model', (req, res) => {
    const syncResult = syncModelFromGlobal();
    res.json({
        success: true,
        synced: syncResult.synced,
        model: syncResult.model,
        provider: syncResult.provider,
        changes: syncResult.changes
    });
});

// POST /sync-model-force - Force sync
app.post('/sync-model-force', (req, res) => {
    const syncResult = syncModelFromGlobal();
    res.json({
        success: true,
        synced: syncResult.synced,
        model: syncResult.model,
        provider: syncResult.provider,
        message: syncResult.synced ? 'Settings synchronized' : 'Already synchronized'
    });
});

// POST /change-model - Change le modèle actif (écrit dans settings.local.json du user)
app.post('/change-model', (req, res) => {
    const { model: newModel, provider: newProvider } = req.body;

    if (!newModel) {
        return res.status(400).json({ success: false, message: 'Model required' });
    }

    const current = readLocalSettings() || {};
    const settings = {
        model: newModel,
        provider: newProvider || current.provider || 'claude'
    };

    const success = writeLocalSettings(settings);

    if (success) {
        console.log(`[EXECUTOR] Config changed: Provider=${settings.provider}, Model=${settings.model}`);
        res.json({
            success: true,
            message: 'Configuration updated',
            updatedFile: SETTINGS_LOCAL_FILE,
            note: 'Restart CLI to apply'
        });
    } else {
        res.status(500).json({ success: false, message: 'Error updating configuration file' });
    }
});

// GET /get-model - Retourne le modèle actif
app.get('/get-model', (req, res) => {
    const settings = getCurrentSettings();
    res.json({
        success: true,
        model: settings.model,
        provider: settings.provider
    });
});

// ============================================================
// ROUTES: CLI Status
// ============================================================

// GET /api/cli-check-only - Retourne le statut en cache instantanément
app.get('/api/cli-check-only', (req, res) => {
    res.json({
        gemini: { installed: cachedCliStatus.gemini.installed, version: cachedCliStatus.gemini.version },
        claude: { installed: cachedCliStatus.claude.installed, version: cachedCliStatus.claude.version }
    });
    const provider = req.query.provider;
    if (req.query.force === 'true' || Date.now() - cachedCliStatus.gemini.lastCheck > 300000) {
        refreshCliStatusCache(provider);
    }
});

// GET /api/cli-status - Retourne le statut complet (avec modèles)
app.get('/api/cli-status', (req, res) => {
    res.json({
        gemini: cachedCliStatus.gemini,
        claude: cachedCliStatus.claude
    });
});

// ============================================================
// ROUTES: AI Execution (SSE Streaming)
// ============================================================

/**
 * POST /execute-prompt
 * Body: { stepId, content, provider?, model? }
 * - content   : le texte du prompt à envoyer à l'IA
 * - provider  : 'claude' ou 'gemini' (optionnel, utilise getCurrentSettings() si absent)
 * - model     : nom du modèle (optionnel)
 * - stepId    : identifiant de l'étape (pour le suivi côté Angular)
 *
 * Streame le résultat via SSE. Ne sauvegarde rien sur le disque.
 */
app.post('/execute-prompt', (req, res) => {
    try {
        const { stepId, content: promptContent, provider: bodyProvider, model: bodyModel } = req.body;

        if (!stepId || !promptContent) {
            return res.status(400).json({ success: false, message: 'stepId and content required' });
        }

        const settings = getCurrentSettings();
        const rawProvider = bodyProvider || settings.provider || 'claude';
        const provider = rawProvider.split('-')[0];
        let model = bodyModel || settings.model || 'claude-3-7-sonnet-latest';

        // --- Sécurité contre les combinaisons fournisseur/modèle impossibles ---
        if (provider === 'gemini') {
            if (!model.startsWith('gemini-')) model = 'gemini-3.1-pro-preview';
        } else if (provider === 'claude') {
            if (!model.startsWith('claude-')) model = 'claude-3-7-sonnet-latest';
        }
        // ----------------------------------------------------------------------

        setupSSE(res);

        const startTime = new Date();
        sseWrite(res, 'start', `> Starting AI assistant (${provider})...\n`);
        sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Launching for step ${stepId}...\n`);
        sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Prompt content (${promptContent.length} chars)\n`);

        console.log(`[EXECUTOR] Starting execution for step ${stepId} with ${provider}/${model}`);

        const heartbeatInterval = setInterval(() => {
            if (!res.writableEnded) {
                sseWrite(res, 'heartbeat', `Waiting for ${provider}...`);
            }
        }, 2000);

        const cleanup = () => {
            clearInterval(heartbeatInterval);
            runningProcesses.delete(stepId);
        };

        // Gemini execution
        if (provider === 'gemini') {
            sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Executing Gemini CLI (${model})\n`);

            const escapedPrompt = promptContent.replace(/"/g, '\\"').replace(/\n/g, ' ');
            const geminiProcess = spawn('cmd', ['/c', `echo "${escapedPrompt}" | gemini --model ${model} --yolo`], {
                shell: false,
                env: { ...process.env, FORCE_COLOR: '0' },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            console.log(`[EXECUTOR] Gemini process spawned (PID: ${geminiProcess.pid})`);
            runningProcesses.set(stepId, { process: geminiProcess, startTime: Date.now() });

            geminiProcess.stdout?.on('data', (data) => {
                sseWrite(res, 'stdout', data.toString());
            });

            geminiProcess.stderr?.on('data', (data) => {
                sseWrite(res, 'stderr', data.toString());
            });

            geminiProcess.on('close', (code) => {
                cleanup();
                sseWrite(res, 'end', `Gemini finished with code ${code}\n`, { code });
                res.end();
            });

            geminiProcess.on('error', (err) => {
                cleanup();
                sseWrite(res, 'error', `[Gemini Error] ${err.message}. Make sure 'gemini' is installed.\n`);
                sseWrite(res, 'end', 'Gemini failed', { code: 1 });
                res.end();
            });

            return;
        }

        // Claude execution
        sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Executing Claude (${model}) via stdin\n`);

        const claude = spawn('claude', ['--model', model, '--dangerously-skip-permissions'], {
            env: { ...process.env, FORCE_COLOR: '0' },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        console.log(`[EXECUTOR] Claude spawned (PID: ${claude.pid})`);

        if (claude.stdin) {
            claude.stdin.write(promptContent);
            claude.stdin.end();
        }

        runningProcesses.set(stepId, { process: claude, startTime: Date.now() });

        claude.stdout?.on('data', (data) => {
            const output = data.toString();
            const tokenMatch = output.match(/Token usage: (\d+)\/(\d+); (\d+) remaining/);
            if (tokenMatch) {
                sseWrite(res, 'tokens', '', {
                    tokensUsed: parseInt(tokenMatch[1], 10),
                    tokensTotal: parseInt(tokenMatch[2], 10),
                    tokensRemaining: parseInt(tokenMatch[3], 10)
                });
            }
            sseWrite(res, 'stdout', output);
        });

        claude.stderr?.on('data', (data) => {
            sseWrite(res, 'stderr', data.toString());
        });

        claude.on('close', (code, signal) => {
            cleanup();
            const exitCode = code !== null ? code : 0;
            sseWrite(res, 'end', `Process finished with code ${exitCode}\n`, { code: exitCode });
            res.end();
        });

        claude.on('error', (err) => {
            cleanup();
            sseWrite(res, 'error', `Error launching Claude: ${err.message}\nMake sure 'claude' is installed and in PATH\n`);
            res.end();
        });

        req.on('close', () => {
            console.log(`[EXECUTOR] Client disconnected for step ${stepId}`);
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

/**
 * POST /execute-file-prompt
 * Body: { fileName, promptContent, fileContent, provider?, model?, stepId? }
 * - promptContent : contenu du prompt (lu par Angular via GET /get-prompt sur server-data)
 * - fileContent   : contenu du fichier courant (lu par Angular via GET /read-file sur server-data)
 * - fileName      : nom du fichier (pour l'affichage dans les messages SSE)
 *
 * Streame le résultat via SSE. Ne lit ni n'écrit de fichiers sur le disque.
 * C'est Angular qui devra sauvegarder le résultat via POST /write-file sur server-data.
 */
app.post('/execute-file-prompt', (req, res) => {
    try {
        const { fileName, promptContent, fileContent, provider: bodyProvider, model: bodyModel, stepId } = req.body;

        if (!fileName || !promptContent) {
            return res.status(400).json({ success: false, message: 'fileName and promptContent required' });
        }

        const settings = getCurrentSettings();
        const rawProvider = bodyProvider || settings.provider || 'claude';
        const provider = rawProvider.split('-')[0];
        let model = bodyModel || settings.model || 'claude-3-7-sonnet-latest';

        // --- Sécurité contre les combinaisons fournisseur/modèle impossibles ---
        if (provider === 'gemini') {
            if (!model.startsWith('gemini-')) model = 'gemini-3.1-pro-preview';
        } else if (provider === 'claude') {
            if (!model.startsWith('claude-')) model = 'claude-3-7-sonnet-latest';
        }
        // ----------------------------------------------------------------------

        const fullPrompt = fileContent
            ? `${promptContent}\n\n---\n\n**Current file (${fileName}):**\n\`\`\`\n${fileContent}\n\`\`\`\n\n**Instructions:** Analyze this file and apply the modifications requested in the prompt above. Return ONLY the complete modified file content, without additional explanations.`
            : promptContent;

        console.log(`[EXECUTOR] Executing file prompt for ${fileName} with ${provider}/${model}`);

        setupSSE(res);
        sseWrite(res, 'start', `> Executing prompt for ${fileName}...\n`);
        sseWrite(res, 'info', `Model: ${model}\n`);

        if (provider === 'gemini') {
            sseWrite(res, 'error', 'Gemini not supported for file prompts\n');
            res.end();
            return;
        }

        const key = stepId || `file-${fileName}`;

        const claude = spawn('claude', ['--model', model, '--dangerously-skip-permissions'], {
            env: { ...process.env, FORCE_COLOR: '0' },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        if (claude.stdin) {
            claude.stdin.write(fullPrompt);
            claude.stdin.end();
        }

        runningProcesses.set(key, { process: claude, startTime: Date.now() });

        claude.stdout?.on('data', (data) => {
            sseWrite(res, 'stdout', data.toString());
        });

        claude.stderr?.on('data', (data) => {
            sseWrite(res, 'stderr', data.toString());
        });

        claude.on('close', (code) => {
            runningProcesses.delete(key);
            sseWrite(res, 'end', `\nExecution finished (code ${code})\n`, { code: code });
            res.end();
        });

        claude.on('error', (err) => {
            runningProcesses.delete(key);
            sseWrite(res, 'error', `Error: ${err.message}\n`);
            res.end();
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

/**
 * POST /execute-workflow-ai
 * Body: { content, provider?, model?, stepId? }
 * - content : le prompt de génération de workflow
 *
 * Streame le résultat via SSE. Ne sauvegarde rien.
 * C'est Angular qui devra enregistrer le résultat via server-data si nécessaire.
 */
app.post('/execute-workflow-ai', (req, res) => {
    try {
        const { content: promptContent, provider: bodyProvider, model: bodyModel, stepId } = req.body;

        if (!promptContent) {
            return res.status(400).json({ success: false, message: 'content required' });
        }

        const settings = getCurrentSettings();
        const rawProvider = bodyProvider || settings.provider || 'claude';
        const provider = rawProvider.split('-')[0];
        let model = bodyModel || settings.model || 'claude-3-7-sonnet-latest';

        // --- Sécurité contre les combinaisons fournisseur/modèle impossibles ---
        if (provider === 'gemini') {
            if (!model.startsWith('gemini-')) model = 'gemini-3.1-pro-preview';
        } else if (provider === 'claude') {
            if (!model.startsWith('claude-')) model = 'claude-3-7-sonnet-latest';
        }
        // ----------------------------------------------------------------------

        setupSSE(res);

        const startTime = new Date();
        sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Starting workflow AI (${provider}, ${model})...\n`);
        console.log(`[EXECUTOR] Workflow AI: starting with ${provider}/${model}`);

        const heartbeatInterval = setInterval(() => {
            if (!res.writableEnded) sseWrite(res, 'heartbeat', 'Waiting...');
        }, 2000);

        const key = stepId || 'workflow-ai';

        const cleanup = () => {
            clearInterval(heartbeatInterval);
            runningProcesses.delete(key);
        };

        if (provider === 'gemini') {
            const gemini = spawn('gemini', ['-m', model], {
                env: { ...process.env, FORCE_COLOR: '0' },
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true
            });

            if (gemini.stdin) {
                gemini.stdin.write(promptContent);
                gemini.stdin.end();
            }

            runningProcesses.set(key, { process: gemini, startTime: Date.now() });

            gemini.stdout?.on('data', (chunk) => sseWrite(res, 'stdout', chunk.toString()));
            gemini.stderr?.on('data', (chunk) => sseWrite(res, 'stderr', chunk.toString()));

            gemini.on('close', (code) => {
                cleanup();
                sseWrite(res, 'end', `Process finished (code ${code || 0})\n`, { code: code || 0 });
                setTimeout(() => res.end(), 200);
            });

            gemini.on('error', (err) => {
                cleanup();
                sseWrite(res, 'error', 'Gemini error: ' + err.message);
                res.end();
            });

            return;
        }

        const claude = spawn('claude', ['--model', model, '--dangerously-skip-permissions'], {
            env: { ...process.env, FORCE_COLOR: '0' },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        console.log(`[EXECUTOR] Workflow AI: Claude PID ${claude.pid}`);

        if (claude.stdin) {
            claude.stdin.write(promptContent);
            claude.stdin.end();
        }

        runningProcesses.set(key, { process: claude, startTime: Date.now() });

        claude.stdout?.on('data', (chunk) => sseWrite(res, 'stdout', chunk.toString()));
        claude.stderr?.on('data', (chunk) => sseWrite(res, 'stderr', chunk.toString()));

        claude.on('close', (code) => {
            cleanup();
            sseWrite(res, 'end', `Process finished (code ${code || 0})\n`, { code: code || 0 });
            setTimeout(() => res.end(), 200);
        });

        claude.on('error', (err) => {
            cleanup();
            sseWrite(res, 'error', `Claude error: ${err.message}\n`);
            res.end();
        });

        req.on('close', () => {
            console.log('[EXECUTOR] Workflow AI: client disconnected');
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

// POST /generate-questionnaire - Génère un questionnaire JSON via l'IA (SSE streaming)
app.post('/generate-questionnaire', (req, res) => {
    try {
        const { promptContent, provider: bodyProvider, model: bodyModel } = req.body;

        if (!promptContent) {
            return res.status(400).json({ success: false, message: 'promptContent required' });
        }

        const settings = getCurrentSettings();
        const rawProvider = bodyProvider || settings.provider || 'claude';
        const provider = rawProvider.split('-')[0];
        let model = bodyModel || settings.model || 'claude-3-7-sonnet-latest';

        // --- Sécurité contre les combinaisons fournisseur/modèle impossibles ---
        if (provider === 'gemini') {
            if (!model.startsWith('gemini-')) model = 'gemini-3.1-pro-preview';
        } else if (provider === 'claude') {
            if (!model.startsWith('claude-')) model = 'claude-3-7-sonnet-latest';
        }
        // ----------------------------------------------------------------------

        const questionnairePrompt = `A partir du prompt suivant, crée un questionnaire qui permettrait de comprendre le mieux possible le projet à mettre en place.

Retourne UNIQUEMENT un JSON valide, sans markdown, sans balise \`\`\`json, juste le JSON brut avec cette structure exacte :
{
  "questions": [
    {
      "id": "q1",
      "categorie": "Nom de la catégorie",
      "question": "La question posée",
      "type": "textarea",
      "options": null
    },
    {
      "id": "q2",
      "categorie": "Nom de la catégorie",
      "question": "La question posée",
      "type": "radio",
      "options": ["Option A", "Option B", "Option C"]
    }
  ]
}

Types disponibles : textarea, radio, select, text, checkbox
"options" est obligatoire (tableau) pour radio, select et checkbox. null pour textarea et text.
Génère entre 8 et 20 questions pertinentes, regroupées par catégories logiques.

Prompt du projet :
${promptContent}`;

        setupSSE(res);

        const startTime = new Date();
        sseWrite(res, 'start', `> Génération du questionnaire (${provider}/${model})...\n`);
        sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Analyse du prompt et création des questions...\n`);

        console.log(`[EXECUTOR] generate-questionnaire with ${provider}/${model}`);

        const heartbeatInterval = setInterval(() => {
            if (!res.writableEnded) sseWrite(res, 'heartbeat', `Waiting for ${provider}...`);
        }, 2000);

        let fullOutput = '';

        const finish = (code) => {
            clearInterval(heartbeatInterval);

            // Try to parse JSON from accumulated output
            let questionnaire = null;
            try {
                const jsonStart = fullOutput.indexOf('{');
                const jsonEnd = fullOutput.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    questionnaire = JSON.parse(fullOutput.substring(jsonStart, jsonEnd + 1));
                    if (!Array.isArray(questionnaire.questions)) questionnaire = null;
                }
            } catch (e) {
                console.error('[EXECUTOR] questionnaire JSON parse error:', e.message);
            }

            if (questionnaire) {
                sseWrite(res, 'end', `\n\n✓ Questionnaire généré : ${questionnaire.questions.length} questions`, { code, questionnaire });
            } else {
                sseWrite(res, 'end', `\n\n✗ Impossible de parser le JSON du questionnaire`, { code, questionnaire: null });
            }
            res.end();
        };

        if (provider === 'gemini') {
            sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Executing Gemini CLI (${model})\n`);
            const escapedPrompt = questionnairePrompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
            const geminiProcess = spawn('cmd', ['/c', `echo "${escapedPrompt}" | gemini --model ${model} --yolo`], {
                shell: false,
                env: { ...process.env, FORCE_COLOR: '0' },
                stdio: ['ignore', 'pipe', 'pipe']
            });
            geminiProcess.stdout?.on('data', (data) => {
                const text = data.toString();
                fullOutput += text;
                sseWrite(res, 'stdout', text);
            });
            geminiProcess.stderr?.on('data', (data) => sseWrite(res, 'stderr', data.toString()));
            geminiProcess.on('close', (code) => finish(code));
            geminiProcess.on('error', (err) => {
                clearInterval(heartbeatInterval);
                sseWrite(res, 'error', `[Gemini Error] ${err.message}\n`);
                sseWrite(res, 'end', 'Gemini failed', { code: 1, questionnaire: null });
                res.end();
            });
            return;
        }

        // Claude
        sseWrite(res, 'info', `[${startTime.toLocaleTimeString('fr-FR', { hour12: false })}] Executing Claude (${model}) via stdin\n`);
        const claude = spawn('claude', ['--model', model, '--dangerously-skip-permissions'], {
            env: { ...process.env, FORCE_COLOR: '0' },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });
        if (claude.stdin) {
            claude.stdin.write(questionnairePrompt);
            claude.stdin.end();
        }
        claude.stdout?.on('data', (data) => {
            const text = data.toString();
            fullOutput += text;
            sseWrite(res, 'stdout', text);
        });
        claude.stderr?.on('data', (data) => sseWrite(res, 'stderr', data.toString()));
        claude.on('close', (code) => finish(code));
        claude.on('error', (err) => {
            clearInterval(heartbeatInterval);
            sseWrite(res, 'error', `[Claude Error] ${err.message}\n`);
            sseWrite(res, 'end', 'Claude failed', { code: 1, questionnaire: null });
            res.end();
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Error: ' + e.message });
    }
});

// POST /execute-chat-turn
// Body: { stepId, conversationHistory: [{role:'ai'|'user', content:string}], provider?, model?, projectId? }
// Reconstruit un prompt unique avec l'historique et stream la réponse IA
app.post('/execute-chat-turn', (req, res) => {
    try {
        const { stepId, conversationHistory, provider: bodyProvider, model: bodyModel, projectId } = req.body;

        if (!stepId || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
            return res.status(400).json({ success: false, message: 'stepId and conversationHistory required' });
        }

        const settings = getCurrentSettings();
        const rawProvider = bodyProvider || settings.provider || 'claude';
        const provider = rawProvider.split('-')[0];
        let model = bodyModel || settings.model || 'claude-3-7-sonnet-latest';

        // --- Sécurité contre les combinaisons fournisseur/modèle impossibles ---
        if (provider === 'gemini') {
            if (!model.startsWith('gemini-')) model = 'gemini-3.1-pro-preview';
        } else if (provider === 'claude') {
            if (!model.startsWith('claude-')) model = 'claude-3-7-sonnet-latest';
        }
        // ----------------------------------------------------------------------

        // --- Répertoire de travail restreint au projet (sécurité OS) -----------
        const PROJECTS_BASE = path.join(__dirname, '../../data/projets');
        let spawnCwd = PROJECTS_BASE; // fallback : racine des projets si aucun projet sélectionné
        if (projectId && /^[a-zA-Z0-9_-]+$/.test(projectId)) {
            const candidatePath = path.join(PROJECTS_BASE, projectId);
            if (fs.existsSync(candidatePath)) {
                spawnCwd = candidatePath;
            } else {
                console.warn(`[EXECUTOR] projectId "${projectId}" not found, using PROJECTS_BASE`);
            }
        }
        console.log(`[EXECUTOR] Chat cwd restricted to: ${spawnCwd}`);
        // ----------------------------------------------------------------------

        setupSSE(res);

        // Build the combined prompt from conversation history
        const systemTurn = conversationHistory.find(m => m.role === 'system');
        const dialogueTurns = conversationHistory.filter(m => m.role !== 'system');

        // First turn: only system instructions + first user message
        // Subsequent turns: system + full dialogue history
        let combinedPrompt = '';

        if (systemTurn) {
            combinedPrompt += systemTurn.content + '\n\n';
        }

        if (dialogueTurns.length === 1 && dialogueTurns[0].role === 'user') {
            // First turn — just the user content, no conversation wrapper needed
            combinedPrompt += dialogueTurns[0].content;
        } else {
            // Multi-turn — include conversation history clearly
            combinedPrompt += '---\n\nHistorique de la conversation:\n\n';
            for (const turn of dialogueTurns) {
                if (turn.role === 'user') {
                    combinedPrompt += `[UTILISATEUR]: ${turn.content}\n\n`;
                } else if (turn.role === 'ai') {
                    combinedPrompt += `[IA]: ${turn.content}\n\n`;
                }
            }
            combinedPrompt += '---\n\nContinue la conversation en répondant au dernier message de l\'utilisateur.';
        }

        const startTime = new Date();
        sseWrite(res, 'start', `> Chat turn starting (${provider})...\n`);

        const heartbeatInterval = setInterval(() => {
            if (!res.writableEnded) {
                sseWrite(res, 'heartbeat', `Waiting for ${provider}...`);
            }
        }, 2000);

        const chatStepId = `chat-${stepId}`;

        const cleanup = () => {
            clearInterval(heartbeatInterval);
            runningProcesses.delete(chatStepId);
        };

        // Gemini execution
        if (provider === 'gemini') {
            const escapedPrompt = combinedPrompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
            const geminiProcess = spawn('cmd', ['/c', `echo "${escapedPrompt}" | gemini --model ${model} --yolo`], {
                shell: false,
                cwd: spawnCwd,
                env: { ...process.env, FORCE_COLOR: '0' },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            runningProcesses.set(chatStepId, { process: geminiProcess, startTime: Date.now() });

            geminiProcess.stdout?.on('data', (data) => {
                sseWrite(res, 'stdout', data.toString());
            });
            geminiProcess.stderr?.on('data', (data) => {
                sseWrite(res, 'stderr', data.toString());
            });
            geminiProcess.on('close', (code) => {
                cleanup();
                sseWrite(res, 'end', `Gemini finished with code ${code}\n`, { code });
                res.end();
            });
            geminiProcess.on('error', (err) => {
                cleanup();
                sseWrite(res, 'error', `[Gemini Error] ${err.message}\n`);
                sseWrite(res, 'end', 'Gemini failed', { code: 1 });
                res.end();
            });
            return;
        }

        // Claude execution
        const claude = spawn('claude', ['--model', model, '--dangerously-skip-permissions'], {
            cwd: spawnCwd,
            env: { ...process.env, FORCE_COLOR: '0' },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        if (claude.stdin) {
            claude.stdin.write(combinedPrompt);
            claude.stdin.end();
        }

        runningProcesses.set(chatStepId, { process: claude, startTime: Date.now() });

        claude.stdout?.on('data', (data) => {
            const output = data.toString();
            const tokenMatch = output.match(/Token usage: (\d+)\/(\d+); (\d+) remaining/);
            if (tokenMatch) {
                sseWrite(res, 'tokens', '', {
                    tokensUsed: parseInt(tokenMatch[1], 10),
                    tokensTotal: parseInt(tokenMatch[2], 10),
                    tokensRemaining: parseInt(tokenMatch[3], 10)
                });
            }
            sseWrite(res, 'stdout', output);
        });

        claude.stderr?.on('data', (data) => {
            sseWrite(res, 'stderr', data.toString());
        });

        claude.on('close', (code) => {
            cleanup();
            const exitCode = code !== null ? code : 0;
            sseWrite(res, 'end', `Process finished with code ${exitCode}\n`, { code: exitCode });
            res.end();
        });

        claude.on('error', (err) => {
            cleanup();
            sseWrite(res, 'error', `Error launching Claude: ${err.message}\n`);
            res.end();
        });

        req.on('close', () => {
            console.log(`[EXECUTOR] Chat client disconnected for step ${stepId}`);
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

// POST /stop-execution - Tue le process CLI en cours
app.post('/stop-execution', (req, res) => {
    try {
        const { stepId } = req.body;

        if (!stepId) {
            return res.status(400).json({ success: false, message: 'stepId required' });
        }

        const processInfo = runningProcesses.get(stepId);
        if (!processInfo) {
            return res.status(404).json({ success: false, message: 'No execution running for this step' });
        }

        try {
            processInfo.process.kill('SIGTERM');
            runningProcesses.delete(stepId);
            res.json({ success: true, message: 'Execution stopped' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error stopping process' });
        }
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

// ============================================================
// Error Handling
// ============================================================

app.use((err, req, res, next) => {
    console.error('[EXECUTOR ERROR]', err.stack);
    res.status(500).json({ error: 'Server error', message: err.message });
});

// ============================================================
// Server Startup
// ============================================================

app.listen(PORT, () => {
    // Initial CLI status check
    refreshCliStatusCache();

    const currentSettings = getCurrentSettings();

    console.log(`
+==========================================+
|   Worganic - EXECUTOR Server (Local)     |
+==========================================+

  Port:       http://localhost:${PORT}
  Rôle:       Exécution IA locale (Claude/Gemini CLI)

  Modèle actif : ${currentSettings.provider.toUpperCase()} / ${currentSettings.model}
  Settings     : ${SETTINGS_LOCAL_FILE}

  Routes IA:
  - POST /execute-prompt       (SSE)
  - POST /execute-file-prompt  (SSE)
  - POST /execute-workflow-ai  (SSE)
  - POST /stop-execution
  - GET  /api/cli-status
  - GET  /api/cli-check-only
  - GET  /sync-model
  - POST /change-model
  - GET  /get-model

  Press CTRL+C to stop
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[EXECUTOR] Shutting down...');
    for (const [stepId, processInfo] of runningProcesses) {
        try {
            processInfo.process.kill('SIGTERM');
            console.log(`[EXECUTOR] Killed process for step ${stepId}`);
        } catch (e) { /* ignore */ }
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[EXECUTOR] Shutting down...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[EXECUTOR] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[EXECUTOR] Unhandled rejection:', reason);
});
