# Éditeur › Zone 4 — Mode Code — Fonctions métier

Composant : `ProjetEditorZoneComponent` — onglet "Code"  
Vue : textarea Markdown à gauche, rendu HTML miroir à droite

---

## `2-5-2-4-1` — Saisie et édition

- **Textarea principale** : saisie libre du contenu Markdown unifié (toutes sections du projet)
- **Auto-save** : délai 2s après dernière frappe → `scheduleSave()` → `saveAll()`
- **Sauvegarde forcée** : clic badge "Non sauvegardé" → `forceSave()`
- **Dirty state** : `localDirty = true` dès la première frappe → emit `dirtyChange(true)`
- **Contenu unifié** : toutes les sections (`## Nom dossier`) concaténées en un seul document
- **Retour à la ligne automatique** : `white-space: pre-wrap` + `overflow-wrap: break-word` — le texte long passe à la ligne sans ascenseur horizontal; `overflow-x: hidden` sur mirror et textarea
- **Redimensionnement** : la zone s'étend dynamiquement selon la fenêtre via `:host { flex: 1; min-width: 0 }`

---

## `2-5-2-4-2` — Mode Focus (section sélectionnée dans la sidebar)

- **Activation** : sélection d'un dossier dans la sidebar → `applyFocusByActiveNode()` → `enterFocusMode(handle)`
- **Vue focusée** : seul le contenu de la section sélectionnée est affiché dans le textarea
- **Sauvegarde du contexte** : `fullContentBackup` conserve le document complet, `focusedLineStart` et `focusedOriginalLineCount` mémorisent la position
- **Sortie de focus** : changement de mode (→ Structure/Preview) → `exitFocusMode()` → merge du contenu
- **Mode focus sur image** : si le nœud est une image, affiche le marqueur `{{IMG:id}}` uniquement

---

## `2-5-2-4-3` — Rendu miroir (aperçu)

- **Synchronisation** : le HTML rendu suit le scroll de la textarea
- **Highlights** : sections surlignées selon `highlightNodeId`
- **Scroll auto** : `scrollToNodeId` → défile vers la section demandée
- **Rendu Markdown** : via `marked`
- **Marqueur Trello** : `{{TRELLO:id}}` est présent dans le texte brut ; le board Trello complet est affiché dans le panneau bas (voir `2-5-2-4-15`)

---

## `2-5-2-4-4` — Slash commands (/)

- **Déclenchement** : saisie `/` en début de ligne → affiche `SlashCommandMenuComponent`
- **Options** : `/nouveau dossier`, `/nouveau fichier`, `/table`, `/code`, `/liste`, `/titre`, etc.
- **Sélection** : Enter ou clic sur l'option → insère le contenu approprié
- **Fermeture** : Escape ou clic ailleurs

---

## `2-5-2-4-5` — Insertion de formatage

Via les boutons de la toolbar (voir toolbar/fonctions.md) ou raccourcis :
- **Gras** : sélection + Ctrl+B
- **Italique** : sélection + Ctrl+I
- **Insertion à la position curseur** : les boutons H1-H4, liste, séparateur, etc.

---

## `2-5-2-4-6` — Gestion des images (mode Code)

- **Upload** : clic bouton image (toolbar) → input file → POST `/api/file-projects/{name}/files` (multipart)
- **Types acceptés** : jpeg, jpg, png, gif, webp, svg, bmp
- **Insertion** : marqueur `{{IMG:uuid}}` inséré à la position du curseur dans le texte
- **Affichage** : rendu comme `<figure>` dans le miroir HTML
- **Erreur upload** : toast rouge avec message d'erreur (cliquable pour fermer)

---

## `2-5-2-4-7` — Repliage de sections (folding)

- **Replier une section** : clic sur le handle de la section → `foldSection(sectionId)`
  - Contenu de la section masqué dans la textarea (indicateur `[...]`)
  - Auto-save bloqué si sections repliées
- **Déplier** : clic handle → `unfoldSection(sectionId)`
- **Déplier tout** : `unfoldAll()` → lors du changement de mode ou sortie focus

---

## `2-5-2-4-8` — Drag & Drop dans la zone Code

- **Drag handles** : icônes de déplacement sur les sections, fichiers, images
- **Réorganisation** : glisser-déposer → repositionne dans le document Markdown
- **Sections** (dossiers) : déplacement de blocs Markdown complets
- **Fichiers additionnels** : documents secondaires dans une section
- **Images** : déplacement des marqueurs `{{IMG:id}}` entre sections

