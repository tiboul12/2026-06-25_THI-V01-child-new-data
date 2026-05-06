# wo-history.component

## 1. Objectif général et fonctionnement
Le composant `WoHistoryComponent` a pour but d'afficher un historique complet (timeline chronologique) de toutes les modifications, refactoring, corrections et nouveautés implémentées dans l'application, qu'elles soient issues d'un Agent IA ou d'un humain. Il génère également un bloc de statistiques dynamiques.

## 2. Règles métier spécifiques
- **Classification :** Les éléments d'historique sont classés par types : `feature` (fonctionnalité), `fix` (correction), `refactor`, `config` avec des codes couleurs et icônes associés.
- **Regroupement journalier :** La timeline calcule la date de chaque modification et insère des séparateurs de date avec des agrégations (temps passé dans la journée, nombre de tickets).
- **Filtrage multicritères :** L'historique peut être filtré instantanément par modèle IA, fournisseur, page web modifiée, type de tâche, ou recherche par texte libre.
- **Statistiques dérivées :** Génération de statistiques complexes à la volée (nombre de jours actifs, nombre de semaines, temps moyen d'exécution, réparation par type).
- **Mise en avant (Featured) :** L'utilisateur peut cocher/décocher des entrées spécifiques pour les "marquer".

## 3. Entrées (Inputs), Sorties (Outputs) et Dépendances
- **Inputs / Outputs :** Aucun input/output.
- **Dépendances :**
  - `HttpClient` : Effectue la requête GET initiale sur le backend.
  - Structure `HistoryEntry` et `TimelineItem` pour le typage des entités et de l'arbre d'affichage.
  
## 4. Scénarios de tests fonctionnels (Prévention des régressions)
- **T1 - Timeline :** S'assurer que les événements survenus le même jour soient correctement affichés sous un même séparateur journalier.
- **T2 - Calcul des durées :** Valider que le temps d'exécution (`completedAt` - `startedAt`) soit correctement calculé, et correctement omis si ces champs sont vides.
- **T3 - Filtrage des données :** Appliquer un filtre texte ("fix auth") et s'assurer que seuls les tickets concernés sont visibles, et que le regroupement journalier s'adapte ou se retire si un jour n'a plus d'éléments correspondants.
- **T4 - Favoris :** Vérifier que le clic sur l'étoile ("Featured") appelle l'API PUT pour modifier l'historique de manière persistante.
