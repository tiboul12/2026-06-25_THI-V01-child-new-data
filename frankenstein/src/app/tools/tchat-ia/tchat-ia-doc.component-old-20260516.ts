import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'wo-tchat-ia-doc',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tchat-ia-doc.component.html'
})
export class TchatIaDocComponent {
  activeSection = 'overview';

  readonly sections = [
    { id: 'overview',  label: 'Vue d\'ensemble', icon: 'smart_toy' },
    { id: 'inputs',    label: '@Input()',          icon: 'input'      },
    { id: 'outputs',   label: '@Output()',         icon: 'output'     },
    { id: 'markers',   label: 'Marqueurs IA',      icon: 'code'       },
    { id: 'features',  label: 'Fonctionnalités',   icon: 'star'       },
    { id: 'usage',     label: 'Exemple d\'usage',  icon: 'integration_instructions' }
  ];

  readonly inputs = [
    { name: 'visible',               type: 'boolean',     default: 'false',                   required: false, icon: 'visibility',    desc: 'Affiche ou masque le modal. Passer à true pour ouvrir le tchat.' },
    { name: 'executorUrl',           type: 'string',      default: '"http://localhost:3002"',  required: true,  icon: 'dns',           desc: 'URL du serveur executor IA. Doit exposer la route POST /execute-chat-turn avec streaming SSE.' },
    { name: 'apiUrl',                type: 'string',      default: '"http://localhost:3001"',  required: false, icon: 'storage',       desc: 'URL de l\'API data. Utilisée pour sauvegarder les logs IA via POST /api/ai-logs. Laisser vide pour désactiver.' },
    { name: 'provider',              type: 'string',      default: '"claude"',                 required: false, icon: 'hub',           desc: 'Identifiant du fournisseur IA (claude, gemini, openai…). Transmis tel quel au serveur executor.' },
    { name: 'model',                 type: 'string',      default: '"claude-sonnet-4-6"',      required: false, icon: 'memory',        desc: 'Identifiant du modèle IA. Transmis au serveur executor avec le provider.' },
    { name: 'systemPrompt',          type: 'string',      default: '""',                       required: false, icon: 'psychology',    desc: 'Prompt système de base injecté en premier message. Si vide, utilise un prompt générique. Le contexte, les marqueurs formulaires et variantes sont ajoutés automatiquement.' },
    { name: 'initialPrompt',         type: 'string',      default: '""',                       required: false, icon: 'send',          desc: 'Premier message utilisateur envoyé automatiquement à l\'ouverture. Si vide, le tchat attend la saisie manuelle.' },
    { name: 'context',               type: 'TchatContext',default: '{}',                       required: false, icon: 'info',          desc: 'Données secondaires injectées dans le prompt système. Champs : user (nom de l\'utilisateur), siteName (nom de l\'app), params (objet libre clé/valeur).' },
    { name: 'title',                 type: 'string',      default: '"Tchat IA"',               required: false, icon: 'title',         desc: 'Titre affiché dans le header du modal.' },
    { name: 'allowFormGeneration',   type: 'boolean',     default: 'true',                    required: false, icon: 'dynamic_form',  desc: 'Active le parsing des formulaires automatiques. L\'IA peut retourner des formulaires via les marqueurs [FORM_START]...[FORM_END].' },
    { name: 'allowZoneSelection',    type: 'boolean',     default: 'true',                    required: false, icon: 'select_all',    desc: 'Active le bouton « Mode sélection » qui permet de sélectionner du texte dans une réponse IA pour demander une modification, suppression ou développement.' },
    { name: 'allowMarkdown',         type: 'boolean',     default: 'true',                    required: false, icon: 'format_bold',   desc: 'Active le rendu Markdown dans les réponses IA (titres, listes, code, gras, italique, séparateurs).' },
    { name: 'allowExport',           type: 'boolean',     default: 'true',                    required: false, icon: 'download',      desc: 'Affiche le menu d\'export de la conversation (Markdown .md ou JSON).' },
    { name: 'allowContinueAfterEnd', type: 'boolean',     default: 'false',                   required: false, icon: 'replay',        desc: 'Autorise la saisie après que l\'IA a envoyé le marqueur de fin [FIN_TCHAT]. Par défaut la zone de saisie est remplacée par un message de fin.' },
    { name: 'quickPrompts',          type: 'string[]',    default: '[]',                      required: false, icon: 'bolt',          desc: 'Liste de suggestions rapides affichées sous la zone de saisie. Un clic envoie le texte directement à l\'IA.' },
    { name: 'endMarker',             type: 'string',      default: '"[FIN_TCHAT]"',           required: false, icon: 'stop_circle',   desc: 'Marqueur de fin de conversation. Quand l\'IA inclut ce texte dans sa réponse, la conversation est déclarée terminée.' },
    { name: 'maxMessages',           type: 'number',      default: '0',                       required: false, icon: 'filter_list',   desc: 'Nombre maximum de messages envoyés dans l\'historique à chaque tour. 0 = illimité (tout l\'historique).' },
    { name: 'formTemplates',         type: 'TchatForm[]', default: '[]',                      required: false, icon: 'library_add',   desc: 'Formulaires prédéfinis injectés par le composant parent. Apparaissent comme boutons au-dessus de la zone de saisie. L\'utilisateur peut les déclencher sans passer par l\'IA.' },
  ];

