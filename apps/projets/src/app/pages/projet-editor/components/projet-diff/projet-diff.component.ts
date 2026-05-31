import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CollabHistoryEntry } from '@worganic/portail-core/data-access';
import { DiffPair, computeLineDiff } from '../../utils/compute-line-diff';

export type { DiffPair };

@Component({
  selector: 'app-projet-diff',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projet-diff.component.html',
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' },
})
export class ProjetDiffComponent implements OnChanges {
  @Input() entry: CollabHistoryEntry | null = null;
  @Input() currentContent: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() applyContent = new EventEmitter<string>();

  diffPairs: DiffPair[] = [];
  hasContent = false;
  leftLineCount = 0;
  rightLineCount = 0;

  workingLines: string[] = [];
  changedLineNums = new Set<number>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['entry'] || changes['currentContent']) this.buildDiff();
  }

  private buildDiff() {
    let rawBefore = this.entry?.beforeState ?? null;
    let rawAfter  = this.entry?.afterState  ?? null;
    if (typeof rawBefore === 'string') { try { rawBefore = JSON.parse(rawBefore); } catch { rawBefore = null; } }
    if (typeof rawAfter  === 'string') { try { rawAfter  = JSON.parse(rawAfter);  } catch { rawAfter  = null; } }
    const before = (rawBefore as { content?: string } | null)?.content ?? null;
    const after  = (rawAfter  as { content?: string } | null)?.content ?? null;
    this.hasContent = before !== null || after !== null;
    if (!this.hasContent) { this.diffPairs = []; return; }
    const bLines = (before ?? '').split('\n');
    const aLines = (after ?? '').split('\n');
    this.diffPairs = computeLineDiff(bLines, aLines);
    this.leftLineCount = bLines.length;
    this.rightLineCount = aLines.length;
    this.workingLines = (this.currentContent ?? '').split('\n');
    this.changedLineNums = new Set();
  }

  applyBeforeLine(pair: DiffPair) {
    if (pair.leftNum == null) return;
    const idx = pair.leftNum - 1;
    if (idx < 0) return;
    if (this.workingLines.length <= idx) {
      while (this.workingLines.length <= idx) this.workingLines.push('');
    }
    this.workingLines = [...this.workingLines];
    this.workingLines[idx] = pair.left;
    this.changedLineNums = new Set([...this.changedLineNums, pair.leftNum]);
  }

  applyAfterLine(pair: DiffPair) {
    if (pair.rightNum == null) return;
    const targetIdx = pair.leftNum != null ? pair.leftNum - 1 : pair.rightNum - 1;
    if (targetIdx < 0) return;
    if (this.workingLines.length <= targetIdx) {
      while (this.workingLines.length <= targetIdx) this.workingLines.push('');
    }
    this.workingLines = [...this.workingLines];
    this.workingLines[targetIdx] = pair.right;
    this.changedLineNums = new Set([...this.changedLineNums, targetIdx + 1]);
  }

  applyChanges() {
    this.applyContent.emit(this.workingLines.join('\n'));
  }

  resetChanges() {
    this.workingLines = (this.currentContent ?? '').split('\n');
    this.changedLineNums = new Set();
  }

  isLineChanged(lineNum: number): boolean {
    return this.changedLineNums.has(lineNum);
  }

  formatTime(ts: string): string {
    try {
      return new Date(ts).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return ts; }
  }

  get removedCount(): number { return this.diffPairs.filter(p => p.type === 'removed').length; }
  get addedCount(): number { return this.diffPairs.filter(p => p.type === 'added').length; }
}
