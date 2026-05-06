import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef, inject, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileNode, ProjectFilesService } from '../../../../../core/services/project-files.service';
import { marked } from 'marked';

export interface FileSaveEvent {
  fileId: string;
  content: string;
}

export interface AdditionalFile {
  name: string;
  content: string;
  fileId: string | null;
}

export interface SectionInfo {
  level: number;
  folderName: string;
  parentPath: string[];
  folderId: string | null;
  parentFolderId: string | null;
  fileId: string | null;
  content: string;
  additionalFiles: AdditionalFile[];
}

interface DocSection {
  folderId: string;
  folderName: string;
  textContent: string;
  level: number;
  images: FileNode[];
  mainFileId: string | null;
}

interface SectionRange {
  folderId: string;
  level: number;
  lineStart: number;
  lineEnd: number;
}

interface FileRange {
  fileId: string;
  lineStart: number;
  lineEnd: number;
}

interface MirrorLine {
  text: string;
  isImage: boolean;
  imageId: string;
  imageName: string;
  imagePath: string;
  highlightKind: 'folder' | 'file' | null;
  lineIndex: number;
}

interface HoverPreview {
  url: string;
  name: string;
  top: number;
  left: number;
}

interface DragHandle {
  id: string;
  kind: 'folder' | 'file' | 'image';
  level: number;
  lineStart: number;
  lineEnd: number;
  top: number;
  height: number;
  label: string;
}

export interface DragDropEvent {
  draggedNode: FileNode;
  draggedParentId: string | null;
  targetNode: FileNode;
  targetParentId: string | null;
  position: 'before' | 'after' | 'inside';
  targetSiblings: FileNode[];
}

interface DropIndicator {
  top: number;
  height: number;
  position: 'before' | 'after' | 'inside';
}

@Component({
  selector: 'app-projet-editor-zone',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './projet-editor-zone.component.html',
  styleUrl: './projet-editor-zone.component.scss',
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' },
})
export class ProjetEditorZoneComponent implements OnChanges {
  @Input() files: FileNode[] = [];
  @Input() scrollToNodeId: string | null = null;
  @Input() saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  @Input() projectName = '';
  @Input() activeNodeId: string | null = null;

  @Output() fileSave = new EventEmitter<FileSaveEvent>();
  @Output() sectionsChange = new EventEmitter<SectionInfo[]>();
  @Output() nodeActive = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();
  @Output() dragDrop = new EventEmitter<DragDropEvent>();

  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('textarea') textareaRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('mirror') mirrorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('overlay') overlayRef?: ElementRef<HTMLDivElement>;
  @ViewChild('visu') visuRef?: ElementRef<HTMLDivElement>;

  private sanitizer = inject(DomSanitizer);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  // Mode (toggle Edition / Visu)
  mode: 'edit' | 'visu' = 'edit';

  // Mode Focus : édition d'une seule section / document
  focusedHandle: DragHandle | null = null;
  private fullContentBackup = '';
  private focusedLineStart = 0;
  private focusedOriginalLineCount = 0;

  // Erreur upload image
  imageUploadError = '';

  // Contenu unifié
  unifiedContent = '';
  private hasLoaded = false;
  private lastSavedContent = '';
  private saveTimeout: any;
  private lastStructureKey: string | null = null;

  // Sections / images
  docSections: DocSection[] = [];
  private allImages: FileNode[] = [];
  private sectionRanges: SectionRange[] = [];
  private fileRanges: FileRange[] = [];

  // Highlights
  private highlightedFolderIds = new Set<string>();
  private highlightedFileIds = new Set<string>();
  mirrorLines: MirrorLine[] = [];
  renderedHtml: SafeHtml = '';

  // Image card interactions (edit mode)
  hoverPreview: HoverPreview | null = null;
  renamingImageId: string | null = null;
  renameImageValue = '';
  deleteConfirmImageId: string | null = null;

  // Drag & drop (style Notion : une seule poignée dans la gouttière gauche,
  // visible uniquement sur la ligne survolée)
  private readonly LINE_HEIGHT_PX = 20.8;     // 13px * 1.6
  private readonly PADDING_TOP_PX = 16;        // 1rem
  handles: DragHandle[] = [];
  hoveredHandle: DragHandle | null = null;
  dragGhost: { label: string; kind: string; x: number; y: number } | null = null;
  dropIndicator: DropIndicator | null = null;
  private draggingHandle: DragHandle | null = null;
  private dragMoveListener: ((e: MouseEvent) => void) | null = null;
  private dragUpListener: ((e: MouseEvent) => void) | null = null;
  private dragAutoScrollRaf: number | null = null;
  private dragLastClientY = 0;
  private currentDropTarget: { handle: DragHandle; position: 'before' | 'after' | 'inside' } | null = null;
  private suppressScrollOnNextActiveChange = false;

  constructor(private svc: ProjectFilesService) {}

