import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
}

@Component({
  selector: 'app-slash-command-menu',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible && filtered.length > 0) {
      <div class="slash-menu"
           [class.slash-menu--fixed]="positionFixed"
           [style.top.px]="top"
           [style.left.px]="left"
           (mousedown)="$event.preventDefault()">
        <div class="slash-menu__header">
          <span class="text-[10px] uppercase tracking-wider opacity-60">Insérer un bloc</span>
        </div>
        <div class="slash-menu__list">
          @for (cmd of filtered; track cmd.id; let i = $index) {
            <button type="button"
                    class="slash-menu__item"
                    [class.is-active]="i === activeIndex"
                    (mouseenter)="activeIndex = i"
                    (click)="select(cmd)">
              <span class="material-symbols-outlined slash-menu__icon">{{ cmd.icon }}</span>
              <div class="slash-menu__text">
                <div class="slash-menu__label">{{ cmd.label }}</div>
                <div class="slash-menu__desc">{{ cmd.description }}</div>
              </div>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .slash-menu {
      position: absolute;
      z-index: 200;
      min-width: 280px;
      max-width: 320px;
      max-height: 320px;
      overflow-y: auto;
      background: #1f2937;
      color: #e5e7eb;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      padding: 0;
      font-size: 13px;
    }
    .slash-menu--fixed { position: fixed; }

    .slash-menu__header {
      padding: 0.5rem 0.75rem 0.35rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .slash-menu__list {
      display: flex;
      flex-direction: column;
      padding: 0.3rem;
    }

    .slash-menu__item {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.5rem 0.6rem;
      background: transparent;
      border: 0;
      border-radius: 5px;
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: background-color 0.08s;

      &:hover, &.is-active {
        background: rgba(59, 130, 246, 0.16);
      }
    }

    .slash-menu__icon {
      flex-shrink: 0;
      font-size: 18px;
      opacity: 0.85;
      width: 22px;
      text-align: center;
    }

    .slash-menu__text {
      flex: 1;
      min-width: 0;
    }

    .slash-menu__label {
      font-size: 13px;
      font-weight: 500;
    }

    .slash-menu__desc {
      font-size: 11px;
      opacity: 0.55;
      margin-top: 1px;
    }

    :host-context(.light) .slash-menu {
      background: #fff;
      color: #111827;
      border-color: rgba(0, 0, 0, 0.08);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    }
    :host-context(.light) .slash-menu__item:hover,
    :host-context(.light) .slash-menu__item.is-active {
      background: rgba(59, 130, 246, 0.10);
    }
  `]
})
export class SlashCommandMenuComponent implements OnChanges {
  @Input() visible = false;
  @Input() top = 0;
  @Input() left = 0;
  @Input() query = '';
  /** Liste de commandes personnalisée (sinon `defaults`). Permet d'enrichir le menu en mode Edition. */
  @Input() commands?: SlashCommand[];
  /** Positionnement fixed (coordonnées viewport) au lieu d'absolute. */
  @Input() positionFixed = false;
  @Output() commandSelect = new EventEmitter<SlashCommand>();

  get all(): SlashCommand[] { return this.commands ?? this.defaults; }

  readonly defaults: SlashCommand[] = [
    { id: 'image',           label: 'Image',           description: 'Téléverser une image',                 icon: 'image',          keywords: ['image', 'photo', 'img', 'picture'] },
    { id: 'callout-info',    label: 'Note Info',       description: 'Bloc d\'information bleu',             icon: 'info',           keywords: ['callout', 'info', 'note', 'information'] },
    { id: 'callout-warning', label: 'Note Attention',  description: 'Bloc d\'avertissement orange',         icon: 'warning',        keywords: ['callout', 'warning', 'attention', 'avertissement'] },
    { id: 'callout-success', label: 'Note Succès',     description: 'Bloc de validation vert',              icon: 'check_circle',   keywords: ['callout', 'success', 'succès', 'ok', 'tip', 'astuce'] },
    { id: 'callout-danger',  label: 'Note Danger',     description: 'Bloc d\'erreur rouge',                 icon: 'error',          keywords: ['callout', 'danger', 'erreur', 'error', 'critical'] },
    { id: 'table',           label: 'Tableau',         description: 'Insérer un tableau Markdown 2×2',       icon: 'table_chart',    keywords: ['table', 'tableau', 'grid'] },
    { id: 'code',            label: 'Bloc de code',    description: 'Bloc de code avec coloration',         icon: 'code',           keywords: ['code', 'snippet', 'pre'] },
    { id: 'quote',           label: 'Citation',        description: 'Bloc citation (>)',                    icon: 'format_quote',   keywords: ['quote', 'citation', 'blockquote'] },
    { id: 'list',            label: 'Liste à puces',   description: 'Liste non ordonnée',                   icon: 'format_list_bulleted', keywords: ['list', 'liste', 'puces', 'bullet'] },
    { id: 'numbered',        label: 'Liste numérotée', description: 'Liste ordonnée',                       icon: 'format_list_numbered', keywords: ['list', 'liste', 'numero', 'ordered'] },
  ];

  filtered: SlashCommand[] = [];
  activeIndex = 0;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['query'] || changes['visible'] || changes['commands']) {
      this.refilter();
    }
  }

  private refilter() {
    const q = (this.query || '').toLowerCase().trim();
    if (!q) {
      this.filtered = [...this.all];
    } else {
      this.filtered = this.all.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.keywords.some(k => k.toLowerCase().includes(q))
      );
    }
    this.activeIndex = 0;
  }

  // Méthodes publiques pour navigation clavier (appelées par le parent)
  moveNext() {
    if (this.filtered.length > 0) this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
  }
  movePrev() {
    if (this.filtered.length > 0) this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
  }
  selectActive() {
    if (this.filtered[this.activeIndex]) this.select(this.filtered[this.activeIndex]);
  }

  select(cmd: SlashCommand) {
    this.commandSelect.emit(cmd);
  }
}
