# Documentation du composant `EditorComponent`

## Rôle Général
Le `EditorComponent` est un composant dédié à l'édition textuelle en Markdown. Il permet de saisir du texte brut puis de prévisualiser son rendu en HTML sécurisé.

## Règles Métier Spécifiques
- **Validation du rendu Markdown** : Lors du déclenchement de la méthode `validate()`, le contenu Markdown est parsé en HTML via la librairie `marked`.
- **Sanitisation stricte** : Pour éviter toute vulnérabilité XSS due à du code Markdown malveillant, le HTML résultant passe au travers du bypass de sécurité d'Angular (`DomSanitizer`) de manière explicite.
- **Routage minimal** : Le composant permet de quitter l'édition pour retourner directement vers l'accueil (`/home`).

## Entrées (Inputs)
Aucun.

## Sorties (Outputs)
Aucun.

## Dépendances
- `marked` : Librairie externe pour la conversion Markdown vers HTML.
- `DomSanitizer` : Sécurisation du HTML côté Angular.
- `Router` : Pour la méthode de retour en arrière.
- `MarkdownEditorComponent` : Fournit probablement l'interface d'édition sous-jacente ou est un conteneur externe.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Compilation Markdown :** Injecter une chaîne de type `# Titre` dans `markdownContent` et vérifier qu'au clic sur "Valider", `renderedHtml` contient bien une balise `<h1>Titre</h1>`.
2. **Retour arrière :** Tester que l'appel à `goBack()` appelle bien `router.navigate(['/home'])`.