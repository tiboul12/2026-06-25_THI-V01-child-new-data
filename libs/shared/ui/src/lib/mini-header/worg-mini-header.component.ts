import { Component, Input, effect } from '@angular/core';
import { AuthService, ThemeService } from '@worganic/portail-core/data-access';

@Component({
  selector: 'worg-mini-header',
  standalone: true,
  imports: [],
  templateUrl: './worg-mini-header.component.html',
})
export class WorgMiniHeaderComponent {
  @Input() title = '';
  /** URL du bouton "retour" et de la redirection post-logout */
  @Input() backUrl = '/';
  @Input() backLabel = 'Retour';

  themeIcon = 'light_mode';

  constructor(public auth: AuthService, private themeService: ThemeService) {
    effect(() => {
      this.themeIcon = this.themeService.getThemeIcon();
    });
  }

  get currentUsername(): string {
    return this.auth.currentUser()?.username || '';
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
    this.themeIcon = this.themeService.getThemeIcon();
  }

  goBack(): void {
    window.location.href = this.backUrl;
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    window.location.href = this.backUrl;
  }
}
