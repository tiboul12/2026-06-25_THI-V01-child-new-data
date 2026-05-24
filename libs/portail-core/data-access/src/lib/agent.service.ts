import { Injectable, NgZone, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, EMPTY } from 'rxjs';
import { API_AGENT_URL } from './tokens';

export interface AgentRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  triggeredBy: string;
  provider: string;
  model: string;
  actionIds: string[];
  currentActionId: string | null;
  currentActionIndex: number;
  results: { total: number; completed: number; failed: number };
  liveOutput: string;
  chatHistory: { role: 'user' | 'ai'; content: string; timestamp: string }[];
}

export interface AgentEvent {
  type: string;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class AgentService {
  private agentUrl = inject(API_AGENT_URL);
  private readonly LAST_RUN_KEY = 'frankenstein_last_run_id';

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  /** Vérifie si le serveur agent est accessible */
  isAgentAvailable(): Promise<boolean> {
    return fetch(`${this.agentUrl}/api/agent/runs/active`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok)
      .catch(() => false);
  }

  /** Lance un batch de prompts */
  startRun(actionIds: string[], provider: string, model: string, useGit: boolean = true): Observable<{ runId: string; liveUrl: string; provider: string; model: string; totalActions: number; useGit: boolean }> {
    return this.http.post<any>(`${this.agentUrl}/api/agent/run`, { actionIds, provider, model, useGit });
  }

  /** Arrête le run en cours */
  stopRun(runId: string): Observable<{ success: boolean }> {
    return this.http.post<any>(`${this.agentUrl}/api/agent/stop`, { runId });
  }

  /** Envoie un message à l'IA en cours */
  sendChatMessage(runId: string, message: string): Observable<{ success: boolean }> {
    return this.http.post<any>(`${this.agentUrl}/api/agent/chat/${runId}`, { message });
  }

  /** Relance une conversation après la fin du run (continuation avec contexte) */
  continueRun(runId: string, message: string): Observable<{ success: boolean; runId: string }> {
    return this.http.post<any>(`${this.agentUrl}/api/agent/continue/${runId}`, { message });
  }

  /** Récupère l'état complet d'un run */
  getRunState(runId: string): Observable<{ run: AgentRun }> {
    return this.http.get<any>(`${this.agentUrl}/api/agent/runs/${runId}`);
  }

  /** Récupère le run actif */
  getActiveRun(): Observable<{ run: AgentRun | null }> {
    return this.http.get<any>(`${this.agentUrl}/api/agent/runs/active`);
  }

  /** Liste tous les runs */
  getAllRuns(): Observable<{ runs: AgentRun[] }> {
    return this.http.get<any>(`${this.agentUrl}/api/agent/runs`);
  }

  /** Connexion SSE au stream d'un run */
  connectStream(runId: string): Observable<AgentEvent> {
    const subject = new Subject<AgentEvent>();

    const eventSource = new EventSource(`${this.agentUrl}/api/agent/stream/${runId}`);

    eventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        try {
          const data = JSON.parse(event.data);
          subject.next(data);

          // Fermer proprement si le run est terminé
          if (['run_completed', 'run_failed', 'run_stopped'].includes(data.type)) {
            eventSource.close();
            subject.complete();
          }
        } catch (e) {
          console.warn('[AgentService] SSE parse error:', e);
        }
      });
    };

    eventSource.onerror = (err) => {
      this.ngZone.run(() => {
        console.warn('[AgentService] SSE error, closing connection');
        eventSource.close();
        subject.complete();
      });
    };

    // Retourner un observable qui ferme l'EventSource à l'unsubscription
    return new Observable(observer => {
      const sub = subject.subscribe(observer);
      return () => {
        sub.unsubscribe();
        eventSource.close();
      };
    });
  }

  // ============================================================
  // Cache localStorage
  // ============================================================

  saveLastRunId(runId: string): void {
    localStorage.setItem(this.LAST_RUN_KEY, runId);
  }

  getLastRunId(): string | null {
    return localStorage.getItem(this.LAST_RUN_KEY);
  }

  clearLastRunId(): void {
    localStorage.removeItem(this.LAST_RUN_KEY);
  }
}
