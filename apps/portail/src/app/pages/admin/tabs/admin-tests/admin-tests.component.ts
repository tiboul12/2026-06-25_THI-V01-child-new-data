import { Component, OnInit, OnDestroy, signal, computed, inject, effect, ViewChild, ElementRef } from '@angular/core';
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
  content: string;   // contenu markdown sous le ## heading
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
  aiProvider?: string | null;
  aiModel?: string | null;
  aiState?: 'idle' | 'running' | 'done' | 'error';
  prompt?: string | null;
}

interface TestRunDetail extends TestRunSummary { results: TestResult[]; }

interface TopKoEntry { itemId: string; count: number; }

interface FlatTreeNode {
  depth: number;
  name: string;
  fullPath: string;
  folderId: string;    // '' pour les nœuds intermédiaires sans fonctions.md
  pageTitle: string;
  items: FunctionItem[];
  hasChildren: boolean;
}

type View = 'dashboard' | 'runner' | 'detail';

@Component({
  selector: 'app-admin-tests',
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: './admin-tests.component.html',
})
export class AdminTestsComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private configService = inject(ConfigService);

  // Conteneur du journal IA — pour auto-scroll en bas à chaque nouvelle ligne.
  @ViewChild('aiLogBox') aiLogBox?: ElementRef<HTMLDivElement>;

  constructor() {
    // Auto-scroll du journal live vers le bas dès qu'une ligne est ajoutée.
    effect(() => {
      this.aiLog();
      const el = this.aiLogBox?.nativeElement;
      if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    });
  }

  view = signal<View>('dashboard');

  // Dashboard
  runs        = signal<TestRunSummary[]>([]);
  topKo       = signal<TopKoEntry[]>([]);
  loadingRuns = signal(false);
  runsError   = signal('');

  // Runner
  functions        = signal<FunctionItem[]>([]);
  loadingFunctions = signal(false);
  activeRun        = signal<TestRunDetail | null>(null);
  runnerName       = signal('');
  saving           = signal(false);
  private saveDebounce: any = null;

  groupedFunctions = computed(() => {
    // Si un run est actif, n'afficher que les fonctions qu'il couvre (run filtré par section).
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

  // ── Popup de lancement (nom + sélection de sections) ──
  showLaunchPopup = signal(false);
  launchName      = signal('');
  launchSelected  = signal<Set<string>>(new Set<string>());

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

  // ── Mode de lancement : manuel ou automatique (IA via Claude Code + Browser MCP) ──
  launchMode  = signal<'manual' | 'ai'>('manual');
  aiProvider  = signal('');   // baseId : 'claude' | 'antigravity'
  aiModel     = signal('');
  aiPrompt    = signal('');   // consignes éditables (le format de retour est imposé serveur)

  /** Providers CLI agentiques disponibles (depuis admin/config) — seuls pilotables via MCP. */
  aiProviders = computed(() => this.configService.cliConfig().availableProviders.filter(p => p.type === 'cli'));

  /** Modèles disponibles pour le provider IA sélectionné. */
  aiModels = computed(() => {
    const base = this.aiProvider();
    const list = this.configService.cliConfig().modelsList as Record<string, { value: string; label: string }[]>;
    return list[base] || [];
  });

  /** Bloc "format de retour" imposé, affiché en lecture seule (exemple pour un retour constant). */
  aiFormatExample =
`@@TEST_RESULT@@{"itemId":"<id>","status":"ok|ko|nd","note":"<observation courte>"}
Exemple :
@@TEST_RESULT@@{"itemId":"2-5-2-11-1","status":"ok","note":""}
@@TEST_RESULT@@{"itemId":"2-5-2-11-2","status":"ko","note":"Le panneau ne s'affiche pas après clic"}`;

  // État du run IA en cours (affichage progressif)
  aiRunning  = signal(false);
  aiProgress = signal<{ done: number; total: number }>({ done: 0, total: 0 });
  aiError    = signal('');
  // Journal live du travail de l'IA (stdout/stderr/info renvoyés au fil de l'eau)
  aiLog      = signal<{ stream: string; text: string }[]>([]);
  showAiLog  = signal(true);
  private aiEventSource: EventSource | null = null;

  // ── Popup de confirmation (annulation d'un run en cours / suppression) ──
  confirmPopup = signal<{ kind: 'cancel' | 'delete'; runId: string; label: string } | null>(null);

  // Référentiel de fonctions — arbre hiérarchique (dashboard)
  showFunctionsTree  = signal(false);
  treeExpandedPaths  = signal<Set<string>>(new Set<string>());
  expandedItemIds    = signal<Set<string>>(new Set<string>());

  flatTree = computed((): FlatTreeNode[] => {
    const fns = this.functions();
    if (fns.length === 0) return [];

    // Grouper les items par path (= dossier contenant un fonctions.md)
    const byPath = new Map<string, FunctionItem[]>();
    for (const fn of fns) {
      if (!byPath.has(fn.path)) byPath.set(fn.path, []);
      byPath.get(fn.path)!.push(fn);
    }

    // Collecter tous les chemins intermédiaires
    const allPaths = new Set<string>();
    for (const p of byPath.keys()) {
      const parts = p.split('/');
      for (let i = 1; i <= parts.length; i++) {
        allPaths.add(parts.slice(0, i).join('/'));
      }
    }

    return [...allPaths].sort().map(p => {
      const depth      = p.split('/').length - 1;
      const name       = p.split('/').pop()!;
      const items      = byPath.get(p) || [];
      const folderId   = items.length > 0 ? items[0].folderId : '';
      const pageTitle  = items.length > 0 ? items[0].pageTitle : '';
      const hasChildren = [...allPaths].some(other => other.startsWith(p + '/'));
      return { depth, name, fullPath: p, folderId, pageTitle, items, hasChildren };
    });
  });

  isNodeVisible(fullPath: string): boolean {
    const parts   = fullPath.split('/');
    const expanded = this.treeExpandedPaths();
    if (parts.length === 1) return true;
    for (let i = 1; i < parts.length; i++) {
      if (!expanded.has(parts.slice(0, i).join('/'))) return false;
    }
    return true;
  }

  isExpanded(path: string): boolean { return this.treeExpandedPaths().has(path); }

  toggleTreeNode(path: string) {
    this.treeExpandedPaths.update(s => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  expandAll() {
    // Inclut dossiers branch ET feuilles pour que les fonctions s'affichent aussi
    const allPaths = this.flatTree().map(n => n.fullPath);
    this.treeExpandedPaths.set(new Set(allPaths));
  }

  collapseAll() {
    this.treeExpandedPaths.set(new Set<string>());
    this.expandedItemIds.set(new Set<string>());
  }

  isItemExpanded(id: string): boolean { return this.expandedItemIds().has(id); }

  toggleItemExpand(id: string) {
    this.expandedItemIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  // Detail
  detailRun     = signal<TestRunDetail | null>(null);
  detailFilter  = signal<'all' | 'ko'>('all');
  loadingDetail = signal(false);

  detailResultsSorted = computed(() => {
    const run = this.detailRun();
    if (!run) return [];
    const order: Record<string, number> = { ko: 0, ok: 1, pending: 2 };
    const list = this.detailFilter() === 'ko'
      ? run.results.filter(r => r.status === 'ko')
      : [...run.results];
    return list.sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
  });

  private get authHeaders(): Record<string, string> {
    const token = this.authService.getToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user) this.runnerName.set(user.username);
    this.loadDashboard();
  }

  async loadDashboard() {
    this.loadingRuns.set(true);
    this.runsError.set('');
    try {
      const res = await fetch(`${API}/api/admin/tests/runs`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement');
      const data = await res.json();
      this.runs.set(data.runs);
      this.topKo.set(data.topKo);
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur');
    } finally {
      this.loadingRuns.set(false);
    }
  }

  async refreshFunctions() {
    this.functions.set([]);
    await fetch(`${API}/api/admin/tests/functions/refresh`, { method: 'POST', headers: this.authHeaders });
    await this.loadFunctions();
  }

  /** Ouvre le popup de lancement : charge les fonctions, pré-sélectionne toutes les sections. */
  async openLaunchPopup() {
    await this.loadFunctions();
    this.launchName.set('');
    this.selectAllLaunch();
    this.initAiDefaults();
    this.runsError.set('');
    this.showLaunchPopup.set(true);
  }

  closeLaunchPopup() { this.showLaunchPopup.set(false); }

  /** Valeurs par défaut du mode automatique (provider/modèle depuis admin/config, consignes). */
  private initAiDefaults() {
    this.launchMode.set('manual');
    this.aiError.set('');
    const providers = this.aiProviders();
    const header = this.configService.cliConfig().headerSelection;
    const headerBase = (header.provider || '').split('-')[0];
    const chosen = providers.find(p => p.baseId === headerBase) || providers[0];
    this.aiProvider.set(chosen?.baseId || '');
    const models = this.aiModels();
    this.aiModel.set(models.find(m => m.value === header.model)?.value || models[0]?.value || '');
    this.aiPrompt.set(this.defaultAiInstructions());
  }

  /** Quand le provider change, recaler le modèle sur le premier disponible. */
  onAiProviderChange(base: string) {
    this.aiProvider.set(base);
    this.aiModel.set(this.aiModels()[0]?.value || '');
  }

  private defaultAiInstructions(): string {
    return [
      "Tu es un testeur QA. L'application Worganic est ouverte et CONNECTÉE dans le navigateur",
      "(onglet piloté via l'extension Browser MCP). Utilise les outils du navigateur pour tester",
      "réellement chaque fonctionnalité listée d'après ses tâches, puis renvoie l'état de chaque",
      "test au fur et à mesure (un résultat par fonction, sans attendre la fin)."
    ].join(' ');
  }

  /**
   * Ouvre le popup de lancement (même composant) depuis un nœud du référentiel,
   * avec la/les section(s) du nœud pré-cochée(s). Un nœud branche pré-coche toutes
   * ses sous-sections testables ; un nœud feuille uniquement la sienne.
   */
  async openLaunchForNode(fullPath: string, ev?: Event) {
    ev?.stopPropagation();
    await this.loadFunctions();
    this.launchName.set('');
    const ids = this.flatTree()
      .filter(n => n.folderId && (n.fullPath === fullPath || n.fullPath.startsWith(fullPath + '/')))
      .map(n => n.folderId);
    this.launchSelected.set(new Set(ids));
    this.initAiDefaults();
    this.runsError.set('');
    this.showLaunchPopup.set(true);
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

  /** Crée le run avec le nom et les sections sélectionnées (manuel ou automatique IA). */
  async confirmLaunch() {
    const selected = [...this.launchSelected()];
    if (selected.length === 0) { this.runsError.set('Sélectionnez au moins une section'); return; }
    const isAi = this.launchMode() === 'ai';
    if (isAi && !this.aiProvider()) { this.runsError.set('Aucun provider IA disponible — active un CLI dans admin/config'); return; }
    this.runsError.set('');
    try {
      const allIds = this.launchGroups().map(g => g.folderId);
      // Toutes les sections cochées → [] (= toutes) ; sinon le sous-ensemble.
      const folderIds = selected.length === allIds.length ? [] : selected;
      const res = await fetch(`${API}/api/admin/tests/runs`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({
          tester: this.runnerName(),
          name: this.launchName().trim() || null,
          folderIds,
          ...(isAi ? { mode: 'ai', aiProvider: this.aiProvider(), aiModel: this.aiModel(), prompt: this.aiPrompt().trim() } : {})
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur création run');
      const run = await res.json();
      this.activeRun.set(run);
      this.showLaunchPopup.set(false);
      this.view.set('runner');
      if (isAi) this.startAiRun(run.id);
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur création run');
    }
  }

  /** Lance le test automatique IA : ouvre le flux SSE et applique les résultats au fur et à mesure. */
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
    // Erreur de connexion EventSource (executor coupé, etc.)
    es.onerror = () => {
      if (this.aiRunning()) this.aiError.set(this.aiError() || 'Connexion au flux IA interrompue');
      this.aiRunning.set(false); this.closeAiStream();
    };
  }

  /** Ajoute une ligne au journal live de l'IA (borné à 500 lignes pour rester léger). */
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

  aiProgressPct = computed(() => {
    const p = this.aiProgress();
    return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  });

  ngOnDestroy() { this.closeAiStream(); }

  async loadFunctions() {
    if (this.functions().length > 0) return;
    this.loadingFunctions.set(true);
    try {
      const res = await fetch(`${API}/api/admin/tests/functions`, { headers: this.authHeaders });
      if (!res.ok) throw new Error('Erreur chargement fonctions');
      const data = await res.json();
      this.functions.set(data.functions);
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur chargement fonctions');
    } finally {
      this.loadingFunctions.set(false);
    }
  }

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
    await this.loadDashboard();
    this.view.set('dashboard');
  }

  async openDetail(runId: string) {
    this.loadingDetail.set(true);
    this.detailFilter.set('all');
    this.view.set('detail');
    await this.loadFunctions();
    try {
      const res = await fetch(`${API}/api/admin/tests/runs/${runId}`, { headers: this.authHeaders });
      if (!res.ok) throw new Error('Erreur chargement run');
      this.detailRun.set(await res.json());
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur');
      this.view.set('dashboard');
    } finally { this.loadingDetail.set(false); }
  }

  resumeRun() {
    const run = this.detailRun();
    if (!run) return;
    this.activeRun.set(run);
    this.view.set('runner');
  }

  /** Demande confirmation d'annulation du run en cours (abandon = suppression). */
  askCancelRun() {
    const run = this.activeRun();
    if (run) this.confirmPopup.set({ kind: 'cancel', runId: run.id, label: run.name || run.tester });
  }

  /** Demande confirmation de suppression d'un run (terminé ou en cours). */
  askDeleteRun(runId: string, label: string, ev?: Event) {
    ev?.stopPropagation();
    this.confirmPopup.set({ kind: 'delete', runId, label });
  }

  cancelConfirm() { this.confirmPopup.set(null); }

  /** Exécute l'action confirmée (annulation ou suppression) : supprime le run côté serveur. */
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
    if (c.kind === 'cancel') this.activeRun.set(null);
    if (this.view() !== 'dashboard') { this.detailRun.set(null); this.view.set('dashboard'); }
    await this.loadDashboard();
  }

  getFunctionLabel(itemId: string): string {
    const fn = this.functions().find(f => f.id === itemId);
    return fn ? `${fn.pageTitle} — ${fn.section}` : itemId;
  }

  /** Contenu markdown (liste des tâches à tester) d'une fonction par son ID. */
  getFunctionContent(itemId: string): string {
    return this.functions().find(f => f.id === itemId)?.content || '';
  }

  copyId(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
  }

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

  getStatusIcon(status: string): string {
    if (status === 'ok') return 'check_circle';
    if (status === 'ko') return 'cancel';
    return 'radio_button_unchecked';
  }
}
