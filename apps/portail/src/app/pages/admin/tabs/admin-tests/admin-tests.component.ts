import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { AuthService } from '@worganic/portail-core/data-access';
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
export class AdminTestsComponent implements OnInit {
  private authService = inject(AuthService);

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
    this.runsError.set('');
    this.showLaunchPopup.set(true);
  }

  closeLaunchPopup() { this.showLaunchPopup.set(false); }

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

  /** Crée le run avec le nom et les sections sélectionnées. */
  async confirmLaunch() {
    const selected = [...this.launchSelected()];
    if (selected.length === 0) { this.runsError.set('Sélectionnez au moins une section'); return; }
    this.runsError.set('');
    try {
      const allIds = this.launchGroups().map(g => g.folderId);
      // Toutes les sections cochées → [] (= toutes) ; sinon le sous-ensemble.
      const folderIds = selected.length === allIds.length ? [] : selected;
      const res = await fetch(`${API}/api/admin/tests/runs`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({ tester: this.runnerName(), name: this.launchName().trim() || null, folderIds })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur création run');
      const run = await res.json();
      this.activeRun.set(run);
      this.showLaunchPopup.set(false);
      this.view.set('runner');
    } catch (e: any) {
      this.runsError.set(e.message || 'Erreur création run');
    }
  }

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
