/**
 * Frankenstein Platform - Data Server (Cloud)
 * =========================================
 * Responsable : gestion des données, fichiers, projets, config.
 * Ce serveur tourne sur le cloud (ou en local pour le dev).
 *
 * Port: 3001
 * BASE_DIR: ../data (relative à ce fichier)
 *
 * NE contient PAS les routes d'exécution IA.
 * NE lance PAS de process CLI.
 * Les routes IA (/execute-prompt, /cli-status, etc.) sont dans electron/executor/server-executor.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./db');

// ============================================================
// Configuration
// ============================================================

const app = express();
const PORT = process.env.PORT || 3001;

const BASE_DIR = path.join(__dirname, '..', 'data');
const PROJECT_ROOT = path.dirname(BASE_DIR);
const CONFIG_DIR = path.join(BASE_DIR, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'conf.json');
const AI_MODELS_FILE = path.join(CONFIG_DIR, 'ai-models.json');

const DEFAULT_MODELS = {
    gemini: [
        { value: 'gemini-3.1-pro-preview',  label: 'Gemini 3.1 Pro (Preview)', costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-3-flash',          label: 'Gemini 3 Flash',           costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-3-flash-preview',  label: 'Gemini 3 Flash (Preview)', costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-2.5-pro-preview',  label: 'Gemini 2.5 Pro (Preview)', costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-2.0-pro-preview',  label: 'Gemini 2.0 Pro (Preview)', costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash',         costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro',           costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash',         costInput: 0.075, costOutput: 0.30 }
    ],
    claude: [
        { value: 'claude-3-7-sonnet-latest',     label: 'Claude 3.7 Sonnet (Latest)', costInput: 3.00, costOutput: 15.00 },
        { value: 'claude-3-5-sonnet-latest',     label: 'Claude 3.5 Sonnet',          costInput: 3.00, costOutput: 15.00 },
        { value: 'claude-3-5-haiku-latest',      label: 'Claude 3.5 Haiku',           costInput: 0.80, costOutput: 4.00 },
        { value: 'claude-3-opus-latest',         label: 'Claude 3 Opus',              costInput: 15.00, costOutput: 75.00 },
        { value: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6',          costInput: 3.00, costOutput: 15.00 },
        { value: 'claude-opus-4-6',              label: 'Claude Opus 4.6',            costInput: 15.00, costOutput: 75.00 },
        { value: 'claude-haiku-4-5',             label: 'Claude Haiku 4.5',           costInput: 0.80, costOutput: 4.00 }
    ]
};

function loadAiModels() {
    try {
        if (fs.existsSync(AI_MODELS_FILE)) {
            return JSON.parse(fs.readFileSync(AI_MODELS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading AI models:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_MODELS));
}

function saveAiModels(models) {
    try {
        fs.mkdirSync(path.dirname(AI_MODELS_FILE), { recursive: true });
        fs.writeFileSync(AI_MODELS_FILE, JSON.stringify(models, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error saving AI models:', e);
        return false;
    }
}

// ============================================================
// Middleware
// ============================================================

app.use(cors({
    origin: [
        'http://localhost:4200',  // Angular (projet principal)
        'http://localhost:4201',  // Frankenstein (second projet Angular)
        'http://localhost:4202',  // Port de secours
        'http://localhost:3001',
        'http://127.0.0.1:4200',
        'http://127.0.0.1:4201',
        // Ajouter l'URL de prod ici quand disponible :
        // 'https://app.worganic.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ============================================================
// Helper Functions
// ============================================================

function isPathSafe(resolvedPath, baseDir) {
    const normalizedBase = path.resolve(baseDir);
    const normalizedTarget = path.resolve(resolvedPath);
    return normalizedTarget.startsWith(normalizedBase);
}

function getPromptFileName(fileName) {
    if (fileName.endsWith('-promptIA.md')) {
        return fileName;
    }
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return fileName + '-promptIA.md';
    }
    const nameWithoutExt = fileName.substring(0, lastDotIndex);
    return nameWithoutExt + '-promptIA.md';
}

function hasAssociatedPrompt(fileName, baseDir) {
    const promptFileName = getPromptFileName(fileName);
    const promptFilePath = path.join(baseDir || BASE_DIR, promptFileName);
    return fs.existsSync(promptFilePath);
}

function generateStepFilename(order, stepName, filePattern, documentsAttendus) {
    const orderPrefix = order.toString().padStart(2, '0');

    // filePattern seul (pas de documentsAttendus) → génère le fichier prompt
    // Format: {order}-PROMPT-{filePattern}.md  (ex: 01-PROMPT-INITIALTEST.md)
    const hasNoRealDocs = !documentsAttendus || documentsAttendus.length === 0
        || (documentsAttendus.length === 1 && !documentsAttendus[0]);
    if (filePattern && hasNoRealDocs) {
        const safePattern = filePattern
            .replace(/\.md$/i, '')
            .toUpperCase()
            .replace(/[\s-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        return [`${orderPrefix}-PROMPT-${safePattern}.md`];
    }

    if (!documentsAttendus || documentsAttendus.length === 0) {
        return [];
    }

    const safeStepName = stepName.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase();

    function sanitizeModel(name) {
        const ext = path.extname(name);
        const base = ext ? name.slice(0, -ext.length) : name;
        const safeBase = base.replace(/[\s-]/g, '_');
        return safeBase + ext;
    }

    return documentsAttendus.map(docName => {
        const safeName = sanitizeModel(docName);
        return `${orderPrefix}-${safeStepName}-${safeName}`;
    });
}

function detectUnexpectedGeneratedFiles(stepId, expectedFiles, projectDir) {
    if (stepId === 'A') return [];

    const unexpectedFiles = [];
    const scanDir = projectDir || BASE_DIR;

    try {
        const allFiles = fs.readdirSync(scanDir);
        const pattern = new RegExp(`^${stepId}g(\\d+)-(.+)$`);

        allFiles.forEach(fileName => {
            const match = fileName.match(pattern);
            if (match) {
                if (fileName.endsWith('-prompt.md')) return;

                const isExpected = expectedFiles.some(expected => {
                    const expectedName = expected.startsWith('../') ? expected.substring(3) : expected;
                    return expectedName === fileName;
                });

                if (!isExpected) {
                    const filePath = path.join(scanDir, fileName);
                    unexpectedFiles.push({
                        name: fileName,
                        exists: fs.existsSync(filePath),
                        hasPrompt: hasAssociatedPrompt(fileName, scanDir)
                    });
                }
            }
        });
    } catch (err) {
        console.error(`[SERVER] Error detecting unexpected files for step ${stepId}:`, err);
    }

    unexpectedFiles.sort((a, b) => a.name.localeCompare(b.name));
    return unexpectedFiles;
}

function updatePipelineStatuses(jsonData, projectDir) {
    if (!jsonData.pipeline || !jsonData.pipeline.steps) return jsonData;

    const steps = jsonData.pipeline.steps;
    let foundFirstPending = false;
    const baseDir = projectDir || BASE_DIR;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const files = Array.isArray(step.file) ? step.file : [step.file];

        step.filesStatus = files.map(file => {
            if (!file) return { name: file, exists: false, hasPrompt: false };

            let filePath;
            if (file.startsWith('../')) {
                filePath = path.join(PROJECT_ROOT, file.substring(3));
            } else {
                filePath = path.join(baseDir, file);
            }

            let exists = false;
            try {
                exists = fs.existsSync(filePath);
            } catch (err) {
                exists = false;
            }

            const fileName = file.startsWith('../') ? file.substring(3) : file;
            return {
                name: file,
                exists: exists,
                hasPrompt: hasAssociatedPrompt(fileName, baseDir)
            };
        });

        if (step.id !== 'A') {
            step.unexpectedFiles = detectUnexpectedGeneratedFiles(step.id, files, baseDir);
        } else {
            step.unexpectedFiles = [];
        }

        const allFilesExist = step.filesStatus.every(f => f.exists);
        const isValidated = step.validation && step.validation.status === 'validated';

        if (allFilesExist) {
            if (isValidated) {
                step.status = 'completed';
            } else {
                step.status = 'waiting_validation';
                if (!foundFirstPending) {
                    foundFirstPending = true;
                }
            }
        } else {
            if (!foundFirstPending) {
                step.status = 'in-progress';
                foundFirstPending = true;
            } else {
                step.status = 'pending';
            }
        }
    }

    return jsonData;
}

function markPagesExistence(pages) {
    return pages.map(page => {
        const filePath = path.join(BASE_DIR, page.file);
        try {
            page.exists = fs.existsSync(filePath);
        } catch (err) {
            page.exists = false;
        }
        return page;
    });
}

function updateDynamicData(jsonData, projectDir) {
    jsonData = updatePipelineStatuses(jsonData, projectDir);
    if (jsonData.pagesProjet) {
        jsonData.pagesProjet = markPagesExistence(jsonData.pagesProjet);
    }
    if (jsonData.pagesExemples) {
        jsonData.pagesExemples = markPagesExistence(jsonData.pagesExemples);
    }
    return jsonData;
}

// ============================================================
// Settings helper (conf.json seulement — pas de settings Claude locaux)
// ============================================================

function readConfSettings() {
    try {
        const content = fs.readFileSync(CONFIG_FILE, 'utf8');
        const conf = JSON.parse(content);
        return {
            model: conf.model || 'claude-sonnet-4-5',
            provider: conf.provider || 'claude'
        };
    } catch (err) {
        return { model: 'claude-sonnet-4-5', provider: 'claude' };
    }
}

function writeConfSettings(settings, source = 'web') {
    try {
        let conf = {};
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                const content = fs.readFileSync(CONFIG_FILE, 'utf8');
                conf = JSON.parse(content);
            } catch (parseErr) {
                console.error('Error parsing conf.json:', parseErr);
            }
        } else {
            fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
        }

        if (settings.model) conf.model = settings.model;
        if (settings.provider) conf.provider = settings.provider;
        conf.lastUpdated = new Date().toISOString();
        conf.source = source;

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(conf, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Error writing conf.json:', err);
        return false;
    }
}

// ============================================================
// Role Category Page Generator
// ============================================================

const colorMap = {
    'blue':   '#3b82f6',
    'green':  '#10b981',
    'purple': '#8b5cf6',
    'red':    '#ef4444',
    'orange': '#f59e0b',
    'pink':   '#ec4899',
    'yellow': '#eab308',
    'teal':   '#14b8a6',
    'gray':   '#6b7280'
};

function generateRoleCategoryPage(category, roles) {
    const templatePath = path.join(__dirname, '..', 'public', 'categories', 'template.html');
    if (!fs.existsSync(templatePath)) {
        console.error('[GENERATE] Template not found:', templatePath);
        return;
    }

    let html = fs.readFileSync(templatePath, 'utf8');
    const primaryColor = colorMap[category.color] || colorMap['blue'];
    const categoryRoles = roles.filter(r => r.categoryId === category.id);

    const getRoleIcon = (name) => {
        const n = name.toLowerCase();
        if (n.includes('design') || n.includes('ui') || n.includes('ux')) return 'palette';
        if (n.includes('dev') || n.includes('code') || n.includes('architect')) return 'terminal';
        if (n.includes('manager') || n.includes('po') || n.includes('lead')) return 'shield_person';
        if (n.includes('test') || n.includes('qa')) return 'fact_check';
        return 'person';
    };

    const roleCardsHtml = categoryRoles.map(role => `
                <div class="glass p-10 rounded-[2.5rem] role-card border border-white/5 flex flex-col h-full">
                    <div class="flex justify-between items-start mb-8">
                        <div class="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <span class="material-symbols-outlined text-primary text-3xl">${getRoleIcon(role.name)}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] font-bold text-primary uppercase tracking-widest block mb-1">Expertise</span>
                            <span class="px-3 py-1 rounded-full bg-white/5 text-white/40 text-[9px] font-bold uppercase border border-white/10">${role.name.split(' ')[0]}</span>
                        </div>
                    </div>
                    <h3 class="text-3xl font-bold mb-4 tracking-tight">${role.name}</h3>
                    <div class="space-y-4 mb-8 flex-grow">
                        <div class="bg-white/5 p-4 rounded-xl border-l-2 border-primary/30">
                            <span class="text-[10px] font-bold text-white/30 uppercase block mb-2">Sa Mission (Qui ?)</span>
                            <p class="text-sm text-white/70 leading-relaxed">${role.description || 'Expert dédié à l\'optimisation des processus métier.'}</p>
                        </div>
                        <div class="p-4">
                            <span class="text-[10px] font-bold text-white/30 uppercase block mb-2">Son Utilité (À quoi ça sert ?)</span>
                            <p class="text-xs text-white/50 leading-relaxed">Assure que les livrables de la phase "${category.name}" respectent les standards de qualité.</p>
                        </div>
                    </div>
                    <div class="pt-6 border-t border-white/5">
                        <span class="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] block mb-3">Compétences clés</span>
                        <div class="flex flex-wrap gap-2">
                            ${(role.skills && role.skills.length > 0 ? role.skills : ['Analyse', 'Exécution', 'Vision']).map(skill => `
                                <span class="text-[9px] px-2 py-1 rounded bg-primary/5 text-primary/70 border border-primary/10">${skill}</span>
                            `).join('')}
                        </div>
                    </div>
                </div>
    `).join('');

    html = html
        .replace(/\{\{category_name\}\}/g, category.name)
        .replace(/\{\{category_description\}\}/g, category.description || `Dossier complet sur les rôles de la catégorie ${category.name}.`)
        .replace(/\{\{primary_color_hex\}\}/g, primaryColor)
        .replace(/\{\{role_count\}\}/g, categoryRoles.length)
        .replace(/\{\{role_cards\}\}/g, roleCardsHtml);

    const outputPath = path.join(__dirname, '..', 'public', 'categories', `${category.id}.html`);
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log('[GENERATE] Category page generated:', outputPath);
}

// ============================================================
// Mapping between step letters and etape IDs
// ============================================================

const etapeToStepMap = {
    'etape-1770394156001': 'A',
    'etape-1770394156002': 'B',
    'etape-1770394156003': 'C',
    'etape-1770394156004': 'D',
    'etape-1770394156005': 'E',
    'etape-1770394156006': 'H',
    'etape-1770394156007': 'F',
    'etape-1770394156008': 'G',
    'etape-1770394156009': 'I',
    'etape-1770394156010': 'J'
};

const stepToEtapeMap = {};
for (const [etapeId, letterId] of Object.entries(etapeToStepMap)) {
    stepToEtapeMap[letterId] = etapeId;
}

// ============================================================
// Multi-Workflow Utilities
// ============================================================

/**
 * Calcule les fichiers de sortie d'une étape en reproduisant exactement la logique de l'admin.
 * Cas 1 : promptAsQuestionnaire + questionnaireResponseOnly → seul {N°}-reponses.md
 * Cas 2 : promptAsQuestionnaire → prompt + questionnaire + réponses
 * Cas 3 : standard → prompt + documentsAttendus + outputAttendusDetails
 */
function computeOutputFilesForEtape(order, etape) {
    const orderPrefix = order.toString().padStart(2, '0');
    const promptFile = etape.filePattern && etape.filePattern.trim()
        ? `${orderPrefix}-PROMPT-${etape.filePattern.trim()
            .replace(/\.md$/i, '')
            .toUpperCase()
            .replace(/[\s-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/, '')
          }.md`
        : null;

    const outputs = [];
    const seen = new Set();

    // Cas 1 : questionnaire + réponse uniquement → seul {N°}-reponses.md
    if (etape.promptAsQuestionnaire && etape.questionnaireResponseOnly) {
        outputs.push(`${orderPrefix}-reponses.md`);
        return outputs;
    }

    // Cas 2 : questionnaire coché → prompt + questionnaire + réponses
    if (etape.promptAsQuestionnaire) {
        if (promptFile) { outputs.push(promptFile); seen.add(promptFile); }
        outputs.push(`${orderPrefix}-questionnaire.json`);
        outputs.push(`${orderPrefix}-reponses.md`);
        return outputs;
    }

    // Cas 3 : standard → prompt + documentsAttendus + outputAttendusDetails
    if (promptFile) { outputs.push(promptFile); seen.add(promptFile); }
    for (const f of (etape.documentsAttendus || [])) {
        if (f && !seen.has(f)) { outputs.push(f); seen.add(f); }
    }
    for (const d of (etape.documentsAttendusDetails || [])) {
        if (d && d.file && !seen.has(d.file)) { outputs.push(d.file); seen.add(d.file); }
    }
    for (const d of (etape.outputAttendusDetails || [])) {
        if (d && d.file && !seen.has(d.file)) { outputs.push(d.file); seen.add(d.file); }
    }
    return outputs;
}

/**
 * Resynchronise le champ `file` de chaque step dans tous les workflows d'un projet
 * en se basant sur la configuration actuelle des étapes dans globalConfig.
 * Permet de répercuter les modifications faites dans l'admin sur les projets existants.
 */
function resyncWorkflowStepFiles(projectData, globalConfig) {
    const workflows = projectData.workflows || [];
    for (const wf of workflows) {
        const steps = wf.pipeline && wf.pipeline.steps ? wf.pipeline.steps : [];
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const order = step.order || (i + 1);
            // Trouver l'étape admin correspondante
            let etape = null;
            const etapeId = step.originalId || (step.id && step.id.startsWith('etape-') ? step.id : null)
                || (step.id && stepToEtapeMap[step.id] ? stepToEtapeMap[step.id] : null);
            if (etapeId && globalConfig.etapes) {
                etape = globalConfig.etapes.find(e => e.id === etapeId);
            }
            if (etape) {
                step.file = computeOutputFilesForEtape(order, etape);
                // Synchroniser aussi les métadonnées utiles
                step.promptDocumentId = etape.promptDocumentId || step.promptDocumentId || null;
                if (etape.type !== undefined) step.type = etape.type;
            }
        }
    }
    return projectData;
}

function buildPipelineSteps(projectType, globalConfig) {
    let steps = projectType.steps || [];
    // Normaliser : accepter à la fois les strings et les objets {id, prevOutputDocs}
    steps = steps.map(s => (typeof s === 'object' && s !== null ? s.id : s)).filter(Boolean);
    if (steps.length > 0 && steps[0] && steps[0].startsWith('etape-')) {
        steps = steps.map(etapeId => etapeToStepMap[etapeId] || etapeId).filter(Boolean);
    }

    return steps.map((stepId, index) => {
        const order = index + 1;
        let stepDef = globalConfig.pipelineTemplate.steps.find(s => s.id === stepId);

        if (!stepDef && globalConfig.etapes) {
            const customStep = globalConfig.etapes.find(e => e.id === stepId);
            if (customStep) {
                stepDef = {
                    id: customStep.id, name: customStep.name, type: customStep.type,
                    shortName: customStep.name.substring(0, 10), summary: customStep.summary || '',
                    prompt: customStep.prompt || '',
                    file: computeOutputFilesForEtape(order, customStep),
                    order: order,
                    originalId: customStep.id, promptDocumentId: customStep.promptDocumentId || null
                };
            }
        } else if (stepDef) {
            if (stepDef.type === undefined) {
                stepDef.type = (stepDef.id === 'A' || stepDef.id === 'J') ? 0 : 1;
            }
            let adminEtape = null;
            if (globalConfig.etapes) {
                const originalEtapeId = stepToEtapeMap[stepDef.id];
                if (originalEtapeId) adminEtape = globalConfig.etapes.find(e => e.id === originalEtapeId);
            }
            const finalFileArray = adminEtape
                ? computeOutputFilesForEtape(order, adminEtape)
                : (Array.isArray(stepDef.file) ? stepDef.file : (stepDef.file ? [stepDef.file] : []));
            stepDef = { ...stepDef, order: order, file: finalFileArray, promptDocumentId: adminEtape?.promptDocumentId || null };
        }

        if (stepDef) return { ...stepDef, status: 'pending' };
        return null;
    }).filter(Boolean);
}

function migrateProjectToMultiWorkflow(projectData) {
    if (projectData.workflows) return projectData;

    const wfId = 'wf-' + projectData.id + '-' + Date.parse(projectData.createdAt || new Date().toISOString());
    projectData.workflows = [{
        id: wfId,
        workflowTypeId: projectData.type || '',
        workflowTypeName: projectData.type || '',
        addedAt: projectData.createdAt || new Date().toISOString(),
        pipeline: projectData.pipeline || { steps: [] },
        progress: projectData.progress || { totalSteps: 0, completedSteps: 0, currentStep: null }
    }];

    return projectData;
}

function computeAggregatedProgress(workflows) {
    let totalSteps = 0;
    let completedSteps = 0;
    let currentStep = null;

    for (const wf of workflows) {
        const steps = wf.pipeline?.steps || [];
        totalSteps += steps.length;
        completedSteps += steps.filter(s => s.status === 'completed').length;
        if (!currentStep) {
            const pending = steps.find(s => s.status !== 'completed');
            if (pending) currentStep = pending.id;
        }
    }

    return { totalSteps, completedSteps, currentStep };
}

// ============================================================
// ROUTES: Config & Settings
// ============================================================

