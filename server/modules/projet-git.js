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

    // Commit final sur wip : git add -A pour inclure config.json et tout fichier
    // modifié non encore stagehé (ex: saveProjectConfig écrit config.json à chaque
    // auto-save mais commitFile ne le stage pas).
    const finalCommit = commitFile(projetPath, null, `pub: ${username} - ${sectionName}`);
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

    const mainHead = execGit('rev-parse HEAD', projetPath);

    // Auto-push si remote configuré — AVANT suppression de la branche wip
    // (permet de conserver la branche wip pour diagnostic si push échoue)
    let pushedToRemote = false;
    let pushError = null;
    if (hasRemote(projetPath)) {
        const pushed = pushMain(projetPath);
        pushedToRemote = !!pushed.success;
        if (!pushed.success) {
            warn('publish: auto-push failed:', pushed.error);
            pushError = pushed.error || 'push failed';
        }
    }

    // Supprimer la branche wip locale (contenu sécurisé sur main même si push échoué)
    const del = execGit(`branch -D "${branch}"`, projetPath);
    if (!del.ok) warn(`publish: branch delete failed (${branch}):`, del.stderr);

    log(`publish ${pushedToRemote ? 'OK' : (pushError ? 'push-failed' : 'local-only')}: ${branch} → main @ ${mainHead.stdout?.slice(0, 7)}`);

    return {
        success: !pushError,
        localSuccess: true,
        pushFailed: !!pushError,
        pushError: pushError || null,
        commitHash: mainHead.ok ? mainHead.stdout : (wipHead.ok ? wipHead.stdout : null),
        mergedBranch: branch,
        pushedToRemote
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
 * Cherry-pick le dernier commit de la branche courante (wip) sur main, puis push.
 * Utilisé pour propager une modification structurelle (image add/delete, folder ops)
 * vers le remote sans attendre la publication finale du wip.
 *
 * Stratégie : stash → checkout main → cherry-pick → push → checkout wip → unstash.
 * En cas de conflit, restaure proprement et rapporte l'échec sans casser le wip.
 */
function propagateLatestCommitToMain(projetPath) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };
    const cur = getCurrentBranch(projetPath);
    if (cur === 'main') return { success: true, skipped: 'already on main' };
    if (!cur) return { success: false, error: 'no current branch' };

    const wipHead = execGit('rev-parse HEAD', projetPath);
    if (!wipHead.ok) return { success: false, error: 'rev-parse HEAD failed' };

    // Stash uncommitted changes (working tree + index + untracked)
    const stash = execGit('stash push --include-untracked -m "auto-stash before propagate"', projetPath);
    const stashed = stash.ok && !/(No local changes|nothing to stash)/i.test(stash.stdout + ' ' + stash.stderr);

    // Checkout main
    const coMain = execGit('checkout main', projetPath);
    if (!coMain.ok) {
        warn('propagate: checkout main failed:', coMain.stderr);
        if (stashed) execGit('stash pop', projetPath);
        return { success: false, error: coMain.stderr };
    }

    // Cherry-pick le commit wip
    const cherry = execGit(`cherry-pick ${wipHead.stdout}`, projetPath);
    if (!cherry.ok) {
        execGit('cherry-pick --abort', projetPath);
        execGit(`checkout "${cur}"`, projetPath);
        if (stashed) execGit('stash pop', projetPath);
        warn('propagate: cherry-pick failed:', cherry.stderr);
        return { success: false, error: cherry.stderr };
    }

    // Push main (si remote)
    let pushed = { success: false };
    if (hasRemote(projetPath)) {
        pushed = pushMain(projetPath);
        if (!pushed.success) warn('propagate: push failed:', pushed.error);
    }

    // Retour sur wip
    const coBack = execGit(`checkout "${cur}"`, projetPath);
    if (!coBack.ok) warn('propagate: checkout back to wip failed:', coBack.stderr);

    // Pop stash si on avait stashé
    if (stashed) {
        const pop = execGit('stash pop', projetPath);
        if (!pop.ok) warn('propagate: stash pop failed:', pop.stderr);
    }

    return { success: true, pushed: pushed.success, pushedToRemote: pushed.success };
}

/**
 * Commit direct sur main (changements de structure : create folder, rename, etc.)
 * Si on est sur une branche wip, commit d'abord sur wip puis propage à main + push.
 */
