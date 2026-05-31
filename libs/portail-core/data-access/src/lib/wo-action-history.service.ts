import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { API_DATA_URL } from './tokens';

export type WoActionType = 'create' | 'update' | 'delete' | 'toggle' | 'upload' | 'navigate' | 'undo' | 'redo' | 'ai-update';

export interface WoUndoAction {
  endpoint: string;
  method: 'DELETE' | 'PUT' | 'POST' | 'PATCH';
  payload?: any;
}

export interface WoRestoredContent {
  nodeId: string;
  folderId: string | null;
  content: string;
}

export interface WoActionEntry {
  id: string;
  timestamp: string;
  section: string;
  subsection?: string;
  actionType: WoActionType;
  label: string;
  entityType?: string;
  entityId?: string | number;
  entityLabel?: string;
  beforeState?: any;
  afterState?: any;
  userId?: string;
  username?: string;
  context?: Record<string, any>;
  undoable: boolean;
  undone: boolean;
  undoneAt?: string;
  undoneBy?: string;
  undoAction?: WoUndoAction;
  redoAction?: WoUndoAction;
  meta?: Record<string, any>;
}

export interface WoActionHistoryFilters {
  section?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  contextKey?: string;
  contextValue?: string;
  undoableOnly?: string;
  limit?: number;
  offset?: number;
}

@Injectable({ providedIn: 'root' })
export class WoActionHistoryService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = inject(API_DATA_URL);

  private _entries = signal<WoActionEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  async track(ctx: Omit<WoActionEntry, 'id' | 'timestamp' | 'userId' | 'username' | 'undone'>): Promise<WoActionEntry> {
    const user = this.auth.currentUser();
    try {
      const entry = await firstValueFrom(
        this.http.post<WoActionEntry>(`${this.apiUrl}/api/wo-action-history`, {
          ...ctx,
          userId: user?.id,
          username: user?.username
        })
      );
      this._entries.update(list => [entry, ...list]);
      return entry;
    } catch (e) {
      console.warn('[WoActionHistory] track error:', e);
      throw e;
    }
  }

  async undo(actionId: string): Promise<{ trackedActionId?: string; restored?: WoRestoredContent | null }> {
    const user = this.auth.currentUser();
    const res = await firstValueFrom(
      this.http.post<{ success: boolean; trackedActionId?: string; restored?: WoRestoredContent | null }>(`${this.apiUrl}/api/wo-action-history/${actionId}/undo`, {
        undoneBy: user?.username
      })
    );
    this._entries.update(list =>
      list.map(e => e.id === actionId
        ? { ...e, undone: true, undoneAt: new Date().toISOString(), undoneBy: user?.username }
        : e
      )
    );
    return { trackedActionId: res?.trackedActionId, restored: res?.restored ?? null };
  }

  async undoCascade(actionId: string): Promise<{ undoneIds: string[]; trackedActionId?: string; restored?: WoRestoredContent | null }> {
    const user = this.auth.currentUser();
    const res = await firstValueFrom(
      this.http.post<{ success: boolean; undoneIds: string[]; trackedActionId?: string; restored?: WoRestoredContent | null }>(
        `${this.apiUrl}/api/wo-action-history/${actionId}/undo-cascade`,
        { undoneBy: user?.username }
      )
    );
    const undoneIds = res?.undoneIds ?? [];
    if (undoneIds.length > 0) {
      this._entries.update(list =>
        list.map(e => undoneIds.includes(e.id)
          ? { ...e, undone: true, undoneAt: new Date().toISOString(), undoneBy: user?.username }
          : e
        )
      );
    }
    return { undoneIds, trackedActionId: res?.trackedActionId, restored: res?.restored ?? null };
  }

  async redo(actionId: string): Promise<{ trackedActionId?: string }> {
    const user = this.auth.currentUser();
    const res = await firstValueFrom(
      this.http.post<{ success: boolean; trackedActionId?: string }>(`${this.apiUrl}/api/wo-action-history/${actionId}/redo`, {
        redoneBy: user?.username
      })
    );
    this._entries.update(list =>
      list.map(e => e.id === actionId
        ? { ...e, undone: false, undoneAt: undefined, undoneBy: undefined }
        : e
      )
    );
    return { trackedActionId: res?.trackedActionId };
  }

  async load(filters: WoActionHistoryFilters = {}): Promise<WoActionEntry[]> {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') cleaned[k] = String(v);
    }
    const params = new HttpParams({ fromObject: cleaned });
    const entries = await firstValueFrom(
      this.http.get<WoActionEntry[]>(`${this.apiUrl}/api/wo-action-history`, { params })
    );
    this._entries.set(entries);
    return entries;
  }

  getBySection(section: string): WoActionEntry[] {
    return this._entries().filter(e => e.section === section);
  }

  getByContext(key: string, value: string): WoActionEntry[] {
    return this._entries().filter(e => e.context?.[key] === value);
  }
}
