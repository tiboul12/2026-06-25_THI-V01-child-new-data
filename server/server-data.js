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
const ftp = require('basic-ftp');
const projetGit = require('./modules/projet-git');
const githubService = require('./modules/github-service');
const ftpService = require('./modules/ftp-service');

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
        { value: 'gemini-2.5-pro',          label: 'Gemini 2.5 Pro',           costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash',         costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-2.0-pro-preview',  label: 'Gemini 2.0 Pro (Preview)', costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash',         costInput: 0.10,  costOutput: 0.40 },
        { value: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro',           costInput: 1.25,  costOutput: 5.00 },
        { value: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash',         costInput: 0.075, costOutput: 0.30 }
    ],
    claude: [
        { value: 'claude-opus-4-7',              label: 'Claude Opus 4.7',            costInput: 15.00, costOutput: 75.00 },
        { value: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6',          costInput: 3.00,  costOutput: 15.00 },
        { value: 'claude-opus-4-6',              label: 'Claude Opus 4.6',            costInput: 15.00, costOutput: 75.00 },
        { value: 'claude-haiku-4-5-20251001',    label: 'Claude Haiku 4.5',           costInput: 0.80,  costOutput: 4.00 },
        { value: 'claude-3-7-sonnet-latest',     label: 'Claude 3.7 Sonnet (Latest)', costInput: 3.00,  costOutput: 15.00 },
        { value: 'claude-3-5-sonnet-latest',     label: 'Claude 3.5 Sonnet',          costInput: 3.00,  costOutput: 15.00 },
        { value: 'claude-3-5-haiku-latest',      label: 'Claude 3.5 Haiku',           costInput: 0.80,  costOutput: 4.00 },
        { value: 'claude-3-opus-latest',         label: 'Claude 3 Opus',              costInput: 15.00, costOutput: 75.00 }
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
        'http://localhost:4202',  // Portail NX
        'http://localhost:4203',  // Projets NX
        'http://localhost:3001',
        'http://127.0.0.1:4200',
        'http://127.0.0.1:4201',
        // Ajouter l'URL de prod ici quand disponible :
        // 'https://app.worganic.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Call']
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
            headerIaVisible: userConfig.headerIaVisible !== undefined ? userConfig.headerIaVisible : (globalConf.headerIaVisible !== undefined ? globalConf.headerIaVisible : false),
            cliIaEnabled: userConfig.cliIaEnabled !== undefined ? userConfig.cliIaEnabled : (globalConf.cliIaEnabled !== undefined ? globalConf.cliIaEnabled : true),
            apiKeysEnabled: userConfig.apiKeysEnabled !== undefined ? userConfig.apiKeysEnabled : (globalConf.apiKeysEnabled !== undefined ? globalConf.apiKeysEnabled : true),
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
        const { gemini, claude, cliConfig, appVersion, ticketsEnabled, recetteWidgetEnabled, enabledTools, headerIaVisible, cliIaEnabled, apiKeysEnabled, enabledTabs, navItems } = req.body;

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

        // ── Config IA par utilisateur (toggles visibilité) ──────────────────
        if (headerIaVisible !== undefined) userConfig.headerIaVisible = Boolean(headerIaVisible);
        if (cliIaEnabled !== undefined) userConfig.cliIaEnabled = Boolean(cliIaEnabled);
        if (apiKeysEnabled !== undefined) userConfig.apiKeysEnabled = Boolean(apiKeysEnabled);

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
            enabledTabs !== undefined || navItems !== undefined) {
            let globalConf = {};
            if (fs.existsSync(CONFIG_FILE)) {
                try { globalConf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
            } else {
                fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
            }
            if (appVersion !== undefined) globalConf.appVersion = appVersion;
            if (ticketsEnabled !== undefined) globalConf.ticketsEnabled = ticketsEnabled;
            if (recetteWidgetEnabled !== undefined) globalConf.recetteWidgetEnabled = recetteWidgetEnabled;
            if (enabledTabs !== undefined && typeof enabledTabs === 'object') {
                globalConf.enabledTabs = { ...(globalConf.enabledTabs || {}), ...enabledTabs };
            }
            if (navItems !== undefined && typeof navItems === 'object') {
                globalConf.navItems = { ...(globalConf.navItems || {}), ...navItems };
            }
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

// Sécurité : intercepter les images 0 octet (placeholder de récupération) avant express.static
// → renvoie 404 pour que le client affiche un état d'erreur clair plutôt qu'une image cassée
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']);
app.use('/data/projets', (req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return next();
    const filePath = path.join(BASE_DIR, 'projets', req.path);
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).size === 0) {
            return res.status(404).json({ error: 'image_not_synced', path: req.path });
        }
    } catch (_) {}
    next();
});

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
        if (contextKey && contextValue) {
            sql += ` AND JSON_EXTRACT(context, '$.${contextKey}') = ?`;
            params.push(contextValue);
        }
        if (undoableOnly === 'true') { sql += ' AND undoable = 1'; }

        sql += ' ORDER BY timestamp DESC';
        sql += ` LIMIT ${Math.min(parseInt(limit) || 300, 1000)}`;
        if (offset) sql += ` OFFSET ${parseInt(offset) || 0}`;

        const [rows] = await pool.query(sql, params);
        const entries = rows.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            section: r.section,
            subsection: r.subsection || undefined,
            actionType: r.action_type,
            label: r.label,
            entityType: r.entity_type || undefined,
            entityId: r.entity_id || undefined,
            entityLabel: r.entity_label || undefined,
            beforeState: r.before_state || undefined,
            afterState: r.after_state || undefined,
            userId: r.user_id || undefined,
            username: r.username || undefined,
            context: r.context || undefined,
            undoable: !!r.undoable,
            undone: !!r.undone,
            undoneAt: r.undone_at || undefined,
            undoneBy: r.undone_by || undefined,
            undoAction: r.undo_action || undefined,
            redoAction: r.redo_action || undefined,
            meta: r.meta || undefined
        }));
        res.json(entries);
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Get error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/wo-action-history', async (req, res) => {
    const { section, subsection, actionType, label, entityType, entityId, entityLabel,
            beforeState, afterState, userId, username, context, undoable, undoAction, redoAction, meta } = req.body;
    if (!section || !actionType || !label) {
        return res.status(400).json({ error: 'section, actionType et label sont requis' });
    }
    try {
        const [countRows] = await pool.query('SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) AS maxNum FROM wo_action_history');
        const nextNum = ((Number(countRows[0].maxNum) || 0) + 1).toString().padStart(3, '0');
        const id = `wah-${nextNum}`;
        const now = new Date();

        await pool.query(
            `INSERT INTO wo_action_history
             (id, timestamp, section, subsection, action_type, label, entity_type, entity_id, entity_label,
              before_state, after_state, user_id, username, context, undoable, undone, undo_action, redo_action, meta)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
            [id, now, section, subsection || '', actionType, label,
             entityType || '', entityId || '', entityLabel || '',
             beforeState ? JSON.stringify(beforeState) : null,
             afterState  ? JSON.stringify(afterState)  : null,
             userId || null, username || '',
             context ? JSON.stringify(context) : null,
             undoable ? 1 : 0,
             undoAction ? JSON.stringify(undoAction) : null,
             redoAction ? JSON.stringify(redoAction) : null,
             meta ? JSON.stringify(meta) : null]
        );

        const entry = {
            id, timestamp: now.toISOString(), section, subsection, actionType, label,
            entityType, entityId, entityLabel, beforeState, afterState,
            userId, username, context, undoable: !!undoable, undone: false, undoAction, redoAction, meta
        };
        console.log(`[WO_ACTION_HISTORY] Tracked: ${id} — ${label} (${section})`);
        const projetId = context?.projectId;
        if (projetId) broadcastToProject(projetId, 'history', entry);
        res.json(entry);
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Helper interne : insère une entrée de tracking dans wo_action_history
async function insertWoActionEntry(payload) {
    const [countRows] = await pool.query('SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) AS maxNum FROM wo_action_history');
    const nextNum = ((Number(countRows[0].maxNum) || 0) + 1).toString().padStart(3, '0');
    const id = `wah-${nextNum}`;
    const now = new Date();
    await pool.query(
        `INSERT INTO wo_action_history
         (id, timestamp, section, subsection, action_type, label, entity_type, entity_id, entity_label,
          before_state, after_state, user_id, username, context, undoable, undone, undo_action, redo_action, meta)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
        [id, now, payload.section, payload.subsection || '', payload.actionType, payload.label,
         payload.entityType || '', payload.entityId || '', payload.entityLabel || '',
         payload.beforeState ? JSON.stringify(payload.beforeState) : null,
         payload.afterState  ? JSON.stringify(payload.afterState)  : null,
         payload.userId || null, payload.username || '',
         payload.context ? JSON.stringify(payload.context) : null,
         payload.undoable ? 1 : 0,
         payload.undoAction ? JSON.stringify(payload.undoAction) : null,
         payload.redoAction ? JSON.stringify(payload.redoAction) : null,
         payload.meta ? JSON.stringify(payload.meta) : null]
    );

    // Diffuser l'entrée aux clients du projet (sinon les actions undo/redo/cascade
    // n'apparaissent pas dans l'historique en temps réel)
    const entry = {
        id, timestamp: now.toISOString(),
        section: payload.section, subsection: payload.subsection, actionType: payload.actionType,
        label: payload.label, entityType: payload.entityType, entityId: payload.entityId,
        entityLabel: payload.entityLabel, beforeState: payload.beforeState, afterState: payload.afterState,
        userId: payload.userId, username: payload.username, context: payload.context,
        undoable: !!payload.undoable, undone: false,
        undoAction: payload.undoAction, redoAction: payload.redoAction, meta: payload.meta
    };
    const projetId = payload.context?.projectId;
    if (projetId) {
        try { broadcastToProject(projetId, 'history', entry); } catch (_) {}
    }
    return { id, timestamp: now };
}

app.post('/api/wo-action-history/:id/undo', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM wo_action_history WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Action introuvable' });

        const entry = rows[0];
        if (!entry.undoable)  return res.status(400).json({ error: "Cette action n'est pas réversible" });
        if (entry.undone)     return res.status(400).json({ error: 'Cette action a déjà été annulée' });

        const undoAction = typeof entry.undo_action === 'string'
            ? JSON.parse(entry.undo_action)
            : entry.undo_action;

        if (!undoAction?.endpoint || !undoAction?.method) {
            return res.status(400).json({ error: "Aucune action d'annulation définie" });
        }

        // Lire le contenu actuel du fichier AVANT d'exécuter l'undo
        // → capturé comme afterState du tracking, peu importe la profondeur de la chaîne
        let currentFileContent = null;
        if (undoAction.endpoint?.includes('/api/file-projects/') && undoAction.payload?.content != null) {
            try {
                const parts = undoAction.endpoint.split('/');
                const projectNameForRead = parts[3];
                const fileIdForRead = parts[5];
                const configForRead = await getProjectConfig(projectNameForRead);
                const itemForRead = configForRead ? findNodeById(configForRead.structure, fileIdForRead) : null;
                if (itemForRead?.path) {
                    const fullPath = safeProjectPath(projectNameForRead, itemForRead.path);
                    if (fullPath && fs.existsSync(fullPath)) {
                        currentFileContent = fs.readFileSync(fullPath, 'utf8');
                    }
                }
            } catch (e) {
                console.warn('[WO_ACTION_HISTORY] Could not read current file before undo:', e.message);
            }
        }

        const port = process.env.PORT || 3001;
        const selfUrl = `http://localhost:${port}${undoAction.endpoint}`;
        const fetchOptions = {
            method: undoAction.method,
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Call': '1',
                ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
            }
        };
        if (undoAction.payload && ['PUT', 'POST', 'PATCH'].includes(undoAction.method)) {
            fetchOptions.body = JSON.stringify(undoAction.payload);
        }

        const undoRes = await fetch(selfUrl, fetchOptions);
        if (!undoRes.ok && undoRes.status !== 404) {
            const errData = await undoRes.json().catch(() => ({}));
            return res.status(undoRes.status).json({ error: errData.error || "Erreur lors de l'annulation" });
        }

        const undoneAt = new Date();
        const undoneBy = req.body?.undoneBy || '';
        await pool.query(
            'UPDATE wo_action_history SET undone = 1, undone_at = ?, undone_by = ? WHERE id = ?',
            [undoneAt, undoneBy, req.params.id]
        );

        console.log(`[WO_ACTION_HISTORY] Undo: ${req.params.id} — ${entry.label} by ${undoneBy}`);

        // Contenu restauré renvoyé au client + broadcast SSE pour les autres collaborateurs
        let restored = null;
        if (undoAction.endpoint?.includes('/api/file-projects/') && undoAction.payload?.content != null) {
            const parts = undoAction.endpoint.split('/');
            const projectName = parts[3];
            const nodeId = parts[5];
            restored = { nodeId, folderId: undoAction.payload.folderId || null, content: undoAction.payload.content };
            try {
                const sessionUser = getSessionUser(req);
                broadcastToProject(projectName, 'file_restored', {
                    ...restored,
                    updatedBy: sessionUser?.id || '',
                    updatedByName: undoneBy || sessionUser?.username || 'Système',
                    timestamp: undoneAt.toISOString()
                });
            } catch (broadcastErr) {
                console.warn('[WO_ACTION_HISTORY] broadcast after undo failed:', broadcastErr.message);
            }
        }

        // Diffuser l'état "annulé" pour que tous les clients grisent l'entrée (vérité serveur)
        const entryContext = typeof entry.context === 'string' ? JSON.parse(entry.context || '{}') : (entry.context || {});
        if (entryContext.projectId) {
            try { broadcastToProject(entryContext.projectId, 'entries_undone', { ids: [req.params.id] }); } catch (_) {}
        }

        // Tracking de l'annulation comme nouvelle action (sauf si appel interne en cascade)
        let trackedEntry = null;
        if (req.headers['x-internal-call'] !== '1') {
            try {
                const sessionUser = getSessionUser(req);
                // afterState = contenu qui était dans le fichier AVANT cet undo (lu depuis le disque)
                // → permet de construire un reapplyAction valide peu importe la profondeur de la chaîne
                const afterStateForTracking = currentFileContent != null ? { content: currentFileContent } : null;
                const beforeStateForTracking = undoAction.payload?.content != null ? { content: undoAction.payload.content } : null;
                const reapplyAction = (afterStateForTracking != null && undoAction?.endpoint)
                    ? { endpoint: undoAction.endpoint, method: undoAction.method, payload: { content: afterStateForTracking.content } }
                    : null;

                trackedEntry = await insertWoActionEntry({
                    section: entry.section,
                    subsection: entry.subsection,
                    actionType: 'undo',
                    label: `Annulation : ${entry.label}`,
                    entityType: entry.entity_type,
                    entityId: entry.entity_id,
                    entityLabel: entry.entity_label,
                    userId: sessionUser?.id || null,
                    username: undoneBy || sessionUser?.username || '',
                    context: typeof entry.context === 'string' ? JSON.parse(entry.context) : (entry.context || {}),
                    beforeState: beforeStateForTracking,
                    afterState: afterStateForTracking,
                    undoable: reapplyAction != null,
                    undoAction: reapplyAction
                });
            } catch (trackErr) {
                console.warn('[WO_ACTION_HISTORY] Failed to track undo as new action:', trackErr.message);
            }
        }

        res.json({ success: true, undoneAt: undoneAt.toISOString(), undoneBy, trackedActionId: trackedEntry?.id, restored });
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Undo error:', e);
        res.status(500).json({ error: "Erreur lors de l'annulation" });
    }
});

