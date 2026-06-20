#!/usr/bin/env node
/**
 * Lanceur de tests de recette IA via Antigravity (agy).
 * 
 * Permet d'exécuter des tests automatiques sur les fonctionnalités du projet 
 * répertoriées dans tests/fonctions/_registry.json et décrites dans les fichiers fonctions.md.
 * 
 * Usage:
 *   node tests/run-recette-cli.js --all
 *   node tests/run-recette-cli.js --folder 2-5-2
 *   node tests/run-recette-cli.js --id 1-1-2
 *   node tests/run-recette-cli.js --id 1-1-2 --model gemini-3.5-flash
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const FONCTIONS_DIR = path.join(BASE_DIR, 'tests', 'fonctions');
const REGISTRY_FILE = path.join(FONCTIONS_DIR, '_registry.json');

/**
 * Résout le chemin absolu de l'exécutable agy (pour un spawn direct, sans cmd.exe).
 * IMPORTANT : agy -p n'écrit PAS sur stdout (cf. memory antigravity-cli-provider) ; on
 * communique donc avec lui par fichiers. Le spawn direct évite aussi la casse des " et la
 * limite de longueur de ligne de commande de cmd.exe.
 */
function resolveAgyPath() {
    try {
        const cmd = process.platform === 'win32' ? 'where agy' : 'which agy';
        const out = execSync(cmd, { encoding: 'utf8' });
        const first = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
        return first || 'agy';
    } catch (e) {
        return 'agy';
    }
}

// --- Helpers de parsing ---

function loadRegistry() {
    try {
        if (fs.existsSync(REGISTRY_FILE)) {
            return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error(`\x1b[31m[ERREUR] Impossible de charger le registre des fonctions : ${e.message}\x1b[0m`);
    }
    return {};
}

function buildPathToId(registry) {
    const inv = {};
    for (const [id, p] of Object.entries(registry)) {
        inv[p] = id;
    }
    return inv;
}

function parseFonctionsMd(relPath, content, pathToId) {
    const lines = content.split('\n');
    let pageTitle = '';
    const items = [];
    const folderId = pathToId[relPath] || relPath;
    let fallbackIdx = 0;
    let currentItem = null;
    let contentLines = [];

    const flushItem = () => {
        if (currentItem) {
            const cleaned = contentLines
                .filter(l => l.trim() !== '---')
                .join('\n')
                .trim();
            currentItem.content = cleaned;
            items.push(currentItem);
        }
        currentItem = null;
        contentLines = [];
    };

    for (const line of lines) {
        if (line.startsWith('# ') && !pageTitle) {
            pageTitle = line.slice(2).trim();
        } else if (line.startsWith('## ')) {
            flushItem();
            const raw = line.slice(3).trim();
            const m = raw.match(/^`([0-9-]+)`\s*[—–-]\s*(.+)$/);
            const id = m ? m[1] : `${folderId}-${++fallbackIdx}`;
            const section = m ? m[2].trim() : raw;
            currentItem = { id, folderId, path: relPath, pageTitle, section, content: '' };
        } else if (currentItem) {
            contentLines.push(line);
        }
    }
    flushItem();
    return items;
}

function scanAllFunctions(registry) {
    if (!fs.existsSync(FONCTIONS_DIR)) return [];
    const pathToId = buildPathToId(registry);
    const items = [];

    function walk(dir, relBase) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const entry of entries) {
            if (entry.name.startsWith('_')) continue;
            const fullPath = path.join(dir, entry.name);
            const relativeBase = relBase ? `${relBase}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                walk(fullPath, relativeBase);
            } else if (entry.name === 'fonctions.md') {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    items.push(...parseFonctionsMd(relBase || '', content, pathToId));
                } catch (e) {
                    console.error(`[SCAN] Erreur dans ${entry.name}:`, e.message);
                }
            }
        }
    }

    walk(FONCTIONS_DIR, '');
    return items;
}

// --- Construction du prompt IA (échange par fichiers) ---

/** Détail des fonctions à tester, écrit dans un fichier que agy lira (prompt court). */
function buildTaskSpec(items) {
    const fnList = items.map(it => {
        const tasks = (it.content || '').trim();
        return `### ${it.id} — ${it.section} (Page: ${it.pageTitle})\n${tasks || '(Pas de détail de scénario)'}`;
    }).join('\n\n');
    return `Liste des fonctions à tester (${items.length}) :\n\n${fnList}\n`;
}

/**
 * Prompt court passé à `agy -p`. Il référence le fichier de tâches (à lire) et le fichier
 * de résultats (à écrire) — car agy n'émet rien sur stdout, mais sait écrire des fichiers.
 */
