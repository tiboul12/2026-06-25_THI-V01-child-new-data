import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ImageProps {
  caption: string;
  alignment: '' | 'left' | 'center' | 'right';
  width: string;
}

@Component({
  selector: 'app-image-props-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <div class="img-props-overlay" (click)="close.emit()"></div>
      <div class="img-props-panel"
           [style.top.px]="top"
           [style.left.px]="left"
           (click)="$event.stopPropagation()">
        <div class="img-props-header">
          <span class="material-symbols-outlined text-sm">image</span>
          <span class="text-xs font-medium opacity-70">Propriétés de l'image</span>
          <button type="button" class="img-props-close" (click)="close.emit()" title="Fermer">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div class="img-props-body">
          <label class="img-props-field">
            <span>Légende</span>
            <input type="text"
                   [(ngModel)]="caption"
                   (input)="emitChange()"
                   placeholder="Optionnelle"
                   maxlength="200" />
          </label>

          <div class="img-props-field">
            <span>Alignement</span>
            <div class="img-props-btn-group">
              @for (opt of alignOptions; track opt.value) {
                <button type="button"
                        class="img-props-btn"
                        [class.is-active]="alignment === opt.value"
                        (click)="setAlignment(opt.value)"
                        [title]="opt.label">
                  <span class="material-symbols-outlined text-sm">{{ opt.icon }}</span>
                </button>
              }
            </div>
          </div>

          <label class="img-props-field">
            <span>Largeur</span>
            <div class="img-props-width-row">
              <input type="text"
                     [(ngModel)]="width"
                     (input)="emitChange()"
                     placeholder="auto"
                     pattern="^\\d+(px|%)?$" />
              <div class="img-props-presets">
                @for (preset of widthPresets; track preset) {
                  <button type="button"
                          class="img-props-preset"
                          (click)="setWidth(preset)">
                    {{ preset || 'auto' }}
                  </button>
                }
              </div>
            </div>
          </label>
        </div>

        <div class="img-props-footer">
          <button type="button" class="img-props-delete" (click)="delete.emit()">
            <span class="material-symbols-outlined text-sm">delete</span>
            Supprimer l'image
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .img-props-overlay {
      position: fixed; inset: 0;
      z-index: 100;
    }

    .img-props-panel {
      position: absolute;
      z-index: 101;
      min-width: 280px;
      max-width: 320px;
      background: var(--surface-elev-2, #1f2937);
      color: var(--text, #e5e7eb);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
      padding: 0;
      font-size: 13px;
    }

    .img-props-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .img-props-close {
      margin-left: auto;
      background: transparent;
      border: 0;
      color: inherit;
      cursor: pointer;
      opacity: 0.6;
      border-radius: 4px;
      padding: 2px;
      &:hover { opacity: 1; background: rgba(255, 255, 255, 0.05); }
    }

    .img-props-body {
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .img-props-field {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;

      > span {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.55;
      }

      input[type="text"] {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: inherit;
        border-radius: 5px;
        padding: 0.4rem 0.55rem;
        font-size: 13px;
        outline: none;
        &:focus { border-color: rgba(59, 130, 246, 0.5); }
      }
    }

    .img-props-btn-group {
      display: flex;
      gap: 0.25rem;
    }

    .img-props-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.07);
      color: inherit;
      border-radius: 5px;
      padding: 0.45rem;
      cursor: pointer;
      transition: background-color 0.12s, border-color 0.12s;
      &:hover { background: rgba(255, 255, 255, 0.04); }
      &.is-active {
        background: rgba(59, 130, 246, 0.18);
        border-color: rgba(59, 130, 246, 0.5);
        color: rgb(147, 197, 253);
      }
    }

    .img-props-width-row {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .img-props-presets {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
    }

    .img-props-preset {
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.07);
      color: inherit;
      border-radius: 4px;
      padding: 0.25rem 0.5rem;
      font-size: 11px;
      cursor: pointer;
      &:hover { background: rgba(255, 255, 255, 0.05); }
    }

    .img-props-footer {
      padding: 0.6rem 0.75rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .img-props-delete {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: rgb(248, 113, 113);
      border-radius: 5px;
      padding: 0.45rem;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.12s;
      &:hover { background: rgba(239, 68, 68, 0.18); }
    }

    :host-context(.light) .img-props-panel {
      background: #fff;
      color: #111827;
      border-color: rgba(0, 0, 0, 0.08);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    }
    :host-context(.light) .img-props-field > span { opacity: 0.6; }
    :host-context(.light) .img-props-field input[type="text"] {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.08);
    }
    :host-context(.light) .img-props-btn,
    :host-context(.light) .img-props-preset {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.08);
      &:hover { background: rgba(0, 0, 0, 0.05); }
    }
  `]
})
export class ImagePropsPanelComponent {
  @Input() visible = false;
  @Input() top = 0;
  @Input() left = 0;
  @Input() imageId = '';

  @Input() set caption(v: string) { this._caption = v || ''; }
  get caption(): string { return this._caption; }
  private _caption = '';

  @Input() set alignment(v: '' | 'left' | 'center' | 'right') { this._alignment = v || ''; }
  get alignment(): '' | 'left' | 'center' | 'right' { return this._alignment; }
  private _alignment: '' | 'left' | 'center' | 'right' = '';

  @Input() set width(v: string) { this._width = v || ''; }
  get width(): string { return this._width; }
  private _width = '';

  @Output() propsChange = new EventEmitter<{ imageId: string; props: ImageProps }>();
  @Output() close = new EventEmitter<void>();
  @Output() delete = new EventEmitter<string>();

  readonly alignOptions: { value: '' | 'left' | 'center' | 'right'; label: string; icon: string }[] = [
    { value: '',       label: 'Par défaut', icon: 'format_align_justify' },
    { value: 'left',   label: 'Gauche',     icon: 'format_align_left' },
    { value: 'center', label: 'Centré',     icon: 'format_align_center' },
    { value: 'right',  label: 'Droite',     icon: 'format_align_right' },
  ];

  readonly widthPresets = ['', '200px', '400px', '600px', '100%'];

  setAlignment(v: '' | 'left' | 'center' | 'right') {
    this._alignment = v;
    this.emitChange();
  }

  setWidth(v: string) {
    this._width = v;
    this.emitChange();
  }

  emitChange() {
    this.propsChange.emit({
      imageId: this.imageId,
      props: { caption: this._caption, alignment: this._alignment, width: this._width }
    });
  }
}