// GET /api/config - Lit et retourne index.json (config globale)
app.get('/api/config', (req, res) => {
    try {
        const configPath = path.join(BASE_DIR, 'index.json');

        if (!fs.existsSync(configPath)) {
            return res.json({ workflows: [], etapes: [], projectTypes: [], projects: [] });
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        res.json(config);
    } catch (error) {
        console.error('[ERROR] Error reading config:', error);
        res.status(500).json({ error: 'Error reading configuration' });
    }
});

// ============================================================
// ROUTES: Config API Keys
// ============================================================

// GET /api/config/keys — Retourne config IA propre à l'utilisateur + settings globaux
app.get('/api/config/keys', (req, res) => {
    try {
        // Settings globaux (conf.json)
        let globalConf = {};
        if (fs.existsSync(CONFIG_FILE)) {
            try { globalConf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
        }

        // Config IA de l'utilisateur connecté
        const user = getSessionUser(req);
        const _rawCfg = (user && user.config) ? user.config : {};
        const userConfig = typeof _rawCfg === 'string' ? (() => { try { return JSON.parse(_rawCfg); } catch { return {}; } })() : _rawCfg;
        const apiKeys = userConfig.apiKeys || {};
        const cliConfig = userConfig.cliConfig || {};

        let activeProviders = cliConfig.activeProviders;
        if (!activeProviders && cliConfig.activeProvider) activeProviders = [cliConfig.activeProvider];
        if (!activeProviders) activeProviders = [];

        // Outils externes activés par l'utilisateur (stockés dans son config en DB)
        const userEnabledTools = userConfig.enabledTools || {};

        res.json({
            gemini: { key: apiKeys.gemini?.key || '', active: apiKeys.gemini?.active || false },
            claude: { key: apiKeys.claude?.key || '', active: apiKeys.claude?.active || false },
            cliConfig: {
                activeProviders,
                enabledModels: {
                    claude: cliConfig.enabledModels?.claude || [],
                    gemini: cliConfig.enabledModels?.gemini || []
                },
                headerSelection: {
                    provider: cliConfig.headerSelection?.provider || '',
                    model: cliConfig.headerSelection?.model || ''
                }
            },
            appVersion: globalConf.appVersion || '',
            headerIaVisible: globalConf.headerIaVisible !== undefined ? globalConf.headerIaVisible : false,
            // Préférences outils par utilisateur — stockées en DB (priorité sur flags globaux conf.json)
            enabledTools: {
                tickets: userEnabledTools.tickets !== undefined ? userEnabledTools.tickets : (globalConf.ticketsEnabled || false),
                recette: userEnabledTools.recette !== undefined ? userEnabledTools.recette : (globalConf.recetteWidgetEnabled || false),
                tchat:   userEnabledTools.tchat   !== undefined ? userEnabledTools.tchat   : false,
                actions: userEnabledTools.actions !== undefined ? userEnabledTools.actions : false
            },
            // Onglets volet outils — settings globaux (conf.json)
            enabledTabs: globalConf.enabledTabs || {},
            // Navigation principale — settings globaux (conf.json)
            navItems: globalConf.navItems || {},
            // Rétro-compatibilité config page
            ticketsEnabled: userEnabledTools.tickets !== undefined ? userEnabledTools.tickets : (globalConf.ticketsEnabled || false),
            recetteWidgetEnabled: userEnabledTools.recette !== undefined ? userEnabledTools.recette : (globalConf.recetteWidgetEnabled || false)
        });
    } catch (err) {
        console.error('[ERROR] Error reading API keys:', err);
        res.status(500).json({ error: 'Error reading API keys' });
    }
});

// POST /api/config/keys — Sauvegarde config IA par utilisateur + settings globaux (admin)
app.post('/api/config/keys', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { gemini, claude, cliConfig, appVersion, ticketsEnabled, recetteWidgetEnabled, enabledTools, headerIaVisible, enabledTabs, navItems } = req.body;

        // ── Config IA propre à l'utilisateur ────────────────────────────────
        const rawCfg = user.config || {};
        const userConfig = { ...(typeof rawCfg === 'string' ? (() => { try { return JSON.parse(rawCfg); } catch { return {}; } })() : rawCfg) };
        if (!userConfig.apiKeys) userConfig.apiKeys = {};

        if (gemini !== undefined) {
            userConfig.apiKeys.gemini = {
                key: gemini.key !== undefined ? gemini.key : (userConfig.apiKeys.gemini?.key || ''),
                active: gemini.active !== undefined ? gemini.active : (userConfig.apiKeys.gemini?.active || false)
            };
        }
        if (claude !== undefined) {
            userConfig.apiKeys.claude = {
                key: claude.key !== undefined ? claude.key : (userConfig.apiKeys.claude?.key || ''),
                active: claude.active !== undefined ? claude.active : (userConfig.apiKeys.claude?.active || false)
            };
        }
        if (cliConfig !== undefined) {
            userConfig.cliConfig = {
                activeProviders: Array.isArray(cliConfig.activeProviders) ? cliConfig.activeProviders : [],
                enabledModels: {
                    claude: Array.isArray(cliConfig.enabledModels?.claude) ? cliConfig.enabledModels.claude : [],
                    gemini: Array.isArray(cliConfig.enabledModels?.gemini) ? cliConfig.enabledModels.gemini : []
                },
                headerSelection: (cliConfig.headerSelection && typeof cliConfig.headerSelection === 'object')
                    ? { provider: cliConfig.headerSelection.provider || '', model: cliConfig.headerSelection.model || '' }
                    : (userConfig.cliConfig?.headerSelection || {})
            };
        }

        // ── Outils externes par utilisateur (DB) ────────────────────────────
        if (enabledTools !== undefined && typeof enabledTools === 'object') {
            const current = userConfig.enabledTools || {};
            userConfig.enabledTools = {
                tickets: enabledTools.tickets !== undefined ? Boolean(enabledTools.tickets) : (current.tickets || false),
                recette: enabledTools.recette !== undefined ? Boolean(enabledTools.recette) : (current.recette || false),
                tchat:   enabledTools.tchat   !== undefined ? Boolean(enabledTools.tchat)   : (current.tchat   || false),
                actions: enabledTools.actions !== undefined ? Boolean(enabledTools.actions) : (current.actions || false)
            };
        }

        await pool.query('UPDATE users SET config = ? WHERE id = ?', [JSON.stringify(userConfig), user.id]);
        // Mise à jour du cache
        if (_usersCache) {
            const idx = _usersCache.findIndex(u => u.id === user.id);
            if (idx !== -1) _usersCache[idx].config = userConfig;
        }

        // ── Settings globaux (conf.json) — tous les champs peuvent être mis à jour ──
        if (appVersion !== undefined || ticketsEnabled !== undefined || recetteWidgetEnabled !== undefined ||
            headerIaVisible !== undefined || enabledTabs !== undefined || navItems !== undefined) {
            let globalConf = {};
            if (fs.existsSync(CONFIG_FILE)) {
                try { globalConf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
            } else {
                fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
            }
            if (appVersion !== undefined) globalConf.appVersion = appVersion;
            if (ticketsEnabled !== undefined) globalConf.ticketsEnabled = ticketsEnabled;
            if (recetteWidgetEnabled !== undefined) globalConf.recetteWidgetEnabled = recetteWidgetEnabled;
            if (headerIaVisible !== undefined) globalConf.headerIaVisible = Boolean(headerIaVisible);
            if (enabledTabs !== undefined) globalConf.enabledTabs = enabledTabs;
            if (navItems !== undefined) globalConf.navItems = { ...(globalConf.navItems || {}), ...navItems };
            globalConf.lastUpdated = new Date().toISOString();
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(globalConf, null, 2), 'utf8');
        }

        res.json({ success: true, message: 'Configuration sauvegardée' });
    } catch (err) {
        console.error('[ERROR] Error saving config:', err);
        res.status(500).json({ error: 'Error saving configuration' });
    }
});

// POST /api/admin/update-models-costs - Met à jour les prix des modèles
app.post('/api/admin/update-models-costs', (req, res) => {
    try {
        const { provider } = req.body;

        const currentData = loadAiModels();
        let updatedCount = 0;

        if (!provider || provider === 'gemini') {
            currentData.gemini = JSON.parse(JSON.stringify(DEFAULT_MODELS.gemini));
            updatedCount += currentData.gemini.length;
        }
        if (!provider || provider === 'claude') {
            currentData.claude = JSON.parse(JSON.stringify(DEFAULT_MODELS.claude));
            updatedCount += currentData.claude.length;
        }

        currentData.lastUpdated = new Date().toISOString();
        saveAiModels(currentData);

        res.json({
            success: true,
            message: `Coûts mis à jour pour ${provider || 'tous les modèles'}`,
            count: updatedCount,
            lastUpdated: currentData.lastUpdated
        });
    } catch (error) {
        console.error('[ERROR] Updating model costs:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour des coûts' });
    }
});

// ============================================================
// ROUTES: Projects CRUD
// ============================================================

app.get('/api/projects', (req, res) => {
    try {
        const projetsDir = path.join(BASE_DIR, 'projets');
        const sessionUser = getSessionUser(req);

        if (!fs.existsSync(projetsDir)) {
            return res.json([]);
        }

        const dirs = fs.readdirSync(projetsDir).filter(d =>
            fs.statSync(path.join(projetsDir, d)).isDirectory()
        );

        const allUsers = loadUsers();
        const projects = [];
        for (const dir of dirs) {
            const pjPath = path.join(projetsDir, dir, 'project.json');
            if (fs.existsSync(pjPath)) {
                try {
                    let pj = JSON.parse(fs.readFileSync(pjPath, 'utf-8'));
                    // Always attach owner username
                    const ownerUser = allUsers.find(u => u.id === pj.userId);
                    pj._ownerUsername = ownerUser ? ownerUser.username : null;
                    // Filter by userId: admin sees all, users see own + shared
                    if (sessionUser && sessionUser.role !== 'admin') {
                        const isOwner = !pj.userId || pj.userId === sessionUser.id;
                        if (!isOwner) {
                            const share = (pj.sharedWith || []).find(s => s.userId === sessionUser.id);
                            if (!share) continue;
                            pj._sharedInfo = { ownerUsername: pj._ownerUsername, roles: share.roles || [], hasEditAccess: (share.roles || []).length > 0 };
                        } else {
                            pj._sharedInfo = null;
                        }
                    }
                    pj._availableRoles = getProjectAvailableRoles(pj);
                    pj._shareList = enrichShareList(pj.sharedWith, allUsers);
                    pj = migrateProjectToMultiWorkflow(pj);
                    if (pj.pipeline && Array.isArray(pj.pipeline.steps)) {
                        pj.pipeline.steps = pj.pipeline.steps.map(step => {
                            const filesCreated = (step.filesStatus || []).filter(f => f.exists).map(f => f.name);
                            return { ...step, filesCreated };
                        });
                    }
                    if (pj.workflows) {
                        for (const wf of pj.workflows) {
                            if (wf.pipeline && Array.isArray(wf.pipeline.steps)) {
                                wf.pipeline.steps = wf.pipeline.steps.map(step => {
                                    const filesCreated = (step.filesStatus || []).filter(f => f.exists).map(f => f.name);
                                    return { ...step, filesCreated };
                                });
                            }
                        }
                    }
                    projects.push(pj);
                } catch (e) { /* skip corrupted */ }
            }
        }

        projects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        res.json(projects);
    } catch (error) {
        console.error('[ERROR] Error listing projects:', error);
        res.status(500).json({ error: 'Error listing projects' });
    }
});

app.get('/api/projects/:id', (req, res) => {
    try {
        const projectPath = path.join(BASE_DIR, 'projets', req.params.id, 'project.json');

        if (!fs.existsSync(projectPath)) {
            return res.status(404).json({ error: 'Project not found' });
        }

        let project = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
        project = migrateProjectToMultiWorkflow(project);
        // Resynchroniser les fichiers de sortie de chaque step depuis la config admin
        try {
            const globalConfig = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'index.json'), 'utf-8'));
            project = resyncWorkflowStepFiles(project, globalConfig);
        } catch (e) { /* continue sans resync si index.json inaccessible */ }
        const allUsers = loadUsers();
        const ownerUser = allUsers.find(u => u.id === project.userId);
        project._ownerUsername = ownerUser ? ownerUser.username : null;
        project._availableRoles = getProjectAvailableRoles(project);
        project._shareList = enrichShareList(project.sharedWith, allUsers);
        // Attach sharedInfo for the requesting user
        const sessionUser = getSessionUser(req);
        if (sessionUser && project.userId !== sessionUser.id) {
            const share = (project.sharedWith || []).find(s => s.userId === sessionUser.id);
            if (share) {
                project._sharedInfo = { ownerUsername: project._ownerUsername, roles: share.roles || [], hasEditAccess: (share.roles || []).length > 0 };
            }
        }
        res.json(project);
    } catch (error) {
        console.error('[ERROR] Error reading project:', error);
        res.status(500).json({ error: 'Error reading project' });
    }
});

app.post('/api/projects', (req, res) => {
    try {
        const { name, type, description } = req.body;
        const sessionUser = getSessionUser(req);

        if (!name) {
            return res.status(400).json({ error: 'Name required' });
        }

        const timestamp = Date.now();
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const id = `projet-${timestamp}-${slug}`;
        const projectFolder = path.join(BASE_DIR, 'projets', id);

        fs.mkdirSync(projectFolder, { recursive: true });

        const globalConfigPath = path.join(BASE_DIR, 'index.json');
        const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));

        let pipelineSteps = [];
        let workflows = [];
        let progress = { totalSteps: 0, completedSteps: 0, currentStep: null };

        if (type) {
            const projectType = (globalConfig.workflows && globalConfig.workflows.find(t => t.id === type)) ||
                (globalConfig.projectTypes && globalConfig.projectTypes.find(t => t.id === type));

            if (projectType) {
                pipelineSteps = buildPipelineSteps(projectType, globalConfig);

                const wfId = 'wf-' + id + '-' + timestamp;
                const initialWorkflow = {
                    id: wfId,
                    workflowTypeId: type,
                    workflowTypeName: projectType.name,
                    addedAt: new Date().toISOString(),
                    pipeline: { steps: pipelineSteps },
                    progress: {
                        totalSteps: pipelineSteps.length,
                        completedSteps: 0,
                        currentStep: pipelineSteps[0] ? pipelineSteps[0].id : null
                    }
                };
                workflows = [initialWorkflow];
                progress = initialWorkflow.progress;
            }
        }

        const newProject = {
            id,
            userId: sessionUser ? sessionUser.id : null,
            name,
            type: type || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'new',
            description: description || '',
            metadata: {
                aiConfig: {
                    provider: 'claude',
                    model: 'claude-sonnet-4-5',
                    lastUpdated: new Date().toISOString()
                },
                design: 'Lavande Dreams',
                selectedProjectType: type || ''
            },
            pipeline: { steps: pipelineSteps },
            workflows: workflows,
            pagesProjet: [],
            progress: progress
        };

        fs.writeFileSync(
            path.join(projectFolder, 'project.json'),
            JSON.stringify(newProject, null, 2)
        );

        if (!globalConfig.projects) globalConfig.projects = [];
        globalConfig.projects.push({
            id,
            userId: newProject.userId,
            name,
            type: newProject.type,
            createdAt: newProject.createdAt,
            updatedAt: newProject.updatedAt,
            status: 'new',
            description: description || '',
            aiConfig: newProject.metadata.aiConfig,
            design: newProject.metadata.design,
            folder: `projets/${id}`,
            progress: newProject.progress,
            workflowCount: workflows.length
        });
        globalConfig.currentProjectId = id;

        fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));

        console.log(`[SUCCESS] Project created: ${id} (${workflows.length} workflows)`);
        res.status(201).json(newProject);
    } catch (error) {
        console.error('[ERROR] Error creating project:', error);
        res.status(500).json({ error: 'Error creating project' });
    }
});

app.put('/api/projects/:id', (req, res) => {
    try {
        const projectId = req.params.id;
        const updates = req.body;
        const projectPath = path.join(BASE_DIR, 'projets', projectId, 'project.json');

        if (!fs.existsSync(projectPath)) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
        Object.assign(project, updates);
        project.updatedAt = new Date().toISOString();

        fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));

        const globalConfigPath = path.join(BASE_DIR, 'index.json');
        if (fs.existsSync(globalConfigPath)) {
            const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
            const projectIndex = (globalConfig.projects || []).findIndex(p => p.id === projectId);

            if (projectIndex !== -1) {
                globalConfig.projects[projectIndex] = {
                    ...globalConfig.projects[projectIndex],
                    ...updates,
                    updatedAt: project.updatedAt
                };
                fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
            }
        }

        console.log(`[SUCCESS] Project updated: ${projectId}`);
        res.json(project);
    } catch (error) {
        console.error('[ERROR] Error updating project:', error);
        res.status(500).json({ error: 'Error updating project' });
    }
});

