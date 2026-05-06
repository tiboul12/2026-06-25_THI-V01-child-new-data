import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AppConfigService } from '../../../core/services/app-config.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  constructor(private router: Router, public auth: AuthService, public appConfig: AppConfigService) {}

  goToPrimary(): void {
    const route = this.appConfig.homeConfig().primaryButtonRoute || '/projets';
    this.router.navigate([route]);
  }

  goToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }
}
