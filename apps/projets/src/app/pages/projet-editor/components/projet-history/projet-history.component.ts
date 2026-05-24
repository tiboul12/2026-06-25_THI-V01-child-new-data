import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjetCollabService, CollabHistoryEntry } from '@worganic/portail-core/data-access';
import { AuthService } from '@worganic/portail-core/data-access';

export interface DisplayHistoryEntry extends CollabHistoryEntry {
  pendingState?: 'editing' | 'saving';
}

interface HistoryGroup {
  date: string;
  entries: DisplayHistoryEntry[];
  isToday: boolean;
}

@Component({
  selector: 'app-projet-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projet-history.component.html',
  host: { class: 'flex flex-col min-h-0 flex-1 overflow-hidden' },
})
export class ProjetHistoryComponent implements OnChanges {
  @Input() projetId: string | null = null;
  @Input() activeIds: Set<string> | null = null;
  @Output() entryClick = new EventEmitter<CollabHistoryEntry>();

  readonly collab = inject(ProjetCollabService);
  readonly auth = inject(AuthService);
  loadingEntryId: string | null = null;

  private readonly _activeIds = signal<Set<string> | null>(null);

  // Jours dépliés explicitement par l'utilisateur (les autres restent repliés sauf le jour courant)
  readonly expandedDays = signal<Set<string>>(new Set());
  // Jours explicitement repliés (pour pouvoir replier le jour courant qui est déplié par défaut)
  readonly collapsedDays = signal<Set<string>>(new Set());

  // Modale de confirmation d'effacement
  readonly clearOpen = signal(false);
  readonly clearScope = signal<'mine' | 'all'>('mine');
  readonly clearLoading = signal(false);

  readonly currentUserId = computed(() => this.auth.currentUser()?.id || '');
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  // Toutes les entrées (pending + sauvegardées) après filtre par entité active
  readonly filteredEntries = computed<DisplayHistoryEntry[]>(() => {
    const ids = this._activeIds();
    const saved = this.collab.history();
    const pending = this.collab.pending();
    const me = this.auth.currentUser();
    const pendingDisplay: DisplayHistoryEntry[] = pending.map(p => ({
      id: `pending-${p.entityId}`,
      timestamp: p.timestamp,
      section: 'projets/contenu',
      actionType: 'update',
      label: p.label,
      entityType: 'content',
      entityId: p.entityId,
      entityLabel: '',
      userId: me?.id || null,
      username: p.username,
      undone: false,
      pendingState: p.state,
    }));
    let entries: DisplayHistoryEntry[] = [...pendingDisplay, ...saved];
    if (ids && ids.size > 0) entries = entries.filter(e => !!e.entityId && ids.has(e.entityId));
    return entries;
  });

