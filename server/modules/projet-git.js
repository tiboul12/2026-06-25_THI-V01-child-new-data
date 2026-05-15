/**
 * Worganic - Projet Git Module
 *
 * Opérations git par projet. Chaque projet dans data/projets/{name}/
 * est un repo git autonome. Les fonctions opèrent toujours dans le cwd
 * du projet (pas la racine).
 *
 * Convention de branches :
 *   - main                          : état partagé
 *   - wip/{userId}/{nodeId}         : édition en cours d'un utilisateur sur une section
 *
 * Toutes les fonctions sont fail-safe : un échec git ne doit jamais
 * casser l'écriture fichier ou le flux d'API. On retourne { success: false, error }
 * et on log, on ne throw pas.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_AUTHOR_NAME = 'Worganic';
const DEFAULT_AUTHOR_EMAIL = 'worganic@local';
const EXEC_TIMEOUT_MS = 30000;

function log(msg, ...args) {
    console.log(`[ProjetGit] ${msg}`, ...args);
}

function warn(msg, ...args) {
    console.warn(`[ProjetGit] ${msg}`, ...args);
}

function execGit(args, cwd, opts = {}) {
    try {
        const out = execSync(`git ${args}`, {
            cwd,
            encoding: 'utf8',
            timeout: EXEC_TIMEOUT_MS,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            ...opts
        });
        return { ok: true, stdout: (out || '').trim() };
    } catch (e) {
        return {
            ok: false,
            stdout: e.stdout ? e.stdout.toString().trim() : '',
            stderr: e.stderr ? e.stderr.toString().trim() : (e.message || ''),
            code: e.status
        };
    }
}

function isRepo(projetPath) {
    if (!projetPath || !fs.existsSync(projetPath)) return false;
    return fs.existsSync(path.join(projetPath, '.git'));
}

function wipBranchName(userId, nodeId) {
    const safe = v => String(v || '').replace(/[^a-zA-Z0-9._-]/g, '-');
    return `wip/${safe(userId)}/${safe(nodeId)}`;
}

function sanitizeMessage(msg) {
    return String(msg || '')
        .replace(/\r?\n/g, ' ')
        .replace(/["`$]/g, '')
        .slice(0, 200) || 'wip';
}

function commitWithMessage(projetPath, message) {
    const safeMsg = sanitizeMessage(message);
    const tmp = path.join(os.tmpdir(), `worganic-commit-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    try {
        fs.writeFileSync(tmp, safeMsg, 'utf8');
        const r = execGit(`commit -F "${tmp}"`, projetPath);
        return r;
    } finally {
        try { fs.unlinkSync(tmp); } catch (_) {}
    }
}

/**
 * Initialise un repo git dans projetPath et fait le premier commit
 * avec tout le contenu présent. Idempotent : si déjà initialisé, ne fait rien.
 */
function initProjetRepo(projetPath, opts = {}) {
    if (!projetPath || !fs.existsSync(projetPath)) {
        return { success: false, error: 'project path not found' };
    }
    if (isRepo(projetPath)) {
        return { success: true, alreadyExists: true };
    }
    const authorName = opts.authorName || DEFAULT_AUTHOR_NAME;
    const authorEmail = opts.authorEmail || DEFAULT_AUTHOR_EMAIL;

    const init = execGit('init -b main', projetPath);
    if (!init.ok) {
        // Fallback : ancienne syntaxe git < 2.28
        const fallback = execGit('init', projetPath);
        if (!fallback.ok) {
            warn('init failed:', fallback.stderr);
            return { success: false, error: fallback.stderr };
        }
        execGit('checkout -b main', projetPath);
    }

    execGit(`config user.name "${authorName.replace(/"/g, '')}"`, projetPath);
    execGit(`config user.email "${authorEmail.replace(/"/g, '')}"`, projetPath);
    execGit('config core.autocrlf false', projetPath);

    const add = execGit('add -A', projetPath);
    if (!add.ok) {
        warn('init: git add failed:', add.stderr);
    }
    const commit = commitWithMessage(projetPath, 'init: création projet');
    if (!commit.ok && !/nothing to commit/i.test(commit.stderr || '')) {
        warn('init: first commit failed:', commit.stderr);
    }
    log(`init OK: ${projetPath}`);
    return { success: true };
}

/**
 * Garantit qu'un repo git existe pour ce projet, l'initialise si besoin.
 */
function ensureProjetRepo(projetPath, opts = {}) {
    if (isRepo(projetPath)) return { success: true };
    return initProjetRepo(projetPath, opts);
}

function getCurrentBranch(projetPath) {
    if (!isRepo(projetPath)) return null;
    const r = execGit('branch --show-current', projetPath);
    return r.ok ? r.stdout : null;
}

