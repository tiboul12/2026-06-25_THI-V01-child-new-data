# Documentation : ProjetEditorComponent

## Fonctionnement Général
Le composant `ProjetEditorComponent` est le chef d'orchestre principal (Smart Component) pour la vue d'édition de projet. Il gère l'état global du projet ouvert, charge son arborescence de fichiers et dossiers, gère les interactions complexes comme le glisser-déposer (Drag & Drop), la création/suppression de sections, l'enregistrement des fichiers modifiés, l'historisation des actions (Undo/Redo) et la synchronisation collaborative en temps réel.

Il orchestre plusieurs sous-composants : la barre d'outils (`projet-toolbar`), la barre latérale (`projet-sidebar`), la zone d'édition centrale (`projet-editor-zone`), un panneau latéral droit à onglets (Conversation IA / Historique), la barre d'état (`projet-statusbar`), et un visualiseur de diff (`projet-diff`) qui remplace la zone d'édition lorsqu'une entrée d'historique est inspectée.

## Entrées (Inputs) / Sorties (Outputs)
- *Géré via le routeur (ID du projet dans l'URL)*
- Expose de nombreux signaux (`signal`) utilisés par ses enfants :
  - `project`, `files`, `loading`, `saveStatus` — état global
  - `activeNodeId`, `scrollToNodeId` — sélection courante (dossier ou fichier) et scroll cible
  - `zone5Tab` — onglet actif du panneau droit (`'conversation' | 'history'`)
  - `nestedImagesMap` — map `fileId → imageIds[]` pour les images imbriquées dans un bloc document
  - `diffEntry` — entrée d'historique en cours de visualisation (active la vue diff)
- Computed signaux exposés au template :
  - `activeNodeInfo` — `{ name, icon }` du nœud sélectionné (folder / image / description)
  - `activeHistoryIds` — `Set<string>` d'entityIds à filtrer dans l'historique selon la sélection (un dossier remonte tout son sous-arbre, un `contenu.md` remonte le dossier parent, un fichier additionnel reste seul)

## Dépendances
- `ActivatedRoute`, `Router` : extraction de l'ID du projet et redirections.
- `ProjectService`, `ProjectFilesService` : interaction avec l'API backend, manipulation de l'arborescence (CRUD dossiers/fichiers, déplacements, mise à jour de structure/ordre).
- `ConfigService`, `LayoutService` : état applicatif (projet courant, mode éditeur).
- `AuthService` : infos utilisateur.
- `WoActionHistoryService` : historisation locale (tracker chaque modification — création, renommage, suppression, mise à jour de contenu — pour Undo/Redo).
- `ProjetCollabService` : connexion WebSocket collaborative ouverte sur la durée de vie du composant (`connect` à l'init, `disconnect` au destroy) ; sert à pousser les diffs en temps réel et à alimenter le panneau Historique.

## Zone d'édition — Mode Code / Preview

La zone centrale (`projet-editor-zone`) propose deux modes accessibles via des **onglets style GitHub** :

### Mode Code
- Éditeur textarea transparent superposé à un miroir qui affiche le **syntax highlighting** des tokens markdown :
  - Titres (`#`…`######`) → couleurs H1 (bleu), H2 (vert), H3 (violet), H4 (orange)
  - Code fence (` ``` `) → rose, Tables (`|`) → bleu, Blockquotes (`>`) → gris, Listes (`-`/`*`) → bullet coloré, HR → gris, Gras / Italique / Code inline / Barré → couleurs distinctes
- Toolbar de formatage élargie : B, I, S, H1, H2, H3, H4, Liste, Citation (`>`), HR (`---`), Code inline, Bloc code (` ``` `), Tableau (`|`), Image
- Drag & drop style Notion (poignées latérales, auto-scroll)
- Mode focus "Éd." pour éditer une seule section / document

### Mode Preview (lecture seule)
- Rendu HTML via `marked` (bibliothèque déjà présente) stocké dans `renderedHtml` (SafeHtml)
- Typographie propre max-width 800px : titres hiérarchiques avec border-bottom, paragraphes, listes, tables, blockquotes, images, code blocks stylisés
- Clic sur un heading → `nodeActive.emit(sectionId)` pour synchroniser la sidebar
- **Aucune modification possible** en mode Preview (read-only)

### Bascule entre modes
- `setMode('edit')` : flush du contenu si nécessaire, `recomputeAll()`
- `setMode('visu')` : `recomputeAll()` déclenche `recomputeRenderedHtml()` qui produit le HTML preview
- Les sections `visuSections` (contenteditable) ne sont plus utilisées — le rendu preview passe par `renderedHtml`

## Règles Métier
- **Initialisation :** Active le `editorMode` dans `LayoutService`. Charge le projet via l'ID de l'URL. S'assure que le dossier du projet existe sur le disque du serveur (`ensureProjectFolder`). Ouvre la connexion collab.
- **Gestion des Sections et Fichiers :** La structure du document est reflétée dans une arborescence de dossiers/fichiers. Chaque section = un dossier, chaque contenu principal de section = un fichier `contenu.md` à l'intérieur. Une section peut aussi contenir des **fichiers additionnels** (blocs document/code, images) stockés comme fichiers frères de `contenu.md`.
- **Glisser-Déposer (Drag & Drop) :**
  - Avant tout déplacement, attente que le `flushContentModifications` de la zone d'édition se termine (`isSaving`) pour éviter de réécrire un texte obsolète.
  - Déplacer un dossier : si même parent → réordonnancement via `applyOrderInStructure` + `updateStructure` ; sinon → `moveFolder`.
  - Déplacer un fichier : il doit **toujours** rester dans un dossier (jamais à la racine). Si le dossier change → `flushContentModifications` puis `moveFile`. Si on dépose entre deux fichiers frères, on réordonne et on garantit que les fichiers précèdent les sous-dossiers (drop `inside`).
- **Détection structurelle dans `processSectionsChange` :** Analyse les sections émises par la zone d'édition pour détecter, dans cet ordre :
  1. **Renommages** par appariement hiérarchique (orphelins de même niveau sous un parent commun).
  2. **Suppressions** de dossiers dont le chemin a disparu du texte (en évitant les doublons via ancêtres orphelins).
  3. **Suppressions de fichiers additionnels** par diff entre IDs présents en arbre et IDs présents dans `additionalFiles`.
  4. **Déplacements de fichiers additionnels** (parent réel ≠ folderId de la section).
  5. **Déplacements d'images** détectés via présence d'un marqueur `{{IMG:id}}` dans une section dont le `folderId` diffère du parent réel de l'image.
  6. **Créations** de sections (parents avant enfants).
  7. **Création des `contenu.md` manquants** dans les dossiers existants.
- **Sauvegarde de contenu :** Faite **après** les opérations structurelles mais **avant** `loadFiles()` pour éviter qu'un rechargement n'écrase le texte fraîchement édité. Chaque diff de contenu est tracké via `WoActionHistoryService`. Création à la volée des fichiers additionnels manquants (`af.fileId === undefined`).
- **Synchronisation d'ordre (`orderedFileIds`) :** Après les saves, l'ordre textuel des fichiers dans chaque section est réappliqué via `updateStructure` si différent de l'ordre courant. Si aucun `loadFiles()` n'a été déclenché plus tôt dans le cycle de sauvegarde (pas de création/suppression structurelle ni de fichier additionnel), un `loadFiles()` est exécuté **avant** de prendre le snapshot de `this.files()` transmis à `updateStructure`. Sans ce rechargement préalable, le snapshot serait antérieur à l'upload d'une éventuelle nouvelle image, ce qui écraserait le nœud image fraîchement créé dans `config.json`.
- **Map des images imbriquées :** À chaque `onSectionsChange`, recalcule `nestedImagesMap` à partir des `additionalFiles[].orderedChildIds` pour permettre à la sidebar d'afficher les images sous leur document parent.
- **Concurrence :** Un mutex `isSaving` empêche les saves concurrents ; le dernier batch est mis en attente dans `pendingSections`.
- **Statut de sauvegarde :** Cycle `idle → dirty → saving → saved → idle` (timer de 2 s sur `saved`, 3 s sur `error`). `onSaveStarting` permet à la zone éditeur d'afficher immédiatement « Sauvegarde… » sans attendre l'analyse asynchrone.
- **Historique & Diff :** Cliquer une entrée dans l'onglet Historique (`onHistoryEntryClick`) bascule la zone centrale en mode `projet-diff` (`diffEntry()` non nul). `closeDiff()` revient à l'éditeur.
- **entityId des actions image :** Les actions `upload` et `delete` d'image sont tracées avec l'ID du **dossier parent** (`folderId`) comme `entityId`, et non l'ID de l'image elle-même. En effet, `activeHistoryIds` est un `computed()` dérivé de `this.files()` : une fois l'image supprimée, son nœud quitte `files()` et son ID disparaît du Set — filtrant toutes les entrées d'historique qui le référençaient. Le `folderId` reste lui toujours présent tant que la section existe, ce qui garantit que les entrées « Import d'image » et « Suppression d'image » restent visibles dans le panneau historique après la suppression.
- **Patch local après save :** `patchFileContent` met à jour le signal `files` après update serveur sans recharger, garantissant qu'un démontage/remontage de l'éditeur (ex : ouverture du diff) reconstruit depuis le contenu à jour.
- **Création de section depuis la sidebar :** `onFolderCreated` appelle `appendSection` (racine) ou `insertSectionInParent` (sous-dossier) sur la zone éditeur pour synchroniser le texte du `contenu.md`.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Chargement du projet :** un ID invalide redirige vers `/projets`. Le projet valide charge l'arborescence, ouvre la connexion collab, et passe `editorMode` à `true`.
2. **Glisser-Déposer (Drag & Drop) :**
   - Déplacer un dossier au même niveau pour le réordonner.
   - Déplacer un dossier à l'intérieur d'un autre (changement de parent).
   - Déplacer un fichier additionnel et vérifier qu'il ne devient jamais "orphelin" (à la racine).
   - Réordonner deux fichiers frères dans un même dossier (Doc1 ↔ Doc2 ↔ Doc3).
   - Drop `inside` d'un fichier dans un dossier contenant déjà des sous-dossiers : les fichiers doivent précéder les sous-dossiers.
3. **Mise à jour de la structure (`onSectionsChange`) :**
   - Créer une nouvelle section et vérifier sa création côté backend, l'ajout à l'historique, et la création automatique de `contenu.md`.
   - Renommer une section et vérifier la mise à jour (trackée en `update` avec label « Renommage »).
   - Supprimer une section (et son sous-arbre) sans déclencher de suppressions parasites sur ses descendants déjà orphelins.
   - Déplacer une image entre sections via marqueur `{{IMG:id}}` et vérifier qu'elle change de dossier.
   - Supprimer un fichier additionnel via le texte et vérifier la suppression côté serveur.
4. **Ordre des fichiers (`orderedFileIds`) :** modifier l'ordre des blocs document dans le texte et vérifier que `updateStructure` ré-aligne `order` côté serveur. Insérer une image entre deux images existantes puis sauvegarder : vérifier que l'image n'est **pas supprimée** du serveur (le snapshot `updateStructure` doit inclure le nouveau nœud image).
4b. **Historique image après suppression :** uploader une image dans une section, vérifier qu'une entrée « Import d'image » apparaît dans le panneau Historique, puis supprimer cette image et vérifier que (a) l'entrée « Import d'image » reste visible, (b) une entrée « Suppression d'image » apparaît, et (c) aucune image fantôme n'est affichée à l'écran après la suppression.
5. **Sauvegarde de fichier (`onFileSave`) :** statut `saving → saved → idle`, communication avec le backend.
6. **Concurrence :** déclencher deux `sectionsChange` rapprochés et vérifier qu'aucun batch n'est perdu (le second passe par `pendingSections`).
7. **Panneau zone 5 — onglets :**
   - Bascule `Conversation` ↔ `Historique` via `zone5Tab`.
   - Sélection d'un dossier : l'historique affiche le sous-arbre complet ; sélection d'un `contenu.md` : équivalent au dossier parent ; sélection d'un fichier additionnel : seul ce fichier.
   - Le titre du nœud actif (icône + nom) s'affiche sous les onglets.
8. **Diff via historique :** cliquer une entrée d'historique remplace la zone d'édition par `projet-diff` ; `closeDiff()` revient à l'éditeur sans perte d'état.
9. **Nettoyage :** `ngOnDestroy` remet `editorMode` à `false`, efface l'ID de projet courant, ferme la connexion collab et nettoie les timers.
