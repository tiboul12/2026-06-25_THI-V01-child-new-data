import { Component, Input, OnInit, signal } from '@angular/core';
import { HelpService } from './help.service';

@Component({
  selector: 'worg-help',
  standalone: true,
  template: `
    <button
      (click)="helpService.open(helpId)"
      [title]="tooltipTitle()"
      class="inline-flex items-center justify-center w-4 h-4 rounded-full
             bg-light-primary/15 dark:bg-primary/15
             text-light-primary dark:text-primary
             hover:bg-light-primary/30 dark:hover:bg-primary/30
             border border-light-primary/30 dark:border-primary/30
             transition-all align-middle ml-1 shrink-0 cursor-pointer">
      <span class="text-[9px] font-black leading-none select-none">?</span>
    </button>
  `,
})
export class WorgHelpTriggerComponent implements OnInit {
  @Input({ required: true }) helpId!: number;

  tooltipTitle = signal('Aide');

  constructor(public helpService: HelpService) {}

  async ngOnInit() {
    const title = await this.helpService.fetchTitle(this.helpId);
    if (title) this.tooltipTitle.set(title);
  }
}