app.post('/api/wo-action-history/:id/redo', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM wo_action_history WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Action introuvable' });

        const entry = rows[0];
        if (!entry.undone) return res.status(400).json({ error: "Cette action n'a pas été annulée" });

        const redoAction = typeof entry.redo_action === 'string'
            ? JSON.parse(entry.redo_action)
            : entry.redo_action;

        if (!redoAction?.endpoint || !redoAction?.method) {
            return res.status(400).json({ error: "Aucune action de rétablissement définie" });
        }

        const port = process.env.PORT || 3001;
        const selfUrl = `http://localhost:${port}${redoAction.endpoint}`;
        const fetchOptions = {
            method: redoAction.method,
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Call': '1',
                ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
            }
        };
        if (redoAction.payload && ['PUT', 'POST', 'PATCH'].includes(redoAction.method)) {
            fetchOptions.body = JSON.stringify(redoAction.payload);
        }

        const redoRes = await fetch(selfUrl, fetchOptions);
        if (!redoRes.ok && redoRes.status !== 404) {
            const errData = await redoRes.json().catch(() => ({}));
            return res.status(redoRes.status).json({ error: errData.error || "Erreur lors du rétablissement" });
        }

        const redoneBy = req.body?.redoneBy || '';
        await pool.query(
            'UPDATE wo_action_history SET undone = 0, undone_at = NULL, undone_by = ? WHERE id = ?',
            [redoneBy, req.params.id]
        );

        console.log(`[WO_ACTION_HISTORY] Redo: ${req.params.id} — ${entry.label}`);

        // Tracking du rétablissement comme nouvelle action (sauf si appel interne en cascade)
        let trackedEntry = null;
        if (req.headers['x-internal-call'] !== '1') {
            try {
                const sessionUser = getSessionUser(req);
                trackedEntry = await insertWoActionEntry({
                    section: entry.section,
                    subsection: entry.subsection,
                    actionType: 'redo',
                    label: `Rétablissement : ${entry.label}`,
                    entityType: 'history-entry',
                    entityId: entry.id,
                    entityLabel: entry.label,
                    userId: sessionUser?.id || null,
                    username: redoneBy || sessionUser?.username || '',
                    context: { originalSection: entry.section, originalActionType: entry.action_type },
                    undoable: true,
                    undoAction: { endpoint: `/api/wo-action-history/${entry.id}/undo`, method: 'POST' },
                    redoAction: { endpoint: `/api/wo-action-history/${entry.id}/redo`, method: 'POST' }
                });
            } catch (trackErr) {
                console.warn('[WO_ACTION_HISTORY] Failed to track redo as new action:', trackErr.message);
            }
        }

        res.json({ success: true, trackedActionId: trackedEntry?.id });
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Redo error:', e);
        res.status(500).json({ error: "Erreur lors du rétablissement" });
    }
});

