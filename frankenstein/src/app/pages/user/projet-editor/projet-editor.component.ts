import { Component, OnInit, OnDestroy, signal, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService, Project } from '../../../core/services/project.service';
import { ProjectFilesService, FileNode } from '../../../core/services/project-files.service';
import { ConfigService } from '../../../core/services/config.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { WoActionHistoryService } from '../../../core/services/wo-action-history.service';

import { ProjetToolbarComponent } from './components/projet-toolbar/projet-toolbar.component';
import { ProjetSidebarComponent, DragDropEvent } from './components/projet-sidebar/projet-sidebar.component';
import { ProjetEditorZoneComponent, FileSaveEvent, SectionInfo } from './components/projet-editor-zone/projet-editor-zone.component';
import { ProjetConversationComponent } from './components/projet-conversation/projet-conversation.component';
import { ProjetStatusbarComponent } from './components/projet-statusbar/projet-statusbar.component';

@Component({
  selector: 'app-projet-editor',
  standalone: true,
  imports: [
    CommonModule,
    ProjetToolbarComponent,
    ProjetSidebarComponent,
    ProjetEditorZoneComponent,
    ProjetConversationComponent,
    ProjetStatusbarComponent,
  ],
  templateUrl: './projet-editor.component.html',
  styleUrl: './projet-editor.component.scss'
})
export class ProjetEditorComponent implements OnInit, OnDestroy {
  @ViewChild(ProjetEditorZoneComponent) editorZone?: ProjetEditorZoneComponent;

  project = signal<Project | null>(null);
  files = signal<FileNode[]>([]);
  loading = signal(true);
  saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  activeNodeId = signal<string | null>(null);
  scrollToNodeId = signal<string | null>(null);

  private projectFolderName = '';
  private savedStatusTimer: any;
  private pendingFolders = new Set<string>();
  private isSaving = false;
  private pendingSections: SectionInfo[] | null = null;
  private history = inject(WoActionHistoryService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private projectFilesService: ProjectFilesService,
    private configService: ConfigService,
    private layoutService: LayoutService,
    public auth: AuthService
  ) {}

  async ngOnInit() {
    this.layoutService.editorMode.set(true);
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/projets']); return; }
    try {
      const proj = await this.projectService.getProject(id);
      this.project.set(proj);
      this.configService.setCurrentProjectId(proj.id);
      this.projectFolderName = id;
    } catch {
      this.router.navigate(['/projets']);
      return;
    } finally {
      this.loading.set(false);
    }
    await this.ensureProjectFolder(this.project()!);
    await this.loadFiles();
  }

  ngOnDestroy() {
    this.layoutService.editorMode.set(false);
    this.configService.setCurrentProjectId(null);
    clearTimeout(this.savedStatusTimer);
  }

  private async ensureProjectFolder(proj: Project) {
    try {
      await this.projectFilesService.getConfig(this.projectFolderName);
    } catch {
      try {
        await this.projectFilesService.createProject(proj.title, this.projectFolderName);
      } catch (e) {
        console.warn('ensureProjectFolder create error (may already exist):', e);
      }
    }
  }

  async loadFiles() {
    try {
      const res = await this.projectFilesService.getFiles(this.projectFolderName);
      this.files.set(this.sortNodesByOrder(res.files || []));
    } catch (e) {
      console.warn('loadFiles error:', e);
      this.files.set([]);
    }
  }

  private sortNodesByOrder(nodes: FileNode[]): FileNode[] {
    return [...nodes]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(n => n.children ? { ...n, children: this.sortNodesByOrder(n.children) } : n);
  }

  onNodeSelect(node: FileNode) {
    this.activeNodeId.set(node.id);
    this.scrollToNodeId.set(null);
    setTimeout(() => this.scrollToNodeId.set(node.id), 0);
  }

  onNodeActive(nodeId: string) {
    if (this.activeNodeId() !== nodeId) {
      this.activeNodeId.set(nodeId);
    }
  }

