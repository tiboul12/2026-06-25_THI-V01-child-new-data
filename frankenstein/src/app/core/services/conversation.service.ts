import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Message {
  user: string;
  userId: string;
  text: string;
  timestamp: string;
  role?: 'user' | 'ai'; // Pour future compatibilité
}

export interface Conversation {
  sectionId: string;
  messages: Message[];
}

@Injectable({
  providedIn: 'root'
})
export class ConversationService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiDataUrl}/api/conversations`;

  getHistory(sectionId: string): Observable<Conversation> {
    return this.http.get<Conversation>(`${this.apiUrl}/${sectionId}`);
  }

  getConversationsList(): Observable<string[]> {
    return this.http.get<string[]>(`${environment.apiDataUrl}/api/conversations-list`);
  }

  sendMessage(sectionId: string, text: string): Observable<Message> {
    return this.http.post<Message>(`${this.apiUrl}/${sectionId}`, { text });
  }

  saveAiMessage(sectionId: string, text: string): Observable<Message> {
    return this.http.post<Message>(`${this.apiUrl}/${sectionId}`, { text, role: 'ai' });
  }
}
