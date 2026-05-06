/**
 * init-db.js — Crée les tables MySQL sur Hostinger et migre les données JSON
 * Usage : node server/init-db.js
 */
const pool = require('./db');
const fs   = require('fs');
const path = require('path');

const BASE_DIR   = path.join(__dirname, '..', 'data');
const CONFIG_DIR = path.join(BASE_DIR, 'config');

// ── Schéma SQL MySQL ────────────────────────────────────────────────────────

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS users (
        id            CHAR(36)      PRIMARY KEY,
        username      VARCHAR(255)  UNIQUE NOT NULL,
        email         VARCHAR(255)  UNIQUE NOT NULL,
        password_hash VARCHAR(255)  NOT NULL,
        role          VARCHAR(50)   DEFAULT 'user',
        config        JSON          DEFAULT ('{}'),
        created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
        last_login    DATETIME      NULL
    )`,

    `CREATE TABLE IF NOT EXISTS sessions (
        token       VARCHAR(255)  PRIMARY KEY,
        user_id     CHAR(36)      NOT NULL,
        expires_at  DATETIME      NOT NULL,
        INDEX idx_sessions_user (user_id),
        INDEX idx_sessions_expires (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS app_config (
        \`key\`     VARCHAR(255)  PRIMARY KEY,
        value       JSON          NOT NULL,
        updated_at  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS frank_projects (
        id          CHAR(36)      PRIMARY KEY,
        title       VARCHAR(500)  NOT NULL,
        description TEXT          DEFAULT '',
        content     LONGTEXT      DEFAULT '',
        status      VARCHAR(50)   DEFAULT 'draft',
        user_id     CHAR(36)      NULL,
        created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_frank_projects_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS ticket_comments (
        id          VARCHAR(64)   PRIMARY KEY,
        ticket_id   VARCHAR(64)   NOT NULL,
        user_id     VARCHAR(64),
        username    VARCHAR(128),
        text        TEXT          NOT NULL,
        created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS tickets (
        id                 VARCHAR(100)  PRIMARY KEY,
        title              VARCHAR(500)  NOT NULL,
        description        TEXT,
        url                TEXT          DEFAULT '',
        type               VARCHAR(100)  DEFAULT 'bug',
        priority           VARCHAR(50)   DEFAULT 'normale',
        status             VARCHAR(50)   DEFAULT 'signale',
        resolution_comment TEXT          DEFAULT '',
        screenshot_file    VARCHAR(255)  NULL,
        user_id            CHAR(36)      NULL,
        username           VARCHAR(255)  DEFAULT '',
        created_at         DATETIME      DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tickets_user (user_id),
        INDEX idx_tickets_status (status),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS ai_logs (
        id            VARCHAR(100)  PRIMARY KEY,
        timestamp     DATETIME      DEFAULT CURRENT_TIMESTAMP,
        page          TEXT          DEFAULT '',
        section       TEXT          DEFAULT '',
        document_name TEXT          DEFAULT '',
        provider      VARCHAR(100)  DEFAULT '',
        model         VARCHAR(100)  DEFAULT '',
        prompt        LONGTEXT      DEFAULT '',
        response      LONGTEXT      DEFAULT '',
        status        VARCHAR(50)   DEFAULT 'success',
        duration_ms   INT           DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS history (
        id           VARCHAR(50)   PRIMARY KEY,
        date         DATETIME      DEFAULT CURRENT_TIMESTAMP,
        type         VARCHAR(50)   DEFAULT 'feature',
        title        VARCHAR(500)  NULL,
        description  TEXT          NULL,
        files        JSON          DEFAULT ('[]'),
        ai           VARCHAR(100)  DEFAULT '',
        model        VARCHAR(100)  DEFAULT '',
        prompt       LONGTEXT      DEFAULT '',
        started_at   DATETIME      NULL,
        completed_at DATETIME      NULL
    )`,

    `CREATE TABLE IF NOT EXISTS pipeline_projects (
        id         VARCHAR(255)  PRIMARY KEY,
        data       JSON          NOT NULL,
        user_id    CHAR(36)      NULL,
        created_at DATETIME      DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS app_deployments (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        version        VARCHAR(50)   NOT NULL,
        commit_name    VARCHAR(500)  DEFAULT '',
        deployed_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
        deployed_by    VARCHAR(255)  DEFAULT '',
        description    TEXT          DEFAULT '',
        files_modified TEXT          DEFAULT '[]',
        ai             VARCHAR(100)  DEFAULT '',
        model          VARCHAR(100)  DEFAULT '',
        mod_ids        VARCHAR(500)  DEFAULT ''
    )`,

    `CREATE TABLE IF NOT EXISTS wo_action_history (
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
    )`,
];

// ── Helpers ───────────────────────────────────────────────────────────────

function readJson(filePath, fallback = null) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { console.warn(`  ⚠ Cannot read ${filePath}:`, e.message); }
    return fallback;
}

function isValidUUID(str) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ── Migrations ────────────────────────────────────────────────────────────

async function migrateUsers() {
    const users = readJson(path.join(CONFIG_DIR, 'users.json'), []);
    if (!users.length) { console.log('  users: aucun utilisateur à migrer'); return; }
    let count = 0;
    for (const u of users) {
        const userId = isValidUUID(u.id) ? u.id : require('crypto').randomUUID();
        try {
            await pool.query(
                `INSERT IGNORE INTO users (id, username, email, password_hash, role, created_at, last_login)
                 VALUES (?,?,?,?,?,?,?)`,
                [userId, u.username, u.email, u.password, u.role || 'user',
                 u.createdAt || new Date().toISOString(), u.lastLogin || null]
            );
            count++;
        } catch (e) { console.warn(`  ⚠ User ${u.username}: ${e.message}`); }
    }
    console.log(`  users: ${count} migrés`);
}

async function migrateSessions() {
    const sessions = readJson(path.join(CONFIG_DIR, 'sessions.json'), {});
    const now = Date.now();
    let count = 0;
    for (const [token, session] of Object.entries(sessions)) {
        if (session.expiresAt <= now) continue;
        try {
            await pool.query(
                `INSERT IGNORE INTO sessions (token, user_id, expires_at)
                 VALUES (?, ?, FROM_UNIXTIME(? / 1000))`,
                [token, session.userId, session.expiresAt]
            );
            count++;
        } catch (e) { /* ignore foreign key errors */ }
    }
    console.log(`  sessions: ${count} actives migrées`);
}

async function migrateConfig() {
    const conf = readJson(path.join(CONFIG_DIR, 'conf.json'), null);
    if (conf) {
        await pool.query(
            `INSERT INTO app_config (\`key\`, value) VALUES (?,?)
             ON DUPLICATE KEY UPDATE value=VALUES(value)`,
            ['main', JSON.stringify(conf)]
        );
        console.log('  app_config: conf.json migré');
    }
    const aiModels = readJson(path.join(CONFIG_DIR, 'ai-models.json'), null);
    if (aiModels) {
        await pool.query(
            `INSERT INTO app_config (\`key\`, value) VALUES (?,?)
             ON DUPLICATE KEY UPDATE value=VALUES(value)`,
            ['ai-models', JSON.stringify(aiModels)]
        );
        console.log('  app_config: ai-models.json migré');
    }
}

async function migrateFrankProjects() {
    const projects = readJson(path.join(BASE_DIR, 'frankenstein-projects.json'), []);
    if (!projects.length) { console.log('  frank_projects: aucun projet à migrer'); return; }
    let count = 0;
    for (const p of projects) {
        const userId = p.userId && isValidUUID(p.userId) ? p.userId : null;
        try {
            await pool.query(
                `INSERT IGNORE INTO frank_projects (id, title, description, content, status, user_id, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?)`,
                [p.id, p.title, p.description || '', p.content || '',
                 p.status || 'draft', userId, p.createdAt, p.updatedAt]
            );
            count++;
        } catch (e) { console.warn(`  ⚠ Frank project ${p.id}: ${e.message}`); }
    }
    console.log(`  frank_projects: ${count} migrés`);
}

async function migrateTickets() {
    const data = readJson(path.join(BASE_DIR, 'tickets.json'), { tickets: [] });
    const tickets = data.tickets || [];
    if (!tickets.length) { console.log('  tickets: aucun ticket à migrer'); return; }
    let count = 0;
    for (const t of tickets) {
        const userId = t.userId && isValidUUID(t.userId) ? t.userId : null;
        try {
            await pool.query(
                `INSERT IGNORE INTO tickets
                 (id, title, description, url, type, priority, status, resolution_comment, screenshot_file, user_id, username, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [t.id, t.title, t.description || '', t.url || '',
                 t.type || 'bug', t.priority || 'normale', t.status || 'signale',
                 t.resolutionComment || '', t.screenshotFile || null,
                 userId, t.username || '', t.createdAt || new Date().toISOString()]
            );
            count++;
        } catch (e) { console.warn(`  ⚠ Ticket ${t.id}: ${e.message}`); }
    }
    console.log(`  tickets: ${count} migrés`);
}

async function migrateAiLogs() {
    const logs = readJson(path.join(BASE_DIR, 'ai-logs.json'), []);
    if (!logs.length) { console.log('  ai_logs: aucun log à migrer'); return; }
    let count = 0;
    for (const l of logs) {
        try {
            await pool.query(
                `INSERT IGNORE INTO ai_logs
                 (id, timestamp, page, section, document_name, provider, model, prompt, response, status, duration_ms)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [l.id, l.timestamp || new Date().toISOString(),
                 l.page || '', l.section || '', l.documentName || '',
                 l.provider || '', l.model || '',
                 l.prompt || '', l.response || '',
                 l.status || 'success', l.durationMs || 0]
            );
            count++;
        } catch (e) { console.warn(`  ⚠ AI log ${l.id}: ${e.message}`); }
    }
    console.log(`  ai_logs: ${count} migrés`);
}

async function migrateHistory() {
    const data = readJson(path.join(BASE_DIR, 'histoModif.json'), { modifications: [] });
    const mods = data.modifications || [];
    if (!mods.length) { console.log('  history: aucune entrée à migrer'); return; }
    let count = 0;
    for (const m of mods) {
        try {
            await pool.query(
                `INSERT IGNORE INTO history
                 (id, date, type, title, description, files, ai, model, prompt, started_at, completed_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [m.id, m.date, m.type || 'feature',
                 m.title || '', m.description || '',
                 JSON.stringify(m.files || []),
                 m.ai || '', m.model || '', m.prompt || '',
                 m.startedAt || null, m.completedAt || null]
            );
            count++;
        } catch (e) { console.warn(`  ⚠ History ${m.id}: ${e.message}`); }
    }
    console.log(`  history: ${count} entrées migrées`);
}

async function migratePipelineProjects() {
    const projetsDir = path.join(BASE_DIR, 'projets');
    if (!fs.existsSync(projetsDir)) { console.log('  pipeline_projects: dossier projets absent'); return; }
    const dirs = fs.readdirSync(projetsDir).filter(d =>
        fs.statSync(path.join(projetsDir, d)).isDirectory()
    );
    let count = 0;
    for (const dir of dirs) {
        const pjPath = path.join(projetsDir, dir, 'project.json');
        if (!fs.existsSync(pjPath)) continue;
        try {
            const pj = JSON.parse(fs.readFileSync(pjPath, 'utf-8'));
            const userId = pj.userId && isValidUUID(pj.userId) ? pj.userId : null;
            await pool.query(
                `INSERT INTO pipeline_projects (id, data, user_id, created_at, updated_at)
                 VALUES (?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=VALUES(updated_at)`,
                [pj.id || dir, JSON.stringify(pj), userId,
                 pj.createdAt || new Date().toISOString(),
                 pj.updatedAt || new Date().toISOString()]
            );
            count++;
        } catch (e) { console.warn(`  ⚠ Pipeline project ${dir}: ${e.message}`); }
    }
    console.log(`  pipeline_projects: ${count} migrés`);
}

async function alterDeploymentsTable() {
    // Ajoute les nouvelles colonnes si elles n'existent pas encore (MySQL 8.0+)
    const newCols = [
        `ALTER TABLE app_deployments ADD COLUMN description    TEXT         DEFAULT ''`,
        `ALTER TABLE app_deployments ADD COLUMN files_modified TEXT         DEFAULT '[]'`,
        `ALTER TABLE app_deployments ADD COLUMN ai             VARCHAR(100) DEFAULT ''`,
        `ALTER TABLE app_deployments ADD COLUMN model          VARCHAR(100) DEFAULT ''`,
        `ALTER TABLE app_deployments ADD COLUMN mod_ids        VARCHAR(500) DEFAULT ''`,
        `ALTER TABLE app_deployments ADD COLUMN scope          VARCHAR(255) DEFAULT ''`,
        `ALTER TABLE app_deployments ADD COLUMN features       VARCHAR(500) DEFAULT ''`,
    ];
    for (const sql of newCols) {
        try {
            await pool.query(sql);
        } catch (e) {
            // 1060 = Duplicate column name — colonne déjà présente, on ignore
            if (e.errno !== 1060) console.warn(`  ⚠ alter deployments: ${e.message}`);
        }
    }
    console.log('  app_deployments: colonnes détaillées vérifiées');
}

async function migrateDeployments() {
    // Lit depuis version.json s'il existe pour créer un déploiement initial
    const versionFile = path.join(__dirname, '..', 'version.json');
    const vf = readJson(versionFile, null);
    if (!vf || !vf.version) { console.log('  app_deployments: pas de version.json'); return; }
    try {
        await pool.query(
            `INSERT IGNORE INTO app_deployments (version, commit_name, deployed_by)
             VALUES (?,?,?)`,
            [vf.version, vf.commitName || '', vf.deployedBy || 'migration']
        );
        console.log(`  app_deployments: version ${vf.version} migrée`);
    } catch (e) { console.warn(`  ⚠ Deployment: ${e.message}`); }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n🚀 Initialisation de la base de données MySQL (Hostinger)...\n');

    console.log('📋 Création des tables...');
    for (const stmt of SCHEMA_STATEMENTS) {
        await pool.query(stmt);
    }
    console.log('  ✓ Tables créées\n');

    console.log('📦 Migration des données JSON...');
    await migrateUsers();
    await migrateSessions();
    await migrateConfig();
    await migrateFrankProjects();
    await migrateTickets();
    await migrateAiLogs();
    await migrateHistory();
    await migratePipelineProjects();
    await alterDeploymentsTable();
    await migrateDeployments();

    console.log('\n✅ Migration terminée avec succès !');
    await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
