import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjetCollabService, SectionPublishedEvent } from '../../../../../core/services/projet-collab.service';

/**
 * Bannière de notification des sections partagées par d'autres utilisateurs.
 *
 * Affiche un résumé des modifications partagées en attente de pull, avec
 * un bouton "Mettre à jour" qui déclenche un git pull côté serveur.
 *
 * Devient une bannière hors-ligne si l'utilisateur perd la connexion.
 */
@Component({
  selector: 'app-projet-update-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projet-update-banner.component.html',
  styleUrls: ['./projet-update-banner.component.scss']
})
export class ProjetUpdateBannerComponent {
  private collab = inject(ProjetCollabService);

  @Input() projectName: string | null = null;
  @Output() pulled = new EventEmitter<{ newCommits: number; changedFiles: string[] }>();

  readonly pulling = signal(false);
  readonly pullError = signal<string | null>(null);

  // Liste triée par timestamp décroissant
  readonly events = computed<SectionPublishedEvent[]>(() => {
    const map = this.collab.pendingUpdates();
    return Array.from(map.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  });

  readonly isOnline = this.collab.isOnline;
  readonly count = computed(() => this.events().length);

  readonly summaryLabel = computed(() => {
    const list = this.events();
    if (list.length === 0) return '';
    if (list.length === 1) {
      const e = list[0];
      return `${e.publishedBy.username} a partagé « ${e.sectionName} »`;
    }
    const names = Array.from(new Set(list.map(e => e.publishedBy.username)));
    if (names.length === 1) {
      return `${names[0]} a partagé ${list.length} sections`;
    }
    return `${names.length} utilisateurs ont partagé ${list.length} sections`;
  });

  async onPull(): Promise<void> {
    if (!this.projectName || this.pulling()) return;
    this.pulling.set(true);
    this.pullError.set(null);
    try {
      const r = await this.collab.pullProject(this.projectName);
      this.pulled.emit(r);
    } catch (e: any) {
      this.pullError.set(e?.error?.error || e?.message || 'Erreur de mise à jour');
    } finally {
      this.pulling.set(false);
    }
  }

  onDismiss(): void {
    this.collab.clearAllPendingUpdates();
  }
}
