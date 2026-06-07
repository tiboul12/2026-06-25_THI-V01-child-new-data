import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_DATA_URL } from './tokens';
import { AuthService } from './auth.service';
import { MegaOutilInstance, MegaOutilType, MockupConnection, MockupElement, MockupElementType, MockupComment, TrelloCard } from './mega-outils.models';

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

  updateInstance(id: string, data: { name?: string; folderId?: string }): Promise<MegaOutilInstance> {
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

  getAllTrelloBoards(): Promise<{ instance: MegaOutilInstance; cards: TrelloCard[]; projectName: string; folderName: string | null; outilName: string | null }[]> {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/api/mega-outils/trello/all`, { headers: this.h() }));
  }

  getAllInstances(): Promise<{ instance: MegaOutilInstance; projectName: string }[]> {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/api/mega-outils/instances/all`, { headers: this.h() }));
  }

  // ── Mockup diagram ─────────────────────────────────────────────────────────

  getMockupDiagram(projectName: string): Promise<{ connections: MockupConnection[]; positions: { instanceId: string; x: number; y: number }[] }> {
    return firstValueFrom(this.http.get<{ connections: MockupConnection[]; positions: { instanceId: string; x: number; y: number }[] }>(
      `${this.apiUrl}/api/mega-outils/mockup/${encodeURIComponent(projectName)}/diagram`, { headers: this.h() }
    ));
  }

  updateMockupDiagramPositions(projectName: string, positions: { instanceId: string; x: number; y: number }[]): Promise<void> {
    return firstValueFrom(this.http.post<void>(
      `${this.apiUrl}/api/mega-outils/mockup/${encodeURIComponent(projectName)}/diagram/positions`, { positions }, { headers: this.h() }
    ));
  }

  createMockupConnection(projectName: string, data: { fromInstanceId: string; toInstanceId: string; label?: string }): Promise<MockupConnection> {
    return firstValueFrom(this.http.post<MockupConnection>(
      `${this.apiUrl}/api/mega-outils/mockup/${encodeURIComponent(projectName)}/connections`, data, { headers: this.h() }
    ));
  }

  deleteMockupConnection(projectName: string, connId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(
      `${this.apiUrl}/api/mega-outils/mockup/${encodeURIComponent(projectName)}/connections/${connId}`, { headers: this.h() }
    ));
  }

  // ── Mockup elements ────────────────────────────────────────────────────────

  getMockupElements(instanceId: string): Promise<MockupElement[]> {
    return firstValueFrom(this.http.get<MockupElement[]>(
      `${this.apiUrl}/api/mega-outils/mockup/${instanceId}/elements`, { headers: this.h() }
    ));
  }

  createMockupElement(instanceId: string, data: { type: MockupElementType; x: number; y: number; width: number; height: number; label: string }): Promise<MockupElement> {
    return firstValueFrom(this.http.post<MockupElement>(
      `${this.apiUrl}/api/mega-outils/mockup/${instanceId}/elements`, data, { headers: this.h() }
    ));
  }

  updateMockupElement(instanceId: string, elementId: string, data: Partial<Pick<MockupElement, 'x' | 'y' | 'width' | 'height' | 'label'>>): Promise<MockupElement> {
    return firstValueFrom(this.http.patch<MockupElement>(
      `${this.apiUrl}/api/mega-outils/mockup/${instanceId}/elements/${elementId}`, data, { headers: this.h() }
    ));
  }

  deleteMockupElement(instanceId: string, elementId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(
      `${this.apiUrl}/api/mega-outils/mockup/${instanceId}/elements/${elementId}`, { headers: this.h() }
    ));
  }

  // ── Mockup comments ────────────────────────────────────────────────────────

  getMockupComments(instanceId: string): Promise<MockupComment[]> {
    return firstValueFrom(this.http.get<MockupComment[]>(
      `${this.apiUrl}/api/mega-outils/mockup/${instanceId}/comments`, { headers: this.h() }
    ));
  }

  createMockupComment(instanceId: string, elementId: string, text: string): Promise<MockupComment> {
    return firstValueFrom(this.http.post<MockupComment>(
      `${this.apiUrl}/api/mega-outils/mockup/${instanceId}/comments`, { elementId, text }, { headers: this.h() }
    ));
  }

  deleteMockupComment(instanceId: string, commentId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(
      `${this.apiUrl}/api/mega-outils/mockup/${instanceId}/comments/${commentId}`, { headers: this.h() }
    ));
  }
}
