# TestsOutilComponent

## Fonctionnement Général

Outil projet (type `tests`) qui gère le cycle QA complet d'un projet en 3 onglets : Cahier de recette, Exécution, Résultats. Les données sont stockées côté serveur via l'API `/api/projets-tests/{projectId}` dans `data/projets/{projectId}/tests/`.

## Entrées / Sorties

| Input | Type | Description |
|-------|------|-------------|
| `projectId` | `string \| null` | ID du projet (nom du dossier) |
| `projectName` | `string` | Titre du projet |
| `megaOutilInstances` | `MegaOutilInstance[]` | Instances mega-outils (pour détection des mockups) |
| `activeOutilId` | `string \| null` | ID de l'instance d'outil active |

Pas d'outputs — le composant est autonome.

## Dépendances

- `TestsOutilService` (`libs/portail-core/data-access`) — CRUD suite + runs + génération
- `CommonModule`, `FormsModule`
- Signal-based state (Angular 17+)

## Règles Métier

- **GO/NO-GO** : NO-GO si au moins 1 test `criticality === 'bloquant'` a `status === 'fail'`
- **Score** : `pass / (pass + fail) * 100` (les "skip" et "pending" sont exclus du calcul)
- **Archivage** : les tests supprimés passent à `status: 'archived'` (non réellement supprimés) pour préserver l'historique des runs
- **Catégorie supprimée** : les tests de cette catégorie sont archivés (pas supprimés)
- **Génération auto IA** : stub (retourne vide), feature day 2

## Règles Drag & Drop

- `draggedCatId` + `draggedTestId` sont mutuellement exclusifs (un seul type de drag à la fois)
- Drop d'une catégorie sur une autre → `reorderCategory(dragId, targetId, pos: 'before'|'after')`
- Drop d'un test sur un header de catégorie → `moveTestToCategory(testId, catId)`
- Drop d'un test sur un autre test → adoption de la catégorie du test cible (pas de réordonnancement persisté en DB)
- Drop dans la zone générale (sans catégorie) → `categoryId: ''`

## Scénarios de Test

- Créer une catégorie inline, renommer, supprimer
- Ajouter un test via bouton "+" dans le header de catégorie
- Drag & drop d'une catégorie → vérifier le réordonnancement
- Drag & drop d'un test vers un autre header de catégorie → vérifier changement de `categoryId`
- Générer depuis Édition → vérifier les tests générés (si fichiers .md avec `- [ ]`)
- Lancer une campagne manuelle → valider/échouer des tests → vérifier le verdict GO/NO-GO
- Échouer un test `bloquant` → vérifier verdict `NO-GO`
- Voir l'historique des runs dans l'onglet Résultats
