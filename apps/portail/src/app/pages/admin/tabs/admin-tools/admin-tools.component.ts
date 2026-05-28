import { Component } from '@angular/core';
import { WoToolsAdminComponent } from '@worganic/shared/ui';

@Component({
  selector: 'app-admin-tools',
  standalone: true,
  imports: [WoToolsAdminComponent],
  templateUrl: './admin-tools.component.html',
})
export class AdminToolsComponent {}