  // ── Lifecycle ──────────────────────────────────────────────
  ngOnChanges(changes: SimpleChanges) {
    if (changes['files']) {
      const currentStructure = this.getFileStructureKey(this.files);
      const hasStructuralChange = this.lastStructureKey !== null && this.lastStructureKey !== currentStructure;
      this.lastStructureKey = currentStructure;

      this.docSections = this.buildDocSections(this.files, 1);
      this.allImages = this.collectAllImages(this.files);

      if (!this.hasLoaded || hasStructuralChange) {
        const newFullContent = this.reconstructFromSections();

        if (hasStructuralChange && this.focusedHandle) {
          // Changement structurel (ex: drag réordonnancement) pendant le mode focus.
          // On recalcule la position de la section focusée dans le nouveau document
          // pour rester en mode focus au lieu d'en sortir.
          const focusedId   = this.focusedHandle.id;
          const focusedKind = this.focusedHandle.kind;

          // Calcul temporaire des ranges sur le nouveau contenu complet
          const tmpContent = this.unifiedContent;
          this.unifiedContent = newFullContent;
          this.recomputeRanges();
          this.unifiedContent = tmpContent;

          let newRange: { lineStart: number; lineEnd: number } | null = null;
          if (focusedKind === 'folder') {
            const sr = this.sectionRanges.find(r => r.folderId === focusedId);
            if (sr) newRange = { lineStart: sr.lineStart, lineEnd: sr.lineEnd };
          } else if (focusedKind === 'file') {
            const fr = this.fileRanges.find(r => r.fileId === focusedId);
            if (fr) newRange = { lineStart: fr.lineStart, lineEnd: fr.lineEnd };
          }

          if (newRange) {
            // Rester en focus avec les nouvelles positions de lignes
            this.fullContentBackup        = newFullContent;
            this.focusedLineStart         = newRange.lineStart;
            this.focusedOriginalLineCount = newRange.lineEnd - newRange.lineStart + 1;
            this.unifiedContent  = newFullContent.split('\n').slice(newRange.lineStart, newRange.lineEnd + 1).join('\n');
            this.lastSavedContent = this.unifiedContent;
            setTimeout(() => {
              const ta = this.textareaRef?.nativeElement;
              if (ta) ta.value = this.unifiedContent;
            });
          } else {
            // Section supprimée → sortir du mode focus
            this.focusedHandle    = null;
            this.fullContentBackup = '';
            this.unifiedContent   = newFullContent;
            this.lastSavedContent = this.unifiedContent;
          }
        } else if (!this.focusedHandle) {
          this.unifiedContent   = newFullContent;
          this.lastSavedContent = this.unifiedContent;
        }
        // Si focusedHandle && !hasStructuralChange : on garde le contenu focusé intact
      }
      this.hasLoaded = true;
      this.recomputeAll();
    }

    if (changes['activeNodeId']) {
      this.recomputeHighlights();
      if (this.activeNodeId && !this.suppressScrollOnNextActiveChange) {
        setTimeout(() => this.scrollToActive(), 50);
      }
      this.suppressScrollOnNextActiveChange = false;
    }

    if (changes['scrollToNodeId'] && this.scrollToNodeId) {
      setTimeout(() => this.scrollToNodeById(this.scrollToNodeId!), 100);
    }
  }

  // ── Section building ───────────────────────────────────────
  private buildDocSections(nodes: FileNode[], depth: number): DocSection[] {
    const sorted = [...nodes].sort((a, b) => (a.order || 0) - (b.order || 0));
    const result: DocSection[] = [];
    for (const node of sorted) {
      if (node.type !== 'folder') continue;
      const level = Math.min(depth, 4);
      const heading = '#'.repeat(level) + ' ' + node.name;
      const nodeChildren = node.children || [];
      const mainFile = nodeChildren.find(c => c.type === 'file' && c.name === 'contenu.md')
                    || nodeChildren.find(c => c.type === 'file' && !this.isImageFile(c.name));
      const mainContent = mainFile?.content ?? '';
      const images = nodeChildren.filter(c => c.type === 'file' && this.isImageFile(c.name));
      const additionalFiles = nodeChildren.filter(c => c.type === 'file' && c !== mainFile && !this.isImageFile(c.name));

      let textContent = heading + '\n';
      if (mainContent.trim()) textContent += mainContent.trimEnd() + '\n';
      if (additionalFiles.length > 0) {
        const blocks = additionalFiles.map(c => `'${c.name.replace(/\.md$/, '')}\n${c.content || ''}\n'`).join('\n\n');
        textContent += '\n' + blocks + '\n';
      }
      textContent = textContent.trimEnd();

      result.push({
        folderId: node.id,
        folderName: node.name,
        textContent,
        level,
        images,
        mainFileId: mainFile?.id || null,
      });

      // Recurse into sub-folders
      const subFolders = nodeChildren.filter(c => c.type === 'folder');
      if (subFolders.length > 0) {
        result.push(...this.buildDocSections(subFolders, depth + 1));
      }
    }
    return result;
  }

