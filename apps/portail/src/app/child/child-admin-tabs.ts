import { APP_INITIALIZER, Provider } from '@angular/core';
import { AdminTabsRegistryService, AdminTabDef } from '@worganic/portail-core/data-access';
import { AdminProjetsComponent } from '../pages/admin/tabs/admin-projets/admin-projets.component';
import { AdminToolsComponent } from '../pages/admin/tabs/admin-tools/admin-tools.component';
import { AdminTestsComponent } from '../pages/admin/tabs/admin-tests/admin-tests.component';

const CHILD_ADMIN_TABS: AdminTabDef[] = [
  { id: 'projets', label: 'Projets', icon: 'article',     component: AdminProjetsComponent, order: 0  },
  { id: 'tools',   label: 'Outils',  icon: 'build',       component: AdminToolsComponent,   order: 10 },
  { id: 'tests',   label: 'Tests',   icon: 'bug_report',  component: AdminTestsComponent,   order: 11 },
];

export const CHILD_ADMIN_TABS_PROVIDERS: Provider[] = [
  {
    provide: APP_INITIALIZER,
    useFactory: (registry: AdminTabsRegistryService) => () => registry.registerChild(CHILD_ADMIN_TABS),
    deps: [AdminTabsRegistryService],
    multi: true
  }
];
