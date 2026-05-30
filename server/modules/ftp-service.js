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
 * Synchronise FTP et local avec la structure attendue (source de vérité = BDD).
 *  - Walk FTP : télécharge les fichiers attendus, supprime du FTP ce qui n'est pas attendu
 *  - Walk local : supprime ce qui n'est pas attendu
 * expectedFiles = Set<string> de chemins POSIX relatifs des fichiers attendus
 * expectedDirs  = Set<string> de chemins POSIX relatifs des dossiers attendus
 * preservePaths = chemins relatifs/noms à ne jamais supprimer (.git, config.json…)
 * Retourne { downloaded, deletedLocal, deletedRemote, errors }
 */
async function syncFromFtp(ftpCfg, subdirectory, localBase, expectedFiles, expectedDirs, preservePaths = []) {
    const { server, username, password, port, directory } = ftpCfg;
    const errors = [];
    let downloaded = 0;
    let deletedLocal = 0;
    let deletedRemote = 0;
    const preserveSet = new Set(preservePaths.map(p => p.replace(/\\/g, '/')));
    const baseDir = (directory || '/').replace(/\/?$/, '/');
    const startDir = (baseDir + subdirectory).replace(/\/+/g, '/');

    // ── PHASE 1 : Walk FTP, lister tous les items, télécharger les fichiers attendus
    const allDirs = [];   // [{ relPath, fullPath, depth }]
    const allFiles = [];  // [{ relPath, fullPath }]
    {
        const client = new ftp.Client(180000);
        try {
            await client.access({ host: server, user: username, password, port: port || 21, secure: false });
            const walk = async (remoteDir, relBase, depth) => {
                let list;
                try {
                    await client.cd(remoteDir);
                    list = await client.list();
                } catch (e) {
                    errors.push({ path: remoteDir, error: `FTP list: ${e.message}` });
                    return;
                }
                for (const item of list) {
                    const relPath = relBase ? `${relBase}/${item.name}` : item.name;
                    const fullPath = `${remoteDir}/${item.name}`;
                    if (preserveSet.has(relPath) || preserveSet.has(item.name)) continue;
                    if (item.type === ftp.FileType.Directory) {
                        allDirs.push({ relPath, fullPath, depth });
                        await walk(fullPath, relPath, depth + 1);
                        try { await client.cd(remoteDir); } catch {/* best effort */}
                    } else {
                        allFiles.push({ relPath, fullPath });
                        if (expectedFiles.has(relPath)) {
                            const localPath = path.join(localBase, relPath);
                            try {
                                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                                await client.downloadTo(localPath, fullPath);
                                downloaded++;
                            } catch (e) {
                                errors.push({ path: relPath, error: `FTP download: ${e.message}` });
                            }
                        }
                    }
                }
            };
            await walk(startDir, '', 0);
        } finally {
            client.close();
        }
    }

    // ── PHASE 2 : Connexion fraîche, supprimer les fichiers/dossiers non attendus
    // (fichiers d'abord, puis dossiers du plus profond au plus haut)
    const filesToDelete = allFiles.filter(f => !expectedFiles.has(f.relPath));
    const dirsToDelete = allDirs.filter(d => !expectedDirs.has(d.relPath))
                                 .sort((a, b) => b.depth - a.depth);

    if (filesToDelete.length > 0 || dirsToDelete.length > 0) {
        const client = new ftp.Client(180000);
        try {
            await client.access({ host: server, user: username, password, port: port || 21, secure: false });
            // Supprimer fichiers (chemin absolu)
            for (const f of filesToDelete) {
                try {
                    await client.remove(f.fullPath);
                    deletedRemote++;
                } catch (e) {
                    errors.push({ path: f.relPath, error: `FTP rm: ${e.message}` });
                }
            }
            // Supprimer dossiers en partant des plus profonds, depuis le parent
            for (const d of dirsToDelete) {
                const parentPath = d.fullPath.substring(0, d.fullPath.lastIndexOf('/')) || '/';
                const name = d.fullPath.substring(d.fullPath.lastIndexOf('/') + 1);
                try {
                    await client.cd(parentPath);
                    await client.removeDir(name);
                    deletedRemote++;
                } catch (e) {
                    errors.push({ path: d.relPath, error: `FTP rmdir: ${e.message}` });
                }
            }
        } finally {
            client.close();
        }
    }

    // ── PHASE 3 : Walk local, supprimer ce qui n'est pas attendu
    const unexpectedLocal = [];
    const walkLocal = (dirAbs, relBase) => {
        let entries;
        try { entries = fs.readdirSync(dirAbs, { withFileTypes: true }); }
        catch { return; }
        for (const entry of entries) {
            const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
            if (preserveSet.has(rel) || preserveSet.has(entry.name)) continue;
            const abs = path.join(dirAbs, entry.name);
            if (entry.isDirectory()) {
                walkLocal(abs, rel);
                if (!expectedDirs.has(rel)) {
                    unexpectedLocal.push({ kind: 'dir', rel });
                    try { fs.rmSync(abs, { recursive: true, force: true }); deletedLocal++; }
                    catch (e) { errors.push({ path: rel, error: e.message }); }
                }
            } else {
                if (!expectedFiles.has(rel)) {
                    unexpectedLocal.push({ kind: 'file', rel });
                    try { fs.unlinkSync(abs); deletedLocal++; }
                    catch (e) { errors.push({ path: rel, error: e.message }); }
                }
            }
        }
    };
    if (fs.existsSync(localBase)) walkLocal(localBase, '');

    return { downloaded, deletedLocal, deletedRemote, errors, debug: { expectedDirsCount: expectedDirs.size, expectedFilesCount: expectedFiles.size, unexpectedLocal: unexpectedLocal.slice(0, 30) } };
}

