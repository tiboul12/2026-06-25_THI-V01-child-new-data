import {
  Component, Input, OnChanges, SimpleChanges,
  signal, computed, inject
} from '@angular/core';
import { Subscription, Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MegaOutilInstance } from '@worganic/portail-core/data-access';
import {
  TestsOutilService,
  TestSuite, TestCategory, TestCase, TestRun, TestRunResult,
  TestCriticality, TestStatus, TestGenerationSource
} from '@worganic/portail-core/data-access';

type TabId = 'cahier' | 'execution' | 'resultats';

@Component({
  selector: 'app-tests-outil',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' },
  template: `
<div class="flex flex-col h-full bg-light-bg dark:bg-surface text-light-text dark:text-white/80 text-sm overflow-hidden">

  <!-- Onglets -->
  <div class="flex border-b border-light-border dark:border-white/8 shrink-0">
    @for (tab of tabs; track tab.id) {
      <button
        class="px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px"
        [class.border-primary]="activeTab() === tab.id"
        [class.text-primary]="activeTab() === tab.id"
        [class.border-transparent]="activeTab() !== tab.id"
        [class.text-light-text-muted]="activeTab() !== tab.id"
        [class.dark:text-white]="activeTab() === tab.id"
        [class.dark:text-white/40]="activeTab() !== tab.id"
        (click)="activeTab.set(tab.id)">
        <span class="material-symbols-outlined text-[14px] align-middle mr-1">{{ tab.icon }}</span>
        {{ tab.label }}
      </button>
    }
  </div>

  <!-- Contenu -->
  <div class="flex-1 overflow-hidden">

    <!-- ── ONGLET CAHIER ── -->
    @if (activeTab() === 'cahier') {
      <div class="flex flex-col h-full overflow-hidden">

        <!-- Toolbar génération -->
        <div class="px-3 py-2 flex items-center gap-2 border-b border-light-border dark:border-white/8 shrink-0 flex-wrap relative">

          <!-- Depuis Édition + picker sections -->
          <div class="relative">
            <div class="flex items-center gap-1">
              <button class="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                [ngClass]="showSectionPicker() ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-light-surface dark:bg-white/5 hover:bg-light-border dark:hover:bg-white/10'"
                (click)="toggleSectionPicker()">
                <span class="material-symbols-outlined text-xs">edit_note</span>Depuis Édition
                <span class="material-symbols-outlined text-xs opacity-50">{{ showSectionPicker() ? 'expand_less' : 'expand_more' }}</span>
              </button>
              @if (selectedSection()) {
                <span class="text-[10px] text-primary font-medium max-w-[120px] truncate" [title]="selectedSection()!.name">
                  {{ selectedSection()!.name }}
                </span>
                <button class="text-[9px] opacity-40 hover:opacity-80 leading-none"
                  (click)="selectedSection.set(null); iaProposals.set([])">✕</button>
              }
            </div>
            <!-- Dropdown sections -->
            @if (showSectionPicker()) {
              <div class="absolute top-full left-0 z-50 mt-1 min-w-[220px] max-h-64 overflow-y-auto rounded-lg border border-light-border dark:border-white/15 bg-light-bg dark:bg-neutral-900 shadow-xl">
                @if (!editionSections().length) {
                  <div class="px-3 py-3 text-xs opacity-40 text-center">Aucune section trouvée</div>
                }
                @for (sec of editionSections(); track sec.id) {
                  <button class="w-full text-left px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1"
                    [style.padding-left.px]="12 + sec.depth * 12"
                    [class.text-primary]="selectedSection()?.id === sec.id"
                    [class.font-medium]="selectedSection()?.id === sec.id"
                    (click)="selectSection(sec)">
                    <span class="material-symbols-outlined text-xs opacity-40">folder</span>
                    {{ sec.name }}
                  </button>
                }
              </div>
            }
          </div>

          <!-- Depuis Mockup -->
          <button class="flex items-center gap-1 px-2 py-1 text-xs rounded bg-light-surface dark:bg-white/5 hover:bg-light-border dark:hover:bg-white/10 transition-colors"
            [class.opacity-40]="!mockupInstances().length"
            (click)="generateFrom('mockup')" [disabled]="generating() || !mockupInstances().length"
            [title]="!mockupInstances().length ? 'Aucun mockup disponible' : ''">
            <span class="material-symbols-outlined text-xs">preview</span>Depuis Mockup
          </button>

          <!-- IA — actif si section sélectionnée -->
          <button class="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors"
            [ngClass]="selectedSection()
              ? 'bg-primary text-white dark:text-btn-text hover:opacity-90'
              : 'bg-light-surface dark:bg-white/5 opacity-40 cursor-not-allowed'"
            [disabled]="!selectedSection() || generatingIA()"
            (click)="generateFromIA()">
            @if (generatingIA()) {
              <span class="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
            } @else {
              <span class="material-symbols-outlined text-xs">smart_toy</span>
            }
            IA
            @if (!selectedSection()) { <span class="text-[9px] opacity-60">→ choisir section</span> }
          </button>

          <div class="flex-1"></div>
          <button class="flex items-center gap-1 px-2 py-1 text-xs rounded border border-light-border dark:border-white/10 hover:bg-light-surface dark:hover:bg-white/5 transition-colors"
            (click)="startAddCategory()">
            <span class="material-symbols-outlined text-xs">create_new_folder</span>Catégorie
          </button>
        </div>

        <!-- Bannière chargement IA -->
        @if (generatingIA()) {
          <div class="mx-3 mt-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 flex items-center gap-3 shrink-0">
            <div class="relative shrink-0">
              <div class="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin"></div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium">L'IA analyse "{{ selectedSection()?.name }}"...</div>
              <div class="text-[10px] opacity-40 mt-0.5">Génération des tests en cours, cela peut prendre quelques secondes.</div>
            </div>
            <button class="flex items-center gap-1 px-3 py-1.5 text-[10px] rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              (click)="cancelAIGeneration()">
              <span class="material-symbols-outlined text-xs">stop</span>Annuler
            </button>
          </div>
        }

        <!-- Panel propositions IA -->
        @if (iaProposals().length) {
          <div class="mx-3 mt-2 rounded-lg border border-primary/30 bg-primary/3 shrink-0 overflow-hidden">
            <div class="flex items-center justify-between px-3 py-2 border-b border-primary/15">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-sm text-primary">smart_toy</span>
                <span class="text-xs font-medium">{{ iaProposals().length }} tests proposés pour "{{ selectedSection()!.name }}"</span>
              </div>
              <div class="flex items-center gap-2">
                <button class="text-[9px] text-primary hover:underline" (click)="toggleAllProposals()">
                  {{ selectedProposalIds().size === iaProposals().length ? 'Tout désélectionner' : 'Tout sélectionner' }}
                </button>
                <button class="px-3 py-1 text-[10px] rounded bg-primary text-white dark:text-btn-text hover:opacity-90 disabled:opacity-40 transition-opacity"
                  [disabled]="!selectedProposalIds().size"
                  (click)="addSelectedProposals()">
                  Ajouter ({{ selectedProposalIds().size }})
                </button>
                <button class="text-[9px] opacity-40 hover:opacity-70" (click)="iaProposals.set([])">✕</button>
              </div>
            </div>
            <div class="max-h-72 overflow-y-auto divide-y divide-light-border dark:divide-white/5">
              @for (p of iaProposals(); track p.id) {
                <label class="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-black/3 dark:hover:bg-white/3 transition-colors">
                  <input type="checkbox" class="mt-0.5 shrink-0 accent-primary"
                    [checked]="selectedProposalIds().has(p.id)"
                    (change)="toggleProposal(p.id)">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <span class="text-xs font-medium">{{ p.title }}</span>
                      <span class="text-[9px] px-1.5 py-px rounded border shrink-0"
                        [class.border-red-500/50]="p.criticality === 'bloquant'"
                        [class.text-red-400]="p.criticality === 'bloquant'"
                        [class.border-orange-400/50]="p.criticality === 'majeur'"
                        [class.text-orange-400]="p.criticality === 'majeur'"
                        [class.border-yellow-400/40]="p.criticality === 'mineur'"
                        [class.text-yellow-400]="p.criticality === 'mineur'">{{ p.criticality }}</span>
                    </div>
                    @if (p.description) {
                      <div class="text-[10px] opacity-50 leading-relaxed">{{ p.description }}</div>
                    }
                    @if (p.steps.length) {
                      <div class="text-[9px] opacity-30 mt-0.5">{{ p.steps.length }} étape{{ p.steps.length > 1 ? 's' : '' }}</div>
                    }
                  </div>
                </label>
              }
            </div>
          </div>
        }

        <!-- Filtre criticité -->
        <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-light-border dark:border-white/8 shrink-0">
          <span class="text-[10px] opacity-40 mr-1">Criticité :</span>
          @for (f of criticityFilters; track f.value) {
            <button class="text-[9px] px-2 py-0.5 rounded-full border transition-colors"
              [ngClass]="filterCriticality() === f.value
                ? 'border-primary text-primary font-medium'
                : 'border-light-border dark:border-white/10 opacity-50 hover:opacity-80'"
              (click)="filterCriticality.set(f.value)">
              {{ f.label }}
            </button>
          }
          @if (filterCriticality() !== 'all') {
            <span class="text-[9px] opacity-30 ml-1">
              {{ totalFilteredCount() }} résultat{{ totalFilteredCount() !== 1 ? 's' : '' }}
            </span>
          }
        </div>

        @if (generateMsg()) {
          <div class="mx-3 mt-2 px-3 py-1.5 text-xs rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
            {{ generateMsg() }}
          </div>
        }

        <!-- Liste catégories avec tableau de tests -->
        <div class="flex-1 overflow-y-auto p-3 space-y-2"
          (dragover)="$event.preventDefault()" (drop)="onDropOnZone($event)">

          <!-- Tests sans catégorie EN PREMIER -->
          @if (uncategorizedCases().length || (editingCase()?.id === '__new__' && editingCase()?.categoryId === '')) {
            <div class="rounded-lg border border-dashed border-light-border dark:border-white/8 overflow-hidden bg-light-bg dark:bg-surface">
              <div class="flex items-center gap-2 px-2.5 py-1.5 bg-black/5 dark:bg-white/4">
                <span class="material-symbols-outlined text-xs opacity-20">folder_off</span>
                <span class="text-[10px] opacity-40 flex-1">Sans catégorie</span>
                <button class="opacity-40 hover:opacity-70 flex items-center gap-0.5 text-[10px] transition-opacity"
                  (click)="startAddTestInCat('')">
                  <span class="material-symbols-outlined text-xs">add</span>
                </button>
              </div>
              @if (uncategorizedCases().length) {
                <table class="w-full text-xs border-collapse">
                  <tbody>
                    @for (tc of uncategorizedCases(); track tc.id; let i = $index) {
                      @if (editingCase()?.id === tc.id) {
                        <tr>
                          <td colspan="6" class="p-0 border-t border-light-border dark:border-white/8">
                            <div class="p-3 bg-light-bg dark:bg-surface border-l-2 border-primary">
                              <ng-container *ngTemplateOutlet="caseForm; context: { $implicit: editingCase() }"></ng-container>
                            </div>
                          </td>
                        </tr>
                      } @else {
                        <tr class="group border-t border-light-border/50 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          [class.opacity-40]="draggedTestId() === tc.id"
                          draggable="true"
                          (dragstart)="onTestDragStart($event, tc.id)"
                          (dragover)="onTestDragOver($event, tc.id)"
                          (drop)="onTestDrop($event, tc.id)"
                          (dragend)="onDragEnd()">
                          <td class="px-2.5 py-1.5 text-center w-8 opacity-30">{{ i + 1 }}</td>
                          <td class="px-2.5 py-1.5">
                            <div class="font-medium">{{ tc.title }}</div>
                            @if (tc.description) { <div class="text-[10px] opacity-40 mt-0.5">{{ tc.description }}</div> }
                          </td>
                          <td class="px-2.5 py-1.5 w-32">
                            @if (tc.url) {
                              <span class="text-[10px] opacity-40 truncate block max-w-[110px]">{{ tc.url }}</span>
                            } @else { <span class="opacity-20">—</span> }
                          </td>
                          <td class="px-2.5 py-1.5 w-20">
                            <span class="text-[9px] px-1.5 py-0.5 rounded-full border whitespace-nowrap"
                              [class.border-red-500/40]="tc.criticality === 'bloquant'"
                              [class.text-red-400]="tc.criticality === 'bloquant'"
                              [class.border-orange-400/40]="tc.criticality === 'majeur'"
                              [class.text-orange-400]="tc.criticality === 'majeur'"
                              [class.border-yellow-400/40]="tc.criticality === 'mineur'"
                              [class.text-yellow-400]="tc.criticality === 'mineur'">{{ tc.criticality }}</span>
                          </td>
                          <td class="px-2.5 py-1.5 text-center w-14 opacity-40">{{ tc.steps.length || '—' }}</td>
                          <td class="px-2.5 py-1.5 w-14">
                            <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                              <button class="p-0.5 hover:text-primary rounded" (click)="startEditCase(tc)">
                                <span class="material-symbols-outlined text-xs">edit</span>
                              </button>
                              <button class="p-0.5 hover:text-red-400 rounded" (click)="removeCase(tc.id)">
                                <span class="material-symbols-outlined text-xs">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              }
              @if (editingCase()?.id === '__new__' && editingCase()?.categoryId === '') {
                <div class="p-3 border-t border-light-border dark:border-white/8 bg-light-bg dark:bg-surface border-l-2 border-primary">
                  <ng-container *ngTemplateOutlet="caseForm; context: { $implicit: editingCase() }"></ng-container>
                </div>
              }
            </div>
          }

          @for (cat of categoriesWithTests(); track cat.id) {

            @if (dragOverId() === cat.id && dragPos() === 'before' && draggedCatId()) {
              <div class="h-0.5 rounded-full bg-primary mx-1"></div>
            }

            <div class="rounded-lg border transition-colors overflow-hidden"
              [ngClass]="dragOverId() === cat.id && draggedTestId()
                ? 'border-primary/40 bg-primary/3'
                : 'border-light-border dark:border-white/8'">

              <!-- Header catégorie -->
              <div class="flex items-center gap-1.5 px-2.5 py-1.5 group cursor-default bg-black/5 dark:bg-white/5"
                draggable="true"
                (dragstart)="onCatDragStart($event, cat.id)"
                (dragover)="onCatDragOver($event, cat.id)"
                (drop)="onCatDrop($event, cat.id)"
                (dragend)="onDragEnd()">
                <span class="material-symbols-outlined text-xs opacity-20 group-hover:opacity-60 cursor-grab active:cursor-grabbing shrink-0 transition-opacity">
                  drag_indicator
                </span>
                @if (editingCategoryId() === cat.id) {
                  <input class="flex-1 min-w-0 text-xs font-semibold bg-transparent border-b border-primary outline-none py-0.5"
                    [(ngModel)]="editingCategoryName"
                    (keydown.enter)="saveCategoryName(cat.id)"
                    (keydown.escape)="editingCategoryId.set(null)"
                    (blur)="saveCategoryName(cat.id)" autofocus />
                } @else {
                  <span class="flex-1 min-w-0 text-xs font-semibold truncate select-none">{{ cat.name }}</span>
                }
                <span class="text-[10px] opacity-30 shrink-0">({{ cat.cases.length }})</span>
                <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button class="p-0.5 hover:text-primary rounded transition-colors" title="Ajouter un test"
                    (click)="startAddTestInCat(cat.id); $event.stopPropagation()">
                    <span class="material-symbols-outlined text-xs">add</span>
                  </button>
                  <button class="p-0.5 hover:text-primary rounded transition-colors" title="Renommer"
                    (click)="startEditCategory(cat.id, cat.name); $event.stopPropagation()">
                    <span class="material-symbols-outlined text-xs">edit</span>
                  </button>
                  <button class="p-0.5 hover:text-red-400 rounded transition-colors" title="Supprimer"
                    (click)="removeCategory(cat.id); $event.stopPropagation()">
                    <span class="material-symbols-outlined text-xs">delete</span>
                  </button>
                </div>
              </div>

              <!-- Tableau des tests -->
              @if (cat.cases.length || (editingCase()?.id === '__new__' && editingCase()?.categoryId === cat.id)) {
                <table class="w-full text-xs border-collapse">
                  <thead>
                    <tr class="border-y border-light-border dark:border-white/8">
                      <th class="px-2.5 py-1 text-left text-[10px] uppercase tracking-wider font-semibold opacity-40 w-8">#</th>
                      <th class="px-2.5 py-1 text-left text-[10px] uppercase tracking-wider font-semibold opacity-40">Action / Titre</th>
                      <th class="px-2.5 py-1 text-left text-[10px] uppercase tracking-wider font-semibold opacity-40 w-32">URL</th>
                      <th class="px-2.5 py-1 text-left text-[10px] uppercase tracking-wider font-semibold opacity-40 w-20">Criticité</th>
                      <th class="px-2.5 py-1 text-center text-[10px] uppercase tracking-wider font-semibold opacity-40 w-14">Étapes</th>
                      <th class="w-14"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (tc of cat.cases; track tc.id; let i = $index) {
                      @if (editingCase()?.id === tc.id) {
                        <tr>
                          <td colspan="6" class="p-0 border-t border-light-border dark:border-white/8">
                            <div class="p-3 bg-light-bg dark:bg-surface border-l-2 border-primary">
                              <ng-container *ngTemplateOutlet="caseForm; context: { $implicit: editingCase() }"></ng-container>
                            </div>
                          </td>
                        </tr>
                      } @else {
                        <tr class="group border-t border-light-border/50 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          [class.opacity-40]="draggedTestId() === tc.id"
                          [style.boxShadow]="dragOverId() === tc.id
                            ? (dragPos() === 'before'
                                ? 'inset 0 2px 0 var(--color-primary, #EFBE00)'
                                : 'inset 0 -2px 0 var(--color-primary, #EFBE00)')
                            : null"
                          draggable="true"
                          (dragstart)="onTestDragStart($event, tc.id)"
                          (dragover)="onTestDragOver($event, tc.id)"
                          (drop)="onTestDrop($event, tc.id)"
                          (dragend)="onDragEnd()">
                          <td class="px-2.5 py-1.5 text-center w-8">
                            <span class="opacity-30 group-hover:hidden">{{ i + 1 }}</span>
                            <span class="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-40 cursor-grab hidden group-hover:inline transition-opacity">drag_indicator</span>
                          </td>
                          <td class="px-2.5 py-1.5">
                            <div class="font-medium leading-snug">{{ tc.title }}</div>
                            @if (tc.description) {
                              <div class="text-[10px] opacity-40 mt-0.5 leading-snug">{{ tc.description }}</div>
                            }
                          </td>
                          <td class="px-2.5 py-1.5 w-32">
                            @if (tc.url) {
                              <a [href]="tc.url" target="_blank"
                                class="text-[10px] text-primary hover:underline block truncate max-w-[110px]"
                                [title]="tc.url" (click)="$event.stopPropagation()">
                                {{ tc.url.length > 28 ? (tc.url | slice:0:28) + '…' : tc.url }}
                              </a>
                            } @else {
                              <span class="opacity-20">—</span>
                            }
                          </td>
                          <td class="px-2.5 py-1.5 w-20">
                            <span class="text-[9px] px-1.5 py-0.5 rounded-full border whitespace-nowrap"
                              [class.border-red-500/40]="tc.criticality === 'bloquant'"
                              [class.text-red-400]="tc.criticality === 'bloquant'"
                              [class.border-orange-400/40]="tc.criticality === 'majeur'"
                              [class.text-orange-400]="tc.criticality === 'majeur'"
                              [class.border-yellow-400/40]="tc.criticality === 'mineur'"
                              [class.text-yellow-400]="tc.criticality === 'mineur'">
                              {{ tc.criticality }}
                            </span>
                          </td>
                          <td class="px-2.5 py-1.5 text-center w-14 opacity-40">
                            {{ tc.steps.length || '—' }}
                          </td>
                          <td class="px-2.5 py-1.5 w-14">
                            <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                              <button class="p-0.5 hover:text-primary rounded" (click)="startEditCase(tc)">
                                <span class="material-symbols-outlined text-xs">edit</span>
                              </button>
                              <button class="p-0.5 hover:text-red-400 rounded" (click)="removeCase(tc.id)">
                                <span class="material-symbols-outlined text-xs">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      }
                    }
                    @if (editingCase()?.id === '__new__' && editingCase()?.categoryId === cat.id) {
                      <tr>
                        <td colspan="6" class="p-0 border-t border-light-border dark:border-white/8">
                          <div class="p-3 bg-primary/5 border-l-2 border-primary">
                            <ng-container *ngTemplateOutlet="caseForm; context: { $implicit: editingCase() }"></ng-container>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <button class="w-full text-left px-4 py-2 text-[10px] opacity-30 hover:opacity-60 transition-opacity"
                  (click)="startAddTestInCat(cat.id)">
                  + Ajouter un premier test
                </button>
              }
            </div>

            @if (dragOverId() === cat.id && dragPos() === 'after' && draggedCatId()) {
              <div class="h-0.5 rounded-full bg-primary mx-1"></div>
            }
          }

          <!-- Ajout catégorie inline -->
          @if (addingCategory()) {
            <div class="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 flex items-center gap-2">
              <span class="material-symbols-outlined text-xs text-primary opacity-60">create_new_folder</span>
              <input class="flex-1 text-xs bg-transparent outline-none border-b border-primary py-0.5"
                placeholder="Nom de la catégorie"
                [(ngModel)]="newCategoryName"
                (keydown.enter)="confirmAddCategory()"
                (keydown.escape)="addingCategory.set(false)"
                autofocus />
              <button class="text-[10px] text-primary hover:opacity-80" (click)="confirmAddCategory()">OK</button>
              <button class="text-[10px] opacity-40 hover:opacity-70" (click)="addingCategory.set(false)">✕</button>
            </div>
          }

          @if (!categoriesWithTests().length && !uncategorizedCases().length && !addingCategory() && !editingCase()) {
            <div class="text-center py-10 opacity-30 text-xs">
              <span class="material-symbols-outlined text-4xl block mb-2 opacity-50">checklist</span>
              Créez une catégorie ou générez depuis vos outils.
            </div>
          }
        </div>
      </div>
    }

    <!-- ── ONGLET EXÉCUTION ── -->
    @if (activeTab() === 'execution') {
      <div class="flex flex-col h-full overflow-y-auto p-4 gap-4">
        <div class="flex gap-1 p-0.5 rounded-lg bg-light-surface dark:bg-white/5 self-start">
          <button class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors"
            [ngClass]="runMode() === 'auto' ? 'bg-primary text-white dark:text-btn-text shadow-sm' : 'text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white/70'"
            (click)="runMode.set('auto')">
            <span class="material-symbols-outlined text-sm">smart_toy</span>Automatique (IA)
          </button>
          <button class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors"
            [ngClass]="runMode() === 'manual' ? 'bg-primary text-white dark:text-btn-text shadow-sm' : 'text-light-text-muted dark:text-white/40 hover:text-light-text dark:hover:text-white/70'"
            (click)="runMode.set('manual')">
            <span class="material-symbols-outlined text-sm">person</span>Manuel (testeur)
          </button>
        </div>

        <!-- Sélection catégories + commentaire (communs aux deux modes, avant le lancement) -->
        @if (!currentRun() && !isRunning()) {
          @if (suite()?.categories?.length) {
            <div>
              <label class="block text-[10px] uppercase tracking-wider opacity-40 mb-2">Catégories à tester</label>
              <div class="flex flex-wrap gap-1.5">
                <!-- Chip "Toutes" -->
                <button class="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-full border transition-colors"
                  [ngClass]="!selectedRunCategories().size
                    ? 'bg-primary border-primary text-white dark:text-btn-text font-medium'
                    : 'border-light-border dark:border-white/15 opacity-60 hover:opacity-90'"
                  (click)="clearRunCategories()">
                  Toutes
                  <span class="opacity-60 ml-0.5">({{ totalActiveCasesCount() }})</span>
                </button>
                @for (cat of suite()!.categories; track cat.id) {
                  @if (catActiveCount(cat.id) > 0) {
                    <button class="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-full border transition-colors"
                      [ngClass]="selectedRunCategories().has(cat.id)
                        ? 'bg-primary border-primary text-white dark:text-btn-text font-medium'
                        : 'border-light-border dark:border-white/15 opacity-60 hover:opacity-90'"
                      (click)="toggleRunCategory(cat.id)">
                      {{ cat.name }}
                      <span class="opacity-60 ml-0.5">({{ catActiveCount(cat.id) }})</span>
                    </button>
                  }
                }
              </div>
              @if (selectedRunCategories().size && activeCasesCount() < totalActiveCasesCount()) {
                <div class="mt-1.5 text-[10px] opacity-50">
                  {{ activeCasesCount() }} test{{ activeCasesCount() > 1 ? 's' : '' }} sélectionné{{ activeCasesCount() > 1 ? 's' : '' }}
                </div>
              }
            </div>
          }
          <div>
            <label class="block text-[10px] uppercase tracking-wider opacity-40 mb-1">Commentaire (optionnel)</label>
            <input type="text" placeholder="Objectif de cette campagne de tests..."
              class="w-full px-3 py-2 text-xs rounded border border-light-border dark:border-white/10 bg-transparent focus:outline-none focus:border-primary"
              [(ngModel)]="runComment">
          </div>
        }

        @if (runMode() === 'auto') {
          <div class="flex flex-col gap-3">
            <div>
              <label class="block text-[10px] uppercase tracking-wider opacity-40 mb-1">URL de preview (optionnel)</label>
              <input type="url" placeholder="https://preview.monprojet.com"
                class="w-full px-3 py-2 text-xs rounded border border-light-border dark:border-white/10 bg-transparent focus:outline-none focus:border-primary"
                [(ngModel)]="targetUrlValue">
            </div>
            @if (!isRunning()) {
              <button class="self-start flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-primary text-white dark:text-btn-text hover:opacity-90 transition-opacity disabled:opacity-40"
                (click)="launchAutoRun()" [disabled]="!activeCasesCount()">
                <span class="material-symbols-outlined text-sm">play_arrow</span>
                Lancer l'analyse IA
                @if (activeCasesCount()) { <span class="opacity-70">({{ activeCasesCount() }} tests)</span> }
              </button>
            }
            @if (isRunning()) {
              <div class="rounded border border-light-border dark:border-white/10 p-3">
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-3 h-3 rounded-full bg-primary animate-pulse shrink-0"></div>
                  <span class="text-xs flex-1">Analyse en cours...</span>
                  <button
                    class="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                    (click)="stopAutoRun()">
                    <span class="material-symbols-outlined text-xs">stop</span>Arrêter
                  </button>
                </div>
                <div class="w-full bg-light-border dark:bg-white/10 rounded-full h-1.5 mb-2">
                  <div class="bg-primary h-1.5 rounded-full transition-all" [style.width.%]="runProgressPct()"></div>
                </div>
                <div class="text-[10px] opacity-50">{{ runProgress().current }} / {{ runProgress().total }}</div>
              </div>
            }
            @for (r of liveResults(); track r.caseId) {
              <div class="flex items-start gap-2 text-xs rounded px-2 py-1.5"
                [class.bg-emerald-500/10]="r.status === 'pass'"
                [class.bg-red-500/10]="r.status === 'fail'"
                [class.bg-light-surface]="r.status === 'pending'">
                <span class="material-symbols-outlined text-sm shrink-0"
                  [class.text-emerald-400]="r.status === 'pass'"
                  [class.text-red-400]="r.status === 'fail'"
                  [class.opacity-30]="r.status === 'pending'">
                  {{ r.status === 'pass' ? 'check_circle' : r.status === 'fail' ? 'cancel' : 'radio_button_unchecked' }}
                </span>
                <div>
                  <div class="font-medium">{{ getCaseTitle(r.caseId) }}</div>
                  @if (r.aiComment) { <div class="opacity-50 mt-0.5">{{ r.aiComment }}</div> }
                </div>
              </div>
            }
          </div>
        }

        @if (runMode() === 'manual') {
          <div class="flex flex-col gap-3">
            <div>
              <label class="block text-[10px] uppercase tracking-wider opacity-40 mb-1">Nom du testeur</label>
              <input type="text" placeholder="Votre nom"
                class="w-full px-3 py-2 text-xs rounded border border-light-border dark:border-white/10 bg-transparent focus:outline-none focus:border-primary"
                [(ngModel)]="testerNameValue">
            </div>
            @if (!currentRun()) {
              <button class="self-start flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-primary text-white dark:text-btn-text hover:opacity-90 transition-opacity disabled:opacity-40"
                (click)="launchManualRun()" [disabled]="!testerNameValue || !activeCasesCount()">
                <span class="material-symbols-outlined text-sm">play_arrow</span>
                Démarrer la campagne manuelle
                @if (activeCasesCount()) { <span class="opacity-70">({{ activeCasesCount() }} tests)</span> }
              </button>
            }

            @if (currentRun()) {
              <div class="flex flex-col gap-1.5">

                <!-- Barre de stats -->
                <div class="rounded border border-light-border dark:border-white/10 px-3 py-2 flex items-center gap-3">
                  <!-- Barre de progression -->
                  <div class="flex-1 h-1.5 bg-light-border dark:bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-primary rounded-full transition-all"
                      [style.width.%]="currentRun()!.caseIds.length ? (completedCaseIds().length / currentRun()!.caseIds.length) * 100 : 0">
                    </div>
                  </div>
                  <span class="text-[9px] opacity-40 shrink-0">
                    {{ completedCaseIds().length }} / {{ currentRun()!.caseIds.length }}
                  </span>
                  <!-- Stats -->
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="flex items-center gap-1 text-[9px] text-emerald-400">
                      <span class="material-symbols-outlined text-xs">check_circle</span>
                      {{ manualPassCount() }}
                    </span>
                    <span class="flex items-center gap-1 text-[9px] text-red-400">
                      <span class="material-symbols-outlined text-xs">cancel</span>
                      {{ manualFailCount() }}
                    </span>
                  </div>
                </div>

                <!-- Tests complétés (au-dessus, grisés avec boutons résultat) -->
                @for (caseId of completedCaseIds(); track caseId; let i = $index) {
                  @if (getManualCase(caseId); as tc) {
                    <div class="rounded border px-3 py-2 flex items-center gap-2 transition-colors"
                      [ngClass]="getManualResult(caseId)?.status === 'fail' && (tc.criticality === 'majeur' || tc.criticality === 'bloquant')
                        ? 'border-red-500/40 bg-red-500/10'
                        : 'border-light-border dark:border-white/8'">
                      <span class="text-[9px] opacity-30 shrink-0 uppercase tracking-wider">Test {{ i + 1 }}</span>
                      <span class="text-xs font-medium opacity-40 flex-1 truncate">{{ tc.title }}</span>
                      <!-- Badge criticité -->
                      <span class="text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 opacity-30"
                        [class.border-red-500/50]="tc.criticality === 'bloquant'"
                        [class.text-red-400]="tc.criticality === 'bloquant'"
                        [class.border-orange-400/50]="tc.criticality === 'majeur'"
                        [class.text-orange-400]="tc.criticality === 'majeur'"
                        [class.border-yellow-400/40]="tc.criticality === 'mineur'"
                        [class.text-yellow-500]="tc.criticality === 'mineur'">{{ tc.criticality }}</span>
                      <!-- 3 boutons résultat (sélectionné visible, autres grisés) -->
                      @if (getManualResult(caseId); as r) {
                        <div class="flex gap-1 shrink-0">
                          <span class="px-2.5 py-0.5 text-[9px] rounded font-medium transition-opacity"
                            [class.bg-emerald-500]="r.status === 'pass'"
                            [class.text-white]="r.status === 'pass'"
                            [class.opacity-100]="r.status === 'pass'"
                            [class.opacity-15]="r.status !== 'pass'"
                            [class.bg-black/10]="r.status !== 'pass'"
                            [class.dark:bg-white/8]="r.status !== 'pass'">✓ Passé</span>
                          <span class="px-2.5 py-0.5 text-[9px] rounded font-medium transition-opacity"
                            [class.bg-red-500]="r.status === 'fail'"
                            [class.text-white]="r.status === 'fail'"
                            [class.opacity-100]="r.status === 'fail'"
                            [class.opacity-15]="r.status !== 'fail'"
                            [class.bg-black/10]="r.status !== 'fail'"
                            [class.dark:bg-white/8]="r.status !== 'fail'">✗ Échoué</span>
                          <span class="px-2.5 py-0.5 text-[9px] rounded font-medium transition-opacity"
                            [class.bg-black/20]="r.status === 'skip'"
                            [class.dark:bg-white/15]="r.status === 'skip'"
                            [class.opacity-100]="r.status === 'skip'"
                            [class.opacity-15]="r.status !== 'skip'"
                            [class.bg-black/10]="r.status !== 'skip'"
                            [class.dark:bg-white/8]="r.status !== 'skip'">— Passer</span>
                        </div>
                      }
                    </div>
                  }
                }

                <!-- Test courant (actif) -->
                @if (manualCurrentCase()) {
                  <div class="rounded border border-primary/40 bg-primary/3 p-4">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-[10px] uppercase tracking-wider opacity-40">
                        Test {{ manualCaseIndex() + 1 }} / {{ currentRun()!.caseIds.length }}
                      </span>
                      <!-- Criticité avec couleurs vives -->
                      <span class="text-[9px] px-2 py-0.5 rounded-full border font-semibold"
                        [class.bg-red-500/25]="manualCurrentCase()!.criticality === 'bloquant'"
                        [class.border-red-500]="manualCurrentCase()!.criticality === 'bloquant'"
                        [class.text-red-400]="manualCurrentCase()!.criticality === 'bloquant'"
                        [class.bg-orange-500/20]="manualCurrentCase()!.criticality === 'majeur'"
                        [class.border-orange-400]="manualCurrentCase()!.criticality === 'majeur'"
                        [class.text-orange-400]="manualCurrentCase()!.criticality === 'majeur'"
                        [class.bg-yellow-400/10]="manualCurrentCase()!.criticality === 'mineur'"
                        [class.border-yellow-400/60]="manualCurrentCase()!.criticality === 'mineur'"
                        [class.text-yellow-400]="manualCurrentCase()!.criticality === 'mineur'">
                        {{ manualCurrentCase()!.criticality }}
                      </span>
                    </div>
                    <div class="font-semibold text-sm mb-1">{{ manualCurrentCase()!.title }}</div>
                    @if (manualCurrentCase()!.url) {
                      <a [href]="manualCurrentCase()!.url!" target="_blank"
                        class="text-[10px] text-primary hover:underline block mb-2">
                        {{ manualCurrentCase()!.url }}
                      </a>
                    }
                    @if (manualCurrentCase()!.description) {
                      <p class="text-xs opacity-50 mb-3">{{ manualCurrentCase()!.description }}</p>
                    }
                    @if (manualCurrentCase()!.steps.length) {
                      <ol class="space-y-1 mb-3">
                        @for (step of manualCurrentCase()!.steps; track step.order) {
                          <li class="text-xs">
                            <span class="font-medium">{{ step.order }}.</span> {{ step.action }}
                            <span class="block ml-4 opacity-50">→ {{ step.expected }}</span>
                          </li>
                        }
                      </ol>
                    }
                    <textarea placeholder="Notes (optionnel)" rows="2"
                      class="w-full px-3 py-2 text-xs rounded border border-light-border dark:border-white/10 bg-transparent focus:outline-none focus:border-primary mb-3 resize-none"
                      [(ngModel)]="manualNotes"></textarea>
                    <!-- Boutons à droite -->
                    <div class="flex gap-2 justify-end">
                      <button class="px-5 py-2 text-xs rounded bg-emerald-500 text-white hover:opacity-90 transition-opacity"
                        (click)="submitManualResult('pass')">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">check</span>Passé
                      </button>
                      <button class="px-5 py-2 text-xs rounded bg-red-500 text-white hover:opacity-90 transition-opacity"
                        (click)="submitManualResult('fail')">
                        <span class="material-symbols-outlined text-sm align-middle mr-1">close</span>Échoué
                      </button>
                      <button class="px-5 py-2 text-xs rounded bg-black/20 dark:bg-white/10 hover:opacity-80 transition-opacity"
                        (click)="submitManualResult('skip')">Passer</button>
                    </div>
                  </div>
                }

                <!-- Tests à venir (grisés) -->
                @for (caseId of upcomingCaseIds(); track caseId; let i = $index) {
                  @if (getManualCase(caseId); as tc) {
                    <div class="rounded border border-light-border dark:border-white/5 px-3 py-2 opacity-30 flex items-center gap-2">
                      <span class="text-[9px] opacity-50 shrink-0 uppercase tracking-wider">
                        Test {{ manualCaseIndex() + 2 + i }}
                      </span>
                      <span class="text-xs flex-1 truncate">{{ tc.title }}</span>
                      <span class="text-[9px] px-1.5 py-0.5 rounded-full border shrink-0"
                        [class.border-red-500/40]="tc.criticality === 'bloquant'"
                        [class.border-orange-400/40]="tc.criticality === 'majeur'"
                        [class.border-yellow-400/30]="tc.criticality === 'mineur'">
                        {{ tc.criticality }}
                      </span>
                    </div>
                  }
                }

                <!-- Fin de campagne -->
                @if (!manualCurrentCase()) {
                  <div class="text-center py-6 text-xs">
                    <span class="material-symbols-outlined text-4xl opacity-30 block mb-2">task_alt</span>
                    Campagne terminée ! Voir les résultats dans l'onglet "Résultats".
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- ── ONGLET RÉSULTATS ── -->
    @if (activeTab() === 'resultats') {
      <div class="flex flex-col h-full overflow-hidden">
        @if (!selectedRun()) {
          <div class="flex-1 overflow-y-auto p-3">
            @if (!runs().length) {
              <div class="text-center py-12 opacity-30 text-xs">Aucune campagne exécutée.</div>
            }
            @for (run of runs(); track run.id) {
              <div class="group flex items-center gap-3 px-3 py-2.5 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors mb-1"
                (click)="loadRunDetail(run.id)">
                <span class="material-symbols-outlined text-sm opacity-50">{{ run.mode === 'auto' ? 'smart_toy' : 'person' }}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">{{ run.date | date:'dd/MM/yyyy HH:mm' }}</div>
                  <div class="text-[10px] opacity-40">{{ run.mode === 'auto' ? 'Auto IA' : 'Manuel' }}@if (run.testerName) { — {{ run.testerName }} }</div>
                  @if (run.comment) {
                    <div class="text-[10px] opacity-30 italic truncate">{{ run.comment }}</div>
                  }
                </div>
                <div class="text-sm font-bold"
                  [class.text-emerald-400]="run.summary?.goNoGo === 'GO'"
                  [class.text-red-400]="run.summary?.goNoGo === 'NO-GO'">
                  {{ run.summary?.score ?? 0 }}%
                </div>
                <span class="text-[9px] px-2 py-0.5 rounded-full font-bold"
                  [class.bg-emerald-500/20]="run.summary?.goNoGo === 'GO'"
                  [class.text-emerald-400]="run.summary?.goNoGo === 'GO'"
                  [class.bg-red-500/20]="run.summary?.goNoGo === 'NO-GO'"
                  [class.text-red-400]="run.summary?.goNoGo === 'NO-GO'"
                  [class.bg-light-surface]="!run.summary?.goNoGo"
                  [class.opacity-40]="!run.summary?.goNoGo">
                  {{ run.summary?.goNoGo ?? '–' }}
                </span>
                <button class="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-opacity shrink-0"
                  (click)="$event.stopPropagation(); deleteRun(run.id)"
                  title="Supprimer ce run">
                  <span class="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="flex items-center gap-2 px-3 py-2 border-b border-light-border dark:border-white/8 shrink-0">
            <button class="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
              (click)="selectedRun.set(null)">
              <span class="material-symbols-outlined text-sm">arrow_back</span>Retour
            </button>
            <div class="flex-1 min-w-0">
              <div class="text-xs opacity-40">{{ selectedRun()!.date | date:'dd/MM/yyyy HH:mm' }} — {{ selectedRun()!.mode === 'auto' ? 'Auto IA' : 'Manuel' }}@if (selectedRun()!.testerName) { — {{ selectedRun()!.testerName }} }</div>
              @if (selectedRun()!.comment) {
                <div class="text-[10px] opacity-30 italic truncate">{{ selectedRun()!.comment }}</div>
              }
            </div>
            <span class="text-xs px-3 py-1 rounded-full font-bold"
              [class.bg-emerald-500/20]="selectedRun()!.summary?.goNoGo === 'GO'"
              [class.text-emerald-400]="selectedRun()!.summary?.goNoGo === 'GO'"
              [class.bg-red-500/20]="selectedRun()!.summary?.goNoGo === 'NO-GO'"
              [class.text-red-400]="selectedRun()!.summary?.goNoGo === 'NO-GO'">
              {{ selectedRun()!.summary?.goNoGo }}
            </span>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <div class="grid grid-cols-4 gap-2 mb-4">
              @for (stat of runStats(); track stat.label) {
                <div class="rounded border border-light-border dark:border-white/10 p-2 text-center">
                  <div class="text-lg font-bold" [class]="stat.color">{{ stat.value }}</div>
                  <div class="text-[10px] opacity-40">{{ stat.label }}</div>
                </div>
              }
            </div>
            <div class="text-center mb-4">
              <div class="text-4xl font-bold"
                [class.text-emerald-400]="(selectedRun()!.summary?.score ?? 0) >= 80"
                [class.text-amber-400]="(selectedRun()!.summary?.score ?? 0) >= 50 && (selectedRun()!.summary?.score ?? 0) < 80"
                [class.text-red-400]="(selectedRun()!.summary?.score ?? 0) < 50">
                {{ selectedRun()!.summary?.score ?? 0 }}%
              </div>
              <div class="text-xs opacity-40">de réussite</div>
            </div>
            <!-- Titre section -->
            @if (failedResults().length) {
              <div class="text-[10px] uppercase tracking-wider opacity-40 mb-1">
                Échecs — triés par criticité
              </div>
            }
            <div class="space-y-2">
              @for (r of failedResults(); track r.caseId) {
                @if (getCaseByCaseId(r.caseId); as tc) {
                  <div class="rounded border overflow-hidden"
                    [class.border-red-500/40]="tc.criticality === 'bloquant'"
                    [class.bg-red-500/6]="tc.criticality === 'bloquant'"
                    [class.border-orange-400/30]="tc.criticality === 'majeur'"
                    [class.bg-orange-500/5]="tc.criticality === 'majeur'"
                    [class.border-yellow-400/20]="tc.criticality === 'mineur'"
                    [class.bg-yellow-400/4]="tc.criticality === 'mineur'">

                    <!-- En-tête test -->
                    <div class="flex items-start gap-2 px-3 py-2">
                      <span class="shrink-0 w-2 h-2 rounded-full mt-1.5"
                        [class.bg-red-500]="tc.criticality === 'bloquant'"
                        [class.bg-orange-400]="tc.criticality === 'majeur'"
                        [class.bg-yellow-400]="tc.criticality === 'mineur'"></span>
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-semibold mb-1">{{ tc.title }}</div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-[9px] px-1.5 py-0.5 rounded border font-medium"
                            [class.border-red-500]="tc.criticality === 'bloquant'"
                            [class.text-red-400]="tc.criticality === 'bloquant'"
                            [class.border-orange-400]="tc.criticality === 'majeur'"
                            [class.text-orange-400]="tc.criticality === 'majeur'"
                            [class.border-yellow-400]="tc.criticality === 'mineur'"
                            [class.text-yellow-400]="tc.criticality === 'mineur'">{{ tc.criticality }}</span>
                          @if (tc.url) {
                            <a [href]="tc.url" target="_blank"
                              class="text-[9px] text-primary hover:underline truncate max-w-[200px]">{{ tc.url }}</a>
                          }
                          @if (tc.steps.length) {
                            <span class="text-[9px] opacity-30">{{ tc.steps.length }} étape{{ tc.steps.length > 1 ? 's' : '' }}</span>
                          }
                        </div>
                      </div>
                    </div>

                    <!-- Ligne testeur + résultat + commentaire -->
                    <div class="border-t px-3 py-2 flex items-start gap-2"
                      [class.border-red-500/20]="tc.criticality === 'bloquant'"
                      [class.border-orange-400/15]="tc.criticality === 'majeur'"
                      [class.border-yellow-400/10]="tc.criticality === 'mineur'">
                      <span class="material-symbols-outlined text-sm opacity-30 shrink-0 mt-0.5">person</span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-[10px] font-medium opacity-70">{{ r.testedBy || 'IA' }}</span>
                          <span class="text-[9px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">✗ Échoué</span>
                          @if (r.testedAt) {
                            <span class="text-[9px] opacity-30">{{ r.testedAt | date:'dd/MM HH:mm' }}</span>
                          }
                        </div>
                        @if (r.notes || r.aiComment) {
                          <div class="mt-1 text-[10px] opacity-60 italic leading-relaxed">
                            "{{ r.notes || r.aiComment }}"
                          </div>
                        }
                      </div>
                    </div>

                  </div>
                }
              }
              @if (!failedResults().length) {
                <div class="text-center py-4 text-xs opacity-30">Aucun test en échec.</div>
              }
            </div>
          </div>
        }
      </div>
    }
  </div>
</div>

<!-- Template formulaire test case -->
<ng-template #caseForm let-tc>
  <form novalidate (submit)="$event.preventDefault()" class="space-y-2.5 text-xs">
    <!-- Titre -->
    <input type="text" placeholder="Titre du test *" required
      class="w-full px-2.5 py-1.5 rounded border border-light-border dark:border-white/10 bg-transparent focus:outline-none focus:border-primary"
      [(ngModel)]="tc.title" name="title">
    <!-- Description + URL -->
    <div class="flex gap-2">
      <input type="text" placeholder="Description (optionnel)"
        class="flex-1 px-2.5 py-1.5 rounded border border-light-border dark:border-white/10 bg-transparent focus:outline-none focus:border-primary"
        [(ngModel)]="tc.description" name="description">
      <input type="url" placeholder="URL concernée (optionnel)"
        class="flex-1 px-2.5 py-1.5 rounded border border-light-border dark:border-white/10 bg-transparent focus:outline-none focus:border-primary"
        [(ngModel)]="tc.url" name="url">
    </div>
    <!-- Criticité + Catégorie côte à côte -->
    <div class="flex gap-8 items-start flex-wrap">
      <div class="shrink-0">
        <span class="text-[10px] opacity-40 block mb-1.5">Criticité</span>
        <div class="flex gap-4">
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="radio" name="criticality" value="bloquant" [(ngModel)]="tc.criticality"
              class="w-3 h-3 cursor-pointer accent-red-500">
            <span class="text-[11px] text-red-400">Bloquant</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="radio" name="criticality" value="majeur" [(ngModel)]="tc.criticality"
              class="w-3 h-3 cursor-pointer accent-orange-400">
            <span class="text-[11px] text-orange-400">Majeur</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="radio" name="criticality" value="mineur" [(ngModel)]="tc.criticality"
              class="w-3 h-3 cursor-pointer accent-yellow-400">
            <span class="text-[11px] text-yellow-400">Mineur</span>
          </label>
        </div>
      </div>
      @if (suite()?.categories?.length) {
        <div class="flex-1 min-w-0">
          <span class="text-[10px] opacity-40 block mb-1.5">Catégorie</span>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="radio" name="category" value="" [(ngModel)]="tc.categoryId"
                class="w-3 h-3 cursor-pointer">
              <span class="text-[11px] opacity-50">Sans catégorie</span>
            </label>
            @for (cat of suite()!.categories; track cat.id) {
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="radio" name="category" [value]="cat.id" [(ngModel)]="tc.categoryId"
                  class="w-3 h-3 cursor-pointer">
                <span class="text-[11px]">{{ cat.name }}</span>
              </label>
            }
          </div>
        </div>
      }
    </div>
    <!-- Étapes -->
    <div>
      <div class="flex items-center gap-3 mb-2">
        <span class="text-xs font-semibold opacity-70">Étapes</span>
        <button type="button" class="flex items-center gap-0.5 text-[10px] text-primary hover:opacity-80 transition-opacity" (click)="addStep(tc)">
          <span class="material-symbols-outlined text-xs">add</span>Étape
        </button>
      </div>
      @for (step of tc.steps; track step.order) {
        <div class="flex gap-1.5 mb-1 items-start">
          <span class="text-[10px] opacity-30 mt-1.5 shrink-0 w-4 text-right">{{ step.order }}.</span>
          <input type="text" placeholder="Action à effectuer"
            class="flex-1 px-2 py-1 rounded border border-light-border dark:border-white/10 bg-transparent text-[11px] focus:outline-none focus:border-primary"
            [(ngModel)]="step.action" [name]="'step-action-' + step.order">
          <input type="text" placeholder="Résultat attendu"
            class="flex-1 px-2 py-1 rounded border border-light-border dark:border-white/10 bg-transparent text-[11px] focus:outline-none focus:border-primary"
            [(ngModel)]="step.expected" [name]="'step-expected-' + step.order">
          <button type="button" class="text-red-400 hover:opacity-80 px-1 mt-0.5 shrink-0" (click)="removeStep(tc, step.order)">
            <span class="material-symbols-outlined text-xs">close</span>
          </button>
        </div>
      }
    </div>
    <div class="flex gap-2 justify-end pt-1">
      <button type="button"
        class="px-3 py-1 text-xs rounded border border-light-border dark:border-white/10 hover:opacity-80"
        (click)="cancelEdit()">Annuler</button>
      <button type="button"
        class="px-3 py-1 text-xs rounded bg-primary text-white dark:text-btn-text hover:opacity-90"
        (click)="saveCase(tc)">Enregistrer</button>
    </div>
  </form>
</ng-template>
  `,
})
export class TestsOutilComponent implements OnChanges {
  @Input() projectId: string | null = null;
  @Input() projectName = '';
  @Input() megaOutilInstances: MegaOutilInstance[] = [];
  @Input() activeOutilId: string | null = null;