  async onFolderCreated(info: { name: string; parentId: string | null }) {
    await this.loadFiles();
    if (!info.parentId) {
      this.editorZone?.appendSection(info.name, 1);
    } else {
      const parent = this.findFolderById(info.parentId, this.files());
      if (parent) {
        const depth = this.getFolderDepth(info.parentId, this.files());
        this.editorZone?.insertSectionInParent(parent.name, depth, info.name);
      }
    }
  }

  async onSectionsChange(sections: SectionInfo[]) {
    if (this.isSaving) {
      this.pendingSections = sections;
      return;
    }
    this.isSaving = true;
    this.pendingSections = null;

    try {
      await this.processSectionsChange(sections);
    } finally {
      this.isSaving = false;
      if (this.pendingSections) {
        const next = this.pendingSections;
        this.pendingSections = null;
        this.onSectionsChange(next);
      }
    }
  }

  private slugify(text: string): string {
    return text.toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
      .replace(/-+/g, '-').trim();
  }

  // ── Tracking helpers ───────────────────────────────────────
  private buildOldContentMap(nodes: FileNode[]): Map<string, string> {
    const map = new Map<string, string>();
    const walk = (ns: FileNode[]) => {
      for (const n of ns) {
        if (n.type === 'file' && !this.projectFilesService.isImageFile(n.name)) {
          map.set(n.id, n.content || '');
        }
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return map;
  }

  private trackContext() {
    return {
      projectId: this.projectFolderName,
      projectName: this.project()?.title || this.projectFolderName,
    };
  }

  private async trackContentUpdate(file: FileNode, folderName: string, oldContent: string, newContent: string) {
    if (oldContent === newContent) return;
    try {
      await this.history.track({
        section: 'projets',
        subsection: folderName,
        actionType: 'update',
        label: `Modification de "${folderName}"`,
        entityType: 'file',
        entityId: file.id,
        entityLabel: file.name,
        beforeState: { content: oldContent, name: file.name },
        afterState: { content: newContent, name: file.name },
        context: this.trackContext(),
        undoable: true,
        undoAction: {
          endpoint: `/api/file-projects/${this.projectFolderName}/files/${file.id}`,
          method: 'PUT',
          payload: { content: oldContent }
        },
        redoAction: {
          endpoint: `/api/file-projects/${this.projectFolderName}/files/${file.id}`,
          method: 'PUT',
          payload: { content: newContent }
        }
      });
    } catch (e) { console.warn('[Editor] track content update failed:', e); }
  }

  private async trackFolderRename(folderId: string, oldName: string, newName: string) {
    try {
      await this.history.track({
        section: 'projets',
        subsection: newName,
        actionType: 'update',
        label: `Renommage de section "${oldName}" → "${newName}"`,
        entityType: 'folder',
        entityId: folderId,
        entityLabel: newName,
        beforeState: { name: oldName },
        afterState: { name: newName },
        context: this.trackContext(),
        undoable: true,
        undoAction: {
          endpoint: `/api/file-projects/${this.projectFolderName}/folders/${folderId}`,
          method: 'PATCH',
          payload: { name: oldName }
        },
        redoAction: {
          endpoint: `/api/file-projects/${this.projectFolderName}/folders/${folderId}`,
          method: 'PATCH',
          payload: { name: newName }
        }
      });
    } catch (e) { console.warn('[Editor] track rename failed:', e); }
  }

  private async trackFolderCreate(folder: FileNode) {
    try {
      await this.history.track({
        section: 'projets',
        subsection: folder.name,
        actionType: 'create',
        label: `Création de section "${folder.name}"`,
        entityType: 'folder',
        entityId: folder.id,
        entityLabel: folder.name,
        afterState: { name: folder.name },
        context: this.trackContext(),
        undoable: true,
        undoAction: {
          endpoint: `/api/file-projects/${this.projectFolderName}/folders/${folder.id}`,
          method: 'DELETE'
        }
      });
    } catch (e) { console.warn('[Editor] track create failed:', e); }
  }

  private async trackFolderDelete(folder: FileNode) {
    try {
      await this.history.track({
        section: 'projets',
        subsection: folder.name,
        actionType: 'delete',
        label: `Suppression de section "${folder.name}"`,
        entityType: 'folder',
        entityId: folder.id,
        entityLabel: folder.name,
        beforeState: { name: folder.name },
        context: this.trackContext(),
        undoable: false
      });
    } catch (e) { console.warn('[Editor] track delete failed:', e); }
  }

  private async processSectionsChange(sections: SectionInfo[]) {
    let currentFiles = this.files();
    // Snapshot of file contents BEFORE this save batch — used to compute diffs for tracking
    const oldContentMap = this.buildOldContentMap(currentFiles);
    // Mutable copy so we can patch folderId/fileId after rename resolution
    const resolved = sections.map(s => ({ ...s }));

    console.log('[EDITOR] Sections changed, analyzing structure...', { sections: resolved.length });

    // 1. Liaison hiérarchique textuelle (parent direct dans le texte)
    const parentSectionMap = new Map<SectionInfo, SectionInfo | null>();
    const lastAtLevel = new Array(5).fill(null);
    for (const s of resolved) {
      parentSectionMap.set(s, lastAtLevel[s.level - 1]);
      lastAtLevel[s.level] = s;
    }

    interface RenameOp { folderId: string; newName: string; section: typeof resolved[0] }
    const renameOps: RenameOp[] = [];
    const matchedFolderIds = new Set<string>();

    // 2. Détection des renommages niveau par niveau pour stabiliser la hiérarchie
    for (const s of resolved) {
      if (s.folderId) {
        matchedFolderIds.add(s.folderId);
        continue;
      }

      const parentS = parentSectionMap.get(s);
      const parentFolderId = parentS ? (parentS.folderId || renameOps.find(op => op.section === parentS)?.folderId) : null;
      
      const parentFolder = parentFolderId ? this.findFolderById(parentFolderId, currentFiles) : null;
      const siblings = parentFolderId ? (parentFolder?.children || []) : currentFiles;
      
      const orphanFolders = siblings.filter(f => 
        f.type === 'folder' && 
        !matchedFolderIds.has(f.id) && 
        !resolved.some(rs => rs.folderId === f.id)
      );
      
      const unmatchedSectionsAtThisLevelUnderThisParent = resolved.filter(rs => 
          !rs.folderId && 
          rs.level === s.level && 
          parentSectionMap.get(rs) === parentS &&
          !renameOps.some(op => op.section === rs)
      );

      // Match si on a le même nombre de dossiers orphelins et de sections non matchées à ce niveau
      // OU si on a une seule section non matchée et qu'il reste des orphelins (plus risqué mais nécessaire si doublons sur serveur)
      if (orphanFolders.length > 0 && unmatchedSectionsAtThisLevelUnderThisParent.length > 0) {
          const idx = unmatchedSectionsAtThisLevelUnderThisParent.indexOf(s);
          if (idx !== -1 && idx < orphanFolders.length) {
              const matchedFolder = orphanFolders[idx];
              console.log('[EDITOR] Rename detected (hierarchical match):', { from: matchedFolder.name, to: s.folderName });
              renameOps.push({ folderId: matchedFolder.id, newName: s.folderName, section: s });
              matchedFolderIds.add(matchedFolder.id);
              s.folderId = matchedFolder.id; // Patch immédiat pour les enfants
          }
      }
    }

    // 3. Mise à jour finale des parentFolderId pour les créations/déplacements
    for (const s of resolved) {
      const parentS = parentSectionMap.get(s);
      s.parentFolderId = parentS?.folderId || null;
    }

    const sectionPaths = new Set(
      resolved.map(s => [...s.parentPath, s.folderName].map(p => this.slugify(p)).join('/'))
    );
    const renamedIds = new Set(renameOps.map(op => op.folderId));

    const allFolderPaths = this.collectAllFolderPaths(currentFiles);
    const orphanPaths = new Set<string>();
    for (const [fp] of allFolderPaths) {
      if (!sectionPaths.has(fp)) orphanPaths.add(fp);
    }
    const toDelete: FileNode[] = [];
    for (const [fp, folder] of allFolderPaths) {
      // Si le dossier a été renommé, on ne le supprime pas (son ID est dans renamedIds)
      if (renamedIds.has(folder.id)) continue;
      
      // Si le chemin n'existe plus dans le texte, c'est un orphelin
      if (!sectionPaths.has(fp)) {
          // On vérifie si un ancêtre est déjà orphelin (pour ne pas supprimer récursivement inutilement, 
          // bien que le serveur gère le rmSync -r)
          const parts = fp.split('/');
          const hasOrphanAncestor = parts.slice(0, -1).some((_, i) =>
            orphanPaths.has(parts.slice(0, i + 1).join('/'))
          );
          if (!hasOrphanAncestor) {
            console.log('[EDITOR] Deletion detected:', folder.name, fp);
            toDelete.push(folder);
          }
      }
    }

    // Détection de suppression de fichiers additionnels
    const allExistingAdditionalFileIds = new Set<string>();
    for (const folder of allFolderPaths.values()) {
      folder.children?.forEach(c => {
        if (c.type === 'file' && c.name !== 'contenu.md' && !this.projectFilesService.isImageFile(c.name)) {
          allExistingAdditionalFileIds.add(c.id);
        }
      });
    }

    const resolvedAdditionalFileIds = new Set<string>();
    resolved.forEach(s => {
      s.additionalFiles?.forEach(af => {
        if (af.fileId) resolvedAdditionalFileIds.add(af.fileId);
      });
    });

    let additionalFileDeleted = false;
    for (const id of allExistingAdditionalFileIds) {
      if (!resolvedAdditionalFileIds.has(id)) {
        additionalFileDeleted = true;
        break;
      }
    }

    // Détection de déplacement de fichiers additionnels
    const filesToMove: { fileId: string, targetFolderId: string }[] = [];
    for (const s of resolved) {
      if (!s.folderId) continue;
      s.additionalFiles?.forEach(af => {
        if (af.fileId) {
          const existingFolder = this.findParentFolder(af.fileId, currentFiles);
          if (existingFolder && existingFolder.id !== s.folderId) {
            console.log(`[EDITOR] File move detected for ${af.name}: ${existingFolder.name} -> ${s.folderName}`);
            filesToMove.push({ fileId: af.fileId as string, targetFolderId: s.folderId as string });
          }
        }
      });
    }

    const toCreate = resolved
      .filter(s => {
        if (s.folderId || renameOps.some(op => op.section === s)) return false;
        const fp = [...s.parentPath, s.folderName].map(p => this.slugify(p)).join('/');
        return !this.pendingFolders.has(fp);
      })
      .sort((a, b) => a.level - b.level);

    if (toCreate.length > 0) console.log('[EDITOR] Creations detected:', toCreate.map(s => s.folderName));

    const needsFile = resolved.filter(s => {
      if (!s.folderId) return false;
      const folder = this.findFolderById(s.folderId, currentFiles);
      return !(folder?.children || []).some(c => c.type === 'file');
    });

    const hasStructural = renameOps.length > 0 || toDelete.length > 0 || toCreate.length > 0 || needsFile.length > 0 || additionalFileDeleted || filesToMove.length > 0;
    const sectionsWithFile = resolved.filter(s => s.fileId || s.folderId); // Tous ceux qui ont potentiellement du contenu à sauver

    if (!hasStructural && sectionsWithFile.length === 0 && !resolved.some(s => s.additionalFiles?.some(af => !af.fileId))) return;

    this.saveStatus.set('saving');
    clearTimeout(this.savedStatusTimer);

    let hasError = false;
    let anyAdditionalFileCreated = false;

    try {
      if (hasStructural) {
        // 0. Moves
        for (const move of filesToMove) {
          try {
            console.log(`[EDITOR] Moving file ${move.fileId} to folder ${move.targetFolderId}...`);
            await this.projectFilesService.moveFile(this.projectFolderName, move.fileId, move.targetFolderId);
          } catch (e) {
            console.error('File move failed:', e);
          }
        }

        // 1. Renames
        for (const op of renameOps) {
          try {
            console.log(`[EDITOR] Renaming folder ${op.folderId} to "${op.newName}"...`);
            const oldFolder = this.findFolderById(op.folderId, currentFiles);
            const oldName = oldFolder?.name || '';
            await this.projectFilesService.renameFolder(this.projectFolderName, op.folderId, op.newName);
            this.trackFolderRename(op.folderId, oldName, op.newName);
          } catch (e) {
            console.error('Rename failed:', e);
            hasError = true;
          }
        }

        // 2. Deletions
        for (const folder of toDelete) {
          try {
            console.log(`[EDITOR] Deleting orphan folder ${folder.id} (${folder.name})...`);
            await this.projectFilesService.deleteFolder(this.projectFolderName, folder.id);
            this.trackFolderDelete(folder);
          } catch (e) {
            console.error('Deletion failed:', e);
          }
        }

        // 3. Creations (parents before children)
        const newFolderIds = new Map<string, string>();
        for (const section of toCreate) {
          const fullPath = [...section.parentPath, section.folderName].map(p => this.slugify(p)).join('/');
          this.pendingFolders.add(fullPath);
          const parentKey = section.parentPath.map(p => this.slugify(p)).join('/');
          const parentId = section.parentFolderId || (parentKey ? newFolderIds.get(parentKey) : undefined) || undefined;
          
          try {
            const folder = await this.projectFilesService.createFolder(this.projectFolderName, { name: section.folderName, parentId });
            newFolderIds.set(fullPath, folder.id);
            section.folderId = folder.id;
            this.trackFolderCreate(folder);
            const file = (folder.children || []).find(c => c.type === 'file') || await this.projectFilesService.createFile(this.projectFolderName, { name: 'contenu', parentId: folder.id, content: section.content });
            section.fileId = file.id;
          } catch (e) {
            console.error('Creation failed:', e);
            hasError = true;
          } finally {
            this.pendingFolders.delete(fullPath);
          }
        }

        // 4. Missing content files
        for (const section of needsFile) {
          const folderId = section.folderId || renameOps.find(op => op.section === section)?.folderId;
          if (!folderId) continue;
          try {
             const file = await this.projectFilesService.createFile(this.projectFolderName, { name: 'contenu', parentId: folderId, content: section.content });
             section.fileId = file.id;
          } catch (e) {
             console.error('Create content file failed:', e);
          }
        }

        // Rafraîchir l'arborescence dès que la structure est prête
        await this.loadFiles().catch(() => {});
        currentFiles = this.files();

        // On remet à jour les IDs de fichiers dans resolved pour la sauvegarde finale
        for (const s of resolved) {
          const path = [...s.parentPath, s.folderName].map(p => this.slugify(p)).join('/');
          const freshFolder = this.findFolderByPath(path, currentFiles);
          if (freshFolder) {
            s.folderId = freshFolder.id;
            const contentFile = (freshFolder.children || []).find(c => c.type === 'file');
            if (contentFile) s.fileId = contentFile.id;
          }
        }
      }

      // 5. Save content (main content and additional files)
      for (const s of resolved) {
        if (s.fileId) {
          const oldContent = oldContentMap.get(s.fileId) ?? '';
          if (oldContent !== s.content) {
            await this.projectFilesService.updateFile(this.projectFolderName, s.fileId, s.content);
            const fileNode = { id: s.fileId, name: 'contenu.md', type: 'file' as const, path: '', order: 0 };
            this.trackContentUpdate(fileNode, s.folderName, oldContent, s.content);
          }
        }

        // Save additional files
        if (s.folderId && s.additionalFiles && s.additionalFiles.length > 0) {
          for (const af of s.additionalFiles) {
            if (af.fileId) {
              const oldContent = oldContentMap.get(af.fileId) ?? '';
              if (oldContent !== af.content) {
                await this.projectFilesService.updateFile(this.projectFolderName, af.fileId, af.content);
                const fileNode = { id: af.fileId, name: af.name, type: 'file' as const, path: '', order: 0 };
                this.trackContentUpdate(fileNode, `${s.folderName} › ${af.name}`, oldContent, af.content);
              }
            } else {
              try {
                console.log(`[EDITOR] Creating additional file "${af.name}" in folder ${s.folderId}...`);
                const newFile = await this.projectFilesService.createFile(this.projectFolderName, { 
                  name: af.name, 
                  parentId: s.folderId, 
                  content: af.content 
                });
                af.fileId = newFile.id;
                anyAdditionalFileCreated = true;
              } catch (e) {
                console.error(`Failed to create additional file ${af.name}:`, e);
              }
            }
          }
        }
      }

      // 6. Delete orphaned additional files (files in folders that are not 'contenu.md' and not in resolved additionalFiles)
      let additionalFileOrphanDeleted = false;
      if (hasStructural) {
        const freshFiles = this.files();
        for (const s of resolved) {
          if (!s.folderId) continue;
          const freshFolder = this.findFolderById(s.folderId, freshFiles);
          if (!freshFolder || !freshFolder.children) continue;
          
          const existingFiles = freshFolder.children.filter(c => c.type === 'file');
          for (const ef of existingFiles) {
            if (ef.name === 'contenu.md') continue;
            if (this.projectFilesService.isImageFile(ef.name)) continue;
            const stillExists = s.additionalFiles.some(af => this.slugify(af.name) === this.slugify(ef.name.replace(/\.md$/, '')));
            if (!stillExists) {
              console.log(`[EDITOR] Deleting orphaned additional file ${ef.name} from ${freshFolder.name}...`);
              await this.projectFilesService.deleteFile(this.projectFolderName, ef.id).catch(e => console.error(e));
              additionalFileOrphanDeleted = true;
            }
          }
        }
      }

      if (anyAdditionalFileCreated || additionalFileOrphanDeleted) {
        await this.loadFiles().catch(() => {});
      }


      if (!hasError) {
        this.saveStatus.set('saved');
        this.savedStatusTimer = setTimeout(() => this.saveStatus.set('idle'), 2000);
      } else {
        this.saveStatus.set('error');
        this.savedStatusTimer = setTimeout(() => this.saveStatus.set('idle'), 3000);
      }
    } catch (e) {
      console.error('onSectionsChange error:', e);
      this.saveStatus.set('error');
      this.savedStatusTimer = setTimeout(() => this.saveStatus.set('idle'), 3000);
    }
  }

  private getFolderChildren(parentPathLower: string[], nodes: FileNode[]): FileNode[] {
    if (parentPathLower.length === 0) return nodes.filter(n => n.type === 'folder');
    const [first, ...rest] = parentPathLower;
    const parent = nodes.find(n => n.type === 'folder' && this.slugify(n.name) === first);
    return parent ? this.getFolderChildren(rest, parent.children || []) : [];
  }

  private collectAllFolderPaths(nodes: FileNode[], prefix: string[] = []): Map<string, FileNode> {
    const map = new Map<string, FileNode>();
    for (const node of nodes) {
      if (node.type === 'folder') {
        const parts = [...prefix, this.slugify(node.name)];
        map.set(parts.join('/'), node);
        const sub = this.collectAllFolderPaths(node.children || [], parts);
        sub.forEach((v, k) => map.set(k, v));
      }
    }
    return map;
  }



  private getFolderDepth(id: string, nodes: FileNode[], depth = 1): number {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (node.id === id) return depth;
        const d = this.getFolderDepth(id, node.children || [], depth + 1);
        if (d > 0) return d;
      }
    }
    return 0;
  }

