import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

const API = environment.apiDataUrl;

interface ColorVar {
  key: string;
  label: string;
  description: string;
}

const COLOR_VARS: ColorVar[] = [
  { key: '--tw-primary',       label: 'Primaire',       description: 'Texte, bordures, éléments principaux' },
  { key: '--tw-secondary',     label: 'Secondaire',     description: 'Éléments secondaires, sous-titres' },
  { key: '--tw-accent',        label: 'Accent',         description: 'Boutons principaux, focus' },
  { key: '--tw-accent-dark',   label: 'Accent foncé',   description: 'Variante foncée de l\'accent' },
  { key: '--tw-accent-darker', label: 'Accent très foncé', description: 'Arrière-plans accent subtils' },
  { key: '--tw-background',    label: 'Fond',           description: 'Couleur de fond principale' },
  { key: '--tw-surface',       label: 'Surface',        description: 'Cartes, panneaux' },
  { key: '--tw-surface-light', label: 'Surface claire', description: 'Hover, éléments surélevés' },
];

const PRESETS = [
  {
    name: 'Violet', icon: 'auto_awesome',
    vars: {
      '--tw-primary': '224 170 255', '--tw-secondary': '199 125 255',
      '--tw-accent': '157 78 221', '--tw-accent-dark': '123 44 191',
      '--tw-accent-darker': '90 24 154', '--tw-background': '10 10 15',
      '--tw-surface': '18 18 26', '--tw-surface-light': '26 26 37',
    }
  },
  {
    name: 'Cyan', icon: 'water_drop',
    vars: {
      '--tw-primary': '165 243 252', '--tw-secondary': '103 232 249',
      '--tw-accent': '6 182 212', '--tw-accent-dark': '8 145 178',
      '--tw-accent-darker': '14 116 144', '--tw-background': '2 8 10',
      '--tw-surface': '6 18 22', '--tw-surface-light': '9 28 34',
    }
  },
  {
    name: 'Emerald', icon: 'eco',
    vars: {
      '--tw-primary': '167 243 208', '--tw-secondary': '110 231 183',
      '--tw-accent': '52 211 153', '--tw-accent-dark': '16 185 129',
      '--tw-accent-darker': '5 150 105', '--tw-background': '2 10 6',
      '--tw-surface': '5 20 12', '--tw-surface-light': '8 28 18',
    }
  },
  {
    name: 'Amber', icon: 'local_fire_department',
    vars: {
      '--tw-primary': '253 230 138', '--tw-secondary': '252 211 77',
      '--tw-accent': '245 158 11', '--tw-accent-dark': '217 119 6',
      '--tw-accent-darker': '180 83 9', '--tw-background': '10 8 2',
      '--tw-surface': '20 15 4', '--tw-surface-light': '28 22 6',
    }
  },
];

@Component({
  selector: 'app-admin-theme',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-theme.component.html',
})
export class AdminThemeComponent implements OnInit {
  private http = inject(HttpClient);

  saving  = signal(false);
  saved   = signal(false);
  loading = signal(true);

  readonly colorVars = COLOR_VARS;
  readonly presets   = PRESETS;

  hexValues: Record<string, string> = {};

  ngOnInit() {
    this.loadCurrentTheme();
  }

  async loadCurrentTheme() {
    this.loading.set(true);
    try {
      const theme = await firstValueFrom(this.http.get<any>(`${API}/api/child/config/theme`));
      const cssVars: Record<string, string> = theme?.cssVars ?? {};
      COLOR_VARS.forEach(cv => {
        const rgbStr = cssVars[cv.key] || getComputedStyle(document.documentElement).getPropertyValue(cv.key).trim();
        this.hexValues[cv.key] = this.rgbStrToHex(rgbStr);
      });
    } catch {
      COLOR_VARS.forEach(cv => {
        const rgbStr = getComputedStyle(document.documentElement).getPropertyValue(cv.key).trim();
        this.hexValues[cv.key] = this.rgbStrToHex(rgbStr);
      });
    } finally {
      this.loading.set(false);
    }
  }

  applyPreset(preset: typeof PRESETS[0]) {
    Object.entries(preset.vars).forEach(([k, v]) => {
      this.hexValues[k] = this.rgbStrToHex(v);
      document.documentElement.style.setProperty(k, v);
    });
  }

  onColorChange(key: string, hex: string) {
    this.hexValues[key] = hex;
    const rgb = this.hexToRgbStr(hex);
    document.documentElement.style.setProperty(key, rgb);
  }

  async save() {
    this.saving.set(true);
    this.saved.set(false);
    const cssVars: Record<string, string> = {};
    COLOR_VARS.forEach(cv => {
      cssVars[cv.key] = this.hexToRgbStr(this.hexValues[cv.key] || '#000000');
    });
    try {
      await firstValueFrom(this.http.post(`${API}/api/child/config/theme`, { cssVars }));
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } finally {
      this.saving.set(false);
    }
  }

  private hexToRgbStr(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '0 0 0';
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r} ${g} ${b}`;
  }

  private rgbStrToHex(rgb: string): string {
    const parts = rgb.trim().split(/[\s,]+/).map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return '#000000';
    return '#' + parts.slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
  }
}
