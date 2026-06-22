import { Component, OnInit, OnDestroy, signal, computed, inject, effect, untracked, ViewChild, ElementRef, DestroyRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { AuthService, ConfigService } from '@worganic/portail-core/data-access';
import { environment } from '../../../../../environments/environment';

const API = environment.apiDataUrl;

interface FunctionItem {
  id: string;
  folderId: string;
  path: string;
  pageTitle: string;
  section: string;
  content: string;        // contenu markdown sous le ## heading
  components?: string[];   // fichiers/composants liés (parsés depuis le markdown)
  priority?: 'mineur' | 'critique' | 'bloquant';
  updatedAt?: string;      // date de dernière mise à jour IA de la section
  updatedBy?: string;      // IA ayant mis à jour la section
  userCreated?: boolean;   // section créée à la demande utilisateur via le popup
  needsRetest?: boolean;   // tag [modification] : code impacté, à retester
}

type Priority = 'mineur' | 'critique' | 'bloquant';

// Dernier test décidé d'une fonction issu d'un run précédent (affiché dans le runner).
interface PrevTest {
  status: 'ok' | 'ko';
  date: string;
  tester: string;
  runName: string | null;
  isCampaign: boolean;
  mode: 'manual' | 'ai';
}

interface TestResult {
  itemId: string;
  status: 'ok' | 'ko' | 'pending';
  note?: string;
  testedAt?: string;
}

interface RunStats { total: number; ok: number; ko: number; pending: number; okPct: number; }

interface TestRunSummary {
  id: string; name?: string; tester: string;
  startedAt: string; completedAt?: string;
  status: 'in_progress' | 'completed';
  stats: RunStats;
  // Mode automatique (IA via Claude Code + Browser MCP)
  mode?: 'manual' | 'ai';
  isCampaign?: boolean;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiState?: 'idle' | 'running' | 'done' | 'error';
  prompt?: string | null;
}

interface TestRunDetail extends TestRunSummary { results: TestResult[]; }

interface MatrixRun {
  id: string; name: string | null; tester: string;
  startedAt: string; completedAt: string | null;
  status: 'in_progress' | 'completed';
  mode: 'manual' | 'ai';
  isCampaign?: boolean;
  stats: RunStats;
  results: { itemId: string; status: string; note: string | null; testedAt?: string | null }[];
}

// Onglet Résultats — structure pré-calculée de la matrice
interface MatrixCell { runId: string; status: string | null; note?: string | null; testedAt?: string | null; }
interface MatrixRow { item: FunctionItem; cells: MatrixCell[]; }
interface MatrixScore { runId: string; score: number | null; }
interface MatrixGroup {
  path: string; pageTitle: string; folderId: string;
  scores: MatrixScore[];
  rows: MatrixRow[];
}
interface MatrixCol { run: MatrixRun; score: number | null; }

// Onglet Cahier — référentiel groupé par section
interface CahierGroup { path: string; pageTitle: string; folderId: string; items: FunctionItem[]; }

// Onglet Cahier — nœud de l'arbre hiérarchique (catégories → sous-catégories → sections)
interface CahierNode {
  depth: number;
  name: string;
  fullPath: string;
  id: string;          // ID hiérarchique (ex: '2', '2-1', '2-1-5')
  pageTitle: string;
  items: FunctionItem[];
  hasChildren: boolean;
}

// Proposition de l'IA pour une fonction (revue avant migration)
interface Proposal {
  op: 'add' | 'modify' | 'delete' | 'unchanged';
  id: string | null;
  section: string;
  content: string;
  components?: string[];
  priority?: 'mineur' | 'critique' | 'bloquant';
  oldSection?: string;
  oldContent?: string;
  oldComponents?: string[];
  oldPriority?: string;
}

// Onglet Cahier — agrégat des derniers résultats pour un nœud (section/catégorie)
interface NodeStat {
  total: number;
  ok: number;
  ko: number;
  untested: number;
  pct: number | null;       // OK / (OK+KO)
  lastDate: string | null;  // date du dernier test décidé
}

type Tab = 'cahier' | 'execution' | 'resultats' | 'historique' | 'sitemap';

interface FnHistoryEntry {
  id: string;
  date: string;
  folderId: string;
  path: string;
  pageTitle: string;
  updatedBy: string;
  added: FnHistoryChange[];
  modified: FnHistoryChange[];
  deleted: FnHistoryChange[];
  counts: { added: number; modified: number; deleted: number };
  total: number;
  aiPrompt?: string;
  aiResponse?: string;
}

interface FnHistoryChange {
  id: string | null;
  section: string;
  priority?: 'mineur' | 'critique' | 'bloquant';
  explanation?: string;
}

// ── Site Map ──
type SmKind = 'public' | 'protected' | 'admin' | 'projets' | 'widget';
interface SitemapNode {
  id: string;
  label: string;
  url: string;        // route (commence par '/') ou 'embed' pour un widget
  port: 4202 | 4203;
  kind: SmKind;
  groupId: string;
  x: number; y: number; w: number; h: number;
  components: string[];
  tabs?: string[];
  description?: string;
  cahierPaths?: string[];
}
interface SitemapEdge {
  id: string;
  from: string; to: string;
  label?: string;
  type: 'nav' | 'auth' | 'cross-app' | 'relation';
}
interface SitemapGroup {
  id: string; label: string;
  x: number; y: number; w: number; h: number;
  stroke: string; fill: string;
}
type SmSide = 'left' | 'right' | 'top' | 'bottom';
interface SmEdgeOverride { fromSide?: SmSide; toSide?: SmSide; bend?: number; }
interface SmEdgeGeo { path: string; midX: number; midY: number; perpX: number; perpY: number; }

@Component({
  selector: 'app-admin-tests',
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: './admin-tests.component.html',
})
export class AdminTestsComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private configService = inject(ConfigService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  // Conteneur du journal IA — pour auto-scroll en bas à chaque nouvelle ligne.
  @ViewChild('aiLogBox') aiLogBox?: ElementRef<HTMLDivElement>;
  @ViewChild('genLogBox') genLogBox?: ElementRef<HTMLDivElement>;
  @ViewChild('sitemapContainer') sitemapContainerRef?: ElementRef<HTMLDivElement>;

  constructor() {
    // Auto-scroll du journal live vers le bas dès qu'une ligne est ajoutée.
    effect(() => {
      this.aiLog();
      const el = this.aiLogBox?.nativeElement;
      if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    });
    effect(() => {
      this.genLog();
      const el = this.genLogBox?.nativeElement;
      if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    });
    // Réinitialise les overrides "afficher toute la section" quand le filtre/recherche change.
    // NB : on ne lit pas forceFullPaths ici (sinon toggler une section relancerait l'effet et l'annulerait).
    effect(() => {
      this.statusFilter(); this.searchQuery(); this.favOnly();
      untracked(() => { if (this.forceFullPaths().size) this.forceFullPaths.set(new Set<string>()); });
    }, { allowSignalWrites: true });
  }

  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'cahier',     label: 'Cahier de recette', icon: 'checklist' },
    { id: 'execution',  label: 'Exécution',         icon: 'play_circle' },
    { id: 'resultats',  label: 'Résultats',         icon: 'bar_chart' },
    { id: 'historique', label: 'Historique',        icon: 'history' },
    { id: 'sitemap',    label: 'Site Map',           icon: 'account_tree' },
  ];

  activeTab = signal<Tab>('cahier');

  // Données communes
  functions        = signal<FunctionItem[]>([]);
  loadingFunctions = signal(false);
  runsError        = signal('');

  // Runs (résumés) + matrice (runs complets avec résultats)
  runs        = signal<TestRunSummary[]>([]);
  loadingRuns = signal(false);
  matrixRuns  = signal<MatrixRun[]>([]);
  loadingMatrix = signal(false);

  // Historique des mises à jour du référentiel
  fnHistory        = signal<FnHistoryEntry[]>([]);
  loadingHistory   = signal(false);
  expandedHistory  = signal<Set<string>>(new Set<string>());

  // ── Onglet Cahier : arbre hiérarchique (catégorie → sous-catégorie → section) ──
  expandedItemIds   = signal<Set<string>>(new Set<string>());   // contenu (tâches) d'une fonction déplié
  cahierExpanded    = signal<Set<string>>(new Set<string>());   // nœuds de l'arbre ouverts
  forceFullPaths    = signal<Set<string>>(new Set<string>());   // sections affichées en entier malgré un filtre actif

  // Recherche + filtre par état
  searchQuery   = signal('');
  searchFocused = signal(false);
  statusFilter  = signal<'all' | 'tested' | 'untested' | 'ko' | 'modified'>('all');
  favOnly       = signal(false);                       // filtre : favoris uniquement
  favorites     = signal<Set<string>>(new Set<string>()); // folderId favoris
  readonly statusFilters: { value: 'all' | 'tested' | 'untested' | 'ko' | 'modified'; label: string }[] = [
    { value: 'all',      label: 'Toutes' },
    { value: 'tested',   label: 'Testées' },
    { value: 'untested', label: 'Non testées' },
    { value: 'ko',       label: 'En erreur' },
    { value: 'modified', label: 'À retester' },
  ];

  /** Filtrage actif (recherche, filtre d'état ou favoris) → affichage déplié des résultats. */
  filtering = computed(() => this.searchQuery().trim().length > 0 || this.statusFilter() !== 'all' || this.favOnly());

  /** Index id → fonction, pour des lookups O(1). */
  private funcsById = computed((): Map<string, FunctionItem> => {
    const m = new Map<string, FunctionItem>();
    for (const fn of this.functions()) m.set(fn.id, fn);
    return m;
  });

  /** Une fonction est-elle taguée [modification] (à retester) ? */
  funcNeedsRetest(itemId: string): boolean {
    return !!this.funcsById().get(itemId)?.needsRetest;
  }

  /** Au moins une fonction de la section (folderId) est-elle à retester ? */
  isSectionNeedsRetest(folderId: string): boolean {
    for (const fn of this.functions()) { if (fn.folderId === folderId && fn.needsRetest) return true; }
    return false;
  }

  isFavorite(folderId: string): boolean { return this.favorites().has(folderId); }

  async loadFavorites() {
    try {
      const res = await fetch(`${API}/api/admin/tests/favorites`, { headers: this.authHeaders });
      if (!res.ok) return;
      const data = await res.json();
      this.favorites.set(new Set(data.folderIds || []));
    } catch { /* ignore */ }
  }

  async toggleFavorite(folderId: string, ev?: Event) {
    ev?.stopPropagation();
    const next = new Set(this.favorites());
    const willFav = !next.has(folderId);
    willFav ? next.add(folderId) : next.delete(folderId);
    this.favorites.set(next);   // optimiste
    try {
      const res = await fetch(`${API}/api/admin/tests/favorites`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({ folderId, favorite: willFav })
      });
      if (res.ok) { const d = await res.json(); this.favorites.set(new Set(d.folderIds || [])); }
    } catch { /* garde l'état optimiste */ }
  }

  private norm(s: string): string {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /** Une fonction passe-t-elle le filtre d'état courant ? */
  private matchesStatusId(itemId: string): boolean {
    const f = this.statusFilter();
    if (f === 'all') return true;
    const st = this.funcStatus(itemId);
    if (f === 'tested')   return st !== 'none';
    if (f === 'untested') return st === 'none';
    if (f === 'ko')       return st === 'ko';
    if (f === 'modified') return this.funcNeedsRetest(itemId);
    return true;
  }

  /** IDs des fonctions qui passent recherche + filtre d'état. */
  matchingItemIds = computed((): Set<string> => {
    const q = this.norm(this.searchQuery().trim());
    const favOnly = this.favOnly();
    const favs = this.favorites();
    const set = new Set<string>();
    for (const fn of this.functions()) {
      if (favOnly && !favs.has(fn.folderId)) continue;
      if (!this.matchesStatusId(fn.id)) continue;
      if (q) {
        const hay = this.norm(`${fn.section} ${fn.pageTitle} ${fn.id} ${fn.content}`);
        if (!hay.includes(q)) continue;
      }
      set.add(fn.id);
    }
    return set;
  });

  /** Suggestions d'autocomplétion (max 8) à partir de la saisie. */
  searchSuggestions = computed((): { id: string; section: string; pageTitle: string }[] => {
    const q = this.norm(this.searchQuery().trim());
    if (q.length < 1) return [];
    const out: { id: string; section: string; pageTitle: string }[] = [];
    const favOnly = this.favOnly();
    const favs = this.favorites();
    for (const fn of this.functions()) {
      if (favOnly && !favs.has(fn.folderId)) continue;
      if (!this.matchesStatusId(fn.id)) continue;
      const hay = this.norm(`${fn.section} ${fn.pageTitle} ${fn.id}`);
      if (hay.includes(q)) {
        out.push({ id: fn.id, section: fn.section, pageTitle: fn.pageTitle });
        if (out.length >= 8) break;
      }
    }
    return out;
  });

  selectSuggestion(s: { section: string }) {
    this.searchQuery.set(s.section);
    this.searchFocused.set(false);
  }

  clearSearch() { this.searchQuery.set(''); this.searchFocused.set(false); }

  // ── Génération/mise à jour des fonctions d'une section par IA ──
  showGenPopup    = signal(false);
  genFolderId     = signal('');
  genSectionLabel = signal('');
  genProvider     = signal('');
  genModel        = signal('');
  genPrompt       = signal('');
  genWithComponents = signal(true);   // demander à l'IA de renseigner les composants liés
  genRunning      = signal(false);
  genDone         = signal(false);
  genError        = signal('');
  genResultMsg    = signal('');
  genLog          = signal<{ stream: string; text: string }[]>([]);
  genLastPrompt   = signal('');   // prompt envoyé à l'IA (pour l'historique)
  genLastResponse = signal('');   // réponse brute de l'IA (pour l'historique)
  private genEventSource: EventSource | null = null;

  genModels = computed(() => {
    const base = this.genProvider();
    const list = this.configService.cliConfig().modelsList as Record<string, { value: string; label: string }[]>;
    return list[base] || [];
  });

  private defaultGenInstructions(): string {
    return [
      "Analyse le code source de cette section (composants Angular, templates, routes serveur) et mets à jour",
      "son cahier de recette : ajoute les fonctions à tester manquantes et corrige/complète celles qui sont",
      "obsolètes, en respectant le système d'IDs hiérarchiques déjà en place (ne renumérote pas l'existant)."
    ].join(' ');
  }

  /** Ouvre le popup de génération IA pour une section feuille. */
  openGenPopup(folderId: string, label: string, ev?: Event) {
    ev?.stopPropagation();
    this.closeGenStream();
    this.genFolderId.set(folderId);
    this.genSectionLabel.set(label);
    this.genRunning.set(false);
    this.genDone.set(false);
    this.genError.set('');
    this.genResultMsg.set('');
    this.genLog.set([]);
    // Défauts provider/modèle depuis admin/config
    const providers = this.aiProviders();
    const header = this.configService.cliConfig().headerSelection;
    const headerBase = (header.provider || '').split('-')[0];
    const chosen = providers.find(p => p.baseId === headerBase) || providers[0];
    this.genProvider.set(chosen?.baseId || '');
    const models = this.genModels();
    this.genModel.set(models.find(m => m.value === header.model)?.value || models[0]?.value || '');
    this.genPrompt.set(this.defaultGenInstructions());
    this.showGenPopup.set(true);
  }

  onGenProviderChange(base: string) {
    this.genProvider.set(base);
    this.genModel.set(this.genModels()[0]?.value || '');
    this.persistAiSelection(base, this.genModel());
  }

  onGenModelChange(model: string) {
    this.genModel.set(model);
    this.persistAiSelection(this.genProvider(), model);
  }

  closeGenPopup() {
    this.closeGenStream();
    this.genRunning.set(false);
    this.showGenPopup.set(false);
  }

  private closeGenStream() {
    if (this.genEventSource) { this.genEventSource.close(); this.genEventSource = null; }
  }

  private appendGenLog(stream: string, text: string) {
    if (!text) return;
    this.genLog.update(log => {
      const next = [...log, { stream, text }];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }

  /** Lance la génération IA : ouvre le flux SSE et met à jour le référentiel à la fin. */
  confirmGen() {
    if (!this.genProvider()) { this.genError.set('Aucun provider IA disponible — active un CLI dans admin/config'); return; }
    this.closeGenStream();
    this.genError.set('');
    this.genDone.set(false);
    this.genResultMsg.set('');
    this.genLog.set([]);
    this.genRunning.set(true);
    const token = this.authService.getToken() || '';
    const params = new URLSearchParams({
      folderId: this.genFolderId(),
      provider: this.genProvider(),
      model: this.genModel(),
      prompt: this.genPrompt().trim(),
      components: this.genWithComponents() ? '1' : '0',
      token,
    });
    const es = new EventSource(`${API}/api/admin/tests/generate-functions-stream?${params.toString()}`);
    this.genEventSource = es;

    es.addEventListener('start', (e: MessageEvent) => {
      try { const d = JSON.parse(e.data); this.appendGenLog('info', `Analyse de la section ${d.folderId} (${d.provider} / ${d.model})…`); } catch { /* ignore */ }
    });
    es.addEventListener('ai-log', (e: MessageEvent) => {
      try { const d = JSON.parse(e.data); this.appendGenLog(d.stream || 'stdout', d.text || ''); } catch { /* ignore */ }
    });
    es.addEventListener('ai-error', (e: MessageEvent) => {
      try { const m = JSON.parse(e.data).message || 'Erreur IA'; this.genError.set(m); this.appendGenLog('error', m); } catch { /* ignore */ }
    });
    es.addEventListener('complete', (e: MessageEvent) => {
      let d: any = {}; try { d = JSON.parse(e.data); } catch { /* ignore */ }
      const proposals = (d.proposals || []) as Proposal[];
      this.genLastPrompt.set(d.prompt || '');
      this.genLastResponse.set(d.rawResponse || '');
      this.genRunning.set(false);
      this.genDone.set(true);
      this.closeGenStream();
      // Ouvre la revue : l'utilisateur valide chaque ajout/modif/suppression avant migration.
      this.proposals.set(proposals);
      const ap = new Set<number>();
      proposals.forEach((p, i) => { if (p.op !== 'unchanged') ap.add(i); });
      this.approvedIdx.set(ap);
      this.reviewError.set('');
      this.showGenPopup.set(false);
      if (proposals.length === 0) { this.genResultMsg.set('Aucune proposition.'); return; }
      this.showReviewPopup.set(true);
    });
    es.addEventListener('run-failed', (e: MessageEvent) => {
      try { const m = JSON.parse(e.data).message || 'Échec de la génération'; this.genError.set(m); this.appendGenLog('error', m); } catch { /* ignore */ }
      this.genRunning.set(false);
      this.closeGenStream();
    });
    es.onerror = () => {
      if (this.genRunning()) this.genError.set(this.genError() || 'Connexion au flux IA interrompue');
      this.genRunning.set(false);
      this.closeGenStream();
    };
  }

  // ── Revue des propositions (validation avant migration) ──
  showReviewPopup = signal(false);
  proposals       = signal<Proposal[]>([]);
  approvedIdx     = signal<Set<number>>(new Set<number>());
  reviewApplying  = signal(false);
  reviewError     = signal('');
  expandedProp    = signal<Set<number>>(new Set<number>());

  // ── Création d'une nouvelle section de tests ──
  showCreateSectionPopup = signal(false);
  csParentPath     = signal('');
  csSlug           = signal('');
  csTitle          = signal('');
  csDesc           = signal('');
  csProvider       = signal('');
  csModel          = signal('');
  csWithComponents = signal(true);
  csRunning        = signal(false);
  csError          = signal('');

  csModels = computed(() => {
    const base = this.csProvider();
    const list = this.configService.cliConfig().modelsList as Record<string, { value: string; label: string }[]>;
    return list[base] || [];
  });

  proposalCounts = computed(() => {
    const c = { add: 0, modify: 0, delete: 0, unchanged: 0 };
    for (const p of this.proposals()) (c as any)[p.op]++;
    return c;
  });

  /** Nb de changements actionnables (hors unchanged) approuvés. */
  approvedActionableCount = computed(() => {
    const ap = this.approvedIdx();
    let n = 0;
    this.proposals().forEach((p, i) => { if (p.op !== 'unchanged' && ap.has(i)) n++; });
    return n;
  });

  isApproved(i: number): boolean { return this.approvedIdx().has(i); }
  toggleApprove(i: number) {
    this.approvedIdx.update(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  isPropExpanded(i: number): boolean { return this.expandedProp().has(i); }
  togglePropExpand(i: number) {
    this.expandedProp.update(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  closeReview() { this.showReviewPopup.set(false); }

  /** Construit la liste finale (décisions validées) et l'envoie au serveur. */
  async applyProposals() {
    const folderId = this.genFolderId();
    const props = this.proposals();
    const ap = this.approvedIdx();

    // Décisions approuvées par ID existant + ajouts approuvés
    const deletedIds = new Set<string>();
    const modifiedById = new Map<string, Proposal>();
    const adds: Proposal[] = [];
    props.forEach((p, i) => {
      const approved = ap.has(i);
      if (p.op === 'delete' && approved && p.id) deletedIds.add(p.id);
      else if (p.op === 'modify' && approved && p.id) modifiedById.set(p.id, p);
      else if (p.op === 'add' && approved) adds.push(p);
    });

    // Diff pour l'historique (avec priorité + explication courte)
    const changes = {
      added: adds.map(a => ({
        section: a.section, priority: a.priority || 'mineur',
        explanation: this.contentSummary(a.content) || 'Nouvelle fonction de test',
      })),
      modified: [...modifiedById.values()].map(m => ({
        id: m.id, section: m.section, priority: m.priority || 'mineur',
        explanation: this.modifyExplanation(m),
      })),
      deleted: [...deletedIds].map(id => {
        const p = props.find(x => x.op === 'delete' && x.id === id);
        return { id, section: p?.section || '', priority: (p?.priority || 'mineur'),
                 explanation: p ? (this.contentSummary(p.content) || 'Fonction retirée du référentiel') : 'Fonction retirée' };
      }),
    };

    // Liste actuelle (ordre préservé), application des modifs/suppressions, puis ajouts
    const current = this.functions().filter(f => f.folderId === folderId);
    const final: { id?: string; section: string; content: string; components: string[]; priority: string }[] = [];
    for (const it of current) {
      if (deletedIds.has(it.id)) continue;
      const mod = modifiedById.get(it.id);
      if (mod) final.push({ id: it.id, section: mod.section, content: mod.content, components: mod.components || [], priority: mod.priority || it.priority || 'mineur' });
      else final.push({ id: it.id, section: it.section, content: it.content, components: it.components || [], priority: it.priority || 'mineur' });
    }
    for (const a of adds) final.push({ section: a.section, content: a.content, components: a.components || [], priority: a.priority || 'mineur' });

    // Libellé de l'IA ayant fait la mise à jour (provider + modèle)
    const provLabel = this.aiProviders().find(p => p.baseId === this.genProvider())?.label || this.genProvider();
    const modLabel  = this.genModels().find(m => m.value === this.genModel())?.label || this.genModel();
    const updatedBy = [provLabel, modLabel].filter(Boolean).join(' / ');

    this.reviewApplying.set(true);
    this.reviewError.set('');
    try {
      const res = await fetch(`${API}/api/admin/tests/apply-functions`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({ folderId, functions: final, updatedBy, changes, aiPrompt: this.genLastPrompt(), aiResponse: this.genLastResponse() })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Échec application');
      await this.loadFunctions(true);
      await this.loadMatrix();
      this.loadFnHistory();
      this.genResultMsg.set('Migration appliquée.');
      this.showReviewPopup.set(false);
    } catch (e: any) {
      this.reviewError.set(e.message || 'Échec application');
    } finally {
      this.reviewApplying.set(false);
    }
  }

  /** Libellé indenté d'un nœud pour le sélecteur de section parente. */
  csNodeLabel(node: CahierNode): string {
    return ' '.repeat(node.depth * 3) + (node.pageTitle || node.name) + ' — ' + node.fullPath;
  }

  openCreateSectionPopup() {
    const providers = this.aiProviders();
    const header = this.configService.cliConfig().headerSelection;
    const headerBase = (header.provider || '').split('-')[0];
    const chosen = providers.find(p => p.baseId === headerBase) || providers[0];
    this.csProvider.set(chosen?.baseId || '');
    const models = this.csModels();
    this.csModel.set(models.find(m => m.value === header.model)?.value || models[0]?.value || '');
    this.csParentPath.set('');
    this.csSlug.set('');
    this.csTitle.set('');
    this.csDesc.set('');
    this.csWithComponents.set(true);
    this.csRunning.set(false);
    this.csError.set('');
    this.showCreateSectionPopup.set(true);
  }

  closeCreateSectionPopup() {
    if (this.csRunning()) return;
    this.showCreateSectionPopup.set(false);
  }

  onCsProviderChange(base: string) {
    this.csProvider.set(base);
    this.csModel.set(this.csModels()[0]?.value || '');
    this.persistAiSelection(base, this.csModel());
  }

  onCsModelChange(model: string) {
    this.csModel.set(model);
    this.persistAiSelection(this.csProvider(), model);
  }

  private defaultCreateSectionInstructions(): string {
    return [
      "Tu es un ingénieur QA. Crée les fonctions de tests pour une NOUVELLE section — aucune fonction",
      "existante à conserver, tout est à créer depuis zéro. Analyse le code source correspondant au",
      "chemin de section (composants Angular, templates, routes Express), puis génère des fonctions",
      "testables concrètes et exhaustives couvrant tous les comportements clés de la page ou du",
      "composant concerné. Si un objectif est précisé ci-dessous, priorise les aspects mentionnés."
    ].join(' ');
  }

  async confirmCreateSection() {
    const slug = this.csSlug().trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug || !this.csTitle().trim()) {
      this.csError.set('Le nom (slug) et le titre sont requis');
      return;
    }
    if (!this.csProvider()) {
      this.csError.set('Aucun provider IA disponible — active un CLI dans admin/config');
      return;
    }
    this.csRunning.set(true);
    this.csError.set('');
    try {
      const res = await fetch(`${API}/api/admin/tests/create-section`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({ parentPath: this.csParentPath() || null, slug, pageTitle: this.csTitle().trim() })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur création');
      const data = await res.json();

      // Recharge le référentiel pour inclure la nouvelle section
      await this.refreshFunctions();

      // Pré-remplit le popup de génération avec les instructions de création
      const desc = this.csDesc().trim();
      const instructions = desc
        ? `${this.defaultCreateSectionInstructions()}\n\nObjectif / précisions :\n${desc}`
        : this.defaultCreateSectionInstructions();

      this.genFolderId.set(data.folderId);
      this.genSectionLabel.set(data.pageTitle);
      this.genProvider.set(this.csProvider());
      this.genModel.set(this.csModel());
      this.genWithComponents.set(this.csWithComponents());
      this.genPrompt.set(instructions);
      this.genRunning.set(false);
      this.genDone.set(false);
      this.genError.set('');
      this.genResultMsg.set('');
      this.genLog.set([]);
      this.genLastPrompt.set('');
      this.genLastResponse.set('');

      this.showCreateSectionPopup.set(false);
      this.csRunning.set(false);
      this.showGenPopup.set(true);
    } catch (e: any) {
      this.csError.set(e.message || 'Erreur création section');
      this.csRunning.set(false);
    }
  }

  /**
   * Arbre des fonctions, en liste plate triée en pré-ordre (parent avant enfants),
   * triée numériquement par ID hiérarchique (1, 1-1, 2, 2-1, 2-1-1…).
   * L'ID des nœuds intermédiaires est déduit du folderId d'une feuille descendante
   * (les segments du folderId correspondent à la profondeur du chemin).
   */
  cahierTree = computed((): CahierNode[] => {
    const fns = this.functions();
    if (fns.length === 0) return [];

    // Items groupés par chemin (= dossier contenant un fonctions.md)
    const byPath = new Map<string, FunctionItem[]>();
    for (const fn of fns) {
      if (!byPath.has(fn.path)) byPath.set(fn.path, []);
      byPath.get(fn.path)!.push(fn);
    }

    // Tous les chemins, y compris les nœuds intermédiaires
    const allPaths = new Set<string>();
    for (const p of byPath.keys()) {
      const parts = p.split('/');
      for (let i = 1; i <= parts.length; i++) allPaths.add(parts.slice(0, i).join('/'));
    }

    const leafPaths = [...byPath.keys()];
    const nodes: CahierNode[] = [...allPaths].map(p => {
      const parts       = p.split('/');
      const segCount    = parts.length;
      const items       = byPath.get(p) || [];
      const hasChildren = leafPaths.some(o => o !== p && o.startsWith(p + '/')) ||
                          [...allPaths].some(o => o !== p && o.startsWith(p + '/'));
      // folderId d'une feuille = ce nœud ou un descendant → tronqué à la profondeur du nœud
      const leaf = items[0]?.folderId
        ? items[0].folderId
        : (byPath.get(leafPaths.find(o => o === p || o.startsWith(p + '/')) || '')?.[0]?.folderId || '');
      const id = leaf ? leaf.split('-').slice(0, segCount).join('-') : p;
      return {
        depth: segCount - 1,
        name: parts[parts.length - 1],
        fullPath: p,
        id,
        pageTitle: items.length ? items[0].pageTitle : '',
        items,
        hasChildren,
      };
    });

    // Tri en pré-ordre par segments numériques de l'ID
    nodes.sort((a, b) => this.compareIds(a.id, b.id));
    return nodes;
  });

  /** Comparaison numérique de deux IDs hiérarchiques ('2-1-5' vs '2-2'). */
  private compareIds(a: string, b: string): number {
    const pa = a.split('-').map(n => parseInt(n, 10));
    const pb = b.split('-').map(n => parseInt(n, 10));
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const va = pa[i] ?? -1, vb = pb[i] ?? -1;   // segment manquant = parent → avant
      if (va !== vb) return va - vb;
    }
    return 0;
  }

  /**
   * Arbre effectivement affiché : filtré par recherche + état si un filtre est actif,
   * avec items réduits aux fonctions correspondantes ; sinon l'arbre complet.
   */
  visibleTree = computed((): CahierNode[] => {
    const tree = this.cahierTree();
    if (!this.filtering()) return tree;
    const ids = this.matchingItemIds();
    const visiblePaths = new Set<string>();
    const itemsByPath = new Map<string, FunctionItem[]>();
    for (const fn of this.functions()) {
      if (!ids.has(fn.id)) continue;
      if (!itemsByPath.has(fn.path)) itemsByPath.set(fn.path, []);
      itemsByPath.get(fn.path)!.push(fn);
      const parts = fn.path.split('/');
      for (let i = 1; i <= parts.length; i++) visiblePaths.add(parts.slice(0, i).join('/'));
    }
    const forced = this.forceFullPaths();
    return tree
      .filter(n => visiblePaths.has(n.fullPath))
      // Section forcée « entière » → items complets (n.items de l'arbre non filtré) ; sinon sous-ensemble filtré.
      .map(n => ({ ...n, items: forced.has(n.fullPath) ? n.items : (itemsByPath.get(n.fullPath) || []) }));
  });

  /** Un nœud est visible si tous ses ancêtres sont dépliés (ou si un filtre est actif). */
  isCahierNodeVisible(fullPath: string): boolean {
    if (this.filtering()) return true;
    const parts    = fullPath.split('/');
    const expanded = this.cahierExpanded();
    if (parts.length === 1) return true;
    for (let i = 1; i < parts.length; i++) {
      if (!expanded.has(parts.slice(0, i).join('/'))) return false;
    }
    return true;
  }

  isCahierExpanded(path: string): boolean { return this.cahierExpanded().has(path); }

  toggleCahierNode(path: string) {
    this.cahierExpanded.update(s => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  /** Clic sur l'en-tête d'un nœud. Si un filtre est actif et que c'est une section feuille,
   *  on bascule l'affichage complet de la section (toutes ses fonctions, malgré le filtre). */
  onCahierNodeClick(node: CahierNode) {
    if (this.filtering() && !node.hasChildren) {
      this.toggleSectionFull(node.fullPath);
      return;
    }
    this.toggleCahierNode(node.fullPath);
  }

  toggleSectionFull(path: string) {
    this.forceFullPaths.update(s => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  /** Une section affiche-t-elle toutes ses fonctions en surcharge du filtre courant ? */
  isSectionForcedFull(path: string): boolean {
    return this.filtering() && this.forceFullPaths().has(path);
  }

  expandAllCahier() { this.cahierExpanded.set(new Set(this.cahierTree().map(n => n.fullPath))); }
  collapseAllCahier() { this.cahierExpanded.set(new Set<string>()); this.expandedItemIds.set(new Set<string>()); }

  // ── Onglet Cahier : croisement avec les derniers résultats (couleurs / %) ──

  /** Dernier état décidé (OK/KO) de chaque fonction, tous runs confondus. */
  funcLatest = computed((): Map<string, { status: 'ok' | 'ko'; date: string }> => {
    const map = new Map<string, { status: 'ok' | 'ko'; date: string }>();
    for (const run of this.matrixRuns()) {
      for (const r of run.results) {
        if (r.status !== 'ok' && r.status !== 'ko') continue;
        const prev = map.get(r.itemId);
        if (!prev || new Date(run.startedAt) >= new Date(prev.date)) {
          map.set(r.itemId, { status: r.status, date: run.startedAt });
        }
      }
    }
    return map;
  });

  /** Dernier état décidé (OK/KO) issu des runs PRÉCÉDENTS (hors run en cours) — pour comparer à la décision actuelle.
   *  Inclut le testeur, la date réelle du test, et le nom/mode de la campagne. */
  funcPrevious = computed((): Map<string, PrevTest> => {
    const activeId = this.activeRun()?.id;
    const map = new Map<string, PrevTest>();
    for (const run of this.matrixRuns()) {
      if (activeId && run.id === activeId) continue;   // ignore le run en cours de remplissage
      for (const r of run.results) {
        if (r.status !== 'ok' && r.status !== 'ko') continue;
        const when = r.testedAt || run.startedAt;        // date réelle du test si dispo
        const prev = map.get(r.itemId);
        if (!prev || new Date(when) >= new Date(prev.date)) {
          map.set(r.itemId, {
            status: r.status, date: when,
            tester: run.tester || '', runName: run.name ?? null,
            isCampaign: !!run.isCampaign, mode: run.mode,
          });
        }
      }
    }
    return map;
  });

  /** État du dernier test précédent d'une fonction (null si jamais testée auparavant). */
  prevResult(itemId: string): PrevTest | null {
    return this.funcPrevious().get(itemId) || null;
  }

  /** Libellé du testeur précédent (repli sur « IA » pour un run automatique sans nom). */
  prevTesterLabel(p: PrevTest): string {
    return p.tester || (p.mode === 'ai' ? 'IA' : '—');
  }

  /** Évolution entre le dernier test précédent et la décision en cours : 'fixed' (KO→OK), 'regressed' (OK→KO), sinon null. */
  resultTrend(itemId: string): 'fixed' | 'regressed' | null {
    const prev = this.funcPrevious().get(itemId);
    const cur = this.getResult(itemId).status;
    if (!prev || (cur !== 'ok' && cur !== 'ko')) return null;
    if (prev.status === 'ko' && cur === 'ok') return 'fixed';
    if (prev.status === 'ok' && cur === 'ko') return 'regressed';
    return null;
  }

  /** Stats agrégées par chemin (chaque fonction remonte sur tous ses ancêtres). */
  cahierStats = computed((): Map<string, NodeStat> => {
    const latest = this.funcLatest();
    const stats = new Map<string, NodeStat>();
    const ensure = (p: string): NodeStat => {
      let s = stats.get(p);
      if (!s) { s = { total: 0, ok: 0, ko: 0, untested: 0, pct: null, lastDate: null }; stats.set(p, s); }
      return s;
    };
    for (const fn of this.functions()) {
      const lr = latest.get(fn.id);
      const parts = fn.path.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const s = ensure(parts.slice(0, i).join('/'));
        s.total++;
        if (lr?.status === 'ok') s.ok++;
        else if (lr?.status === 'ko') s.ko++;
        else s.untested++;
        if (lr && (!s.lastDate || new Date(lr.date) > new Date(s.lastDate))) s.lastDate = lr.date;
      }
    }
    for (const s of stats.values()) {
      const decided = s.ok + s.ko;
      s.pct = decided > 0 ? Math.round((s.ok / decided) * 100) : null;
    }
    return stats;
  });

  statOf(path: string): NodeStat | null { return this.cahierStats().get(path) || null; }

  /** Ensemble des chemins (et leurs ancêtres) dont au moins une fonction a été mise à jour par l'IA. */
  aiUpdatedPaths = computed((): Set<string> => {
    const paths = new Set<string>();
    for (const fn of this.functions()) {
      if (!fn.updatedAt) continue;
      const parts = fn.path.split('/');
      for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('/'));
    }
    return paths;
  });

  /** True si la section a été optimisée par l'IA ET n'a jamais été testée. */
  nodeIsAiOptimized(path: string): boolean {
    return this.aiUpdatedPaths().has(path) && this.nodeColor(path) === 'none';
  }

  /** True si la section (folderId) a été créée à la demande utilisateur. */
  isSectionUserCreated(folderId: string): boolean {
    return this.functions().some(f => f.folderId === folderId && f.userCreated);
  }

  /** Classe CSS complète du libellé d'un nœud du cahier : bleu si IA-optimisé non testé, blanc sinon. */
  nodeTitleClass(path: string, depth: number): string {
    const base = `text-sm ${depth === 0 ? 'font-bold' : 'font-semibold'}`;
    return this.nodeIsAiOptimized(path)
      ? `${base} text-sky-400`
      : `${base} text-light-text dark:text-white`;
  }

  /** Couleur d'un nœud : rouge si au moins une fonction KO, vert si tout OK, gris si non testé. */
  nodeColor(path: string): 'red' | 'green' | 'none' {
    const s = this.statOf(path);
    if (!s || s.ok + s.ko === 0) return 'none';
    return s.ko > 0 ? 'red' : 'green';
  }

  /** Classe de fond pour l'en-tête d'un nœud selon son état. */
  nodeHeaderClass(path: string, hasChildren: boolean): string {
    const c = this.nodeColor(path);
    if (c === 'red')   return 'border-l-4 border-l-red-500 bg-red-500/5 hover:bg-red-500/10';
    if (c === 'green') return 'border-l-4 border-l-green-500 bg-green-500/5 hover:bg-green-500/10';
    return hasChildren
      ? 'border-l-4 border-l-transparent bg-light-surface dark:bg-surface hover:bg-light-surface/70 dark:hover:bg-white/5'
      : 'border-l-4 border-l-transparent bg-light-surface/60 dark:bg-surface/60 hover:bg-light-surface dark:hover:bg-white/5';
  }

  /** Dernier état d'une fonction (pour la colonne État du tableau). */
  funcStatus(itemId: string): 'ok' | 'ko' | 'none' {
    return this.funcLatest().get(itemId)?.status || 'none';
  }
  funcDate(itemId: string): string | null { return this.funcLatest().get(itemId)?.date || null; }

  /** Classe de fond d'une ligne de fonction selon son dernier état. */
  rowStatusClass(itemId: string): string {
    const st = this.funcStatus(itemId);
    if (st === 'ok') return 'bg-green-500/5 hover:bg-green-500/10';
    if (st === 'ko') return 'bg-red-500/5 hover:bg-red-500/10';
    return 'hover:bg-light-surface dark:hover:bg-white/5';
  }

  /** Nombre d'« étapes » d'une fonction = nombre de puces (- …) dans son contenu. */
  stepCount(content: string): number {
    if (!content) return 0;
    return (content.match(/^\s*-\s+/gm) || []).length;
  }

  /** Première ligne lisible du contenu (description courte), hors ligne « Composants ». */
  contentSummary(content: string): string {
    if (!content) return '';
    const line = content.split('\n').map(l => l.trim())
      .find(l => l && l !== '---' && !/^\s*[-*>]?\s*\*{0,2}composants?\*{0,2}\s*[:：]/i.test(l));
    if (!line) return '';
    return line.replace(/^-\s+/, '').replace(/\*\*/g, '').replace(/`/g, '');
  }

  /** Nom court d'un composant/fichier (dernier segment du chemin). */
  shortComponent(p: string): string {
    return (p || '').split(/[\\/]/).pop() || p;
  }

  isItemExpanded(id: string): boolean { return this.expandedItemIds().has(id); }
  toggleItemExpand(id: string) {
    this.expandedItemIds.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Rendu du contenu markdown en HTML simplifié (listes, gras, code inline)
  renderContent(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="font-mono text-[10px] px-1 bg-white/10 rounded">$1</code>')
      .replace(/^- (.+)$/gm, '<span class="flex gap-1"><span class="text-light-text-muted dark:text-white/30 flex-shrink-0">•</span><span>$1</span></span>')
      .replace(/^\| (.+)$/gm, '<span class="text-light-text-muted dark:text-white/40 text-[10px]">| $1</span>')
      .replace(/\n/g, '<br>');
  }

  // ── Onglet Exécution : configuration de lancement (inline) ──
  runComment      = signal('');                       // nom / objectif (test ponctuel)
  launchMode      = signal<'manual' | 'ai'>('ai');
  launchSelected  = signal<Set<string>>(new Set<string>());
  runnerName      = signal('');

  // Campagnes : tester une section (ponctuel) ou regrouper plusieurs sections dans une campagne (1 colonne en résultats)
  campaignMode    = signal<'single' | 'campaign'>('single');
  campaignTarget  = signal<string>('new');            // 'new' ou id d'une campagne existante
  campaignName    = signal('');

  /** Campagnes en cours (réutilisables pour y ajouter des sections). */
  openCampaigns = computed(() => this.runs().filter(r => r.isCampaign && r.status === 'in_progress'));

  aiProvider  = signal('');   // baseId : 'claude' | 'antigravity'
  aiModel     = signal('');
  aiPrompt    = signal('');   // consignes éditables (le format de retour est imposé serveur)

  /** Sections testables (dossiers feuilles avec fonctions), pour la sélection au lancement. */
  launchGroups = computed(() => {
    const groups = new Map<string, { folderId: string; pageTitle: string; section: string; count: number }>();
    for (const item of this.functions()) {
      const key = item.folderId || item.path;
      if (!groups.has(key)) {
        const section = item.path.split('/').pop() || item.path;
        groups.set(key, { folderId: item.folderId, pageTitle: item.pageTitle, section, count: 0 });
      }
      groups.get(key)!.count++;
    }
    return [...groups.values()];
  });

  launchSelectedCount = computed(() => this.launchSelected().size);

  /** Nombre de fonctions couvertes par la sélection courante. */
  selectedFunctionsCount = computed(() => {
    const sel = this.launchSelected();
    const all = this.launchGroups();
    if (sel.size === 0) return 0;
    return all.filter(g => sel.has(g.folderId)).reduce((sum, g) => sum + g.count, 0);
  });

  /** Providers CLI agentiques disponibles (depuis admin/config) — seuls pilotables via MCP. */
  aiProviders = computed(() => this.configService.cliConfig().availableProviders.filter(p => p.type === 'cli'));

  /** Modèles disponibles pour le provider IA sélectionné. */
  aiModels = computed(() => {
    const base = this.aiProvider();
    const list = this.configService.cliConfig().modelsList as Record<string, { value: string; label: string }[]>;
    return list[base] || [];
  });

  /** Bloc "format de retour" imposé, affiché en lecture seule. */
  aiFormatExample =
`@@TEST_RESULT@@{"itemId":"<id>","status":"ok|ko|nd","note":"<observation courte>"}
Exemple :
@@TEST_RESULT@@{"itemId":"2-5-2-11-1","status":"ok","note":""}
@@TEST_RESULT@@{"itemId":"2-5-2-11-2","status":"ko","note":"Le panneau ne s'affiche pas après clic"}`;

  // Run actif (campagne en cours dans l'onglet Exécution)
  activeRun = signal<TestRunDetail | null>(null);
  saving    = signal(false);
  private saveDebounce: any = null;

  /** Fonctions du run actif, groupées par section (pour la liste OK/KO/ND). */
  groupedFunctions = computed(() => {
    const run = this.activeRun();
    const allowed = run ? new Set(run.results.map(r => r.itemId)) : null;
    const groups = new Map<string, { path: string; pageTitle: string; folderId: string; items: FunctionItem[] }>();
    for (const item of this.functions()) {
      if (allowed && !allowed.has(item.id)) continue;
      if (!groups.has(item.path)) groups.set(item.path, { path: item.path, pageTitle: item.pageTitle, folderId: item.folderId, items: [] });
      groups.get(item.path)!.items.push(item);
    }
    return [...groups.values()];
  });

  runnerProgress = computed(() => {
    const run = this.activeRun();
    if (!run || run.results.length === 0) return 0;
    const decided = run.results.filter(r => r.status !== 'pending').length;
    return Math.round((decided / run.results.length) * 100);
  });

  runnerDecided = computed(() => {
    const run = this.activeRun();
    if (!run) return 0;
    return run.results.filter(r => r.status !== 'pending').length;
  });

  // ── État du run IA (affichage progressif) ──
  aiRunning  = signal(false);
  aiProgress = signal<{ done: number; total: number }>({ done: 0, total: 0 });
  aiError    = signal('');
  aiLog      = signal<{ stream: string; text: string }[]>([]);
  showAiLog  = signal(true);
  private aiEventSource: EventSource | null = null;

  aiProgressPct = computed(() => {
    const p = this.aiProgress();
    return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  });

  // ── Popup de confirmation (annulation d'un run en cours / suppression) ──
  confirmPopup = signal<{ kind: 'cancel' | 'delete'; runId: string; label: string } | null>(null);

  // ── Onglet Résultats : matrice pré-calculée ──
  matrixData = computed((): { cols: MatrixCol[]; groups: MatrixGroup[] } => {
    const runs = this.matrixRuns();
    const fns  = this.functions();
    if (runs.length === 0 || fns.length === 0) return { cols: [], groups: [] };

    // Map runId -> (itemId -> result) pour des accès rapides
    const maps = new Map<string, Map<string, { status: string; note: string | null; testedAt?: string | null }>>();
    for (const r of runs) {
      const m = new Map<string, { status: string; note: string | null; testedAt?: string | null }>();
      for (const res of r.results) m.set(res.itemId, { status: res.status, note: res.note ?? null, testedAt: res.testedAt ?? null });
      maps.set(r.id, m);
    }

    const cols: MatrixCol[] = runs.map(r => ({ run: r, score: this.scoreOf(r.stats.ok, r.stats.ko) }));

    // Groupement des fonctions par section
    const byPath = new Map<string, CahierGroup>();
    for (const fn of fns) {
      if (!byPath.has(fn.path)) byPath.set(fn.path, { path: fn.path, pageTitle: fn.pageTitle, folderId: fn.folderId, items: [] });
      byPath.get(fn.path)!.items.push(fn);
    }

    const groups: MatrixGroup[] = [];
    for (const g of byPath.values()) {
      const scores: MatrixScore[] = runs.map(r => {
        const m = maps.get(r.id)!;
        let ok = 0, ko = 0;
        for (const it of g.items) { const s = m.get(it.id)?.status; if (s === 'ok') ok++; else if (s === 'ko') ko++; }
        return { runId: r.id, score: this.scoreOf(ok, ko) };
      });
      const rows: MatrixRow[] = g.items.map(it => ({
        item: it,
        cells: runs.map(r => {
          const c = maps.get(r.id)!.get(it.id);
          return { runId: r.id, status: c?.status || null, note: c?.note || null, testedAt: c?.testedAt || null };
        })
      }));
      // Ne garder que les sections réellement couvertes par au moins un run
      const covered = rows.some(row => row.cells.some(c => c.status !== null));
      if (covered) groups.push({ path: g.path, pageTitle: g.pageTitle, folderId: g.folderId, scores, rows });
    }

    return { cols, groups };
  });

  // ── Onglet Résultats : accordéon + filtre KO ──
  matrixCollapsed = signal<Set<string>>(new Set<string>());
  matrixKoOnly    = signal(false);

  /** Matrice après filtre KO (ne garde que les lignes/sections avec au moins un KO). */
  filteredMatrix = computed((): { cols: MatrixCol[]; groups: MatrixGroup[] } => {
    const m = this.matrixData();
    if (!this.matrixKoOnly()) return m;
    const groups = m.groups
      .map(g => ({ ...g, rows: g.rows.filter(r => r.cells.some(c => c.status === 'ko')) }))
      .filter(g => g.rows.length > 0);
    return { cols: m.cols, groups };
  });

  isMatrixCollapsed(path: string): boolean { return this.matrixCollapsed().has(path); }
  toggleMatrixSection(path: string) {
    this.matrixCollapsed.update(s => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });
  }
  collapseAllMatrix() { this.matrixCollapsed.set(new Set(this.filteredMatrix().groups.map(g => g.path))); }
  expandAllMatrix()   { this.matrixCollapsed.set(new Set<string>()); }

  /** Dernière mise à jour des fonctions d'une section (depuis les items). */
  matrixGroupUpdated(g: MatrixGroup): { updatedAt?: string; updatedBy?: string } {
    const it = g.rows[0]?.item;
    return { updatedAt: it?.updatedAt, updatedBy: it?.updatedBy };
  }

  // ── Priorités ──
  readonly priorities: { value: Priority; label: string }[] = [
    { value: 'mineur',   label: 'Mineur' },
    { value: 'critique', label: 'Critique' },
    { value: 'bloquant', label: 'Bloquant' },
  ];

  priorityLabel(p?: string): string {
    return p === 'bloquant' ? 'Bloquant' : p === 'critique' ? 'Critique' : 'Mineur';
  }
  /** Couleur de texte selon la priorité : mineur bleu clair, critique jaune, bloquant rouge. */
  priorityText(p?: string): string {
    if (p === 'bloquant') return 'text-red-500';
    if (p === 'critique') return 'text-yellow-400';
    return 'text-sky-400';
  }
  /** Classe (badge) selon la priorité. */
  priorityClass(p?: string): string {
    if (p === 'bloquant') return 'bg-red-500/15 text-red-500 border border-red-500/30';
    if (p === 'critique') return 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30';
    return 'bg-sky-400/15 text-sky-400 border border-sky-400/30';
  }
  /** Classe pour le <select> de priorité : texte coloré + fond/bordure teintés. */
  prioritySelectClass(p?: string): string {
    if (p === 'bloquant') return 'text-red-500 bg-red-500/15 border border-red-500/40';
    if (p === 'critique') return 'text-yellow-400 bg-yellow-400/15 border border-yellow-400/40';
    return 'text-sky-400 bg-sky-400/15 border border-sky-400/40';
  }

  /** Édition manuelle de la priorité d'une fonction. */
  async setPriority(itemId: string, priority: Priority) {
    // Optimiste
    this.functions.update(list => list.map(f => f.id === itemId ? { ...f, priority } : f));
    try {
      const res = await fetch(`${API}/api/admin/tests/function-priority`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({ itemId, priority })
      });
      if (res.ok) {
        const d = await res.json();
        // Remplace les items de la section par les valeurs serveur
        if (Array.isArray(d.items) && d.items.length) {
          const folderId = d.items[0].folderId;
          this.functions.update(list => [...list.filter(f => f.folderId !== folderId), ...d.items]);
        }
      }
    } catch { /* garde l'optimiste */ }
  }

  // ── Seuils de validation (onglet Résultats) ──
  critiqueThreshold = signal(15);
  mineurThreshold   = signal(40);
  savingSettings    = signal(false);

  async loadSettings() {
    try {
      const res = await fetch(`${API}/api/admin/tests/settings`, { headers: this.authHeaders });
      if (!res.ok) return;
      const d = await res.json();
      this.critiqueThreshold.set(d.critiqueThreshold ?? 15);
      this.mineurThreshold.set(d.mineurThreshold ?? 40);
    } catch { /* ignore */ }
  }

  private settingsDebounce: any = null;
  saveSettings() {
    if (this.settingsDebounce) clearTimeout(this.settingsDebounce);
    this.savingSettings.set(true);
    this.settingsDebounce = setTimeout(async () => {
      try {
        await fetch(`${API}/api/admin/tests/settings`, {
          method: 'POST', headers: this.authHeaders,
          body: JSON.stringify({ critiqueThreshold: this.critiqueThreshold(), mineurThreshold: this.mineurThreshold() })
        });
      } finally { this.savingSettings.set(false); }
    }, 800);
  }

  /**
   * Verdict de validation d'une section pour un run, selon les priorités :
   * un KO bloquant invalide ; > seuil critique de KO critiques invalide ;
   * > seuil mineur de KO mineurs invalide.
   */
  sectionVerdict(group: MatrixGroup, runId: string): { verdict: 'valid' | 'invalid' | null; reason: string } {
    const statusByItem = new Map<string, string | null>();
    for (const row of group.rows) {
      const cell = row.cells.find(c => c.runId === runId);
      statusByItem.set(row.item.id, cell?.status ?? null);
    }
    let decided = 0;
    const tot = { mineur: 0, critique: 0, bloquant: 0 } as Record<Priority, number>;
    const ko  = { mineur: 0, critique: 0, bloquant: 0 } as Record<Priority, number>;
    for (const row of group.rows) {
      const pr = (row.item.priority || 'mineur') as Priority;
      const st = statusByItem.get(row.item.id);
      if (st === 'ok' || st === 'ko') decided++;
      tot[pr]++;
      if (st === 'ko') ko[pr]++;
    }
    if (decided === 0) return { verdict: null, reason: 'Non testée' };
    if (ko.bloquant > 0) return { verdict: 'invalid', reason: `${ko.bloquant} bloquant(s) KO` };
    const cT = this.critiqueThreshold(), mT = this.mineurThreshold();
    const critPct = tot.critique > 0 ? (ko.critique / tot.critique) * 100 : 0;
    const minPct  = tot.mineur  > 0 ? (ko.mineur  / tot.mineur)  * 100 : 0;
    if (critPct > cT) return { verdict: 'invalid', reason: `${Math.round(critPct)}% de critiques KO (> ${cT}%)` };
    if (minPct  > mT) return { verdict: 'invalid', reason: `${Math.round(minPct)}% de mineurs KO (> ${mT}%)` };
    return { verdict: 'valid', reason: 'Section valide' };
  }

  /** Score OK / (OK+KO) en %, ou null si rien de décidé. */
  scoreOf(ok: number, ko: number): number | null {
    const decided = ok + ko;
    return decided > 0 ? Math.round((ok / decided) * 100) : null;
  }

  private get authHeaders(): Record<string, string> {
    const token = this.authService.getToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  // ── Site Map — données statiques (reflète le parcours réel de l'utilisateur) ──

  private readonly SM_BASE_GROUPS: SitemapGroup[] = [
    { id: 'public',  label: 'Public — :4202 (non connecté)',                 x: 20,   y: 60,  w: 300,  h: 372, stroke: '#0ea5e9', fill: '#0ea5e90a' },
    { id: 'app',     label: 'App connectée — :4202  ·  menu : Documents · Projets · Admin', x: 360, y: 60, w: 360, h: 560, stroke: '#6366f1', fill: '#6366f10a' },
    { id: 'admin',   label: 'Admin — réservé admin (onglets)',               x: 760,  y: 60,  w: 340,  h: 824, stroke: '#f59e0b', fill: '#f59e0b0d' },
    { id: 'projets', label: 'App Projets — :4203',                            x: 1140, y: 60,  w: 480,  h: 624, stroke: '#10b981', fill: '#10b9810a' },
    { id: 'widgets', label: 'Outils & widgets embarqués (visibilité pilotée par Admin › Outils)', x: 20, y: 912, w: 1080, h: 178, stroke: '#8b5cf6', fill: '#8b5cf60a' },
  ];

  private readonly SM_BASE_NODES: SitemapNode[] = [
    // ── Public ──
    { id: 'landing', label: 'Landing', url: '/', port: 4202, kind: 'public', groupId: 'public',
      x: 44, y: 104, w: 252, h: 60,
      components: ['LandingComponent'],
      description: "Page d'accueil publique — connexion / présentation. Point d'entrée vers l'app connectée.",
      cahierPaths: ['non-connecte/landing'] },
    { id: 'cahier-doc', label: 'Doc · Cahier recette', url: '/cahier-recette-doc', port: 4202, kind: 'public', groupId: 'public',
      x: 44, y: 178, w: 252, h: 56,
      components: ['CahierRecetteDocComponent'],
      description: 'Page de documentation publique du widget Cahier de recette.',
      cahierPaths: ['connecte/outils/cahier-recette'] },
    { id: 'tchat-doc', label: 'Doc · TchatIA', url: '/tchat-ia-doc', port: 4202, kind: 'public', groupId: 'public',
      x: 44, y: 248, w: 252, h: 56,
      components: ['TchatIaDocComponent'],
      description: 'Page de documentation publique du widget TchatIA.',
      cahierPaths: ['connecte/outils/tchat-ia'] },
    { id: 'ticket-doc', label: 'Doc · Ticket widget', url: '/ticket-widget-doc', port: 4202, kind: 'public', groupId: 'public',
      x: 44, y: 318, w: 252, h: 56,
      components: ['TicketWidgetDocComponent'],
      description: 'Page de documentation publique du widget de tickets.',
      cahierPaths: ['connecte/outils/tickets'] },

    // ── App connectée (entrées du menu de navigation) ──
    { id: 'documents', label: 'Documents', url: '/documents', port: 4202, kind: 'protected', groupId: 'app',
      x: 384, y: 110, w: 312, h: 60,
      components: ['DocumentsComponent'],
      description: 'Entrée de menu « Documents » — gestion des documents de l’utilisateur.',
      cahierPaths: [] },
    { id: 'projets-nav', label: 'Projets (→ app :4203)', url: '/projets', port: 4203, kind: 'protected', groupId: 'app',
      x: 384, y: 184, w: 312, h: 60,
      components: ['NavComponent'],
      description: "Entrée de menu « Projets » (data/child/nav.json). Bascule vers l'app Projets (port 4203) en passant le token + thème par l'URL.",
      cahierPaths: ['connecte/projets'] },
    { id: 'historique', label: 'Historique actions', url: '/wo-action-history', port: 4202, kind: 'protected', groupId: 'app',
      x: 384, y: 258, w: 312, h: 60,
      components: ['WoActionHistoryComponent'],
      description: "Entrée de menu conditionnelle — affichée seulement si activée dans Admin › Outils (woActionHistoryNavEnabled).",
      cahierPaths: [] },
    { id: 'config', label: 'Configuration', url: '/config', port: 4202, kind: 'protected', groupId: 'app',
      x: 384, y: 332, w: 312, h: 60,
      components: ['ConfigComponent'],
      description: 'Configuration de l’utilisateur (même composant que l’onglet Admin › Config).',
      cahierPaths: ['connecte/config'] },
    { id: 'deployments', label: 'Déploiements', url: '/deployments', port: 4202, kind: 'protected', groupId: 'app',
      x: 384, y: 406, w: 312, h: 60,
      components: ['DeploymentsComponent'],
      description: 'Historique des déploiements et bannière de mise à jour.',
      cahierPaths: ['connecte/deploiements'] },
    { id: 'admin', label: 'Admin', url: '/admin', port: 4202, kind: 'admin', groupId: 'app',
      x: 384, y: 480, w: 312, h: 60,
      components: ['AdminComponent', 'AdminTabsRegistryService'],
      description: "Entrée de menu « Admin » (rouge, admin uniquement). Ouvre le panneau d'administration à onglets.",
      cahierPaths: ['connecte/admin'] },

    // ── Admin : onglets (ordre réel du registry) ──
    { id: 'adm-projets', label: 'Projets', url: '/admin/projets/projets', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 110, w: 300, h: 64,
      tabs: ['/admin/projets/projets', '/admin/projets/ia-instructions'],
      components: ['AdminProjetsComponent'],
      description: 'Onglet Admin › Projets — 2 sous-onglets : liste projets et instructions IA.',
      cahierPaths: ['connecte/admin/projets'] },
    { id: 'adm-users', label: 'Utilisateurs', url: '/admin/users', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 188, w: 300, h: 64,
      components: ['AdminUsersComponent'],
      description: 'Onglet Admin › Utilisateurs — comptes et rôles (data/config/users.json).',
      cahierPaths: ['connecte/admin/utilisateurs'] },
    { id: 'adm-deploy', label: 'Déploiement', url: '/admin/deploiement', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 266, w: 300, h: 64,
      components: ['AdminDeploymentsComponent'],
      description: 'Onglet Admin › Déploiement — enregistrements de versions, alertes de MAJ.',
      cahierPaths: ['connecte/admin/deploiements'] },
    { id: 'adm-config', label: 'Config', url: '/admin/config', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 344, w: 300, h: 64,
      components: ['ConfigComponent'],
      description: 'Onglet Admin › Config — pilote la visibilité du header IA et des entrées de menu.',
      cahierPaths: ['connecte/admin/config'] },
    { id: 'adm-theme', label: 'Thème', url: '/admin/theme', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 422, w: 300, h: 64,
      components: ['AdminThemeComponent'],
      description: 'Onglet Admin › Thème — personnalisation des couleurs (data/child/theme.json).',
      cahierPaths: ['connecte/admin/theme'] },
    { id: 'adm-mega', label: 'Méga-outils', url: '/admin/mega-outils', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 500, w: 300, h: 64,
      components: ['AdminMegaOutilsComponent', 'TrelloAdminComponent'],
      description: "Onglet Admin › Méga-outils — gère les instances Trello partagées entre projets. Bouton « Ouvrir dans l'éditeur » → app Projets.",
      cahierPaths: [] },
    { id: 'adm-memo', label: 'Mémo', url: '/admin/memo', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 578, w: 300, h: 64,
      components: ['AdminMemoComponent'],
      description: 'Onglet Admin › Mémo — notes / aide-mémoire internes.',
      cahierPaths: [] },
    { id: 'adm-outils', label: 'Outils', url: '/admin/tools', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 656, w: 300, h: 64,
      components: ['AdminToolsComponent'],
      description: "Onglet Admin › Outils — visibilité et widgets flottants par outil (TchatIA, Tickets, Cahier de recette, Historique).",
      cahierPaths: [] },
    { id: 'adm-tests', label: 'Tests', url: '/admin/tests/cahier', port: 4202, kind: 'admin', groupId: 'admin',
      x: 780, y: 734, w: 300, h: 64,
      tabs: ['/admin/tests/cahier', '/admin/tests/execution', '/admin/tests/resultats', '/admin/tests/historique', '/admin/tests/sitemap'],
      components: ['AdminTestsComponent'],
      description: 'Onglet Admin › Tests — 5 sous-onglets accessibles chacun via URL directe (/admin/tests/:subtab).',
      cahierPaths: ['connecte/admin/tests'] },

    // ── App Projets (:4203) ──
    { id: 'proj-list', label: 'Liste des projets', url: '/projets', port: 4203, kind: 'projets', groupId: 'projets',
      x: 1164, y: 110, w: 432, h: 64,
      components: ['ProjetsComponent'],
      description: 'Accueil de l’app Projets — grille des projets, création, ouverture.',
      cahierPaths: ['connecte/projets/accueil'] },
    { id: 'proj-editor', label: 'Éditeur de projet', url: '/projets/:id', port: 4203, kind: 'projets', groupId: 'projets',
      x: 1164, y: 196, w: 432, h: 480,
      tabs: ['Toolbar', 'Sidebar', 'Zone Code', 'Zone Structure', 'Zone Preview', 'Conversation', 'Historique', 'Commentaires F6', 'Outil Édition', 'Outil Agenda', 'Outil Tests', 'Méga-outil Trello', 'Méga-outil Tableau'],
      components: ['ProjetEditorComponent', 'ProjetToolbarComponent', 'ProjetSidebarComponent', 'ProjetEditorZoneComponent', 'ProjetConversationComponent', 'ProjetHistoryComponent', 'CommentsDrawerComponent', 'EditionOutilComponent', 'AgendaOutilComponent', 'TestsOutilComponent'],
      description: "Éditeur de projet HTML/CSS/JS avec IA. Intègre les méga-outils (Trello, Tableau) instanciés depuis Admin › Méga-outils.",
      cahierPaths: ['connecte/projets/editor'] },

    // ── Widgets embarqués ──
    { id: 'w-tchat', label: 'TchatIA', url: 'embed', port: 4202, kind: 'widget', groupId: 'widgets',
      x: 60, y: 962, w: 300, h: 70,
      components: ['TchatIaComponent'],
      description: "Widget de chat IA embarquable. Visibilité pilotée par Admin › Outils. Documenté sur /tchat-ia-doc.",
      cahierPaths: ['connecte/outils/tchat-ia'] },
    { id: 'w-tickets', label: 'Tickets', url: 'embed', port: 4202, kind: 'widget', groupId: 'widgets',
      x: 400, y: 962, w: 300, h: 70,
      components: ['TicketWidgetComponent'],
      description: 'Widget de tickets flottant. Visibilité pilotée par Admin › Outils. Documenté sur /ticket-widget-doc.',
      cahierPaths: ['connecte/outils/tickets'] },
    { id: 'w-cahier', label: 'Cahier de recette', url: 'embed', port: 4202, kind: 'widget', groupId: 'widgets',
      x: 740, y: 962, w: 300, h: 70,
      components: ['CahierRecetteComponent'],
      description: 'Widget Cahier de recette flottant. Visibilité pilotée par Admin › Outils. Documenté sur /cahier-recette-doc.',
      cahierPaths: ['connecte/outils/cahier-recette'] },
  ];

  private readonly SM_BASE_EDGES: SitemapEdge[] = [
    // Parcours de navigation
    { id: 'e-login',     from: 'landing',     to: 'documents',   label: 'connexion', type: 'auth' },
    { id: 'e-nav-proj',  from: 'projets-nav', to: 'proj-list',   label: ':4203',     type: 'cross-app' },
    { id: 'e-nav-admin', from: 'admin',       to: 'adm-projets', label: 'ouvre',     type: 'nav' },
    { id: 'e-proj-edit', from: 'proj-list',   to: 'proj-editor',                     type: 'nav' },
    // Relations fonctionnelles (dépendances entre éléments)
    { id: 'r-mega-edit',  from: 'adm-mega',   to: 'proj-editor', label: 'Trello dans l’éditeur', type: 'relation' },
    { id: 'r-out-tchat',  from: 'adm-outils', to: 'w-tchat',     label: 'visibilité', type: 'relation' },
    { id: 'r-out-ticket', from: 'adm-outils', to: 'w-tickets',                        type: 'relation' },
    { id: 'r-out-cahier', from: 'adm-outils', to: 'w-cahier',                         type: 'relation' },
    { id: 'r-out-hist',   from: 'adm-outils', to: 'historique',  label: 'active menu', type: 'relation' },
    { id: 'r-cfg-config', from: 'adm-config', to: 'config',      label: 'même composant', type: 'relation' },
    { id: 'r-projets',    from: 'adm-projets',to: 'proj-list',   label: 'gère', type: 'relation' },
  ];

  /** Clé localStorage de la disposition personnalisée (nœuds + zones) de la Site Map. */
  private readonly SM_LAYOUT_KEY = 'wo_sitemap_layout_v2';

  /** Nœuds de la carte, déplaçables — positions persistées en localStorage. */
  smNodes = signal<SitemapNode[]>(this.loadInitialSmNodes());
  /** Zones (groupes) base + personnalisées, déplaçables et redimensionnables. */
  smGroups = signal<SitemapGroup[]>(this.loadInitialSmGroups());
  /** Liaisons base + personnalisées. */
  smEdges = signal<SitemapEdge[]>(this.loadInitialSmEdges());

  /** Lit la disposition sauvegardée. */
  private readSmLayout(): {
    nodes?: Record<string, { x: number; y: number; groupId?: string }>;
    groups?: Record<string, { x: number; y: number; w: number; h: number; label?: string }>;
    edges?: Record<string, SmEdgeOverride>;
    customGroups?: SitemapGroup[];
    customEdges?: SitemapEdge[];
  } {
    try {
      const raw = localStorage.getItem(this.SM_LAYOUT_KEY);
      if (raw) return JSON.parse(raw) || {};
    } catch { /* ignore */ }
    return {};
  }

  /** Applique les positions + réassignations de zone sauvegardées sur les nœuds par défaut. */
  private loadInitialSmNodes(): SitemapNode[] {
    const saved = this.readSmLayout().nodes || {};
    return this.SM_BASE_NODES.map(n => {
      const p = saved[n.id];
      return p ? { ...n, x: p.x, y: p.y, groupId: p.groupId ?? n.groupId } : { ...n };
    });
  }

  /** Charge les overrides d'arêtes sauvegardés (côtés d'accroche, courbure). */
  private loadInitialEdgeOverrides(): Record<string, SmEdgeOverride> {
    return this.readSmLayout().edges || {};
  }

  /** Zones par défaut (avec géométrie/label sauvegardés) + zones personnalisées. */
  private loadInitialSmGroups(): SitemapGroup[] {
    const saved = this.readSmLayout().groups || {};
    const base = this.SM_BASE_GROUPS.map(g => {
      const s = saved[g.id];
      return s ? { ...g, x: s.x, y: s.y, w: s.w, h: s.h, label: s.label ?? g.label } : { ...g };
    });
    const custom = (this.readSmLayout().customGroups || []).map(g => ({ ...g }));
    return [...base, ...custom];
  }

  /** Liaisons par défaut + liaisons personnalisées. */
  private loadInitialSmEdges(): SitemapEdge[] {
    const custom = (this.readSmLayout().customEdges || []).map(e => ({ ...e }));
    return [...this.SM_BASE_EDGES.map(e => ({ ...e })), ...custom];
  }

  // ── Site Map — signals & état ──

  sitemapZoom        = signal(0.6);
  sitemapPan         = signal({ x: 10, y: 10 });
  selectedSmNode     = signal<SitemapNode | null>(null);
  /** Sélection multiple de nœuds (Ctrl/Maj+clic) pour alignement / déplacement groupé. */
  smMultiSelect      = signal<Set<string>>(new Set());
  smMultiCount       = computed(() => this.smMultiSelect().size);
  /** Zone (groupe) sélectionnée pour édition (label / couleur / suppression). */
  selectedSmGroupId  = signal<string | null>(null);
  selectedSmGroup    = computed(() => {
    const id = this.selectedSmGroupId();
    return id ? this.smGroups().find(g => g.id === id) ?? null : null;
  });
  /** Mode création de liaison + nœud source en attente. */
  smLinkMode         = signal(false);
  smLinkSource       = signal<string | null>(null);
  /** Arête sélectionnée (édition côté d'accroche / courbure) + ses overrides. */
  selectedSmEdgeId   = signal<string | null>(null);
  smEdgeOverrides    = signal<Record<string, SmEdgeOverride>>(this.loadInitialEdgeOverrides());
  selectedSmEdge     = computed(() => {
    const id = this.selectedSmEdgeId();
    return id ? this.smEdges().find(e => e.id === id) ?? null : null;
  });
  selectedSmEdgeOverride = computed((): SmEdgeOverride => {
    const id = this.selectedSmEdgeId();
    return id ? (this.smEdgeOverrides()[id] || {}) : {};
  });
  smFolderFilter     = signal('');
  smSectionOnly      = signal(false);
  smDragging = false;
  private smDragStart = { x: 0, y: 0, px: 0, py: 0 };
  private smWheelCleanup?: () => void;

  smTransform = computed(() => {
    const z = this.sitemapZoom();
    const p = this.sitemapPan();
    return `translate(${p.x},${p.y}) scale(${z})`;
  });

  smHighlightedIds = computed((): Set<string> => {
    const fid = this.smFolderFilter();
    if (!fid) return new Set();
    const fn = this.functions().find(f => f.folderId === fid);
    const path = fn?.path ?? '';
    if (!path) return new Set();
    const ids = new Set<string>();
    for (const n of this.smNodes()) {
      if (n.cahierPaths?.some(p => path === p || path.startsWith(p + '/') || p.startsWith(path + '/'))) {
        ids.add(n.id);
      }
    }
    return ids;
  });

  smVisibleNodes = computed((): SitemapNode[] => {
    if (!this.smSectionOnly() || !this.smFolderFilter()) return this.smNodes();
    const ids = this.smHighlightedIds();
    return this.smNodes().filter(n => ids.has(n.id));
  });

  smVisibleGroups = computed((): SitemapGroup[] => {
    const groups = this.smGroups();
    if (!this.smSectionOnly() || !this.smFolderFilter()) return groups;
    const nodeIds = this.smHighlightedIds();
    const nodes = this.smNodes();
    const groupIds = new Set(nodes.filter(n => nodeIds.has(n.id)).map(n => n.groupId));
    return groups.filter(g => groupIds.has(g.id) || nodes.some(n => nodeIds.has(n.id) && n.groupId === g.id));
  });

  smSections = computed(() => this.launchGroups());

  /** Sections du cahier de recette réellement liées au nœud sélectionné (avec folderId résolu). */
  smSelectedSections = computed((): { folderId: string; path: string; pageTitle: string; section: string; count: number }[] => {
    const node = this.selectedSmNode();
    const cps = node?.cahierPaths;
    if (!cps || cps.length === 0) return [];
    const byFolder = new Map<string, { folderId: string; path: string; pageTitle: string; section: string; count: number }>();
    for (const fn of this.functions()) {
      if (!cps.some(cp => fn.path === cp || fn.path.startsWith(cp + '/'))) continue;
      let g = byFolder.get(fn.folderId);
      if (!g) {
        g = { folderId: fn.folderId, path: fn.path, pageTitle: fn.pageTitle, section: fn.path.split('/').pop() || fn.path, count: 0 };
        byFolder.set(fn.folderId, g);
      }
      g.count++;
    }
    return [...byFolder.values()];
  });

  /** Ouvre le popup de création de section pré-rempli depuis le nœud sélectionné. */
  openCreateSectionFromNode() {
    const node = this.selectedSmNode();
    this.openCreateSectionPopup();
    this.csParentPath.set(node?.cahierPaths?.[0] || '');
    if (node) {
      this.csTitle.set(node.label);
      this.csSlug.set(node.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  }

  sitemapZoomIn()    { this.sitemapZoom.update(z => Math.min(2.5, +(z + 0.1).toFixed(1))); }
  sitemapZoomOut()   { this.sitemapZoom.update(z => Math.max(0.15, +(z - 0.1).toFixed(1))); }
  sitemapZoomReset() { this.sitemapZoom.set(0.6); this.sitemapPan.set({ x: 10, y: 10 }); }

  smMouseDown(e: MouseEvent) {
    const tgt = e.target as Element;
    if (tgt.closest('[data-smnode]')) return;
    this.smDragging = true;
    const p = this.sitemapPan();
    this.smDragStart = { x: e.clientX, y: e.clientY, px: p.x, py: p.y };
    e.preventDefault();
  }

  // ── Déplacement des nœuds (drag & drop) ──
  private smNodeDrag: {
    id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean;
    additive: boolean;
    group: Map<string, { x: number; y: number }> | null;  // positions d'origine si déplacement groupé
  } | null = null;

  /** Début de déplacement d'un nœud (ou clic simple → sélection si pas de mouvement). */
  smNodeMouseDown(node: SitemapNode, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    // Mode création de liaison : clic = choix source puis cible
    if (this.smLinkMode()) { this.handleLinkClick(node.id); return; }
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const sel = this.smMultiSelect();
    // Déplacement groupé si on saisit (sans modificateur) un nœud déjà dans une multi-sélection
    let group: Map<string, { x: number; y: number }> | null = null;
    if (!additive && sel.has(node.id) && sel.size >= 2) {
      group = new Map();
      for (const n of this.smNodes()) if (sel.has(n.id)) group.set(n.id, { x: n.x, y: n.y });
    }
    this.smNodeDrag = { id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y, moved: false, additive, group };
  }

  smMouseMove(e: MouseEvent) {
    // Ajustement de la courbure d'une arête en cours
    if (this.smEdgeBendDrag) {
      const d = this.smEdgeBendDrag;
      const z = this.sitemapZoom();
      const ddx = (e.clientX - d.sx) / z, ddy = (e.clientY - d.sy) / z;
      const delta = ddx * d.perpX + ddy * d.perpY;
      const nb = Math.round(d.startBend + delta);
      this.smEdgeOverrides.update(o => ({ ...o, [d.id]: { ...(o[d.id] || {}), bend: nb } }));
      return;
    }
    // Déplacement / redimensionnement d'une zone en cours
    if (this.smGroupDrag) { this.applyGroupDrag(e); return; }
    // Déplacement d'un nœud en cours
    if (this.smNodeDrag) {
      const d = this.smNodeDrag;
      const z = this.sitemapZoom();
      const ddx = (e.clientX - d.sx) / z;
      const ddy = (e.clientY - d.sy) / z;
      if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true;
      if (d.group) {
        // Déplacement groupé : tous les nœuds sélectionnés suivent du même delta
        this.smNodes.update(ns => ns.map(n => {
          const o = d.group!.get(n.id);
          return o ? { ...n, x: Math.round(o.x + ddx), y: Math.round(o.y + ddy) } : n;
        }));
      } else {
        this.updateNodePos(d.id, Math.round(d.ox + ddx), Math.round(d.oy + ddy));
      }
      return;
    }
    if (!this.smDragging) return;
    this.sitemapPan.set({
      x: this.smDragStart.px + (e.clientX - this.smDragStart.x),
      y: this.smDragStart.py + (e.clientY - this.smDragStart.y),
    });
  }

  smMouseUp() {
    if (this.smEdgeBendDrag) {
      this.persistLayout();
      this.smEdgeBendDrag = null;
      return;
    }
    if (this.smGroupDrag) {
      if (this.smGroupDrag.moved) {
        this.persistLayout();
      } else {
        // Clic sans déplacement → sélection de la zone (édition)
        const id = this.smGroupDrag.id;
        this.selectedSmGroupId.update(c => c === id ? null : id);
        if (this.selectedSmGroupId()) { this.selectedSmNode.set(null); this.selectedSmEdgeId.set(null); this.smMultiSelect.set(new Set()); }
      }
      this.smGroupDrag = null;
      return;
    }
    if (this.smNodeDrag) {
      const d = this.smNodeDrag;
      if (!d.moved) {
        const id = d.id;
        this.selectedSmEdgeId.set(null);
        this.selectedSmGroupId.set(null);
        if (d.additive) {
          // Ctrl/Maj+clic → (dé)sélectionne dans la multi-sélection
          let added = false;
          this.smMultiSelect.update(s => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id); else { n.add(id); added = true; }
            return n;
          });
          if (added) {
            const node = this.smNodes().find(n => n.id === id) ?? null;
            if (node) this.selectedSmNode.set(node);
          }
        } else {
          // Clic simple → sélection unique (réinitialise la multi-sélection)
          const node = this.smNodes().find(n => n.id === id) ?? null;
          if (this.selectedSmNode()?.id === id) {
            this.selectedSmNode.set(null);
            this.smMultiSelect.set(new Set());
          } else {
            this.selectedSmNode.set(node);
            this.smMultiSelect.set(new Set([id]));
          }
        }
      } else {
        // Après un déplacement de nœud isolé : rattache le nœud à la zone sous son centre
        if (!d.group) {
          const node = this.smNodes().find(n => n.id === d.id);
          if (node) {
            const zone = this.zoneAtPoint(node.x + node.w / 2, node.y + node.h / 2);
            if (zone && zone.id !== node.groupId) this.updateNodeGroup(d.id, zone.id);
          }
        }
        this.persistLayout();
      }
      this.smNodeDrag = null;
      return;
    }
    this.smDragging = false;
  }

  smNodeMultiSelected(id: string): boolean { return this.smMultiSelect().has(id); }
  clearMultiSelect() { this.smMultiSelect.set(new Set()); }

  /** Liste des nœuds actuellement multi-sélectionnés. */
  private selectedNodesList(): SitemapNode[] {
    const sel = this.smMultiSelect();
    return this.smNodes().filter(n => sel.has(n.id));
  }

  private patchNodes(patches: { id: string; x?: number; y?: number }[]) {
    const map = new Map(patches.map(p => [p.id, p]));
    this.smNodes.update(ns => ns.map(n => {
      const p = map.get(n.id);
      return p ? { ...n, x: p.x ?? n.x, y: p.y ?? n.y } : n;
    }));
  }

  /** Aligne les nœuds multi-sélectionnés selon un bord ou un centre commun. */
  alignSelected(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const nodes = this.selectedNodesList();
    if (nodes.length < 2) return;
    let patches: { id: string; x?: number; y?: number }[] = [];
    switch (mode) {
      case 'left': {
        const x = Math.min(...nodes.map(n => n.x));
        patches = nodes.map(n => ({ id: n.id, x }));
        break;
      }
      case 'right': {
        const r = Math.max(...nodes.map(n => n.x + n.w));
        patches = nodes.map(n => ({ id: n.id, x: r - n.w }));
        break;
      }
      case 'hcenter': {
        const cx = nodes.reduce((s, n) => s + n.x + n.w / 2, 0) / nodes.length;
        patches = nodes.map(n => ({ id: n.id, x: Math.round(cx - n.w / 2) }));
        break;
      }
      case 'top': {
        const y = Math.min(...nodes.map(n => n.y));
        patches = nodes.map(n => ({ id: n.id, y }));
        break;
      }
      case 'bottom': {
        const b = Math.max(...nodes.map(n => n.y + n.h));
        patches = nodes.map(n => ({ id: n.id, y: b - n.h }));
        break;
      }
      case 'vcenter': {
        const cy = nodes.reduce((s, n) => s + n.y + n.h / 2, 0) / nodes.length;
        patches = nodes.map(n => ({ id: n.id, y: Math.round(cy - n.h / 2) }));
        break;
      }
    }
    this.patchNodes(patches);
    this.persistLayout();
  }

  /** Répartit les nœuds sélectionnés à intervalles égaux (≥ 3 nœuds). */
  distributeSelected(axis: 'h' | 'v') {
    const nodes = this.selectedNodesList();
    if (nodes.length < 3) return;
    const sorted = [...nodes].sort((a, b) => axis === 'h' ? a.x - b.x : a.y - b.y);
    const first = sorted[0], last = sorted[sorted.length - 1];
    if (axis === 'h') {
      const start = first.x + first.w / 2, end = last.x + last.w / 2;
      const step = (end - start) / (sorted.length - 1);
      this.patchNodes(sorted.map((n, i) => ({ id: n.id, x: Math.round(start + step * i - n.w / 2) })));
    } else {
      const start = first.y + first.h / 2, end = last.y + last.h / 2;
      const step = (end - start) / (sorted.length - 1);
      this.patchNodes(sorted.map((n, i) => ({ id: n.id, y: Math.round(start + step * i - n.h / 2) })));
    }
    this.persistLayout();
  }

  /** Met à jour la position d'un nœud (immuable → les arêtes recalculent automatiquement). */
  private updateNodePos(id: string, x: number, y: number) {
    this.smNodes.update(nodes => nodes.map(n => n.id === id ? { ...n, x, y } : n));
  }

  /** Persiste la disposition complète (nœuds + zones + liaisons, base & personnalisées). */
  private persistLayout() {
    try {
      const nodes: Record<string, { x: number; y: number; groupId?: string }> = {};
      for (const n of this.smNodes()) nodes[n.id] = { x: n.x, y: n.y, groupId: n.groupId };

      const baseGroupIds = new Set(this.SM_BASE_GROUPS.map(g => g.id));
      const groups: Record<string, { x: number; y: number; w: number; h: number; label?: string }> = {};
      const customGroups: SitemapGroup[] = [];
      for (const g of this.smGroups()) {
        if (baseGroupIds.has(g.id)) groups[g.id] = { x: g.x, y: g.y, w: g.w, h: g.h, label: g.label };
        else customGroups.push({ ...g });
      }

      const baseEdgeIds = new Set(this.SM_BASE_EDGES.map(e => e.id));
      const customEdges = this.smEdges().filter(e => !baseEdgeIds.has(e.id)).map(e => ({ ...e }));

      const edges = this.smEdgeOverrides();
      localStorage.setItem(this.SM_LAYOUT_KEY, JSON.stringify({ nodes, groups, edges, customGroups, customEdges }));
    } catch { /* ignore */ }
  }

  /** Restaure la disposition par défaut (supprime zones/liaisons personnalisées). */
  resetSmLayout() {
    try { localStorage.removeItem(this.SM_LAYOUT_KEY); } catch { /* ignore */ }
    this.smNodes.set(this.SM_BASE_NODES.map(n => ({ ...n })));
    this.smGroups.set(this.SM_BASE_GROUPS.map(g => ({ ...g })));
    this.smEdges.set(this.SM_BASE_EDGES.map(e => ({ ...e })));
    this.smEdgeOverrides.set({});
    this.smMultiSelect.set(new Set());
    this.selectedSmEdgeId.set(null);
    this.selectedSmGroupId.set(null);
    this.smLinkMode.set(false);
    this.smLinkSource.set(null);
  }

  // ── Déplacement / redimensionnement des zones (groupes) ──
  private readonly SM_GROUP_MIN_W = 160;
  private readonly SM_GROUP_MIN_H = 120;
  private smGroupDrag: {
    id: string; mode: 'move' | 'resize'; sx: number; sy: number; moved: boolean;
    og: { x: number; y: number; w: number; h: number };
    groupIds: Set<string>;                          // zones déplacées (dragged + contenues)
    og2: Map<string, { x: number; y: number }>;     // positions d'origine des zones déplacées
    on: Map<string, { x: number; y: number }>;      // positions d'origine des nœuds déplacés
  } | null = null;

  /** True si la zone `inner` est entièrement contenue dans `outer`. */
  private smGroupContains(outer: SitemapGroup, inner: SitemapGroup): boolean {
    return inner.id !== outer.id
      && inner.x >= outer.x && inner.y >= outer.y
      && inner.x + inner.w <= outer.x + outer.w
      && inner.y + inner.h <= outer.y + outer.h;
  }

  /** Début de déplacement (mode 'move') ou redimensionnement (mode 'resize') d'une zone. */
  smGroupMouseDown(group: SitemapGroup, mode: 'move' | 'resize', e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    // Zones déplacées : la zone saisie + toutes les zones qu'elle contient (nesting)
    const groupIds = new Set<string>([group.id]);
    const og2 = new Map<string, { x: number; y: number }>();
    for (const g of this.smGroups()) {
      if (g.id === group.id || (mode === 'move' && this.smGroupContains(group, g))) {
        groupIds.add(g.id);
        og2.set(g.id, { x: g.x, y: g.y });
      }
    }
    // Nœuds déplacés : appartenant à une zone déplacée, ou dont le centre est dans la zone saisie
    const on = new Map<string, { x: number; y: number }>();
    for (const n of this.smNodes()) {
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      const inside = cx >= group.x && cx <= group.x + group.w && cy >= group.y && cy <= group.y + group.h;
      if (groupIds.has(n.groupId) || (mode === 'move' && inside)) on.set(n.id, { x: n.x, y: n.y });
    }
    this.smGroupDrag = {
      id: group.id, mode, sx: e.clientX, sy: e.clientY, moved: false,
      og: { x: group.x, y: group.y, w: group.w, h: group.h }, groupIds, og2, on,
    };
  }

  private applyGroupDrag(e: MouseEvent) {
    const d = this.smGroupDrag!;
    const z = this.sitemapZoom();
    const ddx = (e.clientX - d.sx) / z;
    const ddy = (e.clientY - d.sy) / z;
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true;

    if (d.mode === 'move') {
      // Déplace toutes les zones concernées (dragged + contenues)
      this.smGroups.update(gs => gs.map(g => {
        const o = d.og2.get(g.id);
        return o ? { ...g, x: Math.round(o.x + ddx), y: Math.round(o.y + ddy) } : g;
      }));
      // Déplace tous les nœuds internes du même delta
      this.smNodes.update(ns => ns.map(n => {
        const o = d.on.get(n.id);
        return o ? { ...n, x: Math.round(o.x + ddx), y: Math.round(o.y + ddy) } : n;
      }));
    } else {
      const nw = Math.max(this.SM_GROUP_MIN_W, Math.round(d.og.w + ddx));
      const nh = Math.max(this.SM_GROUP_MIN_H, Math.round(d.og.h + ddy));
      this.smGroups.update(gs => gs.map(g => g.id === d.id ? { ...g, w: nw, h: nh } : g));
    }
  }

  // ── Création / édition de zones ──
  readonly zonePalette = [
    { stroke: '#0ea5e9', fill: '#0ea5e90a' },
    { stroke: '#6366f1', fill: '#6366f10a' },
    { stroke: '#f59e0b', fill: '#f59e0b0d' },
    { stroke: '#10b981', fill: '#10b9810a' },
    { stroke: '#8b5cf6', fill: '#8b5cf60a' },
    { stroke: '#ec4899', fill: '#ec48990a' },
  ];

  isCustomZone(id: string): boolean { return !this.SM_BASE_GROUPS.some(g => g.id === id); }
  isCustomEdge(id: string): boolean { return !this.SM_BASE_EDGES.some(e => e.id === id); }

  /** Crée une nouvelle zone et la sélectionne. */
  addZone() {
    const id = 'grp-' + Date.now().toString(36);
    const count = this.smGroups().filter(g => this.isCustomZone(g.id)).length;
    const pal = this.zonePalette[this.smGroups().length % this.zonePalette.length];
    const g: SitemapGroup = {
      id, label: 'Nouvelle zone',
      x: 60 + (count % 5) * 30, y: 60 + (count % 5) * 30, w: 320, h: 220,
      stroke: pal.stroke, fill: pal.fill,
    };
    this.smGroups.update(gs => [...gs, g]);
    this.selectedSmGroupId.set(id);
    this.selectedSmNode.set(null);
    this.selectedSmEdgeId.set(null);
    this.persistLayout();
  }

  renameSelectedZone(label: string) {
    const id = this.selectedSmGroupId();
    if (!id) return;
    this.smGroups.update(gs => gs.map(g => g.id === id ? { ...g, label } : g));
    this.persistLayout();
  }

  setSelectedZoneColor(stroke: string, fill: string) {
    const id = this.selectedSmGroupId();
    if (!id) return;
    this.smGroups.update(gs => gs.map(g => g.id === id ? { ...g, stroke, fill } : g));
    this.persistLayout();
  }

  /** Supprime la zone personnalisée sélectionnée (détache ses nœuds). */
  deleteSelectedZone() {
    const id = this.selectedSmGroupId();
    if (!id || !this.isCustomZone(id)) return;
    this.smGroups.update(gs => gs.filter(g => g.id !== id));
    this.smNodes.update(ns => ns.map(n => n.groupId === id ? { ...n, groupId: '' } : n));
    this.selectedSmGroupId.set(null);
    this.persistLayout();
  }

  private updateNodeGroup(id: string, groupId: string) {
    this.smNodes.update(ns => ns.map(n => n.id === id ? { ...n, groupId } : n));
  }

  /** Plus petite zone contenant le point (gère le nesting). */
  private zoneAtPoint(x: number, y: number): SitemapGroup | null {
    const hits = this.smGroups().filter(g => x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h);
    if (!hits.length) return null;
    return hits.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
  }

  // ── Création de liaisons ──
  toggleLinkMode() {
    this.smLinkMode.update(v => !v);
    this.smLinkSource.set(null);
    if (this.smLinkMode()) {
      this.selectedSmNode.set(null);
      this.selectedSmEdgeId.set(null);
      this.selectedSmGroupId.set(null);
      this.smMultiSelect.set(new Set());
    }
  }

  smIsLinkSource(id: string): boolean { return this.smLinkSource() === id; }

  private handleLinkClick(nodeId: string) {
    const src = this.smLinkSource();
    if (!src) { this.smLinkSource.set(nodeId); return; }
    if (src === nodeId) { this.smLinkSource.set(null); return; }
    this.createEdge(src, nodeId);
    this.smLinkSource.set(null);
    this.smLinkMode.set(false);
  }

  private createEdge(from: string, to: string) {
    const id = 'edge-' + Date.now().toString(36);
    this.smEdges.update(es => [...es, { id, from, to, type: 'nav', label: '' } as SitemapEdge]);
    this.selectedSmEdgeId.set(id);
    this.persistLayout();
  }

  setSelectedEdgeType(type: SitemapEdge['type']) {
    const id = this.selectedSmEdgeId();
    if (!id) return;
    this.smEdges.update(es => es.map(e => e.id === id ? { ...e, type } : e));
    this.persistLayout();
  }

  setSelectedEdgeLabel(label: string) {
    const id = this.selectedSmEdgeId();
    if (!id) return;
    this.smEdges.update(es => es.map(e => e.id === id ? { ...e, label } : e));
    this.persistLayout();
  }

  /** Supprime la liaison sélectionnée (personnalisée uniquement). */
  deleteSelectedEdge() {
    const id = this.selectedSmEdgeId();
    if (!id || !this.isCustomEdge(id)) return;
    this.smEdges.update(es => es.filter(e => e.id !== id));
    this.smEdgeOverrides.update(o => { const n = { ...o }; delete n[id]; return n; });
    this.selectedSmEdgeId.set(null);
    this.persistLayout();
  }

  private attachSmWheel() {
    const el = this.sitemapContainerRef?.nativeElement;
    if (!el || this.smWheelCleanup) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      this.sitemapZoom.update(z => Math.min(2.5, Math.max(0.15, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', h, { passive: false });
    this.smWheelCleanup = () => el.removeEventListener('wheel', h);
  }

  smNodeFill(kind: string): string {
    if (kind === 'admin')     return '#1f0f00';
    if (kind === 'protected') return '#0e0b1f';
    if (kind === 'projets')   return '#04130d';
    if (kind === 'widget')    return '#130b1f';
    return '#071828';
  }
  smNodeStroke(kind: string): string {
    if (kind === 'admin')     return '#d97706';
    if (kind === 'protected') return '#6366f1';
    if (kind === 'projets')   return '#10b981';
    if (kind === 'widget')    return '#8b5cf6';
    return '#0284c7';
  }
  smNodeTextColor(kind: string): string {
    if (kind === 'admin')     return '#fbbf24';
    if (kind === 'protected') return '#a5b4fc';
    if (kind === 'projets')   return '#34d399';
    if (kind === 'widget')    return '#c4b5fd';
    return '#38bdf8';
  }
  smKindLabel(kind: string): string {
    if (kind === 'admin')     return 'Admin only';
    if (kind === 'protected') return 'Connecté';
    if (kind === 'projets')   return 'App Projets';
    if (kind === 'widget')    return 'Widget embarqué';
    return 'Public';
  }
  smKindBadgeClass(kind: string): string {
    if (kind === 'admin')     return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    if (kind === 'protected') return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
    if (kind === 'projets')   return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (kind === 'widget')    return 'bg-violet-500/15 text-violet-400 border-violet-500/30';
    return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  }
  smNodeSelected(id: string): boolean { return this.selectedSmNode()?.id === id; }
  smNodeHighlighted(id: string): boolean {
    const fid = this.smFolderFilter();
    if (!fid) return false;
    return this.smHighlightedIds().has(id);
  }
  smNodeOpacity(id: string): number {
    if (!this.smFolderFilter()) return 1;
    return this.smHighlightedIds().has(id) ? 1 : 0.25;
  }

  /**
   * Géométrie de chaque arête, mémorisée.
   * - choisit les ancrages sur les côtés des nœuds (selon position relative)
   * - courbe de Bézier avec points de contrôle perpendiculaires aux côtés
   * - libellé positionné sur la courbe réelle (point à t=0.5)
   */
  smEdgeLayout = computed((): Map<string, SmEdgeGeo> => {
    const m = new Map<string, SmEdgeGeo>();
    const nodes = this.smNodes();
    const ov = this.smEdgeOverrides();
    for (const edge of this.smEdges()) {
      const from = nodes.find(n => n.id === edge.from);
      const to   = nodes.find(n => n.id === edge.to);
      if (!from || !to) continue;
      m.set(edge.id, this.buildEdgeGeometry(from, to, ov[edge.id]));
    }
    return m;
  });

  /** Point d'ancrage (et normale sortante) sur un côté d'un nœud. */
  private smSideAnchor(node: SitemapNode, side: SmSide): { x: number; y: number; nx: number; ny: number } {
    switch (side) {
      case 'left':   return { x: node.x,          y: node.y + node.h / 2, nx: -1, ny: 0 };
      case 'right':  return { x: node.x + node.w, y: node.y + node.h / 2, nx: 1,  ny: 0 };
      case 'top':    return { x: node.x + node.w / 2, y: node.y,          nx: 0,  ny: -1 };
      default:       return { x: node.x + node.w / 2, y: node.y + node.h, nx: 0,  ny: 1 }; // bottom
    }
  }

  /** Côtés d'accroche choisis automatiquement selon la position relative des nœuds. */
  private smAutoSides(from: SitemapNode, to: SitemapNode): { fromSide: SmSide; toSide: SmSide } {
    const dx = (to.x + to.w / 2) - (from.x + from.w / 2);
    const dy = (to.y + to.h / 2) - (from.y + from.h / 2);
    if (Math.abs(dx) > Math.abs(dy) * 0.7) {
      return dx > 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
    }
    return dy > 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
  }

  private buildEdgeGeometry(from: SitemapNode, to: SitemapNode, ov?: SmEdgeOverride): SmEdgeGeo {
    const auto = this.smAutoSides(from, to);
    const a1 = this.smSideAnchor(from, ov?.fromSide ?? auto.fromSide);
    const a2 = this.smSideAnchor(to,   ov?.toSide   ?? auto.toSide);
    const dist = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    const off = Math.max(50, dist * 0.4);
    let c1x = a1.x + a1.nx * off, c1y = a1.y + a1.ny * off;
    let c2x = a2.x + a2.nx * off, c2y = a2.y + a2.ny * off;
    // Courbure manuelle : décale les points de contrôle perpendiculairement à la corde
    const len = dist || 1;
    const perpX = -(a2.y - a1.y) / len, perpY = (a2.x - a1.x) / len;
    const bend = ov?.bend ?? 0;
    if (bend) { c1x += perpX * bend; c1y += perpY * bend; c2x += perpX * bend; c2y += perpY * bend; }

    const path = `M ${a1.x} ${a1.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${a2.x} ${a2.y}`;
    // Point de la cubique à t=0.5 (libellé + poignée de courbure posés sur la courbe)
    const midX = 0.125 * a1.x + 0.375 * c1x + 0.375 * c2x + 0.125 * a2.x;
    const midY = 0.125 * a1.y + 0.375 * c1y + 0.375 * c2y + 0.125 * a2.y;
    return { path, midX, midY, perpX, perpY };
  }

  // ── Édition des arêtes (côté d'accroche + courbure) ──
  smEdgeSelected(id: string): boolean { return this.selectedSmEdgeId() === id; }

  /** Sélectionne / désélectionne une arête (ferme la sélection de nœud). */
  selectSmEdge(id: string, e: MouseEvent) {
    e.stopPropagation();
    this.selectedSmEdgeId.update(c => c === id ? null : id);
    if (this.selectedSmEdgeId()) {
      this.selectedSmNode.set(null);
      this.selectedSmGroupId.set(null);
      this.smMultiSelect.set(new Set());
    }
  }

  /** Fixe le côté d'accroche d'une extrémité de l'arête sélectionnée. */
  setEdgeSide(end: 'from' | 'to', side: SmSide) {
    const id = this.selectedSmEdgeId();
    if (!id) return;
    this.smEdgeOverrides.update(o => {
      const cur = { ...(o[id] || {}) };
      if (end === 'from') cur.fromSide = side; else cur.toSide = side;
      return { ...o, [id]: cur };
    });
    this.persistLayout();
  }

  isEdgeSide(end: 'from' | 'to', side: SmSide): boolean {
    const ov = this.selectedSmEdgeOverride();
    const edge = this.selectedSmEdge();
    if (!edge) return false;
    const nodes = this.smNodes();
    const from = nodes.find(n => n.id === edge.from), to = nodes.find(n => n.id === edge.to);
    const auto = (from && to) ? this.smAutoSides(from, to) : { fromSide: 'right' as SmSide, toSide: 'left' as SmSide };
    const cur = end === 'from' ? (ov.fromSide ?? auto.fromSide) : (ov.toSide ?? auto.toSide);
    return cur === side;
  }

  adjustEdgeBend(delta: number) {
    const id = this.selectedSmEdgeId();
    if (!id) return;
    this.smEdgeOverrides.update(o => {
      const cur = { ...(o[id] || {}) };
      cur.bend = (cur.bend || 0) + delta;
      return { ...o, [id]: cur };
    });
    this.persistLayout();
  }

  /** Réinitialise l'arête sélectionnée (retour au tracé automatique). */
  resetSelectedEdge() {
    const id = this.selectedSmEdgeId();
    if (!id) return;
    this.smEdgeOverrides.update(o => { const n = { ...o }; delete n[id]; return n; });
    this.persistLayout();
  }

  // Glisser la poignée de courbure (milieu de l'arête)
  private smEdgeBendDrag: { id: string; sx: number; sy: number; startBend: number; perpX: number; perpY: number } | null = null;

  smEdgeHandleMouseDown(edgeId: string, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const geo = this.smEdgeLayout().get(edgeId);
    if (!geo) return;
    this.selectedSmEdgeId.set(edgeId);
    this.smEdgeBendDrag = {
      id: edgeId, sx: e.clientX, sy: e.clientY,
      startBend: this.smEdgeOverrides()[edgeId]?.bend ?? 0,
      perpX: geo.perpX, perpY: geo.perpY,
    };
  }

  smEdgeColor(type: string): string {
    if (type === 'auth')      return '#34d399';
    if (type === 'cross-app') return '#f59e0b';
    if (type === 'relation')  return '#a78bfa';
    return '#818cf8';
  }

  /** True si l'arête est une relation fonctionnelle (tracée en pointillés). */
  smEdgeDashed(type: string): boolean { return type === 'relation'; }

  /** True si le nœud pointe vers une vraie route ouvrable (pas un widget embarqué). */
  smNodeHasPage(node: SitemapNode): boolean { return node.url.startsWith('/'); }

  smNodePageUrl(node: SitemapNode): string {
    return `http://localhost:${node.port}${node.url}`;
  }

  toggleSmSectionOnly() { this.smSectionOnly.update(v => !v); }

  smSectionLabel(): string {
    const fid = this.smFolderFilter();
    if (!fid) return '';
    const g = this.launchGroups().find(x => x.folderId === fid);
    return g ? `${g.pageTitle} / ${g.section}` : fid;
  }

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user) this.runnerName.set(user.username);
    this.loadFunctions();
    this.loadRuns();
    this.loadMatrix();   // résultats nécessaires aux couleurs du Cahier
    this.loadFavorites();
    this.loadSettings();

    // Routing par segment : /admin/tests/:subtab (réagit aussi au retour arrière navigateur)
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const subtab = params['subtab'] as Tab;
      if (!subtab) {
        this.router.navigate(['/admin', 'tests', 'cahier'], { replaceUrl: true });
        return;
      }
      if (this.tabs.some(t => t.id === subtab) && subtab !== this.activeTab()) {
        this.activateTabInternal(subtab);
      }
    });
  }

  ngOnDestroy() { this.closeAiStream(); this.closeGenStream(); this.smWheelCleanup?.(); }

  /** Changement d'onglet : met à jour l'URL puis active l'onglet. */
  selectTab(tab: Tab) {
    this.activateTabInternal(tab);
    this.router.navigate(['/admin', 'tests', tab]);
  }

  /** Active un onglet sans naviguer (utilisé par la subscription de route). */
  private activateTabInternal(tab: Tab) {
    if (tab !== 'sitemap' && this.smWheelCleanup) {
      this.smWheelCleanup();
      this.smWheelCleanup = undefined;
    }
    this.activeTab.set(tab);
    if (tab === 'execution') {
      if (this.aiProviders().length && !this.aiProvider()) this.initAiDefaults();
      this.loadRuns();
    }
    if (tab === 'resultats' || tab === 'cahier') this.loadMatrix();
    if (tab === 'historique') this.loadFnHistory();
    if (tab === 'sitemap') setTimeout(() => this.attachSmWheel(), 50);
  }

  async loadRuns() {
    this.loadingRuns.set(true);
    this.runsError.set('');
    try {
      const res = await fetch(`${API}/api/admin/tests/runs`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement');
      const data = await res.json();
      this.runs.set(data.runs);
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur');
    } finally {
      this.loadingRuns.set(false);
    }
  }

  async loadMatrix() {
    this.loadingMatrix.set(true);
    try {
      const res = await fetch(`${API}/api/admin/tests/matrix`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement matrice');
      const data = await res.json();
      this.matrixRuns.set(data.runs);
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur');
    } finally {
      this.loadingMatrix.set(false);
    }
  }

  async loadFnHistory() {
    this.loadingHistory.set(true);
    try {
      const res = await fetch(`${API}/api/admin/tests/functions-history`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement historique');
      const data = await res.json();
      this.fnHistory.set(data.entries || []);
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur');
    } finally {
      this.loadingHistory.set(false);
    }
  }

  /** Explication courte d'une modification (ce qui a changé). */
  private modifyExplanation(p: Proposal): string {
    const parts: string[] = [];
    if (this.norm(p.oldSection || '') !== this.norm(p.section)) parts.push('libellé');
    if (this.norm(p.oldContent || '') !== this.norm(p.content)) parts.push('tâches');
    if ((p.oldComponents || []).join('|') !== (p.components || []).join('|')) parts.push('composants');
    if ((p.oldPriority || 'mineur') !== (p.priority || 'mineur')) parts.push(`priorité ${this.priorityLabel(p.oldPriority)} → ${this.priorityLabel(p.priority)}`);
    return parts.length ? 'Modifié : ' + parts.join(', ') : 'Contenu mis à jour';
  }

  isHistoryExpanded(id: string): boolean { return this.expandedHistory().has(id); }
  toggleHistory(id: string) {
    this.expandedHistory.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  expandedHistoryAi = signal<Set<string>>(new Set<string>());
  isHistoryAiExpanded(id: string): boolean { return this.expandedHistoryAi().has(id); }
  toggleHistoryAi(id: string, ev?: Event) {
    ev?.stopPropagation();
    this.expandedHistoryAi.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async loadFunctions(force = false) {
    if (this.functions().length > 0 && !force) return;
    this.loadingFunctions.set(true);
    try {
      const res = await fetch(`${API}/api/admin/tests/functions`, { headers: this.authHeaders });
      if (!res.ok) throw new Error('Erreur chargement fonctions');
      const data = await res.json();
      this.functions.set(data.functions);
      if (this.launchSelected().size === 0) this.selectAllLaunch();
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur chargement fonctions');
    } finally {
      this.loadingFunctions.set(false);
    }
  }

  async refreshFunctions() {
    this.functions.set([]);
    await fetch(`${API}/api/admin/tests/functions/refresh`, { method: 'POST', headers: this.authHeaders });
    await this.loadFunctions(true);
  }

  // ── Configuration du lancement ──

  /** Valeurs par défaut du mode automatique (provider/modèle depuis admin/config, consignes). */
  private initAiDefaults() {
    this.aiError.set('');
    const providers = this.aiProviders();
    const header = this.configService.cliConfig().headerSelection;
    const headerBase = (header.provider || '').split('-')[0];
    const chosen = providers.find(p => p.baseId === headerBase) || providers[0];
    this.aiProvider.set(chosen?.baseId || '');
    const models = this.aiModels();
    this.aiModel.set(models.find(m => m.value === header.model)?.value || models[0]?.value || '');
    if (!this.aiPrompt()) this.aiPrompt.set(this.defaultAiInstructions());
  }

  /** Persiste le couple provider/modèle (partagé via headerSelection) pour le retrouver dans tous les formulaires IA. */
  private persistAiSelection(provider: string, model: string) {
    if (provider) this.configService.saveHeaderSelection(provider, model || '');
  }

  /** Quand le provider change, recaler le modèle sur le premier disponible + mémoriser le choix. */
  onAiProviderChange(base: string) {
    this.aiProvider.set(base);
    this.aiModel.set(this.aiModels()[0]?.value || '');
    this.persistAiSelection(base, this.aiModel());
  }

  /** Mémorise le modèle choisi dans le formulaire d'exécution. */
  onAiModelChange(model: string) {
    this.aiModel.set(model);
    this.persistAiSelection(this.aiProvider(), model);
  }

  private defaultAiInstructions(): string {
    return [
      "Tu es un testeur QA. L'application Worganic est ouverte et CONNECTÉE dans le navigateur",
      "(onglet piloté via l'extension Browser MCP). Utilise les outils du navigateur pour tester",
      "réellement chaque fonctionnalité listée d'après ses tâches, puis renvoie l'état de chaque",
      "test au fur et à mesure (un résultat par fonction, sans attendre la fin)."
    ].join(' ');
  }

  toggleLaunchSection(folderId: string) {
    this.launchSelected.update(s => {
      const n = new Set(s);
      n.has(folderId) ? n.delete(folderId) : n.add(folderId);
      return n;
    });
  }

  isLaunchSelected(folderId: string): boolean { return this.launchSelected().has(folderId); }
  selectAllLaunch() { this.launchSelected.set(new Set(this.launchGroups().map(g => g.folderId))); }
  clearLaunch()     { this.launchSelected.set(new Set<string>()); }
  /** True quand toutes les sections sont sélectionnées (chip « Toutes »). */
  allSelected = computed(() => {
    const all = this.launchGroups();
    return all.length > 0 && this.launchSelected().size === all.length;
  });

  /** Lance un test sur une section depuis l'onglet Cahier (pré-sélectionne + bascule sur Exécution). */
  launchSectionFromCahier(folderId: string, ev?: Event) {
    ev?.stopPropagation();
    this.launchSelected.set(new Set([folderId]));
    this.selectTab('execution');
  }

  /** Crée le run / ajoute à une campagne avec les sections sélectionnées (manuel ou IA). */
  async confirmLaunch() {
    const selected = [...this.launchSelected()];
    if (selected.length === 0) { this.runsError.set('Sélectionnez au moins une section'); return; }
    const isAi = this.launchMode() === 'ai';
    if (isAi && !this.aiProvider()) { this.runsError.set('Aucun provider IA disponible — active un CLI dans admin/config'); return; }
    const isCampaign = this.campaignMode() === 'campaign';
    const addToExisting = isCampaign && this.campaignTarget() !== 'new';
    if (isCampaign && !addToExisting && !this.campaignName().trim()) { this.runsError.set('Donne un nom à la campagne'); return; }
    this.runsError.set('');
    try {
      const allIds = this.launchGroups().map(g => g.folderId);
      const folderIds = selected.length === allIds.length ? [] : selected;
      let run: any;
      if (addToExisting) {
        // Ajoute les sections à une campagne existante
        const res = await fetch(`${API}/api/admin/tests/runs/${this.campaignTarget()}/add-sections`, {
          method: 'POST', headers: this.authHeaders,
          body: JSON.stringify({ folderIds })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur ajout à la campagne');
        run = await res.json();
        // Pour un ajout IA, on conserve le provider/modèle/prompt choisis sur le run en mémoire
        if (isAi) { run.mode = 'ai'; run.aiProvider = this.aiProvider(); run.aiModel = this.aiModel(); }
      } else {
        const res = await fetch(`${API}/api/admin/tests/runs`, {
          method: 'POST', headers: this.authHeaders,
          body: JSON.stringify({
            tester: this.runnerName(),
            name: isCampaign ? this.campaignName().trim() : (this.runComment().trim() || null),
            folderIds,
            ...(isCampaign ? { isCampaign: true } : {}),
            ...(isAi ? { mode: 'ai', aiProvider: this.aiProvider(), aiModel: this.aiModel(), prompt: this.aiPrompt().trim() } : {})
          })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur création run');
        run = await res.json();
      }
      // Charge la matrice pour disposer des résultats des tests précédents (affichés à gauche des boutons).
      await this.loadMatrix();
      this.activeRun.set(run);
      this.expandedItemIds.set(new Set<string>());
      if (isAi) this.startAiRun(run.id);
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur lancement');
    }
  }

  /** Enregistre la campagne sans la clôturer (reste ouverte pour ajouter d'autres sections). */
  async saveAndExit() {
    const run = this.activeRun();
    if (!run) return;
    this.closeAiStream();
    this.aiRunning.set(false);
    if (this.saveDebounce) clearTimeout(this.saveDebounce);
    this.saving.set(true);
    try {
      await fetch(`${API}/api/admin/tests/runs/${run.id}`, {
        method: 'PUT', headers: this.authHeaders,
        body: JSON.stringify({ results: run.results })
      });
    } finally { this.saving.set(false); }
    this.activeRun.set(null);
    await this.loadRuns();
    await this.loadMatrix();
    // Recale la cible sur cette campagne pour enchaîner l'ajout d'une autre section
    this.campaignMode.set('campaign');
    this.campaignTarget.set(run.id);
  }

  // ── Run IA (SSE) ──

  startAiRun(runId: string) {
    this.closeAiStream();
    this.aiError.set('');
    this.aiLog.set([]);
    this.aiRunning.set(true);
    this.aiProgress.set({ done: 0, total: this.activeRun()?.results.length || 0 });
    const token = this.authService.getToken() || '';
    const es = new EventSource(`${API}/api/admin/tests/runs/${runId}/ai-stream?token=${encodeURIComponent(token)}`);
    this.aiEventSource = es;

    es.addEventListener('start', (e: MessageEvent) => {
      const d = JSON.parse(e.data); this.aiProgress.set({ done: 0, total: d.total });
      this.appendAiLog('info', `Démarrage du test IA — ${d.total} fonction(s) à vérifier (${d.provider || ''} / ${d.model || ''})`);
    });
    es.addEventListener('ai-log', (e: MessageEvent) => {
      try { const d = JSON.parse(e.data); this.appendAiLog(d.stream || 'stdout', d.text || ''); } catch { /* ignore */ }
    });
    es.addEventListener('case-result', (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const run = this.activeRun();
      if (run) {
        const results = run.results.map(r => r.itemId === d.itemId ? { ...r, status: d.status, note: d.note } : r);
        this.activeRun.set({ ...run, results });
      }
      this.aiProgress.set({ done: d.done, total: d.total });
      const verdict = d.status === 'ok' ? 'OK' : d.status === 'ko' ? 'KO' : 'ND';
      this.appendAiLog('result', `[${verdict}] ${d.itemId}${d.note ? ' — ' + d.note : ''} (${d.done}/${d.total})`);
    });
    es.addEventListener('ai-error', (e: MessageEvent) => {
      try { const m = JSON.parse(e.data).message || 'Erreur IA'; this.aiError.set(m); this.appendAiLog('error', m); } catch { /* ignore */ }
    });
    es.addEventListener('complete', (e: MessageEvent) => {
      try { const d = JSON.parse(e.data); this.appendAiLog('info', `Test IA terminé — ${d.done}/${d.total} fonction(s) traitée(s).`); } catch { /* ignore */ }
      this.aiRunning.set(false); this.closeAiStream();
    });
    es.addEventListener('run-failed', (e: MessageEvent) => {
      try { const m = JSON.parse(e.data).message || 'Échec du run IA'; this.aiError.set(m); this.appendAiLog('error', m); } catch { /* ignore */ }
      this.aiRunning.set(false); this.closeAiStream();
    });
    es.onerror = () => {
      if (this.aiRunning()) this.aiError.set(this.aiError() || 'Connexion au flux IA interrompue');
      this.aiRunning.set(false); this.closeAiStream();
    };
  }

  private appendAiLog(stream: string, text: string) {
    if (!text) return;
    this.aiLog.update(log => {
      const next = [...log, { stream, text }];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }

  private closeAiStream() {
    if (this.aiEventSource) { this.aiEventSource.close(); this.aiEventSource = null; }
  }

  // ── Résultats manuels (OK / KO / ND) ──

  getResult(itemId: string): TestResult {
    const run = this.activeRun();
    if (!run) return { itemId, status: 'pending' };
    return run.results.find(r => r.itemId === itemId) || { itemId, status: 'pending' };
  }

  setResult(itemId: string, status: 'ok' | 'ko' | 'pending') {
    const run = this.activeRun();
    if (!run) return;
    const results = run.results.map(r => r.itemId === itemId ? { ...r, status } : r);
    this.activeRun.set({ ...run, results });
    this.scheduleSave([{ itemId, status, note: results.find(r => r.itemId === itemId)?.note }]);
  }

  setNote(itemId: string, note: string) {
    const run = this.activeRun();
    if (!run) return;
    const results = run.results.map(r => r.itemId === itemId ? { ...r, note } : r);
    this.activeRun.set({ ...run, results });
    this.scheduleSave([{ itemId, status: results.find(r => r.itemId === itemId)?.status || 'pending', note }]);
  }

  scheduleSave(changed: any[]) {
    if (this.saveDebounce) clearTimeout(this.saveDebounce);
    this.saveDebounce = setTimeout(() => this.persistResults(changed), 2000);
  }

  async persistResults(changed: any[]) {
    const run = this.activeRun();
    if (!run) return;
    this.saving.set(true);
    try {
      await fetch(`${API}/api/admin/tests/runs/${run.id}`, {
        method: 'PUT', headers: this.authHeaders,
        body: JSON.stringify({ results: changed })
      });
    } finally { this.saving.set(false); }
  }

  async completeRun() {
    const run = this.activeRun();
    if (!run) return;
    this.closeAiStream();
    this.aiRunning.set(false);
    if (this.saveDebounce) clearTimeout(this.saveDebounce);
    this.saving.set(true);
    try {
      await fetch(`${API}/api/admin/tests/runs/${run.id}`, {
        method: 'PUT', headers: this.authHeaders,
        body: JSON.stringify({ results: run.results, status: 'completed' })
      });
    } finally { this.saving.set(false); }
    this.activeRun.set(null);
    this.runComment.set('');
    await this.loadRuns();
    await this.loadMatrix();
    this.activeTab.set('resultats');
  }

  // ── Confirmation (annulation / suppression) ──

  askCancelRun() {
    const run = this.activeRun();
    if (run) this.confirmPopup.set({ kind: 'cancel', runId: run.id, label: run.name || run.tester });
  }

  askDeleteRun(runId: string, label: string, ev?: Event) {
    ev?.stopPropagation();
    this.confirmPopup.set({ kind: 'delete', runId, label });
  }

  cancelConfirm() { this.confirmPopup.set(null); }

  async confirmAction() {
    const c = this.confirmPopup();
    if (!c) return;
    if (c.kind === 'cancel') { this.closeAiStream(); this.aiRunning.set(false); }
    if (this.saveDebounce) clearTimeout(this.saveDebounce);
    try {
      await fetch(`${API}/api/admin/tests/runs/${c.runId}`, { method: 'DELETE', headers: this.authHeaders });
    } finally {
      this.confirmPopup.set(null);
    }
    if (c.kind === 'cancel') { this.activeRun.set(null); this.runComment.set(''); }
    await this.loadRuns();
    await this.loadMatrix();
  }

  // ── Divers ──

  getFunctionLabel(itemId: string): string {
    const fn = this.functions().find(f => f.id === itemId);
    return fn ? `${fn.pageTitle} — ${fn.section}` : itemId;
  }

  getFunctionContent(itemId: string): string {
    return this.functions().find(f => f.id === itemId)?.content || '';
  }

  copyId(id: string) { navigator.clipboard.writeText(id).catch(() => {}); }

  /** Ouvre, dans l'explorateur de fichiers local, le dossier contenant le fonctions.md. */
  async openFolder(relPath: string, ev?: Event) {
    ev?.stopPropagation();
    if (!relPath) return;
    try {
      const res = await fetch(`${API}/api/admin/tests/open-folder`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({ path: relPath })
      });
      if (!res.ok) this.runsError.set((await res.json()).error || 'Échec ouverture du dossier');
    } catch (e: any) {
      this.runsError.set(e.message || 'Échec ouverture du dossier');
    }
  }

  formatDate(iso: string | undefined | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /** Date courte pour les en-têtes de colonnes de la matrice (jj/mm hh:mm). */
  formatDateShort(iso: string | undefined | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
