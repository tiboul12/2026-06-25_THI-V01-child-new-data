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
  @Output() close = new EventEmitter<void>();

  diffPairs: DiffPair[] = [];
  hasContent = false;
  leftLineCount = 0;
  rightLineCount = 0;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['entry']) this.buildDiff();
  }

  private buildDiff() {
    let rawBefore = this.entry?.beforeState ?? null;
    let rawAfter  = this.entry?.afterState  ?? null;
    // MySQL peut renvoyer les colonnes JSON comme strings avant JSON.parse côté serveur
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

