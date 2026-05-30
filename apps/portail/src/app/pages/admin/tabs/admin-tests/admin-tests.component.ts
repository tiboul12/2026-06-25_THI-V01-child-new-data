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
