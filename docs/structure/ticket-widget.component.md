# Documentation du composant `TicketWidgetComponent`

## Vue d'ensemble
Le composant `TicketWidgetComponent` (`wo-ticket-widget`) est un utilitaire omniprésent permettant aux utilisateurs de signaler un problème ou suggérer une amélioration depuis n'importe quelle page. Il inclut une fonctionnalité de capture d'écran, un outil d'annotation et une interface complète de gestion de liste de tickets.

## Fonctionnement Général
Le composant s'appuie sur une machinerie à plusieurs phases :
1. **Idle** : Un simple bouton flottant.
2. **Capturing** : Utilise la bibliothèque `html2canvas` pour prendre une capture du DOM de la page (en excluant le widget lui-même) et la transformer en base64.
3. **Formulaire (Annotation)** : Affiche la capture dans un `<canvas>`. L'utilisateur peut dessiner dessus (formes libres ou rectangles, avec choix de la couleur pour masquer ou encercler des éléments).
4. **Liste** : Affiche les tickets existants, permet le filtrage, l'édition de leur statut et la discussion via commentaires.

## Règles Métier
- **Capture et Dessin** :
  - L'image de fond et la couche de dessin sont gérées dans deux canvas HTML séparés pour faciliter l'annulation (effacement).
  - Avant l'envoi, les deux canvas sont fusionnés en une seule image `base64`.
  - Modes de dessin : Dessin libre (`freehand`) et Rectangle de masquage ou de surbrillance (`rect`).
- **Envoi du Ticket** : 
  - La soumission au backend via `POST /api/tickets` impose un titre et un commentaire obligatoires. L'URL est renseignée de manière transparente à la création du ticket.
- **Gestion des Tickets (Liste)** :
  - Regroupement des tickets par statut ou affichage plat.
  - Filtre visuel de "vétusté" (`isOld`) signalant les tickets datant de plus de 5 jours.
  - Possibilité de supprimer, modifier (pour le statut et la résolution) ou commenter les tickets existants.

## Entrées / Sorties
Géré principalement comme composant racine/global, aucune Input/Output Angular. Contrôle piloté par le `ConfigService` (`setActiveTool`).

## Dépendances
- `html2canvas` : Pour prendre le "screenshot" du DOM HTML.
- `HttpClient` : Pour communiquer avec le backend REST.
- `AuthService` : Pour attribuer l'auteur du ticket et vérifier les droits d'administration.
- `ConfigService` : Pour contrôler l'état d'ouverture et prévenir le conflit avec d'autres widgets globaux.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Capture d'écran** : Valider que le déclenchement du mode `capturing` aboutit bien au rendu d'un `screenshotDataUrl` sans provoquer de boucle infinie.
2. **Dessin sur le Canvas** : S'assurer que le `mousemove` enregistre les coordonnées et dessine correctement les traits sur la référence `drawCanvas`.
3. **Fusion des Canvas** : Vérifier que `getMergedScreenshot()` rassemble bien l'arrière-plan et le dessin en un seul rendu exploitable.
4. **Soumission de formulaire** : Bloquer l'envoi si le `title` ou la `description` sont manquants et vérifier que les cas valides soumettent correctement via `HttpClient`.
5. **Statistiques et Vétusté** : Valider la logique `isOld()` pour s'assurer que les tickets de plus de 5 jours sont correctement détectés.