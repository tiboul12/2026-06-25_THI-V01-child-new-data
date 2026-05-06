# Documentation du composant `ActionReportModalComponent`

## Vue d'ensemble
Le composant `ActionReportModalComponent` (`wo-action-report-modal`) est une modale chargée d'afficher le rapport d'exécution d'une action ou d'un déploiement. Il affiche de manière visuelle les statuts d'exécution et les informations relatives à une branche Git.

## Fonctionnement Général
Ce composant prend un objet `action` en entrée et en extrait les informations d'exécution (`execution`). Il présente ces informations formatées, notamment avec des couleurs sémantiques pour les différents statuts et un formatage lisible pour les dates.

## Règles Métier
- **Statut de l'exécution** : Traduit le statut (`completed`, `failed`, `running`) en une classe CSS pour afficher le texte en vert, rouge, ou bleu.
- **Statut de la branche** : Traduit les statuts internes de branche (`pushed`, `committed`, `created`, `none`) en libellés français compréhensibles par l'utilisateur (ex: "Poussée ✅").
- **Formatage de la date** : Les dates ISO sont formatées au standard français (`fr-FR`).
- **Copie dans le presse-papiers** : Permet à l'utilisateur de copier facilement des textes (comme des identifiants ou des logs) via l'API `navigator.clipboard`.

## Entrées (`@Input`)
- `action` (any) : L'objet représentant l'action exécutée. Par défaut `null`.

## Sorties (`@Output`)
- `close` (`EventEmitter<void>`) : Événement émis lorsque l'utilisateur ferme la modale.

## Dépendances
- `CommonModule` : Pour les directives Angular de base (`ngIf`, `ngClass`, etc.).
- `RouterModule` : Pour la gestion des liens.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Affichage des statuts** : Vérifier que le bon code couleur est appliqué (vert pour "completed", rouge pour "failed", bleu pour "running", gris par défaut).
2. **Libellés de branche** : S'assurer que le statut "pushed" affiche bien "Poussée ✅" et que les autres statuts ont la traduction attendue.
3. **Format de date** : Valider que les dates fournies en format ISO sont rendues au format de localisation français. Si aucune date n'est fournie, vérifier que la valeur fallback `--` est affichée.
4. **Action de fermeture** : S'assurer qu'un clic sur le bouton de fermeture déclenche bien l'événement `close`.
5. **Copie presse-papiers** : Vérifier que l'appel de `copyToClipboard` n'entraîne pas d'erreur et interagit correctement avec le navigateur.