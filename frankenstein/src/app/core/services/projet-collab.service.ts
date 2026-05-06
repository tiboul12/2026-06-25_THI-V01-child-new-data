import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

const API = environment.apiDataUrl;

export interface LockInfo {
  nodeId: string;
  projetId: string;
  lockedById: string;
  lockedByName: string;
  lockedAt: string;
}

export interface CollabHistoryEntry {
  id: string;
  timestamp: string;
  section: string;
  actionType: string;
  label: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  userId: string | null;
  username: string;
  undone: boolean;
  beforeState?: { content?: string } | null;
  afterState?: { content?: string } | null;
  context?: Record<string, any>;
}

export interface PendingHistoryEntry {
  entityId: string;
  label: string;
  username: string;
  timestamp: string;
  state: 'editing' | 'saving';
}

@Injectable({ providedIn: 'root' })
export class ProjetCollabService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly history = signal<CollabHistoryEntry[]>([]);
  readonly pending = signal<PendingHistoryEntry[]>([]);
  readonly locks = signal<Map<string, LockInfo>>(new Map());
  readonly connected = signal(false);

  private eventSource: EventSource | null = null;
  private currentProjetId: string | null = null;

  connect(projetId: string): void {
    if (this.currentProjetId === projetId) return;
    this.disconnect();
    this.currentProjetId = projetId;
    this.loadHistory(projetId);
    this.loadLocks(projetId);
    this.openSSE(projetId);
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this.currentProjetId = null;
    this.connected.set(false);
    this.history.set([]);
    this.pending.set([]);
    this.locks.set(new Map());
  }

  upsertPending(entry: PendingHistoryEntry): void {
    this.pending.update(list => {
      const idx = list.findIndex(e => e.entityId === entry.entityId);
      if (idx >= 0) {
        const next = list.slice();
        next[idx] = { ...next[idx], timestamp: entry.timestamp, label: entry.label, state: entry.state };
        return next;
      }
      return [entry, ...list];
    });
  }

  clearPending(entityId: string | number): void {
    const idStr = String(entityId).trim();
    this.pending.update(list => list.filter(e => String(e.entityId).trim() !== idStr));
  }

  clearAllPending(): void {
    this.pending.set([]);
  }

  // Bascule toutes les entrées en cours d'édition vers l'état "en cours de sauvegarde"
  markAllPendingSaving(): void {
    this.pending.update(list => list.map(e =>
      e.state === 'editing' ? { ...e, state: 'saving' as const } : e
    ));
  }

  async loadHistory(projetId: string): Promise<void> {
    try {
      const entries = await firstValueFrom(
        this.http.get<CollabHistoryEntry[]>(`${API}/api/collab/${projetId}/history?limit=200`)
      );
      this.history.set(entries);
    } catch (e) {
      console.warn('[Collab] loadHistory error:', e);
    }
  }

  async loadLocks(projetId: string): Promise<void> {
    try {
      const locks = await firstValueFrom(
        this.http.get<LockInfo[]>(`${API}/api/collab/${projetId}/locks`)
      );
      const map = new Map<string, LockInfo>();
      for (const lock of locks) map.set(lock.nodeId, lock);
      this.locks.set(map);
    } catch (e) {
      console.warn('[Collab] loadLocks error:', e);
    }
  }

  private openSSE(projetId: string): void {
    try {
      this.eventSource = new EventSource(`${API}/api/collab/${projetId}/stream`);

      this.eventSource.addEventListener('connected', () => {
        this.connected.set(true);
      });

      this.eventSource.addEventListener('history', (e: MessageEvent) => {
        try {
          const entry: CollabHistoryEntry = JSON.parse(e.data);
          console.log('[Collab] SSE History event received:', entry);
          this.history.update(list => [entry, ...list.slice(0, 199)]);
          if (entry.entityId) {
            this.clearPending(entry.entityId);
          }
        } catch (err) {
          console.warn('[Collab] SSE history parse error:', err);
        }
      });

      this.eventSource.addEventListener('lock', (e: MessageEvent) => {
        const lock: LockInfo = JSON.parse(e.data);
        this.locks.update(map => { const m = new Map(map); m.set(lock.nodeId, lock); return m; });
      });

      this.eventSource.addEventListener('unlock', (e: MessageEvent) => {
        const { nodeId } = JSON.parse(e.data);
        this.locks.update(map => { const m = new Map(map); m.delete(nodeId); return m; });
      });

      this.eventSource.onerror = () => {
        this.connected.set(false);
        this.eventSource?.close();
        this.eventSource = null;
        setTimeout(() => {
          if (this.currentProjetId === projetId) this.openSSE(projetId);
        }, 5000);
      };
    } catch (e) {
      console.warn('[Collab] SSE init error:', e);
    }
  }

  async lockNode(projetId: string, nodeId: string): Promise<LockInfo> {
    const user = this.auth.currentUser();
    return firstValueFrom(
      this.http.post<LockInfo>(`${API}/api/collab/${projetId}/nodes/${nodeId}/lock`, {
        userId: user?.id || 'anonymous',
        userName: user?.username || 'Utilisateur'
      })
    );
  }

  async unlockNode(projetId: string, nodeId: string): Promise<void> {
    const user = this.auth.currentUser();
    await firstValueFrom(
      this.http.delete(`${API}/api/collab/${projetId}/nodes/${nodeId}/lock?userId=${user?.id || ''}`)
    );
  }

  async fetchEntry(entryId: string): Promise<CollabHistoryEntry> {
    return firstValueFrom(
      this.http.get<CollabHistoryEntry>(`${API}/api/wo-action-history/${entryId}`)
    );
  }

  async clearHistory(projetId: string, opts: { entityIds?: string[]; scope?: 'mine' | 'all' } = {}): Promise<number> {
    const params: string[] = [];
    if (opts.scope) params.push(`scope=${encodeURIComponent(opts.scope)}`);
    if (opts.entityIds && opts.entityIds.length > 0) {
      params.push(`entityIds=${encodeURIComponent(opts.entityIds.join(','))}`);
    }
    const qs = params.length ? `?${params.join('&')}` : '';
    const res = await firstValueFrom(
      this.http.delete<{ success: boolean; deleted: number }>(
        `${API}/api/collab/${projetId}/history${qs}`,
        { headers: this.auth.getAuthHeaders() }
      )
    );
    // Retire localement les entrées concernées (le SSE n'émet pas pour les deletes)
    const ids = opts.entityIds && opts.entityIds.length > 0 ? new Set(opts.entityIds) : null;
    const me = this.auth.currentUser();
    this.history.update(list => list.filter(e => {
      const matchEntity = !ids || (e.entityId && ids.has(e.entityId));
      const matchScope = opts.scope === 'all' || (e.userId === (me?.id || ''));
      // garder l'entrée si elle ne tombe PAS dans la suppression
      return !(matchEntity && matchScope);
    }));
    return res.deleted;
  }

  isLockedByMe(nodeId: string): boolean {
    const user = this.auth.currentUser();
    const lock = this.locks().get(nodeId);
    return !!lock && lock.lockedById === (user?.id || '');
  }

  isLockedByOther(nodeId: string): boolean {
    const user = this.auth.currentUser();
    const lock = this.locks().get(nodeId);
    return !!lock && lock.lockedById !== (user?.id || '');
  }

  getLock(nodeId: string): LockInfo | undefined {
    return this.locks().get(nodeId);
  }
}
