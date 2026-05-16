import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { environment } from '../../../../environments/environment';

const API = environment.apiDataUrl;

@Component({
  selector: 'app-deployments',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './deployments.component.html',
})
export class DeploymentsComponent implements OnInit {
  deployments = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  versionStatus = signal<{ upToDate: boolean; localVersion: string; latestDeployment: any } | null>(null);

  async ngOnInit() {
    await Promise.all([this.loadVersionStatus(), this.loadDeployments()]);
  }

  async loadVersionStatus() {
    try {
      const res = await fetch(`${API}/api/version/check`);
      if (res.ok) this.versionStatus.set(await res.json());
    } catch { /* silencieux */ }
  }

  async loadDeployments() {
    this.loading.set(true);
    this.error.set('');
    try {
      const token = localStorage.getItem('frankenstein_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API}/api/admin/deployments`, { headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement');
      this.deployments.set(await res.json());
    } catch (e: any) {
      this.error.set(e?.message || 'Erreur chargement');
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(d: string): string {
    if (!d) return '—';
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
      case 'FIX':         return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'AMELIORATION': return 'bg-light-primary/10 dark:bg-primary/10 text-light-primary dark:text-primary border border-light-primary/20 dark:border-primary/20';
      case 'MERGE':       return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      default:            return '';
    }
  }

  parseScopeList(scope: string): string[] {
    if (!scope) return [];
    return scope.split(',').map(s => s.trim()).filter(Boolean);
  }

  getScopedRows(scope: string, features: string): Array<{scope: string, features: string[]}> {
    const scopes = scope ? scope.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (!scopes.length) return [];
    if (!features) return scopes.map(s => ({ scope: s, features: [] }));
    // Nouveau format scopé : "frankenstein:deployments|admin,system:workflow"
    if (features.includes(':')) {
      return scopes.map(s => {
        for (const entry of features.split(',')) {
          const [sc, f] = entry.split(':');
          if (sc?.trim() === s && f) return { scope: s, features: f.split('|').map(x => x.trim()).filter(Boolean) };
        }
        return { scope: s, features: [] };
      });
    }
    // Ancien format positionnel : "deployments,workflow" → 1er feature = 1er scope, etc.
    const featList = features.split(',').map(s => s.trim()).filter(Boolean);
    return scopes.map((s, i) => ({ scope: s, features: featList[i] ? [featList[i]] : [] }));
  }

  scopeClass(s: string): string {
    switch (s) {
      case 'frankenstein': return 'bg-light-primary/10 dark:bg-primary/10 text-light-primary dark:text-primary border border-light-primary/20 dark:border-primary/20';
      case 'server':       return 'bg-green-500/10 text-green-400 border border-green-500/20';
      case 'electron':     return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'data':         return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      default:             return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  }
}
