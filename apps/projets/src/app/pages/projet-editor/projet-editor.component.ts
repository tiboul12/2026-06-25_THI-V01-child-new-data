import { Component, OnInit, OnDestroy, signal, computed, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Subscription } from 'rxjs';
import { ProjectService, Project } from '@worganic/portail-core/data-access';
import { ProjectFilesService, FileNode, FtpNodeSyncStatus, Outil } from '@worganic/portail-core/data-access';
import { MegaOutilsService, MegaOutilInstance } from '@worganic/portail-core/data-access';
import { ConfigService } from '@worganic/portail-core/data-access';
import { AuthService } from '@worganic/portail-core/data-access';
import { LayoutService } from '@worganic/portail-core/data-access';
import { WoActionHistoryService, WoRestoredContent } from '@worganic/portail-core/data-access';
import { ProjetCollabService, CollabHistoryEntry } from '@worganic/portail-core/data-access';

import { WorgMiniHeaderComponent } from '@worganic/shared/ui';
import { ProjetToolbarComponent } from './components/projet-toolbar/projet-toolbar.component';
import { ProjetSidebarComponent, DragDropEvent } from './components/projet-sidebar/projet-sidebar.component';
import { ProjetEditorZoneComponent, FileSaveEvent, SectionInfo } from './components/projet-editor-zone/projet-editor-zone.component';
import { EditionOutilComponent } from './outils/edition/edition-outil.component';
import { ProjetConversationComponent } from './components/projet-conversation/projet-conversation.component';
import { ProjetStatusbarComponent } from './components/projet-statusbar/projet-statusbar.component';
import { ProjetHistoryComponent } from './components/projet-history/projet-history.component';
import { ProjetDiffComponent } from './components/projet-diff/projet-diff.component';
import { ProjetAiDiffComponent } from './components/projet-ai-diff/projet-ai-diff.component';
import { ProjetUpdateBannerComponent } from './components/projet-update-banner/projet-update-banner.component';
import { CommentsDrawerComponent } from './components/comments-drawer/comments-drawer.component';
import { ProjectCommentsService } from './services/project-comments.service';
import { ProjetAiEditService } from './services/projet-ai-edit.service';

@Component({
  selector: 'app-projet-editor',
  standalone: true,
  imports: [
    CommonModule,
    WorgMiniHeaderComponent,
    ProjetToolbarComponent,
    ProjetSidebarComponent,
    EditionOutilComponent,
    ProjetConversationComponent,
    ProjetStatusbarComponent,
    ProjetHistoryComponent,
    ProjetDiffComponent,
    ProjetAiDiffComponent,
    ProjetUpdateBannerComponent,
    CommentsDrawerComponent,
  ],
  templateUrl: './projet-editor.component.html',
  styleUrl: './projet-editor.component.scss'
})
export class ProjetEditorComponent implements OnInit, OnDestroy {
  @ViewChild(EditionOutilComponent) editionOutil?: EditionOutilComponent;

  readonly portailUrl = environment.portailUrl;

  project = signal<Project | null>(null);
  files = signal<FileNode[]>([]);
  loading = signal(true);
  localUnavailable = signal<string | null>(null);
  initMessage = signal<string | null>(null);
  saveStatus = signal<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  nodeSyncStatus = signal<Map<string, FtpNodeSyncStatus>>(new Map());
  ftpSyncGlobalStatus = signal<'idle' | 'syncing' | 'done' | 'error'>('idle');
  ftpSyncProgress = signal<{ checked: number; total: number }>({ checked: 0, total: 0 });
  private wasCreatedLocal = false;
  activeNodeId = signal<string | null>(null);
  highlightNodeId = signal<string | null>(null);
  scrollToNodeId = signal<string | null>(null);
  zone5Tab = signal<'conversation' | 'history'>('conversation');
  zone5Collapsed = signal(false);
  // F6 — Drawer des commentaires de section
  commentsDrawer = signal<{ visible: boolean; folderId: string | null; folderName: string }>({
    visible: false, folderId: null, folderName: ''
  });
  commentCounts = signal<Record<string, number>>({});
  // Map fileId -> imageIds[] pour les images imbriquées dans un bloc document
  nestedImagesMap = signal<Record<string, string[]>>({});
  diffEntry = signal<CollabHistoryEntry | null>(null);

  outils = signal<Outil[]>([]);
  activeOutilId = signal<string | null>(null);

  megaOutilInstances = signal<MegaOutilInstance[]>([]);
  activeMegaOutil    = signal<MegaOutilInstance | null>(null);
  showTrelloList     = signal(false);

  readonly activeOutil = computed(() =>
    this.outils().find(o => o.id === this.activeOutilId()) ?? this.outils()[0] ?? null
  );

  readonly activeOutilFiles = computed<FileNode[]>(() => {
    const outil = this.activeOutil();
    if (!outil) return this.files();
    if (!outil.rootFolderIds.length) return this.files();
    const filtered = this.files().filter(f => outil.rootFolderIds.includes(f.id));
    return filtered.length > 0 ? filtered : this.files();
  });

