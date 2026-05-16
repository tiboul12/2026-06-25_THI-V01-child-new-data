import { ApplicationConfig, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { DbStatusService } from './core/services/db-status.service';
import { AppConfigService } from './core/services/app-config.service';
import { CHILD_ADMIN_TABS_PROVIDERS } from './child/child-admin-tabs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    provideAppInitializer(() => inject(DbStatusService).check()),
    provideAppInitializer(() => inject(AppConfigService).load()),
    ...CHILD_ADMIN_TABS_PROVIDERS
  ]
};
