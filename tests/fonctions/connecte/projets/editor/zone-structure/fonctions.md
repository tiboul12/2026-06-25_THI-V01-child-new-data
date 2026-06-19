# Éditeur › Zone 4 — Mode Structure — Fonctions métier

Composant : `ProjetEditorZoneComponent` — onglet "Structure"  
Vue : arborescence éditable des sections du document

---

## `2-5-2-6-1` — Affichage de la structure

- **Arborescence visuelle** : liste des sections (H1-H4) avec indentation selon le niveau
- **Badges de niveau** : H1, H2, H3, H4 colorés
- **Nom de section** : éditable inline
- **Contenu** : texte principal de la section (éditable)
- **Blocs additionnels** : fichiers Markdown secondaires d'une section (éditables)
- **Marqueur Trello masqué** : `{{TRELLO:id}}` est extrait du contenu (`StructureNode.trelloMarkers`) et n'apparaît pas dans la textarea ; ré-injecté en fin de section à la sauvegarde. Le board s'affiche en zone basse (voir `2-5-2-5-16`)
- **Bloc trello.md masqué** : le fichier `trello.md` généré automatiquement (contenu des cards) est détecté comme bloc additionnel de titre "trello" (`structNodeShowBlock` retourne `false`). Les headings `##` de ce fichier ne brisent pas le parsing de structure grâce à la pré-détection des plages de blocs dans `parseStructureNodes`
- **Barre Mega-outils masquée** : en mode Structure, la barre "MEGA-OUTILS / Trello / Mockup" n'est pas affichée — seul le panel Trello/Mockup en zone basse reste visible
- **Filtre par sélection** : si un nœud est actif dans la sidebar → `filteredStructureNodes` n'affiche que la section et ses enfants

---

## `2-5-2-6-2` — Édition inline d'une section

- **Focus sur le nom** : clic sur le titre d'une section → input inline
  - `applyStructLock(entityId)` → verrou si projet backup
  - Snapshot du contenu avant modification → `structEntitySnapshots`
- **Focus sur le contenu texte** : clic sur le corps → bloc **rendu formaté éditable** (contenteditable, `.struct-card__content--rich`) — identique au mode Edition : on voit le texte mis en forme, **pas le code Markdown** (vB-0.282)
  - Rendu via `structSegHtml` (marked) injecté par `initStructSegments` (ngAfterViewChecked, sans écraser la frappe) ; saisie reconvertie en Markdown par `onStructSegmentHtmlInput` (`htmlSectionToMarkdown`)
  - Lock de la même entité (`onStructSegmentFocus`)
- **Focus sur un bloc additionnel** : clic → textarea du bloc
  - Lock sur l'entité bloc (`fileId` ou `blockId`)
- **Modifications** : mises à jour dans `unifiedContent` via `structureNodes`
- **Auto-save** : `structFlushTimeout` → flush et sauvegarde après 500ms d'inactivité

---

## `2-5-2-6-3` — État pending (projets backup)

- **Premier edit** : `applyStructLock(entityId)` → `structEntityLocks.add(entityId)`, `collab.addLocalPending(entityId)`, `collab.lockNode()`
- **Barre Structure** : `structureHasPending()` → visible si au moins un lock structure actif
- **Annuler** : `cancelStructureEdit()` → restaure depuis `structEntitySnapshots`, libère les locks
- **Partager** : `publishStructureEdit()` → publie toutes les entités modifiées vers le serveur distant

---

## `2-5-2-6-4` — Annuler une modification structure

- **Portée** : uniquement l'entité ayant le focus (`structFocusedEntityId`)
- **Restauration** : contenu avant modification depuis `structEntitySnapshots`
- **Libération lock** : `collab.unlockNode(projectName, entityId)`, `structEntityLocks.delete(entityId)`
- **Si plus de locks** : `structureHasPending.set(false)`

---

## `2-5-2-6-5` — Partager (publier) les modifications structure

- **Flush** : `flushStructureNodes()` → applique tous les changements dans `unifiedContent`
- **Parse** : `parseContent()` → reconstruit les sections avec nouveaux contenus
- **Publish** : `svc.updateFile(..., publish=true)` pour chaque section modifiée
- **Nettoyage** : libère tous les locks, vide `structEntityLocks`, `structureHasPending.set(false)`

---

## `2-5-2-6-6` — Insertion de blocs additionnels

- **Nouveau document dans une section** : bouton "+" dans l'en-tête de section → nom → création
  - POST `/api/file-projects/{name}/files` dans le dossier de la section
  - Bloc inséré dans `unifiedContent` avec délimiteur `~~~NomFichier~~~`

