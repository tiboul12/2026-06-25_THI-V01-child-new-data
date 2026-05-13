import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges, ViewChild, ViewChildren, QueryList, ElementRef, inject, NgZone, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileNode, ProjectFilesService } from '../../../../../core/services/project-files.service';
import { marked } from 'marked';
import { WoActionHistoryService } from '../../../../../core/services/wo-action-history.service';
import { ProjetCollabService } from '../../../../../core/services/projet-collab.service';
import { AuthService } from '../../../../../core/services/auth.service';

export interface FileSaveEvent {
  fileId: string;
  content: string;
}

export interface AdditionalFile {
  name: string;
  content: string;
  fileId: string | null;
  orderedChildIds?: string[];
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
  orderedFileIds: string[];
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

interface InlineBlockRange {
  id: string;
  kind: 'block-table' | 'block-quote' | 'block-fence' | 'block-list';
  lineStart: number;
  lineEnd: number;
  parentFolderId: string | null;
}

interface MirrorLine {
  text: string;
  safeHtml: string;
  isImage: boolean;
  imageId: string;
  imageName: string;
  imagePath: string;
  highlightKind: 'folder' | 'file' | null;
  lineIndex: number;
  isFold: boolean;
  foldSectionId: string;
  foldLineCount: number;
  inlineBlockId: string | null;
  inlineBlockKind: 'block-table' | 'block-quote' | 'block-fence' | 'block-list' | null;
}

interface HoverPreview {
  url: string;
  name: string;
  top: number;
  left: number;
}

interface DragHandle {
  id: string;
  kind: 'folder' | 'file' | 'image' | 'block-table' | 'block-quote' | 'block-fence' | 'block-list';
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

interface VisuSectionState {
  sectionId: string;
  folderName: string;
  level: number;
  contentHtml: string;
  markdownBefore: string;
}

@Component({
  selector: 'app-projet-editor-zone',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './projet-editor-zone.component.html',
  styleUrl: './projet-editor-zone.component.scss',
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' },
})
export class ProjetEditorZoneComponent implements OnChanges, OnDestroy {
  @Input() files: FileNode[] = [];
  @Input() scrollToNodeId: string | null = null;
  @Input() saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' = 'idle';
  @Input() projectName = '';
  @Input() activeNodeId: string | null = null;

  @Output() fileSave = new EventEmitter<FileSaveEvent>();
  @Output() sectionsChange = new EventEmitter<SectionInfo[]>();
  @Output() nodeActive = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();
  @Output() dragDrop = new EventEmitter<DragDropEvent>();
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() saveStarting = new EventEmitter<void>();
  private localDirty = false;

  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('textarea') textareaRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('mirror') mirrorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('overlay') overlayRef?: ElementRef<HTMLDivElement>;
  @ViewChild('visu') visuRef?: ElementRef<HTMLDivElement>;
  @ViewChildren('visuSectionEl') visuSectionEls!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('visuImgInput') visuImgInputRef?: ElementRef<HTMLInputElement>;

  private sanitizer = inject(DomSanitizer);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private woHistory = inject(WoActionHistoryService);
  collab = inject(ProjetCollabService);
  private authSvc = inject(AuthService);

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
  highlightedFolderIds = new Set<string>();
  private highlightedFileIds = new Set<string>();

  // ── Visu edit mode ─────────────────────────────────────────
  visuSections: VisuSectionState[] = [];
  visuToolbar: { top: number; left: number } | null = null;
  visuInsertMenu: { sectionId: string; top: number; left: number } | null = null;
  activeVisuSectionId: string | null = null;
  editingVisuSectionId = signal<string | null>(null);
  publishToastVisible = signal<boolean>(false);
  // Snapshots du contenu original par section (clé = sectionId / focusedHandle.id)
  // Permet de restaurer le contenu original via "Annuler" même après navigation entre sections
  private codeSectionSnapshots = new Map<string, string>();
  private dirtyVisuSectionIds = new Set<string>();
  private visuSectionLockSnapshot = new Map<string, string>();
  private visuSelectionListener: (() => void) | null = null;
  visuImageSectionId: string | null = null;
  mirrorLines: MirrorLine[] = [];
  renderedHtml: SafeHtml = '';
  // Fold/collapse par section (mode Code)
  foldedContent = new Map<string, string>(); // sectionId → body content replaced
  sectionChevrons: { folderId: string; top: number; level: number }[] = [];
  // Blocs inline détectés (tableau, citation, code fence, liste)
  private inlineBlockRanges: InlineBlockRange[] = [];
  // Snapshot de texte des blocs inline avant modification (pour diff historique)
  private inlineBlockTextSnapshot = new Map<string, string>();

  // Image card interactions (edit mode)
  hoverPreview: HoverPreview | null = null;
  renamingImageId: string | null = null;
  renameImageValue = '';
  deleteConfirmImageId: string | null = null;

  // IDs d'images uploadées localement très récemment, mais pas encore présentes dans this.files
  // (loadFiles pas encore terminé). Excluses de l'auto-purge des marqueurs orphelins
  // pour éviter que patchFileContent → ngOnChanges → recomputeMirrorLines ne supprime
  // un marqueur fraîchement inséré dont l'image est en cours de propagation.
  private recentlyAddedImageIds = new Set<string>();
  // Nœuds complets des images uploadées localement — pour conserver name/path dans allImages
  // même quand ngOnChanges réécrit allImages depuis this.files (avant que loadFiles ne propage).
  private pendingLocalImages: FileNode[] = [];
  // Dossier cible capturé au moment du clic toolbar (avant que le file picker ne perde le focus).
  private lastFolderIdForUpload: string | null = null;

  // Entités modifiées depuis le dernier flush — Map<entityId, folderId>.
  // entityId = fileId si curseur dans un bloc fichier additionnel, sinon folderId.
  // folderId est utilisé pour récupérer le snapshot de la section parente.
  private modifiedEntities = new Map<string, string>();
  // Snapshot fichier (contenu.md) par section — utilisé pour l'action undo
  private sectionFileSnapshot = new Map<string, { fileId: string; content: string }>();
  // Snapshot texte complet de la section dans unifiedContent — utilisé pour le diff (inclut en-tête + fichiers additionnels)
  private sectionFullTextSnapshot = new Map<string, string>();
  // Snapshot du bloc de chaque fichier additionnel ('Nom\n...content...\n') depuis unifiedContent — pour diff par fichier
  private fileBlockSnapshot = new Map<string, string>();

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
  private currentDropTarget: { handle?: DragHandle; targetLine?: number; position: 'before' | 'after' | 'inside' } | null = null;
  suppressScrollOnNextActiveChange = false;

  constructor(private svc: ProjectFilesService) {}

