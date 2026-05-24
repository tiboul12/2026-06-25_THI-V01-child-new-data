import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AdminUsersComponent } from './tabs/admin-users/admin-users.component';
import { AdminDeploymentsComponent } from './tabs/admin-deployments/admin-deployments.component';
import { AdminHelpComponent } from './tabs/admin-help/admin-help.component';
import { AdminThemeComponent } from './tabs/admin-theme/admin-theme.component';
import { ConfigComponent } from '../user/config/config.component';
import { AdminTabsRegistryService, AdminTabDef } from '../../core/services/admin-tabs-registry.service';

const BASE_ADMIN_TABS: AdminTabDef[] = [
  { id: 'users',       label: 'Utilisateurs', icon: 'group',         component: AdminUsersComponent,       order: 1 },
  { id: 'deploiement', label: 'Déploiement',  icon: 'rocket_launch', component: AdminDeploymentsComponent, order: 2 },
  { id: 'help',        label: 'Help',         icon: 'help',          component: AdminHelpComponent,        order: 3 },
  { id: 'config',      label: 'Config',       icon: 'settings',      component: ConfigComponent,           order: 4 },
  { id: 'theme',       label: 'Thème',        icon: 'palette',       component: AdminThemeComponent,       order: 5 },
];

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, NgComponentOutlet, AdminUsersComponent, AdminDeploymentsComponent, AdminHelpComponent, AdminThemeComponent, ConfigComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  readonly tabsRegistry = inject(AdminTabsRegistryService);

  activeTab    = signal<string>('users');
  usersCount   = signal(0);
  helpCount    = signal(0);
  versionStatus = signal<any>(null);
  helpEditId   = signal<number | null>(null);

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const user = this.authService.currentUser();
    if (!user || user.role !== 'admin') {
      this.router.navigate(['/home']);
      return;
    }

    this.tabsRegistry.registerBase(BASE_ADMIN_TABS);

    const params = this.route.snapshot.queryParamMap;
    const tab = params.get('tab') || 'projets';
    const editId = params.get('editId');

    this.activeTab.set(tab);
    if (editId) this.helpEditId.set(+editId);

    if (!params.get('tab')) {
      this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
    }
  }

  setTab(tab: string) {
    this.activeTab.set(tab);
    this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }

  getBadge(tabId: string): number | null {
    if (tabId === 'users') return this.usersCount() > 0 ? this.usersCount() : null;
    if (tabId === 'help')  return this.helpCount()  > 0 ? this.helpCount()  : null;
    return null;
  }

  getAlert(tabId: string): boolean {
    if (tabId === 'deploiement' && this.versionStatus()) {
      const vs = this.versionStatus();
      return vs.mode === 'child' ? (!vs.child?.upToDate || !vs.base?.upToDate) : !vs.upToDate;
    }
    return false;
  }
}
