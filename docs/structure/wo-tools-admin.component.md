# wo-tools-admin.component

## 1. Objectif général et fonctionnement
Le composant `WoToolsAdminComponent` est un panneau de configuration restreint aux administrateurs. Il permet d'activer ou de désactiver visuellement l'accès aux divers outils développeur de la plateforme (Tchat IA, Recette, Tickets, Actions, IA Logs, Historique).

## 2. Règles métier spécifiques
- **Gestion fine de l'activation :** Chaque outil peut être activé de deux manières distinctes :
  - **Panneau / Onglet :** Outil visible dans la liste des onglets (via `saveEnabledTabs`).
  - **Widget Flottant :** Outil visible de manière flottante/indépendante sur toute l'application (via `saveEnabledTools`).
- **Configuration locale/serveur :** Les états d'activation sont modifiés via le service `ConfigService` (qui, en fonction de son implémentation, sauvegarde localement ou en base).

## 3. Entrées (Inputs), Sorties (Outputs) et Dépendances
- **Inputs / Outputs :** Aucun.
- **Dépendances :**
  - `ConfigService` : Lit l'état actuel (ex: `tchatTabEnabled()`) et exécute les mises à jour (ex: `saveEnabledTabs()`).
  
## 4. Scénarios de tests fonctionnels (Prévention des régressions)
- **T1 - Vérification d'état :** À l'initialisation, vérifier que les interrupteurs (toggle) reflètent correctement la configuration retournée par `ConfigService`.
- **T2 - Modification de droits sur un onglet :** Cliquer sur le toggle de l'onglet "Recette" et s'assurer que `ConfigService.saveEnabledTabs({ recette: false })` est correctement dispatché.
- **T3 - Modification de droits sur un widget flottant :** Cliquer sur le toggle du widget "Tickets" et s'assurer de l'appel à `ConfigService.saveEnabledTools({ tickets: false })`.