function branchExists(projetPath, branchName) {
    const r = execGit(`show-ref --verify --quiet refs/heads/${branchName}`, projetPath);
    return r.ok;
}

/**
 * Bascule sur la branche wip pour {userId, nodeId}. Crée la branche depuis main
 * si elle n'existe pas, sinon checkout dessus (reprise de session).
 */
function createWipBranch(projetPath, userId, nodeId, opts = {}) {
    const repoOk = ensureProjetRepo(projetPath, opts);
    if (!repoOk.success) return repoOk;

    const branch = wipBranchName(userId, nodeId);

    if (branchExists(projetPath, branch)) {
        const co = execGit(`checkout "${branch}"`, projetPath);
        if (!co.ok) {
            warn(`checkout wip failed (${branch}):`, co.stderr);
            return { success: false, error: co.stderr, branch };
        }
        return { success: true, branch, resumed: true };
    }

    // Toujours partir de main pour créer la wip
    const coMain = execGit('checkout main', projetPath);
    if (!coMain.ok) {
        warn('checkout main failed before wip create:', coMain.stderr);
    }
    const created = execGit(`checkout -b "${branch}"`, projetPath);
    if (!created.ok) {
        warn(`create wip failed (${branch}):`, created.stderr);
        return { success: false, error: created.stderr, branch };
    }
    log(`wip created: ${branch}`);
    return { success: true, branch, resumed: false };
}

/**
 * Commit un fichier (ou un ensemble) sur la branche courante.
 * Si filePath est null/undefined, commit tous les changements (git add -A).
 */
function commitFile(projetPath, filePath, message) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };

    if (filePath) {
        const relPath = path.isAbsolute(filePath)
            ? path.relative(projetPath, filePath)
            : filePath;
        // git add tolère les chemins manquants si on les a juste supprimés
        const add = execGit(`add -A -- "${relPath.replace(/\\/g, '/')}"`, projetPath);
        if (!add.ok) {
            warn('add failed:', add.stderr);
        }
    } else {
        execGit('add -A', projetPath);
    }

    const commit = commitWithMessage(projetPath, message);
    if (!commit.ok) {
        if (/nothing to commit/i.test(commit.stderr || '') || /nothing to commit/i.test(commit.stdout || '')) {
            return { success: true, empty: true };
        }
        warn('commit failed:', commit.stderr);
        return { success: false, error: commit.stderr };
    }
    const hash = execGit('rev-parse HEAD', projetPath);
    return { success: true, hash: hash.ok ? hash.stdout : null };
}

/**
 * Publie la branche wip de {userId, nodeId} : merge --ff-only vers main,
 * suppression de la branche wip, push si remote configuré.
 */
function publishWip(projetPath, userId, nodeId, opts = {}) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };

    const branch = wipBranchName(userId, nodeId);
    const username = opts.username || 'user';
    const sectionName = opts.sectionName || nodeId;
    const filePath = opts.filePath || null;

    // Vérifier qu'on est bien sur la branche wip
    let currentBranch = getCurrentBranch(projetPath);
    if (currentBranch !== branch) {
        const co = execGit(`checkout "${branch}"`, projetPath);
        if (!co.ok) {
            // La branche wip n'existe peut-être pas : on commite directement sur main
            warn(`publish: wip branch ${branch} introuvable, commit direct sur main`);
            execGit('checkout main', projetPath);
            const direct = commitFile(projetPath, filePath, `pub: ${username} - ${sectionName}`);
            return {
                success: direct.success,
                commitHash: direct.hash,
                mergedBranch: null,
                directCommit: true
            };
        }
    }

    // Commit final sur wip (au cas où le dernier save ne serait pas committé)
    const finalCommit = commitFile(projetPath, filePath, `pub: ${username} - ${sectionName}`);
    if (!finalCommit.success && !finalCommit.empty) {
        warn('publish: final commit failed:', finalCommit.error);
    }
    const wipHead = execGit('rev-parse HEAD', projetPath);

    // Checkout main + merge --ff-only
    const coMain = execGit('checkout main', projetPath);
    if (!coMain.ok) {
        warn('publish: checkout main failed:', coMain.stderr);
        return { success: false, error: coMain.stderr };
    }

    const merge = execGit(`merge --ff-only "${branch}"`, projetPath);
    if (!merge.ok) {
        warn(`publish: ff merge failed (${branch}):`, merge.stderr);
        // Tentative no-ff en dernier recours
        const mergeNoFf = execGit(`merge --no-ff -m "pub-merge: ${sanitizeMessage(sectionName)}" "${branch}"`, projetPath);
        if (!mergeNoFf.ok) {
            warn(`publish: no-ff merge also failed:`, mergeNoFf.stderr);
            return { success: false, error: mergeNoFf.stderr };
        }
    }

    // Supprimer la branche wip locale
    const del = execGit(`branch -D "${branch}"`, projetPath);
    if (!del.ok) {
        warn(`publish: branch delete failed (${branch}):`, del.stderr);
    }

    const mainHead = execGit('rev-parse HEAD', projetPath);

    log(`publish OK: ${branch} → main @ ${mainHead.stdout?.slice(0, 7)}`);
    return {
        success: true,
        commitHash: mainHead.ok ? mainHead.stdout : (wipHead.ok ? wipHead.stdout : null),
        mergedBranch: branch
    };
}

