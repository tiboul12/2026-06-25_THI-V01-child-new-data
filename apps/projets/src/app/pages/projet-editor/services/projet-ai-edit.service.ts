import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ProjectFilesService, API_EXECUTOR_URL, API_DATA_URL, AuthService } from '@worganic/portail-core/data-access';
import { sanitizeIaContent } from '../utils/sanitize-ia-content';

export interface PendingAiEdit {
  sectionId: string;
  fileId: string;
  originalContent: string;
  proposedContent: string;
}

export interface TokenInfo {
  used: number;
  total: number;
  remaining: number;
}

@Injectable({ providedIn: 'root' })
export class ProjetAiEditService {
  private projectFilesService = inject(ProjectFilesService);
  private ngZone = inject(NgZone);
  private executorUrl = inject(API_EXECUTOR_URL);
  private dataUrl = inject(API_DATA_URL);
  private authService = inject(AuthService);

  pendingEdit = signal<PendingAiEdit | null>(null);
  isStreaming = signal(false);
  tokenInfo = signal<TokenInfo | null>(null);

  // Émet chaque chunk SSE reçu (stdout)
  chunk$ = new Subject<string>();
  // Émet quand le streaming est terminé
  done$ = new Subject<string>();
  // Émet en cas d'erreur
  error$ = new Subject<string>();

  startEdit(
    sectionId: string,
    fileId: string,
    originalContent: string,
    promptContent: string,
    fileName: string,
    provider: string,
    model: string,
    systemInstructions?: string | null
  ): void {
    this.isStreaming.set(true);
    this.tokenInfo.set(null);
    let accumulated = '';

    const payload = JSON.stringify({ fileName, promptContent, fileContent: originalContent, provider, model, ...(systemInstructions ? { systemInstructions } : {}) });

    // Tente l'executor Electron (port 3002) d'abord, fallback vers le serveur data (port 3001)
    const tryFetch = (url: string, withAuth = false): Promise<Response> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (withAuth) {
        const token = this.authService.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      return fetch(url, { method: 'POST', headers, body: payload });
    };

    const doStream = (response: Response) => {
      if (!response.ok || !response.body) {
        this.ngZone.run(() => {
          this.isStreaming.set(false);
          this.error$.next(`Erreur HTTP ${response.status}`);
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const pump = (): Promise<void> => reader.read().then(({ done, value }) => {
        if (done) {
          this.ngZone.run(() => {
            this.isStreaming.set(false);
            // Extraire les infos de tokens depuis le contenu accumulé si présentes
            const tokenMatch = accumulated.match(/Token usage:\s*(\d+)\/(\d+);\s*(\d+)\s*remaining/i);
            if (tokenMatch) {
              this.tokenInfo.set({
                used: parseInt(tokenMatch[1], 10),
                total: parseInt(tokenMatch[2], 10),
                remaining: parseInt(tokenMatch[3], 10)
              });
              accumulated = accumulated.replace(/\n?Token usage:\s*\d+\/\d+;\s*\d+\s*remaining\n?/gi, '').trim();
            }
            const isError = accumulated.trimStart().startsWith('--ERREUR--');
            if (accumulated && !isError) {
              const sanitized = sanitizeIaContent(accumulated);
              this.pendingEdit.set({ sectionId, fileId, originalContent, proposedContent: sanitized });
            }
            this.done$.next(accumulated);
          });
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim()) as { type: string; message: string; used?: number; total?: number; remaining?: number };
            if (evt.type === 'stdout' && evt.message) {
              accumulated += evt.message;
              this.ngZone.run(() => this.chunk$.next(evt.message));
            } else if (evt.type === 'tokens') {
              this.ngZone.run(() => this.tokenInfo.set({
                used: evt.used ?? 0,
                total: evt.total ?? 0,
                remaining: evt.remaining ?? 0
              }));
            } else if (evt.type === 'error') {
              this.ngZone.run(() => {
                this.isStreaming.set(false);
                this.error$.next(evt.message);
              });
            }
          } catch { /* ligne SSE non JSON, ignorée */ }
        }

        return pump();
      });

      pump().catch(err => {
        this.ngZone.run(() => {
          this.isStreaming.set(false);
          this.error$.next(err.message || 'Erreur de connexion');
        });
      });
    };

    // Essaie l'executor Electron d'abord, fallback vers le serveur data si non disponible
    tryFetch(`${this.executorUrl}/execute-file-prompt`)
      .then(response => doStream(response))
      .catch(() => {
        // Executor non disponible → serveur data (API directe)
        tryFetch(`${this.dataUrl}/api/ai/execute-file-prompt`, true)
          .then(response => doStream(response))
          .catch(err => {
            this.ngZone.run(() => {
              this.isStreaming.set(false);
              this.error$.next(err.message || 'Impossible de joindre le serveur IA');
            });
          });
      });
  }

  async acceptEdit(projectName: string): Promise<void> {
    const edit = this.pendingEdit();
    if (!edit) return;
    await this.projectFilesService.updateFile(projectName, edit.fileId, edit.proposedContent);
    this.pendingEdit.set(null);
  }

  cancelEdit(): void {
    this.pendingEdit.set(null);
  }
}