---

## `2-5-2-6-7` — Règle de verrouillage

- **Projets sans backup** : `applyStructLock` ne crée PAS de verrou — aucune UI Annuler/Partager
- **Projets avec backup** : verrou créé, barre Structure visible

---

## `2-5-2-6-8` — Correspondance Structure ↔ Code

- Les modifications en mode Structure sont reflétées en temps réel dans `unifiedContent`
- Un changement de nom de section en Structure → renommage du dossier physique (via `onSectionsChange`)
- Un contenu modifié en Structure → mis à jour dans le fichier `contenu.md` correspondant

---

## `2-5-2-6-9` — États

| État | Description |
|------|-------------|
| Vue complète | Toutes les sections du projet affichées |
| Vue filtrée | Section sélectionnée + enfants uniquement |
| Section en édition | Input/textarea visible sur l'entité |
| Lock actif | Badge cadenas rouge sur la section |
| Barre Structure visible | Annuler/Partager en haut (projets backup) |
| Barre cross-mode visible | Pending Code + Structure simultanément |
| Aucune section | Message "Document vide" |

---

## `2-5-2-6-10` — Suppression d'image unifiée (tag Structure)

- **Déclenchement** : clic × sur le tag image d'une section → `removeImageMarker(seg.imageId)` → `deleteImageUnified(id)`
- **Nettoyage du marqueur `{{IMG:id}}`** dans toutes les sources de vérité Structure :
  - `node.textContent` de chaque nœud
  - `node.additionalBlocks[].content` (blocs fichiers `'…'`, `` `…` ``, `^…^`) — sinon le tag persiste
  - `fullContentBackup` (backup plein quand une section est en focus) — sinon le fichier n'est jamais supprimé
- **Reconstruction** : `flushStructureNodes()` → `unifiedContent` + sauvegarde, puis `parseStructureNodes()` rafraîchit les tags
- **Suppression physique** : si plus aucune référence `{{IMG:id}}` (dans `unifiedContent` ni `fullContentBackup`) → `svc.deleteFile(projectName, imgId)` → l'image disparaît du dossier
- **Cohérence inter-modes** : le même `deleteImageUnified` est appelé depuis Code, Édition et Structure → comportement identique partout

---

## `2-5-2-6-11` — Création de titre via popup (Structure)

- **Nouvelle section racine** : bouton « + Nouvelle section » en tête de la vue Structure → `openTitleDialogStructRoot()` (niveau 1, parent = racine).
- **Sous-titre** : menu contextuel d'un nœud (si `level < 4`) → « Ajouter un sous-titre » → `openTitleDialogStructChild(node)` (niveau = `node.level + 1`, parent = le nœud).
- **Création** : identique au mode Édition (`createTitleSection` insère le heading à la position d'ancrage puis `saveAll()` ; le parent crée le dossier, l'ordonne et re-parent), via le composant partagé `worg-title-create-dialog`.
- **Persistance du SID** : `parseStructureNodes` extrait le SID dans `node.sid` (titre nettoyé) ; `flushStructureNodes` le réinjecte via `composeHeading(level, title, node.sid)`. Renommer un titre en Structure renomme le dossier physique sans le perdre (matching par SID dans `processSectionsChange`).

---

## `2-5-2-6-12` — Changer le niveau d'une section (clic droit)

- **Déclenchement** : menu contextuel d'un nœud Structure → « Monter d'un niveau » (−1) ou « Descendre d'un niveau » (+1).
- **Sémantique = outdent / indent de plan** (le niveau = profondeur dans l'arbre) :
  - **Monter** : la section remonte d'un niveau et **récupère les sections suivantes** comme enfants ; les sections **précédentes** restent en place.
  - **Descendre** : la section se **niche sous sa sœur précédente**. Son sous-arbre suit.
- **Mécanisme** : `changeHeadingLevel(folderId, ±1)` modifie le nombre de `#` de la **ligne de heading** (marqueur `{{SID}}` préservé) puis `saveAll()` ; le re-parentage des dossiers et la normalisation de profondeur (`buildDocSections`) sont appliqués par `processSectionsChange`.
- **Disponibilité** : Monter si `level > 1` ; Descendre s'il existe un frère précédent **et** que la profondeur max du sous-arbre reste ≤ 4 (`canPromoteStructNode` / `canDemoteStructNode`).
- **Flux** : menu Structure → `changeStructNodeLevel` → `changeHeadingLevel` (direct) ; sidebar → `nodeLevelChange` → `onNodeLevelChange` → `editionOutil.changeHeadingLevel`.
