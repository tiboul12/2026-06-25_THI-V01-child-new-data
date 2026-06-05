# Éditeur › Zone 4 — Mode Preview — Fonctions métier

Composant : `ProjetEditorZoneComponent` — onglet "Preview"  
Vue : rendu HTML des sections, éditables directement par clic (contenteditable)

---

## `2-5-2-5-1` — Affichage du rendu

- **Sections éditables** : chaque dossier du projet est une section `<div class="visu-section-wrap">`
- **En-tête** : nom du dossier affiché en H1/H2/H3/H4 selon le niveau (non éditable)
- **Corps** : contenu Markdown rendu en HTML, éditable via `contenteditable="true"`
- **Images** : affichées dans leur contexte de section
- **Filtre** : `filteredVisuSections` — si un dossier est actif dans la sidebar → seule la section sélectionnée + enfants sont affichés

---

## `2-5-2-5-2` — Édition inline (contenteditable)

- **Focus section** : clic dans le corps de la section → `onVisuSectionFocus(sectionId)`
  - Projets backup : snapshot du contenu → `visuSectionLockSnapshot`, `editingVisuSectionId.set(sectionId)`, `collab.lockNode()`
  - Projets locaux : pas de verrou, édition directe
- **Saisie** : input direct dans le HTML rendu → `onVisuSectionInput(sectionId)` → `dirtyVisuSectionIds.add(sectionId)`
- **Blur** : `onVisuSectionBlur(sectionId)` → sauvegarde locale sans publier (section reste "dirty")
- **Keyboard** : Escape → ferme le menu d'insertion (si ouvert)

---

## `2-5-2-5-3` — Lecture seule pendant sync FTP

- **Section non synchronisée** (`nodeSyncStatus = 'unknown'` + `ftpSyncGlobalStatus = 'syncing'`) :
  - Badge "Synchronisation FTP en cours…" affiché sur la section (indicatif uniquement)
  - La section reste éditable (pas de blocage depuis vB-0.231+)

---

## `2-5-2-5-4` — Toolbar de formatage flottante

- **Déclenchement** : sélection de texte dans une section → `visuToolbar` affiché au-dessus de la sélection
- **Boutons** :
  - **Gras** : `applyVisuFormat('bold')` → `document.execCommand('bold')`
  - **Italique** : `applyVisuFormat('italic')`
  - **Barré** : `applyVisuFormat('strikeThrough')`
  - **Effacer formatage** : `applyVisuFormat('removeFormat')`
- **Fermeture** : click ailleurs ou désélection

---

## `2-5-2-5-5` — Menu d'insertion de bloc (`+`)

- **Déclenchement** : clic bouton "Ajouter un bloc" (ligne du bas de chaque section) → `showVisuInsertMenu(sectionId)`
- **Options** :
  - **Nouveau titre** → `insertVisuBlock('menu', sectionId)` → insère `## Nouveau titre`
  - **Nouveau document** → `insertVisuBlock('doc', sectionId)` → insère bloc document
  - **Bloc de code** → `insertVisuBlock('code', sectionId)` → insère ` ```code``` `
- **Fermeture** : clic ailleurs ou Escape

---

## `2-5-2-5-6` — Upload d'image dans une section

- **Déclenchement** : clic bouton 📷 de la ligne d'ajout → `triggerVisuImageUpload(sectionId)`
- **Sélection fichier** : input file → POST `/api/file-projects/{name}/files` (multipart)
- **Résultat** :
  - Marqueur `{{IMG:uuid}}` inséré dans `unifiedContent` à la fin de la section
  - Image rendue dans le HTML
  - Si projet backup : `visuSectionLockSnapshot` + `editingVisuSectionId.set(sectionId)` + `collab.lockNode()`

---

## `2-5-2-5-7` — Suppression d'image dans une section

- **Déclenchement** : clic bouton × sur une image → `deleteVisuImage(imgId)`
- **Action immédiate** : retrait de l'image de `allImages`, suppression du marqueur `{{IMG:id}}` de `unifiedContent`
- **En attente** : `pendingVisuDeletions.set(imgId, ...)` — suppression physique différée au "Partager"
- **Annuler** : `cancelVisuEdit()` → restaure les images annulées

---

## `2-5-2-5-8` — État pending et barre Annuler/Partager (projets backup)

- **Section avec modifications** : `dirtyVisuSectionIds.has(sectionId)` = true
- **Barre Preview visible** : `editingVisuSectionId()` non null → barre en haut de zone
- **Annuler** : `cancelVisuEdit(sectionId)` :
  - Restaure le HTML depuis `visuSectionLockSnapshot`
  - Restaure les images supprimées (depuis `pendingVisuDeletions`)
  - Libère le lock, remet `dirtyVisuSectionIds`, `editingVisuSectionId = null`
