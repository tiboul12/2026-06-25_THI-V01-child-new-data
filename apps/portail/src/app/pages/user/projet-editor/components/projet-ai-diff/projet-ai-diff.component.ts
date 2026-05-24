import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiffPair, computeLineDiff } from '../../utils/compute-line-diff';

@Component({
  selector: 'app-projet-ai-diff',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projet-ai-diff.component.html',
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' },
})
export class ProjetAiDiffComponent implements OnChanges {
  @Input() originalContent = '';
  @Input() proposedContent = '';

  diffPairs: DiffPair[] = [];
  leftLineCount = 0;
  rightLineCount = 0;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['originalContent'] || changes['proposedContent']) this.buildDiff();
  }

  private buildDiff() {
    const bLines = this.originalContent.split('\n');
    const aLines = this.proposedContent.split('\n');
    this.diffPairs = computeLineDiff(bLines, aLines);
    this.leftLineCount = bLines.length;
    this.rightLineCount = aLines.length;
  }

  get removedCount(): number { return this.diffPairs.filter(p => p.type === 'removed').length; }
  get addedCount(): number { return this.diffPairs.filter(p => p.type === 'added').length; }
}
