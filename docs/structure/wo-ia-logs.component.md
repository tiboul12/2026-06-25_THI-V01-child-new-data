# wo-ia-logs.component

## 1. Objectif général et fonctionnement
Le composant `WoIaLogsComponent` fournit une interface de type tableau de bord pour inspecter tous les logs d'interactions bruts entre l'application et les différents modèles d'intelligence artificielle (Claude, Gemini, etc.).

## 2. Règles métier spécifiques
- **Tri & Pagination :** Le tableau gère le tri ascendant et descendant sur l'ensemble des colonnes métier (`timestamp`, `provider`, `model`, etc.).
- **Exploration :** Les logs longs (comme le prompt brut ou la réponse) sont tronqués. Un clic sur une ligne (toggleAiLogExpand) développe la vue pour lire les détails.
- **Filtres contextuels :** Permet de filtrer en cliquant directement sur une valeur dans les cellules (`page`, `provider`, `model`, `status`). Sont également gérées les tranches de date relatives (aujourd'hui, 7 derniers jours, 30 derniers jours).
- **Gestion des données :** Possibilité de purger complètement les logs (requête HTTP DELETE) après une fenêtre de confirmation.

## 3. Entrées (Inputs), Sorties (Outputs) et Dépendances
- **Inputs / Outputs :** Aucun.
- **Dépendances :**
  - `HttpClient` pour requêter `http://localhost:3001/api/ai-logs` (l'API de logs IA).

## 4. Scénarios de tests fonctionnels (Prévention des régressions)
- **T1 - Expansion des lignes :** Cliquer sur une ligne spécifique et s'assurer qu'elle s'agrandit pour afficher le prompt complet, et se réduit au second clic.
- **T2 - Tri des colonnes :** Cliquer sur l'en-tête "Date" ou "Statut" et vérifier l'ordre (inversion de `asc` à `desc` et tri correct des valeurs via `sortedLogs`).
- **T3 - Filtrage par cellules :** Cliquer sur une étiquette d'un modèle (ex: "claude-3-sonnet") et s'assurer que seuls les logs de ce modèle restent affichés.
- **T4 - Purge des logs :** S'assurer que le bouton d'effacement bloque l'exécution si on annule la popup `confirm()`.