  readonly groups = computed<HistoryGroup[]>(() => {
    const todayKey = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const map = new Map<string, DisplayHistoryEntry[]>();
    for (const e of this.filteredEntries()) {
      const day = new Date(e.timestamp).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    return Array.from(map.entries()).map(([date, ents]) => ({ date, entries: ents, isToday: date === todayKey }));
  });

  isDayExpanded(date: string, isToday: boolean): boolean {
    if (this.expandedDays().has(date)) return true;
    if (this.collapsedDays().has(date)) return false;
    return isToday;
  }

  toggleDay(date: string, isToday: boolean) {
    const expanded = this.isDayExpanded(date, isToday);
    if (expanded) {
      // replier
      this.expandedDays.update(s => { const n = new Set(s); n.delete(date); return n; });
      this.collapsedDays.update(s => { const n = new Set(s); n.add(date); return n; });
    } else {
      // déplier
      this.collapsedDays.update(s => { const n = new Set(s); n.delete(date); return n; });
      this.expandedDays.update(s => { const n = new Set(s); n.add(date); return n; });
    }
  }

  // Compteur d'entrées concernées par l'effacement (selon scope choisi)
  readonly clearTargetCount = computed(() => {
    const scope = this.clearScope();
    const meId = this.currentUserId();
    return this.filteredEntries().filter(e => !e.pendingState && (scope === 'all' || e.userId === meId)).length;
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projetId'] && this.projetId) {
      this.collab.connect(this.projetId);
    }
    if (changes['activeIds']) {
      this._activeIds.set(this.activeIds);
    }
  }

  reload() {
    if (this.projetId) this.collab.loadHistory(this.projetId);
  }

  isMine(entry: DisplayHistoryEntry): boolean {
    return !!entry.userId && entry.userId === this.currentUserId();
  }

  isClickable(entry: DisplayHistoryEntry): boolean {
    if (entry.pendingState) return false;
    return entry.section === 'projets/contenu' && entry.actionType === 'update';
  }

  openClear() {
    this.clearScope.set(this.isAdmin() ? 'all' : 'mine');
    this.clearOpen.set(true);
  }

  cancelClear() {
    if (this.clearLoading()) return;
    this.clearOpen.set(false);
  }

  setScope(scope: 'mine' | 'all') {
    if (scope === 'all' && !this.isAdmin()) return;
    this.clearScope.set(scope);
  }

  async confirmClear() {
    if (!this.projetId || this.clearLoading()) return;
    this.clearLoading.set(true);
    try {
      const ids = this._activeIds();
      const entityIds = ids && ids.size > 0 ? Array.from(ids) : undefined;
      await this.collab.clearHistory(this.projetId, { entityIds, scope: this.clearScope() });
      this.clearOpen.set(false);
    } catch (e) {
      console.warn('[History] clear error:', e);
    } finally {
      this.clearLoading.set(false);
    }
  }

  async onEntryClick(entry: DisplayHistoryEntry) {
    if (!this.isClickable(entry)) return;
    const hasLoaded = (
      (entry.beforeState != null && typeof entry.beforeState === 'object' && 'content' in entry.beforeState) ||
      (entry.afterState  != null && typeof entry.afterState  === 'object' && 'content' in entry.afterState)
    );
    if (hasLoaded) {
      this.entryClick.emit(entry);
      return;
    }
    this.loadingEntryId = entry.id;
    try {
      const full = await this.collab.fetchEntry(entry.id);
      this.entryClick.emit(full);
    } catch (e) {
      console.warn('[History] fetchEntry error:', e);
      this.entryClick.emit(entry);
    } finally {
      this.loadingEntryId = null;
    }
  }

  getActionIcon(entry: CollabHistoryEntry): string {
    const { actionType, section } = entry;
    if (actionType === 'create') return section.includes('sections') ? 'create_new_folder' : 'note_add';
    if (actionType === 'delete') return 'delete';
    if (actionType === 'upload') return 'image';
    if (actionType === 'update' && section.includes('contenu')) return 'edit_document';
    if (actionType === 'update') return 'edit';
    if (actionType === 'undo') return 'undo';
    if (actionType === 'redo') return 'redo';
    return 'history';
  }

  getIconBgColor(entry: CollabHistoryEntry): string {
    const { actionType } = entry;
    if (actionType === 'create') return 'bg-green-500/20';
    if (actionType === 'delete') return 'bg-red-500/20';
    if (actionType === 'upload') return 'bg-blue-500/20';
    if (actionType === 'update') return 'bg-yellow-500/20';
    if (actionType === 'undo' || actionType === 'redo') return 'bg-purple-500/20';
    return 'bg-white/8';
  }

  getIconColor(entry: CollabHistoryEntry): string {
    const { actionType } = entry;
    if (actionType === 'create') return 'text-green-400';
    if (actionType === 'delete') return 'text-red-400';
    if (actionType === 'upload') return 'text-blue-400';
    if (actionType === 'update') return 'text-yellow-400';
    if (actionType === 'undo' || actionType === 'redo') return 'text-purple-400';
    return 'text-white/40';
  }

  formatTime(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}
