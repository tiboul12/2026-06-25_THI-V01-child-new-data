import { Component, Input, Output, EventEmitter, signal, OnChanges, SimpleChanges, HostListener, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FileNode, ProjectFilesService, FtpNodeSyncStatus, Outil } from '@worganic/portail-core/data-access';
import { ConversationService } from '@worganic/portail-core/data-access';
import { WoActionHistoryService } from '@worganic/portail-core/data-access';
import { ProjetCollabService, LockInfo } from '@worganic/portail-core/data-access';

interface ContextMenu { x: number; y: number; node: FileNode | null; }
interface InlineInput { type: 'rename' | 'new-file' | 'new-folder'; nodeId: string | null; parentId: string | null; }

export interface DragDropEvent {
  draggedNode: FileNode;
  draggedParentId: string | null;
  targetNode: FileNode;
  targetParentId: string | null;
  position: 'before' | 'after' | 'inside';
  targetSiblings: FileNode[];
}

@Component({
  selector: 'app-projet-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './projet-sidebar.component.html',
  host: { class: 'flex min-h-0 bg-light-surface dark:bg-[#0f0f17] border-r border-light-border dark:border-white/10' },
})
export class ProjetSidebarComponent implements OnChanges {
  @Input() projectName = '';
  @Input() projectTitle = '';
  @Input() files: FileNode[] = [];
  @Input() activeFileId: string | null = null;
  @Input() projetId = '';
  @Input() nestedImagesMap: Record<string, string[]> = {};
  @Input() nodeSyncStatus: Map<string, FtpNodeSyncStatus> = new Map();
  @Input() hasFtpBackup = false;
  @Input() outils: Outil[] = [];
  @Input() activeOutilId: string | null = null;
  @Input() trelloCount = 0;
  @Output() trelloListClick = new EventEmitter<void>();
  @Input() mockupCount = 0;
  @Output() mockupListClick = new EventEmitter<void>();
  @Output() fileSelect = new EventEmitter<FileNode>();
  @Output() folderCreated = new EventEmitter<{ name: string; parentId: string | null }>();
  @Output() refresh = new EventEmitter<void>();
  @Output() projectSelect = new EventEmitter<void>();
  @Output() outilSelect = new EventEmitter<string>();
  @Output() outilCreate = new EventEmitter<{ type: string; name: string }>();

  expanded = signal<Set<string>>(new Set(['root']));
  outilExpanded = signal<Set<string>>(new Set());
  showAddOutilPopup = signal(false);
  contextMenu = signal<ContextMenu | null>(null);
  inlineInput = signal<InlineInput | null>(null);
  inlineValue = '';
  deleteConfirm = signal<FileNode | null>(null);
  
  conversationIds = signal<Set<string>>(new Set());

  draggedNode = signal<FileNode | null>(null);
  draggedParentId = signal<string | null>(null);
  dragOverNodeId = signal<string | null>(null);
  dragPos = signal<'before' | 'after' | 'inside'>('before');

  @Output() dragDrop = new EventEmitter<DragDropEvent>();

  private convSvc = inject(ConversationService);
  private woHistory = inject(WoActionHistoryService);
  readonly collab = inject(ProjetCollabService);

  constructor(private svc: ProjectFilesService, private elRef: ElementRef, private router: Router) {}

  onProjectSelect(): void {
    this.projectSelect.emit();
  }

  /** Libellé d'affichage d'un nœud : fichier Trello (trello-NOM / trello / TL: NOM) → "TL: NOM". */
  nodeDisplayName(node: FileNode): string {
    if (node.type !== 'file') return node.name;
    const base = node.name.replace(/\.md$/, '');
    if (/^trello-/i.test(base)) return 'TL: ' + base.replace(/^trello-/i, '');
    if (/^trello$/i.test(base)) return 'TL: Trello';
    if (/^TL:\s*/i.test(base)) return base;
    return base;
  }

  // ── Verrous collaboration ──────────────────────────────────

