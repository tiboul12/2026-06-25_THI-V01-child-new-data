/**
 * Worganic - GitHub Service Module
 *
 * Création / gestion automatique des repos GitHub pour les projets.
 * Configuration lue depuis data/config/github.json (gitignored).
 *
 * Toutes les fonctions sont fail-safe : si la config est absente ou
 * désactivée, elles retournent { success: false, skipped: true } sans
 * lever d'exception. Le serveur continue de fonctionner en local-only.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'config', 'github.json');
const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

function log(msg, ...args) { console.log(`[GitHub] ${msg}`, ...args); }
function warn(msg, ...args) { console.warn(`[GitHub] ${msg}`, ...args); }

let cachedConfig = null;
let cachedConfigMtime = 0;

function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return { enabled: false, missing: true };
        }
        const stat = fs.statSync(CONFIG_PATH);
        if (cachedConfig && stat.mtimeMs === cachedConfigMtime) return cachedConfig;
        cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        cachedConfigMtime = stat.mtimeMs;
        return cachedConfig;
    } catch (e) {
        warn('config load error:', e.message);
        return { enabled: false, error: e.message };
    }
}

function isEnabled() {
    const cfg = loadConfig();
    return !!(cfg && cfg.enabled && cfg.token && cfg.owner);
}

function getConfig() {
    return loadConfig();
}

/**
 * Construit le nom de repo à partir du pattern configuré et de l'UUID/projectName.
 */
function buildRepoName(uuid, projectName) {
    const cfg = loadConfig();
    const pattern = cfg.repoNamePattern || 'projet-{uuid8}';
    const uuid8 = (uuid || '').replace(/-/g, '').slice(0, 8);
    const slug = (projectName || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30);
    return pattern
        .replace(/\{uuid8\}/g, uuid8)
        .replace(/\{uuid\}/g, uuid || '')
        .replace(/\{slug\}/g, slug)
        .replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function ghFetch(urlPath, opts = {}) {
    const cfg = loadConfig();
    if (!cfg.token) throw new Error('GitHub token missing in config');

    const url = urlPath.startsWith('http') ? urlPath : `${API_BASE}${urlPath}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${cfg.token}`,
            'X-GitHub-Api-Version': API_VERSION,
            'User-Agent': 'worganic-platform',
            ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
            ...(opts.headers || {})
        }
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, body };
}

/**
 * Vérifie si un repo existe déjà chez l'owner configuré.
 */
async function repoExists(repoName) {
    if (!isEnabled()) return { exists: false, skipped: true };
    const cfg = loadConfig();
    const r = await ghFetch(`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(repoName)}`);
    if (r.ok) return { exists: true, repo: r.body };
    if (r.status === 404) return { exists: false };
    return { exists: false, error: r.body?.message || `HTTP ${r.status}` };
}

/**
 * Crée un repo GitHub. Idempotent : si déjà existant, retourne {success:true, alreadyExists:true}.
 */
async function createRepo(repoName, opts = {}) {
    if (!isEnabled()) return { success: false, skipped: true, reason: 'github disabled or unconfigured' };
    const cfg = loadConfig();

    const existing = await repoExists(repoName);
    if (existing.exists) {
        log(`repo already exists: ${cfg.owner}/${repoName}`);
        return { success: true, alreadyExists: true, repo: existing.repo, cloneUrl: existing.repo.clone_url };
    }
    if (existing.error) {
        warn(`repoExists check failed: ${existing.error}`);
    }

    const body = {
        name: repoName,
        description: opts.description || 'Worganic project',
        private: (cfg.visibility || 'private') === 'private',
        auto_init: false,
        has_issues: false,
        has_projects: false,
        has_wiki: false
    };
    const endpoint = cfg.ownerType === 'user'
        ? '/user/repos'
        : `/orgs/${encodeURIComponent(cfg.owner)}/repos`;

    const r = await ghFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    if (!r.ok) {
        warn(`createRepo failed (${r.status}):`, r.body?.message || r.body);
        return { success: false, error: r.body?.message || `HTTP ${r.status}`, status: r.status };
    }
    log(`repo created: ${cfg.owner}/${repoName}`);
    return { success: true, repo: r.body, cloneUrl: r.body.clone_url };
}

async function deleteRepo(repoName) {
    if (!isEnabled()) return { success: false, skipped: true };
    const cfg = loadConfig();
    const r = await ghFetch(`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(repoName)}`, {
        method: 'DELETE'
    });
    if (r.ok || r.status === 204) return { success: true };
    return { success: false, error: r.body?.message || `HTTP ${r.status}` };
}

/**
 * Retourne l'URL clone authentifiée pour push depuis le serveur :
 *   https://x-access-token:{TOKEN}@github.com/{owner}/{repo}.git
 *
 * Cette URL contient le token, elle est utilisée pour configurer le remote
 * local. NE PAS la logger ni l'exposer dans les réponses HTTP.
 */
function buildAuthenticatedCloneUrl(repoName) {
    const cfg = loadConfig();
    if (!cfg.token || !cfg.owner) return null;
    return `https://x-access-token:${cfg.token}@github.com/${cfg.owner}/${repoName}.git`;
}

/**
 * Retourne l'URL publique (sans token), utilisable pour affichage UI.
 */
function buildPublicRepoUrl(repoName) {
    const cfg = loadConfig();
    if (!cfg.owner) return null;
    return `https://github.com/${cfg.owner}/${repoName}`;
}

module.exports = {
    isEnabled,
    getConfig,
    buildRepoName,
    repoExists,
    createRepo,
    deleteRepo,
    buildAuthenticatedCloneUrl,
    buildPublicRepoUrl
};
