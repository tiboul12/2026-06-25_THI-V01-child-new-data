import { Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService, AppConfigService, ConfigService, NavItem } from '@worganic/portail-core/data-access';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './nav.component.html',
})
export class NavComponent {
  /** Quand fourni (contexte projets), tous les liens portail redirigent vers cette URL de base */
  @Input() externalBaseUrl?: string;
  /** Route active à mettre en évidence en mode externe (ex: '/projets' dans l'app projets) */
  @Input() activeExternalRoute = '';
  /** Callback appelé quand l'item "Projets" est cliqué en mode portail (pour passer le token) */
  @Input() onProjetsClick?: () => void;

  constructor(
    public auth: AuthService,
    public appConfig: AppConfigService,
    public configService: ConfigService,
  ) {}

  get isExternal(): boolean {
    return !!this.externalBaseUrl;
  }

  handleExternalRoute(route: string): void {
    window.location.href = `${this.externalBaseUrl}${route}`;
  }

  handleProjetsClick(): void {
    if (this.onProjetsClick) {
      this.onProjetsClick();
    }
  }

  isProjetsRoute(item: NavItem): boolean {
    return item.route === '/projets';
  }

  isActiveExternal(route: string): boolean {
    return this.isExternal && this.activeExternalRoute === route;
  }
}
