import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfigService } from '../../../core/services/config.service';
import { WoActionsComponent } from './wo-actions.component';

@Component({
  selector: 'wo-actions-widget',
  standalone: true,
  imports: [CommonModule, WoActionsComponent],
  templateUrl: './wo-actions-widget.component.html',
  styleUrl: './wo-actions-widget.component.scss'
})
export class WoActionsWidgetComponent {
  public configService = inject(ConfigService);
  
  showModal = false;

  toggleVisible() {
    if (this.configService.activeTool() === 'actions') {
      this.configService.setActiveTool('none');
    } else {
      this.configService.setActiveTool('actions');
    }
  }

  openAsModal() {
    this.showModal = true;
    this.configService.setActiveTool('none');
  }

  close() {
    this.configService.setActiveTool('none');
  }
}