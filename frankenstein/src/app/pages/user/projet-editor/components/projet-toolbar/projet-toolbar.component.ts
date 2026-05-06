import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../../../core/services/auth.service';

@Component({
  selector: 'app-projet-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projet-toolbar.component.html',
})
export class ProjetToolbarComponent {
  @Input() projectTitle = '';
  @Input() isDirty = false;
  @Output() save = new EventEmitter<void>();

  constructor(private router: Router, private auth: AuthService) {}

  goHome() { this.router.navigate(['/home']); }
  goProjets() { this.router.navigate(['/projets']); }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/']);
  }
}
