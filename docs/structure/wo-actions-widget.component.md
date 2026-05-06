# wo-actions-widget.component

## 1. Objectif général et fonctionnement
Le composant `WoActionsWidgetComponent` agit comme un point d'entrée visuel (widget) permettant à l'utilisateur d'afficher l'interface de l'outil d'actions (Orchestrateur de prompts IA). Il propose un basculement entre un affichage latéral ("sidebar" via `ConfigService`) ou un affichage superposé en modale.

## 2. Règles métier spécifiques
- **Gestion de l'affichage global :** L'activation du panneau latéral s'appuie sur le `ConfigService` (outil actif = 'actions' ou 'none').
- **Mode Modale :** L'utilisateur peut forcer l'ouverture sous forme de fenêtre modale interne (`showModal = true`), ce qui ferme l'outil dans la sidebar (`setActiveTool('none')`).
- **Encapsulation :** Le composant gère uniquement l'état de son interface et englobe le composant métier principal `WoActionsComponent`.

## 3. Entrées (Inputs), Sorties (Outputs) et Dépendances
- **Inputs :** Aucun.
- **Outputs :** Aucun événement Angular, la communication se fait via le state global.
- **Dépendances :**
  - `ConfigService` : Pour lire et écrire l'outil actuellement actif.
  - `WoActionsComponent` : Composant intégré pour le rendu du contenu de l'orchestrateur.

## 4. Scénarios de tests fonctionnels (Prévention des régressions)
- **T1 - Basculement latéral :** Cliquer sur le widget pour activer/désactiver le panneau de l'outil et s'assurer que `ConfigService.setActiveTool('actions')` ou `('none')` est appelé de façon appropriée.
- **T2 - Mode modale :** Cliquer sur l'ouverture en modale ; vérifier que le conteneur modale s'affiche (`showModal = true`) et que l'outil latéral est masqué (tool = 'none').
- **T3 - Fermeture :** Fermer la modale pour s'assurer que l'état se réinitialise bien.