function buildShortPrompt(taskFile, outFile, count) {
    const tf = taskFile.replace(/\\/g, '/');
    const of = outFile.replace(/\\/g, '/');
    return `Tu es un testeur QA d'élite. L'application Worganic est lancée et configurée (les serveurs tournent).

Étape 1 — Lis le fichier de tâches : ${tf}
   Il décrit ${count} fonctionnalité(s) à tester, chacune avec son identifiant et ses scénarios.

Étape 2 — Évalue RÉELLEMENT chaque fonctionnalité : via tes outils navigateur/MCP si disponibles, sinon par requêtes API locales et/ou LECTURE DU CODE SOURCE du projet (composants Angular, routes serveur). Détermine un verdict pour CHAQUE fonction.

Étape 3 — TA SEULE LIVRAISON : utilise ton OUTIL D'ÉCRITURE DE FICHIER pour écrire dans ${of}.
   N'écris RIEN dans ta réponse texte — tout passe par ce fichier.
   Pour CHAQUE fonction, ajoute (append) une ligne au format EXACT, dès qu'elle est évaluée (pas à la fin) :
   @@TEST_RESULT@@{"itemId":"<id>","status":"ok|ko|nd","note":"<courte note>"}
   Si tu ne peux pas trancher une fonction, écris quand même sa ligne avec status "nd".
   Ne mets rien d'autre sur ces lignes sentinelles.

Règles de statut : "ok" = opérationnelle et conforme ; "ko" = bug/anomalie détecté ; "nd" = non déterminable.
COMMENCE MAINTENANT et assure-toi d'écrire les ${count} ligne(s) dans le fichier.`;
}

/** Parse toutes les lignes @@TEST_RESULT@@ d'un contenu de fichier (dédup par itemId, dernier gagne). */
function parseResultsFile(content) {
    const out = {};
    if (!content) return out;
    for (const line of content.split('\n')) {
        const idx = line.indexOf('@@TEST_RESULT@@');
        if (idx === -1) continue;
        try {
            const obj = JSON.parse(line.slice(idx + '@@TEST_RESULT@@'.length).trim());
            if (obj && obj.itemId) out[obj.itemId] = { status: obj.status, note: obj.note || '' };
        } catch (e) { /* ligne incomplète, ignorée */ }
    }
    return out;
}

// --- Main ---