/**
 * Construit les sets de chemins attendus depuis une structure BDD.
 * Retourne { files: Set<string>, dirs: Set<string> } en chemins POSIX relatifs.
 */
function buildExpectedFromStructure(structure) {
    const files = new Set();
    const dirs = new Set();
    const walk = (nodes) => {
        if (!nodes) return;
        for (const node of nodes) {
            if (!node.path) continue;
            const relPath = node.path.replace(/\\/g, '/');
            if (node.type === 'folder') {
                dirs.add(relPath);
                if (node.children) walk(node.children);
            } else {
                files.add(relPath);
            }
        }
    };
    walk(structure);
    return { files, dirs };
}

/**
 * Télécharge plusieurs fichiers depuis FTP en une seule connexion.
 * fileList = [{ remotePath, localPath }]
 * remotePath = chemin relatif au directory de base.
 * Retourne { downloaded, errors }
 */
async function downloadFiles({ server, username, password, port, directory }, fileList) {
    if (!fileList || fileList.length === 0) return { downloaded: 0, errors: [] };
    const client = new ftp.Client(120000);
    const errors = [];
    let downloaded = 0;
    try {
        await client.access({ host: server, user: username, password, port: port || 21, secure: false });
        const baseDir = (directory || '/').replace(/\/?$/, '/');
        for (const f of fileList) {
            try {
                const remoteFullPath = (baseDir + f.remotePath).replace(/\/+/g, '/');
                fs.mkdirSync(path.dirname(f.localPath), { recursive: true });
                await client.downloadTo(f.localPath, remoteFullPath);
                downloaded++;
            } catch (e) {
                errors.push({ path: f.remotePath, error: e.message });
            }
        }
    } finally {
        client.close();
    }
    return { downloaded, errors };
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

/**
 * Synchronise les fichiers d'UN dossier (et ses sous-dossiers) depuis FTP vers local.
 * Télécharge les fichiers absents ou de taille différente. Ne supprime rien (sens FTP→local uniquement).
 * folderNode = { id, path, children: FileNode[] }
 * projectName = UUID du projet (nom du dossier local)
 * localBase    = chemin absolu du dossier parent des projets (PROJECTS_DIR)
 * Retourne { folderId, status: 'in-sync'|'updated'|'error', downloaded, errors }
 */
async function syncFolderFilesFromFtp(ftpCfg, projectName, folderNode, localBase) {
    const { server, username, password, port, directory } = ftpCfg;
    const baseDir = (directory || '/').replace(/\/?$/, '/');
    const errors = [];
    let downloaded = 0;

    // Collecte récursive de tous les fichiers attendus dans ce sous-arbre
    const collectFiles = (nodes) => {
        const list = [];
        for (const n of (nodes || [])) {
            if (n.type === 'file' && n.path) list.push(n);
            if (n.children) list.push(...collectFiles(n.children));
        }
        return list;
    };
    const expectedFiles = collectFiles([folderNode]);

    if (expectedFiles.length === 0) {
        return { folderId: folderNode.id, status: 'in-sync', downloaded: 0, errors: [] };
    }

    const client = new ftp.Client(120000);
    try {
        await client.access({ host: server, user: username, password, port: port || 21, secure: false });

        for (const fileNode of expectedFiles) {
            const relPath = fileNode.path.replace(/\\/g, '/');
            const localPath = path.join(localBase, projectName, fileNode.path);
            const remoteFullPath = (baseDir + `projets/${projectName}/` + relPath).replace(/\/+/g, '/');

            // Récupérer la taille FTP sans télécharger le fichier
            let ftpSize = -1;
            try {
                ftpSize = await client.size(remoteFullPath);
            } catch (_) {
                // Fichier absent du FTP → fichier local seul, on ne touche pas
                continue;
            }

            const localExists = fs.existsSync(localPath);
            const localSize = localExists ? fs.statSync(localPath).size : -1;

            // Télécharger si absent ou taille différente
            if (!localExists || localSize !== ftpSize) {
                try {
                    fs.mkdirSync(path.dirname(localPath), { recursive: true });
                    await client.downloadTo(localPath, remoteFullPath);
                    downloaded++;
                } catch (e) {
                    errors.push({ path: relPath, error: e.message });
                }
            }
        }
    } catch (e) {
        errors.push({ path: folderNode.path, error: e.message });
    } finally {
        client.close();
    }

    const status = errors.length > 0 ? 'error' : (downloaded > 0 ? 'updated' : 'in-sync');
    return { folderId: folderNode.id, status, downloaded, errors };
}

module.exports = { testConnection, listRemoteFiles, uploadFile, uploadFiles, downloadFile, downloadFiles, syncFromFtp, buildExpectedFromStructure, getFtpConfig, getBackupType, syncFolderFilesFromFtp };