  restoreToken = signal(0);
  aiEditService = inject(ProjetAiEditService);
  private megaOutilsService = inject(MegaOutilsService);
  hasPendingEdit = computed(() => !!this.aiEditService.pendingEdit());
  hasFtpBackup = computed(() => this.project()?.backupType === 'ftp');

  // Contenu actuel du fichier concerné par l'entrée d'historique ouverte dans le diff
  readonly diffCurrentContent = computed<string | null>(() => {
    const entry = this.diffEntry();
    if (!entry?.entityId) return null;
    const node = this.findFileById(entry.entityId, this.files());
    return node?.content ?? null;
  });

  // Nom + icône du noeud actuellement sélectionné, affichés sous les onglets de la zone 5b
  readonly activeNodeInfo = computed<{ name: string; icon: string } | null>(() => {
    const id = this.activeNodeId();
    if (!id) return null;
    // ID virtuel de bloc inline (format: folderId##kind##index)
    if (id.includes('##')) {
      const kind = id.split('##')[1] ?? '';
      const blockLabels: Record<string, string> = {
        'block-table': 'Tableau', 'block-quote': 'Citation',
        'block-fence': 'Bloc de code', 'block-list': 'Liste',
      };
      return { name: blockLabels[kind] || 'Bloc', icon: 'widgets' };
    }
    const folder = this.findFolderById(id, this.files());
    if (folder) return { name: folder.name, icon: 'folder' };
    const file = this.findFileById(id, this.files());
    if (!file) return null;
    if (this.projectFilesService.isImageFile(file.name)) return { name: file.name, icon: 'image' };
    return { name: file.name, icon: 'description' };
  });

  // Set d'entityIds à afficher dans l'historique selon la sélection courante.
  // - ID virtuel de bloc (contient ##) → uniquement ce bloc
  // - Dossier sélectionné → folder + descendants + blocs inline appartenant à ces folders
  // - contenu.md sélectionné → traité comme le dossier parent
  // - Fichier additionnel → uniquement lui-même
  readonly activeHistoryIds = computed<Set<string> | null>(() => {
    const id = this.activeNodeId();
    if (!id) return null;
    // ID virtuel de bloc inline → filtre uniquement ce bloc
    if (id.includes('##')) return new Set<string>([id]);
    const folder = this.findFolderById(id, this.files());
    if (folder) {
      const baseSet = this.collectDescendantIds(folder);
      // Inclure les blocs inline dont le parentFolderId est dans cet arbre
      for (const entry of this.history.entries()) {
        const eid = String(entry.entityId ?? '');
        if (eid.includes('##')) {
          const parentId = eid.split('##')[0];
          if (baseSet.has(parentId)) baseSet.add(eid);
        }
      }
      return baseSet;
    }
    const fileNode = this.findFileById(id, this.files());
    if (fileNode?.name === 'contenu.md') {
      const parent = this.findParentFolder(id, this.files());
      if (parent) {
        const baseSet = this.collectDescendantIds(parent);
        for (const entry of this.history.entries()) {
          const eid = String(entry.entityId ?? '');
          if (eid.includes('##')) {
            const parentId = eid.split('##')[0];
            if (baseSet.has(parentId)) baseSet.add(eid);
          }
        }
        return baseSet;
      }
    }
    return new Set<string>([id]);
  });

  private collectDescendantIds(node: FileNode): Set<string> {
    const ids = new Set<string>();
    const walk = (n: FileNode) => {
      ids.add(n.id);
      for (const c of (n.children || [])) walk(c);
    };
    walk(node);
    return ids;
  }

  // Met à jour le contenu d'un fichier dans le signal `files` sans recharger depuis le serveur.
  // Cela garde le signal synchronisé avec ce qui est sur disque, pour que si l'éditeur est
  // démonté/remonté (ex: ouverture du diff), il reconstruise depuis le contenu à jour.
  private patchFileContent(fileId: string, content: string) {
    const patch = (nodes: FileNode[]): { changed: boolean; nodes: FileNode[] } => {
      let changed = false;
      const out = nodes.map(n => {
        if (n.id === fileId && n.type === 'file') {
          changed = true;
          return { ...n, content };
        }
        if (n.children) {
          const sub = patch(n.children);
          if (sub.changed) {
            changed = true;
            return { ...n, children: sub.nodes };
          }
        }
        return n;
      });
      return { changed, nodes: out };
    };
    const result = patch(this.files());
    if (result.changed) this.files.set(result.nodes);
  }

  private findFileById(id: string, nodes: FileNode[]): FileNode | null {
    for (const node of nodes) {
      if (node.type === 'file' && node.id === id) return node;
      if (node.children) {
        const f = this.findFileById(id, node.children);
        if (f) return f;
      }
    }
    return null;
  }

