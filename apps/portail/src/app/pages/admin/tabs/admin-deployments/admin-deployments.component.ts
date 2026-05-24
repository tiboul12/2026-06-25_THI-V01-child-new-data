import { Component, OnInit, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@worganic/portail-core/data-access';
import { environment } from '../../../../../environments/environment';

const API = environment.apiDataUrl;

@Component({
    selector: 'app-admin-deployments',
    imports: [CommonModule, FormsModule],
    templateUrl: './admin-deployments.component.html'
})
export class AdminDeploymentsComponent implements OnInit {
  @Output() versionStatusChange = new EventEmitter<any>();

  deployments = signal<any[]>([]);
  deployFilterType = signal<string>('');
  deployFilterAi = signal<string>('');
  deployFilterBranch = signal<string>('');
  loadingDeploy = signal(false);
  gitStatusLoading = signal(false);
  migrating = signal(false);
  migrateResult = signal<any>(null);
  deployError = signal('');
  showDeployForm = signal(false);
  deployVersion = '';
  deployCommitName = '';
  deployDescription = '';
  deployFiles = '';
  deployAi = '';
  deployModel = '';
  deployModIds = '';
  expandedDeploy = signal<number | null>(null);
  versionStatus = signal<any>(null);
  gitLocal = signal<any>(null);
  gitStatus = signal<any>(null);
  branchCommits = signal<any[]>([]);

  readonly deployCommitTypes: readonly string[] = ['FIX', 'AMELIORATION', 'MERGE'];

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.loadVersionStatus();
    this.loadDeployments();
    this.loadGitLocal();
    this.loadBranchCommits();
  }

  private get authHeaders(): Record<string, string> {
    const token = this.authService.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async loadDeployments() {
    this.loadingDeploy.set(true);
    this.deployError.set('');
    try {
      const res = await fetch(`${API}/api/admin/deployments`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement');
      this.deployments.set(await res.json());
    } catch (e: any) {
      this.deployError.set(e?.message || 'Erreur chargement déploiements');
    } finally {
      this.loadingDeploy.set(false);
    }
  }

  async loadVersionStatus() {
    try {
      const res = await fetch(`${API}/api/version/check`);
      const data = await res.json();
      this.versionStatus.set(data);
      this.versionStatusChange.emit(data);
    } catch (e) { console.error('[VERSION]', e); }
  }

  async loadGitLocal() {
    try {
      const res = await fetch(`${API}/api/admin/git-local`, { headers: this.authHeaders });
      if (res.ok) this.gitLocal.set(await res.json());
    } catch (e) { console.error('[GIT LOCAL]', e); }
  }

  async loadBranchCommits() {
    try {
      const res = await fetch(`${API}/api/admin/branch-commits`, { headers: this.authHeaders });
      if (res.ok) {
        const data = await res.json();
        this.branchCommits.set(data.commits || []);
      }
    } catch (e) { console.error('[BRANCH COMMITS]', e); }
  }

  async loadGitStatus() {
    this.gitStatusLoading.set(true);
    try {
      const res = await fetch(`${API}/api/admin/git-status`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur git');
      this.gitStatus.set(await res.json());
    } catch (e: any) {
      this.gitStatus.set({ error: e?.message || 'Erreur git' });
    } finally {
      this.gitStatusLoading.set(false);
    }
  }

  async migrateVersions() {
    this.migrating.set(true);
    this.migrateResult.set(null);
    try {
      const res = await fetch(`${API}/api/admin/migrate-versions`, {
        method: 'POST',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur migration');
      this.migrateResult.set(data);
      await this.loadVersionStatus();
      await this.loadDeployments();
    } catch (e: any) {
      this.migrateResult.set({ error: e?.message });
    } finally {
      this.migrating.set(false);
    }
  }

  get localVersion(): string { return this.versionStatus()?.localVersion || '—'; }
  get currentBranch(): string {
    return this.gitLocal()?.currentBranch || this.versionStatus()?.currentBranch || 'main';
  }
  get mainUpToDate(): boolean { return this.versionStatus()?.upToDate ?? true; }

  get hasLegacyVersions(): boolean {
    return this.deployments().some(d => /^(THI-|B0\.|B\d+\.)/.test(d.version || ''));
  }

  openDeployForm() {
    this.deployVersion = this.versionStatus()?.localVersion || '';
    this.deployCommitName = '';
    this.deployDescription = '';
    this.deployFiles = '';
    this.deployAi = '';
    this.deployModel = '';
    this.deployModIds = '';
    this.deployError.set('');
    this.showDeployForm.set(true);
  }

  closeDeployForm() {
    this.showDeployForm.set(false);
    this.deployError.set('');
  }

  async saveDeployment() {
    if (!this.deployVersion.trim()) return;
    this.loadingDeploy.set(true);
    this.deployError.set('');
    try {
      const filesArray = this.deployFiles.split('\n').map(f => f.trim()).filter(f => f.length > 0);
      const res = await fetch(`${API}/api/admin/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders },
        body: JSON.stringify({
          version: this.deployVersion,
          commitName: this.deployCommitName,
          description: this.deployDescription,
          filesModified: filesArray,
          ai: this.deployAi,
          model: this.deployModel,
          modIds: this.deployModIds
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      await this.loadVersionStatus();
      await this.loadDeployments();
      this.showDeployForm.set(false);
    } catch (e: any) {
      this.deployError.set(e?.message || 'Erreur sauvegarde');
    } finally {
      this.loadingDeploy.set(false);
    }
  }

  toggleDeployDetail(id: number): void {
    this.expandedDeploy.set(this.expandedDeploy() === id ? null : id);
  }

  parseDeployFiles(raw: string | null): string[] {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  formatDeployDate(d: string): string {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return d; }
  }

  extractCommitType(commitName: string): string | null {
    const match = commitName?.match(/\[(FIX|AMELIORATION|MERGE)\]/);
    return match ? match[1] : null;
  }

  shortCommitType(type: string | null): string {
    switch (type) {
      case 'FIX':          return 'FIX';
      case 'AMELIORATION': return 'AME';
      case 'MERGE':        return 'MRG';
      default:             return type || '';
    }
  }

  extractCommitTitle(commitName: string): string {
    if (!commitName) return '—';
    return commitName.replace(/\s*-\s*\[(FIX|AMELIORATION|MERGE)\]\s*-\s*/, ' - ').trim();
  }

  commitTypeClass(type: string | null): string {
    switch (type) {
      case 'FIX':          return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'AMELIORATION': return 'bg-light-primary/10 dark:bg-primary/10 text-light-primary dark:text-primary border border-light-primary/20 dark:border-primary/20';
      case 'MERGE':        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      default:             return '';
    }
  }

  get filteredDeployments(): any[] {
    return this.deployments().filter(dep => {
      const typeMatch   = !this.deployFilterType()   || this.extractCommitType(dep.commit_name) === this.deployFilterType();
      const aiMatch     = !this.deployFilterAi()     || dep.ai === this.deployFilterAi();
      const branchMatch = !this.deployFilterBranch() ||
        (this.deployFilterBranch() === 'main'   ? (!dep.branch || dep.branch === 'main') : dep.branch === this.deployFilterBranch());
      return typeMatch && aiMatch && branchMatch;
    });
  }

  get uniqueDeployAis(): string[] {
    return [...new Set(this.deployments().map(d => d.ai).filter(Boolean))];
  }

  get uniqueBranches(): string[] {
    const branches = [...new Set(this.deployments().map(d => d.branch).filter(b => b && b !== 'main'))];
    return branches as string[];
  }

  getScopedRows(scope: string, features: string): Array<{scope: string, features: string[]}> {
    const scopes = scope ? scope.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (!scopes.length) return [];
    if (!features) return scopes.map(s => ({ scope: s, features: [] }));
    if (features.includes(':')) {
      return scopes.map(s => {
        for (const entry of features.split(',')) {
          const [sc, f] = entry.split(':');
          if (sc?.trim() === s && f) return { scope: s, features: f.split('|').map(x => x.trim()).filter(Boolean) };
        }
        return { scope: s, features: [] };
      });
    }
    const featList = features.split(',').map(s => s.trim()).filter(Boolean);
    return scopes.map((s, i) => ({ scope: s, features: featList[i] ? [featList[i]] : [] }));
  }

  scopeClass(s: string): string {
    switch (s) {
      case 'portail':  return 'bg-light-primary/10 dark:bg-primary/10 text-light-primary dark:text-primary border border-light-primary/20 dark:border-primary/20';
      case 'projets':  return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      case 'server':   return 'bg-green-500/10 text-green-400 border border-green-500/20';
      case 'libs':     return 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
      case 'electron': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'data':     return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      default:         return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  }

  isCurrentMain(dep: any): boolean {
    return (!dep.branch || dep.branch === 'main') && dep.version === this.versionStatus()?.localVersion;
  }

  isCurrentBranch(dep: any): boolean {
    return dep.branch && dep.branch !== 'main' && dep.branch === this.currentBranch;
  }

  deployRowClass(dep: any): string {
    if (this.isCurrentMain(dep))
      return 'bg-yellow-500/[0.06] hover:bg-yellow-500/10 border-l-2 border-l-yellow-500/50 transition-colors';
    if (this.isCurrentBranch(dep))
      return 'bg-violet-500/[0.06] hover:bg-violet-500/10 border-l-2 border-l-violet-500/50 transition-colors';
    if (dep.branch && dep.branch !== 'main')
      return 'bg-violet-500/[0.02] hover:bg-violet-500/5 transition-colors';
    return 'hover:bg-light-primary/5 dark:hover:bg-primary/5 transition-colors';
  }
}
