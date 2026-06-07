import { Component, OnInit, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@worganic/portail-core/data-access';
import { WorgHelpTriggerComponent } from '../../../../shared/help/worg-help-trigger.component';
import { environment } from '../../../../../environments/environment';

const API = environment.apiDataUrl;

interface MemoSection {
  id: string;
  icon: string;
  label: string;
  color: string;
  open: boolean;
}

interface MemoCommand {
  command: string;
  description: string;
}

interface MemoMegaOutil {
  name: string;
  type: string;
  route: string;
  marker: string;
  since: string;
}

interface MemoOutil {
  name: string;
  type: string;
  icon: string;
  statut: string;
  since: string;
}

interface MemoShortcut {
  keys: string[];
  description: string;
  context?: string;
}

@Component({
  selector: 'app-admin-memo',
  standalone: true,
  imports: [CommonModule, FormsModule, WorgHelpTriggerComponent],
  templateUrl: './admin-memo.component.html',
})
export class AdminMemoComponent implements OnInit {
  @Output() helpCount = new EventEmitter<number>();

  constructor(private authService: AuthService) {}

  // ── Sections ──────────────────────────────────────────────────────────────
  sections = signal<MemoSection[]>([
    { id: 'commands',    icon: 'terminal',       label: 'Commandes Claude Code',    color: 'indigo',  open: true  },
    { id: 'mega-outils', icon: 'extension',      label: 'Méga-outils',              color: 'violet',  open: true  },
    { id: 'outils',      icon: 'build',          label: 'Outils projet',            color: 'rose',    open: true  },
    { id: 'help',        icon: 'contact_support', label: 'Aide contextuelle',        color: 'teal',    open: false },
    { id: 'shortcuts',   icon: 'keyboard',       label: 'Raccourcis clavier',       color: 'sky',     open: false },
    { id: 'archi',       icon: 'lan',            label: 'Architecture & commandes', color: 'emerald', open: false },
    { id: 'patterns',    icon: 'code_blocks',    label: 'Patterns & conventions',   color: 'amber',   open: false },
  ]);

  // ── Données statiques ─────────────────────────────────────────────────────
  commands: MemoCommand[] = [
    { command: '/nouveau-mega-outil', description: 'Crée un nouveau méga-outil complet (composants, routes, admin, SSE)' },
    { command: '/nouvel-outil',       description: 'Crée un nouvel outil projet (Edition, Tests, Code…)' },
    { command: '/code-review',        description: 'Revue de code du diff courant' },
    { command: '/verify',             description: 'Vérifie qu\'un changement fonctionne en lançant l\'app' },
    { command: '/run',                description: 'Lance l\'application et capture son état' },
    { command: '/simplify',           description: 'Analyse le code modifié et applique des simplifications' },
    { command: '/security-review',    description: 'Revue de sécurité des changements en cours' },
    { command: '/init',               description: 'Initialise ou met à jour le fichier CLAUDE.md' },
    { command: '/model',              description: 'Change le modèle Claude utilisé (Sonnet / Opus / Haiku)' },
    { command: '/fast',               description: 'Active/désactive le mode Fast (Opus rapide)' },
    { command: '/clear',              description: 'Efface le contexte de conversation courant' },
  ];

  megaOutils: MemoMegaOutil[] = [
    { name: 'Trello', type: 'trello', route: '/trello', marker: '{{TRELLO:id}}', since: '2026-06' },
  ];

  outils: MemoOutil[] = [
    { name: 'Edition', type: 'edition', icon: 'edit_note', statut: 'Actif',   since: 'Origine' },
    { name: 'Tests',   type: 'tests',   icon: 'science',   statut: 'Bientôt', since: '—' },
    { name: 'Code',    type: 'code',    icon: 'code',      statut: 'Bientôt', since: '—' },
  ];

  shortcuts: MemoShortcut[] = [
    { keys: ['Enter'],          description: 'Envoyer le prompt',              context: 'Chat Claude' },
    { keys: ['Shift', 'Enter'], description: 'Nouvelle ligne dans le prompt',  context: 'Chat Claude' },
    { keys: ['Échap'],          description: 'Annuler l\'action en cours',     context: 'Claude Code' },
    { keys: ['Ctrl', 'C'],      description: 'Interrompre la génération',      context: 'Claude Code' },
    { keys: ['↑'],              description: 'Remonter dans l\'historique',    context: 'Claude Code CLI' },
    { keys: ['!'],              description: 'Préfixe pour exécuter un shell', context: 'Claude Code' },
  ];

  archCommands = [
    { label: 'Portail (port 4202)',     cmd: 'npx nx serve portail' },
    { label: 'Projets (port 4203)',     cmd: 'npx nx serve projets' },
    { label: 'API Express (port 3001)', cmd: 'node server/server-data.js' },
    { label: 'Tout démarrer',          cmd: 'npm run start:all' },
    { label: 'Build complet',          cmd: 'npx nx run-many --target=build --projects=portail,projets --no-progress' },
    { label: 'Vérifier compilation',   cmd: 'npx nx run-many --target=build --projects=portail,projets --no-progress 2>&1 | grep -E "(ERROR|error TS|✘|Failed)"' },
  ];

  patterns = [
    { label: 'Token auth localStorage',      value: 'frankenstein_token' },
    { label: 'Token injection API',          value: 'inject(API_DATA_URL)' },
    { label: 'Token injection Executor',     value: 'inject(API_EXECUTOR_URL)' },
    { label: 'Marqueur Trello dans contenu', value: '{{TRELLO:instanceId}}' },
    { label: 'Composants réutilisables',     value: 'libs/shared/ui/src/lib/' },
    { label: 'Méga-outils partagés',         value: 'libs/shared/ui/src/lib/mega-outils/' },
    { label: 'Outils projet',               value: 'apps/projets/.../outils/' },
    { label: 'Données JSON',                value: 'data/' },
    { label: 'Fonctions testables',         value: 'tests/fonctions/' },
  ];

  // ── Section Help — état ───────────────────────────────────────────────────
  helpItems = signal<any[]>([]);
  loadingHelp = signal(false);
  helpError = signal('');
  deletingHelpId = signal<number | null>(null);

  editingHelp = signal<any | null>(null);
  editHelpId = 0;
  editHelpTitle = '';
  editHelpText = '';
  editHelpPage = '';
  savingHelp = signal(false);

  showNewHelpModal = signal(false);
  newHelpTitle = '';
  newHelpText = '';
  newHelpPage = '';
  creatingHelp = signal(false);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.loadHelp();
  }

  // ── Section toggles ───────────────────────────────────────────────────────
  toggle(sectionId: string) {
    this.sections.update(list =>
      list.map(s => s.id === sectionId ? { ...s, open: !s.open } : s)
    );
  }

  isOpen(sectionId: string): boolean {
    return this.sections().find(s => s.id === sectionId)?.open ?? false;
  }

  colorClasses(color: string): { bg: string; border: string; icon: string } {
    const map: Record<string, { bg: string; border: string; icon: string }> = {
      indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  icon: 'text-indigo-400'  },
      violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  icon: 'text-violet-400'  },
      rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    icon: 'text-rose-400'    },
      teal:    { bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    icon: 'text-teal-400'    },
      sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     icon: 'text-sky-400'     },
      emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400' },
      amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'text-amber-400'   },
    };
    return map[color] ?? map['indigo'];
  }

  // ── Help CRUD ─────────────────────────────────────────────────────────────
  async loadHelp() {
    this.loadingHelp.set(true);
    this.helpError.set('');
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API}/api/admin/help`, { headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement');
      const list = await res.json();
      this.helpItems.set(list);
      this.helpCount.emit(list.length);
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur chargement help');
    } finally {
      this.loadingHelp.set(false);
    }
  }

  openNewHelpModal() {
    this.newHelpTitle = '';
    this.newHelpText = '';
    this.newHelpPage = '';
    this.showNewHelpModal.set(true);
  }

  closeNewHelpModal() { this.showNewHelpModal.set(false); }

  async createHelp() {
    if (!this.newHelpTitle.trim() || !this.newHelpText.trim()) return;
    this.creatingHelp.set(true);
    this.helpError.set('');
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${API}/api/admin/help`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: this.newHelpTitle, text: this.newHelpText, page: this.newHelpPage })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur création');
      this.closeNewHelpModal();
      await this.loadHelp();
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur création');
    } finally {
      this.creatingHelp.set(false);
    }
  }

  openEditHelp(item: any) {
    this.editingHelp.set(item);
    this.editHelpId = item.id;
    this.editHelpTitle = item.title;
    this.editHelpText = item.text;
    this.editHelpPage = item.page || '';
  }

  closeEditHelp() { this.editingHelp.set(null); }

  async saveHelp() {
    const item = this.editingHelp();
    if (!item || !this.editHelpTitle.trim() || !this.editHelpText.trim()) return;
    this.savingHelp.set(true);
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${API}/api/admin/help/${item.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: this.editHelpTitle, text: this.editHelpText, page: this.editHelpPage, newId: this.editHelpId })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur sauvegarde');
      this.closeEditHelp();
      await this.loadHelp();
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur sauvegarde');
    } finally {
      this.savingHelp.set(false);
    }
  }

  confirmDeleteHelp(id: number) { this.deletingHelpId.set(id); }
  cancelDeleteHelp() { this.deletingHelpId.set(null); }

  async deleteHelp(id: number) {
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API}/api/admin/help/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur suppression');
      this.deletingHelpId.set(null);
      await this.loadHelp();
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur suppression');
      this.deletingHelpId.set(null);
    }
  }
}
