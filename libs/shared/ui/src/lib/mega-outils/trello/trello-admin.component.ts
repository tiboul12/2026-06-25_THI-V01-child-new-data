import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MegaOutilsService, MegaOutilInstance } from '@worganic/portail-core/data-access';

@Component({
  selector: 'app-trello-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <div class="flex items-center gap-3 mb-6">
        <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-blue-400 text-base">view_kanban</span>
        </div>
        <div>
          <h2 class="text-base font-semibold text-light-text dark:text-white">Trello — Toutes les instances</h2>
          <p class="text-xs text-light-text-muted dark:text-white/40">{{ items().length }} instance{{ items().length > 1 ? 's' : '' }} au total</p>
        </div>
      </div>

      @if (loading()) {
        <p class="text-sm text-light-text-muted dark:text-white/40">Chargement…</p>
      } @else if (!items().length) {
        <p class="text-sm text-light-text-muted dark:text-white/40">Aucune instance Trello.</p>
      } @else {
        <div class="flex flex-col gap-2">
          @for (item of items(); track item.instance.id) {
            <div class="flex items-center gap-3 p-3 rounded-xl border border-light-border dark:border-white/10 bg-light-surface dark:bg-surface">
              <span class="material-symbols-outlined text-blue-400 text-base flex-shrink-0">view_kanban</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-light-text dark:text-white/85 truncate">{{ item.instance.name }}</div>
                <div class="text-xs text-light-text-muted dark:text-white/40">
                  Projet : {{ item.projectName }} · créé le {{ formatDate(item.instance.createdAt) }}
                </div>
              </div>
              @if (deleteConfirmId() === item.instance.id) {
                <button class="text-xs px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/20 transition-colors"
                        (click)="confirmDelete(item.instance)">Confirmer</button>
                <button class="text-xs px-3 py-1 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white transition-colors"
                        (click)="cancelDelete()">Annuler</button>
              } @else {
                <button class="text-xs px-2 py-1 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/30 hover:text-red-400 hover:border-red-500/30 transition-colors"
                        (click)="deleteConfirmId.set(item.instance.id)">
                  <span class="material-symbols-outlined text-sm">delete</span>
                </button>
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

  items         = signal<{ instance: MegaOutilInstance; projectName: string }[]>([]);
  loading       = signal(true);
  deleteConfirmId = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.items.set(await this.svc.getAllInstances());
    } finally {
      this.loading.set(false);
    }
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
