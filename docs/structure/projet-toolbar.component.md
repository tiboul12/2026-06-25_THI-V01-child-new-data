# Documentation : ProjetToolbarComponent

## Fonctionnement Général
Le composant `ProjetToolbarComponent` représente la barre d'outils supérieure dans le contexte de l'éditeur de projet. Il fournit des actions rapides telles que le retour à l'accueil, la navigation vers la liste des projets, la déconnexion de l'utilisateur, et le déclenchement de la sauvegarde manuelle des modifications.

## Entrées (Inputs)
- `@Input() projectTitle`: `string` (Défaut: `''`) - Le titre du projet en cours d'édition, affiché dans la barre.
- `@Input() isDirty`: `boolean` (Défaut: `false`) - Indique si le projet a des modifications non sauvegardées, ce qui peut activer le bouton de sauvegarde.

## Sorties (Outputs)
- `@Output() save`: `EventEmitter<void>` - Émet un événement pour informer le composant parent qu'une sauvegarde a été demandée par l'utilisateur.

## Dépendances
- `Router` (Angular) : Pour la navigation entre les différentes vues (Home, Projets).
- `AuthService` : Pour gérer la déconnexion de l'utilisateur courant.

## Règles Métier
- **Navigation sécurisée :** Le composant permet de quitter l'éditeur, l'interface doit s'assurer que le routage fonctionne vers `/home` et `/projets`.
- **Déconnexion :** Le clic sur "Logout" appelle le service d'authentification pour déconnecter l'utilisateur, puis redirige vers la racine (`/`).
- **Sauvegarde :** Le bouton de sauvegarde peut être cliqué pour émettre l'événement `save`.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Affichage du titre :** Vérifier que le titre du projet est correctement rendu.
2. **Bouton de sauvegarde :** Vérifier que le bouton émet l'événement `save` lors d'un clic. Tester l'état du bouton en fonction de `isDirty`.
3. **Boutons de navigation :** Vérifier que `goHome()` navigue vers `/home` et `goProjets()` vers `/projets`.
4. **Déconnexion :** S'assurer que la méthode `logout()` déconnecte l'utilisateur et effectue la redirection prévue.
