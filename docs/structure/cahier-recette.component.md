# Documentation du composant `CahierRecetteComponent`

## Vue d'ensemble
Le composant `CahierRecetteComponent` (`wo-cahier-recette`) représente l'interface principale (modale ou pleine page) de l'outil Cahier de Recette. Il offre un tableau de bord complet pour gérer les catégories, les scénarios de tests, les campagnes, le lancement des tests et la consultation des rapports.

## Fonctionnement Général
Le composant est divisé en plusieurs onglets :
- **Catalogue** : Gestion (CRUD) des catégories et des cas de tests associés.
- **Campagnes** : Regroupement de tests pour des exécutions en lot.
- **Lancer** : Configuration de l'environnement, de la portée (scope) des tests à exécuter, et lancement de l'exécution en temps réel.
- **Rapports** : Visualisation de l'historique des exécutions, détails des résultats par test, et comparaison entre deux runs.
- **Avancé** : Gestion des variables de contexte, templates de tests, et du secret Webhook.

## Règles Métier
- **Catalogue & CRUD** :
  - Les tests sont découpés en étapes formatées via un texte multiligne (par exemple: `Page | Action | Elément | Résultat attendu`).
  - Les tests ont des tags, des niveaux de priorité et un statut.
- **Campagnes** :
  - Permet de créer un conteneur et de sélectionner rapidement de multiples tests actifs.
- **Lancement (Run)** :
  - La portée peut être : tous les tests, une campagne, des tests filtrés par tags, une sélection manuelle, ou le rejeu des tests échoués d'un run précédent.
  - Lancement via `CahierRecetteService.launchRun` avec retour du progrès et du résultat.
- **Rapports** :
  - Affichage des historiques avec un indicateur de succès (Score).
  - Une courbe de progression (sparkline) est dessinée via les données historiques pour visualiser la tendance des scores.
  - Fonctionnalité de comparaison de runs pour voir les régressions (diff).

## Dépendances
- `CahierRecetteService` : Responsable de toutes les actions API liées aux tests.
- `AuthService` : Pour obtenir le nom de l'utilisateur connecté assigné comme testeur.
- `ConfigService` : Pour configurer l'URL de base et l'environnement.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **CRUD Catalogue** : Vérifier la création d'une catégorie et d'un test. S'assurer que le parsing des étapes depuis le `stepsText` (avec des pipes `|`) génère bien le tableau des étapes.
2. **Filtrage des tests** : Valider que la sélection d'une catégorie et/ou l'utilisation de la barre de recherche affiche uniquement les tests ciblés.
3. **Lancement de tests** : Tester l'erreur si aucun test ou campagne n'est sélectionné. Valider la logique de récupération de la liste des tests à lancer (`selectedTestsForRun`).
4. **Comparaison et Rapport** : Vérifier que la sélection de deux runs génère bien un diff (simulé ou via le service) ou affiche l'état exact des résultats d'un run unique.
5. **Score visuel** : Contrôler le calcul du `scoreSparklinePts` pour s'assurer qu'il dessine correctement le pointage vectoriel (SVG).