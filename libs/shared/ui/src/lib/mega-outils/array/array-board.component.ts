import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, signal, inject, HostListener, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MegaOutilsService, ProjetCollabService, ArrayCell, ArrayGrid, ArrayCellStyle } from '@worganic/portail-core/data-access';

@Component({
  selector: 'app-array-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="array-board">
  <!-- En-tête -->
  <div class="array-board__head">
    <span class="material-symbols-outlined" style="font-size:16px;color:#a3e635">table</span>
    <span class="array-board__name">{{ boardName }}</span>
    @if (sectionName) {
      <span class="array-board__section">— {{ sectionName }}</span>
    }
    @if (!readonly) {
      <div class="array-board__actions">
        @if (deletable) {
          <button type="button" class="array-board__del" title="Supprimer ce tableau" (click)="deleteBoard.emit(instanceId)">
            <span class="material-symbols-outlined" style="font-size:14px">delete</span>
          </button>
        }
      </div>
    }
  </div>

  <!-- Grille -->
  @if (loading()) {
    <div class="array-board__loading">Chargement…</div>
  } @else if (grid()) {
    <div class="array-board__scroll-wrap">
      <div class="array-board__table-wrap">
        <table class="array-board__table" #tableEl>
          <colgroup>
            <col style="width:32px" />
            @for (w of grid()!.colWidths; track $index) {
              <col [style.width.px]="w" />
            }
            @if (!readonly) {
              <col style="width:28px" />
            }
          </colgroup>
          <!-- En-tête colonnes -->
          <thead>
            <tr>
              <th class="array-board__corner"></th>
              @for (w of grid()!.colWidths; track $index) {
                <th class="array-board__col-head" [title]="colLetter($index)"
                    (contextmenu)="openColCtxMenu($event, $index)">
                  {{ colLetter($index) }}
                  @if (!readonly) {
                    <span class="array-board__col-resize-handle" (mousedown)="startResizeCol($event, $index)"></span>
                  }
                </th>
              }
              @if (!readonly) {
                <th class="array-board__add-col" title="Ajouter une colonne" (click)="addCol()">
                  <span class="material-symbols-outlined" style="font-size:14px">add</span>
                </th>
              }
            </tr>
          </thead>
          <!-- Corps -->
          <tbody>
            @for (row of grid()!.cells; track rowIdx; let rowIdx = $index) {
              <tr [style.height.px]="grid()!.rowHeights[rowIdx] || 28">
                <td class="array-board__row-head" [title]="'' + (rowIdx + 1)"
                    (contextmenu)="openRowCtxMenu($event, rowIdx)">
                  {{ rowIdx + 1 }}
                  @if (!readonly) {
                    <span class="array-board__row-resize-handle" (mousedown)="startResizeRow($event, rowIdx)"></span>
                  }
                </td>
                @for (cell of row; track colIdx; let colIdx = $index) {
                  <td class="array-board__cell"
                      [class.array-board__cell--selected]="isSelected(rowIdx, colIdx)"
                      [class.array-board__cell--editing]="isEditing(rowIdx, colIdx)"
                      [class.array-board__cell--formula-ref]="isFormulaRef(rowIdx, colIdx)"
                      [style.background]="cell.style?.bgColor || null"
                      [style.color]="cell.style?.textColor || null"
                      [style.fontWeight]="cell.style?.bold ? 'bold' : null"
                      [style.fontStyle]="cell.style?.italic ? 'italic' : null"
                      [style.textAlign]="cell.style?.align || null"
                      (mousedown)="onCellMousedown($event, rowIdx, colIdx)"
                      (click)="selectCell(rowIdx, colIdx)"
                      (dblclick)="startEdit(rowIdx, colIdx)"
                      (contextmenu)="openCtxMenu($event, rowIdx, colIdx)"
                      (keydown)="onCellKeydown($event, rowIdx, colIdx)"
                      tabindex="0">
                    @if (isEditing(rowIdx, colIdx)) {
                      <input #cellInput
                        class="array-board__cell-input"
                        [(ngModel)]="editValue"
                        (blur)="commitEdit(rowIdx, colIdx)"
                        (input)="onEditValueChange()"
                        (keydown)="onInputKeydown($event, rowIdx, colIdx)" />
                    } @else {
                      <span class="array-board__cell-text">{{ displayValue(cell) }}</span>
                    }
                  </td>
                }
                @if (!readonly) {
                  <td class="array-board__row-del" title="Supprimer la ligne" (click)="deleteRow(rowIdx)">
                    <span class="material-symbols-outlined" style="font-size:12px">close</span>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
    <!-- Bouton + ligne -->
    @if (!readonly) {
      <div class="array-board__footer">
        <button type="button" class="array-board__add-row-btn" (click)="addRow()">
          <span class="material-symbols-outlined" style="font-size:14px">add</span> Ligne
        </button>
      </div>
    }
  }

  <!-- Menu contextuel -->
  @if (ctxMenu().visible) {
    <div class="array-board__ctx-menu"
         (click)="$event.stopPropagation()"
         [style.top.px]="ctxMenu().y"
         [style.left.px]="ctxMenu().x">

      @if (ctxMenu().target === 'cell') {
        <div class="array-board__ctx-title">Cellule {{ colLetter(ctxMenu().col) }}{{ ctxMenu().row + 1 }}</div>
        <button type="button" (click)="copyCell()"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:4px">content_copy</span>Copier</button>
        <button type="button" (click)="cutCell()"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:4px">content_cut</span>Couper</button>
        <button type="button" [class.array-board__ctx-disabled]="!clipboard()" (click)="pasteCell()"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:4px">content_paste</span>Coller</button>
        <div class="array-board__ctx-sep"></div>
        <button type="button" (click)="toggleBold()">Gras</button>
        <button type="button" (click)="toggleItalic()">Italique</button>
        <div class="array-board__ctx-sep"></div>
        <button type="button" (click)="setAlign('left')">Aligner gauche</button>
        <button type="button" (click)="setAlign('center')">Centrer</button>
        <button type="button" (click)="setAlign('right')">Aligner droite</button>
        <div class="array-board__ctx-sep"></div>
        <label class="array-board__ctx-color">Fond <input type="color" [value]="ctxCellStyle()?.bgColor || '#1e1e2e'" (change)="setBgColor($any($event.target).value)" /></label>
        <label class="array-board__ctx-color">Texte <input type="color" [value]="ctxCellStyle()?.textColor || '#ffffff'" (change)="setTextColor($any($event.target).value)" /></label>
        <div class="array-board__ctx-sep"></div>
        <button type="button" class="array-board__ctx-danger" (click)="deleteRow(ctxMenu().row)">Supprimer la ligne</button>
        <button type="button" class="array-board__ctx-danger" (click)="deleteCol(ctxMenu().col)">Supprimer la colonne</button>
      }

      @if (ctxMenu().target === 'col') {
        <div class="array-board__ctx-title">Colonne {{ colLetter(ctxMenu().col) }}</div>
        <button type="button" (click)="toggleColBold()">Gras</button>
        <button type="button" (click)="toggleColItalic()">Italique</button>
        <div class="array-board__ctx-sep"></div>
        <button type="button" (click)="setColAlign('left')">Aligner gauche</button>
        <button type="button" (click)="setColAlign('center')">Centrer</button>
        <button type="button" (click)="setColAlign('right')">Aligner droite</button>
        <div class="array-board__ctx-sep"></div>
        <label class="array-board__ctx-color">Fond <input type="color" [value]="ctxFirstColStyle()?.bgColor || '#1e1e2e'" (change)="applyColBgColor($any($event.target).value)" /></label>
        <label class="array-board__ctx-color">Texte <input type="color" [value]="ctxFirstColStyle()?.textColor || '#ffffff'" (change)="applyColTextColor($any($event.target).value)" /></label>
        <div class="array-board__ctx-sep"></div>
        <button type="button" class="array-board__ctx-danger" (click)="deleteCol(ctxMenu().col)">Supprimer la colonne</button>
      }

      @if (ctxMenu().target === 'row') {
        <div class="array-board__ctx-title">Ligne {{ ctxMenu().row + 1 }}</div>
        <button type="button" (click)="toggleRowBold()">Gras</button>
        <button type="button" (click)="toggleRowItalic()">Italique</button>
        <div class="array-board__ctx-sep"></div>
        <button type="button" (click)="setRowAlign('left')">Aligner gauche</button>
        <button type="button" (click)="setRowAlign('center')">Centrer</button>
        <button type="button" (click)="setRowAlign('right')">Aligner droite</button>
        <div class="array-board__ctx-sep"></div>
        <label class="array-board__ctx-color">Fond <input type="color" [value]="ctxFirstRowStyle()?.bgColor || '#1e1e2e'" (change)="applyRowBgColor($any($event.target).value)" /></label>
        <label class="array-board__ctx-color">Texte <input type="color" [value]="ctxFirstRowStyle()?.textColor || '#ffffff'" (change)="applyRowTextColor($any($event.target).value)" /></label>
        <div class="array-board__ctx-sep"></div>
        <button type="button" class="array-board__ctx-danger" (click)="deleteRow(ctxMenu().row)">Supprimer la ligne</button>
      }

      <button type="button" (click)="closeCtxMenu()">Fermer</button>
    </div>
  }
</div>
  `,
  styles: [`
:host { display: block; }
.array-board { background: var(--surface, #1e1e2e); border-radius: 8px; overflow: hidden; font-size: 12px; }
.array-board__head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(255,255,255,.04); border-bottom: 1px solid rgba(255,255,255,.08); }
.array-board__name { font-weight: 600; color: #a3e635; font-size: 13px; }
.array-board__section { color: rgba(255,255,255,.4); font-size: 11px; }
.array-board__actions { margin-left: auto; display: flex; gap: 4px; }
.array-board__del { background: transparent; border: none; cursor: pointer; color: rgba(255,255,255,.4); padding: 2px 4px; border-radius: 4px; display: flex; align-items: center; }
.array-board__del:hover { color: #f87171; background: rgba(248,113,113,.12); }
.array-board__loading { padding: 24px; text-align: center; color: rgba(255,255,255,.4); }
.array-board__scroll-wrap { overflow-x: auto; max-height: 400px; overflow-y: auto; }
.array-board__table-wrap { min-width: 100%; }
.array-board__table { border-collapse: collapse; table-layout: fixed; }
.array-board__corner { width: 32px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
.array-board__col-head { position: relative; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); text-align: center; font-weight: 600; color: rgba(255,255,255,.6); padding: 4px 2px; user-select: none; }
.array-board__col-resize-handle { position: absolute; top: 0; right: 0; width: 4px; height: 100%; cursor: col-resize; background: transparent; }
.array-board__col-resize-handle:hover { background: rgba(163,230,53,.4); }
.array-board__add-col { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); cursor: pointer; text-align: center; color: rgba(255,255,255,.4); }
.array-board__add-col:hover { background: rgba(163,230,53,.1); color: #a3e635; }
.array-board__row-head { position: relative; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); text-align: center; font-weight: 600; color: rgba(255,255,255,.6); padding: 2px 4px; width: 32px; user-select: none; }
.array-board__row-resize-handle { position: absolute; bottom: 0; left: 0; width: 100%; height: 4px; cursor: row-resize; background: transparent; }
.array-board__row-resize-handle:hover { background: rgba(163,230,53,.4); }
.array-board__cell { border: 1px solid rgba(255,255,255,.08); padding: 2px 6px; cursor: default; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: rgba(255,255,255,.85); }
.array-board__cell:focus { outline: none; }
.array-board__cell--selected { box-shadow: inset 0 0 0 2px #a3e635; }
.array-board__cell--editing { padding: 0; }
.array-board__cell--formula-ref { box-shadow: inset 0 0 0 2px #60a5fa; background: rgba(96,165,250,.12) !important; }
.array-board__cell-input { width: 100%; height: 100%; background: rgba(163,230,53,.1); border: none; outline: 2px solid #a3e635; color: #fff; padding: 2px 6px; font-size: 12px; font-family: inherit; }
.array-board__cell-text { display: block; overflow: hidden; text-overflow: ellipsis; }
.array-board__row-del { border: 1px solid rgba(255,255,255,.08); width: 28px; text-align: center; cursor: pointer; color: rgba(255,255,255,.25); }
.array-board__row-del:hover { color: #f87171; background: rgba(248,113,113,.1); }
.array-board__footer { padding: 6px 8px; border-top: 1px solid rgba(255,255,255,.08); }
.array-board__add-row-btn { display: flex; align-items: center; gap: 4px; background: transparent; border: 1px solid rgba(255,255,255,.12); border-radius: 4px; color: rgba(255,255,255,.5); padding: 3px 8px; cursor: pointer; font-size: 11px; }
.array-board__add-row-btn:hover { border-color: #a3e635; color: #a3e635; background: rgba(163,230,53,.06); }
.array-board__ctx-menu { position: fixed; background: #1e1e2e; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 6px; z-index: 9999; min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
.array-board__ctx-menu button { display: block; width: 100%; text-align: left; background: none; border: none; color: rgba(255,255,255,.8); padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.array-board__ctx-menu button:hover { background: rgba(255,255,255,.08); }
.array-board__ctx-sep { height: 1px; background: rgba(255,255,255,.08); margin: 4px 0; }
.array-board__ctx-title { padding: 5px 8px 3px; font-size: 11px; font-weight: 600; color: rgba(255,255,255,.4); text-transform: uppercase; letter-spacing: .05em; }
.array-board__ctx-color { display: flex; align-items: center; gap: 8px; padding: 4px 8px; color: rgba(255,255,255,.7); font-size: 12px; cursor: pointer; }
.array-board__ctx-color input[type=color] { width: 24px; height: 20px; border: none; background: none; cursor: pointer; padding: 0; }
.array-board__ctx-danger { color: #f87171 !important; }
.array-board__ctx-disabled { opacity: .35; pointer-events: none; }
.array-board__col-head { cursor: context-menu; }
.array-board__row-head { cursor: context-menu; }
  `],
})
export class ArrayBoardComponent implements OnInit, OnDestroy {
  @Input() instanceId = '';
  @Input() boardName = 'Tableau';
  @Input() sectionName = '';
  @Input() deletable = false;
  @Input() readonly = false;

  @Output() deleteBoard  = new EventEmitter<string>();
  @Output() gridChanged  = new EventEmitter<ArrayGrid>();

  @ViewChild('cellInput') cellInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('tableEl')   tableRef?: ElementRef<HTMLTableElement>;

  private svc    = inject(MegaOutilsService);
  private collab = inject(ProjetCollabService);
  private cdr    = inject(ChangeDetectorRef);
  private arraySub?: Subscription;
  private hasInitialized = false;

  grid    = signal<ArrayGrid | null>(null);
  loading = signal(true);

  selectedCell  = signal<{ row: number; col: number } | null>(null);
  editingCell   = signal<{ row: number; col: number } | null>(null);
  editValue = '';
  // Cellules visuellement surlignées pendant la construction d'une formule
  formulaRefs   = signal<Set<string>>(new Set());

  ctxMenu    = signal<{ visible: boolean; row: number; col: number; x: number; y: number; target: 'cell' | 'row' | 'col' }>({ visible: false, row: 0, col: 0, x: 0, y: 0, target: 'cell' });
  clipboard  = signal<{ cell: ArrayCell; isCut: boolean; srcRow: number; srcCol: number } | null>(null);

  ctxCellStyle() {
    const ctx = this.ctxMenu();
    const g = this.grid();
    if (!ctx.visible || !g) return null;
    return g.cells[ctx.row]?.[ctx.col]?.style ?? null;
  }

  ctxFirstRowStyle() {
    const ctx = this.ctxMenu();
    const g = this.grid();
    if (!g) return null;
    return g.cells[ctx.row]?.[0]?.style ?? null;
  }

  ctxFirstColStyle() {
    const ctx = this.ctxMenu();
    const g = this.grid();
    if (!g) return null;
    return g.cells[0]?.[ctx.col]?.style ?? null;
  }

  async ngOnInit() {
    await this.loadGrid();
    this.arraySub = this.collab.arrayUpdate$.subscribe(evt => {
      if (evt.instanceId === this.instanceId) this.loadGrid();
    });
  }

  ngOnDestroy() {
    this.arraySub?.unsubscribe();
  }

  async loadGrid() {
    if (!this.instanceId) return;
    try {
      const g = await this.svc.getArrayGrid(this.instanceId);
      const fresh = this.recomputeAllFormulas(g);
      this.grid.set(fresh);
      if (this.hasInitialized) this.gridChanged.emit(fresh);
    } finally {
      this.loading.set(false);
      this.hasInitialized = true;
    }
    this.cdr.markForCheck();
  }

  /** Recalcule toutes les cellules formule de la grille (sans appel serveur). */
  private recomputeAllFormulas(grid: ArrayGrid): ArrayGrid {
    // Deux passes pour supporter les formules qui référencent d'autres formules
    let cells = grid.cells;
    for (let pass = 0; pass < 2; pass++) {
      cells = cells.map(row => row.map(cell => {
        if (!cell.value?.startsWith('=')) return cell;
        return { ...cell, computed: String(this.evaluate(cell.value, cells)) };
      }));
    }
    return { ...grid, cells };
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  colLetter(index: number): string {
    let s = '';
    let n = index;
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
  }

  isSelected(row: number, col: number): boolean {
    const s = this.selectedCell();
    return !!s && s.row === row && s.col === col;
  }

  isEditing(row: number, col: number): boolean {
    const e = this.editingCell();
    return !!e && e.row === row && e.col === col;
  }

  isFormulaRef(row: number, col: number): boolean {
    return this.formulaRefs().has(`${row}:${col}`);
  }

  get formulaBuilding(): boolean {
    return this.editingCell() !== null && this.editValue.startsWith('=');
  }

  displayValue(cell: ArrayCell): string {
    if (cell.value?.startsWith('=')) return cell.computed ?? cell.value;
    return cell.value ?? '';
  }

  private refreshFormulaRefs() {
    if (!this.formulaBuilding) { this.formulaRefs.set(new Set()); return; }
    const refs = new Set<string>();
    const re = /\b([A-Z]+)(\d+)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.editValue)) !== null) {
      const col = m[1].toUpperCase().split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const row = parseInt(m[2], 10) - 1;
      refs.add(`${row}:${col}`);
    }
    this.formulaRefs.set(refs);
  }

  // Mousedown sur cellule : empêche le blur de l'input en mode formule
  onCellMousedown(e: MouseEvent, row: number, col: number) {
    if (this.formulaBuilding && !this.isEditing(row, col)) {
      e.preventDefault();
    }
  }

  selectCell(row: number, col: number) {
    if (this.readonly) return;
    this.closeCtxMenu();
    const editing = this.editingCell();

    // Mode construction de formule : cliquer une autre cellule insère la référence
    if (editing && this.formulaBuilding && !this.isEditing(row, col)) {
      const ref = this.colLetter(col) + (row + 1);
      const input = this.cellInputRef?.nativeElement;
      if (input) {
        const start = input.selectionStart ?? this.editValue.length;
        const end   = input.selectionEnd   ?? this.editValue.length;
        this.editValue = this.editValue.slice(0, start) + ref + this.editValue.slice(end);
        setTimeout(() => {
          input.focus();
          const pos = start + ref.length;
          input.setSelectionRange(pos, pos);
        }, 0);
      } else {
        this.editValue += ref;
      }
      this.refreshFormulaRefs();
      return;
    }

    // Cas normal
    if (editing && (editing.row !== row || editing.col !== col)) {
      this.formulaRefs.set(new Set());
      this.commitEdit(editing.row, editing.col);
    }
    this.selectedCell.set({ row, col });
  }

  startEdit(row: number, col: number) {
    if (this.readonly) return;
    const g = this.grid();
    if (!g) return;
    this.selectedCell.set({ row, col });
    this.editValue = g.cells[row]?.[col]?.value ?? '';
    this.editingCell.set({ row, col });
    this.refreshFormulaRefs();
    setTimeout(() => {
      const input = this.cellInputRef?.nativeElement;
      if (input) { input.focus(); input.select(); }
    }, 0);
  }

  onEditValueChange() {
    this.refreshFormulaRefs();
  }

  async commitEdit(row: number, col: number) {
    const g = this.grid();
    if (!g) return;
    this.editingCell.set(null);
    this.formulaRefs.set(new Set());
    const oldVal = g.cells[row]?.[col]?.value ?? '';
    if (this.editValue === oldVal) return;
    const cell: ArrayCell = { ...g.cells[row][col], value: this.editValue };
    if (this.editValue.startsWith('=')) {
      cell.computed = String(this.evaluate(this.editValue, g.cells));
    } else {
      delete cell.computed;
    }
    try {
      const updated = await this.svc.updateArrayCell(this.instanceId, row, col, cell);
      // Recalcule toutes les formules qui dépendent de la cellule modifiée
      const recomputed = this.recomputeAllFormulas(updated);
      this.grid.set(recomputed);
      this.gridChanged.emit(recomputed);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  onCellKeydown(e: KeyboardEvent, row: number, col: number) {
    const g = this.grid();
    if (!g) return;
    if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); this.startEdit(row, col); return; }
    if (!this.formulaBuilding) {
      if (e.key === 'ArrowRight') { this.selectedCell.set({ row, col: Math.min(col + 1, g.colCount - 1) }); return; }
      if (e.key === 'ArrowLeft')  { this.selectedCell.set({ row, col: Math.max(col - 1, 0) }); return; }
      if (e.key === 'ArrowDown')  { this.selectedCell.set({ row: Math.min(row + 1, g.rowCount - 1), col }); return; }
      if (e.key === 'ArrowUp')    { this.selectedCell.set({ row: Math.max(row - 1, 0), col }); return; }
    }
  }

  onInputKeydown(e: KeyboardEvent, row: number, col: number) {
    const g = this.grid();
    if (!g) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.editingCell.set(null);
      this.formulaRefs.set(new Set());
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // empêche le bubble vers onCellKeydown qui rappellerait startEdit
      this.commitEdit(row, col).then(() => {
        const nextRow = Math.min(row + 1, g.rowCount - 1);
        this.selectedCell.set({ row: nextRow, col });
      });
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.commitEdit(row, col).then(() => {
        const nextCol = e.shiftKey ? Math.max(col - 1, 0) : Math.min(col + 1, g.colCount - 1);
        this.selectedCell.set({ row, col: nextCol });
      });
    }
  }

  // ── Mutations ───────────────────────────────────────────────────────────────

  async addRow() {
    try {
      const g = await this.svc.addArrayRow(this.instanceId);
      this.grid.set(this.recomputeAllFormulas(g));
      this.gridChanged.emit(this.grid()!);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  async addCol() {
    try {
      const g = await this.svc.addArrayCol(this.instanceId);
      this.grid.set(this.recomputeAllFormulas(g));
      this.gridChanged.emit(this.grid()!);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  async deleteRow(row: number) {
    this.closeCtxMenu();
    const g = this.grid();
    if (!g || g.rowCount <= 1) return;
    try {
      const updated = await this.svc.deleteArrayRow(this.instanceId, row);
      this.grid.set(this.recomputeAllFormulas(updated));
      this.gridChanged.emit(this.grid()!);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  async deleteCol(col: number) {
    this.closeCtxMenu();
    const g = this.grid();
    if (!g || g.colCount <= 1) return;
    try {
      const updated = await this.svc.deleteArrayCol(this.instanceId, col);
      this.grid.set(this.recomputeAllFormulas(updated));
      this.gridChanged.emit(this.grid()!);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  // ── Resize colonnes / lignes ────────────────────────────────────────────────

  private resizeState: { kind: 'col' | 'row'; index: number; startSize: number; startPos: number } | null = null;

  startResizeCol(e: MouseEvent, col: number) {
    if (this.readonly) return;
    e.preventDefault();
    e.stopPropagation();
    const g = this.grid();
    if (!g) return;
    this.resizeState = { kind: 'col', index: col, startSize: g.colWidths[col] || 100, startPos: e.clientX };
  }

  startResizeRow(e: MouseEvent, row: number) {
    if (this.readonly) return;
    e.preventDefault();
    e.stopPropagation();
    const g = this.grid();
    if (!g) return;
    this.resizeState = { kind: 'row', index: row, startSize: g.rowHeights[row] || 28, startPos: e.clientY };
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    if (!this.resizeState) return;
    const g = this.grid();
    if (!g) return;
    const delta = this.resizeState.kind === 'col' ? e.clientX - this.resizeState.startPos : e.clientY - this.resizeState.startPos;
    const newSize = Math.max(40, this.resizeState.startSize + delta);
    const updated = { ...g };
    if (this.resizeState.kind === 'col') {
      updated.colWidths = [...g.colWidths];
      updated.colWidths[this.resizeState.index] = newSize;
    } else {
      updated.rowHeights = [...g.rowHeights];
      updated.rowHeights[this.resizeState.index] = newSize;
    }
    this.grid.set(updated);
    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup')
  async onMouseUp() {
    if (!this.resizeState) return;
    const g = this.grid();
    this.resizeState = null;
    if (!g) return;
    try {
      const updated = await this.svc.updateArrayGrid(this.instanceId, g);
      const recomputed = this.recomputeAllFormulas(updated);
      this.grid.set(recomputed);
      this.gridChanged.emit(recomputed);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  // ── Menu contextuel ─────────────────────────────────────────────────────────

  openCtxMenu(e: MouseEvent, row: number, col: number) {
    if (this.readonly) return;
    e.preventDefault();
    this.selectedCell.set({ row, col });
    this.ctxMenu.set({ visible: true, row, col, x: e.clientX, y: e.clientY, target: 'cell' });
  }

  openColCtxMenu(e: MouseEvent, col: number) {
    if (this.readonly) return;
    e.preventDefault();
    this.ctxMenu.set({ visible: true, row: 0, col, x: e.clientX, y: e.clientY, target: 'col' });
  }

  openRowCtxMenu(e: MouseEvent, row: number) {
    if (this.readonly) return;
    e.preventDefault();
    this.ctxMenu.set({ visible: true, row, col: 0, x: e.clientX, y: e.clientY, target: 'row' });
  }

  closeCtxMenu() { this.ctxMenu.update(m => ({ ...m, visible: false })); }

  @HostListener('document:click')
  onDocClick() { this.closeCtxMenu(); }

  private async updateCellStyle(row: number, col: number, patch: Partial<ArrayCellStyle>) {
    const g = this.grid();
    if (!g) return;
    const cell = g.cells[row]?.[col];
    if (!cell) return;
    const updated: ArrayCell = { ...cell, style: { ...(cell.style || {}), ...patch } };
    try {
      const newGrid = await this.svc.updateArrayCell(this.instanceId, row, col, updated);
      const recomputed = this.recomputeAllFormulas(newGrid);
      this.grid.set(recomputed);
      this.gridChanged.emit(recomputed);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  private async updateGridBatch(cells: ArrayCell[][]) {
    const g = this.grid();
    if (!g) return;
    try {
      const updated = await this.svc.updateArrayGrid(this.instanceId, { ...g, cells });
      const recomputed = this.recomputeAllFormulas(updated);
      this.grid.set(recomputed);
      this.gridChanged.emit(recomputed);
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  toggleBold() {
    const ctx = this.ctxMenu();
    this.closeCtxMenu();
    const g = this.grid();
    const style = g?.cells[ctx.row]?.[ctx.col]?.style;
    this.updateCellStyle(ctx.row, ctx.col, { bold: !style?.bold });
  }

  toggleItalic() {
    const ctx = this.ctxMenu();
    this.closeCtxMenu();
    const g = this.grid();
    const style = g?.cells[ctx.row]?.[ctx.col]?.style;
    this.updateCellStyle(ctx.row, ctx.col, { italic: !style?.italic });
  }

  setAlign(align: 'left' | 'center' | 'right') {
    const ctx = this.ctxMenu();
    this.closeCtxMenu();
    this.updateCellStyle(ctx.row, ctx.col, { align });
  }

  setBgColor(color: string) {
    const ctx = this.ctxMenu();
    this.closeCtxMenu();
    this.updateCellStyle(ctx.row, ctx.col, { bgColor: color });
  }

  setTextColor(color: string) {
    const ctx = this.ctxMenu();
    this.closeCtxMenu();
    this.updateCellStyle(ctx.row, ctx.col, { textColor: color });
  }

  private applyToRow(row: number, patch: Partial<ArrayCellStyle>) {
    const g = this.grid();
    if (!g) return;
    const cells = g.cells.map((r, ri) =>
      ri === row ? r.map(c => ({ ...c, style: { ...(c.style || {}), ...patch } })) : r
    );
    this.updateGridBatch(cells);
  }

  private applyToCol(col: number, patch: Partial<ArrayCellStyle>) {
    const g = this.grid();
    if (!g) return;
    const cells = g.cells.map(r =>
      r.map((c, ci) => ci === col ? { ...c, style: { ...(c.style || {}), ...patch } } : c)
    );
    this.updateGridBatch(cells);
  }

  applyRowBgColor(color: string)   { const ctx = this.ctxMenu(); this.closeCtxMenu(); this.applyToRow(ctx.row, { bgColor: color }); }
  applyRowTextColor(color: string) { const ctx = this.ctxMenu(); this.closeCtxMenu(); this.applyToRow(ctx.row, { textColor: color }); }
  applyColBgColor(color: string)   { const ctx = this.ctxMenu(); this.closeCtxMenu(); this.applyToCol(ctx.col, { bgColor: color }); }
  applyColTextColor(color: string) { const ctx = this.ctxMenu(); this.closeCtxMenu(); this.applyToCol(ctx.col, { textColor: color }); }

  toggleRowBold() {
    const ctx = this.ctxMenu(); this.closeCtxMenu();
    const g = this.grid(); if (!g) return;
    const allBold = (g.cells[ctx.row] || []).every(c => c.style?.bold);
    this.applyToRow(ctx.row, { bold: !allBold });
  }

  toggleRowItalic() {
    const ctx = this.ctxMenu(); this.closeCtxMenu();
    const g = this.grid(); if (!g) return;
    const allItalic = (g.cells[ctx.row] || []).every(c => c.style?.italic);
    this.applyToRow(ctx.row, { italic: !allItalic });
  }

  setRowAlign(align: 'left' | 'center' | 'right') {
    const ctx = this.ctxMenu(); this.closeCtxMenu();
    this.applyToRow(ctx.row, { align });
  }

  toggleColBold() {
    const ctx = this.ctxMenu(); this.closeCtxMenu();
    const g = this.grid(); if (!g) return;
    const allBold = g.cells.every(r => r[ctx.col]?.style?.bold);
    this.applyToCol(ctx.col, { bold: !allBold });
  }

  toggleColItalic() {
    const ctx = this.ctxMenu(); this.closeCtxMenu();
    const g = this.grid(); if (!g) return;
    const allItalic = g.cells.every(r => r[ctx.col]?.style?.italic);
    this.applyToCol(ctx.col, { italic: !allItalic });
  }

  setColAlign(align: 'left' | 'center' | 'right') {
    const ctx = this.ctxMenu(); this.closeCtxMenu();
    this.applyToCol(ctx.col, { align });
  }

  // ── Presse-papier ───────────────────────────────────────────────────────────

  copyCell() {
    const ctx = this.ctxMenu();
    const g = this.grid();
    const cell = g?.cells[ctx.row]?.[ctx.col];
    if (!cell) return;
    this.clipboard.set({ cell: { ...cell, style: cell.style ? { ...cell.style } : undefined }, isCut: false, srcRow: ctx.row, srcCol: ctx.col });
    this.closeCtxMenu();
  }

  cutCell() {
    const ctx = this.ctxMenu();
    const g = this.grid();
    const cell = g?.cells[ctx.row]?.[ctx.col];
    if (!cell) return;
    this.clipboard.set({ cell: { ...cell, style: cell.style ? { ...cell.style } : undefined }, isCut: true, srcRow: ctx.row, srcCol: ctx.col });
    this.closeCtxMenu();
  }

  async pasteCell() {
    const clip = this.clipboard();
    const ctx = this.ctxMenu();
    if (!clip) return;
    this.closeCtxMenu();
    const g = this.grid();
    if (!g) return;
    const targetCell: ArrayCell = { ...clip.cell };
    if (targetCell.value?.startsWith('=')) {
      targetCell.computed = String(this.evaluate(targetCell.value, g.cells));
    }
    try {
      const updated = await this.svc.updateArrayCell(this.instanceId, ctx.row, ctx.col, targetCell);
      if (clip.isCut) {
        const cleared = await this.svc.updateArrayCell(this.instanceId, clip.srcRow, clip.srcCol, { value: '' });
        const recomputed = this.recomputeAllFormulas(cleared);
        this.grid.set(recomputed);
        this.gridChanged.emit(recomputed);
        this.clipboard.set(null);
      } else {
        const recomputed = this.recomputeAllFormulas(updated);
        this.grid.set(recomputed);
        this.gridChanged.emit(recomputed);
      }
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown', ['$event'])
  onDocKeydown(e: KeyboardEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    if (this.editingCell()) return;
    const sel = this.selectedCell();
    if (!sel) return;
    if (e.key === 'c') { e.preventDefault(); this.copyCellAt(sel.row, sel.col); }
    if (e.key === 'x') { e.preventDefault(); this.cutCellAt(sel.row, sel.col); }
    if (e.key === 'v') { e.preventDefault(); this.pasteCellAt(sel.row, sel.col); }
  }

  private copyCellAt(row: number, col: number) {
    const g = this.grid();
    const cell = g?.cells[row]?.[col];
    if (!cell) return;
    this.clipboard.set({ cell: { ...cell, style: cell.style ? { ...cell.style } : undefined }, isCut: false, srcRow: row, srcCol: col });
  }

  private cutCellAt(row: number, col: number) {
    const g = this.grid();
    const cell = g?.cells[row]?.[col];
    if (!cell) return;
    this.clipboard.set({ cell: { ...cell, style: cell.style ? { ...cell.style } : undefined }, isCut: true, srcRow: row, srcCol: col });
  }

  private async pasteCellAt(row: number, col: number) {
    const clip = this.clipboard();
    if (!clip) return;
    const g = this.grid();
    if (!g) return;
    const targetCell: ArrayCell = { ...clip.cell };
    if (targetCell.value?.startsWith('=')) {
      targetCell.computed = String(this.evaluate(targetCell.value, g.cells));
    }
    try {
      const updated = await this.svc.updateArrayCell(this.instanceId, row, col, targetCell);
      if (clip.isCut) {
        const cleared = await this.svc.updateArrayCell(this.instanceId, clip.srcRow, clip.srcCol, { value: '' });
        this.grid.set(this.recomputeAllFormulas(cleared));
        this.gridChanged.emit(this.grid()!);
        this.clipboard.set(null);
      } else {
        this.grid.set(this.recomputeAllFormulas(updated));
        this.gridChanged.emit(this.grid()!);
      }
    } catch { /* ignore */ }
    this.cdr.markForCheck();
  }

  // ── Évaluateur de formules ──────────────────────────────────────────────────

  evaluate(formula: string, cells: ArrayCell[][]): string {
    try {
      const expr = formula.slice(1).trim();
      return String(this.evalExpr(expr, cells));
    } catch {
      return '#ERR';
    }
  }

  private evalExpr(expr: string, cells: ArrayCell[][]): number | string {
    // Fonctions SUM, AVG, COUNT, MAX, MIN
    const fnMatch = /^(SUM|AVG|COUNT|MAX|MIN)\(([^)]+)\)$/i.exec(expr.trim());
    if (fnMatch) {
      const fn = fnMatch[1].toUpperCase();
      const vals = this.resolveRange(fnMatch[2].trim(), cells);
      const nums = vals.map(Number).filter(n => !isNaN(n));
      if (fn === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (fn === 'AVG') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (fn === 'COUNT') return nums.length;
      if (fn === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (fn === 'MIN') return nums.length ? Math.min(...nums) : 0;
    }

    // Référence simple A1
    const refMatch = /^([A-Z]+)(\d+)$/i.exec(expr.trim());
    if (refMatch) return this.resolveCellValue(refMatch[1], parseInt(refMatch[2], 10) - 1, cells);

    // Arithmétique : remplace les refs puis évalue avec parseur maison (sans eval/Function)
    const withRefs = expr.replace(/\b([A-Z]+)(\d+)\b/gi, (_m, col, row) =>
      String(this.resolveCellValue(col, parseInt(row, 10) - 1, cells))
    );
    return this.parseArith(withRefs.trim());
  }

  /** Évaluateur arithmétique sans eval : +, -, *, / avec parenthèses. */
  private parseArith(expr: string): number {
    const tokens: string[] = [];
    let i = 0;
    while (i < expr.length) {
      if (expr[i] === ' ') { i++; continue; }
      if ('+-*/()'.includes(expr[i])) { tokens.push(expr[i++]); continue; }
      if (/[\d.]/.test(expr[i])) {
        let num = '';
        while (i < expr.length && /[\d.]/.test(expr[i])) num += expr[i++];
        tokens.push(num);
      } else { i++; }
    }
    let pos = 0;
    const peek = () => tokens[pos] ?? '';
    const consume = () => tokens[pos++];
    const parseExpr = (): number => {
      let left = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = consume();
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    };
    const parseTerm = (): number => {
      let left = parseFactor();
      while (peek() === '*' || peek() === '/') {
        const op = consume();
        const right = parseFactor();
        left = op === '*' ? left * right : right !== 0 ? left / right : 0;
      }
      return left;
    };
    const parseFactor = (): number => {
      if (peek() === '(') { consume(); const v = parseExpr(); consume(); return v; }
      if (peek() === '-') { consume(); return -parseFactor(); }
      const t = consume();
      return isNaN(Number(t)) ? 0 : Number(t);
    };
    try { const r = parseExpr(); return isFinite(r) ? Math.round(r * 1e10) / 1e10 : 0; }
    catch { return 0; }
  }

  private resolveCellValue(colLetters: string, row: number, cells: ArrayCell[][]): number | string {
    const col = colLetters.toUpperCase().split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const cell = cells[row]?.[col];
    if (!cell) return 0;
    if (cell.value?.startsWith('=')) return Number(cell.computed ?? 0);
    return isNaN(Number(cell.value)) ? cell.value : Number(cell.value);
  }

  private resolveRange(range: string, cells: ArrayCell[][]): (number | string)[] {
    const rangeMatch = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(range.trim());
    if (!rangeMatch) {
      // Peut être une ref simple
      const ref = /^([A-Z]+)(\d+)$/i.exec(range.trim());
      if (ref) return [this.resolveCellValue(ref[1], parseInt(ref[2], 10) - 1, cells)];
      return [];
    }
    const c1 = rangeMatch[1].toUpperCase().split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const r1 = parseInt(rangeMatch[2], 10) - 1;
    const c2 = rangeMatch[3].toUpperCase().split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const r2 = parseInt(rangeMatch[4], 10) - 1;
    const vals: (number | string)[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        vals.push(this.resolveCellValue(String.fromCharCode(65 + c), r, cells));
      }
    }
    return vals;
  }

  // ── Utilitaires export ──────────────────────────────────────────────────────

  toMarkdownTable(): string {
    const g = this.grid();
    if (!g || !g.cells.length) return '';
    const rows = g.cells.map(row =>
      '| ' + row.map(c => this.displayValue(c).replace(/\|/g, '\\|')).join(' | ') + ' |'
    );
    const sep = '| ' + Array(g.colCount).fill('---').join(' | ') + ' |';
    return [rows[0], sep, ...rows.slice(1)].join('\n');
  }

  toCsv(): string {
    const g = this.grid();
    if (!g || !g.cells.length) return '';
    return g.cells.map(row =>
      row.map(c => {
        const v = this.displayValue(c);
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\n');
  }
}
