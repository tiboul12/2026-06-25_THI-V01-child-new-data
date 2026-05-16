import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AppConfigService } from '../../../core/services/app-config.service';
import { ConfigService } from '../../../core/services/config.service';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './nav.component.html',
})
export class NavComponent {
  constructor(
    public auth: AuthService,
    public appConfig: AppConfigService,
    public configService: ConfigService
  ) {}
}
