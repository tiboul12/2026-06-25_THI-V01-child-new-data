import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_DATA_URL, APP_BRANDING } from './tokens';

export interface NavItem {
  route: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

export interface LandingConfig {
  heroBadge?: string;
  heroTitleLine1?: string;
  heroTitleHighlight?: string;
  heroTitleLine2?: string;
  heroSubtitle?: string;
  ctaTitle?: string;
  ctaSubtitle?: string;
}

export interface HomeConfig {
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  primaryButtonLabel?: string;
  primaryButtonRoute?: string;
  primaryButtonIcon?: string;
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private apiUrl = inject(API_DATA_URL);
  private branding = inject(APP_BRANDING);

  appName        = signal(this.branding.appName);
  appTagline     = signal(this.branding.copyrightTagline);
  logoIcon       = signal('rocket_launch');
  copyrightHolder = signal(this.branding.copyrightHolder);
  copyrightYear  = signal(this.branding.copyrightYear);
  copyrightTagline = signal(this.branding.copyrightTagline);

  childNavItems  = signal<NavItem[]>([]);
  landingConfig  = signal<LandingConfig>({});
  homeConfig     = signal<HomeConfig>({});

  constructor(private http: HttpClient) {}

  async load(): Promise<void> {
    const [app, theme, nav, landing, home, css] = await Promise.allSettled([
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/child/config/app`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/child/config/theme`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/child/config/nav`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/child/config/landing`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/child/config/home`)),
      firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/child/css`)),
    ]);

    if (app.status === 'fulfilled' && app.value) {
      const a = app.value;
      if (a.appName)         this.appName.set(a.appName);
      if (a.appTagline)      this.appTagline.set(a.appTagline);
      if (a.logoIcon)        this.logoIcon.set(a.logoIcon);
      if (a.copyrightHolder) this.copyrightHolder.set(a.copyrightHolder);
      if (a.copyrightYear)   this.copyrightYear.set(a.copyrightYear);
      if (a.copyrightTagline) this.copyrightTagline.set(a.copyrightTagline);
    }

    if (theme.status === 'fulfilled' && theme.value) {
      if (theme.value.cssVars) {
        const vars = theme.value.cssVars as Record<string, string>;
        Object.entries(vars).forEach(([k, v]) => {
          document.documentElement.style.setProperty(k, v);
        });
      }
      if (theme.value.styleSettings) {
        this.applyStyleSettings(theme.value.styleSettings);
      }
    }

    if (nav.status === 'fulfilled' && Array.isArray(nav.value?.items)) {
      this.childNavItems.set(nav.value.items);
    }

    if (landing.status === 'fulfilled' && landing.value) {
      this.landingConfig.set(landing.value);
    }

    if (home.status === 'fulfilled' && home.value) {
      this.homeConfig.set(home.value);
    }

    if (css.status === 'fulfilled' && css.value?.customCSS) {
      this.injectCustomCss(css.value.customCSS);
    }
  }

  private applyStyleSettings(settings: Record<string, any>) {
    const unitMap: Record<string, string> = {
      'card-radius': 'px', 'card-border-width': 'px',
      'h-weight': '', 'h-letter-spacing': 'em/100', 'input-radius': 'px',
    };
    Object.entries(settings).forEach(([key, val]) => {
      const unit = unitMap[key] ?? '';
      const cssVal = unit === 'em/100' ? (Number(val) / 100) + 'em'
                   : unit === 'px'     ? val + 'px'
                   : String(val);
      document.documentElement.style.setProperty('--' + key, cssVal);
    });
  }

  private injectCustomCss(css: string) {
    let el = document.getElementById('worganic-custom-css') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'worganic-custom-css';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }
}
