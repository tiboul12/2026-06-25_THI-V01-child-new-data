import { ApplicationConfig, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { authInterceptor } from '@worganic/portail-core/auth';
import { DbStatusService, AppConfigService, API_DATA_URL, API_EXECUTOR_URL, API_AGENT_URL, APP_BRANDING } from '@worganic/portail-core/data-access';
import { CHILD_ADMIN_TABS_PROVIDERS } from './child/child-admin-tabs';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: API_DATA_URL, useValue: environment.apiDataUrl },
    { provide: API_EXECUTOR_URL, useValue: environment.apiExecutorUrl },
    { provide: API_AGENT_URL, useValue: environment.apiAgentUrl },
    {
      provide: APP_BRANDING,
      useValue: {
        appName: environment.appName,
        copyrightHolder: environment.copyrightHolder,
        copyrightTagline: environment.copyrightTagline,
        copyrightYear: environment.copyrightYear,
      }
    },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    provideAppInitializer(() => inject(DbStatusService).check()),
    provideAppInitializer(() => inject(AppConfigService).load()),
    ...CHILD_ADMIN_TABS_PROVIDERS
  ]
};
