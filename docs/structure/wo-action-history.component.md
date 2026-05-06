# Documentation : WoActionHistoryComponent

## Fonctionnement Général
Le composant `WoActionHistoryComponent` est l'interface utilisateur pour consulter l'historique des actions (logs d'audit) de l'application. Il permet de filtrer ces événements, de visualiser les modifications (avant/après, ou diffs style git), et d'annuler (Undo) ou de rétablir (Redo) les actions qui le permettent.

## Entrées (Inputs) / Sorties (Outputs)
- *Aucune (Composant géré par route/vue principale)*

## Dépendances
- `WoActionHistoryService` : Source de vérité pour les événements d'historique et les méthodes `undo` / `redo`.
- `AuthService` : Pour vérifier si l'utilisateur est un administrateur.
- `ConfigService` : Pour forcer le rechargement de la configuration si une annulation affecte la section 'admin/config'.

## Règles Métier
- **Filtrage :** Les logs peuvent être filtrés par Section, Utilisateur, Type d'action, et Plage de dates (Aujourd'hui, Cette semaine, Ce mois, Personnalisé).
- **Groupement :** Les entrées sont groupées visuellement par jour.
- **Diff Ligne-à-Ligne :** Pour les champs de texte long (ex: `content` d'un fichier Markdown), un algorithme LCS (Longest Common Subsequence) est utilisé pour générer un diff "style git" affichant les lignes ajoutées (`add`), supprimées (`del`), ou inchangées (`same`).
- **Undo / Redo :** L'utilisateur peut déclencher `undoAction` ou `redoAction` sur les événements éligibles (`undoable: true` / `undone: true`). Une seule action d'annulation peut être en cours à la fois (`undoing`, `redoing`).
- **Sécurité :** Certains champs sensibles (`password`, `token`, `secret`, `hash`) sont exclus de l'affichage des modifications pour des raisons de sécurité.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Chargement initial :** Vérifier que la liste d'historique se charge via le service au `ngOnInit`.
2. **Filtrage :** Tester chaque filtre (Section, Utilisateur, Date personnalisée) pour vérifier que la liste affichée (`filteredEntries`) est correctement réduite.
3. **Génération de diff :**
   - Créer un événement fictif avec un texte avant/après. Vérifier que `getContentDiff` retourne bien les balises d'ajout/suppression.
   - S'assurer que les champs sensibles ne sont pas affichés dans `getDiffFields`.
4. **Undo/Redo :**
   - Cliquer sur "Undo" pour une action valide, vérifier le passage à l'état de chargement et l'appel au service.
   - Si l'action concerne `admin/config`, vérifier l'appel de rechargement de la config.
