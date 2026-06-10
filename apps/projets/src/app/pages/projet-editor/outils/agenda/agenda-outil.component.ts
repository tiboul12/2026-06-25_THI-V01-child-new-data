import {
  Component, Input, OnChanges, SimpleChanges,
  signal, computed, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaOutilService, AgendaEvent } from '@worganic/portail-core/data-access';

type TabId = 'semaine' | 'mois' | 'annee';

const AGENDA_COLORS = [
  { label: 'Indigo',   value: '#6366f1' },
  { label: 'Émeraude', value: '#10b981' },
  { label: 'Ambre',    value: '#f59e0b' },
  { label: 'Rose',     value: '#f43f5e' },
  { label: 'Ciel',     value: '#0ea5e9' },
  { label: 'Violet',   value: '#a855f7' },
];

const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const JOURS_COURTS = ['L','M','M','J','V','S','D'];
const JOURS_LONGS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

@Component({
  selector: 'app-agenda-outil',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' },
  template: `
<div class="flex flex-col h-full bg-light-bg dark:bg-surface text-light-text dark:text-white/80 text-sm overflow-hidden">

  <!-- Onglets -->
  <div class="flex items-center border-b border-light-border dark:border-white/8 shrink-0 px-2 gap-1">
    @for (tab of tabs; track tab.id) {
      <button
        class="px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px flex items-center gap-1"
        [class.border-primary]="activeTab() === tab.id"
        [class.text-primary]="activeTab() === tab.id"
        [class.dark:text-white]="activeTab() === tab.id"
        [class.border-transparent]="activeTab() !== tab.id"
        [class.text-light-text-muted]="activeTab() !== tab.id"
        [class.dark:text-white/40]="activeTab() !== tab.id"
        (click)="activeTab.set(tab.id)">
        <span class="material-symbols-outlined text-[14px] align-middle">{{ tab.icon }}</span>
        {{ tab.label }}
      </button>
    }
    <!-- Navigation + période -->
    <div class="ml-auto flex items-center gap-2 pb-0.5">
      <button class="px-2 py-1 text-xs rounded bg-light-surface dark:bg-white/5 hover:bg-light-border dark:hover:bg-white/10 transition-colors"
              (click)="goToToday()">Aujourd'hui</button>
      <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-light-border dark:hover:bg-white/10 transition-colors"
              (click)="navigatePrev()">
        <span class="material-symbols-outlined text-[14px]">chevron_left</span>
      </button>
      <span class="text-xs font-medium text-light-text dark:text-white/70 min-w-[140px] text-center">{{ periodLabel() }}</span>
      <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-light-border dark:hover:bg-white/10 transition-colors"
              (click)="navigateNext()">
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
      </button>
    </div>
  </div>

  <!-- Contenu -->
  <div class="flex-1 overflow-hidden">

    <!-- ── VUE SEMAINE ── -->
    @if (activeTab() === 'semaine') {
      <div class="flex flex-col h-full overflow-hidden">
        <!-- En-tête jours -->
        <div class="grid shrink-0 border-b border-light-border dark:border-white/8"
             style="grid-template-columns: 52px repeat(7, 1fr)">
          <div class="py-2 border-r border-light-border dark:border-white/8"></div>
          @for (day of weekDays(); track day.date.toISOString()) {
            <div class="py-2 px-1 text-center border-r border-light-border dark:border-white/8 last:border-r-0">
              <div class="text-[10px] uppercase tracking-wide text-light-text-muted dark:text-white/30">{{ JOURS_COURTS[day.dow] }}</div>
              <div class="text-sm font-semibold mt-0.5"
                   [ngClass]="isToday(day.date) ? 'text-primary' : 'text-light-text dark:text-white/70'">
                {{ day.date.getDate() }}
              </div>
            </div>
          }
        </div>
        <!-- Grille heures -->
        <div class="flex-1 overflow-y-auto">
          <div class="grid relative" style="grid-template-columns: 52px repeat(7, 1fr)">
            <!-- Colonne heures -->
            <div class="border-r border-light-border dark:border-white/8">
              @for (h of hours; track h) {
                <div class="h-14 border-b border-light-border/50 dark:border-white/5 flex items-start justify-end pr-2 pt-1">
                  <span class="text-[10px] text-light-text-muted dark:text-white/25">{{ h }}h</span>
                </div>
              }
            </div>
            <!-- Colonnes jours -->
            @for (day of weekDays(); track day.date.toISOString(); let di = $index) {
              <div class="border-r border-light-border dark:border-white/8 last:border-r-0 relative">
                @for (h of hours; track h) {
                  <div class="h-14 border-b border-light-border/50 dark:border-white/5 cursor-pointer transition-colors"
                       [class.bg-primary]="dragOverKey() === day.date.toDateString() + '-' + h"
                       [class.opacity-20]="dragOverKey() === day.date.toDateString() + '-' + h"
                       (click)="onCellClick(day.date, h)"
                       (dragover)="onDragOver($event, day.date, h)"
                       (dragleave)="dragOverKey.set(null)"
                       (drop)="onDrop($event, day.date, h)">
                  </div>
                }
                <!-- Événements de ce jour (colonnes) -->
                @for (col of getWeekDayEventColumns(day.date); track col.event.id) {
                  <div class="absolute rounded px-1 py-0.5 text-black text-[10px] font-medium overflow-hidden cursor-grab shadow-sm z-10 select-none"
                       [style.background-color]="col.event.color || '#6366f1'"
                       [style.top.px]="getEventTop(col.event)"
                       [style.height.px]="getEventHeight(col.event)"
                       [style.left]="'calc(' + (col.col / col.totalCols * 80) + '% + 1px)'"
                       [style.width]="'calc(' + (80 / col.totalCols) + '% - 2px)'"
                       [style.opacity]="draggingEventId() === col.event.id ? '0.4' : '1'"
                       [style.pointer-events]="draggingEventId() ? 'none' : 'auto'"
                       draggable="true"
                       (dragstart)="onDragStart(col.event, $event)"
                       (dragend)="onDragEnd()"
                       (click)="onEventClick(col.event, $event)">
                    <span class="truncate block">{{ col.event.title }}</span>
                    @if (!col.event.allDay) {
                      <span class="opacity-75 block truncate">{{ formatTime(col.event.startDate) }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }

    <!-- ── VUE MOIS ── -->
    @if (activeTab() === 'mois') {
      <div class="flex flex-col h-full overflow-auto p-2">
        <!-- En-tête jours de la semaine -->
        <div class="grid grid-cols-7 mb-1 shrink-0">
          @for (j of JOURS_COURTS; track j; let i = $index) {
            <div class="text-center text-[10px] uppercase tracking-wide text-light-text-muted dark:text-white/30 py-1">
              {{ JOURS_COURTS[i] }}
            </div>
          }
        </div>
        <!-- Grille jours -->
        <div class="grid grid-cols-7 gap-px bg-light-border dark:bg-white/8 flex-1 border border-light-border dark:border-white/8 rounded-lg overflow-hidden">
          @for (cell of monthCells(); track cell.key) {
            <div class="min-h-[80px] p-1 relative group transition-colors"
                 [ngClass]="cell.inMonth
                   ? (dragOverKey() === cell.key ? 'bg-[#0a1a50] cursor-pointer' : 'bg-[#060d2e] cursor-pointer hover:bg-[#0a1340]')
                   : 'bg-black cursor-default'"
                 (click)="cell.inMonth && onCellClick(cell.date, null)"
                 (dragover)="cell.inMonth && onMonthDragOver($event, cell.key)"
                 (dragleave)="dragOverKey.set(null)"
                 (drop)="cell.inMonth && onMonthDrop($event, cell.date)">
              <div class="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1"
                   [ngClass]="isToday(cell.date) ? 'bg-primary text-black' : (cell.inMonth ? 'text-white/70' : 'text-white/20')">
                {{ cell.date.getDate() }}
              </div>
              @for (ev of getMonthDayEvents(cell.date).slice(0, 3); track ev.id) {
                <div class="text-[10px] px-1 py-0.5 rounded mb-0.5 truncate text-black font-medium select-none"
                     [style.background-color]="ev.color || '#6366f1'"
                     [style.opacity]="draggingEventId() === ev.id ? '0.4' : '1'"
                     [style.cursor]="'grab'"
                     draggable="true"
                     (dragstart)="onMonthDragStart(ev, $event)"
                     (dragend)="onDragEnd()"
                     (click)="onEventClick(ev, $event)">
                  {{ ev.title }}
                </div>
              }
              @if (getMonthDayEvents(cell.date).length > 3) {
                <div class="text-[10px] text-light-text-muted dark:text-white/40 pl-1">
                  +{{ getMonthDayEvents(cell.date).length - 3 }} de plus
                </div>
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- ── VUE ANNÉE ── -->
    @if (activeTab() === 'annee') {
      <div class="flex-1 overflow-auto p-2">
        <div class="grid gap-px bg-light-border dark:bg-white/8 border border-light-border dark:border-white/8 rounded-lg overflow-hidden"
             style="grid-template-columns: 28px repeat(12, 1fr)">
          <!-- En-tête -->
          <div style="background:#1a1a2e"></div>
          @for (m of MOIS_COURTS; track m; let mi = $index) {
            <div class="text-center text-[10px] uppercase tracking-wide py-1.5 font-semibold text-white/50"
                 style="background:#1e1e30">
              {{ m }}
            </div>
          }
          <!-- Lignes jours 1-31 -->
          @for (d of days31; track d) {
            <div class="text-center text-[10px] py-1 border-t border-white/5 text-white/30"
                 style="background:#1e1e30">
              {{ d }}
            </div>
            @for (m of months12; track m; let mi = $index) {
              @if (isValidDate(currentYear(), mi, d - 1)) {
                <div class="border-t border-white/5 cursor-pointer transition-colors flex items-center px-0.5 py-0.5 gap-px"
                     style="background:#060d2e; min-height:18px"
                     (click)="onYearCellClick(currentYear(), mi, d - 1)">
                  @for (ev of getYearCellEvents(currentYear(), mi, d); track ev.id) {
                    <div class="h-2.5 rounded-sm flex-shrink-0 cursor-pointer"
                         [style.background-color]="ev.color || '#6366f1'"
                         [style.width.%]="getYearEventWidth(currentYear(), mi, d)"
                         (click)="onEventClick(ev, $event)">
                    </div>
                  }
                </div>
              } @else {
                <div class="border-t border-white/5" style="background:#000; min-height:18px"></div>
              }
            }
          }
        </div>
      </div>
    }

  </div>

  <!-- ── POPUP ÉVÉNEMENT ── -->
  @if (showPopup()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div class="relative bg-white dark:bg-[#1a1a2e] rounded-xl shadow-2xl border border-light-border dark:border-white/10 w-full max-w-md p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-light-text dark:text-white">
            {{ editingEvent() ? "Modifier l'événement" : 'Nouvel événement' }}
          </h3>
          <button class="w-7 h-7 flex items-center justify-center rounded hover:bg-light-surface dark:hover:bg-white/10 transition-colors"
                  (click)="closePopup()">
            <span class="material-symbols-outlined text-sm text-light-text-muted dark:text-white/40">close</span>
          </button>
        </div>

        <!-- Titre -->
        <div class="mb-3">
          <label class="block text-[11px] text-light-text-muted dark:text-white/40 mb-1">Titre *</label>
          <input type="text"
                 [(ngModel)]="form.title"
                 placeholder="Titre de l'événement"
                 class="w-full px-3 py-2 text-sm rounded-lg bg-light-surface dark:bg-white/5 border border-light-border dark:border-white/10 text-light-text dark:text-white placeholder-light-text-muted dark:placeholder-white/20 focus:outline-none focus:border-primary dark:focus:border-primary transition-colors" />
        </div>

        <!-- Toute la journée -->
        <div class="mb-3 flex items-center gap-2">
          <input type="checkbox" id="allDay" [(ngModel)]="form.allDay"
                 class="w-4 h-4 accent-primary" />
          <label for="allDay" class="text-xs text-light-text dark:text-white/70 cursor-pointer">Toute la journée</label>
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-[11px] text-light-text-muted dark:text-white/40 mb-1">Début</label>
            @if (form.allDay) {
              <input type="date" [(ngModel)]="form.startDateOnly"
                     class="w-full px-3 py-2 text-xs rounded-lg bg-light-surface dark:bg-white/5 border border-light-border dark:border-white/10 text-light-text dark:text-white dark:[color-scheme:dark] focus:outline-none focus:border-primary transition-colors" />
            } @else {
              <input type="datetime-local" [(ngModel)]="form.startDateTime"
                     class="w-full px-3 py-2 text-xs rounded-lg bg-light-surface dark:bg-white/5 border border-light-border dark:border-white/10 text-light-text dark:text-white dark:[color-scheme:dark] focus:outline-none focus:border-primary transition-colors" />
            }
          </div>
          <div>
            <label class="block text-[11px] text-light-text-muted dark:text-white/40 mb-1">Fin</label>
            @if (form.allDay) {
              <input type="date" [(ngModel)]="form.endDateOnly"
                     class="w-full px-3 py-2 text-xs rounded-lg bg-light-surface dark:bg-white/5 border border-light-border dark:border-white/10 text-light-text dark:text-white dark:[color-scheme:dark] focus:outline-none focus:border-primary transition-colors" />
            } @else {
              <input type="datetime-local" [(ngModel)]="form.endDateTime"
                     class="w-full px-3 py-2 text-xs rounded-lg bg-light-surface dark:bg-white/5 border border-light-border dark:border-white/10 text-light-text dark:text-white dark:[color-scheme:dark] focus:outline-none focus:border-primary transition-colors" />
            }
          </div>
        </div>

        <!-- Description -->
        <div class="mb-3">
          <label class="block text-[11px] text-light-text-muted dark:text-white/40 mb-1">Description</label>
          <textarea [(ngModel)]="form.description"
                    rows="2"
                    placeholder="Description optionnelle..."
                    class="w-full px-3 py-2 text-xs rounded-lg bg-light-surface dark:bg-white/5 border border-light-border dark:border-white/10 text-light-text dark:text-white placeholder-light-text-muted dark:placeholder-white/20 focus:outline-none focus:border-primary transition-colors resize-none">
          </textarea>
        </div>

        <!-- Couleur -->
        <div class="mb-4">
          <label class="block text-[11px] text-light-text-muted dark:text-white/40 mb-1.5">Couleur</label>
          <div class="flex gap-2">
            @for (c of AGENDA_COLORS; track c.value) {
              <button class="w-6 h-6 rounded-full transition-transform hover:scale-110 border-2"
                      [style.background-color]="c.value"
                      [class.border-white]="form.color === c.value"
                      [class.dark:border-white]="form.color === c.value"
                      [class.border-transparent]="form.color !== c.value"
                      (click)="form.color = c.value">
              </button>
            }
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between">
          @if (editingEvent()) {
            <button class="px-3 py-1.5 text-xs rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex items-center gap-1"
                    (click)="confirmDelete()">
              <span class="material-symbols-outlined text-[13px]">delete</span>
              Supprimer
            </button>
          } @else {
            <div></div>
          }
          <div class="flex gap-2">
            <button class="px-3 py-1.5 text-xs rounded-lg bg-light-surface dark:bg-white/5 hover:bg-light-border dark:hover:bg-white/10 transition-colors"
                    (click)="closePopup()">Annuler</button>
            <button class="px-3 py-1.5 text-xs rounded-lg bg-primary text-black hover:opacity-90 transition-opacity disabled:opacity-40"
                    [disabled]="!form.title.trim() || saving()"
                    (click)="saveEvent()">
              {{ saving() ? 'Enregistrement...' : (editingEvent() ? 'Modifier' : 'Créer') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  }

</div>
  `,
})
export class AgendaOutilComponent implements OnChanges {
  @Input() projectId: string | null = null;
  @Input() projectName = '';
  @Input() activeOutilId: string | null = null;