  private svc = inject(TestsOutilService);

  readonly tabs = [
    { id: 'cahier' as TabId, label: 'Cahier de recette', icon: 'checklist' },
    { id: 'execution' as TabId, label: 'Exécution', icon: 'play_circle' },
    { id: 'resultats' as TabId, label: 'Résultats', icon: 'bar_chart' },
  ];

  readonly criticityFilters = [
    { value: 'all', label: 'Tous' },
    { value: 'bloquant', label: '● Bloquant' },
    { value: 'majeur', label: '● Majeur' },
    { value: 'mineur', label: '● Mineur' },
  ];

  // ── State
  activeTab = signal<TabId>('cahier');
  suite = signal<TestSuite | null>(null);
  runs = signal<Omit<TestRun, 'results'>[]>([]);
  editingCase = signal<Partial<TestCase> | null>(null);
  generating = signal(false);
  generateMsg = signal('');

  // ── Edition section picker + IA proposals
  editionSections = signal<{ id: string; name: string; depth: number }[]>([]);
  showSectionPicker = signal(false);
  selectedSection = signal<{ id: string; name: string } | null>(null);
  iaProposals = signal<Array<{ id: string; title: string; description?: string; criticality: string; steps: any[] }>>([]);
  selectedProposalIds = signal<Set<string>>(new Set());
  generatingIA = signal(false);
  private aiCancel$ = new Subject<void>();
  private aiGenSub?: Subscription;
  filterCriticality = signal<string>('all');

