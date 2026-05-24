import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@worganic/portail-core/data-access';
import { AppConfigService } from '@worganic/portail-core/data-access';
import { navigateToProjets } from '../../../shared/utils/navigate-to-projets';

@Component({
    selector: 'app-home',
    imports: [],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss'
})
export class HomeComponent {
  constructor(private router: Router, public auth: AuthService, public appConfig: AppConfigService) {}

  ngOnInit(): void {
    const route = this.appConfig.homeConfig().primaryButtonRoute;
    if (!route || route === '/projets') {
      navigateToProjets();
    } else {
      this.router.navigate([route]);
    }
  }

  goToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }
}
