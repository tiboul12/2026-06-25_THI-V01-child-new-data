import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WoActionHistoryService, WoActionEntry } from '../../../core/services/wo-action-history.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfigService } from '../../../core/services/config.service';

@Component({
  selector: 'app-wo-action-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wo-action-history.component.html',
  styleUrl: './wo-action-history.component.scss'
})
export class WoActionHistoryComponent implements OnInit {
  private historyService = inject(WoActionHistoryService);
  private auth = inject(AuthService);
  private configService = inject(ConfigService);

  loading = signal(false);
  undoing = signal<string | null>(null);
  redoing = signal<string | null>(null);
  error = signal('');
  showInfo = signal(false);

  readonly trackedTools = [
    {
      label: 'Admin › Utilisateurs',
      section: 'admin/users',
      icon: 'manage_accounts',
      colorText: 'text-red-400',
      colorBg: 'bg-red-500/5 border-red-500/15',
      actions: [
        { type: 'create', label: 'Création',     undoable: true,  note: 'Supprime l\'utilisateur créé' },
        { type: 'update', label: 'Modification', undoable: true,  note: 'Restaure username, email, rôle' },
        { type: 'delete', label: 'Suppression',  undoable: false, note: 'Non réversible — mot de passe non récupérable' }
      ]
    },
    {
      label: 'Documents › Catégories',
      section: 'documents',
      icon: 'folder',
      colorText: 'text-blue-400',
      colorBg: 'bg-blue-500/5 border-blue-500/15',
      actions: [
        { type: 'create', label: 'Création catégorie',     undoable: true,  note: 'Supprime la catégorie créée' },
        { type: 'update', label: 'Modification catégorie', undoable: true,  note: 'Restaure nom et description' },
        { type: 'delete', label: 'Suppression catégorie',  undoable: false, note: 'Non réversible' }
      ]
    },
    {
      label: 'Documents › Documents',
      section: 'documents',
      icon: 'description',
      colorText: 'text-sky-400',
      colorBg: 'bg-sky-500/5 border-sky-500/15',
      actions: [
        { type: 'create', label: 'Création document',     undoable: true,  note: 'Supprime le document créé' },
        { type: 'update', label: 'Modification document', undoable: true,  note: 'Restaure titre, description, catégorie, visibilité — contenu texte non inclus' },
        { type: 'delete', label: 'Suppression document',  undoable: false, note: 'Non réversible — contenu définitivement perdu' }
      ]
    },
    {
      label: 'Projets › Éditeur',
      section: 'projets',
      icon: 'edit_note',
      colorText: 'text-emerald-400',
      colorBg: 'bg-emerald-500/5 border-emerald-500/15',
      actions: [
        { type: 'create', label: 'Création section',     undoable: true,  note: 'Supprime la section créée' },
        { type: 'update', label: 'Renommage section',    undoable: true,  note: 'Restaure le nom précédent' },
        { type: 'update', label: 'Modification contenu', undoable: true,  note: 'Restaure le contenu précédent — diff ligne par ligne' },
        { type: 'delete', label: 'Suppression section',  undoable: false, note: 'Non réversible — perte des sous-sections et fichiers' }
      ]
    },
    {
      label: 'Admin › Config',
      section: 'admin/config',
      icon: 'settings',
      colorText: 'text-amber-400',
      colorBg: 'bg-amber-500/5 border-amber-500/15',
      actions: [
        { type: 'toggle', label: 'Toggle setting/outil/provider/modèle', undoable: true,  note: 'Restaure l\'état précédent du toggle — undo/redo illimité' },
        { type: 'update', label: 'Sauvegarde clés API',                  undoable: false, note: 'Valeurs des clés non enregistrées, seulement le statut actif' }
      ]
    }
  ];

  filterSectionValue = '';
  filterUserIdValue = '';
  filterActionTypeValue = '';
  filterDateMode: 'all' | 'today' | 'week' | 'month' | 'custom' = 'all';
  filterDateCustom = '';

  get isAdmin() { return this.auth.currentUser()?.role === 'admin'; }

  get availableSections(): string[] {
    const sections = new Set(this.historyService.entries().map(e => e.section));
    return Array.from(sections).sort();
  }

  get availableUsers(): { id: string; name: string }[] {
    const users = new Map<string, string>();
    this.historyService.entries().forEach(e => {
      if (e.userId && e.username) users.set(e.userId, e.username);
    });
    return Array.from(users.entries()).map(([id, name]) => ({ id, name }));
  }