  readonly outputs = [
    { name: 'closed',                      payload: 'TchatResult',                             icon: 'close',          desc: 'Émis à la fermeture (bouton ×, fermer ou clic sur le backdrop). Contient l\'intégralité de la conversation, les réponses de formulaires et les documents créés.' },
    { name: 'aiResponse',                  payload: 'TchatMessage',                            icon: 'smart_toy',      desc: 'Émis après chaque réponse IA complète (fin du streaming). Contient le message complet avec son type, son contenu, ses tokens et son horodatage.' },
    { name: 'formSubmitted',               payload: '{ formTitle: string; values: Record<string, any> }', icon: 'dynamic_form', desc: 'Émis quand l\'utilisateur valide un formulaire généré par l\'IA. Contient le titre du formulaire et les valeurs saisies.' },
    { name: 'zoneModificationRequested',   payload: 'ZoneSelection',                           icon: 'select_all',     desc: 'Émis quand l\'utilisateur clique sur Modifier/Développer/Supprimer sur une zone sélectionnée. Contient le texte sélectionné, les offsets et l\'action demandée.' },
    { name: 'messageSent',                 payload: 'string',                                  icon: 'send',           desc: 'Émis à chaque envoi de message utilisateur (saisie manuelle ou quick prompt). Contient le texte brut du message.' },
  ];

  readonly markers = [
    {
      name: '[FORM_START] … [FORM_END]',
      icon: 'dynamic_form',
      color: 'violet',
      desc: 'Génère un formulaire interactif directement dans la bulle IA. Le contenu entre les marqueurs doit être un JSON valide selon le schéma TchatForm.',
      example: `[FORM_START]
{
  "title": "Informations projet",
  "description": "Quelques questions pour mieux vous aider",
  "fields": [
    { "id": "nom",  "type": "text",   "label": "Nom du projet", "required": true },
    { "id": "type", "type": "select", "label": "Type",
      "options": [{"value":"web","label":"Site web"}, {"value":"app","label":"Application"}] },
    { "id": "desc", "type": "textarea", "label": "Description", "placeholder": "…" }
  ],
  "submitLabel": "Valider"
}
[FORM_END]`
    },
    {
      name: '[VARIANTE N]',
      icon: 'shuffle',
      color: 'blue',
      desc: 'Permet à l\'IA de proposer plusieurs variantes d\'une réponse. Le composant détecte automatiquement les marqueurs et affiche les variantes comme cartes sélectionnables.',
      example: `[VARIANTE 1]
Première version du contenu, plus concise et directe.

[VARIANTE 2]
Deuxième version, avec plus de détails et d'exemples concrets.

[VARIANTE 3]
Troisième version, orientée vers un public technique.`
    },
    {
      name: '[FIN_TCHAT]  (configurable via endMarker)',
      icon: 'stop_circle',
      color: 'green',
      desc: 'Signal de fin de conversation. Quand ce marqueur est présent dans la réponse, il est retiré du texte affiché et la zone de saisie passe en mode "terminé". Configurable via l\'@Input() endMarker.',
      example: `Voici le résumé de votre cahier des charges.
Vous pouvez maintenant passer à l'étape suivante.

[FIN_TCHAT]`
    },
    {
      name: '[DOCUMENT_CRÉÉ: nom_fichier.ext]',
      icon: 'description',
      color: 'teal',
      desc: 'Indique qu\'un document a été créé lors de la session. Les noms de fichiers sont collectés et affichés en badges verts sous le dernier message IA. Ils sont aussi inclus dans l\'output TchatResult.',
      example: `J'ai généré les fichiers suivants pour votre projet :

[DOCUMENT_CRÉÉ: cahier-des-charges.md]
[DOCUMENT_CRÉÉ: maquette-wireframe.json]`
    },
  ];