async function main() {
    const args = process.argv.slice(2);
    
    // Parse arguments
    let targetAll = false;
    let targetFolder = null;
    let targetId = null;
    let model = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--all' || args[i] === '-a') {
            targetAll = true;
        } else if (args[i] === '--folder' || args[i] === '-f') {
            targetFolder = args[++i];
        } else if (args[i] === '--id' || args[i] === '-i') {
            targetId = args[++i];
        } else if (args[i] === '--model' || args[i] === '-m') {
            model = args[++i];
        } else if (args[i] === '--help' || args[i] === '-h') {
            printHelp();
            process.exit(0);
        }
    }

    if (!targetAll && !targetFolder && !targetId) {
        console.log("\x1b[33mAucun filtre spécifié. Utilise --help pour voir les options.\x1b[0m");
        printHelp();
        process.exit(1);
    }

    const registry = loadRegistry();
    const allFunctions = scanAllFunctions(registry);

    if (allFunctions.length === 0) {
        console.error("\x1b[31m[ERREUR] Aucune fonction trouvée dans le référentiel tests/fonctions/.\x1b[0m");
        process.exit(1);
    }

    // Filtrage
    let itemsToTest = [];
    if (targetAll) {
        itemsToTest = allFunctions;
    } else if (targetFolder) {
        itemsToTest = allFunctions.filter(f => f.folderId === targetFolder || f.id.startsWith(targetFolder + '-'));
    } else if (targetId) {
        itemsToTest = allFunctions.filter(f => f.id === targetId);
    }

    if (itemsToTest.length === 0) {
        console.error(`\x1b[31m[ERREUR] Aucune fonction ne correspond au filtre demandé. (Folder: ${targetFolder}, ID: ${targetId})\x1b[0m`);
        process.exit(1);
    }

    console.log(`\n\x1b[36m=== Lancement des tests de recette IA ===\x1b[0m`);
    console.log(`Fonctions sélectionnées : \x1b[32m${itemsToTest.length}\x1b[0m`);
    itemsToTest.forEach(it => {
        console.log(`  • [${it.id}] ${it.section} (${it.pageTitle})`);
    });
    console.log(`\nPréparation du prompt IA...`);

    // Fichiers d'échange avec agy (il ne parle pas sur stdout → on passe par des fichiers).
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recette-agy-'));
    const taskFile = path.join(tmpDir, 'taches.md');
    const outFile = path.join(tmpDir, 'resultats.txt');
    fs.writeFileSync(taskFile, buildTaskSpec(itemsToTest), 'utf8');
    fs.writeFileSync(outFile, '', 'utf8');

    const prompt = buildShortPrompt(taskFile, outFile, itemsToTest.length);

    // Lancement de agy — spawn DIRECT (pas de cmd.exe) pour éviter la casse des " et la limite de longueur.
    const agyPath = resolveAgyPath();
    console.log(`Lancement de l'agent Antigravity (agy)...`);
    console.log(`\x1b[90m  agy: ${agyPath}\x1b[0m`);
    console.log(`\x1b[90m  fichier résultats: ${outFile}\x1b[0m`);

    const agyArgs = ['-p', prompt];
    if (model) agyArgs.push('--model', model);
    agyArgs.push('--dangerously-skip-permissions');

    const startTime = Date.now();

    const results = {};
    itemsToTest.forEach(it => { results[it.id] = { status: 'pending', note: '' }; });

    const child = spawn(agyPath, agyArgs, {
        cwd: BASE_DIR,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']   // stdin fermé (sinon agy -p reste bloqué)
    });

    // stdout/stderr d'agy sont quasi muets en print mode, mais on les grise au cas où.
    child.stdout.on('data', (data) => process.stdout.write(`\x1b[90m${data.toString()}\x1b[0m`));
    child.stderr.on('data', (data) => process.stderr.write(`\x1b[90m${data.toString()}\x1b[0m`));

    // Suivi LIVE : on relit le fichier de résultats toutes les secondes et on affiche les nouveautés.
    const applyResults = () => {
        let content = '';
        try { content = fs.readFileSync(outFile, 'utf8'); } catch (e) { return; }
        const parsed = parseResultsFile(content);
        for (const [id, res] of Object.entries(parsed)) {
            if (results[id] && results[id].status === 'pending' && res.status) {
                results[id] = { status: res.status, note: res.note };
                const icon = res.status === 'ok' ? '\x1b[32m✓ OK\x1b[0m' : (res.status === 'ko' ? '\x1b[31m✗ KO\x1b[0m' : '\x1b[33m? ND\x1b[0m');
                console.log(`\x1b[1m[RÉSULTAT IA] ${id} -> ${icon}${res.note ? ` (${res.note})` : ''}\x1b[0m`);
            }
        }
    };
    const poller = setInterval(applyResults, 1000);

    child.on('close', (code) => {
        clearInterval(poller);
        applyResults();   // lecture finale
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n\x1b[36m=== FIN DES TESTS DE RECETTE IA ===\x1b[0m (Durée: ${duration}s, Code sortie agy: ${code})`);

        let passed = 0, failed = 0, pending = 0;
        console.log(`\nBilan de la session :`);
        itemsToTest.forEach(it => {
            const res = results[it.id];
            let statusStr;
            if (res.status === 'ok') { passed++; statusStr = '\x1b[32m[✓ PASS]\x1b[0m'; }
            else if (res.status === 'ko') { failed++; statusStr = `\x1b[31m[✗ FAIL]\x1b[0m - ${res.note || 'Aucune note'}`; }
            else { pending++; statusStr = `\x1b[33m[? PEND/ND]\x1b[0m - ${res.note || 'Non évalué'}`; }
            console.log(`  ${statusStr} ${it.id} — ${it.section}`);
        });
        console.log(`\n\x1b[1mStatistiques : ${passed} OK, ${failed} KO, ${pending} restants / non testables sur ${itemsToTest.length} au total.\x1b[0m`);

        if (pending === itemsToTest.length) {
            console.log(`\n\x1b[33m[!] Aucun résultat écrit par agy. Vérifie : agy authentifié (agy models doit lister des modèles), serveurs lancés, et que agy a accès aux outils nécessaires (Browser MCP) pour tester réellement.\x1b[0m`);
        }
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* nettoyage best-effort */ }
        process.exit(failed > 0 ? 1 : 0);
    });

    child.on('error', (err) => {
        clearInterval(poller);
        console.error(`\n\x1b[31m[ERREUR FATALE] Impossible de démarrer Antigravity CLI (agy) : ${err.message}\x1b[0m`);
        console.error(`Vérifie que la commande 'agy' est bien installée et dans le PATH.`);
        process.exit(1);
    });
}

function printHelp() {
    console.log(`
Utilitaire CLI pour lancer les tests de recette automatisés avec Antigravity (agy).

Options :
  -a, --all             Teste toutes les fonctions répertoriées dans le registre.
  -f, --folder <id>     Filtre les tests par ID de dossier (ex: 2-5-2).
  -i, --id <id>         Exécute le test pour une fonctionnalité spécifique par son ID (ex: 1-1-2).
  -m, --model <nom>     Spécifie le modèle IA à utiliser pour la session agy (ex: gemini-3.5-flash).
  -h, --help            Affiche cette aide.

Exemples :
  node tests/run-recette-cli.js --id 1-1-2
  node tests/run-recette-cli.js --folder 2-5-2 --model gemini-3.5-flash
  node tests/run-recette-cli.js --all
`);
}

main();
