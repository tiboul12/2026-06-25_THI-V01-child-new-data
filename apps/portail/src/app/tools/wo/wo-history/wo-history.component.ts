import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

const API = environment.apiDataUrl;

interface HistoryEntry {
  id: string;
  date: string;
  type: 'feature' | 'fix' | 'refactor' | 'config';
  title: string;
  description: string;
  files: string[];
  ai?: string;
  model?: string;
  startedAt?: string;
  completedAt?: string;
  featured?: boolean;
}

type TimelineItem =
  | { kind: 'sep'; day: string; count: number; totalDurationMs: number | null }
  | { kind: 'item'; mod: HistoryEntry };

@Component({
    selector: 'wo-history',
    imports: [CommonModule, FormsModule],
    templateUrl: './wo-history.component.html',
    styleUrl: './wo-history.component.scss'
})
export class WoHistoryComponent implements OnInit {
  modifications: HistoryEntry[] = [];
  loading = true;
  error = '';
  expandedId: string | null = null;
  showStats = true;

  filterType = 'all';
  searchText = '';
  filterPage = '';
  filterAi = '';
  filterModel = '';

  readonly typeConfig: Record<string, { label: string; icon: string; color: string }> = {
    feature:  { label: 'Fonctionnalité', icon: 'add_circle', color: 'purple' },
    fix:      { label: 'Correction',     icon: 'bug_report', color: 'red'    },
    refactor: { label: 'Refactoring',    icon: 'build',      color: 'blue'   },
    config:   { label: 'Configuration',  icon: 'settings',   color: 'orange' }
  };

  readonly filterOptions = [
    { value: 'all',      label: 'Tous' },
    { value: 'feature',  label: 'Fonctionnalité' },
    { value: 'fix',      label: 'Correction' },
    { value: 'refactor', label: 'Refactoring' },
    { value: 'config',   label: 'Configuration' },
  ];

  constructor(private http: HttpClient) {}