  readonly features = [
    { icon: 'chat',          color: 'violet', title: 'Tchat SSE streaming',       desc: 'La réponse IA s\'affiche mot par mot via Server-Sent Events. Un curseur animé indique l\'écriture en cours.' },
    { icon: 'dynamic_form',  color: 'violet', title: 'Formulaires IA',            desc: 'L\'IA peut générer des formulaires complets (text, textarea, select, radio, checkbox, number, date) parsés et rendus automatiquement. La soumission renvoie les réponses dans la conversation.' },
    { icon: 'select_all',    color: 'amber',  title: 'Sélection de zones',        desc: 'En mode sélection, l\'utilisateur sélectionne n\'importe quel texte d\'une réponse IA. Une mini-toolbar contextuelle propose : Modifier, Développer, Supprimer. L\'instruction est envoyée à l\'IA avec la zone en contexte.' },
    { icon: 'shuffle',       color: 'blue',   title: 'Variantes',                 desc: 'Un bouton "Variantes" sur le dernier message IA demande automatiquement 3 variantes. L\'IA utilise les marqueurs [VARIANTE N] et le composant affiche les options en cartes sélectionnables.' },
    { icon: 'history',       color: 'cyan',   title: 'Historique sessions',       desc: 'Les conversations sont auto-sauvegardées dans le localStorage sous la clé "tchat-ia-sessions" (20 sessions max). L\'onglet Historique permet de restaurer ou supprimer une session.' },
    { icon: 'download',      color: 'green',  title: 'Export',                    desc: 'Exporte la conversation en fichier Markdown (.md) ou JSON structuré. Le JSON inclut les messages, l\'historique texte, les réponses de formulaires et les documents créés.' },
    { icon: 'format_bold',   color: 'white',  title: 'Rendu Markdown',            desc: 'Les réponses IA sont rendues en HTML : titres (h1/h2/h3), listes (ul/ol), blocs de code, code inline, gras, italique, séparateurs. Désactivable via allowMarkdown.' },
    { icon: 'content_copy',  color: 'white',  title: 'Copie par message',         desc: 'Un bouton "Copier" apparaît au survol de chaque bulle (IA et utilisateur). Copie le contenu brut dans le presse-papiers avec confirmation visuelle.' },
    { icon: 'thumb_up',      color: 'green',  title: 'Feedback',                  desc: 'Chaque réponse IA expose des boutons 👍/👎 visibles au survol. Le feedback est stocké sur le message (propriété feedback) et peut être exploité via le output aiResponse.' },
    { icon: 'bolt',          color: 'violet', title: 'Quick prompts',             desc: 'L\'@Input() quickPrompts accepte un tableau de chaînes affichées comme boutons-pill sous la zone de saisie. Un clic envoie directement le texte sans frappe.' },
    { icon: 'library_add',   color: 'violet', title: 'Form templates',            desc: 'Le composant parent peut injecter des formulaires prédéfinis via formTemplates. Ils apparaissent comme boutons et ouvrent le formulaire dans la conversation sans requête IA.' },
    { icon: 'terminal',      color: 'green',  title: 'Log CLI',                   desc: 'L\'onglet "terminal" affiche le flux SSE brut de tous les tours : statut HTTP, tokens, stderr, durée par tour. Utile pour déboguer.' },
    { icon: 'expand',        color: 'white',  title: 'Resize',                    desc: 'Le panel du modal est redimensionnable (CSS resize: both). Taille par défaut 800×85vh, minimum 400×400px.' },
    { icon: 'data_object',   color: 'cyan',   title: 'Compteur tokens',           desc: 'Les tokens consommés sont cumulés à chaque tour (si l\'executor les renvoie via l\'event SSE type "tokens"). Le total est affiché dans le header et sur chaque bulle IA.' },
  ];
}
