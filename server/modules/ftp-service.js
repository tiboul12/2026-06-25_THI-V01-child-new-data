const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');

/**
 * Construit la config FTP depuis une ligne frank_projects
 */
function buildConfig(row) {
    return {
        server: row.backup_server,
        username: row.backup_username,
        password: row.backup_password,
        port: row.backup_port || 21,
        directory: row.backup_directory || '/'
    };
}

/**
 * Teste la connexion FTP. Lance une exception si échec.
 */
async function testConnection({ server, username, password, port, directory }) {
    const client = new ftp.Client(10000);
    try {
        await client.access({ host: server, user: username, password, port: port || 21, secure: false });
        if (directory && directory !== '/') {
            await client.cd(directory);
        }
        return { success: true };
    } finally {
        client.close();
    }
}

/**
 * Retourne la liste des fichiers distants (chemin relatif au directory)
 * avec leur taille et date de modification.
 */
async function listRemoteFiles({ server, username, password, port, directory }) {
    const client = new ftp.Client(30000);
    const files = [];
    try {
        await client.access({ host: server, user: username, password, port: port || 21, secure: false });
        const baseDir = directory || '/';
        const walk = async (remoteDir, relativeBase) => {
            await client.cd(remoteDir);
            const list = await client.list();
            for (const item of list) {
                const rel = relativeBase ? `${relativeBase}/${item.name}` : item.name;
                if (item.type === ftp.FileType.Directory) {
                    await walk(`${remoteDir}/${item.name}`, rel);
                    await client.cd(remoteDir);
                } else {
                    files.push({ path: rel, size: item.size, date: item.modifiedAt });
                }
            }
        };
        await walk(baseDir, '');
        return files;
    } finally {
        client.close();
    }
}

/**
 * Uploade un fichier local vers le FTP.
 * remotePath = chemin relatif au directory de base.
 */
async function uploadFile({ server, username, password, port, directory }, localPath, remotePath) {
    const client = new ftp.Client(60000);
    try {
        await client.access({ host: server, user: username, password, port: port || 21, secure: false });
        const baseDir = directory || '/';
        const remoteFullPath = `${baseDir}/${remotePath}`.replace(/\/+/g, '/');
        const remoteDir = path.posix.dirname(remoteFullPath);
        await client.ensureDir(remoteDir);
        await client.uploadFrom(localPath, remoteFullPath);
    } finally {
        client.close();
    }
}

/**
 * Uploade plusieurs fichiers en une seule connexion FTP.
 * fileList = [{ localPath, remotePath }]
 * remotePath = chemin relatif au directory de base.
 */
async function uploadFiles({ server, username, password, port, directory }, fileList) {
    if (!fileList || fileList.length === 0) return { uploaded: 0, errors: [] };
    const client = new ftp.Client(120000);
    const errors = [];
    let uploaded = 0;
    try {
        await client.access({ host: server, user: username, password, port: port || 21, secure: false });
        const baseDir = (directory || '/').replace(/\/?$/, '/');
        for (const f of fileList) {
            try {
                if (!fs.existsSync(f.localPath)) continue;
                const remoteFullPath = (baseDir + f.remotePath).replace(/\/+/g, '/');
                const remoteDir = path.posix.dirname(remoteFullPath);
                await client.ensureDir(remoteDir);
                // Revenir au répertoire parent pour uploader
                await client.cd(remoteDir);
                await client.uploadFrom(f.localPath, path.posix.basename(remoteFullPath));
                uploaded++;
            } catch (e) {
                errors.push({ path: f.remotePath, error: e.message });
            }
        }
    } finally {
        client.close();
    }
    return { uploaded, errors };
}

/**
 * Télécharge un fichier depuis FTP vers le disque local.
 * remotePath = chemin relatif au directory de base.
 */
async function downloadFile({ server, username, password, port, directory }, remotePath, localPath) {
    const client = new ftp.Client(60000);
    try {
        await client.access({ host: server, user: username, password, port: port || 21, secure: false });
        const baseDir = (directory || '/').replace(/\/?$/, '/');
        const remoteFullPath = (baseDir + remotePath).replace(/\/+/g, '/');
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        await client.downloadTo(localPath, remoteFullPath);
    } finally {
        client.close();
    }
}

/**
 * Récupère la config FTP d'un projet depuis frank_projects.
 * projectName = UUID du projet (= nom du dossier local).
 * Retourne null si le projet n'a pas de backup_type 'ftp'.
 */
async function getFtpConfig(pool, projectName) {
    const [rows] = await pool.query(
        'SELECT backup_type, backup_server, backup_username, backup_password, backup_port, backup_directory FROM frank_projects WHERE id = ?',
        [projectName]
    );
    if (!rows.length || rows[0].backup_type !== 'ftp') return null;
    return buildConfig(rows[0]);
}

/**
 * Retourne le backup_type d'un projet depuis frank_projects.
 */
async function getBackupType(pool, projectName) {
    const [rows] = await pool.query('SELECT backup_type FROM frank_projects WHERE id = ?', [projectName]);
    return rows[0]?.backup_type || null;
}

module.exports = { testConnection, listRemoteFiles, uploadFile, uploadFiles, downloadFile, getFtpConfig, getBackupType };