  ngOnInit() { this.load(); }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const data: any = await this.http.get(`${API}/api/history`).toPromise();
      this.modifications = data.modifications || [];
    } catch {
      this.error = 'Impossible de charger l\'historique.';
    } finally {
      this.loading = false;
    }
  }

  async toggleFeatured(entry: HistoryEntry, event: Event) {
    event.stopPropagation();
    entry.featured = !entry.featured;
    try {
      await this.http.put(`${API}/api/history/${entry.id}`, { featured: entry.featured }).toPromise();
    } catch (e) {
      console.error('Erreur lors de la mise à jour de featured', e);
      entry.featured = !entry.featured;
    }
  }

  toggle(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  getType(type: string) {
    return this.typeConfig[type] ?? this.typeConfig['feature'];
  }

  get filteredAndSorted(): HistoryEntry[] {
    let list = [...this.modifications];
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (this.filterType !== 'all') list = list.filter(m => m.type === this.filterType);
    if (this.filterPage) list = list.filter(m => this.getPageNames(m.files).includes(this.filterPage));
    if (this.filterAi) list = list.filter(m => m.ai === this.filterAi);
    if (this.filterModel) list = list.filter(m => m.model === this.filterModel);
    const q = this.searchText.trim().toLowerCase();
    if (q) list = list.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
    return list;
  }

  get availableAis(): string[] {
    return [...new Set(this.modifications.map(m => m.ai).filter((v): v is string => !!v))];
  }

  get availableModels(): string[] {
    const src = this.filterAi
      ? this.modifications.filter(m => m.ai === this.filterAi)
      : this.modifications;
    return [...new Set(src.map(m => m.model).filter((v): v is string => !!v))];
  }

  get timelineItems(): TimelineItem[] {
    const result: TimelineItem[] = [];
    let lastDayKey = '';
    const sorted = this.filteredAndSorted;
    for (const mod of sorted) {
      const dayKey = this.getDayKey(mod.date);
      if (dayKey !== lastDayKey) {
        const dayMods = sorted.filter(m => this.getDayKey(m.date) === dayKey);
        const durMods = dayMods.filter(m => this.getDurationMs(m) !== null);
        const totalDurationMs = durMods.length > 0
          ? durMods.reduce((acc, m) => acc + (this.getDurationMs(m) ?? 0), 0)
          : null;
        result.push({ kind: 'sep', day: this.formatDay(mod.date), count: dayMods.length, totalDurationMs });
        lastDayKey = dayKey;
      }
      result.push({ kind: 'item', mod });
    }
    return result;
  }

  getDurationMs(entry: HistoryEntry): number | null {
    if (!entry.startedAt || !entry.completedAt) return null;
    const ms = new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime();
    return ms > 0 ? ms : null;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return '<1s';
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
  }

  get typeBreakdown() {
    const total = this.modifications.length;
    if (total === 0) return [];
    return [
      { key: 'feature',  label: 'Fonctionnalité', color: 'bar-purple', count: this.modifications.filter(m => m.type === 'feature').length },
      { key: 'fix',      label: 'Correction',     color: 'bar-red',    count: this.modifications.filter(m => m.type === 'fix').length },
      { key: 'refactor', label: 'Refactoring',    color: 'bar-blue',   count: this.modifications.filter(m => m.type === 'refactor').length },
      { key: 'config',   label: 'Configuration',  color: 'bar-orange', count: this.modifications.filter(m => m.type === 'config').length },
    ].map(t => ({ ...t, pct: Math.round(t.count / total * 100) }));
  }

  get stats() {
    const mods = this.modifications;
    if (mods.length === 0) return null;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const startOfWeek = new Date(now);
    const wd = now.getDay();
    startOfWeek.setDate(now.getDate() + (wd === 0 ? -6 : 1 - wd));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayCount     = mods.filter(m => m.date?.startsWith(todayStr)).length;
    const thisWeekCount  = mods.filter(m => new Date(m.date) >= startOfWeek).length;
    const thisMonthCount = mods.filter(m => new Date(m.date) >= startOfMonth).length;
    const activeDays  = new Set(mods.map(m => m.date?.slice(0, 10)).filter(Boolean));
    const avgPerDay   = activeDays.size > 0 ? +(mods.length / activeDays.size).toFixed(1) : 0;
    const activeWeeks = new Set(mods.map(m => {
      const d = new Date(m.date);
      const wday = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() + (wday === 0 ? -6 : 1 - wday));
      return mon.toISOString().slice(0, 10);
    }));
    const avgPerWeek = activeWeeks.size > 0 ? +(mods.length / activeWeeks.size).toFixed(1) : 0;
    const withDuration   = mods.filter(m => this.getDurationMs(m) !== null);
    const totalDurationMs = withDuration.reduce((acc, m) => acc + (this.getDurationMs(m) ?? 0), 0);
    const avgDurationMs  = withDuration.length > 0 ? totalDurationMs / withDuration.length : null;
    return {
      total: mods.length, todayCount, thisWeekCount, thisMonthCount,
      activeDaysCount: activeDays.size, activeWeeksCount: activeWeeks.size,
      avgPerDay, avgPerWeek, withDuration: withDuration.length,
      totalDurationMs: withDuration.length > 0 ? totalDurationMs : null,
      avgDurationMs,
    };
  }

  countByType(type: string): number {
    if (type === 'all') return this.modifications.length;
    return this.modifications.filter(m => m.type === type).length;
  }

  private getDayKey(dateStr: string): string {
    try { return new Date(dateStr).toISOString().slice(0, 10); }
    catch { return dateStr; }
  }

  formatDay(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch { return dateStr; }
  }

  formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateStr; }
  }

  getPageNames(files: string[]): string[] {
    const pages = new Set<string>();
    for (const f of files) {
      const m = f.match(/\/pages\/([^/]+)\//);
      if (m) pages.add(m[1]);
    }
    return [...pages];
  }

  formatDescription(text: string): string {
    if (!text) return '';
    return text
      .replace(/\s+(\d+\))/g, '<br>$1')
      .replace(/\.\s+([A-ZÀ-Ü])/g, '.<br>$1');
  }

  formatDateShort(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateStr; }
  }

  getAiLogo(ai?: string): { type: 'img' | 'icon', value: string } {
    const name = ai?.toLowerCase() || '';
    if (name.includes('claude'))  return { type: 'img',  value: 'https://api.iconify.design/logos:claude-icon.svg' };
    if (name.includes('gemini'))  return { type: 'img',  value: 'https://api.iconify.design/logos:google-gemini.svg' };
    return { type: 'icon', value: 'smart_toy' };
  }
}
