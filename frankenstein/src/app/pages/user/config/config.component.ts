import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfigService } from '../../../core/services/config.service';
import { WoActionHistoryService } from '../../../core/services/wo-action-history.service';
import { environment } from '../../../../environments/environment';

const API = environment.apiDataUrl;
const EXECUTOR_API = environment.apiExecutorUrl;

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './config.component.html',
  styleUrl: './config.component.scss'
})
export class ConfigComponent implements OnInit, OnDestroy {
  @Input() embeddedMode = false;

  private destroy$ = new Subject<void>();

  currentTheme: 'dark' | 'light' | 'pink' = 'dark';

  get headerIaVisible(): boolean { return this.configService.headerIaVisible(); }
  toggleHeaderIa() {
    const before = this.headerIaVisible;
    const after = !before;
    this.configService.saveHeaderIaVisible(after);
    this.woHistory.track({
      section: 'admin/config', actionType: 'toggle',
      label: `${after ? 'Activation' : 'Désactivation'} de l'affichage IA dans le header`,
      entityType: 'setting', entityId: 'headerIaVisible', entityLabel: 'Header IA',
      beforeState: { headerIaVisible: before }, afterState: { headerIaVisible: after },
      undoable: true,
      undoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { headerIaVisible: before } },
      redoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { headerIaVisible: after } }
    }).catch(() => {});
  }

  get woActionHistoryNavEnabled(): boolean { return this.configService.woActionHistoryNavEnabled(); }
  toggleWoActionHistoryNav() {
    const before = this.woActionHistoryNavEnabled;
    const after = !before;
    this.configService.saveNavItems({ woActionHistory: after });
    this.woHistory.track({
      section: 'admin/config', actionType: 'toggle',
      label: `${after ? 'Activation' : 'Désactivation'} du lien Historique d'actions dans la nav`,
      entityType: 'setting', entityId: 'woActionHistoryNav', entityLabel: 'Nav : Historique actions',
      beforeState: { enabled: before }, afterState: { enabled: after },
      undoable: true,
      undoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { navItems: { woActionHistory: before } } },
      redoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { navItems: { woActionHistory: after } } }
    }).catch(() => {});
  }

  get woActionHistoryNavEnabled(): boolean { return this.configService.woActionHistoryNavEnabled(); }
  toggleWoActionHistoryNav() {
    const before = this.woActionHistoryNavEnabled;
    this.configService.saveNavItems({ woActionHistory: !before });
    this.woHistory.track({
      section: 'admin/config', actionType: 'toggle',
      label: `${!before ? 'Activation' : 'Désactivation'} du lien Historique d'actions dans la nav`,
      entityType: 'setting', entityId: 'woActionHistoryNav', entityLabel: 'Nav : Historique actions',
      beforeState: { enabled: before }, afterState: { enabled: !before },
      undoable: false
    }).catch(() => {});
  }

  // App settings
  appVersion = '';
  ticketsEnabled = false;
  recetteWidgetEnabled = false;

  // API Keys form
  geminiKey = '';
  geminiKeyActive = false;
  claudeKey = '';
  claudeKeyActive = false;
  showGeminiKey = false;
  showClaudeKey = false;

  // Save status
  saveStatus: 'idle' | 'saving' | 'success' | 'error' = 'idle';
  saveMessage = '';

  // CLI Status (models loaded from server)
  cliStatus: {
    gemini: { installed: boolean; version: string; lastUpdated?: string; models: { value: string; label: string; costInput?: number; costOutput?: number }[] };
    claude: { installed: boolean; version: string; lastUpdated?: string; models: { value: string; label: string; costInput?: number; costOutput?: number }[] };
  } = {
    gemini: { installed: false, version: '', models: [] },
    claude: { installed: false, version: '', models: [] }
  };
  
  loadingStatus = {
    gemini: true,
    claude: true
  };
  
  cliError = false;

  // CLI Config — providers actifs par checkbox + modèles activés par checkbox
  activeProviders: string[] = [];
  enabledModels: { claude: string[]; gemini: string[] } = { claude: [], gemini: [] };

  private cliConfigLoaded = false;
  private cliStatusLoaded = false;

  constructor(private http: HttpClient, private configService: ConfigService, private woHistory: WoActionHistoryService) {}

  ngOnInit() {
    this.initTheme();
    this.loadApiKeys();
    this.loadCliStatus();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Thème ──────────────────────────────────────────────────────────────

  initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    this.currentTheme = (['dark', 'light', 'pink'].includes(saved) ? saved : 'dark') as 'dark' | 'light' | 'pink';
    this.applyTheme(this.currentTheme);
  }

  toggleTheme() {
    const cycle: ('dark' | 'light' | 'pink')[] = ['dark', 'light', 'pink'];
    const idx = cycle.indexOf(this.currentTheme);
    this.currentTheme = cycle[(idx + 1) % cycle.length];
    this.applyTheme(this.currentTheme);
  }

  private applyTheme(theme: 'dark' | 'light' | 'pink') {
    const root = document.documentElement;
    root.classList.remove('dark', 'pink');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'pink') { root.classList.add('dark', 'pink'); }
    localStorage.setItem('theme', theme);
  }

  get themeIcon(): string {
    if (this.currentTheme === 'dark') return 'dark_mode';
    if (this.currentTheme === 'light') return 'light_mode';
    return 'favorite';
  }

  // ── Chargement ─────────────────────────────────────────────────────────

  loadApiKeys() {
    this.http.get<any>(`${API}/api/config/keys`).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        if (data.gemini) {
          this.geminiKey = data.gemini.key || '';
          this.geminiKeyActive = data.gemini.active || false;
        }
        if (data.claude) {
          this.claudeKey = data.claude.key || '';
          this.claudeKeyActive = data.claude.active || false;
        }
        // Charger les paramètres généraux
        this.appVersion = data.appVersion || '';
        this.ticketsEnabled = data.ticketsEnabled || false;
        this.recetteWidgetEnabled = data.recetteWidgetEnabled || false;

        // Charger la config CLI
        if (data.cliConfig) {
          this.activeProviders = data.cliConfig.activeProviders || [];
          this.enabledModels = {
            claude: data.cliConfig.enabledModels?.claude || [],
            gemini: data.cliConfig.enabledModels?.gemini || []
          };
        }
        this.cliConfigLoaded = true;
        this.reconcileEnabledModels();
      },
      error: () => {
        this.cliConfigLoaded = true;
        this.reconcileEnabledModels();
      }
    });
  }

  private sortModelsByCost(models: any[]): any[] {
    return models.sort((a, b) => {
      const costA = (a.costInput || 0) + (a.costOutput || 0);
      const costB = (b.costInput || 0) + (b.costOutput || 0);
      return costB - costA; // Décroissant (plus cher en premier)
    });
  }

  loadCliStatus(provider?: 'gemini' | 'claude') {
    if (provider) {
        this.loadingStatus[provider] = true;
    } else {
        this.loadingStatus.gemini = true;
        this.loadingStatus.claude = true;
    }
    this.cliError = false;
    
    // Construit l'URL avec le paramètre provider si présent
    const providerParam = provider ? `&provider=${provider}` : '';
    
    // Étape 1 : Vérification rapide (installation uniquement) - Force refresh
    this.http.get<any>(`${EXECUTOR_API}/api/cli-check-only?force=true${providerParam}`).pipe(takeUntil(this.destroy$)).subscribe({
      next: (quickData) => {
        // Mettre à jour l'UI immédiatement avec les infos d'installation
        if (!provider || provider === 'gemini') {
            this.cliStatus.gemini.installed = quickData.gemini.installed;
            this.cliStatus.gemini.version = quickData.gemini.version;
        }
        if (!provider || provider === 'claude') {
            this.cliStatus.claude.installed = quickData.claude.installed;
            this.cliStatus.claude.version = quickData.claude.version;
        }

        // Si non installés, on arrête le loading pour celui concerné
        if ((!provider || provider === 'gemini') && !quickData.gemini.installed) this.loadingStatus.gemini = false;
        if ((!provider || provider === 'claude') && !quickData.claude.installed) this.loadingStatus.claude = false;

        // Étape 2 : Chargement complet (modèles, etc.)
        this.http.get<any>(`${EXECUTOR_API}/api/cli-status`).pipe(takeUntil(this.destroy$)).subscribe({
          next: (fullData) => {
            if (!provider || provider === 'gemini') {
                this.cliStatus.gemini = fullData.gemini;
                if (this.cliStatus.gemini.models) {
                    this.cliStatus.gemini.models = this.sortModelsByCost(this.cliStatus.gemini.models);
                }
                this.loadingStatus.gemini = false;
            }
            if (!provider || provider === 'claude') {
                this.cliStatus.claude = fullData.claude;
                if (this.cliStatus.claude.models) {
                    this.cliStatus.claude.models = this.sortModelsByCost(this.cliStatus.claude.models);
                }
                this.loadingStatus.claude = false;
            }
            
            this.cliStatusLoaded = true;
            this.configService.refreshModels(); // Propager les nouveaux modèles au service global
            this.reconcileEnabledModels();
          },
          error: () => {
            if (provider) this.loadingStatus[provider] = false;
            else { this.loadingStatus.gemini = false; this.loadingStatus.claude = false; }
            this.cliStatusLoaded = true;
            this.reconcileEnabledModels();
          }
        });
      },
      error: () => {
        // En cas d'erreur sur le check rapide, on tente quand même le complet
        this.http.get<any>(`${EXECUTOR_API}/api/cli-status`).pipe(takeUntil(this.destroy$)).subscribe({
          next: (data) => {
            if (!provider || provider === 'gemini') {
                this.cliStatus.gemini = data.gemini;
                if (this.cliStatus.gemini.models) {
                    this.cliStatus.gemini.models = this.sortModelsByCost(this.cliStatus.gemini.models);
                }
                this.loadingStatus.gemini = false;
            }
            if (!provider || provider === 'claude') {
                this.cliStatus.claude = data.claude;
                if (this.cliStatus.claude.models) {
                    this.cliStatus.claude.models = this.sortModelsByCost(this.cliStatus.claude.models);
                }
                this.loadingStatus.claude = false;
            }
            this.cliStatusLoaded = true;
            this.reconcileEnabledModels();
          },
          error: () => {
            if (provider) this.loadingStatus[provider] = false;
            else { this.loadingStatus.gemini = false; this.loadingStatus.claude = false; }
            this.cliError = true;
            this.cliStatusLoaded = true;
          }
        });
      }
    });
  }

  /**
   * Si enabledModels[provider] est vide (première visite), activer tous les modèles par défaut.
   * Si le CLI n'est pas installé, désactiver le provider et ses modèles.
   */
  private reconcileEnabledModels() {
    if (!this.cliConfigLoaded || !this.cliStatusLoaded) return;

    const initProvider = (provider: 'claude' | 'gemini') => {
      // Si non installé, on décoche tout
      if (!this.cliStatus[provider].installed) {
        this.activeProviders = this.activeProviders.filter(p => p !== provider);
        this.enabledModels[provider] = [];
        return;
      }

      const models = this.cliStatus[provider].models;
      if (this.enabledModels[provider].length === 0 && models.length > 0) {
        this.enabledModels[provider] = models.map(m => m.value);
      }
    };

    initProvider('claude');
    initProvider('gemini');
  }

  // ── Providers ──────────────────────────────────────────────────────────

  isProviderActive(provider: string): boolean {
    return this.activeProviders.includes(provider);
  }

  toggleProvider(provider: string) {
    if (!this.cliStatus[provider as 'claude' | 'gemini'].installed) return;
    const wasActive = this.isProviderActive(provider);
    const beforeProviders = [...this.activeProviders];
    const beforeEnabledModels = {
      claude: [...this.enabledModels.claude],
      gemini: [...this.enabledModels.gemini]
    };
    const idx = this.activeProviders.indexOf(provider);
    if (idx === -1) {
      this.activeProviders.push(provider);
      const models = this.cliStatus[provider as 'claude' | 'gemini'].models;
      this.enabledModels[provider as 'claude' | 'gemini'] = models.map(m => m.value);
    } else {
      this.activeProviders.splice(idx, 1);
      this.enabledModels[provider as 'claude' | 'gemini'] = [];
    }
    const afterProviders = [...this.activeProviders];
    const afterEnabledModels = {
      claude: [...this.enabledModels.claude],
      gemini: [...this.enabledModels.gemini]
    };
    this.saveKeys(true);
    this.woHistory.track({
      section: 'admin/config', actionType: 'toggle',
      label: `${!wasActive ? 'Activation' : 'Désactivation'} du provider ${provider}`,
      entityType: 'provider', entityId: provider,
      entityLabel: provider.charAt(0).toUpperCase() + provider.slice(1),
      beforeState: { active: wasActive }, afterState: { active: !wasActive },
      undoable: true,
      undoAction: {
        endpoint: '/api/config/keys', method: 'POST',
        payload: { cliConfig: { activeProviders: beforeProviders, enabledModels: beforeEnabledModels } }
      },
      redoAction: {
        endpoint: '/api/config/keys', method: 'POST',
        payload: { cliConfig: { activeProviders: afterProviders, enabledModels: afterEnabledModels } }
      }
    }).catch(() => {});
  }

  // ── Checkboxes modèles ─────────────────────────────────────────────────

  isModelEnabled(provider: 'claude' | 'gemini', modelValue: string): boolean {
    return this.activeProviders.includes(provider) && this.enabledModels[provider].includes(modelValue);
  }

  toggleModel(provider: 'claude' | 'gemini', modelValue: string) {
    if (!this.cliStatus[provider].installed || !this.activeProviders.includes(provider)) return;
    const wasEnabled = this.enabledModels[provider].includes(modelValue);
    const beforeEnabledModels = {
      claude: [...this.enabledModels.claude],
      gemini: [...this.enabledModels.gemini]
    };
    const list = this.enabledModels[provider];
    const idx = list.indexOf(modelValue);
    if (idx === -1) { list.push(modelValue); } else { list.splice(idx, 1); }
    const afterEnabledModels = {
      claude: [...this.enabledModels.claude],
      gemini: [...this.enabledModels.gemini]
    };
    this.saveKeys(true);
    this.woHistory.track({
      section: 'admin/config', actionType: 'toggle',
      label: `${!wasEnabled ? 'Activation' : 'Désactivation'} du modèle ${modelValue} (${provider})`,
      entityType: 'model', entityId: modelValue, entityLabel: modelValue,
      context: { provider },
      beforeState: { enabled: wasEnabled }, afterState: { enabled: !wasEnabled },
      undoable: true,
      undoAction: {
        endpoint: '/api/config/keys', method: 'POST',
        payload: { cliConfig: { activeProviders: [...this.activeProviders], enabledModels: beforeEnabledModels } }
      },
      redoAction: {
        endpoint: '/api/config/keys', method: 'POST',
        payload: { cliConfig: { activeProviders: [...this.activeProviders], enabledModels: afterEnabledModels } }
      }
    }).catch(() => {});
  }

  // ── Mise à jour des coûts ──────────────────────────────────────────────

  updateCosts(provider: 'gemini' | 'claude') {
    this.loadingStatus[provider] = true;
    this.http.post<any>(`${API}/api/admin/update-models-costs`, { provider }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        // Le serveur a mis à jour et rafraîchi le cache, on recharge le statut local
        this.loadCliStatus(provider);
        // On pourrait afficher un toast ici
      },
      error: () => {
        this.loadingStatus[provider] = false;
        // Erreur silencieuse ou toast
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  formatDate(dateStr?: string): string {
    if (!dateStr) return 'Jamais';
    try {
      return new Date(dateStr).toLocaleString('fr-FR', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      });
    } catch { return 'Date invalide'; }
  }

  // ── Tickets toggle ─────────────────────────────────────────────────────

  onTicketsToggle(val: boolean) {
    this.ticketsEnabled = val;
    this.configService.saveEnabledTools({ tickets: val });
    this.woHistory.track({
      section: 'admin/config', actionType: 'toggle',
      label: `${val ? 'Activation' : 'Désactivation'} du module Tickets`,
      entityType: 'tool', entityId: 'tickets', entityLabel: 'Tickets',
      beforeState: { enabled: !val }, afterState: { enabled: val },
      undoable: true,
      undoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { enabledTools: { tickets: !val } } },
      redoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { enabledTools: { tickets: val } } }
    }).catch(() => {});
  }

  // ── Recette widget toggle ───────────────────────────────────────────────

  onRecetteWidgetToggle(val: boolean) {
    this.recetteWidgetEnabled = val;
    this.configService.saveEnabledTools({ recette: val });
    this.woHistory.track({
      section: 'admin/config', actionType: 'toggle',
      label: `${val ? 'Activation' : 'Désactivation'} du widget Recette`,
      entityType: 'tool', entityId: 'recette', entityLabel: 'Widget Recette',
      beforeState: { enabled: !val }, afterState: { enabled: val },
      undoable: true,
      undoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { enabledTools: { recette: !val } } },
      redoAction: { endpoint: '/api/config/keys', method: 'POST', payload: { enabledTools: { recette: val } } }
    }).catch(() => {});
  }

  // ── Sauvegarde ─────────────────────────────────────────────────────────

  saveKeys(isAutoSave = false) {
    if (!isAutoSave) this.saveStatus = 'saving';
    const payload: any = {
      gemini: { key: this.geminiKey, active: this.geminiKeyActive },
      claude: { key: this.claudeKey, active: this.claudeKeyActive },
      cliConfig: {
        activeProviders: this.activeProviders,
        enabledModels: {
          claude: this.enabledModels.claude,
          gemini: this.enabledModels.gemini
        }
      }
    };

    // Les paramètres généraux ne sont envoyés que lors d'une sauvegarde manuelle
    if (!isAutoSave) {
      payload.appVersion = this.appVersion;
      // Outils externes — stockés en DB par utilisateur (enabledTools)
      payload.enabledTools = {
        tickets: this.ticketsEnabled,
        recette: this.recetteWidgetEnabled,
        tchat:   false,
        actions: false
      };
    }

    // Mettre à jour les signaux globaux immédiatement pour la réactivité UI
    this.configService.updateLocalCliConfig(this.activeProviders, this.enabledModels);
    if (!isAutoSave) {
      this.configService.setTicketsEnabled(this.ticketsEnabled);
      this.configService.setRecetteWidgetEnabled(this.recetteWidgetEnabled);
    }

    this.http.post<any>(`${API}/api/config/keys`, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        if (!isAutoSave) {
          this.saveStatus = 'success';
          this.saveMessage = res.message || 'Configuration sauvegardée';
          setTimeout(() => { this.saveStatus = 'idle'; }, 3000);
          this.woHistory.track({
            section: 'admin/config', actionType: 'update',
            label: 'Sauvegarde de la configuration API',
            entityType: 'apiConfig', entityId: 'keys', entityLabel: 'Clés API',
            afterState: {
              geminiActive: this.geminiKeyActive,
              claudeActive: this.claudeKeyActive,
              appVersion: this.appVersion
            },
            undoable: false
          }).catch(() => {});
        }
      },
      error: () => {
        if (!isAutoSave) {
          this.saveStatus = 'error';
          this.saveMessage = 'Erreur lors de la sauvegarde';
          setTimeout(() => { this.saveStatus = 'idle'; }, 3000);
        }
      }
    });
  }
}
