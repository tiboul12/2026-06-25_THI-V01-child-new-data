import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Popup de création d'un titre (H1-H4) dans l'outil Édition.
 *
 * Flux : l'utilisateur clique H1/H2/H3/H4 dans la barre de style (mode Édition)
 * ou sur "+" (mode Structure) → ce dialog s'ouvre → saisie du titre → à la
 * validation, le composant parent crée le dossier physique PUIS insère le
 * heading avec son identifiant stable. La création est ainsi atomique.
 *
 * Règles CLAUDE.md respectées :
 *  - jamais de fermeture au clic sur le backdrop (fermeture explicite uniquement)
 *  - texte sombre sur fond clair / primary
 */
@Component({
  selector: 'worg-title-create-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50">
      <div class="w-full max-w-md mx-4 rounded-xl bg-white dark:bg-surface shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
        <!-- En-tête -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-white/10">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary text-black text-xs font-bold">H{{ level }}</span>
            {{ headingLabel }}
          </h3>
          <button type="button" class="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none" (click)="onCancel()" aria-label="Fermer">✕</button>
        </div>

        <!-- Corps -->
        <div class="px-5 py-4 space-y-3">
          @if (parentLabel) {
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Sera créé dans : <span class="font-medium text-gray-700 dark:text-gray-200">{{ parentLabel }}</span>
            </p>
          }
          <label class="block">
            <span class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Titre de la section</span>
            <input #titleInput type="text"
                   class="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-white/15 bg-white dark:bg-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                   [(ngModel)]="title"
                   (keydown.enter)="onConfirm()"
                   (keydown.escape)="onCancel()"
                   placeholder="Ex. Présentation du produit"
                   maxlength="120" />
          </label>
          @if (showError) {
            <p class="text-xs text-red-500">Le titre ne peut pas être vide.</p>
          }
        </div>

        <!-- Pied -->
        <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-white/10">
          <button type="button"
                  class="px-3 py-1.5 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10"
                  (click)="onCancel()">Annuler</button>
          <button type="button"
                  class="px-4 py-1.5 rounded-md text-sm font-medium bg-primary text-black hover:opacity-90 disabled:opacity-50"
                  [disabled]="submitting"
                  (click)="onConfirm()">Créer le titre</button>
        </div>
      </div>
    </div>
  `,
})
export class TitleCreateDialogComponent implements AfterViewInit {
  /** Niveau du titre à créer (1-4). */
  @Input() level = 2;
  /** Titre pré-rempli (ex. depuis une sélection de texte). */
  @Input() set prefilledTitle(v: string) { this.title = (v || '').trim(); }
  /** Libellé du parent dans lequel la section sera créée (lecture seule). */
  @Input() parentLabel = '';

  /** Émis avec le titre saisi quand l'utilisateur valide. */
  @Output() confirm = new EventEmitter<string>();
  /** Émis quand l'utilisateur annule / ferme. */
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;

  title = '';
  showError = false;
  submitting = false;

  get headingLabel(): string {
    return `Nouveau titre de niveau ${this.level}`;
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.titleInput?.nativeElement.focus(), 0);
  }

  onConfirm(): void {
    const value = this.title.trim();
    if (!value) { this.showError = true; return; }
    if (this.submitting) return;
    this.submitting = true;
    this.confirm.emit(value);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