---

## `2-5-2-4-9` — Gestion des verrous et état "en attente" (projets backup)

- **Premier keystroke dans une section** : snapshot du contenu → `codeSectionSnapshots`
- **Lock granulaire** : verrouillage de l'entité précise (fichier ou bloc)
  - `collab.lockNode(projectName, entityId)`
  - `activeEntityLocks: Set<entityId>`
- **Affichage** : badge rouge sur le nœud dans la sidebar
- **Partager / Annuler depuis le menu de la section** (vB-0.279) : les actions sont déclenchées depuis le **menu contextuel de la sidebar** (voir `2-5-2-2-9`), et non plus depuis une barre en bas de zone. La zone écoute `collab.publishSectionRequest$` / `cancelSectionRequest$` (abonnement `takeUntilDestroyed` dans le constructeur) → `publishSection(sectionId)` / `cancelSection(sectionId)`.
  - **Portée = sous-arbre** : publier/annuler une section traite la section **ET ses sous-sections modifiées** (descendants `pending`). `collectSectionPublishIds(sectionId)` = `{ sectionId }` ∪ descendants (`getDescendantFolderIds`) qui sont `isLocalPending` ∪ dossiers des entités granulaires verrouillées du sous-arbre. Les sous-sections **non modifiées** ne sont jamais écrites (pas de `publish=true` superflu).
  - **`publishSection(sectionId)`** : indépendant du mode/focus. Calcule `publishFolderIds` (sous-arbre) et capture les entités verrouillées **avant** le flush, reconstruit le document si focus, parse, écrit avec `publish=true` les fichiers dont `folderId ∈ publishFolderIds`, exécute les suppressions d'images différées, puis `releaseSectionsPending()` + `unlockNode()` pour chaque dossier.
  - **`cancelSection(sectionId)`** : restaure chaque section du sous-arbre depuis `codeSectionSnapshots` (remplacement par plage via `sectionRanges`, **du bas vers le haut** pour préserver les indices de ligne), restaure les images annulées, `recomputeAll()` + `saveAll()`, puis `releaseSectionsPending()` + `unlockNode()`.
  - **`releaseSectionsPending(folderIds, lockedEntityIds)`** : libère verrous + pending de l'ensemble de sections et de leurs entités granulaires (blocs/fichiers), nettoie `codeSectionSnapshots`, `dirtyVisuSectionIds`, `visuSectionLockSnapshot`, `editingVisuSectionId`, `cursorEntityId`.
- **Barre du bas** : ne contient plus de boutons Annuler/Partager pour le mode Code (`showCodePublishBar` / `showCrossModePendingBar` n'affichent qu'un libellé « Modifications en cours — partager via le menu de la section »). La **barre Preview** (mode visu) a été **supprimée** (vB-0.282) : partage/annulation via le menu contextuel de la section. Seule la barre Structure (`structureHasPending`) conserve ses boutons.
- **Portée du partage (mode focus, `publishCodeEdit`)** : seules les sections **réellement éditées** sont publiées et déverrouillées. `publishFolderIds` est calculé depuis `activeEntityLocks` (mappés vers leur `folderId` via `modifiedEntities`), sinon la section ciblée. Le document complet est reconstruit uniquement pour résoudre les `folderId` des sous-sections ; les sections enfants **non modifiées ne sont pas écrites** avec `publish=true`, donc elles restent verrouillées (correctif : sans ce filtre, toutes les sous-sections enfants étaient partagées + déverrouillées côté serveur)

---

## `2-5-2-4-10` — Snapshot pre-édition vue document (sans focus)

- **Premier keystroke** (hors mode focus) : `codeDocSnapshot = lastSavedContent`
- **Annuler vue document** : restaure le snapshot entier du document
- **Partager vue document** : publie toutes les sections du document

---

## `2-5-2-4-11` — Sections et parsing