/**
 * Annule la branche wip sans merge : checkout main + branch -D.
 */
function discardWip(projetPath, userId, nodeId) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };

    const branch = wipBranchName(userId, nodeId);
    if (!branchExists(projetPath, branch)) {
        return { success: true, alreadyAbsent: true };
    }

    const coMain = execGit('checkout main', projetPath);
    if (!coMain.ok) {
        warn('discard: checkout main failed:', coMain.stderr);
    }
    const del = execGit(`branch -D "${branch}"`, projetPath);
    if (!del.ok) {
        warn(`discard: branch -D failed (${branch}):`, del.stderr);
        return { success: false, error: del.stderr };
    }
    log(`discard OK: ${branch}`);
    return { success: true };
}

/**
 * Commit direct sur main (changements de structure : create folder, rename, etc.)
 */
function commitOnMain(projetPath, message, filePath = null) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };
    const cur = getCurrentBranch(projetPath);
    if (cur && cur !== 'main') {
        warn(`commitOnMain: refus, branche courante = ${cur}`);
        // On reste sur la branche courante pour ne pas casser une wip en cours
        // → commit silencieux sur la branche courante avec préfixe struct:
        return commitFile(projetPath, filePath, `struct: ${message}`);
    }
    return commitFile(projetPath, filePath, `struct: ${message}`);
}

function hasRemote(projetPath) {
    if (!isRepo(projetPath)) return false;
    const r = execGit('remote', projetPath);
    return r.ok && r.stdout.length > 0;
}

function pushMain(projetPath) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };
    if (!hasRemote(projetPath)) return { success: false, error: 'no remote', skipped: true };
    const r = execGit('push origin main', projetPath);
    if (!r.ok) {
        warn('push failed:', r.stderr);
        return { success: false, error: r.stderr };
    }
    return { success: true };
}

function pullMain(projetPath) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };
    if (!hasRemote(projetPath)) return { success: false, error: 'no remote', skipped: true };

    const before = execGit('rev-parse HEAD', projetPath);
    const fetch = execGit('fetch origin main', projetPath);
    if (!fetch.ok) {
        warn('fetch failed:', fetch.stderr);
        return { success: false, error: fetch.stderr };
    }
    const merge = execGit('merge --ff-only origin/main', projetPath);
    if (!merge.ok) {
        warn('pull (ff-only) failed:', merge.stderr);
        return { success: false, error: merge.stderr };
    }
    const after = execGit('rev-parse HEAD', projetPath);
    const newCommits = (before.ok && after.ok && before.stdout !== after.stdout)
        ? execGit(`rev-list ${before.stdout}..${after.stdout} --count`, projetPath)
        : { stdout: '0' };

    const changedFiles = (before.ok && after.ok && before.stdout !== after.stdout)
        ? execGit(`diff --name-only ${before.stdout} ${after.stdout}`, projetPath)
        : { stdout: '' };

    return {
        success: true,
        newCommits: parseInt(newCommits.stdout || '0', 10),
        changedFiles: changedFiles.stdout ? changedFiles.stdout.split('\n').filter(Boolean) : []
    };
}

function getSyncStatus(projetPath) {
    if (!isRepo(projetPath)) return { isRepo: false };
    const remote = hasRemote(projetPath);
    if (!remote) return { isRepo: true, hasRemote: false, ahead: 0, behind: 0 };

    const fetch = execGit('fetch origin main', projetPath);
    const counts = execGit('rev-list --left-right --count HEAD...origin/main', projetPath);
    if (!counts.ok) {
        return { isRepo: true, hasRemote: true, ahead: 0, behind: 0, fetchOk: fetch.ok };
    }
    const [aheadStr, behindStr] = counts.stdout.split(/\s+/);
    return {
        isRepo: true,
        hasRemote: true,
        ahead: parseInt(aheadStr || '0', 10),
        behind: parseInt(behindStr || '0', 10),
        fetchOk: fetch.ok
    };
}

module.exports = {
    isRepo,
    wipBranchName,
    initProjetRepo,
    ensureProjetRepo,
    getCurrentBranch,
    branchExists,
    createWipBranch,
    commitFile,
    publishWip,
    discardWip,
    commitOnMain,
    pushMain,
    pullMain,
    hasRemote,
    getSyncStatus
};
