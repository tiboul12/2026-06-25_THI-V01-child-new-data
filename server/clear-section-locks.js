/**
 * Nettoyage des verrous de section (projet_section_lock) d'un projet.
 *
 * Usage :
 *   node server/clear-section-locks.js --projet <projetId> [--list] [--delete]
 *
 *   --list    : affiche les verrous existants (lecture seule) — comportement par défaut
 *   --delete  : supprime TOUS les verrous du projet
 *
 * Exemple :
 *   node server/clear-section-locks.js --projet 10838b62-0f44-407d-... --list
 *   node server/clear-section-locks.js --projet 10838b62-0f44-407d-... --delete
 */
const pool = require('./db');

function arg(name) {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(name);

(async () => {
    const projetId = arg('--projet');
    if (!projetId) {
        console.error('Erreur : --projet <projetId> requis.');
        process.exit(1);
    }
    try {
        const [locks] = await pool.query(
            'SELECT node_id, locked_by_id, locked_by_name, locked_at FROM projet_section_lock WHERE projet_id = ?',
            [projetId]
        );
        console.log(`\nVerrous trouvés pour le projet ${projetId} : ${locks.length}`);
        for (const l of locks) {
            console.log(`  - node ${l.node_id} | par ${l.locked_by_name} (${l.locked_by_id}) | ${l.locked_at}`);
        }

        if (has('--delete')) {
            const [r] = await pool.query('DELETE FROM projet_section_lock WHERE projet_id = ?', [projetId]);
            console.log(`\n✓ ${r.affectedRows} verrou(x) supprimé(s).`);
        } else {
            console.log('\n(lecture seule — ajouter --delete pour supprimer)');
        }
    } catch (e) {
        console.error('Erreur :', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
