# Documentation : ProjetStatusbarComponent

## Fonctionnement Général
Le composant `ProjetStatusbarComponent` affiche la barre d'état (status bar) en bas de l'éditeur de projet. Il sert à indiquer l'état actuel du projet (par exemple, "Brouillon" ou "Publié"), les éventuels documents liés, ainsi que l'état de sauvegarde (si des modifications non enregistrées sont présentes, indiqué par `isDirty`).

## Entrées (Inputs)
- `@Input() status`: `string` (Défaut: `'Brouillon'`) - Le statut du projet affiché.
- `@Input() linkedDoc`: `string` (Défaut: `''`) - Le nom ou lien d'un document attaché au projet.
- `@Input() isDirty`: `boolean` (Défaut: `false`) - Indique s'il y a des modifications non sauvegardées.

## Sorties (Outputs)
- *Aucune*

## Dépendances
- `CommonModule` pour les directives Angular de base.

## Règles Métier
- Le composant est purement présentationnel ("Dumb component").
- Il réagit simplement aux valeurs injectées par le composant parent (`ProjetEditorComponent`).

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Affichage du statut :** Vérifier que le texte du statut correspond bien à l'entrée fournie.
2. **Indicateur de modifications :** Vérifier que l'affichage change visuellement si `isDirty` est `true` (ex: apparition d'une icône ou couleur spécifique de modification).
3. **Document lié :** S'assurer que si `linkedDoc` est fourni, il est bien affiché dans la barre d'état.