  isLockedByMe(nodeId: string): boolean { return this.collab.isLockedByMe(nodeId); }
  isLockedByOther(nodeId: string): boolean { return this.collab.isLockedByOther(nodeId); }
  getLockInfo(nodeId: string): LockInfo | undefined { return this.collab.getLock(nodeId); }

  getLockTooltip(nodeId: string): string {
    const lock = this.collab.getLock(nodeId);
    if (!lock) return '';
    if (this.collab.isLockedByMe(nodeId)) return 'Verrouillé par moi';
    const dt = new Date(lock.lockedAt);
    const hhmm = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `Verrouillé par ${lock.lockedByName} depuis ${hhmm}`;
  }

  async toggleLock(node: FileNode) {
    this.closeContextMenu();
    if (!this.projetId) return;
    try {
      if (this.collab.isLockedByMe(node.id)) {
        await this.collab.unlockNode(this.projetId, node.id);
      } else if (!this.collab.isLockedByOther(node.id)) {
        await this.collab.lockNode(this.projetId, node.id);
      }
    } catch (e: any) {
      const msg = e?.error?.error || 'Erreur lors du verrouillage';
      console.warn('[Sidebar] lock error:', msg);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['files']) {
      this.loadConversations();
    }

    if (changes['files'] && this.files.length > 0) {
      const s = new Set(this.expanded());
      s.add('root');
      this.expanded.set(s);

      // Forcer l'expansion vers le node actif si les fichiers viennent d'être chargés
      if (this.activeFileId) {
        setTimeout(() => this.expandToNode(this.activeFileId!), 50);
      }
    }
    if (changes['activeFileId'] && this.activeFileId) {
      this.expandToNode(this.activeFileId);
    }
    // Auto-expand le premier outil quand la liste change
    if (changes['outils'] && this.outils.length > 0) {
      const s = new Set(this.outilExpanded());
      s.add(this.outils[0].id);
      this.outilExpanded.set(s);
    }
    if (changes['activeOutilId'] && this.activeOutilId) {
      const s = new Set(this.outilExpanded());
      s.add(this.activeOutilId);
      this.outilExpanded.set(s);
    }
  }

  loadConversations() {
    this.convSvc.getConversationsList().subscribe({
      next: (list) => {
        this.conversationIds.set(new Set(list));
      },
      error: (err) => console.error('Error loading conversations list:', err)
    });
  }

  hasConversation(id: string): boolean {
    return this.conversationIds().has(id);
  }

  private expandToNode(nodeId: string) {
    const path = this.findPathToNode(nodeId, this.files);
    const s = new Set(this.expanded());
    
    // On ajoute tous les parents au Set des éléments étendus
    if (path.length > 0) {
      path.forEach(id => s.add(id));
    }
    
    // Si le noeud lui-même est un dossier, on l'étend aussi pour montrer ses fichiers
    const node = this.findNode(nodeId);
    if (node?.type === 'folder') {
      s.add(node.id);
    }
    
    this.expanded.set(s);
  }

  private findPathToNode(id: string, nodes: FileNode[] | undefined, currentPath: string[] = []): string[] {
    if (!nodes) return [];
    for (const n of nodes) {
      if (n.id === id) return currentPath;
      if (n.children && n.children.length > 0) {
        const found = this.findPathToNode(id, n.children, [...currentPath, n.id]);
        if (found.length > 0) return found;
        if (n.children.some(c => c.id === id)) return [...currentPath, n.id];
      }
    }
    return [];
  }

  isExpanded(id: string) { return this.expanded().has(id); }

  toggle(id: string) {
    const s = new Set(this.expanded());
    s.has(id) ? s.delete(id) : s.add(id);
    this.expanded.set(s);
  }

  selectFile(node: FileNode) {
    this.fileSelect.emit(node);
    if (node.type === 'folder') this.toggle(node.id);
  }

