import {
  Component, Input, Output, EventEmitter,
  OnInit, OnDestroy, signal, computed, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  MegaOutilsService, ProjetCollabService,
  MockupElement, MockupComment, MockupElementType,
  MOCKUP_ELEMENT_LABELS, MOCKUP_ELEMENT_DEFAULTS
} from '@worganic/portail-core/data-access';

type ActiveTool = MockupElementType | 'cursor';
type ResizeHandle = 'se' | 'e' | 's';

interface DragState {
  elementId: string;
  mode: 'move' | ResizeHandle;
  startMX: number; startMY: number;
  startX: number; startY: number;
  startW: number; startH: number;
  // Enfants embarqués quand on déplace un conteneur
  children?: { id: string; startX: number; startY: number }[];
}

function isInsideContainer(el: MockupElement, container: MockupElement): boolean {
  // Test sur le centre de l'élément : résiste aux redimensionnements du conteneur
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return cx >= container.x && cx <= container.x + container.width &&
    cy >= container.y && cy <= container.y + container.height;
}

const ELEMENT_TYPES: MockupElementType[] = [
  'button', 'input', 'textarea', 'select',
  'checkbox', 'radio', 'text', 'heading', 'label', 'link',
  'image', 'card', 'navbar', 'container', 'divider', 'note'
];

const CANVAS_W = 1200;
const CANVAS_H = 900;

