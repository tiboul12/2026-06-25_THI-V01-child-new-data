import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { ProjectFilesService } from '../../../../core/services/project-files.service';

export interface PendingAiEdit {
  sectionId: string;
  fileId: string;
  originalContent: string;
  proposedContent: string;
}

@Injectable({ providedIn: 'root' })
export class ProjetAiEditService {
  private projectFilesService = inject(ProjectFilesService);
  private ngZone = inject(NgZone);

  pendingEdit = signal<PendingAiEdit | null>(null);
  isStreaming = signal(false);

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
    model: string
  ): void {
    this.isStreaming.set(true);
    let accumulated = '';

    fetch(`${environment.apiExecutorUrl}/execute-file-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, promptContent, fileContent: originalContent, provider, model })
    }).then(response => {
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
            if (accumulated) {
              this.pendingEdit.set({ sectionId, fileId, originalContent, proposedContent: accumulated });
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
            const payload = JSON.parse(line.slice(5).trim()) as { type: string; message: string };
            if (payload.type === 'stdout' && payload.message) {
              accumulated += payload.message;
              this.ngZone.run(() => this.chunk$.next(payload.message));
            } else if (payload.type === 'error') {
              this.ngZone.run(() => {
                this.isStreaming.set(false);
                this.error$.next(payload.message);
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
    }).catch(err => {
      this.ngZone.run(() => {
        this.isStreaming.set(false);
        this.error$.next(err.message || 'Impossible de joindre l\'executor');
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