  onContextMenu(event: MouseEvent, node: FileNode | null) {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.set({ x: event.clientX, y: event.clientY, node });
    this.inlineInput.set(null);
  }

  closeContextMenu() { this.contextMenu.set(null); }

  startNewFolder(parentId: string | null) {
    this.closeContextMenu();
    this.inlineValue = '';
    this.inlineInput.set({ type: 'new-folder', nodeId: null, parentId });
  }

  startNewFile(parentId: string | null) {
    this.closeContextMenu();
    this.inlineValue = '';
    this.inlineInput.set({ type: 'new-file', nodeId: null, parentId });
  }

  startRename(node: FileNode) {
    this.closeContextMenu();
    this.inlineValue = node.type === 'file' ? node.name.replace(/\.md$/, '') : node.name;
    this.inlineInput.set({ type: 'rename', nodeId: node.id, parentId: null });
  }

  cancelInput() { this.inlineInput.set(null); this.inlineValue = ''; }

  async confirmInput() {
    const inp = this.inlineInput();
    if (!inp || !this.inlineValue.trim()) { this.inlineInput.set(null); this.inlineValue = ''; return; }
    const val = this.inlineValue.trim();
    try {
      if (inp.type === 'new-folder') {
        const activeOutil = !inp.parentId ? this.outils.find(o => o.id === this.activeOutilId) : undefined;
        const folder = await this.svc.createFolder(this.projectName, { name: val, parentId: inp.parentId || undefined, outilSlug: activeOutil?.type });
        this.woHistory.track({
          section: 'projets/sections',
          actionType: 'create',
          label: `Création de menu «${val}»`,
          entityType: 'section',
          entityId: folder.id,
          entityLabel: val,
          afterState: { folderName: val, parentId: inp.parentId || null },
          context: { projectId: this.projectName, projectTitle: this.projectTitle },
          undoable: true,
          undoAction: {
            endpoint: `/api/file-projects/${this.projectName}/folders/${folder.id}`,
            method: 'DELETE'
          }
        }).catch(() => {});
        if (inp.parentId) this.expandNode(inp.parentId);
        this.folderCreated.emit({ name: val, parentId: inp.parentId || null });
      } else if (inp.type === 'new-file') {
        const activeOutil = !inp.parentId ? this.outils.find(o => o.id === this.activeOutilId) : undefined;
        const created = await this.svc.createFile(this.projectName, { name: val, parentId: inp.parentId || undefined, outilSlug: activeOutil?.type });
        this.woHistory.track({
          section: 'projets/fichiers',
          actionType: 'create',
          label: `Création de document «${val}»`,
          entityType: 'file',
          entityId: created.id,
          entityLabel: val,
          afterState: { fileName: val, parentId: inp.parentId || null },
          context: { projectId: this.projectName, projectTitle: this.projectTitle },
          undoable: true,
          undoAction: {
            endpoint: `/api/file-projects/${this.projectName}/files/${created.id}`,
            method: 'DELETE'
          }
        }).catch(() => {});
        if (inp.parentId) this.expandNode(inp.parentId);
        this.fileSelect.emit(created);
      } else if (inp.type === 'rename' && inp.nodeId) {
        const node = this.findNode(inp.nodeId);
        const oldName = node?.type === 'file' ? node.name.replace(/\.md$/, '') : node?.name;
        if (node?.type === 'file') {
          await this.svc.renameFile(this.projectName, inp.nodeId, val);
          this.woHistory.track({
            section: 'projets/fichiers',
            actionType: 'update',
            label: `Renommage de document «${oldName}» → «${val}»`,
            entityType: 'file',
            entityId: inp.nodeId,
            entityLabel: val,
            beforeState: oldName ? { fileName: oldName } : undefined,
            afterState: { fileName: val },
            context: { projectId: this.projectName, projectTitle: this.projectTitle },
            undoable: !!oldName,
            undoAction: oldName ? {
              endpoint: `/api/file-projects/${this.projectName}/files/${inp.nodeId}`,
              method: 'PATCH',
              payload: { name: oldName }
            } : undefined
          }).catch(() => {});
        } else if (node?.type === 'folder') {
          await this.svc.renameFolder(this.projectName, inp.nodeId, val);
          // Folder renames are also tracked in processSectionsChange via the editor
        }
      }
      this.refresh.emit();
    } catch (e) { console.error(e); }
    this.inlineInput.set(null);
    this.inlineValue = '';
  }

