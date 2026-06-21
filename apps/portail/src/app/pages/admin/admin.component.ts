import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '@worganic/portail-core/data-access';
import { AdminUsersComponent } from './tabs/admin-users/admin-users.component';
import { AdminDeploymentsComponent } from './tabs/admin-deployments/admin-deployments.component';
import { AdminThemeComponent } from './tabs/admin-theme/admin-theme.component';
import { ConfigComponent } from '../user/config/config.component';
import { AdminMegaOutilsComponent } from './tabs/admin-mega-outils/admin-mega-outils.component';
import { AdminMemoComponent } from './tabs/admin-memo/admin-memo.component';
import { AdminTabsRegistryService, AdminTabDef } from '@worganic/portail-core/data-access';

const BASE_ADMIN_TABS: AdminTabDef[] = [
  { id: 'users',        label: 'Utilisateurs', icon: 'group',         component: AdminUsersComponent,       order: 1 },
  { id: 'deploiement',  label: 'Déploiement',  icon: 'rocket_launch', component: AdminDeploymentsComponent, order: 2 },
  { id: 'config',       label: 'Config',       icon: 'settings',      component: ConfigComponent,           order: 3 },
  { id: 'theme',        label: 'Thème',        icon: 'palette',       component: AdminThemeComponent,       order: 4 },
  { id: 'mega-outils',  label: 'Méga-outils',  icon: 'extension',     component: AdminMegaOutilsComponent,  order: 5 },
  { id: 'memo',         label: 'Mémo',         icon: 'menu_book',     component: AdminMemoComponent,        order: 6 },
];

@Component({
    selector: 'app-admin',
    imports: [CommonModule, NgComponentOutlet, AdminUsersComponent, AdminDeploymentsComponent, AdminThemeComponent, ConfigComponent, AdminMegaOutilsComponent, AdminMemoComponent],
    templateUrl: './admin.component.html',
    styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  readonly tabsRegistry = inject(AdminTabsRegistryService);
  private readonly destroyRef = inject(DestroyRef);

  activeTab     = signal<string>('projets');
  usersCount    = signal(0);
  helpCount     = signal(0);
  versionStatus = signal<any>(null);

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

    // Redirige les anciennes URLs queryParam (/admin?tab=xxx) vers le format path (/admin/xxx)
    const qpTab = this.route.snapshot.queryParamMap.get('tab');
    if (qpTab) {
      this.router.navigate(['/admin', qpTab], { replaceUrl: true });
      return;
    }

    // Abonnement réactif aux changements de segment de route (inclut le chargement initial)
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tab = params['tab'] || 'projets';
      this.activeTab.set(tab);
      // Pas de segment → redirige vers l'onglet par défaut
      if (!params['tab']) {
        this.router.navigate(['/admin', 'projets'], { replaceUrl: true });
      }
    });
  }

  setTab(tab: string) {
    this.activeTab.set(tab);
    this.router.navigate(['/admin', tab]);
  }

  getBadge(tabId: string): number | null {
    if (tabId === 'users') return this.usersCount() > 0 ? this.usersCount() : null;
    if (tabId === 'memo')  return this.helpCount()  > 0 ? this.helpCount()  : null;
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