@Component({
  selector: 'app-mockup-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full bg-light-background dark:bg-background overflow-hidden relative">

      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-light-border dark:border-white/8 flex-shrink-0">
        <span class="material-symbols-outlined text-light-primary dark:text-primary text-lg">design_services</span>
        <span class="text-sm font-semibold text-light-text dark:text-white/90">{{ boardName }}</span>
        @if (sectionName) {
          <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <span class="material-symbols-outlined text-[12px]">tag</span>{{ sectionName }}
          </span>
        }
        <span class="flex-1"></span>
        <span class="text-xs text-light-text-muted dark:text-white/30">{{ elements().length }} élément{{ elements().length > 1 ? 's' : '' }}</span>
        @if (deletable) {
          @if (confirmDelete()) {
            <span class="text-xs text-red-400">Supprimer ?</span>
            <button class="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    (click)="deleteBoard.emit(instanceId)">Oui</button>
            <button class="text-xs px-2 py-1 rounded bg-white/5 text-white/40 hover:bg-white/10"
                    (click)="confirmDelete.set(false)">Non</button>
          } @else {
            <button class="text-light-text-muted dark:text-white/30 hover:text-red-400 transition-colors"
                    (click)="confirmDelete.set(true)" title="Supprimer ce mockup">
              <span class="material-symbols-outlined text-lg">delete</span>
            </button>
          }
        }
      </div>

      <!-- Barre d'édition compacte (icônes) -->
      @if (selectedElementId() || multiSelectedIds().length > 0) {
        <div class="flex items-center gap-0.5 px-2 py-1 border-b border-light-border dark:border-white/8 bg-light-surface dark:bg-[#0d0d1a] flex-shrink-0 overflow-x-auto">

          <!-- Texte (single) -->
          @if (selectedElementId() && multiSelectedIds().length === 0) {
            <button class="flex items-center justify-center w-7 h-7 rounded text-violet-500 dark:text-violet-400 hover:bg-violet-500/10 flex-shrink-0 transition-colors"
                    title="Modifier le texte (double-clic sur l'élément)"
                    (click)="openLabelEdit()">
              <span class="material-symbols-outlined text-[15px]">edit</span>
            </button>
            <!-- Dupliquer -->
            <button class="flex items-center justify-center w-7 h-7 rounded text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white/80 hover:bg-light-surface-hover dark:hover:bg-white/10 flex-shrink-0 transition-colors"
                    title="Dupliquer (Ctrl+D)"
                    (click)="duplicateSelected()">
              <span class="material-symbols-outlined text-[15px]">content_copy</span>
            </button>
          }

          <!-- Supprimer -->
          <button class="flex items-center justify-center w-7 h-7 rounded text-red-500 dark:text-red-400 hover:bg-red-500/10 flex-shrink-0 transition-colors"
                  title="Supprimer (Suppr)"
                  (click)="deleteSelected()">
            <span class="material-symbols-outlined text-[15px]">delete</span>
          </button>

          <div class="w-px h-4 bg-light-border dark:bg-white/10 mx-1 flex-shrink-0"></div>

          <!-- Aligner G/C/D -->
          <button class="flex items-center justify-center w-7 h-7 rounded text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white/80 hover:bg-light-surface-hover dark:hover:bg-white/10 flex-shrink-0 transition-colors"
                  title="Aligner à gauche" (click)="alignSelected('left')">
            <span class="material-symbols-outlined text-[15px]">align_horizontal_left</span>
          </button>
          <button class="flex items-center justify-center w-7 h-7 rounded text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white/80 hover:bg-light-surface-hover dark:hover:bg-white/10 flex-shrink-0 transition-colors"
                  title="Centrer horizontalement" (click)="alignSelected('center')">
            <span class="material-symbols-outlined text-[15px]">align_horizontal_center</span>
          </button>
          <button class="flex items-center justify-center w-7 h-7 rounded text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white/80 hover:bg-light-surface-hover dark:hover:bg-white/10 flex-shrink-0 transition-colors"
                  title="Aligner à droite" (click)="alignSelected('right')">
            <span class="material-symbols-outlined text-[15px]">align_horizontal_right</span>
          </button>

          <!-- Distribuer H/V (3+ éléments) -->
          @if (multiSelectedIds().length > 2) {
            <div class="w-px h-4 bg-light-border dark:bg-white/10 mx-1 flex-shrink-0"></div>
            <button class="flex items-center justify-center w-7 h-7 rounded text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white/80 hover:bg-light-surface-hover dark:hover:bg-white/10 flex-shrink-0 transition-colors"
                    title="Distribuer horizontalement (espacement uniforme)"
                    (click)="distributeSelected('horizontal')">
              <span class="material-symbols-outlined text-[15px]">horizontal_distribute</span>
            </button>
            <button class="flex items-center justify-center w-7 h-7 rounded text-light-text-muted dark:text-white/50 hover:text-light-text dark:hover:text-white/80 hover:bg-light-surface-hover dark:hover:bg-white/10 flex-shrink-0 transition-colors"
                    title="Distribuer verticalement (espacement uniforme)"
                    (click)="distributeSelected('vertical')">
              <span class="material-symbols-outlined text-[15px]">vertical_distribute</span>
            </button>
          }

          <!-- Grouper (2+) / Dégrouper (container seul) -->
          @if (multiSelectedIds().length > 1 || selectedIsContainer()) {
            <div class="w-px h-4 bg-light-border dark:bg-white/10 mx-1 flex-shrink-0"></div>
          }
          @if (multiSelectedIds().length > 1) {
            <button class="flex items-center justify-center w-7 h-7 rounded text-amber-500 dark:text-amber-400 hover:bg-amber-500/10 flex-shrink-0 transition-colors"
                    [title]="'Grouper (' + multiSelectedIds().length + ' éléments)'"
                    (click)="groupSelected()">
              <span class="material-symbols-outlined text-[15px]">select_all</span>
            </button>
          }
          @if (selectedIsContainer() && multiSelectedIds().length === 0) {
            <button class="flex items-center justify-center w-7 h-7 rounded text-amber-500 dark:text-amber-400 hover:bg-amber-500/10 flex-shrink-0 transition-colors"
                    title="Dégrouper (supprime le cadre, garde les éléments)"
                    (click)="ungroupSelected()">
              <span class="material-symbols-outlined text-[15px]">border_clear</span>
            </button>
          }

          <!-- Badge count multi-select -->
          @if (multiSelectedIds().length > 0) {
            <span class="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-violet-500/20 text-violet-400 flex-shrink-0">
              {{ multiSelectedIds().length }}
            </span>
          }

        </div>
      }

      <!-- Body : toolbox + canvas + comments -->
      <div class="flex flex-1 overflow-hidden">

        <!-- Toolbox -->
        <div class="w-28 flex flex-col gap-0.5 p-2 border-r border-light-border dark:border-white/8 overflow-y-auto flex-shrink-0 bg-light-surface dark:bg-surface">
          <button class="text-[11px] px-2 py-1.5 rounded text-left transition-colors"
                  [class.bg-violet-500]="activeTool() === 'cursor'"
                  [class.text-white]="activeTool() === 'cursor'"
                  [class.bg-white]="activeTool() !== 'cursor'"
                  [class.bg-opacity-5]="activeTool() !== 'cursor'"
                  [class.text-light-text-muted]="activeTool() !== 'cursor'"
                  [class.dark:bg-white]="activeTool() !== 'cursor'"
                  [class.dark:bg-opacity-5]="activeTool() !== 'cursor'"
                  [class.dark:text-white]="activeTool() !== 'cursor'"
                  [class.dark:text-opacity-40]="activeTool() !== 'cursor'"
                  (click)="activeTool.set('cursor')">
            ↖ Sélect
          </button>
          <hr class="border-light-border dark:border-white/8 my-1" />
          @for (t of elementTypes; track t) {
            <button class="text-[11px] px-2 py-1.5 rounded text-left transition-colors"
                    [ngClass]="activeTool() === t
                      ? 'bg-violet-500 text-white'
                      : 'bg-white/[0.05] text-white/40 hover:bg-white/[0.10] hover:text-white/70'"
                    (click)="activeTool.set(t)">
              {{ labels[t] }}
            </button>
          }
        </div>

        <!-- Canvas SVG -->
        <div class="flex-1 overflow-auto relative"
             tabindex="0"
             [class.cursor-crosshair]="activeTool() !== 'cursor'"
             [class.cursor-default]="activeTool() === 'cursor'"
             (keydown)="onCanvasKeyDown($event)">
          <svg [attr.width]="canvasW" [attr.height]="canvasH"
               class="block select-none"
               style="background: repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(255,255,255,.04) 19px,rgba(255,255,255,.04) 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,rgba(255,255,255,.04) 19px,rgba(255,255,255,.04) 20px)"
               (mousedown)="onSvgMouseDown($event)"
               (mousemove)="onMouseMove($event)"
               (mouseup)="onMouseUp()"
               (mouseleave)="onMouseUp()">

            @for (el of elements(); track el.id) {
              <g [attr.transform]="'translate(' + el.x + ',' + el.y + ')'"
                 [class.cursor-move]="activeTool() === 'select'"
                 (mousedown)="onElementMouseDown($event, el)"
                 (dblclick)="openLabelEditFor(el)">

                <!-- Shape SVG selon le type -->
                @switch (el.type) {
                  @case ('button') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="6"
                          fill="#4f46e5" stroke="#6366f1" stroke-width="1" />
                    <text [attr.x]="el.width/2" [attr.y]="el.height/2 + 4"
                          text-anchor="middle" fill="white" font-size="13" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('input') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="4"
                          fill="transparent" stroke="#6b7280" stroke-width="1.5" />
                    <text x="8" [attr.y]="el.height/2 + 4"
                          fill="#9ca3af" font-size="12" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('textarea') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="4"
                          fill="transparent" stroke="#6b7280" stroke-width="1.5" />
                    <line x1="8" [attr.y1]="el.height*0.35" [attr.x2]="el.width-8" [attr.y2]="el.height*0.35" stroke="#6b7280" stroke-width="1" />
                    <line x1="8" [attr.y1]="el.height*0.55" [attr.x2]="el.width-8" [attr.y2]="el.height*0.55" stroke="#6b7280" stroke-width="1" />
                    <line x1="8" [attr.y1]="el.height*0.75" [attr.x2]="el.width*0.6" [attr.y2]="el.height*0.75" stroke="#6b7280" stroke-width="1" />
                    <text x="8" y="18" fill="#9ca3af" font-size="11" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('select') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="4"
                          fill="transparent" stroke="#6b7280" stroke-width="1.5" />
                    <text x="8" [attr.y]="el.height/2 + 4"
                          fill="#9ca3af" font-size="12" font-family="sans-serif">{{ el.label }}</text>
                    <text [attr.x]="el.width - 16" [attr.y]="el.height/2 + 5"
                          fill="#9ca3af" font-size="11" font-family="sans-serif">▼</text>
                  }
                  @case ('checkbox') {
                    <rect x="0" y="4" width="16" height="16" rx="3"
                          fill="transparent" stroke="#6b7280" stroke-width="1.5" />
                    <text x="22" [attr.y]="el.height/2 + 4"
                          fill="#d1d5db" font-size="12" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('radio') {
                    <circle cx="8" cy="12" r="8"
                            fill="transparent" stroke="#6b7280" stroke-width="1.5" />
                    <text x="22" [attr.y]="el.height/2 + 4"
                          fill="#d1d5db" font-size="12" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('text') {
                    <text x="0" y="16"
                          fill="#e5e7eb" font-size="14" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('heading') {
                    <text x="0" y="24"
                          fill="#f9fafb" font-size="20" font-weight="700" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('label') {
                    <text x="0" y="14"
                          fill="#9ca3af" font-size="11" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('link') {
                    <text x="0" y="16"
                          fill="#818cf8" font-size="13" font-family="sans-serif" text-decoration="underline">{{ el.label }}</text>
                  }
                  @case ('image') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="4"
                          fill="rgba(107,114,128,0.15)" stroke="#6b7280" stroke-width="1.5" />
                    <line x1="0" y1="0" [attr.x2]="el.width" [attr.y2]="el.height" stroke="#6b7280" stroke-width="1" />
                    <line [attr.x1]="el.width" y1="0" x2="0" [attr.y2]="el.height" stroke="#6b7280" stroke-width="1" />
                    <text [attr.x]="el.width/2" [attr.y]="el.height/2 + 4"
                          text-anchor="middle" fill="#9ca3af" font-size="11" font-family="sans-serif">{{ el.label || 'Image' }}</text>
                  }
                  @case ('card') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="8"
                          fill="rgba(255,255,255,0.04)" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 2" />
                    @if (el.label) {
                      <text x="12" y="20"
                            fill="#d1d5db" font-size="13" font-weight="600" font-family="sans-serif">{{ el.label }}</text>
                    }
                  }
                  @case ('navbar') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="0"
                          fill="#1f2937" stroke="#374151" stroke-width="1" />
                    <circle cx="20" cy="25" r="8" fill="#4f46e5" />
                    <rect x="40" y="18" width="40" height="14" rx="2" fill="rgba(255,255,255,0.1)" />
                    <rect [attr.x]="el.width - 100" y="18" width="30" height="14" rx="2" fill="rgba(255,255,255,0.06)" />
                    <rect [attr.x]="el.width - 64" y="18" width="30" height="14" rx="2" fill="rgba(255,255,255,0.06)" />
                    <text x="96" y="29" fill="#9ca3af" font-size="11" font-family="sans-serif">{{ el.label }}</text>
                  }
                  @case ('container') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="4"
                          fill="rgba(255,255,255,0.02)" stroke="#4b5563" stroke-width="1.5" stroke-dasharray="6 3" />
                    @if (el.label) {
                      <text x="6" y="16"
                            fill="#6b7280" font-size="10" font-family="sans-serif">{{ el.label }}</text>
                    }
                  }
                  @case ('divider') {
                    <line x1="0" [attr.y1]="el.height/2" [attr.x2]="el.width" [attr.y2]="el.height/2"
                          stroke="#4b5563" stroke-width="1.5" />
                  }
                  @case ('note') {
                    <rect [attr.width]="el.width" [attr.height]="el.height" rx="2"
                          fill="#fef08a" stroke="#ca8a04" stroke-width="1" />
                    <text x="8" y="18" fill="#78350f" font-size="12" font-family="sans-serif">{{ el.label }}</text>
                  }
                }

                <!-- Bordure de sélection principale -->
                @if (selectedElementId() === el.id) {
                  <rect [attr.width]="el.width" [attr.height]="el.height" rx="2"
                        fill="none" stroke="#818cf8" stroke-width="2" stroke-dasharray="4 2" pointer-events="none" />
                  <!-- Poignée resize SE -->
                  <rect [attr.x]="el.width - 5" [attr.y]="el.height - 5" width="10" height="10"
                        fill="#818cf8" rx="2" class="cursor-se-resize"
                        (mousedown)="onResizeMouseDown($event, el, 'se')" />
                  <!-- Poignée resize E -->
                  <rect [attr.x]="el.width - 4" [attr.y]="el.height/2 - 4" width="8" height="8"
                        fill="#818cf8" rx="2" class="cursor-e-resize"
                        (mousedown)="onResizeMouseDown($event, el, 'e')" />
                  <!-- Poignée resize S -->
                  <rect [attr.x]="el.width/2 - 4" [attr.y]="el.height - 4" width="8" height="8"
                        fill="#818cf8" rx="2" class="cursor-s-resize"
                        (mousedown)="onResizeMouseDown($event, el, 's')" />
                }

                <!-- Bordure de multi-sélection -->
                @if (isMultiSelected(el.id)) {
                  <rect [attr.width]="el.width" [attr.height]="el.height" rx="2"
                        fill="rgba(251,191,36,0.08)" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="3 2" pointer-events="none" />
                }

                <!-- Badge commentaire -->
                @if (commentCountForElement(el.id) > 0) {
                  <circle [attr.cx]="el.width - 8" cy="8" r="8" fill="#f59e0b" />
                  <text [attr.x]="el.width - 8" y="12" text-anchor="middle"
                        fill="white" font-size="9" font-weight="700" font-family="sans-serif">
                    {{ commentCountForElement(el.id) }}
                  </text>
                }

              </g>
            }
          </svg>
        </div>

        <!-- Panel commentaires (quand un élément est sélectionné) -->
        @if (selectedElementId()) {
          <div class="w-60 flex flex-col border-l border-light-border dark:border-white/8 bg-light-surface dark:bg-surface flex-shrink-0">
            <div class="flex items-center gap-2 px-3 py-2 border-b border-light-border dark:border-white/8">
              <span class="material-symbols-outlined text-amber-400 text-base">chat_bubble</span>
              <span class="text-xs font-semibold text-light-text dark:text-white/70">Commentaires</span>
              <span class="flex-1"></span>
              <button class="text-light-text-muted dark:text-white/30 hover:text-light-text dark:hover:text-white/70"
                      (click)="clearSelection()">
                <span class="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
              @for (c of selectedComments(); track c.id) {
                <div class="bg-white/[0.05] rounded p-2 text-xs">
                  @if (c.authorName) {
                    <span class="text-white/50 font-medium">{{ c.authorName }} : </span>
                  }
                  <span class="text-white/80">{{ c.text }}</span>
                  <button class="ml-1 text-white/20 hover:text-red-400"
                          (click)="deleteComment(c)">×</button>
                </div>
              }
              @if (!selectedComments().length) {
                <p class="text-xs text-white/30 text-center py-4">Aucun commentaire</p>
              }
            </div>
            <div class="p-2 border-t border-white/8 flex flex-col gap-1">
              <textarea class="w-full text-xs bg-white/[0.05] border border-white/10 rounded p-2 text-white/80 resize-none focus:outline-none focus:border-violet-500/50"
                        rows="3" placeholder="Ajouter un commentaire..."
                        [(ngModel)]="newCommentText"></textarea>
              <button class="w-full text-xs py-1.5 rounded bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
                      [disabled]="!newCommentText.trim() || savingComment()"
                      (click)="addComment()">
                {{ savingComment() ? '...' : 'Ajouter' }}
              </button>
            </div>
          </div>
        }

      </div>

      <!-- Barre de tous les commentaires (si > 0) -->
      @if (comments().length && !selectedElementId()) {
        <div class="border-t border-light-border dark:border-white/8 bg-light-surface dark:bg-surface px-3 py-1.5 max-h-24 overflow-y-auto">
          <span class="text-[11px] text-white/40 font-medium mr-2">Tous les commentaires :</span>
          @for (c of comments(); track c.id) {
            <span class="inline-flex items-center gap-1 text-[11px] text-white/60 mr-3">
              <span class="text-amber-400">•</span>
              @if (c.authorName) {<span class="text-white/40">{{ c.authorName }} :</span>}
              {{ c.text }}
            </span>
          }
        </div>
      }

      <!-- Dialog édition du texte (overlay centré) -->
      @if (editingElementId()) {
        <div class="absolute inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div class="bg-white dark:bg-[#1a1a2e] border border-light-border dark:border-white/10 rounded-xl p-5 w-72 shadow-2xl">
            <p class="text-sm font-semibold text-light-text dark:text-white/90 mb-1">Modifier le texte</p>
            <p class="text-[11px] text-light-text-muted dark:text-white/40 mb-3">{{ editingElementType }}</p>
            <input class="w-full text-sm bg-light-surface dark:bg-white/[0.05] border border-light-border dark:border-white/10 rounded px-3 py-2 text-light-text dark:text-white/80 focus:outline-none focus:border-violet-500/50"
                   placeholder="Texte de l'élément..."
                   [(ngModel)]="editingLabel"
                   (keydown.enter)="confirmLabelEdit()"
                   (keydown.escape)="cancelLabelEdit()"
                   autofocus />
            <div class="flex gap-2 mt-3">
              <button class="flex-1 text-sm py-2 rounded-lg bg-violet-500/20 text-violet-600 dark:text-violet-300 hover:bg-violet-500/30 transition-colors"
                      (click)="confirmLabelEdit()">Confirmer</button>
              <button class="flex-1 text-sm py-2 rounded-lg border border-light-border dark:border-white/20 text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white/70 transition-colors"
                      (click)="cancelLabelEdit()">Annuler</button>
            </div>
          </div>
        </div>
      }

    </div>
  `
})
export class MockupBoardComponent implements OnInit, OnDestroy {
  @Input() instanceId = '';
  @Input() boardName = 'Mockup';
  @Input() sectionName = '';
  @Input() deletable = false;
  @Output() deleteBoard = new EventEmitter<string>();

  private svc = inject(MegaOutilsService);
  private collab = inject(ProjetCollabService);
  private sub?: Subscription;

  readonly labels = MOCKUP_ELEMENT_LABELS;
  readonly elementTypes = ELEMENT_TYPES;
  readonly canvasW = CANVAS_W;
  readonly canvasH = CANVAS_H;

  elements = signal<MockupElement[]>([]);
  comments = signal<MockupComment[]>([]);
  selectedElementId = signal<string | null>(null);
  multiSelectedIds = signal<string[]>([]);
  activeTool = signal<ActiveTool>('cursor');
  confirmDelete = signal(false);
  loading = signal(false);
  savingComment = signal(false);
  newCommentText = '';

  // Edition du texte
  editingElementId = signal<string | null>(null);
  editingLabel = '';
  editingElementType = '';

  private dragState: DragState | null = null;
  private pendingSave: ReturnType<typeof setTimeout> | null = null;

  selectedComments = computed(() => {
    const id = this.selectedElementId();
    return id ? this.comments().filter(c => c.elementId === id) : [];
  });

  selectedIsContainer = computed(() => {
    const id = this.selectedElementId();
    return !!id && this.elements().find(e => e.id === id)?.type === 'container';
  });

  commentCountForElement(elementId: string): number {
    return this.comments().filter(c => c.elementId === elementId).length;
  }

  isMultiSelected(elementId: string): boolean {
    return this.multiSelectedIds().includes(elementId);
  }

  async ngOnInit() {
    if (!this.instanceId) return;
    await this.load();
    this.sub = this.collab.mockupUpdate$.subscribe(ev => {
      if (ev.instanceId === this.instanceId || ev.instanceId === null) this.load();
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  private async load() {
    this.loading.set(true);
    try {
      const [elements, comments] = await Promise.all([
        this.svc.getMockupElements(this.instanceId),
        this.svc.getMockupComments(this.instanceId)
      ]);
      this.elements.set(elements);
      this.comments.set(comments);
    } finally { this.loading.set(false); }
  }

  clearSelection() {
    this.selectedElementId.set(null);
    this.multiSelectedIds.set([]);
  }

  // ── Canvas click — ajout d'élément ──────────────────────────────────────────

  onSvgMouseDown(event: MouseEvent) {
    const tool = this.activeTool();
    if (tool === 'cursor') {
      // Clic sur fond → désélectionner
      if (!event.shiftKey) this.clearSelection();
      return;
    }
    const svg = event.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const x = Math.round(event.clientX - rect.left);
    const y = Math.round(event.clientY - rect.top);
    this.createElement(tool as MockupElementType, x, y);
    this.activeTool.set('cursor');
    event.stopPropagation();
  }

  private async createElement(type: MockupElementType, x: number, y: number) {
    const def = MOCKUP_ELEMENT_DEFAULTS[type];
    try {
      const el = await this.svc.createMockupElement(this.instanceId, {
        type, x, y, width: def.w, height: def.h, label: def.label
      });
      this.elements.update(list => [...list, el]);
      this.selectedElementId.set(el.id);
    } catch (e) { console.error(e); }
  }

  // ── Drag déplacer / resize ────────────────────────────────────────────────────

  onElementMouseDown(event: MouseEvent, el: MockupElement) {
    if (this.activeTool() !== 'cursor') return;
    event.stopPropagation();

    if (event.shiftKey) {
      // Transférer selectedElementId dans multiSelectedIds s'il n'y est pas encore
      const primary = this.selectedElementId();
      this.multiSelectedIds.update(ids => {
        let next = [...ids];
        if (primary && !next.includes(primary)) next.push(primary);
        if (next.includes(el.id)) next = next.filter(id => id !== el.id);
        else next.push(el.id);
        return next;
      });
      this.selectedElementId.set(el.id);
      return;
    }

    // Sélection simple
    this.multiSelectedIds.set([]);
    this.selectedElementId.set(el.id);

    // Si c'est un conteneur, embarquer les éléments à l'intérieur
    let children: { id: string; startX: number; startY: number }[] | undefined;
    if (el.type === 'container') {
      children = this.elements()
        .filter(other => other.id !== el.id && isInsideContainer(other, el))
        .map(other => ({ id: other.id, startX: other.x, startY: other.y }));
    }

    this.dragState = {
      elementId: el.id, mode: 'move',
      startMX: event.clientX, startMY: event.clientY,
      startX: el.x, startY: el.y, startW: el.width, startH: el.height,
      children
    };
  }

  onResizeMouseDown(event: MouseEvent, el: MockupElement, handle: ResizeHandle) {
    event.stopPropagation();
    this.dragState = {
      elementId: el.id, mode: handle,
      startMX: event.clientX, startMY: event.clientY,
      startX: el.x, startY: el.y, startW: el.width, startH: el.height
    };
  }

  onMouseMove(event: MouseEvent) {
    if (!this.dragState) return;
    const dx = event.clientX - this.dragState.startMX;
    const dy = event.clientY - this.dragState.startMY;
    const { elementId, mode, startX, startY, startW, startH, children } = this.dragState;

    this.elements.update(list => list.map(el => {
      if (el.id === elementId) {
        if (mode === 'move') {
          return { ...el, x: Math.max(0, startX + dx), y: Math.max(0, startY + dy) };
        }
        if (mode === 'se' || mode === 'e') {
          const w = Math.max(20, startW + dx);
          const h = mode === 'se' ? Math.max(8, startH + dy) : el.height;
          return { ...el, width: w, height: h };
        }
        if (mode === 's') {
          return { ...el, height: Math.max(8, startH + dy) };
        }
      }
      // Déplacer les enfants embarqués avec le conteneur
      if (mode === 'move' && children) {
        const child = children.find(c => c.id === el.id);
        if (child) {
          return { ...el, x: Math.max(0, child.startX + dx), y: Math.max(0, child.startY + dy) };
        }
      }
      return el;
    }));
  }

  onMouseUp() {
    if (!this.dragState) return;
    const { elementId, mode, children } = this.dragState;
    const childIds = (mode === 'move' && children) ? children.map(c => c.id) : [];
    const idsToSave = [elementId, ...childIds];
    const elemsToSave = this.elements().filter(e => idsToSave.includes(e.id));
    this.dragState = null;

    if (this.pendingSave) clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => {
      Promise.all(elemsToSave.map(el =>
        this.svc.updateMockupElement(this.instanceId, el.id, { x: el.x, y: el.y, width: el.width, height: el.height })
          .catch(e => console.error('[mockup] save element:', e))
      ));
    }, 300);
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  onCanvasKeyDown(event: KeyboardEvent) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedElementId() || this.multiSelectedIds().length > 0) {
        event.preventDefault();
        this.deleteSelected();
      }
    }
    if (event.key === 'Escape') {
      this.clearSelection();
    }
    if (event.key === 'Enter' && this.selectedElementId() && this.multiSelectedIds().length === 0) {
      event.preventDefault();
      const el = this.elements().find(e => e.id === this.selectedElementId());
      if (el) this.openLabelEditFor(el);
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
      event.preventDefault();
      this.duplicateSelected();
    }
  }

  // ── Edition du texte ────────────────────────────────────────────────────────

  openLabelEdit() {
    const id = this.selectedElementId();
    if (!id) return;
    const el = this.elements().find(e => e.id === id);
    if (el) this.openLabelEditFor(el);
  }

  openLabelEditFor(el: MockupElement) {
    if (this.activeTool() !== 'cursor') return;
    this.editingLabel = el.label;
    this.editingElementType = this.labels[el.type] ?? el.type;
    this.editingElementId.set(el.id);
  }

  async confirmLabelEdit() {
    const id = this.editingElementId();
    if (!id) return;
    const label = this.editingLabel;
    this.elements.update(list => list.map(el => el.id === id ? { ...el, label } : el));
    this.editingElementId.set(null);
    await this.svc.updateMockupElement(this.instanceId, id, { label }).catch(e => console.error(e));
  }

  cancelLabelEdit() {
    this.editingElementId.set(null);
  }

  // ── Supprimer ────────────────────────────────────────────────────────────────

  async deleteSelected() {
    const multiIds = this.multiSelectedIds();
    const singleId = this.selectedElementId();
    const idsToDelete = multiIds.length > 0 ? multiIds : singleId ? [singleId] : [];
    if (!idsToDelete.length) return;

    this.elements.update(list => list.filter(e => !idsToDelete.includes(e.id)));
    this.clearSelection();

    await Promise.all(
      idsToDelete.map(id => this.svc.deleteMockupElement(this.instanceId, id).catch(e => console.error(e)))
    );
  }

  // ── Dupliquer ────────────────────────────────────────────────────────────────

  async duplicateSelected() {
    const id = this.selectedElementId();
    if (!id) return;
    const el = this.elements().find(e => e.id === id);
    if (!el) return;
    try {
      const newEl = await this.svc.createMockupElement(this.instanceId, {
        type: el.type, x: el.x + 20, y: el.y + 20,
        width: el.width, height: el.height, label: el.label
      });
      this.elements.update(list => [...list, newEl]);
      this.selectedElementId.set(newEl.id);
    } catch (e) { console.error(e); }
  }

  // ── Aligner ──────────────────────────────────────────────────────────────────

  async alignSelected(dir: 'left' | 'center' | 'right') {
    const multiIds = this.multiSelectedIds();
    const singleId = this.selectedElementId();
    const ids = multiIds.length > 0 ? multiIds : singleId ? [singleId] : [];
    if (!ids.length) return;

    const elems = this.elements().filter(e => ids.includes(e.id));
    let updates: MockupElement[];

    if (ids.length === 1) {
      // Alignement par rapport au canvas
      const el = elems[0];
      const newX = dir === 'left' ? 0 : dir === 'right' ? CANVAS_W - el.width : Math.round((CANVAS_W - el.width) / 2);
      updates = [{ ...el, x: newX }];
    } else {
      // Alignement du groupe entre eux
      const refX = dir === 'left'
        ? Math.min(...elems.map(e => e.x))
        : dir === 'right'
          ? Math.max(...elems.map(e => e.x + e.width))
          : Math.round(elems.reduce((s, e) => s + e.x + e.width / 2, 0) / elems.length);

      updates = elems.map(el => {
        const newX = dir === 'left' ? refX
          : dir === 'right' ? refX - el.width
          : Math.round(refX - el.width / 2);
        return { ...el, x: Math.max(0, newX) };
      });
    }

    this.elements.update(list => list.map(el => {
      const u = updates.find(u => u.id === el.id);
      return u ?? el;
    }));

    await Promise.all(
      updates.map(u => this.svc.updateMockupElement(this.instanceId, u.id, { x: u.x }).catch(e => console.error(e)))
    );
  }

  // ── Grouper ──────────────────────────────────────────────────────────────────

  async groupSelected() {
    const ids = this.multiSelectedIds();
    if (ids.length < 2) return;
    const elems = this.elements().filter(e => ids.includes(e.id));
    const pad = 16;
    const minX = Math.min(...elems.map(e => e.x)) - pad;
    const minY = Math.min(...elems.map(e => e.y)) - pad;
    const maxX = Math.max(...elems.map(e => e.x + e.width)) + pad;
    const maxY = Math.max(...elems.map(e => e.y + e.height)) + pad;

    try {
      const container = await this.svc.createMockupElement(this.instanceId, {
        type: 'container',
        x: minX, y: minY,
        width: maxX - minX,
        height: maxY - minY,
        label: 'Groupe'
      });
      // Insérer le container EN PREMIER (derrière les autres)
      this.elements.update(list => [container, ...list]);
      this.multiSelectedIds.set([]);
      this.selectedElementId.set(container.id);
    } catch (e) { console.error(e); }
  }

  // ── Dégrouper ────────────────────────────────────────────────────────────────

  async ungroupSelected() {
    const id = this.selectedElementId();
    if (!id) return;
    const el = this.elements().find(e => e.id === id);
    if (!el || el.type !== 'container') return;
    // Supprime le conteneur en laissant les enfants intacts
    this.elements.update(list => list.filter(e => e.id !== id));
    this.selectedElementId.set(null);
    await this.svc.deleteMockupElement(this.instanceId, id).catch(e => console.error(e));
  }

  // ── Distribuer ───────────────────────────────────────────────────────────────

  async distributeSelected(dir: 'horizontal' | 'vertical') {
    const ids = this.multiSelectedIds();
    if (ids.length < 3) return;
    const elems = this.elements().filter(e => ids.includes(e.id));

    let updates: MockupElement[];

    if (dir === 'horizontal') {
      const sorted = [...elems].sort((a, b) => a.x - b.x);
      const totalSpan = (sorted[sorted.length - 1].x + sorted[sorted.length - 1].width) - sorted[0].x;
      const totalElemW = sorted.reduce((s, e) => s + e.width, 0);
      const gap = (totalSpan - totalElemW) / (sorted.length - 1);
      let curX = sorted[0].x;
      updates = sorted.map(el => {
        const newEl = { ...el, x: Math.round(curX) };
        curX += el.width + gap;
        return newEl;
      });
    } else {
      const sorted = [...elems].sort((a, b) => a.y - b.y);
      const totalSpan = (sorted[sorted.length - 1].y + sorted[sorted.length - 1].height) - sorted[0].y;
      const totalElemH = sorted.reduce((s, e) => s + e.height, 0);
      const gap = (totalSpan - totalElemH) / (sorted.length - 1);
      let curY = sorted[0].y;
      updates = sorted.map(el => {
        const newEl = { ...el, y: Math.round(curY) };
        curY += el.height + gap;
        return newEl;
      });
    }

    this.elements.update(list => list.map(el => updates.find(u => u.id === el.id) ?? el));
    await Promise.all(
      updates.map(u => this.svc.updateMockupElement(this.instanceId, u.id, { x: u.x, y: u.y }).catch(e => console.error(e)))
    );
  }

  // ── Commentaires ─────────────────────────────────────────────────────────────

  async addComment() {
    const text = this.newCommentText.trim();
    const elementId = this.selectedElementId();
    if (!text || !elementId) return;
    this.savingComment.set(true);
    try {
      const c = await this.svc.createMockupComment(this.instanceId, elementId, text);
      this.comments.update(list => [...list, c]);
      this.newCommentText = '';
    } finally { this.savingComment.set(false); }
  }

  async deleteComment(comment: MockupComment) {
    await this.svc.deleteMockupComment(this.instanceId, comment.id);
    this.comments.update(list => list.filter(c => c.id !== comment.id));
  }
}