- **Partager** : `publishVisuSection(sectionId)` :
  - Convertit HTML → Markdown : `htmlSectionToMarkdown(el)`
  - `svc.updateFile(projectName, fileId, newMd, sectionId, publish=true)`
  - Exécute les suppressions d'images différées
  - Libère le lock, vide `dirtyVisuSectionIds`, `editingVisuSectionId = null`
  - Toast succès "Modifications enregistrées et partagées"

---

## `2-5-2-5-9` — Badges de collaboration

- **"Vous éditez cette section"** : si `editingVisuSectionId() === sec.sectionId`
- **"Modifications en attente"** : si `collab.isLocalPending(sectionId)` mais pas en focus
- **"Édité par {username}"** : si `collab.isLockedByOther(sectionId)` → section `contenteditable=false`

---

## `2-5-2-5-10` — Navigation dans les commentaires (F6)

- **Bouton bulle** : visible au hover sur chaque section
- **Clic** : emit `commentRequest({ folderId, folderName })` → ouvre le drawer F6
- **Badge compteur** : si `commentCounts[sectionId] > 0` → nombre affiché

---

## `2-5-2-5-11` — Preview d'un document standalone

- **Déclenchement** : sélection d'un fichier Markdown dans la sidebar (pas un dossier)
- **Affichage** : `singleFileVisuPreview` → rendu HTML en lecture seule du fichier
- **Non éditable** : `class="visu-sec-content--readonly"`

---

## `2-5-2-5-12` — Preview d'une image

- **Déclenchement** : sélection d'une image dans la sidebar
- **Affichage** : `singleImageVisuPreview` → image + options rename/delete
- **Renommer** : input inline → confirm → PATCH `/api/file-projects/{name}/files/{id}`
- **Supprimer** : bouton × → confirmation → DELETE `/api/file-projects/{name}/files/{id}`

---

## `2-5-2-5-13` — Panel propriétés d'image (F5)

- **Déclenchement** : clic sur une `<figure>` dans le rendu HTML
- **Panel** : `imagePropsPanel` → caption, alignement (left|center|right), largeur
- **Sauvegarde** : PUT attributs sur le marqueur `{{IMG:id|caption=...|align=...|width=...}}`
- **Fermeture** : clic ailleurs

---

## `2-5-2-5-14` — Conversion HTML → Markdown

- `htmlSectionToMarkdown(el)` : convertit le `contenteditable` vers Markdown (via `turndown` ou équivalent)
- Préserve : gras, italique, titres H1-H6, listes, liens, images, code inline et blocs

---

## `2-5-2-5-15` — États

| État | Description |
|------|-------------|
| Sections toutes visibles | Aucun filtre actif |
| Section filtrée | Seule la section active + enfants |
| Section en édition | Focus visible, `editingVisuSectionId` défini |
| Section verrouillée par autre | `contenteditable=false`, badge rouge |
| Toolbar de formatage visible | Texte sélectionné |
| Menu insertion ouvert | Flottant sous le bouton + |
| FTP sync (indicatif) | Badge animé sur la section |
| Barre Preview visible | Annuler/Partager en haut |
| Toast succès publication | Badge vert 3s |
| Toast erreur FTP | Badge rouge 6s |
| Panel image ouvert | Panel props visible sous l'image |
| Preview standalone | Section lecture seule |
| Overlay publication | Spinner plein écran pendant `isPublishing` |

---

## `2-5-2-5-16` — Zone basse Trello (méga-outils, tous modes)

- Les méga-outils Trello incrustés dans le contenu (marqueur `{{TRELLO:id}}`) ne s'affichent plus inline dans le code ni dans la section Preview
- Un **panneau bas partagé** affiche les board(s) Trello présents dans le contenu courant — comportement **identique en Code, Structure et Preview**
- `contentTrelloIds` : liste calculée depuis `unifiedContent` (focus = section active ; sinon tout le contenu visible), filtrée sur les instances existantes
- Panneau à **hauteur fixe (~400px)**, **repliable** via le bouton chevron (`trelloPanelCollapsed`) ; en-tête affiche le nom du board (ou le nombre si plusieurs)
- Plusieurs boards empilés dans un corps scrollable
- Colonnes du board (À faire / En cours / Terminé / Bloqué) en pleine largeur (`flex-1`), sans ascenseur horizontal
- Suppression d'un board (corbeille) retire l'instance + le marqueur du contenu
- Masqué si aucun marqueur Trello dans le contenu courant