  editingCategoryId = signal<string | null>(null);
  editingCategoryName = '';
  addingCategory = signal(false);
  newCategoryName = '';

  draggedCatId = signal<string | null>(null);
  draggedTestId = signal<string | null>(null);
  dragOverId = signal<string | null>(null);
  dragPos = signal<'before' | 'after'>('after');

  runMode = signal<'auto' | 'manual'>('auto');
  targetUrlValue = '';
  testerNameValue = '';
  runComment = '';
  selectedRunCategories = signal<Set<string>>(new Set());
  isRunning = signal(false);
  runProgress = signal<{ current: number; total: number }>({ current: 0, total: 0 });
  liveResults = signal<TestRunResult[]>([]);
  currentRun = signal<TestRun | null>(null);
  manualCaseIndex = signal(0);
  manualNotes = '';
  selectedRun = signal<TestRun | null>(null);

  // ── Computed
  readonly mockupInstances = computed(() => this.megaOutilInstances.filter(i => i.type === 'mockup'));

  readonly categoriesWithTests = computed(() => {
    const s = this.suite();
    const filter = this.filterCriticality();
    if (!s) return [];
    return [...s.categories]
      .sort((a, b) => a.order - b.order)
      .map(cat => ({
        ...cat,
        cases: s.cases.filter(c =>
          c.categoryId === cat.id &&
          c.status !== 'archived' &&
          (filter === 'all' || c.criticality === filter)
        ),
      }));
  });

