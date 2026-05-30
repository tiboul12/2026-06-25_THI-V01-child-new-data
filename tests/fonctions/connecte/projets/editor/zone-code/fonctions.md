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
- **Barre Code pending** : `showCodePublishBar` → Annuler | Partager
- **Annuler** : `cancelCodeEdit()` → restaure le snapshot, libère les verrous
- **Partager** : `publishCodeEdit()` → `updateFile(..., publish=true)` → push FTP/Git + SSE broadcast

---

## `2-5-2-4-10` — Snapshot pre-édition vue document (sans focus)

- **Premier keystroke** (hors mode focus) : `codeDocSnapshot = lastSavedContent`
- **Annuler vue document** : restaure le snapshot entier du document
- **Partager vue document** : publie toutes les sections du document

---

## `2-5-2-4-11` — Sections et parsing

- **Détection headings** : regex `^(#{1,4}) (.+)$` → niveaux 1-4
- **Niveaux** : `#` = niveau 1, `##` = niveau 2, `###` = niveau 3, `####` = niveau 4
- **SectionRanges** : `{ folderId, lineStart, lineEnd }` pour chaque section
- **FileRanges** : `{ fileId, lineStart, lineEnd }` pour les blocs fichiers additionnels

---

## `2-5-2-4-12` — Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| Ctrl+S | Forcer la sauvegarde |
| Escape | Fermer menu slash commands |
| / | Ouvrir menu slash commands (si début de ligne) |
| Tab | Indentation |

---

## `2-5-2-4-13` — États

| État | Description |
|------|-------------|
| Mode normal | Textarea pleine largeur |
| Mode focus | Seule la section sélectionnée visible |
| Dirty | Badge orange dans toolbar |
| Saving | Spinner |
| Erreur upload image | Toast rouge |
| Sections repliées | Indicateur `[...]` sur la ligne repliée |
| Slash menu ouvert | Menu flottant au curseur |
| Section verrouillée | Barre Annuler/Partager visible |
| Barre cross-mode | Barre persistante si switch de mode avec pending |
| Lecture seule FTP | `[readonly]` sur textarea si section en cours de sync |
