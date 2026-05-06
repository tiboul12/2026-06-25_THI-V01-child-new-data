# Documentation du composant `ProjetsComponent`

## Vue d'ensemble
Le composant `ProjetsComponent` (`app-projets`) est la page principale de gestion des projets de l'utilisateur. Il permet de lister l'ensemble des projets, d'en créer de nouveaux, de modifier leurs informations de base (titre, description) et de les supprimer.

## Fonctionnement Général
À l'initialisation, le composant récupère la liste des projets via le `ProjectService`. L'utilisateur peut interagir avec cette liste pour ouvrir un projet dans l'éditeur, ou effectuer des actions rapides de modification et de suppression directement depuis la grille.

## Règles Métier
- **Gestion CRUD** :
  - **Création** : Un nouveau projet peut être créé via une modale. La création redirige automatiquement l'utilisateur vers l'éditeur du projet nouvellement créé.
  - **Édition Inline** : Le titre et la description d'un projet peuvent être modifiés sans quitter la page via un mode d'édition en ligne.
  - **Suppression** : Une confirmation est requise avant toute suppression définitive d'un projet.
- **Historisation (Undo/Redo)** :
  - Les actions de création et de modification sont tracées via le `WoActionHistoryService` et sont annulables.
  - La suppression est tracée dans l'historique mais n'est pas annulable via l'interface standard.
- **Navigation** : Le clic sur une carte de projet redirige l'utilisateur vers la route `/projets/:id`, gérée par le `ProjetEditorComponent`.
- **Formatage** : Les dates de mise à jour sont affichées au format français (`fr-FR`) avec l'heure. Les statuts sont traduits (ex: `published` devient "Publié").

## Entrées / Sorties
Aucune. Le composant est une page autonome pilotée par le routeur.

## Dépendances
- `ProjectService` : Pour toutes les opérations de lecture et d'écriture sur les projets via l'API.
- `WoActionHistoryService` : Pour l'enregistrement des actions dans le journal d'audit et la gestion du Undo.
- `Router` : Pour la navigation vers l'éditeur de projet.
- `WorgHelpTriggerComponent` : Pour afficher les déclencheurs d'aide contextuelle.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Chargement de la liste** : Vérifier que les projets s'affichent correctement au chargement et que le loader disparaît une fois les données reçues.
2. **Création de projet** : Ouvrir la modale, saisir un titre, valider et vérifier la redirection vers l'éditeur ainsi que la présence d'une entrée "création" dans l'historique.
3. **Édition inline** : Activer le mode édition sur un projet, modifier le titre, sauvegarder et vérifier que la modification est persistée et annulable.
4. **Suppression sécurisée** : Cliquer sur le bouton de suppression, vérifier l'apparition de la confirmation. Annuler et vérifier que le projet est toujours présent. Confirmer et vérifier sa disparition.
5. **Gestion des erreurs** : Simuler une erreur réseau lors du chargement ou de la création et vérifier qu'un message d'erreur explicite est affiché à l'utilisateur.
