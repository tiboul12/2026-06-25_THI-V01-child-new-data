import { Component, OnInit, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MegaOutilsService, MegaOutilInstance, TrelloCard, TrelloStatus } from '@worganic/portail-core/data-access';
import { TrelloBoardComponent } from './trello-board.component';

interface AdminBoard {
  instance: MegaOutilInstance;
  cards: TrelloCard[];
  projectName: string;
  folderName: string | null;
  outilName: string | null;
}

@Component({
  selector: 'app-trello-admin',
  standalone: true,
  imports: [CommonModule, TrelloBoardComponent],
  template: `
    <div>
      <div class="flex items-center gap-3 mb-6">
        <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-blue-400 text-base">view_kanban</span>
        </div>
        <div class="flex-1">
          <h2 class="text-base font-semibold text-light-text dark:text-white">Trello — Toutes les instances</h2>
          <p class="text-xs text-light-text-muted dark:text-white/40">{{ items().length }} instance{{ items().length > 1 ? 's' : '' }} au total</p>
        </div>
        <button class="text-xs px-3 py-1.5 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white transition-colors flex items-center gap-1.5"
                (click)="reload()">
          <span class="material-symbols-outlined text-sm" [class.animate-spin]="loading()">refresh</span> Rafraîchir
        </button>
      </div>

      @if (loading()) {
        <p class="text-sm text-light-text-muted dark:text-white/40">Chargement…</p>
      } @else if (!items().length) {
        <p class="text-sm text-light-text-muted dark:text-white/40">Aucune instance Trello.</p>
      } @else {
        <div class="flex flex-col gap-3">
          @for (item of items(); track item.instance.id) {
            <div class="rounded-xl border border-light-border dark:border-white/10 bg-light-surface dark:bg-surface overflow-hidden">

              <!-- En-tête instance -->
              <div class="flex items-start gap-3 p-3">
                <span class="material-symbols-outlined text-blue-400 text-base flex-shrink-0 mt-0.5">view_kanban</span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-light-text dark:text-white/85 truncate">{{ item.instance.name }}</div>

                  <!-- Infos de liaison (chaque badge est un lien vers la partie concernée) -->
                  <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <!-- Menu utilisé (module où vit le méga-outil) -->
                    <button type="button"
                            class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-light-background dark:bg-background border border-light-border dark:border-white/10 text-light-text-muted dark:text-white/50 hover:text-light-primary dark:hover:text-primary hover:border-light-primary/40 dark:hover:border-primary/40 transition-colors"
                            title="Ouvrir le menu Projets"
                            (click)="openInEditor.emit({ projectId: item.instance.projectId })">
                      <span class="material-symbols-outlined text-[11px]">grid_view</span>projets
                    </button>
                    <!-- Nom du projet -->
                    <button type="button"
                            class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-light-background dark:bg-background border border-light-border dark:border-white/10 text-light-text-muted dark:text-white/50 hover:text-light-primary dark:hover:text-primary hover:border-light-primary/40 dark:hover:border-primary/40 transition-colors"
                            title="Ouvrir le projet « {{ item.projectName }} »"
                            (click)="openInEditor.emit({ projectId: item.instance.projectId })">
                      <span class="material-symbols-outlined text-[11px]">folder_special</span>{{ item.projectName }}
                    </button>
                    <!-- Section (folder) -->
                    @if (item.folderName) {
                      <button type="button"
                              class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/40 transition-colors"
                              title="Aller à la section « {{ item.folderName }} »"
                              (click)="openInEditor.emit({ projectId: item.instance.projectId, folderId: item.instance.folderId })">
                        <span class="material-symbols-outlined text-[11px]">tag</span>{{ item.folderName }}
                      </button>
                    } @else {
                      <span class="text-[10px] px-2 py-0.5 rounded-full bg-light-background dark:bg-background border border-light-border dark:border-white/10 text-light-text-muted dark:text-white/30">Sans section</span>
                    }
                    <span class="text-[10px] text-light-text-muted dark:text-white/30">créé le {{ formatDate(item.instance.createdAt) }}</span>
                  </div>

                  <!-- Aperçu cartes par colonne -->
                  <div class="flex items-center gap-2 mt-2 text-[10px]">
                    <span class="font-semibold text-light-text-muted dark:text-white/40">{{ item.cards.length }} carte{{ item.cards.length > 1 ? 's' : '' }} :</span>
                    <span class="text-blue-400">À faire {{ count(item, 'todo') }}</span>
                    <span class="text-yellow-400">En cours {{ count(item, 'in-progress') }}</span>
                    <span class="text-green-400">Terminé {{ count(item, 'done') }}</span>
                    <span class="text-red-400">Bloqué {{ count(item, 'blocked') }}</span>
                  </div>
                </div>

                <!-- Actions : colonne (Éditeur / Supprimer) + Gérer les cartes à droite -->
                <div class="flex items-stretch gap-1.5 flex-shrink-0">
                  <div class="flex flex-col gap-1.5">
                    <button class="text-[11px] px-2 py-1 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/50 hover:text-light-primary dark:hover:text-primary hover:border-light-primary/40 dark:hover:border-primary/40 transition-colors flex items-center justify-center gap-1"
                            title="Ouvrir dans l'éditeur (projets/edition)"
                            (click)="openInEditor.emit({ projectId: item.instance.projectId, folderId: item.instance.folderId })">
                      <span class="material-symbols-outlined text-sm">open_in_new</span> Éditeur
                    </button>
                    @if (deleteConfirmId() === item.instance.id) {
                      <div class="flex items-center gap-1.5">
                        <button class="flex-1 text-[11px] px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/20 transition-colors"
                                (click)="confirmDelete(item.instance)">Confirmer</button>
                        <button class="flex-1 text-[11px] px-2 py-1 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white transition-colors"
                                (click)="cancelDelete()">Annuler</button>
                      </div>
                    } @else {
                      <button class="text-[11px] px-2 py-1 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/30 hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center justify-center gap-1"
                              (click)="deleteConfirmId.set(item.instance.id)">
                        <span class="material-symbols-outlined text-sm">delete</span> Supprimer
                      </button>
                    }
                  </div>
                  <button class="text-[11px] px-2 py-1 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white transition-colors flex items-center gap-1"
                          (click)="toggleExpand(item.instance.id)">
                    <span class="material-symbols-outlined text-sm">{{ expanded().has(item.instance.id) ? 'expand_less' : 'expand_more' }}</span>
                    Gérer les cartes
                  </button>
                </div>
              </div>

              <!-- Board (gestion des cartes) -->
              @if (expanded().has(item.instance.id)) {
                <div class="border-t border-light-border dark:border-white/10" style="height: 460px">
                  <app-trello-board
                    [instanceId]="item.instance.id"
                    [boardName]="item.instance.name"
                    [deletable]="false" />
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export class TrelloAdminComponent implements OnInit {
  private svc = inject(MegaOutilsService);

  /** Demande d'ouverture du trello dans l'éditeur projets (géré par le wrapper portail). */
  @Output() openInEditor = new EventEmitter<{ projectId: string; folderId?: string; outilId?: string }>();

  items           = signal<AdminBoard[]>([]);
  loading         = signal(true);
  deleteConfirmId = signal<string | null>(null);
  expanded        = signal<Set<string>>(new Set());

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading.set(true);
    try {
      this.items.set(await this.svc.getAllTrelloBoards());
    } finally {
      this.loading.set(false);
    }
  }

  count(item: AdminBoard, status: TrelloStatus): number {
    return item.cards.filter(c => c.status === status).length;
  }

  toggleExpand(id: string) {
    this.expanded.update(set => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  cancelDelete() { this.deleteConfirmId.set(null); }

  async confirmDelete(inst: MegaOutilInstance) {
    await this.svc.deleteInstance(inst.id);
    this.items.update(list => list.filter(i => i.instance.id !== inst.id));
    this.deleteConfirmId.set(null);
  }

  formatDate(d: string): string {
    return d ? new Date(d).toLocaleDateString('fr-FR') : '';
  }
}
