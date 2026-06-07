import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges, ViewChild, ViewChildren, QueryList, ElementRef, inject, NgZone, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileNode, ProjectFilesService, MegaOutilInstance, MegaOutilType, MegaOutilsService, MockupConnection } from '@worganic/portail-core/data-access';
import { marked } from 'marked';
import { WoActionHistoryService } from '@worganic/portail-core/data-access';
import { ProjetCollabService } from '@worganic/portail-core/data-access';
import { AuthService } from '@worganic/portail-core/data-access';
import { ImagePropsPanelComponent, ImageProps } from '../image-props-panel/image-props-panel.component';
import { SlashCommandMenuComponent, SlashCommand } from '../slash-command-menu/slash-command-menu.component';
import { TrelloBoardComponent, MockupBoardComponent } from '@worganic/shared/ui';

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
  isMockupMarker: boolean;
  mockupInstId: string;
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

interface StructureAdditionalBlock {
  id: string;
  delimiter: string;
  title: string;
  content: string;
}

interface StructureNode {
  id: string;
  level: number;
  title: string;
  textContent: string;
  additionalBlocks: StructureAdditionalBlock[];
  // Marqueurs Trello {{TRELLO:id}} extraits du contenu (masqués en Structure, ré-injectés à la sauvegarde)
  trelloMarkers: string[];
  // Marqueurs Mockup {{MOCKUP:id}} extraits du contenu (masqués en Structure, ré-injectés à la sauvegarde)
  mockupMarkers: string[];
  lineStart: number;
  lineEnd: number;
  folderId: string | null;
}

interface StructContextMenu {
  visible: boolean;
  node: StructureNode | null;
  x: number;
  y: number;
}

interface MockupDiagramNode {
  instanceId: string;
  name: string;
  sectionName: string;
  x: number;
  y: number;
}

interface MockupDiagDragState {
  nodeId: string;
  startMX: number; startMY: number;
  startX: number; startY: number;
}

@Component({
  selector: 'app-projet-editor-zone',
  standalone: true,
  imports: [CommonModule, FormsModule, ImagePropsPanelComponent, SlashCommandMenuComponent, TrelloBoardComponent, MockupBoardComponent],
  templateUrl: './projet-editor-zone.component.html',
  styleUrl: './projet-editor-zone.component.scss',
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' },
})
export class ProjetEditorZoneComponent implements OnChanges, OnDestroy {
  @Input() files: FileNode[] = [];
  @Input() restoreToken = 0;
  @Input() scrollToNodeId: string | null = null;
  @Input() saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' = 'idle';
  @Input() projectName = '';
  @Input() activeNodeId: string | null = null;
  @Input() highlightNodeId: string | null = null;
  @Input() backupType: string | null = null;
  @Input() ftpSyncGlobalStatus: 'idle' | 'syncing' | 'done' | 'error' = 'idle';
  @Input() ftpSyncProgress: { checked: number; total: number } = { checked: 0, total: 0 };
  @Input() nodeSyncStatus: Map<string, any> = new Map();
  @Input() hasFtpBackup = false;

  get isActiveSectionUnsynced(): boolean {
    if (!this.hasFtpBackup || this.ftpSyncGlobalStatus !== 'syncing') return false;
    if (!this.activeNodeId) return false;
    return this.nodeSyncStatus.get(this.activeNodeId) === 'unknown';
  }

