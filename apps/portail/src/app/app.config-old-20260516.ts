import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
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
    {
      provide: APP_INITIALIZER,
      useFactory: (db: DbStatusService) => () => db.check(),
      deps: [DbStatusService],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (cfg: AppConfigService) => () => cfg.load(),
      deps: [AppConfigService],
      multi: true
    },
    ...CHILD_ADMIN_TABS_PROVIDERS
  ]
};