  private projectFolderName = '';
  private savedStatusTimer: any;
  private pendingFolders = new Set<string>();
  private pendingFolderNames = new Set<string>(); // noms de dossiers en cours de création (protection anti-suppression)
  private isSaving = false;
  private pendingSections: SectionInfo[] | null = null;
  private history = inject(WoActionHistoryService);
  private collab = inject(ProjetCollabService);
  private commentsService = inject(ProjectCommentsService);
  private collabSubs: Subscription[] = [];

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
    }

    // Phase 1 — Affichage immédiat : structure locale sans FTP
    try {
      const fast = await this.projectFilesService.ensureFast(this.projectFolderName);
      this.wasCreatedLocal = fast.status === 'created-local';
    } catch (e: any) {
      // Fallback sur ensure-local si ensure-fast échoue (projet manquant en BDD, config.json absent…)
      // Pour les projets FTP on reste sur le fast-path pour ne pas déclencher la sync bloquante
      console.warn('ensureFast error, fallback ensureLocal:', e);
      if (this.project()?.backupType !== 'ftp') {
        try {
          const fallback = await this.projectFilesService.ensureLocal(this.projectFolderName);
          if (fallback.status === 'no-remote') {
            this.localUnavailable.set(fallback.message || 'Projet non disponible localement.');
            this.loading.set(false);
            return;
          }
        } catch (e2) {
          console.warn('ensureLocal fallback error:', e2);
        }
      }
    }
    await this.loadFiles();
    this.loading.set(false);

    // Connexion collaboration + abonnements (inclut les événements FTP SSE)
    this.collab.connect(this.projectFolderName);
    this.subscribeToCollabEvents();

    // Phase 2 — Sync FTP en arrière-plan (non-bloquant)
    if (this.hasFtpBackup()) {
      this.initAllFoldersSyncStatus('unknown');
      this.ftpSyncGlobalStatus.set('syncing');
      const total = this.countFileNodes(this.files());
      this.ftpSyncProgress.set({ checked: 0, total });
      // Attendre que le SSE soit connecté avant de démarrer la sync
      // (évite de rater les événements ftp_folder_synced broadcastés avant la connexion)
      this.waitForSseConnect().then(() => {
        this.projectFilesService.startFtpSyncBackground(this.projectFolderName).catch(() => {
          this.ftpSyncGlobalStatus.set('error');
        });
      });
    } else {
      // Git : auto-sync non-bloquant
      this.autoSyncProject(this.projectFolderName);
    }

    // F4 — Scroll vers une section si fournie en queryParam (depuis la recherche)
    const sectionFromSearch = this.route.snapshot.queryParamMap.get('section');
    if (sectionFromSearch) {
      // Sélectionne + déplie l'arbre jusqu'à la section (la sidebar étend via activeNodeId)
      this.activeNodeId.set(sectionFromSearch);
      this.highlightNodeId.set(sectionFromSearch);
      setTimeout(() => this.scrollToNodeId.set(sectionFromSearch), 200);
    }
    // Sélection du menu (outil) si fourni en queryParam (depuis admin méga-outils)
    const outilFromQuery = this.route.snapshot.queryParamMap.get('outil');
    if (outilFromQuery) this.activeOutilId.set(outilFromQuery);
    // F6 — Charger les compteurs de commentaires par section
    this.loadCommentCounts();
  }

  private waitForSseConnect(timeoutMs = 3000): Promise<void> {
    return new Promise(resolve => {
      if (this.collab.connected()) { resolve(); return; }
      let done = false;
      const poll = setInterval(() => {
        if (this.collab.connected()) {
          done = true;
          clearInterval(poll);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        if (!done) { clearInterval(poll); resolve(); }
      }, timeoutMs);
    });
  }

  private countFileNodes(nodes: FileNode[]): number {
    let count = 0;
    for (const n of nodes) {
      if (n.type === 'file') count++;
      if (n.children) count += this.countFileNodes(n.children);
    }
    return count;
  }

  private initAllFoldersSyncStatus(status: FtpNodeSyncStatus): void {
    const map = new Map<string, FtpNodeSyncStatus>();
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.type === 'folder') {
          map.set(n.id, status);
          if (n.children) walk(n.children);
        }
      }
    };
    walk(this.files());
    this.nodeSyncStatus.set(map);
  }

  // F6 — Commentaires inline
  onCommentRequest(evt: { folderId: string; folderName: string }) {
    this.commentsDrawer.set({ visible: true, folderId: evt.folderId, folderName: evt.folderName });
  }

  closeCommentsDrawer() {
    this.commentsDrawer.update(d => ({ ...d, visible: false }));
  }

  onCommentCountsChange(counts: Record<string, number>) {
    this.commentCounts.set(counts);
  }

  private async loadCommentCounts() {
    const projectId = this.project()?.id;
    if (!projectId) return;
    try {
      const counts = await this.commentsService.counts(projectId);
      this.commentCounts.set(counts);
    } catch { /* silent */ }
  }

  ngOnDestroy() {
    this.layoutService.editorMode.set(false);
    this.configService.setCurrentProjectId(null);
    clearTimeout(this.savedStatusTimer);
    this.collab.disconnect();
    this.collabSubs.forEach(s => s.unsubscribe());
  }

  private subscribeToCollabEvents(): void {
    this.collabSubs.push(
      this.collab.contentUpdate$.subscribe(event => {
        this.files.update(nodes => this.patchNodeContent(nodes, event.nodeId, event.content));
      }),
      this.collab.fileRestored$.subscribe(event => {
        this.files.update(nodes => this.patchNodeContent(nodes, event.nodeId, event.content));
        this.restoreToken.update(n => n + 1);
      }),
      this.collab.structureUpdate$.subscribe(() => {
        this.autoPullAndRefresh();
      }),
      // Trello temps réel : recharge la liste d'instances quand un trello est créé/renommé/supprimé ailleurs
      this.collab.trelloUpdate$.subscribe(evt => {
        if (evt.action?.startsWith('instance_')) this.loadMegaOutilInstances();
      }),
      this.collab.sectionPublished$.subscribe(() => {
        this.autoPullAndRefresh();
      }),
      this.collab.ftpFolderSynced$.subscribe(({ folderId, status, totalChecked, totalFiles }) => {
        this.nodeSyncStatus.update(m => new Map(m).set(folderId, status));
        this.ftpSyncProgress.set({ checked: totalChecked, total: totalFiles || this.ftpSyncProgress().total });
      }),
      this.collab.ftpSyncComplete$.subscribe(async ({ status, downloaded }) => {
        this.ftpSyncGlobalStatus.set(status === 'error' ? 'error' : 'done');
        const t = this.ftpSyncProgress().total;
        this.ftpSyncProgress.set({ checked: t, total: t });
        // Marquer tous les dossiers encore à 'unknown' comme 'in-sync'
        // (les sous-dossiers ne reçoivent pas d'événement ftp_folder_synced individuel)
        this.nodeSyncStatus.update(m => {
          const next = new Map(m);
          for (const [id, s] of next) {
            if (s === 'unknown') next.set(id, 'in-sync');
          }
          return next;
        });
        // Si le projet venait d'être créé localement, recharger les fichiers maintenant téléchargés
        if (this.wasCreatedLocal && downloaded > 0) {
          this.wasCreatedLocal = false;
          await this.loadFiles();
        }
      })
    );
  }

  private async autoPullAndRefresh(): Promise<void> {
    if (!this.projectFolderName) return;
    try {
      await this.collab.pullProject(this.projectFolderName);
    } catch { /* pull fail-safe — on recharge quand même */ }
    await this.onRefresh();
  }

  private patchNodeContent(nodes: FileNode[], nodeId: string, content: string): FileNode[] {
    return nodes.map(node => {
      if (node.id === nodeId) return { ...node, content };
      if (node.children?.length) return { ...node, children: this.patchNodeContent(node.children, nodeId, content) };
      return node;
    });
  }

  private async autoSyncProject(name: string): Promise<void> {
    try {
      const result = await this.projectFilesService.autoSync(name);
      if (result.status === 'pulled' && (result.newCommits ?? 0) > 0) {
        await this.onRefresh();
      }
    } catch { /* silencieux — pas bloquant */ }
  }


  async loadFiles() {
    try {
      const res = await this.projectFilesService.getFiles(this.projectFolderName);
      const sorted = this.sortNodesByOrder(res.files || []);
      this.files.set(sorted);
      // Calcule la map des images imbriquées dès le chargement (sinon la sidebar
      // affiche les images au top level tant que sectionsChange n'a pas été émis)
      this.nestedImagesMap.set(this.computeNestedImagesMap(sorted));
    } catch (e) {
      console.warn('loadFiles error:', e);
      this.files.set([]);
    }
    // Charger les outils (migration auto côté serveur si absent)
    try {
      const outilsRes = await this.projectFilesService.getOutils(this.projectFolderName);
      this.outils.set(outilsRes.outils || []);
      if (!this.activeOutilId() && outilsRes.outils.length > 0) {
        this.activeOutilId.set(outilsRes.outils[0].id);
      }
    } catch (e) {
      console.warn('loadOutils error:', e);
    }
    // Charger les mega-outils instances
    await this.loadMegaOutilInstances();
  }

  private computeNestedImagesMap(nodes: FileNode[]): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    const walk = (ns: FileNode[]) => {
      for (const n of ns) {
        if (n.type === 'file' && !this.projectFilesService.isImageFile(n.name) && n.content) {
          const ids: string[] = [];
          const re = /\{\{IMG:([a-zA-Z0-9._-]+)(?:\|[^}]*)?\}\}/gi;
          let m;
          while ((m = re.exec(n.content)) !== null) ids.push(m[1]);
          if (ids.length > 0) map[n.id] = ids;
        }
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return map;
  }

  private sortNodesByOrder(nodes: FileNode[]): FileNode[] {
    return [...nodes]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(n => n.children ? { ...n, children: this.sortNodesByOrder(n.children) } : n);
  }

  onNodeSelect(node: FileNode) {
    this.showTrelloList.set(false);
    this.activeNodeId.set(node.id);
    this.highlightNodeId.set(node.id);
    this.scrollToNodeId.set(null);
    setTimeout(() => this.scrollToNodeId.set(node.id), 0);
  }

  onProjectRootSelect(): void {
    this.showTrelloList.set(false);
    this.activeNodeId.set(null);
    this.highlightNodeId.set(null);
    this.scrollToNodeId.set(null);
  }

  onNodeActive(nodeId: string) {
    // Zone 4 : ne jamais changer activeNodeId — la sélection reste réservée à la zone 3
    this.highlightNodeId.set(nodeId);
  }

  /** Navigation depuis la "Liste des trellos" : sélectionne la section et ferme la liste. */
  onTrelloNavigate(folderId: string) {
    this.showTrelloList.set(false);
    this.activeNodeId.set(folderId);
    this.highlightNodeId.set(folderId);
    this.scrollToNodeId.set(null);
    setTimeout(() => this.scrollToNodeId.set(folderId), 0);
  }

  private isDescendantInTree(nodeId: string, ancestorId: string): boolean {
    const ancestor = this.findFolderById(ancestorId, this.files());
    if (!ancestor) return false;
    const walk = (nodes: FileNode[]): boolean => {
      for (const n of nodes) {
        if (n.id === nodeId) return true;
        if (n.children && walk(n.children)) return true;
      }
      return false;
    };
    return walk(ancestor.children || []);
  }

  onDirtyChange(dirty: boolean) {
    if (dirty) {
      // ne pas écraser un état actif (saving/error)
      const s = this.saveStatus();
      if (s === 'idle' || s === 'saved') this.saveStatus.set('dirty');
    } else {
      // Reset vers idle/saved sera géré par processSectionsChange après save serveur
      // Mais si pas de changement réel, on revient à idle.
      if (this.saveStatus() === 'dirty') this.saveStatus.set('idle');
    }
  }

  // Affiche immédiatement 'Sauvegarde…' dès que la zone éditeur déclenche un save
  // (avant l'analyse asynchrone de processSectionsChange).
  onSaveStarting() {
    clearTimeout(this.savedStatusTimer);
    this.saveStatus.set('saving');
  }

  async onFolderCreated(info: { name: string; parentId: string | null }) {
    // Protège le nouveau dossier contre une suppression accidentelle par processSectionsChange
    // qui pourrait s'exécuter avec des sections stales (avant que le signal files() soit propagé
    // à l'editor zone, ou via un save différé déclenché entre temps : blur textarea, timer 2s…).
    this.pendingFolderNames.add(info.name);
    let waited = 0;
    while (this.isSaving && waited < 5000) {
      await new Promise(r => setTimeout(r, 50));
      waited += 50;
    }
    await this.loadFiles();
    if (!info.parentId) {
      this.editionOutil?.appendSection(info.name, 1);
    } else {
      const parent = this.findFolderById(info.parentId, this.files());
      if (parent) {
        const depth = this.getFolderDepth(info.parentId, this.files());
        this.editionOutil?.insertSectionInParent(parent.name, depth, info.name);
      }
    }
    // On retient la protection assez longtemps pour couvrir tout save différé (timer 2 s)
    // et le ngOnChanges de l'editor zone qui reconstruit le texte avec le nouveau dossier.
    // Tant que la protection est active, processSectionsChange ne supprimera pas ce dossier
    // même si le texte parsé ne le contient pas encore.
    setTimeout(() => this.pendingFolderNames.delete(info.name), 5000);
  }

  onOutilSelect(outilId: string): void {
    this.activeOutilId.set(outilId);
    this.activeNodeId.set(null);
    this.highlightNodeId.set(null);
  }

  async onOutilCreate(data: { type: string; name: string }): Promise<void> {
    const projectName = this.project()?.id;
    if (!projectName) return;
    try {
      const newOutil = await this.projectFilesService.createOutil(projectName, {
        type: data.type,
        name: data.name,
        rootFolderIds: []
      });
      this.outils.update(list => [...list, newOutil]);
      this.activeOutilId.set(newOutil.id);
    } catch (e) {
      console.error('[ProjetEditor] createOutil failed:', e);
    }
  }

  // ── Mega-outils ────────────────────────────────────────────────

  async loadMegaOutilInstances(): Promise<void> {
    const projectId = this.project()?.id;
    if (!projectId) return;
    try {
      const instances = await this.megaOutilsService.getInstances(projectId);
      this.megaOutilInstances.set(instances);
    } catch (e) { console.warn('[ProjetEditor] loadMegaOutilInstances failed:', e); }
  }

  onMegaOutilSelect(inst: MegaOutilInstance): void {
    // La navigation vers la section du trello est gérée par trelloNavigate (onTrelloNavigate).
    this.activeMegaOutil.set(inst);
  }

  onMegaOutilCreated(inst: MegaOutilInstance): void {
    // L'instance est créée par la zone éditeur. On met à jour la liste locale et on l'active.
    this.megaOutilInstances.update(list => [...list, inst]);
    this.activeMegaOutil.set(inst);
  }

  onMegaOutilDeleted(id: string): void {
    this.megaOutilInstances.update(list => list.filter(i => i.id !== id));
    if (this.activeMegaOutil()?.id === id) this.activeMegaOutil.set(null);
  }

  async onSectionsChange(sections: SectionInfo[]) {
    // Recalculer la map des images imbriquées dans des blocs documents
    const newMap: Record<string, string[]> = {};
    for (const s of sections) {
      for (const af of s.additionalFiles || []) {
        if (af.fileId && af.orderedChildIds && af.orderedChildIds.length > 0) {
          newMap[af.fileId] = af.orderedChildIds;
        }
      }
    }
    this.nestedImagesMap.set(newMap);

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
      // Si le dossier vient d'être créé via la sidebar, on le protège d'une suppression
      // accidentelle (race entre le signal parent mis à jour et l'@Input editor zone stale)
      if (this.pendingFolderNames.has(folder.name)) continue;

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
    const movedFileIds = new Set<string>();
    for (const s of resolved) {
      if (!s.folderId) continue;
      s.additionalFiles?.forEach(af => {
        if (af.fileId) {
          const existingFolder = this.findParentFolder(af.fileId, currentFiles);
          if (existingFolder && existingFolder.id !== s.folderId) {
            console.log(`[EDITOR] File move detected for ${af.name}: ${existingFolder.name} -> ${s.folderName}`);
            filesToMove.push({ fileId: af.fileId as string, targetFolderId: s.folderId as string });
            movedFileIds.add(af.fileId);
          }
        }
      });
    }

    // Détection de déplacement d'images : un marqueur {{IMG:id}} apparaît dans le contenu
    // d'une section dont le folderId diffère du parent réel du fichier image dans l'arborescence.
    for (const s of resolved) {
      if (!s.folderId) continue;
      for (const fileId of s.orderedFileIds || []) {
        if (movedFileIds.has(fileId)) continue;
        const fileNode = this.findFileById(fileId, currentFiles);
        if (!fileNode || !this.projectFilesService.isImageFile(fileNode.name)) continue;
        const existingFolder = this.findParentFolder(fileId, currentFiles);
        if (existingFolder && existingFolder.id !== s.folderId) {
          console.log(`[EDITOR] Image move detected for ${fileNode.name}: ${existingFolder.name} -> ${s.folderName}`);
          filesToMove.push({ fileId, targetFolderId: s.folderId as string });
          movedFileIds.add(fileId);
        }
      }
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

    if (!hasStructural && sectionsWithFile.length === 0 && !resolved.some(s => s.additionalFiles?.some(af => !af.fileId))) {
      // Aucun changement à propager. Sortir de l'état 'saving' éventuellement
      // déclenché par onSaveStarting et marquer comme sauvegardé pour purger les pending.
      if (this.saveStatus() === 'saving') {
        this.saveStatus.set('saved');
        this.collab.clearAllPending();
        this.savedStatusTimer = setTimeout(() => this.saveStatus.set('idle'), 2000);
      }
      return;
    }

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
            const folder = await this.projectFilesService.createFolder(this.projectFolderName, { name: section.folderName, parentId, outilSlug: !parentId ? this.activeOutil()?.type : undefined });
            newFolderIds.set(fullPath, folder.id);
            section.folderId = folder.id;
            this.trackFolderCreate(folder);
            // Si root folder (pas de parent) → l'associer à l'outil actif
            if (!parentId && this.activeOutil()) {
              const outilId = this.activeOutilId()!;
              const updatedRootIds = [...(this.activeOutil()!.rootFolderIds), folder.id];
              this.projectFilesService.updateOutil(this.projectFolderName, outilId, { rootFolderIds: updatedRootIds })
                .then(() => this.outils.update(list => list.map(o => o.id === outilId ? { ...o, rootFolderIds: updatedRootIds } : o)))
                .catch(e => console.warn('[ProjetEditor] updateOutil rootFolderIds failed:', e));
            }
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
      }

      // 5. Save content (main content and additional files) MUST be done BEFORE loadFiles()
      // to ensure the server has the latest text when ngOnChanges rebuilds the document.
      for (const s of resolved) {
        if (s.fileId) {
          const oldContent = oldContentMap.get(s.fileId) ?? '';
          if (oldContent !== s.content) {
            await this.projectFilesService.updateFile(this.projectFolderName, s.fileId, s.content, s.folderId ?? undefined);
            this.patchFileContent(s.fileId, s.content);
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
                this.patchFileContent(af.fileId, af.content);
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

      if (hasStructural) {
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

      // 6b. Patch orderedFileIds : injecter les af.fileId résolus après création
      // (un rename de bloc doc = delete + create côté serveur avec order=last ;
      // sans cette injection, l'étape 7 ne touche pas le nouveau fichier et il reste en bas)
      for (const s of resolved) {
        if (!s.additionalFiles || s.additionalFiles.length === 0) continue;
        if (!s.orderedFileIds) s.orderedFileIds = [];
        const orderedSet = new Set(s.orderedFileIds);
        for (let i = 0; i < s.additionalFiles.length; i++) {
          const af = s.additionalFiles[i];
          if (!af.fileId || orderedSet.has(af.fileId)) continue;
          // Position d'ancrage : af précédent déjà mappé, sinon mainFile, sinon fin
          let anchorId: string | null = null;
          for (let k = i - 1; k >= 0; k--) {
            const prev = s.additionalFiles[k];
            if (prev.fileId && orderedSet.has(prev.fileId)) { anchorId = prev.fileId; break; }
          }
          if (!anchorId && s.fileId && orderedSet.has(s.fileId)) anchorId = s.fileId;
          const idx = anchorId ? s.orderedFileIds.indexOf(anchorId) + 1 : s.orderedFileIds.length;
          s.orderedFileIds.splice(idx, 0, af.fileId);
          orderedSet.add(af.fileId);
        }
      }

      // 7. Sync file order within each folder to match text content order (orderedFileIds)
      let structureSnapshot = JSON.parse(JSON.stringify(this.files())) as FileNode[];
      let orderNeedsUpdate = false;
      for (const s of resolved) {
        if (!s.folderId || !s.orderedFileIds || s.orderedFileIds.length < 2) continue;
        const folder = this.findFolderById(s.folderId, structureSnapshot);
        if (!folder || !folder.children) continue;
        for (let i = 0; i < s.orderedFileIds.length; i++) {
          const child = folder.children.find(c => c.id === s.orderedFileIds[i]);
          if (child && child.order !== i + 1) {
            child.order = i + 1;
            orderNeedsUpdate = true;
          }
        }
      }
      if (orderNeedsUpdate) {
        // Si aucun loadFiles() n'a eu lieu dans ce cycle de save (pas de changement structurel),
        // on recharge avant d'envoyer le snapshot — évite d'écraser config.json avec une structure
        // périmée qui effacerait des nœuds ajoutés depuis le dernier chargement (ex : image
        // fraîchement uploadée présente dans config.json mais absente de this.files()).
        if (!hasStructural && !anyAdditionalFileCreated && !additionalFileOrphanDeleted) {
          await this.loadFiles().catch(() => {});
          structureSnapshot = JSON.parse(JSON.stringify(this.files())) as FileNode[];
          for (const s of resolved) {
            if (!s.folderId || !s.orderedFileIds || s.orderedFileIds.length < 2) continue;
            const folder = this.findFolderById(s.folderId, structureSnapshot);
            if (!folder || !folder.children) continue;
            for (let i = 0; i < s.orderedFileIds.length; i++) {
              const child = folder.children.find(c => c.id === s.orderedFileIds[i]);
              if (child) child.order = i + 1;
            }
          }
        }
        await this.projectFilesService.updateStructure(this.projectFolderName, structureSnapshot).catch(e => console.error('[EDITOR] Order sync failed:', e));
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
    // Pause pour garantir que le saveAll() de la zone 4 a bien émis sectionsChange et passé isSaving à true
    await new Promise(resolve => setTimeout(resolve, 150));

    // Attendre la fin des sauvegardes en cours (ex: le texte de la zone 4 vient d'être sauvegardé)
    // pour éviter un rechargement avec du vieux texte qui corromprait la position des images.
    while (this.isSaving) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

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
        let targetFolderId: string | null = null;

        if (position === 'inside' && targetNode.type === 'folder') {
          targetFolderId = targetNode.id;
        } else if (targetNode.type === 'folder') {
          targetFolderId = targetNode.id;
        } else {
          targetFolderId = targetParentId;
        }

        if (!targetFolderId) {
          targetFolderId = draggedParentId;
        }

        // 1) Déplacement physique si le dossier change
        const folderChanged = !!targetFolderId && targetFolderId !== draggedParentId;
        if (folderChanged) {
          // Sauvegarde d'abord le texte avec la bonne position (avant que le loadFiles n'écrase tout)
          if (this.editionOutil) {
            this.editionOutil.flushContentModifications();
          }
          await this.projectFilesService.moveFile(this.projectFolderName, draggedNode.id, targetFolderId!);
        }

        // 2) Réordonnancement dans le dossier cible quand on dépose
        //    avant/après un fichier frère (Doc1 ↔ Doc2 ↔ Doc3).
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
            const folderSiblings = siblings.filter(n => n.type === 'folder');
            const allOrdered = [...newOrder, ...folderSiblings];
            const structure: FileNode[] = JSON.parse(JSON.stringify(currentFiles));
            this.applyOrderInStructure(structure, targetFolderId, allOrdered.map(n => n.id));
            await this.projectFilesService.updateStructure(this.projectFolderName, structure);
          }
        }

        // 3) Pour un drop 'inside' : placer les fichiers avant les sous-dossiers
        if (position === 'inside' && targetNode.type === 'folder') {
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
    // Race condition fix : si un save est en cours (déclenché par saveAll() juste avant
    // refresh.emit() côté zone, par ex. après upload/delete d'image), attendre sa fin
    // avant de relire le serveur — sinon loadFiles() lit un contenu.md obsolète et
    // buildDocSections place les marqueurs {{IMG:xxx}} au mauvais endroit.
    let waited = 0;
    while ((this.isSaving || this.pendingSections) && waited < 5000) {
      await new Promise(resolve => setTimeout(resolve, 50));
      waited += 50;
    }
    await this.loadFiles();
  }

  /** Après un pull réussi déclenché par la bannière de notification */
  async onProjectPulled(_event: { newCommits: number; changedFiles: string[] }): Promise<void> {
    await this.onRefresh();
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

  onHistoryEntryClick(entry: CollabHistoryEntry) {
    this.diffEntry.set(entry);
  }

  // Annulation depuis l'historique : patche le contenu restauré dans les fichiers
  // puis force l'éditeur (zone 4) à se reconstruire via restoreToken.
  onHistoryRestored(restored: WoRestoredContent) {
    this.files.update(nodes => this.patchNodeContent(nodes, restored.nodeId, restored.content));
    this.restoreToken.update(n => n + 1);
  }

  closeDiff() {
    this.diffEntry.set(null);
  }

  async onTriDiffApply(content: string) {
    const entry = this.diffEntry();
    if (!entry?.entityId) return;
    const projectName = this.project()?.id;
    if (!projectName) return;
    const prevContent = this.diffCurrentContent();
    // 1. Patch local + refresh éditeur
    this.files.update(nodes => this.patchNodeContent(nodes, entry.entityId, content));
    this.restoreToken.update(n => n + 1);
    this.diffEntry.set(null);
    // 2. Persister sur le serveur
    try {
      await this.projectFilesService.updateFile(projectName, entry.entityId, content);
      // 3. Tracking historique (annulable)
      this.history.track({
        section: 'projets/contenu',
        actionType: 'update',
        label: `Fusion manuelle — «${entry.entityLabel || entry.entityId}»`,
        entityType: 'content',
        entityId: entry.entityId,
        entityLabel: entry.entityLabel,
        beforeState: prevContent != null ? { content: prevContent } : undefined,
        afterState: { content },
        context: { projectId: projectName },
        undoable: prevContent != null,
        undoAction: prevContent != null ? {
          endpoint: `/api/file-projects/${projectName}/files/${entry.entityId}`,
          method: 'PUT',
          payload: { content: prevContent }
        } : undefined
      }).catch(() => {});
    } catch (e) {
      console.error('[TriDiff] apply failed:', e);
    }
  }

  async onAcceptAiEdit() {
    const projectName = this.project()?.id;
    const edit = this.aiEditService.pendingEdit();
    if (!projectName || !edit) return;
    try {
      await this.aiEditService.acceptEdit(projectName);
      // Patch le signal local immédiatement — évite la latence d'un onRefresh()
      this.files.update(nodes => this.patchNodeContent(nodes, edit.fileId, edit.proposedContent));
      // Enregistrement dans l'historique
      const sectionName = this.findFolderById(edit.sectionId, this.files())?.name ?? edit.sectionId;
      this.history.track({
        section: 'projets/contenu',
        actionType: 'ai-update',
        label: `Modification IA — «${sectionName}»`,
        entityType: 'content',
        entityId: edit.fileId,
        entityLabel: sectionName,
        beforeState: { content: edit.originalContent },
        afterState: { content: edit.proposedContent },
        context: { projectId: projectName },
        undoable: true,
        undoAction: {
          endpoint: `/api/file-projects/${projectName}/files/${edit.fileId}`,
          method: 'PUT',
          payload: { content: edit.originalContent }
        }
      }).catch(() => {});
    } catch (e) {
      console.error('[AI Edit] Accept failed:', e);
      this.aiEditService.cancelEdit();
    }
  }

  onCancelAiEdit() {
    this.aiEditService.cancelEdit();
  }

  get statusLabel(): string {
    return this.project()?.status === 'published' ? 'Publié' : 'Brouillon';
  }

  get projectTitle(): string {
    return this.project()?.title || '';
  }
}