- **Détection headings** : regex `^(#{1,4}) (.+)$` → niveaux 1-4
- **Niveaux** : `#` = niveau 1, `##` = niveau 2, `###` = niveau 3, `####` = niveau 4
- **SectionRanges** : `{ folderId, lineStart, lineEnd }` pour chaque section. Le mappage titre→`folderId` itère dans l'ordre du **buffer** (`flatHeads`, ce que l'utilisateur voit) et associe chaque titre à un `docSection` non encore consommé (level + name) — robuste même quand l'ordre du buffer diverge de l'ordre stocké des fichiers (cas de la préservation du texte en mode Code, voir `2-5-2-4-16`). Sans cette logique, une section déplacée dans le code pointait vers le mauvais dossier (focus erroné à la navigation).
- **FileRanges** : `{ fileId, lineStart, lineEnd }` pour les blocs fichiers additionnels
- **Blocs-fichiers additionnels** : délimités par une ligne commençant par `'`, `` ` `` ou `^`. Les fences de code markdown ` ``` ` sont explicitement exclues (lookahead `(?!` + 3 backticks + `)` / garde `!startsWith('```')`) → un bloc de code ` ``` … ``` ` n'est jamais interprété comme un bloc-fichier ni reformaté à la sauvegarde

---

## `2-5-2-4-12` — Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| Ctrl+S | Forcer la sauvegarde |
| Escape | Fermer menu slash commands |
| / | Ouvrir menu slash commands (si début de ligne) |
| Tab | Indentation |

---

## `2-5-2-4-15` — Panneau Trello en mode Code

- **Affichage** : le panneau `app-trello-board` s'affiche dès que le marqueur ` ```TRELLO: NOM ` est présent dans la section active (voir `2-5-2-4-14`)
- **Synchronisation live** : le composant reste monté lors des changements de mode → les modifications (ajout/édition/déplacement de tâche) faites dans un mode sont immédiatement visibles dans les autres
- **SSE** : les mises à jour de collaborateurs (`trelloUpdate$`) sont reçues dans tous les modes puisque le board n'est jamais détruit
- **Propagation vers Code** : `@Output() cardsChanged` → `onTrelloCardsChanged` → `syncTrelloInlineBlock()` met à jour le bloc fencé inline **uniquement si le toggle Sync auto est activé** (voir `2-5-2-4-14`)

---

## `2-5-2-4-14` — Bloc Trello inline dans le contenu (mode Code)

- **Format** : bloc fencé ` ```TRELLO: NOM_DU_TRELLO ` inséré directement dans le markdown de la section
- **Structure** :
  ```
  ```TRELLO: Nom du board
  ### À faire
  - [ ] Titre task `[Haute]` — auteur · date
  ### En cours
  - [~] Task 2
  ```
  ```
- **Source de vérité = le code** : le marqueur ` ```TRELLO: NOM ` dans le contenu pilote l'existence du Trello (nœud sidebar, onglet MO, vue board). Le `folderId` DB n'est qu'un fallback de migration.
- **Insertion** : création d'un Trello → `confirmTrelloPopup()` crée l'instance DB + insère le bloc à la position du curseur. À la sauvegarde, le fence est parsé comme **fichier additionnel système** → fichier créé (nœud sidebar) via la réconciliation parente.
- **Carte de démarrage** (vB-0.281) : à la création d'un Trello vierge, une carte par défaut est ajoutée. `confirmTrelloPopup()` appelle `createTrelloCard(inst.id, { title:'Task test 1', status:'todo', priority:'medium', description:'Description Task test 1' })` (BDD) et insère le fence avec le corps généré par `buildDefaultTrelloBody()` :
  ```
  ### À faire
  - [ ] Task test 1 `[Normale]` — <user> · <jj/mm/aa>
    Description Task test 1
  ```
  La réconciliation par titre (`reconcileTrelloCardsFromCode`) évite tout doublon entre la carte BDD et la carte du code.
- **Création depuis le menu section** (vB-0.280) : le menu contextuel de la sidebar (voir `2-5-2-2-9`) propose « Ajout MO Trello » / « Ajout MO Tableau ». La zone écoute `collab.createMegaOutilRequest$` (abonnement `takeUntilDestroyed`) → mémorise `pendingMoFolderId` puis ouvre `openTrelloPopup()` / `openArrayPopup()`. `confirmTrelloPopup` / `confirmArrayPopup` utilisent `pendingMoFolderId` comme `folderId` de l'instance (fallback : curseur/section active) et insèrent le fence **en fin de section focalisée** (curseur déplacé en fin de textarea) pour qu'il appartienne bien à la section. `pendingMoFolderId` est réinitialisé à la confirmation/annulation.
- **Nom du nœud sidebar** : le fichier est nommé ` TL: NOM ` (préfixe ajouté par `parseContent`) ; le fence dans le code reste ` ```TRELLO: NOM `. `buildDocSections` retire le préfixe pour matcher l'instance, `reconcileTrelloLifecycle` l'ignore à la suppression.
- **Parsing** : `parseContent()` pré-scanne les fences Trello (exclut leurs `###` internes de la détection de sections) puis extrait chaque ` ```TRELLO: NOM … ``` ` en `AdditionalFile{name:NOM, content:body}` (retiré de `contenu.md`).
- **Re-sérialisation** : `buildDocSections()` re-sérialise un fichier lié à une instance trello (match `folderId`+nom) en fence ` ```TRELLO: NOM … ``` ` (au lieu du délimiteur `'`).
- **Affichage miroir** : la ligne d'ouverture ` ```TRELLO: NOM ` est affichée en **code brut** (classe `.ed-trello-fence`, plus de badge) ; le corps du bloc s'affiche normalement.
- **Vue board selon le mode** : le panneau `app-trello-board` (bas) est affiché **uniquement en mode Structure** (`mode === 'structure'`), pour la **section active** seulement. Masqué en Code et en Preview. `recomputeContentTrelloIds()` scope toujours à la section active (résolution fichier→dossier via `resolveActiveFolderId`).
- **Board visuel en Preview** : en mode Preview, le bloc Trello est rendu **inline** dans la zone d'édition sous forme de **kanban visuel** (4 colonnes, cartes titre + badge priorité + description) via `renderTrelloVisuHtml` (injecté dans `buildVisuSectionHtml`). Pas de panneau bas.
- **Tag graphique en Structure** : en mode Structure, le code brut du fence est remplacé par un **tag graphique bleu « TRELLO : NOM »** (`getStructBodySegments` émet un segment `trello`, bloc complet préservé). `parseStructureNodes` exclut les `###` internes du fence de la détection de headings.
- **Suppression / corruption** : à la sauvegarde, `reconcileTrelloLifecycle()` détecte qu'un marqueur vu auparavant a disparu (bloc effacé) ou n'est plus reconnu (ex: ` ```TREO: `) → supprime l'instance DB, émet `megaOutilDeleted` (onglet MO retiré), supprime le fichier `trello.md` (+`refresh`). Le texte corrompu restant est intégré à `contenu.md`, l'affichage de la section ne change pas. `seedSeenTrelloMarkers()` amorce le suivi au chargement pour ne jamais supprimer une instance legacy sans marqueur.
- **Migration** : l'ancienne syntaxe ` ```## Trello: NAME ` reste reconnue en lecture.
- **Élément à part entière / focus** : le fence a une `fileRange` (mappée au fichier `TL: NOM` via `recomputeRanges`) → un handle `file`. Cliquer sur le nœud sidebar `TL: NOM` met la zone Code en **mode focus** sur le seul bloc Trello. Clic sur l'onglet MO (`selectMegaOutil`, mode édition) → émet l'id du fichier Trello → même focus.
- **Label MO** : les onglets Trello dans la barre instances affichent `[trello:NOM]`
- **Sync bidirectionnelle code ↔ board** :
  - **board → code** : ajouter/modifier une carte → `onTrelloCardsChanged()` → `syncTrelloInlineBlock()` régénère le corps du fence (### colonnes + cartes). Le regex gère le bloc vide ` ```TRELLO: NOM\n``` ` (corps optionnel `(?:[\s\S]*?\n)?`).
  - **code → board/BDD** : à la sauvegarde, `reconcileTrelloCardsFromCode()` parse le corps du bloc et réconcilie les cartes en base (correspondance par **titre**) : ligne supprimée → carte supprimée, ligne ajoutée → carte créée, statut/priorité modifiés → carte mise à jour. Le board se rafraîchit via SSE. Helpers : `parseTrelloBodyCards`, `trelloLabelToStatus`, `trelloLabelToPriority`. Réconciliation limitée aux instances dont les cartes sont déjà chargées (anti-doublon au démarrage).
- **Toggle Sync auto** : bouton dans la barre des actions Trello (mode Code) → `trelloAutoSync` (signal, **activé par défaut**). Désactivé → `onTrelloCardsChanged()` n'appelle pas `syncTrelloInlineBlock()`, le code n'est jamais modifié automatiquement. Activé → le bloc inline se met à jour quand les cartes changent

---

## `2-5-2-4-16` — Préservation du texte exact en mode Code (vB-0.279)

- **Principe** : en mode Code, la saisie de l'utilisateur n'est plus réécrite/normalisée par la reconstruction. Le texte exact (lignes vides multiples, espaces de fin, `#` seul, indentation) est conservé tel que tapé.
- **Mécanisme** : un drapeau `localCodeSavePending` est armé dans `saveAll()` (vue document, hors focus) à l'émission du save, et **libéré uniquement à la fin du cycle** quand le `@Input saveStatus` repasse à `'idle'`/`'error'`. Quand le `@Input files` revient avec la nouvelle structure, `ngOnChanges` calcule `preserveCodeBuffer` (mode `edit`, hors focus, `hasStructuralChange`, sans `markersFixed`, drapeau actif) et **n'écrase pas** `unifiedContent`/textarea avec `reconstructFromSections()`.
- **Pourquoi pas un drapeau one-shot ni un délai fixe** : le parent (`processSectionsChange`) appelle `loadFiles()` **plusieurs fois** par cycle de save (création, fichiers additionnels, synchro d'ordre) → plusieurs émissions de `files`, le tout pendant `saveStatus === 'saving'`. Un one-shot consommé à la 1ʳᵉ émission, ou une fenêtre temporelle fixe (ex. 6 s) trop courte pour un save serveur lent, laissaient une émission tardive reconstruire et **réordonner** les sections. Lier la garde à `saveStatus` couvre tout le cycle quelle que soit sa durée.
- **Restructuration conservée** : les dossiers/sections sont toujours créés/renommés/supprimés côté parent (`processSectionsChange`). Seul le texte affiché est préservé ; `recomputeAll()` remappe les ranges sur le buffer conservé.
- **Changements externes** : un changement structurel ne provenant pas de la saisie Code (renommage/suppression via sidebar, drag, collaboration) garde `localStructuralSavePending = false` → reconstruction normale (le code reflète le changement).
- **Navigation préservée** : comme le buffer peut diverger de l'ordre des fichiers, `recomputeRanges` associe les titres aux dossiers **dans l'ordre du buffer** (voir `2-5-2-4-11`) → cliquer une section dans la sidebar focus bien la bonne section dans la zone Code.
- **Réordonnancement de sections dans le code → menu + dossiers physiques** : changer l'ordre des `###` directement dans le code réordonne les dossiers de section sans toucher au texte. Côté parent (`processSectionsChange`, étape 7), `applySectionFolderOrder()` regroupe les `folderId` par parent dans l'ordre d'apparition dans le document et met à jour `folder.order` (clé de tri du menu sidebar **et** de `buildDocSections`), persisté via `updateStructure()` + `loadFiles()`. Le menu et les dossiers physiques suivent le code ; l'ordre fichiers == ordre buffer rétablit la cohérence (plus de divergence à terme).
- **Limite connue** : au rechargement du projet, le contenu est reconstruit depuis les fichiers → la version normalisée s'affiche (le texte exact n'est pas persisté verbatim).

---

## `2-5-2-4-17` — Système double fichier : Markdown propre + jumeau stylisé (vB-0.283)

Objectif : garder un `contenu.md` **propre** (Markdown standard uniquement) pour l'IA, et déporter les styles non-markdown (couleur, surlignage, taille, soulignage, alignement) dans un **jumeau `contenu-css.md`**.

- **Invariant** : `stripStyleMarkdown(contenu-css.md)` == `contenu.md` (texte affiché identique). Utilitaires dans `apps/projets/src/app/pages/projet-editor/content-style.util.ts` : `stripStyleMarkdown`, `mergeCleanIntoStyled`, `cssTwinName`, `isCssTwinName`.
- **Master = stylisé** : le buffer (`unifiedContent`) provient du jumeau `-css.md` (`buildDocSections`). Le Markdown standard (`**`, `*`, `#`, listes, liens, code) reste dans le contenu ; seul le HTML de style va dans le jumeau.
- **Images en Markdown standard** (vB-0.284) : dans le fichier propre (`contenu.md`, vu par l'IA en mode Code), les marqueurs `{{IMG:id}}` sont convertis en image Markdown `![alt](nom-fichier)` (chemin = nom du fichier image, situé dans le dossier de la section ; alt = légende ou nom sans extension). Géré par `stripStyleMarkdown(md, imgResolver)` (résolveur `cleanImgResolver` côté zone et parent). Le jumeau stylisé garde `{{IMG:id}}` ; le round-trip est assuré par `mergeCleanIntoStyled` (mapping ligne clean ↔ styled).
- **Styles markdown-compatibles toujours en Markdown** : gras `**…**`, italique `*…*`, barré `~~…~~` sont écrits en **Markdown dans les deux fichiers** (jamais en `<b>`/`<span style="font-weight">`). `normalizeStyledMarkdown` convertit toute balise `<b>/<strong>/<i>/<em>/<s>/<del>` en Markdown avant écriture du jumeau et au chargement. Le `-css.md` n'ajoute du HTML que pour les styles **sans** équivalent Markdown (couleur, surlignage, taille, soulignage, alignement). Exemple : `<span style="color:purple">**gras**</span>`.
- **Lecture / réconciliation IA→app** : si `contenu.md` (propre) diverge de `strip(jumeau)` (édition externe par l'IA), `buildDocSections` fusionne via `mergeCleanIntoStyled` (texte IA prioritaire, styles conservés sur les lignes inchangées).
- **Écriture** : à chaque sauvegarde, `contenu.md = strip(styled)` et `contenu-css.md = styled`. Auto-save : côté parent (`processSectionsChange` + `saveCssTwin`). « Partager » : côté zone (`writeSectionStyled`, publish des deux fichiers). Création/orphelins : le jumeau est exclu des fichiers additionnels et jamais supprimé comme orphelin.
- **Fusion ligne par ligne** : les lignes inchangées gardent leur style, les lignes modifiées/ajoutées repassent en texte brut (si le nombre de lignes diverge → styles abandonnés, invariant préservé).
- **Toggle « Markdown propre / Avec style »** (`showCssInCode`) : en mode Code, vue **lecture seule du Markdown propre** par défaut (`.ed-clean-view` = `codeCleanView` = `strip(unifiedContent)`) ; bascule pour afficher/éditer le contenu stylisé (textarea + miroir habituels).
- **Sidebar** : `contenu.md` et `*-css.md` sont masqués de l'arborescence.
- **Tableaux/éléments riches stylés** : restent gérés par le MO Array (style en base), hors périmètre du double fichier.

---

## `2-5-2-4-13` — États

| État | Description |
|------|-------------|
| Mode normal | Textarea pleine largeur |
| Mode focus | Seule la section sélectionnée visible |
| Dirty | Badge orange dans la barre d'info (bas de zone) |
| Saving | Spinner |
| Erreur upload image | Toast rouge |
| Sections repliées | Indicateur `[...]` sur la ligne repliée |
| Slash menu ouvert | Menu flottant au curseur |
| Section verrouillée | Barre Annuler/Partager visible |
| Barre cross-mode | Barre persistante si switch de mode avec pending |
| Lecture seule FTP | `[readonly]` sur textarea si section en cours de sync |
| Section verrouillée (autre user) | Lecture seule **totale** : textarea code, inputs Structure, board Trello (`readonly`), board Array, insertions toolbar/slash. Getters `isActiveSectionLockedByOther` / `isTrelloInstanceLocked` / `isArrayInstanceLocked` / `isStructNodeLocked` |

---

## `2-5-2-4-18` — Suppression d'image par effacement de la ligne {{IMG:id}}

- **Déclenchement** : l'utilisateur efface manuellement la ligne `{{IMG:id}}` dans la textarea Code → `onTextareaInput` → `scheduleSave` → `saveAll` → `reconcileImageLifecycle(content)`
- **Détection** : toute image de `this.files` non référencée par un `{{IMG:id}}` dans le contenu (et hors `recentlyAddedImageIds` / `pendingLocalImages`) est candidate à la suppression
- **Suppression physique** (cohérente avec `deleteImageUnified`) :
  - Projet **backup** : différée au Partager via `pendingVisuDeletions` (le contenu publié référence encore l'image — un `deleteFile` immédiat échouerait) + garde `recentlyDeletedImageIds`
  - Projet **local** : `svc.deleteFile` immédiat
- **Réconciliation inverse** : une image redevenue référencée (couper/coller, undo, ré-ajout) est retirée de `recentlyDeletedImageIds` / `pendingVisuDeletions` et restaurée dans `allImages`
- **Garde anti-réapparition** : `recentlyDeletedImageIds` (durable) empêche `buildDocSections` de ré-injecter l'image tant que son nœud subsiste dans `this.files`

---

## `2-5-2-4-19` — Identifiant stable de section `{{SID:folderId}}`

- **Format** : chaque heading porte en fin de ligne un marqueur `{{SID:<folderId>}}` (ex. `## Présentation {{SID:c7e0205f-…}}`) qui lie de façon **stable** la section à son dossier physique, indépendamment du nom et de l'ordre.
- **Origine** : dérivé du dossier par `buildDocSections` (`composeHeading(level, name, folderId)`) → présent après chaque reconstruction (`reconstructFromSections`). Les projets sans SID sont **migrés automatiquement** au premier chargement.
- **Visibilité** : visible en mode Code (buffer brut, comme `{{IMG:}}`/`{{TRELLO:}}`) mais **atténué** (opacité réduite) dans le mirror ; **masqué** en modes Structure et Édition.
- **Rôle anti-régression** : `parseContent` et `recomputeRanges` résolvent le `folderId` **prioritairement par SID** (puis chemin slugifié, puis nom). Le renommage d'un titre ou le réordonnancement ne perd plus le lien section↔dossier et ne crée plus de dossier parasite.

---

## `2-5-2-4-20` — Re-parentage automatique sur changement d'imbrication

- **Principe** : insérer/déplacer un titre en mode Code modifie l'imbrication markdown des sections suivantes → leurs dossiers physiques sont **déplacés** en conséquence (`processSectionsChange` → `moveFolder`).
- **Exemple** : insérer un `## H2` au milieu d'une suite de `### H3` → les H3 **suivants** deviennent enfants du nouveau H2 ; les H3 **au-dessus** restent rattachés à l'ancien H2.
- **Mécanique** : pour chaque section identifiée par son `{{SID}}`, le parent textuel (imbrication courante) est comparé au parent physique ; en cas de différence → `moveFolder(folderId, targetParentId)`. Tri parents→enfants ; promotion en racine → ajout à `outil.rootFolderIds`.
- **Robustesse** : l'identité étant garantie par le SID, le déplacement ne provoque jamais de recréation/suppression. Déclenché même sans autre changement structurel (`needsReparent` dans `hasStructural`).
- **Résolution du parent** : le parent textuel est la section précédente de niveau **strictement inférieur** le plus proche (pas forcément `level-1`), avec réinitialisation des niveaux plus profonds. Gère les sauts de niveau (ex. insérer un H1 entre des H3).
- **Normalisation de niveau** : le niveau d'affichage d'un titre = sa **profondeur** dans l'arbre de dossiers (`buildDocSections`, `level = depth`). Conséquence : insérer un H1 au milieu de H3 → les H3 suivants, devenus enfants directs du H1, sont automatiquement **remontés en H2** (profondeur 2), uniquement dans la nouvelle section. Les titres au-dessus du H1 sont inchangés.

---

## `2-5-2-4-21` — Annuler / Refaire (Ctrl+Z / Ctrl+Y) en mode Code

- **Boutons** : `undo` et `redo` (icônes Material) en **première position** dans la barre de style (mode Code, vue « Avec style »). Bouton Annuler grisé si pile vide, Refaire grisé si rien à refaire.
- **Raccourcis** : Ctrl+Z → annuler, Ctrl+Y (ou Ctrl+Shift+Z) → refaire. Interceptés dans `onTextareaKeydown`.
- **Pile custom** (`codeUndoStack` / `codeRedoStack`) : captures de `{ content, selStart, selEnd }`, max 200 entrées.
  - **Avant chaque action toolbar** (`insertAt`, `codeClearFormat`) : snapshot immédiat (`pushCodeUndoSnapshot`).
  - **Frappe au clavier** : snapshot debounce 800 ms (`scheduleCodeSnapshot` dans `onTextareaInput`).
  - Toute action annulée alimente `codeRedoStack` et vice-versa ; le Redo est effacé dès une nouvelle action.
- **Restauration** : `applyCodeSnapshot` → `unifiedContent = snap.content`, `ta.value = snap.content`, repositionnement du curseur, `recomputeAll()`, `scheduleSave()`.