  private collectAllImages(nodes: FileNode[]): FileNode[] {
    const result: FileNode[] = [];
    const walk = (ns: FileNode[]) => {
      for (const n of ns) {
        if (n.type === 'file' && this.isImageFile(n.name)) result.push(n);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return result;
  }

  private reconstructFromSections(): string {
    const texts = this.docSections.map(s => s.textContent).filter(t => t.trim());
    return texts.join('\n\n') + (texts.length > 0 ? '\n' : '');
  }

  // ── Recompute pipeline ─────────────────────────────────────
  private recomputeAll() {
    this.recomputeRanges();
    this.recomputeHighlights();
    this.recomputeHandles();
    this.recomputeRenderedHtml();
  }

  private recomputeHandles() {
    const list: DragHandle[] = [];
    // Sections (folders)
    for (const r of this.sectionRanges) {
      const node = this.findNode(r.folderId, this.files);
      if (!node) continue;
      list.push({
        id: r.folderId,
        kind: 'folder',
        level: r.level,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        top: this.PADDING_TOP_PX + r.lineStart * this.LINE_HEIGHT_PX,
        height: Math.max((r.lineEnd - r.lineStart + 1) * this.LINE_HEIGHT_PX, 24),
        label: node.name,
      });
    }
    // Additional files
    for (const r of this.fileRanges) {
      const node = this.findNode(r.fileId, this.files);
      if (!node) continue;
      list.push({
        id: r.fileId,
        kind: 'file',
        level: 0,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        top: this.PADDING_TOP_PX + r.lineStart * this.LINE_HEIGHT_PX,
        height: Math.max((r.lineEnd - r.lineStart + 1) * this.LINE_HEIGHT_PX, 24),
        label: node.name.replace(/\.md$/, ''),
      });
    }
    // Image markers
    for (const ml of this.mirrorLines) {
      if (!ml.isImage) continue;
      list.push({
        id: ml.imageId,
        kind: 'image',
        level: 0,
        lineStart: ml.lineIndex,
        lineEnd: ml.lineIndex,
        top: this.PADDING_TOP_PX + ml.lineIndex * this.LINE_HEIGHT_PX,
        height: this.LINE_HEIGHT_PX,
        label: ml.imageName,
      });
    }
    list.sort((a, b) => a.top - b.top);
    this.handles = list;
  }

  private recomputeRanges() {
    const lines = this.unifiedContent.split('\n');
    const flatHeads: { lineIdx: number; level: number; name: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^(#{1,4}) (.+)$/.exec(lines[i]);
      if (m) flatHeads.push({ lineIdx: i, level: m[1].length, name: m[2].trim() });
    }
    // Map docSections to flatHeads in order (by level + name)
    this.sectionRanges = [];
    let cursor = 0;
    for (const sec of this.docSections) {
      let found = -1;
      for (let j = cursor; j < flatHeads.length; j++) {
        if (flatHeads[j].level === sec.level && flatHeads[j].name === sec.folderName) {
          found = j;
          break;
        }
      }
      if (found === -1) continue;
      cursor = found + 1;
      this.sectionRanges.push({
        folderId: sec.folderId,
        level: sec.level,
        lineStart: flatHeads[found].lineIdx,
        lineEnd: lines.length - 1, // patched below
      });
    }
    // lineEnd = juste avant la prochaine section de même niveau ou inférieur (=parent)
    for (let i = 0; i < this.sectionRanges.length; i++) {
      const r = this.sectionRanges[i];
      let end = lines.length - 1;
      for (let j = i + 1; j < this.sectionRanges.length; j++) {
        if (this.sectionRanges[j].level <= r.level) {
          end = this.sectionRanges[j].lineStart - 1;
          break;
        }
      }
      r.lineEnd = end;
    }

    // Détection des blocs de fichiers additionnels : 'name\n...content...\n'
    this.fileRanges = [];
    for (const r of this.sectionRanges) {
      const folderNode = this.findNode(r.folderId, this.files);
      if (!folderNode) continue;
      const additionalFiles = (folderNode.children || []).filter(c =>
        c.type === 'file' && !this.isImageFile(c.name) && c.name !== 'contenu.md'
      );
      if (additionalFiles.length === 0) continue;

      let i = r.lineStart + 1;
      while (i <= r.lineEnd) {
        const m = /^(['`^])(.+)$/.exec(lines[i]);
        if (m) {
          const delim = m[1];
          const name = m[2].trim();
          let endLine = -1;
          for (let j = i + 1; j <= r.lineEnd; j++) {
            if (lines[j].trim() === delim) { endLine = j; break; }
          }
          if (endLine !== -1) {
            const fileNode = additionalFiles.find(f =>
              this.slugify(f.name.replace(/\.md$/, '')) === this.slugify(name)
            );
            if (fileNode) {
              this.fileRanges.push({ fileId: fileNode.id, lineStart: i, lineEnd: endLine });
            }
            i = endLine + 1;
            continue;
          }
        }
        i++;
      }
    }
  }

  private recomputeHighlights() {
    this.computeHighlights();
    this.recomputeMirrorLines();
    this.recomputeRenderedHtml();
  }

  private computeHighlights() {
    this.highlightedFolderIds = new Set<string>();
    this.highlightedFileIds = new Set<string>();
    if (!this.activeNodeId) return;
    const node = this.findNode(this.activeNodeId, this.files);
    if (!node) return;
    if (node.type === 'folder') {
      const addAll = (n: FileNode) => {
        this.highlightedFolderIds.add(n.id);
        for (const c of (n.children || [])) {
          if (c.type === 'folder') addAll(c);
        }
      };
      addAll(node);
    } else if (node.type === 'file' && !this.isImageFile(node.name)) {
      if (node.name === 'contenu.md') {
        // Fichier principal : surligne le dossier parent (bleu)
        const parent = this.findParentFolder(this.activeNodeId, this.files);
        if (parent) this.highlightedFolderIds.add(parent.id);
      } else {
        // Document additionnel : surligne uniquement son bloc (vert)
        this.highlightedFileIds.add(this.activeNodeId);
      }
    }
  }

  private recomputeMirrorLines() {
    const lines = this.unifiedContent.split('\n');
    const folderHl = new Set<number>();
    const fileHl = new Set<number>();
    for (const r of this.sectionRanges) {
      if (this.highlightedFolderIds.has(r.folderId)) {
        for (let i = r.lineStart; i <= r.lineEnd; i++) folderHl.add(i);
      }
    }
    for (const r of this.fileRanges) {
      if (this.highlightedFileIds.has(r.fileId)) {
        for (let i = r.lineStart; i <= r.lineEnd; i++) fileHl.add(i);
      }
    }
    this.mirrorLines = lines.map((line, i) => {
      const kind: 'folder' | 'file' | null = fileHl.has(i) ? 'file' : (folderHl.has(i) ? 'folder' : null);
      const m = /^\{\{IMG:([a-z0-9-]+)\}\}\s*$/i.exec(line.trim());
      if (m) {
        const img = this.allImages.find(im => im.id === m[1]);
        return {
          text: line,
          isImage: true,
          imageId: m[1],
          imageName: img?.name || 'image manquante',
          imagePath: img?.path || '',
          highlightKind: kind,
          lineIndex: i,
        };
      }
      return { text: line, isImage: false, imageId: '', imageName: '', imagePath: '', highlightKind: kind, lineIndex: i };
    });
  }

  private recomputeRenderedHtml() {
    if (this.mode !== 'visu') {
      this.renderedHtml = '';
      return;
    }
    let md = this.unifiedContent.replace(/\{\{IMG:([a-z0-9-]+)\}\}/gi, (_, id) => {
      const img = this.allImages.find(im => im.id === id);
      if (!img) return `\n\n*[image manquante]*\n\n`;
      const encodedPath = img.path.split('/').map(s => encodeURIComponent(s)).join('/');
      const url = this.svc.getImageUrl(this.projectName, encodedPath);
      return `\n\n![${this.escapeAlt(img.name)}](${url})\n\n`;
    });

    // Extraire les blocs de fichiers, les rendre séparément, remplacer par un placeholder
    const placeholders: { token: string; html: string }[] = [];
    md = md.replace(/^(['`^])([^\n]+)\n([\s\S]*?)\n\1\s*$/gm, (_match, _delim, name, content) => {
      const trimmed = (name as string).trim();
      const fileNode = this.findFileBySlug(trimmed);
      const fileId = fileNode?.id || '';
      const inner = marked.parse(content as string, { async: false }) as string;
      const hlClass = fileId && this.highlightedFileIds.has(fileId) ? ' visu-file--hl' : '';
      const token = `@@FB${placeholders.length}@@`;
      const attr = fileId ? ` data-file-id="${fileId}"` : '';
      placeholders.push({
        token,
        html: `<div class="visu-file${hlClass}"${attr}><div class="visu-file__title">${this.escapeHtml(trimmed)}</div>${inner}</div>`,
      });
      return `\n\n${token}\n\n`;
    });

    let html = marked.parse(md, { async: false }) as string;
    for (const ph of placeholders) {
      const wrapped = new RegExp(`<p>\\s*${ph.token}\\s*</p>`, 'g');
      html = html.replace(wrapped, ph.html).replace(ph.token, ph.html);
    }
    // Marquer chaque heading avec data-section-id pour scroll/highlight
    for (const sec of this.docSections) {
      const tag = `h${sec.level}`;
      const escaped = sec.folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`<${tag}([^>]*)>${escaped}</${tag}>`);
      const hl = this.highlightedFolderIds.has(sec.folderId) ? ' visu-section visu-section--hl' : ' visu-section';
      html = html.replace(re, (_match, attrs) => {
        return `<${tag}${attrs} data-section-id="${sec.folderId}" class="${hl.trim()}">${this.escapeHtml(sec.folderName)}</${tag}>`;
      });
    }
    this.renderedHtml = this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeAlt(s: string): string {
    return s.replace(/[\[\]]/g, '');
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Mode toggle ─────────────────────────────────────────────
  setMode(m: 'edit' | 'visu') {
    if (this.mode === m) return;
    if (this.mode === 'edit') {
      if (this.focusedHandle) this.exitFocusMode(); // sortie focus avant de passer en visu
      else this.saveAll();
    }
    this.mode = m;
    this.recomputeAll();
    if (this.activeNodeId) {
      setTimeout(() => this.scrollToActive(), 80);
    }
  }

  // ── Mode focus : édition d'une seule section / document ─────
  enterFocusMode(handle: DragHandle, ev?: MouseEvent) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    clearTimeout(this.saveTimeout);

    if (this.focusedHandle) {
      // Déjà en mode focus : sortir d'abord (merge + recompute du doc complet),
      // puis retrouver le handle cible dans les handles reconstruits du doc complet.
      this.exitFocusModeSync();
      const found = this.handles.find(h => h.id === handle.id);
      if (!found) return;
      handle = found;
    }

    if (this.unifiedContent !== this.lastSavedContent) this.saveAll();

    const lines = this.unifiedContent.split('\n');
    this.focusedLineStart = handle.lineStart;
    this.focusedOriginalLineCount = handle.lineEnd - handle.lineStart + 1;
    this.fullContentBackup = this.unifiedContent;

    this.unifiedContent = lines.slice(handle.lineStart, handle.lineEnd + 1).join('\n');
    this.lastSavedContent = this.unifiedContent;
    this.focusedHandle = handle;

    this.recomputeAll();
    setTimeout(() => {
      const ta = this.textareaRef?.nativeElement;
      if (ta) { ta.value = this.unifiedContent; ta.focus(); ta.setSelectionRange(0, 0); }
    });
  }

  exitFocusMode() {
    this.exitFocusModeSync();
    setTimeout(() => {
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
    });
    this.saveAll();
  }

  private exitFocusModeSync() {
    if (!this.focusedHandle) return;
    clearTimeout(this.saveTimeout);

    const focusedLines = this.unifiedContent.split('\n');
    const fullLines = this.fullContentBackup.split('\n');
    fullLines.splice(this.focusedLineStart, this.focusedOriginalLineCount, ...focusedLines);

    this.focusedHandle = null;
    this.fullContentBackup = '';
    this.unifiedContent = fullLines.join('\n');
    this.lastSavedContent = '';

    this.recomputeAll(); // reconstruit handles depuis le document complet
  }

  // ── Edit-mode events ────────────────────────────────────────
  onTextareaInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    this.unifiedContent = ta.value;
    this.recomputeRanges();
    this.recomputeMirrorLines();
    this.recomputeHandles();
    this.scheduleSave();
  }

  onTextareaScroll(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    const m = this.mirrorRef?.nativeElement;
    if (m) {
      m.scrollTop = ta.scrollTop;
      m.scrollLeft = ta.scrollLeft;
    }
    const o = this.overlayRef?.nativeElement;
    if (o) {
      const inner = o.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = `translateY(${-ta.scrollTop}px)`;
    }
  }

  // ── Survol : déterminer la poignée affichée sur la ligne courante ──
  // Priorité : image > document > dossier le plus profond.
  // Pendant un drag, on fige (la poignée affichée reste celle qu'on déplace).
  onWrapMouseMove(ev: MouseEvent) {
    if (this.draggingHandle) return;
    const ta = this.textareaRef?.nativeElement;
    if (!ta) { this.hoveredHandle = null; return; }
    const rect = ta.getBoundingClientRect();
    if (ev.clientY < rect.top + 4 || ev.clientY > rect.bottom - 4) {
      this.hoveredHandle = null;
      return;
    }
    const contentY = ev.clientY - rect.top + ta.scrollTop;
    const lineIdx = Math.floor((contentY - this.PADDING_TOP_PX) / this.LINE_HEIGHT_PX);
    if (lineIdx < 0) { this.hoveredHandle = null; return; }

    // 1) Image (ligne unique)
    for (const ml of this.mirrorLines) {
      if (ml.isImage && ml.lineIndex === lineIdx) {
        const h = this.handles.find(x => x.kind === 'image' && x.id === ml.imageId);
        if (h) { this.setHoveredHandle(h); return; }
      }
    }
    // 2) Document (bloc 'name ... ')
    for (const fr of this.fileRanges) {
      if (lineIdx >= fr.lineStart && lineIdx <= fr.lineEnd) {
        const h = this.handles.find(x => x.kind === 'file' && x.id === fr.fileId);
        if (h) { this.setHoveredHandle(h); return; }
      }
    }
    // 3) Dossier (le plus profond contenant la ligne)
    let best: SectionRange | null = null;
    for (const r of this.sectionRanges) {
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        if (!best || r.level > best.level) best = r;
      }
    }
    if (best) {
      const h = this.handles.find(x => x.kind === 'folder' && x.id === best!.folderId);
      if (h) { this.setHoveredHandle(h); return; }
    }
    this.hoveredHandle = null;
  }

  onWrapMouseLeave() {
    if (!this.draggingHandle) this.hoveredHandle = null;
  }

  private setHoveredHandle(h: DragHandle) {
    if (this.hoveredHandle?.id !== h.id) this.hoveredHandle = h;
  }

  onTextareaCursor(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    const lineIdx = ta.value.substring(0, ta.selectionStart).split('\n').length - 1;
    // Priorité : si dans un bloc fichier additionnel → emit fileId
    for (const fr of this.fileRanges) {
      if (lineIdx >= fr.lineStart && lineIdx <= fr.lineEnd) {
        this.suppressScrollOnNextActiveChange = true;
        this.nodeActive.emit(fr.fileId);
        return;
      }
    }
    for (let i = this.sectionRanges.length - 1; i >= 0; i--) {
      const r = this.sectionRanges[i];
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        this.suppressScrollOnNextActiveChange = true;
        this.nodeActive.emit(r.folderId);
        return;
      }
    }
  }

  onTextareaBlur() {
    this.saveAll();
  }

  private scheduleSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveAll(), 800);
  }

  private saveAll() {
    if (this.unifiedContent === this.lastSavedContent) return;
    this.lastSavedContent = this.unifiedContent;

    let contentToParse: string;
    if (this.focusedHandle) {
      // Mode focus : reconstruire le document complet avant de parser
      // (évite que le parent ne détecte des suppressions de sections hors focus)
      const focusedLines = this.unifiedContent.split('\n');
      const fullLines = this.fullContentBackup.split('\n');
      fullLines.splice(this.focusedLineStart, this.focusedOriginalLineCount, ...focusedLines);
      // Mettre à jour le backup et le compteur de lignes pour les sauvegardes suivantes
      this.focusedOriginalLineCount = focusedLines.length;
      this.fullContentBackup = fullLines.join('\n');
      contentToParse = this.fullContentBackup;
    } else {
      contentToParse = this.unifiedContent;
    }

    // parseContent() opère sur this.unifiedContent — on substitue temporairement
    const saved = this.unifiedContent;
    this.unifiedContent = contentToParse;
    const sections = this.parseContent();
    this.unifiedContent = saved;
    this.sectionsChange.emit(sections);
  }

  // ── Content parsing (compat existant) ──────────────────────
  parseContent(): SectionInfo[] {
    const text = this.unifiedContent;
    const folderMap = this.buildFolderMap(this.files);
    const sections: SectionInfo[] = [];
    const regex = /^(#{1,4}) (.+)$/gm;
    const matches: { level: number; name: string; index: number; contentStart: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      matches.push({ level: m[1].length, name: m[2].trim(), index: m.index, contentStart: m.index + m[0].length + 1 });
    }
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const contentEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
      let rawContent = text.substring(current.contentStart, contentEnd).trimEnd();
      const additionalFiles: AdditionalFile[] = [];
      const blockRegex = /^(['`^])([^\n]+)(?:\n([\s\S]*?))?\n?\1/gm;
      const mainContent = rawContent.replace(blockRegex, (_match, _delimiter, title, content) => {
        additionalFiles.push({ name: (title as string).trim(), content: ((content as string) || '').trimEnd(), fileId: null });
        return '';
      }).trim();
      const parentPath: string[] = [];
      let targetLevel = current.level - 1;
      for (let k = i - 1; k >= 0 && targetLevel > 0; k--) {
        if (matches[k].level === targetLevel) { parentPath.unshift(matches[k].name); targetLevel--; }
      }
      const fullPath = [...parentPath.map(p => this.slugify(p)), this.slugify(current.name)].join('/');
      const parentKey = parentPath.map(p => this.slugify(p)).join('/');
      const info = folderMap.get(fullPath);
      const parentInfo = parentKey ? folderMap.get(parentKey) : null;
      const mainFile = info?.files.find(f => f.name === 'contenu.md') || info?.files.find(f => !this.isImageFile(f.name));
      additionalFiles.forEach(af => {
        const found = info?.files.find(f => this.slugify(f.name.replace(/\.md$/, '')) === this.slugify(af.name));
        if (found) af.fileId = found.id;
      });
      sections.push({
        level: current.level, folderName: current.name, parentPath,
        folderId: info?.folder.id ?? null, parentFolderId: parentInfo?.folder.id ?? null,
        fileId: mainFile?.id ?? null, content: mainContent, additionalFiles
      });
    }
    return sections;
  }

  private slugify(text: string): string {
    return text.toString().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
      .replace(/-+/g, '-').trim();
  }

  private buildFolderMap(nodes: FileNode[], prefix: string[] = []): Map<string, { folder: FileNode; files: FileNode[] }> {
    const map = new Map<string, { folder: FileNode; files: FileNode[] }>();
    for (const node of nodes) {
      if (node.type === 'folder') {
        const pathParts = [...prefix, this.slugify(node.name)];
        const key = pathParts.join('/');
        const files = (node.children || []).filter(c => c.type === 'file');
        map.set(key, { folder: node, files });
        const submap = this.buildFolderMap(node.children || [], pathParts);
        submap.forEach((v, k) => map.set(k, v));
      }
    }
    return map;
  }

  // ── Toolbar formatting ──────────────────────────────────────
  insertAt(before: string, after = '') {
    const ta = this.textareaRef?.nativeElement;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const newVal = ta.value.substring(0, start) + before + selected + after + ta.value.substring(end);
    this.unifiedContent = newVal;
    ta.value = newVal;
    this.recomputeRanges();
    this.recomputeMirrorLines();
    this.scheduleSave();
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  // ── Image upload ───────────────────────────────────────────
  triggerImageUpload() {
    this.imageUploadError = '';
    this.imageInputRef?.nativeElement.click();
  }

  async onImageFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
    if (!allowed.includes(file.type)) {
      this.imageUploadError = 'Type non autorisé (jpg, png, gif, webp, svg).';
      return;
    }
    if (file.size > 1024 * 1024) {
      this.imageUploadError = `Fichier trop grand (${(file.size / 1024 / 1024).toFixed(1)} Mo). Max 1 Mo.`;
      return;
    }
    const folderId = this.getCursorFolderId() || this.getActiveFolderId();
    try {
      const node = await this.svc.uploadImage(this.projectName, file, folderId);
      this.imageUploadError = '';
      const ta = this.textareaRef?.nativeElement;
      if (ta && this.mode === 'edit') {
        const pos = ta.selectionStart;
        const before = ta.value.substring(0, pos);
        const after = ta.value.substring(pos);
        const prefix = (before.length === 0 || before.endsWith('\n')) ? '' : '\n';
        const suffix = (after.length === 0 || after.startsWith('\n')) ? '' : '\n';
        const marker = `${prefix}{{IMG:${node.id}}}${suffix}`;
        const newVal = before + marker + after;
        this.unifiedContent = newVal;
        ta.value = newVal;
        this.recomputeRanges();
        this.recomputeMirrorLines();
        setTimeout(() => {
          ta.focus();
          const newPos = pos + marker.length;
          ta.setSelectionRange(newPos, newPos);
        });
      }
      this.scheduleSave();
      this.refresh.emit();
    } catch (e: any) {
      this.imageUploadError = e?.error?.error || 'Erreur lors de l\'upload.';
    }
  }

  private getCursorFolderId(): string | null {
    const ta = this.textareaRef?.nativeElement;
    if (!ta) return null;
    const lineIdx = ta.value.substring(0, ta.selectionStart).split('\n').length - 1;
    for (let i = this.sectionRanges.length - 1; i >= 0; i--) {
      const r = this.sectionRanges[i];
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) return r.folderId;
    }
    return null;
  }

  private getActiveFolderId(): string | null {
    if (!this.activeNodeId) return null;
    const node = this.findNode(this.activeNodeId, this.files);
    if (node?.type === 'folder') return node.id;
    return this.findParentFolder(this.activeNodeId, this.files)?.id || null;
  }

  // ── Image card (edit mode) ─────────────────────────────────
  getImageUrl(path: string): string {
    return this.svc.getImageUrl(this.projectName, path);
  }

  onImageHoverEnter(line: MirrorLine, ev: MouseEvent) {
    if (this.renamingImageId === line.imageId) return;
    if (!line.imagePath) return;
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.hoverPreview = {
      url: this.getImageUrl(line.imagePath),
      name: line.imageName,
      top: rect.bottom + 4,
      left: rect.left,
    };
  }

  onImageHoverLeave() {
    this.hoverPreview = null;
  }

  onImageCardClick(line: MirrorLine, ev: MouseEvent) {
    ev.stopPropagation();
    const ta = this.textareaRef?.nativeElement;
    if (!ta) return;
    const lines = this.unifiedContent.split('\n');
    let pos = 0;
    for (let i = 0; i < line.lineIndex; i++) pos += lines[i].length + 1;
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos + (lines[line.lineIndex]?.length || 0));
    });
  }

  startRenameImage(line: MirrorLine, ev: MouseEvent) {
    ev.stopPropagation();
    this.renamingImageId = line.imageId;
    this.renameImageValue = line.imageName.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
    this.deleteConfirmImageId = null;
    this.hoverPreview = null;
  }

  async confirmRenameImage(line: MirrorLine) {
    const newBase = this.renameImageValue.trim();
    if (!newBase) { this.cancelRenameImage(); return; }
    const ext = (line.imageName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)?.[0]) || '';
    const newName = newBase.endsWith(ext) ? newBase : newBase + ext;
    if (newName === line.imageName) { this.cancelRenameImage(); return; }
    try {
      await this.svc.renameFile(this.projectName, line.imageId, newName);
      this.renamingImageId = null;
      this.renameImageValue = '';
      this.refresh.emit();
    } catch (e: any) {
      console.error('[Zone4] rename image failed', e);
    }
  }

  cancelRenameImage() {
    this.renamingImageId = null;
    this.renameImageValue = '';
  }

  askDeleteImage(line: MirrorLine, ev: MouseEvent) {
    ev.stopPropagation();
    this.deleteConfirmImageId = line.imageId;
    this.renamingImageId = null;
    this.hoverPreview = null;
  }

  cancelDeleteImage(ev?: MouseEvent) {
    if (ev) ev.stopPropagation();
    this.deleteConfirmImageId = null;
  }

  async confirmDeleteImage(line: MirrorLine, ev: MouseEvent) {
    ev.stopPropagation();
    try {
      await this.svc.deleteFile(this.projectName, line.imageId);
      this.deleteConfirmImageId = null;
      // Retire la ligne du marqueur dans unifiedContent
      const lines = this.unifiedContent.split('\n');
      lines.splice(line.lineIndex, 1);
      this.unifiedContent = lines.join('\n');
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
      this.recomputeRanges();
      this.recomputeMirrorLines();
      this.scheduleSave();
      this.refresh.emit();
    } catch (e: any) {
      console.error('[Zone4] delete image failed', e);
    }
  }

  // ── Visu interactions ──────────────────────────────────────
  onVisuClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const fileEl = target.closest('[data-file-id]') as HTMLElement | null;
    if (fileEl) {
      const id = fileEl.getAttribute('data-file-id');
      if (id) { this.nodeActive.emit(id); return; }
    }
    const sec = target.closest('[data-section-id]') as HTMLElement | null;
    if (sec) {
      const id = sec.getAttribute('data-section-id');
      if (id) this.nodeActive.emit(id);
    }
  }

  // ── Scroll / navigation ────────────────────────────────────
  scrollToNodeById(id: string) {
    if (this.mode === 'visu') {
      const root = this.visuRef?.nativeElement;
      const el = (root?.querySelector(`[data-file-id="${id}"]`)
                 || root?.querySelector(`[data-section-id="${id}"]`)) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const fileRange = this.fileRanges.find(r => r.fileId === id);
    if (fileRange) { this.scrollEditToLine(fileRange.lineStart); return; }
    let range = this.sectionRanges.find(r => r.folderId === id);
    if (!range) {
      const parent = this.findParentFolder(id, this.files);
      if (parent) range = this.sectionRanges.find(r => r.folderId === parent.id);
    }
    if (!range) return;
    this.scrollEditToLine(range.lineStart);
  }

  private scrollToActive() {
    if (this.activeNodeId) this.scrollToNodeById(this.activeNodeId);
  }

  private scrollEditToLine(lineIdx: number) {
    const ta = this.textareaRef?.nativeElement;
    if (!ta) return;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Math.max(0, lineIdx * lh - 32);
    if (this.mirrorRef) this.mirrorRef.nativeElement.scrollTop = ta.scrollTop;
  }

  // ── Compat avec parent (no-op) ─────────────────────────────
  appendSection(_folderName: string, _level = 1) {}
  insertSectionInParent(_parentName: string, _parentDepth: number, _sectionName: string) {}

  // ── Tree helpers ───────────────────────────────────────────
  isImageFile(name: string): boolean { return this.svc.isImageFile(name); }

  private findNode(id: string, nodes: FileNode[]): FileNode | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = this.findNode(id, n.children); if (f) return f; }
    }
    return null;
  }

  private findFileBySlug(name: string, nodes: FileNode[] = this.files): FileNode | null {
    const slug = this.slugify(name);
    for (const n of nodes) {
      if (n.type === 'file' && n.name !== 'contenu.md' && !this.isImageFile(n.name)) {
        if (this.slugify(n.name.replace(/\.md$/, '')) === slug) return n;
      }
      if (n.children) {
        const f = this.findFileBySlug(name, n.children);
        if (f) return f;
      }
    }
    return null;
  }

  private findParentFolder(id: string, nodes: FileNode[]): FileNode | null {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if ((node.children || []).some(c => c.id === id)) return node;
        const found = this.findParentFolder(id, node.children || []);
        if (found) return found;
      }
    }
    return null;
  }

  // ── Drag rail ──────────────────────────────────────────────
  startHandleDrag(handle: DragHandle, ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    // En mode focus : forcer une sauvegarde avant de lancer le drag
    // (le clearTimeout ci-dessous annulera le debounce, le contenu doit être persisté)
    if (this.focusedHandle && this.unifiedContent !== this.lastSavedContent) {
      this.saveAll();
    }
    // Annule toute sauvegarde différée : sinon un parseContent sur le texte courant
    // peut tourner en parallèle du moveFile et provoquer un effacement du document
    // (cf. cleanup orphan additional files dans onSectionsChange).
    clearTimeout(this.saveTimeout);
    this.draggingHandle = handle;
    this.hoveredHandle = handle; // gèle l'affichage sur la poignée draguée
    this.dragLastClientY = ev.clientY;
    this.dragGhost = { label: handle.label, kind: handle.kind, x: ev.clientX + 12, y: ev.clientY + 8 };
    this.dropIndicator = null;
    this.currentDropTarget = null;

    // Les listeners doivent tourner DANS la NgZone pour que les mises à jour de
    // dragGhost / dropIndicator soient reflétées par la change detection
    // (sinon le ghost reste invisible sous le curseur).
    this.dragMoveListener = (e: MouseEvent) => this.zone.run(() => this.onDragMove(e));
    this.dragUpListener = (e: MouseEvent) => this.zone.run(() => this.onDragUp(e));
    window.addEventListener('mousemove', this.dragMoveListener);
    window.addEventListener('mouseup', this.dragUpListener);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    this.startAutoScrollLoop();
  }

  private onDragMove(ev: MouseEvent) {
    if (!this.draggingHandle) return;
    this.dragLastClientY = ev.clientY;
    this.dragGhost = { label: this.draggingHandle.label, kind: this.draggingHandle.kind, x: ev.clientX + 12, y: ev.clientY + 8 };
    this.updateDropTarget(ev.clientY);
  }

  private updateDropTarget(clientY: number) {
    const mirrorEl = this.mirrorRef?.nativeElement;
    if (!mirrorEl || !this.draggingHandle) return;
    const rect = mirrorEl.getBoundingClientRect();
    const contentY = clientY - rect.top + mirrorEl.scrollTop;

    const draggedNode = this.findNode(this.draggingHandle.id, this.files);
    const isDragFolder = this.draggingHandle.kind === 'folder';

    // Pour un drag de dossier : cibler uniquement les dossiers du même niveau.
    // Cela évite de tomber sur une sous-section et de déclencher un nesting
    // accidentel au lieu d'un réordonnancement.
    const candidates = this.handles.filter(h => {
      if (h.id === this.draggingHandle!.id) return false;
      if (draggedNode?.type === 'folder' && this.isDescendantOf(h.id, this.draggingHandle!.id)) return false;
      if (isDragFolder) return h.kind === 'folder' && h.level === this.draggingHandle!.level;
      return true;
    });

    let target: DragHandle | null = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const h = candidates[i];
      if (contentY >= h.top && contentY <= h.top + h.height) { target = h; break; }
    }
    if (!target) {
      let best: DragHandle | null = null;
      let bestDist = Infinity;
      for (const h of candidates) {
        const center = h.top + h.height / 2;
        const dist = Math.abs(center - contentY);
        if (dist < bestDist) { bestDist = dist; best = h; }
      }
      target = best;
    }

    if (!target) {
      this.dropIndicator = null;
      this.currentDropTarget = null;
      return;
    }

    const relY = contentY - target.top;
    const ratio = relY / target.height;
    let position: 'before' | 'after' | 'inside';

    if (isDragFolder) {
      // Uniquement before/after pour les dossiers de même niveau (pas de nesting accidentel)
      position = ratio < 0.5 ? 'before' : 'after';
    } else {
      position = ratio < 0.3 ? 'before' : (ratio > 0.7 ? 'after' : (target.kind === 'folder' ? 'inside' : (ratio < 0.5 ? 'before' : 'after')));
    }

    this.currentDropTarget = { handle: target, position };
    if (position === 'inside') {
      this.dropIndicator = { top: target.top, height: target.height, position: 'inside' };
    } else {
      const indicatorTop = position === 'before' ? target.top : target.top + target.height;
      this.dropIndicator = { top: indicatorTop - 1, height: 2, position };
    }
  }

  private isDescendantOf(childId: string, ancestorId: string): boolean {
    const ancestor = this.findNode(ancestorId, this.files);
    if (!ancestor || ancestor.type !== 'folder') return false;
    const walk = (nodes: FileNode[]): boolean => {
      for (const n of nodes) {
        if (n.id === childId) return true;
        if (n.children && walk(n.children)) return true;
      }
      return false;
    };
    return walk(ancestor.children || []);
  }

  private startAutoScrollLoop() {
    const loop = () => {
      if (!this.draggingHandle) return;
      const ta = this.textareaRef?.nativeElement;
      if (ta) {
        const rect = ta.getBoundingClientRect();
        const margin = 40;
        let dy = 0;
        if (this.dragLastClientY < rect.top + margin) dy = -Math.min(15, (rect.top + margin - this.dragLastClientY));
        else if (this.dragLastClientY > rect.bottom - margin) dy = Math.min(15, (this.dragLastClientY - (rect.bottom - margin)));
        if (dy !== 0) {
          ta.scrollTop += dy;
          if (this.mirrorRef) this.mirrorRef.nativeElement.scrollTop = ta.scrollTop;
          this.updateDropTarget(this.dragLastClientY);
        }
      }
      this.dragAutoScrollRaf = requestAnimationFrame(loop);
    };
    this.dragAutoScrollRaf = requestAnimationFrame(loop);
  }

  private onDragUp(_ev: MouseEvent) {
    const dragged = this.draggingHandle;
    const target = this.currentDropTarget;
    this.cleanupDrag();
    if (!dragged || !target) return;
    if (dragged.id === target.handle.id) return;

    // Images: déplacer le marqueur {{IMG:id}} dans le contenu (pas le fichier physique)
    if (dragged.kind === 'image') {
      this.moveImageMarker(dragged.lineStart, target.handle.lineStart, target.position);
      return;
    }

    const draggedNode = this.findNode(dragged.id, this.files);
    const targetNode = this.findNode(target.handle.id, this.files);
    if (!draggedNode || !targetNode) return;

    const draggedParent = this.findParentFolder(dragged.id, this.files);
    const targetParent = this.findParentFolder(target.handle.id, this.files);
    const targetParentId = targetParent?.id || null;
    const targetSiblings = targetParent ? (targetParent.children || []) : this.files;

    this.dragDrop.emit({
      draggedNode,
      draggedParentId: draggedParent?.id || null,
      targetNode,
      targetParentId,
      position: target.position,
      targetSiblings,
    });
  }

  private moveImageMarker(srcLine: number, targetLine: number, position: 'before' | 'after' | 'inside') {
    const lines = this.unifiedContent.split('\n');
    if (srcLine < 0 || srcLine >= lines.length) return;
    const marker = lines[srcLine];
    if (!/^\{\{IMG:[a-z0-9-]+\}\}/i.test(marker.trim())) return;

    lines.splice(srcLine, 1);
    const adjusted = targetLine > srcLine ? targetLine - 1 : targetLine;
    const insertAt = Math.max(0, Math.min(position === 'before' ? adjusted : adjusted + 1, lines.length));
    lines.splice(insertAt, 0, marker);

    this.unifiedContent = lines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeAll();
    this.scheduleSave();
  }

  private cleanupDrag() {
    if (this.dragMoveListener) window.removeEventListener('mousemove', this.dragMoveListener);
    if (this.dragUpListener) window.removeEventListener('mouseup', this.dragUpListener);
    this.dragMoveListener = null;
    this.dragUpListener = null;
    if (this.dragAutoScrollRaf) cancelAnimationFrame(this.dragAutoScrollRaf);
    this.dragAutoScrollRaf = null;
    this.draggingHandle = null;
    this.dragGhost = null;
    this.dropIndicator = null;
    this.currentDropTarget = null;
    this.hoveredHandle = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  private getFileStructureKey(nodes: FileNode[], parentId: string = 'root'): string {
    let key = '';
    for (const node of nodes) {
      if (node.type === 'file') {
        key += `|f:${node.id}-p:${parentId}`;
      } else if (node.children) {
        key += this.getFileStructureKey(node.children, node.id);
      }
    }
    return key;
  }
}
