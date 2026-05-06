# AdminThemeComponent

## Fonctionnement général
Un panneau de configuration avancé permettant aux administrateurs de modifier l'apparence de l'application en temps réel. Il gère les variables de couleurs (CSS custom properties), la typographie (polices, tailles, graisses), les arrondis, et permet l'injection de code CSS personnalisé pour le projet.

## Règles métier spécifiques
- **Live Preview (Aperçu en temps réel)** : Chaque modification de style (couleur, taille de police, espacement) est immédiatement injectée dans `document.documentElement` pour visualiser les changements sans avoir à sauvegarder.
- **Presets de thème** : Permet l'application rapide d'ensembles de couleurs prédéfinies (Violet, Cyan, Emerald, Amber). Le composant tente de détecter si un preset est actif au chargement.
- **Calcul automatique du contraste** : Lorsque la couleur primaire de l'application (`--tw-primary`) est modifiée, le système calcule automatiquement sa luminance. Il attribue dynamiquement la couleur du texte des boutons (`--btn-text-color`) en noir ou blanc pour garantir la lisibilité.
- **CSS personnalisé** : Permet la saisie et la sauvegarde de règles CSS brutes qui seront injectées dans le DOM via une balise `<style id="frankenstein-custom-css">`.

## Entrées
Aucune.

## Sorties
Aucune.

## Dépendances
- `HttpClient` : Pour communiquer avec l'API (`/api/child/config/theme`, `/api/child/css`).

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Contraste automatique** : Changer la couleur primaire pour une couleur très claire, vérifier que `--btn-text-color` devient noir. Changer pour une couleur foncée, vérifier qu'il devient blanc.
2. **Presets** : Cliquer sur le preset "Emerald", vérifier que toutes les variables de couleurs associées sont mises à jour dans le navigateur.
3. **Live Preview** : Augmenter la variable "Arrondi" (card-radius) à l'aide de la jauge, observer les éléments de l'interface et vérifier qu'ils s'arrondissent immédiatement avant même de cliquer sur sauvegarder.
4. **Injection de CSS Custom** : Ajouter une règle CSS aberrante dans l'éditeur (ex: `body { border: 5px solid red; }`), sauvegarder, et vérifier que la bordure rouge s'applique. Réinitialiser et vérifier qu'elle disparaît.