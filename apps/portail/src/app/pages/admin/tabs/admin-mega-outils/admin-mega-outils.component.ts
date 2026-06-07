import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrelloAdminComponent } from '@worganic/shared/ui';
import { navigateToProjets } from '../../../../shared/utils/navigate-to-projets';

@Component({
  selector: 'app-admin-mega-outils',
  standalone: true,
  imports: [CommonModule, TrelloAdminComponent],
  template: `
    <div class="space-y-8">
      <div>
        <h2 class="text-base font-semibold text-light-text dark:text-white mb-1">Méga-outils</h2>
        <p class="text-sm text-light-text-muted dark:text-white/40">Gestion des outils partagés entre les projets.</p>
      </div>

      <!-- Types disponibles -->
      <div>
        <h3 class="text-xs font-bold uppercase tracking-wider text-light-text-muted dark:text-white/30 mb-3">Types disponibles</h3>
        <div class="flex items-center gap-3 p-3 rounded-xl border border-light-border dark:border-white/10 bg-light-surface dark:bg-surface">
          <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-blue-400 text-base">view_kanban</span>
          </div>
          <div class="flex-1">
            <div class="text-sm font-medium text-light-text dark:text-white/85">Trello</div>
            <div class="text-xs text-light-text-muted dark:text-white/40">Tableau kanban avec cartes, statuts et priorités</div>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-semibold">Actif</span>
        </div>
      </div>

      <!-- Instances Trello -->
      <app-trello-admin (openInEditor)="onOpenInEditor($event)" />
    </div>
  `
})
export class AdminMegaOutilsComponent {
  onOpenInEditor(evt: { projectId: string; folderId?: string; outilId?: string }) {
    const params = new URLSearchParams();
    if (evt.folderId) params.set('section', evt.folderId);
    if (evt.outilId) params.set('outil', evt.outilId);
    const qs = params.toString();
    navigateToProjets(`projets/${evt.projectId}` + (qs ? `?${qs}` : ''));
  }
}