  async onFileSave(event: FileSaveEvent) {
    this.saveStatus.set('saving');
    clearTimeout(this.savedStatusTimer);
    try {
      await this.projectFilesService.updateFile(this.projectFolderName, event.fileId, event.content);
      this.saveStatus.set('saved');
      this.savedStatusTimer = setTimeout(() => this.saveStatus.set('idle'), 2000);
    } catch {
      this.saveStatus.set('error');
      this.savedStatusTimer = setTimeout(() => this.saveStatus.set('idle'), 3000);
    }
  }

  async onDragDrop(event: DragDropEvent) {
    const { draggedNode, draggedParentId, targetNode, targetParentId, position, targetSiblings } = event;
    try {
      if (draggedNode.type === 'folder') {
        if (position === 'inside' && targetNode.type === 'folder') {
          // Déplacer le dossier dans un autre dossier (changement de parent)
          await this.projectFilesService.moveFolder(this.projectFolderName, draggedNode.id, targetNode.id);
        } else if (position !== 'inside') {
          if (draggedParentId === targetParentId) {
            // Même parent : réordonner
            const folderSiblings = targetSiblings.filter(n => n.type === 'folder');
            const fromIdx = folderSiblings.findIndex(n => n.id === draggedNode.id);
            const toIdx = folderSiblings.findIndex(n => n.id === targetNode.id);
            if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
              const newOrder = [...folderSiblings];
              const [item] = newOrder.splice(fromIdx, 1);
              const targetNewIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;
              const insertAt = position === 'before' ? targetNewIdx : targetNewIdx + 1;
              newOrder.splice(insertAt, 0, item);
              const structure: FileNode[] = JSON.parse(JSON.stringify(this.files()));
              this.applyOrderInStructure(structure, targetParentId, newOrder.map(n => n.id));
              await this.projectFilesService.updateStructure(this.projectFolderName, structure);
            }
          } else {
            // Parent différent : déplacer dans le même parent que la cible
            await this.projectFilesService.moveFolder(this.projectFolderName, draggedNode.id, targetParentId);
          }
        }
      } else {
        // Fichier (document additionnel ou image) : il doit TOUJOURS rester dans un dossier.
        // On ne le laisse jamais retomber à la racine du projet (sinon il devient invisible
        // dans l'éditeur car les sections markdown ne listent que des dossiers).
        let targetFolderId: string | null = null;

        if (position === 'inside' && targetNode.type === 'folder') {
          targetFolderId = targetNode.id;
        } else if (targetNode.type === 'folder') {
          // 'before'/'after' un dossier : on dépose le document DANS ce dossier
          // (au début pour 'before', à la fin pour 'after').
          targetFolderId = targetNode.id;
        } else {
          // Cible = fichier/image → même dossier que la cible
          targetFolderId = targetParentId;
        }

        // Garde-fou : ne jamais retomber à la racine (file orphelin = invisible)
        if (!targetFolderId) {
          targetFolderId = draggedParentId;
        }

        // 1) Déplacement physique si le dossier change
        const folderChanged = !!targetFolderId && targetFolderId !== draggedParentId;
        if (folderChanged) {
          await this.projectFilesService.moveFile(this.projectFolderName, draggedNode.id, targetFolderId!);
          await this.loadFiles();
        }

        // 2) Réordonnancement dans le dossier cible quand on dépose
        //    avant/après un fichier frère (Doc1 ↔ Doc2 ↔ Doc3).
        //    C'est le cas que ne couvrait PAS le code précédent : aucun moveFile
        //    n'était nécessaire (même dossier) donc rien ne se passait.
        if (position !== 'inside' && targetNode.type === 'file' && targetFolderId) {
          const currentFiles = this.files();
          const targetFolder = this.findFolderById(targetFolderId, currentFiles);
          const siblings = targetFolder ? (targetFolder.children || []) : currentFiles;
          const fileSiblings = siblings.filter(n => n.type === 'file');
          const fromIdx = fileSiblings.findIndex(n => n.id === draggedNode.id);
          const toIdx = fileSiblings.findIndex(n => n.id === targetNode.id);
          if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
            const newOrder = [...fileSiblings];
            const [item] = newOrder.splice(fromIdx, 1);
            const targetNewIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;
            const insertAt = position === 'before' ? targetNewIdx : targetNewIdx + 1;
            newOrder.splice(insertAt, 0, item);
            // Convention : fichiers d'abord, puis sous-dossiers (cohérent avec
            // la reconstruction markdown de la zone 4 qui place les blocs
            // 'fichier' entre le contenu principal et les sous-sections).
            const folderSiblings = siblings.filter(n => n.type === 'folder');
            const allOrdered = [...newOrder, ...folderSiblings];
            const structure: FileNode[] = JSON.parse(JSON.stringify(currentFiles));
            this.applyOrderInStructure(structure, targetFolderId, allOrdered.map(n => n.id));
            await this.projectFilesService.updateStructure(this.projectFolderName, structure);
          }
        }

        // 3) Pour un drop 'inside' : placer les fichiers avant les sous-dossiers
        if (position === 'inside' && targetNode.type === 'folder') {
          if (!folderChanged) await this.loadFiles();
          const targetFolder = this.findFolderById(targetNode.id, this.files());
          if (targetFolder?.children) {
            const childFiles = targetFolder.children.filter(c => c.type === 'file');
            const childFolders = targetFolder.children.filter(c => c.type === 'folder');
            if (childFiles.length > 0 && childFolders.length > 0) {
              const structure: FileNode[] = JSON.parse(JSON.stringify(this.files()));
              this.applyOrderInStructure(structure, targetNode.id, [...childFiles, ...childFolders].map(n => n.id));
              await this.projectFilesService.updateStructure(this.projectFolderName, structure);
            }
          }
        }
      }
      await this.loadFiles();
      this.onNodeActive(draggedNode.id);
    } catch (e: any) {
      console.error('DragDrop failed:', e);
      const msg = e?.error?.error || e?.message || 'Erreur inconnue';
      console.error(`[DragDrop] Détail: ${msg}`);
    }
  }

  private applyOrderInStructure(nodes: FileNode[], parentId: string | null, orderedIds: string[]): boolean {
    const reorderArray = (arr: FileNode[]) => {
      const reordered = orderedIds.map(id => arr.find(n => n.id === id)).filter((n): n is FileNode => !!n);
      const others = arr.filter(n => !orderedIds.includes(n.id));
      reordered.forEach((n, idx) => { n.order = idx + 1; });
      arr.splice(0, arr.length, ...reordered, ...others);
    };
    if (parentId === null) { reorderArray(nodes); return true; }
    for (const node of nodes) {
      if (node.id === parentId && node.children) { reorderArray(node.children); return true; }
      if (node.children && this.applyOrderInStructure(node.children, parentId, orderedIds)) return true;
    }
    return false;
  }

  async onRefresh() {
    await this.loadFiles();
  }

  private findParentFolder(fileId: string, nodes: FileNode[]): FileNode | null {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if ((node.children || []).some(c => c.id === fileId)) return node;
        const found = this.findParentFolder(fileId, node.children || []);
        if (found) return found;
      }
    }
    return null;
  }

  private findFolderById(id: string, nodes: FileNode[]): FileNode | null {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (node.id === id) return node;
        const found = this.findFolderById(id, node.children || []);
        if (found) return found;
      }
    }
    return null;
  }

  private findFolderByPath(path: string, nodes: FileNode[]): FileNode | null {
    for (const node of nodes) {
      if (node.type === 'folder') {
        const currentPath = node.path.replace(/\.md$/, ''); // Sécurité
        if (this.slugify(node.path) === path || node.path === path) return node;
        if (node.children) {
          const found = this.findFolderByPath(path, node.children);
          if (found) return found;
        }
      }
    }
    return null;
  }

  get statusLabel(): string {
    return this.project()?.status === 'published' ? 'Publié' : 'Brouillon';
  }

  get projectTitle(): string {
    return this.project()?.title || '';
  }
}
