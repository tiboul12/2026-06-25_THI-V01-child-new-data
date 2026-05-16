import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfigService } from '../../../core/services/config.service';
import { AuthService } from '../../../core/services/auth.service';
import { WoActionsComponent } from '../wo-actions/wo-actions.component';
import { WoIaLogsComponent } from '../wo-ia-logs/wo-ia-logs.component';
import { WoHistoryComponent } from '../wo-history/wo-history.component';
import { WoToolsAdminComponent } from '../wo-tools-admin/wo-tools-admin.component';

export type Tab = 'tchat' | 'recette' | 'tickets' | 'actions' | 'ia-logs' | 'history';

interface TabConfig {
  id: Tab;
  label: string;
  icon: string;
  selector: string;
  description: string;
  hasFloatingWidget: boolean;
  color: { text: string; bg: string; border: string; subActive: string; warn: string };
  subTabs: { id: string; label: string }[];
}

@Component({
    selector: 'wo-tools-panel',
    imports: [CommonModule, WoActionsComponent, WoIaLogsComponent, WoHistoryComponent, WoToolsAdminComponent],
    templateUrl: './wo-tools-panel.component.html',
    styleUrl: './wo-tools-panel.component.scss'
})
export class WoToolsPanelComponent {
  public configService = inject(ConfigService);
  public auth = inject(AuthService);

  isOpen = false;
  adminOpen = false;
  activeTab: Tab = 'tchat';
  iaLogsPopupOpen = false;
  historyPopupOpen = false;

  visibleTabs = computed(() => {
    const s = this.configService;
    return this.tabsConfig.filter(t => {
      switch (t.id) {
        case 'tchat':   return s.tchatTabEnabled();
        case 'recette': return s.recetteTabEnabled();
        case 'tickets': return s.ticketsTabEnabled();
        case 'actions': return s.actionsTabEnabled();
        case 'ia-logs': return s.iaLogsTabEnabled();
        case 'history': return s.historyTabEnabled();
        default: return true;
      }
    });
  });

  subTabs: Record<Tab, string> = {
    'tchat':   'presentation',
    'recette': 'presentation',
    'tickets': 'presentation',
    'actions': 'presentation',
    'ia-logs': 'outil',
    'history': 'outil',
  };

