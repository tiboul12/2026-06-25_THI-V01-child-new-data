# AdminToolsComponent

## Fonctionnement général
C'est un composant conteneur ("wrapper") très simple dont l'unique objectif est d'intégrer et d'afficher le composant métier `WoToolsAdminComponent` dans un onglet dédié de l'espace d'administration.

## Règles métier spécifiques
Aucune règle métier n'est portée directement par ce composant. Toute la logique d'administration des outils (Tools) est déléguée au composant enfant.

## Entrées
Aucune.

## Sorties
Aucune.

## Dépendances
- `WoToolsAdminComponent` (composant autonome).

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Rendu de base** : Vérifier que le contenu du `WoToolsAdminComponent` s'affiche bien lorsqu'on clique sur l'onglet correspondant.
2. **Isolation** : S'assurer que son intégration ne génère aucune erreur d'injection de dépendances.