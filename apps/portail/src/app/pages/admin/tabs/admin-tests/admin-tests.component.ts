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
    const groups = new Map<string, { path: string; pageTitle: string; folderId: string; items: FunctionItem[] }>();
    for (const item of this.functions()) {
      if (!groups.has(item.path)) groups.set(item.path, { path: item.path, pageTitle: item.pageTitle, folderId: item.folderId, items: [] });
      groups.get(item.path)!.items.push(item);
    }
    return [...groups.values()];
  });

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

  async startNewRun() {
    await this.loadFunctions();
    this.runsError.set('');
    try {
      const res = await fetch(`${API}/api/admin/tests/runs`, {
        method: 'POST', headers: this.authHeaders,
        body: JSON.stringify({ tester: this.runnerName() })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur création run');
      const run = await res.json();
      this.activeRun.set(run);
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

  async deleteRun(runId: string) {
    await fetch(`${API}/api/admin/tests/runs/${runId}`, { method: 'DELETE', headers: this.authHeaders });
    if (this.view() === 'detail') { this.detailRun.set(null); this.view.set('dashboard'); }
    await this.loadDashboard();
  }

  getFunctionLabel(itemId: string): string {
    const fn = this.functions().find(f => f.id === itemId);
    return fn ? `${fn.pageTitle} — ${fn.section}` : itemId;
  }

  copyId(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
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
