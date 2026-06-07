import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  example?: string;
}

interface MemoMegaOutil {
  name: string;
  type: string;
  route: string;
  marker: string;
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
  imports: [CommonModule],
  templateUrl: './admin-memo.component.html',
})
export class AdminMemoComponent {
  sections = signal<MemoSection[]>([
    { id: 'commands',    icon: 'terminal',       label: 'Commandes Claude Code',   color: 'indigo', open: true  },
    { id: 'mega-outils', icon: 'extension',      label: 'Méga-outils',             color: 'violet', open: true  },
    { id: 'shortcuts',   icon: 'keyboard',       label: 'Raccourcis clavier',      color: 'sky',    open: false },
    { id: 'archi',       icon: 'lan',            label: 'Architecture & commandes', color: 'emerald', open: false },
    { id: 'patterns',    icon: 'code_blocks',    label: 'Patterns & conventions',  color: 'amber',  open: false },
  ]);

  commands: MemoCommand[] = [
    { command: '/nouveau-mega-outil', description: 'Crée un nouveau méga-outil complet (composants, routes, admin, SSE)', example: '/nouveau-mega-outil' },
    { command: '/code-review',        description: 'Revue de code du diff courant', example: '/code-review ultra' },
    { command: '/verify',             description: 'Vérifie qu\'un changement fonctionne en lançant l\'app', example: '/verify' },
    { command: '/run',                description: 'Lance l\'application et capture son état', example: '/run' },
    { command: '/simplify',           description: 'Analyse le code modifié et applique des simplifications', example: '/simplify' },
    { command: '/security-review',    description: 'Revue de sécurité des changements en cours', example: '/security-review' },
    { command: '/init',               description: 'Initialise ou met à jour le fichier CLAUDE.md', example: '/init' },
    { command: '/model',              description: 'Change le modèle Claude utilisé (Sonnet / Opus / Haiku)', example: '/model' },
    { command: '/fast',               description: 'Active/désactive le mode Fast (Opus rapide)', example: '/fast' },
    { command: '/clear',              description: 'Efface le contexte de conversation courant', example: '/clear' },
  ];

  megaOutils: MemoMegaOutil[] = [
    { name: 'Trello', type: 'trello', route: '/trello', marker: '{{TRELLO:id}}', since: '2026-06' },
  ];

  shortcuts: MemoShortcut[] = [
    { keys: ['Enter'],          description: 'Envoyer le prompt',               context: 'Chat Claude' },
    { keys: ['Shift', 'Enter'], description: 'Nouvelle ligne dans le prompt',   context: 'Chat Claude' },
    { keys: ['Échap'],          description: 'Annuler l\'action en cours',      context: 'Claude Code' },
    { keys: ['Ctrl', 'C'],      description: 'Interrompre la génération',       context: 'Claude Code' },
    { keys: ['↑'],              description: 'Remonter dans l\'historique',     context: 'Claude Code CLI' },
    { keys: ['!'],              description: 'Préfixe pour exécuter un shell',  context: 'Claude Code' },
  ];

  archCommands = [
    { label: 'Portail (port 4202)',      cmd: 'npx nx serve portail' },
    { label: 'Projets (port 4203)',      cmd: 'npx nx serve projets' },
    { label: 'API Express (port 3001)',  cmd: 'node server/server-data.js' },
    { label: 'Tout démarrer',           cmd: 'npm run start:all' },
    { label: 'Build complet',           cmd: 'npx nx run-many --target=build --projects=portail,projets --no-progress' },
    { label: 'Vérifier compilation',    cmd: 'npx nx run-many --target=build --projects=portail,projets --no-progress 2>&1 | grep -E "(ERROR|error TS|✘|Failed)"' },
  ];

  patterns = [
    { label: 'Token auth localStorage',         value: 'frankenstein_token' },
    { label: 'Token injection API',             value: 'inject(API_DATA_URL)' },
    { label: 'Token injection Executor',        value: 'inject(API_EXECUTOR_URL)' },
    { label: 'Marqueur Trello dans contenu',    value: '{{TRELLO:instanceId}}' },
    { label: 'Composants réutilisables',        value: 'libs/shared/ui/src/lib/' },
    { label: 'Méga-outils partagés',            value: 'libs/shared/ui/src/lib/mega-outils/' },
    { label: 'Données JSON',                    value: 'data/' },
    { label: 'Fonctions testables',             value: 'tests/fonctions/' },
  ];

  toggle(sectionId: string) {
    this.sections.update(list =>
      list.map(s => s.id === sectionId ? { ...s, open: !s.open } : s)
    );
  }

  isOpen(sectionId: string): boolean {
    return this.sections().find(s => s.id === sectionId)?.open ?? false;
  }

  colorClasses(color: string): { bg: string; border: string; icon: string; badge: string } {
    const map: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
      indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  icon: 'text-indigo-400',  badge: 'bg-indigo-500/10 text-indigo-400' },
      violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  icon: 'text-violet-400',  badge: 'bg-violet-500/10 text-violet-400' },
      sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     icon: 'text-sky-400',     badge: 'bg-sky-500/10 text-sky-400' },
      emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400' },
      amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'text-amber-400',   badge: 'bg-amber-500/10 text-amber-400' },
    };
    return map[color] ?? map['indigo'];
  }
}
