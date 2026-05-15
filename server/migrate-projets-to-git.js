/**
 * Worganic - Migration des projets existants vers git
 *
 * Parcourt data/projets/{nom}/ et fait un git init + premier commit
 * sur tout projet qui n'a pas encore de répertoire .git/.
 *
 * Usage : node server/migrate-projets-to-git.js
 *         node server/migrate-projets-to-git.js --dry-run   (liste seulement)
 */

const fs = require('fs');
const path = require('path');
const projetGit = require('./modules/projet-git');

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECTS_DIR = path.join(__dirname, '..', 'data', 'projets');

if (!fs.existsSync(PROJECTS_DIR)) {
    console.error(`[Migration] Dossier introuvable : ${PROJECTS_DIR}`);
    process.exit(1);
}

const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .filter(e => e.name !== 'conversations'); // dossier système

const todo = [];
const skipped = [];
for (const e of entries) {
    const dir = path.join(PROJECTS_DIR, e.name);
    const configPath = path.join(dir, 'config.json');
    if (!fs.existsSync(configPath)) {
        skipped.push({ name: e.name, reason: 'pas de config.json' });
        continue;
    }
    if (projetGit.isRepo(dir)) {
        skipped.push({ name: e.name, reason: 'déjà un repo git' });
        continue;
    }
    todo.push({ name: e.name, path: dir });
}

console.log(`[Migration] ${todo.length} projet(s) à initialiser, ${skipped.length} ignoré(s)`);
if (skipped.length) {
    console.log('\nIgnorés :');
    skipped.forEach(s => console.log(`  - ${s.name} (${s.reason})`));
}

if (DRY_RUN) {
    console.log('\nÀ initialiser (dry-run) :');
    todo.forEach(t => console.log(`  - ${t.name}`));
    console.log('\nRelance sans --dry-run pour exécuter.');
    process.exit(0);
}

let okCount = 0;
let errCount = 0;
for (const t of todo) {
    process.stdout.write(`  ${t.name} ... `);
    const r = projetGit.initProjetRepo(t.path, {
        authorName: 'Worganic Migration',
        authorEmail: 'migration@local'
    });
    if (r.success) {
        console.log('OK');
        okCount++;
    } else {
        console.log(`ÉCHEC (${r.error})`);
        errCount++;
    }
}

console.log(`\n[Migration] Terminé : ${okCount} OK, ${errCount} échec(s)`);
process.exit(errCount > 0 ? 1 : 0);
