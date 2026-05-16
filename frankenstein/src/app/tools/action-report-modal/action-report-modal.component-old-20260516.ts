import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'wo-action-report-modal',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './action-report-modal.component.html'
})
export class ActionReportModalComponent {
  @Input() action: any = null;
  @Output() close = new EventEmitter<void>();

  get execution() {
    return this.action?.execution || null;
  }

  get statusClass(): string {
    switch (this.execution?.status) {
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'running': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  }

  get branchStatusLabel(): string {
    switch (this.execution?.branchStatus) {
      case 'pushed': return 'Poussée ✅';
      case 'committed': return 'Commitée';
      case 'created': return 'Créée';
      case 'none': return 'Aucune';
      default: return this.execution?.branchStatus || '--';
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '--';
    return new Date(iso).toLocaleString('fr-FR');
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}