  get filteredEntries(): WoActionEntry[] {
    let list = this.historyService.entries();
    if (this.filterSectionValue)    list = list.filter(e => e.section === this.filterSectionValue);
    if (this.filterUserIdValue)     list = list.filter(e => e.userId === this.filterUserIdValue);
    if (this.filterActionTypeValue) list = list.filter(e => e.actionType === this.filterActionTypeValue);
    if (this.filterDateMode !== 'all') {
      const now = new Date();
      const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (this.filterDateMode === 'today') {
        const start = startOf(now);
        list = list.filter(e => new Date(e.timestamp) >= start);
      } else if (this.filterDateMode === 'week') {
        const start = startOf(now);
        start.setDate(start.getDate() - ((now.getDay() + 6) % 7)); // lundi
        list = list.filter(e => new Date(e.timestamp) >= start);
      } else if (this.filterDateMode === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        list = list.filter(e => new Date(e.timestamp) >= start);
      } else if (this.filterDateMode === 'custom' && this.filterDateCustom) {
        const start = new Date(this.filterDateCustom);
        const end   = new Date(this.filterDateCustom);
        end.setDate(end.getDate() + 1);
        list = list.filter(e => { const t = new Date(e.timestamp); return t >= start && t < end; });
      }
    }
    return list;
  }

  get activeDateLabel(): string {
    const labels: Record<string, string> = {
      all: '', today: "Aujourd'hui", week: 'Cette semaine', month: 'Ce mois'
    };
    if (this.filterDateMode === 'custom' && this.filterDateCustom) {
      return new Date(this.filterDateCustom).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return labels[this.filterDateMode] || '';
  }

  setDateMode(mode: string) {
    this.filterDateMode = mode as 'all' | 'today' | 'week' | 'month' | 'custom';
    this.filterDateCustom = '';
  }

  resetDateFilter() {
    this.filterDateMode = 'all';
    this.filterDateCustom = '';
  }

  get groupedEntries(): { day: string; entries: WoActionEntry[] }[] {
    const groups = new Map<string, WoActionEntry[]>();
    for (const entry of this.filteredEntries) {
      const day = new Date(entry.timestamp).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(entry);
    }
    return Array.from(groups.entries()).map(([day, entries]) => ({ day, entries }));
  }

  get undoableCount(): number {
    return this.filteredEntries.filter(e => e.undoable && !e.undone).length;
  }

  get redoableCount(): number {
    return this.filteredEntries.filter(e => e.undone && !!e.redoAction).length;
  }

  async ngOnInit() {
    await this.loadHistory();
  }

  async loadHistory() {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.historyService.load({ limit: 300 });
    } catch {
      this.error.set("Erreur lors du chargement de l'historique");
    } finally {
      this.loading.set(false);
    }
  }

  async undoAction(entry: WoActionEntry) {
    if (!entry.undoable || entry.undone || this.undoing() || this.redoing()) return;
    this.undoing.set(entry.id);
    this.error.set('');
    try {
      await this.historyService.undo(entry.id);
      if (entry.section === 'admin/config') this.configService.loadCliConfig();
      await this.loadHistory();
    } catch (e: any) {
      this.error.set(e?.error?.error || "Erreur lors de l'annulation");
    } finally {
      this.undoing.set(null);
    }
  }

  async redoAction(entry: WoActionEntry) {
    if (!entry.undone || !entry.redoAction || this.redoing() || this.undoing()) return;
    this.redoing.set(entry.id);
    this.error.set('');
    try {
      await this.historyService.redo(entry.id);
      if (entry.section === 'admin/config') this.configService.loadCliConfig();
      await this.loadHistory();
    } catch (e: any) {
      this.error.set(e?.error?.error || "Erreur lors du rétablissement");
    } finally {
      this.redoing.set(null);
    }
  }

  private readonly sensitiveFields = new Set(['password', 'token', 'secret', 'hash']);
  // Champs affichés via le diff ligne-à-ligne (git-like) au lieu du diff inline
  private readonly longTextFields = new Set(['content']);

  expandedDiffs = signal<Set<string>>(new Set());

  toggleDiff(entryId: string) {
    this.expandedDiffs.update(set => {
      const next = new Set(set);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });
  }

  isDiffExpanded(entryId: string): boolean {
    return this.expandedDiffs().has(entryId);
  }

  hasContentDiff(entry: WoActionEntry): boolean {
    const before = this.parseState(entry.beforeState);
    const after = this.parseState(entry.afterState);
    const b = before?.['content'];
    const a = after?.['content'];
    if (typeof b !== 'string' && typeof a !== 'string') return false;
    return (b ?? '') !== (a ?? '');
  }

