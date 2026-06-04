/**
 * Migration : déplace les dossiers racines de chaque outil dans un sous-dossier portant
 * le type de l'outil (ex: `edition`).
 *
 * Avant : data/projets/{id}/mon-dossier/
 * Après : data/projets/{id}/edition/mon-dossier/
 *
 * Usage : node server/migrate-project-tool-paths.js [--dry-run]
 */

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');

const PROJECTS_DIR = path.join(__dirname, '..', 'data', 'projets');
const DRY_RUN      = process.argv.includes('--dry-run');

if (DRY_RUN) console.log('[migration] Mode dry-run — aucun fichier ne sera modifié\n');

// ── Helpers ──────────────────────────────────────────────────────────────────

function migrateOutils(config) {
    if (config.outils && config.outils.length > 0) return config;
    const crypto = require('crypto');
    const rootFolderIds = (config.structure || [])
        .filter(n => n.type === 'folder')
        .map(n => n.id);
    config.outils = [{
        id: crypto.randomUUID(),
        type: 'edition',
        name: 'Edition',
        rootFolderIds,
        createdAt: config.createdAt || new Date().toISOString()
    }];
    return config;
}

function updatePathsRecursively(node, oldPrefix, newPrefix) {
    if (node.path === oldPrefix) {
        node.path = newPrefix;
    } else if (node.path.startsWith(oldPrefix + '/')) {
        node.path = newPrefix + node.path.slice(oldPrefix.length);
    }
    if (node.children) node.children.forEach(c => updatePathsRecursively(c, oldPrefix, newPrefix));
}

function tryMysqlUpdate(projectName, config) {
    try {
        const mysql2 = require('mysql2/promise');
        const pool = mysql2.createPool({
            host:     process.env.DB_HOST     || 'localhost',
            user:     process.env.DB_USER     || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME     || 'worganic',
        });
        return pool.query(
            'UPDATE file_project_meta SET structure = ?, outils = ?, updated_at = ? WHERE id = ?',
            [JSON.stringify(config.structure || []), JSON.stringify(config.outils || null), new Date(), projectName]
        ).then(() => pool.end()).catch(e => { console.warn(`  [mysql] ${e.message}`); return pool.end(); });
    } catch (_) { return Promise.resolve(); }
}

// ── Parcours des projets ──────────────────────────────────────────────────────

async function migrateProject(projectName) {
    const projectDir = path.join(PROJECTS_DIR, projectName);
    const cfgPath    = path.join(projectDir, 'config.json');

    if (!fs.existsSync(cfgPath)) return;

    let config;
    try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
    catch (e) { console.warn(`[${projectName}] config.json invalide : ${e.message}`); return; }

    config = migrateOutils(config);

    let changed = false;

    for (const outil of config.outils || []) {
        const outilSlug = outil.type; // 'edition', 'tests', 'code', …
        const rootFolderIds = outil.rootFolderIds || [];

        for (const item of config.structure) {
            if (item.type !== 'folder') continue;
            if (!rootFolderIds.includes(item.id)) continue;

            const oldPath = item.path;
            if (oldPath.startsWith(outilSlug + '/')) {
                console.log(`  [${projectName}] déjà migré : ${oldPath}`);
                continue;
            }

            const newPath  = `${outilSlug}/${oldPath}`;
            const oldFull  = path.join(projectDir, oldPath);
            const newFull  = path.join(projectDir, newPath);
            const outilDir = path.join(projectDir, outilSlug);

            console.log(`  [${projectName}] ${oldPath}  →  ${newPath}`);

            if (!DRY_RUN) {
                fs.mkdirSync(outilDir, { recursive: true });
                if (fs.existsSync(oldFull)) {
                    fs.renameSync(oldFull, newFull);
                } else {
                    // dossier absent du FS : juste mettre à jour les paths en config
                    fs.mkdirSync(newFull, { recursive: true });
                }
                updatePathsRecursively(item, oldPath, newPath);
            }

            changed = true;
        }
    }

    if (!DRY_RUN && changed) {
        config.updatedAt = new Date().toISOString();
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
        await tryMysqlUpdate(projectName, config);
        console.log(`  [${projectName}] config.json sauvegardé`);
    }
}

async function main() {
    if (!fs.existsSync(PROJECTS_DIR)) {
        console.error('PROJECTS_DIR introuvable :', PROJECTS_DIR);
        process.exit(1);
    }

    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'conversations')
        .map(d => d.name);

    console.log(`${entries.length} projet(s) trouvé(s)\n`);

    for (const name of entries) {
        await migrateProject(name);
    }

    console.log('\nMigration terminée.');
}

main().catch(e => { console.error(e); process.exit(1); });
