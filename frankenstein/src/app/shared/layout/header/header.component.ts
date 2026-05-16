import { Component, OnInit, OnDestroy, HostListener, effect, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavComponent } from '../nav/nav.component';
import { Subject, interval, takeUntil } from 'rxjs';
import { ThemeService } from '../../../core/services/theme.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfigService, ProviderOption } from '../../../core/services/config.service';
import { LayoutService } from '../../../core/services/layout.service';
import { AppConfigService } from '../../../core/services/app-config.service';
import { environment } from '../../../../environments/environment';

const EXECUTOR_API = environment.apiExecutorUrl;
const API = environment.apiDataUrl;

@Component({
    selector: 'app-header',
    imports: [FormsModule, RouterModule, NavComponent],
    templateUrl: './header.component.html'
})
export class HeaderComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private scrolled = false;

  versionStatus = signal<{ upToDate: boolean; localVersion: string; latestDeployment: any } | null>(null);
  bannerCollapsed = signal(false);
  private bannerTimer?: ReturnType<typeof setTimeout>;

  // ── Thème ────────────────────────────────────────────────
  themeIcon = 'light_mode';

  // ── IA Provider / Model ──────────────────────────────────
  aiProvider = 'claude-cli';
  aiModel = 'claude-sonnet-4-6';
  activeProviders: ProviderOption[] = [];
  serverUrl = `localhost:${environment.apiDataUrl.split(':').pop()}`;
  private headerSelectionLoaded = false;

  private allClaudeModels: { value: string; label: string; costInput?: number; costOutput?: number }[] = [
    { value: 'claude-opus-4-6',                label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6',              label: 'Claude Sonnet 4.6' },
    { value: 'claude-sonnet-4-5-20250929',     label: 'Claude Sonnet 4.5' },
    { value: 'claude-3-7-sonnet-latest',       label: 'Claude 3.7 Sonnet' },
    { value: 'claude-3-5-sonnet-latest',       label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-latest',        label: 'Claude 3.5 Haiku' },
  ];
  private allGeminiModels: { value: string; label: string; costInput?: number; costOutput?: number }[] = [
    { value: 'gemini-2.5-pro-preview',  label: 'Gemini 2.5 Pro (Preview)' },
    { value: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash' }
  ];

  claudeModels = [...this.allClaudeModels];
  geminiModels = [...this.allGeminiModels];

  constructor(
    private themeService: ThemeService,
    public auth: AuthService,
    public configService: ConfigService,
    public layoutService: LayoutService,
    public appConfig: AppConfigService,
    private router: Router
  ) {
    // Sync thème icon
    effect(() => {
      this.themeIcon = this.themeService.getThemeIcon();
    });

    // Sync providers depuis ConfigService
    effect(() => {
      const cfg = this.configService.cliConfig();
      this.activeProviders = cfg.availableProviders.length > 0
        ? cfg.availableProviders
        : [{ value: 'claude-cli', baseId: 'claude', label: 'Claude Code (Anthropic)', type: 'cli' }];

      // Source complète : executor si disponible, sinon fallback local
      const sourceClaude = cfg.modelsList.claude.length > 0 ? cfg.modelsList.claude : this.allClaudeModels;
      const sourceGemini = cfg.modelsList.gemini.length > 0 ? cfg.modelsList.gemini : this.allGeminiModels;

      // Filtrer par enabledModels (cochés en config)
      this.claudeModels = cfg.enabledModels.claude.length > 0
        ? sourceClaude.filter(m => cfg.enabledModels.claude.includes(m.value))
        : sourceClaude;
      this.geminiModels = cfg.enabledModels.gemini.length > 0
        ? sourceGemini.filter(m => cfg.enabledModels.gemini.includes(m.value))
        : sourceGemini;

      // Restaurer le choix sauvegardé (une seule fois, quand les données arrivent)
      if (!this.headerSelectionLoaded && cfg.headerSelection.provider) {
        this.aiProvider = cfg.headerSelection.provider;
        this.aiModel = cfg.headerSelection.model;
        this.headerSelectionLoaded = true;
      }

      // Si le modèle sélectionné n'est plus dans la liste filtrée, prendre le premier disponible
      const currentList = this.aiProvider.split('-')[0] === 'claude' ? this.claudeModels : this.geminiModels;
      if (currentList.length > 0 && !currentList.find(m => m.value === this.aiModel)) {
        this.aiModel = currentList[0].value;
      }
    });
  }

  ngOnInit(): void {
    this.themeIcon = this.themeService.getThemeIcon();
    this.updateExpanded(); // header étendu par défaut (pas scrollé)
    this.checkVersion();

    // Auto-refresh executor status toutes les 30s
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.configService.refreshModels());
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 10;
    this.updateExpanded();
  }

  async checkVersion(): Promise<void> {
    try {
      const res = await fetch(`${API}/api/version/check`);
      if (res.ok) {
        const data = await res.json();
        // Normaliser la réponse child (mode:'child') vers la structure attendue
        if (data.mode === 'child') {
          this.versionStatus.set({
            upToDate: data.child.upToDate && data.base.upToDate,
            localVersion: data.child.localVersion,
            latestDeployment: data.child.latestDeployment || data.base.latestDeployment
          });
        } else {
          this.versionStatus.set(data);
        }
        this.updateExpanded();
        if (!this.versionStatus()?.upToDate) {
          this.bannerCollapsed.set(false);
          this.bannerTimer = setTimeout(() => this.bannerCollapsed.set(true), 5000);
        }
      }
    } catch { /* silencieux */ }
  }

  private updateExpanded(): void {
    this.layoutService.headerExpanded.set(!this.scrolled);
  }

  formatDate(d: string): string {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return d; }
  }

  ngOnDestroy(): void {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Providers & Models ───────────────────────────────────
  get currentModels() {
    const baseId = this.aiProvider.split('-')[0];
    return baseId === 'claude' ? this.claudeModels : this.geminiModels;
  }

  get selectedModelCost(): string {
    const m = this.currentModels.find(m => m.value === this.aiModel);
    if (!m || (m.costInput == null && m.costOutput == null)) return '';
    return `$${m.costInput ?? 0} / $${m.costOutput ?? 0} per M tokens`;
  }

  onProviderChange(): void {
    const baseId = this.aiProvider.split('-')[0];
    const models = baseId === 'claude' ? this.claudeModels : this.geminiModels;
    if (models.length > 0) this.aiModel = models[0].value;
    this.configService.saveHeaderSelection(this.aiProvider, this.aiModel);
  }

  onModelChange(): void {
    this.configService.saveHeaderSelection(this.aiProvider, this.aiModel);
  }

  // ── Thème ────────────────────────────────────────────────
  toggleTheme(): void {
    this.themeService.toggleTheme();
    this.themeIcon = this.themeService.getThemeIcon();
  }

  // ── Auth ─────────────────────────────────────────────────
  get currentUsername(): string {
    return this.auth.currentUser()?.username || '';
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/']);
  }
}
