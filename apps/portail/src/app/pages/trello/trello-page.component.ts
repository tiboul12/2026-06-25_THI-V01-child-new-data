import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MegaOutilsService, TrelloCard, MegaOutilInstance } from '@worganic/portail-core/data-access';
import { TrelloBoardComponent } from '@worganic/shared/ui';
import { WorgMiniHeaderComponent } from '@worganic/shared/ui';
import { TRELLO_STATUS_LABELS, TRELLO_PRIORITY_COLORS, TRELLO_PRIORITY_LABELS } from '@worganic/portail-core/data-access';

interface BoardItem {
  instance: MegaOutilInstance;
  cards: TrelloCard[];
  projectName: string;
  expanded: boolean;
}

@Component({
  selector: 'app-trello-page',
  standalone: true,
  imports: [CommonModule, TrelloBoardComponent, WorgMiniHeaderComponent],
  template: `
    <div class="flex flex-col h-full overflow-hidden">
      <worg-mini-header title="Trello — Vue globale" backUrl="/home" backLabel="Accueil" />

      <div class="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">

        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-blue-400 text-xl">view_kanban</span>
          </div>
          <div>
            <h1 class="text-xl font-bold text-light-text dark:text-white">Trello</h1>
            <p class="text-sm text-light-text-muted dark:text-white/40">{{ boards().length }} board{{ boards().length > 1 ? 's' : '' }} au total</p>
          </div>
        </div>

        @if (loading()) {
          <div class="flex items-center gap-2 text-light-text-muted dark:text-white/40">
            <span class="material-symbols-outlined text-base animate-spin">sync</span>
            Chargement…
          </div>
        } @else if (!boards().length) {
          <p class="text-light-text-muted dark:text-white/40 text-sm">Aucun board Trello. Créez-en un depuis un projet.</p>
        } @else {
          <div class="flex flex-col gap-4">
            @for (board of boards(); track board.instance.id; let i = $index) {
              <div class="rounded-xl border border-light-border dark:border-white/10 bg-light-surface dark:bg-surface overflow-hidden">

                <!-- En-tête board -->
                <div class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-light-background dark:hover:bg-white/3 transition-colors"
                     (click)="toggleBoard(i)">
                  <button class="w-4 h-4 flex-shrink-0 text-light-text-muted dark:text-white/30 transition-transform"
                          [class.rotate-90]="board.expanded">
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2l4 4-4 4"/></svg>
                  </button>
                  <span class="material-symbols-outlined text-blue-400 text-base">view_kanban</span>
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-semibold text-light-text dark:text-white/90">{{ board.instance.name }}</span>
                    <span class="ml-2 text-xs text-light-text-muted dark:text-white/40">{{ board.projectName }}</span>
                  </div>
                  <span class="text-xs text-light-text-muted dark:text-white/30 bg-light-background dark:bg-background rounded-full px-2 py-0.5">
                    {{ board.cards.length }} carte{{ board.cards.length > 1 ? 's' : '' }}
                  </span>
                </div>

                <!-- Board Trello (expandé) -->
                @if (board.expanded) {
                  <div class="border-t border-light-border dark:border-white/8 h-[420px]">
                    <app-trello-board
                      [instanceId]="board.instance.id"
                      [boardName]="board.instance.name" />
                  </div>
                }

              </div>
            }
          </div>
        }

      </div>
    </div>
  `,
  host: { class: 'flex flex-col h-full overflow-hidden' }
})
export class TrelloPageComponent implements OnInit {
  private svc = inject(MegaOutilsService);

  boards  = signal<BoardItem[]>([]);
  loading = signal(true);

  async ngOnInit() {
    try {
      const raw = await this.svc.getAllTrelloBoards();
      this.boards.set(raw.map(r => ({ ...r, expanded: false })));
    } finally {
      this.loading.set(false);
    }
  }

  toggleBoard(index: number) {
    this.boards.update(list =>
      list.map((b, i) => i === index ? { ...b, expanded: !b.expanded } : b)
    );
  }
}