  readonly tabsConfig: TabConfig[] = [
    {
      id: 'tchat', label: 'Tchat IA', icon: 'smart_toy', hasFloatingWidget: true,
      selector: '<wo-tchat-ia>',
      description: 'Chat IA standalone avec streaming SSE. Toutes les options sont configurables via @Input().',
      color: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', subActive: 'bg-violet-500/15 text-violet-300', warn: 'border-violet-500/20 bg-violet-500/5' },
      subTabs: [{ id: 'presentation', label: 'Présentation' }, { id: 'features', label: 'Paramètres' }, { id: 'integration', label: 'Intégration' }],
    },
    {
      id: 'recette', label: 'Recette', icon: 'checklist', hasFloatingWidget: true,
      selector: '<wo-cahier-recette>',
      description: 'Plateforme de tests de recette avec exécution IA, campagnes, rapports et variables.',
      color: { text: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', subActive: 'bg-teal-500/15 text-teal-300', warn: 'border-teal-500/20 bg-teal-500/5' },
      subTabs: [{ id: 'presentation', label: 'Présentation' }, { id: 'features', label: 'Fonctionnalités' }, { id: 'integration', label: 'Intégration' }],
    },
    {
      id: 'tickets', label: 'Tickets', icon: 'confirmation_number', hasFloatingWidget: true,
      selector: '<wo-ticket-widget>',
      description: 'Widget de signalement de bugs avec capture d\'écran html2canvas et annotation canvas.',
      color: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', subActive: 'bg-orange-500/15 text-orange-300', warn: 'border-orange-500/20 bg-orange-500/5' },
      subTabs: [{ id: 'presentation', label: 'Présentation' }, { id: 'features', label: 'Flux' }, { id: 'integration', label: 'Intégration' }],
    },
    {
      id: 'actions', label: 'Actions', icon: 'rocket_launch', hasFloatingWidget: true,
      selector: '<wo-actions>',
      description: 'Orchestrateur de prompts IA en batch avec branches Git dédiées et commit automatique.',
      color: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', subActive: 'bg-indigo-500/15 text-indigo-300', warn: 'border-indigo-500/20 bg-indigo-500/5' },
      subTabs: [{ id: 'presentation', label: 'Présentation' }, { id: 'outil', label: 'Outil' }],
    },
    {
      id: 'ia-logs', label: 'IA Logs', icon: 'terminal', hasFloatingWidget: false,
      selector: '<wo-ia-logs>',
      description: 'Historique de tous les appels IA enregistrés par la plateforme, avec tri et détail.',
      color: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', subActive: 'bg-emerald-500/15 text-emerald-300', warn: 'border-emerald-500/20 bg-emerald-500/5' },
      subTabs: [],
    },
    {
      id: 'history', label: 'Historique', icon: 'history', hasFloatingWidget: false,
      selector: '<wo-history>',
      description: 'Chronologie de toutes les modifications apportées à la plateforme par les agents IA, avec stats et filtres.',
      color: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', subActive: 'bg-amber-500/15 text-amber-300', warn: 'border-amber-500/20 bg-amber-500/5' },
      subTabs: [],
    },
  ];

  // ── Data grids (readonly arrays to avoid Angular template parse errors) ──

  readonly tchatFeatureChips = [
    { icon: 'stream',        title: 'SSE Streaming',  desc: 'Réponse mot par mot en temps réel' },
    { icon: 'dynamic_form',  title: 'Formulaires IA', desc: 'Générés depuis la réponse IA' },
    { icon: 'history',       title: 'Multi-sessions', desc: 'Historique persisté en localStorage' },
    { icon: 'select_all',    title: 'Zone selection', desc: 'Sélection d\'une zone de page' },
    { icon: 'ios_share',     title: 'Export',         desc: 'Export de la conversation' },
    { icon: 'quick_phrases', title: 'Quick prompts',  desc: 'Raccourcis configurables' },
  ];

  readonly tchatInputs = [
    { name: 'visible',             type: 'boolean',  desc: 'Afficher / masquer le chat' },
    { name: 'executorUrl',         type: 'string',   desc: 'URL serveur executor (:3002)' },
    { name: 'apiUrl',              type: 'string',   desc: 'URL serveur data (:3001)' },
    { name: 'provider',            type: 'string',   desc: 'Fournisseur IA (gemini, claude)' },
    { name: 'model',               type: 'string',   desc: 'Modèle IA à utiliser' },
    { name: 'title',               type: 'string',   desc: 'Titre affiché dans le header' },
    { name: 'systemPrompt',        type: 'string',   desc: 'Prompt système initial' },
    { name: 'quickPrompts',        type: 'any[]',    desc: 'Raccourcis de prompts' },
    { name: 'context',             type: 'any',      desc: 'Données contextuelles injectées' },
    { name: 'allowFormGeneration', type: 'boolean',  desc: 'Activer les formulaires IA' },
    { name: 'allowZoneSelection',  type: 'boolean',  desc: 'Activer la sélection de zone' },
    { name: 'allowExport',         type: 'boolean',  desc: 'Activer l\'export conversation' },
  ];

  readonly tchatOutputs = [
    { name: 'closed',                     desc: 'Fermeture du chat' },
    { name: 'aiResponse',                 desc: 'Réponse IA complète reçue' },
    { name: 'formSubmitted',              desc: 'Formulaire IA soumis' },
    { name: 'zoneModificationRequested',  desc: 'Zone sélectionnée pour modification' },
    { name: 'messageSent',                desc: 'Message utilisateur envoyé' },
  ];

  readonly recetteTabs = [
    { icon: 'library_books', label: 'Catalogue' },
    { icon: 'campaign',      label: 'Campagnes' },
    { icon: 'play_circle',   label: 'Lancer' },
    { icon: 'bar_chart',     label: 'Rapports' },
    { icon: 'tune',          label: 'Avancé' },
  ];

  readonly recetteFeatureChips = [
    { icon: 'science',    title: 'Tests IA',   desc: 'Exécution par agent IA' },
    { icon: 'stream',     title: 'SSE live',   desc: 'Progression temps réel' },
    { icon: 'analytics',  title: 'Rapports',   desc: 'Historique et stats' },
    { icon: 'variables',  title: 'Variables',  desc: 'Paramètres d\'environnement' },
  ];

  readonly recetteCapacites = [
    { icon: 'library_books', title: 'Catalogue de tests',   desc: 'Création et organisation de cas de test par catégories avec priorités et statuts.' },
    { icon: 'campaign',      title: 'Campagnes',            desc: 'Regroupement de tests en campagnes réutilisables, exécutables en un clic.' },
    { icon: 'play_circle',   title: 'Exécution IA',         desc: 'Lancement via agent IA avec streaming SSE des étapes et possibilité d\'arrêt.' },
    { icon: 'bar_chart',     title: 'Rapports',             desc: 'Historique complet des runs, résultats par test, statistiques succès/échec.' },
    { icon: 'variables',     title: 'Variables & templates', desc: 'Variables d\'environnement et templates de tests réutilisables.' },
    { icon: 'webhook',       title: 'Webhooks',             desc: 'Notifications HTTP sur événements (run lancé, terminé, test échoué).' },
  ];

  readonly ticketsFeatureChips = [
    { icon: 'screenshot_monitor', title: 'Capture auto',   desc: 'html2canvas sur document.body' },
    { icon: 'draw',               title: 'Annotation',     desc: 'Trait rouge ou masquage blanc' },
    { icon: 'priority_high',      title: 'Priorité',       desc: 'Basse / Moyenne / Haute / Critique' },
    { icon: 'send',               title: 'Envoi API',      desc: 'POST /api/tickets + image base64' },
    { icon: 'lock',               title: 'Auth auto',      desc: 'Token depuis localStorage' },
    { icon: 'list_alt',           title: 'Liste tickets',  desc: 'Page /tickets pour consultation' },
  ];

  readonly ticketsFlux = [
    { num: '1', icon: 'touch_app',   title: 'Déclenchement', desc: 'Clic sur le bouton flottant. La capture d\'écran est prise automatiquement via html2canvas.' },
    { num: '2', icon: 'draw',        title: 'Annotation',    desc: 'Mode trait rouge pour entourer le problème, mode blanc pour masquer les données sensibles.' },
    { num: '3', icon: 'edit_note',   title: 'Description',   desc: 'Saisie du titre, description et niveau de priorité (Basse → Critique).' },
    { num: '4', icon: 'send',        title: 'Envoi',         desc: 'POST vers /api/tickets avec l\'image encodée en base64 et les métadonnées utilisateur.' },
  ];

  readonly actionsFeatureChips = [
    { icon: 'account_tree', title: 'Branches Git',   desc: 'Branche dédiée par action' },
    { icon: 'commit',       title: 'Auto-commit',    desc: 'Commit + push automatique' },
    { icon: 'stream',       title: 'Temps réel',     desc: 'Page live avec logs SSE' },
    { icon: 'chat',         title: 'Chat bi-dir.',   desc: 'Interaction IA en cours d\'exéc.' },
    { icon: 'queue',        title: 'Queue',          desc: 'Exécution séquentielle' },
    { icon: 'flag',         title: 'Arrêt propre',   desc: 'Stop après l\'action en cours' },
  ];

  // ── Méthodes ──

  get activeTabConfig(): TabConfig {
    return this.tabsConfig.find(t => t.id === this.activeTab) ?? this.tabsConfig[0];
  }

  get activeSubTab(): string {
    return this.subTabs[this.activeTab];
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  open(tab?: Tab) {
    if (tab) this.activeTab = tab;
    this.adminOpen = false;
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
    this.adminOpen = false;
  }

  toggleAdmin() {
    this.adminOpen = !this.adminOpen;
  }

  setTab(tab: Tab) {
    this.activeTab = tab;
  }

  setSubTab(subTab: string) {
    this.subTabs[this.activeTab] = subTab;
  }

  toggleFloating() {
    const s = this.configService;
    switch (this.activeTab) {
      case 'tchat':   s.saveEnabledTools({ tchat:   !s.tchatIaEnabled() });         break;
      case 'recette': s.saveEnabledTools({ recette: !s.recetteWidgetEnabled() });   break;
      case 'tickets': s.saveEnabledTools({ tickets: !s.ticketsEnabled() });         break;
      case 'actions': s.saveEnabledTools({ actions: !s.actionsEnabled() });         break;
    }
  }

  floatingEnabled(): boolean {
    const s = this.configService;
    switch (this.activeTab) {
      case 'tchat':   return s.tchatIaEnabled();
      case 'recette': return s.recetteWidgetEnabled();
      case 'tickets': return s.ticketsEnabled();
      case 'actions': return s.actionsEnabled();
      default:        return false;
    }
  }
}
