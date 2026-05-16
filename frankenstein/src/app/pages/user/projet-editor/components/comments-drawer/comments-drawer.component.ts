import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectCommentsService, ProjectComment } from '../../services/project-comments.service';
import { AuthService } from '../../../../../core/services/auth.service';

@Component({
  selector: 'app-comments-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <div class="comments-drawer__backdrop" (click)="close.emit()"></div>
      <aside class="comments-drawer" (click)="$event.stopPropagation()">
        <header class="comments-drawer__header">
          <div class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined">chat_bubble</span>
            <div class="min-w-0">
              <div class="text-sm font-semibold truncate">Commentaires</div>
              @if (folderName) {
                <div class="text-xs opacity-60 truncate">{{ folderName }}</div>
              }
            </div>
          </div>
          <button type="button" class="comments-drawer__icon-btn" (click)="close.emit()" title="Fermer">
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>

        <div class="comments-drawer__list">
          @if (loading()) {
            <div class="comments-drawer__empty">
              <span class="material-symbols-outlined animate-spin">progress_activity</span>
              <span>Chargement...</span>
            </div>
          } @else if (comments().length === 0) {
            <div class="comments-drawer__empty">
              <span class="material-symbols-outlined opacity-40">forum</span>
              <span>Aucun commentaire</span>
              <span class="text-xs opacity-50">Soyez le premier à commenter cette section.</span>
            </div>
          } @else {
            @for (c of comments(); track c.id) {
              <article class="comments-drawer__item">
                <div class="comments-drawer__item-head">
                  <span class="comments-drawer__author">{{ c.username }}</span>
                  <span class="comments-drawer__date">{{ formatDate(c.createdAt) }}</span>
                  @if (canDelete(c)) {
                    <button type="button"
                            class="comments-drawer__icon-btn ml-auto"
                            (click)="onDelete(c)"
                            title="Supprimer">
                      <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                  }
                </div>
                <div class="comments-drawer__text">{{ c.text }}</div>
              </article>
            }
          }
        </div>

        <footer class="comments-drawer__footer">
          <textarea [(ngModel)]="draft"
                    placeholder="Écrire un commentaire..."
                    rows="3"
                    maxlength="5000"
                    [disabled]="sending()"
                    (keydown.control.enter)="onSend()"
                    (keydown.meta.enter)="onSend()"></textarea>
          <div class="flex items-center justify-between">
            <span class="text-[10px] opacity-50">{{ draft.length }}/5000 · Ctrl+Entrée pour envoyer</span>
            <button type="button"
                    class="comments-drawer__send"
                    [disabled]="!draft.trim() || sending()"
                    (click)="onSend()">
              @if (sending()) {
                <span class="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              } @else {
                <span class="material-symbols-outlined text-sm">send</span>
              }
              Envoyer
            </button>
          </div>
          @if (error()) {
            <div class="text-xs text-red-400">{{ error() }}</div>
          }
        </footer>
      </aside>
    }
  `,
  styles: [`
    :host { display: contents; }

    .comments-drawer__backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: 80;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } }

    .comments-drawer {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 400px;
      max-width: 96vw;
      z-index: 81;
      display: flex;
      flex-direction: column;
      background: #1f2937;
      color: #e5e7eb;
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.35);
      animation: slideIn 0.18s ease;
    }
    @keyframes slideIn { from { transform: translateX(100%); } }

    .comments-drawer__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .comments-drawer__icon-btn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      background: transparent;
      border: 0;
      color: inherit;
      opacity: 0.6;
      cursor: pointer;
      border-radius: 4px;
      &:hover { opacity: 1; background: rgba(255, 255, 255, 0.05); }
    }

    .comments-drawer__list {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .comments-drawer__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 3rem 1rem;
      text-align: center;
      opacity: 0.6;
      font-size: 13px;
    }

    .comments-drawer__item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 0.6rem 0.75rem;
    }

    .comments-drawer__item-head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
      font-size: 11px;
    }
    .comments-drawer__author { font-weight: 600; color: rgb(147, 197, 253); }
    .comments-drawer__date   { opacity: 0.55; }

    .comments-drawer__text {
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .comments-drawer__footer {
      padding: 0.75rem 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      background: rgba(0, 0, 0, 0.1);

      textarea {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: inherit;
        border-radius: 6px;
        padding: 0.5rem 0.6rem;
        font-size: 13px;
        outline: none;
        resize: vertical;
        min-height: 60px;
        font-family: inherit;
        &:focus { border-color: rgba(59, 130, 246, 0.45); }
      }
    }

    .comments-drawer__send {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgb(59, 130, 246);
      color: #fff;
      border: 0;
      border-radius: 5px;
      padding: 0.4rem 0.7rem;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.12s, opacity 0.12s;
      &:hover:not([disabled]) { background: rgb(37, 99, 235); }
      &[disabled] { opacity: 0.5; cursor: not-allowed; }
    }

    :host-context(.light) .comments-drawer {
      background: #fff;
      color: #111827;
      border-left-color: rgba(0, 0, 0, 0.08);
    }
    :host-context(.light) .comments-drawer__header { border-bottom-color: rgba(0, 0, 0, 0.08); }
    :host-context(.light) .comments-drawer__footer {
      background: rgba(0, 0, 0, 0.02);
      border-top-color: rgba(0, 0, 0, 0.08);
      textarea { background: #fff; border-color: rgba(0, 0, 0, 0.1); }
    }
    :host-context(.light) .comments-drawer__item {
      background: rgba(0, 0, 0, 0.02);
      border-color: rgba(0, 0, 0, 0.06);
    }
    :host-context(.light) .comments-drawer__author { color: rgb(37, 99, 235); }
  `]
})
export class CommentsDrawerComponent implements OnChanges {
  @Input() visible = false;
  @Input() projectId = '';
  @Input() folderId: string | null = null;
  @Input() folderName = '';

  @Output() close = new EventEmitter<void>();
  @Output() countsChange = new EventEmitter<Record<string, number>>();

  comments = signal<ProjectComment[]>([]);
  loading = signal(false);
  sending = signal(false);
  error = signal('');
  draft = '';

  private svc = inject(ProjectCommentsService);
  private auth = inject(AuthService);

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['folderId'] || changes['projectId']) && this.visible && this.projectId && this.folderId) {
      this.load();
    }
    if (changes['visible'] && !this.visible) {
      this.draft = '';
      this.error.set('');
    }
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const list = await this.svc.list(this.projectId, this.folderId || undefined);
      this.comments.set(list);
    } catch (e: any) {
      this.error.set(e?.error?.error || 'Erreur de chargement');
      this.comments.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSend() {
    const text = this.draft.trim();
    if (!text || this.sending() || !this.folderId) return;
    this.sending.set(true);
    this.error.set('');
    try {
      const c = await this.svc.add(this.projectId, this.folderId, text);
      this.comments.update(arr => [...arr, c]);
      this.draft = '';
      await this.refreshCounts();
    } catch (e: any) {
      this.error.set(e?.error?.error || 'Erreur lors de l\'envoi');
    } finally {
      this.sending.set(false);
    }
  }

  async onDelete(c: ProjectComment) {
    if (!confirm('Supprimer ce commentaire ?')) return;
    try {
      await this.svc.remove(this.projectId, c.id);
      this.comments.update(arr => arr.filter(x => x.id !== c.id));
      await this.refreshCounts();
    } catch (e: any) {
      this.error.set(e?.error?.error || 'Erreur lors de la suppression');
    }
  }

  private async refreshCounts() {
    try {
      const counts = await this.svc.counts(this.projectId);
      this.countsChange.emit(counts);
    } catch { /* silent */ }
  }

  canDelete(c: ProjectComment): boolean {
    const user = this.auth.currentUser();
    if (!user) return false;
    return String(c.userId) === String(user.id) || user.role === 'admin';
  }

  formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }
}
