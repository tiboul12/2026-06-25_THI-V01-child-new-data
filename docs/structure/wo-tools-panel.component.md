# wo-tools-panel.component

## 1. Objectif général et fonctionnement
Le composant `WoToolsPanelComponent` est un "tiroir" multifonction (souvent situé à droite de l'écran) qui rassemble toute l'offre d'outillage développeur. Il affiche des onglets dynamiques et la documentation intégrée pour chaque outil, avec la possibilité d'héberger certains composants métiers ou administratifs.

## 2. Règles métier spécifiques
- **Affichage dynamique des onglets :** N'affiche que les onglets autorisés par le `ConfigService` via un signal calculé (`visibleTabs`).
- **Documentation et présentation :** Le composant héberge d'imposantes listes de données statiques (descriptions d'outils, propriétés attendues, inputs/outputs pour la doc). C'est le portail d'onboarding de la plateforme technique.
- **Sous-Navigation :** Gère la navigation entre plusieurs vues internes (sous-onglets : présentation, outil, paramètres).
- **Accès Administrateur :** Si l'utilisateur possède le rôle `admin` (via `AuthService`), il est autorisé à accéder et à afficher le panneau `WoToolsAdminComponent` inclus.

## 3. Entrées (Inputs), Sorties (Outputs) et Dépendances
- **Inputs / Outputs :** Aucun input / output Angular classique. Tout repose sur le state global et le DOM.
- **Dépendances :**
  - `ConfigService` : Pour contrôler la visibilité des onglets et l'état des widgets.
  - `AuthService` : Pour contrôler l'accès au mode administrateur.
  - De multiples composants importés : `WoActionsComponent`, `WoIaLogsComponent`, `WoHistoryComponent`, `WoToolsAdminComponent`.

## 4. Scénarios de tests fonctionnels (Prévention des régressions)
- **T1 - Visibilité conditionnelle :** Si un outil est désactivé dans la configuration (ex: Historique), vérifier qu'il n'apparaît plus du tout dans le tiroir d'outils.
- **T2 - Accès Admin sécurisé :** Tenter de basculer en mode admin (`toggleAdmin`) en étant connecté avec un rôle `user` et s'assurer que l'option d'ouverture n'est pas possible côté interface.
- **T3 - Navigation inter-onglets :** Sélectionner un outil, puis changer de sous-onglet (ex: de "Présentation" vers "Outil"). Vérifier que la variable `subTabs[activeTab]` se met bien à jour.
- **T4 - Activation Flottante :** Déclencher la méthode `toggleFloating()` depuis le bouton de présentation et s'assurer qu'elle invoque correctement la bascule dans `ConfigService`.
