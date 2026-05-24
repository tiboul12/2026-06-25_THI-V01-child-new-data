import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { ConfigService } from '../../../core/services/config.service';
import { AuthService } from '../../../core/services/auth.service';
import { AgentService, AgentRun } from '../../../core/services/agent.service';
import { ActionReportModalComponent } from '../../action-report-modal/action-report-modal.component';
import { environment } from '../../../../environments/environment';

const API = environment.apiDataUrl;
const EXECUTOR_API = environment.apiExecutorUrl;

@Component({
  selector: 'wo-actions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ActionReportModalComponent],
  templateUrl: './wo-actions.component.html',
  styleUrl: './wo-actions.component.scss'
})
export class WoActionsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private configService = inject(ConfigService);
  private authService = inject(AuthService);
  public agentService = inject(AgentService);

  // Actions section
  actions: any[] = [];
  editingActionId: string | null = null;
  actionForm: any = { id: '', date: '', name: '', prompt: '', user: '', priority: 'Basse', gitBranch: '', report: '', modifiedFiles: [], gitState: 'Créé' };
  
  selectedActionIds: string[] = [];
  showPromptsPopup = false;

  // Agent orchestrateur
  showActionsGuide = false;
  activeRun: AgentRun | null = null;
  agentAvailable: boolean = false;
  agentLaunching: boolean = false;
  showReportModal: boolean = false;
  reportAction: any = null;
  useGit: boolean = true;
  serverStatus: { data: boolean | null; executor: boolean | null; agent: boolean | null } = { data: null, executor: null, agent: null };
  copiedCmd: string | null = null;
  private agentPollInterval: any = null;

  // AI Configuration from ConfigService
  aiProvider = 'claude'; // Default, will be updated from config
  aiModel = ''; // Default, will be updated from config

  constructor() {
    // Initial sync with ConfigService
    this.aiProvider = this.configService.cliConfig().activeProviders?.[0] || 'claude';
  }

  ngOnInit() {
    this.loadActions();
    this.startAgentPolling();
  }

  ngOnDestroy() {
    this.stopAgentPolling();
  }

  loadActions() {
    this.http.get<any>(`${API}/api/config`).subscribe({
      next: (data) => {
        this.actions = data.actions || [];
      },
      error: (err) => console.error('Error loading actions:', err)
    });
  }

  resetActionForm() {
    this.actionForm = { id: '', date: '', name: '', prompt: '', user: '', priority: 'Basse', gitBranch: '', report: '', modifiedFiles: [], gitState: 'Créé' };
    this.editingActionId = null;
  }

  editAction(action: any) {
    this.editingActionId = action.id;
    this.actionForm = { ...action, modifiedFiles: action.modifiedFiles ? [...action.modifiedFiles] : [] };
  }

  saveAction() {
    if (!this.actionForm.name?.trim()) return;
    
    if (this.editingActionId) {
      const idx = this.actions.findIndex(a => a.id === this.editingActionId);
      if (idx !== -1) {
        this.actions[idx] = { ...this.actionForm };
      }
    } else {
      const authUser = this.authService.currentUser();
      const newAction = {
        ...this.actionForm,
        id: 'action-' + Date.now(),
        date: new Date().toISOString(),
        user: authUser ? authUser.username : 'Système'
      };
      this.actions.push(newAction);
    }
    
    this.http.post(`${API}/save-actions`, { actions: this.actions }).subscribe({
      next: () => {
        this.resetActionForm();
        this.loadActions();
      },
      error: (err) => console.error('Error saving action:', err)
    });
  }

  deleteAction(id: string) {
    if (!confirm('Are you sure you want to delete this action?')) return;
    this.actions = this.actions.filter(a => a.id !== id);
    this.http.post(`${API}/save-actions`, { actions: this.actions }).subscribe({
      next: () => {
        if (this.editingActionId === id) this.resetActionForm();
        this.loadActions();
      },
      error: (err) => console.error('Error deleting action:', err)
    });
  }

  toggleActionSelection(id: string) {
    const idx = this.selectedActionIds.indexOf(id);
    if (idx > -1) {
      this.selectedActionIds.splice(idx, 1);
    } else {
      this.selectedActionIds.push(id);
    }
  }

  toggleAllActions(event: any) {
    if (event.target.checked) {
      this.selectedActionIds = this.actions.map(a => a.id);
    } else {
      this.selectedActionIds = [];
    }
  }

  isActionSelected(id: string): boolean {
    return this.selectedActionIds.includes(id);
  }

  getSelectedPrompts(): any[] {
    return this.actions.filter(a => this.selectedActionIds.includes(a.id));
  }

  addActionFile() {
    if (!this.actionForm.modifiedFiles) this.actionForm.modifiedFiles = [];
    this.actionForm.modifiedFiles.push('');
  }

  removeActionFile(index: number) {
    if (this.actionForm.modifiedFiles) {
      this.actionForm.modifiedFiles.splice(index, 1);
    }
  }

  trackByFn(index: any, item: any) {
    return index;
  }

  // ============================================================
  // Agent orchestrateur
  // ============================================================

  startAgentPolling() {
    this.checkActiveRun();
    this.agentPollInterval = setInterval(() => this.checkActiveRun(), 3000);
  }

  stopAgentPolling() {
    if (this.agentPollInterval) {
      clearInterval(this.agentPollInterval);
      this.agentPollInterval = null;
    }
  }

  checkActiveRun() {
    this.agentService.getActiveRun().subscribe({
      next: ({ run }) => {
        this.agentAvailable = true;
        const wasRunning = this.activeRun?.status === 'running';
        this.activeRun = run;
        if (wasRunning && (!run || run.status !== 'running')) {
          this.loadActions();
        }
      },
      error: () => {
        this.agentAvailable = false;
      }
    });
  }

  launchAgent() {
    if (this.selectedActionIds.length === 0) return;

    const config = this.configService.cliConfig();
    const provider = this.aiProvider || config.activeProviders?.[0] || 'claude';
    const models = provider === 'claude' ? config.enabledModels?.claude : config.enabledModels?.gemini;
    const model = this.aiModel || models?.[0] || (provider === 'claude' ? 'claude-sonnet-4-6' : 'gemini-2.0-flash');

    this.agentLaunching = true;
    this.showPromptsPopup = false;

    this.agentService.startRun(this.selectedActionIds, provider, model, this.useGit).subscribe({
      next: (res) => {
        this.agentLaunching = false;
        this.selectedActionIds = [];
        this.activeRun = null;
        this.checkActiveRun();
        this.router.navigate(['/agent/live', res.runId]);
      },
      error: (err) => {
        this.agentLaunching = false;
        const msg = err.error?.error || err.message || 'Erreur inconnue';
        if (err.status === 409) {
          alert(`Un run est déjà en cours (${msg})`);
          this.checkActiveRun();
        } else {
          alert(`Erreur lors du lancement: ${msg}\nVérifiez que server-agent.js est démarré sur le port 3003.`);
        }
      }
    });
  }

  openLivePage() {
    if (this.activeRun) {
      this.router.navigate(['/agent/live', this.activeRun.id]);
    } else {
      const lastId = this.agentService.getLastRunId();
      if (lastId) this.router.navigate(['/agent/live', lastId]);
    }
  }

  async checkServersStatus() {
    const ping = async (url: string): Promise<boolean> => {
      try {
        await fetch(url, { signal: AbortSignal.timeout(2000), mode: 'no-cors' });
        return true;
      } catch { return false; }
    };
    this.serverStatus = { data: null, executor: null, agent: null };
    const [data, executor, agent] = await Promise.all([
      ping(`${API}/`),
      ping(`${EXECUTOR_API}/`),
      ping(`${environment.apiAgentUrl}/`)
    ]);
    this.serverStatus = { data, executor, agent };
    this.agentAvailable = agent;
  }

  toggleGuide() {
    this.showActionsGuide = !this.showActionsGuide;
    if (this.showActionsGuide) this.checkServersStatus();
  }

  copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd).then(() => {
      this.copiedCmd = cmd;
      setTimeout(() => this.copiedCmd = null, 2000);
    });
  }

  stopAgent() {
    if (!this.activeRun || !confirm('Arrêter le run en cours ?')) return;
    this.agentService.stopRun(this.activeRun.id).subscribe({
      next: () => this.checkActiveRun(),
      error: (err) => alert('Erreur: ' + err.message)
    });
  }

  stopAgentFromPopup() {
    if (!this.activeRun) return;
    this.agentService.stopRun(this.activeRun.id).subscribe({
      next: () => {
        this.showPromptsPopup = false;
        this.checkActiveRun();
      },
      error: (err) => alert('Erreur arrêt: ' + err.message)
    });
  }

  openReport(action: any) {
    this.reportAction = action;
    this.showReportModal = true;
  }

  closeReport() {
    this.showReportModal = false;
    this.reportAction = null;
  }

  isActionRunningOrQueued(action: any): boolean {
    return ['running', 'queued'].includes(action?.execution?.status);
  }

  get agentIsRunning(): boolean {
    return this.activeRun?.status === 'running';
  }

  getCurrentActionName(): string {
    if (!this.activeRun?.currentActionId) return '';
    const a = this.actions.find(ac => ac.id === this.activeRun?.currentActionId);
    return a?.name || this.activeRun.currentActionId;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '--';
    try { return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return dateStr; }
  }

  formatDateTime(dateStr: string): string {
    if (!dateStr) return '--';
    try {
      return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateStr; }
  }
}