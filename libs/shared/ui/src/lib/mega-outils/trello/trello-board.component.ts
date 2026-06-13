import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  MegaOutilsService, ProjetCollabService,
  TrelloCard, TrelloStatus, TrelloPriority,
  TRELLO_STATUS_LABELS, TRELLO_PRIORITY_LABELS, TRELLO_PRIORITY_COLORS
} from '@worganic/portail-core/data-access';

type FormMode = 'add' | 'edit';

interface CardForm {
  title: string;
  description: string;
  status: TrelloStatus;
  priority: TrelloPriority;
}

const COLUMNS: TrelloStatus[] = ['todo', 'in-progress', 'done', 'blocked'];

const COLUMN_STYLES: Record<TrelloStatus, { border: string; header: string }> = {
  'todo':        { border: 'border-blue-500/30',   header: 'text-blue-400' },
  'in-progress': { border: 'border-yellow-500/30', header: 'text-yellow-400' },
  'done':        { border: 'border-green-500/30',  header: 'text-green-400' },
  'blocked':     { border: 'border-red-500/30',    header: 'text-red-400' },
};

@Component({
  selector: 'app-trello-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full bg-light-background dark:bg-background overflow-hidden">

      <!-- Header board -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-light-border dark:border-white/8 flex-shrink-0">
        <span class="material-symbols-outlined text-light-primary dark:text-primary text-lg">view_kanban</span>
        <span class="text-sm font-semibold text-light-text dark:text-white/90">{{ boardName }}</span>
        @if (sectionName) {
          <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400" title="Section où ce Trello est implanté">
            <span class="material-symbols-outlined text-[12px]">tag</span>{{ sectionName }}
          </span>
        }
        <span class="flex-1"></span>
        <span class="text-xs text-light-text-muted dark:text-white/30">{{ totalCards() }} carte{{ totalCards() > 1 ? 's' : '' }}</span>
        @if (deletable) {
          @if (confirmDeleteBoard()) {
            <button class="text-[11px] px-2 py-1 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/25 transition-colors"
                    (click)="emitDelete()">Confirmer suppression</button>
            <button class="text-[11px] px-2 py-1 rounded-md border border-light-border dark:border-white/15 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white transition-colors"
                    (click)="confirmDeleteBoard.set(false)">Annuler</button>
          } @else {
            <button class="w-7 h-7 flex items-center justify-center rounded-md text-light-text-muted dark:text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Supprimer ce Trello"
                    (click)="confirmDeleteBoard.set(true)">
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          }
        }
      </div>

      <!-- Colonnes -->
      <div class="flex gap-3 flex-1 overflow-x-hidden overflow-y-hidden p-4">
        @for (col of columns; track col) {
          <div class="flex flex-col flex-1 min-w-0 rounded-xl border bg-light-surface dark:bg-surface"
               [class]="columnBorder(col)"
               (dragover)="onDragOver($event, col)"
               (drop)="onDrop($event, col)">

            <!-- En-tête colonne -->
            <div class="flex items-center justify-between px-3 py-2 border-b border-light-border dark:border-white/8">
              <span class="text-[11px] font-bold uppercase tracking-wider" [class]="columnHeaderColor(col)">
                {{ statusLabel(col) }}
              </span>
              <span class="text-[10px] text-light-text-muted dark:text-white/30 bg-light-background dark:bg-background rounded-full px-1.5 py-0.5">
                {{ cardsForColumn(col).length }}
              </span>
            </div>

            <!-- Cards (zone scrollable) -->
            <div class="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
              @for (card of cardsForColumn(col); track card.id) {
                <div class="rounded-lg border border-light-border dark:border-white/10 bg-white dark:bg-white/5 p-2.5 cursor-pointer select-none transition-all hover:border-light-primary/30 dark:hover:border-primary/30"
                     [class.ring-1]="expandedCardId() === card.id"
                     [class.ring-light-primary]="expandedCardId() === card.id"
                     [class.dark:ring-primary]="expandedCardId() === card.id"
                     [draggable]="!readonly"
                     (dragstart)="onDragStart($event, card)"
                     (click)="toggleExpand(card.id)">

                  <!-- Titre (clic → popup) + badge priorité : badge à droite si la place le permet, sinon dessous -->
                  <div class="flex flex-wrap items-start gap-x-1.5 gap-y-1 mb-1">
                    <span class="text-[11px] font-medium text-light-text dark:text-white/85 min-w-0 break-words [overflow-wrap:anywhere] leading-snug hover:underline"
                          title="Ouvrir le détail" (click)="openCard(card); $event.stopPropagation()">{{ card.title }}</span>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                          [class]="priorityColor(card.priority)">
                      {{ priorityLabel(card.priority) }}
                    </span>
                  </div>

                  <!-- Créateur + date -->
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-light-text-muted dark:text-white/30">
                    @if (card.creatorName) {
                      <span class="truncate max-w-[80px]">{{ card.creatorName }}</span>
                      <span>·</span>
                    }
                    <span>{{ formatDate(card.createdAt) }}</span>
                  </div>

                  <!-- Expand inline : description + actions (clic sur la carte hors titre) -->
                  @if (expandedCardId() === card.id) {
                    <div class="mt-2 pt-2 border-t border-light-border dark:border-white/8" (click)="$event.stopPropagation()">
                      @if (card.description) {
                        <p class="text-[11px] text-light-text-muted dark:text-white/50 mb-2 leading-snug break-words [overflow-wrap:anywhere] line-clamp-4">{{ card.description }}</p>
                      }
                      <div class="flex flex-wrap gap-1.5">
                        <button class="text-[10px] px-2 py-1 rounded border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-primary dark:hover:text-primary transition-colors flex items-center gap-1"
                                (click)="openCard(card)">
                          <span class="material-symbols-outlined text-[10px]">open_in_full</span> Détail
                        </button>
                        @if (!readonly) {
                          <button class="text-[10px] px-2 py-1 rounded border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-primary dark:hover:text-primary transition-colors flex items-center gap-1"
                                  (click)="openCardEdit(card)">
                            <span class="material-symbols-outlined text-[10px]">edit</span> Modifier
                          </button>
                          @if (deleteConfirmId() === card.id) {
                            <button class="text-[10px] px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/20 transition-colors"
                                    (click)="confirmDelete(card)">Confirmer</button>
                            <button class="text-[10px] px-2 py-1 rounded border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white transition-colors"
                                    (click)="cancelDelete()">Annuler</button>
                          } @else {
                            <button class="text-[10px] px-2 py-1 rounded border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-red-400 transition-colors flex items-center gap-1"
                                    (click)="askDelete(card.id)">
                              <span class="material-symbols-outlined text-[10px]">delete</span> Supprimer
                            </button>
                          }
                        }
                      </div>
                    </div>
                  }

                </div>
              }
            </div>

            <!-- Formulaire ajout carte -->
            @if (addingInColumn() === col) {
              <div class="flex-shrink-0 p-2 border-t border-light-border dark:border-white/8 bg-light-surface dark:bg-surface" (click)="$event.stopPropagation()">
                <input class="w-full text-[11px] bg-light-background dark:bg-background border border-light-border dark:border-white/20 rounded px-2 py-1 mb-1.5 text-light-text dark:text-white outline-none focus:border-light-primary dark:focus:border-primary"
                       placeholder="Titre de la carte *" [(ngModel)]="addForm.title"
                       (keydown.enter)="submitAdd(col)" (keydown.escape)="cancelAdd()" autofocus />
                <textarea class="w-full text-[11px] bg-light-background dark:bg-background border border-light-border dark:border-white/20 rounded px-2 py-1 mb-1.5 text-light-text dark:text-white outline-none resize-none focus:border-light-primary dark:focus:border-primary"
                          rows="2" placeholder="Description (optionnel)" [(ngModel)]="addForm.description"
                          (keydown.escape)="cancelAdd()"></textarea>
                <div class="mb-1.5">
                  <select class="w-full text-[10px] bg-light-background dark:bg-background border border-light-border dark:border-white/20 rounded px-1.5 py-1 text-light-text dark:text-white outline-none dark:[color-scheme:dark]"
                          [(ngModel)]="addForm.priority">
                    @for (p of priorityList; track p) { <option [value]="p">{{ priorityLabel(p) }}</option> }
                  </select>
                </div>
                <div class="flex gap-1.5">
                  <button class="flex-1 text-[10px] px-2 py-1 rounded bg-light-primary dark:bg-primary text-white dark:text-btn-text font-semibold hover:opacity-80 transition-opacity disabled:opacity-40"
                          [disabled]="!addForm.title.trim()" (click)="submitAdd(col)">Ajouter</button>
                  <button class="flex-1 text-[10px] px-2 py-1 rounded border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white transition-colors"
                          (click)="cancelAdd()">Annuler</button>
                </div>
              </div>
            } @else if (!readonly) {
              <button class="flex-shrink-0 w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-light-text dark:text-white/70 hover:text-light-primary dark:hover:text-primary transition-colors border-t border-light-border dark:border-white/8 bg-light-surface dark:bg-surface"
                      (click)="startAdd(col)">
                <span class="material-symbols-outlined text-sm">add</span> Carte
              </button>
            }

          </div>
        }
      </div>

      <!-- Popup détail carte -->
      @if (modalCard(); as card) {
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div class="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-light-border dark:border-white/10 bg-light-surface dark:bg-surface shadow-2xl overflow-hidden">

            <!-- Header -->
            <div class="flex items-start gap-2 px-4 py-3 border-b border-light-border dark:border-white/8 flex-shrink-0">
              <span class="material-symbols-outlined text-light-primary dark:text-primary text-lg flex-shrink-0 mt-0.5">sticky_note_2</span>
              <div class="flex-1 min-w-0">
                @if (editCardId() === card.id) {
                  <input class="w-full text-sm font-semibold bg-light-background dark:bg-background border border-light-border dark:border-white/20 rounded px-2 py-1 text-light-text dark:text-white outline-none focus:border-light-primary dark:focus:border-primary"
                         placeholder="Titre" [(ngModel)]="editForm.title" />
                } @else {
                  <h3 class="text-sm font-semibold text-light-text dark:text-white break-words [overflow-wrap:anywhere] leading-snug">{{ card.title }}</h3>
                }
              </div>
              <button class="w-7 h-7 flex items-center justify-center rounded-md text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white hover:bg-light-background dark:hover:bg-white/5 transition-colors flex-shrink-0"
                      title="Fermer" (click)="closeModal()">
                <span class="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto px-4 py-3">
              @if (editCardId() === card.id) {
                <textarea class="w-full text-[13px] bg-light-background dark:bg-background border border-light-border dark:border-white/20 rounded px-2 py-2 mb-2 text-light-text dark:text-white outline-none resize-y focus:border-light-primary dark:focus:border-primary"
                          rows="6" placeholder="Description (optionnel)" [(ngModel)]="editForm.description"></textarea>
                <div class="flex gap-1.5">
                  <select class="flex-1 text-[11px] bg-light-background dark:bg-background border border-light-border dark:border-white/20 rounded px-1.5 py-1 text-light-text dark:text-white outline-none dark:[color-scheme:dark]"
                          [(ngModel)]="editForm.status">
                    @for (s of statusList; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
                  </select>
                  <select class="flex-1 text-[11px] bg-light-background dark:bg-background border border-light-border dark:border-white/20 rounded px-1.5 py-1 text-light-text dark:text-white outline-none dark:[color-scheme:dark]"
                          [(ngModel)]="editForm.priority">
                    @for (p of priorityList; track p) { <option [value]="p">{{ priorityLabel(p) }}</option> }
                  </select>
                </div>
              } @else {
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-light-background dark:bg-background border border-light-border dark:border-white/10 text-light-text-muted dark:text-white/50">{{ statusLabel(card.status) }}</span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" [class]="priorityColor(card.priority)">{{ priorityLabel(card.priority) }}</span>
                </div>
                @if (card.description) {
                  <p class="text-[13px] text-light-text dark:text-white/75 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{{ card.description }}</p>
                } @else {
                  <p class="text-[12px] italic text-light-text-muted dark:text-white/30">Aucune description.</p>
                }
                <div class="mt-4 text-[11px] text-light-text-muted dark:text-white/30">
                  @if (card.creatorName) { <span>Créé par {{ card.creatorName }} · </span> }
                  <span>{{ formatDate(card.createdAt) }}</span>
                </div>
              }
            </div>

            <!-- Footer actions -->
            <div class="flex items-center gap-1.5 px-4 py-3 border-t border-light-border dark:border-white/8 flex-shrink-0">
              @if (editCardId() === card.id) {
                <button class="text-[11px] px-3 py-1.5 rounded-lg bg-light-primary dark:bg-primary text-white dark:text-btn-text font-semibold hover:opacity-80 transition-opacity"
                        (click)="saveEdit(card)">Enregistrer</button>
                <button class="text-[11px] px-3 py-1.5 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white transition-colors"
                        (click)="cancelEdit()">Annuler</button>
              } @else {
                <button class="text-[11px] px-3 py-1.5 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/50 hover:text-light-primary dark:hover:text-primary transition-colors flex items-center gap-1"
                        (click)="startEdit(card)">
                  <span class="material-symbols-outlined text-sm">edit</span> Modifier
                </button>
                <span class="flex-1"></span>
                @if (deleteConfirmId() === card.id) {
                  <button class="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/20 transition-colors"
                          (click)="confirmDelete(card)">Confirmer suppression</button>
                  <button class="text-[11px] px-3 py-1.5 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white transition-colors"
                          (click)="cancelDelete()">Annuler</button>
                } @else {
                  <button class="text-[11px] px-3 py-1.5 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center gap-1"
                          (click)="askDelete(card.id)">
                    <span class="material-symbols-outlined text-sm">delete</span> Supprimer
                  </button>
                }
              }
            </div>
          </div>
        </div>
      }

    </div>
  `,
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' }
})
export class TrelloBoardComponent implements OnInit, OnDestroy {
  @Input() instanceId = '';
  @Input() boardName  = 'Trello';
  @Input() sectionName = '';
  @Input() deletable  = false;
  /** Lecture seule : aucune création/édition/suppression/déplacement de carte possible. */
  @Input() readonly   = false;
  @Output() deleteBoard  = new EventEmitter<string>();
  @Output() cardsChanged = new EventEmitter<TrelloCard[]>();

  confirmDeleteBoard = signal(false);

  emitDelete() {
    this.confirmDeleteBoard.set(false);
    this.deleteBoard.emit(this.instanceId);
  }

  private svc = inject(MegaOutilsService);
  private collab = inject(ProjetCollabService);
  private trelloSub?: Subscription;
  private hasInitialized = false;

  cards = signal<TrelloCard[]>([]);
  loading = signal(true);

  modalCardId     = signal<string | null>(null);
  expandedCardId  = signal<string | null>(null);
  editCardId      = signal<string | null>(null);
  deleteConfirmId = signal<string | null>(null);
  addingInColumn  = signal<TrelloStatus | null>(null);

  /** Carte affichée dans la popup (suit les mises à jour du signal cards). */
  modalCard = computed(() => this.cards().find(c => c.id === this.modalCardId()) ?? null);

  addForm:  CardForm = { title: '', description: '', status: 'todo', priority: 'medium' };
  editForm: CardForm = { title: '', description: '', status: 'todo', priority: 'medium' };

  readonly columns = COLUMNS;
  readonly statusList: TrelloStatus[]   = COLUMNS;
  readonly priorityList: TrelloPriority[] = ['low', 'medium', 'high', 'critical'];

  totalCards = computed(() => this.cards().length);

  cardsForColumn(col: TrelloStatus): TrelloCard[] {
    return this.cards().filter(c => c.status === col).sort((a, b) => a.orderIndex - b.orderIndex);
  }

  statusLabel(s: TrelloStatus): string     { return TRELLO_STATUS_LABELS[s]; }
  priorityLabel(p: TrelloPriority): string { return TRELLO_PRIORITY_LABELS[p]; }
  priorityColor(p: TrelloPriority): string { return TRELLO_PRIORITY_COLORS[p]; }

  columnBorder(col: TrelloStatus): string      { return COLUMN_STYLES[col].border; }
  columnHeaderColor(col: TrelloStatus): string { return COLUMN_STYLES[col].header; }

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  async ngOnInit() {
    await this.loadCards();
    // Synchro temps réel : recharge les cartes quand un autre user modifie ce board
    this.trelloSub = this.collab.trelloUpdate$.subscribe(evt => {
      if (evt.instanceId === this.instanceId) this.loadCards();
    });
  }

  ngOnDestroy() {
    this.trelloSub?.unsubscribe();
  }

  async loadCards() {
    if (!this.instanceId) return;
    try {
      this.cards.set(await this.svc.getTrelloCards(this.instanceId));
      if (this.hasInitialized) {
        this.cardsChanged.emit(this.cards());
      }
    } finally {
      this.loading.set(false);
      this.hasInitialized = true;
    }
  }

  // ── Add ──────────────────────────────────────────────────────────────────

  startAdd(col: TrelloStatus) {
    if (this.readonly) return;
    this.addingInColumn.set(col);
    this.addForm = { title: '', description: '', status: col, priority: 'medium' };
  }

  cancelAdd() { this.addingInColumn.set(null); }

  async submitAdd(col: TrelloStatus) {
    if (this.readonly) return;
    if (!this.addForm.title.trim()) return;
    const card = await this.svc.createTrelloCard(this.instanceId, {
      title: this.addForm.title.trim(),
      description: this.addForm.description.trim() || undefined,
      status: col,
      priority: this.addForm.priority,
    });
    this.cards.update(c => [...c, card]);
    this.cancelAdd();
    this.cardsChanged.emit(this.cards());
  }

  // ── Edit ─────────────────────────────────────────────────────────────────

  startEdit(card: TrelloCard) {
    if (this.readonly) return;
    this.editCardId.set(card.id);
    this.editForm = { title: card.title, description: card.description || '', status: card.status, priority: card.priority };
  }

  cancelEdit() { this.editCardId.set(null); }

  async saveEdit(card: TrelloCard) {
    if (this.readonly) return;
    const updated = await this.svc.updateTrelloCard(this.instanceId, card.id, {
      title: this.editForm.title.trim() || card.title,
      description: this.editForm.description.trim() || undefined,
      status: this.editForm.status,
      priority: this.editForm.priority,
    });
    this.cards.update(cs => cs.map(c => c.id === updated.id ? updated : c));
    this.editCardId.set(null);
    this.cardsChanged.emit(this.cards());
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  toggleExpand(id: string) {
    this.expandedCardId.set(this.expandedCardId() === id ? null : id);
    this.deleteConfirmId.set(null);
  }

  openCard(card: TrelloCard) {
    this.modalCardId.set(card.id);
    this.editCardId.set(null);
    this.deleteConfirmId.set(null);
  }

  /** Ouvre la popup directement en mode édition (depuis l'expand inline). */
  openCardEdit(card: TrelloCard) {
    this.modalCardId.set(card.id);
    this.startEdit(card);
    this.deleteConfirmId.set(null);
  }

  closeModal() {
    this.modalCardId.set(null);
    this.editCardId.set(null);
    this.deleteConfirmId.set(null);
  }

  askDelete(id: string)    { if (this.readonly) return; this.deleteConfirmId.set(id); }
  cancelDelete()           { this.deleteConfirmId.set(null); }

  async confirmDelete(card: TrelloCard) {
    if (this.readonly) return;
    await this.svc.deleteTrelloCard(this.instanceId, card.id);
    this.cards.update(cs => cs.filter(c => c.id !== card.id));
    this.deleteConfirmId.set(null);
    this.expandedCardId.set(null);
    this.closeModal();
    this.cardsChanged.emit(this.cards());
  }

  // ── Drag & Drop entre colonnes ────────────────────────────────────────────

  private draggedCardId: string | null = null;

  onDragStart(e: DragEvent, card: TrelloCard) {
    if (this.readonly) { e.preventDefault(); return; }
    this.draggedCardId = card.id;
    e.dataTransfer?.setData('text/plain', card.id);
  }

  onDragOver(e: DragEvent, _col: TrelloStatus) { if (!this.readonly) e.preventDefault(); }

  async onDrop(e: DragEvent, col: TrelloStatus) {
    if (this.readonly) return;
    e.preventDefault();
    const id = this.draggedCardId || e.dataTransfer?.getData('text/plain');
    if (!id) return;
    const card = this.cards().find(c => c.id === id);
    if (!card || card.status === col) return;
    const updated = await this.svc.updateTrelloCard(this.instanceId, id, { status: col });
    this.cards.update(cs => cs.map(c => c.id === id ? updated : c));
    this.draggedCardId = null;
    this.cardsChanged.emit(this.cards());
  }
}