  readonly backupBadge: Record<string, { icon: string; label: string; css: string }> = {
    ftp:         { icon: 'dns',          label: 'FTP',     css: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' },
    github:      { icon: 'code',         label: 'GitHub',  css: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
    gitlab:      { icon: 'merge',        label: 'GitLab',  css: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
    googledrive: { icon: 'add_to_drive', label: 'Drive',   css: 'text-green-400 border-green-500/30 bg-green-500/10' },
  };

  @Output() fileSave = new EventEmitter<FileSaveEvent>();
  @Output() sectionsChange = new EventEmitter<SectionInfo[]>();
  @Output() nodeActive = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();
  @Output() dragDrop = new EventEmitter<DragDropEvent>();
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() saveStarting = new EventEmitter<void>();
  // F6 — Commentaires : demande d'ouverture du drawer pour une section
  @Output() commentRequest = new EventEmitter<{ folderId: string; folderName: string }>();
  // F6 — Compteurs de commentaires par folderId (alimentés par le parent)
  @Input() commentCounts: Record<string, number> = {};

  // Mega-outils (barre sous la toolbar de style)
  @Input()  megaOutilInstances: MegaOutilInstance[] = [];
  @Input()  activeMegaOutilId: string | null = null;
  @Input()  activeOutilId: string | null = null;
  @Output() megaOutilSelect = new EventEmitter<MegaOutilInstance>();
  @Output() megaOutilCreated = new EventEmitter<MegaOutilInstance>();
  @Output() megaOutilDeleted = new EventEmitter<string>();

  // Vue "Liste des trellos" (zone centrale) déclenchée depuis la sidebar
  @Input()  showTrelloList = false;
  @Output() closeTrelloList = new EventEmitter<void>();
  // Navigation vers la section d'origine d'un trello (sélection réelle, contrairement à nodeActive)
  @Output() trelloNavigate = new EventEmitter<string>();

  // Vue "Liste des mockups" (zone centrale) déclenchée depuis la sidebar
  @Input()  showMockupList = false;
  @Output() closeMockupList = new EventEmitter<void>();
  // Navigation vers la section d'origine d'un mockup (depuis la liste)
  @Output() mockupNavigate = new EventEmitter<string>();
  // Ouverture de la vue diagramme dans le portail
  @Output() openMockupDiagram = new EventEmitter<void>();
  // Compteurs de cartes par instance/colonne (aperçu) — clé = instanceId
  trelloListCounts = signal<Record<string, { todo: number; 'in-progress': number; done: number; blocked: number; total: number }>>({});
  // Section résolue par instance (clé = instanceId) — déduite de la position du marqueur, fallback inst.folderId
  trelloSections = signal<Record<string, { folderId: string | null; name: string }>>({});

  // Popup de configuration d'un nouveau Trello
  showTrelloPopup = signal(false);
  trelloName = '';
  trelloCreating = signal(false);
  // Zone basse : boards Trello incrustés dans le contenu courant (affichés dans tous les modes)
  contentTrelloIds: string[] = [];
  trelloPanelCollapsed = signal(false);

  // Popup de configuration d'un nouveau Mockup
  showMockupPopup = signal(false);
  mockupName = '';
  mockupCreating = signal(false);
  mockupNameError = signal('');
  // Zone basse : boards Mockup incrustés dans le contenu courant
  contentMockupIds: string[] = [];
  mockupPanelCollapsed = signal(false);
  // Sections résolues par instance mockup (folderId + nom)
  mockupSections = signal<Record<string, { folderId: string | null; name: string }>>({});

  // Liste des mockups — onglets Liste / Diagramme
  mockupListTab = signal<'list' | 'diagram'>('list');
  mockupDiagramNodes = signal<MockupDiagramNode[]>([]);
  mockupConnections = signal<MockupConnection[]>([]);
  mockupConnectMode = signal(false);
  mockupConnectSource = signal<string | null>(null);
  mockupConnLabelDialog = signal(false);
  mockupPendingConnLabel = '';
  private mockupDiagDrag: MockupDiagDragState | null = null;
  private mockupPendingConnTarget: string | null = null;
  private mockupDiagLoaded = false;
  readonly MOCK_NODE_W = 180;
  readonly MOCK_NODE_H = 90;
  readonly MOCK_DIAG_W = 1600;
  readonly MOCK_DIAG_H = 1000;
  readonly Math = Math;

  // Barre MO — type actif déplié (trello / mockup / null)
  moActiveType = signal<'trello' | 'mockup' | null>(null);
  // Popup de liaison : choisir quel mockup insérer dans la section courante
  showMockupLiaisonPopup = signal(false);
  private liaisonCursorPos = -1;

  private localDirty = false;

  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('textarea') textareaRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('moInstanceList') moInstanceListRef?: ElementRef<HTMLDivElement>;
  @ViewChild('mirror') mirrorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('overlay') overlayRef?: ElementRef<HTMLDivElement>;
  @ViewChild('visu') visuRef?: ElementRef<HTMLDivElement>;
  @ViewChildren('visuSectionEl') visuSectionEls!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('visuImgInput') visuImgInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('slashMenu') slashMenuRef?: SlashCommandMenuComponent;

  private sanitizer = inject(DomSanitizer);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private woHistory = inject(WoActionHistoryService);
  collab = inject(ProjetCollabService);
  private authSvc = inject(AuthService);
  private megaOutilsSvc = inject(MegaOutilsService);

  // Mode (toggle Edition / Structure / Visu)
  mode: 'edit' | 'visu' | 'structure' = 'edit';

  // ── Mode Structure ──────────────────────────────────────────
  structureNodes: StructureNode[] = [];
  structContextMenu: StructContextMenu = { visible: false, node: null, x: 0, y: 0 };
  private structFlushTimeout: any;
  // Collab structure mode
  structureHasPending = signal(false);
  structFocusedEntityId = signal<string | null>(null);  // entité active pour Annuler
  private structEntityLocks = new Set<string>();   // IDs verrouillés en mode structure
  private structEntitySnapshots = new Map<string, { type: 'folder' | 'block', folderId: string, blockId?: string, title: string, textContent: string }>();

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
  // Entité (fileId, blockId ou folderId) sous le curseur courant dans la textarea
  cursorEntityId = signal<string | null>(null);
  publishToastVisible = signal<boolean>(false);
  publishErrorToastVisible = signal<boolean>(false);
  publishErrorMessage = signal<string>('');
  isPublishing = signal<boolean>(false);
  isUploading = signal<boolean>(false);
  // Snapshots du contenu original par section (clé = sectionId / focusedHandle.id)
  // Permet de restaurer le contenu original via "Annuler" même après navigation entre sections
  private codeSectionSnapshots = new Map<string, string>();
  // Snapshot pré-édition du document complet quand on édite SANS mode focus (vue racine).
  // Permet le "Annuler" au niveau document pour les projets avec sauvegarde externe.
  private codeDocSnapshot: string | null = null;
  private dirtyVisuSectionIds = new Set<string>();
  private visuSectionLockSnapshot = new Map<string, string>();
  private pendingVisuDeletions = new Map<string, { node: any; sectionId: string }>();
  private visuSelectionListener: (() => void) | null = null;
  visuImageSectionId: string | null = null;
  // F5 — panneau de propriétés d'image (mode Visu)
  imagePropsPanel: { visible: boolean; imageId: string; kind: 'image' | 'mockup'; caption: string; alignment: '' | 'left' | 'center' | 'right'; width: string; top: number; left: number } = {
    visible: false, imageId: '', kind: 'image', caption: '', alignment: '', width: '', top: 0, left: 0
  };
  // F1 — Slash command menu (mode Code)
  slashMenuState: { visible: boolean; top: number; left: number; query: string; anchorPos: number } = {
    visible: false, top: 0, left: 0, query: '', anchorPos: -1
  };
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
  // IDs des images dont le fichier local est absent ou invalide (0 octet)
  brokenImages = new Set<string>();
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
  // IDs des entités verrouillées au niveau granulaire (fichier, bloc inline, ou section).
  // Permet de déverrouiller uniquement les entités réellement touchées, pas toute la section.
  private activeEntityLocks = new Set<string>();
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
    // Rechargement forcé après un undo (historique) : reconstruit le contenu depuis
    // les fichiers déjà patchés par le parent, en préservant le mode focus si actif.
    if (changes['restoreToken'] && !changes['restoreToken'].firstChange) {
      this.docSections = this.buildDocSections(this.files, 1);
      this.allImages = this.collectAllImages(this.files).filter(im => !this.pendingVisuDeletions.has(im.id));
      const newFullContent = this.reconstructFromSections();

      if (this.focusedHandle) {
        // Mode focus : recalcule la position de la section focusée dans le nouveau doc
        const focusedId = this.focusedHandle.id;
        const focusedKind = this.focusedHandle.kind;
        const tmp = this.unifiedContent;
        this.unifiedContent = newFullContent;
        this.recomputeRanges();
        this.unifiedContent = tmp;

        let newRange: { lineStart: number; lineEnd: number } | null = null;
        if (focusedKind === 'folder') {
          const sr = this.sectionRanges.find(r => r.folderId === focusedId);
          if (sr) newRange = { lineStart: sr.lineStart, lineEnd: sr.lineEnd };
        } else if (focusedKind === 'file') {
          const fr = this.fileRanges.find(r => r.fileId === focusedId);
          if (fr) newRange = { lineStart: fr.lineStart, lineEnd: fr.lineEnd };
        }

        if (newRange) {
          this.fullContentBackup = newFullContent;
          this.focusedLineStart = newRange.lineStart;
          this.focusedOriginalLineCount = newRange.lineEnd - newRange.lineStart + 1;
          this.unifiedContent = newFullContent.split('\n').slice(newRange.lineStart, newRange.lineEnd + 1).join('\n');
        } else {
          // Section disparue → sortir du focus
          this.focusedHandle = null;
          this.fullContentBackup = '';
          this.unifiedContent = newFullContent;
        }
      } else {
        this.unifiedContent = newFullContent;
      }

      this.lastSavedContent = this.unifiedContent;
      this.recomputeAll();
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
    }
    if (changes['files']) {
      const currentStructure = this.getFileStructureKey(this.files);
      const hasStructuralChange = this.lastStructureKey !== null && this.lastStructureKey !== currentStructure;
      this.lastStructureKey = currentStructure;
      // Nettoyer les replis au rechargement structurel (structure a changé)
      if (hasStructuralChange && this.foldedContent.size > 0) this.unfoldAll();

      this.docSections = this.buildDocSections(this.files, 1);
      this.allImages = this.collectAllImages(this.files)
        .filter(im => !this.pendingVisuDeletions.has(im.id));
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
      // Nettoyer les marqueurs {{TRELLO:...}} du contenu (approche DB-only)
      const trelloStripped = !this.focusedHandle && this.stripTrelloMarkersFromUnifiedContent();
      // Supprimer les marqueurs {{MOCKUP:id}} dupliqués
      const mockupDeduped = !this.focusedHandle && this.deduplicateMockupMarkers();
      this.recomputeAll();
      this.updateSnapshotFromFiles();

      if ((markersFixed || trelloStripped || mockupDeduped) && !this.focusedHandle) {
        setTimeout(() => this.saveAll(), 0);
      }
    }

    if (changes['highlightNodeId']) {
      this.recomputeHighlights();
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

    // Les instances mega-outils peuvent arriver après le contenu → recalculer la zone basse
    if (changes['megaOutilInstances']) {
      this.recomputeContentTrelloIds();
      this.recomputeContentMockupIds();
      if (this.hasLoaded) this.repairMissingMockupMarkers();
      if (this.showTrelloList) { this.loadTrelloListCounts(); this.recomputeTrelloSections(); }
      if (this.showMockupList) { this.recomputeMockupSections(); }
      // Invalider le cache preview (les thumbnails peuvent avoir changé)
      this.fileVisuPreviewCache = null;
      // Reconstruire les sections visu pour mettre à jour les thumbnails mockup
      if (this.mode === 'visu') this.buildVisuSections();
    }

    // Ouverture de la vue "Liste des trellos" → charger les aperçus (cartes par colonne)
    if (changes['showTrelloList'] && this.showTrelloList) {
      this.loadTrelloListCounts();
      this.recomputeTrelloSections();
    }

    // Ouverture/fermeture de la vue "Liste des mockups"
    if (changes['showMockupList']) {
      if (this.showMockupList) {
        this.recomputeMockupSections();
      } else {
        this.mockupListTab.set('list');
        this.mockupDiagLoaded = false;
      }
    }
  }

  // ── Liste des trellos (vue centrale) ───────────────────────────────────────

  get trelloInstances(): MegaOutilInstance[] {
    return this.megaOutilInstances.filter(i => i.type === 'trello');
  }

  private async loadTrelloListCounts() {
    const result: Record<string, { todo: number; 'in-progress': number; done: number; blocked: number; total: number }> = {};
    for (const inst of this.trelloInstances) {
      try {
        const cards = await this.megaOutilsSvc.getTrelloCards(inst.id);
        result[inst.id] = {
          'todo':        cards.filter(c => c.status === 'todo').length,
          'in-progress': cards.filter(c => c.status === 'in-progress').length,
          'done':        cards.filter(c => c.status === 'done').length,
          'blocked':     cards.filter(c => c.status === 'blocked').length,
          'total':       cards.length,
        };
      } catch {
        result[inst.id] = { 'todo': 0, 'in-progress': 0, 'done': 0, 'blocked': 0, 'total': 0 };
      }
    }
    this.trelloListCounts.set(result);
    this.cdr.markForCheck();
  }

  /**
   * Résout la section de chaque trello : prioritairement via la position du marqueur
   * {{TRELLO:id}} dans le contenu (source de vérité), fallback sur inst.folderId.
   */
  /**
   * Résout le folderId de la section d'un trello : prioritairement via la position
   * du marqueur {{TRELLO:id}} dans docSections (indépendant du mode focus), fallback inst.folderId.
   */
  private resolveTrelloFolderId(instId: string): string | null {
    const marker = `{{TRELLO:${instId}}}`;
    const sec = this.docSections.find(s => s.textContent.includes(marker));
    if (sec) return sec.folderId;
    return this.megaOutilInstances.find(i => i.id === instId)?.folderId ?? null;
  }

  private recomputeTrelloSections() {
    const map: Record<string, { folderId: string | null; name: string }> = {};
    for (const inst of this.trelloInstances) {
      const folderId = this.resolveTrelloFolderId(inst.id);
      const node = folderId ? this.findNode(folderId, this.files) : null;
      const name = node?.name ?? (folderId ? 'Section introuvable' : 'Sans section');
      map[inst.id] = { folderId, name };
      // Persiste le folder_id si la section résolue (via marqueur) diffère de celle stockée,
      // pour que la vue Admin › Méga-outils affiche la bonne section.
      if (folderId && folderId !== inst.folderId) {
        inst.folderId = folderId;
        this.megaOutilsSvc.updateInstance(inst.id, { folderId }).catch(() => {});
      }
    }
    this.trelloSections.set(map);
  }

  /** Nom de la section où le trello est implanté (pour l'en-tête du board). */
  trelloSectionName(id: string): string {
    return this.trelloSections()[id]?.name ?? '';
  }

  /** Clic sur un onglet Mega-outils : sélectionne l'instance et navigue vers sa section. */
  selectMegaOutil(inst: MegaOutilInstance) {
    this.megaOutilSelect.emit(inst);
    const folderId = inst.type === 'mockup'
      ? this.resolveMockupFolderId(inst.id)
      : this.resolveTrelloFolderId(inst.id);
    if (folderId) this.trelloNavigate.emit(folderId);
  }

  private resolveMockupFolderId(instId: string): string | null {
    const marker = `{{MOCKUP:${instId}}}`;
    const sec = this.docSections.find(s => s.textContent.includes(marker));
    if (sec) return sec.folderId;
    return this.megaOutilInstances.find(i => i.id === instId)?.folderId ?? null;
  }

  // ── Liste des mockups (vue centrale) ──────────────────────────────────────

  get mockupInstances(): MegaOutilInstance[] {
    return this.megaOutilInstances.filter(i => i.type === 'mockup');
  }

  private recomputeMockupSections() {
    const map: Record<string, { folderId: string | null; name: string }> = {};
    for (const inst of this.mockupInstances) {
      const folderId = this.resolveMockupFolderId(inst.id);
      const node = folderId ? this.findNode(folderId, this.files) : null;
      const name = node?.name ?? (folderId ? 'Section introuvable' : 'Sans section');
      map[inst.id] = { folderId, name };
    }
    this.mockupSections.set(map);
  }

  goToMockupSection(inst: MegaOutilInstance) {
    const folderId = this.mockupSections()[inst.id]?.folderId;
    if (!folderId) return;
    this.mockupNavigate.emit(folderId);
  }

  /** Navigue vers la section d'origine d'un trello et ferme la liste. */
  goToTrelloSection(inst: MegaOutilInstance) {
    const folderId = this.trelloSections()[inst.id]?.folderId;
    if (!folderId) return;
    this.trelloNavigate.emit(folderId);
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
          const matches = child.content.matchAll(/\{\{IMG:([a-z0-9-]+)(?:\|[^}]*)?\}\}/gi);
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
    this.recomputeContentTrelloIds();
    this.recomputeContentMockupIds();
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
    const effectiveId = this.highlightNodeId ?? this.activeNodeId;
    if (!effectiveId) return;
    const node = this.findNode(effectiveId, this.files);
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
        const parent = this.findParentFolder(effectiveId, this.files);
        if (parent) this.highlightedFolderIds.add(parent.id);
      } else {
        // Document additionnel : surligne uniquement son bloc (vert)
        this.highlightedFileIds.add(effectiveId);
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
      const m = /^\{\{IMG:([a-z0-9-]+)(?:\|[^}]*)?\}\}\s*$/i.exec(line.trim());
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
      const m = /^\{\{IMG:([a-z0-9-]+)(?:\|[^}]*)?\}\}\s*$/i.exec(line.trim());
      if (m) {
        const img = this.allImages.find(im => im.id === m[1]);
        return {
          text: line, safeHtml: '', isImage: true,
          imageId: m[1], imageName: img?.name || '', imagePath: img?.path || '',
          highlightKind: kind, lineIndex: i,
          isFold: false, foldSectionId: '', foldLineCount: 0,
          inlineBlockId: ib?.id || null, inlineBlockKind: ib?.kind || null,
          isMockupMarker: false, mockupInstId: '',
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
          isMockupMarker: false, mockupInstId: '',
        };
      }
      // Marqueur Trello : masqué (board affiché en zone basse)
      const isTrelloMarker = /^\{\{TRELLO:[a-zA-Z0-9-]+\}\}\s*$/.test(line.trim());
      const mockupM = /^\{\{MOCKUP:([a-zA-Z0-9-]+)(?:\|[^}]*)?\}\}\s*$/.exec(line.trim());
      const isMockupMarker = !!mockupM;
      const mockupInstId = mockupM ? mockupM[1] : '';
      return {
        text: line, safeHtml: (isTrelloMarker || isMockupMarker) ? ' ' : this.syntaxHighlight(line), isImage: false,
        imageId: '', imageName: '', imagePath: '',
        highlightKind: kind, lineIndex: i,
        isFold: false, foldSectionId: '', foldLineCount: 0,
        inlineBlockId: ib?.id || null, inlineBlockKind: ib?.kind || null,
        isMockupMarker, mockupInstId,
      };
    });

    this.recomputeContentTrelloIds();
    this.recomputeContentMockupIds();
  }

  /** Ids Trello dont le folderId correspond à la section active (mode DB-only, sans marqueur dans le contenu). */
  private recomputeContentTrelloIds() {
    const activeFolderId = this.focusedHandle?.id ?? this.activeNodeId ?? null;
    this.contentTrelloIds = this.trelloInstances
      .filter(i => i.folderId === activeFolderId)
      .map(i => i.id);
    this.recomputeTrelloSections();
  }

  /** Ids Mockup dont le marqueur {{MOCKUP:id}} est présent dans le contenu courant (tous modes). */
  private recomputeContentMockupIds() {
    const ids: string[] = [];
    const re = new RegExp(ProjetEditorZoneComponent.MOCKUP_MARKER_SRC, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.unifiedContent)) !== null) {
      const id = m[1];
      if (!ids.includes(id) && this.megaOutilInstances.some(i => i.id === id)) ids.push(id);
    }
    this.contentMockupIds = ids;
  }

  private recomputeRenderedHtml() {
    if (this.mode !== 'visu') {
      this.renderedHtml = '';
      return;
    }
    // Placeholders pour les images (rendues en HTML brut avec <figure> pour caption + align/width)
    const mainImgTokens: { token: string; html: string }[] = [];
    let md = this.unifiedContent.replace(/\{\{IMG:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/gi, (_match, id, cap, align, width) => {
      const token = `@@MI${mainImgTokens.length}@@`;
      mainImgTokens.push({
        token,
        html: this.renderImageMarkerHtml(id, (cap || '').trim(), align || '', width || '')
      });
      return `\n\n${token}\n\n`;
    });

    // F2 — Pré-traitement des callouts (avant les blocs fichiers et marked)
    const calloutRes = this.processCallouts(md);
    md = calloutRes.md;
    const mainCalloutTokens = calloutRes.tokens;

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
    for (const ph of mainImgTokens) {
      const wrapped = new RegExp(`<p>\\s*${ph.token}\\s*</p>`, 'g');
      html = html.replace(wrapped, ph.html).replace(ph.token, ph.html);
    }
    for (const ph of mainCalloutTokens) {
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

  // ── Image marker helpers (F3 caption + F5 resize) ────────────
  // Syntaxe : {{IMG:id|caption|align|width}}  — tous les params après id optionnels
  // align : left | center | right
  // width : 100px | 50% | etc.
  parseImageMarker(text: string): { id: string; caption: string; alignment: '' | 'left' | 'center' | 'right'; width: string } | null {
    const m = /\{\{IMG:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/i.exec(text);
    if (!m) return null;
    return {
      id: m[1],
      caption: (m[2] || '').trim(),
      alignment: ((m[3] || '') as '' | 'left' | 'center' | 'right'),
      width: m[4] || ''
    };
  }

  buildImageMarker(props: { id: string; caption?: string; alignment?: string; width?: string }): string {
    const parts = [props.id];
    const cap = (props.caption || '').trim();
    const al = props.alignment || '';
    const w = props.width || '';
    if (cap || al || w) parts.push(cap);
    if (al || w) parts.push(al);
    if (w) parts.push(w);
    return `{{IMG:${parts.join('|')}}}`;
  }

  buildMockupMarker(props: { id: string; caption?: string; alignment?: string; width?: string }): string {
    const parts = [props.id];
    const cap = (props.caption || '').trim();
    const al = props.alignment || '';
    const w = (props.width || '').trim();
    if (cap || al || w) parts.push(cap);
    if (al || w) parts.push(al);
    if (w) parts.push(w);
    return `{{MOCKUP:${parts.join('|')}}}`;
  }

  private renderMockupMarkerHtml(id: string, caption: string, align: string, width: string): string {
    const inst = this.megaOutilInstances.find(i => i.id === id);
    const name = this.escapeHtml(inst?.name ?? 'Mockup');
    const thumb = inst?.thumbnailData;
    const validAlignments = ['left', 'center', 'right'];
    const safeAlign = validAlignments.includes(align) ? align : '';
    const alignClass = safeAlign ? ` visu-mockup--${safeAlign}` : '';
    const widthStyle = width ? ` style="width:${width}"` : '';
    const capText = caption || name;
    const captionHtml = `<figcaption>${this.escapeHtml(capText)}</figcaption>`;
    const dataAttrs = ` data-mockup-id="${id}" data-mockup-caption="${this.escapeHtml(caption)}" data-mockup-align="${align}" data-mockup-width="${width}"`;
    const openBtn = `<button class="visu-mockup-open-btn" data-mockup-open="${id}" type="button" title="Modifier le mockup" contenteditable="false"><span class="material-symbols-outlined">open_in_new</span></button>`;
    if (thumb) {
      return `<figure class="visu-mockup${alignClass}"${widthStyle} contenteditable="false"${dataAttrs}><img src="${thumb}" alt="${name}" />${captionHtml}${openBtn}</figure>`;
    }
    return `<div class="visu-mockup-placeholder${alignClass}"${widthStyle} contenteditable="false"${dataAttrs}><span class="material-symbols-outlined">design_services</span>${this.escapeHtml(capText)}${openBtn}</div>`;
  }

  /** Parseur markdown avec traitement MOCKUP — utilisé dans le dirty path de initVisuSectionHtml */
  private parseVisuMd(md: string): string {
    const mockupTokens: { token: string; html: string }[] = [];
    let processed = md.replace(/\{\{MOCKUP:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/gi, (_m, id, cap, align, width) => {
      const token = `@@VM${mockupTokens.length}@@`;
      mockupTokens.push({ token, html: this.renderMockupMarkerHtml(id, (cap || '').trim(), align || '', width || '') });
      return `\n\n${token}\n\n`;
    });
    let html = marked.parse(processed, { async: false }) as string;
    for (const mk of mockupTokens) {
      html = html.replace(new RegExp(`<p>\\s*${mk.token}\\s*</p>`, 'g'), mk.html).replace(mk.token, mk.html);
    }
    return html;
  }

  // F2 — Callouts : pré-traitement des blocs > [!TYPE] avant marked.parse()
  // Retourne le markdown avec placeholders @@CO<n>@@ + la liste des HTML à réinjecter ensuite
  private processCallouts(md: string): { md: string; tokens: { token: string; html: string }[] } {
    const tokens: { token: string; html: string }[] = [];
    const iconMap: Record<string, string> = {
      INFO: 'info',
      WARNING: 'warning',
      SUCCESS: 'check_circle',
      DANGER: 'error'
    };
    // Bloc multi-ligne : 1 ligne d'en-tête `> [!TYPE] Titre?` puis lignes suivantes commençant par `> `
    const re = /^> \[!(INFO|WARNING|SUCCESS|DANGER)\][ \t]*([^\n]*)((?:\n>[ \t]?[^\n]*)*)/gmi;
    const out = md.replace(re, (_match, typeRaw: string, title: string, bodyLines: string) => {
      const type = typeRaw.toUpperCase();
      const icon = iconMap[type] || 'info';
      // Retirer le préfixe "> " de chaque ligne du body
      const body = (bodyLines || '')
        .split('\n')
        .filter(l => l.length > 0)
        .map(l => l.replace(/^>[ \t]?/, ''))
        .join('\n')
        .trim();
      const titleHtml = (title || '').trim()
        ? `<span class="callout__title">${this.escapeHtml((title || '').trim())}</span>`
        : `<span class="callout__title">${type.charAt(0) + type.slice(1).toLowerCase()}</span>`;
      const bodyHtml = body ? (marked.parse(body, { async: false }) as string) : '';
      const token = `@@CO${tokens.length}@@`;
      tokens.push({
        token,
        html: `<div class="callout callout--${type.toLowerCase()}" data-callout-type="${type}"><div class="callout__header"><span class="material-symbols-outlined callout__icon">${icon}</span>${titleHtml}</div><div class="callout__body">${bodyHtml}</div></div>`
      });
      return `\n\n${token}\n\n`;
    });
    return { md: out, tokens };
  }

  private renderImageMarkerHtml(id: string, caption: string, alignment: string, width: string, opts?: { withDeleteBar?: boolean }): string {
    const img = this.allImages.find(im => im.id === id);
    if (!img) {
      return `<span class="text-red-400 text-xs">[image manquante: ${this.escapeHtml(id)}]</span>`;
    }
    const encodedPath = img.path.split('/').map(s => encodeURIComponent(s)).join('/');
    const url = this.svc.getImageUrl(this.projectName, encodedPath);
    const validAlignments = ['left', 'center', 'right'];
    const safeAlign = validAlignments.includes(alignment) ? alignment : '';
    const alignClass = safeAlign ? ` visu-figure--${safeAlign}` : '';
    const widthStyle = width ? ` style="width:${width}"` : '';
    const altText = this.escapeHtml(img.name);
    const captionHtml = caption ? `<figcaption>${this.escapeHtml(caption)}</figcaption>` : '';
    const delBtn = opts?.withDeleteBar
      ? `<div class="visu-img-bar"><span class="visu-img-name">${altText}</span><button class="visu-img-del" data-img-id="${id}" type="button"><span class="material-symbols-outlined">delete</span></button></div>`
      : '';
    return `<figure class="visu-figure${alignClass}"${widthStyle} contenteditable="false" data-img-id="${id}" data-img-caption="${this.escapeHtml(caption)}" data-img-align="${alignment}" data-img-width="${width}"><img src="${url}" alt="${altText}">${captionHtml}${delBtn}</figure>`;
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
  setMode(m: 'edit' | 'visu' | 'structure') {
    if (this.mode === m) return;
    if (this.mode === 'edit') {
      this.unfoldAll();
      if (this.focusedHandle) this.exitFocusMode();
      else this.saveAll();
    } else if (this.mode === 'visu') {
      this.flushVisuSections();
      this.teardownVisuSelectionListener();
    } else if (this.mode === 'structure') {
      clearTimeout(this.structFlushTimeout);
      this.flushStructureNodes();
      this.structContextMenu = { visible: false, node: null, x: 0, y: 0 };
    }
    this.mode = m;
    this.recomputeAll();
    if (m === 'visu') {
      this.setupVisuSelectionListener();
    }
    if (m === 'edit') {
      setTimeout(() => this.applyFocusByActiveNode(), 0);
    }
    if (m === 'structure') {
      this.structureNodes = this.parseStructureNodes();
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
    clearTimeout(this.saveTimeout);
    clearTimeout(this.structFlushTimeout);
    if (this.mode === 'structure') this.flushStructureNodes();
    if (this.unifiedContent !== this.lastSavedContent) this.saveAll();
    this.teardownVisuSelectionListener();
    // Libérer les verrous structure si non publiés (ex: fermeture de page)
    for (const entityId of this.structEntityLocks) {
      this.collab.removeLocalPending(entityId);
      if (this.projectName) this.collab.unlockNode(this.projectName, entityId).catch(() => {});
    }
    this.structEntityLocks.clear();
    this.structEntitySnapshots.clear();
  }

  // ── Mode focus : édition d'une seule section / document ─────
  enterFocusMode(handle: DragHandle, ev?: MouseEvent) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    clearTimeout(this.saveTimeout);
    // On bascule en contexte section → le snapshot document devient caduc
    this.codeDocSnapshot = null;

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

    // Si la section ou l'une de ses entités enfants est déjà verrouillée par moi
    // (verrou serveur persistant après reload), restaurer l'état "pending" + activeEntityLocks
    const allLocks = this.collab.locks();
    const me = this.authSvc.currentUser();
    let hasMyLock = this.collab.isLockedByMe(handle.id);
    if (!hasMyLock && me) {
      // Vérifier si un verrou granulaire (fichier/bloc) appartenant à moi existe pour cette section
      for (const [nodeId, lock] of allLocks) {
        if (lock.lockedById === me.id && nodeId !== handle.id) {
          // Vérifier si ce nodeId est un enfant de la section (fichier ou bloc dans ce dossier)
          const parent = this.findParentFolder(nodeId, this.files);
          if (parent?.id === handle.id) {
            hasMyLock = true;
            this.activeEntityLocks.add(nodeId);
          }
        }
      }
    }
    if (hasMyLock) {
      if (!this.codeSectionSnapshots.has(handle.id)) {
        this.codeSectionSnapshots.set(handle.id, this.unifiedContent);
      }
      // Restaurer le pending sur chaque entité verrouillée (pour que hasPendingCode = true)
      for (const entityId of this.activeEntityLocks) {
        if (!this.collab.isLocalPending(entityId)) this.collab.addLocalPending(entityId);
      }
    }

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
    this.cursorEntityId.set(null);
    // Les verrous sont libérés par publishCodeEdit/cancelCodeEdit avant exitFocusMode
    // On nettoie uniquement si on sort sans publish/cancel (ex: destruction du composant)
    this.activeEntityLocks.clear();

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

  // Vrai si la barre Annuler/Partager doit s'afficher en mode Code.
  // Avec des verrous granulaires : visible seulement si le curseur est dans l'entité verrouillée.
  // Sans verrou granulaire : comportement classique (section entière verrouillée).
  get hasPendingCode(): boolean {
    if (!this.focusedHandle) return false;
    if (this.activeEntityLocks.size > 0) {
      // Afficher la barre uniquement si le curseur est dans l'une des entités verrouillées
      const entityId = this.cursorEntityId();
      return entityId != null && this.activeEntityLocks.has(entityId);
    }
    // Ne pas activer la barre Code pour un pending issu uniquement du mode Structure
    const hId = this.focusedHandle.id;
    return this.collab.localPendingSections().has(hId) && !this.structEntityLocks.has(hId);
  }

  // Barre Annuler/Partager mode Code — réservée aux projets avec sauvegarde externe.
  // En mode focus : selon hasPendingCode (curseur dans l'entité verrouillée).
  // En vue document (pas de focus) : dès qu'une entité est verrouillée par l'édition courante.
  get showCodePublishBar(): boolean {
    if (!this.backupType || this.mode !== 'edit') return false;
    if (this.focusedHandle) return this.hasPendingCode;
    return this.activeEntityLocks.size > 0;
  }

  // Barre Annuler/Partager persistante en modes Structure et Preview quand des modifications
  // Code non publiées existent (section verrouillée en attente d'un Partager ou Annuler).
  get showCrossModePendingBar(): boolean {
    if (!this.backupType || this.mode === 'edit') return false;
    const pending = this.collab.localPendingSections();
    if (pending.size === 0) return false;
    for (const id of pending) {
      if (!this.structEntityLocks.has(id)) return true;
    }
    return false;
  }

  // IDs des sections avec pending Code (hors structure) — utilisés pour publish/cancel cross-mode.
  private get crossModePendingIds(): string[] {
    return [...this.collab.localPendingSections()].filter(id => !this.structEntityLocks.has(id));
  }

  // Sections visu filtrées selon la sélection active (null = tout afficher)
  // Les sections avec modifications locales en attente (localPendingSections) sont toujours
  // incluses, même si la navigation pointe vers une autre section — ainsi le DOM de la section
  // modifiée n'est jamais détruit et son badge/cadenas reste visible jusqu'à Partager ou Annuler.
  get filteredVisuSections(): VisuSectionState[] {
    if (!this.activeNodeId) return this.visuSections;
    const node = this.findNode(this.activeNodeId, this.files);
    if (!node) return this.visuSections;

    if (node.type === 'folder') {
      // Dossier → section sélectionnée + toutes les sous-sections enfants
      const visible = this.getDescendantFolderIds(this.activeNodeId, this.files);
      if (visible.size === 0) return this.visuSections;
      // Conserver les sections avec modifications en attente pour éviter la destruction du DOM
      const pending = this.collab.localPendingSections();
      return this.visuSections.filter(vs => visible.has(vs.sectionId) || pending.has(vs.sectionId));
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
  private fileVisuPreviewCache: { fileId: string; rawContent: string; thumbKey: string; html: string; name: string } | null = null;

  // Preview standalone d'un document texte (lecture seule)
  get singleFileVisuPreview(): { name: string; html: string } | null {
    if (!this.activeNodeId) return null;
    const node = this.findNode(this.activeNodeId, this.files);
    if (!node || node.type !== 'file') return null;
    if (this.isImageFile(node.name)) return null;
    if (node.name === 'contenu.md') return null;

    const content = node.content || '';
    const thumbKey = this.megaOutilInstances.filter(i => i.thumbnailData).map(i => `${i.id}:${i.thumbnailData!.length}`).join(',');
    if (this.fileVisuPreviewCache
        && this.fileVisuPreviewCache.fileId === node.id
        && this.fileVisuPreviewCache.rawContent === content
        && this.fileVisuPreviewCache.thumbKey === thumbKey) {
      return { name: this.fileVisuPreviewCache.name, html: this.fileVisuPreviewCache.html };
    }

    // Remplacer les marqueurs {{IMG:id|caption|align|width}} par <figure> HTML brut
    const previewImgTokens: { token: string; html: string }[] = [];
    const processed = content.replace(/\{\{IMG:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/gi, (_m: string, id: string, cap: string, align: string, width: string) => {
      const token = `@@PI${previewImgTokens.length}@@`;
      previewImgTokens.push({
        token,
        html: this.renderImageMarkerHtml(id, (cap || '').trim(), align || '', width || '')
      });
      return `\n\n${token}\n\n`;
    });

    // Remplacer les marqueurs {{MOCKUP:id|caption|align|width}} par le thumbnail ou un placeholder
    const previewMockupTokens: { token: string; html: string }[] = [];
    const processedWithMockups = processed.replace(/\{\{MOCKUP:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/gi, (_m: string, id: string, cap: string, align: string, width: string) => {
      const token = `@@PM${previewMockupTokens.length}@@`;
      const html = this.renderMockupMarkerHtml(id, (cap || '').trim(), align || '', width || '');
      previewMockupTokens.push({ token, html });
      return `\n\n${token}\n\n`;
    });

    let html = marked.parse(processedWithMockups, { async: false }) as string;
    for (const ph of previewImgTokens) {
      const wrapped = new RegExp(`<p>\\s*${ph.token}\\s*</p>`, 'g');
      html = html.replace(wrapped, ph.html).replace(ph.token, ph.html);
    }
    for (const ph of previewMockupTokens) {
      const wrapped = new RegExp(`<p>\\s*${ph.token}\\s*</p>`, 'g');
      html = html.replace(wrapped, ph.html).replace(ph.token, ph.html);
    }
    const name = node.name.replace(/\.md$/, '');
    this.fileVisuPreviewCache = { fileId: node.id, rawContent: content, thumbKey, html, name };
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
    // F1 — détection slash command
    this.updateSlashMenu(ta);
    if (!this.localDirty) {
      this.localDirty = true;
      this.dirtyChange.emit(true);
    }
    // Capturer le snapshot de la section pour permettre le Cancel — persistant à travers les navigations
    if (this.focusedHandle && !this.codeSectionSnapshots.has(this.focusedHandle.id)) {
      this.codeSectionSnapshots.set(this.focusedHandle.id, this.lastSavedContent);
    }
    // Édition au niveau document (pas de mode focus) : capturer le snapshot pré-édition
    // pour permettre "Annuler" sur les projets avec sauvegarde externe.
    if (!this.focusedHandle && this.codeDocSnapshot === null) {
      this.codeDocSnapshot = this.lastSavedContent;
    }
    const entity = this.getCursorEntity();
    // Mettre à jour le signal de position pour hasPendingCode (barre Annuler/Partager contextuelle)
    this.cursorEntityId.set(entity?.id ?? this.focusedHandle?.id ?? null);
    if (entity) {
      this.modifiedEntities.set(entity.id, entity.folderId);
      // État de partage/verrou : uniquement pour les projets avec sauvegarde externe.
      // Les projets locaux s'auto-sauvegardent sans étape de publication → pas de pending/lock.
      if (this.backupType) {
        // Marquer uniquement l'entité précise comme pending + verrouiller
        // → le dossier parent n'apparaît PAS comme verrouillé dans la zone 3
        if (!this.activeEntityLocks.has(entity.id)) {
          this.activeEntityLocks.add(entity.id);
          this.collab.addLocalPending(entity.id);
          if (this.projectName) this.collab.lockNode(this.projectName, entity.id).catch(() => {});
        }
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
    } else if (this.focusedHandle) {
      // Fichier direct (pas de ## Section header) : getCursorEntity retourne null
      // → fallback sur focusedHandle.id qui est le fileId lui-même
      const hId = this.focusedHandle.id;
      this.modifiedEntities.set(hId, hId);
      if (this.backupType) {
        if (!this.activeEntityLocks.has(hId)) {
          this.activeEntityLocks.add(hId);
          this.collab.addLocalPending(hId);
          if (this.projectName) this.collab.lockNode(this.projectName, hId).catch(() => {});
        }
        const node = this.findNode(hId, this.files);
        this.collab.upsertPending({
          entityId: hId,
          label: `Modification de texte — «${node?.name || hId}»`,
          username: this.authSvc.currentUser()?.username || 'Vous',
          timestamp: new Date().toISOString(),
          state: 'editing'
        });
      }
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
        this.cursorEntityId.set(fr.fileId);
        this.nodeActive.emit(fr.fileId);
        return;
      }
    }
    // Priorité 2 : bloc inline (tableau, citation, code, liste) → emit blockId virtuel
    for (const r of this.inlineBlockRanges) {
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        this.suppressScrollOnNextActiveChange = true;
        this.cursorEntityId.set(r.id);
        this.nodeActive.emit(r.id);
        return;
      }
    }
    // Priorité 3 : section/dossier
    for (let i = this.sectionRanges.length - 1; i >= 0; i--) {
      const r = this.sectionRanges[i];
      if (lineIdx >= r.lineStart && lineIdx <= r.lineEnd) {
        this.suppressScrollOnNextActiveChange = true;
        this.cursorEntityId.set(r.folderId);
        this.nodeActive.emit(r.folderId);
        return;
      }
    }
    this.cursorEntityId.set(null);
  }

  onTextareaBlur() {
    this.saveAll();
    // Fermer le slash menu sur blur (avec léger délai pour permettre le clic sur le menu)
    setTimeout(() => this.hideSlashMenu(), 150);
  }

  // ── F1 — Slash command menu ──────────────────────────────────
  onTextareaKeydown(ev: KeyboardEvent) {
    if (!this.slashMenuState.visible) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); this.slashMenuRef?.moveNext(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.slashMenuRef?.movePrev(); }
    else if (ev.key === 'Enter')   { ev.preventDefault(); this.slashMenuRef?.selectActive(); }
    else if (ev.key === 'Escape')  { ev.preventDefault(); this.hideSlashMenu(); }
  }

  private updateSlashMenu(ta: HTMLTextAreaElement) {
    const pos = ta.selectionStart;
    const val = ta.value;
    // Cherche le `/` le plus proche en amont, sans franchir d'espace ni de retour ligne
    let slashIdx = -1;
    for (let i = pos - 1; i >= 0; i--) {
      const ch = val[i];
      if (ch === '/') { slashIdx = i; break; }
      if (/\s/.test(ch)) break;
    }
    if (slashIdx === -1) { this.hideSlashMenu(); return; }
    // Le `/` doit être en début de ligne OU précédé d'un espace
    const prev = slashIdx > 0 ? val[slashIdx - 1] : '\n';
    if (prev !== '\n' && !/\s/.test(prev)) { this.hideSlashMenu(); return; }
    // La query est ce qui est entre le / et le curseur (max 20 chars)
    const query = val.substring(slashIdx + 1, pos);
    if (query.length > 20) { this.hideSlashMenu(); return; }

    // Calculer la position du menu (sous le curseur)
    const coords = this.getCaretCoordinates(ta, pos);
    this.slashMenuState = {
      visible: true,
      top: coords.top - ta.scrollTop + 22,
      left: coords.left - ta.scrollLeft,
      query,
      anchorPos: slashIdx
    };
  }

  hideSlashMenu() {
    if (this.slashMenuState.visible) {
      this.slashMenuState = { ...this.slashMenuState, visible: false, query: '', anchorPos: -1 };
    }
  }

  onSlashCommandSelect(cmd: SlashCommand) {
    const ta = this.textareaRef?.nativeElement;
    if (!ta || this.slashMenuState.anchorPos < 0) { this.hideSlashMenu(); return; }
    const anchor = this.slashMenuState.anchorPos;
    const queryEnd = anchor + 1 + this.slashMenuState.query.length;
    this.hideSlashMenu();
    // Cas spécial : image → déclencher l'upload via input file
    if (cmd.id === 'image') {
      // Retirer le `/...` saisi
      const newVal = ta.value.substring(0, anchor) + ta.value.substring(queryEnd);
      ta.value = newVal;
      this.unifiedContent = newVal;
      ta.selectionStart = ta.selectionEnd = anchor;
      this.recomputeAll();
      this.scheduleSave();
      // Trouver la section courante pour ouvrir l'upload image
      const entity = this.getCursorEntity();
      const sectionId = entity?.folderId || this.docSections[0]?.folderId;
      if (sectionId) this.triggerVisuImageUpload(sectionId);
      return;
    }
    // Insérer le snippet correspondant
    const { snippet, cursorOffset } = this.snippetForCommand(cmd.id);
    const before = ta.value.substring(0, anchor);
    const after = ta.value.substring(queryEnd);
    // S'assurer que le snippet commence par un newline si on n'est pas en début de ligne
    const needsLead = anchor > 0 && before[before.length - 1] !== '\n';
    const lead = needsLead ? '\n' : '';
    const newVal = before + lead + snippet + after;
    ta.value = newVal;
    this.unifiedContent = newVal;
    const newPos = anchor + lead.length + (cursorOffset ?? snippet.length);
    ta.selectionStart = ta.selectionEnd = newPos;
    ta.focus();
    this.recomputeAll();
    this.scheduleSave();
    if (!this.localDirty) { this.localDirty = true; this.dirtyChange.emit(true); }
  }

  private snippetForCommand(id: string): { snippet: string; cursorOffset?: number } {
    switch (id) {
      case 'callout-info':    return { snippet: `> [!INFO] Titre\n> Contenu\n`,    cursorOffset: 10 };
      case 'callout-warning': return { snippet: `> [!WARNING] Titre\n> Contenu\n`, cursorOffset: 13 };
      case 'callout-success': return { snippet: `> [!SUCCESS] Titre\n> Contenu\n`, cursorOffset: 13 };
      case 'callout-danger':  return { snippet: `> [!DANGER] Titre\n> Contenu\n`,  cursorOffset: 12 };
      case 'table':           return { snippet: `| Col 1 | Col 2 |\n|-------|-------|\n|       |       |\n`, cursorOffset: 2 };
      case 'code':            return { snippet: '```\n\n```\n', cursorOffset: 4 };
      case 'quote':           return { snippet: `> Citation\n`, cursorOffset: 2 };
      case 'list':            return { snippet: `- Item 1\n- Item 2\n`, cursorOffset: 2 };
      case 'numbered':        return { snippet: `1. Item 1\n2. Item 2\n`, cursorOffset: 3 };
      default:                return { snippet: '' };
    }
  }

  // Calcule la position pixel du caret dans une textarea via un mirror DOM
  private getCaretCoordinates(ta: HTMLTextAreaElement, pos: number): { top: number; left: number } {
    const mirror = document.createElement('div');
    const style = window.getComputedStyle(ta);
    const props: (keyof CSSStyleDeclaration)[] = [
      'boxSizing','width','height','overflowX','overflowY','borderTopWidth','borderRightWidth',
      'borderBottomWidth','borderLeftWidth','paddingTop','paddingRight','paddingBottom','paddingLeft',
      'fontStyle','fontVariant','fontWeight','fontStretch','fontSize','fontSizeAdjust','lineHeight',
      'fontFamily','textAlign','textTransform','textIndent','textDecoration','letterSpacing','wordSpacing','tabSize'
    ];
    for (const p of props) (mirror.style as any)[p] = (style as any)[p];
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.textContent = ta.value.substring(0, pos);
    const span = document.createElement('span');
    span.textContent = ta.value.substring(pos) || '.';
    mirror.appendChild(span);
    document.body.appendChild(mirror);
    const rect = ta.getBoundingClientRect();
    const parentRect = (ta.parentElement as HTMLElement).getBoundingClientRect();
    const top = span.offsetTop + (rect.top - parentRect.top);
    const left = span.offsetLeft + (rect.left - parentRect.left);
    document.body.removeChild(mirror);
    return { top, left };
  }

  // Force une sauvegarde immédiate (bouton "Non sauvegardé" cliqué)
  forceSave() {
    clearTimeout(this.saveTimeout);
    this.unfoldAll(); // dépli obligatoire avant sauvegarde manuelle
    this.saveAll();
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

  public flushContentModifications(filterSectionId?: string) {
    if (this.modifiedEntities.size === 0) return;
    const currentSections = this.parseContent();
    const lines = this.unifiedContent.split('\n');
    const updatedFolderIds = new Set<string>();
    for (const [entityId, folderId] of this.modifiedEntities) {
      // Si un filtre de section est fourni, ne traiter que les entités de cette section
      if (filterSectionId && folderId !== filterSectionId && entityId !== filterSectionId) continue;
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
    // Supprimer uniquement les entités traitées (filtrées par section si applicable)
    if (filterSectionId) {
      for (const [entityId, folderId] of this.modifiedEntities) {
        if (folderId === filterSectionId || entityId === filterSectionId) {
          this.modifiedEntities.delete(entityId);
        }
      }
    } else {
      this.modifiedEntities.clear();
    }
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
    this.saveTimeout = setTimeout(() => this.saveAll(), 2000);
  }

  private saveAll() {
    if (this.unifiedContent === this.lastSavedContent) {
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
        
        const imgRegex = /\{\{IMG:([a-zA-Z0-9._-]+)(?:\|[^}]*)?\}\}/gi;
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
      const imageRegex = /\{\{IMG:([a-zA-Z0-9._-]+)(?:\|[^}]*)?\}\}/gi;
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
  // ── Mega-outils : popup config + insertion d'un Trello au curseur ──────────

  openTrelloPopup() {
    this.trelloName = 'Mon Trello';
    this.showTrelloPopup.set(true);
  }

  cancelTrelloPopup() {
    this.showTrelloPopup.set(false);
  }

  async confirmTrelloPopup() {
    const name = (this.trelloName || '').trim() || 'Mon Trello';
    if (!this.projectName) return;
    const folderId = this.getCursorEntity()?.folderId || this.activeNodeId || undefined;
    this.trelloCreating.set(true);
    try {
      const inst = await this.megaOutilsSvc.createInstance({
        type: 'trello',
        name,
        projectId: this.projectName,
        outilId: this.activeOutilId || undefined,
        folderId
      });
      this.showTrelloPopup.set(false);
      this.megaOutilCreated.emit(inst);
    } catch (e) {
      console.error('[EditorZone] création Trello échouée:', e);
    } finally {
      this.trelloCreating.set(false);
    }
  }

  async deleteTrelloInstance(id: string) {
    try {
      await this.megaOutilsSvc.deleteInstance(id);
      this.removeTrelloMarkerFromContent(id);
      this.megaOutilDeleted.emit(id);
    } catch (e) {
      console.error('[EditorZone] suppression Trello échouée:', e);
    }
  }

  // Shortcode Trello dans le contenu : {{TRELLO:<id>}}
  private static readonly TRELLO_MARKER_SRC  = '\\{\\{TRELLO:([a-zA-Z0-9-]+)\\}\\}';
  private static readonly MOCKUP_MARKER_SRC  = '\\{\\{MOCKUP:([a-zA-Z0-9-]+)(?:\\|[^}]*)?\\}\\}';

  /** Nom d'une instance à partir de son id. */
  trelloInstanceName(id: string): string {
    return this.megaOutilInstances.find(i => i.id === id)?.name || 'Mon Trello';
  }

  mockupInstanceName(id: string): string {
    return this.megaOutilInstances.find(i => i.id === id)?.name || 'Mon Mockup';
  }

  mockupInstanceThumbnail(id: string): string | undefined {
    return this.megaOutilInstances.find(i => i.id === id)?.thumbnailData;
  }

  mockupIdFromMarker(marker: string): string {
    const m = /\{\{MOCKUP:([a-zA-Z0-9-]+)(?:\|[^}]*)?\}\}/.exec(marker);
    return m ? m[1] : '';
  }

  openMockupPopup() {
    this.mockupName = 'Mon Mockup';
    this.mockupNameError.set('');
    this.showMockupPopup.set(true);
  }

  cancelMockupPopup() { this.showMockupPopup.set(false); this.mockupNameError.set(''); }

  async confirmMockupPopup() {
    const name = (this.mockupName || '').trim() || 'Mon Mockup';
    if (!this.projectName) return;
    const exists = this.megaOutilInstances.some(i => i.type === 'mockup' && i.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      this.mockupNameError.set(`Un mockup "${name}" existe déjà.`);
      return;
    }
    this.mockupNameError.set('');
    const folderId = this.getCursorEntity()?.folderId || this.activeNodeId || undefined;
    this.mockupCreating.set(true);
    try {
      const inst = await this.megaOutilsSvc.createInstance({
        type: 'mockup',
        name,
        projectId: this.projectName,
        outilId: this.activeOutilId || undefined,
        folderId
      });
      if (folderId) {
        this.insertMockupMarkerInSection(folderId, inst.id);
      } else {
        this.insertAt(`\n\n{{MOCKUP:${inst.id}}}\n\n`, '');
      }
      this.showMockupPopup.set(false);
      this.megaOutilCreated.emit(inst);
      // Recharger le diagramme si l'onglet est actif
      if (this.mockupListTab() === 'diagram') {
        this.mockupDiagLoaded = false;
        await this.loadMockupDiagram();
      }
    } catch (e) {
      console.error('[EditorZone] création Mockup échouée:', e);
    } finally {
      this.mockupCreating.set(false);
    }
  }

  async deleteMockupInstance(id: string) {
    try {
      await this.megaOutilsSvc.deleteInstance(id);
      this.removeMockupMarkerFromContent(id);
      this.megaOutilDeleted.emit(id);
    } catch (e) {
      console.error('[EditorZone] suppression Mockup échouée:', e);
    }
  }

  private insertMockupMarkerInSection(folderId: string, instId: string) {
    const marker = `{{MOCKUP:${instId}}}`;
    // Guard : ne jamais insérer un marqueur déjà présent
    const fullContent = this.focusedHandle ? (this.fullContentBackup || this.unifiedContent) : this.unifiedContent;
    if (fullContent.includes(marker)) return;
    const range = this.sectionRanges.find(r => r.folderId === folderId);
    if (!range) {
      this.insertAt(`\n\n${marker}\n\n`, '');
      return;
    }
    const lines = this.unifiedContent.split('\n');
    lines.splice(range.lineStart + 1, 0, '', marker);
    this.unifiedContent = lines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeRanges();
    this.recomputeMirrorLines();
    this.scheduleSave();
  }

  private repairMissingMockupMarkers() {
    let needsSave = false;
    for (const inst of this.mockupInstances) {
      if (!inst.folderId) continue;
      const marker = `{{MOCKUP:${inst.id}}}`;
      const fullContent = this.focusedHandle ? this.fullContentBackup : this.unifiedContent;
      if (fullContent.includes(marker)) continue;
      // Marqueur absent — injection dans la section cible
      if (this.focusedHandle) {
        if (this.focusedHandle.id !== inst.folderId) continue;
        const lines = this.unifiedContent.split('\n');
        lines.splice(1, 0, '', marker);
        this.unifiedContent = lines.join('\n');
        const ta = this.textareaRef?.nativeElement;
        if (ta) ta.value = this.unifiedContent;
      } else {
        const range = this.sectionRanges.find(r => r.folderId === inst.folderId);
        if (!range) continue;
        const lines = this.unifiedContent.split('\n');
        lines.splice(range.lineStart + 1, 0, '', marker);
        this.unifiedContent = lines.join('\n');
        const ta = this.textareaRef?.nativeElement;
        if (ta) ta.value = this.unifiedContent;
        this.recomputeRanges();
      }
      needsSave = true;
    }
    if (needsSave) {
      this.recomputeMirrorLines();
      this.scheduleSave();
    }
  }

  private removeMockupMarkerFromContent(id: string) {
    const re = new RegExp('\n*\{\{MOCKUP:' + id + '\\}\\}\\n*', 'g');
    if (!re.test(this.unifiedContent)) return;
    this.unifiedContent = this.unifiedContent.replace(re, '\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeRanges();
  }

  /** Masque les shortcodes {{TRELLO:id}} du HTML affiché en Preview. */
  private stripTrelloMarkers(html: string): string {
    return html.replace(new RegExp('(<p>\\s*)?' + ProjetEditorZoneComponent.TRELLO_MARKER_SRC + '(\\s*</p>)?', 'g'), '');
  }

  /** Réinjecte les shortcodes Trello perdus lors de l'édition contenteditable. */
  private preserveTrelloMarkers(newMd: string, mdBefore: string): string {
    const re = new RegExp(ProjetEditorZoneComponent.TRELLO_MARKER_SRC, 'g');
    const markers = (mdBefore || '').match(re) || [];
    if (!markers.length) return newMd;
    const cleaned = newMd.replace(re, '').replace(/\n{3,}/g, '\n\n').trimEnd();
    return cleaned + '\n\n' + markers.join('\n\n');
  }

  /** Supprime le shortcode d'une instance du contenu et sauvegarde. */
  private removeTrelloMarkerFromContent(id: string) {
    const re = new RegExp('\\n*\\{\\{TRELLO:' + id + '\\}\\}\\n*', 'g');
    if (!re.test(this.unifiedContent)) return;
    this.unifiedContent = this.unifiedContent.replace(re, '\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeRanges();
    this.recomputeMirrorLines();
    if (this.mode === 'visu') this.buildVisuSections();
    this.scheduleSave();
  }

  /** Supprime tous les marqueurs {{TRELLO:...}} du contenu (y compris corrompus sur plusieurs lignes). */
  private stripTrelloMarkersFromUnifiedContent(): boolean {
    if (!/\{\{TRELLO:[^}]*\}\}/g.test(this.unifiedContent)) return false;
    this.unifiedContent = this.unifiedContent
      .replace(/\n*\{\{TRELLO:[^}]*\}\}\n*/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    return true;
  }

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
    this.isUploading.set(true);
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
      const snapshotBeforeImageSave = this.lastSavedContent;
      this.saveAll();
      // saveAll() reset localDirty à false — on le remet à true car l'image n'est pas
      // encore pushée : l'utilisateur doit cliquer "Partager" pour que les autres la reçoivent.
      this.localDirty = true;
      this.dirtyChange.emit(true);
      // Activer la barre "Modifications en cours" pour la section focusée (mode edit)
      // — uniquement pour les projets avec sauvegarde externe.
      if (this.backupType && this.focusedHandle && !this.collab.isLocalPending(this.focusedHandle.id)) {
        if (!this.codeSectionSnapshots.has(this.focusedHandle.id)) {
          this.codeSectionSnapshots.set(this.focusedHandle.id, snapshotBeforeImageSave);
        }
        this.collab.addLocalPending(this.focusedHandle.id);
        if (this.projectName && !this.activeEntityLocks.has(this.focusedHandle.id)) {
          this.activeEntityLocks.add(this.focusedHandle.id);
          this.collab.lockNode(this.projectName, this.focusedHandle.id).catch(() => {});
        }
      }
      this.refresh.emit();
    } catch (e: any) {
      this.imageUploadError = e?.error?.error || 'Erreur lors de l\'upload.';
    } finally {
      this.isUploading.set(false);
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

  // Appelé quand une <img> ne charge pas (fichier absent ou 0 octet)
  onImgError(event: Event, imageId?: string): void {
    (event.target as HTMLImageElement).style.display = 'none';
    if (imageId) {
      this.brokenImages = new Set(this.brokenImages).add(imageId);
    }
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
    // Stocker la suppression en attente — exécutée au Partager, annulable via Annuler
    const imgNode = this.allImages.find(im => im.id === line.imageId);
    const sectionId = this.focusedHandle?.id ?? '';
    if (imgNode) {
      this.pendingVisuDeletions.set(line.imageId, { node: imgNode, sectionId });
    }
    this.deleteConfirmImageId = null;
    this.hoverPreview = null;
    // Retire l'image de la liste locale pour éviter l'affichage "manquante"
    this.allImages = this.allImages.filter(im => im.id !== line.imageId);
    // Retire la ligne du marqueur dans unifiedContent
    const lines = this.unifiedContent.split('\n');
    lines.splice(line.lineIndex, 1);
    this.unifiedContent = lines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeRanges();
    this.recomputeMirrorLines();
    // Snapshot AVANT delete pour que Annuler puisse restaurer le marqueur
    const snapshotBeforeDelete = this.lastSavedContent;
    this.saveAll();
    // saveAll() remet localDirty à false — on le remet à true car la suppression
    // n'est pas encore effective : l'utilisateur doit cliquer "Partager".
    this.localDirty = true;
    this.dirtyChange.emit(true);
    if (this.backupType && this.focusedHandle && !this.collab.isLocalPending(this.focusedHandle.id)) {
      if (!this.codeSectionSnapshots.has(this.focusedHandle.id)) {
        this.codeSectionSnapshots.set(this.focusedHandle.id, snapshotBeforeDelete);
      }
      this.collab.addLocalPending(this.focusedHandle.id);
      if (this.projectName && !this.activeEntityLocks.has(this.focusedHandle.id)) {
        this.activeEntityLocks.add(this.focusedHandle.id);
        this.collab.lockNode(this.projectName, this.focusedHandle.id).catch(() => {});
      }
    }
    this.refresh.emit();
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
    if (!/^\{\{IMG:[a-zA-Z0-9._-]+(?:\|[^}]*)?\}\}/i.test(marker.trim())) return;

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
      const escaped = imgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const findRe = new RegExp(`\\{\\{IMG:${escaped}(?:\\|[^}]*)?\\}\\}`, 'i');
      const wrongSections = this.docSections.filter(
        s => s.folderId !== correctParentId && findRe.test(s.textContent)
      );
      const correctSection = this.docSections.find(s => s.folderId === correctParentId);
      const alreadyCorrect = !!correctSection && findRe.test(correctSection.textContent);

      if (wrongSections.length === 0 && alreadyCorrect) continue;

      // Capture le marqueur existant (avec ses props éventuelles) avant déplacement
      let existingMarker: string | null = null;
      for (const s of wrongSections) {
        const m = findRe.exec(s.textContent);
        if (m) { existingMarker = m[0]; break; }
      }
      if (!existingMarker && correctSection) {
        const m = findRe.exec(correctSection.textContent);
        if (m) existingMarker = m[0];
      }
      const marker = existingMarker || `{{IMG:${imgId}}}`;

      const re = new RegExp(`\\n?\\{\\{IMG:${escaped}(?:\\|[^}]*)?\\}\\}\\n?`, 'gi');
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
      // Traiter les {{IMG:...|caption|align|width}} à l'intérieur du bloc avant marked.parse
      const blockImgTokens: { token: string; html: string }[] = [];
      let processedContent = rawContent.replace(/\{\{IMG:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/gi, (__: string, id: string, cap: string, align: string, width: string) => {
        const token = `@@BI${blockImgTokens.length}@@`;
        blockImgTokens.push({
          token,
          html: this.renderImageMarkerHtml(id, (cap || '').trim(), align || '', width || '')
        });
        return `\n\n${token}\n\n`;
      });
      let inner = marked.parse(processedContent, { async: false }) as string;
      for (const ph of blockImgTokens) {
        const wrapped = new RegExp(`<p>\\s*${ph.token}\\s*</p>`, 'g');
        inner = inner.replace(wrapped, ph.html).replace(ph.token, ph.html);
      }
      const token = `@@FB${fileBlocks.length}@@`;
      const encoded = btoa(unescape(encodeURIComponent(mdSource)));
      fileBlocks.push({
        token,
        html: `<div class="visu-file" contenteditable="false" data-block-md="${encoded}"><div class="visu-file__title">${this.escapeHtml(trimmed)}</div>${inner}</div>`,
        md: mdSource,
      });
      return `\n\n${token}\n\n`;
    });

    // Remplacer les images (placeholders) — supporte {{IMG:id|caption|align|width}}
    const imgTokens: { token: string; html: string }[] = [];
    contentMd = contentMd.replace(/\{\{IMG:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/gi, (_m, id, cap, align, width) => {
      const token = `@@IM${imgTokens.length}@@`;
      imgTokens.push({
        token,
        html: this.renderImageMarkerHtml(id, (cap || '').trim(), align || '', width || '', { withDeleteBar: true })
      });
      return `\n\n${token}\n\n`;
    });

    // Pré-traitement marqueurs {{MOCKUP:id|caption|align|width}} → thumbnail SVG ou placeholder
    const mockupTokens: { token: string; html: string }[] = [];
    contentMd = contentMd.replace(/\{\{MOCKUP:([a-z0-9-]+)(?:\|([^|}]*))?(?:\|([^|}]*))?(?:\|([^|}]*))?\}\}/gi, (_m: string, id: string, cap: string, align: string, width: string) => {
      const token = `@@MK${mockupTokens.length}@@`;
      const html = this.renderMockupMarkerHtml(id, (cap || '').trim(), align || '', width || '');
      mockupTokens.push({ token, html });
      return `\n\n${token}\n\n`;
    });

    // F2 — Pré-traitement callouts
    const calloutRes = this.processCallouts(contentMd);
    contentMd = calloutRes.md;

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
    for (const co of calloutRes.tokens) {
      html = html.replace(new RegExp(`<p>\\s*${co.token}\\s*</p>`, 'g'), co.html).replace(co.token, co.html);
    }
    for (const mk of mockupTokens) {
      html = html.replace(new RegExp(`<p>\\s*${mk.token}\\s*</p>`, 'g'), mk.html).replace(mk.token, mk.html);
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
      if (!sec) return;
      if (this.dirtyVisuSectionIds.has(sec.sectionId)) {
        // Section avec modifs en attente : réinjecter uniquement si vide (nouvelle instance DOM)
        // pour ne pas écraser le contenu en cours de frappe
        if (!el.innerHTML.trim()) {
          el.innerHTML = this.stripTrelloMarkers(this.parseVisuMd(sec.markdownBefore));
        }
      } else {
        el.innerHTML = this.stripTrelloMarkers(sec.contentHtml);
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
    // Projets locaux : pas d'étape de partage → édition libre, auto-sauvegarde au blur,
    // sans verrou ni état "en cours d'édition".
    if (!this.backupType) return;
    // Acquérir le lock et noter qu'on édite cette section
    if (this.projectName && this.editingVisuSectionId() !== sectionId) {
      // Capturer le snapshot original uniquement si pas déjà capturé (évite l'écrasement au retour sur une section dirty)
      const vs = this.visuSections.find(v => v.sectionId === sectionId);
      if (vs && !this.visuSectionLockSnapshot.has(sectionId)) {
        this.visuSectionLockSnapshot.set(sectionId, vs.markdownBefore);
      }
      this.editingVisuSectionId.set(sectionId);
      this.collab.lockNode(this.projectName, sectionId).catch(() => {});
    }
  }

  onVisuSectionBlur(sectionId: string) {
    // Sauvegarder localement (sans publier) mais conserver le lock ET l'état dirty
    // → la section reste bloquée (badge + cadenas menu) jusqu'à Partager ou Annuler
    if (this.dirtyVisuSectionIds.has(sectionId)) {
      const idx = this.visuSections.findIndex(vs => vs.sectionId === sectionId);
      const el = idx >= 0 ? this.visuSectionEls.get(idx)?.nativeElement : null;
      if (el) {
        const md = this.htmlSectionToMarkdown(el);
        const sec = this.visuSections[idx];
        this.saveVisuSection(sectionId, md, sec?.markdownBefore ?? '');
        // Ne PAS supprimer de dirtyVisuSectionIds — la section reste en attente
      }
    }
    // NE PAS libérer le lock ici — l'utilisateur doit cliquer Partager ou Annuler
  }

  async publishVisuSection(sectionId: string): Promise<void> {
    this.isPublishing.set(true);
    const idx = this.visuSections.findIndex(vs => vs.sectionId === sectionId);
    const el = idx >= 0 ? this.visuSectionEls.get(idx)?.nativeElement : null;
    const snapshot = this.sectionFileSnapshot.get(sectionId);

    const sec = this.visuSections[idx];
    const newMd = el ? this.htmlSectionToMarkdown(el) : (sec?.markdownBefore ?? '');
    const mdBefore = this.visuSectionLockSnapshot.get(sectionId) ?? '';

    // Mettre à jour unifiedContent puis annuler le debounce
    this.saveVisuSection(sectionId, newMd, mdBefore, true);
    clearTimeout(this.saveTimeout);
    this.lastSavedContent = this.unifiedContent;

    // Publier : POST avec publish=true → SSE broadcast + unlock côté serveur
    if (snapshot?.fileId && this.projectName) {
      try {
        await this.svc.updateFile(this.projectName, snapshot.fileId, newMd, sectionId, true);
      } catch (e: any) {
        console.warn('[Publish] erreur lors de la publication:', e);
        const msg = e?.error?.pushFailed
          ? 'Sauvegardé localement — synchronisation GitHub échouée'
          : 'Erreur lors du partage des modifications';
        this.showPublishErrorToast(msg);
        this.isPublishing.set(false);
        return;
      }
    } else if (this.projectName) {
      await this.collab.unlockNode(this.projectName, sectionId).catch(() => {});
    }

    // Exécuter les suppressions d'images différées pour cette section
    const pendingDelIds = [...this.pendingVisuDeletions.entries()]
      .filter(([, v]) => v.sectionId === sectionId)
      .map(([id]) => id);
    await Promise.all(pendingDelIds.map(id =>
      this.svc.deleteFile(this.projectName, id).catch(() => {})
    ));
    pendingDelIds.forEach(id => this.pendingVisuDeletions.delete(id));

    this.dirtyVisuSectionIds.delete(sectionId);
    this.visuSectionLockSnapshot.delete(sectionId);
    this.collab.removeLocalPending(sectionId);
    if (this.editingVisuSectionId() === sectionId) this.editingVisuSectionId.set(null);
    this.localDirty = this.dirtyVisuSectionIds.size > 0;
    this.dirtyChange.emit(this.localDirty);
    this.showPublishToast();
    const secName = this.visuSections.find(v => v.sectionId === sectionId)?.folderName || sectionId;
    this.woHistory.track({
      section: 'projets/fichiers',
      actionType: 'update',
      label: `Publication section «${secName}»`,
      entityType: 'section',
      entityId: sectionId,
      context: { projectId: this.projectName },
      undoable: false
    }).catch(() => {});
    this.isPublishing.set(false);
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

    // Restaurer les images dont la suppression est annulée pour cette section
    const toRestore = [...this.pendingVisuDeletions.entries()]
      .filter(([, v]) => v.sectionId === sectionId);
    toRestore.forEach(([imgId, { node }]) => {
      this.allImages = [...this.allImages, node];
      this.pendingVisuDeletions.delete(imgId);
    });

    this.dirtyVisuSectionIds.delete(sectionId);
    this.visuSectionLockSnapshot.delete(sectionId);
    this.collab.removeLocalPending(sectionId);
    this.collab.clearPending(sectionId);
    if (this.editingVisuSectionId() === sectionId) this.editingVisuSectionId.set(null);
    this.localDirty = this.dirtyVisuSectionIds.size > 0;
    this.dirtyChange.emit(this.localDirty);
  }

  // ── Mode Code : Annuler / Partager ──────────────────────────
  async cancelCodeEdit(): Promise<void> {
    if (!this.focusedHandle) {
      // Cas cross-mode (Structure/Preview) : restaurer les sections depuis codeSectionSnapshots.
      const ids = this.crossModePendingIds;
      if (ids.length > 0 && this.codeSectionSnapshots.size > 0) {
        let restored = this.unifiedContent;
        for (const [sectionId, originalContent] of this.codeSectionSnapshots) {
          const range = this.sectionRanges.find(r => r.folderId === sectionId);
          if (!range) continue;
          const lines = restored.split('\n');
          const headingLine = lines[range.lineStart];
          let directEnd = range.lineEnd;
          for (let j = range.lineStart + 1; j <= range.lineEnd; j++) {
            if (/^#{1,4} /.test(lines[j])) { directEnd = j - 1; break; }
          }
          const origLines = originalContent.split('\n').slice(1); // skip heading
          restored = [
            ...lines.slice(0, range.lineStart),
            headingLine,
            ...origLines,
            ...lines.slice(directEnd + 1)
          ].join('\n');
        }
        this.unifiedContent = restored;
        const ta = this.textareaRef?.nativeElement;
        if (ta) ta.value = restored;
        clearTimeout(this.saveTimeout);
        this.lastSavedContent = restored;
        this.recomputeAll();
        this.saveAll();
        for (const id of ids) {
          this.collab.clearPending(id);
          this.collab.removeLocalPending(id);
          if (this.projectName) this.collab.unlockNode(this.projectName, id).catch(() => {});
        }
        this.codeSectionSnapshots.clear();
        this.codeDocSnapshot = null;
        this.modifiedEntities.clear();
        this.localDirty = false;
        this.dirtyChange.emit(false);
        return;
      }
      // Annulation en vue document sans focus (snapshot doc entier) : restaurer le snapshot pré-édition.
      if (this.codeDocSnapshot === null) return;
      const snap = this.codeDocSnapshot;
      this.unifiedContent = snap;
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = snap;
      clearTimeout(this.saveTimeout);
      this.lastSavedContent = snap;
      this.recomputeAll();
      this.saveAll();
      for (const id of [...this.activeEntityLocks]) {
        this.collab.clearPending(id);
        this.collab.removeLocalPending(id);
        if (this.projectName) this.collab.unlockNode(this.projectName, id).catch(() => {});
      }
      this.activeEntityLocks.clear();
      this.modifiedEntities.clear();
      this.cursorEntityId.set(null);
      this.codeDocSnapshot = null;
      this.localDirty = false;
      this.dirtyChange.emit(false);
      return;
    }
    const sectionId = this.focusedHandle.id;
    const entityId = this.cursorEntityId();
    if (!entityId || !this.activeEntityLocks.has(entityId)) return;

    const snapshot = this.codeSectionSnapshots.get(sectionId) ?? this.lastSavedContent;

    // ── Restauration granulaire : uniquement la partie de l'entité annulée ──
    const origLines = snapshot.split('\n');
    const origHeading = origLines[0] ?? '';
    const { textContent: origMain, blocks: origBlocks } = this.parseAdditionalBlocks(origLines.slice(1).join('\n'));

    const currLines = this.unifiedContent.split('\n');
    const currHeading = currLines[0] ?? '';
    const { textContent: currMain, blocks: currBlocks } = this.parseAdditionalBlocks(currLines.slice(1).join('\n'));

    let newMain = currMain;
    const newBlocks = currBlocks.map(b => ({ ...b }));

    const fileNode = entityId !== sectionId ? this.findNode(entityId, this.files) : null;
    if (!fileNode) {
      // Contenu principal du dossier (ou bloc inline) → restaurer le main content
      newMain = origMain;
    } else {
      // Bloc fichier additionnel → restaurer uniquement ce bloc
      const slugName = this.slugify(fileNode.name.replace(/\.md$/, ''));
      const origIdx = origBlocks.findIndex(b => this.slugify(b.title) === slugName);
      const currIdx = newBlocks.findIndex(b => this.slugify(b.title) === slugName);
      if (origIdx >= 0 && currIdx >= 0) {
        newBlocks[currIdx] = { ...newBlocks[currIdx], title: origBlocks[origIdx].title, content: origBlocks[origIdx].content };
      }
    }

    // Reconstruire le contenu avec la partie restaurée + les autres parties intactes
    const parts: string[] = [];
    if (newMain.trim()) parts.push(newMain.trim());
    for (const b of newBlocks) {
      parts.push(`${b.delimiter}${b.title}\n${b.content}\n${b.delimiter}`);
    }
    const newContent = currHeading + (parts.length ? '\n' + parts.join('\n\n') : '');

    // Restaurer les images annulées pour cette section
    const toRestore = [...this.pendingVisuDeletions.entries()]
      .filter(([, v]) => v.sectionId === sectionId);
    toRestore.forEach(([imgId, { node }]) => {
      this.allImages = [...this.allImages, node];
      this.pendingVisuDeletions.delete(imgId);
    });

    this.unifiedContent = newContent;
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = newContent;
    clearTimeout(this.saveTimeout);
    this.lastSavedContent = newContent;
    this.recomputeAll();
    this.saveAll();

    // Déverrouiller uniquement cette entité
    this.collab.clearPending(entityId);
    this.collab.removeLocalPending(entityId);
    if (this.projectName) this.collab.unlockNode(this.projectName, entityId).catch(() => {});
    this.activeEntityLocks.delete(entityId);
    for (const [eid] of this.modifiedEntities) {
      if (eid === entityId) this.modifiedEntities.delete(eid);
    }
    this.cursorEntityId.set(null);

    // Si plus aucun verrou → nettoyage complet
    if (this.activeEntityLocks.size === 0) {
      this.collab.removeLocalPending(sectionId);
      this.codeSectionSnapshots.delete(sectionId);
      this.localDirty = false;
      this.dirtyChange.emit(false);
    }
  }

  async publishCodeEdit(): Promise<void> {
    if (!this.projectName) return;
    // Cas cross-mode (Structure/Preview) : des sections Code pending existent sans mode focus actif.
    if (!this.focusedHandle && this.activeEntityLocks.size === 0) {
      const ids = this.crossModePendingIds;
      if (ids.length === 0) return;
      this.isPublishing.set(true);
      clearTimeout(this.saveTimeout);
      this.flushContentModifications();
      const sections = this.parseContent();
      try {
        await Promise.all(
          sections
            .filter(s => s.fileId && s.folderId && ids.includes(s.folderId))
            .map(s => this.svc.updateFile(this.projectName, s.fileId!, s.content, s.folderId ?? undefined, true))
        );
        this.lastSavedContent = this.unifiedContent;
        this.localDirty = false;
        this.dirtyChange.emit(false);
        this.codeSectionSnapshots.clear();
        this.codeDocSnapshot = null;
        for (const id of ids) {
          this.collab.removeLocalPending(id);
          if (this.projectName) this.collab.unlockNode(this.projectName, id).catch(() => {});
        }
        this.showPublishToast();
        this.woHistory.track({
          section: 'projets/fichiers',
          actionType: 'update',
          label: 'Publication des modifications en attente',
          entityType: 'section',
          entityId: ids[0] || this.projectName,
          context: { projectId: this.projectName },
          undoable: false
        }).catch(() => {});
      } catch (e: any) {
        console.warn('[PublishCode cross-mode] erreur:', e);
        const msg = e?.error?.pushFailed
          ? 'Sauvegardé localement — synchronisation échouée'
          : 'Erreur lors du partage des modifications';
        this.showPublishErrorToast(msg);
      } finally {
        this.isPublishing.set(false);
      }
      return;
    }
    // Mode focus : section ciblée. Vue document : au moins une entité verrouillée par l'édition.
    if (!this.focusedHandle && this.activeEntityLocks.size === 0) return;
    this.isPublishing.set(true);
    // En vue document (pas de focus), sectionId vide → flushContentModifications traite TOUTES
    // les entités modifiées (le filtre falsy est ignoré).
    const sectionId = this.focusedHandle?.id ?? '';
    clearTimeout(this.saveTimeout);
    // Flusher l'historique de CETTE section AVANT unfoldAll (ranges encore valides en mode focus)
    this.flushContentModifications(sectionId);
    this.unfoldAll();
    // Reconstruire le document complet si on est en mode focus (sinon parseContent ne retrouve
    // pas le folderId des sous-sections faute de contexte hiérarchique → fileId = null → aucun fichier écrit)
    let contentToParse: string;
    if (this.focusedHandle) {
      const focusedLines = this.unifiedContent.split('\n');
      const fullLines = this.fullContentBackup.split('\n');
      fullLines.splice(this.focusedLineStart, this.focusedOriginalLineCount, ...focusedLines);
      this.focusedOriginalLineCount = focusedLines.length;
      this.fullContentBackup = fullLines.join('\n');
      contentToParse = this.fullContentBackup;
    } else {
      contentToParse = this.unifiedContent;
    }
    const savedContent = this.unifiedContent;
    this.unifiedContent = contentToParse;
    const sections = this.parseContent();
    this.unifiedContent = savedContent;
    try {
      await Promise.all(
        sections
          .filter(s => s.fileId)
          .map(s => this.svc.updateFile(this.projectName, s.fileId!, s.content, s.folderId ?? undefined, true))
      );
      this.lastSavedContent = this.unifiedContent;
      this.localDirty = false;
      this.dirtyChange.emit(false);

      // Exécuter les suppressions d'images différées pour cette section
      const pendingDelIds = [...this.pendingVisuDeletions.entries()]
        .filter(([, v]) => v.sectionId === sectionId)
        .map(([id]) => id);
      await Promise.all(pendingDelIds.map(id =>
        this.svc.deleteFile(this.projectName, id).catch(() => {})
      ));
      pendingDelIds.forEach(id => this.pendingVisuDeletions.delete(id));

      // Section partagée : retirer du pending + libérer les verrous granulaires
      this.codeSectionSnapshots.delete(sectionId);
      this.codeDocSnapshot = null;
      for (const entityId of this.activeEntityLocks) this.collab.removeLocalPending(entityId);
      this.collab.removeLocalPending(sectionId);
      if (this.projectName) {
        const toUnlock = this.activeEntityLocks.size > 0 ? [...this.activeEntityLocks] : [sectionId];
        await Promise.all(toUnlock.map(id => this.collab.unlockNode(this.projectName, id).catch(() => {})));
        this.activeEntityLocks.clear();
      }
      this.showPublishToast();
      this.woHistory.track({
        section: 'projets/fichiers',
        actionType: 'update',
        label: `Publication ${this.focusedHandle ? `section «${this.focusedHandle.label || sectionId}»` : 'du document'}`,
        entityType: 'section',
        entityId: sectionId || this.projectName,
        context: { projectId: this.projectName },
        undoable: false
      }).catch(() => {});
    } catch (e: any) {
      console.warn('[PublishCode] erreur:', e);
      const msg = e?.error?.pushFailed
        ? 'Sauvegardé localement — synchronisation GitHub échouée'
        : 'Erreur lors du partage des modifications';
      this.showPublishErrorToast(msg);
    } finally {
      this.isPublishing.set(false);
    }
  }

  private showPublishToast(): void {
    this.publishToastVisible.set(true);
    setTimeout(() => this.publishToastVisible.set(false), 3000);
  }

  private showPublishErrorToast(msg: string): void {
    this.publishErrorMessage.set(msg);
    this.publishErrorToastVisible.set(true);
    setTimeout(() => this.publishErrorToastVisible.set(false), 6000);
  }

  onVisuSectionInput(sectionId: string) {
    this.dirtyVisuSectionIds.add(sectionId);
    // État de partage/pending : uniquement pour les projets avec sauvegarde externe.
    if (this.backupType) {
      this.collab.addLocalPending(sectionId);
      // Afficher une entrée grisée dans le panneau historique dès la première frappe
      if (!this.collab.pending().some(e => e.entityId === sectionId)) {
        const node = this.findNode(sectionId, this.files);
        this.collab.upsertPending({
          entityId: sectionId,
          label: `Modification visu — «${node?.name || sectionId}»`,
          username: this.authSvc.currentUser()?.username || 'Vous',
          timestamp: new Date().toISOString(),
          state: 'editing'
        });
      }
    }
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
  private saveVisuSection(sectionId: string, newMd: string, mdBefore: string, trackHistory = false) {
    const range = this.sectionRanges.find(r => r.folderId === sectionId);
    if (!range) return;

    // Les shortcodes Trello sont masqués dans le contenteditable → les réinjecter
    newMd = this.preserveTrelloMarkers(newMd, mdBefore);

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
    if (trackHistory) {
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
    }

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
      const id = el.getAttribute('data-img-id') || '';
      const caption = el.getAttribute('data-img-caption') || '';
      const align = el.getAttribute('data-img-align') || '';
      const width = el.getAttribute('data-img-width') || '';
      return `\n${this.buildImageMarker({ id, caption, alignment: align, width })}\n`;
    }
    if (el.hasAttribute('data-mockup-id')) {
      const id = el.getAttribute('data-mockup-id') || '';
      const caption = el.getAttribute('data-mockup-caption') || '';
      const align = el.getAttribute('data-mockup-align') || '';
      const width = el.getAttribute('data-mockup-width') || '';
      return `\n${this.buildMockupMarker({ id, caption, alignment: align, width })}\n`;
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
    // F6 — Bouton bulle commentaires
    const commentBtn = target.closest('.visu-comment-btn') as HTMLElement | null;
    if (commentBtn) {
      ev.stopPropagation();
      const folderId = commentBtn.getAttribute('data-folder-id') || '';
      const folderName = commentBtn.getAttribute('data-folder-name') || '';
      if (folderId) this.commentRequest.emit({ folderId, folderName });
      return;
    }
    // Bouton suppression image
    const delBtn = target.closest('.visu-img-del') as HTMLElement | null;
    if (delBtn) {
      const imgId = delBtn.getAttribute('data-img-id');
      if (imgId) this.deleteVisuImage(imgId);
      return;
    }
    // F5 — clic sur une figure image : ouvrir le panneau de propriétés
    const fig = target.closest('.visu-figure') as HTMLElement | null;
    if (fig && fig.hasAttribute('data-img-id')) {
      ev.stopPropagation();
      this.openImagePropsPanel(fig);
      return;
    }
    // Bouton "Modifier le mockup" (lien vers l'édition du mockup)
    const openBtn = target.closest('[data-mockup-open]') as HTMLElement | null;
    if (openBtn) {
      ev.stopPropagation();
      this.selectMockupFromMarker(openBtn.getAttribute('data-mockup-open') || '');
      return;
    }
    // Clic sur un mockup : ouvrir le panneau de propriétés
    const mkFig = target.closest('[data-mockup-id]') as HTMLElement | null;
    if (mkFig) {
      ev.stopPropagation();
      this.openMockupPropsPanel(mkFig);
      return;
    }
    // Fermer le panneau si clic ailleurs
    if (this.imagePropsPanel.visible && !target.closest('.img-props-panel')) {
      this.closeImagePropsPanel();
    }
  }

  // F5 — Panneau de propriétés d'image
  openImagePropsPanel(figEl: HTMLElement) {
    const id = figEl.getAttribute('data-img-id') || '';
    const caption = figEl.getAttribute('data-img-caption') || '';
    const alignment = (figEl.getAttribute('data-img-align') || '') as '' | 'left' | 'center' | 'right';
    const width = figEl.getAttribute('data-img-width') || '';
    const rect = figEl.getBoundingClientRect();
    const container = this.visuRef?.nativeElement;
    const containerRect = container?.getBoundingClientRect();
    const top = (containerRect ? rect.bottom - containerRect.top : rect.bottom) + (container?.scrollTop || 0) + 8;
    const left = (containerRect ? rect.left - containerRect.left : rect.left) + 12;
    this.imagePropsPanel = { visible: true, imageId: id, kind: 'image', caption, alignment, width, top, left };
  }

  openMockupPropsPanel(el: HTMLElement) {
    const id = el.getAttribute('data-mockup-id') || '';
    const caption = el.getAttribute('data-mockup-caption') || '';
    const alignment = (el.getAttribute('data-mockup-align') || '') as '' | 'left' | 'center' | 'right';
    const width = el.getAttribute('data-mockup-width') || '';
    const rect = el.getBoundingClientRect();
    const container = this.visuRef?.nativeElement;
    const containerRect = container?.getBoundingClientRect();
    const top = (containerRect ? rect.bottom - containerRect.top : rect.bottom) + (container?.scrollTop || 0) + 8;
    const left = (containerRect ? rect.left - containerRect.left : rect.left) + 12;
    this.imagePropsPanel = { visible: true, imageId: id, kind: 'mockup', caption, alignment, width, top, left };
  }

  closeImagePropsPanel() {
    this.imagePropsPanel = { ...this.imagePropsPanel, visible: false };
  }

  onImagePropsChange(evt: { imageId: string; props: ImageProps }) {
    if (this.imagePropsPanel.kind === 'mockup') {
      this.applyMockupPropsToMarker(evt.imageId, evt.props);
    } else {
      this.applyImagePropsToMarker(evt.imageId, evt.props);
    }
  }

  onImagePropsDelete(imageId: string) {
    const id = imageId || this.imagePropsPanel.imageId;
    const kind = this.imagePropsPanel.kind;
    this.closeImagePropsPanel();
    if (kind === 'mockup') {
      this.removeVisuMockupMarker(id);
    } else {
      this.deleteVisuImage(id);
    }
  }

  private applyImagePropsToMarker(imageId: string, props: ImageProps) {
    if (!imageId) return;
    const escaped = imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\{\\{IMG:${escaped}(?:\\|[^}]*)?\\}\\}`, 'gi');
    const newMarker = this.buildImageMarker({ id: imageId, caption: props.caption, alignment: props.alignment, width: props.width });
    const before = this.unifiedContent;
    const after = before.replace(re, newMarker);
    if (after === before) return;
    this.unifiedContent = after;
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = after;
    // Mettre à jour les data-attr sur le panneau (state local)
    this.imagePropsPanel = { ...this.imagePropsPanel, caption: props.caption, alignment: props.alignment, width: props.width };
    this.recomputeAll();
    this.saveAll();
  }

  private applyMockupPropsToMarker(mockupId: string, props: ImageProps) {
    if (!mockupId) return;
    const escaped = mockupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\{\\{MOCKUP:${escaped}(?:\\|[^}]*)?\\}\\}`, 'gi');
    const newMarker = this.buildMockupMarker({ id: mockupId, caption: props.caption, alignment: props.alignment, width: props.width });
    const before = this.unifiedContent;
    const after = before.replace(re, newMarker);
    if (after === before) return;
    this.unifiedContent = after;
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = after;
    this.imagePropsPanel = { ...this.imagePropsPanel, caption: props.caption, alignment: props.alignment, width: props.width };
    this.recomputeAll();
    this.saveAll();
  }

  private removeVisuMockupMarker(mockupId: string) {
    if (!mockupId) return;
    const escaped = mockupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\n*\\{\\{MOCKUP:${escaped}(?:\\|[^}]*)?\\}\\}\n*`, 'gi');
    const before = this.unifiedContent;
    const after = before.replace(re, '\n').replace(/\n{3,}/g, '\n\n');
    if (after === before) return;
    this.unifiedContent = after;
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = after;
    this.recomputeAll();
    this.saveAll();
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
        // saveAll() reset localDirty à false — on le remet à true car l'image n'est pas
        // encore pushée : l'utilisateur doit cliquer "Partager" pour que les autres la reçoivent.
        this.dirtyVisuSectionIds.add(sectionId);
        this.localDirty = true;
        this.dirtyChange.emit(true);
        // Activer la barre "Modifications en cours" (mode visu) — projets backup uniquement
        if (this.backupType) {
          if (!this.visuSectionLockSnapshot.has(sectionId)) {
            const vs = this.visuSections.find(v => v.sectionId === sectionId);
            if (vs) this.visuSectionLockSnapshot.set(sectionId, vs.markdownBefore);
          }
          if (!this.editingVisuSectionId()) {
            this.editingVisuSectionId.set(sectionId);
          }
          this.collab.addLocalPending(sectionId);
          if (this.projectName) {
            this.collab.lockNode(this.projectName, sectionId).catch(() => {});
          }
        }
        this.refresh.emit();
        setTimeout(() => this.initVisuSectionHtml(), 80);
      }
    } catch (e: any) {
      this.imageUploadError = e?.error?.error || 'Erreur lors de l\'upload.';
    }
  }

  private deleteVisuImage(imgId: string) {
    // Capturer le dossier parent AVANT le refresh (files encore à jour)
    const parentFolder = this.findParentFolder(imgId, this.files);
    const sectionId = parentFolder?.id ?? null;

    // Stocker la suppression en attente — exécutée au Partager, annulable via Annuler
    const imgNode = this.allImages.find(im => im.id === imgId);
    if (imgNode) {
      this.pendingVisuDeletions.set(imgId, { node: imgNode, sectionId: sectionId ?? '' });
    }

    // Retrait local de allImages pour éviter affichage "manquante"
    this.allImages = this.allImages.filter(im => im.id !== imgId);
    // Retirer le marqueur de unifiedContent
    const lines = this.unifiedContent.split('\n');
    const idx = lines.findIndex(l => {
      const t = l.trim();
      const m = /^\{\{IMG:([a-z0-9-]+)(?:\|[^}]*)?\}\}$/i.exec(t);
      return !!m && m[1] === imgId;
    });
    if (idx !== -1) lines.splice(idx, 1);
    this.unifiedContent = lines.join('\n');
    const ta = this.textareaRef?.nativeElement;
    if (ta) ta.value = this.unifiedContent;
    this.recomputeAll();
    this.saveAll();
    // saveAll() remet localDirty à false — on le remet à true car la suppression
    // n'est pas encore effective : l'utilisateur doit cliquer "Partager".
    if (sectionId) {
      this.dirtyVisuSectionIds.add(sectionId);
      this.localDirty = true;
      this.dirtyChange.emit(true);
      if (this.backupType) {
        if (!this.visuSectionLockSnapshot.has(sectionId)) {
          const vs = this.visuSections.find(v => v.sectionId === sectionId);
          if (vs) this.visuSectionLockSnapshot.set(sectionId, vs.markdownBefore);
        }
        if (!this.editingVisuSectionId()) this.editingVisuSectionId.set(sectionId);
        this.collab.addLocalPending(sectionId);
        if (this.projectName) this.collab.lockNode(this.projectName, sectionId).catch(() => {});
      }
    }
    setTimeout(() => this.initVisuSectionHtml(), 80);
  }

  // ── Mode Structure ──────────────────────────────────────────

  get filteredStructureNodes(): StructureNode[] {
    if (!this.activeNodeId) return this.structureNodes;
    const node = this.findNode(this.activeNodeId, this.files);
    if (!node) return this.structureNodes;

    if (node.type === 'folder') {
      const visible = this.getDescendantFolderIds(this.activeNodeId, this.files);
      if (visible.size === 0) return this.structureNodes;
      return this.structureNodes.filter(n => n.folderId && visible.has(n.folderId));
    }

    if (node.type === 'file' && !this.isImageFile(node.name)) {
      const parent = this.findParentFolder(this.activeNodeId, this.files);
      if (!parent) return [];
      return this.structureNodes.filter(n => n.folderId === parent.id);
    }

    return [];
  }

  // Indique si le textContent principal d'une carte doit être affiché
  structNodeShowText(node: StructureNode): boolean {
    if (!this.activeNodeId) return true;
    const fileNode = this.findNode(this.activeNodeId, this.files);
    if (!fileNode || fileNode.type !== 'file' || this.isImageFile(fileNode.name)) return true;
    const parent = this.findParentFolder(this.activeNodeId, this.files);
    if (!parent || parent.id !== node.folderId) return true;
    // Fichier principal → afficher le texte, masquer les blocs
    return fileNode.name === 'contenu.md' || !node.additionalBlocks.length;
  }

  // Indique si un bloc additionnel donné doit être affiché
  structNodeShowBlock(node: StructureNode, block: StructureAdditionalBlock): boolean {
    if (!this.activeNodeId) return true;
    const fileNode = this.findNode(this.activeNodeId, this.files);
    if (!fileNode || fileNode.type !== 'file' || this.isImageFile(fileNode.name)) return true;
    const parent = this.findParentFolder(this.activeNodeId, this.files);
    if (!parent || parent.id !== node.folderId) return true;
    if (fileNode.name === 'contenu.md') return false;
    return this.slugify(block.title) === this.slugify(fileNode.name.replace(/\.md$/, ''));
  }

  private parseAdditionalBlocks(raw: string): { textContent: string; blocks: StructureAdditionalBlock[] } {
    const blockRe = /^(['`^])([^\n]+)\n([\s\S]*?)\n\1$/gm;
    const blocks: StructureAdditionalBlock[] = [];
    let idx = 0;
    const textContent = raw.replace(blockRe, (_match, delim, title, content) => {
      blocks.push({ id: `blk-${idx++}`, delimiter: delim, title: title.trim(), content: content.trimEnd() });
      return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { textContent, blocks };
  }

  parseStructureNodes(): StructureNode[] {
    const lines = this.unifiedContent.split('\n');
    const nodes: StructureNode[] = [];
    const headingRe = /^(#{1,4}) (.+)$/;

    let currentLevel = 0;
    let currentTitle = '';
    let currentLineStart = -1;
    let contentLines: string[] = [];

    const pushNode = (lineEnd: number) => {
      if (currentLineStart < 0) return;
      const raw = contentLines.join('\n').replace(/^\n+|\n+$/g, '');
      const { textContent: tc0, blocks } = this.parseAdditionalBlocks(raw);
      // Extraire les marqueurs Trello pour les masquer dans la textarea Structure
      const trelloMarkers: string[] = [];
      const trelloRe = new RegExp(ProjetEditorZoneComponent.TRELLO_MARKER_SRC, 'g');
      let tm: RegExpExecArray | null;
      while ((tm = trelloRe.exec(tc0)) !== null) trelloMarkers.push(tm[0]);
      // textContent conserve les marqueurs Mockup pour affichage inline en mode Structure
      const textContent = tc0
        .replace(new RegExp(ProjetEditorZoneComponent.TRELLO_MARKER_SRC, 'g'), '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      // Extraire les IDs mockup (pour référence ; marqueurs déjà dans textContent)
      const mockupMarkers: string[] = [];
      const mockupRe = new RegExp(ProjetEditorZoneComponent.MOCKUP_MARKER_SRC, 'g');
      let mm: RegExpExecArray | null;
      while ((mm = mockupRe.exec(textContent)) !== null) mockupMarkers.push(mm[0]);
      const folderId = this.sectionRanges.find(r => r.lineStart === currentLineStart)?.folderId ?? null;
      nodes.push({
        id: `struct-${currentLineStart}`,
        level: currentLevel,
        title: currentTitle,
        textContent,
        additionalBlocks: blocks,
        trelloMarkers,
        mockupMarkers,
        lineStart: currentLineStart,
        lineEnd: lineEnd,
        folderId,
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const m = headingRe.exec(lines[i]);
      if (m) {
        pushNode(i - 1);
        currentLevel = m[1].length;
        currentTitle = m[2].trim();
        currentLineStart = i;
        contentLines = [];
      } else if (currentLineStart >= 0) {
        contentLines.push(lines[i]);
      }
    }
    pushNode(lines.length - 1);

    return nodes;
  }

  private rebuildNodeRawContent(node: StructureNode): string {
    const parts: string[] = [];
    if (node.textContent.trim()) parts.push(node.textContent.trim());
    for (const b of node.additionalBlocks) {
      parts.push(`${b.delimiter}${b.title}\n${b.content}\n${b.delimiter}`);
    }
    // Ré-injecter les marqueurs Trello extraits (masqués en Structure)
    for (const m of node.trelloMarkers || []) parts.push(m);
    // Marqueurs Mockup sont dans textContent → ne pas ré-injecter
    return parts.join('\n\n');
  }

  flushStructureNodes(): void {
    if (!this.structureNodes.length) return;
    const parts: string[] = [];
    for (const node of this.structureNodes) {
      const hashes = '#'.repeat(node.level);
      const content = this.rebuildNodeRawContent(node);
      parts.push(`${hashes} ${node.title || 'Sans titre'}${content ? '\n' + content : ''}`);
    }
    const newContent = parts.join('\n\n');
    if (newContent !== this.unifiedContent) {
      this.unifiedContent = newContent;
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = newContent;
      this.lastSavedContent = '';
      this.scheduleSave();
    }
  }

  private scheduleStructFlush(): void {
    clearTimeout(this.structFlushTimeout);
    this.structFlushTimeout = setTimeout(() => this.flushStructureNodes(), 800);
  }

  onStructTitleInput(node: StructureNode, event: Event): void {
    this.applyStructLock(node.folderId ?? '');
    node.title = (event.target as HTMLInputElement).value;
    this.scheduleStructFlush();
  }

  onStructTitleBlur(node: StructureNode, event: FocusEvent): void {
    if (!node.title.trim()) {
      const lines = this.unifiedContent.split('\n');
      const m = /^(#{1,4}) (.+)$/.exec(lines[node.lineStart] ?? '');
      if (m) {
        node.title = m[2].trim();
        (event.target as HTMLInputElement).value = node.title;
      } else {
        node.title = 'Sans titre';
        (event.target as HTMLInputElement).value = node.title;
      }
    }
    clearTimeout(this.structFlushTimeout);
    this.flushStructureNodes();
  }

  onStructContentInput(node: StructureNode, event: Event): void {
    this.applyStructLock(node.folderId ?? '');
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    node.textContent = ta.value;
    this.scheduleStructFlush();
  }

  onStructBlockTitleInput(node: StructureNode, block: StructureAdditionalBlock, event: Event): void {
    this.applyStructLock(this.getStructBlockEntityId(node, block));
    block.title = (event.target as HTMLInputElement).value;
    this.scheduleStructFlush();
  }

  onStructBlockContentInput(node: StructureNode, block: StructureAdditionalBlock, event: Event): void {
    this.applyStructLock(this.getStructBlockEntityId(node, block));
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    block.content = ta.value;
    this.scheduleStructFlush();
  }

  getStructContentRows(node: StructureNode): number {
    return Math.max(2, Math.min(node.textContent.split('\n').length + 1, 25));
  }

  getStructBodySegments(textContent: string): Array<{ type: 'text' | 'mockup'; value: string; mockupId: string }> {
    const lines = textContent.split('\n');
    const result: Array<{ type: 'text' | 'mockup'; value: string; mockupId: string }> = [];
    const textBuf: string[] = [];
    for (const line of lines) {
      const m = /^\{\{MOCKUP:([a-zA-Z0-9-]+)(?:\|[^}]*)?\}\}\s*$/.exec(line.trim());
      if (m) {
        result.push({ type: 'text', value: textBuf.join('\n'), mockupId: '' });
        textBuf.length = 0;
        result.push({ type: 'mockup', value: line.trim(), mockupId: m[1] });
      } else {
        textBuf.push(line);
      }
    }
    result.push({ type: 'text', value: textBuf.join('\n'), mockupId: '' });
    return result;
  }

  getStructSegmentRows(value: string): number {
    return Math.max(1, Math.min(value.split('\n').length + 1, 25));
  }

  onStructSegmentInput(node: StructureNode, segIdx: number, event: Event): void {
    this.applyStructLock(node.folderId ?? '');
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    const segs = this.getStructBodySegments(node.textContent);
    if (segIdx < segs.length) segs[segIdx].value = ta.value;
    node.textContent = segs.map(s => s.value).join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n');
    this.scheduleStructFlush();
  }

  getStructBlockRows(block: StructureAdditionalBlock): number {
    return Math.max(2, Math.min(block.content.split('\n').length + 1, 25));
  }

  openStructContextMenu(node: StructureNode, event: MouseEvent): void {
    event.preventDefault();
    this.structContextMenu = { visible: true, node, x: event.clientX, y: event.clientY };
  }

  closeStructContextMenu(): void {
    if (this.structContextMenu.visible) {
      this.structContextMenu = { ...this.structContextMenu, visible: false };
    }
  }

  structureDeleteSection(node: StructureNode): void {
    this.structureNodes = this.structureNodes.filter(n => n.id !== node.id);
    this.closeStructContextMenu();
    this.flushStructureNodes();
  }

  // ── Collab mode Structure ───────────────────────────────────

  // Retourne le fileId d'un bloc additionnel (ou le folderId en fallback)
  private getStructBlockEntityId(node: StructureNode, block: StructureAdditionalBlock): string {
    const folderNode = node.folderId ? this.findNode(node.folderId, this.files) : null;
    const additionalFiles = (folderNode?.children || []).filter(c =>
      c.type === 'file' && !this.isImageFile(c.name) && c.name !== 'contenu.md'
    );
    const fileNode = additionalFiles.find(f =>
      this.slugify(f.name.replace(/\.md$/, '')) === this.slugify(block.title)
    );
    return fileNode?.id ?? node.folderId ?? '';
  }

  // Verrouille une entité en mode structure (première fois seulement) et trace l'entité active
  private applyStructLock(entityId: string): void {
    if (!entityId) return;

    // Toujours mettre à jour l'entité courante (pour que Annuler cible la bonne)
    this.structFocusedEntityId.set(entityId);

    // Capturer le snapshot AVANT la première modification de cette entité
    if (!this.structEntitySnapshots.has(entityId)) {
      const folderNode = this.structureNodes.find(n => n.folderId === entityId);
      if (folderNode) {
        this.structEntitySnapshots.set(entityId, {
          type: 'folder',
          folderId: entityId,
          title: folderNode.title,
          textContent: folderNode.textContent
        });
      } else {
        // Chercher parmi les blocs additionnels
        outer: for (const node of this.structureNodes) {
          for (const block of node.additionalBlocks) {
            if (this.getStructBlockEntityId(node, block) === entityId) {
              this.structEntitySnapshots.set(entityId, {
                type: 'block',
                folderId: node.folderId ?? '',
                blockId: block.id,
                title: block.title,
                textContent: block.content
              });
              break outer;
            }
          }
        }
      }
    }

    // État de partage/verrou : uniquement pour les projets avec sauvegarde externe.
    if (!this.backupType) return;
    if (this.structEntityLocks.has(entityId)) return;
    // Vérifier que l'entité n'est pas verrouillée par un autre user
    if (this.collab.isLockedByOther(entityId)) return;
    this.structEntityLocks.add(entityId);
    this.collab.addLocalPending(entityId);
    if (this.projectName) this.collab.lockNode(this.projectName, entityId).catch(() => {});
    this.structureHasPending.set(true);
  }

  async publishStructureEdit(): Promise<void> {
    if (!this.projectName) return;
    this.isPublishing.set(true);
    clearTimeout(this.structFlushTimeout);
    this.flushStructureNodes();
    clearTimeout(this.saveTimeout);
    this.lastSavedContent = this.unifiedContent;

    const sections = this.parseContent();
    try {
      await Promise.all(
        sections
          .filter(s => s.fileId)
          .map(s => this.svc.updateFile(this.projectName, s.fileId!, s.content, s.folderId ?? undefined, true))
      );
      // Déverrouiller toutes les entités structure
      for (const entityId of this.structEntityLocks) {
        this.collab.removeLocalPending(entityId);
        await this.collab.unlockNode(this.projectName, entityId).catch(() => {});
      }
      this.structEntityLocks.clear();
      this.structEntitySnapshots.clear();
      this.structureHasPending.set(false);
      this.structFocusedEntityId.set(null);
      this.showPublishToast();
    } catch (e: any) {
      const msg = e?.error?.pushFailed
        ? 'Sauvegardé localement — synchronisation GitHub échouée'
        : 'Erreur lors du partage des modifications';
      this.showPublishErrorToast(msg);
    } finally {
      this.isPublishing.set(false);
    }
  }

  async cancelStructureEdit(): Promise<void> {
    const entityId = this.structFocusedEntityId();
    if (!entityId) return;
    const snapshot = this.structEntitySnapshots.get(entityId);
    if (!snapshot) return;

    clearTimeout(this.structFlushTimeout);

    // Restaurer uniquement les données de l'entité annulée dans structureNodes
    if (snapshot.type === 'folder') {
      const node = this.structureNodes.find(n => n.folderId === snapshot.folderId);
      if (node) {
        node.title = snapshot.title;
        node.textContent = snapshot.textContent;
      }
    } else {
      const node = this.structureNodes.find(n => n.folderId === snapshot.folderId);
      if (node) {
        const block = node.additionalBlocks.find(b => b.id === snapshot.blockId);
        if (block) {
          block.title = snapshot.title;
          block.content = snapshot.textContent;
        }
      }
    }

    // Re-flush les nodes modifiés → unifiedContent + textarea mis à jour
    this.flushStructureNodes();
    clearTimeout(this.saveTimeout);
    this.lastSavedContent = this.unifiedContent;
    this.saveAll();
    this.recomputeAll();
    this.structureNodes = this.parseStructureNodes();

    // Déverrouiller uniquement cette entité
    this.collab.removeLocalPending(entityId);
    this.collab.clearPending(entityId);
    if (this.projectName) this.collab.unlockNode(this.projectName, entityId).catch(() => {});
    this.structEntityLocks.delete(entityId);
    this.structEntitySnapshots.delete(entityId);

    // Mettre à jour l'état global
    if (this.structEntityLocks.size === 0) {
      this.structureHasPending.set(false);
      this.structFocusedEntityId.set(null);
      this.localDirty = false;
      this.dirtyChange.emit(false);
    } else {
      // D'autres entités restent verrouillées — pointer vers la dernière ajoutée
      const remaining = [...this.structEntityLocks];
      this.structFocusedEntityId.set(remaining[remaining.length - 1]);
    }
  }

  // ── Barre MO ─────────────────────────────────────────────────────────────────

  toggleMoType(type: 'trello' | 'mockup') {
    this.moActiveType.update(cur => cur === type ? null : type);
  }

  scrollMoLeft() {
    this.moInstanceListRef?.nativeElement.scrollBy({ left: -200, behavior: 'smooth' });
  }

  scrollMoRight() {
    this.moInstanceListRef?.nativeElement.scrollBy({ left: 200, behavior: 'smooth' });
  }

  /** Ouvre le popup de sélection de mockup à lier dans la section courante. */
  insertMockupLiaison() {
    this.liaisonCursorPos = this.textareaRef?.nativeElement?.selectionStart ?? -1;
    this.showMockupLiaisonPopup.set(true);
  }

  /** Insère le marqueur du mockup sélectionné à la position du curseur (ou en début de section). */
  confirmMockupLiaison(inst: MegaOutilInstance) {
    this.showMockupLiaisonPopup.set(false);
    const marker = `{{MOCKUP:${inst.id}}}`;
    const ta = this.textareaRef?.nativeElement;
    const content = this.unifiedContent;
    if (content.includes(`{{MOCKUP:${inst.id}`)) return;
    if (ta && this.liaisonCursorPos >= 0) {
      // Insertion à la position du curseur, sur sa propre ligne
      const pos = this.liaisonCursorPos;
      const lineEnd = content.indexOf('\n', pos);
      const insertAfter = lineEnd === -1 ? content.length : lineEnd;
      const before = content.substring(0, insertAfter);
      const after = content.substring(insertAfter);
      const sep = after.startsWith('\n') ? '' : '\n';
      this.unifiedContent = before + '\n' + marker + sep + after;
      ta.value = this.unifiedContent;
    } else {
      const folderId = this.focusedHandle?.id ?? this.activeNodeId ?? null;
      if (folderId) this.insertMockupMarkerInSection(folderId, inst.id);
      else return;
    }
    this.recomputeRanges();
    this.recomputeMirrorLines();
    this.scheduleSave();
    this.liaisonCursorPos = -1;
  }

  /** Active un mockup depuis un clic sur sa card dans le miroir / preview, et scrolle vers son board. */
  selectMockupFromMarker(instId: string) {
    if (!instId) return;
    const inst = this.megaOutilInstances.find(i => i.id === instId);
    if (inst) this.selectMegaOutil(inst);
    // Expand le panel mockup et scrolle vers le board correspondant
    if (this.contentMockupIds.includes(instId)) {
      this.mockupPanelCollapsed.set(false);
      setTimeout(() => {
        const el = document.getElementById(`mockup-board-${instId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }

  /** Supprime le marqueur {{MOCKUP:id}} du contenu et efface le folderId de l'instance. */
  async removeMockupMarker(instId: string) {
    const marker = `{{MOCKUP:${instId}}}`;
    const lines = this.unifiedContent.split('\n');
    const idx = lines.findIndex(l => l.trim() === marker);
    if (idx !== -1) {
      lines.splice(idx, 1);
      this.unifiedContent = lines.join('\n').replace(/\n{3,}/g, '\n\n');
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
      this.recomputeRanges();
      this.recomputeMirrorLines();
      this.scheduleSave();
    }
    // Effacer le folderId de l'instance pour éviter que repairMissingMockupMarkers le réinjecte
    await this.megaOutilsSvc.updateInstance(instId, { folderId: '' });
  }

  /** Supprime les marqueurs {{MOCKUP:id}} dupliqués (garde la première occurrence). */
  private deduplicateMockupMarkers(): boolean {
    const seen = new Set<string>();
    let changed = false;
    const lines = this.unifiedContent.split('\n');
    const result: string[] = [];
    for (const line of lines) {
      const m = /^\{\{MOCKUP:([a-zA-Z0-9-]+)(?:\|[^}]*)?\}\}\s*$/.exec(line.trim());
      if (m) {
        if (seen.has(m[1])) { changed = true; continue; }
        seen.add(m[1]);
      }
      result.push(line);
    }
    if (changed) {
      this.unifiedContent = result.join('\n').replace(/\n{3,}/g, '\n\n');
      const ta = this.textareaRef?.nativeElement;
      if (ta) ta.value = this.unifiedContent;
    }
    return changed;
  }

  // ── Diagramme Mockup ────────────────────────────────────────────────────────

  async setMockupListTab(tab: 'list' | 'diagram') {
    this.mockupListTab.set(tab);
    if (tab === 'diagram' && !this.mockupDiagLoaded) {
      await this.loadMockupDiagram();
    }
  }

  async loadMockupDiagram() {
    if (!this.projectName) return;
    const { connections, positions } = await this.megaOutilsSvc.getMockupDiagram(this.projectName);
    this.mockupConnections.set(connections);
    const sections = this.mockupSections();
    const nodes: MockupDiagramNode[] = this.mockupInstances.map((inst, idx) => {
      const saved = positions.find(p => p.instanceId === inst.id);
      return {
        instanceId: inst.id,
        name: inst.name,
        sectionName: sections[inst.id]?.name ?? '',
        x: saved ? saved.x : 40 + (idx % 4) * (this.MOCK_NODE_W + 60),
        y: saved ? saved.y : 40 + Math.floor(idx / 4) * (this.MOCK_NODE_H + 60),
      };
    });
    this.mockupDiagramNodes.set(nodes);
    this.mockupDiagLoaded = true;
  }

  mockupNodeForInstance(instanceId: string): MockupDiagramNode | undefined {
    return this.mockupDiagramNodes().find(n => n.instanceId === instanceId);
  }

  onMockupNodeMouseDown(event: MouseEvent, node: MockupDiagramNode) {
    if (this.mockupConnectMode()) {
      this.onMockupNodeConnectClick(node.instanceId);
      return;
    }
    event.stopPropagation();
    this.mockupDiagDrag = {
      nodeId: node.instanceId,
      startMX: event.clientX, startMY: event.clientY,
      startX: node.x, startY: node.y,
    };
  }

  onMockupDiagMouseMove(event: MouseEvent) {
    if (!this.mockupDiagDrag) return;
    const dx = event.clientX - this.mockupDiagDrag.startMX;
    const dy = event.clientY - this.mockupDiagDrag.startMY;
    this.mockupDiagramNodes.update(nodes => nodes.map(n => {
      if (n.instanceId !== this.mockupDiagDrag!.nodeId) return n;
      return { ...n, x: Math.max(0, this.mockupDiagDrag!.startX + dx), y: Math.max(0, this.mockupDiagDrag!.startY + dy) };
    }));
  }

  onMockupDiagMouseUp() { this.mockupDiagDrag = null; }

  async saveMockupDiagramPositions() {
    if (!this.projectName) return;
    const positions = this.mockupDiagramNodes().map(n => ({ instanceId: n.instanceId, x: n.x, y: n.y }));
    await this.megaOutilsSvc.updateMockupDiagramPositions(this.projectName, positions);
  }

  startMockupConnect() { this.mockupConnectMode.set(true); this.mockupConnectSource.set(null); }
  cancelMockupConnect() { this.mockupConnectMode.set(false); this.mockupConnectSource.set(null); }

  onMockupNodeConnectClick(instanceId: string) {
    if (!this.mockupConnectSource()) {
      this.mockupConnectSource.set(instanceId);
    } else {
      this.mockupPendingConnTarget = instanceId;
      this.mockupPendingConnLabel = '';
      this.mockupConnLabelDialog.set(true);
    }
  }

  async confirmMockupConnLabel() {
    const from = this.mockupConnectSource();
    const to = this.mockupPendingConnTarget;
    if (!from || !to || !this.projectName) { this.mockupConnLabelDialog.set(false); return; }
    const conn = await this.megaOutilsSvc.createMockupConnection(this.projectName, {
      fromInstanceId: from, toInstanceId: to, label: this.mockupPendingConnLabel,
    });
    this.mockupConnections.update(list => [...list, conn]);
    this.mockupConnectMode.set(false);
    this.mockupConnectSource.set(null);
    this.mockupConnLabelDialog.set(false);
  }

  async promptDeleteMockupConnection(conn: MockupConnection) {
    if (!this.projectName) return;
    if (!confirm(`Supprimer la connexion${conn.label ? ' "' + conn.label + '"' : ''} ?`)) return;
    await this.megaOutilsSvc.deleteMockupConnection(this.projectName, conn.id);
    this.mockupConnections.update(list => list.filter(c => c.id !== conn.id));
  }
}