function commitOnMain(projetPath, message, filePath = null) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };
    const cur = getCurrentBranch(projetPath);
    if (cur && cur !== 'main') {
        // Commit sur wip pour préserver l'historique de la branche de travail
        const wipResult = commitFile(projetPath, filePath, `struct: ${message}`);
        if (!wipResult.success && !wipResult.empty) {
            warn(`commitOnMain: wip commit failed:`, wipResult.error);
            return wipResult;
        }
        // Propager immédiatement à main + push (si commit non vide)
        if (wipResult.success && !wipResult.empty) {
            const prop = propagateLatestCommitToMain(projetPath);
            if (!prop.success) warn('commitOnMain: propagation failed:', prop.error);
            return { ...wipResult, pushedToRemote: prop.pushed === true };
        }
        return wipResult;
    }
    const result = commitFile(projetPath, filePath, `struct: ${message}`);
    // Auto-push si remote configuré et qu'un commit a bien été créé (pas empty)
    if (result.success && !result.empty && hasRemote(projetPath)) {
        const pushed = pushMain(projetPath);
        if (!pushed.success) warn('commitOnMain: auto-push failed:', pushed.error);
    }
    return result;
}

function hasRemote(projetPath) {
    if (!isRepo(projetPath)) return false;
    const r = execGit('remote', projetPath);
    return r.ok && r.stdout.length > 0;
}

/**
 * Récupère l'URL du remote 'origin'. Retourne null si absent.
 */
function getRemoteUrl(projetPath) {
    if (!isRepo(projetPath)) return null;
    const r = execGit('remote get-url origin', projetPath);
    return r.ok ? r.stdout : null;
}

/**
 * Configure le remote 'origin' (ajoute s'il manque, met à jour sinon).
 * url contient typiquement un token — ne JAMAIS logger l'url complète.
 */
function setRemote(projetPath, url) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };
    if (!url) return { success: false, error: 'url required' };
    const existing = execGit('remote get-url origin', projetPath);
    if (existing.ok) {
        const r = execGit(`remote set-url origin "${url}"`, projetPath);
        if (!r.ok) {
            warn('remote set-url failed:', r.stderr);
            return { success: false, error: r.stderr };
        }
        return { success: true, updated: true };
    }
    const r = execGit(`remote add origin "${url}"`, projetPath);
    if (!r.ok) {
        warn('remote add failed:', r.stderr);
        return { success: false, error: r.stderr };
    }
    return { success: true, added: true };
}

function pushMain(projetPath) {
    if (!isRepo(projetPath)) return { success: false, error: 'not a repo' };
    if (!hasRemote(projetPath)) return { success: false, error: 'no remote', skipped: true };
    let r = execGit('push origin main', projetPath);
    if (r.ok) return { success: true };

    // Non-fast-forward : remote a divergé. On essaie une intégration automatique.
    const isNonFf = /non-fast-forward|rejected|failed to push some refs/i.test(r.stderr || '');
    if (!isNonFf) {
        warn('push failed:', r.stderr);
        return { success: false, error: r.stderr };
    }

    warn('push rejected (non-ff), tentative pull --rebase puis push à nouveau');
    // Doit être sur main pour rebase
    const curBranch = getCurrentBranch(projetPath);
    if (curBranch !== 'main') {
        const co = execGit('checkout main', projetPath);
        if (!co.ok) {
            warn('pushMain rebase: checkout main failed:', co.stderr);
            return { success: false, error: r.stderr };
        }
    }
    const fetch = execGit('fetch origin main', projetPath);
    if (!fetch.ok) {
        warn('pushMain rebase: fetch failed:', fetch.stderr);
        return { success: false, error: fetch.stderr };
    }
    const rebase = execGit('rebase origin/main', projetPath);
    if (!rebase.ok) {
        warn('pushMain rebase: conflit, abort →', rebase.stderr);
        execGit('rebase --abort', projetPath);
        // Dernier recours : force-with-lease pour ne pas écraser un push concurrent
        warn('pushMain rebase: tentative push --force-with-lease');
        const force = execGit('push origin main --force-with-lease', projetPath);
        if (force.ok) return { success: true, forced: true };
        warn('pushMain force-with-lease failed:', force.stderr);
        return { success: false, error: rebase.stderr };
    }
    // Re-push après rebase
    r = execGit('push origin main', projetPath);
    if (!r.ok) {
        warn('pushMain rebase: re-push failed:', r.stderr);
        return { success: false, error: r.stderr };
    }
    return { success: true, rebased: true };
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
    // S'assurer d'être sur main avant le merge (on peut être sur une wip branch)
    const curBranch = getCurrentBranch(projetPath);
    if (curBranch && curBranch !== 'main') {
        const co = execGit('checkout main', projetPath);
        if (!co.ok) warn('pullMain: checkout main failed:', co.stderr);
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
    propagateLatestCommitToMain,
    pushMain,
    pullMain,
    hasRemote,
    getRemoteUrl,
    setRemote,
    getSyncStatus
};