  private agendaService = inject(AgendaOutilService);

  readonly JOURS_COURTS = JOURS_COURTS;
  readonly JOURS_LONGS = JOURS_LONGS;
  readonly MOIS_LABELS = MOIS_LABELS;
  readonly MOIS_COURTS = MOIS_COURTS;
  readonly AGENDA_COLORS = AGENDA_COLORS;

  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly days31 = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly months12 = Array.from({ length: 12 }, (_, i) => i);

  readonly tabs = [
    { id: 'mois' as TabId,    label: 'Mois',   icon: 'calendar_view_month' },
    { id: 'semaine' as TabId, label: 'Semaine', icon: 'calendar_view_week' },
    { id: 'annee' as TabId,   label: 'Année',   icon: 'calendar_today' },
  ];

  events = signal<AgendaEvent[]>([]);
  activeTab = signal<TabId>('mois');
  currentDate = signal<Date>(new Date());
  showPopup = signal(false);
  editingEvent = signal<AgendaEvent | null>(null);
  saving = signal(false);

  draggingEventId = signal<string | null>(null);
  dragOffsetMinutes = signal<number>(0);
  dragOverKey = signal<string | null>(null);

  form: {
    title: string;
    description: string;
    allDay: boolean;
    startDateTime: string;
    endDateTime: string;
    startDateOnly: string;
    endDateOnly: string;
    color: string;
  } = this.defaultForm();

