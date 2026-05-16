import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfigService } from '../../../core/services/config.service';
import { AuthService } from '../../../core/services/auth.service';
import { TchatIaComponent } from '../../tchat-ia/tchat-ia.component';

@Component({
  selector: 'wo-tchat-ia-widget',
  standalone: true,
  imports: [CommonModule, TchatIaComponent],
  templateUrl: './wo-tchat-ia-widget.component.html',
  styleUrl: './wo-tchat-ia-widget.component.scss'
})
export class WoTchatIaWidgetComponent {
  public configService = inject(ConfigService);
  public auth = inject(AuthService);
  
  showModal = false;

  toggleVisible() {
    if (this.configService.activeTool() === 'tchat') {
      this.configService.setActiveTool('none');
    } else {
      this.configService.setActiveTool('tchat');
    }
  }

  openAsModal() {
    this.showModal = true;
    this.configService.setActiveTool('none');
  }

  close() {
    this.configService.setActiveTool('none');
  }

  get currentUsername(): string {
    return this.auth.currentUser()?.username || 'Utilisateur';
  }

  tchatIaQuickPrompts = [
    'Comment utiliser la plateforme Frankenstein Junior ?',
    'Aide-moi à structurer un nouveau projet.',
    'Peux-tu analyser cette page et me suggérer des améliorations ?'
  ];
}