  // ── Lifecycle ──────────────────────────────────────────────
  ngOnChanges(changes: SimpleChanges) {
    if (changes['files']) {
      const currentStructure = this.getFileStructureKey(this.files);
      const hasStructuralChange = this.lastStructureKey !== null && this.lastStructureKey !== currentStructure;
      this.lastStructureKey = currentStructure;
      // Nettoyer les replis au rechargement structurel (structure a changé)
      if (hasStructuralChange && this.foldedContent.size > 0) this.unfoldAll();

      this.docSections = this.buildDocSections(this.files, 1);
      this.allImages = this.collectAllImages(this.files);
      // Conserver les nœuds uploadés localement non encore propagés dans this.files
      for (const local of this.pendingLocalImages) {
        if (!this.allImages.find(im => im.id === local.id)) {
          this.allImages = [...this.allImages, local];
        }
      }
      // Corriger les marqueurs d'images mal positionnés (déplacés via sidebar)
      const markersFixed = this.fixImageMarkersInSections();

      if (!this.hasLoaded || hasStructuralChange || markersFixed) {
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
      this.updateSnapshotFromFiles();

      // Si on a corrigé des marqueurs déplacés, persister immédiatement au serveur
      // pour que les contenu.md sources soient mis à jour (sinon le bug réapparaît au reload).
      if (markersFixed && !this.focusedHandle) {
        setTimeout(() => this.saveAll(), 0);
      }
    }

    if (changes['activeNodeId']) {
      this.recomputeHighlights();
      this.applyFocusByActiveNode();
      // En mode visu, la liste filteredVisuSections change → réinjecter le innerHTML
      // dans les nouveaux éléments (sinon ils restent vides après navigation menu)
      if (this.mode === 'visu') {
        setTimeout(() => this.initVisuSectionHtml(), 0);
      }
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
      const nodeChildren = [...(node.children || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

      const mainFile = nodeChildren.find(c => c.type === 'file' && c.name === 'contenu.md')
                    || nodeChildren.find(c => c.type === 'file' && !this.isImageFile(c.name));

      // 1. Identifier toutes les images déjà référencées dans n'importe quel fichier texte
      //    de cette section (contenu.md inclus) pour ne pas créer de doublon.
      const imageIdsInSectionText = new Set<string>();
      for (const child of nodeChildren) {
        if (child.type === 'file' && !this.isImageFile(child.name) && child.content) {
          const matches = child.content.matchAll(/\{\{IMG:([a-z0-9-]+)\}\}/gi);
          for (const m of matches) {
            imageIdsInSectionText.add(m[1]);
          }
        }
      }

      let textContent = heading + '\n';
      const images: FileNode[] = [];

      // 2. Parcourir les enfants dans l'ordre de leur propriété 'order'
      for (const child of nodeChildren) {
        if (child.type !== 'file') continue;

        if (this.isImageFile(child.name)) {
          images.push(child);
          // On insère l'image comme un bloc autonome UNIQUEMENT si elle n'est pas déjà
          // référencée dans un fichier texte de cette section (évite les doublons).
          if (!imageIdsInSectionText.has(child.id)) {
            textContent += `\n{{IMG:${child.id}}}\n`;
          }
        } else if (child === mainFile) {
          if (child.content?.trim()) {
            textContent += child.content.trimEnd() + '\n';
          }
        } else {
          // Document additionnel
          textContent += `\n'${child.name.replace(/\.md$/, '')}\n${child.content || ''}\n'\n`;
        }
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
    this.recomputeInlineBlocks();
    this.recomputeHighlights();
    this.recomputeHandles();
    this.recomputeRenderedHtml();
    if (this.mode === 'visu') this.buildVisuSections();
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
    // Blocs inline (tableau, citation, code fence, liste)
    const blockLabels: Record<string, string> = {
      'block-table': 'Tableau', 'block-quote': 'Citation',
      'block-fence': 'Bloc code', 'block-list': 'Liste',
    };
    for (const r of this.inlineBlockRanges) {
      list.push({
        id: r.id,
        kind: r.kind,
        level: 0,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        top: this.PADDING_TOP_PX + r.lineStart * this.LINE_HEIGHT_PX,
        height: Math.max((r.lineEnd - r.lineStart + 1) * this.LINE_HEIGHT_PX, this.LINE_HEIGHT_PX),
        label: blockLabels[r.kind] || r.kind,
      });
    }

    list.sort((a, b) => a.top - b.top);
    this.handles = list;

    // Chevrons de repli pour chaque section ayant du contenu repliable
    this.sectionChevrons = this.sectionRanges
      .filter(r => r.lineEnd > r.lineStart) // ignorer les sections vides
      .map(r => ({
        folderId: r.folderId,
        top: this.PADDING_TOP_PX + r.lineStart * this.LINE_HEIGHT_PX,
        level: r.level,
      }));
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

  // ── Détection des blocs inline (tableau, citation, code fence, liste) ──
  private recomputeInlineBlocks() {
    const lines = this.unifiedContent.split('\n');
    this.inlineBlockRanges = [];

    // Pré-calcul des ranges à ignorer (blocs fichiers + fold markers)
    const skipRanges: [number, number][] = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^(['`^]).+$/.test(t)) {
        const delim = t[0];
        const s = i; i++;
        while (i < lines.length && lines[i].trim() !== delim) i++;
        skipRanges.push([s, i]);
      } else if (/^\{\{FOLD:/.test(t) || /^\{\{IMG:/.test(t)) {
        skipRanges.push([i, i]);
      }
    }
    const inSkip = (n: number) => skipRanges.some(([s, e]) => n >= s && n <= e);

    // Résolution du dossier parent d'une ligne (section la plus profonde contenant la ligne)
    const getParentFolderId = (lineStart: number): string | null => {
      let best: SectionRange | null = null;
      for (const r of this.sectionRanges) {
        if (lineStart >= r.lineStart && lineStart <= r.lineEnd) {
          if (!best || r.level > best.level) best = r;
        }
      }
      return best?.folderId ?? null;
    };

    // Compteurs par (parentFolderId + kind) pour générer des IDs stables dans la section
    const kindCounters = new Map<string, number>();
    const nextId = (parentFolderId: string | null, kind: string): string => {
      const key = `${parentFolderId ?? 'root'}##${kind}`;
      const n = kindCounters.get(key) ?? 0;
      kindCounters.set(key, n + 1);
      return `${key}##${n}`;
    };

    let i = 0;
    while (i < lines.length) {
      if (inSkip(i)) { i++; continue; }
      const t = lines[i].trimStart();
      if (!t || /^#{1,4} /.test(t)) { i++; continue; }

      // Code fence
      if (t.startsWith('```') || t.startsWith('~~~')) {
        const fence = t.startsWith('```') ? '```' : '~~~';
        const start = i; i++;
        while (i < lines.length && !lines[i].trimStart().startsWith(fence) && !inSkip(i)) i++;
        const end = Math.min(i, lines.length - 1);
        if (end > start) {
          const parentFolderId = getParentFolderId(start);
          this.inlineBlockRanges.push({ id: nextId(parentFolderId, 'block-fence'), kind: 'block-fence', lineStart: start, lineEnd: end, parentFolderId });
        }
        i = end + 1; continue;
      }

      // Table
      if (t.startsWith('|')) {
        const start = i;
        while (i < lines.length && !inSkip(i) && lines[i].trimStart().startsWith('|')) i++;
        const end = i - 1;
        if (end >= start) {
          const parentFolderId = getParentFolderId(start);
          this.inlineBlockRanges.push({ id: nextId(parentFolderId, 'block-table'), kind: 'block-table', lineStart: start, lineEnd: end, parentFolderId });
        }
        continue;
      }

      // Blockquote
      if (t.startsWith('>')) {
        const start = i;
        while (i < lines.length && !inSkip(i) && lines[i].trimStart().startsWith('>')) i++;
        const end = i - 1;
        const parentFolderId = getParentFolderId(start);
        this.inlineBlockRanges.push({ id: nextId(parentFolderId, 'block-quote'), kind: 'block-quote', lineStart: start, lineEnd: end, parentFolderId });
        continue;
      }

      // Liste
      if (/^([-*+] |\d+\. )/.test(t)) {
        const start = i; i++;
        while (i < lines.length && !inSkip(i)) {
          const cur = lines[i]; const curT = cur.trimStart();
          if (!curT) {
            // Ligne vide : inclure si la suivante est encore un item de liste
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && /^([-*+] |\d+\. )/.test(lines[j].trimStart()) && !inSkip(j)) { i++; }
            else break;
          } else if (/^([-*+] |\d+\. )/.test(curT) || /^\s+\S/.test(cur)) { i++; }
          else break;
        }
        let end = i - 1;
        while (end > start && !lines[end].trim()) end--;
        if (end >= start) {
          const parentFolderId = getParentFolderId(start);
          this.inlineBlockRanges.push({ id: nextId(parentFolderId, 'block-list'), kind: 'block-list', lineStart: start, lineEnd: end, parentFolderId });
        }
        continue;
      }

      i++;
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
    // Purge les marqueurs {{IMG:xxx}} dont l'image n'existe plus
    // Exclut les images uploadées tout récemment (pas encore propagées dans this.files)
    const orphanIndexes = new Set<number>();
    lines.forEach((line, i) => {
      const m = /^\{\{IMG:([a-z0-9-]+)\}\}\s*$/i.exec(line.trim());
      if (m && !this.allImages.find(im => im.id === m[1]) && !this.recentlyAddedImageIds.has(m[1])) {
        orphanIndexes.add(i);
      }
    });
    if (orphanIndexes.size > 0) {
      this.unifiedContent = lines.filter((_, i) => !orphanIndexes.has(i)).join('\n');
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
      this.saveAll();
    }

    // Map ligne → bloc inline
    const inlineBlockMap = new Map<number, InlineBlockRange>();
    for (const r of this.inlineBlockRanges) {
      for (let li = r.lineStart; li <= r.lineEnd; li++) inlineBlockMap.set(li, r);
    }

    const cleanLines = this.unifiedContent.split('\n');
    this.mirrorLines = cleanLines.map((line, i) => {
      const kind: 'folder' | 'file' | null = fileHl.has(i) ? 'file' : (folderHl.has(i) ? 'folder' : null);
      const ib = inlineBlockMap.get(i) || null;
      const m = /^\{\{IMG:([a-z0-9-]+)\}\}\s*$/i.exec(line.trim());
      if (m) {
        const img = this.allImages.find(im => im.id === m[1]);
        return {
          text: line, safeHtml: '', isImage: true,
          imageId: m[1], imageName: img?.name || '', imagePath: img?.path || '',
          highlightKind: kind, lineIndex: i,
          isFold: false, foldSectionId: '', foldLineCount: 0,
          inlineBlockId: ib?.id || null, inlineBlockKind: ib?.kind || null,
        };
      }
      const fm = /^\{\{FOLD:([a-zA-Z0-9-]+):(\d+)\}\}$/.exec(line.trim());
      if (fm) {
        return {
          text: line, safeHtml: '', isImage: false,
          imageId: '', imageName: '', imagePath: '',
          highlightKind: kind, lineIndex: i,
          isFold: true, foldSectionId: fm[1], foldLineCount: parseInt(fm[2], 10),
          inlineBlockId: null, inlineBlockKind: null,
        };
      }
      return {
        text: line, safeHtml: this.syntaxHighlight(line), isImage: false,
        imageId: '', imageName: '', imagePath: '',
        highlightKind: kind, lineIndex: i,
        isFold: false, foldSectionId: '', foldLineCount: 0,
        inlineBlockId: ib?.id || null, inlineBlockKind: ib?.kind || null,
      };
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

  // ── Syntax highlighting pour le miroir Code ──────────────────
  private syntaxHighlight(text: string): string {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const trimmed = text.trimStart();
    if (!trimmed) return ' ';

    // Headings
    const hm = /^(#{1,6})\s/.exec(trimmed);
    if (hm) {
      const lvl = Math.min(hm[1].length, 6);
      return `<span class="syn-h${lvl}">${esc(text)}</span>`;
    }

    // Code fence (``` or ~~~)
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      return `<span class="syn-fence">${esc(text)}</span>`;
    }

    // Table row
    if (trimmed.startsWith('|')) {
      return `<span class="syn-table">${esc(text)}</span>`;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      return `<span class="syn-blockquote">${esc(text)}</span>`;
    }

    // Unordered list
    const ulm = /^([-*+] )(.*)$/.exec(trimmed);
    if (ulm) {
      const indent = text.length - trimmed.length;
      const pad = indent > 0 ? esc(text.substring(0, indent)) : '';
      return `${pad}<span class="syn-bullet">${esc(ulm[1])}</span>${esc(ulm[2])}`;
    }

    // Ordered list
    const olm = /^(\d+\. )(.*)$/.exec(trimmed);
    if (olm) {
      const indent = text.length - trimmed.length;
      const pad = indent > 0 ? esc(text.substring(0, indent)) : '';
      return `${pad}<span class="syn-bullet">${esc(olm[1])}</span>${esc(olm[2])}`;
    }

    // Horizontal rule
    if (/^(---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      return `<span class="syn-hr">${esc(text)}</span>`;
    }

    // Normal text — inline tokens
    let result = esc(text);
    result = result.replace(/(`[^`\n]+`)/g, '<span class="syn-inline-code">$1</span>');
    result = result.replace(/\*\*([^*\n]+?)\*\*/g, '<span class="syn-bold">**$1**</span>');
    result = result.replace(/__([^_\n]+?)__/g, '<span class="syn-bold">__$1__</span>');
    result = result.replace(/\*([^*\n]+?)\*/g, '<span class="syn-italic">*$1*</span>');
    result = result.replace(/_([^_\n]+?)_/g, '<span class="syn-italic">_$1_</span>');
    result = result.replace(/~~([^~\n]+?)~~/g, '<span class="syn-strike">~~$1~~</span>');
    return result;
  }

  insertCodeBlock() {
    this.insertAt('```\n', '\n```');
  }

  insertTable() {
    this.insertAt('\n| Col 1 | Col 2 | Col 3 |\n|-------|-------|-------|\n| ', ' |       |       |\n');
  }

  // ── Fold / collapse par section ──────────────────────────────
  private getUnfoldedContent(): string {
    if (this.foldedContent.size === 0) return this.unifiedContent;
    let c = this.unifiedContent;
    for (const [id, body] of this.foldedContent) {
      c = c.replace(new RegExp(`\\{\\{FOLD:${id}:[0-9]+\\}\\}`, 'g'), body);
    }
    return c;
  }

  private unfoldAll() {
    if (this.foldedContent.size === 0) return;
    for (const [id] of [...this.foldedContent]) {
      this.unfoldSection(id);
    }
  }

  toggleFold(sectionId: string, ev?: MouseEvent) {
    ev?.preventDefault();
    ev?.stopPropagation();
    if (this.foldedContent.has(sectionId)) {
      this.unfoldSection(sectionId);
    } else {
      this.foldSection(sectionId);
    }
  }

  private foldSection(sectionId: string) {
    const range = this.sectionRanges.find(r => r.folderId === sectionId);
    if (!range) return;
    const lines = this.unifiedContent.split('\n');
    const bodyLines = lines.slice(range.lineStart + 1, range.lineEnd + 1);
    if (bodyLines.filter(l => l.trim()).length === 0) return; // nothing to fold
    const body = bodyLines.join('\n');
    this.foldedContent.set(sectionId, body);
    const marker = `{{FOLD:${sectionId}:${bodyLines.length}}}`;
    const newLines = [
      ...lines.slice(0, range.lineStart + 1),
      marker,
      ...lines.slice(range.lineEnd + 1),
    ];
    this.unifiedContent = newLines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeAll();
    this.scheduleSave();
  }

  private unfoldSection(sectionId: string) {
    const body = this.foldedContent.get(sectionId);
    if (body === undefined) return;
    this.foldedContent.delete(sectionId);
    this.unifiedContent = this.unifiedContent.replace(
      new RegExp(`\\{\\{FOLD:${sectionId}:[0-9]+\\}\\}`, 'g'),
      body
    );
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeAll();
  }

  // ── Mode toggle ─────────────────────────────────────────────
  setMode(m: 'edit' | 'visu') {
    if (this.mode === m) return;
    if (this.mode === 'edit') {
      this.unfoldAll();
      this.flushContentModifications();
      if (this.focusedHandle) this.exitFocusMode();
      else this.saveAll();
    } else if (this.mode === 'visu') {
      this.flushVisuSections();
      this.teardownVisuSelectionListener();
    }
    this.mode = m;
    this.recomputeAll();
    if (m === 'visu') {
      this.setupVisuSelectionListener();
    }
    if (m === 'edit') {
      // Réappliquer le focus sur la section active après changement de mode
      setTimeout(() => this.applyFocusByActiveNode(), 0);
    }
    if (this.activeNodeId) {
      setTimeout(() => this.scrollToActive(), 80);
    }
  }

  onPreviewClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const heading = target.closest('[data-section-id]');
    if (heading) {
      const sectionId = heading.getAttribute('data-section-id');
      if (sectionId) this.nodeActive.emit(sectionId);
    }
  }

  ngOnDestroy() {
    this.teardownVisuSelectionListener();
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
    this.flushContentModifications();
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

  // Retourne l'ID de dossier effectif pour un nodeId :
  // - si c'est un dossier → lui-même
  // - si c'est un fichier → son dossier parent
  // Retourne undefined si le nœud n'est pas trouvé (distinct de null = pas de parent)
  private findEffectiveFolderId(nodeId: string, nodes: FileNode[], parentFolderId: string | null = null): string | null | undefined {
    for (const n of nodes) {
      if (n.id === nodeId) {
        return n.type === 'folder' ? n.id : parentFolderId;
      }
      if (n.children) {
        const found = this.findEffectiveFolderId(nodeId, n.children, n.type === 'folder' ? n.id : parentFolderId);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  // Applique le mode focus (edit) selon activeNodeId.
  // Logique alignée avec le filtre preview :
  //  - dossier  → handle dossier (section + enfants)
  //  - document → handle fichier (juste ce document)
  //  - image    → handle image (1 ligne marker, rendue comme carte image)
  private applyFocusByActiveNode(): void {
    if (this.mode !== 'edit') return;
    const nodeId = this.activeNodeId;
    if (!nodeId) {
      if (this.focusedHandle) this.exitFocusMode();
      return;
    }

    if (this.focusedHandle?.id === nodeId) return;
    if (this.focusedHandle) this.exitFocusModeSync();

    const handle = this.handles.find(h => h.id === nodeId && h.kind === 'folder')
                ?? this.handles.find(h => h.id === nodeId);
    if (handle) this.enterFocusMode(handle);
  }

  // Retourne l'ensemble des IDs de dossiers descendants (inclus) d'un nœud donné
  private getDescendantFolderIds(nodeId: string, nodes: FileNode[]): Set<string> {
    const ids = new Set<string>();
    const collectFrom = (node: FileNode) => {
      if (node.type === 'folder') ids.add(node.id);
      for (const c of node.children || []) collectFrom(c);
    };
    const findAndCollect = (ns: FileNode[]): boolean => {
      for (const n of ns) {
        if (n.id === nodeId) { collectFrom(n); return true; }
        if (n.children && findAndCollect(n.children)) return true;
      }
      return false;
    };
    findAndCollect(nodes);
    return ids;
  }

  // Sections visu filtrées selon la sélection active (null = tout afficher)
  get filteredVisuSections(): VisuSectionState[] {
    if (!this.activeNodeId) return this.visuSections;
    const node = this.findNode(this.activeNodeId, this.files);
    if (!node) return this.visuSections;

    if (node.type === 'folder') {
      // Dossier → section sélectionnée + toutes les sous-sections enfants
      const visible = this.getDescendantFolderIds(this.activeNodeId, this.files);
      if (visible.size === 0) return this.visuSections;
      return this.visuSections.filter(vs => visible.has(vs.sectionId));
    }

    // Image ou document → preview standalone (singleImage/FileVisuPreview gèrent l'affichage)
    return [];
  }

  // Preview standalone d'une image avec ses options (rename/delete)
  get singleImageVisuPreview(): { id: string; name: string; url: string } | null {
    if (!this.activeNodeId) return null;
    const node = this.findNode(this.activeNodeId, this.files);
    if (!node || node.type !== 'file') return null;
    if (!this.isImageFile(node.name)) return null;
    const encodedPath = node.path.split('/').map((s: string) => encodeURIComponent(s)).join('/');
    const url = this.svc.getImageUrl(this.projectName, encodedPath);
    return { id: node.id, name: node.name, url };
  }

  // Wrappers acceptant id+name (utilisés depuis singleImageVisuPreview où on n'a pas de MirrorLine)
  startRenameImageByNode(id: string, name: string, ev: MouseEvent): void {
    ev.stopPropagation();
    this.renamingImageId = id;
    this.renameImageValue = name.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
    this.deleteConfirmImageId = null;
    this.hoverPreview = null;
  }

  async confirmRenameImageByNode(id: string, name: string): Promise<void> {
    const fakeLine = { imageId: id, imageName: name } as MirrorLine;
    return this.confirmRenameImage(fakeLine);
  }

  askDeleteImageByNode(id: string, ev: MouseEvent): void {
    ev.stopPropagation();
    this.deleteConfirmImageId = id;
    this.renamingImageId = null;
    this.hoverPreview = null;
  }

  async confirmDeleteImageByNode(id: string, name: string, ev: MouseEvent): Promise<void> {
    const fakeLine = { imageId: id, imageName: name } as MirrorLine;
    return this.confirmDeleteImage(fakeLine, ev);
  }

  // Cache du rendu HTML d'un document affiché en standalone
  private fileVisuPreviewCache: { fileId: string; rawContent: string; html: string; name: string } | null = null;

  // Preview standalone d'un document texte (lecture seule)
  get singleFileVisuPreview(): { name: string; html: string } | null {
    if (!this.activeNodeId) return null;
    const node = this.findNode(this.activeNodeId, this.files);
    if (!node || node.type !== 'file') return null;
    if (this.isImageFile(node.name)) return null;
    if (node.name === 'contenu.md') return null;

    const content = node.content || '';
    if (this.fileVisuPreviewCache
        && this.fileVisuPreviewCache.fileId === node.id
        && this.fileVisuPreviewCache.rawContent === content) {
      return { name: this.fileVisuPreviewCache.name, html: this.fileVisuPreviewCache.html };
    }

    // Remplacer les marqueurs {{IMG:id}} par des URLs réelles avant rendu markdown
    const processed = content.replace(/\{\{IMG:([a-z0-9-]+)\}\}/gi, (_m, id) => {
      const img = this.allImages.find(im => im.id === id);
      if (!img) return `*[image manquante: ${id}]*`;
      const encodedPath = img.path.split('/').map((s: string) => encodeURIComponent(s)).join('/');
      const url = this.svc.getImageUrl(this.projectName, encodedPath);
      return `\n\n![${this.escapeAlt(img.name)}](${url})\n\n`;
    });

    const html = marked.parse(processed, { async: false }) as string;
    const name = node.name.replace(/\.md$/, '');
    this.fileVisuPreviewCache = { fileId: node.id, rawContent: content, html, name };
    return { name, html };
  }

  // ── Edit-mode events ────────────────────────────────────────
  onTextareaInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    this.unifiedContent = ta.value;
    this.recomputeRanges();
    this.recomputeInlineBlocks();
    this.recomputeMirrorLines();
    this.recomputeHandles();
    this.scheduleSave();
    if (!this.localDirty) {
      this.localDirty = true;
      this.dirtyChange.emit(true);
    }
    // Marquer la section focusée comme "modifications locales en attente" + capturer snapshot original
    // Le snapshot persiste à travers les navigations pour permettre Annuler après changement de section
    if (this.focusedHandle && !this.collab.isLocalPending(this.focusedHandle.id)) {
      this.codeSectionSnapshots.set(this.focusedHandle.id, this.lastSavedContent);
      this.collab.addLocalPending(this.focusedHandle.id);
      // Verrouiller la section (les autres users la verront en rouge dans leur menu)
      if (this.projectName) {
        this.collab.lockNode(this.projectName, this.focusedHandle.id).catch(() => {});
      }
    }
    const entity = this.getCursorEntity();
    if (entity) {
      this.modifiedEntities.set(entity.id, entity.folderId);
      // Affichage live grisé dans le panneau historique tant que le save n'est pas fait
      const isBlock = entity.id.includes('##');
      const node = isBlock ? null : this.findNode(entity.id, this.files);
      const label = isBlock
        ? `Modification — ${this.blockKindLabel(entity.id)}`
        : `Modification de texte — «${node?.name || entity.id}»`;
      this.collab.upsertPending({
        entityId: entity.id,
        label,
        username: this.authSvc.currentUser()?.username || 'Vous',
        timestamp: new Date().toISOString(),
        state: 'editing'
      });
    }
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
    // 2) Bloc inline (tableau, citation, code, liste) — avant document pour être plus précis
    for (const r of this.inlineBlockRanges) {
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        const h = this.handles.find(x => x.id === r.id);
        if (h) { this.setHoveredHandle(h); return; }
      }
    }
    // 3) Document (bloc 'name ... ')
    for (const fr of this.fileRanges) {
      if (lineIdx >= fr.lineStart && lineIdx <= fr.lineEnd) {
        const h = this.handles.find(x => x.kind === 'file' && x.id === fr.fileId);
        if (h) { this.setHoveredHandle(h); return; }
      }
    }
    // 4) Dossier (le plus profond contenant la ligne)
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
    // Priorité 1 : bloc fichier additionnel → emit fileId
    for (const fr of this.fileRanges) {
      if (lineIdx >= fr.lineStart && lineIdx <= fr.lineEnd) {
        this.suppressScrollOnNextActiveChange = true;
        this.nodeActive.emit(fr.fileId);
        return;
      }
    }
    // Priorité 2 : bloc inline (tableau, citation, code, liste) → emit blockId virtuel
    for (const r of this.inlineBlockRanges) {
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        this.suppressScrollOnNextActiveChange = true;
        this.nodeActive.emit(r.id);
        return;
      }
    }
    // Priorité 3 : section/dossier
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
    this.flushContentModifications();
  }

  // Force une sauvegarde immédiate (bouton "Non sauvegardé" cliqué)
  forceSave() {
    clearTimeout(this.saveTimeout);
    this.unfoldAll(); // dépli obligatoire avant sauvegarde manuelle
    this.saveAll();
    this.flushContentModifications();
  }

  private updateSnapshotFromFiles() {
    const pendingFolderIds = new Set(this.modifiedEntities.values());
    const pendingEntityIds = new Set(this.modifiedEntities.keys());
    for (const section of this.docSections) {
      if (!section.mainFileId) continue;
      if (pendingFolderIds.has(section.folderId)) continue;
      const folder = this.findNode(section.folderId, this.files);
      if (!folder) continue;
      const mainFile = (folder.children || []).find(c => c.type === 'file' && c.name === 'contenu.md')
                    || (folder.children || []).find(c => c.type === 'file' && !this.isImageFile(c.name));
      if (mainFile) {
        this.sectionFileSnapshot.set(section.folderId, {
          fileId: section.mainFileId,
          content: mainFile.content ?? ''
        });
      }
      const range = this.sectionRanges.find(r => r.folderId === section.folderId);
      if (range && this.unifiedContent) {
        const lines = this.unifiedContent.split('\n');
        this.sectionFullTextSnapshot.set(section.folderId,
          lines.slice(range.lineStart, range.lineEnd + 1).join('\n'));
      }
    }
    // Snapshot des blocs fichiers additionnels (entités fileId)
    if (this.unifiedContent) {
      const lines = this.unifiedContent.split('\n');
      for (const fr of this.fileRanges) {
        if (pendingEntityIds.has(fr.fileId)) continue;
        this.fileBlockSnapshot.set(fr.fileId, lines.slice(fr.lineStart, fr.lineEnd + 1).join('\n'));
      }
      // Snapshot des blocs inline
      for (const r of this.inlineBlockRanges) {
        if (pendingEntityIds.has(r.id)) continue;
        this.inlineBlockTextSnapshot.set(r.id, lines.slice(r.lineStart, r.lineEnd + 1).join('\n'));
      }
    }
  }

  public flushContentModifications() {
    if (this.modifiedEntities.size === 0) return;
    const currentSections = this.parseContent();
    const lines = this.unifiedContent.split('\n');
    const updatedFolderIds = new Set<string>();
    for (const [entityId, folderId] of this.modifiedEntities) {
      const isBlock = entityId.includes('##');
      const isFile = !isBlock && entityId !== folderId;
      const node = isBlock ? null : this.findNode(entityId, this.files);
      const snapshotBefore = this.sectionFileSnapshot.get(folderId);
      const label = isBlock
        ? `Modification — ${this.blockKindLabel(entityId)}`
        : `Modification de texte — «${node?.name || entityId}»`;

      let textBefore: string | undefined;
      let textAfter: string | null = null;
      if (isBlock) {
        textBefore = this.inlineBlockTextSnapshot.get(entityId);
        const blockRange = this.inlineBlockRanges.find(r => r.id === entityId);
        if (blockRange) textAfter = lines.slice(blockRange.lineStart, blockRange.lineEnd + 1).join('\n');
      } else if (isFile) {
        textBefore = this.fileBlockSnapshot.get(entityId);
        const fr = this.fileRanges.find(r => r.fileId === entityId);
        if (fr) textAfter = lines.slice(fr.lineStart, fr.lineEnd + 1).join('\n');
      } else {
        textBefore = this.sectionFullTextSnapshot.get(folderId);
        const range = this.sectionRanges.find(r => r.folderId === folderId);
        if (range) textAfter = lines.slice(range.lineStart, range.lineEnd + 1).join('\n');
      }

      this.woHistory.track({
        section: 'projets/contenu',
        actionType: 'update',
        label,
        entityType: 'content',
        entityId: entityId,
        beforeState: textBefore != null ? { content: textBefore } : undefined,
        afterState: textAfter != null ? { content: textAfter } : undefined,
        context: { projectId: this.projectName },
        undoable: !isBlock && !!snapshotBefore?.fileId,
        undoAction: !isBlock && snapshotBefore?.fileId ? {
          endpoint: `/api/file-projects/${this.projectName}/files/${snapshotBefore.fileId}`,
          method: 'PUT',
          payload: { content: snapshotBefore.content }
        } : undefined
      }).catch(() => {});

      if (textAfter != null) {
        if (isBlock) this.inlineBlockTextSnapshot.set(entityId, textAfter);
        else if (isFile) this.fileBlockSnapshot.set(entityId, textAfter);
        else this.sectionFullTextSnapshot.set(folderId, textAfter);
      }
      updatedFolderIds.add(folderId);
    }
    for (const folderId of updatedFolderIds) {
      const after = currentSections.find(s => s.folderId === folderId);
      if (after?.fileId) {
        this.sectionFileSnapshot.set(folderId, { fileId: after.fileId, content: after.content });
      }
    }
    this.modifiedEntities.clear();
  }

  private blockKindLabel(blockId: string): string {
    const kind = blockId.split('##')[1] ?? '';
    const labels: Record<string, string> = {
      'block-table': 'Tableau', 'block-quote': 'Citation',
      'block-fence': 'Bloc de code', 'block-list': 'Liste',
    };
    return labels[kind] || 'Bloc';
  }

  // Retourne l'entité modifiée selon la position du curseur :
  // - bloc fichier additionnel → fileId + folderId parent
  // - bloc inline (table, citation, code, liste) → blockId + parentFolderId
  // - sinon section → folderId + folderId
  private getCursorEntity(): { id: string; folderId: string } | null {
    const ta = this.textareaRef?.nativeElement;
    if (!ta) return null;
    const lineIdx = ta.value.substring(0, ta.selectionStart).split('\n').length - 1;
    for (const fr of this.fileRanges) {
      if (lineIdx >= fr.lineStart && lineIdx <= fr.lineEnd) {
        const parent = this.findParentFolder(fr.fileId, this.files);
        if (parent) return { id: fr.fileId, folderId: parent.id };
      }
    }
    for (const r of this.inlineBlockRanges) {
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        return { id: r.id, folderId: r.parentFolderId ?? '' };
      }
    }
    for (let i = this.sectionRanges.length - 1; i >= 0; i--) {
      const r = this.sectionRanges[i];
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        return { id: r.folderId, folderId: r.folderId };
      }
    }
    return null;
  }

  private getFormatLabel(before: string, after: string): string | null {
    if (before === '**' && after === '**') return 'Mise en forme : Gras';
    if (before === '*' && after === '*') return 'Mise en forme : Italique';
    if (before === '~~' && after === '~~') return 'Mise en forme : Barré';
    if (before === '`' && after === '`') return 'Insertion : Code inline';
    if (before.includes('```')) return 'Insertion : Bloc de code';
    if (before.trimStart().startsWith('### ')) return 'Insertion : Titre H3';
    if (before.trimStart().startsWith('## ')) return 'Insertion : Titre H2';
    if (before.trimStart().startsWith('# ')) return 'Insertion : Titre H1';
    if (before === '- ') return 'Insertion : Liste';
    return null;
  }

  private scheduleSave() {
    clearTimeout(this.saveTimeout);
    // Pas d'auto-save si des sections sont repliées (pour ne pas forcer le dépli)
    if (this.foldedContent.size > 0) return;
    this.saveTimeout = setTimeout(() => this.saveAll(), 10000);
  }

  private saveAll() {
    // Bascule toutes les entrées 'editing' du panneau historique en 'saving' (clignote)
    this.collab.markAllPendingSaving();
    if (this.unifiedContent === this.lastSavedContent) {
      // Pas de changement de contenu, mais on flush pour que l'historique remonte sans attendre le blur
      this.flushContentModifications();
      if (this.localDirty) {
        this.localDirty = false;
        this.dirtyChange.emit(false);
      }
      return;
    }
    this.lastSavedContent = this.unifiedContent;
    // Signale au parent qu'une sauvegarde démarre (pour afficher 'Sauvegarde…' immédiatement)
    this.saveStarting.emit();
    if (this.localDirty) {
      this.localDirty = false;
      this.dirtyChange.emit(false);
    }

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
    // Flush historique en même temps que la sauvegarde (évite d'attendre le blur)
    this.flushContentModifications();
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

      const additionalFiles: AdditionalFile[] = [];
      const elements: { id: string; index: number }[] = [];
      const nestedImageIds = new Set<string>();
      
      const blockRegex = /^(['`^])([^\n]+)(?:\n([\s\S]*?))?\n?\1/gm;
      
      // On remplace les blocs par des espaces pour conserver les offsets des images autonomes
      let spacedContent = rawContent.replace(blockRegex, (match, _delimiter, title, content, offset) => {
        const afName = (title as string).trim();
        const afContent = (content as string) || '';
        const af: AdditionalFile = { name: afName, content: afContent.trimEnd(), fileId: null, orderedChildIds: [] };
        
        const imgRegex = /\{\{IMG:([a-zA-Z0-9._-]+)\}\}/gi;
        let imM;
        while ((imM = imgRegex.exec(afContent)) !== null) {
           af.orderedChildIds!.push(imM[1]);
           nestedImageIds.add(imM[1]);
        }

        const found = info?.files.find(f => this.slugify(f.name.replace(/\.md$/, '')) === this.slugify(af.name));
        if (found) {
          af.fileId = found.id;
          elements.push({ id: found.id, index: offset });
        }
        additionalFiles.push(af);
        return ' '.repeat(match.length);
      });

      // Extraire les images autonomes
      const imageRegex = /\{\{IMG:([a-zA-Z0-9._-]+)\}\}/gi;
      let imgM: RegExpExecArray | null;
      while ((imgM = imageRegex.exec(spacedContent)) !== null) {
        if (!nestedImageIds.has(imgM[1])) {
          elements.push({ id: imgM[1], index: imgM.index });
        }
      }

      // Le contenu principal est le rawContent sans les blocs
      // Les marqueurs {{IMG:id}} autonomes (hors blocs doc) sont conservés inline dans mainContent
      // pour préserver leur position exacte dans le texte (ex: entre deux paragraphes)
      let mainContent = rawContent.replace(blockRegex, '').trim();

      // Déterminer la position du mainFile (contenu.md)
      if (mainFile) {
        let mainFileIndex = -1;
        if (mainContent) {
          const firstNonSpace = /\S/.exec(mainContent);
          if (firstNonSpace) {
            mainFileIndex = rawContent.indexOf(mainContent.substring(firstNonSpace.index, firstNonSpace.index + 10));
          }
        }
        elements.push({ id: mainFile.id, index: mainFileIndex });
      }

      elements.sort((a, b) => a.index - b.index);
      
      const orderedFileIds: string[] = [];
      elements.forEach(e => {
        if (!orderedFileIds.includes(e.id)) orderedFileIds.push(e.id);
      });

      sections.push({
        level: current.level, folderName: current.name, parentPath,
        folderId: info?.folder.id ?? null, parentFolderId: parentInfo?.folder.id ?? null,
        fileId: mainFile?.id ?? null, content: mainContent, additionalFiles,
        orderedFileIds
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

    // Capturer snapshot AVANT l'insertion pour le undo
    const formatLabel = this.getFormatLabel(before, after);
    const entity = formatLabel ? this.getCursorEntity() : null;
    const sectionId = entity?.folderId ?? null;
    const entityId = entity?.id ?? null;
    const beforeSnapshot = sectionId ? this.sectionFileSnapshot.get(sectionId) : undefined;

    const newVal = ta.value.substring(0, start) + before + selected + after + ta.value.substring(end);
    this.unifiedContent = newVal;
    ta.value = newVal;
    this.recomputeRanges();
    this.recomputeMirrorLines();
    this.scheduleSave();

    if (formatLabel) {
      const node = entityId ? this.findNode(entityId, this.files) : null;
      this.woHistory.track({
        section: 'projets/contenu',
        actionType: 'update',
        label: node ? `${formatLabel} — «${node.name}»` : formatLabel,
        entityType: 'content',
        entityId: entityId ?? undefined,
        beforeState: beforeSnapshot ? { content: beforeSnapshot.content } : undefined,
        context: { projectId: this.projectName },
        undoable: !!beforeSnapshot?.fileId,
        undoAction: beforeSnapshot?.fileId ? {
          endpoint: `/api/file-projects/${this.projectName}/files/${beforeSnapshot.fileId}`,
          method: 'PUT',
          payload: { content: beforeSnapshot.content }
        } : undefined
      }).catch(() => {});
      // Mettre à jour le snapshot avec le contenu post-insertion
      if (sectionId) {
        const sections = this.parseContent();
        const updated = sections.find(s => s.folderId === sectionId);
        if (updated?.fileId) {
          this.sectionFileSnapshot.set(sectionId, { fileId: updated.fileId, content: updated.content });
        }
      }
    }
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  // ── Image upload ───────────────────────────────────────────
  triggerImageUpload() {
    this.imageUploadError = '';
    // Capturer le dossier cible ICI, pendant que le textarea a encore le focus/sélection.
    // Après l'ouverture du file picker, ta.selectionStart peut retomber à 0.
    this.lastFolderIdForUpload = this.getCursorFolderId() || this.getActiveFolderId();
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
    // Utiliser le dossier capturé au clic toolbar (avant perte de focus du textarea)
    const folderId = this.lastFolderIdForUpload ?? this.getCursorFolderId() ?? this.getActiveFolderId();
    this.lastFolderIdForUpload = null;
    try {
      const node = await this.svc.uploadImage(this.projectName, file, folderId);
      // entityId = folderId (pas imageId) : si l'image est supprimée, imageId sort de
      // activeHistoryIds et l'entrée serait filtrée. Le folderId reste stable.
      this.woHistory.track({
        section: 'projets/fichiers',
        actionType: 'upload',
        label: `Import d'image «${file.name}»`,
        entityType: 'image',
        entityId: folderId || node.id,
        entityLabel: file.name,
        afterState: { fileName: file.name, size: file.size, imageId: node.id },
        context: { projectId: this.projectName },
        undoable: true,
        undoAction: { endpoint: `/api/file-projects/${this.projectName}/files/${node.id}`, method: 'DELETE' }
      }).catch(() => {});
      this.imageUploadError = '';
      // Ajout local immédiat à allImages pour que recomputeMirrorLines résolve le marqueur
      // sans attendre le refresh (sinon l'auto-purge mod-122 retirerait le nouveau marqueur).
      this.allImages = [...this.allImages, node];
      // Préserver le nœud local dans pendingLocalImages : ngOnChanges réécrit allImages
      // depuis this.files (sans la nouvelle image avant loadFiles) → on la réinjecte.
      this.pendingLocalImages.push(node);
      this.recentlyAddedImageIds.add(node.id);
      setTimeout(() => {
        this.pendingLocalImages = this.pendingLocalImages.filter(n => n.id !== node.id);
        this.recentlyAddedImageIds.delete(node.id);
      }, 10000);
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
      // Save immédiat (pas scheduleSave 10s) pour que isSaving=true côté parent
      // quand refresh.emit() déclenche onRefresh, qui attend la fin du save avant loadFiles.
      this.saveAll();
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
      this.woHistory.track({
        section: 'projets/fichiers',
        actionType: 'update',
        label: `Renommage d'image «${line.imageName}» → «${newName}»`,
        entityType: 'image',
        entityId: line.imageId,
        entityLabel: newName,
        beforeState: { fileName: line.imageName },
        afterState: { fileName: newName },
        context: { projectId: this.projectName },
        undoable: true,
        undoAction: { endpoint: `/api/file-projects/${this.projectName}/files/${line.imageId}`, method: 'PATCH', payload: { name: line.imageName } }
      }).catch(() => {});
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
      // Capturer le folderId parent avant refresh (this.files est encore à jour).
      // entityId = folderId plutôt que imageId : après deletion, imageId sort de
      // activeHistoryIds → l'entrée Suppression serait immédiatement filtrée.
      const parentFolder = this.findParentFolder(line.imageId, this.files);
      await this.svc.deleteFile(this.projectName, line.imageId);
      this.woHistory.track({
        section: 'projets/fichiers',
        actionType: 'delete',
        label: `Suppression d'image «${line.imageName}»`,
        entityType: 'image',
        entityId: parentFolder?.id || line.imageId,
        entityLabel: line.imageName,
        beforeState: { fileName: line.imageName, imageId: line.imageId },
        context: { projectId: this.projectName },
        undoable: false
      }).catch(() => {});
      this.deleteConfirmImageId = null;
      this.hoverPreview = null;
      // Retire l'image de la liste locale immédiatement pour éviter l'affichage "manquante"
      this.allImages = this.allImages.filter(im => im.id !== line.imageId);
      // Retire la ligne du marqueur dans unifiedContent
      const lines = this.unifiedContent.split('\n');
      lines.splice(line.lineIndex, 1);
      this.unifiedContent = lines.join('\n');
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
      this.recomputeRanges();
      this.recomputeMirrorLines();
      // Sauvegarde immédiate (pas scheduleSave) pour éviter la race avec refresh
      this.saveAll();
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

    if (this.draggingHandle.kind === 'image' || this.draggingHandle.kind === 'file' ||
        this.draggingHandle.kind === 'block-table' || this.draggingHandle.kind === 'block-quote' ||
        this.draggingHandle.kind === 'block-fence' || this.draggingHandle.kind === 'block-list') {
      const lines = this.unifiedContent.split('\n');
      let targetLine = Math.floor((contentY - this.PADDING_TOP_PX) / this.LINE_HEIGHT_PX);
      
      // Garde-fou : si on est à la toute fin, ramener d'une ligne pour éviter 
      // de sortir de la dernière section active.
      if (targetLine >= lines.length && lines.length > 0) targetLine = lines.length - 1;
      targetLine = Math.max(0, targetLine);

      this.currentDropTarget = { targetLine, position: 'before' };
      this.dropIndicator = { top: this.PADDING_TOP_PX + targetLine * this.LINE_HEIGHT_PX - 1, height: 2, position: 'before' };
      return;
    }

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

    // Blocs inline : déplacement purement textuel, pas d'appel backend
    if ((dragged.kind === 'block-table' || dragged.kind === 'block-quote' ||
         dragged.kind === 'block-fence' || dragged.kind === 'block-list') &&
        target.targetLine !== undefined) {
      const blockKindStr: Record<string, string> = {
        'block-table': 'Tableau', 'block-quote': 'Citation',
        'block-fence': 'Bloc de code', 'block-list': 'Liste',
      };
      this.woHistory.track({
        section: 'projets/contenu',
        actionType: 'update',
        label: `Déplacement — ${blockKindStr[dragged.kind] ?? 'Bloc'}`,
        entityType: 'content',
        entityId: dragged.id,
        beforeState: { lineStart: dragged.lineStart, lineEnd: dragged.lineEnd },
        afterState: { targetLine: target.targetLine },
        context: { projectId: this.projectName },
        undoable: false
      }).catch(() => {});
      this.moveFileBlockToLine(dragged.lineStart, dragged.lineEnd, target.targetLine);
      return;
    }

    // Détermination de l'entité cible pour le déplacement physique (images et fichiers)
    const draggedNode = this.findNode(dragged.id, this.files);
    let targetNode: FileNode | null = null;
    let position: 'before' | 'after' | 'inside' = 'inside';

    if (dragged.kind === 'image' || dragged.kind === 'file') {
      if (target.targetLine !== undefined) {
        // Trouver le dossier qui correspond à cette ligne pour le déplacement physique
        for (let i = this.sectionRanges.length - 1; i >= 0; i--) {
          const r = this.sectionRanges[i];
          if (target.targetLine >= r.lineStart && target.targetLine <= r.lineEnd) {
            targetNode = this.findNode(r.folderId, this.files);
            position = 'inside';
            break;
          }
        }
      }
    } else {
      if (target.handle) {
        targetNode = this.findNode(target.handle.id, this.files);
        position = target.position;
      }
    }

    if (!draggedNode || !targetNode) return;

    const draggedParent = this.findParentFolder(dragged.id, this.files);
    const targetParent = this.findParentFolder(targetNode.id, this.files);
    const targetParentId = targetParent?.id || null;
    const targetSiblings = targetParent ? (targetParent.children || []) : this.files;

    // Déplacement visuel (texte) en premier
    if (dragged.kind === 'image' && target.targetLine !== undefined) {
      this.moveImageMarkerToLine(dragged.lineStart, target.targetLine);
    } else if (dragged.kind === 'file' && target.targetLine !== undefined) {
      this.moveFileBlockToLine(dragged.lineStart, dragged.lineEnd, target.targetLine);
    }

    // Émission pour déplacement physique
    this.dragDrop.emit({
      draggedNode,
      draggedParentId: draggedParent?.id || null,
      targetNode,
      targetParentId,
      position,
      targetSiblings,
    });
  }

  private moveImageMarkerToLine(srcLine: number, targetLine: number) {
    const lines = this.unifiedContent.split('\n');
    if (srcLine < 0 || srcLine >= lines.length) return;
    const marker = lines[srcLine];
    if (!/^\{\{IMG:[a-zA-Z0-9._-]+\}\}/i.test(marker.trim())) return;

    lines.splice(srcLine, 1);
    
    let insertAt = targetLine;
    if (targetLine > srcLine) insertAt = targetLine - 1;
    
    insertAt = Math.max(0, Math.min(insertAt, lines.length));
    lines.splice(insertAt, 0, marker);

    this.unifiedContent = lines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeAll();
    // Sauvegarde immédiate sur drag pour sync live avec la sidebar (pas de debounce 10s)
    this.localDirty = true;
    this.saveAll();
  }

  private moveFileBlockToLine(srcStart: number, srcEnd: number, targetLine: number) {
    const lines = this.unifiedContent.split('\n');
    if (srcStart < 0 || srcEnd >= lines.length || srcStart > srcEnd) return;

    const blockLines = lines.splice(srcStart, srcEnd - srcStart + 1);

    let insertAt = targetLine;
    if (targetLine > srcEnd) insertAt = targetLine - blockLines.length;
    insertAt = Math.max(0, Math.min(insertAt, lines.length));

    lines.splice(insertAt, 0, ...blockLines);

    this.unifiedContent = lines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeAll();
    // Sauvegarde immédiate sur drag pour sync live avec la sidebar (pas de debounce 10s)
    this.localDirty = true;
    this.saveAll();
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

  // ── Correction de position des marqueurs image ──────────────
  // Après buildDocSections, s'assurer que chaque {{IMG:id}} se trouve dans la
  // section qui correspond au dossier parent réel du fichier image dans l'arborescence.
  // Corrige les cas où le fichier a été déplacé via la sidebar sans que le marqueur suive.
  // Retourne true si au moins une modification a été effectuée.
  private fixImageMarkersInSections(): boolean {
    let changed = false;
    const imgCorrectParent = new Map<string, string>();
    const walkImages = (nodes: FileNode[], parentId: string) => {
      for (const n of nodes) {
        if (n.type === 'file' && this.isImageFile(n.name)) imgCorrectParent.set(n.id, parentId);
        if (n.children) walkImages(n.children, n.id);
      }
    };
    walkImages(this.files, 'root');

    for (const [imgId, correctParentId] of imgCorrectParent) {
      const marker = `{{IMG:${imgId}}}`;
      const wrongSections = this.docSections.filter(
        s => s.folderId !== correctParentId && s.textContent.includes(marker)
      );
      const correctSection = this.docSections.find(s => s.folderId === correctParentId);
      const alreadyCorrect = !!correctSection?.textContent.includes(marker);

      if (wrongSections.length === 0 && alreadyCorrect) continue;

      const escaped = imgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\n?\\{\\{IMG:${escaped}\\}\\}\\n?`, 'gi');
      for (const sec of wrongSections) {
        const before = sec.textContent;
        sec.textContent = sec.textContent.replace(re, '\n');
        if (sec.textContent !== before) changed = true;
      }
      if (correctSection && !alreadyCorrect) {
        correctSection.textContent = correctSection.textContent.trimEnd() + `\n${marker}\n`;
        changed = true;
      }
    }
    return changed;
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

  // ── Visu edit : construction du HTML par section ────────────
  private buildVisuSections() {
    this.visuSections = this.docSections.map(sec => {
      const existing = this.visuSections.find(vs => vs.sectionId === sec.folderId);
      const isDirty = this.dirtyVisuSectionIds.has(sec.folderId);

      const range = this.sectionRanges.find(r => r.folderId === sec.folderId);
      const lines = this.unifiedContent.split('\n');
      const markdownBefore = range
        ? lines.slice(range.lineStart + 1, range.lineEnd + 1).join('\n').trim()
        : '';

      return {
        sectionId: sec.folderId,
        folderName: sec.folderName,
        level: sec.level,
        contentHtml: isDirty && existing ? existing.contentHtml : this.buildVisuSectionHtml(sec),
        markdownBefore: isDirty && existing ? existing.markdownBefore : markdownBefore,
      };
    });
    // Initialiser le innerHTML des contenteditable après le rendu Angular
    setTimeout(() => this.initVisuSectionHtml(), 0);
  }

  private buildVisuSectionHtml(sec: DocSection): string {
    const lines = sec.textContent.split('\n');
    let contentMd = lines.slice(1).join('\n');

    // Extraire les blocs fichier avant marked (placeholders)
    const fileBlocks: { token: string; html: string; md: string }[] = [];
    contentMd = contentMd.replace(/^(['`^])([^\n]+)\n([\s\S]*?)\n\1\s*$/gm, (_m, _d, name, content) => {
      const trimmed = (name as string).trim();
      const rawContent = (content as string) || '';
      const mdSource = `'${trimmed}\n${rawContent.trimEnd()}\n'`;
      // Traiter les {{IMG:...}} à l'intérieur du bloc avant marked.parse
      let processedContent = rawContent.replace(/\{\{IMG:([a-z0-9-]+)\}\}/gi, (__, id) => {
        const img = this.allImages.find(im => im.id === id);
        if (!img) return `*[image manquante: ${id}]*`;
        const encodedPath = img.path.split('/').map(s => encodeURIComponent(s)).join('/');
        const url = this.svc.getImageUrl(this.projectName, encodedPath);
        return `\n\n![${this.escapeAlt(img.name)}](${url})\n\n`;
      });
      const inner = marked.parse(processedContent, { async: false }) as string;
      const token = `@@FB${fileBlocks.length}@@`;
      const encoded = btoa(unescape(encodeURIComponent(mdSource)));
      fileBlocks.push({
        token,
        html: `<div class="visu-file" contenteditable="false" data-block-md="${encoded}"><div class="visu-file__title">${this.escapeHtml(trimmed)}</div>${inner}</div>`,
        md: mdSource,
      });
      return `\n\n${token}\n\n`;
    });

    // Remplacer les images (placeholders)
    const imgTokens: { token: string; html: string }[] = [];
    contentMd = contentMd.replace(/\{\{IMG:([a-z0-9-]+)\}\}/gi, (_, id) => {
      const img = this.allImages.find(im => im.id === id);
      const token = `@@IM${imgTokens.length}@@`;
      if (img) {
        const encodedPath = img.path.split('/').map(s => encodeURIComponent(s)).join('/');
        const url = this.svc.getImageUrl(this.projectName, encodedPath);
        imgTokens.push({
          token,
          html: `<div class="visu-img-wrap" contenteditable="false" data-img-id="${id}"><img src="${url}" alt="${this.escapeHtml(img.name)}"><div class="visu-img-bar"><span class="visu-img-name">${this.escapeHtml(img.name)}</span><button class="visu-img-del" data-img-id="${id}" type="button"><span class="material-symbols-outlined">delete</span></button></div></div>`,
        });
      } else {
        imgTokens.push({ token, html: `<span class="text-red-400 text-xs">[image manquante: ${id}]</span>` });
      }
      return `\n\n${token}\n\n`;
    });

    let html = marked.parse(contentMd, { async: false }) as string;

    // Les tables dans un contenteditable se corrompent — on les isole en non-éditable
    html = html.replace(/<table>([\s\S]*?)<\/table>/gi,
      '<div class="visu-table-wrap" contenteditable="false"><table>$1</table></div>');

    for (const fb of fileBlocks) {
      html = html.replace(new RegExp(`<p>\\s*${fb.token}\\s*</p>`, 'g'), fb.html).replace(fb.token, fb.html);
    }
    for (const im of imgTokens) {
      html = html.replace(new RegExp(`<p>\\s*${im.token}\\s*</p>`, 'g'), im.html).replace(im.token, im.html);
    }
    return html;
  }

  // ── Visu edit : init/refresh du innerHTML des contenteditable ──
  initVisuSectionHtml() {
    // Lookup par data-section-id pour gérer correctement les sections filtrées
    const sections = this.filteredVisuSections;
    this.visuSectionEls.forEach((ref) => {
      const el = ref.nativeElement;
      const sectionId = el.getAttribute('data-section-id');
      if (!sectionId) return;
      const sec = sections.find(s => s.sectionId === sectionId);
      if (sec && !this.dirtyVisuSectionIds.has(sec.sectionId)) {
        el.innerHTML = sec.contentHtml;
      }
    });
  }

  private flushVisuSections() {
    if (this.mode !== 'visu') return;
    this.visuSectionEls.forEach((ref) => {
      const el = ref.nativeElement;
      const sectionId = el.getAttribute('data-section-id');
      if (!sectionId) return;
      const sec = this.visuSections.find(s => s.sectionId === sectionId);
      if (sec && this.dirtyVisuSectionIds.has(sec.sectionId)) {
        const md = this.htmlSectionToMarkdown(el);
        this.saveVisuSection(sec.sectionId, md, sec.markdownBefore);
        this.dirtyVisuSectionIds.delete(sec.sectionId);
      }
    });
  }

  // ── Visu edit : événements section ─────────────────────────
  onVisuSectionFocus(sectionId: string) {
    // Refuser le focus si la section est verrouillée par un autre user
    if (this.collab.isLockedByOther(sectionId)) {
      const idx = this.visuSections.findIndex(vs => vs.sectionId === sectionId);
      const el = idx >= 0 ? this.visuSectionEls.get(idx)?.nativeElement : null;
      el?.blur();
      return;
    }
    this.activeVisuSectionId = sectionId;
    this.suppressScrollOnNextActiveChange = true;
    this.nodeActive.emit(sectionId);
    // Acquérir le lock et noter qu'on édite cette section
    if (this.projectName && this.editingVisuSectionId() !== sectionId) {
      // Capturer le contenu original avant modification
      const vs = this.visuSections.find(v => v.sectionId === sectionId);
      if (vs) this.visuSectionLockSnapshot.set(sectionId, vs.markdownBefore);
      this.editingVisuSectionId.set(sectionId);
      this.collab.lockNode(this.projectName, sectionId).catch(() => {});
    }
  }

  onVisuSectionBlur(sectionId: string) {
    // Sauvegarder localement (sans publier) mais conserver le lock
    if (this.dirtyVisuSectionIds.has(sectionId)) {
      const idx = this.visuSections.findIndex(vs => vs.sectionId === sectionId);
      const el = idx >= 0 ? this.visuSectionEls.get(idx)?.nativeElement : null;
      if (el) {
        const md = this.htmlSectionToMarkdown(el);
        const sec = this.visuSections[idx];
        this.saveVisuSection(sectionId, md, sec?.markdownBefore ?? '');
        this.dirtyVisuSectionIds.delete(sectionId);
      }
    }
    // NE PAS libérer le lock ici — l'utilisateur doit cliquer Partager ou Annuler
  }

  async publishVisuSection(sectionId: string): Promise<void> {
    const idx = this.visuSections.findIndex(vs => vs.sectionId === sectionId);
    const el = idx >= 0 ? this.visuSectionEls.get(idx)?.nativeElement : null;
    const snapshot = this.sectionFileSnapshot.get(sectionId);

    const sec = this.visuSections[idx];
    const newMd = el ? this.htmlSectionToMarkdown(el) : (sec?.markdownBefore ?? '');
    const mdBefore = this.visuSectionLockSnapshot.get(sectionId) ?? '';

    // Mettre à jour unifiedContent puis annuler le debounce
    this.saveVisuSection(sectionId, newMd, mdBefore);
    clearTimeout(this.saveTimeout);
    this.lastSavedContent = this.unifiedContent;

    // Publier : POST avec publish=true → SSE broadcast + unlock côté serveur
    if (snapshot?.fileId && this.projectName) {
      try {
        await this.svc.updateFile(this.projectName, snapshot.fileId, newMd, sectionId, true);
      } catch (e: any) {
        console.warn('[Publish] erreur lors de la publication:', e);
        return;
      }
    } else if (this.projectName) {
      await this.collab.unlockNode(this.projectName, sectionId).catch(() => {});
    }

    this.dirtyVisuSectionIds.delete(sectionId);
    this.visuSectionLockSnapshot.delete(sectionId);
    this.editingVisuSectionId.set(null);
    this.localDirty = false;
    this.dirtyChange.emit(false);
    this.showPublishToast();
  }

  async cancelVisuEdit(sectionId: string): Promise<void> {
    const idx = this.visuSections.findIndex(vs => vs.sectionId === sectionId);
    const el = idx >= 0 ? this.visuSectionEls.get(idx)?.nativeElement : null;
    const originalMd = this.visuSectionLockSnapshot.get(sectionId) ?? '';

    // Restaurer le contenu HTML original dans le contenteditable
    if (el) {
      el.innerHTML = await Promise.resolve(marked(originalMd) as string);
    }

    // Restaurer unifiedContent à la version d'avant édition
    if (originalMd !== undefined) {
      const sec = this.visuSections[idx];
      const currentMd = sec?.markdownBefore ?? '';
      if (currentMd !== originalMd) {
        this.saveVisuSection(sectionId, originalMd, currentMd);
        clearTimeout(this.saveTimeout);
        this.lastSavedContent = this.unifiedContent;
      }
    }

    // Libérer le lock (pas de publication)
    if (this.projectName) {
      await this.collab.unlockNode(this.projectName, sectionId).catch(() => {});
    }

    this.dirtyVisuSectionIds.delete(sectionId);
    this.visuSectionLockSnapshot.delete(sectionId);
    this.editingVisuSectionId.set(null);
    this.localDirty = false;
    this.dirtyChange.emit(false);
  }

  // ── Mode Code : Annuler / Partager ──────────────────────────
  async cancelCodeEdit(): Promise<void> {
    if (!this.focusedHandle) return;
    const sectionId = this.focusedHandle.id;
    const snapshot = this.codeSectionSnapshots.get(sectionId) ?? this.lastSavedContent;

    // Restaurer le contenu original dans la vue focusée
    this.unifiedContent = snapshot;
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = snapshot;
    clearTimeout(this.saveTimeout);
    this.lastSavedContent = snapshot;
    this.recomputeAll();
    this.localDirty = false;
    this.dirtyChange.emit(false);

    // Sauvegarder le contenu restauré (sans publish) pour annuler tout auto-save sur le disque
    this.saveAll();

    // Nettoyer le state pending
    this.codeSectionSnapshots.delete(sectionId);
    this.collab.removeLocalPending(sectionId);
    if (this.projectName) {
      this.collab.unlockNode(this.projectName, sectionId).catch(() => {});
    }
  }

  async publishCodeEdit(): Promise<void> {
    if (!this.projectName || !this.focusedHandle) return;
    const sectionId = this.focusedHandle.id;
    clearTimeout(this.saveTimeout);
    this.unfoldAll();
    const sections = this.parseContent();
    try {
      await Promise.all(
        sections
          .filter(s => s.fileId)
          .map(s => this.svc.updateFile(this.projectName, s.fileId!, s.content, s.folderId ?? undefined, true))
      );
      this.lastSavedContent = this.unifiedContent;
      this.localDirty = false;
      this.dirtyChange.emit(false);

      // Section partagée : retirer du pending + libérer le verrou
      this.codeSectionSnapshots.delete(sectionId);
      this.collab.removeLocalPending(sectionId);
      if (this.projectName) {
        this.collab.unlockNode(this.projectName, sectionId).catch(() => {});
      }
      this.showPublishToast();
    } catch (e) {
      console.warn('[PublishCode] erreur:', e);
    }
  }

  private showPublishToast(): void {
    this.publishToastVisible.set(true);
    setTimeout(() => this.publishToastVisible.set(false), 3000);
  }

  onVisuSectionInput(sectionId: string) {
    this.dirtyVisuSectionIds.add(sectionId);
    if (!this.localDirty) {
      this.localDirty = true;
      this.dirtyChange.emit(true);
    }
  }

  onVisuSectionKeydown(ev: KeyboardEvent) {
    // Fermer le menu d'insertion sur Escape
    if (ev.key === 'Escape') this.visuInsertMenu = null;
  }

  // ── Visu edit : sauvegarde d'une section ────────────────────
  private saveVisuSection(sectionId: string, newMd: string, mdBefore: string) {
    const range = this.sectionRanges.find(r => r.folderId === sectionId);
    if (!range) return;

    const lines = this.unifiedContent.split('\n');
    const headingLine = lines[range.lineStart];
    const before = lines.slice(0, range.lineStart);

    // Limiter au contenu DIRECT : s'arrêter juste avant la première sous-section.
    // range.lineEnd inclut les sous-sections ; on cherche la première ligne #heading
    // qui suit le heading courant pour ne pas les écraser.
    let directEnd = range.lineEnd;
    for (let j = range.lineStart + 1; j <= range.lineEnd; j++) {
      if (/^#{1,4} /.test(lines[j])) {
        directEnd = j - 1;
        break;
      }
    }
    const after = lines.slice(directEnd + 1);

    const newContentLines = newMd.trim() ? newMd.trim().split('\n') : [];
    const newLines = [...before, headingLine, ...newContentLines, ...after];
    const newContent = newLines.join('\n');

    if (newContent === this.unifiedContent) return;

    const node = this.findNode(sectionId, this.files);
    const snapshot = this.sectionFileSnapshot.get(sectionId);
    this.woHistory.track({
      section: 'projets/contenu',
      actionType: 'update',
      label: `Modification visu — «${node?.name || sectionId}»`,
      entityType: 'content',
      entityId: sectionId,
      beforeState: { content: mdBefore },
      afterState: { content: newMd },
      context: { projectId: this.projectName },
      undoable: !!snapshot?.fileId,
      undoAction: snapshot?.fileId ? {
        endpoint: `/api/file-projects/${this.projectName}/files/${snapshot.fileId}`,
        method: 'PUT',
        payload: { content: snapshot.content },
      } : undefined,
    }).catch(() => {});

    // Mettre à jour markdownBefore dans visuSections
    const vs = this.visuSections.find(s => s.sectionId === sectionId);
    if (vs) vs.markdownBefore = newMd;

    this.unifiedContent = newContent;
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = newContent;
    this.recomputeRanges();
    this.recomputeMirrorLines();
    this.scheduleSave();
  }

  // ── Visu edit : HTML → Markdown ─────────────────────────────
  private tableToMarkdown(table: HTMLTableElement | null): string {
    if (!table) return '';
    const cellMd = (c: Element) => this.nodesToMd(Array.from(c.childNodes)).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
    const rows: string[][] = [];
    const thead = table.querySelector('thead');
    if (thead) {
      const cells = Array.from(thead.querySelectorAll('th, td')).map(cellMd);
      rows.push(cells);
      rows.push(cells.map(() => '---'));
    }
    const tbody = table.querySelector('tbody');
    if (tbody) {
      for (const tr of Array.from(tbody.querySelectorAll('tr'))) {
        rows.push(Array.from(tr.querySelectorAll('td, th')).map(cellMd));
      }
    }
    if (rows.length === 0) return '';
    return '\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
  }

  private htmlSectionToMarkdown(el: HTMLElement): string {
    return this.nodesToMd(Array.from(el.childNodes)).replace(/\n{3,}/g, '\n\n').trim();
  }

  private nodesToMd(nodes: Node[]): string {
    return nodes.map(n => this.nodeToMd(n)).join('');
  }

  private nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // ── Vérifications par attribut data- ou classe (robuste même si contenteditable est normalisé)
    if (el.hasAttribute('data-block-md')) {
      try { return '\n' + decodeURIComponent(escape(atob(el.getAttribute('data-block-md')!))) + '\n'; } catch { return ''; }
    }
    if (el.hasAttribute('data-img-id')) {
      return `\n{{IMG:${el.getAttribute('data-img-id')}}}\n`;
    }
    // Table : via wrapper .visu-table-wrap OU balise <table> directe
    if (el.classList.contains('visu-table-wrap')) {
      return this.tableToMarkdown(el.querySelector('table'));
    }
    if (tag === 'table') {
      return this.tableToMarkdown(el as HTMLTableElement);
    }

    // Éléments génériquement non-éditables sans attribut connu → ignorer
    if (el.getAttribute('contenteditable') === 'false') return '';

    const inner = () => this.nodesToMd(Array.from(el.childNodes));

    switch (tag) {
      case 'h1': return `\n# ${inner().trim()}\n`;
      case 'h2': return `\n## ${inner().trim()}\n`;
      case 'h3': return `\n### ${inner().trim()}\n`;
      case 'h4': return `\n#### ${inner().trim()}\n`;
      case 'p': { const t = inner(); return t.trim() ? `\n${t.trim()}\n` : ''; }
      case 'br': return '\n';
      case 'strong': case 'b': return `**${inner()}**`;
      case 'em': case 'i': return `*${inner()}*`;
      case 'del': case 's': return `~~${inner()}~~`;
      case 'u': return `<u>${inner()}</u>`;
      case 'code': {
        if (el.parentElement?.tagName.toLowerCase() === 'pre') return el.textContent || '';
        return `\`${inner()}\``;
      }
      case 'pre': {
        const codeEl = el.querySelector('code');
        const lang = Array.from(codeEl?.classList || []).find(c => c.startsWith('language-'))?.replace('language-', '') || '';
        return `\n\`\`\`${lang}\n${codeEl?.textContent || ''}\n\`\`\`\n`;
      }
      case 'ul': {
        const items = Array.from(el.children).map(li => `- ${this.nodesToMd(Array.from(li.childNodes)).trim()}`);
        return '\n' + items.join('\n') + '\n';
      }
      case 'ol': {
        const items = Array.from(el.children).map((li, i) => `${i + 1}. ${this.nodesToMd(Array.from(li.childNodes)).trim()}`);
        return '\n' + items.join('\n') + '\n';
      }
      case 'li': return inner();
      case 'blockquote': return `\n> ${inner().trim()}\n`;
      // Lignes vides encadrantes obligatoires pour éviter l'interprétation setext-heading
      case 'hr': return '\n\n---\n\n';
      case 'img': return '';
      default: return inner();
    }
  }

  // ── Visu edit : toolbar formatage ───────────────────────────
  private setupVisuSelectionListener() {
    this.visuSelectionListener = () => this.zone.run(() => this.onVisuSelectionChange());
    document.addEventListener('selectionchange', this.visuSelectionListener);
  }

  private teardownVisuSelectionListener() {
    if (this.visuSelectionListener) {
      document.removeEventListener('selectionchange', this.visuSelectionListener);
      this.visuSelectionListener = null;
    }
  }

  onVisuSelectionChange() {
    if (this.mode !== 'visu') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      this.visuToolbar = null;
      this.cdr.detectChanges();
      return;
    }
    const range = sel.getRangeAt(0);
    const visuEl = this.visuRef?.nativeElement;
    if (!visuEl?.contains(range.commonAncestorContainer)) {
      this.visuToolbar = null;
      this.cdr.detectChanges();
      return;
    }
    const rect = range.getBoundingClientRect();
    const toolbarW = 220;
    const left = Math.max(4, Math.min(
      rect.left + rect.width / 2 - toolbarW / 2,
      window.innerWidth - toolbarW - 4
    ));
    this.visuToolbar = { top: rect.top - 48, left };
    this.cdr.detectChanges();
  }

  applyVisuFormat(command: string) {
    document.execCommand(command, false);
    const activeId = this.getActiveVisuSectionId();
    if (activeId) this.dirtyVisuSectionIds.add(activeId);
    this.visuToolbar = null;
  }

  private getActiveVisuSectionId(): string | null {
    const sel = window.getSelection();
    if (sel?.focusNode) {
      let el: Node | null = sel.focusNode;
      while (el && (el as HTMLElement).tagName !== 'BODY') {
        const htmlEl = el as HTMLElement;
        if (htmlEl.hasAttribute?.('data-section-id') && htmlEl.getAttribute('contenteditable') === 'true') {
          return htmlEl.getAttribute('data-section-id');
        }
        el = htmlEl.parentElement;
      }
    }
    return this.activeVisuSectionId;
  }

  // ── Visu edit : menu d'insertion ───────────────────────────
  showVisuInsertMenu(sectionId: string, ev: MouseEvent) {
    ev.stopPropagation();
    const btn = ev.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.visuInsertMenu = {
      sectionId,
      top: rect.bottom + 4,
      left: rect.left,
    };
  }

  insertVisuBlock(type: 'menu' | 'doc' | 'code', sectionId: string) {
    this.visuInsertMenu = null;
    const range = this.sectionRanges.find(r => r.folderId === sectionId);
    if (!range) return;

    const lines = this.unifiedContent.split('\n');
    let insertion = '';
    if (type === 'menu')  insertion = '\n## Nouveau titre\n';
    if (type === 'doc')   insertion = "\n'Nouveau document\n\n'\n";
    if (type === 'code')  insertion = '\n```\ncode ici\n```\n';

    // Insérer dans le contenu DIRECT de la section (avant la première sous-section).
    // range.lineEnd englobe les sous-sections ; on cherche la première ligne heading enfant.
    let directEnd = range.lineEnd;
    for (let j = range.lineStart + 1; j <= range.lineEnd; j++) {
      if (/^#{1,4} /.test(lines[j])) { directEnd = j - 1; break; }
    }
    lines.splice(directEnd + 1, 0, ...insertion.split('\n'));
    this.unifiedContent = lines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeAll();
    this.scheduleSave();

    const sec = this.visuSections.find(vs => vs.sectionId === sectionId);
    if (sec) {
      const node = this.findNode(sectionId, this.files);
      this.woHistory.track({
        section: 'projets/contenu',
        actionType: 'update',
        label: `Insertion ${type} — «${node?.name || sectionId}»`,
        entityType: 'content',
        entityId: sectionId,
        context: { projectId: this.projectName },
        undoable: false,
      }).catch(() => {});
    }

    setTimeout(() => this.initVisuSectionHtml(), 50);
  }

  onVisuContainerClick(ev: MouseEvent) {
    const target = ev.target as HTMLElement;
    // Fermer le menu d'insertion si clic en dehors
    if (this.visuInsertMenu && !target.closest('.visu-insert-menu') && !target.closest('.visu-insert-btn')) {
      this.visuInsertMenu = null;
    }
    // Bouton suppression image
    const delBtn = target.closest('.visu-img-del') as HTMLElement | null;
    if (delBtn) {
      const imgId = delBtn.getAttribute('data-img-id');
      if (imgId) this.deleteVisuImage(imgId);
    }
  }

  // ── Visu edit : gestion images ──────────────────────────────
  triggerVisuImageUpload(sectionId: string) {
    this.visuImageSectionId = sectionId;
    this.visuImgInputRef?.nativeElement.click();
  }

  async onVisuImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.visuImageSectionId) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
    if (!allowed.includes(file.type)) { this.imageUploadError = 'Type non autorisé.'; return; }
    if (file.size > 1024 * 1024) { this.imageUploadError = `Fichier trop grand (max 1 Mo).`; return; }

    const sectionId = this.visuImageSectionId;
    this.visuImageSectionId = null;
    try {
      const node = await this.svc.uploadImage(this.projectName, file, sectionId);
      this.woHistory.track({
        section: 'projets/fichiers',
        actionType: 'upload',
        label: `Import image visu «${file.name}»`,
        entityType: 'image',
        entityId: node.id,
        entityLabel: file.name,
        afterState: { fileName: file.name, size: file.size },
        context: { projectId: this.projectName },
        undoable: true,
        undoAction: { endpoint: `/api/file-projects/${this.projectName}/files/${node.id}`, method: 'DELETE' },
      }).catch(() => {});

      // Ajout local immédiat à allImages pour résoudre le marqueur sans attendre le refresh
      this.allImages = [...this.allImages, node];
      this.pendingLocalImages.push(node);
      this.recentlyAddedImageIds.add(node.id);
      setTimeout(() => {
        this.pendingLocalImages = this.pendingLocalImages.filter(n => n.id !== node.id);
        this.recentlyAddedImageIds.delete(node.id);
      }, 10000);
      // Insérer le marqueur image dans unifiedContent après la section
      const range = this.sectionRanges.find(r => r.folderId === sectionId);
      if (range) {
        const lines = this.unifiedContent.split('\n');
        lines.splice(range.lineEnd + 1, 0, '', `{{IMG:${node.id}}}`, '');
        this.unifiedContent = lines.join('\n');
        const ta = this.textareaRef?.nativeElement;
        if (ta) ta.value = this.unifiedContent;
        this.recomputeAll();
        // Save immédiat pour que onRefresh attende la fin du save (évite race avec loadFiles)
        this.saveAll();
        this.refresh.emit();
        setTimeout(() => this.initVisuSectionHtml(), 80);
      }
    } catch (e: any) {
      this.imageUploadError = e?.error?.error || 'Erreur lors de l\'upload.';
    }
  }

  private deleteVisuImage(imgId: string) {
    this.svc.deleteFile(this.projectName, imgId).then(() => {
      this.woHistory.track({
        section: 'projets/fichiers',
        actionType: 'delete',
        label: `Suppression image visu`,
        entityType: 'image',
        entityId: imgId,
        context: { projectId: this.projectName },
        undoable: false,
      }).catch(() => {});
      // Retrait local immédiat de allImages pour éviter affichage "manquante"
      this.allImages = this.allImages.filter(im => im.id !== imgId);
      // Retirer le marqueur de unifiedContent
      const lines = this.unifiedContent.split('\n');
      const idx = lines.findIndex(l => l.trim() === `{{IMG:${imgId}}}`);
      if (idx !== -1) lines.splice(idx, 1);
      this.unifiedContent = lines.join('\n');
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
      this.recomputeAll();
      // Save immédiat pour que onRefresh attende la fin du save (évite race avec loadFiles)
      this.saveAll();
      this.refresh.emit();
      setTimeout(() => this.initVisuSectionHtml(), 80);
    }).catch(() => {});
  }
}