  currentYear = computed(() => this.currentDate().getFullYear());

  periodLabel = computed(() => {
    const d = this.currentDate();
    if (this.activeTab() === 'semaine') {
      const mon = this.getWeekMonday(d);
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
      const sameMonth = mon.getMonth() === sun.getMonth();
      if (sameMonth) {
        return `${mon.getDate()} – ${sun.getDate()} ${MOIS_LABELS[mon.getMonth()]} ${mon.getFullYear()}`;
      }
      return `${mon.getDate()} ${MOIS_COURTS[mon.getMonth()]} – ${sun.getDate()} ${MOIS_COURTS[sun.getMonth()]} ${sun.getFullYear()}`;
    }
    if (this.activeTab() === 'mois') {
      return `${MOIS_LABELS[d.getMonth()]} ${d.getFullYear()}`;
    }
    return `${d.getFullYear()}`;
  });

  weekDays = computed(() => {
    const mon = this.getWeekMonday(this.currentDate());
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(mon);
      day.setDate(day.getDate() + i);
      return { date: day, dow: i };
    });
  });

  monthCells = computed(() => {
    const d = this.currentDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    // Lundi = 0, ajuster pour semaine commençant lundi
    const startDow = (firstDay.getDay() + 6) % 7;
    const lastDay = new Date(year, month + 1, 0);
    const cells: { date: Date; inMonth: boolean; key: string }[] = [];
    // Jours du mois précédent
    for (let i = startDow - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      cells.push({ date, inMonth: false, key: date.toISOString().slice(0, 10) });
    }
    // Jours du mois courant
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      cells.push({ date, inMonth: true, key: date.toISOString().slice(0, 10) });
    }
    // Jours du mois suivant pour compléter la grille
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      cells.push({ date, inMonth: false, key: date.toISOString().slice(0, 10) });
    }
    return cells;
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projectId'] && this.projectId) {
      this.loadEvents();
    }
  }

  async loadEvents() {
    if (!this.projectId) return;
    try {
      const list = await this.agendaService.getEvents(this.projectId);
      this.events.set(list);
    } catch { /* projet sans agenda encore */ }
  }

  navigatePrev() {
    const d = new Date(this.currentDate());
    if (this.activeTab() === 'semaine') d.setDate(d.getDate() - 7);
    else if (this.activeTab() === 'mois') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    this.currentDate.set(d);
  }

  navigateNext() {
    const d = new Date(this.currentDate());
    if (this.activeTab() === 'semaine') d.setDate(d.getDate() + 7);
    else if (this.activeTab() === 'mois') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    this.currentDate.set(d);
  }

  goToToday() {
    this.currentDate.set(new Date());
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  // ── Semaine ──

  getWeekDayEvents(date: Date): AgendaEvent[] {
    return this.events().filter(ev => {
      const start = new Date(ev.startDate);
      const end = new Date(ev.endDate);
      const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(date); dayEnd.setHours(23,59,59,999);
      return start <= dayEnd && end >= dayStart;
    });
  }

  getEventTop(ev: AgendaEvent): number {
    if (ev.allDay) return 0;
    const start = new Date(ev.startDate);
    return (start.getHours() * 60 + start.getMinutes()) / 60 * 56;
  }

  getEventHeight(ev: AgendaEvent): number {
    if (ev.allDay) return 56;
    const start = new Date(ev.startDate);
    const end = new Date(ev.endDate);
    const diffMin = Math.max(30, (end.getTime() - start.getTime()) / 60000);
    return diffMin / 60 * 56;
  }

  formatTime(isoDate: string): string {
    const d = new Date(isoDate);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  // ── Mois ──

  getMonthDayEvents(date: Date): AgendaEvent[] {
    const key = this.dateKey(date);
    return this.events().filter(ev => {
      const startKey = this.dateKey(new Date(ev.startDate));
      const endKey = this.dateKey(new Date(ev.endDate));
      return key >= startKey && key <= endKey;
    });
  }

  // ── Année ──

  isValidDate(year: number, month: number, dayIndex: number): boolean {
    const d = new Date(year, month, dayIndex + 1);
    return d.getMonth() === month;
  }

  hasYearDayEvent(year: number, month: number, dayIndex: number): boolean {
    const date = new Date(year, month, dayIndex + 1);
    return this.getMonthDayEvents(date).length > 0;
  }

  getYearDayColor(year: number, month: number, dayIndex: number): string {
    const date = new Date(year, month, dayIndex + 1);
    const evs = this.getMonthDayEvents(date);
    return evs.length > 0 ? (evs[0].color || '#6366f1') : '#6366f1';
  }

  getYearDayFirstEvent(year: number, month: number, dayIndex: number): AgendaEvent | null {
    const date = new Date(year, month, dayIndex + 1);
    const evs = this.getMonthDayEvents(date);
    return evs.length > 0 ? evs[0] : null;
  }

  getYearCellEvents(year: number, month: number, day: number): AgendaEvent[] {
    return this.getMonthDayEvents(new Date(year, month, day));
  }

  getYearEventWidth(year: number, month: number, day: number): number {
    const date = new Date(year, month, day);
    const count = this.getMonthDayEvents(date).length;
    if (count === 0) return 0;
    // 75% de la case répartis entre les événements, avec 1px de gap entre eux
    return Math.floor(75 / count);
  }

  getWeekDayEventColumns(date: Date): Array<{ event: AgendaEvent; col: number; totalCols: number }> {
    const events = this.getWeekDayEvents(date);
    if (events.length === 0) return [];
    const sorted = [...events].sort((a, b) =>
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    const cols: number[] = [];
    const colEndTimes: number[] = [];
    for (const ev of sorted) {
      const start = new Date(ev.startDate).getTime();
      const end = new Date(ev.endDate).getTime();
      let col = 0;
      while (colEndTimes[col] !== undefined && colEndTimes[col] > start) col++;
      cols.push(col);
      colEndTimes[col] = end;
    }
    const totalCols = Math.max(...cols) + 1;
    return sorted.map((event, i) => ({ event, col: cols[i], totalCols }));
  }

  // ── Drag & Drop mois ──

  onMonthDragStart(ev: AgendaEvent, domEvent: DragEvent) {
    this.draggingEventId.set(ev.id);
    domEvent.dataTransfer?.setData('text/plain', ev.id);
  }

  onMonthDragOver(domEvent: DragEvent, cellKey: string) {
    domEvent.preventDefault();
    this.dragOverKey.set(cellKey);
  }

  async onMonthDrop(domEvent: DragEvent, targetDate: Date) {
    domEvent.preventDefault();
    this.dragOverKey.set(null);
    const evId = this.draggingEventId();
    if (!evId || !this.projectId) return;
    const ev = this.events().find(e => e.id === evId);
    if (!ev) return;
    const duration = new Date(ev.endDate).getTime() - new Date(ev.startDate).getTime();
    const oldStart = new Date(ev.startDate);
    const newStart = new Date(targetDate);
    // Conserver l'heure d'origine
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);
    try {
      const updated = await this.agendaService.updateEvent(this.projectId, evId, {
        startDate: newStart.toISOString(),
        endDate: newEnd.toISOString(),
      });
      this.events.update(list => list.map(e => e.id === evId ? updated : e));
    } finally {
      this.draggingEventId.set(null);
    }
  }

  // ── Drag & Drop semaine ──

  onDragStart(ev: AgendaEvent, domEvent: DragEvent) {
    this.draggingEventId.set(ev.id);
    const target = domEvent.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetPx = domEvent.clientY - rect.top;
    // Convertir en minutes (56px = 1 heure)
    const offsetMin = Math.max(0, Math.round(offsetPx / 56 * 60));
    this.dragOffsetMinutes.set(offsetMin);
    domEvent.dataTransfer?.setData('text/plain', ev.id);
  }

  onDragOver(domEvent: DragEvent, date: Date, hour: number) {
    domEvent.preventDefault();
    this.dragOverKey.set(date.toDateString() + '-' + hour);
  }

  onDragEnd() {
    this.draggingEventId.set(null);
    this.dragOverKey.set(null);
  }

  async onDrop(domEvent: DragEvent, date: Date, hour: number) {
    domEvent.preventDefault();
    this.dragOverKey.set(null);
    const evId = this.draggingEventId();
    if (!evId || !this.projectId) return;
    const ev = this.events().find(e => e.id === evId);
    if (!ev) return;
    const duration = new Date(ev.endDate).getTime() - new Date(ev.startDate).getTime();
    const newStart = new Date(date);
    newStart.setHours(hour, 0, 0, 0);
    // Soustraire l'offset de saisie pour que l'événement reste sous le curseur
    newStart.setTime(newStart.getTime() - this.dragOffsetMinutes() * 60000);
    // Snap à 15 minutes
    const m = newStart.getMinutes();
    newStart.setMinutes(Math.round(m / 15) * 15, 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);
    try {
      const updated = await this.agendaService.updateEvent(this.projectId, evId, {
        startDate: newStart.toISOString(),
        endDate: newEnd.toISOString(),
      });
      this.events.update(list => list.map(e => e.id === evId ? updated : e));
    } finally {
      this.draggingEventId.set(null);
    }
  }

  onYearCellClick(year: number, month: number, dayIndex: number) {
    const date = new Date(year, month, dayIndex + 1);
    this.onCellClick(date, null);
  }

  // ── Popup ──

  onCellClick(date: Date, hour: number | null) {
    this.editingEvent.set(null);
    const f = this.defaultForm();
    const startDate = new Date(date);
    if (hour !== null) startDate.setHours(hour, 0, 0, 0);
    const endDate = new Date(startDate);
    if (hour !== null) endDate.setHours(hour + 1, 0, 0, 0);
    else { endDate.setDate(endDate.getDate() + 1); f.allDay = true; }
    f.startDateTime = this.toDatetimeLocal(startDate);
    f.endDateTime = this.toDatetimeLocal(endDate);
    f.startDateOnly = this.toDateOnly(startDate);
    f.endDateOnly = this.toDateOnly(endDate);
    this.form = f;
    this.showPopup.set(true);
  }

  onEventClick(ev: AgendaEvent, event: MouseEvent) {
    event.stopPropagation();
    this.editingEvent.set(ev);
    const start = new Date(ev.startDate);
    const end = new Date(ev.endDate);
    this.form = {
      title: ev.title,
      description: ev.description || '',
      allDay: ev.allDay,
      startDateTime: this.toDatetimeLocal(start),
      endDateTime: this.toDatetimeLocal(end),
      startDateOnly: this.toDateOnly(start),
      endDateOnly: this.toDateOnly(end),
      color: ev.color || AGENDA_COLORS[0].value,
    };
    this.showPopup.set(true);
  }

  closePopup() {
    this.showPopup.set(false);
    this.editingEvent.set(null);
  }

  async saveEvent() {
    if (!this.projectId || !this.form.title.trim()) return;
    this.saving.set(true);
    try {
      const startDate = this.form.allDay
        ? new Date(this.form.startDateOnly + 'T00:00:00').toISOString()
        : new Date(this.form.startDateTime).toISOString();
      const endDate = this.form.allDay
        ? new Date(this.form.endDateOnly + 'T23:59:59').toISOString()
        : new Date(this.form.endDateTime).toISOString();
      const payload = {
        title: this.form.title.trim(),
        description: this.form.description,
        allDay: this.form.allDay,
        startDate,
        endDate,
        color: this.form.color,
      };
      const editing = this.editingEvent();
      if (editing) {
        const updated = await this.agendaService.updateEvent(this.projectId, editing.id, payload);
        this.events.update(list => list.map(e => e.id === editing.id ? updated : e));
      } else {
        const created = await this.agendaService.createEvent(this.projectId, payload);
        this.events.update(list => [...list, created]);
      }
      this.closePopup();
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete() {
    const ev = this.editingEvent();
    if (!ev || !this.projectId) return;
    await this.agendaService.deleteEvent(this.projectId, ev.id);
    this.events.update(list => list.filter(e => e.id !== ev.id));
    this.closePopup();
  }

  // ── Utilitaires ──

  private getWeekMonday(date: Date): Date {
    const d = new Date(date);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
  }

  private toDatetimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private toDateOnly(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }

  private defaultForm() {
    return {
      title: '',
      description: '',
      allDay: false,
      startDateTime: '',
      endDateTime: '',
      startDateOnly: '',
      endDateOnly: '',
      color: AGENDA_COLORS[0].value,
    };
  }
}