app.post('/api/wo-action-history/:id/undo-cascade', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM wo_action_history WHERE id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Action introuvable' });

        const target = rows[0];
        if (!target.undoable) return res.status(400).json({ error: "Cette action n'est pas réversible" });

        // Toutes les entrées undoable, non annulées, même entity_id, >= timestamp cible (LIFO)
        const [candidates] = await pool.query(
            `SELECT * FROM wo_action_history
             WHERE entity_id = ? AND undoable = 1 AND undone = 0
               AND timestamp >= ?
             ORDER BY timestamp DESC`,
            [target.entity_id, target.timestamp]
        );

        if (candidates.length === 0) {
            return res.status(400).json({ error: 'Aucune modification à annuler pour cette entité' });
        }

        const port = process.env.PORT || 3001;
        const undoneAt = new Date();
        const undoneBy = req.body?.undoneBy || '';
        const undoneIds = [];
        const errors = [];

        for (const entry of candidates) {
            const undoAction = typeof entry.undo_action === 'string'
                ? JSON.parse(entry.undo_action)
                : entry.undo_action;
            if (!undoAction?.endpoint || !undoAction?.method) continue;

            try {
                const selfUrl = `http://localhost:${port}${undoAction.endpoint}`;
                const fetchOptions = {
                    method: undoAction.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Internal-Call': '1',
                        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                        ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
                    }
                };
                if (undoAction.payload && ['PUT', 'POST', 'PATCH'].includes(undoAction.method)) {
                    fetchOptions.body = JSON.stringify(undoAction.payload);
                }
                const undoRes = await fetch(selfUrl, fetchOptions);
                if (undoRes.ok || undoRes.status === 404) {
                    await pool.query(
                        'UPDATE wo_action_history SET undone = 1, undone_at = ?, undone_by = ? WHERE id = ?',
                        [undoneAt, undoneBy, entry.id]
                    );
                    undoneIds.push(entry.id);
                } else {
                    errors.push(entry.id);
                }
            } catch (e) {
                errors.push(entry.id);
            }
        }

        if (undoneIds.length === 0) {
            return res.status(500).json({ error: "Impossible d'annuler les modifications" });
        }

        console.log(`[WO_ACTION_HISTORY] Undo cascade: ${undoneIds.length} entrées annulées jusqu'à ${req.params.id} by ${undoneBy}`);

        // Contenu restauré (undo_action de la cible = état le plus ancien) + broadcast SSE
        const targetUndoAction = typeof target.undo_action === 'string'
            ? JSON.parse(target.undo_action)
            : target.undo_action;
        let restored = null;
        if (targetUndoAction?.endpoint?.includes('/api/file-projects/') && targetUndoAction.payload?.content != null) {
            const parts = targetUndoAction.endpoint.split('/');
            const projectName = parts[3];
            const nodeId = parts[5];
            restored = { nodeId, folderId: targetUndoAction.payload.folderId || null, content: targetUndoAction.payload.content };
            try {
                const sessionUser = getSessionUser(req);
                broadcastToProject(projectName, 'file_restored', {
                    ...restored,
                    updatedBy: sessionUser?.id || '',
                    updatedByName: undoneBy || sessionUser?.username || 'Système',
                    timestamp: undoneAt.toISOString()
                });
            } catch (broadcastErr) {
                console.warn('[WO_ACTION_HISTORY] broadcast after cascade failed:', broadcastErr.message);
            }
        }

        // Diffuser l'état "annulé" pour toutes les entrées de la cascade (grisage chez tous les clients)
        const targetContext = typeof target.context === 'string' ? JSON.parse(target.context || '{}') : (target.context || {});
        if (targetContext.projectId) {
            try { broadcastToProject(targetContext.projectId, 'entries_undone', { ids: undoneIds }); } catch (_) {}
        }

        // Entrée récapitulative dans l'historique
        const targetDate = new Date(target.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        // Pour "annuler le retour" : réappliquer le contenu le plus récent (afterState du 1er candidat = le plus récent)
        const latestCandidate = candidates[0]; // LIFO : index 0 = plus récent
        const latestAfterState = typeof latestCandidate?.after_state === 'string'
            ? JSON.parse(latestCandidate.after_state)
            : latestCandidate?.after_state;
        const latestUndoAction = typeof latestCandidate?.undo_action === 'string'
            ? JSON.parse(latestCandidate.undo_action)
            : latestCandidate?.undo_action;
        const cascadeReapplyAction = (latestAfterState?.content != null && latestUndoAction?.endpoint)
            ? { endpoint: latestUndoAction.endpoint, method: latestUndoAction.method, payload: { content: latestAfterState.content } }
            : null;

        let trackedEntry = null;
        try {
            const sessionUser = getSessionUser(req);
            trackedEntry = await insertWoActionEntry({
                section: target.section,
                subsection: target.subsection,
                actionType: 'undo',
                label: `Retour à la version du ${targetDate} (${undoneIds.length} modification${undoneIds.length > 1 ? 's' : ''} annulée${undoneIds.length > 1 ? 's' : ''})`,
                entityType: target.entity_type,
                entityId: target.entity_id,
                entityLabel: target.entity_label,
                userId: sessionUser?.id || null,
                username: undoneBy || sessionUser?.username || '',
                context: typeof target.context === 'string' ? JSON.parse(target.context) : (target.context || {}),
                undoable: cascadeReapplyAction != null,
                undoAction: cascadeReapplyAction
            });
        } catch (trackErr) {
            console.warn('[WO_ACTION_HISTORY] Failed to track cascade undo:', trackErr.message);
        }

        res.json({ success: true, undoneIds, errors, trackedActionId: trackedEntry?.id, restored });
    } catch (e) {
        console.error('[WO_ACTION_HISTORY] Undo cascade error:', e);
        res.status(500).json({ error: "Erreur lors de l'annulation en cascade" });
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
        createdAt: r.created_at, updatedAt: r.updated_at,
        iaInstructions: r.ia_instructions || null,
        backupType: r.backup_type || null,
        backupServer: r.backup_server || null,
        backupUsername: r.backup_username || null,
        backupPassword: r.backup_password || null,
        backupPort: r.backup_port || null,
        backupDirectory: r.backup_directory || null,
        backupOwnerType: r.backup_owner_type || null,
        backupRepoName: r.backup_repo_name || null,
        backupVisibility: r.backup_visibility || null
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
        const { title, description, status, iaInstructions, backupType, backupServer, backupUsername, backupPassword, backupPort, backupDirectory, backupOwnerType, backupRepoName, backupVisibility } = req.body;
        const updatedAt = new Date().toISOString();
        const updated = {
            title: title !== undefined ? title.trim() : p.title,
            description: description !== undefined ? description : p.description,
            status: status !== undefined ? status : p.status,
            ia_instructions: iaInstructions !== undefined ? (iaInstructions || null) : p.ia_instructions,
            backup_type: backupType !== undefined ? backupType : p.backup_type,
            backup_server: backupServer !== undefined ? backupServer : p.backup_server,
            backup_username: backupUsername !== undefined ? backupUsername : p.backup_username,
            backup_password: backupPassword !== undefined ? backupPassword : p.backup_password,
            backup_port: backupPort !== undefined ? (backupPort ? parseInt(backupPort) : null) : p.backup_port,
            backup_directory: backupDirectory !== undefined ? backupDirectory : p.backup_directory,
            backup_owner_type: backupOwnerType !== undefined ? backupOwnerType : p.backup_owner_type,
            backup_repo_name: backupRepoName !== undefined ? backupRepoName : p.backup_repo_name,
            backup_visibility: backupVisibility !== undefined ? backupVisibility : p.backup_visibility
        };
        await pool.query(
            `UPDATE frank_projects SET title=?, description=?, status=?, ia_instructions=?, backup_type=?, backup_server=?, backup_username=?, backup_password=?, backup_port=?, backup_directory=?, backup_owner_type=?, backup_repo_name=?, backup_visibility=?, updated_at=? WHERE id=?`,
            [updated.title, updated.description, updated.status, updated.ia_instructions, updated.backup_type, updated.backup_server, updated.backup_username, updated.backup_password, updated.backup_port, updated.backup_directory, updated.backup_owner_type, updated.backup_repo_name, updated.backup_visibility, updatedAt, req.params.id]
        );
        res.json({
            id: req.params.id, title: updated.title, description: updated.description, status: updated.status,
            userId: p.user_id, linkedDocId: p.linked_doc_id || null,
            iaInstructions: updated.ia_instructions || null,
            backupType: updated.backup_type || null, backupServer: updated.backup_server || null,
            backupUsername: updated.backup_username || null, backupPassword: updated.backup_password || null,
            backupPort: updated.backup_port || null, backupDirectory: updated.backup_directory || null,
            backupOwnerType: updated.backup_owner_type || null, backupRepoName: updated.backup_repo_name || null,
            backupVisibility: updated.backup_visibility || null,
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

// POST /api/frank/projects/:id/test-ftp
app.post('/api/frank/projects/:id/test-ftp', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { host, username, password, port, directory } = req.body;
    if (!host || !username || !password) return res.status(400).json({ error: 'host, username et password sont requis' });
    const client = new ftp.Client(10000);
    client.ftp.verbose = false;
    try {
        await client.access({
            host: host.trim(),
            user: username.trim(),
            password: password,
            port: port ? parseInt(port) : 21,
            secure: false
        });
        let dirResult = null;
        if (directory && directory.trim()) {
            try {
                await client.cd(directory.trim());
                const list = await client.list();
                dirResult = { accessible: true, files: list.length };
            } catch (dirErr) {
                dirResult = { accessible: false, error: dirErr.message };
            }
        }
        res.json({ success: true, message: 'Connexion FTP réussie', directory: dirResult });
    } catch (e) {
        res.json({ success: false, message: `Échec de connexion : ${e.message}` });
    } finally {
        client.close();
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

// POST /api/frank/projects/:id/copy — copie complète (DB + steps + fichiers)
app.post('/api/frank/projects/:id/copy', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        // 1. Récupérer le projet source
        const [rows] = await pool.query(
            `SELECT fp.*, u.username AS owner_username FROM frank_projects fp
             LEFT JOIN users u ON fp.user_id = u.id WHERE fp.id = ?`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Projet non trouvé' });
        const src = rows[0];
        if (user.role !== 'admin' && src.user_id !== user.id)
            return res.status(403).json({ error: 'Accès refusé' });

        const newId = crypto.randomUUID();
        const now = new Date().toISOString();
        const newTitle = (req.body.title || `${src.title}_v2`).trim();

        // 2. Copier le projet en BDD
        await pool.query(
            `INSERT INTO frank_projects
             (id, title, description, content, status, user_id, ia_instructions,
              backup_type, backup_server, backup_username, backup_password, backup_port,
              backup_directory, backup_owner_type, backup_repo_name, backup_visibility,
              created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [newId, newTitle, src.description || '', src.content || '', src.status || 'draft',
             user.id, src.ia_instructions || null,
             src.backup_type || null, src.backup_server || null, src.backup_username || null,
             src.backup_password || null, src.backup_port || null, src.backup_directory || null,
             src.backup_owner_type || null, src.backup_repo_name || null, src.backup_visibility || null,
             now, now]
        );

        // 3. Copier les steps
        const [steps] = await pool.query(
            'SELECT * FROM frank_project_steps WHERE project_id = ? ORDER BY step_number',
            [req.params.id]
        );
        for (const step of steps) {
            await pool.query(
                `INSERT INTO frank_project_steps
                 (id, project_id, step_number, content, linked_doc_id, linked_doc_title,
                  result, result_status, user_id, username, notes, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [crypto.randomUUID(), newId, step.step_number, step.content || '',
                 step.linked_doc_id || null, step.linked_doc_title || null,
                 step.result || null, step.result_status || 'pending',
                 step.user_id, step.username, step.notes || null, step.created_at]
            );
        }

        // 4. Copier les fichiers (data/projets/<id>/) sans le dossier .git
        const srcDir = path.join(PROJECTS_DIR, req.params.id);
        const dstDir = path.join(PROJECTS_DIR, newId);
        if (fs.existsSync(srcDir)) {
            fs.cpSync(srcDir, dstDir, {
                recursive: true,
                filter: (src) => !src.replace(/\\/g, '/').includes('/.git')
            });
            // Mettre à jour config.json avec le nouveau nom et timestamps
            const configPath = path.join(dstDir, 'config.json');
            if (fs.existsSync(configPath)) {
                try {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    cfg.projectName = newTitle;
                    cfg.createdAt = now;
                    cfg.updatedAt = now;
                    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
                } catch {}
            }
            // Copier file_project_meta si présent
            try {
                const [metaRows] = await pool.query(
                    'SELECT * FROM file_project_meta WHERE id = ?', [req.params.id]
                );
                if (metaRows[0]) {
                    const m = metaRows[0];
                    await pool.query(
                        `INSERT INTO file_project_meta
                         (id, display_name, git_remote_url, structure, owner_user_id, created_at, updated_at)
                         VALUES (?,?,?,?,?,?,?)`,
                        [newId, newTitle, null,
                         typeof m.structure === 'string' ? m.structure : JSON.stringify(m.structure || []),
                         user.id, now, now]
                    );
                }
            } catch {}
        }

        // 5. Retourner le nouveau projet
        const [newRows] = await pool.query(
            `SELECT fp.*, u.username AS owner_username FROM frank_projects fp
             LEFT JOIN users u ON fp.user_id = u.id WHERE fp.id = ?`,
            [newId]
        );
        res.status(201).json(frankRowToObj(newRows[0]));
    } catch (e) {
        console.error('[FRANK] Copy error:', e);
        res.status(500).json({ error: 'Erreur lors de la copie du projet' });
    }
});

if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
}

function slugify(text) {
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
        .replace(/-+/g, '-').trim();
}

function cleanStructure(items) {
    if (!items) return [];
    const seen = new Set();
    const cleaned = [];
    for (const item of items) {
        const key = `${item.type}:${item.name.toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            if (item.children) {
                item.children = cleanStructure(item.children);
            }
            cleaned.push(item);
        }
    }
    return cleaned;
}

function migrateOutils(config) {
    if (config.outils && config.outils.length > 0) return config;
    const rootFolderIds = (config.structure || [])
        .filter(n => n.type === 'folder')
        .map(n => n.id);
    config.outils = [{
        id: require('crypto').randomUUID(),
        type: 'edition',
        name: 'Edition',
        rootFolderIds,
        createdAt: config.createdAt || new Date().toISOString()
    }];
    return config;
}

async function getProjectConfig(projectName) {
    // Lire le config.json local en parallèle (peut être plus riche que MySQL si migration partielle)
    const cfgPath = path.join(PROJECTS_DIR, projectName, 'config.json');
    let localConfig = null;
    if (fs.existsSync(cfgPath)) {
        try {
            localConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            if (localConfig.structure) localConfig.structure = cleanStructure(localConfig.structure);
        } catch {}
    }

    let mysqlRow = null;
    try {
        const [rows] = await pool.query(
            'SELECT display_name, git_remote_url, structure, outils, created_at, updated_at FROM file_project_meta WHERE id = ?',
            [projectName]
        );
        if (rows.length > 0) mysqlRow = rows[0];
    } catch (e) {
        console.warn('[getProjectConfig] MySQL error, fallback filesystem:', e.message);
    }

    if (mysqlRow) {
        const mysqlStructure = cleanStructure(
            typeof mysqlRow.structure === 'string' ? JSON.parse(mysqlRow.structure) : (mysqlRow.structure || [])
        );
        const mysqlOutils = mysqlRow.outils
            ? (typeof mysqlRow.outils === 'string' ? JSON.parse(mysqlRow.outils) : mysqlRow.outils)
            : null;
        const localStructure = localConfig?.structure || [];
        // Préférer le filesystem si : MySQL vide, ou config.json plus récent (ex: après migration de chemins)
        const localUpdatedAt = localConfig?.updatedAt ? new Date(localConfig.updatedAt).getTime() : 0;
        const mysqlUpdatedAt = mysqlRow.updated_at ? new Date(mysqlRow.updated_at).getTime() : 0;
        const preferLocal = (mysqlStructure.length === 0 && localStructure.length > 0) || (localUpdatedAt > mysqlUpdatedAt && localStructure.length > 0);
        if (preferLocal) {
            try {
                await pool.query(
                    'UPDATE file_project_meta SET structure = ?, outils = ?, display_name = ?, updated_at = ? WHERE id = ?',
                    [JSON.stringify(localStructure), JSON.stringify(localConfig?.outils || null), localConfig.projectName || mysqlRow.display_name, new Date(), projectName]
                );
            } catch (e2) { console.warn('[getProjectConfig] MySQL structure update failed:', e2.message); }
            return migrateOutils({ projectName: localConfig.projectName || mysqlRow.display_name, gitRemoteUrl: mysqlRow.git_remote_url || null, createdAt: mysqlRow.created_at, updatedAt: localConfig.updatedAt || mysqlRow.updated_at, structure: localStructure, outils: mysqlOutils || localConfig?.outils || null });
        }
        return migrateOutils({ projectName: mysqlRow.display_name, gitRemoteUrl: mysqlRow.git_remote_url || null, createdAt: mysqlRow.created_at, updatedAt: mysqlRow.updated_at, structure: mysqlStructure, outils: mysqlOutils });
    }

    // Pas d'entrée MySQL → migration depuis le filesystem
    if (!localConfig) return null;
    try {
        await pool.query(
            'INSERT INTO file_project_meta (id, display_name, structure, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE structure = IF(JSON_LENGTH(VALUES(structure)) > JSON_LENGTH(structure), VALUES(structure), structure), display_name = VALUES(display_name), updated_at = VALUES(updated_at)',
            [projectName, localConfig.projectName || projectName, JSON.stringify(localConfig.structure || []), localConfig.createdAt || new Date(), localConfig.updatedAt || new Date()]
        );
    } catch (e2) { console.warn('[getProjectConfig] auto-migration failed:', e2.message); }
    return migrateOutils(localConfig);
}

async function saveProjectConfig(projectName, config) {
    config.updatedAt = new Date().toISOString();
    try {
        await pool.query(
            'UPDATE file_project_meta SET structure = ?, outils = ?, updated_at = ? WHERE id = ?',
            [JSON.stringify(config.structure || []), JSON.stringify(config.outils || null), config.updatedAt, projectName]
        );
    } catch (e) { console.warn('[saveProjectConfig] MySQL write error:', e.message); }
    // Backup filesystem
    const cfgPath = path.join(PROJECTS_DIR, projectName, 'config.json');
    if (fs.existsSync(path.dirname(cfgPath))) {
        try { fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8'); } catch {}
    }
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
        const result = { ...item };
        if (item.type === 'file') {
            if (isImageFile(item.name)) {
                result.content = '';
                result.fileType = 'image';
            } else {
                const full = path.join(PROJECTS_DIR, projectName, item.path);
                result.content = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
                result.fileType = 'text';
            }
            if (item.children) result.children = attachContent(projectName, item.children);
            return result;
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
app.get('/api/file-projects', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query(
            'SELECT id, display_name, git_remote_url, created_at, updated_at FROM file_project_meta ORDER BY updated_at DESC'
        );
        const result = rows.map(r => ({
            name: r.id,
            projectName: r.display_name,
            gitRemoteUrl: r.git_remote_url || null,
            localExists: fs.existsSync(path.join(PROJECTS_DIR, r.id)),
            createdAt: r.created_at,
            updatedAt: r.updated_at
        }));
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// F4 — GET /api/search?q=&projectId= — recherche full-text dans contenu.md et docs additionnels
app.get('/api/search', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const q = (req.query.q || '').toString().trim();
    if (q.length < 2) return res.json({ results: [] });
    const projectFilter = (req.query.projectId || '').toString().trim();
    const MAX_RESULTS = 50;
    const EXCERPT_LEN = 80;
    const results = [];
    try {
        if (!fs.existsSync(PROJECTS_DIR)) return res.json({ results: [] });
        const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && (!projectFilter || d.name === projectFilter));

        const qLower = q.toLowerCase();
        for (const d of projectDirs) {
            if (results.length >= MAX_RESULTS) break;
            const projectName = d.name;
            const cfg = getProjectConfig(projectName);
            if (!cfg || !cfg.structure) continue;
            const displayName = cfg.projectName || projectName;

            const walk = (items, sectionPath, parentSection) => {
                if (results.length >= MAX_RESULTS) return;
                for (const item of items || []) {
                    if (results.length >= MAX_RESULTS) return;
                    if (item.type === 'folder') {
                        const folderPath = item.path ? path.join(PROJECTS_DIR, projectName, item.path) : null;
                        const nextSection = { id: item.id, name: item.name, path: folderPath };
                        const nextPath = [...sectionPath, item.name];
                        walk(item.children || [], nextPath, nextSection);
                    } else if (item.type === 'file' && item.path && !isImageFile(item.name)) {
                        const full = path.join(PROJECTS_DIR, projectName, item.path);
                        if (!fs.existsSync(full)) continue;
                        let content;
                        try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
                        const cLower = content.toLowerCase();
                        const idx = cLower.indexOf(qLower);
                        if (idx === -1) continue;
                        // Comptage occurrences
                        let matchCount = 0; let pos = 0;
                        while ((pos = cLower.indexOf(qLower, pos)) !== -1) { matchCount++; pos += qLower.length; }
                        // Extrait : ~EXCERPT_LEN chars autour de la première occurrence
                        const start = Math.max(0, idx - 40);
                        const end = Math.min(content.length, idx + qLower.length + 40);
                        const rawExcerpt = (start > 0 ? '…' : '') + content.substring(start, end).replace(/\s+/g, ' ').trim() + (end < content.length ? '…' : '');

                        results.push({
                            projectId: projectName,
                            projectName: displayName,
                            sectionId: parentSection?.id || '',
                            sectionName: parentSection?.name || item.name.replace(/\.md$/, ''),
                            sectionPath,
                            fileId: item.id,
                            fileName: item.name,
                            excerpt: rawExcerpt,
                            matchCount
                        });
                    }
                }
            };
            walk(cfg.structure, [], null);
        }
        res.json({ results, total: results.length, truncated: results.length >= MAX_RESULTS });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// F6 — Commentaires inline par section (project_comments)
// ============================================================

// GET /api/project-comments/:projectId?folderId=
app.get('/api/project-comments/:projectId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projectId } = req.params;
    const folderId = (req.query.folderId || '').toString();
    try {
        let rows;
        if (folderId) {
            [rows] = await pool.query(
                'SELECT * FROM project_comments WHERE project_id = ? AND folder_id = ? ORDER BY created_at ASC',
                [projectId, folderId]
            );
        } else {
            [rows] = await pool.query(
                'SELECT * FROM project_comments WHERE project_id = ? ORDER BY created_at ASC',
                [projectId]
            );
        }
        res.json({
            comments: rows.map(r => ({
                id: r.id,
                projectId: r.project_id,
                folderId: r.folder_id,
                userId: r.user_id,
                username: r.username,
                text: r.text,
                createdAt: r.created_at,
                updatedAt: r.updated_at
            }))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/project-comments/:projectId/counts — compteurs par folderId
app.get('/api/project-comments/:projectId/counts', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projectId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT folder_id, COUNT(*) AS cnt FROM project_comments WHERE project_id = ? GROUP BY folder_id',
            [projectId]
        );
        const counts = {};
        for (const r of rows) counts[r.folder_id] = r.cnt;
        res.json({ counts });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/project-comments/:projectId  body: { folderId, text }
app.post('/api/project-comments/:projectId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projectId } = req.params;
    const { folderId, text } = req.body || {};
    if (!folderId || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'folderId et text requis' });
    }
    if (text.length > 5000) return res.status(400).json({ error: 'Commentaire trop long (max 5000 chars)' });
    try {
        const id = 'comment-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
        await pool.query(
            'INSERT INTO project_comments (id, project_id, folder_id, user_id, username, text) VALUES (?, ?, ?, ?, ?, ?)',
            [id, projectId, folderId, String(user.id), user.username || '', text.trim()]
        );
        const [rows] = await pool.query('SELECT * FROM project_comments WHERE id = ?', [id]);
        const r = rows[0];
        res.json({
            comment: {
                id: r.id, projectId: r.project_id, folderId: r.folder_id,
                userId: r.user_id, username: r.username, text: r.text,
                createdAt: r.created_at, updatedAt: r.updated_at
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/project-comments/:projectId/:commentId
app.delete('/api/project-comments/:projectId/:commentId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projectId, commentId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT user_id FROM project_comments WHERE id = ? AND project_id = ?',
            [commentId, projectId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Commentaire introuvable' });
        const isOwner = String(rows[0].user_id) === String(user.id);
        const isAdmin = user.role === 'admin';
        if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Action non autorisée' });
        await pool.query('DELETE FROM project_comments WHERE id = ?', [commentId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Helper : configure le remote GitHub pour un projet (idempotent).
 * - Crée le repo GitHub si absent
 * - Configure le remote 'origin' avec une URL authentifiée
 * - Push main vers le remote
 * Retourne un résumé du résultat sans exposer le token.
 */
async function setupGithubRemoteForProject(projectDir, dirName, projectName) {
    if (!githubService.isEnabled()) return { enabled: false };
    try {
        const repoName = githubService.buildRepoName(dirName, projectName);
        const created = await githubService.createRepo(repoName, {
            description: `Worganic project: ${projectName}`
        });
        if (!created.success) {
            console.warn('[GitHub] createRepo failed:', created.error);
            return { enabled: true, success: false, error: created.error };
        }
        const authUrl = githubService.buildAuthenticatedCloneUrl(repoName);
        const remote = projetGit.setRemote(projectDir, authUrl);
        if (!remote.success) {
            return { enabled: true, success: false, error: remote.error };
        }
        const pushed = projetGit.pushMain(projectDir);
        return {
            enabled: true,
            success: pushed.success,
            repoName,
            publicUrl: githubService.buildPublicRepoUrl(repoName),
            alreadyExisted: !!created.alreadyExists,
            pushed: pushed.success,
            pushError: pushed.success ? null : pushed.error
        };
    } catch (e) {
        console.warn('[GitHub] setupGithubRemoteForProject error:', e.message);
        return { enabled: true, success: false, error: e.message };
    }
}

/**
 * Garantit qu'un projet a un remote GitHub configuré (lazy setup pour les projets
 * créés avant l'activation de GitHub). Si GitHub est activé mais que le repo local
 * n'a pas de remote, crée le repo GitHub et configure l'URL authentifiée.
 * Rafraîchit l'URL si le remote existe déjà (au cas où le token a tourné).
 */
async function ensureGithubRemoteForProject(projectName, config) {
    if (!githubService.isEnabled()) return { enabled: false };
    const projetPath = path.join(PROJECTS_DIR, projectName);
    if (!projetGit.isRepo(projetPath)) return { isRepo: false };
    const displayName = config?.projectName || projectName;
    if (!projetGit.hasRemote(projetPath)) {
        console.log(`[ensureGithubRemote] no remote for ${projectName}, setting up`);
        const setup = await setupGithubRemoteForProject(projetPath, projectName, displayName);
        if (setup?.publicUrl) {
            try {
                await pool.query('UPDATE file_project_meta SET git_remote_url = ? WHERE id = ?', [setup.publicUrl, projectName]);
            } catch (e) { console.warn('[ensureGithubRemote] DB update failed:', e.message); }
        }
        return setup;
    }
    try {
        const freshUrl = githubService.buildAuthenticatedCloneUrl(
            githubService.buildRepoName(projectName, displayName)
        );
        if (freshUrl) projetGit.setRemote(projetPath, freshUrl);
        return { refreshed: true };
    } catch (e) {
        console.warn('[ensureGithubRemote] refresh failed:', e.message);
        return { error: e.message };
    }
}

// POST /api/projects
app.post('/api/file-projects', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projectName, folderName } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Nom requis' });
    const dir = folderName || slugify(projectName);
    if (!dir) return res.status(400).json({ error: 'Nom invalide' });
    // Vérifier en MySQL ET en filesystem
    try {
        const [existing] = await pool.query('SELECT id FROM file_project_meta WHERE id = ?', [dir]);
        if (existing.length > 0) return res.status(409).json({ error: 'Projet déjà existant' });
    } catch {}
    const projectDir = path.join(PROJECTS_DIR, dir);
    if (fs.existsSync(projectDir)) return res.status(409).json({ error: 'Projet déjà existant' });
    try {
        const now = new Date().toISOString();
        const config = { projectName, createdAt: now, updatedAt: now, structure: [] };
        // Insérer en MySQL en premier (source de vérité)
        await pool.query(
            'INSERT INTO file_project_meta (id, display_name, structure, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [dir, projectName, JSON.stringify([]), user.id || null, now, now]
        );
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'config.json'), JSON.stringify(config, null, 2));
        // Git : init local + (si activé) création repo GitHub + push initial
        let github = null;
        let gitRemoteUrl = null;
        try {
            projetGit.initProjetRepo(projectDir, {
                authorName: user.username || user.email || 'Worganic',
                authorEmail: user.email || 'worganic@local'
            });
            github = await setupGithubRemoteForProject(projectDir, dir, projectName);
            if (github?.success && github?.publicUrl) {
                gitRemoteUrl = github.publicUrl;
                await pool.query('UPDATE file_project_meta SET git_remote_url = ? WHERE id = ?', [gitRemoteUrl, dir]);
            }
        } catch (gitErr) {
            console.warn('[ProjetGit] init/github au create-project échoué:', gitErr.message);
        }
        res.status(201).json({ name: dir, ...config, gitRemoteUrl, github });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/projects/:name
app.get('/api/file-projects/:name', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    res.json(config);
});

// DELETE /api/projects/:name
app.delete('/api/file-projects/:name', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const projectDir = path.join(PROJECTS_DIR, req.params.name);
        if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
        await pool.query('DELETE FROM file_project_meta WHERE id = ?', [req.params.name]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/projects/:name/files
app.get('/api/file-projects/:name/files', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        const localExists = fs.existsSync(path.join(PROJECTS_DIR, req.params.name));
        const files = localExists ? attachContent(req.params.name, config.structure || []) : (config.structure || []);
        res.json({ success: true, project: config.projectName, gitRemoteUrl: config.gitRemoteUrl || null, localExists, files });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/projects/:name/files
app.post('/api/file-projects/:name/files', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { name, parentId, content, outilSlug } = req.body;
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
        } else if (outilSlug && /^[a-z0-9-]+$/.test(outilSlug)) {
            const outilDir = safeProjectPath(req.params.name, outilSlug);
            if (outilDir) fs.mkdirSync(outilDir, { recursive: true });
            filePath = `${outilSlug}/${fileName}`;
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

        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `create_file ${fileName}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit create_file:', gitErr.message); }
        res.status(201).json({ ...newFile, content: content || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/projects/:name/files/:id
app.put('/api/file-projects/:name/files/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'file') return res.status(404).json({ error: 'Fichier non trouvé' });

    // Vérification du lock : si la section est verrouillée par un autre user → 423
    try {
        const lockNodeIds = [req.params.id];
        if (req.body.folderId) lockNodeIds.push(req.body.folderId);
        const placeholders = lockNodeIds.map(() => '?').join(',');
        const [locks] = await pool.query(
            `SELECT * FROM projet_section_lock WHERE node_id IN (${placeholders}) AND projet_id = ?`,
            [...lockNodeIds, req.params.name]
        );
        const blockedLock = locks.find(l => l.locked_by_id !== user.id);
        if (blockedLock) {
            return res.status(423).json({
                error: 'Section verrouillée',
                lockedBy: blockedLock.locked_by_name,
                lockedAt: blockedLock.locked_at
            });
        }
    } catch (e) {
        console.error('[LOCK] check error on file update:', e.message);
        // Fail open : on laisse passer en cas d'erreur DB
    }

    try {
        const full = safeProjectPath(req.params.name, item.path);
        if (!full) return res.status(400).json({ error: 'Chemin invalide' });
        fs.mkdirSync(path.dirname(full), { recursive: true });
        const content = req.body.content ?? '';
        const folderId = req.body.folderId || null;
        const publish = req.body.publish === true;
        fs.writeFileSync(full, content, 'utf8');
        await saveProjectConfig(req.params.name, config);

        // Git ou FTP : commit / upload selon le backend du projet
        const projetPath = path.join(PROJECTS_DIR, req.params.name);
        const gitNodeId = folderId || req.params.id;
        let publishCommitHash = null;
        let publishResult = null;
        let ftpPublishResult = null;

        // Vérifier le backend de stockage
        let backupType = null;
        try {
            backupType = await ftpService.getBackupType(pool, req.params.name);
        } catch (e) {
            console.warn('[file PUT] backup_type lookup error:', e.message);
        }

        if (backupType === 'ftp') {
            // Backend FTP : upload uniquement du fichier modifié
            if (publish) {
                try {
                    const ftpConfig = await ftpService.getFtpConfig(pool, req.params.name);
                    if (ftpConfig) {
                        const localPath = path.join(PROJECTS_DIR, req.params.name, item.path);
                        const fileList = fs.existsSync(localPath)
                            ? [{ localPath, remotePath: `projets/${req.params.name}/${item.path}` }]
                            : [];
                        if (fileList.length > 0) {
                            ftpPublishResult = await ftpService.uploadFiles(ftpConfig, fileList);
                            if (ftpPublishResult.errors?.length) {
                                console.warn('[FTP] upload partial errors:', ftpPublishResult.errors);
                            }
                        }
                    }
                } catch (ftpErr) {
                    console.warn('[FTP] upload sur Partager échoué:', ftpErr.message);
                    return res.status(502).json({
                        error: 'Modifications sauvegardées localement mais non synchronisées avec le serveur FTP',
                        localSaved: true,
                        pushFailed: true
                    });
                }
            }
        } else {
            // Backend Git (GitHub par défaut)
            try {
                if (projetGit.isRepo(projetPath)) {
                    if (publish) {
                        // Garantir le remote GitHub : crée le repo + remote si manquant
                        // (cas projet créé avant activation GitHub), rafraîchit l'URL sinon.
                        await ensureGithubRemoteForProject(req.params.name, config);
                        // Commit du contenu final puis merge wip → main
                        publishResult = projetGit.publishWip(projetPath, user.id, gitNodeId, {
                            username: user.username || user.email || 'user',
                            sectionName: item.name || req.params.id,
                            filePath: item.path
                        });
                        publishCommitHash = publishResult?.commitHash || null;
                    } else {
                        // Auto-save : commit silencieux sur la branche wip
                        projetGit.commitFile(projetPath, item.path, `wip: auto-save ${item.name || req.params.id}`);
                    }
                }
            } catch (gitErr) {
                console.warn('[ProjetGit] commit sur file PUT échoué:', gitErr.message);
            }
        }

        // Broadcast SSE seulement si publication explicite
        // (même si push GitHub échoué — le contenu est sauvé localement et visible aux co-éditeurs)
        if (publish) {
            broadcastToProject(req.params.name, 'content_update', {
                nodeId: req.params.id,
                folderId,
                content,
                updatedBy: user.id,
                updatedByName: user.username || user.email || 'Utilisateur',
                timestamp: new Date().toISOString()
            });
            // Nouvel événement métier : signale aux autres users qu'une section a été partagée
            broadcastToProject(req.params.name, 'section_published', {
                nodeId: req.params.id,
                folderId,
                sectionName: item.name || req.params.id,
                publishedBy: {
                    userId: user.id,
                    username: user.username || user.email || 'Utilisateur'
                },
                commitHash: publishCommitHash,
                timestamp: new Date().toISOString()
            });
            // Libérer le lock automatiquement au moment de la publication
            const unlockId = folderId || req.params.id;
            try {
                await pool.query('DELETE FROM projet_section_lock WHERE node_id = ? AND projet_id = ?', [unlockId, req.params.name]);
                broadcastToProject(req.params.name, 'unlock', { nodeId: unlockId, projetId: req.params.name });
            } catch (e2) {
                console.error('[LOCK] unlock on publish error:', e2.message);
            }
        }

        // Push GitHub échoué → HTTP 502 pour bloquer le toast succès côté client
        // (la sauvegarde locale et le broadcast SSE ont eu lieu normalement)
        if (publish && backupType !== 'ftp' && publishResult?.pushFailed) {
            return res.status(502).json({
                error: 'Modifications sauvegardées localement mais non synchronisées avec GitHub',
                localSaved: true,
                pushFailed: true,
                commitHash: publishCommitHash
            });
        }

        res.json({ success: true, commitHash: publishCommitHash, ftpUploaded: ftpPublishResult?.uploaded ?? null });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/projects/:name/files/:id (rename)
app.patch('/api/file-projects/:name/files/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
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
        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `rename_file ${newName}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit rename_file:', gitErr.message); }
        broadcastToProject(req.params.name, 'structure_update', { operation: 'rename_file', payload: item, updatedBy: user.id });
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/projects/:name/files/:id
app.delete('/api/file-projects/:name/files/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'file') return res.status(404).json({ error: 'Fichier non trouvé' });
    try {
        const full = safeProjectPath(req.params.name, item.path);
        if (full && fs.existsSync(full)) fs.unlinkSync(full);
        const deletedName = item.name;
        removeNodeById(config.structure, req.params.id);
        await saveProjectConfig(req.params.name, config);
        try {
            if ((await ftpService.getBackupType(pool, req.params.name).catch(() => null)) !== 'ftp') {
                await ensureGithubRemoteForProject(req.params.name, config);
            }
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `delete_file ${deletedName}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit delete_file:', gitErr.message); }
        broadcastToProject(req.params.name, 'structure_update', { operation: 'delete_file', payload: { id: req.params.id }, updatedBy: user.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/projects/:name/folders
app.post('/api/file-projects/:name/folders', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { name, parentId, outilSlug } = req.body;
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
        } else if (outilSlug && /^[a-z0-9-]+$/.test(outilSlug)) {
            const outilDir = safeProjectPath(req.params.name, outilSlug);
            if (outilDir) fs.mkdirSync(outilDir, { recursive: true });
            folderPath = `${outilSlug}/${slug}`;
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

        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `create_folder ${name}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit create_folder:', gitErr.message); }
        broadcastToProject(req.params.name, 'structure_update', { operation: 'create_folder', payload: { ...newFolder, parentId: parentId || null }, updatedBy: user.id });
        res.status(201).json(newFolder);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/projects/:name/folders/:id (rename)
app.patch('/api/file-projects/:name/folders/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
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
        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `rename_folder ${name}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit rename_folder:', gitErr.message); }
        broadcastToProject(req.params.name, 'structure_update', { operation: 'rename_folder', payload: { id: req.params.id, name, oldPath, newPath }, updatedBy: user.id });
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/projects/:name/folders/:id
app.delete('/api/file-projects/:name/folders/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const item = findNodeById(config.structure, req.params.id);
    if (!item || item.type !== 'folder') return res.status(404).json({ error: 'Dossier non trouvé' });
    try {
        const full = safeProjectPath(req.params.name, item.path);
        if (full && fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
        const deletedName = item.name;
        removeNodeById(config.structure, req.params.id);
        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `delete_folder ${deletedName}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit delete_folder:', gitErr.message); }
        broadcastToProject(req.params.name, 'structure_update', { operation: 'delete_folder', payload: { id: req.params.id }, updatedBy: user.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/projects/:name/structure
app.put('/api/file-projects/:name/structure', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        config.structure = req.body.structure;
        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), 'reorder');
        } catch (gitErr) { console.warn('[ProjetGit] commit reorder:', gitErr.message); }
        broadcastToProject(req.params.name, 'structure_update', { operation: 'reorder', payload: { structure: req.body.structure }, updatedBy: user.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/projects/:name/move-file
app.post('/api/file-projects/:name/move-file', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
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
        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `move_file ${item.name}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit move_file:', gitErr.message); }
        res.json({ success: true, item });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/file-projects/:name/upload-image
app.post('/api/file-projects/:name/upload-image', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
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
        let parentPath = '';
        if (parentId) {
            const parent = findNodeById(config.structure, parentId);
            if (!parent || parent.type !== 'folder') return res.status(400).json({ error: 'Dossier parent invalide' });
            parentPath = parent.path;
            parentItems = parent.children = parent.children || [];
        }
        // Générer un nom unique si un fichier du même nom existe déjà dans ce dossier
        const dotIdx = safeName.lastIndexOf('.');
        const baseName = dotIdx !== -1 ? safeName.substring(0, dotIdx) : safeName;
        const extPart = dotIdx !== -1 ? safeName.substring(dotIdx) : '';
        let uniqueName = safeName;
        let counter = 1;
        while (parentItems.some(n => n.type === 'file' && n.name.toLowerCase() === uniqueName.toLowerCase())) {
            uniqueName = `${baseName}-${counter}${extPart}`;
            counter++;
        }
        const filePath = parentPath ? `${parentPath}/${uniqueName}` : uniqueName;
        const fullPath = safeProjectPath(req.params.name, filePath);
        if (!fullPath) return res.status(400).json({ error: 'Chemin invalide' });
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, buffer);
        const maxOrder = parentItems.filter(n => n.type === 'file').reduce((m, n) => Math.max(m, n.order || 0), 0);
        const newNode = { id: require('crypto').randomUUID(), type: 'file', name: uniqueName, path: filePath, order: maxOrder + 1, fileType: 'image' };
        parentItems.push(newNode);
        await saveProjectConfig(req.params.name, config);
        try {
            if ((await ftpService.getBackupType(pool, req.params.name).catch(() => null)) !== 'ftp') {
                await ensureGithubRemoteForProject(req.params.name, config);
            }
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `upload_image ${uniqueName}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit upload_image:', gitErr.message); }
        // Notifier les autres users connectés pour déclencher leur auto-pull
        broadcastToProject(req.params.name, 'structure_update', { operation: 'upload_image', payload: newNode, updatedBy: user.id });
        res.status(201).json(newNode);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/file-projects/:name/move-folder
app.post('/api/file-projects/:name/move-folder', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
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

        await saveProjectConfig(req.params.name, config);
        try {
            projetGit.commitOnMain(path.join(PROJECTS_DIR, req.params.name), `move_folder ${folder.name}`);
        } catch (gitErr) { console.warn('[ProjetGit] commit move_folder:', gitErr.message); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// Outils par projet (Edition, Tests, Code…)
// ============================================================

// GET /api/file-projects/:name/outils
app.get('/api/file-projects/:name/outils', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    // Persister la migration si outils vient d'être créé (pas encore en BDD/fichier)
    if (config.outils && config.outils.length > 0) {
        await saveProjectConfig(req.params.name, config).catch(() => {});
    }
    res.json({ outils: config.outils || [] });
});

// POST /api/file-projects/:name/outils
app.post('/api/file-projects/:name/outils', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const { type = 'edition', name, rootFolderIds = [] } = req.body;
    const newOutil = {
        id: require('crypto').randomUUID(),
        type,
        name: name || 'Edition',
        rootFolderIds,
        createdAt: new Date().toISOString()
    };
    config.outils = [...(config.outils || []), newOutil];
    await saveProjectConfig(req.params.name, config);
    res.status(201).json(newOutil);
});

// PATCH /api/file-projects/:name/outils/:outilId
app.patch('/api/file-projects/:name/outils/:outilId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    const outil = (config.outils || []).find(o => o.id === req.params.outilId);
    if (!outil) return res.status(404).json({ error: 'Outil non trouvé' });
    if (req.body.name !== undefined) outil.name = req.body.name;
    if (req.body.rootFolderIds !== undefined) outil.rootFolderIds = req.body.rootFolderIds;
    await saveProjectConfig(req.params.name, config);
    res.json(outil);
});

// DELETE /api/file-projects/:name/outils/:outilId
app.delete('/api/file-projects/:name/outils/:outilId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });
    config.outils = (config.outils || []).filter(o => o.id !== req.params.outilId);
    await saveProjectConfig(req.params.name, config);
    res.json({ success: true });
});

// ============================================================
// Git par projet : sync, pull, status
// ============================================================

// GET /api/file-projects/:name/sync-status
//   Retourne l'état git du projet : repo existant, commits ahead/behind par rapport au remote
app.get('/api/file-projects/:name/sync-status', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projetPath)) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        const status = projetGit.getSyncStatus(projetPath);
        res.json({ success: true, ...status });
    } catch (e) {
        console.warn('[ProjetGit] sync-status error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/pull
//   Effectue git pull --ff-only sur main. Retourne le nombre de commits récupérés
//   et la liste des fichiers modifiés (utile pour invalider le cache Angular).
app.post('/api/file-projects/:name/pull', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projetPath)) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        const result = projetGit.pullMain(projetPath);
        if (!result.success && !result.skipped) {
            return res.status(409).json({ error: result.error || 'Pull impossible', ...result });
        }
        if (result.success && result.newCommits > 0) {
            // Notifier les autres clients qu'une sync a eu lieu (utile pour multi-onglets)
            broadcastToProject(req.params.name, 'project_synced', {
                pulledBy: { userId: user.id, username: user.username || user.email },
                newCommits: result.newCommits,
                changedFiles: result.changedFiles,
                timestamp: new Date().toISOString()
            });
        }
        res.json({ success: true, ...result });
    } catch (e) {
        console.warn('[ProjetGit] pull error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/open-folder
//   Ouvre l'explorateur Windows sur le dossier local du projet.
app.post('/api/file-projects/:name/open-folder', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projetPath)) return res.status(404).json({ error: 'Dossier non trouvé' });
    try {
        const { exec } = require('child_process');
        const safe = projetPath.replace(/"/g, '\\"');
        exec(`explorer "${safe}"`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/auto-sync
//   Synchronise automatiquement le projet avec GitHub au chargement :
//   pull si remote en avance, push si local en avance, signale la divergence sinon.
//   Pour les projets FTP : pas de sync automatique (le sync se fait au Partager).
app.post('/api/file-projects/:name/auto-sync', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projetPath)) return res.status(404).json({ error: 'Projet non trouvé' });

    // Projets FTP : pas de sync automatique au chargement
    try {
        const backupType = await ftpService.getBackupType(pool, req.params.name);
        if (backupType === 'ftp') {
            return res.json({ success: true, status: 'ftp-no-sync' });
        }
    } catch (e) {
        console.warn('[auto-sync] backup_type lookup error:', e.message);
    }

    if (!projetGit.isRepo(projetPath)) return res.json({ success: true, status: 'no-repo' });
    if (!projetGit.hasRemote(projetPath)) return res.json({ success: true, status: 'no-remote' });
    try {
        const status = projetGit.getSyncStatus(projetPath);
        let action = 'in-sync';
        let opResult = null;
        if (!status.fetchOk) {
            return res.json({ success: false, status: 'fetch-failed', ...status });
        }
        if (status.behind > 0 && status.ahead === 0) {
            opResult = projetGit.pullMain(projetPath);
            action = opResult.success ? 'pulled' : 'pull-failed';
        } else if (status.ahead > 0 && status.behind === 0) {
            opResult = projetGit.pushMain(projetPath);
            action = opResult.success ? 'pushed' : 'push-failed';
        } else if (status.ahead > 0 && status.behind > 0) {
            action = 'diverged';
        }
        if (opResult && !opResult.success && !opResult.skipped) {
            return res.status(409).json({ error: opResult.error || 'Synchronisation impossible', status: action, ...status });
        }
        res.json({ success: true, status: action, ahead: status.ahead, behind: status.behind, ...(opResult || {}) });
    } catch (e) {
        console.warn('[AutoSync] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/github/reachable
//   Vérifie si github.com est accessible depuis le serveur.
//   Utilisé par le frontend pour afficher un indicateur de connectivité par projet.
app.get('/api/github/reachable', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    if (!githubService.isEnabled()) return res.json({ reachable: false, reason: 'not-configured' });
    try {
        const https = require('https');
        await new Promise((resolve, reject) => {
            const r = https.request({ hostname: 'github.com', method: 'HEAD', path: '/', timeout: 5000 }, resolve);
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
            r.end();
        });
        res.json({ reachable: true });
    } catch (e) {
        res.json({ reachable: false, error: e.message });
    }
});

// POST /api/file-projects/:name/setup-remote
//   Crée le repo GitHub pour un projet existant et configure son remote.
//   Idempotent : peut être rejoué sans casser un projet déjà câblé.
app.post('/api/file-projects/:name/setup-remote', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projetPath)) return res.status(404).json({ error: 'Projet non trouvé' });
    if (!githubService.isEnabled()) {
        return res.status(503).json({ error: 'GitHub désactivé ou non configuré (voir data/config/github.json)' });
    }
    try {
        const config = getProjectConfig(req.params.name);
        const projectName = config?.projectName || req.params.name;
        // S'assurer que le repo local existe
        projetGit.ensureProjetRepo(projetPath, {
            authorName: user.username || user.email || 'Worganic',
            authorEmail: user.email || 'worganic@local'
        });
        const result = await setupGithubRemoteForProject(projetPath, req.params.name, projectName);
        if (!result.success) {
            return res.status(409).json(result);
        }
        // Stocker l'URL git remote en BDD pour que les autres children puissent cloner
        if (result.publicUrl) {
            try {
                await pool.query('UPDATE file_project_meta SET git_remote_url = ? WHERE id = ?', [result.publicUrl, req.params.name]);
            } catch (e2) { console.warn('[setup-remote] MySQL update git_remote_url failed:', e2.message); }
        }
        res.json({ success: true, ...result });
    } catch (e) {
        console.warn('[GitHub] setup-remote error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/ftp-sync
//   Vérifie la connexion FTP, crée la structure de répertoires distants si absente,
//   et uploade tous les fichiers locaux vers le serveur FTP (idempotent).
//   Appelé à chaque ouverture d'un projet FTP dans l'éditeur.
app.post('/api/file-projects/:name/ftp-sync', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const ftpConfig = await ftpService.getFtpConfig(pool, req.params.name);
    if (!ftpConfig) return res.status(400).json({ error: 'Ce projet n\'a pas de configuration FTP' });

    // 1. Tester la connexion
    try {
        await ftpService.testConnection(ftpConfig);
    } catch (e) {
        return res.status(503).json({ error: `Connexion FTP impossible : ${e.message}`, connectionFailed: true });
    }

    // 2. Récupérer la config locale du projet
    const config = await getProjectConfig(req.params.name);
    if (!config) return res.status(404).json({ error: 'Projet non trouvé' });

    // 3. Collecter tous les fichiers locaux (texte + images)
    const fileList = [];
    const collectFiles = (nodes) => {
        for (const node of nodes) {
            if (node.type === 'file' && node.path) {
                const localPath = path.join(PROJECTS_DIR, req.params.name, node.path);
                if (fs.existsSync(localPath)) {
                    fileList.push({ localPath, remotePath: `projets/${req.params.name}/${node.path}` });
                }
            }
            if (node.children?.length) collectFiles(node.children);
        }
    };
    collectFiles(config.structure || []);

    if (fileList.length === 0) {
        return res.json({ success: true, status: 'empty', uploaded: 0, errors: [] });
    }

    // 4. Uploader tous les fichiers locaux vers FTP (crée dossiers distants au besoin)
    try {
        const result = await ftpService.uploadFiles(ftpConfig, fileList);
        res.json({ success: true, status: 'synced', uploaded: result.uploaded, errors: result.errors });
    } catch (e) {
        console.warn('[FTP sync] upload error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/ensure-local
//   Vérifie que le dossier projet existe localement. Si non et que git_remote_url est connu → git clone.
//   Si le dossier existe avec un repo git et un remote → git pull pour récupérer les fichiers pushés par d'autres users.
//   Si le dossier existe sans repo git mais qu'un remote est connu en BDD → re-clone depuis GitHub (cas d'un projet créé avant le setup-remote).
//   Pour les projets FTP : s'assure simplement que le dossier local existe.
//   Retourne { status: 'ready' | 'cloned' | 're-cloned' | 'no-remote' }
app.post('/api/file-projects/:name/ensure-local', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    const { execSync } = require('child_process');

    // Projets FTP : à chaque ouverture, télécharger depuis FTP les fichiers absents en local.
    // - Dossier absent → créer + tout télécharger (première ouverture / dossier supprimé)
    // - Dossier présent → télécharger seulement les fichiers manquants (skipExisting)
    // Erreur explicite si FTP non configuré ou inaccessible.
    try {
        const backupType = await ftpService.getBackupType(pool, req.params.name);
        if (backupType === 'ftp') {
            const ftpConfig = await ftpService.getFtpConfig(pool, req.params.name);
            if (!ftpConfig) {
                return res.json({ status: 'ftp-no-config', message: 'Ce projet n\'a pas de configuration FTP — les fichiers ne peuvent pas être récupérés automatiquement.' });
            }
            try {
                await ftpService.testConnection(ftpConfig);
            } catch (connErr) {
                // Si le dossier local existe déjà, on laisse quand même passer (mode offline)
                if (fs.existsSync(projetPath)) {
                    console.warn(`[ensure-local] FTP KO mais dossier local présent — mode offline : ${connErr.message}`);
                    return res.json({ status: 'ready', message: 'FTP inaccessible — ouverture en mode local' });
                }
                return res.json({ status: 'ftp-error', message: `Connexion FTP impossible : ${connErr.message}` });
            }
            // Récupérer la structure depuis MySQL (pour config.json + préserver les IDs)
            const config = await getProjectConfig(req.params.name);
            if (!config) {
                return res.status(404).json({ error: 'Projet non trouvé en BDD' });
            }
            // Créer le dossier local + (re)écrire config.json depuis MySQL
            // (MySQL est la source de vérité pour la structure avec les IDs)
            fs.mkdirSync(projetPath, { recursive: true });
            const cfgPath = path.join(projetPath, 'config.json');
            fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
            // Sync FTP ↔ local d'après la BDD (source de vérité) :
            //  - télécharge depuis FTP les fichiers attendus
            //  - supprime du FTP ET du local ce qui n'est pas dans la structure BDD
            //  - préserve .git et config.json (artefacts locaux)
            const { files: expectedFiles, dirs: expectedDirs } = ftpService.buildExpectedFromStructure(config.structure || []);
            const pullResult = await ftpService.syncFromFtp(
                ftpConfig,
                `projets/${req.params.name}`,
                projetPath,
                expectedFiles,
                expectedDirs,
                ['.git', 'config.json']
            );
            console.log(`[ensure-local FTP sync] ${req.params.name} : ${pullResult.downloaded} téléchargés, ${pullResult.deletedLocal} supprimés local, ${pullResult.deletedRemote} supprimés FTP, ${pullResult.errors.length} erreurs`);
            console.log(`[ensure-local FTP sync DEBUG] expectedDirs=${pullResult.debug.expectedDirsCount}, expectedFiles=${pullResult.debug.expectedFilesCount}, unexpectedLocal sample :`, pullResult.debug.unexpectedLocal);
            console.log(`[ensure-local FTP sync DEBUG] structure root names :`, (config.structure || []).map(n => `${n.type}:${n.name}:path=${n.path}`).slice(0, 50));
            if (pullResult.errors.length > 0) {
                console.warn('[ensure-local FTP sync] erreurs :', pullResult.errors);
            }
            return res.json({ status: 'ftp-pulled', downloaded: pullResult.downloaded, deletedLocal: pullResult.deletedLocal, deletedRemote: pullResult.deletedRemote, errors: pullResult.errors });
        }
    } catch (e) {
        console.warn('[ensure-local] backup_type lookup error:', e.message);
    }

    if (fs.existsSync(projetPath)) {
        if (projetGit.isRepo(projetPath)) {
            // Cas normal : dossier + git → pull silencieux pour récupérer les fichiers pushés par d'autres users
            if (projetGit.hasRemote(projetPath)) {
                const pullResult = projetGit.pullMain(projetPath);
                if (!pullResult.success && !pullResult.skipped) {
                    console.warn('[ensure-local] pull warning (non-bloquant):', pullResult.error);
                }
            }
            return res.json({ status: 'ready' });
        }

        // Cas orphelin : dossier local sans .git, mais un remote existe en BDD
        // → re-clone depuis GitHub pour récupérer tous les fichiers committés (images, etc.)
        try {
            const [rows] = await pool.query('SELECT git_remote_url, display_name FROM file_project_meta WHERE id = ?', [req.params.name]);
            const gitRemoteUrl = rows[0]?.git_remote_url;
            if (!gitRemoteUrl) {
                // Pas de remote connu : on s'assure que config.json existe (sinon les endpoints folders/files renvoient 404)
                const cfgPath = path.join(projetPath, 'config.json');
                if (!fs.existsSync(cfgPath)) {
                    const displayName = rows[0]?.display_name || req.params.name;
                    fs.writeFileSync(cfgPath, JSON.stringify({ projectName: displayName, structure: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2), 'utf8');
                }
                return res.json({ status: 'ready' });
            }
            console.log(`[ensure-local] dossier orphelin (sans .git) détecté pour ${req.params.name} — re-clone depuis GitHub`);
            fs.rmSync(projetPath, { recursive: true, force: true });
            fs.mkdirSync(PROJECTS_DIR, { recursive: true });
            execSync(`git clone "${gitRemoteUrl}" "${projetPath}"`, { timeout: 60000 });
            return res.json({ status: 're-cloned', gitRemoteUrl });
        } catch (e) {
            console.warn('[ensure-local] re-clone error:', e.message);
            return res.json({ status: 'ready' }); // fail-safe : on laisse le dossier tel quel
        }
    }

    try {
        const [rows] = await pool.query('SELECT git_remote_url FROM file_project_meta WHERE id = ?', [req.params.name]);
        if (rows.length === 0) return res.status(404).json({ error: 'Projet non trouvé en BDD' });
        const gitRemoteUrl = rows[0].git_remote_url;
        if (!gitRemoteUrl) {
            return res.json({ status: 'no-remote', message: 'Ce projet n\'est pas disponible localement — un remote Git doit être configuré par le propriétaire.' });
        }
        // Cloner le repo
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
        execSync(`git clone "${gitRemoteUrl}" "${projetPath}"`, { timeout: 60000 });
        return res.json({ status: 'cloned', gitRemoteUrl });
    } catch (e) {
        console.warn('[ensure-local] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/ensure-fast
//   Version rapide de ensure-local : crée le dossier local depuis la BDD sans aucun appel FTP/Git.
//   Utilisé par le client pour afficher l'UI immédiatement, la sync FTP se fait ensuite en arrière-plan.
app.post('/api/file-projects/:name/ensure-fast', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    try {
        let config = await getProjectConfig(req.params.name);

        // Si file_project_meta n'existe pas, créer l'entrée depuis frank_projects
        // (projet créé côté portail mais pas encore initialisé côté file-projects)
        if (!config) {
            try {
                const [rows] = await pool.query('SELECT title FROM frank_projects WHERE id = ?', [req.params.name]);
                const displayName = rows[0]?.title || req.params.name;
                const now = new Date().toISOString();
                await pool.query(
                    'INSERT IGNORE INTO file_project_meta (id, display_name, structure, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                    [req.params.name, displayName, JSON.stringify([]), now, now]
                );
                config = { projectName: displayName, structure: [], createdAt: now, updatedAt: now, gitRemoteUrl: null };
            } catch (e2) {
                console.warn('[ensure-fast] auto-create file_project_meta failed:', e2.message);
                return res.status(404).json({ error: 'Projet non trouvé en BDD' });
            }
        }

        const alreadyExists = fs.existsSync(projetPath);
        if (!alreadyExists) {
            fs.mkdirSync(projetPath, { recursive: true });
            const cfgPath = path.join(projetPath, 'config.json');
            fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
            const createDirs = (nodes) => {
                for (const n of (nodes || [])) {
                    if (n.type === 'folder' && n.path) fs.mkdirSync(path.join(projetPath, n.path), { recursive: true });
                    if (n.children) createDirs(n.children);
                }
            };
            createDirs(config.structure || []);
            return res.json({ status: 'created-local', structure: config.structure || [] });
        }

        // Garantir que config.json existe même si le dossier était déjà présent sans lui
        // (sinon les endpoints folders/files renvoient 404 — régression connue)
        const cfgPath = path.join(projetPath, 'config.json');
        if (!fs.existsSync(cfgPath)) {
            try { fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8'); } catch {}
        }

        return res.json({ status: 'ready', structure: config.structure || [] });
    } catch (e) {
        console.warn('[ensure-fast] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/ftp-sync-background
//   Démarre la sync FTP en arrière-plan et retourne immédiatement.
//   Progresse dossier par dossier, chaque résultat est broadcasté via SSE (ftp_folder_synced).
//   Fin de sync broadcastée via SSE (ftp_sync_complete).
app.post('/api/file-projects/:name/ftp-sync-background', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projectName = req.params.name;
    const projetPath = path.join(PROJECTS_DIR, projectName);

    try {
        const ftpConfig = await ftpService.getFtpConfig(pool, projectName);
        if (!ftpConfig) {
            return res.json({ started: false, reason: 'no-ftp-config' });
        }
        const config = await getProjectConfig(projectName);
        if (!config) return res.status(404).json({ error: 'Projet non trouvé en BDD' });
        const topFolders = (config.structure || []).filter(n => n.type === 'folder');
        if (topFolders.length === 0) {
            return res.json({ started: false, reason: 'no-folders' });
        }

        // Compter le total de fichiers à synchroniser
        let totalFiles = 0;
        const countFiles = (nodes) => { for (const n of (nodes || [])) { if (n.type === 'file') totalFiles++; if (n.children) countFiles(n.children); } };
        countFiles(config.structure || []);

        // Répondre immédiatement
        res.json({ started: true, totalFolders: topFolders.length, totalFiles });

        // Lancer la sync en arrière-plan (sans await dans le handler)
        (async () => {
            broadcastToProject(projectName, 'ftp_sync_start', { totalFolders: topFolders.length, totalFiles });
            let totalDownloaded = 0;
            let totalChecked = 0;
            const allErrors = [];
            for (const folder of topFolders) {
                try {
                    const result = await ftpService.syncFolderFilesFromFtp(ftpConfig, projectName, folder, PROJECTS_DIR);
                    totalDownloaded += result.downloaded;
                    totalChecked += result.checked || 0;
                    if (result.errors.length > 0) allErrors.push(...result.errors);
                    broadcastToProject(projectName, 'ftp_folder_synced', {
                        folderId: folder.id,
                        status: result.status,
                        downloaded: result.downloaded,
                        checked: result.checked || 0,
                        totalChecked,
                        totalFiles,
                        errors: result.errors
                    });
                } catch (e) {
                    allErrors.push({ path: folder.path, error: e.message });
                    broadcastToProject(projectName, 'ftp_folder_synced', {
                        folderId: folder.id,
                        status: 'error',
                        downloaded: 0,
                        errors: [{ path: folder.path, error: e.message }]
                    });
                }
            }
            broadcastToProject(projectName, 'ftp_sync_complete', {
                status: allErrors.length > 0 ? 'error' : 'done',
                downloaded: totalDownloaded,
                errors: allErrors
            });
        })().catch(e => console.warn('[ftp-sync-background] async error:', e.message));

    } catch (e) {
        console.warn('[ftp-sync-background] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/initial-backup-push
//   Transfère tous les fichiers locaux vers le système de sauvegarde nouvellement configuré.
//   Utilisé quand un backup est ajouté pour la première fois sur un projet local existant.
app.post('/api/file-projects/:name/initial-backup-push', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projectName = req.params.name;
    const projetPath = path.join(PROJECTS_DIR, projectName);

    if (!fs.existsSync(projetPath)) {
        return res.status(404).json({ error: 'Dossier projet introuvable localement' });
    }

    try {
        const [projRows] = await pool.query(
            'SELECT backup_type, backup_server, backup_username, backup_password, backup_port, backup_directory, git_remote_url FROM frank_projects fp LEFT JOIN file_project_meta fpm ON fpm.id = fp.id WHERE fp.id = ?',
            [projectName]
        );
        if (!projRows.length) return res.status(404).json({ error: 'Projet non trouvé' });
        const proj = projRows[0];
        const backupType = proj.backup_type;

        if (backupType === 'ftp') {
            const ftpConfig = await ftpService.getFtpConfig(pool, projectName);
            if (!ftpConfig) return res.status(400).json({ error: 'Config FTP introuvable' });
            // Tester la connexion
            try { await ftpService.testConnection(ftpConfig); } catch (e) {
                return res.status(503).json({ error: `Connexion FTP impossible : ${e.message}` });
            }
            // Collecter tous les fichiers locaux
            const config = await getProjectConfig(projectName);
            const fileList = [];
            const collectFiles = (nodes) => {
                for (const n of (nodes || [])) {
                    if (n.type === 'file' && n.path) {
                        const localPath = path.join(projetPath, n.path);
                        if (fs.existsSync(localPath)) {
                            fileList.push({ localPath, remotePath: `projets/${projectName}/${n.path.replace(/\\/g, '/')}` });
                        }
                    }
                    if (n.children) collectFiles(n.children);
                }
            };
            collectFiles(config?.structure || []);
            const result = await ftpService.uploadFiles(ftpConfig, fileList);
            return res.json({ success: result.errors.length === 0, uploaded: result.uploaded, errors: result.errors });
        }

        if (backupType === 'github' || backupType === 'gitlab') {
            const gitRemoteUrl = proj.git_remote_url;
            if (!gitRemoteUrl) {
                return res.status(400).json({ error: 'Aucun remote Git configuré — configurez d\'abord un dépôt distant via le setup GitHub.' });
            }
            if (!projetGit.isRepo(projetPath)) {
                return res.status(400).json({ error: 'Le dossier projet n\'est pas un repo Git — initialisez-le d\'abord.' });
            }
            if (!projetGit.hasRemote(projetPath)) {
                const { execSync } = require('child_process');
                execSync(`git -C "${projetPath}" remote add origin "${gitRemoteUrl}"`, { timeout: 10000 });
            }
            const pushResult = projetGit.pushMain(projetPath);
            if (!pushResult.success && !pushResult.skipped) {
                return res.status(500).json({ error: pushResult.error || 'Erreur lors du push Git' });
            }
            return res.json({ success: true, pushed: true });
        }

        return res.status(400).json({ error: `Type de backup non supporté : ${backupType}` });
    } catch (e) {
        console.warn('[initial-backup-push] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/file-projects/:name/push
//   Push manuel de main vers le remote (utile au retour en ligne après travail offline)
app.post('/api/file-projects/:name/push', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const projetPath = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projetPath)) return res.status(404).json({ error: 'Projet non trouvé' });
    try {
        const result = projetGit.pushMain(projetPath);
        if (!result.success && !result.skipped) {
            return res.status(409).json({ error: result.error || 'Push impossible' });
        }
        res.json({ success: true, ...result });
    } catch (e) {
        console.warn('[ProjetGit] push error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// Version / Déploiements
// ============================================================

const VERSION_FILE = path.join(PROJECT_ROOT, 'version.json');

// Auto-migration: add branch column to app_deployments if missing
pool.query("SHOW COLUMNS FROM app_deployments LIKE 'branch'")
    .then(([cols]) => {
        if (!cols.length) {
            return pool.query("ALTER TABLE app_deployments ADD COLUMN branch VARCHAR(255) DEFAULT 'main'");
        }
    })
    .catch(e => console.warn('[DB MIGRATION] branch column:', e.message));

app.get('/api/version/check', async (req, res) => {
    try {
        let vf = {};
        if (fs.existsSync(VERSION_FILE)) {
            let raw = fs.readFileSync(VERSION_FILE, 'utf8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
            vf = JSON.parse(raw);
        }

        const localVersion = vf.version || '0.00';
        const [rows] = await pool.query(
            "SELECT * FROM app_deployments WHERE branch = 'main' OR branch IS NULL OR branch = '' ORDER BY deployed_at DESC LIMIT 1"
        );
        const latest = rows[0] || null;
        const upToDate = !latest || latest.version === localVersion;

        let currentBranch = 'main';
        try {
            const { execSync } = require('child_process');
            currentBranch = execSync('git branch --show-current', { cwd: PROJECT_ROOT, timeout: 2000 }).toString().trim() || 'main';
        } catch {}

        res.json({ upToDate, localVersion, latestDeployment: latest, currentBranch });
    } catch (e) {
        console.error('[VERSION CHECK]', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/deployments', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        const [rows] = await pool.query('SELECT * FROM app_deployments ORDER BY deployed_at DESC LIMIT 100');
        res.json(rows);
    } catch (e) {
        console.error('[DEPLOYMENTS] List error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/git-status', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        const { execSync } = require('child_process');
        const exec = (cmd) => execSync(cmd, { cwd: PROJECT_ROOT, timeout: 10000 }).toString().trim();

        let currentBranch = 'main';
        let fetchError = null;

        try { currentBranch = exec('git branch --show-current') || 'main'; } catch {}

        try { exec('git fetch origin --quiet'); } catch (e) { fetchError = e.message; }

        let mainRemoteAhead = 0;
        let mainLocalAhead  = 0;
        try { mainRemoteAhead = parseInt(exec('git rev-list HEAD..origin/main --count')) || 0; } catch {}
        try { mainLocalAhead  = parseInt(exec('git rev-list origin/main..HEAD --count'))  || 0; } catch {}

        let branchRemoteAhead = 0;
        let branchLocalAhead  = 0;
        if (currentBranch && currentBranch !== 'main') {
            try { branchRemoteAhead = parseInt(exec(`git rev-list HEAD..origin/${currentBranch} --count`)) || 0; } catch {}
            try { branchLocalAhead  = parseInt(exec(`git rev-list origin/${currentBranch}..HEAD --count`))  || 0; } catch {}
        }

        res.json({
            currentBranch,
            fetchError,
            main:   { remoteAheadOfLocal: mainRemoteAhead,   localAheadOfRemote: mainLocalAhead },
            branch: { remoteAheadOfLocal: branchRemoteAhead, localAheadOfRemote: branchLocalAhead }
        });
    } catch (e) {
        console.error('[GIT STATUS]', e);
        res.status(500).json({ error: 'Erreur git' });
    }
});

// Commits git de la branche courante (vs main) — sans fetch réseau
app.get('/api/admin/branch-commits', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        const { execSync } = require('child_process');
        const exec = (cmd) => execSync(cmd, { cwd: PROJECT_ROOT, timeout: 5000 }).toString().trim();

        let currentBranch = 'main';
        try { currentBranch = exec('git branch --show-current'); } catch {}

        if (!currentBranch || currentBranch === 'main') {
            return res.json({ branch: currentBranch, commits: [] });
        }

        const SEP = '|||';
        let raw = '';
        try {
            raw = exec(`git log main..HEAD --format="%H${SEP}%s${SEP}%ci${SEP}%an" --reverse`);
        } catch {}

        const commits = raw ? raw.split('\n').filter(Boolean).map((line, i) => {
            const parts = line.split(SEP);
            return {
                hash:    (parts[0] || '').trim(),
                subject: (parts[1] || '').trim(),
                date:    (parts[2] || '').trim(),
                author:  (parts[3] || '').trim(),
                index:   i + 1
            };
        }) : [];

        res.json({ branch: currentBranch, commits });
    } catch (e) {
        console.error('[BRANCH COMMITS]', e);
        res.status(500).json({ error: e.message });
    }
});

// Infos git locales rapides (sans fetch réseau) — chargé au démarrage de la page
app.get('/api/admin/git-local', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        const { execSync } = require('child_process');
        const exec = (cmd) => execSync(cmd, { cwd: PROJECT_ROOT, timeout: 3000 }).toString().trim();

        let currentBranch = 'main';
        let branchCommitCount = 0;
        let branchLastCommitDate = null;
        let branchLastCommitMsg  = null;

        try { currentBranch = exec('git branch --show-current') || 'main'; } catch {}
        try { branchCommitCount = parseInt(exec('git rev-list main..HEAD --count')) || 0; } catch {}
        try { branchLastCommitDate = exec('git log -1 --format="%ci" HEAD'); } catch {}
        try { branchLastCommitMsg  = exec('git log -1 --format="%s" HEAD');  } catch {}

        res.json({ currentBranch, branchCommitCount, branchLastCommitDate, branchLastCommitMsg });
    } catch (e) {
        console.error('[GIT LOCAL]', e);
        res.status(500).json({ error: 'Erreur git local' });
    }
});

// Migration des versions legacy vers le format unifié B.XXX / Br.XXX
app.post('/api/admin/migrate-versions', async (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        const [all] = await pool.query('SELECT * FROM app_deployments ORDER BY deployed_at ASC');

        const mainRecords   = all.filter(r => !r.branch || r.branch === 'main');
        const branchRecords = all.filter(r => r.branch && r.branch !== 'main');

        const pad = (n) => String(n).padStart(3, '0');

        for (let i = 0; i < mainRecords.length; i++) {
            const newVersion = `B-0.${pad(i + 1)}`;
            await pool.query('UPDATE app_deployments SET version = ? WHERE id = ?', [newVersion, mainRecords[i].id]);
        }

        // Numérotation par branche (Br-0.001, Br-0.002... par date)
        const branchGroups = {};
        for (const r of branchRecords) {
            if (!branchGroups[r.branch]) branchGroups[r.branch] = [];
            branchGroups[r.branch].push(r);
        }
        // Numérotation globale inter-branches par date
        for (let i = 0; i < branchRecords.length; i++) {
            const newVersion = `Br-0.${pad(i + 1)}`;
            await pool.query('UPDATE app_deployments SET version = ? WHERE id = ?', [newVersion, branchRecords[i].id]);
        }

        // Mise à jour version.json avec la nouvelle version main courante
        const latestMain = mainRecords.length > 0 ? `B-0.${pad(mainRecords.length)}` : 'B-0.001';
        fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: latestMain }, null, 2), 'utf8');

        res.json({
            success: true,
            mainCount:   mainRecords.length,
            branchCount: branchRecords.length,
            latestVersion: latestMain
        });
    } catch (e) {
        console.error('[MIGRATE VERSIONS]', e);
        res.status(500).json({ error: e.message });
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
        fs.writeFileSync(VERSION_FILE, JSON.stringify({ version }, null, 2), 'utf8');
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
            defaultDocumentId: r.default_document_id || null,
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

// PUT définir le document par défaut d'une catégorie
app.put('/api/doc-categories/:id/default-document', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { documentId } = req.body; // null pour retirer le défaut
    try {
        const [existing] = await pool.query('SELECT * FROM doc_categories WHERE id = ?', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Catégorie introuvable' });
        if (existing[0].created_by !== user.id && user.role !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        // Vérifie que le document appartient bien à cette catégorie (si fourni)
        if (documentId) {
            const [doc] = await pool.query('SELECT id FROM documents WHERE id = ? AND category_id = ?', [documentId, req.params.id]);
            if (!doc[0]) return res.status(400).json({ error: 'Ce document n\'appartient pas à cette catégorie' });
        }
        await pool.query('UPDATE doc_categories SET default_document_id = ? WHERE id = ?', [documentId || null, req.params.id]);
        const [rows] = await pool.query('SELECT * FROM doc_categories WHERE id = ?', [req.params.id]);
        const r = rows[0];
        res.json({ id: r.id, name: r.name, description: r.description || '',
            defaultDocumentId: r.default_document_id || null,
            createdBy: r.created_by, createdByUsername: r.created_by_username, createdAt: r.created_at });
    } catch (e) {
        console.error('[DOC-CAT] Default-document error:', e);
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
    const { text, role } = req.body;

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
            user: role === 'ai' ? 'IA' : user.username,
            userId: role === 'ai' ? 'ai' : user.id,
            text,
            role: role || 'user',
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
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // SELECT FOR UPDATE sérialise les insertions concurrentes et évite les doublons d'ID
        const [maxRows] = await conn.query('SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) AS maxNum FROM wo_action_history FOR UPDATE');
        const maxNum = maxRows[0].maxNum || 0;
        const nextNum = (maxNum + 1).toString().padStart(Math.max(3, String(maxNum + 1).length), '0');
        const id = `wah-${nextNum}`;
        const now = new Date();

        await conn.query(
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
        await conn.commit();

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
                id: entry.id,
                timestamp: entry.timestamp,
                section: entry.section,
                actionType: entry.actionType,
                label: entry.label,
                entityType: entry.entityType,
                entityId: entry.entityId,
                entityLabel: entry.entityLabel,
                userId: entry.userId,
                username: entry.username,
                undone: false,
                beforeState: entry.beforeState,
                afterState: entry.afterState,
                context: entry.context
            });
        }

        res.status(201).json(entry);
    } catch (e) {
        await conn.rollback().catch(() => {});
        console.error('[WO_ACTION_HISTORY] Create error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
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
                    user_id, username, undone, undoable, before_state, after_state
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
            userId: r.user_id, username: r.username, undone: !!r.undone, undoable: !!r.undoable,
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
        // Git : créer/reprendre la branche wip pour cette édition
        try {
            const projetPath = path.join(PROJECTS_DIR, projetId);
            if (fs.existsSync(projetPath)) {
                projetGit.createWipBranch(projetPath, userId, nodeId, {
                    authorName: userName || 'Worganic',
                    authorEmail: 'worganic@local'
                });
            }
        } catch (gitErr) {
            console.warn('[ProjetGit] createWipBranch sur lock échoué:', gitErr.message);
        }
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
        const lockOwnerId = existing[0].locked_by_id;
        await pool.query('DELETE FROM projet_section_lock WHERE node_id = ?', [nodeId]);
        // Git : supprimer la branche wip orpheline (annulation sans partage)
        try {
            const projetPath = path.join(PROJECTS_DIR, projetId);
            if (projetGit.isRepo(projetPath)) {
                projetGit.discardWip(projetPath, lockOwnerId, nodeId);
            }
        } catch (gitErr) {
            console.warn('[ProjetGit] discardWip sur unlock échoué:', gitErr.message);
        }
        broadcastToProject(projetId, 'unlock', { nodeId, projetId });
        res.json({ success: true });
    } catch (e) {
        console.error('[COLLAB] unlock error:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// Admin Tests — Sessions de tests manuels sur fonctions.md
// ============================================================

const ADMIN_TESTS_RUNS_DIR  = path.join(BASE_DIR, 'tests-admin');
const ADMIN_TESTS_RUNS_FILE = path.join(ADMIN_TESTS_RUNS_DIR, 'runs.json');
const FONCTIONS_DIR         = path.join(__dirname, '..', 'tests', 'fonctions');
const FONCTIONS_REGISTRY    = path.join(FONCTIONS_DIR, '_registry.json');

function loadFonctionsRegistry() {
    try {
        if (fs.existsSync(FONCTIONS_REGISTRY)) return JSON.parse(fs.readFileSync(FONCTIONS_REGISTRY, 'utf8'));
    } catch (e) { console.error('[ADMIN-TESTS] registry load error:', e); }
    return {};
}

function buildPathToId(registry) {
    const inv = {};
    for (const [id, p] of Object.entries(registry)) inv[p] = id;
    return inv;
}

function testsAdminLoad() {
    try {
        if (fs.existsSync(ADMIN_TESTS_RUNS_FILE)) return JSON.parse(fs.readFileSync(ADMIN_TESTS_RUNS_FILE, 'utf8'));
    } catch (e) { console.error('[ADMIN-TESTS] load error:', e); }
    return { runs: [] };
}

function testsAdminSave(data) {
    try {
        fs.mkdirSync(ADMIN_TESTS_RUNS_DIR, { recursive: true });
        fs.writeFileSync(ADMIN_TESTS_RUNS_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) { console.error('[ADMIN-TESTS] save error:', e); return false; }
}

function testsAdminId() {
    return `trun-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function computeRunStats(run) {
    const total   = run.results.length;
    const ok      = run.results.filter(r => r.status === 'ok').length;
    const ko      = run.results.filter(r => r.status === 'ko').length;
    const pending = run.results.filter(r => r.status === 'pending').length;
    const okPct   = total > 0 ? Math.round((ok / total) * 100) : 0;
    return { total, ok, ko, pending, okPct };
}

function computeTopKo(runs) {
    const koCount = {};
    for (const run of runs) {
        if (run.status !== 'completed') continue;
        for (const result of run.results) {
            if (result.status === 'ko') koCount[result.itemId] = (koCount[result.itemId] || 0) + 1;
        }
    }
    return Object.entries(koCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([itemId, count]) => ({ itemId, count }));
}

function parseFonctionsMd(relPath, content, pathToId) {
    const lines      = content.split('\n');
    let pageTitle    = '';
    const items      = [];
    const folderId   = pathToId[relPath] || relPath;
    let fallbackIdx  = 0;
    let currentItem  = null;
    let contentLines = [];

    const flushItem = () => {
        if (currentItem) {
            // Nettoyage : supprimer séparateurs "---" et lignes vides de début/fin
            const cleaned = contentLines
                .filter(l => l.trim() !== '---')
                .join('\n')
                .trim();
            currentItem.content = cleaned;
            items.push(currentItem);
        }
        currentItem  = null;
        contentLines = [];
    };

    for (const line of lines) {
        if (line.startsWith('# ') && !pageTitle) {
            pageTitle = line.slice(2).trim();
        } else if (line.startsWith('## ')) {
            flushItem();
            const raw = line.slice(3).trim();
            // Format attendu : `2-5-2-3-1` — Navigation (tiret long U+2014)
            const m = raw.match(/^`([0-9-]+)`\s*[—–-]\s*(.+)$/);
            const id      = m ? m[1] : `${folderId}-${++fallbackIdx}`;
            const section = m ? m[2].trim() : raw;
            currentItem = { id, folderId, path: relPath, pageTitle, section, content: '' };
        } else if (currentItem) {
            contentLines.push(line);
        }
    }
    flushItem();
    return items;
}

let _functionItemsCache = null;

function scanAllFunctions() {
    if (!fs.existsSync(FONCTIONS_DIR)) return [];
    const pathToId = buildPathToId(loadFonctionsRegistry());
    const items = [];

    function walk(dir, relBase) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (e) { return; }
        for (const entry of entries) {
            if (entry.name.startsWith('_')) continue; // ignore _registry.json etc.
            if (entry.isDirectory()) {
                walk(path.join(dir, entry.name), relBase ? `${relBase}/${entry.name}` : entry.name);
            } else if (entry.name === 'fonctions.md') {
                try {
                    const content = fs.readFileSync(path.join(dir, entry.name), 'utf8');
                    items.push(...parseFonctionsMd(relBase || '', content, pathToId));
                } catch (e) { console.error('[ADMIN-TESTS] parse error:', entry.name, e.message); }
            }
        }
    }

    walk(FONCTIONS_DIR, '');
    return items;
}

// GET /api/admin/tests/functions — liste tous les items testables
app.get('/api/admin/tests/functions', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    try {
        if (!_functionItemsCache) _functionItemsCache = scanAllFunctions();
        res.json({ functions: _functionItemsCache, total: _functionItemsCache.length });
    } catch (e) {
        console.error('[ADMIN-TESTS] scan error:', e);
        res.status(500).json({ error: 'Erreur scan des fonctions' });
    }
});

// POST /api/admin/tests/functions/refresh — invalide le cache
app.post('/api/admin/tests/functions/refresh', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    _functionItemsCache = null;
    res.json({ ok: true });
});

// GET /api/admin/tests/runs — liste tous les runs avec stats et topKo
app.get('/api/admin/tests/runs', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const data = testsAdminLoad();
    const runs = [...data.runs].reverse().map(run => ({
        id:          run.id,
        name:        run.name,
        tester:      run.tester,
        startedAt:   run.startedAt,
        completedAt: run.completedAt,
        status:      run.status,
        stats:       computeRunStats(run)
    }));
    res.json({ runs, topKo: computeTopKo(data.runs) });
});

// POST /api/admin/tests/runs — crée un nouveau run
app.post('/api/admin/tests/runs', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    if (!_functionItemsCache) _functionItemsCache = scanAllFunctions();
    const { name, tester } = req.body;
    const newRun = {
        id:        testsAdminId(),
        name:      name || null,
        tester:    tester || user.username || 'admin',
        startedAt: new Date().toISOString(),
        status:    'in_progress',
        results:   _functionItemsCache.map(item => ({ itemId: item.id, status: 'pending' }))
    };
    const data = testsAdminLoad();
    data.runs.push(newRun);
    testsAdminSave(data);
    res.json({ ...newRun, stats: computeRunStats(newRun) });
});

// GET /api/admin/tests/runs/:id — détail complet d'un run
app.get('/api/admin/tests/runs/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const data = testsAdminLoad();
    const run  = data.runs.find(r => r.id === req.params.id);
    if (!run) return res.status(404).json({ error: 'Run introuvable' });
    res.json({ ...run, stats: computeRunStats(run) });
});

// PUT /api/admin/tests/runs/:id — patch résultats / finalisation
app.put('/api/admin/tests/runs/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const data = testsAdminLoad();
    const idx  = data.runs.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Run introuvable' });

    const { results, name, status } = req.body;

    if (name !== undefined) data.runs[idx].name = name;

    if (results && Array.isArray(results)) {
        const now = new Date().toISOString();
        for (const incoming of results) {
            const existing = data.runs[idx].results.find(r => r.itemId === incoming.itemId);
            if (existing) {
                existing.status   = incoming.status;
                existing.note     = incoming.note;
                existing.testedAt = now;
            }
        }
    }

    if (status === 'completed' && data.runs[idx].status !== 'completed') {
        data.runs[idx].status      = 'completed';
        data.runs[idx].completedAt = new Date().toISOString();
    }

    testsAdminSave(data);
    res.json({ ...data.runs[idx], stats: computeRunStats(data.runs[idx]) });
});

// DELETE /api/admin/tests/runs/:id — supprime un run
app.delete('/api/admin/tests/runs/:id', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
    const data   = testsAdminLoad();
    const before = data.runs.length;
    data.runs    = data.runs.filter(r => r.id !== req.params.id);
    if (data.runs.length === before) return res.status(404).json({ error: 'Run introuvable' });
    testsAdminSave(data);
    res.json({ ok: true });
});

// ============================================================
// POST /api/ai/execute-file-prompt — Appel IA direct (sans executor Electron)
// Utilise la clé API stockée dans le userConfig en DB
// SSE format identique à l'executor
// ============================================================
app.post('/api/ai/execute-file-prompt', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const { fileName, promptContent, fileContent, systemInstructions, provider: bodyProvider, model: bodyModel } = req.body;
    if (!fileName || !promptContent) {
        return res.status(400).json({ error: 'fileName et promptContent requis' });
    }

    const rawCfg = user.config || {};
    const userConfig = typeof rawCfg === 'string' ? (() => { try { return JSON.parse(rawCfg); } catch { return {}; } })() : rawCfg;
    const apiKeys = userConfig.apiKeys || {};

    const provider = (bodyProvider || 'claude').split('-')[0];
    let model = bodyModel || 'claude-sonnet-4-6';

    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sseWrite = (type, message, extra = {}) => {
        res.write(`data: ${JSON.stringify({ type, message, ...extra })}\n\n`);
    };

    sseWrite('start', `> Calling ${provider}/${model} directly...\n`);

    try {
        if (provider === 'gemini') {
            const geminiKey = apiKeys.gemini?.key || '';
            if (!geminiKey) { sseWrite('error', 'Clé API Gemini non configurée'); res.end(); return; }

            const formatInstruction = 'Retourne UNIQUEMENT le contenu complet du fichier modifié, sans aucun texte supplémentaire ni explication.';
            const systemBlock = systemInstructions ? `${systemInstructions}\n\n${formatInstruction}\n\n` : `${formatInstruction}\n\n`;
            const fullPrompt = systemBlock + (fileContent
                ? `${promptContent}\n\n---\n\n**Fichier actuel (${fileName}):**\n\`\`\`\n${fileContent}\n\`\`\``
                : promptContent);

            if (!model.startsWith('gemini-')) model = 'gemini-2.5-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${geminiKey}`;
            const https = require('https');
            const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: fullPrompt }] }] });
            const urlObj = new URL(url);
            const options = { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };

            const apiReq = https.request(options, (apiRes) => {
                let buffer = '';
                apiRes.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        try {
                            const data = JSON.parse(line.slice(5).trim());
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            if (text) sseWrite('stdout', text);
                        } catch {}
                    }
                });
                apiRes.on('end', () => { sseWrite('end', '\nTerminé', { code: 0 }); res.end(); });
            });
            apiReq.on('error', (e) => { sseWrite('error', e.message); res.end(); });
            apiReq.write(body);
            apiReq.end();

        } else {
            // Claude
            const claudeKey = apiKeys.claude?.key || '';
            if (!claudeKey) { sseWrite('error', 'Clé API Claude non configurée. Configures ta clé dans Admin > Config > Intelligence Artificielle.'); res.end(); return; }

            if (!model.startsWith('claude-')) model = 'claude-sonnet-4-6';

            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic.default({ apiKey: claudeKey });

            // L'instruction de format est toujours dans le system prompt (jamais dans le user)
            // pour éviter que Claude détecte une injection depuis le contenu du fichier.
            const formatInstruction = 'Return ONLY the complete modified file content, without any additional text or explanations.';
            const systemBlock = systemInstructions
                ? `${systemInstructions}\n\n${formatInstruction}`
                : `You are a helpful assistant for modifying file content. ${formatInstruction}`;

            const userContent = fileContent
                ? `${promptContent}\n\n---\n\n**Current file (${fileName}):**\n\`\`\`\n${fileContent}\n\`\`\``
                : promptContent;

            const stream = await client.messages.stream({
                model,
                max_tokens: 8096,
                system: systemBlock,
                messages: [{ role: 'user', content: userContent }]
            });

            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    sseWrite('stdout', event.delta.text);
                }
            }

            const finalMsg = await stream.finalMessage();
            const usage = finalMsg.usage;
            if (usage) {
                sseWrite('tokens', '', {
                    used: usage.input_tokens + usage.output_tokens,
                    total: 200000,
                    remaining: 200000 - usage.input_tokens - usage.output_tokens
                });
            }
            sseWrite('end', '\nTerminé', { code: 0 });
            res.end();
        }
    } catch (err) {
        sseWrite('error', err.message || 'Erreur API IA');
        res.end();
    }
});

