import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_DATA_URL } from './tokens';
import { AuthService } from './auth.service';
import { MegaOutilInstance, MegaOutilType, TrelloCard } from './mega-outils.models';

@Injectable({ providedIn: 'root' })
export class MegaOutilsService {
  private apiUrl = inject(API_DATA_URL);
  constructor(private http: HttpClient, private auth: AuthService) {}

  private h() { return this.auth.getAuthHeaders(); }

  // ── Instances ─────────────────────────────────────────────────────────────

  getInstances(projectId: string, type?: MegaOutilType): Promise<MegaOutilInstance[]> {
    const params: Record<string, string> = { projectId };
    if (type) params['type'] = type;
    return firstValueFrom(this.http.get<MegaOutilInstance[]>(`${this.apiUrl}/api/mega-outils/instances`, { headers: this.h(), params }));
  }

  createInstance(data: { type: MegaOutilType; name: string; projectId: string; outilId?: string; folderId?: string }): Promise<MegaOutilInstance> {
    return firstValueFrom(this.http.post<MegaOutilInstance>(`${this.apiUrl}/api/mega-outils/instances`, data, { headers: this.h() }));
  }

  updateInstance(id: string, data: { name: string }): Promise<MegaOutilInstance> {
    return firstValueFrom(this.http.patch<MegaOutilInstance>(`${this.apiUrl}/api/mega-outils/instances/${id}`, data, { headers: this.h() }));
  }

  deleteInstance(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.apiUrl}/api/mega-outils/instances/${id}`, { headers: this.h() }));
  }

  // ── Trello cards ───────────────────────────────────────────────────────────

  getTrelloCards(instanceId: string): Promise<TrelloCard[]> {
    return firstValueFrom(this.http.get<TrelloCard[]>(`${this.apiUrl}/api/mega-outils/trello/${instanceId}/cards`, { headers: this.h() }));
  }

  createTrelloCard(instanceId: string, data: Partial<TrelloCard>): Promise<TrelloCard> {
    return firstValueFrom(this.http.post<TrelloCard>(`${this.apiUrl}/api/mega-outils/trello/${instanceId}/cards`, data, { headers: this.h() }));
  }

  updateTrelloCard(instanceId: string, cardId: string, data: Partial<TrelloCard>): Promise<TrelloCard> {
    return firstValueFrom(this.http.patch<TrelloCard>(`${this.apiUrl}/api/mega-outils/trello/${instanceId}/cards/${cardId}`, data, { headers: this.h() }));
  }

  deleteTrelloCard(instanceId: string, cardId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.apiUrl}/api/mega-outils/trello/${instanceId}/cards/${cardId}`, { headers: this.h() }));
  }

  reorderTrelloCards(instanceId: string, orderedIds: string[]): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.apiUrl}/api/mega-outils/trello/${instanceId}/cards/reorder`, { orderedIds }, { headers: this.h() }));
  }

  // ── Vue globale ────────────────────────────────────────────────────────────

  getAllTrelloBoards(): Promise<{ instance: MegaOutilInstance; cards: TrelloCard[]; projectName: string }[]> {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/api/mega-outils/trello/all`, { headers: this.h() }));
  }

  getAllInstances(): Promise<{ instance: MegaOutilInstance; projectName: string }[]> {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/api/mega-outils/instances/all`, { headers: this.h() }));
  }
}
