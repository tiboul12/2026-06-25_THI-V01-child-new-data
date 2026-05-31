import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_DATA_URL } from './tokens';

export interface PromptContext {
  sectionName: string;
  sectionContent: string;
  subSectionsContent: string | null;
  fullDocumentContent: string | null;
  globalInstruction: string | null;
  projectInstruction: string | null;
  userPrompt: string;
  model: string;
}

export interface Message {
  user: string;
  userId: string;
  text: string;
  timestamp: string;
  role?: 'user' | 'ai';
  tokenInfo?: { used: number; total: number; remaining: number };
  promptContext?: PromptContext;
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
  private baseUrl = inject(API_DATA_URL);
  private apiUrl = `${this.baseUrl}/api/conversations`;

  getHistory(sectionId: string): Observable<Conversation> {
    return this.http.get<Conversation>(`${this.apiUrl}/${sectionId}`);
  }

  getConversationsList(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/api/conversations-list`);
  }

  sendMessage(sectionId: string, text: string): Observable<Message> {
    return this.http.post<Message>(`${this.apiUrl}/${sectionId}`, { text });
  }

  saveAiMessage(sectionId: string, text: string): Observable<Message> {
    return this.http.post<Message>(`${this.apiUrl}/${sectionId}`, { text, role: 'ai' });
  }
}