  askDelete(node: FileNode) { this.closeContextMenu(); this.deleteConfirm.set(node); }
  cancelDelete() { this.deleteConfirm.set(null); }

  async confirmDelete() {
    const node = this.deleteConfirm();
    if (!node) return;
    try {
      if (node.type === 'file') {
        await this.svc.deleteFile(this.projectName, node.id);
        this.woHistory.track({
          section: 'projets/fichiers',
          actionType: 'delete',
          label: `Suppression de document «${node.name.replace(/\.md$/, '')}»`,
          entityType: 'file',
          entityId: node.id,
          entityLabel: node.name.replace(/\.md$/, ''),
          beforeState: { fileName: node.name.replace(/\.md$/, '') },
          context: { projectId: this.projectName, projectTitle: this.projectTitle },
          undoable: false
        }).catch(() => {});
      } else {
        await this.svc.deleteFolder(this.projectName, node.id);
        // Folder deletions are also tracked in processSectionsChange via the editor
      }
      this.refresh.emit();
    } catch (e) { console.error(e); }
    this.deleteConfirm.set(null);
  }

  findNode(id: string, nodes: FileNode[] = this.files): FileNode | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = this.findNode(id, n.children); if (f) return f; }
    }
    return null;
  }

  expandNode(id: string) {
    const s = new Set(this.expanded());
    s.add(id);
    this.expanded.set(s);
  }

  inlineInputIsFor(type: string, parentId: string | null): boolean {
    const inp = this.inlineInput();
    return !!inp && inp.type === type && inp.parentId === parentId;
  }

  isRenaming(nodeId: string): boolean {
    const inp = this.inlineInput();
    return !!inp && inp.type === 'rename' && inp.nodeId === nodeId;
  }

  onDragStart(event: DragEvent, node: FileNode, parentId: string | null) {
    this.draggedNode.set(node);
    this.draggedParentId.set(parentId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.id);
    }
  }

  onDragOver(event: DragEvent, node: FileNode) {
    const dragged = this.draggedNode();
    if (!dragged || dragged.id === node.id) return;
    // Folder drag cannot drop on a file
    if (dragged.type === 'folder' && node.type === 'file') return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const relY = event.clientY - rect.top;
    this.dragOverNodeId.set(node.id);

    if (node.type === 'folder') {
      if (dragged.type === 'file') {
        this.dragPos.set('inside');
      } else {
        if (relY < rect.height * 0.3) this.dragPos.set('before');
        else if (relY > rect.height * 0.7) this.dragPos.set('after');
        else this.dragPos.set('inside');
      }
    } else {
      this.dragPos.set(relY < rect.height / 2 ? 'before' : 'after');
    }
  }

  onDrop(event: DragEvent, targetNode: FileNode, siblings: FileNode[], parentId: string | null) {
    event.preventDefault();
    const dragged = this.draggedNode();
    if (!dragged || dragged.id === targetNode.id) { this.resetDrag(); return; }
    if (dragged.type === 'folder' && targetNode.type === 'file') { this.resetDrag(); return; }

    this.dragDrop.emit({
      draggedNode: dragged,
      draggedParentId: this.draggedParentId(),
      targetNode,
      targetParentId: parentId,
      position: this.dragPos(),
      targetSiblings: siblings,
    });
    this.resetDrag();
  }

  onDragEnd() { this.resetDrag(); }

  private resetDrag() {
    this.draggedNode.set(null);
    this.draggedParentId.set(null);
    this.dragOverNodeId.set(null);
  }

  isDragging(nodeId: string): boolean { return this.draggedNode()?.id === nodeId; }
  isDragOver(nodeId: string): boolean { return this.dragOverNodeId() === nodeId; }
  isDragInside(nodeId: string): boolean { return this.dragOverNodeId() === nodeId && this.dragPos() === 'inside'; }

  getNodeClasses(node: FileNode): string {
    const active = this.activeFileId === node.id;
    const inside = this.isDragInside(node.id) && node.type === 'folder';
    let cls: string;
    if (active) {
      cls = node.type === 'folder'
        ? 'bg-light-primary/15 dark:bg-primary/15'
        : 'bg-green-500/15 dark:bg-green-500/15';
    } else {
      cls = 'hover:bg-light-surface dark:hover:bg-white/5';
    }
    if (inside) cls += ' outline outline-1 outline-light-primary dark:outline-primary';
    return cls;
  }

  getNodeIconClasses(node: FileNode): string {
    if (this.activeFileId !== node.id) return 'text-light-text-muted dark:text-white/40';
    return node.type === 'folder' ? 'text-light-primary dark:text-primary' : 'text-green-500 dark:text-green-400';
  }

  getNodeLabelClasses(node: FileNode): string {
    if (this.activeFileId !== node.id) return 'text-light-text dark:text-white/70';
    return node.type === 'folder'
      ? 'text-light-primary dark:text-primary font-semibold'
      : 'text-green-500 dark:text-green-400 font-semibold';
  }

  isImageFile(name: string): boolean {
    return this.svc.isImageFile(name);
  }

  // Trie les enfants : fichiers (par order) avant sous-dossiers (par order)
  // Exclut les images imbriquées dans un doc (elles sont affichées sous leur doc parent)
  sortedChildren(nodes: FileNode[]): FileNode[] {
    const nestedImageIds = new Set(Object.values(this.nestedImagesMap).flat());
    const files = nodes.filter(n => n.type === 'file' && !nestedImageIds.has(n.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
    const folders = nodes.filter(n => n.type === 'folder').sort((a, b) => (a.order || 0) - (b.order || 0));
    return [...files, ...folders];
  }

  // Retourne les FileNode images imbriquées dans un bloc document (via nestedImagesMap)
  getNestedImages(fileId: string): FileNode[] {
    const ids = this.nestedImagesMap[fileId];
    if (!ids || ids.length === 0) return [];
    return ids.map(id => this.findNode(id)).filter((n): n is FileNode => n !== null);
  }

  // ── Outils ────────────────────────────────────────────────────

  isOutilExpanded(id: string): boolean { return this.outilExpanded().has(id); }

  toggleOutil(id: string): void {
    const s = new Set(this.outilExpanded());
    s.has(id) ? s.delete(id) : s.add(id);
    this.outilExpanded.set(s);
  }

  onOutilClick(outil: Outil): void {
    this.outilSelect.emit(outil.id);
    const s = new Set(this.outilExpanded());
    s.add(outil.id);
    this.outilExpanded.set(s);
  }

  onAddOutil(type: string): void {
    this.showAddOutilPopup.set(false);
    const names: Record<string, string> = { edition: 'Edition', tests: 'Tests' };
    const name = names[type] ?? type;
    this.outilCreate.emit({ type, name });
  }

  getFolderById(id: string): FileNode | null {
    return this.files.find(f => f.id === id) ?? null;
  }

  getOutilIconClass(outil: Outil): string {
    return this.activeOutilId === outil.id
      ? 'text-light-primary dark:text-primary'
      : 'text-light-text-muted dark:text-white/40';
  }

  getOutilIcon(outil: Outil): string {
    const icons: Record<string, string> = { edition: 'edit_note', tests: 'science' };
    return icons[outil.type] ?? 'folder_special';
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (!this.elRef.nativeElement.contains(e.target)) {
      this.closeContextMenu();
      this.showAddOutilPopup.set(false);
    }
  }
}
