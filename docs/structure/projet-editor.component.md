# Documentation : ProjetEditorComponent

## Fonctionnement Général
Le composant `ProjetEditorComponent` est le chef d'orchestre principal (Smart Component) pour la vue d'édition de projet. Il gère l'état global du projet ouvert, charge son arborescence de fichiers et dossiers, gère les interactions complexes comme le glisser-déposer (Drag & Drop), la création/suppression de sections, l'enregistrement des fichiers modifiés, et l'historisation des actions (Undo/Redo).

Il orchestre plusieurs sous-composants tels que la barre d'outils, la barre latérale, la zone d'édition centrale, le panneau de conversation IA et la barre d'état.

## Entrées (Inputs) / Sorties (Outputs)
- *Géré via le routeur (ID du projet dans l'URL)*
- Expose de nombreux signaux (`signal`) utilisés par ses enfants.

## Dépendances
- `ActivatedRoute`, `Router` : Pour extraire l'ID du projet et gérer les redirections.
- `ProjectService`, `ProjectFilesService` : Pour interagir avec l'API backend et manipuler l'arborescence des fichiers du projet.
- `ConfigService`, `LayoutService` : Pour gérer l'état de l'application (projet courant, mode éditeur).
- `AuthService` : Accès aux infos de l'utilisateur.
- `WoActionHistoryService` : Service d'historisation, utilisé pour tracker chaque modification (renommage, mise à jour de contenu, déplacement) et permettre le Undo/Redo.

## Règles Métier
- **Initialisation :** Active le `editorMode` dans `LayoutService`. Charge le projet via l'ID de l'URL. S'assure que le dossier du projet existe sur le disque du serveur (`ensureProjectFolder`).
- **Gestion des Sections et Fichiers :** La structure du document est reflétée dans une arborescence de dossiers/fichiers. Chaque section = un dossier, chaque contenu principal de section = un fichier `contenu.md` à l'intérieur.
- **Glisser-Déposer (Drag & Drop) :** Implémente une logique complexe pour déplacer des dossiers ou des fichiers additionnels dans la hiérarchie. Maintient un ordre correct (`applyOrderInStructure`) et met à jour le backend (`updateStructure`).
- **Historisation (Tracking) :** Lors de changements structurels ou de contenu, le composant calcule un "diff" ou détecte les ajouts/suppressions et enregistre ces actions via `WoActionHistoryService` pour un potentiel "Undo".

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Chargement du projet :** Tester qu'un ID invalide redirige vers `/projets`. Tester le bon chargement des fichiers d'un projet valide.
2. **Glisser-Déposer (Drag & Drop) :**
   - Déplacer un dossier au même niveau pour le réordonner.
   - Déplacer un dossier à l'intérieur d'un autre (modification de parent).
   - Déplacer un fichier additionnel et vérifier qu'il ne devient jamais "orphelin" (à la racine).
3. **Mise à jour de la structure (`onSectionsChange`) :**
   - Créer une nouvelle section et vérifier sa création côté backend et l'ajout à l'historique.
   - Renommer une section et vérifier la mise à jour (trackée en `rename`).
   - Supprimer une section.
4. **Sauvegarde de fichier (`onFileSave`) :** Vérifier le statut de la sauvegarde (`saving` -> `saved` -> `idle`) et la communication avec le backend.
5. **Nettoyage :** Vérifier que `ngOnDestroy` remet `editorMode` à `false` et efface l'ID de projet courant.
