/**
 * deploy-log.js — Enregistre un déploiement en BDD et met à jour version.json
 * À exécuter depuis la racine du projet UNIQUEMENT après un push sur main.
 *
 * Usage :
 *   node server/deploy-log.js \
 *     --version "B0.049" \
 *     --commit "vB0.049 - 20260524 - AMELIORATION - Titre" \
 *     --description "Ce qui a été fait" \
 *     --ai "Claude Code" \
 *     --model "claude-sonnet-4-6" \
 *     --mods "mod-001, mod-002" \
 *     --files "apps/portail/src/...,libs/shared/..."
 *     --scope "portail,libs"
 */

const path = require('path');
const fs   = require('fs');
const pool = require('./db');

const VERSION_FILE = path.join(__dirname, '..', 'version.json');

function arg(name) {
    const idx = process.argv.indexOf(`--${name}`);
    return idx !== -1 ? process.argv[idx + 1] : '';
}

async function run() {
    const version     = arg('version');
    const commitName  = arg('commit');
    const description = arg('description');
    const ai          = arg('ai') || 'Claude Code';
    const model       = arg('model') || 'claude-sonnet-4-6';
    const modIds      = arg('mods') || '';
    const filesRaw    = arg('files') || '';
    const scope       = arg('scope') || '';
    const features    = arg('features') || '';
    const deployedBy  = arg('deployed-by') || process.env.USERNAME || process.env.USER || ai;

    if (!version || !commitName) {
        console.error('Usage: node server/deploy-log.js --version "BX.XXX" --commit "titre" [options]');
        process.exit(1);
    }

    const files = filesRaw ? JSON.stringify(filesRaw.split(',').map(f => f.trim())) : '[]';

    await pool.query(
        `INSERT INTO app_deployments
         (version, commit_name, deployed_by, description, files_modified, ai, model, mod_ids, scope, features)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [version, commitName, deployedBy, description, files, ai, model, modIds, scope, features]
    );

    // Mettre à jour version.json local pour que le check soit à jour
    fs.writeFileSync(VERSION_FILE, JSON.stringify({ version }, null, 2), 'utf8');

    console.log(`[deploy-log] ✓ v${version} enregistrée en BDD et version.json mis à jour.`);
    process.exit(0);
}

run().catch(e => {
    console.error('[deploy-log] Erreur :', e.message);
    process.exit(1);
});