// ============================================================
// Mega-Outils
// ============================================================

// GET /api/mega-outils/instances?projectId=&type=
app.get('/api/mega-outils/instances', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { projectId, type } = req.query;
    try {
        let sql = 'SELECT * FROM mega_outil_instances';
        const params = [];
        const where = [];
        if (projectId) { where.push('project_id = ?'); params.push(projectId); }
        if (type)      { where.push('type = ?');       params.push(type); }
        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY created_at ASC';
        const [rows] = await pool.query(sql, params);
        res.json(rows.map(r => ({
            id: r.id, type: r.type, name: r.name, projectId: r.project_id,
            outilId: r.outil_id || undefined, folderId: r.folder_id || undefined, createdBy: r.created_by || undefined,
            createdAt: r.created_at, updatedAt: r.updated_at
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mega-outils/instances/all  (admin : toutes instances)
app.get('/api/mega-outils/instances/all', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query(`
            SELECT i.*, fpm.display_name AS project_name
            FROM mega_outil_instances i
            LEFT JOIN file_project_meta fpm ON fpm.id = i.project_id
            ORDER BY i.created_at DESC
        `);
        res.json(rows.map(r => ({
            instance: { id: r.id, type: r.type, name: r.name, projectId: r.project_id,
                outilId: r.outil_id || undefined, folderId: r.folder_id || undefined, createdBy: r.created_by || undefined,
                createdAt: r.created_at, updatedAt: r.updated_at },
            projectName: r.project_name || r.project_id
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mega-outils/instances
app.post('/api/mega-outils/instances', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { type, name, projectId, outilId, folderId } = req.body;
    if (!type || !name || !projectId) return res.status(400).json({ error: 'type, name et projectId requis' });
    try {
        const id = require('crypto').randomUUID();
        await pool.query(
            'INSERT INTO mega_outil_instances (id, type, name, project_id, outil_id, folder_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, type, name, projectId, outilId || null, folderId || null, user.id || null]
        );
        const [rows] = await pool.query('SELECT * FROM mega_outil_instances WHERE id = ?', [id]);
        const r = rows[0];
        res.status(201).json({ id: r.id, type: r.type, name: r.name, projectId: r.project_id,
            outilId: r.outil_id || undefined, folderId: r.folder_id || undefined, createdBy: r.created_by || undefined,
            createdAt: r.created_at, updatedAt: r.updated_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/mega-outils/instances/:id
app.patch('/api/mega-outils/instances/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    try {
        await pool.query('UPDATE mega_outil_instances SET name = ? WHERE id = ?', [name, req.params.id]);
        const [rows] = await pool.query('SELECT * FROM mega_outil_instances WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Instance non trouvée' });
        const r = rows[0];
        res.json({ id: r.id, type: r.type, name: r.name, projectId: r.project_id,
            outilId: r.outil_id || undefined, folderId: r.folder_id || undefined, createdBy: r.created_by || undefined,
            createdAt: r.created_at, updatedAt: r.updated_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/mega-outils/instances/:id
app.delete('/api/mega-outils/instances/:id', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        await pool.query('DELETE FROM mega_outil_trello_cards WHERE instance_id = ?', [req.params.id]);
        await pool.query('DELETE FROM mega_outil_instances WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mega-outils/trello/all
app.get('/api/mega-outils/trello/all', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [instances] = await pool.query(`
            SELECT i.*, fpm.display_name AS project_name
            FROM mega_outil_instances i
            LEFT JOIN file_project_meta fpm ON fpm.id = i.project_id
            WHERE i.type = 'trello' ORDER BY i.created_at ASC
        `);
        const result = [];
        for (const r of instances) {
            const [cards] = await pool.query(
                'SELECT * FROM mega_outil_trello_cards WHERE instance_id = ? ORDER BY order_index ASC, created_at ASC',
                [r.id]
            );
            result.push({
                instance: { id: r.id, type: r.type, name: r.name, projectId: r.project_id,
                    outilId: r.outil_id || undefined, folderId: r.folder_id || undefined, createdBy: r.created_by || undefined,
                    createdAt: r.created_at, updatedAt: r.updated_at },
                projectName: r.project_name || r.project_id,
                cards: cards.map(c => ({ id: c.id, instanceId: c.instance_id, title: c.title,
                    description: c.description || undefined, status: c.status, priority: c.priority,
                    orderIndex: c.order_index, creatorId: c.creator_id || undefined,
                    creatorName: c.creator_name || undefined, createdAt: c.created_at, updatedAt: c.updated_at }))
            });
        }
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mega-outils/trello/:instanceId/cards
app.get('/api/mega-outils/trello/:instanceId/cards', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const [rows] = await pool.query(
            'SELECT * FROM mega_outil_trello_cards WHERE instance_id = ? ORDER BY order_index ASC, created_at ASC',
            [req.params.instanceId]
        );
        res.json(rows.map(c => ({ id: c.id, instanceId: c.instance_id, title: c.title,
            description: c.description || undefined, status: c.status, priority: c.priority,
            orderIndex: c.order_index, creatorId: c.creator_id || undefined,
            creatorName: c.creator_name || undefined, createdAt: c.created_at, updatedAt: c.updated_at })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mega-outils/trello/:instanceId/cards/reorder  (avant :cardId pour éviter conflit)
app.post('/api/mega-outils/trello/:instanceId/cards/reorder', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds requis' });
    try {
        for (let i = 0; i < orderedIds.length; i++) {
            await pool.query('UPDATE mega_outil_trello_cards SET order_index = ? WHERE id = ? AND instance_id = ?',
                [i, orderedIds[i], req.params.instanceId]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mega-outils/trello/:instanceId/cards
app.post('/api/mega-outils/trello/:instanceId/cards', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const { title, description, status, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'title requis' });
    try {
        const [countRows] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM mega_outil_trello_cards WHERE instance_id = ?', [req.params.instanceId]);
        const orderIndex = countRows[0].cnt;
        const id = require('crypto').randomUUID();
        await pool.query(
            `INSERT INTO mega_outil_trello_cards (id, instance_id, title, description, status, priority, order_index, creator_id, creator_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.params.instanceId, title, description || null,
             status || 'todo', priority || 'medium', orderIndex,
             user.id || null, user.username || user.email || null]
        );
        const [rows] = await pool.query('SELECT * FROM mega_outil_trello_cards WHERE id = ?', [id]);
        const c = rows[0];
        res.status(201).json({ id: c.id, instanceId: c.instance_id, title: c.title,
            description: c.description || undefined, status: c.status, priority: c.priority,
            orderIndex: c.order_index, creatorId: c.creator_id || undefined,
            creatorName: c.creator_name || undefined, createdAt: c.created_at, updatedAt: c.updated_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/mega-outils/trello/:instanceId/cards/:cardId
app.patch('/api/mega-outils/trello/:instanceId/cards/:cardId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    const fields = [];
    const vals   = [];
    const allowed = { title: req.body.title, description: req.body.description,
        status: req.body.status, priority: req.body.priority, order_index: req.body.orderIndex };
    for (const [k, v] of Object.entries(allowed)) {
        if (v !== undefined) { fields.push(`${k} = ?`); vals.push(v); }
    }
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    try {
        vals.push(req.params.cardId, req.params.instanceId);
        await pool.query(`UPDATE mega_outil_trello_cards SET ${fields.join(', ')} WHERE id = ? AND instance_id = ?`, vals);
        const [rows] = await pool.query('SELECT * FROM mega_outil_trello_cards WHERE id = ?', [req.params.cardId]);
        if (!rows.length) return res.status(404).json({ error: 'Carte non trouvée' });
        const c = rows[0];
        res.json({ id: c.id, instanceId: c.instance_id, title: c.title,
            description: c.description || undefined, status: c.status, priority: c.priority,
            orderIndex: c.order_index, creatorId: c.creator_id || undefined,
            creatorName: c.creator_name || undefined, createdAt: c.created_at, updatedAt: c.updated_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/mega-outils/trello/:instanceId/cards/:cardId
app.delete('/api/mega-outils/trello/:instanceId/cards/:cardId', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        await pool.query('DELETE FROM mega_outil_trello_cards WHERE id = ? AND instance_id = ?',
            [req.params.cardId, req.params.instanceId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
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

    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_type VARCHAR(20) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_type:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_server VARCHAR(255) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_server:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_password VARCHAR(500) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_password:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_directory VARCHAR(500) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_directory:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_owner_type VARCHAR(50) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_owner_type:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_repo_name VARCHAR(255) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_repo_name:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_visibility VARCHAR(50) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_visibility:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_username VARCHAR(128) DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_username:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS backup_port INT DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration backup_port:', e.message));
    await pool.query(`ALTER TABLE frank_projects ADD COLUMN IF NOT EXISTS ia_instructions TEXT DEFAULT NULL`).catch(e => console.error('[DB] frank_projects migration ia_instructions:', e.message));
    await pool.query(`ALTER TABLE doc_categories ADD COLUMN IF NOT EXISTS default_document_id VARCHAR(64) DEFAULT NULL`).catch(e => console.error('[DB] doc_categories migration default_document_id:', e.message));
    await pool.query(`ALTER TABLE file_project_meta ADD COLUMN IF NOT EXISTS outils JSON DEFAULT NULL`).catch(e => console.warn('[DB] file_project_meta migration outils:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS mega_outil_instances (
            id          VARCHAR(64)  PRIMARY KEY,
            type        VARCHAR(64)  NOT NULL,
            name        VARCHAR(255) NOT NULL,
            project_id  VARCHAR(255) NOT NULL,
            outil_id    VARCHAR(64)  DEFAULT NULL,
            created_by  VARCHAR(64)  DEFAULT NULL,
            created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_moi_project (project_id),
            INDEX idx_moi_type    (type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(e => console.error('[DB] mega_outil_instances init error:', e.message));

    await pool.query(`ALTER TABLE mega_outil_instances ADD COLUMN IF NOT EXISTS folder_id VARCHAR(64) DEFAULT NULL`).catch(e => console.warn('[DB] mega_outil_instances migration folder_id:', e.message));

    await pool.query(`
        CREATE TABLE IF NOT EXISTS mega_outil_trello_cards (
            id           VARCHAR(64)   PRIMARY KEY,
            instance_id  VARCHAR(64)   NOT NULL,
            title        VARCHAR(500)  NOT NULL,
            description  TEXT          DEFAULT NULL,
            status       VARCHAR(32)   DEFAULT 'todo',
            priority     VARCHAR(32)   DEFAULT 'medium',
            order_index  INT           DEFAULT 0,
            creator_id   VARCHAR(64)   DEFAULT NULL,
            creator_name VARCHAR(255)  DEFAULT NULL,
            created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_motc_instance (instance_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(e => console.error('[DB] mega_outil_trello_cards init error:', e.message));

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

    // F6 — Commentaires inline par section
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_comments (
            id          VARCHAR(36)  PRIMARY KEY,
            project_id  VARCHAR(255) NOT NULL,
            folder_id   VARCHAR(255) NOT NULL,
            user_id     VARCHAR(64)  NOT NULL,
            username    VARCHAR(255) NOT NULL,
            text        TEXT         NOT NULL,
            created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_pc_project (project_id),
            INDEX idx_pc_folder  (project_id, folder_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(e => console.error('[DB] project_comments init error:', e.message));

    // Métadonnées et structure des file-projects (source de vérité partagée entre children)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS file_project_meta (
            id              VARCHAR(255) PRIMARY KEY,
            display_name    VARCHAR(255) NOT NULL,
            git_remote_url  VARCHAR(500) DEFAULT NULL,
            structure       JSON         NOT NULL DEFAULT (JSON_ARRAY()),
            owner_user_id   VARCHAR(64)  DEFAULT NULL,
            created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_fpm_owner (owner_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(e => console.error('[DB] file_project_meta init error:', e.message));

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
