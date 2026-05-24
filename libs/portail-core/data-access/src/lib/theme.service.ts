import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeName = 'dark' | 'light' | 'pink';

const THEME_KEY = 'theme';
const THEME_CYCLE: ThemeName[] = ['dark', 'light', 'pink'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  currentTheme = new BehaviorSubject<ThemeName>('dark');

  initTheme(): void {
    const stored = localStorage.getItem(THEME_KEY) as ThemeName | null;
    const theme: ThemeName = stored && THEME_CYCLE.includes(stored) ? stored : 'dark';
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    const current = this.currentTheme.value;
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    this.applyTheme(next);
  }

  applyTheme(theme: ThemeName): void {
    this.currentTheme.next(theme);
    localStorage.setItem(THEME_KEY, theme);

    const root = document.documentElement;
    root.classList.remove('dark', 'pink');
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'pink') {
      root.classList.add('dark', 'pink');
    }
  }

  getThemeIcon(): string {
    switch (this.currentTheme.value) {
      case 'dark': return 'light_mode';
      case 'light': return 'favorite';
      case 'pink': return 'dark_mode';
    }
  }
}
