# wo-actions.component

## 1. Objectif général et fonctionnement
Le composant `WoActionsComponent` est le cœur de l'orchestrateur d'IA. Il permet de configurer, gérer, regrouper et exécuter des lots d'actions (prompts IA appliqués à des fichiers spécifiques). Il pilote aussi l'interface en temps réel lors du lancement d'un agent de développement (`AgentRun`), ainsi que la configuration des modèles.

## 2. Règles métier spécifiques
- **Gestion du CRUD des actions :** L'utilisateur peut créer, modifier ou supprimer des actions. Chaque action contient un titre, un prompt, des fichiers ciblés, une priorité et éventuellement une branche Git associée.
- **Sélection multiple :** Les actions peuvent être sélectionnées via des cases à cocher (`selectedActionIds`) afin de les exécuter ensemble dans une file d'attente (batch).
- **Polling de l'agent :** Le composant interroge le serveur d'agent toutes les 3 secondes via `AgentService` pour suivre la progression du travail en temps réel (`activeRun`).
- **Surveillance des services (Health check) :** Il intègre une fonction asynchrone pour vérifier la disponibilité des 3 serveurs nécessaires (API Data, API Executor, API Agent).
- **Personnalisation IA :** Utilise la configuration chargée via `ConfigService` pour déterminer quel fournisseur (provider) et quel modèle sont choisis par défaut au lancement.

## 3. Entrées (Inputs), Sorties (Outputs) et Dépendances
- **Inputs / Outputs :** Aucun.
- **Dépendances :**
  - `HttpClient` et `Router`.
  - `ConfigService` et `AuthService` (pour les variables utilisateur et configuration d'équipe).
  - `AgentService` (API pour orchestrer le démarrage, l'arrêt, et l'observation d'un run).
  - Variables d'environnement pour connaître les routes backend (`apiDataUrl`, `apiExecutorUrl`).

## 4. Scénarios de tests fonctionnels (Prévention des régressions)
- **T1 - Création d'action :** Remplir le formulaire avec un nouveau nom et un prompt, vérifier que la nouvelle action est ajoutée avec succès au chargement via l'API.
- **T2 - Lancement du Batch :** Sélectionner une ou plusieurs actions et cliquer sur "Lancer l'agent". S'assurer que le service retourne un run valide, que la variable locale `agentLaunching` est mise à jour, et que la navigation vers la page "Live" fonctionne.
- **T3 - Polling :** Simuler un retour en cours (`status === 'running'`) de l'agent et vérifier que la surveillance s'exécute de façon périodique (toutes les 3s).
- **T4 - Ping des serveurs :** Tester le toggle du guide utilisateur qui effectue le ping des 3 serveurs API, et vérifier la gestion d'erreur (serveur éteint = affichage rouge).
