import { Component } from '@angular/core';
import { WoToolsAdminComponent } from '../../../../tools/wo/wo-tools-admin/wo-tools-admin.component';

@Component({
  selector: 'app-admin-tools',
  standalone: true,
  imports: [WoToolsAdminComponent],
  templateUrl: './admin-tools.component.html',
})
export class AdminToolsComponent {}
