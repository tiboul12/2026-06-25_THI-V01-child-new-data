# Documentation du composant `CahierRecetteWidgetComponent`

## Vue d'ensemble
Le composant `CahierRecetteWidgetComponent` (`wo-cahier-recette-widget`) est un widget flottant qui interagit avec l'IA pour générer automatiquement des cas de test en fonction du contenu de la page web actuelle.

## Fonctionnement Général
Le widget se superpose à l'interface et permet de faire appel à un modèle d'IA pour analyser le DOM de la page en cours. Il filtre le DOM (en excluant les en-têtes, pieds de page, menus de navigation, etc.) pour en extraire le contenu significatif, puis demande à l'IA de proposer des scénarios de test. Il permet enfin d'importer ces tests suggérés directement dans l'outil de Cahier de Recette principal.

## Règles Métier
- **Exclusion du DOM** : L'utilisateur peut choisir d'exclure du contexte envoyé à l'IA certains éléments comme les balises `header`, `footer`, `nav`, `aside` ou certains widgets flottants (ex: `wo-ticket-widget`). Ces préférences sont stockées dans le `localStorage`.
- **Analyse par l'IA** : L'extraction prend l'`innerText` de la page clonée (tronqué à 3000 caractères) et l'envoie à l'IA via `CahierRecetteService.analyzePage`.
- **Préférences IA** : Récupération du fournisseur et modèle d'IA sauvegardés dans le `localStorage` de l'utilisateur ou utilisation des valeurs par défaut (`claude-api`, `claude-sonnet-4-6`).
- **Importation de tests** : Les suggestions récupérées peuvent être sauvegardées sous forme de `TestCase` rattachés à une catégorie (créée à la volée avec pour nom "Analyse IA — [Titre de la page]").
- **Cohabitation de widgets** : Le widget gère son ouverture et sa fermeture via le `ConfigService` (`setActiveTool`) pour éviter les superpositions indésirables avec d'autres outils (comme le ticket widget).

## Entrées / Sorties
Aucune directe (le widget fonctionne en interaction avec des services globaux). Il accède au composant principal via `@ViewChild('mainModal')`.

## Dépendances
- `CahierRecetteService` : Chargement, sauvegarde et appels à l'analyse IA.
- `AuthService` : Récupération de l'utilisateur courant pour les préférences IA.
- `ConfigService` : Gestion de l'outil actif.
- `CahierRecetteComponent` : La modale principale du cahier de recette, appelée depuis le widget.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Extraction de contenu** : Vérifier que si les options d'exclusion sont activées, le contenu extrait ne contient plus le texte des `<header>`, `<footer>`, etc.
2. **Sauvegarde des préférences** : Tester la persistance des exclusions dans le `localStorage` et leur chargement à l'initialisation.
3. **Appel à l'IA** : Simuler un appel IA réussi et valider que les `suggestions` sont bien parsées et affichées (gestion du flux de réponse).
4. **Importation en base** : S'assurer que le bouton "Enregistrer toutes les suggestions" déclenche la création d'une catégorie et l'ajout en masse des tests, et affiche un statut `saved`.
5. **Gestion d'état global** : Confirmer que l'ouverture du widget définit le tool actif à `recette` dans le `ConfigService` et ferme automatiquement les autres outils si nécessaire.