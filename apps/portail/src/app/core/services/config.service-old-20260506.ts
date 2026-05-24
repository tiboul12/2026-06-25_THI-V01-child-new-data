import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

const DATA_API = environment.apiDataUrl;
const EXECUTOR_API = environment.apiExecutorUrl;

export interface ProviderOption {
  value: string;      // 'claude-cli', 'claude-api', 'gemini-cli', 'gemini-api'
  baseId: string;     // 'claude', 'gemini'
  label: string;
  type: 'cli' | 'api';
}

export interface CliConfigState {
  activeProviders: string[];
  enabledModels: {
    claude: string[];
    gemini: string[];
  };
  modelsList: {
    claude: { value: string; label: string; costInput?: number; costOutput?: number }[];
    gemini: { value: string; label: string; costInput?: number; costOutput?: number }[];
  };
  availableProviders: ProviderOption[];
  executorAvailable: boolean;
  headerSelection: { provider: string; model: string };
}

@Injectable({ providedIn: 'root' })
export class ConfigService {

  // Feature flags — widgets flottants activés via /api/config/keys
  ticketsEnabled       = signal<boolean>(false);
  recetteWidgetEnabled = signal<boolean>(false);
  tchatIaEnabled       = signal<boolean>(false);
  actionsEnabled       = signal<boolean>(false);

  setTicketsEnabled(val: boolean)       { this.ticketsEnabled.set(val); }
  setRecetteWidgetEnabled(val: boolean) { this.recetteWidgetEnabled.set(val); }
  setTchatIaEnabled(val: boolean)       { this.tchatIaEnabled.set(val); }
  setActionsEnabled(val: boolean)       { this.actionsEnabled.set(val); }

  // Visibilité du menu Historique des actions dans la nav principale
  woActionHistoryNavEnabled = signal<boolean>(false);

  // Affichage zone IA dans le header principal
  headerIaVisible = signal<boolean>(false);

  saveHeaderIaVisible(val: boolean) {
    this.headerIaVisible.set(val);
    this.http.post(`${DATA_API}/api/config/keys`, { headerIaVisible: val })
      .subscribe({ error: () => console.warn('[ConfigService] Failed to save headerIaVisible') });
  }

  // Visibilité des onglets dans le volet Outils Externes
  tchatTabEnabled   = signal<boolean>(true);
  recetteTabEnabled = signal<boolean>(true);
  ticketsTabEnabled = signal<boolean>(true);
  actionsTabEnabled = signal<boolean>(true);
  iaLogsTabEnabled  = signal<boolean>(true);
  historyTabEnabled = signal<boolean>(true);

  // Outil actif (volet exclusif)
  activeTool = signal<'none' | 'tchat' | 'recette' | 'tickets' | 'actions'>('none');
  setActiveTool(tool: 'none' | 'tchat' | 'recette' | 'tickets' | 'actions') {
    this.activeTool.set(tool);
  }

  // Projet actif (pour la sécurité IA)
  currentProjectId = signal<string | null>(null);
  setCurrentProjectId(id: string | null) {
    this.currentProjectId.set(id);
  }

  // Config CLI (providers, modèles)
  cliConfig = signal<CliConfigState>({
    activeProviders: [],
    enabledModels: { claude: [], gemini: [] },
    modelsList: { claude: [], gemini: [] },
    availableProviders: [],
    executorAvailable: false,
    headerSelection: { provider: '', model: '' }
  });

  constructor(private http: HttpClient) {
    this.loadCliConfig();
    this.refreshModels();
  }

  loadCliConfig() {
    this.http.get<any>(`${DATA_API}/api/config/keys`).subscribe({
      next: keys => {
        let activeCliProviders: string[] = [];

        if (keys.cliConfig && Array.isArray(keys.cliConfig.activeProviders)) {
          activeCliProviders = keys.cliConfig.activeProviders;
        } else {
          if (keys.claude?.active) activeCliProviders.push('claude');
          if (keys.gemini?.active) activeCliProviders.push('gemini');
        }

        const availableProviders: ProviderOption[] = [];
        if (activeCliProviders.includes('claude')) {
          availableProviders.push({ value: 'claude-cli', baseId: 'claude', label: 'Claude Code (Anthropic)', type: 'cli' });
        }
        if (activeCliProviders.includes('gemini')) {
          availableProviders.push({ value: 'gemini-cli', baseId: 'gemini', label: 'Gemini CLI (Google)', type: 'cli' });
        }
        if (keys.claude?.active) {
          availableProviders.push({ value: 'claude-api', baseId: 'claude', label: 'Claude API Key (Anthropic)', type: 'api' });
        }
        if (keys.gemini?.active) {
          availableProviders.push({ value: 'gemini-api', baseId: 'gemini', label: 'Gemini API Key (Google)', type: 'api' });
        }

        const enabledModels = {
          claude: keys.cliConfig?.enabledModels?.claude || [],
          gemini: keys.cliConfig?.enabledModels?.gemini || []
        };

        const headerSelection = {
          provider: keys.cliConfig?.headerSelection?.provider || '',
          model: keys.cliConfig?.headerSelection?.model || ''
        };

        // Zone IA header
        if (keys.headerIaVisible !== undefined) this.headerIaVisible.set(keys.headerIaVisible);

        // Widgets flottants
        if (keys.enabledTools !== undefined) {
          this.ticketsEnabled.set(keys.enabledTools.tickets || false);
          this.recetteWidgetEnabled.set(keys.enabledTools.recette || false);
          this.tchatIaEnabled.set(keys.enabledTools.tchat || false);
          this.actionsEnabled.set(keys.enabledTools.actions || false);
        } else {
          if (keys.ticketsEnabled !== undefined)       this.ticketsEnabled.set(keys.ticketsEnabled);
          if (keys.recetteWidgetEnabled !== undefined) this.recetteWidgetEnabled.set(keys.recetteWidgetEnabled);
        }

        // Visibilité menu Historique des actions
        if (keys.navItems?.woActionHistory !== undefined) {
          this.woActionHistoryNavEnabled.set(keys.navItems.woActionHistory);
        }

        // Visibilité des onglets dans le volet
        if (keys.enabledTabs !== undefined) {
          if (keys.enabledTabs.tchat   !== undefined) this.tchatTabEnabled.set(keys.enabledTabs.tchat);
          if (keys.enabledTabs.recette !== undefined) this.recetteTabEnabled.set(keys.enabledTabs.recette);
          if (keys.enabledTabs.tickets !== undefined) this.ticketsTabEnabled.set(keys.enabledTabs.tickets);
          if (keys.enabledTabs.actions !== undefined) this.actionsTabEnabled.set(keys.enabledTabs.actions);
          if (keys.enabledTabs.iaLogs  !== undefined) this.iaLogsTabEnabled.set(keys.enabledTabs.iaLogs);
          if (keys.enabledTabs.history !== undefined) this.historyTabEnabled.set(keys.enabledTabs.history);
        }

        this.cliConfig.update(state => ({
          ...state,
          activeProviders: activeCliProviders,
          enabledModels,
          availableProviders,
          headerSelection
        }));
      },
      error: () => console.warn('[ConfigService] Cannot load config keys from data server')
    });
  }

