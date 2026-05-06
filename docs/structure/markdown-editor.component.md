# Documentation : MarkdownEditorComponent

## Fonctionnement Général
Le composant `MarkdownEditorComponent` est un éditeur de texte en format Markdown, doté d'une fonctionnalité d'aperçu (preview) en temps réel. Il permet aux utilisateurs de saisir du texte, d'insérer des balises Markdown par des raccourcis (si implémenté dans le template), et de basculer la vue pour voir le rendu HTML formaté.

## Entrées (Inputs)
- `@Input() value`: `string` (Défaut: `''`) - Le contenu Markdown initial.
- `@Input() placeholder`: `string` (Défaut: `'Écrivez votre document...'`) - Le texte indicatif lorsque l'éditeur est vide.
- `@Input() minRows`: `number` (Défaut: `16`) - La hauteur minimale de la zone de texte.

## Sorties (Outputs)
- `@Output() valueChange`: `EventEmitter<string>` - Émet le texte modifié pour supporter le "two-way data binding" avec `[(value)]`.

## Dépendances
- `marked` : Bibliothèque tierce pour parser le texte Markdown en HTML.
- `DomSanitizer` (Angular) : Pour nettoyer de manière sécurisée le HTML généré et le marquer comme sûr via `bypassSecurityTrustHtml` avant de l'injecter dans la vue.

## Règles Métier
- **Édition :** Lorsque l'utilisateur tape du texte, la méthode `onInput` capte l'événement, met à jour la valeur et l'émet au composant parent.
- **Aperçu (Preview) :** La méthode `togglePreview()` bascule entre le mode édition et le mode aperçu. Si activé, le Markdown est converti en HTML de façon asynchrone via `marked`.
- **Insertion de Balises :** La méthode `insertMarkdown(before, after)` permet d'entourer une portion de texte sélectionnée dans l'éditeur (ex: mise en gras, listes) et replace le curseur au bon endroit.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Binding :** Écrire dans le `<textarea>` et vérifier que l'événement `valueChange` est bien déclenché avec la nouvelle valeur.
2. **Aperçu HTML :** Saisir `# Titre` en mode édition, déclencher le mode aperçu, et s'assurer que le contenu généré par `marked` est correctement formaté en balise `<h1>`.
3. **Insertion de Markdown :** Sélectionner du texte dans la zone de saisie, appeler `insertMarkdown('**', '**')`, et s'assurer que la chaîne sélectionnée est bien enveloppée par `**`, avec le curseur repositionné correctement.
