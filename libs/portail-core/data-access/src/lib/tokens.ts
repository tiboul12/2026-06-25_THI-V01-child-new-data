import { InjectionToken } from '@angular/core';

export const API_DATA_URL = new InjectionToken<string>('API_DATA_URL');
export const API_EXECUTOR_URL = new InjectionToken<string>('API_EXECUTOR_URL');
export const API_AGENT_URL = new InjectionToken<string>('API_AGENT_URL');

export interface AppBranding {
  appName: string;
  copyrightHolder: string;
  copyrightTagline: string;
  copyrightYear: number;
}

export const APP_BRANDING = new InjectionToken<AppBranding>('APP_BRANDING');
