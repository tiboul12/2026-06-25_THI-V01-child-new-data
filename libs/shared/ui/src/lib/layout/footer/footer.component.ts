import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService, ConfigService, AppConfigService, API_DATA_URL } from '@worganic/portail-core/data-access';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './footer.component.html',
})
export class FooterComponent implements OnInit {
  @Input() onOpenTools?: () => void;
  @Input() externalBaseUrl?: string;

  private apiUrl = inject(API_DATA_URL);
  versionStatus = signal<any>(null);

  constructor(
    public auth: AuthService,
    public configService: ConfigService,
    public appConfig: AppConfigService,
  ) {}

  ngOnInit() {
    this.checkVersion();
  }

  async checkVersion() {
    try {
      const res = await fetch(`${this.apiUrl}/api/version/check`);
      if (res.ok) this.versionStatus.set(await res.json());
    } catch { /* silencieux */ }
  }

  openToolsPanel(): void {
    if (this.onOpenTools) {
      this.onOpenTools();
    }
  }

  navigateToAdmin(): void {
    if (this.externalBaseUrl) {
      window.location.href = `${this.externalBaseUrl}/admin?tab=deploiement`;
    }
  }

  get activeToolsCount(): number {
    let count = 0;
    if (this.configService.tchatIaEnabled()) count++;
    if (this.configService.ticketsEnabled()) count++;
    if (this.configService.recetteWidgetEnabled()) count++;
    if (this.configService.actionsEnabled()) count++;
    return count;
  }
}