  readonly uncategorizedCases = computed(() => {
    const s = this.suite();
    const filter = this.filterCriticality();
    if (!s) return [];
    const catIds = new Set(s.categories.map(c => c.id));
    return s.cases.filter(c =>
      c.status !== 'archived' &&
      (!c.categoryId || !catIds.has(c.categoryId)) &&
      (filter === 'all' || c.criticality === filter)
    );
  });

  readonly totalFilteredCount = computed(() =>
    this.categoriesWithTests().reduce((acc, cat) => acc + cat.cases.length, 0) +
    this.uncategorizedCases().length
  );

  readonly filteredRunCaseIds = computed(() => {
    const cats = this.selectedRunCategories();
    return (this.suite()?.cases ?? [])
      .filter(c => c.status === 'active' && (cats.size === 0 || cats.has(c.categoryId)))
      .map(c => c.id);
  });

  readonly activeCasesCount = computed(() => this.filteredRunCaseIds().length);

  readonly totalActiveCasesCount = computed(() =>
    this.suite()?.cases.filter(c => c.status === 'active').length ?? 0
  );

  readonly runProgressPct = computed(() => {
    const p = this.runProgress();
    return p.total ? Math.round((p.current / p.total) * 100) : 0;
  });

  readonly manualCurrentCase = computed(() => {
    const run = this.currentRun();
    if (!run) return null;
    const idx = this.manualCaseIndex();
    if (idx >= run.caseIds.length) return null;
    return this.suite()?.cases?.find(c => c.id === run.caseIds[idx]) ?? null;
  });

