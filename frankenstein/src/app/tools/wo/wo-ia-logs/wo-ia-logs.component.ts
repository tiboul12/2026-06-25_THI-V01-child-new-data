import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

const API = 'http://localhost:3001';

@Component({
    selector: 'wo-ia-logs',
    imports: [CommonModule, FormsModule],
    templateUrl: './wo-ia-logs.component.html',
    styleUrl: './wo-ia-logs.component.scss'
})
export class WoIaLogsComponent implements OnInit {
  aiLogs: any[] = [];
  aiLogExpanded = new Set<string>();
  aiLogSortColumn = 'timestamp';
  aiLogSortDirection = 'desc';
  loading = false;

  // Filtres
  filterSearch   = '';
  filterStatus   = '';          // '' | 'success' | 'error'
  filterProvider = '';          // '' | 'gemini' | 'claude' | ...
  filterPeriod   = '';          // '' | 'today' | '7d' | '30d'
  filterPage     = '';
  filterModel    = '';

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadAiLogs(); }

  async loadAiLogs() {
    this.loading = true;
    try {
      const logs: any = await this.http.get(`${API}/api/ai-logs`).toPromise();
      this.aiLogs = logs || [];
    } catch (e) {
      console.error('[wo-ia-logs] load error', e);
    } finally {
      this.loading = false;
    }
  }

  async clearAiLogs() {
    if (!confirm('Vider tous les logs IA ?')) return;
    try {
      await this.http.delete(`${API}/api/ai-logs`).toPromise();
      this.aiLogs = [];
      this.resetFilters();
    } catch (e) { console.error('[wo-ia-logs] clear error', e); }
  }

  resetFilters() {
    this.filterSearch   = '';
    this.filterStatus   = '';
    this.filterProvider = '';
    this.filterPeriod   = '';
    this.filterPage     = '';
    this.filterModel    = '';
  }

  get hasActiveFilter(): boolean {
    return !!(this.filterSearch || this.filterStatus || this.filterProvider || this.filterPeriod || this.filterPage || this.filterModel);
  }

  filterByCell(field: 'page' | 'provider' | 'model' | 'status', value: string, event: Event) {
    event.stopPropagation();
    switch (field) {
      case 'page':     this.filterPage     = this.filterPage     === value ? '' : value; break;
      case 'provider': this.filterProvider = this.filterProvider === value ? '' : value; break;
      case 'model':    this.filterModel    = this.filterModel    === value ? '' : value; break;
      case 'status':   this.filterStatus   = this.filterStatus   === value ? '' : value; break;
    }
  }

  // Valeurs uniques de provider pour le select dynamique
  get uniqueProviders(): string[] {
    const set = new Set<string>();
    this.aiLogs.forEach(l => { if (l.provider) set.add(l.provider); });
    return Array.from(set).sort();
  }

  get filteredLogs(): any[] {
    const search  = this.filterSearch.toLowerCase().trim();
    const now     = new Date();
    const cutoffs: Record<string, Date> = {
      today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      '7d':  new Date(now.getTime() - 7  * 86400_000),
      '30d': new Date(now.getTime() - 30 * 86400_000),
    };

    return this.aiLogs.filter(log => {
      // Recherche texte
      if (search && !['page','section','documentName','model','provider','prompt','response']
          .some(f => String(log[f] ?? '').toLowerCase().includes(search))) return false;
      // Status
      if (this.filterStatus && log.status !== this.filterStatus) return false;
      // Provider
      if (this.filterProvider && log.provider !== this.filterProvider) return false;
      // Page
      if (this.filterPage && log.page !== this.filterPage) return false;
      // Model
      if (this.filterModel && log.model !== this.filterModel) return false;
      // Période
      if (this.filterPeriod && cutoffs[this.filterPeriod]) {
        const ts = new Date(log.timestamp);
        if (isNaN(ts.getTime()) || ts < cutoffs[this.filterPeriod]) return false;
      }
      return true;
    });
  }

  get sortedLogs(): any[] {
    const col = this.aiLogSortColumn;
    const dir = this.aiLogSortDirection === 'asc' ? 1 : -1;
    return [...this.filteredLogs].sort((a, b) => {
      const va = a[col] ?? '';
      const vb = b[col] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  toggleAiLogExpand(id: string) {
    if (this.aiLogExpanded.has(id)) this.aiLogExpanded.delete(id);
    else this.aiLogExpanded.add(id);
  }

  sortAiLogs(column: string) {
    if (this.aiLogSortColumn === column) {
      this.aiLogSortDirection = this.aiLogSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.aiLogSortColumn = column;
      this.aiLogSortDirection = 'asc';
    }
  }

  formatAiLogDate(ts: string): string {
    if (!ts) return '--';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ts; }
  }

  sortIcon(col: string): string {
    if (this.aiLogSortColumn !== col) return '';
    return this.aiLogSortDirection === 'asc' ? '▲' : '▼';
  }
}