  refreshModels() {
    this.http.get<any>(`${EXECUTOR_API}/api/cli-status`).subscribe({
      next: status => {
        this.cliConfig.update(current => ({
          ...current,
          executorAvailable: true,
          modelsList: {
            claude: status.claude?.models || [],
            gemini: status.gemini?.models || []
          }
        }));
      },
      error: () => {
        this.cliConfig.update(current => ({ ...current, executorAvailable: false, modelsList: { claude: [], gemini: [] } }));
        console.warn('[ConfigService] Executor server not available');
      }
    });
  }

  updateLocalCliConfig(activeProviders: string[], enabledModels: { claude: string[], gemini: string[] }) {
    this.cliConfig.update(state => ({ ...state, activeProviders, enabledModels }));
  }

  saveEnabledTools(tools: { tickets?: boolean; recette?: boolean; tchat?: boolean; actions?: boolean }) {
    if (tools.tickets !== undefined) this.ticketsEnabled.set(tools.tickets);
    if (tools.recette !== undefined) this.recetteWidgetEnabled.set(tools.recette);
    if (tools.tchat   !== undefined) this.tchatIaEnabled.set(tools.tchat);
    if (tools.actions !== undefined) this.actionsEnabled.set(tools.actions);
    this.http.post(`${DATA_API}/api/config/keys`, {
      enabledTools: {
        tickets: this.ticketsEnabled(),
        recette: this.recetteWidgetEnabled(),
        tchat:   this.tchatIaEnabled(),
        actions: this.actionsEnabled()
      }
    }).subscribe({ error: () => console.warn('[ConfigService] Failed to save enabled tools') });
  }

  saveEnabledTabs(tabs: { tchat?: boolean; recette?: boolean; tickets?: boolean; actions?: boolean; iaLogs?: boolean; history?: boolean }) {
    if (tabs.tchat   !== undefined) this.tchatTabEnabled.set(tabs.tchat);
    if (tabs.recette !== undefined) this.recetteTabEnabled.set(tabs.recette);
    if (tabs.tickets !== undefined) this.ticketsTabEnabled.set(tabs.tickets);
    if (tabs.actions !== undefined) this.actionsTabEnabled.set(tabs.actions);
    if (tabs.iaLogs  !== undefined) this.iaLogsTabEnabled.set(tabs.iaLogs);
    if (tabs.history !== undefined) this.historyTabEnabled.set(tabs.history);
    this.http.post(`${DATA_API}/api/config/keys`, {
      enabledTabs: {
        tchat:   this.tchatTabEnabled(),
        recette: this.recetteTabEnabled(),
        tickets: this.ticketsTabEnabled(),
        actions: this.actionsTabEnabled(),
        iaLogs:  this.iaLogsTabEnabled(),
        history: this.historyTabEnabled()
      }
    }).subscribe({ error: () => console.warn('[ConfigService] Failed to save enabled tabs') });
  }

  saveNavItems(items: { woActionHistory?: boolean }) {
    if (items.woActionHistory !== undefined) this.woActionHistoryNavEnabled.set(items.woActionHistory);
    this.http.post(`${DATA_API}/api/config/keys`, {
      navItems: { woActionHistory: this.woActionHistoryNavEnabled() }
    }).subscribe({ error: () => console.warn('[ConfigService] Failed to save navItems') });
  }

  saveHeaderSelection(provider: string, model: string) {
    this.cliConfig.update(state => ({ ...state, headerSelection: { provider, model } }));
    const cfg = this.cliConfig();
    this.http.post(`${DATA_API}/api/config/keys`, {
      cliConfig: {
        activeProviders: cfg.activeProviders,
        enabledModels: cfg.enabledModels,
        headerSelection: { provider, model }
      }
    }).subscribe({ error: () => console.warn('[ConfigService] Failed to save header selection') });
  }
}
