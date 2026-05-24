import {
  ApplicationConfig,
  provideZoneChangeDetection,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { appRoutes } from './app.routes';
import { environment } from '../environments/environment';
import { authInterceptor } from '@worganic/portail-core/auth';
import { API_DATA_URL, API_EXECUTOR_URL, API_AGENT_URL, APP_BRANDING } from '@worganic/portail-core/data-access';

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
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
};