app.delete('/api/projects/:id', (req, res) => {
    try {
        const projectId = req.params.id;
        const projectFolder = path.join(BASE_DIR, 'projets', projectId);

        if (!fs.existsSync(projectFolder)) {
            return res.status(404).json({ error: 'Project not found' });
        }

        fs.rmSync(projectFolder, { recursive: true, force: true });

        const globalConfigPath = path.join(BASE_DIR, 'index.json');
        if (fs.existsSync(globalConfigPath)) {
            const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
            globalConfig.projects = (globalConfig.projects || []).filter(p => p.id !== projectId);

            if (globalConfig.currentProjectId === projectId) {
                globalConfig.currentProjectId = globalConfig.projects[0]?.id || null;
            }

            fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
        }

        console.log(`[SUCCESS] Project deleted: ${projectId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[ERROR] Error deleting project:', error);
        res.status(500).json({ error: 'Error deleting project' });
    }
});

// ============================================================
// ROUTES: Multi-Workflow
// ============================================================

app.post('/api/projects/:id/add-workflow', (req, res) => {
    try {
        const projectId = req.params.id;
        const { workflowTypeId } = req.body;

        if (!workflowTypeId) {
            return res.status(400).json({ success: false, message: 'workflowTypeId required' });
        }

        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const projectJsonPath = path.join(projectFolder, 'project.json');

        if (!fs.existsSync(projectJsonPath)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        let projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        const globalConfigPath = path.join(BASE_DIR, 'index.json');
        const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));

        const projectType = (globalConfig.workflows && globalConfig.workflows.find(t => t.id === workflowTypeId)) ||
            (globalConfig.projectTypes && globalConfig.projectTypes.find(t => t.id === workflowTypeId));

        if (!projectType) {
            return res.status(404).json({ success: false, message: `Workflow type not found: ${workflowTypeId}` });
        }

        projectData = migrateProjectToMultiWorkflow(projectData);
        const pipelineSteps = buildPipelineSteps(projectType, globalConfig);

        const newWorkflow = {
            id: 'wf-' + projectId + '-' + Date.now(),
            workflowTypeId: workflowTypeId,
            workflowTypeName: projectType.name,
            addedAt: new Date().toISOString(),
            pipeline: { steps: pipelineSteps },
            progress: {
                totalSteps: pipelineSteps.length,
                completedSteps: 0,
                currentStep: pipelineSteps[0] ? pipelineSteps[0].id : null
            }
        };

        projectData.workflows.push(newWorkflow);

        const aggProgress = computeAggregatedProgress(projectData.workflows);
        projectData.progress = aggProgress;
        projectData.updatedAt = new Date().toISOString();

        fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));

        const indexJsonPath = path.join(BASE_DIR, 'index.json');
        if (fs.existsSync(indexJsonPath)) {
            const indexJson = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
            const project = (indexJson.projects || []).find(p => p.id === projectId);
            if (project) {
                project.progress = aggProgress;
                project.updatedAt = projectData.updatedAt;
                project.workflowCount = projectData.workflows.length;
                fs.writeFileSync(indexJsonPath, JSON.stringify(indexJson, null, 2));
            }
        }

        console.log(`[ADD-WORKFLOW] Added workflow ${newWorkflow.id} to project ${projectId}`);
        res.json({ success: true, workflow: newWorkflow });
    } catch (error) {
        console.error('[ERROR] Error adding workflow:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

app.delete('/api/projects/:id/workflows/:workflowId', (req, res) => {
    try {
        const { id: projectId, workflowId } = req.params;
        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const projectJsonPath = path.join(projectFolder, 'project.json');

        if (!fs.existsSync(projectJsonPath)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        let projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

        if (!projectData.workflows || projectData.workflows.length <= 1) {
            return res.status(400).json({ success: false, message: 'Cannot delete the only workflow of a project' });
        }

        const initialWfCount = projectData.workflows.length;
        projectData.workflows = projectData.workflows.filter(w => w.id !== workflowId);

        if (projectData.workflows.length === initialWfCount) {
            return res.status(404).json({ success: false, message: 'Workflow not found' });
        }

        const aggProgress = computeAggregatedProgress(projectData.workflows);
        projectData.progress = aggProgress;

        if (projectData.workflows.length > 0) {
            projectData.pipeline = projectData.workflows[0].pipeline;
        }

        projectData.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));

        const indexJsonPath = path.join(BASE_DIR, 'index.json');
        if (fs.existsSync(indexJsonPath)) {
            const indexJson = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
            const project = (indexJson.projects || []).find(p => p.id === projectId);
            if (project) {
                project.progress = aggProgress;
                project.updatedAt = projectData.updatedAt;
                project.workflowCount = projectData.workflows.length;
                fs.writeFileSync(indexJsonPath, JSON.stringify(indexJson, null, 2));
            }
        }

        console.log(`[DELETE-WORKFLOW] Removed workflow ${workflowId} from project ${projectId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[ERROR] Error deleting workflow:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ============================================================
// ROUTES: Project Sharing
// ============================================================

// Helper: extract all roles used in project workflows
function getProjectAvailableRoles(project) {
    try {
        const configPath = path.join(BASE_DIR, 'index.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const etapes = config.etapes || [];
        const roles = new Set();
        const workflows = project.workflows || [];
        for (const wf of workflows) {
            const steps = wf.pipeline?.steps || [];
            for (const step of steps) {
                const etape = etapes.find(e => e.id === step.id || e.id === step.originalId || e.name === step.name);
                if (etape?.roles) roles.add(etape.roles);
            }
        }
        // Also check root pipeline
        for (const step of (project.pipeline?.steps || [])) {
            const etape = etapes.find(e => e.id === step.id || e.id === step.originalId || e.name === step.name);
            if (etape?.roles) roles.add(etape.roles);
        }
        return [...roles];
    } catch { return []; }
}

// Helper: enrich sharedWith entries with user info for response
function enrichShareList(sharedWith, allUsers) {
    return (sharedWith || []).map(s => {
        const u = allUsers.find(u => u.id === s.userId);
        return { userId: s.userId, roles: s.roles || [], username: u?.username || '', email: u?.email || '' };
    });
}

// POST /api/projects/:id/share — add/update by email
app.post('/api/projects/:id/share', (req, res) => {
    try {
        const projectId = req.params.id;
        const { email, roles } = req.body;
        if (!email) return res.status(400).json({ error: 'email requis' });

        const allUsers = loadUsers();
        const targetUser = allUsers.find(u => u.email === email);
        if (!targetUser) return res.status(404).json({ error: 'Utilisateur introuvable avec cet email' });

        const projectPath = path.join(BASE_DIR, 'projets', projectId, 'project.json');
        if (!fs.existsSync(projectPath)) return res.status(404).json({ error: 'Project not found' });
        const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));

        // Prevent sharing with the owner
        if (project.userId === targetUser.id) {
            return res.status(400).json({ error: 'Impossible de partager avec le propriétaire du projet' });
        }

        if (!project.sharedWith) project.sharedWith = [];
        const idx = project.sharedWith.findIndex(s => s.userId === targetUser.id);
        if (idx !== -1) {
            project.sharedWith[idx].roles = roles || project.sharedWith[idx].roles || [];
        } else {
            project.sharedWith.push({ userId: targetUser.id, roles: roles || [] });
        }
        project.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
        res.json({ success: true, user: { userId: targetUser.id, username: targetUser.username, email: targetUser.email, roles: roles || [] }, sharedWith: enrichShareList(project.sharedWith, allUsers) });
    } catch (error) {
        console.error('[ERROR] Share project:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/projects/:id/share/:targetUserId — update roles
app.put('/api/projects/:id/share/:targetUserId', (req, res) => {
    try {
        const { id: projectId, targetUserId } = req.params;
        const { roles } = req.body;
        const projectPath = path.join(BASE_DIR, 'projets', projectId, 'project.json');
        if (!fs.existsSync(projectPath)) return res.status(404).json({ error: 'Project not found' });
        const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
        const idx = (project.sharedWith || []).findIndex(s => s.userId === targetUserId);
        if (idx === -1) return res.status(404).json({ error: 'Partage introuvable' });
        project.sharedWith[idx].roles = roles || [];
        project.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
        res.json({ success: true, sharedWith: enrichShareList(project.sharedWith, loadUsers()) });
    } catch (error) {
        console.error('[ERROR] Update share roles:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/projects/:id/share/:targetUserId
app.delete('/api/projects/:id/share/:targetUserId', (req, res) => {
    try {
        const { id: projectId, targetUserId } = req.params;
        const projectPath = path.join(BASE_DIR, 'projets', projectId, 'project.json');
        if (!fs.existsSync(projectPath)) return res.status(404).json({ error: 'Project not found' });
        const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
        project.sharedWith = (project.sharedWith || []).filter(s => s.userId !== targetUserId);
        project.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
        res.json({ success: true, sharedWith: enrichShareList(project.sharedWith, loadUsers()) });
    } catch (error) {
        console.error('[ERROR] Remove share:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================
// ROUTES: Project Operations
// ============================================================

app.get('/api/projects/:id/file-exists', (req, res) => {
    const projectId = req.params.id;
    const fileName = req.query.file;

    if (!fileName) {
        return res.status(400).json({ exists: false, message: 'Parameter file missing' });
    }

    try {
        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const filePath = path.join(projectFolder, fileName);

        if (!isPathSafe(filePath, projectFolder)) {
            return res.status(403).json({ exists: false, message: 'Access denied' });
        }

        const exists = fs.existsSync(filePath);
        res.json({ exists: exists, filePath: filePath });
    } catch (error) {
        console.error('[ERROR] Error checking file:', error);
        res.status(500).json({ exists: false, message: 'Server error' });
    }
});

// Copy an input file from origine/ into the project folder (to allow project-specific edits)
app.post('/api/projects/:id/copy-input-file', (req, res) => {
    try {
        const projectId = req.params.id;
        const { fileName } = req.body;
        if (!fileName) return res.status(400).json({ success: false, message: 'fileName required' });

        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const origineFile = path.join(BASE_DIR, 'origine', fileName);
        const destFile = path.join(projectFolder, fileName);

        if (!isPathSafe(destFile, projectFolder)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (!fs.existsSync(origineFile)) {
            return res.status(404).json({ success: false, message: 'Source file not found in origine/' });
        }
        if (!fs.existsSync(projectFolder)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        fs.copyFileSync(origineFile, destFile);
        res.json({ success: true, message: `Copied to project folder` });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Delete the project copy of an input file (reset to original)
app.post('/api/projects/:id/reset-input-file', (req, res) => {
    try {
        const projectId = req.params.id;
        const { fileName } = req.body;
        if (!fileName) return res.status(400).json({ success: false, message: 'fileName required' });

        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const destFile = path.join(projectFolder, fileName);

        if (!isPathSafe(destFile, projectFolder)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/api/projects/:id/reset-step', (req, res) => {
    try {
        const projectId = req.params.id;
        const { stepId, workflowId } = req.body;

        if (!stepId) {
            return res.status(400).json({ success: false, message: 'stepId parameter missing' });
        }

        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const projectJsonPath = path.join(projectFolder, 'project.json');

        if (!fs.existsSync(projectJsonPath)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

        let targetPipeline = projectData.pipeline;
        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) targetPipeline = wf.pipeline;
        }

        const step = targetPipeline.steps.find(s => s.id === stepId);
        if (!step) {
            return res.status(404).json({ success: false, message: `Step ${stepId} not found` });
        }

        // Collect files to delete: use step.file (actual project files) + associated promptIA files
        const stepFiles = Array.isArray(step.file) ? step.file : (step.file ? [step.file] : []);

        // Also include questionnaire files if present via etape config
        const indexJsonPath = path.join(BASE_DIR, 'index.json');
        const indexJson = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
        const etapeId = stepToEtapeMap[stepId];
        const etapeConfig = etapeId ? (indexJson.etapes || []).find(e => e.id === etapeId) : null;
        const order = String(step.order ?? 1).padStart(2, '0');
        const extraFiles = [];
        if (etapeConfig?.promptAsQuestionnaire) {
            extraFiles.push(`${order}-questionnaire.json`);
            extraFiles.push(`${order}-reponses.md`);
        }

        const allFilesToDelete = [...new Set([...stepFiles, ...extraFiles])];
        const deletedFiles = [];
        const errors = [];

        for (const fileName of allFilesToDelete) {
            // Skip files outside the project folder (../... references)
            if (fileName.startsWith('../') || path.isAbsolute(fileName)) continue;

            const filePath = path.join(projectFolder, fileName);

            if (!isPathSafe(filePath, projectFolder)) {
                errors.push(`Access denied: ${fileName}`);
                continue;
            }

            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    deletedFiles.push(fileName);
                } catch (err) {
                    errors.push(`Error deleting ${fileName}: ${err.message}`);
                }
            }

            // Also delete associated promptIA file if it exists
            const promptIaFile = getPromptFileName(fileName);
            const promptIaPath = path.join(projectFolder, promptIaFile);
            if (promptIaFile !== fileName && isPathSafe(promptIaPath, projectFolder) && fs.existsSync(promptIaPath)) {
                try {
                    fs.unlinkSync(promptIaPath);
                    deletedFiles.push(promptIaFile);
                } catch (err) { /* ignore */ }
            }
        }

        // Reset step status
        step.status = 'pending';
        delete step.validation;
        delete step.lastExecutionDate;
        delete step.startedAt;
        delete step.completedAt;
        step.outClaude = '';
        step.tokensUsed = 0;
        step.tokensBegin = 0;
        step.tokensEnd = 0;
        if (step.filesStatus) {
            step.filesStatus = step.filesStatus.map(f => ({ ...f, exists: false }));
        }

        // Clear start/end dates on subsequent steps
        const resetIdx = targetPipeline.steps.findIndex(s => s.id === stepId);
        if (resetIdx !== -1) {
            for (let i = resetIdx + 1; i < targetPipeline.steps.length; i++) {
                delete targetPipeline.steps[i].startedAt;
                delete targetPipeline.steps[i].completedAt;
            }
        }

        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) {
                const completed = wf.pipeline.steps.filter(s => s.status === 'completed').length;
                wf.progress = { totalSteps: wf.pipeline.steps.length, completedSteps: completed, currentStep: wf.pipeline.steps.find(s => s.status !== 'completed')?.id || null };
                wf.updatedAt = new Date().toISOString();
                if (projectData.workflows[0] && projectData.workflows[0].id === workflowId) {
                    projectData.pipeline = wf.pipeline;
                }
            }
            projectData.progress = computeAggregatedProgress(projectData.workflows);
        }

        projectData.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));

        const project = (indexJson.projects || []).find(p => p.id === projectId);
        if (project) {
            const completedSteps = projectData.progress ? projectData.progress.completedSteps : targetPipeline.steps.filter(s => s.status === 'completed').length;
            if (project.progress) project.progress.completedSteps = completedSteps;
            project.updatedAt = projectData.updatedAt;
            fs.writeFileSync(indexJsonPath, JSON.stringify(indexJson, null, 2));
        }

        console.log(`[RESET] Step ${stepId} reset for ${projectId}, ${deletedFiles.length} files deleted`);
        res.json({ success: true, deletedFiles, errors: errors.length > 0 ? errors : undefined });
    } catch (error) {
        console.error('[ERROR] Error resetting step:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// POST /api/projects/:id/resync-step-admin
// Resynchronise les métadonnées d'un step (name, summary, shortName, type, file)
// depuis la configuration admin (index.json), sans toucher aux données de travail
// (outClaude, status, validated, prompt, ia, filesStatus...).
app.post('/api/projects/:id/resync-step-admin', (req, res) => {
    try {
        const projectId = req.params.id;
        const { stepId, workflowId } = req.body;

        if (!stepId) return res.status(400).json({ success: false, message: 'stepId manquant' });

        const projectJsonPath = path.join(BASE_DIR, 'projets', projectId, 'project.json');
        if (!fs.existsSync(projectJsonPath)) return res.status(404).json({ success: false, message: 'Projet introuvable' });

        const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        const globalConfig = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'index.json'), 'utf8'));

        // Trouver le pipeline cible
        let targetPipeline = projectData.pipeline;
        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf && wf.pipeline) targetPipeline = wf.pipeline;
        }

        if (!targetPipeline || !targetPipeline.steps) return res.status(404).json({ success: false, message: 'Pipeline introuvable' });

        const step = targetPipeline.steps.find(s => s.id === stepId);
        if (!step) return res.status(404).json({ success: false, message: `Step ${stepId} introuvable` });

        // Trouver l'étape admin correspondante
        const etapeId = step.originalId || (step.id && step.id.startsWith('etape-') ? step.id : null)
            || (step.id && stepToEtapeMap[step.id] ? stepToEtapeMap[step.id] : null);
        const etape = etapeId ? (globalConfig.etapes || []).find(e => e.id === etapeId) : null;
        if (!etape) return res.status(404).json({ success: false, message: 'Étape admin introuvable' });

        // Resynchroniser uniquement les métadonnées de config (pas les données de travail)
        step.name      = etape.name      || step.name;
        step.summary   = etape.summary   || '';
        step.shortName = etape.shortName || etape.name || step.shortName;
        if (etape.type !== undefined && etape.type !== null) step.type = etape.type;
        step.file      = computeOutputFilesForEtape(step.order || 1, etape);

        fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2), 'utf8');
        res.json({ success: true, step });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur : ' + error.message });
    }
});

app.post('/api/projects/:id/admin-reset-step', (req, res) => {
    try {
        const projectId = req.params.id;
        const { stepId } = req.body;

        if (!stepId) {
            return res.status(400).json({ success: false, message: 'stepId parameter missing' });
        }

        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const projectJsonPath = path.join(projectFolder, 'project.json');

        if (!fs.existsSync(projectJsonPath)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        const { workflowId } = req.body;

        let targetPipeline = projectData.pipeline;
        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) targetPipeline = wf.pipeline;
        }

        const steps = targetPipeline.steps;
        const resetIdx = steps.findIndex(s => s.id === stepId);

        if (resetIdx === -1) {
            return res.status(404).json({ success: false, message: 'Step not found' });
        }

        const deletedFiles = [];

        for (let i = resetIdx; i < steps.length; i++) {
            const step = steps[i];
            const files = Array.isArray(step.file) ? step.file : (step.file ? [step.file] : []);

            for (const fileName of files) {
                const filePath = path.join(projectFolder, fileName);
                if (isPathSafe(filePath, projectFolder) && fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                        deletedFiles.push(fileName);
                    } catch (e) { /* ignore */ }
                }
            }

            step.status = 'pending';
            delete step.validation;
            delete step.lastExecutionDate;
            delete step.startedAt;
            delete step.completedAt;
            step.outClaude = '';
            step.tokensUsed = 0;
            step.tokensBegin = 0;
            step.tokensEnd = 0;
            if (step.filesStatus) {
                step.filesStatus = step.filesStatus.map(f => ({ ...f, exists: false }));
            }
        }

        let completedSteps;
        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) {
                completedSteps = wf.pipeline.steps.filter(s => s.status === 'completed').length;
                wf.progress = { totalSteps: wf.pipeline.steps.length, completedSteps, currentStep: wf.pipeline.steps.find(s => s.status !== 'completed')?.id || null };
                wf.updatedAt = new Date().toISOString();
                if (projectData.workflows[0] && projectData.workflows[0].id === workflowId) {
                    projectData.pipeline = wf.pipeline;
                }
            }
            projectData.progress = computeAggregatedProgress(projectData.workflows);
        } else {
            completedSteps = steps.filter(s => s.status === 'completed').length;
            projectData.progress = projectData.progress || {};
            projectData.progress.completedSteps = completedSteps;
        }
        projectData.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));

        const indexJsonPath = path.join(BASE_DIR, 'index.json');
        if (fs.existsSync(indexJsonPath)) {
            const indexJson = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
            const project = (indexJson.projects || []).find(p => p.id === projectId);
            if (project) {
                project.updatedAt = projectData.updatedAt;
                if (project.progress) project.progress.completedSteps = completedSteps;
                fs.writeFileSync(indexJsonPath, JSON.stringify(indexJson, null, 2));
            }
        }

        console.log(`[ADMIN-RESET] Step ${stepId}+ reset for ${projectId}, ${deletedFiles.length} files deleted`);
        res.json({ success: true, deletedFiles });
    } catch (error) {
        console.error('[ERROR] Error admin-reset-step:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/projects/:id/update', (req, res) => {
    try {
        const projectId = req.params.id;
        const { pipeline, progress, workflowId } = req.body;

        if (!pipeline) {
            return res.status(400).json({ success: false, message: 'Missing data' });
        }

        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const projectJsonPath = path.join(projectFolder, 'project.json');

        if (!fs.existsSync(projectJsonPath)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) {
                wf.pipeline = pipeline;
                if (progress) wf.progress = progress;
                wf.updatedAt = new Date().toISOString();
                if (projectData.workflows[0] && projectData.workflows[0].id === workflowId) {
                    projectData.pipeline = pipeline;
                }
                const aggProgress = computeAggregatedProgress(projectData.workflows);
                projectData.progress = aggProgress;
            }
        } else {
            projectData.pipeline = pipeline;
            if (progress) {
                projectData.progress = progress;
            }
            if (projectData.workflows && projectData.workflows[0]) {
                projectData.workflows[0].pipeline = pipeline;
                if (progress) projectData.workflows[0].progress = progress;
                projectData.workflows[0].updatedAt = new Date().toISOString();
            }
        }

        projectData.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));

        const indexJsonPath = path.join(BASE_DIR, 'index.json');
        if (fs.existsSync(indexJsonPath)) {
            const indexJson = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
            const project = (indexJson.projects || []).find(p => p.id === projectId);
            if (project) {
                project.updatedAt = projectData.updatedAt;
                project.progress = projectData.progress;
                fs.writeFileSync(indexJsonPath, JSON.stringify(indexJson, null, 2));
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[ERROR] Error updating project:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Add a file to a step's expected file list (if not already present)
app.post('/api/projects/:id/ensure-step-file', (req, res) => {
    try {
        const projectId = req.params.id;
        const { stepId, fileName, workflowId } = req.body;

        if (!stepId || !fileName) {
            return res.status(400).json({ success: false, message: 'stepId and fileName required' });
        }

        const projectJsonPath = path.join(BASE_DIR, 'projets', projectId, 'project.json');
        if (!fs.existsSync(projectJsonPath)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

        let targetPipeline = projectData.pipeline;
        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) targetPipeline = wf.pipeline;
        }

        const step = (targetPipeline?.steps || []).find(s => s.id === stepId);
        if (!step) {
            return res.status(404).json({ success: false, message: 'Step not found' });
        }

        const files = Array.isArray(step.file) ? step.file : (step.file ? [step.file] : []);
        if (!files.includes(fileName)) {
            files.push(fileName);
            step.file = files;
            if (!step.filesStatus) step.filesStatus = [];
            if (!step.filesStatus.find(f => f.name === fileName)) {
                step.filesStatus.push({ name: fileName, exists: true, hasPrompt: false });
            }
            projectData.updatedAt = new Date().toISOString();
            fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/api/projects/:id/validate-step', (req, res) => {
    try {
        const projectId = req.params.id;
        const { stepId, status, workflowId } = req.body;

        if (!stepId || !status) {
            return res.status(400).json({ success: false, message: 'stepId and status required' });
        }

        const projectFolder = path.join(BASE_DIR, 'projets', projectId);
        const projectJsonPath = path.join(projectFolder, 'project.json');

        if (!fs.existsSync(projectJsonPath)) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

        let targetPipeline = projectData.pipeline;
        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) targetPipeline = wf.pipeline;
        }

        const step = targetPipeline.steps.find(s => s.id === stepId);

        if (!step) {
            return res.status(404).json({ success: false, message: 'Step not found' });
        }

        if (status === 'validated') {
            step.validation = { status: 'validated', timestamp: new Date().toISOString() };
            step.completedAt = new Date().toISOString();

            const currentStepIndex = targetPipeline.steps.findIndex(s => s.id === stepId);
            if (currentStepIndex !== -1 && currentStepIndex < targetPipeline.steps.length - 1) {
                const nextStep = targetPipeline.steps[currentStepIndex + 1];
                if (nextStep.status === 'pending') {
                    nextStep.status = 'in-progress';
                }
            }
        } else if (status === 'reset') {
            delete step.validation;
            delete step.completedAt;
            step.status = 'in-progress';

            const currentStepIndex = targetPipeline.steps.findIndex(s => s.id === stepId);
            if (currentStepIndex !== -1) {
                for (let i = currentStepIndex + 1; i < targetPipeline.steps.length; i++) {
                    const nextStep = targetPipeline.steps[i];
                    nextStep.status = 'pending';
                    delete nextStep.validation;
                    delete nextStep.startedAt;
                    delete nextStep.completedAt;
                }
            }
        }

        if (workflowId && projectData.workflows) {
            const wf = projectData.workflows.find(w => w.id === workflowId);
            if (wf) {
                const completed = wf.pipeline.steps.filter(s => s.status === 'completed').length;
                wf.progress = { totalSteps: wf.pipeline.steps.length, completedSteps: completed, currentStep: wf.pipeline.steps.find(s => s.status !== 'completed')?.id || null };
                wf.updatedAt = new Date().toISOString();
                if (projectData.workflows[0] && projectData.workflows[0].id === workflowId) {
                    projectData.pipeline = wf.pipeline;
                }
            }
            projectData.progress = computeAggregatedProgress(projectData.workflows);
        }

        projectData.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));

        const indexJsonPath = path.join(BASE_DIR, 'index.json');
        if (fs.existsSync(indexJsonPath)) {
            const indexJson = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
            const project = (indexJson.projects || []).find(p => p.id === projectId);
            if (project) {
                project.updatedAt = projectData.updatedAt;
                fs.writeFileSync(indexJsonPath, JSON.stringify(indexJson, null, 2));
            }
        }

        res.json({ success: true, message: status === 'validated' ? 'Step validated' : 'Validation reset' });
    } catch (error) {
        console.error('[ERROR] Error validating step:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ============================================================
// ROUTES: Admin Data Management
// ============================================================

app.post('/save-documents', (req, res) => {
    try {
        const { documents } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.documents = documents;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Documents saved' });
    } catch (error) {
        console.error('[ERROR] Error saving documents:', error);
        res.status(500).json({ success: false, message: 'Error saving documents' });
    }
});

app.post('/save-actions', (req, res) => {
    try {
        const { actions } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.actions = actions;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Actions saved' });
    } catch (error) {
        console.error('[ERROR] Error saving actions:', error);
        res.status(500).json({ success: false, message: 'Error saving actions' });
    }
});

app.post('/save-etapes', (req, res) => {
    try {
        const { etapes } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.etapes = etapes;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Etapes saved' });
    } catch (error) {
        console.error('[ERROR] Error saving etapes:', error);
        res.status(500).json({ success: false, message: 'Error saving etapes' });
    }
});

app.post('/save-workflows', (req, res) => {
    try {
        const { workflows } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.workflows = workflows;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Workflows saved' });
    } catch (error) {
        console.error('[ERROR] Error saving workflows:', error);
        res.status(500).json({ success: false, message: 'Error saving workflows' });
    }
});

app.post('/save-workflow-categories', (req, res) => {
    try {
        const { workflowCategories } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.workflowCategories = workflowCategories;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Categories saved' });
    } catch (error) {
        console.error('[ERROR] Error saving workflow categories:', error);
        res.status(500).json({ success: false, message: 'Error saving workflow categories' });
    }
});

app.post('/save-document-categories', (req, res) => {
    try {
        const { documentCategories } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.documentCategories = documentCategories;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Document categories saved' });
    } catch (error) {
        console.error('[ERROR] Error saving document categories:', error);
        res.status(500).json({ success: false, message: 'Error saving document categories' });
    }
});

app.post('/save-roles', (req, res) => {
    try {
        const { roles } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.roles = roles;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Roles saved' });
    } catch (error) {
        console.error('[ERROR] Error saving roles:', error);
        res.status(500).json({ success: false, message: 'Error saving roles' });
    }
});

app.post('/save-role-categories', (req, res) => {
    try {
        const { roleCategories } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.roleCategories = roleCategories;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');

        const roles = jsonData.roles || [];
        const categoriesDir = path.join(__dirname, '..', 'public', 'categories');
        if (!fs.existsSync(categoriesDir)) {
            fs.mkdirSync(categoriesDir, { recursive: true });
        }
        roleCategories.forEach(cat => {
            try { generateRoleCategoryPage(cat, roles); } catch (e) { /* ignore */ }
        });

        res.json({ success: true, message: 'Role categories saved and pages generated' });
    } catch (error) {
        console.error('[ERROR] Error saving role categories:', error);
        res.status(500).json({ success: false, message: 'Error saving role categories' });
    }
});

app.post('/save-users', (req, res) => {
    try {
        const { users } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
        jsonData.users = users;
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
        res.json({ success: true, message: 'Users saved' });
    } catch (error) {
        console.error('[ERROR] Error saving users:', error);
        res.status(500).json({ success: false, message: 'Error saving users' });
    }
});

// ============================================================
// ROUTES: File Operations
// ============================================================

app.get('/read-file', (req, res) => {
    const fileName = req.query.file;

    if (!fileName) {
        return res.status(400).json({ success: false, message: 'Parameter file missing' });
    }

    let targetPath;
    if (fileName.startsWith('../')) {
        targetPath = path.join(PROJECT_ROOT, fileName.substring(3));
    } else {
        targetPath = path.join(BASE_DIR, fileName);
    }

    const relative = path.relative(PROJECT_ROOT, targetPath);
    if (relative && relative.startsWith('..') && !path.isAbsolute(relative)) {
        return res.status(403).json({ success: false, message: 'Access denied: outside project' });
    }

    fs.readFile(targetPath, 'utf8', (err, content) => {
        if (err) {
            return res.json({ success: false, message: 'File not found', content: '' });
        }
        res.json({ success: true, content: content });
    });
});

app.post('/delete-file', (req, res) => {
    try {
        const { file: fileName } = req.body;
        if (!fileName) return res.status(400).json({ success: false, message: 'file required' });
        const filePath = path.join(BASE_DIR, fileName);
        if (!isPathSafe(filePath, BASE_DIR)) return res.status(403).json({ success: false, message: 'Access denied' });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/write-file', (req, res) => {
    try {
        const { file: fileName, content } = req.body;

        if (!fileName || content === undefined) {
            return res.status(400).json({ success: false, message: 'file and content required' });
        }

        const filePath = path.join(BASE_DIR, fileName);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFile(filePath, content, 'utf8', (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error writing file: ' + err.message });
            }
            res.json({ success: true, message: 'File written successfully', path: filePath });
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format: ' + e.message });
    }
});

app.post('/rename-file', (req, res) => {
    try {
        const { oldPath: oldRelPath, newPath: newRelPath } = req.body;
        const oldPath = path.join(BASE_DIR, oldRelPath);
        const newPath = path.join(BASE_DIR, newRelPath);

        if (!fs.existsSync(oldPath)) {
            return res.status(404).json({ success: false, message: 'Source file not found' });
        }
        if (fs.existsSync(newPath)) {
            return res.status(409).json({ success: false, message: 'A file with this name already exists' });
        }

        fs.rename(oldPath, newPath, (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error renaming file' });
            }
            res.json({ success: true, message: 'File renamed successfully' });
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.post('/archive-file', (req, res) => {
    try {
        const { oldPath: oldRelPath, newPath: newRelPath } = req.body;

        if (!oldRelPath || !newRelPath) {
            return res.status(400).json({ success: false, message: 'oldPath and newPath required' });
        }

        const sourceFilePath = path.join(BASE_DIR, oldRelPath);
        const targetFilePath = path.join(BASE_DIR, newRelPath);

        if (!isPathSafe(sourceFilePath, BASE_DIR) || !isPathSafe(targetFilePath, BASE_DIR)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (!fs.existsSync(sourceFilePath)) {
            return res.status(404).json({ success: false, message: 'Source file not found' });
        }

        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });

        fs.rename(sourceFilePath, targetFilePath, (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error archiving file' });
            }
            res.json({ success: true, message: 'File archived successfully' });
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.post('/save-file', (req, res) => {
    try {
        const { file: fileName, content } = req.body;

        if (!fileName || content === undefined) {
            return res.status(400).json({ success: false, message: 'file and content required' });
        }

        let targetPath;
        if (fileName.startsWith('../')) {
            targetPath = path.join(PROJECT_ROOT, fileName.substring(3));
        } else {
            targetPath = path.join(BASE_DIR, fileName);
        }

        const relative = path.relative(PROJECT_ROOT, targetPath);
        if (relative && relative.startsWith('..') && !path.isAbsolute(relative)) {
            return res.status(403).json({ success: false, message: 'Access denied: outside project' });
        }

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        fs.writeFile(targetPath, content, 'utf8', (writeErr) => {
            if (writeErr) {
                return res.status(500).json({ success: false, message: 'Error writing file' });
            }
            res.json({ success: true, message: `File ${fileName} saved` });
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.post('/save-prompt', (req, res) => {
    try {
        const { stepId, content, file: fileName, projectId } = req.body;

        if ((!stepId && !fileName) || content === undefined) {
            return res.status(400).json({ success: false, message: 'stepId or file, and content required' });
        }

        let promptFilePath;

        if (projectId) {
            const projectFolder = path.join(BASE_DIR, 'projets', projectId);
            if (!fs.existsSync(projectFolder)) {
                fs.mkdirSync(projectFolder, { recursive: true });
            }
            if (fileName) {
                promptFilePath = path.join(projectFolder, fileName);
            } else if (stepId === 'A') {
                promptFilePath = path.join(projectFolder, 'prompt.md');
            } else {
                promptFilePath = path.join(projectFolder, `${stepId}g0-Prompt.md`);
            }
        } else {
            if (fileName) {
                promptFilePath = path.join(BASE_DIR, fileName);
            } else if (stepId === 'A') {
                promptFilePath = path.join(BASE_DIR, 'prompt.md');
            } else {
                promptFilePath = path.join(BASE_DIR, `${stepId}g0-Prompt.md`);
            }
        }

        fs.mkdirSync(path.dirname(promptFilePath), { recursive: true });

        fs.writeFile(promptFilePath, content, 'utf8', (writeErr) => {
            if (writeErr) {
                return res.json({ success: false, message: 'Error writing file' });
            }

            if (projectId) {
                try {
                    const pjPath = path.join(BASE_DIR, 'projets', projectId, 'project.json');
                    if (fs.existsSync(pjPath)) {
                        const pjData = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
                        const pjStep = pjData.pipeline.steps.find(s => s.id === stepId);
                        if (pjStep && !pjStep.startedAt) {
                            pjStep.startedAt = new Date().toISOString();
                            fs.writeFileSync(pjPath, JSON.stringify(pjData, null, 2));
                        }
                    }
                } catch (e) { console.error('[DATES] Error startedAt save-prompt:', e.message); }
            }

            res.json({ success: true, message: `Prompt saved for step ${stepId}`, filePath: promptFilePath });
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.post('/save-file-prompt', (req, res) => {
    try {
        const { fileName, content } = req.body;

        if (!fileName || content === undefined) {
            return res.status(400).json({ success: false, message: 'fileName and content required' });
        }

        const promptFilePath = path.join(BASE_DIR, fileName);
        fs.mkdirSync(path.dirname(promptFilePath), { recursive: true });

        fs.writeFile(promptFilePath, content, 'utf8', (writeErr) => {
            if (writeErr) {
                return res.json({ success: false, message: 'Error writing prompt file' });
            }
            res.json({ success: true, message: `Prompt saved for ${fileName}`, promptFileName: fileName });
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.get('/get-prompt', (req, res) => {
    const promptFile = req.query.file;
    const projectId = req.query.projectId;

    if (!promptFile) {
        return res.status(400).json({ success: false, message: 'Parameter file missing' });
    }

    const pathsToTry = [];
    if (projectId) {
        pathsToTry.push(path.join(BASE_DIR, 'projets', projectId, promptFile));
    }
    pathsToTry.push(path.join(BASE_DIR, promptFile));
    pathsToTry.push(path.join(BASE_DIR, 'origine', promptFile));

    function tryReadFile(paths, index) {
        if (index >= paths.length) {
            return res.json({ success: false, message: 'File not found', content: '' });
        }
        const currentPath = paths[index];
        if (!currentPath.startsWith(BASE_DIR) && !currentPath.startsWith(path.dirname(BASE_DIR))) {
            return tryReadFile(paths, index + 1);
        }
        fs.readFile(currentPath, 'utf8', (err, content) => {
            if (err) {
                return tryReadFile(paths, index + 1);
            }
            res.json({ success: true, content: content, filePath: currentPath });
        });
    }

    tryReadFile(pathsToTry, 0);
});

// ============================================================
// ROUTES: Design & Tests
// ============================================================

app.post('/save-design-choice', (req, res) => {
    try {
        const { content } = req.body;
        const mdFilePath = path.join(BASE_DIR, 'Gg2-design-choix.md');
        fs.writeFile(mdFilePath, content, 'utf8', (writeErr) => {
            if (writeErr) {
                return res.json({ success: false, message: 'Error writing MD file' });
            }
            res.json({ success: true, message: 'Choices saved to Gg2-design-choix.md' });
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.post('/save-test-status', (req, res) => {
    try {
        const { statuses } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'Ha2-cahier-de-tests.json');
        fs.readFile(jsonFilePath, 'utf8', (err, fileContent) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error reading JSON file' });
            }
            try {
                const jsonData = JSON.parse(fileContent);
                jsonData.testStatuses = statuses;
                jsonData.lastUpdated = new Date().toISOString();
                fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8', (writeErr) => {
                    if (writeErr) {
                        return res.json({ success: false, message: 'Error writing JSON file' });
                    }
                    res.json({ success: true, message: 'Statuses saved' });
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, message: 'Error parsing JSON' });
            }
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.post('/save-execution-result', (req, res) => {
    try {
        const { stepId, result } = req.body;
        if (!stepId || !result) {
            return res.status(400).json({ success: false, message: 'stepId and result required' });
        }
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        fs.readFile(jsonFilePath, 'utf8', (err, fileContent) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error reading index.json' });
            }
            try {
                const jsonData = JSON.parse(fileContent);
                const step = jsonData.pipeline ? jsonData.pipeline.steps.find(s => s.id === stepId) : null;
                if (step) {
                    step.outClaude = result;
                    step.lastExecutionDate = new Date().toISOString();
                    if (!step.startedAt) {
                        step.startedAt = step.lastExecutionDate;
                    }
                }
                fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8', (writeErr) => {
                    if (writeErr) {
                        return res.json({ success: false, message: 'Error writing index.json' });
                    }
                    res.json({ success: true, message: 'Result saved' });
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, message: 'Error parsing index.json' });
            }
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

app.post('/update-project-type', (req, res) => {
    try {
        const { selectedProjectType } = req.body;
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        fs.readFile(jsonFilePath, 'utf8', (err, fileContent) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error reading index.json' });
            }
            try {
                const jsonData = JSON.parse(fileContent);
                if (!jsonData.metadata) jsonData.metadata = {};
                jsonData.metadata.selectedProjectType = selectedProjectType;
                fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8', (writeErr) => {
                    if (writeErr) {
                        return res.json({ success: false, message: 'Error writing index.json' });
                    }
                    res.json({ success: true, message: 'Project type saved' });
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, message: 'Error parsing index.json' });
            }
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

// ============================================================
// ROUTES: Legacy validation
// ============================================================

app.post('/validate-step', (req, res) => {
    try {
        const { stepId, status } = req.body;
        if (!stepId || !status) {
            return res.status(400).json({ success: false, message: 'stepId and status required' });
        }
        const jsonFilePath = path.join(BASE_DIR, 'index.json');
        fs.readFile(jsonFilePath, 'utf8', (err, fileContent) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error reading index.json' });
            }
            try {
                const jsonData = JSON.parse(fileContent);
                const step = jsonData.pipeline ? jsonData.pipeline.steps.find(s => s.id === stepId) : null;
                if (step) {
                    if (status === 'validated') {
                        step.validation = { status: 'validated', timestamp: new Date().toISOString() };
                    } else if (status === 'reset') {
                        delete step.validation;
                    }
                }
                fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8', (writeErr) => {
                    if (writeErr) {
                        return res.json({ success: false, message: 'Error writing index.json' });
                    }
                    res.json({ success: true, message: `Step ${status}` });
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, message: 'Error parsing index.json' });
            }
        });
    } catch (e) {
        res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
});

// ============================================================
// ROUTES: AI Logs
// ============================================================

app.get('/api/ai-logs', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM ai_logs ORDER BY timestamp DESC');
        res.json(rows.map(r => ({
            id: r.id, timestamp: r.timestamp, page: r.page, section: r.section,
            documentName: r.document_name, provider: r.provider, model: r.model,
            prompt: r.prompt, response: r.response, status: r.status, durationMs: r.duration_ms
        })));
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error reading AI logs' });
    }
});

app.post('/api/ai-logs', async (req, res) => {
    try {
        const { page, section, documentName, provider, model, prompt, response, status, durationMs } = req.body;
        const log = {
            id: 'ailog-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
            timestamp: new Date().toISOString(),
            page: page || '', section: section || '', documentName: documentName || '',
            provider: provider || '', model: model || '',
            prompt: prompt || '', response: response || '',
            status: status || 'success', durationMs: durationMs || 0
        };
        await pool.query(
            `INSERT INTO ai_logs (id, timestamp, page, section, document_name, provider, model, prompt, response, status, duration_ms)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [log.id, log.timestamp, log.page, log.section, log.documentName,
             log.provider, log.model, log.prompt, log.response, log.status, log.durationMs]
        );
        res.json({ success: true, log });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error saving AI log' });
    }
});

app.delete('/api/ai-logs', async (req, res) => {
    try {
        await pool.query('DELETE FROM ai_logs');
        res.json({ success: true, message: 'AI logs cleared' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error clearing AI logs' });
    }
});

// ============================================================
// ROUTES: Special index.json
// ============================================================

app.get('/index.json', (req, res) => {
    const jsonFilePath = path.join(BASE_DIR, 'index.json');
    fs.readFile(jsonFilePath, 'utf8', (err, fileContent) => {
        if (err) {
            return res.status(404).send('File not found: index.json');
        }
        try {
            let jsonData = JSON.parse(fileContent);
            jsonData = updateDynamicData(jsonData);
            res.set({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.json(jsonData);
        } catch (parseErr) {
            res.status(500).send('Error parsing index.json');
        }
    });
});

// ============================================================
// Static Files
// ============================================================

app.use('/data', express.static(BASE_DIR, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
app.use(express.static(BASE_DIR, { setHeaders: (res) => res.set('Cache-Control', 'no-cache'), index: false }));

// ============================================================
// History
// ============================================================

app.get('/api/history', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM history ORDER BY date DESC');
        const modifications = rows.map(r => ({
            id: r.id, date: r.date, type: r.type, title: r.title,
            description: r.description, files: r.files || [],
            ai: r.ai, model: r.model, prompt: r.prompt,
            startedAt: r.started_at, completedAt: r.completed_at
        }));
        res.json({ modifications });
    } catch (e) {
        console.error('[HISTORY] Error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/history', async (req, res) => {
    const { id, type, title, description, files, ai, model, startedAt, completedAt } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'title et description requis' });
    try {
        const [countRows] = await pool.query('SELECT COUNT(*) AS cnt FROM history');
        const nextNum = (Number(countRows[0].cnt) + 1).toString().padStart(3, '0');
        const now = new Date().toISOString();
        const entry = {
            id: id || `mod-${nextNum}`,
            date: now, type: type || 'feature', title, description,
            files: files || [], ai: ai || '', model: model || '',
            prompt: req.body.prompt || '',
            startedAt: startedAt || null, completedAt: completedAt || now
        };
        await pool.query(
            `INSERT INTO history (id, date, type, title, description, files, ai, model, prompt, started_at, completed_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), files=VALUES(files), completed_at=VALUES(completed_at)`,
            [entry.id, entry.date, entry.type, entry.title, entry.description,
             JSON.stringify(entry.files), entry.ai, entry.model, entry.prompt,
             entry.startedAt, entry.completedAt]
        );
        console.log(`[HISTORY] Entry added: ${entry.id} — ${entry.title}`);
        res.json(entry);
    } catch (e) {
        console.error('[HISTORY] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/history/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM history WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Entry not found' });
        const r = rows[0];
        const updated = { ...r, ...req.body, id: req.params.id };
        await pool.query(
            `UPDATE history SET type=?, title=?, description=?, files=?, ai=?, model=?, prompt=?, started_at=?, completed_at=? WHERE id=?`,
            [updated.type, updated.title, updated.description,
             JSON.stringify(updated.files || r.files || []),
             updated.ai || r.ai, updated.model || r.model, updated.prompt || r.prompt,
             updated.started_at || r.started_at,
             updated.completed_at || r.completed_at,
             req.params.id]
        );
        console.log(`[HISTORY] Entry updated: ${req.params.id}`);
        res.json({ ...updated, startedAt: updated.started_at, completedAt: updated.completed_at });
    } catch (e) {
        console.error('[HISTORY] Update error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// Tickets
// ============================================================

const SCREENSHOTS_DIR = path.join(BASE_DIR, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function ticketRowToObj(r) {
    return {
        id: r.id, title: r.title, description: r.description, url: r.url,
        type: r.type, priority: r.priority, status: r.status,
        resolutionComment: r.resolution_comment, screenshotFile: r.screenshot_file,
        userId: r.user_id, username: r.username, createdAt: r.created_at,
        updatedAt: r.updated_at || null,
        commentCount: r.comment_count ? parseInt(r.comment_count) : 0
    };
}

// GET liste
app.get('/api/tickets', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT t.*,
                COALESCE((SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id), 0) AS comment_count
            FROM tickets t ORDER BY t.created_at DESC
        `);
        res.json({ tickets: rows.map(ticketRowToObj) });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error reading tickets' });
    }
});

// GET screenshot (fichier PNG)
app.get('/api/tickets/:id/screenshot', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT screenshot_file FROM tickets WHERE id = ?', [req.params.id]);
        if (!rows[0] || !rows[0].screenshot_file) return res.status(404).send('Pas de capture');
        const filePath = path.join(SCREENSHOTS_DIR, rows[0].screenshot_file);
        if (!fs.existsSync(filePath)) return res.status(404).send('Fichier introuvable');
        res.sendFile(filePath);
    } catch (e) { res.status(500).send('Erreur serveur'); }
});

// GET détail
app.get('/api/tickets/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Ticket non trouvé' });
        res.json(ticketRowToObj(rows[0]));
    } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/tickets', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { title, description, url, type, priority, screenshot } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'title et description requis' });
    const ticketId = `ticket-${Date.now()}`;
    let screenshotFile = null;
    if (screenshot && screenshot.startsWith('data:image/')) {
        try {
            const base64 = screenshot.replace(/^data:image\/\w+;base64,/, '');
            const filePath = path.join(SCREENSHOTS_DIR, `${ticketId}.png`);
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            screenshotFile = `${ticketId}.png`;
            console.log(`[TICKETS] Screenshot saved: ${screenshotFile}`);
        } catch (e) { console.error('[TICKETS] Error saving screenshot:', e); }
    }
    try {
        const createdAt = new Date().toISOString();
        await pool.query(
            `INSERT INTO tickets (id, title, description, url, type, priority, status, resolution_comment, screenshot_file, user_id, username, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ticketId, title, description, url || '', type || 'bug', priority || 'normale',
             'signale', '', screenshotFile, user.id, user.username, createdAt]
        );
        console.log(`[TICKETS] Created: ${ticketId} by ${user.username}`);
        res.json({ id: ticketId, title, description, url: url || '', type: type || 'bug',
            priority: priority || 'normale', status: 'signale', resolutionComment: '',
            screenshotFile, userId: user.id, username: user.username, createdAt });
    } catch (e) {
        console.error('[TICKETS] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/tickets/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Ticket non trouvé' });
        const t = rows[0];
        if (user.role !== 'admin' && t.user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        const { title, description, url, type, priority, status, resolutionComment } = req.body;
        const updated = {
            title: title ?? t.title,
            description: description ?? t.description,
            url: url ?? t.url,
            type: type ?? t.type,
            priority: priority ?? t.priority ?? 'normale',
            status: status ?? t.status,
            resolutionComment: resolutionComment ?? t.resolution_comment
        };
        await pool.query(
            `UPDATE tickets SET title=?, description=?, url=?, type=?, priority=?, status=?, resolution_comment=?, updated_at=NOW() WHERE id=?`,
            [updated.title, updated.description, updated.url, updated.type, updated.priority,
             updated.status, updated.resolutionComment, req.params.id]
        );
        res.json({ id: req.params.id, ...updated, userId: t.user_id, username: t.username });
    } catch (e) {
        console.error('[TICKETS] Update error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/tickets/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux admins' });
    try {
        const [rows] = await pool.query('SELECT screenshot_file FROM tickets WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Ticket non trouvé' });
        if (rows[0].screenshot_file) {
            const filePath = path.join(SCREENSHOTS_DIR, rows[0].screenshot_file);
            if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
        }
        await pool.query('DELETE FROM tickets WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error('[TICKETS] Delete error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET comments d'un ticket
app.get('/api/tickets/:id/comments', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json({ comments: rows.map(r => ({
            id: r.id, ticketId: r.ticket_id, userId: r.user_id,
            username: r.username, text: r.text, createdAt: r.created_at
        }))});
    } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST ajouter un commentaire
app.post('/api/tickets/:id/comments', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text requis' });
    try {
        const commentId = `tc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
        const createdAt = new Date().toISOString();
        await pool.query(
            'INSERT INTO ticket_comments (id, ticket_id, user_id, username, text, created_at) VALUES (?,?,?,?,?,?)',
            [commentId, req.params.id, user.id, user.username, text.trim(), createdAt]
        );
        res.json({ id: commentId, ticketId: req.params.id, userId: user.id, username: user.username, text: text.trim(), createdAt });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE un commentaire (auteur ou admin)
app.delete('/api/tickets/comments/:commentId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query('SELECT * FROM ticket_comments WHERE id = ?', [req.params.commentId]);
        if (!rows[0]) return res.status(404).json({ error: 'Commentaire non trouvé' });
        if (user.role !== 'admin' && rows[0].user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        await pool.query('DELETE FROM ticket_comments WHERE id = ?', [req.params.commentId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ============================================================
// Authentication
// ============================================================

const crypto = require('crypto');

// ── Session Store (in-memory Map + pg persistence) ────────────────────────────
const activeSessions = new Map();

async function loadSessionsFromDB() {
    try {
        const [rows] = await pool.query(
            `SELECT token, user_id, UNIX_TIMESTAMP(expires_at)*1000 AS expires_ms
             FROM sessions WHERE expires_at > NOW()`
        );
        rows.forEach(r => {
            activeSessions.set(r.token, { userId: r.user_id, expiresAt: Number(r.expires_ms) });
        });
        console.log(`[AUTH] Loaded ${activeSessions.size} active session(s) from DB`);
    } catch (e) {
        console.error('[AUTH] Error loading sessions from DB:', e.message);
        // fallback: charge depuis le fichier JSON si présent
        try {
            const SESSIONS_FILE = path.join(CONFIG_DIR, 'sessions.json');
            if (fs.existsSync(SESSIONS_FILE)) {
                const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
                const now = Date.now();
                Object.entries(data).forEach(([token, session]) => {
                    if (session.expiresAt > now) activeSessions.set(token, session);
                });
            }
        } catch {}
    }
}

function saveSessionToDB(token, session) {
    pool.query(
        `INSERT INTO sessions (token, user_id, expires_at)
         VALUES (?, ?, FROM_UNIXTIME(? / 1000))
         ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)`,
        [token, session.userId, session.expiresAt]
    ).catch(e => console.error('[AUTH] Error saving session to DB:', e.message));
}

function deleteSessionFromDB(token) {
    pool.query('DELETE FROM sessions WHERE token = ?', [token])
        .catch(e => console.error('[AUTH] Error deleting session from DB:', e.message));
}

// ── User Store (pg + in-memory cache) ────────────────────────────────────────
let _usersCache = null;

async function loadUsersFromDB() {
    try {
        const [rows] = await pool.query(
            'SELECT id, username, email, password_hash, role, created_at, last_login, config FROM users'
        );
        _usersCache = rows.map(r => ({
            id: r.id, username: r.username, email: r.email,
            password: r.password_hash, role: r.role,
            createdAt: r.created_at ? r.created_at.toISOString() : null,
            lastLogin: r.last_login ? r.last_login.toISOString() : null,
            config: r.config || {}
        }));
        return _usersCache;
    } catch (e) {
        console.error('[AUTH] Error loading users from DB:', e.message);
        // fallback: charge depuis le fichier JSON si présent
        try {
            const USERS_FILE = path.join(CONFIG_DIR, 'users.json');
            if (fs.existsSync(USERS_FILE)) {
                _usersCache = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            }
        } catch {}
        return _usersCache || [];
    }
}

function loadUsers() {
    return _usersCache || [];
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'worganic_auth_salt_2026').digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSessionUser(req) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return null;
    const session = activeSessions.get(token);
    if (!session || session.expiresAt < Date.now()) { activeSessions.delete(token); return null; }
    return loadUsers().find(u => u.id === session.userId) || null;
}

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
    if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    try {
        const users = loadUsers();
        if (users.find(u => u.email === email.toLowerCase())) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris" });
        const newUser = {
            id: crypto.randomUUID(),
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: hashPassword(password),
            role: users.length === 0 ? 'admin' : 'user',
            createdAt: new Date().toISOString()
        };
        await pool.query(
            `INSERT INTO users (id, username, email, password_hash, role, created_at)
             VALUES (?,?,?,?,?,?)`,
            [newUser.id, newUser.username, newUser.email, newUser.password, newUser.role, newUser.createdAt]
        );
        _usersCache = [...users, newUser];
        const token = generateToken();
        const session = { userId: newUser.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
        activeSessions.set(token, session);
        saveSessionToDB(token, session);
        console.log(`[AUTH] Registered: ${newUser.username} (${newUser.role})`);
        res.json({ token, user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role } });
    } catch (e) {
        console.error('[AUTH] Register error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    try {
        const users = await loadUsersFromDB();
        const idx = users.findIndex(u => u.email === email.toLowerCase() && u.password === hashPassword(password));
        if (idx === -1) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        const lastLogin = new Date().toISOString();
        try {
            await pool.query('UPDATE users SET last_login = ? WHERE id = ?', [lastLogin, users[idx].id]);
        } catch (dbErr) {
            console.warn('[AUTH] Could not update last_login in DB (DB unavailable):', dbErr.message);
        }
        if (_usersCache && _usersCache[idx]) _usersCache[idx].lastLogin = lastLogin;
        const token = generateToken();
        const session = { userId: users[idx].id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
        activeSessions.set(token, session);
        saveSessionToDB(token, session);
        console.log(`[AUTH] Login: ${users[idx].username}`);
        res.json({ token, user: { id: users[idx].id, username: users[idx].username, email: users[idx].email, role: users[idx].role } });
    } catch (e) {
        console.error('[AUTH] Login error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/auth/verify', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Token invalide ou expiré' });
    res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (token) { activeSessions.delete(token); deleteSessionFromDB(token); }
    res.json({ success: true });
});

app.get('/api/auth/users', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const safeUsers = loadUsers().map(u => ({
        id: u.id, username: u.username, email: u.email,
        role: u.role, createdAt: u.createdAt, lastLogin: u.lastLogin || null
    }));
    res.json(safeUsers);
});

app.put('/api/auth/users/:id', async (req, res) => {
    const reqUser = getSessionUser(req);
    if (!reqUser) return res.status(401).json({ error: 'Non authentifié' });
    if (reqUser.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    try {
        const users = loadUsers();
        const idx = users.findIndex(u => u.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        const { username, email, role, password } = req.body;
        if (username) users[idx].username = username.trim();
        if (email) users[idx].email = email.toLowerCase().trim();
        if (role) users[idx].role = role;
        if (password) users[idx].password = hashPassword(password);
        await pool.query(
            `UPDATE users SET username=?, email=?, role=?, password_hash=? WHERE id=?`,
            [users[idx].username, users[idx].email, users[idx].role, users[idx].password, req.params.id]
        );
        _usersCache = users;
        const u = users[idx];
        res.json({ id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt });
    } catch (e) {
        console.error('[AUTH] Update user error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/auth/users/:id', async (req, res) => {
    const reqUser = getSessionUser(req);
    if (!reqUser) return res.status(401).json({ error: 'Non authentifié' });
    if (reqUser.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    if (reqUser.id === req.params.id) return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
    try {
        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        _usersCache = loadUsers().filter(u => u.id !== req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[AUTH] Delete user error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// Agent Runs (lecture depuis agent-runs.json, écrit par server-agent.js)
// ============================================================

const AGENT_RUNS_FILE = path.join(BASE_DIR, 'agent-runs.json');

function loadAgentRuns() {
    try {
        if (fs.existsSync(AGENT_RUNS_FILE)) {
            return JSON.parse(fs.readFileSync(AGENT_RUNS_FILE, 'utf8'));
        }
    } catch (e) {}
    return { runs: [] };
}

// GET /api/agent-runs - Liste tous les runs
app.get('/api/agent-runs', (req, res) => {
    res.json(loadAgentRuns());
});

// GET /api/agent-runs/active - Run actif
app.get('/api/agent-runs/active', (req, res) => {
    const data = loadAgentRuns();
    const active = (data.runs || []).find(r => r.status === 'running') || null;
    res.json({ run: active });
});

// GET /api/agent-runs/:runId - Un run spécifique
app.get('/api/agent-runs/:runId', (req, res) => {
    const data = loadAgentRuns();
    const run = (data.runs || []).find(r => r.id === req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run non trouvé' });
    res.json({ run });
});

// PUT /api/actions/:id/report - Mise à jour rapport d'exécution d'une action
app.put('/api/actions/:id/report', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const indexFile = path.join(BASE_DIR, 'index.json');
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        const idx = (index.actions || []).findIndex(a => a.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Action non trouvée' });
        if (!index.actions[idx].execution) index.actions[idx].execution = {};
        Object.assign(index.actions[idx].execution, updates);
        fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// Error Handling
// ============================================================

app.use((err, req, res, next) => {
    console.error('[ERROR]', err.stack);
    res.status(500).json({ error: 'Server error', message: err.message });
});

// ============================================================
// Cahier de Recette — Routes
// ============================================================

const RECETTE_DIR         = path.join(BASE_DIR, 'recette');
const RECETTE_CAT_FILE    = path.join(RECETTE_DIR, 'categories.json');
const RECETTE_TESTS_FILE  = path.join(RECETTE_DIR, 'tests.json');
const RECETTE_CAMP_FILE   = path.join(RECETTE_DIR, 'campaigns.json');
const RECETTE_RUNS_FILE   = path.join(RECETTE_DIR, 'runs.json');
const RECETTE_VARS_FILE   = path.join(RECETTE_DIR, 'variables.json');
const RECETTE_TPL_FILE    = path.join(RECETTE_DIR, 'templates.json');

function recetteLoad(file, key) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { console.error('[RECETTE] load error:', file, e); }
    return { [key]: [] };
}

function recetteSave(file, data) {
    try {
        fs.mkdirSync(RECETTE_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) { console.error('[RECETTE] save error:', file, e); return false; }
}

function recetteId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Substitution de variables (G) ────────────────────────────────────────────
function substituteVars(text, variables) {
    if (!text || !variables) return text;
    return variables.reduce((t, v) => t.replaceAll(`{{${v.name}}}`, v.value), text);
}

function substituteTestVars(test, variables) {
    const sub = (s) => substituteVars(s, variables);
    return {
        ...test,
        preconditions: sub(test.preconditions),
        steps: test.steps.map(step => ({
            ...step,
            page: sub(step.page),
            action: sub(step.action),
            element: sub(step.element),
            expected: sub(step.expected)
        }))
    };
}

// ── Catégories ────────────────────────────────────────────────────────────────

app.get('/api/recette/categories', (req, res) => {
    res.json(recetteLoad(RECETTE_CAT_FILE, 'categories'));
});

app.post('/api/recette/categories', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_CAT_FILE, 'categories');
    const entry = { id: recetteId('cat'), ...req.body, order: data.categories.length + 1 };
    data.categories.push(entry);
    recetteSave(RECETTE_CAT_FILE, data);
    res.json(entry);
});

app.put('/api/recette/categories/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_CAT_FILE, 'categories');
    const idx = data.categories.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Catégorie non trouvée' });
    data.categories[idx] = { ...data.categories[idx], ...req.body, id: req.params.id };
    recetteSave(RECETTE_CAT_FILE, data);
    res.json(data.categories[idx]);
});

app.delete('/api/recette/categories/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_CAT_FILE, 'categories');
    data.categories = data.categories.filter(c => c.id !== req.params.id);
    recetteSave(RECETTE_CAT_FILE, data);
    res.json({ ok: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

app.get('/api/recette/tests', (req, res) => {
    res.json(recetteLoad(RECETTE_TESTS_FILE, 'tests'));
});

app.post('/api/recette/tests', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_TESTS_FILE, 'tests');
    const now = new Date().toISOString();
    const entry = { id: recetteId('test'), ...req.body, createdAt: now, updatedAt: now };
    data.tests.push(entry);
    recetteSave(RECETTE_TESTS_FILE, data);
    res.json(entry);
});

app.put('/api/recette/tests/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_TESTS_FILE, 'tests');
    const idx = data.tests.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Test non trouvé' });
    data.tests[idx] = { ...data.tests[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    recetteSave(RECETTE_TESTS_FILE, data);
    res.json(data.tests[idx]);
});

app.delete('/api/recette/tests/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_TESTS_FILE, 'tests');
    data.tests = data.tests.filter(t => t.id !== req.params.id);
    recetteSave(RECETTE_TESTS_FILE, data);
    res.json({ ok: true });
});

// Import multiple tests (E — templates import)
app.post('/api/recette/tests/import', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const { tests: toImport } = req.body;
    if (!Array.isArray(toImport)) return res.status(400).json({ error: 'tests[] requis' });
    const data = recetteLoad(RECETTE_TESTS_FILE, 'tests');
    const now = new Date().toISOString();
    const created = toImport.map(t => ({ ...t, id: recetteId('test'), createdAt: now, updatedAt: now }));
    data.tests.push(...created);
    recetteSave(RECETTE_TESTS_FILE, data);
    res.json({ imported: created.length, tests: created });
});

// ── Campagnes ─────────────────────────────────────────────────────────────────

app.get('/api/recette/campaigns', (req, res) => {
    res.json(recetteLoad(RECETTE_CAMP_FILE, 'campaigns'));
});

app.post('/api/recette/campaigns', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_CAMP_FILE, 'campaigns');
    const now = new Date().toISOString();
    const entry = { id: recetteId('camp'), ...req.body, createdAt: now, updatedAt: now };
    data.campaigns.push(entry);
    recetteSave(RECETTE_CAMP_FILE, data);
    res.json(entry);
});

app.put('/api/recette/campaigns/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_CAMP_FILE, 'campaigns');
    const idx = data.campaigns.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Campagne non trouvée' });
    data.campaigns[idx] = { ...data.campaigns[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    recetteSave(RECETTE_CAMP_FILE, data);
    res.json(data.campaigns[idx]);
});

app.delete('/api/recette/campaigns/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_CAMP_FILE, 'campaigns');
    data.campaigns = data.campaigns.filter(c => c.id !== req.params.id);
    recetteSave(RECETTE_CAMP_FILE, data);
    res.json({ ok: true });
});

// ── Variables de contexte (G) ─────────────────────────────────────────────────

app.get('/api/recette/variables', (req, res) => {
    res.json(recetteLoad(RECETTE_VARS_FILE, 'variables'));
});

app.post('/api/recette/variables', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_VARS_FILE, 'variables');
    const entry = { id: recetteId('var'), ...req.body };
    data.variables.push(entry);
    recetteSave(RECETTE_VARS_FILE, data);
    res.json(entry);
});

app.put('/api/recette/variables/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_VARS_FILE, 'variables');
    const idx = data.variables.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Variable non trouvée' });
    data.variables[idx] = { ...data.variables[idx], ...req.body, id: req.params.id };
    recetteSave(RECETTE_VARS_FILE, data);
    res.json(data.variables[idx]);
});

app.delete('/api/recette/variables/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_VARS_FILE, 'variables');
    data.variables = data.variables.filter(v => v.id !== req.params.id);
    recetteSave(RECETTE_VARS_FILE, data);
    res.json({ ok: true });
});

// ── Templates (E) ─────────────────────────────────────────────────────────────

app.get('/api/recette/templates', (req, res) => {
    res.json(recetteLoad(RECETTE_TPL_FILE, 'templates'));
});

// ── Runs ──────────────────────────────────────────────────────────────────────

app.get('/api/recette/runs', (req, res) => {
    const data = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    // Retourner sans les résultats détaillés pour alléger la liste
    const runs = data.runs.map(r => ({ ...r, results: undefined }));
    res.json({ runs });
});

app.get('/api/recette/runs/:id', (req, res) => {
    const data = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    const run = data.runs.find(r => r.id === req.params.id);
    if (!run) return res.status(404).json({ error: 'Run non trouvé' });
    res.json(run);
});

app.delete('/api/recette/runs/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    data.runs = data.runs.filter(r => r.id !== req.params.id);
    recetteSave(RECETTE_RUNS_FILE, data);
    res.json({ ok: true });
});

// Export run (D)
app.get('/api/recette/runs/:id/export', (req, res) => {
    const data = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    const run = data.runs.find(r => r.id === req.params.id);
    if (!run) return res.status(404).json({ error: 'Run non trouvé' });
    const fmt = req.query.format || 'json';
    if (fmt === 'json') {
        res.setHeader('Content-Disposition', `attachment; filename="run-${run.id}.json"`);
        res.json(run);
    } else {
        // Export Markdown
        const testsData = recetteLoad(RECETTE_TESTS_FILE, 'tests');
        const getTest = id => testsData.tests.find(t => t.id === id);
        const scoreEmoji = run.summary.score >= 90 ? '🟢' : run.summary.score >= 70 ? '🟡' : '🔴';
        let md = `# Rapport de recette — ${run.name}\n\n`;
        md += `**Date :** ${new Date(run.date).toLocaleString('fr-FR')}\n`;
        md += `**Site :** ${run.siteName} (${run.siteUrl})\n`;
        md += `**Navigateur :** ${run.browser} — **Env :** ${run.environment}\n`;
        md += `**Score :** ${scoreEmoji} ${run.summary.score}% (${run.summary.passed}/${run.summary.total})\n\n---\n\n`;
        run.results.forEach(r => {
            const t = getTest(r.testId);
            const icon = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : r.status === 'blocked' ? '🔒' : '⏭️';
            md += `## ${icon} ${t ? t.name : r.testId}\n\n`;
            md += `**Statut :** ${r.status} | **Score :** ${r.score}%\n\n`;
            if (r.aiComment) md += `> ${r.aiComment}\n\n`;
            md += `| # | Action | Attendu | Observé | Statut |\n|---|--------|---------|---------|--------|\n`;
            r.steps.forEach(s => {
                const st = t?.steps?.find(ts => ts.order === s.order);
                md += `| ${s.order} | ${st?.action || ''} | ${st?.expected || ''} | ${s.actual} | ${s.status} |\n`;
            });
            md += '\n';
        });
        res.setHeader('Content-Disposition', `attachment; filename="run-${run.id}.md"`);
        res.setHeader('Content-Type', 'text/markdown');
        res.send(md);
    }
});

// Comparer deux runs (C)
app.get('/api/recette/runs/compare', (req, res) => {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ error: 'Params a et b requis' });
    const data = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    const runA = data.runs.find(r => r.id === a);
    const runB = data.runs.find(r => r.id === b);
    if (!runA || !runB) return res.status(404).json({ error: 'Run non trouvé' });
    const statusA = Object.fromEntries(runA.results.map(r => [r.testId, r.status]));
    const statusB = Object.fromEntries(runB.results.map(r => [r.testId, r.status]));
    const allIds = [...new Set([...Object.keys(statusA), ...Object.keys(statusB)])];
    const regressions = allIds.filter(id => statusA[id] === 'passed' && statusB[id] === 'failed');
    const fixes = allIds.filter(id => statusA[id] === 'failed' && statusB[id] === 'passed');
    const unchanged = allIds.filter(id => statusA[id] === statusB[id]);
    res.json({
        runAId: a, runBId: b,
        regressions, fixes, unchanged,
        scoreA: runA.summary.score,
        scoreB: runB.summary.score,
        scoreDelta: runB.summary.score - runA.summary.score
    });
});

// Replay failures (A)
app.post('/api/recette/runs/replay/:id', (req, res) => {
    if (!getSessionUser(req)) return res.status(401).json({ error: 'Non authentifié' });
    const data = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    const originalRun = data.runs.find(r => r.id === req.params.id);
    if (!originalRun) return res.status(404).json({ error: 'Run non trouvé' });
    const failedIds = originalRun.results
        .filter(r => r.status === 'failed' || r.status === 'error')
        .map(r => r.testId);
    res.json({ testIds: failedIds, originalRunId: originalRun.id });
});

// ── Lancement SSE (cœur du système) ──────────────────────────────────────────

app.post('/api/recette/runs/launch', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const {
        name, siteName, siteUrl, browser, environment, testerName,
        aiProvider, aiModel, scope, campaignId, testIds, tags, variables: reqVars,
        webhookTriggered
    } = req.body;

    // Charger les tests à exécuter
    const testsData = recetteLoad(RECETTE_TESTS_FILE, 'tests');
    const varsData  = recetteLoad(RECETTE_VARS_FILE, 'variables');
    const variables = reqVars || varsData.variables;

    let selectedTests = [];
    if (Array.isArray(testIds) && testIds.length > 0) {
        selectedTests = testsData.tests.filter(t => testIds.includes(t.id) && t.status === 'active');
    } else if (Array.isArray(tags) && tags.length > 0) {
        selectedTests = testsData.tests.filter(t => t.status === 'active' && t.tags.some(tag => tags.includes(tag)));
    } else {
        selectedTests = testsData.tests.filter(t => t.status === 'active');
    }

    // Substitution de variables (G)
    selectedTests = selectedTests.map(t => substituteTestVars(t, variables));

    // Résolution des dépendances (H) — ordonner par dépendances
    const ordered = [];
    const resolved = new Set();
    const resolve = (id, depth = 0) => {
        if (depth > 50 || resolved.has(id)) return;
        const t = selectedTests.find(x => x.id === id);
        if (!t) return;
        (t.dependsOn || []).forEach(dep => resolve(dep, depth + 1));
        if (!resolved.has(id)) { resolved.add(id); ordered.push(t); }
    };
    selectedTests.forEach(t => resolve(t.id));
    selectedTests = ordered.length > 0 ? ordered : selectedTests;

    // Charger la clé API
    let conf = {};
    try { if (fs.existsSync(CONFIG_FILE)) conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    const apiKeys = conf.apiKeys || {};
    const isClaudeProvider = (aiProvider || '').toLowerCase().includes('claude');
    const apiKey = isClaudeProvider ? (apiKeys.claude?.key || '') : (apiKeys.gemini?.key || '');

    // Créer le run en base
    const runId = recetteId('run');
    const newRun = {
        id: runId,
        name: name || `Run ${new Date().toLocaleDateString('fr-FR')}`,
        date: new Date().toISOString(),
        siteName, siteUrl, browser, environment,
        testerName: testerName || user.username,
        aiProvider, aiModel,
        scope: scope || 'selection',
        campaignId, testIds: selectedTests.map(t => t.id), tags: tags || [],
        variables,
        status: 'running',
        webhookTriggered: !!webhookTriggered,
        summary: { total: selectedTests.length, passed: 0, failed: 0, skipped: 0, blocked: 0, score: 0, durationMs: 0 },
        results: []
    };
    const runsData = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    runsData.runs.push(newRun);
    recetteSave(RECETTE_RUNS_FILE, runsData);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('start', { runId, total: selectedTests.length });

    const startTime = Date.now();
    const results = [];
    const passedIds = new Set();

    // Construire le prompt AI
    const testsJson = selectedTests.map(t => ({
        id: t.id,
        name: t.name,
        preconditions: t.preconditions,
        steps: t.steps
    }));

    const systemPrompt = `Tu es un expert QA automatique. Évalue chaque cas de test pour le site "${siteName}" (${siteUrl}).
Navigateur : ${browser} | Environnement : ${environment}

Pour chaque cas de test, pour chaque étape, détermine :
- Si l'étape est logiquement cohérente et correctement définie
- Ce qui devrait se passer selon la description
- Les anomalies ou problèmes potentiels

Réponds UNIQUEMENT en JSON valide, sans markdown, sans code block.

Format attendu :
{
  "results": [
    {
      "testId": "string",
      "status": "passed|failed|skipped",
      "score": 0-100,
      "aiComment": "string",
      "durationMs": number,
      "steps": [
        { "order": number, "status": "passed|failed|skipped", "actual": "string", "note": "string" }
      ]
    }
  ]
}

Cas de tests :
${JSON.stringify(testsJson, null, 2)}`;

    let aiResults = [];
    try {
        if (!apiKey) throw new Error('Clé API non configurée');

        if (isClaudeProvider) {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: aiModel || 'claude-3-5-haiku-latest',
                    max_tokens: 8192,
                    messages: [{ role: 'user', content: systemPrompt }]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            const raw = data.content?.[0]?.text || '{}';
            aiResults = JSON.parse(raw).results || [];
        } else {
            // Gemini API
            const model = aiModel || 'gemini-2.0-flash';
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: systemPrompt }] }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
                    })
                }
            );
            const data = await response.json();
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            aiResults = JSON.parse(raw).results || [];
        }
    } catch (err) {
        console.error('[RECETTE] AI error:', err.message);
        // Générer des résultats d'erreur pour chaque test
        aiResults = selectedTests.map(t => ({
            testId: t.id, status: 'failed', score: 0,
            aiComment: `Erreur IA : ${err.message}`, durationMs: 0,
            steps: t.steps.map(s => ({ order: s.order, status: 'failed', actual: 'Erreur lors de l\'analyse IA', note: err.message }))
        }));
    }

    // Traiter et streamer les résultats test par test (H: dépendances)
    for (let i = 0; i < selectedTests.length; i++) {
        const test = selectedTests[i];
        send('test-start', { testId: test.id, name: test.name, index: i + 1 });

        // Vérifier les dépendances (H)
        const blockedBy = (test.dependsOn || []).find(dep => !passedIds.has(dep));
        let result;
        if (blockedBy) {
            result = {
                testId: test.id, status: 'blocked', score: 0,
                aiComment: `Bloqué par la dépendance : ${blockedBy}`, durationMs: 0,
                blockedBy,
                steps: test.steps.map(s => ({ order: s.order, status: 'blocked', actual: 'Non exécuté — dépendance non satisfaite', note: '' }))
            };
        } else {
            const aiResult = aiResults.find(r => r.testId === test.id) || {
                testId: test.id, status: 'skipped', score: 0,
                aiComment: 'Résultat non fourni par l\'IA', durationMs: 0, steps: []
            };
            result = { ...aiResult, testId: test.id };
            result.steps = result.steps || test.steps.map(s => ({ order: s.order, status: 'skipped', actual: '', note: '' }));
        }

        if (result.status === 'passed') passedIds.add(test.id);
        results.push(result);
        send('test-result', { result, index: i + 1, total: selectedTests.length });
    }

    // Calcul du résumé
    const passed  = results.filter(r => r.status === 'passed').length;
    const failed  = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const blocked = results.filter(r => r.status === 'blocked').length;
    const countable = passed + failed;
    const score = countable > 0 ? Math.round((passed / countable) * 100) : 0;
    const durationMs = Date.now() - startTime;
    const summary = { total: selectedTests.length, passed, failed, skipped, blocked, score, durationMs };

    // Sauvegarder le run complété
    const runsData2 = recetteLoad(RECETTE_RUNS_FILE, 'runs');
    const runIdx = runsData2.runs.findIndex(r => r.id === runId);
    if (runIdx !== -1) {
        runsData2.runs[runIdx] = { ...runsData2.runs[runIdx], status: 'completed', summary, results };
        recetteSave(RECETTE_RUNS_FILE, runsData2);
    }

    send('complete', { runId, summary });
    res.end();
});

// ── Webhook (J) ───────────────────────────────────────────────────────────────

app.post('/api/recette/webhook/trigger', async (req, res) => {
    let conf = {};
    try { if (fs.existsSync(CONFIG_FILE)) conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    const secret = conf.recetteWebhookSecret;
    const authHeader = (req.headers['authorization'] || '').split(' ')[1];
    if (!secret || authHeader !== secret) return res.status(401).json({ error: 'Token webhook invalide' });
    // Retourner les infos pour permettre à l'appelant de lancer via /runs/launch
    const { campaignId, testIds, tags, environment, siteName, siteUrl, browser, aiProvider, aiModel } = req.body;
    const testsData  = recetteLoad(RECETTE_TESTS_FILE, 'tests');
    const campsData  = recetteLoad(RECETTE_CAMP_FILE, 'campaigns');
    let ids = testIds || [];
    if (campaignId && !ids.length) {
        const camp = campsData.campaigns.find(c => c.id === campaignId);
        if (camp) ids = camp.testIds;
    }
    res.json({
        ok: true, testIds: ids, campaignId,
        runConfig: { environment, siteName, siteUrl, browser, aiProvider, aiModel, webhookTriggered: true }
    });
});

// Générer/lire le webhook secret
app.get('/api/recette/webhook/secret', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    let conf = {};
    try { if (fs.existsSync(CONFIG_FILE)) conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    if (!conf.recetteWebhookSecret) {
        conf.recetteWebhookSecret = require('crypto').randomBytes(24).toString('hex');
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(conf, null, 2), 'utf8');
    }
    res.json({ secret: conf.recetteWebhookSecret });
});

app.post('/api/recette/webhook/regenerate', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    let conf = {};
    try { if (fs.existsSync(CONFIG_FILE)) conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    conf.recetteWebhookSecret = require('crypto').randomBytes(24).toString('hex');
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(conf, null, 2), 'utf8');
    res.json({ secret: conf.recetteWebhookSecret });
});

// ── Analyse de page (widget flottant) ────────────────────────────────────────

app.post('/api/recette/analyze-page', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { pageUrl, pageTitle, pageContent, aiProvider, aiModel } = req.body;

    let conf = {};
    try { if (fs.existsSync(CONFIG_FILE)) conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    const apiKeys = conf.apiKeys || {};
    const isClaudeProvider = (aiProvider || '').toLowerCase().includes('claude');
    const apiKey = isClaudeProvider ? (apiKeys.claude?.key || '') : (apiKeys.gemini?.key || '');

    if (!apiKey) return res.status(400).json({ error: 'Clé API non configurée' });

    const prompt = `Tu es un expert QA. Analyse cette page Angular et génère des cas de tests QA exhaustifs.

Page : "${pageTitle}" (${pageUrl})
Contenu visible : ${(pageContent || '').slice(0, 3000)}

Génère entre 3 et 8 cas de tests couvrant les fonctionnalités visibles.
Réponds UNIQUEMENT en JSON valide, sans markdown.

Format :
{
  "suggestions": [
    {
      "name": "string",
      "categoryName": "string",
      "description": "string",
      "priority": "critique|haute|normale|basse",
      "tags": ["string"],
      "targetPages": ["${pageUrl}"],
      "preconditions": "string",
      "estimatedMinutes": number,
      "steps": [
        { "order": number, "page": "${pageUrl}", "action": "string", "element": "string", "expected": "string" }
      ]
    }
  ]
}`;

    const stripMarkdown = (text) => text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

    try {
        let suggestions = [];
        let rawText = '';
        if (isClaudeProvider) {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
                body: JSON.stringify({ model: aiModel || 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] })
            });
            const data = await response.json();
            if (!response.ok || data.error) {
                const errMsg = data.error?.message || (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) || `HTTP ${response.status}`;
                return res.status(500).json({ error: `Anthropic API: ${errMsg}` });
            }
            rawText = data.content?.[0]?.text || '';
            if (!rawText) return res.status(500).json({ error: 'Réponse vide de l\'API Anthropic', raw: JSON.stringify(data).substring(0, 500) });
            const cleaned = stripMarkdown(rawText);
            try {
                suggestions = JSON.parse(cleaned).suggestions || [];
            } catch (parseErr) {
                return res.status(500).json({ error: `Erreur parsing JSON: ${parseErr.message}`, raw: rawText.substring(0, 1000) });
            }
        } else {
            const model = aiModel || 'gemini-2.0-flash';
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            if (!response.ok || data.error) {
                const errMsg = data.error?.message || (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) || `HTTP ${response.status}`;
                return res.status(500).json({ error: `Gemini API: ${errMsg}` });
            }
            rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!rawText) return res.status(500).json({ error: 'Réponse vide de l\'API Gemini', raw: JSON.stringify(data).substring(0, 500) });
            const cleaned = stripMarkdown(rawText);
            try {
                suggestions = JSON.parse(cleaned).suggestions || [];
            } catch (parseErr) {
                return res.status(500).json({ error: `Erreur parsing JSON: ${parseErr.message}`, raw: rawText.substring(0, 1000) });
            }
        }
        res.json({ suggestions, rawText });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Score historique (B) — déjà dans /api/recette/runs, calculé côté client ──

// ============================================================
// Frankenstein Projects — CRUD (documents markdown, stockés en pg)
// ============================================================

function stepRowToObj(r) {
    return {
        id: r.id,
        projectId: r.project_id,
        stepNumber: r.step_number,
        content: r.content || '',
        linkedDocId: r.linked_doc_id || null,
        linkedDocTitle: r.linked_doc_title || null,
        result: r.result || null,
        resultStatus: r.result_status || 'pending',
        userId: r.user_id,
        username: r.username,
        notes: r.notes || null,
        createdAt: r.created_at
    };
}

function frankRowToObj(r) {
    return {
        id: r.id, title: r.title, description: r.description, content: r.content,
        status: r.status, userId: r.user_id,
        linkedDocId: r.linked_doc_id || null,
        _ownerUsername: r.owner_username || null,
        createdAt: r.created_at, updatedAt: r.updated_at
    };
}

// GET /api/frank/projects — liste (admin: tous, user: les siens)
app.get('/api/frank/projects', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        let query, params;
        if (user.role === 'admin') {
            query = `SELECT fp.*, u.username AS owner_username FROM frank_projects fp
                     LEFT JOIN users u ON fp.user_id = u.id
                     ORDER BY COALESCE(fp.updated_at, fp.created_at) DESC`;
            params = [];
        } else {
            query = `SELECT fp.*, u.username AS owner_username FROM frank_projects fp
                     LEFT JOIN users u ON fp.user_id = u.id
                     WHERE fp.user_id = ?
                     ORDER BY COALESCE(fp.updated_at, fp.created_at) DESC`;
            params = [user.id];
        }
        const [rows] = await pool.query(query, params);
        res.json(rows.map(frankRowToObj));
    } catch (e) {
        console.error('[FRANK] List error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/frank/projects/:id
app.get('/api/frank/projects/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query(
            `SELECT fp.*, u.username AS owner_username FROM frank_projects fp
             LEFT JOIN users u ON fp.user_id = u.id WHERE fp.id = ?`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Projet non trouvé' });
        if (user.role !== 'admin' && rows[0].user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        res.json(frankRowToObj(rows[0]));
    } catch (e) {
        console.error('[FRANK] Get error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/frank/projects — créer
app.post('/api/frank/projects', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { title, description, content, status } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    try {
        const now = new Date().toISOString();
        const newProject = {
            id: crypto.randomUUID(),
            title: title.trim(),
            description: description || '',
            content: content || '',
            status: status || 'draft',
            userId: user.id,
            createdAt: now,
            updatedAt: now
        };
        await pool.query(
            `INSERT INTO frank_projects (id, title, description, content, status, user_id, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?)`,
            [newProject.id, newProject.title, newProject.description, newProject.content,
             newProject.status, newProject.userId, newProject.createdAt, newProject.updatedAt]
        );
        res.status(201).json(newProject);
    } catch (e) {
        console.error('[FRANK] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT /api/frank/projects/:id — mettre à jour
app.put('/api/frank/projects/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query('SELECT * FROM frank_projects WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Projet non trouvé' });
        const p = rows[0];
        if (user.role !== 'admin' && p.user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        const { title, description, status } = req.body;
        const updatedAt = new Date().toISOString();
        const updated = {
            title: title !== undefined ? title.trim() : p.title,
            description: description !== undefined ? description : p.description,
            status: status !== undefined ? status : p.status
        };
        await pool.query(
            `UPDATE frank_projects SET title=?, description=?, status=?, updated_at=? WHERE id=?`,
            [updated.title, updated.description, updated.status, updatedAt, req.params.id]
        );
        res.json({
            id: req.params.id, ...updated, userId: p.user_id,
            linkedDocId: p.linked_doc_id || null,
            createdAt: p.created_at, updatedAt, _ownerUsername: null
        });
    } catch (e) {
        console.error('[FRANK] Update error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/frank/projects/:id
app.delete('/api/frank/projects/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query('SELECT user_id FROM frank_projects WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Projet non trouvé' });
        if (user.role !== 'admin' && rows[0].user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        await pool.query('DELETE FROM frank_projects WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error('[FRANK] Delete error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── Frankenstein Project Steps ───────────────────────────────

// GET /api/frank/projects/:id/steps
app.get('/api/frank/projects/:id/steps', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [proj] = await pool.query('SELECT user_id FROM frank_projects WHERE id = ?', [req.params.id]);
        if (!proj[0]) return res.status(404).json({ error: 'Projet non trouvé' });
        if (user.role !== 'admin' && proj[0].user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        const [rows] = await pool.query(
            'SELECT * FROM frank_project_steps WHERE project_id = ? ORDER BY step_number DESC',
            [req.params.id]
        );
        res.json(rows.map(stepRowToObj));
    } catch (e) {
        console.error('[FRANK] Steps list error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/frank/projects/:id/steps
app.post('/api/frank/projects/:id/steps', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [proj] = await pool.query('SELECT user_id FROM frank_projects WHERE id = ?', [req.params.id]);
        if (!proj[0]) return res.status(404).json({ error: 'Projet non trouvé' });
        if (user.role !== 'admin' && proj[0].user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        const { content, linkedDocId, linkedDocTitle, notes } = req.body;
        const [maxRows] = await pool.query(
            'SELECT COALESCE(MAX(step_number), 0) AS maxn FROM frank_project_steps WHERE project_id = ?',
            [req.params.id]
        );
        const stepNumber = (maxRows[0].maxn || 0) + 1;
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await pool.query(
            `INSERT INTO frank_project_steps
             (id, project_id, step_number, content, linked_doc_id, linked_doc_title, result, result_status, user_id, username, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?, ?)`,
            [id, req.params.id, stepNumber, content || '', linkedDocId || null, linkedDocTitle || null,
             user.id, user.username, notes || null, now]
        );
        const [newRows] = await pool.query('SELECT * FROM frank_project_steps WHERE id = ?', [id]);
        res.status(201).json(stepRowToObj(newRows[0]));
    } catch (e) {
        console.error('[FRANK] Steps create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT /api/frank/projects/:id/steps/:stepId
app.put('/api/frank/projects/:id/steps/:stepId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query(
            `SELECT fps.*, fp.user_id AS proj_user_id
             FROM frank_project_steps fps
             JOIN frank_projects fp ON fp.id = fps.project_id
             WHERE fps.id = ? AND fps.project_id = ?`,
            [req.params.stepId, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Étape non trouvée' });
        if (user.role !== 'admin' && rows[0].proj_user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        const s = rows[0];
        const content       = req.body.content       !== undefined ? req.body.content       : s.content;
        const linkedDocId   = req.body.linkedDocId   !== undefined ? (req.body.linkedDocId || null)   : s.linked_doc_id;
        const linkedDocTitle= req.body.linkedDocTitle!== undefined ? (req.body.linkedDocTitle || null) : s.linked_doc_title;
        const result        = req.body.result        !== undefined ? req.body.result        : s.result;
        const resultStatus  = req.body.resultStatus  !== undefined ? req.body.resultStatus  : s.result_status;
        const notes         = req.body.notes         !== undefined ? req.body.notes         : s.notes;
        await pool.query(
            `UPDATE frank_project_steps
             SET content=?, linked_doc_id=?, linked_doc_title=?, result=?, result_status=?, notes=?
             WHERE id=?`,
            [content, linkedDocId, linkedDocTitle, result, resultStatus, notes, req.params.stepId]
        );
        const [updatedRows] = await pool.query('SELECT * FROM frank_project_steps WHERE id = ?', [req.params.stepId]);
        res.json(stepRowToObj(updatedRows[0]));
    } catch (e) {
        console.error('[FRANK] Steps update error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/frank/projects/:id/steps/:stepId
app.delete('/api/frank/projects/:id/steps/:stepId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query(
            `SELECT fps.user_id, fp.user_id AS proj_user_id
             FROM frank_project_steps fps
             JOIN frank_projects fp ON fp.id = fps.project_id
             WHERE fps.id = ? AND fps.project_id = ?`,
            [req.params.stepId, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Étape non trouvée' });
        if (user.role !== 'admin' && rows[0].proj_user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });
        await pool.query('DELETE FROM frank_project_steps WHERE id = ?', [req.params.stepId]);
        res.json({ success: true });
    } catch (e) {
        console.error('[FRANK] Steps delete error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// File-based Projects (data/projets/)
// ============================================================

const PROJECTS_DIR = path.join(BASE_DIR, 'projets');
const CONVERSATIONS_DIR = path.join(PROJECTS_DIR, 'conversations');

if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
}

function slugify(text) {
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
        .replace(/-+/g, '-').trim();
}

function getProjectConfig(projectName) {
    const cfgPath = path.join(PROJECTS_DIR, projectName, 'config.json');
    if (!fs.existsSync(cfgPath)) return null;
    try {
        const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        
        // Nettoyage des doublons (même nom et type au même niveau)
        function cleanStructure(items) {
            if (!items) return [];
            const seen = new Set();
            const cleaned = [];
            for (const item of items) {
                const key = `${item.type}:${item.name.toLowerCase()}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    if (item.type === 'folder' && item.children) {
                        item.children = cleanStructure(item.children);
                    }
                    cleaned.push(item);
                }
            }
            return cleaned;
        }
        if (config.structure) {
            config.structure = cleanStructure(config.structure);
        }
        
        return config;
    } catch { return null; }
}

function saveProjectConfig(projectName, config) {
    config.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(PROJECTS_DIR, projectName, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

function findNodeById(items, id) {
    for (const item of items) {
        if (item.id === id) return item;
        if (item.children) { const f = findNodeById(item.children, id); if (f) return f; }
    }
    return null;
}

function removeNodeById(items, id) {
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) { items.splice(idx, 1); return true; }
    for (const item of items) {
        if (item.children && removeNodeById(item.children, id)) return true;
    }
    return false;
}

function isImageFile(name) {
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
}

function attachContent(projectName, items) {
    const sortedItems = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
    return sortedItems.map(item => {
        if (item.type === 'file') {
            if (isImageFile(item.name)) return { ...item, content: '', fileType: 'image' };
            const full = path.join(PROJECTS_DIR, projectName, item.path);
            return { ...item, content: fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '', fileType: 'text' };
        }
        return { ...item, children: attachContent(projectName, item.children || []) };
    });
}

function safeProjectPath(projectName, filePath) {
    const base = path.resolve(path.join(PROJECTS_DIR, projectName));
    const full = path.resolve(path.join(base, filePath));
    if (!full.startsWith(base + path.sep) && full !== base) return null;
    return full;
}

// GET /api/projects
app.get('/api/file-projects', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        if (!fs.existsSync(PROJECTS_DIR)) return res.json([]);
        const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => {
                const cfg = getProjectConfig(d.name);
                return { name: d.name, projectName: cfg?.projectName || d.name, createdAt: cfg?.createdAt, updatedAt: cfg?.updatedAt };
            });
        res.json(dirs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/projects
app.post('/api/file-projects', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projectName, folderName } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Nom requis' });
    const dir = folderName || slugify(projectName);
    if (!dir) return res.status(400).json({ error: 'Nom invalide' });
    const projectDir = path.join(PROJECTS_DIR, dir);
    if (fs.existsSync(projectDir)) return res.status(409).json({ error: 'Projet déjà existant' });
    try {
        fs.mkdirSync(projectDir, { recursive: true });
        const config = { projectName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), structure: [] };
        fs.writeFileSync(path.join(projectDir, 'config.json'), JSON.stringify(config, null, 2));
        res.status(201).json({ name: dir, ...config });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/projects/:name
app.get('/api/file-projects/:name', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    res.json(config);
});

// DELETE /api/projects/:name
app.delete('/api/file-projects/:name', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projectDir = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projectDir)) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        fs.rmSync(projectDir, { recursive: true, force: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/projects/:name/files
app.get('/api/file-projects/:name/files', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        res.json({ success: true, project: config.projectName, files: attachContent(req.params.name, config.structure || []) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/projects/:name/files
app.post('/api/file-projects/:name/files', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { name, parentId, content } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    try {
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        let filePath;
        let parentItems = config.structure;
        if (parentId) {
            const parent = findNodeById(config.structure, parentId);
            if (!parent || parent.type !== 'folder') return res.status(400).json({ error: 'Dossier parent invalide' });
            filePath = `${parent.path}/${fileName}`;
            parent.children = parent.children || [];
            parentItems = parent.children;
        } else {
            filePath = fileName;
        }

        // Éviter les doublons dans config.structure
        const existing = parentItems.find(i => i.name.toLowerCase() === fileName.toLowerCase());
        if (existing) {
            if (existing.type !== 'file') return res.status(409).json({ error: 'Un dossier porte déjà ce nom' });
            // Si c'est le même fichier, on met juste à jour le contenu
            const full = safeProjectPath(req.params.name, existing.path);
            if (full) fs.writeFileSync(full, content || '', 'utf8');
            return res.status(200).json({ ...existing, content: content || '' });
        }

        const full = safeProjectPath(req.params.name, filePath);
        if (!full) return res.status(400).json({ error: 'Chemin invalide' });
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content || '', 'utf8');
        const newFile = { id: crypto.randomUUID(), type: 'file', name: fileName, path: filePath, order: parentItems.length + 1 };
        parentItems.push(newFile);
        
        saveProjectConfig(req.params.name, config);
        res.status(201).json({ ...newFile, content: content || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/projects/:name/files/:id
app.put('/api/file-projects/:name/files/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'file') return res.status(404).json({ error: 'Fichier non trouvé' });
    try {
        const full = safeProjectPath(req.params.name, item.path);
        if (!full) return res.status(400).json({ error: 'Chemin invalide' });
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, req.body.content ?? '', 'utf8');
        saveProjectConfig(req.params.name, config);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/projects/:name/files/:id (rename)
app.patch('/api/file-projects/:name/files/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'file') return res.status(404).json({ error: 'Fichier non trouvé' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    try {
        const imageExtRe = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
        const isImage = imageExtRe.test(item.name);
        let newName;
        if (isImage) {
            const ext = path.extname(item.name);
            newName = imageExtRe.test(name) ? name : name + ext;
        } else {
            newName = name.endsWith('.md') ? name : `${name}.md`;
        }
        
        // Vérifier si un autre fichier porte déjà ce nom dans le même parent
        // (Simplification: on cherche dans toute la structure car on n'a pas facilement le parent ici, 
        // mais findNodeById pourrait être adapté ou on pourrait chercher le parent d'abord)
        
        const oldFull = safeProjectPath(req.params.name, item.path);
        const newPath = item.path.replace(/[^/\\]+$/, newName);
        const newFull = safeProjectPath(req.params.name, newPath);
        if (!oldFull || !newFull) return res.status(400).json({ error: 'Chemin invalide' });
        if (fs.existsSync(oldFull)) fs.renameSync(oldFull, newFull);
        item.name = newName; item.path = newPath;
        saveProjectConfig(req.params.name, config);
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/projects/:name/files/:id
app.delete('/api/file-projects/:name/files/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'file') return res.status(404).json({ error: 'Fichier non trouvé' });
    try {
        const full = safeProjectPath(req.params.name, item.path);
        if (full && fs.existsSync(full)) fs.unlinkSync(full);
        removeNodeById(config.structure, req.params.id);
        saveProjectConfig(req.params.name, config);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/projects/:name/folders
app.post('/api/file-projects/:name/folders', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { name, parentId } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    try {
        const slug = slugify(name) || name.replace(/\s+/g, '-').toLowerCase();
        let folderPath;
        let parentItems = config.structure;
        if (parentId) {
            const parent = findNodeById(config.structure, parentId);
            if (!parent || parent.type !== 'folder') return res.status(400).json({ error: 'Dossier parent invalide' });
            folderPath = `${parent.path}/${slug}`;
            parent.children = parent.children || [];
            parentItems = parent.children;
        } else {
            folderPath = slug;
        }

        // Éviter les doublons
        const existing = parentItems.find(i => i.type === 'folder' && (i.name.toLowerCase() === name.toLowerCase() || i.path === folderPath));
        if (existing) {
            return res.status(200).json(existing);
        }

        const full = safeProjectPath(req.params.name, folderPath);
        if (!full) return res.status(400).json({ error: 'Chemin invalide' });
        fs.mkdirSync(full, { recursive: true });
        const contentPath = `${folderPath}/contenu.md`;
        fs.writeFileSync(safeProjectPath(req.params.name, contentPath), '', 'utf8');
        const newFolder = {
            id: crypto.randomUUID(), type: 'folder', name, path: folderPath, order: parentItems.length + 1,
            children: [{ id: crypto.randomUUID(), type: 'file', name: 'contenu.md', path: contentPath, order: 1 }]
        };
        parentItems.push(newFolder);
        
        saveProjectConfig(req.params.name, config);
        res.status(201).json(newFolder);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/projects/:name/folders/:id (rename)
app.patch('/api/file-projects/:name/folders/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'folder') return res.status(404).json({ error: 'Dossier non trouvé' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    try {
        const newSlug = slugify(name) || name.replace(/\s+/g, '-').toLowerCase();
        const oldPath = item.path;
        const newPath = oldPath.includes('/') ? oldPath.replace(/[^/]+$/, newSlug) : newSlug;
        const oldFull = safeProjectPath(req.params.name, oldPath);
        const newFull = safeProjectPath(req.params.name, newPath);
        if (!oldFull || !newFull) return res.status(400).json({ error: 'Chemin invalide' });
        
        // Si le nouveau chemin existe déjà et que c'est un autre ID, on a un conflit
        // Mais si c'est le même ID, c'est juste un renommage qui peut être déjà fait sur disque
        if (oldFull !== newFull && fs.existsSync(oldFull)) {
            fs.renameSync(oldFull, newFull);
        } else if (!fs.existsSync(newFull)) {
             fs.mkdirSync(newFull, { recursive: true });
        }

        function updateNodePaths(node, from, to) {
            node.path = node.path.startsWith(from + '/') ? to + node.path.slice(from.length) : (node.path === from ? to : node.path);
            if (node.children) node.children.forEach(c => updateNodePaths(c, from, to));
        }
        updateNodePaths(item, oldPath, newPath);
        item.name = name;
        saveProjectConfig(req.params.name, config);
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/projects/:name/folders/:id
app.delete('/api/file-projects/:name/folders/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'folder') return res.status(404).json({ error: 'Dossier non trouvé' });
    try {
        const full = safeProjectPath(req.params.name, item.path);
        if (full && fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
        removeNodeById(config.structure, req.params.id);
        saveProjectConfig(req.params.name, config);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/projects/:name/structure
app.put('/api/file-projects/:name/structure', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        config.structure = req.body.structure;
        saveProjectConfig(req.params.name, config);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/projects/:name/move-file
app.post('/api/file-projects/:name/move-file', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { fileId, targetFolderId } = req.body;
    try {
        const item = findNodeById(config.structure, fileId);
        if (!item) return res.status(404).json({ error: 'Élément non trouvé' });
        removeNodeById(config.structure, fileId);
        const oldFull = safeProjectPath(req.params.name, item.path);
        if (targetFolderId) {
            const target = findNodeById(config.structure, targetFolderId);
            if (!target) return res.status(404).json({ error: 'Dossier cible non trouvé' });
            if (target.type !== 'folder') return res.status(400).json({ error: 'La cible doit être un dossier' });

            // Éviter les doublons de nom dans le dossier cible
            if ((target.children || []).some(c => c.type === 'file' && c.name.toLowerCase() === item.name.toLowerCase())) {
                return res.status(400).json({ error: `Un fichier nommé "${item.name}" existe déjà dans le dossier cible` });
            }

            const newPath = `${target.path}/${item.name}`;
            const newFull = safeProjectPath(req.params.name, newPath);
            if (oldFull && newFull && fs.existsSync(oldFull)) {
                fs.mkdirSync(path.dirname(newFull), { recursive: true });
                fs.renameSync(oldFull, newFull);
            }
            item.path = newPath;
            target.children = target.children || [];
            target.children.push(item);
        } else {
            const newPath = item.name;
            const newFull = safeProjectPath(req.params.name, newPath);
            if (oldFull && newFull && fs.existsSync(oldFull)) {
                fs.mkdirSync(path.dirname(newFull), { recursive: true });
                fs.renameSync(oldFull, newFull);
            }
            item.path = newPath;
            config.structure.push(item);
        }
        saveProjectConfig(req.params.name, config);
        res.json({ success: true, item });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/file-projects/:name/upload-image
app.post('/api/file-projects/:name/upload-image', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { name: fileName, parentId, data, mimeType } = req.body;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
    if (!allowedTypes.includes(mimeType)) return res.status(400).json({ error: 'Type non autorisé (jpg, png, gif, webp, svg uniquement)' });
    try {
        const buffer = Buffer.from(data, 'base64');
        if (buffer.length > 1024 * 1024) return res.status(400).json({ error: 'Fichier trop grand — maximum 1 Mo' });
        const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
        const ext = extMap[mimeType] || 'jpg';
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '') + '.' + ext;
        let parentItems = config.structure;
        let filePath = safeName;
        if (parentId) {
            const parent = findNodeById(config.structure, parentId);
            if (!parent || parent.type !== 'folder') return res.status(400).json({ error: 'Dossier parent invalide' });
            filePath = parent.path + '/' + safeName;
            parentItems = parent.children = parent.children || [];
        }
        const fullPath = safeProjectPath(req.params.name, filePath);
        if (!fullPath) return res.status(400).json({ error: 'Chemin invalide' });
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, buffer);
        const maxOrder = parentItems.filter(n => n.type === 'file').reduce((m, n) => Math.max(m, n.order || 0), 0);
        const newNode = { id: require('crypto').randomUUID(), type: 'file', name: safeName, path: filePath, order: maxOrder + 1, fileType: 'image' };
        parentItems.push(newNode);
        saveProjectConfig(req.params.name, config);
        res.status(201).json(newNode);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/file-projects/:name/move-folder
app.post('/api/file-projects/:name/move-folder', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { folderId, targetParentId } = req.body;
    try {
        const folder = findNodeById(config.structure, folderId);
        if (!folder || folder.type !== 'folder') return res.status(404).json({ error: 'Dossier non trouvé' });

        // Prevent moving into itself or its own descendants
        if (targetParentId === folderId) return res.status(400).json({ error: 'Déplacement invalide' });
        const isDesc = (node, id) => !!(node.children || []).some(c => c.id === id || isDesc(c, id));
        if (targetParentId && isDesc(folder, targetParentId)) return res.status(400).json({ error: 'Le dossier cible est un descendant' });

        const oldPath = folder.path;
        const oldFull = safeProjectPath(req.params.name, oldPath);

        // Remove from current position in JSON
        removeNodeById(config.structure, folderId);

        // Determine new path and insertion point
        let newPath;
        let targetItems;
        if (targetParentId) {
            const target = findNodeById(config.structure, targetParentId);
            if (!target || target.type !== 'folder') return res.status(400).json({ error: 'Dossier cible invalide' });

            // Éviter les doublons de nom dans le dossier cible
            if ((target.children || []).some(c => c.type === 'folder' && c.name.toLowerCase() === folder.name.toLowerCase())) {
                return res.status(400).json({ error: `Un dossier nommé "${folder.name}" existe déjà dans le dossier cible` });
            }

            newPath = target.path + '/' + folder.name;
            target.children = target.children || [];
            targetItems = target.children;
        } else {
            // Éviter les doublons à la racine
            if (config.structure.some(c => c.type === 'folder' && c.name.toLowerCase() === folder.name.toLowerCase())) {
                return res.status(400).json({ error: `Un dossier nommé "${folder.name}" existe déjà à la racine` });
            }
            newPath = folder.name;
            targetItems = config.structure;
        }

        // Move on filesystem
        const newFull = safeProjectPath(req.params.name, newPath);
        if (oldFull && newFull && fs.existsSync(oldFull)) {
            fs.mkdirSync(path.dirname(newFull), { recursive: true });
            fs.renameSync(oldFull, newFull);
        }

        // Update paths recursively inside the moved folder node
        function updatePaths(node, oldBase, newBase) {
            if (node.path === oldBase) node.path = newBase;
            else if (node.path && node.path.startsWith(oldBase + '/')) node.path = newBase + node.path.slice(oldBase.length);
            (node.children || []).forEach(c => updatePaths(c, oldBase, newBase));
        }
        updatePaths(folder, oldPath, newPath);

        // Set order at end of target level
        const maxOrder = targetItems.filter(n => n.type === 'folder').reduce((m, n) => Math.max(m, n.order || 0), 0);
        folder.order = maxOrder + 1;
        targetItems.push(folder);

        saveProjectConfig(req.params.name, config);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// Version / Déploiements
// ============================================================

const VERSION_FILE = path.join(PROJECT_ROOT, 'version.json');

app.get('/api/version/check', async (req, res) => {
    try {
        let vf = {};
        if (fs.existsSync(VERSION_FILE)) {
            let raw = fs.readFileSync(VERSION_FILE, 'utf8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
            vf = JSON.parse(raw);
        }

        // Mode child : version.json contient le champ "child"
        if (vf.child) {
            const localChild = vf.child;
            const localBaseSynced = vf.baseSynced || null;
            const childId = vf.childId || 'child';
            const prefix = localChild.split('-')[0] + '-'; // ex: "THI-"

            const [[latestChildRow], [latestBaseRow]] = await Promise.all([
                pool.query('SELECT * FROM app_deployments WHERE version LIKE ? ORDER BY deployed_at DESC LIMIT 1', [prefix + '%']),
                pool.query('SELECT * FROM app_deployments WHERE version LIKE ? ORDER BY deployed_at DESC LIMIT 1', ['B%'])
            ]);
            const latestChild = latestChildRow[0] || null;
            const latestBase = latestBaseRow[0] || null;

            const childUpToDate = !latestChild || latestChild.version === localChild;
            const baseUpToDate = !latestBase || !localBaseSynced || latestBase.version === localBaseSynced;

            const status = { mode: 'child', childId, child: { upToDate: childUpToDate, localVersion: localChild, latestDeployment: latestChild }, base: { upToDate: baseUpToDate, localVersion: localBaseSynced, latestVersion: latestBase?.version || null, latestDeployment: latestBase } };
            return res.json(status);
        }

        // Mode base (fallback) — filtre uniquement les versions B* pour ignorer les déploiements children
        const localVersion = vf.base || vf.version || '0.00';
        const [rows] = await pool.query('SELECT * FROM app_deployments WHERE version LIKE ? ORDER BY deployed_at DESC LIMIT 1', ['B%']);
        const latest = rows[0] || null;
        const upToDate = !latest || latest.version === localVersion;
        res.json({ upToDate, localVersion, latestDeployment: latest });
    } catch (e) {
        console.error('[VERSION CHECK]', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/deployments', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        let vf = {};
        if (fs.existsSync(VERSION_FILE)) {
            let raw = fs.readFileSync(VERSION_FILE, 'utf8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            vf = JSON.parse(raw);
        }
        let rows;
        if (vf.child) {
            // Mode child : retourner tous les déploiements (child + base) triés par date
            [rows] = await pool.query('SELECT * FROM app_deployments ORDER BY deployed_at DESC LIMIT 100');
        } else {
            // Mode base : uniquement les déploiements base (B*)
            [rows] = await pool.query('SELECT * FROM app_deployments WHERE version LIKE ? ORDER BY deployed_at DESC LIMIT 50', ['B%']);
        }
        res.json(rows);
    } catch (e) {
        console.error('[DEPLOYMENTS] List error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/admin/deployments', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const { version, commitName, description, filesModified, ai, model, modIds, scope, features } = req.body;
    if (!version) return res.status(400).json({ error: 'Version requise' });
    try {
        await pool.query(
            `INSERT INTO app_deployments
             (version, commit_name, deployed_by, description, files_modified, ai, model, mod_ids, scope, features)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                version,
                commitName || '',
                user.username || '',
                description || '',
                Array.isArray(filesModified) ? JSON.stringify(filesModified) : (filesModified || '[]'),
                ai || '',
                model || '',
                modIds || '',
                scope || '',
                features || ''
            ]
        );
        const existingVf = fs.existsSync(VERSION_FILE) ? JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')) : {};
        if (existingVf.child !== undefined) {
            existingVf.child = version;
            fs.writeFileSync(VERSION_FILE, JSON.stringify(existingVf, null, 2), 'utf8');
        } else {
            fs.writeFileSync(VERSION_FILE, JSON.stringify({ base: version }, null, 2), 'utf8');
        }
        res.json({ success: true });
    } catch (e) {
        console.error('[DEPLOYMENTS] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── Propagation base → children ──────────────────────────────────────────────
const PROPAGATION_FILE = path.join(PROJECT_ROOT, 'data', 'base-propagation.json');

app.get('/api/admin/propagation', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        if (!fs.existsSync(PROPAGATION_FILE)) return res.json([]);
        let raw = fs.readFileSync(PROPAGATION_FILE, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        const data = JSON.parse(raw);
        res.json(data.entries || []);
    } catch (e) {
        console.error('[PROPAGATION] List error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.patch('/api/admin/propagation/:baseVersion', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const { baseVersion } = req.params;
    const { childId } = req.body || {};
    try {
        if (!fs.existsSync(PROPAGATION_FILE)) return res.status(404).json({ error: 'Fichier propagation introuvable' });
        let raw = fs.readFileSync(PROPAGATION_FILE, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        const data = JSON.parse(raw);
        const entry = (data.entries || []).find(e => e.baseVersion === baseVersion);
        if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
        entry.propagationRequired = false;
        if (childId) {
            if (!entry.syncedBy) entry.syncedBy = [];
            if (!entry.syncedBy.includes(childId)) entry.syncedBy.push(childId);
        }
        fs.writeFileSync(PROPAGATION_FILE, JSON.stringify(data, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        console.error('[PROPAGATION] Patch error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── Child config (data/child/*.json) ─────────────────────────────────────────
const CHILD_CONFIG_DIR  = path.join(PROJECT_ROOT, 'data', 'child');
const CHILD_CONFIG_KEYS = ['app', 'theme', 'nav', 'landing', 'home', 'conf', 'admin-tabs'];

app.get('/api/child/config/:key', (req, res) => {
    const key = req.params.key;
    if (!CHILD_CONFIG_KEYS.includes(key)) return res.status(404).json({ error: 'Config introuvable' });
    const filePath = path.join(CHILD_CONFIG_DIR, `${key}.json`);
    if (!fs.existsSync(filePath)) return res.json({});
    try {
        let raw = fs.readFileSync(filePath, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        res.json(JSON.parse(raw));
    } catch (e) {
        res.status(500).json({ error: 'Erreur lecture config child' });
    }
});

app.post('/api/child/config/:key', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const key = req.params.key;
    if (!CHILD_CONFIG_KEYS.includes(key)) return res.status(404).json({ error: 'Config introuvable' });
    const filePath = path.join(CHILD_CONFIG_DIR, `${key}.json`);
    try {
        if (!fs.existsSync(CHILD_CONFIG_DIR)) fs.mkdirSync(CHILD_CONFIG_DIR, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erreur écriture config child' });
    }
});

// GET /api/child/css — CSS override personnalisé
app.get('/api/child/css', (req, res) => {
    const filePath = path.join(CHILD_CONFIG_DIR, 'custom.css');
    const customCSS = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ customCSS });
});

// POST /api/child/css — Sauvegarde CSS override (admin)
app.post('/api/child/css', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const { customCSS } = req.body;
    try {
        if (!fs.existsSync(CHILD_CONFIG_DIR)) fs.mkdirSync(CHILD_CONFIG_DIR, { recursive: true });
        fs.writeFileSync(path.join(CHILD_CONFIG_DIR, 'custom.css'), customCSS || '', 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erreur écriture CSS custom' });
    }
});

// ============================================================
// Help Pages CRUD
// ============================================================

// Route publique — lecture d'une entrée par ID
app.get('/api/help/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, title, text, page FROM help_pages WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
        res.json(rows[0]);
    } catch (e) {
        console.error('[HELP PUBLIC] error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/help', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        const [rows] = await pool.query('SELECT * FROM help_pages ORDER BY page, id ASC');
        res.json(rows);
    } catch (e) {
        console.error('[HELP] List error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/admin/help', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const { title, text, page } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texte requis' });
    try {
        const [result] = await pool.query(
            'INSERT INTO help_pages (title, text, page) VALUES (?, ?, ?)',
            [title.trim(), text.trim(), (page || '').trim()]
        );
        const [rows] = await pool.query('SELECT * FROM help_pages WHERE id = ?', [result.insertId]);
        res.json(rows[0]);
    } catch (e) {
        console.error('[HELP] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/admin/help/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const { title, text, page, newId } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texte requis' });
    const currentId = parseInt(req.params.id);
    const targetId = newId !== undefined ? parseInt(newId) : currentId;
    if (isNaN(targetId) || targetId < 1) return res.status(400).json({ error: 'ID invalide' });
    try {
        // Vérifier que l'entrée existe
        const [existing] = await pool.query('SELECT id FROM help_pages WHERE id = ?', [currentId]);
        if (!existing[0]) return res.status(404).json({ error: 'Introuvable' });
        // Si changement d'ID, vérifier que le nouvel ID n'est pas déjà pris
        if (targetId !== currentId) {
            const [conflict] = await pool.query('SELECT id FROM help_pages WHERE id = ?', [targetId]);
            if (conflict[0]) return res.status(409).json({ error: `L'ID ${targetId} est déjà utilisé` });
        }
        await pool.query(
            'UPDATE help_pages SET id = ?, title = ?, text = ?, page = ? WHERE id = ?',
            [targetId, title.trim(), text.trim(), (page || '').trim(), currentId]
        );
        const [rows] = await pool.query('SELECT * FROM help_pages WHERE id = ?', [targetId]);
        res.json(rows[0]);
    } catch (e) {
        console.error('[HELP] Update error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/admin/help/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        const [result] = await pool.query('DELETE FROM help_pages WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Introuvable' });
        res.json({ success: true });
    } catch (e) {
        console.error('[HELP] Delete error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// Documents — Catégories & Documents
// ============================================================

// GET toutes les catégories
app.get('/api/doc-categories', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query('SELECT * FROM doc_categories ORDER BY name ASC');
        res.json(rows.map(r => ({
            id: r.id, name: r.name, description: r.description || '',
            createdBy: r.created_by, createdByUsername: r.created_by_username,
            createdAt: r.created_at
        })));
    } catch (e) {
        console.error('[DOC-CAT] Get error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST créer une catégorie
app.post('/api/doc-categories', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    try {
        const id = `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await pool.query(
            'INSERT INTO doc_categories (id, name, description, created_by, created_by_username) VALUES (?,?,?,?,?)',
            [id, name.trim(), (description || '').trim(), user.id, user.username]
        );
        const [rows] = await pool.query('SELECT * FROM doc_categories WHERE id = ?', [id]);
        const r = rows[0];
        res.json({ id: r.id, name: r.name, description: r.description || '',
            createdBy: r.created_by, createdByUsername: r.created_by_username, createdAt: r.created_at });
    } catch (e) {
        console.error('[DOC-CAT] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT modifier une catégorie
app.put('/api/doc-categories/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    try {
        const [existing] = await pool.query('SELECT * FROM doc_categories WHERE id = ?', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Catégorie introuvable' });
        if (existing[0].created_by !== user.id && user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        await pool.query(
            'UPDATE doc_categories SET name = ?, description = ? WHERE id = ?',
            [name.trim(), (description || '').trim(), req.params.id]
        );
        const [rows] = await pool.query('SELECT * FROM doc_categories WHERE id = ?', [req.params.id]);
        const r = rows[0];
        res.json({ id: r.id, name: r.name, description: r.description || '',
            createdBy: r.created_by, createdByUsername: r.created_by_username, createdAt: r.created_at });
    } catch (e) {
        console.error('[DOC-CAT] Update error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE supprimer une catégorie
app.delete('/api/doc-categories/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [existing] = await pool.query('SELECT * FROM doc_categories WHERE id = ?', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Catégorie introuvable' });
        if (existing[0].created_by !== user.id && user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        await pool.query('DELETE FROM doc_categories WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error('[DOC-CAT] Delete error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET documents (publics + les privés de l'utilisateur)
app.get('/api/documents', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        let rows;
        if (user.role === 'admin') {
            [rows] = await pool.query('SELECT * FROM documents ORDER BY updated_at DESC');
        } else {
            [rows] = await pool.query(
                'SELECT * FROM documents WHERE is_public = 1 OR created_by = ? ORDER BY updated_at DESC',
                [user.id]
            );
        }
        res.json(rows.map(r => ({
            id: r.id, categoryId: r.category_id || null,
            title: r.title, description: r.description || '', text: r.text || '',
            isPublic: !!r.is_public,
            createdBy: r.created_by, createdByUsername: r.created_by_username,
            updatedBy: r.updated_by || null, updatedByUsername: r.updated_by_username || null,
            createdAt: r.created_at, updatedAt: r.updated_at
        })));
    } catch (e) {
        console.error('[DOCS] Get error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST créer un document
app.post('/api/documents', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { title, description, categoryId, text, isPublic } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    try {
        const id = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await pool.query(
            `INSERT INTO documents (id, category_id, title, description, text, is_public, created_by, created_by_username)
             VALUES (?,?,?,?,?,?,?,?)`,
            [id, categoryId || null, title.trim(), (description || '').trim(),
             text || '', isPublic ? 1 : 0, user.id, user.username]
        );
        const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', [id]);
        const r = rows[0];
        res.json({ id: r.id, categoryId: r.category_id || null,
            title: r.title, description: r.description || '', text: r.text || '',
            isPublic: !!r.is_public,
            createdBy: r.created_by, createdByUsername: r.created_by_username,
            updatedBy: null, updatedByUsername: null,
            createdAt: r.created_at, updatedAt: r.updated_at });
    } catch (e) {
        console.error('[DOCS] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT modifier un document
app.put('/api/documents/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { title, description, categoryId, text, isPublic } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    try {
        const [existing] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Document introuvable' });
        if (existing[0].created_by !== user.id && user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        await pool.query(
            `UPDATE documents SET category_id = ?, title = ?, description = ?, text = ?,
             is_public = ?, updated_by = ?, updated_by_username = ? WHERE id = ?`,
            [categoryId || null, title.trim(), (description || '').trim(),
             text || '', isPublic ? 1 : 0, user.id, user.username, req.params.id]
        );
        const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        const r = rows[0];
        res.json({ id: r.id, categoryId: r.category_id || null,
            title: r.title, description: r.description || '', text: r.text || '',
            isPublic: !!r.is_public,
            createdBy: r.created_by, createdByUsername: r.created_by_username,
            updatedBy: r.updated_by || null, updatedByUsername: r.updated_by_username || null,
            createdAt: r.created_at, updatedAt: r.updated_at });
    } catch (e) {
        console.error('[DOCS] Update error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE supprimer un document
app.delete('/api/documents/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [existing] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Document introuvable' });
        if (existing[0].created_by !== user.id && user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        await pool.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error('[DOCS] Delete error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// ROUTES: Conversations (Zone 5)
// ============================================================

// GET /api/conversations/:sectionId
app.get('/api/conversations/:sectionId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    
    const sectionId = req.params.sectionId;
    const filePath = path.join(CONVERSATIONS_DIR, `${sectionId}.json`);
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.json({ sectionId, messages: [] });
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Erreur lors de la lecture de la conversation' });
    }
});

// GET /api/conversations-list
app.get('/api/conversations-list', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        if (!fs.existsSync(CONVERSATIONS_DIR)) {
            return res.json([]);
        }
        const files = fs.readdirSync(CONVERSATIONS_DIR);
        // Retourne la liste des IDs (nom du fichier sans .json)
        const ids = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
        res.json(ids);
    } catch (e) {
        res.status(500).json({ error: 'Erreur lors de la récupération de la liste des conversations' });
    }
});

// POST /api/conversations/:sectionId
app.post('/api/conversations/:sectionId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    
    const sectionId = req.params.sectionId;
    const { text } = req.body;
    
    if (!text) return res.status(400).json({ error: 'Texte requis' });
    
    const filePath = path.join(CONVERSATIONS_DIR, `${sectionId}.json`);
    
    try {
        if (!fs.existsSync(CONVERSATIONS_DIR)) {
            fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
        }

        let data = { sectionId, messages: [] };
        if (fs.existsSync(filePath)) {
            data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        
        const newMessage = {
            user: user.username,
            userId: user.id,
            text,
            timestamp: new Date().toISOString()
        };
        
        data.messages.push(newMessage);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        
        res.status(201).json(newMessage);
    } catch (e) {
        res.status(500).json({ error: 'Erreur lors de la sauvegarde du message' });
    }
});

// ============================================================
// Health Check
// ============================================================

app.get('/api/health/db', async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();
    try {
        const conn = await pool.getConnection();
        conn.release();
        res.json({ status: 'ok', ip: clientIp });
    } catch (err) {
        console.error('[HEALTH] DB connection failed:', err.message);
        res.status(503).json({ status: 'error', message: err.message, ip: clientIp });
    }
});

// ============================================================
// WO Action History
// ============================================================

app.get('/api/wo-action-history', async (req, res) => {
    try {
        const { section, userId, entityType, entityId, contextKey, contextValue, undoableOnly, limit, offset } = req.query;
        let sql = 'SELECT * FROM wo_action_history WHERE 1=1';
        const params = [];

        if (section)      { sql += ' AND section = ?';      params.push(section); }
        if (userId)       { sql += ' AND user_id = ?';      params.push(userId); }
        if (entityType)   { sql += ' AND entity_type = ?';  params.push(entityType); }
        if (entityId)     { sql += ' AND entity_id = ?';    params.push(entityId); }
        if (undoableOnly === 'true') { sql += ' AND undoable = 1'; }

        if (contextKey && contextValue) {
            sql += ' AND JSON_UNQUOTE(JSON_EXTRACT(context, ?)) = ?';
            params.push(`$.${contextKey}`, contextValue);
        }

        sql += ' ORDER BY timestamp DESC';
        if (limit)  { sql += ' LIMIT ?';  params.push(Number(limit)); }
        if (offset) { sql += ' OFFSET ?'; params.push(Number(offset)); }

        const [rows] = await pool.query(sql, params);
        const entries = rows.map(r => ({
            id: r.id, timestamp: r.timestamp, section: r.section, subsection: r.subsection,
            actionType: r.action_type, label: r.label, entityType: r.entity_type,
            entityId: r.entity_id, entityLabel: r.entity_label,
            beforeState: r.before_state, afterState: r.after_state,
            userId: r.user_id, username: r.username, context: r.context,
            undoable: !!r.undoable, undone: !!r.undone, undoneAt: r.undone_at,
            undoneBy: r.undone_by, undoAction: r.undo_action, meta: r.meta
        }));
        res.json(entries);
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Get error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/wo-action-history/:id — entrée complète (avec before/after state)
app.get('/api/wo-action-history/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM wo_action_history WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Entrée introuvable' });
        const r = rows[0];
        const parseJson = v => v ? (typeof v === 'string' ? JSON.parse(v) : v) : null;
        res.json({
            id: r.id, timestamp: r.timestamp, section: r.section, subsection: r.subsection,
            actionType: r.action_type, label: r.label,
            entityType: r.entity_type, entityId: r.entity_id, entityLabel: r.entity_label,
            beforeState: parseJson(r.before_state), afterState: parseJson(r.after_state),
            userId: r.user_id, username: r.username, context: r.context,
            undoable: !!r.undoable, undone: !!r.undone
        });
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Get by id error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/wo-action-history', async (req, res) => {
    const { section, subsection, actionType, label, entityType, entityId, entityLabel,
            beforeState, afterState, userId, username, context, undoable, undoAction, meta } = req.body;
    if (!section || !actionType || !label) {
        return res.status(400).json({ error: 'section, actionType et label sont requis' });
    }
    try {
        const [maxRows] = await pool.query('SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) AS maxNum FROM wo_action_history');
        const nextNum = ((maxRows[0].maxNum || 0) + 1).toString().padStart(3, '0');
        const id = `wah-${nextNum}`;
        const now = new Date();

        await pool.query(
            `INSERT INTO wo_action_history
             (id, timestamp, section, subsection, action_type, label, entity_type, entity_id, entity_label,
              before_state, after_state, user_id, username, context, undoable, undone, undo_action, meta)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
            [id, now, section, subsection || '', actionType, label,
             entityType || '', entityId || '', entityLabel || '',
             beforeState ? JSON.stringify(beforeState) : null,
             afterState  ? JSON.stringify(afterState)  : null,
             userId || null, username || '',
             context    ? JSON.stringify(context)    : null,
             undoable ? 1 : 0,
             undoAction ? JSON.stringify(undoAction) : null,
             meta       ? JSON.stringify(meta)       : null]
        );

        const entry = {
            id, timestamp: now.toISOString(), section, subsection: subsection || '',
            actionType, label, entityType: entityType || '', entityId: entityId || '',
            entityLabel: entityLabel || '', beforeState, afterState,
            userId: userId || null, username: username || '',
            context, undoable: !!undoable, undone: false, undoAction, meta
        };

        // Notifier les clients SSE si l'entrée est liée à un projet
        const projectId = context?.projectId;
        if (projectId && section && section.startsWith('projets/')) {
            broadcastToProject(projectId, 'history', {
                id: entry.id, timestamp: entry.timestamp, section: entry.section,
                actionType: entry.actionType, label: entry.label,
                entityType: entry.entityType, entityId: entry.entityId, entityLabel: entry.entityLabel,
                userId: entry.userId, username: entry.username, undone: false
            });
        }

        res.status(201).json(entry);
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/wo-action-history/:id/undo', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM wo_action_history WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Action introuvable' });

        const entry = rows[0];
        if (!entry.undoable)  return res.status(400).json({ error: "Cette action n'est pas réversible" });
        if (entry.undone)     return res.status(400).json({ error: 'Cette action a déjà été annulée' });

        const undoAction = entry.undo_action;
        if (undoAction) {
            const { endpoint, method, payload } = typeof undoAction === 'string' ? JSON.parse(undoAction) : undoAction;
            const baseUrl = `http://localhost:${process.env.PORT || 3001}`;
            const headers = {
                'Content-Type': 'application/json',
                ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
            };
            const fetchOptions = { method, headers };
            if (payload && ['PUT', 'POST', 'PATCH'].includes(method)) {
                fetchOptions.body = JSON.stringify(payload);
            }
            const undoRes = await fetch(`${baseUrl}${endpoint}`, fetchOptions);
            if (!undoRes.ok && undoRes.status !== 404) {
                const errData = await undoRes.json().catch(() => ({}));
                return res.status(undoRes.status).json({ error: errData.error || "Erreur lors de l'annulation" });
            }
        }

        const undoneAt = new Date();
        const undoneBy = req.body?.undoneBy || '';
        await pool.query(
            'UPDATE wo_action_history SET undone = 1, undone_at = ?, undone_by = ? WHERE id = ?',
            [undoneAt, undoneBy, req.params.id]
        );

        console.log(`[WO_ACTION_HISTORY] Undo: ${req.params.id} — ${entry.label} by ${undoneBy}`);
        res.json({ success: true, undoneAt: undoneAt.toISOString(), undoneBy });
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Undo error:', e);
        res.status(500).json({ error: "Erreur lors de l'annulation" });
    }
});

app.delete('/api/wo-action-history', async (req, res) => {
    try {
        await pool.query('DELETE FROM wo_action_history');
        console.log('[WO_ACTION_HISTORY] History cleared');
        res.json({ success: true });
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Clear error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// Projet Collaboration API
// ============================================================

// SSE clients registry: projetId → Set<res>
const sseClients = new Map();

function broadcastToProject(projetId, event, data) {
    const clients = sseClients.get(projetId);
    if (!clients || clients.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try { res.write(payload); } catch (_) {}
    }
}

// GET /api/collab/:projetId/stream — SSE
app.get('/api/collab/:projetId/stream', (req, res) => {
    const { projetId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (!sseClients.has(projetId)) sseClients.set(projetId, new Set());
    sseClients.get(projetId).add(res);
    res.write('event: connected\ndata: {"status":"ok"}\n\n');

    const hb = setInterval(() => { try { res.write(':heartbeat\n\n'); } catch (_) {} }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.get(projetId)?.delete(res); });
});

// GET /api/collab/:projetId/history
app.get('/api/collab/:projetId/history', async (req, res) => {
    const { projetId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    try {
        const [rows] = await pool.query(
            `SELECT id, timestamp, section, action_type, label, entity_type, entity_id, entity_label,
                    user_id, username, undone, before_state, after_state
             FROM wo_action_history
             WHERE section LIKE 'projets/%'
               AND JSON_UNQUOTE(JSON_EXTRACT(context, '$.projectId')) = ?
             ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
            [projetId, limit, offset]
        );
        res.json(rows.map(r => ({
            id: r.id, timestamp: r.timestamp, section: r.section,
            actionType: r.action_type, label: r.label,
            entityType: r.entity_type, entityId: r.entity_id, entityLabel: r.entity_label,
            userId: r.user_id, username: r.username, undone: !!r.undone,
            beforeState: r.before_state ? (typeof r.before_state === 'string' ? JSON.parse(r.before_state) : r.before_state) : null,
            afterState: r.after_state ? (typeof r.after_state === 'string' ? JSON.parse(r.after_state) : r.after_state) : null
        })));
    } catch (e) {
        console.error('[COLLAB] history error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/collab/:projetId/history — efface l'historique scopé à un projet/entités
//   query: entityIds (CSV, optionnel) — restreint aux entités sélectionnées
//          scope = 'mine' | 'all' — 'all' réservé aux admins, sinon forcé à 'mine'
app.delete('/api/collab/:projetId/history', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projetId } = req.params;
    const requestedScope = (req.query.scope || 'mine').toString();
    const scope = (requestedScope === 'all' && user.role === 'admin') ? 'all' : 'mine';
    const entityIdsRaw = (req.query.entityIds || '').toString().trim();
    const entityIds = entityIdsRaw ? entityIdsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    try {
        const params = [projetId];
        let sql = `DELETE FROM wo_action_history
                   WHERE section LIKE 'projets/%'
                     AND JSON_UNQUOTE(JSON_EXTRACT(context, '$.projectId')) = ?`;
        if (entityIds.length > 0) {
            sql += ` AND entity_id IN (${entityIds.map(() => '?').join(',')})`;
            params.push(...entityIds);
        }
        if (scope === 'mine') {
            sql += ' AND user_id = ?';
            params.push(user.id);
        }
        const [result] = await pool.query(sql, params);
        console.log(`[COLLAB] history cleared: projet=${projetId} scope=${scope} user=${user.username} affected=${result.affectedRows}`);
        res.json({ success: true, deleted: result.affectedRows });
    } catch (e) {
        console.error('[COLLAB] clear history error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/collab/:projetId/locks
app.get('/api/collab/:projetId/locks', async (req, res) => {
    const { projetId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM projet_section_lock WHERE projet_id = ?', [projetId]
        );
        res.json(rows.map(r => ({
            nodeId: r.node_id, projetId: r.projet_id,
            lockedById: r.locked_by_id, lockedByName: r.locked_by_name,
            lockedAt: r.locked_at
        })));
    } catch (e) {
        console.error('[COLLAB] locks error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/collab/:projetId/nodes/:nodeId/lock
app.post('/api/collab/:projetId/nodes/:nodeId/lock', async (req, res) => {
    const { projetId, nodeId } = req.params;
    const { userId, userName } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    try {
        const [existing] = await pool.query(
            'SELECT * FROM projet_section_lock WHERE node_id = ?', [nodeId]
        );
        if (existing.length > 0 && existing[0].locked_by_id !== userId) {
            return res.status(409).json({
                error: 'Section déjà verrouillée',
                lockedBy: existing[0].locked_by_name,
                lockedAt: existing[0].locked_at
            });
        }
        await pool.query(
            `INSERT INTO projet_section_lock (node_id, projet_id, locked_by_id, locked_by_name)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE locked_by_id=VALUES(locked_by_id),
             locked_by_name=VALUES(locked_by_name), locked_at=NOW()`,
            [nodeId, projetId, userId, userName || 'Utilisateur']
        );
        const lock = { nodeId, projetId, lockedById: userId, lockedByName: userName || 'Utilisateur', lockedAt: new Date().toISOString() };
        broadcastToProject(projetId, 'lock', lock);
        res.json(lock);
    } catch (e) {
        console.error('[COLLAB] lock error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/collab/:projetId/nodes/:nodeId/lock
app.delete('/api/collab/:projetId/nodes/:nodeId/lock', async (req, res) => {
    const { projetId, nodeId } = req.params;
    const userId = req.query.userId;
    try {
        const [existing] = await pool.query('SELECT * FROM projet_section_lock WHERE node_id = ?', [nodeId]);
        if (existing.length === 0) return res.json({ success: true });
        if (userId && existing[0].locked_by_id !== userId) {
            return res.status(403).json({ error: 'Vous ne pouvez pas déverrouiller cette section' });
        }
        await pool.query('DELETE FROM projet_section_lock WHERE node_id = ?', [nodeId]);
        broadcastToProject(projetId, 'unlock', { nodeId, projetId });
        res.json({ success: true });
    } catch (e) {
        console.error('[COLLAB] unlock error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// Server Startup
// ============================================================

app.listen(PORT, async () => {
    fs.mkdirSync(path.join(BASE_DIR, 'projets'), { recursive: true });
    fs.mkdirSync(path.join(BASE_DIR, 'origine'), { recursive: true });
    fs.mkdirSync(path.join(BASE_DIR, 'prompts'), { recursive: true });
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    // Initialisation PostgreSQL
    await loadUsersFromDB();
    await loadSessionsFromDB();
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ticket_comments (
            id VARCHAR(64) PRIMARY KEY,
            ticket_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(64),
            username VARCHAR(128),
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).catch(e => console.error('[DB] ticket_comments init error:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS help_pages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            text TEXT NOT NULL,
            page VARCHAR(128) NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `).catch(e => console.error('[DB] help_pages init error:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS doc_categories (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_by VARCHAR(64) NOT NULL,
            created_by_username VARCHAR(128) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).catch(e => console.error('[DB] doc_categories init error:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
            id VARCHAR(64) PRIMARY KEY,
            category_id VARCHAR(64) DEFAULT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            text LONGTEXT,
            is_public TINYINT(1) NOT NULL DEFAULT 1,
            created_by VARCHAR(64) NOT NULL,
            created_by_username VARCHAR(128) NOT NULL,
            updated_by VARCHAR(64) DEFAULT NULL,
            updated_by_username VARCHAR(128) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `).catch(e => console.error('[DB] documents init error:', e.message));

    await pool.query(`
        ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS linked_doc_id VARCHAR(64) DEFAULT NULL
    `).catch(e => console.error('[DB] frank_projects migration linked_doc_id:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS frank_project_steps (
            id CHAR(36) PRIMARY KEY,
            project_id CHAR(36) NOT NULL,
            step_number INT NOT NULL DEFAULT 1,
            content LONGTEXT,
            linked_doc_id VARCHAR(64) DEFAULT NULL,
            linked_doc_title VARCHAR(255) DEFAULT NULL,
            result LONGTEXT DEFAULT NULL,
            result_status VARCHAR(50) DEFAULT 'pending',
            user_id VARCHAR(64) NOT NULL,
            username VARCHAR(128) NOT NULL,
            notes TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_frank_steps_project (project_id)
        )
    `).catch(e => console.error('[DB] frank_project_steps init error:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS wo_action_history (
            id            VARCHAR(50)   PRIMARY KEY,
            timestamp     DATETIME      DEFAULT CURRENT_TIMESTAMP,
            section       VARCHAR(100)  NOT NULL,
            subsection    VARCHAR(100)  DEFAULT '',
            action_type   VARCHAR(50)   NOT NULL,
            label         VARCHAR(500)  NOT NULL,
            entity_type   VARCHAR(100)  DEFAULT '',
            entity_id     VARCHAR(100)  DEFAULT '',
            entity_label  VARCHAR(255)  DEFAULT '',
            before_state  JSON          DEFAULT NULL,
            after_state   JSON          DEFAULT NULL,
            user_id       CHAR(36)      NULL,
            username      VARCHAR(255)  DEFAULT '',
            context       JSON          DEFAULT NULL,
            undoable      BOOLEAN       DEFAULT FALSE,
            undone        BOOLEAN       DEFAULT FALSE,
            undone_at     DATETIME      NULL,
            undone_by     VARCHAR(255)  DEFAULT '',
            undo_action   JSON          DEFAULT NULL,
            meta          JSON          DEFAULT NULL,
            INDEX idx_wah_section  (section),
            INDEX idx_wah_user     (user_id),
            INDEX idx_wah_entity   (entity_type, entity_id)
        )
    `).catch(e => console.error('[DB] wo_action_history init error:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS projet_section_lock (
            node_id        VARCHAR(64)   NOT NULL,
            projet_id      VARCHAR(128)  NOT NULL,
            locked_by_id   VARCHAR(128)  NOT NULL,
            locked_by_name VARCHAR(128)  NOT NULL DEFAULT '',
            locked_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (node_id),
            INDEX idx_psl_projet (projet_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(e => console.error('[DB] projet_section_lock init error:', e.message));

    console.log(`
+==========================================+
|   Frankenstein - DATA Server (Cloud)         |
+==========================================+

  Port:       http://localhost:${PORT}
  Data dir:   ${BASE_DIR}
  Rôle:       Gestion BDD, projets, fichiers

  Routes IA (executor) : http://localhost:3002
  Angular (dev)        : http://localhost:4200

  Press CTRL+C to stop
    `);
});

process.on('SIGINT', () => { console.log('\nShutting down data server...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nShutting down data server...'); process.exit(0); });
process.on('uncaughtException', (err) => { console.error('Uncaught exception:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled rejection:', reason); });
