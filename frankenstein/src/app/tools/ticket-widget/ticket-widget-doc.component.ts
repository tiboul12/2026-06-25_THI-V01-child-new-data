import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'wo-ticket-widget-doc',
    imports: [CommonModule],
    templateUrl: './ticket-widget-doc.component.html'
})
export class TicketWidgetDocComponent {
  activeSection = 'overview';

  readonly sections = [
    { id: 'overview',    label: 'Vue d\'ensemble', icon: 'confirmation_number' },
    { id: 'phases',      label: 'Phases & États',  icon: 'timeline'           },
    { id: 'form',        label: 'Formulaire',       icon: 'edit_note'          },
    { id: 'canvas',      label: 'Annotation',       icon: 'draw'               },
    { id: 'api',         label: 'API & Backend',    icon: 'cloud_upload'       },
    { id: 'integration', label: 'Intégration',      icon: 'integration_instructions' }
  ];

  readonly phases = [
    {
      name: 'idle',
      icon: 'confirmation_number',
      color: 'blue',
      label: 'Repos',
      desc: 'État initial. Le composant affiche uniquement le bouton flottant violet en bas à gauche de l\'écran (position fixed, z-index 500). Aucune interaction en cours.'
    },
    {
      name: 'capturing',
      icon: 'autorenew',
      color: 'amber',
      label: 'Capture',
      desc: 'Phase transitoire déclenchée au clic sur le bouton. html2canvas est appelé pour capturer le DOM entier (scale 0.75). Un overlay semi-transparent avec spinner indique l\'opération. Le composant ticket-widget lui-même est exclu de la capture (ignoreElements).'
    },
    {
      name: 'form',
      icon: 'edit_note',
      color: 'green',
      label: 'Formulaire',
      desc: 'Phase principale. Le formulaire complet s\'affiche en modal plein-écran : titre, URL (auto-remplie), type, priorité, commentaire et zone d\'annotation canvas. L\'utilisateur peut dessiner sur la capture avant d\'envoyer.'
    }
  ];

  readonly formFields = [
    { name: 'title',       label: 'Titre',       type: 'text',     required: true,  icon: 'title',              desc: 'Titre court et descriptif du ticket. Champ obligatoire — la soumission est bloquée si vide.' },
    { name: 'url',         label: 'URL page',    type: 'text',     required: false, icon: 'link',               desc: 'URL de la page courante au moment de l\'ouverture. Remplie automatiquement via window.location.href. Éditable manuellement.' },
    { name: 'description', label: 'Commentaire', type: 'textarea', required: true,  icon: 'notes',              desc: 'Description détaillée du problème ou de la demande. Champ obligatoire — la soumission est bloquée si vide.' },
    { name: 'type',        label: 'Type',        type: 'pills',    required: false, icon: 'category',           desc: 'Catégorie du ticket. Sélection par pills cliquables. Valeur par défaut : "bug".' },
    { name: 'priority',    label: 'Priorité',    type: 'pills',    required: false, icon: 'priority_high',      desc: 'Niveau d\'urgence. Sélection par pills cliquables. Valeur par défaut : "normale".' },
    { name: 'screenshot',  label: 'Capture',     type: 'canvas',   required: false, icon: 'screenshot_monitor', desc: 'Capture d\'écran annotée. Générée automatiquement par html2canvas. Envoyée en base64 dans le payload.' }
  ];

  readonly ticketTypes = [
    { value: 'bug',          label: 'Bug',          icon: 'bug_report',  desc: 'Dysfonctionnement, comportement inattendu, erreur visible' },
    { value: 'amelioration', label: 'Amélioration', icon: 'lightbulb',   desc: 'Suggestion d\'évolution fonctionnelle ou ergonomique' },
    { value: 'ui',           label: 'Interface',    icon: 'palette',     desc: 'Problème ou amélioration visuelle / design' },
    { value: 'contenu',      label: 'Contenu',      icon: 'article',     desc: 'Erreur ou modification de texte, libellé, traduction' },
    { value: 'performance',  label: 'Performance',  icon: 'speed',       desc: 'Lenteur, lag, optimisation nécessaire' }
  ];

  readonly priorities = [
    { value: 'critique', label: 'Critique', dot: 'bg-red-500',    desc: 'Bloquant — empêche l\'utilisation du système' },
    { value: 'haute',    label: 'Haute',    dot: 'bg-orange-500', desc: 'Important — doit être traité rapidement' },
    { value: 'normale',  label: 'Normale',  dot: 'bg-blue-500',   desc: 'Standard — à traiter dans le sprint courant' },
    { value: 'basse',    label: 'Basse',    dot: 'bg-gray-400',   desc: 'Mineur — peut attendre la prochaine itération' }
  ];

  readonly canvasModes = [
    { name: 'none',  label: 'Inactif',        icon: 'pan_tool',    color: 'white', desc: 'Mode par défaut. Le canvas est transparent et les clics ne dessinent rien.' },
    { name: 'red',   label: 'Annotation rouge', icon: 'edit',      color: 'red',   desc: 'Dessine des traits rouges épais (strokeStyle rgba(239,68,68,0.90), lineWidth 5). Idéal pour encercler ou souligner un élément problématique.' },
    { name: 'white', label: 'Masquage blanc',  icon: 'ink_eraser', color: 'white', desc: 'Dessine des traits blancs opaques (rgba(255,255,255,0.97)). Permet de masquer des informations sensibles (données personnelles, mots de passe).' }
  ];

  readonly methods = [
    { name: 'openWidget()',    icon: 'play_arrow', desc: 'Démarre le flux complet : passe en phase "capturing", attend 150ms (pour masquer le bouton), lance html2canvas sur document.body, puis passe en phase "form".' },
    { name: 'close()',         icon: 'close',      desc: 'Remet le composant en phase "idle" et réinitialise tous les champs du formulaire, le screenshot, le mode canvas et le flag saving.' },
    { name: 'submit()',        icon: 'send',       desc: 'Valide le formulaire (titre + commentaire requis), fusionne le canvas fond + dessin en une seule image base64, envoie le payload via POST /api/tickets avec le header Auth.' },
    { name: 'setDrawMode()',   icon: 'draw',       desc: 'Bascule le mode canvas entre "red", "white" et "none" (toggle : recliquer sur le mode actif le désactive).' },
    { name: 'clearDrawing()',  icon: 'restart_alt',desc: 'Efface le layer de dessin (canvas drawCanvas) avec clearRect sur toute la surface. Le screenshot de fond n\'est pas affecté.' }
  ];
}