  readonly completedCaseIds = computed(() =>
    this.currentRun()?.caseIds.slice(0, this.manualCaseIndex()) ?? []
  );

  readonly upcomingCaseIds = computed(() =>
    this.currentRun()?.caseIds.slice(this.manualCaseIndex() + 1) ?? []
  );

  readonly manualPassCount = computed(() =>
    this.currentRun()?.results.filter(r => r.status === 'pass').length ?? 0
  );

  readonly manualFailCount = computed(() =>
    this.currentRun()?.results.filter(r => r.status === 'fail').length ?? 0
  );

  getManualCase(caseId: string): TestCase | undefined {
    return this.suite()?.cases?.find(c => c.id === caseId);
  }

  getManualResult(caseId: string): TestRunResult | undefined {
    return this.currentRun()?.results.find(r => r.caseId === caseId);
  }

  readonly failedResults = computed(() => {
    const run = this.selectedRun();
    if (!run) return [];
    const order = { bloquant: 0, majeur: 1, mineur: 2 };
    return [...(run.results?.filter(r => r.status === 'fail') ?? [])].sort((a, b) => {
      const ca = this.suite()?.cases?.find(c => c.id === a.caseId);
      const cb = this.suite()?.cases?.find(c => c.id === b.caseId);
      return (order[ca?.criticality ?? 'mineur'] ?? 2) - (order[cb?.criticality ?? 'mineur'] ?? 2);
    });
  });