  // Diff ligne-à-ligne (style git) basé sur LCS
  getContentDiff(entry: WoActionEntry): { type: 'same' | 'add' | 'del'; text: string; oldNum: number; newNum: number }[] {
    const before = this.parseState(entry.beforeState);
    const after = this.parseState(entry.afterState);
    const beforeText = typeof before?.['content'] === 'string' ? before!['content'] : '';
    const afterText  = typeof after?.['content']  === 'string' ? after!['content']  : '';
    if (beforeText === afterText) return [];

    const a = beforeText.split('\n');
    const b = afterText.split('\n');
    const n = a.length, m = b.length;

    // LCS DP — coût mémoire n*m, acceptable pour fichiers <~2000 lignes
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const result: { type: 'same' | 'add' | 'del'; text: string; oldNum: number; newNum: number }[] = [];
    let i = 0, j = 0, oldNum = 1, newNum = 1;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        result.push({ type: 'same', text: a[i], oldNum: oldNum++, newNum: newNum++ });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        result.push({ type: 'del', text: a[i], oldNum: oldNum++, newNum: 0 });
        i++;
      } else {
        result.push({ type: 'add', text: b[j], oldNum: 0, newNum: newNum++ });
        j++;
      }
    }
    while (i < n) result.push({ type: 'del', text: a[i++], oldNum: oldNum++, newNum: 0 });
    while (j < m) result.push({ type: 'add', text: b[j++], oldNum: 0, newNum: newNum++ });
    return result;
  }

  diffStats(entry: WoActionEntry): { adds: number; dels: number } {
    const lines = this.getContentDiff(entry);
    let adds = 0, dels = 0;
    for (const l of lines) {
      if (l.type === 'add') adds++;
      else if (l.type === 'del') dels++;
    }
    return { adds, dels };
  }

  private parseState(state: any): Record<string, any> | null {
    if (!state) return null;
    if (typeof state === 'string') {
      try { return JSON.parse(state); } catch { return null; }
    }
    if (typeof state === 'object' && !Array.isArray(state)) return state;
    return null;
  }

  getDiffFields(entry: WoActionEntry): { field: string; before: any; after: any }[] {
    const before = this.parseState(entry.beforeState);
    const after = this.parseState(entry.afterState);

    if (entry.actionType === 'update' && before && after) {
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      return Array.from(allKeys)
        .filter(k => !this.sensitiveFields.has(k) && !this.longTextFields.has(k))
        .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        .map(k => ({ field: k, before: before[k], after: after[k] }));
    }
    if (entry.actionType === 'create' && after) {
      return Object.entries(after)
        .filter(([k]) => !this.sensitiveFields.has(k) && !this.longTextFields.has(k))
        .map(([k, v]) => ({ field: k, before: null, after: v }));
    }
    if (entry.actionType === 'delete' && before) {
      return Object.entries(before)
        .filter(([k]) => !this.sensitiveFields.has(k) && !this.longTextFields.has(k))
        .map(([k, v]) => ({ field: k, before: v, after: null }));
    }
    return [];
  }

  fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      username: 'Nom', email: 'Email', role: 'Rôle',
      name: 'Nom', description: 'Description', category: 'Catégorie',
      visible: 'Visibilité', visibility: 'Visibilité', title: 'Titre',
      active: 'Actif', enabled: 'Activé', categoryId: 'Catégorie',
      headerIaVisible: 'Header IA', appVersion: 'Version app',
      geminiActive: 'Gemini actif', claudeActive: 'Claude actif'
    };
    return labels[field] || field;
  }

  formatFieldValue(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Activé' : 'Désactivé';
    return String(val);
  }

  actionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      create: 'Création', update: 'Modification', delete: 'Suppression',
      toggle: 'Activation', upload: 'Import', navigate: 'Navigation',
      undo: 'Annulation', redo: 'Rétablissement'
    };
    return labels[type] || type;
  }

  actionTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      create: 'add_circle', update: 'edit', delete: 'delete',
      toggle: 'toggle_on', upload: 'upload_file', navigate: 'navigation',
      undo: 'undo', redo: 'redo'
    };
    return icons[type] || 'history';
  }

  actionTypeColor(type: string): string {
    const colors: Record<string, string> = {
      create: 'text-emerald-400',
      update: 'text-blue-400',
      delete: 'text-red-400',
      toggle: 'text-violet-400',
      upload: 'text-amber-400',
      navigate: 'text-gray-400',
      undo: 'text-orange-400',
      redo: 'text-cyan-400'
    };
    return colors[type] || 'text-gray-400';
  }

  actionTypeBgBorder(type: string): string {
    const colors: Record<string, string> = {
      create: 'bg-emerald-500/10 border-emerald-500/20',
      update: 'bg-blue-500/10 border-blue-500/20',
      delete: 'bg-red-500/10 border-red-500/20',
      toggle: 'bg-violet-500/10 border-violet-500/20',
      upload: 'bg-amber-500/10 border-amber-500/20',
      navigate: 'bg-gray-500/10 border-gray-500/20',
      undo: 'bg-orange-500/10 border-orange-500/20',
      redo: 'bg-cyan-500/10 border-cyan-500/20'
    };
    return colors[type] || 'bg-gray-500/10 border-gray-500/20';
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  formatContextLabel(context: Record<string, any> | undefined): string {
    if (!context) return '';
    if (context['projectName']) return `Projet : ${context['projectName']}`;
    if (context['categoryName']) return `Catégorie : ${context['categoryName']}`;
    return '';
  }

  sectionLabel(section: string): string {
    const labels: Record<string, string> = {
      'admin/users':  'Admin › Utilisateurs',
      'admin/config': 'Admin › Config',
      'documents':    'Documents',
      'projets':      'Projets'
    };
    return labels[section] || section;
  }
}
