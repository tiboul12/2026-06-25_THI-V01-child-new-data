import { Component, Input, Output, EventEmitter, signal, OnChanges, SimpleChanges, HostListener, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileNode, ProjectFilesService } from '../../../../../core/services/project-files.service';
import { ConversationService } from '../../../../../core/services/conversation.service';

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
  @Output() fileSelect = new EventEmitter<FileNode>();
  @Output() folderCreated = new EventEmitter<{ name: string; parentId: string | null }>();
  @Output() refresh = new EventEmitter<void>();

  expanded = signal<Set<string>>(new Set(['root']));
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

  constructor(private svc: ProjectFilesService, private elRef: ElementRef) {}

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
        await this.svc.createFolder(this.projectName, { name: val, parentId: inp.parentId || undefined });
        if (inp.parentId) this.expandNode(inp.parentId);
        this.folderCreated.emit({ name: val, parentId: inp.parentId || null });
      } else if (inp.type === 'new-file') {
        const created = await this.svc.createFile(this.projectName, { name: val, parentId: inp.parentId || undefined });
        if (inp.parentId) this.expandNode(inp.parentId);
        this.fileSelect.emit(created);
      } else if (inp.type === 'rename' && inp.nodeId) {
        const node = this.findNode(inp.nodeId);
        if (node?.type === 'file') await this.svc.renameFile(this.projectName, inp.nodeId, val);
        else if (node?.type === 'folder') await this.svc.renameFolder(this.projectName, inp.nodeId, val);
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
      if (node.type === 'file') await this.svc.deleteFile(this.projectName, node.id);
      else await this.svc.deleteFolder(this.projectName, node.id);
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

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (!this.elRef.nativeElement.contains(e.target)) this.closeContextMenu();
  }
}
