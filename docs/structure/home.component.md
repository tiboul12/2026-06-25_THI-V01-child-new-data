# Documentation du composant `HomeComponent`

## Rôle Général
Le `HomeComponent` est la page d'accueil et le tableau de bord de routage principal. Il oriente l'utilisateur vers différentes zones clés de l'application (Projets, Administration, etc.) selon la configuration de l'application et les privilèges.

## Règles Métier Spécifiques
- **Redirection adaptative** : Le bouton d'action principal (`goToPrimary()`) redirige vers une route déterminée par le service de configuration `AppConfigService`, ou vers `/projets` par défaut.
- **Contrôle d'accès (Admin)** : L'affichage des liens liés à l'administration est conditionné par la propriété asynchrone `isAdmin`, tirée des données de l'utilisateur fournies par l'authentification.

## Entrées (Inputs)
Aucun.

## Sorties (Outputs)
Aucun.

## Dépendances
- `Router` : Pour la navigation applicative.
- `AuthService` : Pour obtenir les droits de l'utilisateur actif (`currentUser()?.role`).
- `AppConfigService` : Pour lire la configuration d'accueil personnalisée.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Navigation dynamique :** Injecter une configuration de test dans `AppConfigService` pointant vers `/dashboard`, puis simuler un clic sur `goToPrimary()` pour valider la redirection.
2. **Interface contextuelle :** S'assurer que si `AuthService` retourne un utilisateur avec un rôle non-admin, les raccourcis `goToAdmin()` (et leurs boutons associés) ne sont pas accessibles/présents dans le DOM.