  readonly runStats = computed(() => {
    const s = this.selectedRun()?.summary;
    if (!s) return [];
    return [
      { label: 'Total', value: s.total, color: '' },
      { label: 'Passés', value: s.pass, color: 'text-emerald-400' },
      { label: 'Échoués', value: s.fail, color: 'text-red-400' },
      { label: 'Ignorés', value: s.skip, color: 'text-amber-400' },
    ];
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projectId'] && this.projectId) this.loadData();
  }

  async loadData() {
    if (!this.projectId) return;
    const [suite, { runs }] = await Promise.all([
      this.svc.getSuite(this.projectId),
      this.svc.getRuns(this.projectId),
    ]);
    this.suite.set(suite);
    this.runs.set(runs);
  }

  // ── Catégories
  startAddCategory() { this.newCategoryName = ''; this.addingCategory.set(true); }

  confirmAddCategory() {
    const name = this.newCategoryName.trim();
    if (!name) { this.addingCategory.set(false); return; }
    const s = this.suite();
    if (!s) return;
    this.saveSuite({ ...s, categories: [...s.categories, { id: 'cat-' + Date.now(), name, order: s.categories.length }] });
    this.addingCategory.set(false);
    this.newCategoryName = '';
  }

  startEditCategory(catId: string, currentName: string) {
    this.editingCategoryId.set(catId);
    this.editingCategoryName = currentName;
  }

  saveCategoryName(catId: string) {
    const name = this.editingCategoryName.trim();
    if (name) {
      const s = this.suite();
      if (s) this.saveSuite({ ...s, categories: s.categories.map(c => c.id === catId ? { ...c, name } : c) });
    }
    this.editingCategoryId.set(null);
  }

  removeCategory(catId: string) {
    const s = this.suite();
    if (!s) return;
    this.saveSuite({
      ...s,
      categories: s.categories.filter(c => c.id !== catId),
      cases: s.cases.map(c => c.categoryId === catId ? { ...c, status: 'archived' as TestStatus } : c),
    });
  }

  // ── Tests
  startAddTestInCat(catId: string) {
    this.editingCase.set({
      id: '__new__', title: '', description: '', url: '',
      criticality: 'majeur', status: 'active', source: 'manual',
      steps: [], categoryId: catId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }

  startEditCase(tc: TestCase) {
    this.editingCase.set({ ...tc, steps: tc.steps.map(s => ({ ...s })) });
  }

  cancelEdit() { this.editingCase.set(null); }

  saveCase(tc: Partial<TestCase>) {
    if (!tc.title?.trim()) return;
    const s = this.suite();
    if (!s) return;
    const now = new Date().toISOString();
    if (tc.id === '__new__') {
      const newCase: TestCase = {
        id: 'tc-' + Date.now(), title: tc.title!, description: tc.description,
        criticality: tc.criticality as TestCriticality ?? 'majeur',
        status: tc.status as TestStatus ?? 'active',
        source: tc.source ?? 'manual', sourceRef: tc.sourceRef,
        categoryId: tc.categoryId ?? '', url: tc.url || undefined,
        steps: tc.steps ?? [], createdAt: now, updatedAt: now,
      };
      this.saveSuite({ ...s, cases: [...s.cases, newCase] });
    } else {
      this.saveSuite({ ...s, cases: s.cases.map(c => c.id === tc.id ? { ...c, ...tc, updatedAt: now } as TestCase : c) });
    }
    this.editingCase.set(null);
  }

  removeCase(caseId: string) {
    const s = this.suite();
    if (!s) return;
    this.saveSuite({ ...s, cases: s.cases.map(c => c.id === caseId ? { ...c, status: 'archived' as TestStatus } : c) });
  }

  addStep(tc: Partial<TestCase>) {
    const steps = tc.steps ?? [];
    tc.steps = [...steps, { order: steps.length + 1, action: '', expected: '' }];
  }

  removeStep(tc: Partial<TestCase>, order: number) {
    tc.steps = (tc.steps ?? []).filter(s => s.order !== order).map((s, i) => ({ ...s, order: i + 1 }));
  }

  // ── Drag & Drop — catégories
  onCatDragStart(e: DragEvent, catId: string) {
    this.draggedCatId.set(catId);
    this.draggedTestId.set(null);
    e.dataTransfer?.setData('text/plain', catId);
  }

  onCatDragOver(e: DragEvent, catId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.draggedCatId() && !this.draggedTestId()) return;
    this.dragOverId.set(catId);
    if (this.draggedCatId()) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.dragPos.set(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    }
  }

  onCatDrop(e: DragEvent, catId: string) {
    e.preventDefault();
    e.stopPropagation();
    const draggingCat = this.draggedCatId();
    const draggingTest = this.draggedTestId();
    if (draggingCat && draggingCat !== catId) this.reorderCategory(draggingCat, catId, this.dragPos());
    else if (draggingTest) this.moveTestToCategory(draggingTest, catId);
    this.onDragEnd();
  }

  private reorderCategory(dragId: string, targetId: string, pos: 'before' | 'after') {
    const s = this.suite();
    if (!s) return;
    const cats = [...s.categories].sort((a, b) => a.order - b.order);
    const from = cats.findIndex(c => c.id === dragId);
    const to = cats.findIndex(c => c.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = cats.splice(from, 1);
    const insertAt = pos === 'before' ? (from < to ? to - 1 : to) : (from < to ? to : to + 1);
    cats.splice(Math.max(0, Math.min(cats.length, insertAt)), 0, moved);
    this.saveSuite({ ...s, categories: cats.map((c, i) => ({ ...c, order: i })) });
  }

  private moveTestToCategory(testId: string, catId: string) {
    const s = this.suite();
    if (!s) return;
    this.saveSuite({ ...s, cases: s.cases.map(c => c.id === testId ? { ...c, categoryId: catId, updatedAt: new Date().toISOString() } : c) });
  }

  // ── Drag & Drop — tests
  onTestDragStart(e: DragEvent, testId: string) {
    this.draggedTestId.set(testId);
    this.draggedCatId.set(null);
    e.dataTransfer?.setData('text/plain', testId);
    e.stopPropagation();
  }

  onTestDragOver(e: DragEvent, testId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.draggedTestId()) return;
    this.dragOverId.set(testId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.dragPos.set(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
  }

  onTestDrop(e: DragEvent, targetTestId: string) {
    e.preventDefault();
    e.stopPropagation();
    const dragId = this.draggedTestId();
    if (!dragId || dragId === targetTestId) { this.onDragEnd(); return; }
    const s = this.suite();
    if (!s) { this.onDragEnd(); return; }
    const target = s.cases.find(c => c.id === targetTestId);
    if (target) this.moveTestToCategory(dragId, target.categoryId ?? '');
    this.onDragEnd();
  }

  onDropOnZone(e: DragEvent) {
    const dragId = this.draggedTestId();
    if (dragId) this.moveTestToCategory(dragId, '');
    this.onDragEnd();
  }

  onDragEnd() {
    this.draggedCatId.set(null);
    this.draggedTestId.set(null);
    this.dragOverId.set(null);
  }

  // ── Génération
  async toggleSectionPicker() {
    if (this.showSectionPicker()) { this.showSectionPicker.set(false); return; }
    if (!this.editionSections().length && this.projectId) {
      const sections = await this.svc.getEditionSections(this.projectId);
      this.editionSections.set(sections);
    }
    this.showSectionPicker.set(true);
  }

  selectSection(section: { id: string; name: string }) {
    this.selectedSection.set(section);
    this.showSectionPicker.set(false);
    this.iaProposals.set([]);
    this.selectedProposalIds.set(new Set());
  }

  generateFromIA() {
    const section = this.selectedSection();
    if (!section || !this.projectId) return;
    this.generatingIA.set(true);
    this.generateMsg.set('');
    this.iaProposals.set([]);
    this.aiGenSub = this.svc.generateAITestsObs(this.projectId, section.id, section.name)
      .pipe(takeUntil(this.aiCancel$))
      .subscribe({
        next: ({ generated, message }) => {
          if (message && !generated.length) {
            this.generateMsg.set(message);
            setTimeout(() => this.generateMsg.set(''), 6000);
          } else {
            const proposals = generated.map(g => ({
              id: g.id ?? 'p-' + Math.random().toString(36).slice(2, 8),
              title: g.title ?? 'Test sans titre',
              description: g.description,
              criticality: g.criticality ?? 'majeur',
              steps: g.steps ?? [],
            }));
            this.iaProposals.set(proposals);
            this.selectedProposalIds.set(new Set(proposals.map(p => p.id)));
          }
          this.generatingIA.set(false);
        },
        error: () => {
          this.generateMsg.set('Erreur lors de la génération IA.');
          setTimeout(() => this.generateMsg.set(''), 4000);
          this.generatingIA.set(false);
        },
      });
  }

  cancelAIGeneration() {
    this.aiCancel$.next();
    this.aiGenSub?.unsubscribe();
    this.generatingIA.set(false);
    this.generateMsg.set('Génération annulée.');
    setTimeout(() => this.generateMsg.set(''), 3000);
  }

  toggleProposal(id: string) {
    const s = new Set(this.selectedProposalIds());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.selectedProposalIds.set(s);
  }

  toggleAllProposals() {
    const all = this.iaProposals().map(p => p.id);
    if (this.selectedProposalIds().size === all.length) this.selectedProposalIds.set(new Set());
    else this.selectedProposalIds.set(new Set(all));
  }

  async addSelectedProposals() {
    const section = this.selectedSection();
    if (!section || !this.projectId) return;
    const selected = this.iaProposals().filter(p => this.selectedProposalIds().has(p.id));
    if (!selected.length) return;
    const s = { ...this.suite()! };
    const now = new Date().toISOString();
    let cat = s.categories.find(c => c.name === section.name);
    let categoryId = cat?.id;
    if (!cat) {
      categoryId = 'cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
      s.categories = [...s.categories, { id: categoryId!, name: section.name, order: s.categories.length }];
    }
    const newCases: TestCase[] = selected.map(p => ({
      id: p.id, title: p.title, description: p.description,
      criticality: p.criticality as any, status: 'active' as TestStatus,
      source: 'ia' as any, sourceRef: section.id, categoryId: categoryId!,
      url: undefined, steps: p.steps, createdAt: now, updatedAt: now,
    }));
    await this.saveSuite({ ...s, cases: [...s.cases, ...newCases] });
    this.iaProposals.set([]);
    this.selectedProposalIds.set(new Set());
    this.generateMsg.set(`${newCases.length} test(s) ajouté(s) dans "${section.name}"`);
    setTimeout(() => this.generateMsg.set(''), 4000);
  }

  async generateFrom(source: TestGenerationSource) {
    if (!this.projectId) return;
    this.generating.set(true);
    this.generateMsg.set('');
    try {
      const { generated, message } = await this.svc.generateCases(this.projectId, source);
      if (message) this.generateMsg.set(message);
      if (generated.length) {
        const s = this.suite()!;
        const now = new Date().toISOString();
        const newCases: TestCase[] = generated.map(g => ({
          id: g.id ?? 'tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          title: g.title ?? 'Test sans titre', description: g.description,
          criticality: g.criticality ?? 'majeur', status: 'active' as TestStatus,
          source, sourceRef: g.sourceRef, categoryId: g.categoryId ?? '',
          url: g.url, steps: g.steps ?? [], createdAt: now, updatedAt: now,
        }));
        await this.saveSuite({ ...s, cases: [...s.cases, ...newCases] });
        this.generateMsg.set(`${newCases.length} test(s) généré(s)`);
      }
    } finally {
      this.generating.set(false);
      setTimeout(() => this.generateMsg.set(''), 4000);
    }
  }

  private autoRunSub?: Subscription;

  toggleRunCategory(catId: string) {
    const s = new Set(this.selectedRunCategories());
    if (s.has(catId)) s.delete(catId); else s.add(catId);
    this.selectedRunCategories.set(s);
  }

  clearRunCategories() {
    this.selectedRunCategories.set(new Set());
  }

  catActiveCount(catId: string): number {
    return this.suite()?.cases.filter(c => c.status === 'active' && c.categoryId === catId).length ?? 0;
  }

  // ── Exécution auto
  launchAutoRun() {
    if (!this.projectId) return;
    const caseIds = this.filteredRunCaseIds();
    this.isRunning.set(true);
    this.liveResults.set([]);
    this.runProgress.set({ current: 0, total: caseIds.length });
    this.autoRunSub = this.svc.launchAutoRun(this.projectId, {
      targetUrl: this.targetUrlValue || undefined,
      caseIds: this.selectedRunCategories().size ? caseIds : undefined,
      comment: this.runComment || undefined,
    }).subscribe({
      next: ({ event, data }) => {
        if (event === 'start') this.runProgress.set({ current: 0, total: (data as any).total });
        if (event === 'case-result') {
          const d = data as any;
          this.liveResults.update(r => [...r, d.result]);
          this.runProgress.set({ current: d.index + 1, total: d.total });
        }
        if (event === 'complete') { this.isRunning.set(false); this.loadData(); this.activeTab.set('resultats'); }
      },
      error: () => this.isRunning.set(false),
    });
  }

  stopAutoRun() {
    this.autoRunSub?.unsubscribe();
    this.autoRunSub = undefined;
    this.isRunning.set(false);
  }

  // ── Exécution manuelle
  async launchManualRun() {
    if (!this.projectId || !this.testerNameValue) return;
    const caseIds = this.filteredRunCaseIds();
    const { runId } = await this.svc.launchManualRun(this.projectId, {
      testerName: this.testerNameValue,
      caseIds: this.selectedRunCategories().size ? caseIds : undefined,
      comment: this.runComment || undefined,
    });
    const run = await this.svc.getRun(this.projectId, runId);
    this.currentRun.set(run);
    this.manualCaseIndex.set(0);
    this.manualNotes = '';
  }

  async submitManualResult(status: TestRunResult['status']) {
    const run = this.currentRun();
    if (!run || !this.projectId) return;
    const tc = this.manualCurrentCase();
    if (!tc) return;
    const results: TestRunResult[] = run.results.map(r =>
      r.caseId === tc.id
        ? { ...r, status, notes: this.manualNotes || undefined, testedBy: this.testerNameValue, testedAt: new Date().toISOString() }
        : r
    );
    const nextIdx = this.manualCaseIndex() + 1;
    const isLast = nextIdx >= run.caseIds.length;
    const updated = await this.svc.updateRun(this.projectId, run.id, { results, status: isLast ? 'completed' : 'running' });
    this.currentRun.set(updated);
    this.manualNotes = '';
    if (isLast) { await this.loadData(); this.activeTab.set('resultats'); this.currentRun.set(null); }
    else this.manualCaseIndex.set(nextIdx);
  }

  // ── Résultats
  async loadRunDetail(runId: string) {
    if (!this.projectId) return;
    this.selectedRun.set(await this.svc.getRun(this.projectId, runId) as TestRun);
  }

  async deleteRun(runId: string) {
    if (!this.projectId) return;
    await this.svc.deleteRun(this.projectId, runId);
    await this.loadData();
    if (this.selectedRun()?.id === runId) this.selectedRun.set(null);
  }

  // ── Helpers
  private async saveSuite(updated: TestSuite) {
    if (!this.projectId) return;
    this.suite.set(await this.svc.saveSuite(this.projectId, updated));
  }

  getCaseTitle(caseId: string): string {
    return this.suite()?.cases?.find(c => c.id === caseId)?.title ?? caseId;
  }

  getCaseByCaseId(caseId: string): TestCase | undefined {
    return this.suite()?.cases?.find(c => c.id === caseId);
  }
}
