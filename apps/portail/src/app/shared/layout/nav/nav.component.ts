import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { AuthService } from '@worganic/portail-core/data-access';
import { AppConfigService } from '@worganic/portail-core/data-access';
import { ConfigService } from '@worganic/portail-core/data-access';

@Component({
    selector: 'app-nav',
    imports: [RouterModule],
    templateUrl: './nav.component.html'
})
export class NavComponent {
  constructor(
    public auth: AuthService,
    public appConfig: AppConfigService,
    public configService: ConfigService
  ) {}
}
